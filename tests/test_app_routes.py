"""The HTTP surface the veteran-app frontend calls."""

import pytest
from fastapi.testclient import TestClient

from src import web
from src.storage import ClaimStore

ROUTING_ID = "route-11111111-2222-3333-4444-555555555555"


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(web, "DB_PATH", tmp_path / "app.db")
    from src.api import app_routes
    monkeypatch.setattr(app_routes, "DEFAULT_DB_PATH", tmp_path / "app.db")
    return TestClient(web.app)


def test_an_unknown_routing_id_creates_a_claim_rather_than_404ing(client):
    """The frontend mints its own id, so first contact is normal, not an error."""
    response = client.get(f"/api/app/claims/{ROUTING_ID}")
    assert response.status_code == 200
    assert response.json()["routingId"] == ROUTING_ID


def test_the_claim_payload_is_the_shape_types_ts_declares(client):
    payload = client.get(f"/api/app/claims/{ROUTING_ID}").json()
    assert {"routingId", "claimType", "stage", "vso", "conditions",
            "needsAttention", "upcoming", "updates"} <= set(payload)


def test_the_opening_question_is_returned_as_messages(client):
    client.get(f"/api/app/claims/{ROUTING_ID}")
    messages = client.get(f"/api/app/claims/{ROUTING_ID}/messages").json()["messages"]
    assert any(m["type"] == "ai-text" for m in messages)


def test_a_chat_turn_returns_only_that_turn(client, monkeypatch):
    from src import intake_chat

    def answer(session, text):
        session.say("veteran", text)      # what the real handler does
        return "Got it."

    monkeypatch.setattr(intake_chat, "apply_answer", answer)
    client.get(f"/api/app/claims/{ROUTING_ID}")

    body = client.post(f"/api/app/claims/{ROUTING_ID}/chat",
                       json={"text": "My ears ring"}).json()
    texts = [m.get("text") for m in body["messages"]]

    # The caller's own message is not echoed: the client rendered it the
    # moment it was typed, so returning it drew the bubble twice.
    assert "My ears ring" not in texts
    assert "Got it." in texts

    # It is still in the transcript, which is what a resume reads.
    transcript = client.get(f"/api/app/claims/{ROUTING_ID}/messages").json()["messages"]
    assert any(m.get("text") == "My ears ring" for m in transcript)


def test_the_veteran_turn_is_recorded_even_if_the_handler_forgets(client, monkeypatch):
    """The transcript must not lose the user's own message to a handler change."""
    from src import intake_chat

    monkeypatch.setattr(intake_chat, "apply_answer",
                        lambda session, text: "Got it.")   # deliberately silent
    client.get(f"/api/app/claims/{ROUTING_ID}")
    client.post(f"/api/app/claims/{ROUTING_ID}/chat", json={"text": "My ears ring"})

    transcript = client.get(f"/api/app/claims/{ROUTING_ID}/messages").json()["messages"]
    assert any(m["type"] == "veteran-text" and m["text"] == "My ears ring"
               for m in transcript)


def test_confirm_moves_the_claim_into_vso_review(client):
    client.get(f"/api/app/claims/{ROUTING_ID}")
    response = client.post(f"/api/app/claims/{ROUTING_ID}/confirm")

    assert response.status_code == 200
    assert "vso" in response.json()
    with ClaimStore(web.DB_PATH) as store:
        assert store.load_claim(ROUTING_ID).status.value == "in_vso_review"


def test_delete_my_data_actually_removes_the_claim(client):
    client.get(f"/api/app/claims/{ROUTING_ID}")
    with ClaimStore(web.DB_PATH) as store:
        assert store.load_claim(ROUTING_ID) is not None

    assert client.delete(f"/api/app/claims/{ROUTING_ID}").json()["deleted"] is True
    with ClaimStore(web.DB_PATH) as store:
        assert store.load_claim(ROUTING_ID) is None


def test_the_conversation_survives_a_reload(client, monkeypatch):
    """Sessions persist, so a veteran can come back on another device."""
    from src import intake_chat

    def answer(session, text):
        session.say("veteran", text)
        return "Noted."

    monkeypatch.setattr(intake_chat, "apply_answer", answer)
    client.get(f"/api/app/claims/{ROUTING_ID}")
    client.post(f"/api/app/claims/{ROUTING_ID}/chat", json={"text": "hello"})

    messages = client.get(f"/api/app/claims/{ROUTING_ID}/messages").json()["messages"]
    assert any(m.get("text") == "hello" for m in messages)


def test_cors_allows_the_next_dev_server(client):
    response = client.options(
        f"/api/app/claims/{ROUTING_ID}",
        headers={"Origin": "http://localhost:3000",
                 "Access-Control-Request-Method": "GET"},
    )
    assert response.headers.get("access-control-allow-origin") == "http://localhost:3000"


def test_an_upload_failure_is_reported_not_swallowed(client, monkeypatch):
    from src import intake_chat
    from src.gemini import GeminiError

    def boom(session, attachment):
        raise GeminiError("no API key")

    monkeypatch.setattr(intake_chat, "apply_document", boom)
    client.get(f"/api/app/claims/{ROUTING_ID}")
    response = client.post(f"/api/app/claims/{ROUTING_ID}/documents",
                           files={"file": ("dd214.pdf", b"%PDF-", "application/pdf")})
    assert response.status_code == 502
    assert "no API key" in response.json()["detail"]
