import json
from typing import Any, Literal, cast

import anthropic
import structlog
from anthropic.types import OutputConfigParam

from lastly_ai.services.providers.base import LlmError

log = structlog.get_logger(__name__)

DEFAULT_MODEL = "claude-opus-5"

Effort = Literal["low", "medium", "high", "xhigh", "max"]
EFFORTS: frozenset[str] = frozenset(("low", "medium", "high", "xhigh", "max"))


class AnthropicProvider:
    """
    Anthropic Messages API.

    구조화 출력(output_config.format)으로 JSON 스키마를 강제해 파싱 실패를 없앤다.

    effort 는 지원하지 않는 모델이 있다. Haiku 4.5 에 보내면
    "This model does not support the effort parameter" 로 400 이 난다.
    그래서 기본은 보내지 않고, 설정으로 켠 경우에만 싣는다.
    """

    def __init__(
        self, api_key: str, model: str = DEFAULT_MODEL, effort: str | None = None
    ) -> None:
        self._client = anthropic.AsyncAnthropic(api_key=api_key)
        self._model = model
        # 설정에서 온 문자열이므로 오타가 그대로 API 까지 가지 않게 여기서 거른다.
        self._effort: Effort | None = cast(Effort, effort) if effort in EFFORTS else None
        if effort and self._effort is None:
            log.warning("anthropic.unknown_effort", value=effort)

    def _output_config(self, schema: dict[str, Any]) -> OutputConfigParam:
        config: OutputConfigParam = {"format": {"type": "json_schema", "schema": schema}}
        if self._effort:
            config["effort"] = self._effort
        return config

    async def complete_json(
        self,
        *,
        system: str,
        user: str,
        schema: dict[str, Any],
        max_tokens: int = 2000,
    ) -> dict[str, Any]:
        response = await self._client.messages.create(
            model=self._model,
            max_tokens=max_tokens,
            system=system,
            messages=[{"role": "user", "content": user}],
            output_config=self._output_config(schema),
        )

        if response.stop_reason == "refusal":
            log.warning("llm.refusal", details=getattr(response, "stop_details", None))
            raise LlmError("모델이 응답을 거부했습니다.")

        return _parse(_text_of(response))

    async def complete_json_with_search(
        self,
        *,
        system: str,
        user: str,
        schema: dict[str, Any],
        max_tokens: int = 4000,
    ) -> tuple[dict[str, Any], list[str]]:
        response = await self._client.messages.create(
            model=self._model,
            max_tokens=max_tokens,
            system=system,
            messages=[{"role": "user", "content": user}],
            tools=[{"type": "web_search_20260209", "name": "web_search", "max_uses": 3}],
            output_config=self._output_config(schema),
        )

        if response.stop_reason == "refusal":
            raise LlmError("모델이 응답을 거부했습니다.")

        sources: list[str] = []
        for block in response.content:
            if block.type != "web_search_tool_result":
                continue
            # 오류일 때 content 는 리스트가 아니라 단일 객체다.
            results = block.content
            if isinstance(results, list):
                sources.extend(r.url for r in results if getattr(r, "url", None))

        return _parse(_text_of(response)), sources


def _text_of(response: Any) -> str:
    return "".join(block.text for block in response.content if block.type == "text")


def _parse(text: str) -> dict[str, Any]:
    if not text.strip():
        raise LlmError("모델이 빈 응답을 반환했습니다.")
    try:
        parsed = json.loads(text)
    except json.JSONDecodeError as exc:
        raise LlmError(f"JSON 파싱 실패: {text[:200]}") from exc

    if not isinstance(parsed, dict):
        raise LlmError(f"객체가 아닌 JSON 을 받았습니다: {text[:200]}")
    return parsed
