from datetime import datetime, timedelta, timezone

import pytest

import db
from services.admin_stats_service import AdminStatsService
from services.audio_service import AudioService
from services.history_service import HistoryService
from services.plans_service import PlansService
from services.setlist_service import SetlistService
from services.songs_service import SongsService
from services.telemetry_service import TelemetryService


@pytest.fixture
def ctx(fake_blob_store):
    setlists = SetlistService()
    audio = AudioService()
    songs = SongsService(setlists=setlists, audio=audio)
    audio.songs = songs
    history = HistoryService(songs)
    telemetry = TelemetryService()
    admin_stats = AdminStatsService(setlists=setlists, telemetry=telemetry)
    return songs, setlists, history, admin_stats


def _create(songs, title="Yellow", artist="Coldplay", genre="Pop", user="u1"):
    return songs.create(user, genre, artist, title,
                        f"@titulo: {title}\n@tom: B\n@velocidade: 55\n\nB\nLook at the stars")


def test_tools_stats_on_empty_db_is_all_zeroes(ctx):
    _, _, _, admin_stats = ctx
    stats = admin_stats.tools_stats()
    assert stats["total_users"] == 0
    assert stats["total_songs"] == 0
    assert stats["avg_session_seconds"] == 0.0
    assert stats["most_played"] == []
    assert stats["most_edited"] == []
    assert stats["most_setlisted"] == []
    assert stats["top_uploaders"] == []
    assert stats["top_by_logins"] == []


def test_total_users_and_songs_counts(ctx, user_id, other_user_id):
    songs, _, _, admin_stats = ctx
    _create(songs, "Yellow", "Coldplay")
    _create(songs, "Clocks", "Coldplay")
    stats = admin_stats.tools_stats()
    assert stats["total_users"] == 2  # user_id + other_user_id
    assert stats["total_songs"] == 2


def test_most_played_orders_by_play_count_desc(ctx, user_id):
    songs, _, history, admin_stats = ctx
    a = _create(songs, "Yellow", "Coldplay")
    b = _create(songs, "Clocks", "Coldplay")
    history.register_play("u1", a["slug"])
    history.register_play("u1", b["slug"])
    history.register_play("u1", b["slug"])
    history.register_play("u1", b["slug"])

    most_played = admin_stats.tools_stats()["most_played"]
    assert [r["slug"] for r in most_played] == [b["slug"], a["slug"]]
    assert most_played[0]["count"] == 3
    assert most_played[1]["count"] == 1


def test_most_edited_orders_by_version_count_desc(ctx, user_id):
    songs, _, _, admin_stats = ctx
    a = _create(songs, "Yellow", "Coldplay")
    b = _create(songs, "Clocks", "Coldplay")
    data_a = songs.get("u1", a["slug"])
    songs.update("u1", a["slug"], data_a["header"], "corpo 2")
    songs.update("u1", a["slug"], data_a["header"], "corpo 3")

    most_edited = admin_stats.tools_stats()["most_edited"]
    assert most_edited[0]["slug"] == a["slug"]
    assert most_edited[0]["edits"] == 2
    assert all(r["slug"] != b["slug"] for r in most_edited)


def test_top_uploaders_groups_songs_by_user(ctx, user_id, other_user_id):
    songs, _, _, admin_stats = ctx
    _create(songs, "Yellow", "Coldplay", user="u1")
    _create(songs, "Clocks", "Coldplay", user="u1")
    _create(songs, "Roxanne", "The Police", user="u2")

    top_uploaders = admin_stats.tools_stats()["top_uploaders"]
    by_username = {r["username"]: r["songs_count"] for r in top_uploaders}
    assert by_username["demo"] == 2
    assert by_username["outro"] == 1


def test_top_by_logins_orders_desc(ctx, user_id, other_user_id):
    _, _, _, admin_stats = ctx
    with db.get_pool().connection() as conn:
        conn.execute("update users set login_count=5 where id='u1'")
        conn.execute("update users set login_count=2 where id='u2'")
    top_by_logins = admin_stats.tools_stats()["top_by_logins"]
    assert [r["login_count"] for r in top_by_logins] == [5, 2]


