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

from src import extract, gemini, itf as itf_helpers, poa as poa_helpers
from src.claim_intake import ClaimIntake
from src.gemini import Attachment  # re-exported for the web layer
from src.models import (
    Branch,
    Claim,
    ClaimStatus,
    DischargeType,
    EvidenceType,
    MailingAddress,
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
    CONTACT = "contact"
    ADDRESS = "address"
    SSN = "ssn"
    RATING = "rating"
    INTENT = "intent"
    DECISION = "decision"
    RECORDS = "records"
    ITF = "itf"
    POA = "poa"
    APPEAL_DISAGREE = "appeal_disagree"
    APPEAL_DOOR = "appeal_door"
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
    doc_tip: str = ""
    accepts_upload: bool = False
    options: List[str] = field(default_factory=list)


@dataclass
class Session:
    """One veteran's conversation, wrapped around a Claim."""

    claim: Claim
    transcript: List[Message] = field(default_factory=list)
    address_done: bool = False
    ssn_done: bool = False
    story_done: bool = False
    identity_done: bool = False
    contact_done: bool = False
    rating_done: bool = False
    intent_done: bool = False
    decision_done: bool = False
    records_done: bool = False
    itf_done: bool = False
    poa_done: bool = False
    appeal_mode: bool = False
    appeal_disagree_done: bool = False
    appeal_door_done: bool = False

    def say(self, role: str, text: str, detail: str = "") -> None:
        self.transcript.append(Message(role=role, text=text, detail=detail))


def new_session(claim: Optional[Claim] = None) -> Session:
    """Start with a placeholder veteran; real details arrive from the DD-214 or the name slot."""
    if claim is None:
        claim = ClaimIntake().start_claim(
            Veteran(first_name="Unknown", last_name="Veteran")
        )
    return Session(claim=claim)


_SESSION_FLAGS = (
    "story_done",
    "identity_done",
    "contact_done",
    "rating_done",
    "intent_done",
    "decision_done",
    "records_done",
    "itf_done",
    "poa_done",
    "appeal_mode",
    "appeal_disagree_done",
    "appeal_door_done",
)


def session_to_dict(session: Session) -> dict:
    return {
        "transcript": [
            {"role": m.role, "text": m.text, "detail": m.detail}
            for m in session.transcript
        ],
        **{flag: getattr(session, flag) for flag in _SESSION_FLAGS},
    }


def session_from_saved(claim: Claim, data: dict) -> Session:
    session = Session(claim=claim)
    for flag in _SESSION_FLAGS:
        setattr(session, flag, bool(data.get(flag, False)))
    for item in data.get("transcript", []):
        session.transcript.append(
            Message(
                role=item.get("role", "bot"),
                text=item.get("text", ""),
                detail=item.get("detail", ""),
            )
        )
    return session


def sync_session_from_claim(session: Session) -> None:
    """Align chat slot flags with saved claim data when resuming without a transcript."""
    claim = session.claim
    context = claim.context

    if claim.conditions:
        session.story_done = True
    if _identity_known(claim):
        session.identity_done = True
    if _contact_known(claim):
        session.contact_done = True

    if (
        context.has_existing_rating
        or context.claiming_worse
        or context.claiming_new
        or context.caused_by_rated_condition
        or context.disagrees_with_decision
        or (claim.conditions and not context.has_existing_rating)
    ):
        session.rating_done = True

    if (
        context.claiming_worse
        or context.claiming_new
        or context.caused_by_rated_condition
        or context.disagrees_with_decision
        or not context.has_existing_rating
    ):
        session.intent_done = True

    if context.disagrees_with_decision and context.decision_date:
        session.decision_done = True

    if claim.evidence or session.story_done:
        session.records_done = True

    if context.itf_filed_on or not itf_helpers.itf_applies(claim):
        session.itf_done = True
    if context.poa_filed_on or context.filing_on_own:
        session.poa_done = True

    if claim.status in {
        ClaimStatus.READY_FOR_VSO,
        ClaimStatus.IN_VSO_REVIEW,
        ClaimStatus.SUBMITTED,
        ClaimStatus.DECIDED,
    }:
        session.story_done = True
        session.identity_done = True
        session.contact_done = True
        session.rating_done = True
        session.intent_done = True
        session.decision_done = True
        session.records_done = True
        session.itf_done = True
        session.poa_done = True

    if context.appeal_door_selected:
        session.appeal_disagree_done = True
        session.appeal_door_done = True


def load_session_for_claim(
    claim: Claim,
    saved: Optional[dict],
    *,
    appeal_mode: bool = False,
) -> Session:
    if saved:
        session = session_from_saved(claim, saved)
    else:
        session = new_session(claim)
        sync_session_from_claim(session)
    if appeal_mode:
        start_appeal_mode(session)
    return session


def _identity_known(claim: Claim) -> bool:
    veteran = claim.veteran
    return (
        veteran.first_name != "Unknown"
        and veteran.dob is not None
        and bool(veteran.service_start or claim.context.separation_date or veteran.service_end)
    )


def _contact_known(claim: Claim) -> bool:
    veteran = claim.veteran
    return bool(veteran.phone or veteran.email)


def progress(session: Session) -> dict:
    """Simple progress for the chat UI — no jargon."""
    question = next_question(session)
    steps = [
        ("Tell us what's wrong", Slot.STORY),
        ("Prove you served", Slot.IDENTITY),
        ("Your contact info", Slot.CONTACT),
        ("VA rating check", Slot.RATING),
        ("Medical records", Slot.RECORDS),
        ("Save your date with VA", Slot.ITF),
        ("Appoint your VSO", Slot.POA),
        ("Ready to file", Slot.DONE),
    ]
    slot = question.slot
    if slot in {Slot.NAME, Slot.DOB, Slot.SERVICE_DATES}:
        slot = Slot.IDENTITY
    if slot in {Slot.INTENT, Slot.DECISION}:
        slot = Slot.RATING
    index = next((i for i, (_, s) in enumerate(steps) if s == slot), len(steps) - 1)
    return {
        "step": index + 1,
        "total": len(steps),
        "label": steps[index][0],
        "percent": int((index / max(len(steps) - 1, 1)) * 100),
    }


# --- the question the veteran sees next ------------------------------------


def start_appeal_mode(session: Session) -> None:
    """Post-decision appeal guide — skips intake, asks disagree + door only."""
    session.appeal_mode = True
    session.story_done = True
    session.identity_done = True
    session.contact_done = True
    session.rating_done = True
    session.intent_done = True
    session.decision_done = True
    session.records_done = True
    session.itf_done = True
    session.poa_done = True


def next_appeal_question(session: Session) -> Question:
    from src import appeal as appeal_helpers

    claim = session.claim
    if not appeal_helpers.appeal_applies(claim):
        return Question(
            slot=Slot.DONE,
            text="We need a decision date on a modern decision before appeal options apply.",
        )

    if not session.appeal_disagree_done:
        return Question(
            slot=Slot.APPEAL_DISAGREE,
            text="Does this decision match what you expected?",
            help_text="If the VA got it wrong, we'll help you pick a review path.",
            options=["No — I want to challenge it", "Yes — I'm good with it"],
        )

    if not claim.context.disagrees_with_decision:
        return Question(slot=Slot.DONE, text="Glad it worked out. You're all set.")

    if not session.appeal_door_done and not claim.context.appeal_door_selected:
        options = [opt.picker_label for opt in appeal_helpers.picker_options()]
        return Question(
            slot=Slot.APPEAL_DOOR,
            text="Which path sounds most like your situation?",
            help_text="Each has a one-year deadline from your decision date.",
            options=options,
        )

    session.appeal_door_done = True
    door = claim.context.appeal_door_selected
    copy = appeal_helpers.DOOR_COPY.get(door or "", {})
    title = copy.get("title", "Review path")
    return Question(
        slot=Slot.DONE,
        text=f"Saved — {title}. Check your summary for deadlines and a filing checklist.",
    )


def next_question(session: Session) -> Question:
    if session.appeal_mode:
        return next_appeal_question(session)

    claim = session.claim
    context = claim.context

    if not session.story_done:
        return Question(
            slot=Slot.STORY,
            text="What hurts or bothers you — and what happened during your service?",
            help_text="Just talk like you're telling a friend. One or two sentences is fine.",
            accepts_upload=True,
            doc_tip=(
                "Tip: You can upload a photo or PDF here if you already have paperwork "
                "(medical notes, DD-214, etc.). We'll read it for you."
            ),
        )

    if not session.identity_done:
        if not _identity_known(claim):
            return Question(
                slot=Slot.IDENTITY,
                text="Upload your DD-214 (discharge paper).",
                help_text="Don't have it? Type skip and we'll ask a few quick questions.",
                accepts_upload=True,
                doc_tip=(
                    "What's a DD-214? It's the paper you got when you left the military. "
                    "It shows your name, service dates, and discharge type. "
                    "You can often get a free copy from milConnect or your state VA office."
                ),
            )
        session.identity_done = True

    if not _identity_known(claim) and session.identity_done:
        veteran = claim.veteran
        if veteran.first_name in {"Unknown", "New"}:
            return Question(slot=Slot.NAME, text="What's your full name?")
        if veteran.dob is None:
            return Question(
                slot=Slot.DOB,
                text="What's your date of birth?",
                help_text="Example: 1988-03-12",
            )
        return Question(
            slot=Slot.SERVICE_DATES,
            text="When did you start and finish active duty?",
            help_text="Example: 2007-06-01 to 2013-08-30. Still serving? Say still serving.",
        )

    if not session.contact_done:
        if _contact_known(claim):
            session.contact_done = True
        else:
            return Question(
                slot=Slot.CONTACT,
                text="What's the best phone number and email for you?",
                help_text="Example: 555-123-4567, you@email.com",
            )

    if not session.address_done:
        if claim.veteran.address.is_complete:
            session.address_done = True
        else:
            return Question(
                slot=Slot.ADDRESS,
                text="What's your mailing address? The VA sends letters there.",
                help_text="Street, city, state and ZIP. Example: "
                          "3114 Elm Street, Tucson, AZ 85701",
            )

    if not session.ssn_done:
        if claim.veteran.ssn:
            session.ssn_done = True
        else:
            return Question(
                slot=Slot.SSN,
                text="Last identity question: your Social Security number.",
                help_text="The VA form asks for it on every page. "
                          "Choose 'Skip' if you'd rather write it in yourself.",
                options=["Skip — I'll write it in myself"],
            )

    if not session.rating_done:
        return Question(
            slot=Slot.RATING,
            text="Does the VA pay you for any disability right now?",
            help_text="Pick one, or type your combined rating.",
            options=["No, this is my first claim", "10%", "30%", "50%", "70%", "100%"],
        )

    if context.has_existing_rating and not session.intent_done:
        return Question(
            slot=Slot.INTENT,
            text="What are you trying to do?",
            options=[
                "Something I have got worse",
                "Something new",
                "Something caused by what I am already rated for",
                "I disagree with a VA decision",
            ],
        )

    if context.disagrees_with_decision and not session.decision_done:
        return Question(
            slot=Slot.DECISION,
            text="Upload your VA decision letter (or tell us the date on it).",
            help_text="We'll read the decision date off the letter if you upload it.",
            accepts_upload=True,
            doc_tip=(
                "What's a decision letter? It's the letter from the VA saying yes or no "
                "to your claim and what rating you got. You need the date on it for appeals."
            ),
        )

    if not session.records_done:
        return Question(
            slot=Slot.RECORDS,
            text=(
                "Upload any doctor or VA medical records you have."
                if not claim.evidence else
                f"Anything else to add? I've read {len(claim.evidence)} document"
                f"{'s' if len(claim.evidence) != 1 else ''} so far."
            ),
            help_text="Upload one or more files, then tap Done when finished.",
            accepts_upload=True,
            doc_tip=(
                "What counts? Clinic visit notes, audiology/hearing tests, VA hospital "
                "summaries, or private doctor letters that list your diagnoses. "
                "We'll pull out conditions and dates so you don't have to re-type them."
            ),
            options=["Done uploading", "Skip for now"],
        )

    if not session.itf_done:
        if claim.context.itf_filed_on or not itf_helpers.itf_applies(claim):
            session.itf_done = True
        else:
            return Question(
                slot=Slot.ITF,
                text=(
                    "Want to save today's date with the VA? "
                    "It's a free one-page form that says you're planning to claim — "
                    "so if you're approved later, back pay can start from today."
                ),
                help_text="Already filed one? Type the date (example: 2026-06-01).",
                options=["Yes — save today's date", "Skip for now"],
            )

    if not session.poa_done:
        if claim.context.poa_filed_on or claim.context.filing_on_own:
            session.poa_done = True
        else:
            return Question(
                slot=Slot.POA,
                text="Will a VSO help you file this claim?",
                help_text="Already appointed one? Type the date (example: 2026-06-01).",
                options=[
                    "Yes — appoint a VSO (use today)",
                    "I'm filing on my own",
                    "Skip for now",
                ],
            )

    return Question(slot=Slot.DONE, text="You're all set!")


# --- applying an answer -----------------------------------------------------


PERCENT = re.compile(r"(\d{1,3})\s*%?")
ISO_DATE = re.compile(r"(\d{4}-\d{1,2}-\d{1,2})")
EMAIL = re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+")
PHONE = re.compile(r"\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}")


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

    if question.slot == Slot.CONTACT:
        email_match = EMAIL.search(answer)
        phone_match = PHONE.search(answer)
        if email_match:
            claim.veteran.email = email_match.group(0)
        if phone_match:
            claim.veteran.phone = phone_match.group(0)
        if claim.veteran.phone or claim.veteran.email:
            session.contact_done = True
            parts = []
            if claim.veteran.phone:
                parts.append(f"phone {claim.veteran.phone}")
            if claim.veteran.email:
                parts.append(f"email {claim.veteran.email}")
            return "Saved your " + " and ".join(parts) + "."
        return "I need at least a phone number or email. Example: 555-123-4567, you@email.com"

    if question.slot == Slot.ADDRESS:
        parsed = _parse_address(answer)
        if parsed is None:
            return ("I need a street, city, state and ZIP. Example: "
                    "3114 Elm Street, Tucson, AZ 85701")
        claim.veteran.address = parsed
        session.address_done = True
        return f"Saved {parsed.one_line()}."

    if question.slot == Slot.SSN:
        if "skip" in answer.lower():
            session.ssn_done = True
            return "No problem — that box is left for you to write in."
        digits = "".join(character for character in answer if character.isdigit())
        if len(digits) != 9:
            return "A Social Security number has 9 digits. Or choose Skip."
        claim.veteran.ssn = digits
        session.ssn_done = True
        return f"Saved. It'll show on the form as xxx-xx-{digits[5:]}."

    if question.slot == Slot.RATING:
        session.rating_done = True
        lowered = answer.lower()
        if "first claim" in lowered or "none" in lowered or lowered.strip() in {"no", "n"}:
            context.has_existing_rating = False
            return "Got it — first claim."
        match = PERCENT.search(answer)
        if match:
            percent = int(match.group(1))
            context.combined_rating = min(percent, 100)
            context.has_existing_rating = percent > 0
            context.has_filed_before = percent > 0
            return f"Got it — you're rated {percent}%."
        context.has_existing_rating = False
        return "Got it — I'll treat this as a first claim."

    if question.slot == Slot.INTENT:
        session.intent_done = True
        lowered = answer.lower()
        if "worse" in lowered:
            context.claiming_worse = True
            return "Okay — claim for increase."
        if "caused" in lowered or "secondary" in lowered or "already rated" in lowered:
            context.caused_by_rated_condition = True
            context.claiming_new = True
            return "Okay — secondary claim."
        if "disagree" in lowered or "decision" in lowered:
            context.disagrees_with_decision = True
            return "Okay — we'll need your decision letter."
        context.claiming_new = True
        return "Okay — new condition claim."

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
        lowered = answer.lower().strip()
        skipping = "skip" in lowered or "later" in lowered
        # Anything that plainly means "nothing more" finishes this step. The
        # veteran should not have to guess a magic word to move on, and on a
        # client with no buttons typing is the only way through.
        finished = (
            skipping
            or "done" in lowered
            or "no more" in lowered
            or "nothing" in lowered
            or "that's all" in lowered
            or "thats all" in lowered
            or "that's everything" in lowered
            or "thats everything" in lowered
            or "finished" in lowered
            or "all set" in lowered
            or "next" in lowered
            or "continue" in lowered
            or lowered in {"no", "nope", "n", "none", "no thanks", "ready"}
        )
        if finished:
            session.records_done = True
            if skipping:
                return "No problem — you can add records later."
            return "Great — let's wrap up."
        return (
            "Upload a file if you have one. If you're finished, just say "
            "\"done\" and we'll move on."
        )

    if question.slot == Slot.ITF:
        lowered = answer.lower()
        if "skip" in lowered:
            session.itf_done = True
            return "No problem — you can save a start date anytime from your summary page."
        if "yes" in lowered or "save" in lowered or "today" in lowered or "lock" in lowered:
            claim.context.itf_filed_on = date.today()
            session.itf_done = True
            return (
                f"Saved {date.today()} with the VA. If you're approved later, "
                "back pay could start from that day."
            )
        parsed = _parse_date(answer)
        if parsed:
            claim.context.itf_filed_on = parsed
            session.itf_done = True
            return (
                f"Saved {parsed} as your start date with the VA. If you're approved later, "
                "back pay could begin from that day."
            )
        session.itf_done = True
        return "Got it — you can save a start date later on your summary page."

    if question.slot == Slot.POA:
        lowered = answer.lower()
        if "skip" in lowered:
            session.poa_done = True
            return "No problem — you can appoint a VSO anytime from your summary page."
        if "on my own" in lowered or "myself" in lowered or "alone" in lowered:
            poa_helpers.mark_filing_on_own(claim)
            session.poa_done = True
            return "Got it — we'll skip the VSO appointment form."
        if "yes" in lowered or "appoint" in lowered or "today" in lowered:
            claim.context.poa_filed_on = date.today()
            claim.context.filing_on_own = False
            session.poa_done = True
            return f"Saved VSO appointment for {date.today()}."
        parsed = _parse_date(answer)
        if parsed:
            poa_helpers.record_poa(claim, parsed)
            session.poa_done = True
            return f"Saved VSO appointment dated {parsed}."
        session.poa_done = True
        return "Got it — you can update this on your summary page."

    if question.slot == Slot.APPEAL_DISAGREE:
        from src import appeal as appeal_helpers

        session.appeal_disagree_done = True
        lowered = answer.lower()
        if lowered.startswith("yes") or "good with" in lowered or "expected" in lowered:
            appeal_helpers.mark_accepts_decision(claim)
            return "Okay — no appeal path needed. Your summary has the decision on file."
        appeal_helpers.mark_disagrees(claim)
        return "Got it. Next we'll pick the review path that fits."

    if question.slot == Slot.APPEAL_DOOR:
        from src import appeal as appeal_helpers

        lowered = answer.lower()
        for form_number, copy in appeal_helpers.DOOR_COPY.items():
            if copy["picker"].lower() in lowered or copy["title"].lower() in lowered:
                appeal_helpers.select_door(claim, form_number)
                session.appeal_door_done = True
                return (
                    f"Saved {copy['title']} (Form {form_number}). "
                    "See your claim summary for deadlines and what to gather."
                )
        if "new evidence" in lowered or "supplemental" in lowered:
            appeal_helpers.select_door(claim, "20-0995")
        elif "judge" in lowered or "board" in lowered:
            appeal_helpers.select_door(claim, "10182")
        elif "senior" in lowered or "same file" in lowered or "higher" in lowered:
            appeal_helpers.select_door(claim, "20-0996")
        else:
            return "Pick one of the listed options so we save the right form."
        session.appeal_door_done = True
        door = claim.context.appeal_door_selected or ""
        copy = appeal_helpers.DOOR_COPY.get(door, {})
        return f"Saved {copy.get('title', door)}. Check your summary for next steps."

    return "Thanks."


def submit_readiness(claim: Claim) -> dict:
    """Plain checklist for the final screen."""
    veteran = claim.veteran
    missing: List[str] = []
    if not claim.conditions:
        missing.append("Tell us at least one condition you're claiming")
    if veteran.first_name in {"Unknown", "New"} or veteran.last_name in {"Case", "Veteran"}:
        missing.append("Your full name")
    if not veteran.dob:
        missing.append("Date of birth")
    if not (veteran.service_start or claim.context.separation_date):
        missing.append("Service dates")
    if not (veteran.phone or veteran.email):
        missing.append("Phone or email")
    return {
        "ready": len(missing) == 0,
        "missing": missing,
    }


STATE_ZIP = re.compile(r"\b([A-Za-z]{2})\.?\s*,?\s*(\d{5})(?:-?(\d{4}))?\s*$")


def _parse_address(text: str) -> Optional[MailingAddress]:
    """Read a one-line address. Anchored on the state and ZIP at the end,
    which is the reliable part; everything before is street then city."""
    cleaned = " ".join(text.split())
    match = STATE_ZIP.search(cleaned)
    if not match:
        return None

    state, zip5, zip4 = match.group(1).upper(), match.group(2), match.group(3)
    head = cleaned[: match.start()].strip().rstrip(",").strip()
    parts = [part.strip() for part in head.split(",") if part.strip()]
    if len(parts) < 2:
        return None

    street, city = ", ".join(parts[:-1]), parts[-1]
    try:
        return MailingAddress(
            street=street, city=city, state=state,
            zip_code=zip5 + (zip4 or ""),
        )
    except ValidationError:
        return None


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
    return _apply_story_payload(session, story, payload)


def _apply_story_payload(session: Session, story: str, payload: Dict[str, Any]) -> str:
    """Merge a story-shaped extraction payload into the claim."""
    session.story_done = True
    claim = session.claim
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
        return (
            "I couldn't pick out a specific condition there. Try naming what hurts and "
            "how it affects you day to day."
        )

    receipt = f"Got {len(added)}: {', '.join(added)}."
    if event_fields:
        receipt += f" Linked to '{event_fields['title']}'."
    return receipt


def apply_story_with_document(session: Session, story: str, attachment: Attachment) -> List[tuple]:
    """One Gemini call for story + document on the first chat turn.

    Returns a list of (message, detail) pairs for the chat transcript.
    """
    if not gemini.available():
        session.story_done = True
        session.claim.summary = story
        return [(
            "Saved your story. (No AI key configured, so I couldn't read the upload - "
            "a VSO will handle that by hand.)",
            "",
        )]

    payload = extract.extract_intake_turn(story, attachment)
    story_receipt = _apply_story_payload(session, story, payload)
    receipts: List[tuple] = [(story_receipt, "")]
    if not session.story_done:
        return receipts

    from src.document_ingest import ingest_document

    result = ingest_document(
        session.claim,
        attachment.filename,
        attachment.data,
        preloaded_payload=payload,
    )
    if result.document_type == "dd214":
        session.identity_done = True
    if session.claim.context.decision_date:
        session.decision_done = True

    if result.parsed_with_gemini:
        receipts.append((result.message, result.detail))
    return receipts


def apply_document(session: Session, attachment: Attachment):
    """Handle an uploaded file for whatever slot we're on."""
    session.say("veteran", f"[uploaded {attachment.filename}]")
    from src.document_ingest import DocumentIngestResult, ingest_document

    result = ingest_document(session.claim, attachment.filename, attachment.data)
    if result.document_type == "dd214":
        session.identity_done = True
    if session.claim.context.decision_date:
        session.decision_done = True
    return result


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
