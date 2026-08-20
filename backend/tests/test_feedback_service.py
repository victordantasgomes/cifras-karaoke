import pytest

from services.feedback_service import FeedbackService, NoActiveSession
from services.setlist_service import SetlistService


@pytest.fixture
def ctx(user_id):
    setlists = SetlistService()
    feedback = FeedbackService()
    setlists.save(user_id, "Ensaio", ["Coldplay/Yellow"], setlist_id="ensaio")
    return feedback, setlists


def test_activate_creates_a_token(ctx):
    feedback, _ = ctx
    result = feedback.activate("u1", "ensaio")
    assert result["token"]


def test_activate_twice_reuses_the_same_active_session(ctx):
    feedback, _ = ctx
    first = feedback.activate("u1", "ensaio")
    second = feedback.activate("u1", "ensaio")
    assert first["token"] == second["token"]


def test_non_owner_cannot_activate(ctx, other_user_id):
    feedback, _ = ctx
    with pytest.raises(PermissionError):
        feedback.activate("u2", "ensaio")


def test_activate_unknown_setlist_raises_not_found(ctx):
    feedback, _ = ctx
    with pytest.raises(FileNotFoundError):
        feedback.activate("u1", "nao-existe")


def test_status_is_none_before_activation(ctx):
    feedback, _ = ctx
    assert feedback.status("u1", "ensaio") is None


def test_status_reflects_current_song_after_update(ctx):
    feedback, _ = ctx
    feedback.activate("u1", "ensaio")
    feedback.set_current_song("ensaio", "pop--coldplay--yellow")
    status = feedback.status("u1", "ensaio")
    assert status["current_song_slug"] == "pop--coldplay--yellow"


def test_deactivate_clears_status(ctx):
    feedback, _ = ctx
    feedback.activate("u1", "ensaio")
    feedback.deactivate("u1", "ensaio")
    assert feedback.status("u1", "ensaio") is None


def test_public_status_unknown_token_raises_not_found(ctx):
    feedback, _ = ctx
    with pytest.raises(FileNotFoundError):
        feedback.public_status("token-invalido")


def test_public_status_reports_current_song(ctx):
    feedback, _ = ctx
    token = feedback.activate("u1", "ensaio")["token"]
    feedback.set_current_song("ensaio", "pop--coldplay--yellow")
    status = feedback.public_status(token)
    assert status["active"] is True
    assert status["setlist_nome"] == "Ensaio"
    assert status["current_song"] is None  # música não existe de fato no banco neste teste


def test_submit_rating_without_current_song_raises(ctx):
    feedback, _ = ctx
    token = feedback.activate("u1", "ensaio")["token"]
    with pytest.raises(NoActiveSession):
        feedback.submit_rating(token, 8)


def test_submit_rating_after_deactivation_raises(ctx):
    feedback, _ = ctx
    token = feedback.activate("u1", "ensaio")["token"]
    feedback.set_current_song("ensaio", "pop--coldplay--yellow")
    feedback.deactivate("u1", "ensaio")
    with pytest.raises(NoActiveSession):
        feedback.submit_rating(token, 8)


def test_submit_rating_clamps_out_of_range_values(ctx):
    feedback, _ = ctx
    token = feedback.activate("u1", "ensaio")["token"]
    feedback.set_current_song("ensaio", "pop--coldplay--yellow")
    feedback.submit_rating(token, 999)
    report = feedback.report("u1", "ensaio")
    assert report[0]["media"] == 10


def test_report_aggregates_multiple_ratings_per_song(ctx):
    feedback, _ = ctx
    token = feedback.activate("u1", "ensaio")["token"]
    feedback.set_current_song("ensaio", "pop--coldplay--yellow")
    feedback.submit_rating(token, 8, nome="Ana", observacoes="Muito boa!")
    feedback.submit_rating(token, 6)
    report = feedback.report("u1", "ensaio")
    assert len(report) == 1
    entry = report[0]
    assert entry["song_slug"] == "pop--coldplay--yellow"
    assert entry["count"] == 2
    assert entry["media"] == 7
    assert {"nome": "Ana", "nota": 8, "observacoes": "Muito boa!"}.items() <= entry["avaliacoes"][0].items()


def test_report_survives_reactivation_summing_all_sessions(ctx):
    feedback, _ = ctx
    token1 = feedback.activate("u1", "ensaio")["token"]
    feedback.set_current_song("ensaio", "pop--coldplay--yellow")
    feedback.submit_rating(token1, 10)
    feedback.deactivate("u1", "ensaio")

    token2 = feedback.activate("u1", "ensaio")["token"]
    assert token2 != token1
    feedback.set_current_song("ensaio", "pop--coldplay--yellow")
    feedback.submit_rating(token2, 8)

    report = feedback.report("u1", "ensaio")
    assert report[0]["count"] == 2
    assert report[0]["media"] == 9


def test_non_owner_cannot_view_report(ctx, other_user_id):
    feedback, _ = ctx
    with pytest.raises(PermissionError):
        feedback.report("u2", "ensaio")
