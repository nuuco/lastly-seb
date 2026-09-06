from datetime import date

import numpy as np
import structlog

from lastly_ai.core.config import Settings
from lastly_ai.repositories.priors import CadencePrior, PriorsRepository
from lastly_ai.schemas.capture import CadenceRequest, CadenceResponse
from lastly_ai.services.llm import LlmClient, LlmError

log = structlog.get_logger(__name__)

RESEARCH_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "required": ["interval_days", "confidence", "rationale"],
    "properties": {
        "interval_days": {
            "type": "integer",
            "description": "이 일을 보통 며칠마다 하는지. 1~730 사이.",
        },
        "confidence": {
            "type": "number",
            "description": "권장 주기가 얼마나 확실한지 0~1. 사람마다 편차가 크면 낮게.",
        },
        "rationale": {
            "type": "string",
            "maxLength": 60,
            "description": (
                "왜 이 주기인지 한 문장. 사용자에게 그대로 보여줄 존댓말 한국어. "
                "확인 시트에 한 줄로 들어가므로 40자 안팎으로 짧게."
            ),
        },
    },
}

RESEARCH_SYSTEM = """당신은 한국 가정의 집안일 관리 주기를 알려주는 도우미입니다.

주어진 집안일을 보통 얼마마다 하는 것이 적절한지 조사해 알려주세요.

- 제조사 권장 주기, 위생 기준, 일반적인 생활 관행을 근거로 삼습니다.
- 한국의 주거 환경과 기후를 기준으로 판단합니다.
- 사람마다 편차가 크거나 근거를 찾기 어려우면 confidence를 낮게 잡습니다.
- rationale은 사용자에게 그대로 보여줄 문장입니다. 존댓말 한 문장으로 씁니다.
  확인 화면에 한 줄로 들어가므로 40자 안팎으로 짧게 쓰고, 조건을 나열하지 않습니다.
  좋은 예: "제조사 대부분이 3개월 주기 교체를 안내합니다."
  나쁜 예: "필터 종류에 따라 4~6개월, 12~24개월로 다르지만 평균적으로는..."
  종류에 따라 편차가 크면 대표값 하나만 고르고 confidence를 낮춥니다.
"""

# 이 이상 벗어난 기록은 이상치로 보고 개인 주기 계산에서 뺀다.
OUTLIER_SIGMA = 2.0


