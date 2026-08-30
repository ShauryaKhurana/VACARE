"""Adapter between the Python claim model and the veteran-app frontend.

The frontend defines its whole contract in one file
(frontend/veteran-app/lib/api/types.ts) and its client says that when a real
backend appears, only the client implementation changes. So the backend serves
that contract exactly rather than asking the frontend to change shape.

Everything here is a projection of state that already exists - lanes, the
evidence checklist, deadline clocks, the decision summary, presumptive hits.
Nothing is invented; where we genuinely do not have a value (a dollar amount,
an accredited VSO) the field is left empty and the UI already handles that.
"""

from __future__ import annotations

from datetime import date, timedelta
from typing import Any, Dict, List, Optional

from src import decision as decision_helpers
from src import evidence_rules, lanes, presumptive
from src.claim_intake import ClaimIntake
from src.models import Claim, ClaimStatus, Condition

# --- claim type -------------------------------------------------------------

_LANE_TO_CLAIM_TYPE = {
    lanes.Lane.FIRST_CLAIM: "original",
    lanes.Lane.INCREASE: "increase",
    lanes.Lane.NEW_CONDITION: "original",
    lanes.Lane.BDD: "original",
    lanes.Lane.PRE_DISCHARGE: "original",
    lanes.Lane.IDES: "original",
    lanes.Lane.UNKNOWN: "original",
}

_DOOR_TO_CLAIM_TYPE = {
    "20-0995": "supplemental",
    "20-0996": "higher-level-review",
    "10182": "supplemental",     # the frontend has no Board option
}


def claim_type(claim: Claim) -> str:
    lane = lanes.determine_lane(claim.context)

    if lane is lanes.Lane.DECISION_REVIEW:
        door = getattr(claim.context, "appeal_door_selected", None) or \
            lanes.decision_review_door(claim.context)
        return _DOOR_TO_CLAIM_TYPE.get(door or "", "supplemental")

    # A presumptive hit is more informative to a veteran than "original".
    if any(_presumptive_hits(claim).values()):
        return "presumptive"

    return _LANE_TO_CLAIM_TYPE.get(lane, "original")


def _presumptive_hits(claim: Claim) -> Dict[str, bool]:
    """condition id -> whether a presumptive rule fired, tolerating API drift."""
    try:
        results = presumptive.evaluate_presumptive(claim)
    except Exception:
        return {condition.id: False for condition in claim.conditions}

    hits: Dict[str, bool] = {condition.id: False for condition in claim.conditions}
    for item in results or []:
        condition_id = getattr(item, "condition_id", None)
        result = getattr(item, "result", None)
        matched = str(getattr(result, "value", result)).lower() in {"match", "likely", "true"}
        if condition_id in hits and matched:
            hits[condition_id] = True
    return hits


# --- stage ------------------------------------------------------------------

_STATUS_TO_STAGE = {
    ClaimStatus.DRAFT: "submitted",
    ClaimStatus.READY_FOR_VSO: "submitted",
    ClaimStatus.IN_VSO_REVIEW: "submitted",
    ClaimStatus.SUBMITTED: "development",
    ClaimStatus.DECIDED: "resolved",
}


def stage(claim: Claim) -> str:
    """Map claim status onto the four stages the frontend renders.

    The frontend's stages begin at submission, so everything before that shows
    as 'submitted'; the pre-submission detail lives on the chat screen.
    """
    if decision_helpers.has_decision(claim):
        return "resolved"

    exam_pending = any(
        "exam" in (task.name + (task.detail or "")).lower()
        for task in claim.open_tasks
    )
    if exam_pending and claim.status is ClaimStatus.SUBMITTED:
        return "exam-scheduled"

    return _STATUS_TO_STAGE.get(claim.status, "submitted")


# --- conditions -------------------------------------------------------------


def _outcome_for(condition: Condition, summary) -> tuple[str, Optional[str]]:
    """granted / denied / pending, plus the plain-language reason."""
    name = condition.name.lower()

    for granted in summary.granted:
        if name in granted.lower() or granted.lower() in name:
            return "granted", f"VA granted service connection for {granted}."
    for denied in summary.denied:
        if name in denied.lower() or denied.lower() in name:
            return "denied", (
                f"VA denied {denied}. A supplemental claim with new evidence is "
                "usually the next step."
            )
    return "pending", None


