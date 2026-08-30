"""Post-submission tracker and decision letter (M9-lite)."""

from datetime import date, timedelta
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from src import decision, web
from src.models import ClaimStatus
from src.sample_data import build_sample_claim
from src.storage import ClaimStore


def test_timeline_before_submission():
    claim = build_sample_claim()
    steps = decision.timeline(claim)
    keys = [s.key for s in steps]
    assert keys == ["prepare", "vso", "submitted", "review", "decision"]
    assert steps[0].state == "done"
    assert steps[2].state in {"upcoming", "current"}


def test_mark_submitted_updates_status():
    claim = build_sample_claim()
    decision.mark_submitted(claim)
    assert claim.status == ClaimStatus.SUBMITTED
    assert decision.is_submitted(claim)


def test_apply_decision_payload_sets_fields():
    claim = build_sample_claim()
    decision.mark_submitted(claim)
    payload = {
        "decision_date": "2026-06-01",
        "outcome": "partial",
        "summary": "Tinnitus granted at 10%, back pain denied.",
        "combined_rating": 10,
        "granted_conditions": ["Tinnitus"],
        "denied_conditions": ["Lower back pain"],
    }
    summary = decision.apply_decision_payload(claim, payload)
    assert claim.status == ClaimStatus.DECIDED
    assert claim.context.decision_date == date(2026, 6, 1)
    assert claim.context.decision_outcome == "partial"
    assert claim.context.combined_rating == 10
    assert summary.granted == ["Tinnitus"]
    assert claim.context.disagrees_with_decision is True


def test_appeal_doors_for_denied_decision():
    claim = build_sample_claim()
    claim.context.decision_date = date.today() - timedelta(days=30)
    claim.context.decision_outcome = "denied"
    claim.context.disagrees_with_decision = True
    doors = decision.appeal_doors(claim)
    assert len(doors) == 3
    assert any(d.recommended for d in doors)
    assert all(d.form_number != "21-0958" for d in doors)


def test_appeal_doors_skipped_when_fully_granted():
    claim = build_sample_claim()
    claim.context.decision_date = date.today() - timedelta(days=10)
    claim.context.decision_outcome = "granted"
    claim.context.decision_granted = ["Tinnitus"]
    doors = decision.appeal_doors(claim)
    assert doors == []


def test_deadlines_after_decision():
    claim = build_sample_claim()
    claim.context.decision_date = date.today() - timedelta(days=60)
    claim.context.disagrees_with_decision = True
    claim.context.decision_outcome = "denied"
    status = decision.tracker_status(claim)
    labels = [d.label for d in status.deadlines]
    assert "Higher-Level Review deadline" in labels
    assert "Board Appeal deadline" in labels


@pytest.fixture
def client(tmp_path, monkeypatch):
    from src.api import deps

    monkeypatch.setattr(web, "DB_PATH", tmp_path / "decision.db")
    monkeypatch.setattr(deps, "DB_PATH", tmp_path / "decision.db")
    return TestClient(web.app)


def test_api_tracker(client):
    claim = build_sample_claim()
    with ClaimStore(web.DB_PATH) as store:
        store.save_claim(claim)

    response = client.get(f"/api/cases/{claim.id}/tracker")
    assert response.status_code == 200
    body = response.json()
    assert len(body["timeline"]) == 5
    assert body["decision"]["has_decision"] is False


def test_api_record_decision_date(client):
    claim = build_sample_claim()
    decision.mark_submitted(claim)
    with ClaimStore(web.DB_PATH) as store:
        store.save_claim(claim)

    response = client.post(
        f"/api/cases/{claim.id}/decision-date",
        json={"decision_date": "2026-07-15"},
    )
    assert response.status_code == 200
    assert response.json()["decision_date"] == "2026-07-15"

    with ClaimStore(web.DB_PATH) as store:
        saved = store.load_claim(claim.id)
    assert saved.status == ClaimStatus.DECIDED


def test_va_intake_marks_submitted(client, tmp_path, monkeypatch):
    from src.api import deps
    from src import collaboration

    claim = build_sample_claim()
    with ClaimStore(web.DB_PATH) as store:
        store.save_claim(claim)
        collaboration.vso_approve_to_file(store, claim, reviewer_name="VSO")

    with patch("src.api.routes.fill_526ez"), patch("src.api.routes.get_va_client") as mock_client:
        mock_client.return_value.submit_benefits_intake.return_value = type(
            "R", (), {"submission_id": "mock-abc", "status": "received", "message": "ok"},
        )()
        response = client.post(f"/api/cases/{claim.id}/va/intake")

    assert response.status_code == 200
    with ClaimStore(web.DB_PATH) as store:
        saved = store.load_claim(claim.id)
    assert saved.status == ClaimStatus.SUBMITTED
    assert saved.va_submissions


def test_claim_page_shows_tracker(client):
    claim = build_sample_claim()
    with ClaimStore(web.DB_PATH) as store:
        store.save_claim(claim)

    page = client.get(f"/claim/{claim.id}")
    assert page.status_code == 200
    assert "Your claim status" in page.text
    assert "Prepare your packet" in page.text


def test_claim_page_shows_decision_upload_when_submitted(client):
    claim = build_sample_claim()
    decision.mark_submitted(claim)
    with ClaimStore(web.DB_PATH) as store:
        store.save_claim(claim)

    page = client.get(f"/claim/{claim.id}")
    assert "Upload decision letter" in page.text
    assert "Next steps" not in page.text
