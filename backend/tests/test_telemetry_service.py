from datetime import datetime, timedelta, timezone

import db
from services.telemetry_service import SESSION_GAP_SECONDS, TelemetryService


def test_landing_view_count_starts_at_zero():
    assert TelemetryService().landing_view_count() == 0


def test_record_landing_view_increments_count():
    svc = TelemetryService()
    svc.record_landing_view()
    svc.record_landing_view()
    svc.record_landing_view()
    assert svc.landing_view_count() == 3


def _t(seconds_offset):
    return datetime(2026, 1, 1, tzinfo=timezone.utc) + timedelta(seconds=seconds_offset)


def test_group_into_sessions_empty():
    assert TelemetryService.group_into_sessions([]) == []


def test_group_into_sessions_single_ping_is_zero_length_session():
    assert TelemetryService.group_into_sessions([_t(0)]) == [0.0]


def test_group_into_sessions_within_gap_is_one_session():
    timestamps = [_t(0), _t(50), _t(100)]
    assert TelemetryService.group_into_sessions(timestamps) == [100.0]


def test_group_into_sessions_gap_exactly_at_threshold_stays_one_session():
    timestamps = [_t(0), _t(SESSION_GAP_SECONDS)]
    assert TelemetryService.group_into_sessions(timestamps) == [float(SESSION_GAP_SECONDS)]


def test_group_into_sessions_gap_past_threshold_splits():
    timestamps = [_t(0), _t(SESSION_GAP_SECONDS + 1)]
    assert TelemetryService.group_into_sessions(timestamps) == [0.0, 0.0]


def test_group_into_sessions_unordered_input_is_sorted_first():
    timestamps = [_t(100), _t(0), _t(50)]
    assert TelemetryService.group_into_sessions(timestamps) == [100.0]


def test_group_into_sessions_multiple_sessions():
    timestamps = [_t(0), _t(30), _t(1000), _t(1030), _t(1060)]
    assert TelemetryService.group_into_sessions(timestamps) == [30.0, 60.0]


def test_average_session_seconds_no_pings_is_zero():
    assert TelemetryService().average_session_seconds() == 0.0


def test_average_session_seconds_across_users(user_id, other_user_id):
    # u1: uma sessão de 50s (dois pings dentro do gap)
    # u2: uma sessão de 0s (ping isolado, no meio do intervalo de u1 no
    # relógio) — pings de usuários diferentes não devem se misturar mesmo
    # se próximos no tempo.
    with db.get_pool().connection() as conn:
        conn.execute(
            "insert into activity_pings (user_id, pinged_at) values (%s, %s), (%s, %s), (%s, %s)",
            (user_id, _t(0), user_id, _t(50), other_user_id, _t(25)),
        )
    assert TelemetryService().average_session_seconds() == 25.0


def test_record_ping_persists_a_row_for_the_user(user_id):
    svc = TelemetryService()
    svc.record_ping(user_id)
    with db.get_pool().connection() as conn:
        row = conn.execute("select user_id from activity_pings").fetchone()
    assert row["user_id"] == user_id