def test_most_setlisted_matches_setlist_service_resolution(ctx, user_id, other_user_id):
    """A lógica mais arriscada do plano: confirma que a contagem de
    'músicas em mais setlists' bate com a resolução independente feita
    pelo próprio SetlistService pros mesmos refs — sem isso, um bug na
    contagem do admin_stats poderia divergir silenciosamente de como o
    app resolve as referências em qualquer outro lugar."""
    songs, setlists, _, admin_stats = ctx
    a = _create(songs, "Yellow", "Coldplay")
    b = _create(songs, "Clocks", "Coldplay")

    refs_1 = ["Coldplay/Yellow", "Coldplay/Clocks", "Artista Inexistente/Musica Fantasma"]
    refs_2 = ["Coldplay/Yellow"]
    setlists.save("u1", "Setlist 1", refs_1)
    setlists.save("u2", "Setlist 2", refs_2)

    most_setlisted = admin_stats.tools_stats()["most_setlisted"]

    # resolução independente, direto pelo SetlistService, sobre os MESMOS
    # refs crus que foram salvos — não reaproveita nenhum código interno
    # do admin_stats_service.
    with db.get_pool().connection() as conn:
        all_refs = [r["ref"] for r in conn.execute("select ref from setlist_items").fetchall()]
    resolved = setlists._resolve_many(all_refs)
    expected_counts = {}
    for song in resolved:
        if song:
            expected_counts[song["slug"]] = expected_counts.get(song["slug"], 0) + 1

    actual_counts = {r["slug"]: r["count"] for r in most_setlisted}
    assert actual_counts == expected_counts
    assert actual_counts[a["slug"]] == 2
    assert actual_counts[b["slug"]] == 1
    assert sum(actual_counts.values()) < len(all_refs)  # a ref fantasma não conta pra ninguém


def test_sales_stats_on_empty_db_is_all_zeroes(ctx):
    _, _, _, admin_stats = ctx
    stats = admin_stats.sales_stats()
    assert stats["active_subscriptions"] == 0
    assert stats["by_status"] == {}
    assert stats["by_plan"] == []
    assert stats["landing_views"] == 0
    assert stats["cancellations_by_day"] == []


def test_sales_stats_active_subscriptions_counts_trialing_and_active(ctx, user_id, other_user_id):
    _, _, _, admin_stats = ctx
    with db.get_pool().connection() as conn:
        conn.execute("update users set subscription_status='trialing' where id='u1'")
        conn.execute("update users set subscription_status='active' where id='u2'")
    stats = admin_stats.sales_stats()
    assert stats["active_subscriptions"] == 2
    assert stats["by_status"] == {"trialing": 1, "active": 1}


def test_sales_stats_past_due_and_canceled_not_counted_as_active(ctx, user_id, other_user_id):
    _, _, _, admin_stats = ctx
    with db.get_pool().connection() as conn:
        conn.execute("update users set subscription_status='past_due' where id='u1'")
        conn.execute("update users set subscription_status='canceled' where id='u2'")
    stats = admin_stats.sales_stats()
    assert stats["active_subscriptions"] == 0
    assert stats["by_status"] == {"past_due": 1, "canceled": 1}


def test_sales_stats_by_plan_breakdown(ctx, user_id, other_user_id, fake_stripe):
    _, _, _, admin_stats = ctx
    hobby = PlansService().create("Hobby", max_setlists=3, storage_limit_mb=100, price_cents=990)
    pro = PlansService().create("Pro", max_setlists=50, storage_limit_mb=5000, price_cents=2990)
    with db.get_pool().connection() as conn:
        conn.execute(
            "update users set subscription_status='active', plan_id=%s where id='u1'", (hobby["id"],),
        )
        conn.execute(
            "update users set subscription_status='trialing', plan_id=%s where id='u2'", (pro["id"],),
        )
    by_plan = {r["name"]: r["n"] for r in admin_stats.sales_stats()["by_plan"]}
    assert by_plan == {"Hobby": 1, "Pro": 1}


def test_sales_stats_by_plan_excludes_non_active_users(ctx, user_id, fake_stripe):
    _, _, _, admin_stats = ctx
    hobby = PlansService().create("Hobby", max_setlists=3, storage_limit_mb=100, price_cents=990)
    with db.get_pool().connection() as conn:
        conn.execute(
            "update users set subscription_status='canceled', plan_id=%s where id='u1'", (hobby["id"],),
        )
    assert admin_stats.sales_stats()["by_plan"] == []


def test_sales_stats_landing_views(ctx):
    _, _, _, admin_stats = ctx
    telemetry = admin_stats.telemetry
    telemetry.record_landing_view()
    telemetry.record_landing_view()
    assert admin_stats.sales_stats()["landing_views"] == 2


def _t(days_ago):
    return datetime.now(timezone.utc) - timedelta(days=days_ago)


def test_sales_stats_cancellations_grouped_by_day(ctx, user_id, other_user_id):
    _, _, _, admin_stats = ctx
    with db.get_pool().connection() as conn:
        conn.execute(
            """insert into subscription_events (user_id, old_status, new_status, occurred_at)
               values (%s, 'active', 'canceled', %s), (%s, 'active', 'canceled', %s),
                      (%s, 'active', 'canceled', %s)""",
            ("u1", _t(2), "u2", _t(2), "u1", _t(1)),
        )
        # não é cancelamento — não deve entrar na contagem
        conn.execute(
            "insert into subscription_events (user_id, old_status, new_status, occurred_at) values (%s, 'none', 'trialing', %s)",
            ("u1", _t(1)),
        )
    by_day = {d["day"]: d["count"] for d in admin_stats.sales_stats()["cancellations_by_day"]}
    assert by_day[_t(2).date().isoformat()] == 2
    assert by_day[_t(1).date().isoformat()] == 1
    assert len(by_day) == 2
