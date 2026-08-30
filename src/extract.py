"""Turn free text and uploaded documents into structured claim facts.

This is the module that removes questions from the intake. Anything Gemini can
read off a DD-214 or a treatment record is something the veteran never has to
type. Everything returned here is treated as a *proposal*: the caller shows it
back to the veteran for confirmation rather than silently trusting it, because
an extraction error on a date is an error on an effective date.
"""

from __future__ import annotations

from datetime import date
from typing import Any, Dict, List, Optional

from src import gemini, parse_cache
from src.gemini import Attachment, GeminiError

# --- schemas ---------------------------------------------------------------

_CONDITION = {
    "type": "object",
    "properties": {
        "name": {"type": "string", "description": "Short condition name, e.g. 'Tinnitus'"},
        "current_symptoms": {"type": "string", "description": "How it affects them today, their words"},
        "diagnosis": {"type": "string"},
        "onset_date": {"type": "string", "description": "YYYY-MM-DD, or YYYY-MM-01 if only month known, else empty"},
        "started_in_service": {"type": "boolean"},
        "worsened_in_service": {"type": "boolean"},
        "currently_treated": {"type": "boolean"},
    },
    "required": ["name", "current_symptoms", "started_in_service", "worsened_in_service"],
}

STORY_SCHEMA = {
    "type": "object",
    "properties": {
        "conditions": {"type": "array", "items": _CONDITION},
        "event": {
            "type": "object",
            "properties": {
                "title": {"type": "string", "description": "Short label, e.g. 'Convoy IED blast'"},
                "description": {"type": "string"},
                "event_date": {"type": "string", "description": "YYYY-MM-DD or empty"},
                "location": {"type": "string"},
                "witnesses": {"type": "string"},
                "documented_in_service_records": {"type": "boolean"},
            },
            "required": ["title", "description"],
        },
        "private_treatment": {"type": "boolean", "description": "Mentions non-VA/civilian doctors"},
        "unemployable": {"type": "boolean", "description": "Says they cannot work because of this"},
        "has_dependents": {"type": "boolean", "description": "Mentions spouse, children, dependent parent"},
        "has_witness": {"type": "boolean", "description": "Mentions someone who saw it happen"},
        "follow_up_question": {
            "type": "string",
            "description": "The single most useful missing detail to ask about, or empty if none",
        },
    },
    "required": ["conditions"],
}

DOCUMENT_SCHEMA = {
    "type": "object",
    "properties": {
        "document_type": {
            "type": "string",
            "enum": ["dd214", "separation_orders", "service_treatment_record",
                     "medical_record", "audiology_report", "decision_letter",
                     "nexus_letter", "buddy_statement", "other"],
        },
        "confidence": {"type": "string", "enum": ["high", "medium", "low"]},
        "summary": {"type": "string", "description": "One line: what this document is"},
        "first_name": {"type": "string"},
        "last_name": {"type": "string"},
        "date_of_birth": {"type": "string", "description": "YYYY-MM-DD or empty"},
        "branch": {
            "type": "string",
            "enum": ["army", "navy", "air_force", "marine_corps", "coast_guard",
                     "space_force", "national_guard", "reserves"],
        },
        "service_start": {"type": "string", "description": "YYYY-MM-DD or empty"},
        "service_end": {"type": "string", "description": "Separation date, YYYY-MM-DD or empty"},
        "discharge_type": {
            "type": "string",
            "enum": ["honorable", "general", "other_than_honorable", "bad_conduct",
                     "dishonorable", "uncharacterized", "unknown"],
        },
        "decision_date": {"type": "string", "description": "For a decision letter: YYYY-MM-DD or empty"},
        "ssn": {
            "type": "string",
            "description": "Social Security number exactly as printed, digits or dashes",
        },
        "home_of_record": {
            "type": "string",
            "description": "DD-214 block 7b home of record, as one line",
        },
        "still_serving": {
            "type": "boolean",
            "description": "True only for separation orders: the member has not separated yet",
        },
        "outcome": {
            "type": "string",
            "enum": ["granted", "partial", "denied", "increased", "decreased",
                     "unchanged", "mixed", "unknown"],
            "description": "For a decision letter: overall result",
        },
        "combined_rating": {
            "type": "integer",
            "description": "Combined disability rating percentage if stated (0-100)",
        },
        "granted_conditions": {
            "type": "array",
            "items": {"type": "string"},
            "description": "Conditions granted or increased on a decision letter",
        },
        "denied_conditions": {
            "type": "array",
            "items": {"type": "string"},
            "description": "Conditions denied or deferred on a decision letter",
        },
        "conditions": {"type": "array", "items": _CONDITION},
        "providers": {"type": "array", "items": {"type": "string"},
                      "description": "Treating doctors, clinics, or hospitals named"},
    },
    # Required so the model must emit them - empty string or empty array when
    # genuinely absent - rather than silently omitting them on some runs.
    # "conditions" belongs here: it went missing intermittently, which read as
    # a document with nothing wrong in it.
    # "ssn" and "home_of_record" are here for the same reason: they are printed
    # on every DD-214 (blocks 3 and 7b), but being optional meant the model
    # dropped them on some runs, so the chat asked the veteran to type an SSN
    # and address it was already holding.
    "required": ["document_type", "confidence", "summary", "first_name", "last_name",
                 "date_of_birth", "service_start", "service_end", "conditions",
                 "ssn", "home_of_record"],
}

