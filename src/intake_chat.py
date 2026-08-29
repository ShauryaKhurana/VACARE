"""The conversational intake.

The design rule: never ask for anything that can be derived, extracted from a
document, or inferred from something already said. What survives that rule is a
short list of slots, and this module walks them in order.

Slots, in order:
  1. STORY     - one open question; Gemini extracts conditions, the event, flags
  2. IDENTITY  - a DD-214 upload, or four short questions if there is no DD-214
  3. RATING    - "none" or a percentage; this alone implies has_filed_before
  4. INTENT    - only asked when a rating exists (increase/new/secondary/appeal)
  5. DECISION  - only asked when the intent is to challenge a decision
  6. RECORDS   - optional uploads that replace evidence checkboxes

Short answers are parsed deterministically so the flow still works with no API
key; only the story and document steps need Gemini.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import date
from enum import Enum
from typing import Any, Dict, List, Optional

from src import extract, gemini
from src.claim_intake import ClaimIntake
from src.gemini import Attachment  # re-exported for the web layer
from src.models import (
    Branch,
    Claim,
    DischargeType,
    EvidenceType,
    Veteran,
)

# Documents we can recognise, mapped onto the evidence types the rules use.
DOC_TO_EVIDENCE = {
    "dd214": EvidenceType.DD214,
    "service_treatment_record": EvidenceType.SERVICE_TREATMENT_RECORD,
    "medical_record": EvidenceType.CURRENT_MEDICAL_RECORD,
    "nexus_letter": EvidenceType.NEXUS_LETTER,
    "buddy_statement": EvidenceType.BUDDY_STATEMENT,
}


class Slot(str, Enum):
    STORY = "story"
    IDENTITY = "identity"
    NAME = "name"
    DOB = "dob"
    SERVICE_DATES = "service_dates"
    RATING = "rating"
    INTENT = "intent"
    DECISION = "decision"
    RECORDS = "records"
    DONE = "done"


@dataclass
class Message:
    role: str          # "bot" or "veteran"
    text: str
    detail: str = ""   # what the bot extracted, shown as a receipt


@dataclass
class Question:
    slot: Slot
    text: str
    help_text: str = ""
    accepts_upload: bool = False
    options: List[str] = field(default_factory=list)


@dataclass
class Session:
    """One veteran's conversation, wrapped around a Claim."""

    claim: Claim
    transcript: List[Message] = field(default_factory=list)
    story_done: bool = False
    identity_done: bool = False
    rating_done: bool = False
    intent_done: bool = False
    decision_done: bool = False
    records_done: bool = False

    def say(self, role: str, text: str, detail: str = "") -> None:
        self.transcript.append(Message(role=role, text=text, detail=detail))


def new_session() -> Session:
    """Start with a placeholder veteran; real details arrive from the DD-214 or the name slot."""
    session_claim = ClaimIntake().start_claim(
        Veteran(first_name="Unknown", last_name="Veteran")
    )
    return Session(claim=session_claim)


def _identity_known(claim: Claim) -> bool:
    veteran = claim.veteran
    return (
        veteran.first_name != "Unknown"
        and veteran.dob is not None
        and bool(veteran.service_start or claim.context.separation_date or veteran.service_end)
    )


# --- the question the veteran sees next ------------------------------------


