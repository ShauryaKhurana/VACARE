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


# --- the chat UI's JSON API ------------------------------------------------

STORY_PAYLOAD = {
    "conditions": [{"name": "Tinnitus", "current_symptoms": "Ears ring constantly",
                    "onset_date": "2011-04-01", "started_in_service": True,
                    "worsened_in_service": False, "currently_treated": True}],
    "event": {"title": "Convoy IED blast", "description": "Struck a roadside device.",
              "event_date": "2011-04-09"},
    "has_dependents": True,
}

DD214_PAYLOAD = {
    "document_type": "dd214", "confidence": "high", "summary": "DD-214",
    "first_name": "DANA", "last_name": "REYES", "date_of_birth": "1988-03-12",
    "branch": "army", "service_start": "2007-06-01", "service_end": "2013-08-30",
    "discharge_type": "honorable",
}


@pytest.fixture
def mocked_ai():
    from unittest.mock import patch
    from src import extract, gemini
    with patch.object(gemini, "available", return_value=True), \
         patch.object(extract, "extract_from_story", return_value=STORY_PAYLOAD), \
         patch.object(extract, "extract_from_document", return_value=DD214_PAYLOAD):
        yield


def test_chat_page_renders_the_shell(client):
    page = client.get("/chat")
    assert page.status_code == 200
    assert "/api/chat" in page.text


def test_api_returns_the_opening_question(client):
    state = client.get("/api/chat").json()
    assert state["question"]["slot"] == "story"
    assert state["question"]["multiline"] is True
    assert state["facts"]["has_any"] is False


def test_api_message_extracts_facts_into_the_panel(client, mocked_ai):
    client.get("/api/chat")
    state = client.post("/api/chat/message", json={"message": "IED blast, ears ring"}).json()

    assert [c["name"] for c in state["facts"]["conditions"]] == ["Tinnitus"]
    assert state["facts"]["conditions"][0]["link"] == "began in service"
    assert state["facts"]["lane"] == "I've never filed"
    assert state["question"]["slot"] == "identity"


def test_api_upload_fills_identity_and_advances(client, mocked_ai):
    client.get("/api/chat")
    client.post("/api/chat/message", json={"message": "IED blast, ears ring"})
    state = client.post(
        "/api/chat/upload", files={"document": ("dd214.txt", b"DD214", "text/plain")}
    ).json()

    assert state["facts"]["name"] == "Dana Reyes"
    assert state["facts"]["dob"] == "1988-03-12"
    assert state["facts"]["service"] == "2007-06-01 to 2013-08-30"
    assert "dd214" in state["facts"]["documents"]
    assert state["question"]["slot"] == "rating"


def test_missing_items_are_scoped_to_a_condition(client, mocked_ai):
    client.get("/api/chat")
    state = client.post("/api/chat/message", json={"message": "IED blast"}).json()
    scoped = [m for m in state["facts"]["missing"] if m["scope"]]
    assert scoped and scoped[0]["scope"] == "Tinnitus"


def test_finish_saves_the_claim_and_returns_its_url(client, mocked_ai):
    client.get("/api/chat")
    client.post("/api/chat/message", json={"message": "IED blast, ears ring"})
    result = client.post("/api/chat/finish").json()

    assert result["url"].startswith("/claim/")
    with ClaimStore(web.DB_PATH) as store:
        assert store.load_claim(result["claim_id"]) is not None
    assert client.get(result["url"]).status_code == 200


def test_reset_clears_the_conversation(client, mocked_ai):
    client.get("/api/chat")
    client.post("/api/chat/message", json={"message": "IED blast, ears ring"})
    client.post("/api/chat/reset")
    client.cookies.clear()
    assert client.get("/api/chat").json()["facts"]["has_any"] is False


def test_an_oversized_upload_is_refused_politely(client, mocked_ai):
    from src import gemini
    client.get("/api/chat")
    big = b"x" * (gemini.MAX_INLINE_BYTES + 1)
    state = client.post("/api/chat/upload",
                        files={"document": ("huge.pdf", big, "application/pdf")}).json()
    assert any("too large" in m["text"] for m in state["messages"])
