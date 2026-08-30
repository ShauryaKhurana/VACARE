"""Decision review / appeals lane (M10-lite)."""

from datetime import date, timedelta

import pytest
from fastapi.testclient import TestClient

from src import appeal, decision, intake_chat
from src.models import ClaimStatus
from src.sample_data import build_sample_claim
from src.storage import ClaimStore


def _decided_claim():
    claim = build_sample_claim()
    decision.mark_submitted(claim)
    claim.context.decision_date = date.today() - timedelta(days=30)
    claim.context.decision_outcome = "denied"
    claim.context.decision_denied = ["Lower back pain"]
    claim.context.disagrees_with_decision = True
    claim.set_status(ClaimStatus.DECIDED, "Denied")
    return claim


def test_appeal_applies_for_modern_decision():
    claim = _decided_claim()
    assert appeal.appeal_applies(claim)


def test_select_supplemental_sets_flags():
    claim = _decided_claim()
    status = appeal.select_door(claim, "20-0995")
    assert claim.context.appeal_door_selected == "20-0995"
    assert claim.context.has_new_evidence is True
    assert claim.context.wants_judge is False
    assert status.selected_door == "20-0995"
    assert len(status.checklist) >= 3


def test_select_hlr_clears_evidence_flag():
    claim = _decided_claim()
    appeal.select_door(claim, "20-0996")
    assert claim.context.has_new_evidence is False
    assert claim.context.wants_judge is False


def test_select_board_sets_judge_flag():
    claim = _decided_claim()
    appeal.select_door(claim, "10182")
    assert claim.context.wants_judge is True


def test_appeal_checklist_for_hlr():
    claim = _decided_claim()
    appeal.select_door(claim, "20-0996")
    labels = [item.label for item in appeal.appeal_checklist(claim)]
    assert "No new evidence" in labels


def test_appeal_chat_flow():
    claim = _decided_claim()
    session = intake_chat.new_session(claim)
    intake_chat.start_appeal_mode(session)
    assert intake_chat.next_question(session).slot == intake_chat.Slot.APPEAL_DISAGREE

    intake_chat.apply_answer(session, "No — I want to challenge it")
    assert session.claim.context.disagrees_with_decision
    assert intake_chat.next_question(session).slot == intake_chat.Slot.APPEAL_DOOR

    intake_chat.apply_answer(session, "I have new evidence VA has not seen")
    assert session.claim.context.appeal_door_selected == "20-0995"
    assert intake_chat.next_question(session).slot == intake_chat.Slot.DONE


@pytest.fixture
def client(tmp_path, monkeypatch):
    from src.api import deps

    monkeypatch.setattr("src.web.DB_PATH", tmp_path / "appeal.db")
    monkeypatch.setattr(deps, "DB_PATH", tmp_path / "appeal.db")
    from src import web

    return TestClient(web.app)


def test_api_select_appeal_door(client):
    from src import web

    claim = _decided_claim()
    with ClaimStore(web.DB_PATH) as store:
        store.save_claim(claim)

    response = client.post(
        f"/api/cases/{claim.id}/appeal",
        json={"door": "20-0996"},
    )
    assert response.status_code == 200
    assert response.json()["selected_door"] == "20-0996"


def test_claim_page_shows_appeal_picker(client):
    from src import web

    claim = _decided_claim()
    with ClaimStore(web.DB_PATH) as store:
        store.save_claim(claim)

    page = client.get(f"/claim/{claim.id}")
    assert "Challenge the decision" in page.text
    assert "Higher-Level Review" in page.text


def test_claim_page_shows_selected_appeal(client):
    from src import web

    claim = _decided_claim()
    appeal.select_door(claim, "20-0995")
    with ClaimStore(web.DB_PATH) as store:
        store.save_claim(claim)

    page = client.get(f"/claim/{claim.id}")
    assert "Your review path" in page.text
    assert "20-0995" in page.text
    assert "Before you file" in page.text
