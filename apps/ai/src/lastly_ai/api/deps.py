from typing import Annotated

import asyncpg
from fastapi import Depends, Header, HTTPException, Request, status

from lastly_ai.core.config import Settings, get_settings
from lastly_ai.repositories.priors import PriorsRepository
from lastly_ai.services.cadence import CadenceService
from lastly_ai.services.embeddings import EmbeddingProvider
from lastly_ai.services.normalizer import Normalizer

SettingsDep = Annotated[Settings, Depends(get_settings)]


async def verify_internal_token(
    settings: SettingsDep,
    x_internal_token: Annotated[str | None, Header()] = None,
) -> None:
    """이 서비스는 apps/api 뒤에만 있다. 외부에 직접 노출되지 않는다."""
    if x_internal_token != settings.internal_token:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "internal token이 올바르지 않습니다.")


def get_pool(request: Request) -> asyncpg.Pool | None:
    return request.app.state.pool


def get_embeddings(request: Request) -> EmbeddingProvider:
    return request.app.state.embeddings


def get_normalizer() -> Normalizer:
    # 제공자는 요청에 실려 온 자격으로 매번 만든다. 여기서는 아무것도 붙들지 않는다.
    return Normalizer()


def get_cadence_service(
    pool: Annotated[asyncpg.Pool | None, Depends(get_pool)],
    settings: SettingsDep,
) -> CadenceService:
    return CadenceService(PriorsRepository(pool), settings)


NormalizerDep = Annotated[Normalizer, Depends(get_normalizer)]
CadenceDep = Annotated[CadenceService, Depends(get_cadence_service)]
EmbeddingsDep = Annotated[EmbeddingProvider, Depends(get_embeddings)]
