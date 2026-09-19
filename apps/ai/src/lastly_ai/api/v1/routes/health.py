import asyncpg
from fastapi import APIRouter, Depends

from lastly_ai.api.deps import get_pool

router = APIRouter()


# HEAD 도 받는다. 서버를 깨워두는 감시 서비스가 HEAD 로 찔러 보는데,
# GET 만 열어 두면 405 를 받고 장애로 기록한다.
@router.api_route("/healthz", methods=["GET", "HEAD"])
async def healthz() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/readyz")
async def readyz(pool: asyncpg.Pool | None = Depends(get_pool)) -> dict[str, str]:
    """DB 연결 여부를 알린다. DB가 없어도 서비스는 동작하므로 실패로 보지 않는다."""
    if pool is None:
        return {"status": "ready", "db": "unavailable"}

    await pool.fetchval("select 1")
    return {"status": "ready", "db": "ok"}