def next_question(session: Session) -> Question:
    claim = session.claim
    context = claim.context

    if not session.story_done:
        return Question(
            slot=Slot.STORY,
            text="In your own words - what happened to you, and what's bothering you now?",
            help_text=(
                "Write it however it comes out. One paragraph is plenty. You can also drop in "
                "a photo or PDF of anything relevant."
            ),
            accepts_upload=True,
        )

    if not session.identity_done:
        if not _identity_known(claim):
            return Question(
                slot=Slot.IDENTITY,
                text="Upload your DD-214 and I'll read your name, dates, and discharge off it.",
                help_text="No DD-214 handy? Type 'skip' and I'll ask four short questions instead.",
                accepts_upload=True,
            )
        session.identity_done = True

    if not _identity_known(claim) and session.identity_done:
        veteran = claim.veteran
        if veteran.first_name == "Unknown":
            return Question(slot=Slot.NAME, text="What's your full name?")
        if veteran.dob is None:
            return Question(slot=Slot.DOB, text="Date of birth? (YYYY-MM-DD)")
        return Question(
            slot=Slot.SERVICE_DATES,
            text="When did you enter and leave active service?",
            help_text="Two dates, e.g. 2007-06-01 to 2013-08-30. If you're still in, give your "
                      "separation date and say 'still serving'.",
        )

    if not session.rating_done:
        return Question(
            slot=Slot.RATING,
            text="Do you have a VA disability rating right now?",
            help_text="Give the combined percentage, or say 'none'.",
            options=["none", "10%", "30%", "50%", "70%", "100%"],
        )

    if context.has_existing_rating and not session.intent_done:
        return Question(
            slot=Slot.INTENT,
            text="What brings you here?",
            options=[
                "A condition I'm rated for got worse",
                "I have a new condition",
                "A new condition caused by one I'm rated for",
                "I disagree with a VA decision",
            ],
        )

    if context.disagrees_with_decision and not session.decision_done:
        return Question(
            slot=Slot.DECISION,
            text="What's the date on the decision letter, and do you have evidence VA hasn't seen?",
            help_text="Upload the decision letter and I'll read the date off it. "
                      "Mention 'new evidence' if you have some.",
            accepts_upload=True,
        )

    if not session.records_done:
        return Question(
            slot=Slot.RECORDS,
            text="Last step: upload any medical records, and I'll pull the diagnoses out.",
            help_text="Upload as many as you like, then type 'done'.",
            accepts_upload=True,
        )

    return Question(slot=Slot.DONE, text="That's everything I need.")


# --- applying an answer -----------------------------------------------------


PERCENT = re.compile(r"(\d{1,3})\s*%?")
ISO_DATE = re.compile(r"(\d{4}-\d{1,2}-\d{1,2})")


def _parse_date(text: str) -> Optional[date]:
    match = ISO_DATE.search(text)
    if match:
        try:
            return date.fromisoformat(match.group(1))
        except ValueError:
            return None
    return extract.parse_date(text.strip())


def apply_answer(session: Session, text: str) -> str:
    """Handle a typed answer for the current slot. Returns the bot's receipt."""
    question = next_question(session)
    claim = session.claim
    context = claim.context
    answer = text.strip()
    session.say("veteran", answer)

    if question.slot == Slot.STORY:
        return _apply_story(session, answer)

    if question.slot == Slot.IDENTITY:
        session.identity_done = True
        return "No problem - a few quick questions instead."

    if question.slot == Slot.NAME:
        parts = answer.split()
        if len(parts) < 2:
            return "I need a first and last name."
        if len(parts) > 5 or any(character.isdigit() for character in answer):
            # Guards against a sentence landing in the name slot.
            return "That doesn't look like a name. Just your first and last name, please."
        claim.veteran.first_name, claim.veteran.last_name = parts[0], parts[-1]
        return f"Got it, {claim.veteran.first_name}."

    if question.slot == Slot.DOB:
        parsed = _parse_date(answer)
        if not parsed:
            return "I couldn't read that as a date. Try YYYY-MM-DD."
        claim.veteran.dob = parsed
        return f"Date of birth {parsed}."

    if question.slot == Slot.SERVICE_DATES:
        dates = [date.fromisoformat(d) for d in ISO_DATE.findall(answer)
                 if _safe_iso(d)]
        if not dates:
            return "I need at least one date, like 2007-06-01."
        claim.veteran.service_start = min(dates)
        end = max(dates) if len(dates) > 1 else None
        if "still" in answer.lower() or (end and end > date.today()):
            context.still_serving = True
            context.separation_date = end
        elif end:
            claim.veteran.service_end = end
            context.separation_date = end
        return f"Service {claim.veteran.service_start} to {end or 'ongoing'}."

    if question.slot == Slot.RATING:
        session.rating_done = True
        if "none" in answer.lower() or "no" == answer.lower().strip():
            context.has_existing_rating = False
            return "No rating yet - this is a first claim."
        match = PERCENT.search(answer)
        if match:
            percent = int(match.group(1))
            context.combined_rating = min(percent, 100)
            context.has_existing_rating = percent > 0
            context.has_filed_before = percent > 0
            return f"Rated at {percent}%. That means you've filed before."
        context.has_existing_rating = False
        return "I'll treat that as no current rating."

    if question.slot == Slot.INTENT:
        session.intent_done = True
        lowered = answer.lower()
        if "worse" in lowered:
            context.claiming_worse = True
            return "A claim for increase."
        if "caused" in lowered or "secondary" in lowered:
            context.caused_by_rated_condition = True
            context.claiming_new = True
            return "A secondary claim - the nexus letter is the important part here."
        if "disagree" in lowered or "decision" in lowered or "denied" in lowered:
            context.disagrees_with_decision = True
            return "A decision review. I need the date on that letter."
        context.claiming_new = True
        return "A claim for a new condition."

    if question.slot == Slot.DECISION:
        parsed = _parse_date(answer)
        if parsed:
            context.decision_date = parsed
        context.has_new_evidence = "new evidence" in answer.lower() or "yes" in answer.lower()
        context.wants_judge = "judge" in answer.lower() or "board" in answer.lower()
        if context.decision_date:
            session.decision_done = True
            return f"Decision dated {context.decision_date}. That starts several clocks."
        return "I still need the date on the decision letter (YYYY-MM-DD)."

    if question.slot == Slot.RECORDS:
        session.records_done = True
        return "Done. Here's what I have."

    return "Thanks."


