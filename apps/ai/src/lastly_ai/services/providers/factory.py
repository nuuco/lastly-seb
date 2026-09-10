from lastly_ai.services.providers.anthropic_provider import AnthropicProvider
from lastly_ai.services.providers.base import LlmError, LlmProvider, Provider
from lastly_ai.services.providers.gemini_provider import GeminiProvider
from lastly_ai.services.providers.openai_provider import OpenAiProvider

__all__ = ["LlmError", "LlmProvider", "Provider", "build_provider"]


def build_provider(provider: Provider, api_key: str) -> LlmProvider:
    """요청에 실려 온 자격으로 클라이언트를 만든다. 서버 키는 쓰지 않는다."""
    if provider == "anthropic":
        return AnthropicProvider(api_key)
    if provider == "openai":
        return OpenAiProvider(api_key)
    if provider == "gemini":
        return GeminiProvider(api_key)
    raise LlmError(f"알 수 없는 제공자입니다: {provider}")
