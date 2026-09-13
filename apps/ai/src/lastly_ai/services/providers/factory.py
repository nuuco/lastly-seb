from lastly_ai.core.config import get_settings
from lastly_ai.services.providers.anthropic_provider import AnthropicProvider
from lastly_ai.services.providers.base import LlmError, LlmProvider, Provider
from lastly_ai.services.providers.gemini_provider import GeminiProvider
from lastly_ai.services.providers.openai_provider import OpenAiProvider

__all__ = ["LlmError", "LlmProvider", "Provider", "build_provider"]


def build_provider(provider: Provider, api_key: str) -> LlmProvider:
    """
    요청에 실려 온 자격으로 클라이언트를 만든다. 서버 키는 쓰지 않는다.

    모델 이름은 설정에서 가져오되, 비어 있으면 어댑터의 기본값을 그대로 둔다.
    """
    settings = get_settings()

    if provider == "anthropic":
        return AnthropicProvider(
            api_key,
            **({"model": settings.anthropic_model} if settings.anthropic_model else {}),
            **({"effort": settings.anthropic_effort} if settings.anthropic_effort else {}),
        )
    if provider == "openai":
        return OpenAiProvider(
            api_key, **({"model": settings.openai_model} if settings.openai_model else {})
        )
    if provider == "gemini":
        return GeminiProvider(
            api_key,
            **({"model": settings.gemini_model} if settings.gemini_model else {}),
            thinking_level=settings.gemini_thinking_level or None,
        )
    raise LlmError(f"알 수 없는 제공자입니다: {provider}")
