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

from src import extract, gemini
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
}


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


def _safe_filename(name: str) -> str:
    cleaned = re.sub(r"[^\w.\-]+", "_", name.strip()) or "upload"
    return cleaned[:120]


def save_upload(case_id: str, filename: str, data: bytes) -> Path:
    dest_dir = UPLOAD_ROOT / case_id
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest = dest_dir / _safe_filename(filename)
    dest.write_bytes(data)
    return dest


def ingest_document(claim: Claim, filename: str, data: bytes) -> DocumentIngestResult:
    """Store a file and, when Gemini is available, read claim facts off it."""
    stored = save_upload(claim.id, filename, data)
    intake = ClaimIntake(claim)
    result = DocumentIngestResult(
        filename=filename,
        stored_path=str(stored),
    )

    if not gemini.available():
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
        result.message = f"File saved but could not be read: {error}"
        return result

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
    )

    notes: List[str] = [f"Read as: {result.summary}."]

    applied = _merge_veteran(claim, extract.veteran_fields_from(payload))
    if applied:
        notes.append("Filled in " + ", ".join(applied) + ".")
        result.fields_applied = applied

    if doc_type == "decision_letter":
        decision = extract.parse_date(payload.get("decision_date"))
        if decision:
            claim.context.decision_date = decision
            claim.context.disagrees_with_decision = True
            notes.append(f"Decision dated {decision}.")
            result.fields_applied = list(result.fields_applied) + ["decision_date"]

    new_conditions = extract.conditions_from(payload)
    existing = {condition.name.lower() for condition in claim.conditions}
    for condition_fields in new_conditions:
        if condition_fields["name"].lower() in existing:
            continue
        intake.add_condition(**condition_fields)
        result.conditions_added.append(condition_fields["name"])
    if result.conditions_added:
        notes.append("Found conditions: " + ", ".join(result.conditions_added) + ".")

    intake.evaluate_readiness()
    result.message = " ".join(notes)
    return result


def _merge_veteran(claim: Claim, fields: Dict[str, Any]) -> List[str]:
    """Apply extracted identity fields, skipping anything already known."""
    veteran = claim.veteran
    applied: List[str] = []

    if fields.get("first_name") and veteran.first_name in {"Unknown", "New"}:
        veteran.first_name = fields["first_name"]
        if fields.get("last_name"):
            veteran.last_name = fields["last_name"]
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
    if fields.get("discharge_type") and veteran.discharge_type == DischargeType.UNKNOWN:
        try:
            veteran.discharge_type = DischargeType(fields["discharge_type"])
            applied.append("discharge")
        except ValueError:
            pass

    return applied