# Story + document in one Gemini call (chat sends both on the first turn).
INTAKE_TURN_SCHEMA = {
    "type": "object",
    "properties": {
        **STORY_SCHEMA["properties"],
        "document_type": DOCUMENT_SCHEMA["properties"]["document_type"],
        "confidence": DOCUMENT_SCHEMA["properties"]["confidence"],
        "summary": DOCUMENT_SCHEMA["properties"]["summary"],
        "first_name": DOCUMENT_SCHEMA["properties"]["first_name"],
        "last_name": DOCUMENT_SCHEMA["properties"]["last_name"],
        "date_of_birth": DOCUMENT_SCHEMA["properties"]["date_of_birth"],
        "branch": DOCUMENT_SCHEMA["properties"]["branch"],
        "service_start": DOCUMENT_SCHEMA["properties"]["service_start"],
        "service_end": DOCUMENT_SCHEMA["properties"]["service_end"],
        "discharge_type": DOCUMENT_SCHEMA["properties"]["discharge_type"],
        "ssn": DOCUMENT_SCHEMA["properties"]["ssn"],
        "home_of_record": DOCUMENT_SCHEMA["properties"]["home_of_record"],
    },
    "required": STORY_SCHEMA["required"] + [
        "document_type", "summary", "ssn", "home_of_record",
    ],
}

SYSTEM = (
    "You are helping a US military veteran prepare a VA disability compensation claim. "
    "Extract only what is actually stated or clearly shown. Never invent names, dates, "
    "diagnoses, or facts. If something is not present, leave the field empty rather than "
    "guessing - a wrong date here becomes a wrong effective date on a real claim. "
    "Use the veteran's own words for symptom descriptions."
)


# --- helpers ---------------------------------------------------------------


def parse_date(value: Any, allow_future: bool = False) -> Optional[date]:
    """Model dates arrive as strings and are frequently empty or partial.

    Future dates are rejected by default, because a birth date, an onset date,
    or a decision date in the future means the model misread something. Pass
    allow_future=True for a projected separation date, which is the one date
    here that is legitimately ahead of today.
    """
    if not value or not isinstance(value, str):
        return None
    text = value.strip()
    for fmt in ("%Y-%m-%d", "%Y-%m", "%Y"):
        try:
            from datetime import datetime
            parsed = datetime.strptime(text, fmt).date()
            if parsed > date.today() and not allow_future:
                return None
            return parsed
        except ValueError:
            continue
    return None


def normalize_name(value: str) -> str:
    """DD-214s print names in block capitals; store them as names, not shouting.

    Only re-cases input that is entirely uppercase, so a name the veteran typed
    themselves is left exactly as they wrote it. Known limitation: 'MCDONALD'
    becomes 'Mcdonald' rather than 'McDonald'.
    """
    if value.isupper():
        return value.title()
    return value


def _clean(value: Any) -> Optional[str]:
    if not isinstance(value, str):
        return None
    text = value.strip()
    return text or None


# --- extraction ------------------------------------------------------------


def extract_from_story(story: str) -> Dict[str, Any]:
    """Pull conditions, the in-service event, and situation flags from free text."""
    if not gemini.available():
        raise GeminiError("No Gemini API key configured")

    prompt = (
        "A veteran was asked: 'In your own words, what happened and what's bothering you now?'\n\n"
        f"Their answer:\n\"\"\"\n{story.strip()}\n\"\"\"\n\n"
        "Extract every distinct medical condition they mention, the in-service event behind it "
        "if they describe one, and the situation flags. If a condition's onset is only given "
        "vaguely ('since 2011'), use the first of that year. Set follow_up_question to the one "
        "detail most worth asking about next, or leave it empty."
    )
    return gemini.generate_json(prompt, STORY_SCHEMA, system=SYSTEM)


def extract_intake_turn(story: str, attachment: Attachment) -> Dict[str, Any]:
    """Parse the veteran's story and an uploaded document in one Gemini request."""
    if not gemini.available():
        raise GeminiError("No Gemini API key configured")

    cached_doc = parse_cache.get(attachment.data)
    if cached_doc:
        story_payload = extract_from_story(story)
        return {**story_payload, **cached_doc}

    prompt = (
        "A veteran was asked: 'In your own words, what happened and what's bothering you now?'\n\n"
        f"Their answer:\n\"\"\"\n{story.strip()}\n\"\"\"\n\n"
        "They also uploaded a document (attached). In one pass:\n"
        "1. From the story text: extract conditions, in-service event, and situation flags.\n"
        "2. From the document: identify its type and read identity/service fields. "
        "For DD-214, use block 1 (name), 2 (branch), 3 (Social Security number), "
        "5 or 6 (date of birth), 7b (home of record), 12a (entry), 12b (separation), "
        "24 (character of service). Convert YYYY MM DD to YYYY-MM-DD.\n"
        "Leave any field empty when not clearly present."
    )
    payload = gemini.generate_json(
        prompt,
        INTAKE_TURN_SCHEMA,
        system=SYSTEM,
        attachments=[attachment],
        timeout=120,
    )
    parse_cache.store(attachment.data, payload)
    return payload