def conditions(claim: Claim) -> List[Dict[str, Any]]:
    summary = decision_helpers.decision_summary(claim)
    hits = _presumptive_hits(claim)
    out: List[Dict[str, Any]] = []

    for condition in claim.conditions:
        outcome, reason = _outcome_for(condition, summary)
        entry: Dict[str, Any] = {
            "id": condition.id,
            "name": condition.name,
            "outcome": outcome,
            "computedEligible": hits.get(condition.id, False),
        }
        if reason:
            entry["reason"] = reason
        if outcome == "granted" and summary.combined_rating is not None:
            entry["rating"] = summary.combined_rating
        out.append(entry)
    return out


# --- needs attention --------------------------------------------------------

_ACTION_FOR_EVIDENCE = {
    "nexus letter": "message-vso",
    "buddy statement": "message-vso",
    "personal statement": "message-vso",
}


def needs_attention(claim: Claim) -> List[Dict[str, str]]:
    """Required checklist gaps, as actions the veteran can actually take."""
    items: List[Dict[str, str]] = []

    for index, item in enumerate(evidence_rules.missing_evidence(claim)):
        if not item.required:
            continue

        label = item.label.lower()
        action = next(
            (value for key, value in _ACTION_FOR_EVIDENCE.items() if key in label),
            "upload-document",
        )
        scope = f" for {item.condition_name}" if item.condition_name else ""
        items.append({
            "id": f"attn-{index}",
            "title": f"{item.label}{scope}",
            "detail": item.why[0].upper() + item.why[1:] + ".",
            "action": action,
            "actionLabel": "Message my VSO" if action == "message-vso" else "Upload",
        })
    return items


# --- upcoming ---------------------------------------------------------------


def upcoming(claim: Claim) -> List[Dict[str, str]]:
    """Deadline clocks, as dated items. Expired ones are dropped."""
    items: List[Dict[str, str]] = []
    for index, deadline in enumerate(lanes.deadlines(claim)):
        if deadline.expired:
            continue
        items.append({
            "id": f"due-{index}",
            "title": deadline.label,
            "detail": deadline.detail,
            "date": deadline.due.isoformat(),
        })
    return items


# --- updates ----------------------------------------------------------------


def updates(claim: Claim) -> List[Dict[str, str]]:
    """Status history and case messages, newest last, as one feed."""
    entries: List[Dict[str, str]] = []

    for index, event in enumerate(claim.status_history):
        if not event.note:
            continue
        entries.append({
            "id": f"status-{index}",
            "source": "vso",
            "text": event.note,
            "timestamp": event.recorded_on.isoformat(),
        })

    for index, message in enumerate(_case_messages(claim)):
        entries.append({
            "id": f"msg-{index}",
            "source": "vso" if message.get("author") != "veteran" else "veteran",
            "text": message.get("body", ""),
            "timestamp": str(message.get("created_at", date.today().isoformat()))[:10],
        })

    return entries


def _case_messages(claim: Claim) -> List[Dict[str, Any]]:
    try:
        from src import collaboration
        return [
            {"author": m.author, "body": m.body, "created_at": m.created_at}
            for m in collaboration.list_messages(claim.id)
        ]
    except Exception:
        return []


# --- vso --------------------------------------------------------------------


def vso(claim: Claim) -> Dict[str, Any]:
    """The reviewing VSO. Empty strings until a real one is on the case.

    We deliberately do not invent an accreditation number: the frontend shows
    whatever is here directly to the veteran.
    """
    reviewer = claim.reviews[-1].reviewer_name if claim.reviews else ""
    return {
        "name": reviewer,
        "organization": "",
        "accreditationId": "",
        "contactMethods": [{"type": "message", "value": "In-app message"}],
    }


# --- decision ---------------------------------------------------------------


def combine_ratings(ratings: List[int]) -> tuple[int, List[Dict[str, str]]]:
    """VA combined-rating maths, with the steps shown.

    VA does not add ratings. Each one applies to the whole person that is still
    'efficient' after the previous ones, and the total is rounded to the
    nearest 10 at the end.
    """
    steps: List[Dict[str, str]] = []
    remaining = 100.0
    combined = 0.0

    for rating in sorted(ratings, reverse=True):
        taken = remaining * (rating / 100.0)
        combined += taken
        steps.append({
            "label": f"{rating}% of the remaining {remaining:.0f}% ability",
            "value": f"{taken:.1f}% (running total {combined:.1f}%)",
        })
        remaining -= taken

    rounded = int(round(combined / 10.0) * 10)
    if ratings:
        steps.append({
            "label": f"Rounded to the nearest 10%",
            "value": f"{rounded}%",
        })
    return rounded, steps


