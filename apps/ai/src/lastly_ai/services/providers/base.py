from typing import Any, Literal, Protocol

Provider = Literal["anthropic", "openai", "gemini"]


class LlmError(RuntimeError):
    """LLM 호출이 사용 가능한 결과를 내지 못했을 때."""


class LlmProvider(Protocol):
    """
    제공자별로 달라지는 것은 이 두 가지뿐이다.

    프롬프트·스키마·응답 해석은 전부 공용이므로, 새 제공자를 붙일 때
    부르는 쪽(normalizer, cadence)은 한 글자도 바뀌지 않는다.
    """

    async def complete_json(
        self,
        *,
        system: str,
        user: str,
        schema: dict[str, Any],
        max_tokens: int = 2000,
    ) -> dict[str, Any]:
        """스키마를 강제해 JSON 하나를 받는다."""
        ...

    async def complete_json_with_search(
        self,
        *,
        system: str,
        user: str,
        schema: dict[str, Any],
        max_tokens: int = 4000,
    ) -> tuple[dict[str, Any], list[str]]:
        """
        웹을 뒤져 조사한 뒤 JSON 을 받는다. 참고한 주소를 함께 돌려준다.

        검색을 지원하지 않는 제공자는 검색 없이 답하고 빈 목록을 돌려준다.
        주기 조사는 없으면 사전과 기본값으로 대신할 수 있는 부가 기능이라,
        검색이 안 된다고 해서 기록 자체가 막히지는 않는다.
        """
        ...
