import json
from dataclasses import dataclass
from typing import Any

import asyncpg
import structlog

log = structlog.get_logger(__name__)


@dataclass(frozen=True)
class CadencePrior:
    canonical_name: str
    unit: str
    interval: int
    confidence: float
    rationale: str | None
    observed_median_days: float | None
    observed_sample_size: int


class PriorsRepository:
    """
    cadence_priors 테이블 접근.
    "보통 사람들은 이 일을 얼마마다 하는가"의 저장소이자 캐시다.
    """

    def __init__(self, pool: asyncpg.Pool | None) -> None:
        # pool이 None이면 사전을 쓰지 않는다 — 조사 결과를 캐시하지 못할 뿐 기능은 유지된다.
        self._pool = pool

    async def find(self, name: str) -> CadencePrior | None:
        if self._pool is None:
            return None

        """
        이름이 정확히 같거나 트라이그램 유사도가 높은 항목을 찾는다.
        "화분 물주기"와 "화분 물 주기"가 따로 저장되는 걸 막는다.
        """
        row = await self._pool.fetchrow(
            """
            select canonical_name, cadence_unit, cadence_interval, confidence,
                   rationale, observed_median_days, observed_sample_size
              from public.cadence_priors
             where canonical_name = $1
                or similarity(canonical_name, $1) > 0.5
             order by (canonical_name = $1) desc, similarity(canonical_name, $1) desc
             limit 1
            """,
            name,
        )
        return self._to_prior(row) if row else None

    async def upsert(
        self,
        *,
        name: str,
        unit: str,
        interval: int,
        confidence: float,
        rationale: str,
        sources: list[str],
    ) -> None:
        """조사 결과를 저장한다. 같은 항목을 두 번 조사하지 않기 위한 캐시."""
        if self._pool is None:
            return

        await self._pool.execute(
            """
            insert into public.cadence_priors
                   (canonical_name, cadence_unit, cadence_interval, confidence, rationale, sources)
            values ($1, $2::public.cadence_unit, $3, $4, $5, $6::jsonb)
            on conflict (canonical_name) do update
               set cadence_unit     = excluded.cadence_unit,
                   cadence_interval = excluded.cadence_interval,
                   confidence       = excluded.confidence,
                   rationale        = excluded.rationale,
                   sources          = excluded.sources,
                   updated_at       = now()
            """,
            name,
            unit,
            interval,
            confidence,
            rationale,
            json.dumps(sources),
        )

    @staticmethod
    def _to_prior(row: Any) -> CadencePrior:
        return CadencePrior(
            canonical_name=row["canonical_name"],
            unit=row["cadence_unit"],
            interval=row["cadence_interval"],
            confidence=float(row["confidence"]),
            rationale=row["rationale"],
            observed_median_days=(
                float(row["observed_median_days"]) if row["observed_median_days"] else None
            ),
            observed_sample_size=row["observed_sample_size"],
        )
