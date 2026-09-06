import asyncpg
from fastapi import APIRouter, Depends

from lastly_ai.api.deps import get_pool

router = APIRouter()


@router.get("/healthz")
async def healthz() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/readyz")
async def readyz(pool: asyncpg.Pool | None = Depends(get_pool)) -> dict[str, str]:
    """DB 연결 여부를 알린다. DB가 없어도 서비스는 동작하므로 실패로 보지 않는다."""
    if pool is None:
        return {"status": "ready", "db": "unavailable"}

    await pool.fetchval("select 1")
    return {"status": "ready", "db": "ok"}