def _safe_iso(text: str) -> bool:
    try:
        date.fromisoformat(text)
        return True
    except ValueError:
        return False


def _apply_story(session: Session, story: str) -> str:
    """The one heavy step: turn a paragraph into structured claim facts."""
    session.story_done = True
    claim = session.claim

    if not gemini.available():
        # Without a key we cannot parse prose, so keep the text and move on
        # rather than losing what the veteran wrote.
        claim.summary = story
        return ("Saved your account. (No AI key configured, so I couldn't break it into "
                "conditions automatically - a VSO will do that by hand.)")

    payload = extract.extract_from_story(story)
    claim.summary = story
    session_intake = ClaimIntake(claim)

    event_fields = extract.event_from(payload)
    event_id = None
    if event_fields:
        event_id = session_intake.add_service_event(**event_fields).id

    added: List[str] = []
    for fields in extract.conditions_from(payload):
        session_intake.add_condition(service_event_id=event_id, **fields)
        added.append(fields["name"])

    context = claim.context
    context.private_treatment = bool(payload.get("private_treatment"))
    context.unemployable = bool(payload.get("unemployable"))
    context.has_dependents = bool(payload.get("has_dependents"))
    context.has_witness = bool(payload.get("has_witness"))

    if not added:
        session.story_done = False
        return ("I couldn't pick out a specific condition there. Try naming what hurts and "
                "how it affects you day to day.")

    receipt = f"Got {len(added)}: {', '.join(added)}."
    if event_fields:
        receipt += f" Linked to '{event_fields['title']}'."
    return receipt


def apply_document(session: Session, attachment: Attachment) -> str:
    """Handle an uploaded file for whatever slot we're on."""
    session.say("veteran", f"[uploaded {attachment.filename}]")
    from src.document_ingest import ingest_document

    result = ingest_document(session.claim, attachment.filename, attachment.data)
    if result.document_type == "dd214":
        session.identity_done = True
    if session.claim.context.decision_date:
        session.decision_done = True
    return result.message


def _merge_veteran(claim: Claim, fields: Dict[str, Any]) -> List[str]:
    """Apply extracted identity fields, skipping anything already known."""
    veteran = claim.veteran
    applied: List[str] = []

    if fields.get("first_name") and veteran.first_name == "Unknown":
        veteran.first_name = fields["first_name"]
        veteran.last_name = fields.get("last_name", veteran.last_name)
        applied.append("name")
    if fields.get("dob") and veteran.dob is None:
        veteran.dob = fields["dob"]
        applied.append("date of birth")
    if fields.get("service_start") and not veteran.service_start:
        veteran.service_start = fields["service_start"]
        applied.append("service start")
    if fields.get("service_end") and not veteran.service_end:
        veteran.service_end = fields["service_end"]
        claim.context.separation_date = fields["service_end"]
        applied.append("separation date")
    if fields.get("branch"):
        try:
            veteran.branch = Branch(fields["branch"])
            applied.append("branch")
        except ValueError:
            pass
    if fields.get("discharge_type"):
        try:
            veteran.discharge_type = DischargeType(fields["discharge_type"])
            applied.append("discharge")
        except ValueError:
            pass
    return applied