def decision(claim: Claim) -> Optional[Dict[str, Any]]:
    summary = decision_helpers.decision_summary(claim)
    if not summary.has_decision:
        return None

    granted = [c for c in conditions(claim) if c["outcome"] == "granted"]
    ratings = [c["rating"] for c in granted if c.get("rating") is not None]
    computed, steps = combine_ratings(ratings)
    combined = summary.combined_rating if summary.combined_rating is not None else computed

    unlocks: List[str] = []
    if combined >= 30:
        unlocks.append("Extra monthly payment for dependents (VA Form 21-686c)")
    if combined >= 50:
        unlocks.append("No copays for VA health care")
    if combined >= 100:
        unlocks.append("Possible property tax and education benefits, depending on your state")

    return {
        "combinedRating": combined,
        # Left at 0 on purpose: VA's compensation rate table changes annually
        # and is not bundled here. The UI hides the dollar line when this is 0
        # rather than showing a figure we cannot stand behind.
        "monthlyAmount": 0,
        "conditions": granted or conditions(claim),
        "unlocks": unlocks,
        "mathSteps": steps,
    }


# --- the whole claim --------------------------------------------------------


def claim_to_app_claim(claim: Claim) -> Dict[str, Any]:
    """The frontend's Claim object, built entirely from existing state."""
    ClaimIntake(claim).evaluate_readiness()

    payload: Dict[str, Any] = {
        "routingId": claim.id,
        "claimType": claim_type(claim),
        "stage": stage(claim),
        "vso": vso(claim),
        "conditions": conditions(claim),
        "needsAttention": needs_attention(claim),
        "upcoming": upcoming(claim),
        "updates": updates(claim),
    }

    decided = decision(claim)
    if decided:
        payload["decision"] = decided
    return payload


# --- chat -------------------------------------------------------------------

_SLOT_TO_DOC_TYPE = {
    "identity": "dd214",
    "records": "medical-record",
}


def _message_id(session, suffix: str) -> str:
    return f"{session.claim.id}-{len(session.transcript)}-{suffix}"


def chat_messages(session, since: int = 0) -> List[Dict[str, Any]]:
    """Transcript entries from `since` onward, as frontend ChatMessage objects.

    The frontend renders a union of message types; a plain bot line becomes
    ai-text, and a bot line that carries an extracted-field receipt becomes a
    confirmation-card so the veteran can check what we read off their document.
    """
    from src import intake_chat

    out: List[Dict[str, Any]] = []

    for index, message in enumerate(session.transcript[since:], start=since):
        if message.role == "veteran":
            out.append({
                "id": f"{session.claim.id}-{index}-v",
                "type": "veteran-text",
                "text": message.text,
            })
            continue

        out.append({
            "id": f"{session.claim.id}-{index}-a",
            "type": "ai-text",
            "text": message.text,
        })

        fields = _confirmation_fields(message.detail)
        if fields:
            out.append({
                "id": f"{session.claim.id}-{index}-c",
                "type": "confirmation-card",
                "fields": fields,
            })

    question = intake_chat.next_question(session)
    if question.slot is intake_chat.Slot.DONE:
        claim_conditions = conditions(session.claim)
        if claim_conditions:
            out.append({
                "id": f"{session.claim.id}-eligibility",
                "type": "eligibility-card",
                "conditions": claim_conditions,
            })
    elif question.accepts_upload:
        out.append({
            "id": f"{session.claim.id}-{question.slot.value}-u",
            "type": "document-upload",
            "prompt": question.doc_tip or question.help_text or question.text,
            "documentType": _SLOT_TO_DOC_TYPE.get(question.slot.value, "other"),
        })

    return out


def _confirmation_fields(detail: str) -> List[Dict[str, str]]:
    """Turn a bullet receipt ('• Name: Dana Reyes') into label/value pairs."""
    fields: List[Dict[str, str]] = []
    for line in (detail or "").splitlines():
        line = line.strip().lstrip("•").strip()
        if not line or ":" not in line:
            continue
        label, _, value = line.partition(":")
        label, value = label.strip(), value.strip()
        if label and value:
            fields.append({"label": label, "value": value})
    return fields
