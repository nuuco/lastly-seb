import json
from typing import Any

import anthropic
import structlog

from lastly_ai.core.config import Settings

log = structlog.get_logger(__name__)


class LlmError(RuntimeError):
    """LLM 호출이 사용 가능한 결과를 내지 못했을 때."""


class LlmClient:
    """
    Anthropic Messages API 래퍼.

    이 서비스의 호출은 전부 짧은 문장 한 개를 다루므로 effort는 낮게 잡는다.
    구조화 출력(output_config.format)으로 JSON 스키마를 강제해 파싱 실패를 없앤다.
    """

    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key or None)

    async def complete_json(
        self,
        *,
        system: str,
        user: str,
        schema: dict[str, Any],
        effort: str = "low",
        max_tokens: int = 2000,
    ) -> dict[str, Any]:
        response = await self._client.messages.create(
            model=self._settings.ai_model,
            max_tokens=max_tokens,
            system=system,
            messages=[{"role": "user", "content": user}],
            output_config={
                "effort": effort,
                "format": {"type": "json_schema", "schema": schema},
            },
        )

        if response.stop_reason == "refusal":
            log.warning("llm.refusal", details=getattr(response, "stop_details", None))
            raise LlmError("모델이 응답을 거부했습니다.")

        text = "".join(block.text for block in response.content if block.type == "text")
        if not text.strip():
            raise LlmError("모델이 빈 응답을 반환했습니다.")

        try:
            return json.loads(text)
        except json.JSONDecodeError as exc:
            raise LlmError(f"JSON 파싱 실패: {text[:200]}") from exc

    async def complete_json_with_search(
        self,
        *,
        system: str,
        user: str,
        schema: dict[str, Any],
        max_tokens: int = 4000,
    ) -> tuple[dict[str, Any], list[str]]:
        """
        웹 검색을 붙여 "보통 사람들은 이 일을 얼마마다 하는가"를 조사한다.
        새 항목의 주기를 처음 제안할 때만 쓴다 — 느리고 비싸므로 결과는 DB에 캐시한다.
        """
        response = await self._client.messages.create(
            model=self._settings.ai_model,
            max_tokens=max_tokens,
            system=system,
            messages=[{"role": "user", "content": user}],
            tools=[{"type": "web_search_20260209", "name": "web_search", "max_uses": 3}],
            output_config={"effort": "medium", "format": {"type": "json_schema", "schema": schema}},
        )

        if response.stop_reason == "refusal":
            raise LlmError("모델이 응답을 거부했습니다.")

        text_parts: list[str] = []
        sources: list[str] = []

        for block in response.content:
            if block.type == "text":
                text_parts.append(block.text)
            elif block.type == "web_search_tool_result":
                # 오류일 때 content는 리스트가 아니라 단일 객체다.
                results = block.content
                if isinstance(results, list):
                    sources.extend(
                        r.url for r in results if getattr(r, "url", None) is not None
                    )

        text = "".join(text_parts)
        if not text.strip():
            raise LlmError("모델이 빈 응답을 반환했습니다.")

        try:
            return json.loads(text), sources
        except json.JSONDecodeError as exc:
            raise LlmError(f"JSON 파싱 실패: {text[:200]}") from exc