def extract_from_document(attachment: Attachment) -> Dict[str, Any]:
    """Identify an uploaded document and read the claim facts off it."""
    if not gemini.available():
        raise GeminiError("No Gemini API key configured")

    prompt = (
        "Identify this document and extract what it proves for a VA disability claim.\n\n"
        "If it is a DD-214, you MUST fill in every identity field from these blocks: "
        "block 1 (name, printed LAST, FIRST MIDDLE), block 2 (branch), block 3 (Social "
        "Security number), block 5 or 6 (date of birth), block 7b (home of record), "
        "block 12a (date entered active duty), block 12b (separation date), block 24 "
        "(character of service). VA prints dates as 'YYYY MM DD' - convert them to "
        "YYYY-MM-DD.\n"
        "If it is a medical record, list the diagnosed conditions, whether treatment is "
        "ongoing, and the treating providers. For onset_date, use any phrase that dates the "
        "condition - 'since 2011', 'present since the 2012 deployment', 'onset following' - "
        "and give the first of that year or month when only a year or month is stated. "
        "Leave onset_date empty only when the record truly says nothing about when it began.\n"
        "If it is a VA decision letter, read the decision date, overall outcome "
        "(granted, partial, denied, increased, etc.), combined rating if shown, "
        "and which conditions were granted vs denied.\n"
        "If it is separation orders or a pre-separation notice, the member is still serving: "
        "set still_serving true and put the projected separation date in service_end.\n"
        "If it is an audiogram or audiology report, classify it as audiology_report and list "
        "the hearing conditions it documents.\n\n"
        "Leave any field empty if the document does not clearly show it."
    )
    payload = gemini.generate_json(
        prompt, DOCUMENT_SCHEMA, system=SYSTEM, attachments=[attachment], timeout=120
    )
    parse_cache.store(attachment.data, payload)
    return payload


def conditions_from(payload: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Normalize the condition dicts from either extractor into model kwargs."""
    results: List[Dict[str, Any]] = []
    for raw in payload.get("conditions") or []:
        name = _clean(raw.get("name"))
        if not name:
            continue
        symptoms = _clean(raw.get("current_symptoms")) or "Not described yet."
        if len(symptoms) < 5:
            symptoms = f"{symptoms} (needs more detail)"
        results.append({
            "name": name,
            "current_symptoms": symptoms,
            "diagnosis": _clean(raw.get("diagnosis")),
            "onset_date": parse_date(raw.get("onset_date")),
            "started_in_service": bool(raw.get("started_in_service")),
            "worsened_in_service": bool(raw.get("worsened_in_service")),
            "currently_treated": bool(raw.get("currently_treated")),
        })
    return results


def event_from(payload: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Normalize the in-service event, or None when the story had none."""
    event = payload.get("event") or {}
    title = _clean(event.get("title"))
    description = _clean(event.get("description"))
    if not title or not description or len(description) < 3:
        return None
    return {
        "title": title,
        "description": description,
        "event_date": parse_date(event.get("event_date")),
        "location": _clean(event.get("location")),
        "witnesses": _clean(event.get("witnesses")),
        "documented_in_service_records": bool(event.get("documented_in_service_records")),
    }


def veteran_fields_from(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Identity fields a DD-214 can supply, ready to merge into a Veteran."""
    fields: Dict[str, Any] = {}
    for key in ("first_name", "last_name"):
        value = _clean(payload.get(key))
        if value:
            fields[key] = normalize_name(value)

    # DD-214 block 1 is "LAST, FIRST MIDDLE", so a middle name often arrives
    # glued to the first name. The 526EZ has its own middle-initial box.
    first = fields.get("first_name")
    if first and " " in first:
        head, _, tail = first.partition(" ")
        fields["first_name"] = head
        fields["middle_name"] = tail.strip()

    dob = parse_date(payload.get("date_of_birth"))
    if dob:
        fields["dob"] = dob
    for source, target in (("service_start", "service_start"), ("service_end", "service_end")):
        parsed = parse_date(payload.get(source))
        if parsed:
            fields[target] = parsed
    for key in ("branch", "discharge_type"):
        value = _clean(payload.get(key))
        if value:
            fields[key] = value

    ssn = _clean(payload.get("ssn"))
    if ssn:
        digits = "".join(character for character in ssn if character.isdigit())
        if len(digits) == 9:
            fields["ssn"] = digits

    home = _clean(payload.get("home_of_record"))
    if home:
        fields["home_of_record"] = home

    return fields
