"""HTTP endpoints serving the veteran-app frontend's ApiClient contract.

One route per method on frontend/veteran-app/lib/api/client.ts, returning the
shapes in lib/api/types.ts. Chat sessions are persisted through the same store
the server-rendered chat uses, so a veteran can move between the two.
"""

from __future__ import annotations

from typing import Any, Dict

from fastapi import APIRouter, HTTPException, UploadFile, File
from pydantic import BaseModel

from src import intake_chat
from src.api import app_bridge
from src.claim_intake import ClaimIntake
from src.gemini import GeminiError
from src.storage import DEFAULT_DB_PATH, ClaimStore

router = APIRouter(prefix="/app", tags=["veteran-app"])


def _store() -> ClaimStore:
    return ClaimStore(DEFAULT_DB_PATH)


def _load_session(routing_id: str, create: bool = True):
    """Rehydrate a chat session for a routing id, creating one if it is new.

    The frontend mints its own routing id client-side (`route-<uuid>`) and
    never asks us for one, so an id we have not seen is the normal first
    contact, not an error.
    """
    with _store() as store:
        claim = store.load_claim(routing_id)
        if claim is not None:
            session = intake_chat.new_session()
            session.claim = claim
            restored = store.load_chat_session(routing_id) if hasattr(
                store, "load_chat_session") else None
            if restored:
                _apply_session_state(session, restored)
            return session

    if not create:
        return None

    session = intake_chat.new_session()
    session.claim.id = routing_id
    session.say("bot", intake_chat.next_question(session).text)
    _persist(session)
    return session


def _apply_session_state(session, state: Dict[str, Any]) -> None:
    for key, value in (state or {}).items():
        if key == "transcript":
            session.transcript = [
                intake_chat.Message(role=m.get("role", "bot"), text=m.get("text", ""),
                                    detail=m.get("detail", ""))
                for m in value
            ]
        elif hasattr(session, key) and isinstance(value, bool):
            setattr(session, key, value)


def _persist(session) -> None:
    with _store() as store:
        store.save_claim(session.claim)
        if hasattr(store, "save_chat_session"):
            store.save_chat_session(session.claim.id, {
                "transcript": [
                    {"role": m.role, "text": m.text, "detail": m.detail}
                    for m in session.transcript
                ],
                **{
                    field: getattr(session, field)
                    for field in vars(session)
                    if isinstance(getattr(session, field), bool)
                },
            })


class ChatRequest(BaseModel):
    text: str


@router.get("/claims/{routing_id}")
def get_claim(routing_id: str) -> Dict[str, Any]:
    """The frontend's Claim object for this routing id, created if new."""
    session = _load_session(routing_id)
    return app_bridge.claim_to_app_claim(session.claim)


@router.get("/claims/{routing_id}/messages")
def get_messages(routing_id: str) -> Dict[str, Any]:
    """The whole conversation so far, for resuming on another device."""
    session = _load_session(routing_id)
    return {"messages": app_bridge.chat_messages(session)}


@router.post("/claims")
def create_claim() -> Dict[str, Any]:
    """Start a conversation and hand back its routing id."""
    session = intake_chat.new_session()
    session.say("bot", intake_chat.next_question(session).text)
    _persist(session)
    return {
        "routingId": session.claim.id,
        "messages": app_bridge.chat_messages(session),
    }


@router.post("/claims/{routing_id}/chat")
def send_chat_message(routing_id: str, body: ChatRequest) -> Dict[str, Any]:
    """One conversational turn. Returns only the messages this turn added."""
    session = _load_session(routing_id)
    before = len(session.transcript)
    try:
        result = intake_chat.apply_answer(session, body.text)
    except GeminiError as error:
        raise HTTPException(status_code=502, detail=f"Document AI unavailable: {error}")

    # apply_answer records the veteran's turn itself. Do not depend on that
    # side effect: if it ever stops, the user's own message would silently
    # vanish from the API response.
    _ensure_veteran_turn(session, body.text, before)

    _say_receipts(session, result)
    question = intake_chat.next_question(session)
    if question.slot is not intake_chat.Slot.DONE:
        _say_once(session, question.text)

    _persist(session)
    return {"messages": app_bridge.chat_messages(session, since=before)}


@router.post("/claims/{routing_id}/documents")
async def upload_document(routing_id: str, file: UploadFile = File(...)) -> Dict[str, Any]:
    """Upload a document into the conversation and get the receipt back."""
    session = _load_session(routing_id)
    data = await file.read()
    before = len(session.transcript)
    try:
        result = intake_chat.apply_document(
            session, intake_chat.Attachment(file.filename or "upload", data)
        )
    except GeminiError as error:
        raise HTTPException(status_code=502, detail=f"Document AI unavailable: {error}")

    _say_receipts(session, result)
    question = intake_chat.next_question(session)
    if question.slot is not intake_chat.Slot.DONE:
        _say_once(session, question.text)

    _persist(session)
    return {
        "messages": app_bridge.chat_messages(session, since=before),
        "claim": app_bridge.claim_to_app_claim(session.claim),
    }


@router.post("/claims/{routing_id}/confirm")
def confirm_claim_draft(routing_id: str) -> Dict[str, Any]:
    """Hand the claim to a VSO for review."""
    from src.models import ClaimStatus

    session = _load_session(routing_id)
    with _store() as store:
        claim = session.claim
        ClaimIntake(claim).evaluate_readiness()
        claim.set_status(ClaimStatus.IN_VSO_REVIEW, "Veteran confirmed the draft")
        store.save_claim(claim)

    return {"vso": app_bridge.vso(claim)}


@router.delete("/claims/{routing_id}")
def delete_my_data(routing_id: str) -> Dict[str, bool]:
    """Delete everything held for this routing id."""
    with _store() as store:
        claim = store.load_claim(routing_id)
        if claim is None:
            return {"deleted": False}
        for table in ("vso_reviews", "status_events", "tasks", "evidence_items",
                      "conditions", "service_events", "chat_sessions",
                      "case_messages", "va_submissions"):
            try:
                store.connection.execute(
                    f"DELETE FROM {table} WHERE claim_id = ?", (routing_id,))
            except Exception:
                continue        # a table from a newer or older schema
        store.connection.execute("DELETE FROM claims WHERE id = ?", (routing_id,))
        store.connection.execute(
            "DELETE FROM veterans WHERE id = ?", (claim.veteran.id,))
        store.connection.commit()
    return {"deleted": True}


# --- helpers ----------------------------------------------------------------


def _ensure_veteran_turn(session, text: str, before: int) -> None:
    """Record the veteran's message unless the handler already did."""
    said = any(
        message.role == "veteran" and message.text == text.strip()
        for message in session.transcript[before:]
    )
    if not said:
        session.transcript.insert(
            before, intake_chat.Message(role="veteran", text=text.strip())
        )


def _say_once(session, text: str) -> None:
    """Append a bot line unless it is a verbatim repeat of the last one."""
    for message in reversed(session.transcript):
        if message.role == "bot":
            if message.text == text:
                return
            break
    session.say("bot", text)


def _say_receipts(session, result: Any) -> None:
    """apply_answer/apply_document return a string, a result object, or a list."""
    if result is None:
        return
    if isinstance(result, str):
        session.say("bot", result)
        return
    if isinstance(result, list):
        for entry in result:
            if isinstance(entry, tuple):
                session.say("bot", entry[0], entry[1] if len(entry) > 1 else "")
            elif isinstance(entry, str):
                session.say("bot", entry)
        return
    message = getattr(result, "message", None)
    if message:
        session.say("bot", message, getattr(result, "detail", "") or "")
