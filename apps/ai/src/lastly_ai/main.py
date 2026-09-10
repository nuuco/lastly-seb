import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import asyncpg
import structlog
from fastapi import FastAPI

from lastly_ai.api.v1.routes import capture, health
from lastly_ai.core.config import get_settings
from lastly_ai.services.embeddings import build_provider

log = structlog.get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    settings = get_settings()

    logging.basicConfig(level=settings.log_level)
    structlog.configure(
        processors=[
            structlog.processors.add_log_level,
            structlog.processors.TimeStamper(fmt="iso"),
            structlog.processors.JSONRenderer(),
        ]
    )

    # 주기 사전(cadence_priors)은 조사 결과를 재사용하기 위한 캐시다.
    # DB에 못 붙어도 해석과 주기 제안 자체는 LLM만으로 가능하므로 기동을 막지 않는다.
    # pg_trgm의 similarity()가 extensions 스키마에 있어 search_path에 포함시킨다.
    try:
        app.state.pool = await asyncpg.create_pool(
            settings.database_url,
            min_size=1,
            max_size=10,
            timeout=5,
            server_settings={"search_path": "public,extensions"},
        )
        log.info("ai.db_connected")
    except Exception as exc:  # noqa: BLE001
        app.state.pool = None
        log.warning("ai.db_unavailable", error=str(exc), effect="주기 사전 캐시 없이 동작")
    app.state.embeddings = build_provider(settings)

    log.info("ai.started", model=settings.ai_model)
    try:
        yield
    finally:
        if app.state.pool is not None:
            await app.state.pool.close()


app = FastAPI(
    title="Lastly AI",
    description="자연어 해석, 항목 매칭, 주기 추론",
    version="0.1.0",
    lifespan=lifespan,
)

app.include_router(health.router, tags=["health"])
app.include_router(capture.router, prefix="/v1", tags=["capture"])
