"""Save an uploaded file and merge Gemini extraction into a claim.

Parsing uses Gemini (see src/extract.py) when GEMINI_API_KEY is set.
Without a key, the file is stored and tagged as evidence — nothing is invented.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import date
from pathlib import Path
from typing import Any, Dict, List, Optional

from src import extract, gemini, parse_cache
from src.claim_intake import ClaimIntake
from src.gemini import Attachment, GeminiError
from src.models import Branch, Claim, DischargeType, EvidenceType

UPLOAD_ROOT = Path(__file__).resolve().parent.parent / "data" / "uploads"

DOC_TO_EVIDENCE = {
    "dd214": EvidenceType.DD214,
    "service_treatment_record": EvidenceType.SERVICE_TREATMENT_RECORD,
    "medical_record": EvidenceType.CURRENT_MEDICAL_RECORD,
    "nexus_letter": EvidenceType.NEXUS_LETTER,
    "buddy_statement": EvidenceType.BUDDY_STATEMENT,
    "audiology_report": EvidenceType.HEARING_TEST,
    "separation_orders": EvidenceType.SERVICE_PERSONNEL_RECORD,
}

# Re-use successful parses when the same file bytes are uploaded again (saves API quota).
_PARSE_CACHE = parse_cache._MEMORY  # tests may replace; disk cache is authoritative


def _file_hash(data: bytes) -> str:
    return parse_cache.file_hash(data)


def _filename_suggests_dd214(filename: str) -> bool:
    lowered = filename.lower()
    return any(token in lowered for token in ("dd214", "dd-214", "dd_214", "discharge"))


def _identity_from_claim(claim: Claim) -> bool:
    veteran = claim.veteran
    return (
        veteran.first_name not in {"Unknown", "New"}
        and veteran.last_name not in {"Case", "Veteran"}
        and bool(veteran.service_start or veteran.service_end)
    )


# --- identity and condition matching ----------------------------------------

_PLACEHOLDER_FIRST = {"Unknown", "New"}
_PLACEHOLDER_LAST = {"Case", "Veteran"}

# Words that describe a condition without distinguishing it from another.
# Laterality (left/right) is deliberately NOT here: a left knee and a right
# knee are separate conditions with separate ratings.
_CONDITION_NOISE = {
    "chronic", "acute", "bilateral", "mild", "moderate", "severe", "with",
    "and", "the", "of", "disorder", "condition", "syndrome", "unspecified",
}


def _name_key(value: Optional[str]) -> str:
    return "".join(character for character in (value or "").lower() if character.isalpha())


def identity_conflict(claim: Claim, fields: Dict[str, Any]) -> Optional[str]:
    """Whether an uploaded document names a different veteran than the claim.

    Uploading someone else's records into a claim is a real hazard - the files
    look alike and a VSO may be working several cases - and silently merging
    them corrupts the claim. Only a clear surname mismatch counts; missing or
    partial names are treated as agreement.
    """
    veteran = claim.veteran
    if veteran.last_name in _PLACEHOLDER_LAST or veteran.first_name in _PLACEHOLDER_FIRST:
        return None                       # nothing established yet

    doc_last = _name_key(fields.get("last_name"))
    if not doc_last:
        return None                       # document does not name anyone

    if doc_last == _name_key(veteran.last_name):
        return None

    doc_first = fields.get("first_name") or ""
    return f"{doc_first} {fields.get('last_name') or ''}".strip()


def _condition_tokens(name: str) -> frozenset:
    cleaned = "".join(c if c.isalnum() else " " for c in (name or "").lower())
    return frozenset(
        word for word in cleaned.split()
        if word not in _CONDITION_NOISE and len(word) > 2
    )


def same_condition(left: str, right: str) -> bool:
    """True when two names describe the same claimed condition.

    'Tinnitus', 'Tinnitus, bilateral' and 'Bilateral tinnitus' are one
    condition; 'Left knee strain' and 'Right knee strain' are two.
    """
    a, b = _condition_tokens(left), _condition_tokens(right)
    if not a or not b:
        return _name_key(left) == _name_key(right)
    return a <= b or b <= a


@dataclass
class DocumentIngestResult:
    filename: str
    stored_path: str
    document_type: str = "other"
    summary: str = ""
    parsed_with_gemini: bool = False
    fields_applied: List[str] = field(default_factory=list)
    conditions_added: List[str] = field(default_factory=list)
    evidence_type: str = "other"
    message: str = ""
    detail: str = ""  # multi-line field summary for chat UI confirmation
    identity_conflict: Optional[str] = None  # name on the doc, when it is someone else
    from_cache: bool = False        # parsed bytes were already known, no Gemini call
    seen_before: bool = False       # this claim has had this exact file before


def _safe_filename(name: str) -> str:
    cleaned = re.sub(r"[^\w.\-]+", "_", name.strip()) or "upload"
    return cleaned[:120]


def save_upload(case_id: str, filename: str, data: bytes) -> Path:
    dest_dir = UPLOAD_ROOT / case_id
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest = dest_dir / _safe_filename(filename)
    dest.write_bytes(data)
    return dest


def ingest_document(
    claim: Claim,
    filename: str,
    data: bytes,
    *,
    preloaded_payload: Optional[Dict[str, Any]] = None,
) -> DocumentIngestResult:
    """Store a file and, when Gemini is available, read claim facts off it."""
    content_hash = _file_hash(data)
    seen_before = any(
        (item.notes or "").endswith(content_hash) for item in claim.evidence
    )
    stored = save_upload(claim.id, filename, data)
    intake = ClaimIntake(claim)
    result = DocumentIngestResult(
        filename=filename,
        stored_path=str(stored),
        seen_before=seen_before,
    )

    used_cache = False

    if preloaded_payload is not None:
        payload = preloaded_payload
        result.parsed_with_gemini = True
        parse_cache.store(data, payload)
    elif not gemini.available():
        intake.add_evidence(
            evidence_type=EvidenceType.OTHER,
            title=filename,
            source="upload",
            file_uri=str(stored),
        )
        intake.evaluate_readiness()
        result.message = (
            "File saved. No GEMINI_API_KEY configured — upload stored but not parsed. "
            "Add a key to .env to auto-read DD-214s and medical records."
        )
        return result
    else:
        cached = parse_cache.get(data)
        if cached:
            payload = cached
            result.parsed_with_gemini = True
            used_cache = True
            result.from_cache = True
        else:
            try:
                payload = extract.extract_from_document(Attachment(filename, data))
            except GeminiError as error:
                intake.add_evidence(
                    evidence_type=EvidenceType.OTHER,
                    title=filename,
                    source="upload",
                    file_uri=str(stored),
                    notes=f"Parse failed: {error}",
                )
                intake.evaluate_readiness()
                result.message = (
                    f"File saved but could not be read: {gemini.user_facing_error(error)} "
                    "You can wait and upload again, or type your details manually."
                )
                return result
            parse_cache.store(data, payload)
            result.parsed_with_gemini = True

    doc_type = payload.get("document_type", "other")
    result.document_type = doc_type
    result.summary = payload.get("summary") or filename

    evidence_type = DOC_TO_EVIDENCE.get(doc_type, EvidenceType.OTHER)
    result.evidence_type = evidence_type.value
    intake.add_evidence(
        evidence_type=evidence_type,
        title=result.summary,
        source="upload",
        file_uri=str(stored),
        notes=f"sha256:{content_hash}",
    )

    fields = extract.veteran_fields_from(payload)
    conflict = identity_conflict(claim, fields)
    if conflict:
        # Someone else's document. Keep the file as evidence, but do not let it
        # touch this veteran's identity or add their conditions.
        result.identity_conflict = conflict
        result.message = (
            f"This document is for {conflict}, but this claim is for "
            f"{claim.veteran.full_name}. I've saved the file but haven't added "
            "anything from it. If this is the right claim, upload the correct "
            "document; if you're working a different case, start that one first."
        )
        result.detail = ""
        intake.evaluate_readiness()
        return result

    applied = _merge_veteran(claim, fields)
    if applied:
        result.fields_applied = applied

    if doc_type == "separation_orders" and payload.get("still_serving"):
        # Separation orders are how a Lane 1 (BDD) claim gets dated: the member
        # has no DD-214 yet, and the projected separation date drives the
        # 180-90 day window. That date is in the future, hence allow_future.
        claim.context.still_serving = True
        separation = extract.parse_date(payload.get("service_end"), allow_future=True)
        if separation:
            claim.context.separation_date = separation
            claim.veteran.service_end = None
            result.fields_applied = list(result.fields_applied) + ["separation date"]

    if doc_type == "decision_letter":
        from src import decision as decision_helpers

        decision_helpers.apply_decision_payload(claim, payload)
        result.fields_applied = list(result.fields_applied) + ["decision_date"]

    for condition_fields in extract.conditions_from(payload):
        name = condition_fields["name"]
        match = next(
            (c for c in claim.conditions if same_condition(c.name, name)), None
        )
        if match is not None:
            # Same condition, different wording. Keep the more specific name
            # and fill in anything the earlier mention lacked.
            if len(name) > len(match.name):
                match.name = name
            if not match.onset_date and condition_fields.get("onset_date"):
                match.onset_date = condition_fields["onset_date"]
            if not match.diagnosis and condition_fields.get("diagnosis"):
                match.diagnosis = condition_fields["diagnosis"]
            match.currently_treated = match.currently_treated or bool(
                condition_fields.get("currently_treated")
            )
            continue
        intake.add_condition(**condition_fields)
        result.conditions_added.append(name)

    headline, detail = format_parsed_receipt(
        claim,
        payload,
        doc_type=doc_type,
        parsed=result.parsed_with_gemini,
    )
    if used_cache and seen_before:
        result.message = "You've already uploaded this one — here's what I have:"
    else:
        # A cache hit only means we parsed these bytes before, possibly on
        # another claim. Saying "from earlier" to someone uploading for the
        # first time reads like a bug.
        result.message = headline
    result.detail = detail
    if result.conditions_added:
        extra = "Conditions also noted: " + ", ".join(result.conditions_added)
        result.detail = (result.detail + "\n• " + extra) if result.detail else "• " + extra

    intake.evaluate_readiness()
    return result


def _merge_veteran(claim: Claim, fields: Dict[str, Any]) -> List[str]:
    """Apply extracted identity fields, skipping anything already known."""
    veteran = claim.veteran
    applied: List[str] = []

    if fields.get("first_name") and veteran.first_name in {"Unknown", "New"}:
        veteran.first_name = fields["first_name"]
        if fields.get("last_name"):
            veteran.last_name = fields["last_name"]
        # DD-214 block 1 is "LAST, FIRST MIDDLE", so a middle name arrives glued
        # to the first name; the 526EZ has its own middle-initial box.
        if fields.get("middle_name"):
            veteran.middle_name = fields["middle_name"]
        applied.append("name")
    elif fields.get("last_name") and veteran.last_name in {"Case", "Veteran"}:
        veteran.last_name = fields["last_name"]
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
    if fields.get("branch") and veteran.branch is None:
        try:
            veteran.branch = Branch(fields["branch"])
            applied.append("branch")
        except ValueError:
            pass
    if fields.get("ssn") and not veteran.ssn:
        veteran.ssn = fields["ssn"]
        applied.append("Social Security number")
    if fields.get("home_of_record") and not veteran.home_of_record:
        veteran.home_of_record = fields["home_of_record"]

    if fields.get("discharge_type") and veteran.discharge_type == DischargeType.UNKNOWN:
        try:
            veteran.discharge_type = DischargeType(fields["discharge_type"])
            applied.append("discharge")
        except ValueError:
            pass

    return applied


def _display_branch(branch: Optional[Branch]) -> str:
    if branch is None:
        return ""
    return branch.value.replace("_", " ").title()


def _display_discharge(discharge: DischargeType) -> str:
    if discharge == DischargeType.UNKNOWN:
        return ""
    return discharge.value.replace("_", " ").title()


def format_parsed_receipt(
    claim: Claim,
    payload: Dict[str, Any],
    *,
    doc_type: str,
    parsed: bool,
) -> tuple[str, str]:
    """Build a friendly headline + field list so the user knows parsing succeeded."""
    veteran = claim.veteran
    name = veteran.full_name
    if name in {"Unknown Veteran", "New Case"}:
        parts = []
        if payload.get("first_name"):
            parts.append(str(payload["first_name"]).title())
        if payload.get("last_name"):
            parts.append(str(payload["last_name"]).title())
        if parts:
            name = " ".join(parts)

    if not parsed:
        return (
            f"Saved {payload.get('summary') or 'your upload'}, but I couldn't read fields from it yet.",
            "",
        )

    if doc_type == "dd214":
        headline = (
            f"Thank you for uploading your DD-214{', ' + name if name not in {'Unknown Veteran', 'New Case', ''} else ''}!"
        )
        intro = "Here's what I read from it — please confirm this looks right:"
        lines: List[str] = []
        if name not in {"Unknown Veteran", "New Case", ""}:
            lines.append(f"Name: {name}")
        if veteran.dob:
            lines.append(f"Date of birth: {veteran.dob.strftime('%B %d, %Y')}")
        branch = _display_branch(veteran.branch)
        if branch:
            lines.append(f"Branch: {branch}")
        if veteran.service_start:
            lines.append(f"Service start: {veteran.service_start.strftime('%B %d, %Y')}")
        if veteran.service_end:
            lines.append(f"Separation date: {veteran.service_end.strftime('%B %d, %Y')}")
        discharge = _display_discharge(veteran.discharge_type)
        if discharge:
            lines.append(f"Character of service: {discharge.title()}")
        if veteran.ssn:
            # Last four only: enough to check, and it stays off a shared screen.
            lines.append(f"Social Security number: xxx-xx-{veteran.ssn[5:]}")
        if not lines:
            lines.append("I recognized this as a DD-214 but couldn't pull specific fields — you may need to type them.")
        return headline, intro + "\n" + "\n".join(f"• {line}" for line in lines)

    if doc_type == "decision_letter":
        from src import decision as decision_helpers

        summary = decision_helpers.decision_summary(claim)
        headline = "Thank you for uploading your decision letter."
        lines = []
        if summary.decision_date:
            lines.append(f"Decision date: {summary.decision_date.strftime('%B %d, %Y')}")
        if summary.outcome and summary.outcome != "unknown":
            lines.append(f"Outcome: {summary.outcome_label}")
        if summary.combined_rating is not None:
            lines.append(f"Combined rating: {summary.combined_rating}%")
        if summary.granted:
            lines.append("Granted: " + ", ".join(summary.granted))
        if summary.denied:
            lines.append("Denied or deferred: " + ", ".join(summary.denied))
        elif payload.get("summary"):
            lines.append(f"Summary: {payload['summary']}")
        detail = "\n".join(f"• {line}" for line in lines) if lines else ""
        return headline, detail

    summary = payload.get("summary") or doc_type.replace("_", " ")
    headline = f"Thank you for uploading your document."
    detail = f"• Identified as: {summary}"
    return headline, detail