class CadenceService:
    """
    주기를 정하는 두 갈래.

    1. 개인 이력이 충분하면 → 실제로 얼마마다 했는지에서 학습한다.
    2. 부족하면 → 일반적인 주기를 쓴다. 사전에 없으면 조사해서 채운다.
    """

    def __init__(self, llm: LlmClient, priors: PriorsRepository, settings: Settings) -> None:
        self._llm = llm
        self._priors = priors
        self._settings = settings

    async def suggest(self, req: CadenceRequest) -> CadenceResponse:
        personal = self._from_history(req.history)
        if personal is not None:
            return personal

        return await self._from_community(req)

    # ── 1. 개인 이력에서 학습 ────────────────────────────────────────
    def _from_history(self, history: list[date]) -> CadenceResponse | None:
        """
        실제 수행 간격의 중앙값을 쓴다. 평균이 아니라 중앙값인 이유는
        한 번 오래 건너뛴 기록이 전체 주기를 밀어버리지 않게 하기 위해서다.
        """
        if len(history) < self._settings.personal_history_threshold + 1:
            return None

        ordered = sorted(history)
        gaps = np.diff(np.array([d.toordinal() for d in ordered]))
        gaps = gaps[gaps > 0]

        if gaps.size < self._settings.personal_history_threshold:
            return None

        cleaned = self._drop_outliers(gaps)
        median = float(np.median(cleaned))
        interval_days = int(round(median))

        # 간격이 들쭉날쭉할수록 확신도를 낮춘다.
        spread = float(np.std(cleaned)) / max(median, 1.0)
        confidence = float(np.clip(0.95 - spread, 0.4, 0.95))

        unit, interval = self._to_unit(interval_days)

        return CadenceResponse(
            unit=unit,
            interval=interval,
            weekdays=self._dominant_weekdays(ordered, interval_days),
            source="personal",
            confidence=round(confidence, 2),
            rationale=f"평균 {interval_days}일마다 하셨어요. 그 주기로 맞춰뒀어요.",
        )

    @staticmethod
    def _drop_outliers(gaps: np.ndarray) -> np.ndarray:
        """표준편차 2배를 벗어난 간격을 뺀다. 전부 빠지면 원본을 그대로 쓴다."""
        if gaps.size < 4:
            return gaps

        mean, std = float(np.mean(gaps)), float(np.std(gaps))
        if std == 0:
            return gaps

        kept = gaps[np.abs(gaps - mean) <= OUTLIER_SIGMA * std]
        return kept if kept.size > 0 else gaps

    @staticmethod
    def _dominant_weekdays(history: list[date], interval_days: int) -> list[int]:
        """
        주 단위 주기이고 특정 요일에 몰려 있으면 그 요일을 고정한다.
        주말에만 하는 일을 평일에 알리지 않기 위해서다.
        """
        if not (5 <= interval_days <= 90):
            return []

        counts = np.bincount([(d.weekday() + 1) % 7 for d in history], minlength=7)
        top = int(np.argmax(counts))

        # 전체의 60% 이상이 한 요일에 몰렸을 때만 고정한다.
        return [top] if counts[top] / len(history) >= 0.6 else []

    # ── 2. 일반적인 주기 ────────────────────────────────────────────
    async def _from_community(self, req: CadenceRequest) -> CadenceResponse:
        prior = await self._priors.find(req.item_name)

        if prior is None:
            prior = await self._research(req.item_name)

        if prior is None:
            return self._fallback()

        unit, interval = self._to_unit(self._prior_days(prior))
        rationale = prior.rationale or "비슷한 가사들의 평균 주기로 먼저 제안했어요."

        return CadenceResponse(
            unit=unit,
            interval=interval,
            weekdays=[],
            source="community",
            confidence=round(prior.confidence, 2),
            rationale=rationale,
        )

    @staticmethod
    def _prior_days(prior: CadencePrior) -> int:
        """
        실사용자 관측치가 충분히 쌓였으면 그쪽을 믿는다.
        권장 주기보다 실제로 사람들이 하는 주기가 더 현실적이다.
        """
        if prior.observed_median_days and prior.observed_sample_size >= 30:
            return int(round(prior.observed_median_days))

        per_unit = {"day": 1, "week": 7, "month": 30}[prior.unit]
        return prior.interval * per_unit

    async def _research(self, item_name: str) -> CadencePrior | None:
        """사전에 없는 항목. 웹 검색으로 조사하고 결과를 사전에 캐시한다."""
        try:
            raw, sources = await self._llm.complete_json_with_search(
                system=RESEARCH_SYSTEM,
                user=f'집안일: "{item_name}"\n\n이 일을 보통 며칠마다 하는 것이 적절한가요?',
                schema=RESEARCH_SCHEMA,
            )
        except LlmError as exc:
            log.warning("cadence.research_failed", item=item_name, error=str(exc))
            return None

        interval_days = int(np.clip(int(raw["interval_days"]), 1, 730))
        unit, interval = self._to_unit(interval_days)
        confidence = float(np.clip(float(raw["confidence"]), 0.0, 1.0))
        rationale = str(raw["rationale"]).strip()
        if len(rationale) > 70:
            rationale = rationale[:69].rstrip() + "…"

        try:
            await self._priors.upsert(
                name=item_name,
                unit=unit,
                interval=interval,
                confidence=confidence,
                rationale=rationale,
                sources=sources,
            )
        except Exception as exc:  # noqa: BLE001 — 캐시 실패가 제안을 막으면 안 된다.
            log.warning("cadence.cache_failed", item=item_name, error=str(exc))

        return CadencePrior(
            canonical_name=item_name,
            unit=unit,
            interval=interval,
            confidence=confidence,
            rationale=rationale,
            observed_median_days=None,
            observed_sample_size=0,
        )

    # 개인 성향 보정은 두지 않는다.
    # "사용자의 전체 평균 주기"를 기준 삼아 권장 주기를 늘리고 줄이면,
    # 분기성 항목이 많은 사람의 주간 항목까지 함께 늘어나 제안이 오히려 나빠진다.
    # 개인화는 그 항목의 실제 이력이 쌓였을 때 _from_history 가 전담한다.

    @staticmethod
    def _to_unit(days: int) -> tuple[str, int]:
        """
        일수를 사람이 실제로 세는 단위로 옮긴다.

        딱 떨어질 때만 개월·주로 바꾸고, 아니면 일수를 그대로 둔다.
        "45일마다"는 그대로 두어야 하고("2달마다"로 뭉개면 15일이나 밀린다),
        "216일마다"는 아무도 그렇게 세지 않으므로 "7달마다"가 되어야 한다.
        허용 오차를 값에 비례시키면 이 둘이 자연스럽게 갈린다.
        """
        if days >= 28:
            months = round(days / 30)
            # 값이 클수록 하루이틀 차이는 의미가 없으므로 오차를 비례해서 준다.
            tolerance = max(2.0, days * 0.08)
            if months >= 1 and abs(days - months * 30) <= tolerance:
                return "month", min(24, months)
            return "day", days

        if days >= 7 and days % 7 == 0:
            return "week", days // 7

        return "day", max(1, days)

    @staticmethod
    def _fallback() -> CadenceResponse:
        return CadenceResponse(
            unit="week",
            interval=2,
            weekdays=[],
            source="default",
            confidence=0.3,
            rationale="우선 2주로 잡아뒀어요. 저장 전에 바꿔도 돼요.",
        )
