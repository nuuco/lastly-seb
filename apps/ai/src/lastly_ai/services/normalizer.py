from datetime import date, timedelta

import structlog

from lastly_ai.schemas.capture import Candidate, KnownItem, ParseRequest, ParseResponse
from lastly_ai.services.llm import LlmClient, LlmError

log = structlog.get_logger(__name__)

PARSE_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "required": ["item_name", "days_ago", "matched_item_id", "candidate_ids", "confidence"],
    "properties": {
        "item_name": {
            "type": ["string", "null"],
            "description": "집안일 항목의 표준 이름. 명사구로. 못 알아들었으면 null.",
        },
        "days_ago": {
            "type": "integer",
            "description": "기준일로부터 며칠 전에 한 일인지. 오늘이면 0.",
        },
        "matched_item_id": {
            "type": ["string", "null"],
            "description": "기존 항목과 같은 일이면 그 항목의 id. 아니면 null.",
        },
        "candidate_ids": {
            "type": "array",
            "items": {"type": "string"},
            "description": "확실하지 않지만 같은 일일 수 있는 기존 항목 id들. 가능성 높은 순.",
        },
        "confidence": {
            "type": "number",
            "description": "항목 해석 전체에 대한 확신도 0~1.",
        },
    },
}

SYSTEM_PROMPT = """당신은 한국어 집안일 기록 앱의 문장 해석기입니다.

사용자가 방금 한 집안일을 자연스러운 말로 이야기하면, 다음을 뽑아냅니다.

1. item_name — 이 일의 표준 이름
   - 항상 명사구로 만듭니다. "이불 빨았어" → "이불 빨래", "필터 갈았어" → "필터 교체"
   - 서술어("~했어", "~함")나 시간 표현("오늘", "어제")은 이름에 넣지 않습니다.
   - 사용자가 쓴 단어를 최대한 살리되, 같은 일은 늘 같은 이름이 되게 합니다.
   - 집안일이나 주기적으로 반복하는 관리 행위가 아니면 null을 반환합니다.

2. days_ago — 기준일 기준 며칠 전인지
   - "오늘"·시간 표현 없음 → 0, "어제" → 1, "그저께" → 2
   - "지난주 일요일"처럼 요일이 나오면 기준일의 요일을 계산해 정확한 일수를 냅니다.
   - "지난주" → 7, "지난달" → 30 정도로 봅니다.

3. matched_item_id — 기존 항목과 같은 일인지
   - 표현이 달라도 같은 일이면 반드시 이어붙입니다.
     "이불 빨래" = "이불 세탁" = "침구 빨래"
     "필터 교체" = "필터 갈기" (단, 어떤 필터인지 다르면 다른 항목입니다)
   - 확실할 때만 matched_item_id를 채웁니다.
   - 애매하면 matched_item_id는 null로 두고 candidate_ids에 후보를 담습니다.
   - 대상이 다르면 다른 항목입니다. "에어컨 필터"와 "정수기 필터"는 별개입니다.

4. confidence — 위 판단 전체에 대한 확신도
   - 음성 인식이 뭉개진 문장("이불 빠라써")은 낮게 잡습니다.

한국어 구어체, 오타, 음성 인식 오류를 감안해 해석합니다."""


class Normalizer:
    """자연어 한 문장 → 항목 이름 + 날짜 + 기존 항목 연결."""

    def __init__(self, llm: LlmClient) -> None:
        self._llm = llm

    async def parse(self, req: ParseRequest) -> ParseResponse:
        prompt = self._build_prompt(req)

        try:
            raw = await self._llm.complete_json(
                system=SYSTEM_PROMPT,
                user=prompt,
                schema=PARSE_SCHEMA,
                effort="low",
            )
        except LlmError as exc:
            log.warning("normalizer.failed", error=str(exc), text=req.text)
            return ParseResponse(
                normalized_name=None,
                done_on=req.reference_date,
                matched_item_id=None,
                candidates=[],
                confidence=0.0,
                reason=str(exc),
            )

        return self._to_response(raw, req)

    def _build_prompt(self, req: ParseRequest) -> str:
        weekday = "월화수목금토일"[req.reference_date.weekday()]
        lines = [
            f"기준일: {req.reference_date.isoformat()} ({weekday}요일)",
            "",
            "사용자가 이미 관리 중인 항목:",
        ]

        if req.known_items:
            for item in req.known_items:
                last = item.last_done_on.isoformat() if item.last_done_on else "기록 없음"
                lines.append(f"- id={item.id} | {item.name} | 마지막: {last}")
        else:
            lines.append("- (없음)")

        lines += ["", f'사용자가 말한 문장: "{req.text}"']
        return "\n".join(lines)

    def _to_response(self, raw: dict, req: ParseRequest) -> ParseResponse:
        known_ids = {item.id: item for item in req.known_items}

        # 미래 날짜는 있을 수 없다. 음수 days_ago는 0으로 자른다.
        days_ago = max(0, int(raw.get("days_ago") or 0))
        done_on = req.reference_date - timedelta(days=days_ago)

        matched = raw.get("matched_item_id")
        if matched is not None and matched not in known_ids:
            # 모델이 없는 id를 만들어낸 경우. 신뢰하지 않는다.
            log.warning("normalizer.hallucinated_id", item_id=matched)
            matched = None

        candidates = self._to_candidates(raw.get("candidate_ids") or [], known_ids)

        return ParseResponse(
            normalized_name=raw.get("item_name"),
            done_on=done_on,
            matched_item_id=matched,
            candidates=candidates,
            confidence=min(1.0, max(0.0, float(raw.get("confidence") or 0.0))),
            reason=None,
        )

    def _to_candidates(
        self, candidate_ids: list[str], known: dict[str, KnownItem]
    ) -> list[Candidate]:
        """
        후보에는 순위를 유사도로 환산해 붙인다.
        1순위 0.78 — apps/api의 MATCH_THRESHOLD(0.82)보다 낮게 둬서
        항상 사용자에게 고르게 한다.
        """
        scores = [0.78, 0.70, 0.62, 0.55, 0.50]
        out: list[Candidate] = []

        for rank, item_id in enumerate(candidate_ids[:5]):
            item = known.get(item_id)
            if item is None:
                continue
            out.append(Candidate(item_id=item_id, name=item.name, similarity=scores[rank]))

        return out


def resolve_done_on(reference: date, days_ago: int) -> date:
    return reference - timedelta(days=max(0, days_ago))
