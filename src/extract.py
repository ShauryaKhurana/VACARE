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
            "enum": ["dd214", "service_treatment_record", "medical_record",
                     "decision_letter", "nexus_letter", "buddy_statement", "other"],
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
    # Identity fields are required so the model must emit them (empty string
    # when genuinely absent) instead of silently omitting them on some runs.
    "required": ["document_type", "confidence", "summary", "first_name", "last_name",
                 "date_of_birth", "service_start", "service_end"],
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
    },
    "required": STORY_SCHEMA["required"] + ["document_type", "summary"],
}

SYSTEM = (
    "You are helping a US military veteran prepare a VA disability compensation claim. "
    "Extract only what is actually stated or clearly shown. Never invent names, dates, "
    "diagnoses, or facts. If something is not present, leave the field empty rather than "
    "guessing - a wrong date here becomes a wrong effective date on a real claim. "
    "Use the veteran's own words for symptom descriptions."
)


# --- helpers ---------------------------------------------------------------


def parse_date(value: Any) -> Optional[date]:
    """Model dates arrive as strings and are frequently empty or partial."""
    if not value or not isinstance(value, str):
        return None
    text = value.strip()
    for fmt in ("%Y-%m-%d", "%Y-%m", "%Y"):
        try:
            from datetime import datetime
            parsed = datetime.strptime(text, fmt).date()
            return parsed if parsed <= date.today() else None
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
        "For DD-214, use blocks 1, 2, 5, 12a, 12b, 24. Convert YYYY MM DD to YYYY-MM-DD.\n"
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
        "block 1 (name, printed LAST, FIRST MIDDLE), block 2 (branch), block 5 or 6 "
        "(date of birth), block 12a (date entered active duty), block 12b (separation "
        "date), block 24 (character of service). VA prints dates as 'YYYY MM DD' - "
        "convert them to YYYY-MM-DD.\n"
        "If it is a medical record, list the diagnosed conditions, when they began, whether "
        "treatment is ongoing, and the treating providers.\n"
        "If it is a VA decision letter, read the decision date, overall outcome "
        "(granted, partial, denied, increased, etc.), combined rating if shown, "
        "and which conditions were granted vs denied.\n\n"
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
    return fields
