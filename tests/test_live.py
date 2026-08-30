"""Live polling API for partial UI updates."""

import pytest
from fastapi.testclient import TestClient

from src import collaboration, web
from src.models import MessageAuthor
from src.sample_data import build_sample_claim
from src.storage import ClaimStore


@pytest.fixture
def client(tmp_path, monkeypatch):
    from src.api import deps

    monkeypatch.setattr(web, "DB_PATH", tmp_path / "live.db")
    monkeypatch.setattr(deps, "DB_PATH", tmp_path / "live.db")
    return TestClient(web.app)


def test_case_live_returns_messages(client):
    claim = build_sample_claim()
    with ClaimStore(web.DB_PATH) as db:
        db.save_claim(claim)
        collaboration.submit_for_vso_review(db, claim)
        db.add_message(claim.id, MessageAuthor.VSO, "Please send DD-214.")

    response = client.get(f"/api/cases/{claim.id}/live")
    assert response.status_code == 200
    body = response.json()
    assert body["case_id"] == claim.id
    assert body["message_count"] >= 2
    assert body["latest_message_id"]


def test_inbox_lists_claims(client):
    claim = build_sample_claim()
    with ClaimStore(web.DB_PATH) as db:
        db.save_claim(claim)

    response = client.get("/api/live/inbox")
    assert response.status_code == 200
    assert any(row["claim_id"] == claim.id for row in response.json())
