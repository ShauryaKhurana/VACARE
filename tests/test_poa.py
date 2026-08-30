"""Power of Attorney (21-22) behavior."""

from datetime import date

import pytest
from fastapi.testclient import TestClient

from src import poa, web
from src.sample_data import build_sample_claim
from src.storage import ClaimStore


def test_poa_missing_by_default():
    claim = build_sample_claim()
    status = poa.poa_status(claim)
    assert status.applies
    assert status.urgency == "missing"
    assert status.filed_on is None


def test_record_poa():
    claim = build_sample_claim()
    poa.record_poa(claim, date(2026, 3, 1))
    status = poa.poa_status(claim)
    assert status.urgency == "ok"
    assert status.filed_on == date(2026, 3, 1)


def test_filing_on_own_skips_poa():
    claim = build_sample_claim()
    poa.mark_filing_on_own(claim)
    status = poa.poa_status(claim)
    assert not status.applies
    assert status.filing_on_own


def test_vso_filing_checklist():
    from src.evidence_rules import ChecklistItem

    claim = build_sample_claim()
    missing = [
        ChecklistItem(label="Service treatment records", why="baseline"),
        ChecklistItem(label="DD-214 (discharge document)", why="baseline"),
    ]
    items = poa.vso_filing_checklist(claim, missing_required=missing)
    labels = [i.label for i in items]
    assert "Back-pay start date (21-0966)" in labels
    assert "VSO representation (21-22)" in labels
    assert "Required evidence" in labels
    evidence = next(i for i in items if i.label == "Required evidence")
    assert not evidence.ok
    assert "Service treatment records" in evidence.missing_items
    assert not poa.checklist_ready_to_approve(items)


@pytest.fixture
def client(tmp_path, monkeypatch):
    from src.api import deps

    monkeypatch.setattr(web, "DB_PATH", tmp_path / "poa.db")
    monkeypatch.setattr(deps, "DB_PATH", tmp_path / "poa.db")
    return TestClient(web.app)


def test_api_record_poa(client):
    case_id = client.post("/api/cases", json={}).json()["case_id"]
    response = client.post(f"/api/cases/{case_id}/poa", json={"filed_on": "2026-04-15"})
    assert response.status_code == 200
    assert response.json()["filed_on"] == "2026-04-15"
    assert response.json()["urgency"] == "ok"


def test_claim_page_shows_poa(client):
    claim = build_sample_claim()
    with ClaimStore(web.DB_PATH) as store:
        store.save_claim(claim)

    page = client.get(f"/claim/{claim.id}")
    assert page.status_code == 200
    assert "Appoint your VSO" in page.text
    assert "help-icon-btn" in page.text
