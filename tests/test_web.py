"""End-to-end checks on the web frontend."""

import pytest
from fastapi.testclient import TestClient

from src import web
from src.sample_data import build_sample_claim
from src.storage import ClaimStore

BASE_INTAKE = {
    "first_name": "Dana", "last_name": "Reyes", "dob": "1988-03-12",
    "email": "dana@example.com", "phone": "555-014-2277", "branch": "army",
    "service_start": "2007-06-01", "service_end": "2013-08-30", "discharge_type": "honorable",
    "condition_1_name": "Tinnitus",
    "condition_1_symptoms": "Ringing in both ears all day.",
    "condition_1_started": "on",
    "have_dd214": "on",
}


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(web, "DB_PATH", tmp_path / "web.db")
    return TestClient(web.app)


def submit(client, **overrides):
    payload = dict(BASE_INTAKE)
    payload.update(overrides)
    response = client.post("/intake", data=payload, follow_redirects=False)
    return response


def test_every_page_renders(client):
    assert client.get("/").status_code == 200
    assert client.get("/intake").status_code == 200
    assert client.get("/forms").status_code == 200


def test_intake_creates_a_claim_and_lands_on_its_dashboard(client):
    response = submit(client)
    assert response.status_code == 303
    location = response.headers["location"]

    page = client.get(location)
    assert page.status_code == 200
    assert "Dana Reyes" in page.text
    assert "21-526EZ" in page.text          # the lane's master form
    assert "21-0966" in page.text           # ITF leads a first claim


def test_intake_rejects_a_bad_date_of_birth_without_creating_a_claim(client):
    response = submit(client, dob="2030-01-01")
    assert response.status_code == 303
    assert "/intake?error=" in response.headers["location"]
    with ClaimStore(web.DB_PATH) as store:
        assert store.list_claims() == []


def test_intake_requires_at_least_one_condition(client):
    response = submit(client, condition_1_name="", condition_1_symptoms="")
    assert "/intake?error=" in response.headers["location"]


def test_mental_health_condition_changes_the_form_sequence(client):
    location = submit(
        client,
        condition_1_name="PTSD",
        condition_1_symptoms="Nightmares and hypervigilance most days.",
    ).headers["location"]
    assert "21-0781" in client.get(location).text


def test_decision_review_answers_route_to_the_right_door(client):
    location = submit(
        client,
        has_filed_before="on", has_existing_rating="on",
        disagrees_with_decision="on", decision_date="2026-06-01",
        has_new_evidence="on",
    ).headers["location"]
    page = client.get(location).text
    assert "20-0995" in page                     # supplemental, because new evidence exists
    assert "Higher-Level Review deadline" in page  # the clock is shown either way


def test_deadline_clock_appears_when_an_itf_date_is_given(client):
    location = submit(client, itf_filed_on="2026-06-01").headers["location"]
    assert "Intent to File expires" in client.get(location).text


def test_adding_evidence_updates_the_checklist(client):
    location = submit(client).headers["location"]
    before = client.get(location).text
    assert "Service treatment records" in before

    client.post(f"{location}/evidence", data={"evidence_type": "service_treatment_record"},
                follow_redirects=False)
    after = client.get(location).text
    assert after.count("Service treatment records") < before.count("Service treatment records")


def test_status_can_be_recorded_from_the_dashboard(client):
    location = submit(client).headers["location"]
    client.post(f"{location}/status", data={"status": "in_vso_review", "note": "Picked up"},
                follow_redirects=False)
    page = client.get(location).text
    assert "in vso review" in page and "Picked up" in page


def test_packet_route_returns_the_vso_packet(client):
    location = submit(client).headers["location"]
    packet = client.get(f"{location}/packet")
    assert packet.status_code == 200
    assert "VSO-READY CLAIM PACKET" in packet.text


def test_unknown_claim_redirects_home(client):
    response = client.get("/claim/nope", follow_redirects=False)
    assert response.status_code == 303


def test_home_lists_a_saved_claim(client):
    claim = build_sample_claim()
    with ClaimStore(web.DB_PATH) as store:
        store.save_claim(claim)
    assert claim.id in client.get("/").text
