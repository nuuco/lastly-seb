import httpx
import pytest

from lastly_ai.services.providers import gemini_provider
from lastly_ai.services.providers.base import LlmError
from lastly_ai.services.providers.gemini_provider import GeminiProvider

SCHEMA = {"type": "object", "properties": {"name": {"type": "string"}}}


def use_transport(monkeypatch: pytest.MonkeyPatch, handler) -> None:
    real = httpx.AsyncClient

    def client(*args, **kwargs):
        kwargs["transport"] = httpx.MockTransport(handler)
        return real(*args, **kwargs)

    monkeypatch.setattr(gemini_provider.httpx, "AsyncClient", client)


async def test_timeout_is_llm_error(monkeypatch: pytest.MonkeyPatch) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ReadTimeout("slow", request=request)

    use_transport(monkeypatch, handler)
    with pytest.raises(LlmError, match="시간 초과"):
        await GeminiProvider("key").complete_json(system="s", user="u", schema=SCHEMA)


async def test_connection_error_is_llm_error(monkeypatch: pytest.MonkeyPatch) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("down", request=request)

    use_transport(monkeypatch, handler)
    with pytest.raises(LlmError, match="연결 실패"):
        await GeminiProvider("key").complete_json(system="s", user="u", schema=SCHEMA)


def test_timeout_ends_before_api_gives_up() -> None:
    # api 의 AI 호출 대기(8초)보다 짧아야 재호출 루프로 가지 않는다.
    assert gemini_provider.REQUEST_TIMEOUT_S < 8
