from datetime import date, timedelta

import pytest

from lastly_ai.core.config import Settings
from lastly_ai.schemas.capture import CadenceRequest, Caller
from lastly_ai.services.cadence import CadenceService

# 개인 이력 계산은 제공자를 부르지 않는다. 형식을 맞추기 위한 값이다.
CALLER = Caller(provider="anthropic", api_key="sk-test-not-used")


@pytest.fixture
def service() -> CadenceService:
    # 개인 이력 경로만 테스트하므로 llm / priors는 쓰이지 않는다.
    return CadenceService(priors=None, settings=Settings())  # type: ignore[arg-type]


def days_ago(*offsets: int) -> list[date]:
    today = date(2026, 9, 6)
    return sorted(today - timedelta(days=o) for o in offsets)


class TestUnitConversion:
    @pytest.mark.parametrize(
        ("days", "expected"),
        [
            (3, ("day", 3)),
            (7, ("week", 1)),
            (14, ("week", 2)),
            (30, ("month", 1)),
            (60, ("month", 2)),
            (90, ("month", 3)),
        ],
    )
    def test_snaps_when_it_divides_cleanly(self, days: int, expected: tuple[str, int]) -> None:
        """"2주마다"가 "14일마다"보다 읽기 좋다."""
        assert CadenceService._to_unit(days) == expected

    @pytest.mark.parametrize("days", [8, 45, 100])
    def test_keeps_days_when_it_does_not(self, days: int) -> None:
        """45일을 "2달마다"로 뭉개면 보름이 밀린다. 안 떨어지면 일수를 그대로 둔다."""
        assert CadenceService._to_unit(days) == ("day", days)

    @pytest.mark.parametrize(("days", "months"), [(180, 6), (216, 7), (365, 12)])
    def test_long_cycles_become_months(self, days: int, months: int) -> None:
        """"216일마다"는 아무도 그렇게 세지 않는다."""
        assert CadenceService._to_unit(days) == ("month", months)

    def test_caps_at_two_years(self) -> None:
        assert CadenceService._to_unit(900) == ("month", 24)


class TestPersonalHistory:
    def test_ignores_short_history(self, service: CadenceService) -> None:
        """기록이 부족하면 개인 주기를 못 낸다 — 커뮤니티 경로로 넘어가야 한다."""
        assert service._from_history(days_ago(0, 14)) is None

    def test_learns_median_interval(self, service: CadenceService) -> None:
        # 14일 간격으로 5번 — 2주마다로 학습돼야 한다.
        result = service._from_history(days_ago(0, 14, 28, 42, 56))
        assert result is not None
        assert (result.unit, result.interval) == ("week", 2)
        assert result.source == "personal"

    def test_one_long_gap_does_not_shift_cycle(self, service: CadenceService) -> None:
        """한 번 오래 건너뛰어도 주기가 밀리면 안 된다 — 평균이 아니라 중앙값을 쓰는 이유."""
        # 대부분 7일 간격인데 한 번만 60일 비었다.
        result = service._from_history(days_ago(0, 7, 14, 21, 81))
        assert result is not None
        assert result.unit == "week"
        assert result.interval == 1

    def test_irregular_history_lowers_confidence(self, service: CadenceService) -> None:
        steady = service._from_history(days_ago(0, 14, 28, 42, 56))
        erratic = service._from_history(days_ago(0, 3, 25, 30, 70))
        assert steady is not None and erratic is not None
        assert erratic.confidence < steady.confidence

    def test_pins_weekday_when_consistent(self, service: CadenceService) -> None:
        """주말에만 하는 일을 평일에 알리지 않기 위해 요일을 고정한다."""
        # 2026-09-06은 일요일. 7일 간격이므로 전부 일요일.
        result = service._from_history(days_ago(0, 7, 14, 21, 28))
        assert result is not None
        assert result.weekdays == [0]  # 0 = 일요일

    def test_leaves_weekday_open_when_scattered(self, service: CadenceService) -> None:
        result = service._from_history(days_ago(0, 5, 13, 16, 27))
        assert result is not None
        assert result.weekdays == []


class TestRequestShape:
    def test_accepts_empty_history(self) -> None:
        req = CadenceRequest(caller=CALLER, item_name="이불 빨래")
        assert req.history == []
        assert req.user_average_interval_days is None
