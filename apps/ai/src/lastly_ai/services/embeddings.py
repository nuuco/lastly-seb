from typing import Protocol

import httpx
import structlog

from lastly_ai.core.config import Settings

log = structlog.get_logger(__name__)


class EmbeddingProvider(Protocol):
    async def embed(self, text: str) -> list[float] | None: ...


class NullEmbeddingProvider:
    """
    임베딩 제공자가 설정되지 않았을 때.

    None을 반환하면 apps/api는 항목의 name_embedding을 비운 채 저장하고,
    match_items RPC는 트라이그램 유사도 + 별칭 사전만으로 매칭한다.
    한국어 표기 흔들림("이불 빨래"/"이불빨래")은 잡히지만
    의미가 같고 표기가 다른 경우("이불 세탁")는 LLM 매칭에만 의존하게 된다.
    """

    async def embed(self, text: str) -> list[float] | None:
        return None


class VoyageEmbeddingProvider:
    """
    Voyage AI 임베딩. Anthropic이 안내하는 임베딩 파트너다.

    voyage-3 계열은 1024차원이므로, 쓰려면 supabase 마이그레이션의
    vector(1536)을 vector(1024)로 함께 바꿔야 한다.
    """

    ENDPOINT = "https://api.voyageai.com/v1/embeddings"

    def __init__(self, api_key: str, model: str = "voyage-3") -> None:
        self._api_key = api_key
        self._model = model

    async def embed(self, text: str) -> list[float] | None:
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                res = await client.post(
                    self.ENDPOINT,
                    headers={"Authorization": f"Bearer {self._api_key}"},
                    json={"input": [text], "model": self._model, "input_type": "document"},
                )
                res.raise_for_status()
                return res.json()["data"][0]["embedding"]
        except Exception as exc:  # noqa: BLE001 — 임베딩 실패가 기록을 막으면 안 된다.
            log.warning("embeddings.failed", error=str(exc))
            return None


def build_provider(settings: Settings) -> EmbeddingProvider:
    key = getattr(settings, "voyage_api_key", "")
    if key:
        return VoyageEmbeddingProvider(key)

    log.info("embeddings.disabled", reason="VOYAGE_API_KEY 미설정 — 트라이그램 매칭만 사용")
    return NullEmbeddingProvider()
