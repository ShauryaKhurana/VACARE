"""Intent to File (21-0966) behavior."""

from datetime import date, timedelta

import pytest
from fastapi.testclient import TestClient

from src import itf, web
from src.sample_data import build_sample_claim


def test_itf_not_needed_for_bdd():
    claim = build_sample_claim()
    claim.context.still_serving = True
    claim.context.separation_date = date.today() + timedelta(days=120)
    assert not itf.itf_applies(claim)
    status = itf.itf_status(claim)
    assert status.applies is False


def test_itf_missing_when_not_filed():
    claim = build_sample_claim()
    status = itf.itf_status(claim)
    assert status.applies
    assert status.urgency == "missing"
    assert status.filed_on is None


def test_record_itf_sets_expiry():
    claim = build_sample_claim()
    filed = date(2026, 1, 1)
    itf.record_itf(claim, filed)
    status = itf.itf_status(claim, today=date(2026, 6, 1))
    assert status.filed_on == filed
    assert status.expires_on == date(2027, 1, 1)
    assert status.urgency == "ok"


def test_itf_urgent_near_expiry():
    claim = build_sample_claim()
    filed = date.today() - timedelta(days=340)
    itf.record_itf(claim, filed)
    status = itf.itf_status(claim)
    assert status.urgency in {"urgent", "soon"}


@pytest.fixture
def client(tmp_path, monkeypatch):
    from src.api import deps

    monkeypatch.setattr(web, "DB_PATH", tmp_path / "itf.db")
    monkeypatch.setattr(deps, "DB_PATH", tmp_path / "itf.db")
    return TestClient(web.app)


def test_api_record_itf(client):
    created = client.post("/api/cases", json={}).json()
    case_id = created["case_id"]

    response = client.post(f"/api/cases/{case_id}/itf", json={"filed_on": "2026-06-01"})
    assert response.status_code == 200
    body = response.json()
    assert body["filed_on"] == "2026-06-01"
    assert body["applies"] is True

    get_resp = client.get(f"/api/cases/{case_id}/itf")
    assert get_resp.json()["filed_on"] == "2026-06-01"


def test_claim_page_shows_itf(client, tmp_path):
    from src.storage import ClaimStore

    claim = build_sample_claim()
    with ClaimStore(web.DB_PATH) as store:
        store.save_claim(claim)

    page = client.get(f"/claim/{claim.id}")
    assert page.status_code == 200
    assert "Save your back-pay start date" in page.text
    assert "help-icon-btn" in page.text
    assert "What is this?" in page.text
