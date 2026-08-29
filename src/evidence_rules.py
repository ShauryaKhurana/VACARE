"""Rules that turn a claim into a plain-language readiness checklist.

This module answers three questions for a VSO:

1. Which documents are still missing?
2. Which conditions have a weak service-connection story?
3. What does the veteran need to do next?

These are practical claim-prep heuristics, not legal advice, and they never
predict whether a claim will be granted.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, List, Optional

from src.models import Claim, Condition, EvidenceType, Task

# Keywords -> condition category. Matched against the condition name and
# diagnosis, lowercased. First match wins, so order matters a little.
CATEGORY_KEYWORDS: Dict[str, List[str]] = {
    "hearing": ["tinnitus", "hearing", "ear ringing", "deaf"],
    "mental_health": [
        "ptsd", "post traumatic", "depression", "anxiety", "insomnia",
        "mst", "panic", "mental",
    ],
    "tbi": ["tbi", "traumatic brain", "concussion", "head injury"],
    "respiratory": [
        "asthma", "sinus", "rhinitis", "sleep apnea", "apnea", "copd",
        "burn pit", "bronchitis",
    ],
    "musculoskeletal": [
        "back", "spine", "lumbar", "cervical", "knee", "shoulder", "hip",
        "ankle", "wrist", "neck", "joint", "arthritis", "radiculopathy",
    ],
    "skin": ["eczema", "psoriasis", "dermatitis", "rash", "scar"],
    "digestive": ["ibs", "gerd", "reflux", "ulcer", "gastro", "crohn"],
}

# What each category typically needs on top of the baseline documents.
CATEGORY_EVIDENCE: Dict[str, List[EvidenceType]] = {
    "hearing": [EvidenceType.HEARING_TEST],
    "mental_health": [EvidenceType.MENTAL_HEALTH_EVALUATION, EvidenceType.BUDDY_STATEMENT],
    "tbi": [EvidenceType.IMAGING, EvidenceType.BUDDY_STATEMENT],
    "respiratory": [EvidenceType.CURRENT_MEDICAL_RECORD],
    "musculoskeletal": [EvidenceType.IMAGING],
    "skin": [EvidenceType.CURRENT_MEDICAL_RECORD],
    "digestive": [EvidenceType.CURRENT_MEDICAL_RECORD],
    "general": [],
}

# Evidence every claim should have before a VSO files it.
BASELINE_REQUIRED: List[EvidenceType] = [
    EvidenceType.DD214,
    EvidenceType.SERVICE_TREATMENT_RECORD,
]

# Evidence every condition should have before a VSO files it.
PER_CONDITION_REQUIRED: List[EvidenceType] = [
    EvidenceType.CURRENT_MEDICAL_RECORD,
]

FRIENDLY_NAMES: Dict[EvidenceType, str] = {
    EvidenceType.DD214: "DD-214 (discharge document)",
    EvidenceType.SERVICE_TREATMENT_RECORD: "Service treatment records",
    EvidenceType.SERVICE_PERSONNEL_RECORD: "Service personnel records",
    EvidenceType.CURRENT_MEDICAL_RECORD: "Current medical records showing the condition today",
    EvidenceType.PRIVATE_DOCTOR_NOTE: "Private doctor's note",
    EvidenceType.NEXUS_LETTER: "Nexus letter linking the condition to service",
    EvidenceType.BUDDY_STATEMENT: "Buddy statement from someone who served with you",
    EvidenceType.PERSONAL_STATEMENT: "Your personal statement describing the event and symptoms",
    EvidenceType.HEARING_TEST: "Audiology / hearing test results",
    EvidenceType.MENTAL_HEALTH_EVALUATION: "Mental health evaluation",
    EvidenceType.IMAGING: "Imaging (X-ray, MRI, or CT)",
    EvidenceType.OTHER: "Other supporting document",
}


def friendly(evidence_type: EvidenceType) -> str:
    return FRIENDLY_NAMES.get(evidence_type, evidence_type.value.replace("_", " "))


def categorize(condition: Condition) -> str:
    """Best-guess category for a condition, used to pick likely evidence."""
    haystack = f"{condition.name} {condition.diagnosis or ''}".lower()
    for category, keywords in CATEGORY_KEYWORDS.items():
        if any(keyword in haystack for keyword in keywords):
            return category
    return "general"


@dataclass
class ChecklistItem:
    """One thing that is still missing from the claim."""

    label: str
    why: str
    required: bool = True
    condition_name: Optional[str] = None

    def __str__(self) -> str:
        marker = "REQUIRED" if self.required else "suggested"
        scope = f" [{self.condition_name}]" if self.condition_name else ""
        return f"({marker}){scope} {self.label} - {self.why}"


def missing_evidence(claim: Claim) -> List[ChecklistItem]:
    """Everything the claim still needs, most important first."""
    items: List[ChecklistItem] = []

    # 1. Claim-level baseline documents.
    for evidence_type in BASELINE_REQUIRED:
        if not claim.has_evidence(evidence_type):
            items.append(
                ChecklistItem(
                    label=friendly(evidence_type),
                    why="every claim needs this to prove service and in-service treatment",
                )
            )

    if not claim.has_evidence(EvidenceType.PERSONAL_STATEMENT):
        items.append(
            ChecklistItem(
                label=friendly(EvidenceType.PERSONAL_STATEMENT),
                why="your own account is free to write and often the fastest gap to close",
                required=False,
            )
        )

    # 2. Per-condition documents.
    for condition in claim.conditions:
        attached = {item.evidence_type for item in claim.evidence_for_condition(condition.id)}
        # Claim-wide medical records also count toward a condition.
        attached |= {item.evidence_type for item in claim.evidence if item.condition_id is None}

        for evidence_type in PER_CONDITION_REQUIRED:
            if evidence_type not in attached:
                items.append(
                    ChecklistItem(
                        label=friendly(evidence_type),
                        why="a current diagnosis or treatment record is needed to show the condition exists today",
                        condition_name=condition.name,
                    )
                )

        category = categorize(condition)
        for evidence_type in CATEGORY_EVIDENCE.get(category, []):
            if evidence_type not in attached:
                items.append(
                    ChecklistItem(
                        label=friendly(evidence_type),
                        why=f"typical supporting evidence for a {category.replace('_', ' ')} claim",
                        required=False,
                        condition_name=condition.name,
                    )
                )

        # A nexus letter matters most when the condition did not start in service.
        if not condition.started_in_service and EvidenceType.NEXUS_LETTER not in attached:
            items.append(
                ChecklistItem(
                    label=friendly(EvidenceType.NEXUS_LETTER),
                    why="this condition did not start in service, so a doctor's opinion connecting it matters",
                    required=False,
                    condition_name=condition.name,
                )
            )

    # Required items first, keeping the order they were found in.
    return sorted(items, key=lambda item: not item.required)


def linkage_warnings(claim: Claim) -> List[str]:
    """Conditions whose service-connection story looks thin."""
    warnings: List[str] = []
    for condition in claim.conditions:
        if not condition.has_service_connection_story:
            warnings.append(
                f"{condition.name}: no in-service event, onset, or worsening recorded. "
                "A claim needs a link to service."
            )
            continue

        event = claim.find_service_event(condition.service_event_id)
        if event is None:
            warnings.append(
                f"{condition.name}: linked to service but no specific in-service event was described."
            )
        elif not event.documented_in_service_records and not event.witnesses:
            warnings.append(
                f"{condition.name}: the event '{event.title}' is not in service records and has no "
                "named witness. A buddy statement would strengthen it."
            )

        if not condition.currently_treated:
            warnings.append(
                f"{condition.name}: not currently being treated. Ongoing treatment records help show "
                "the condition is still present."
            )
    return warnings


def build_tasks(claim: Claim) -> List[Task]:
    """Turn the checklist and warnings into trackable follow-up tasks."""
    tasks: List[Task] = []
    condition_ids = {condition.name: condition.id for condition in claim.conditions}

    for item in missing_evidence(claim):
        tasks.append(
            Task(
                name=f"Obtain: {item.label}",
                detail=item.why,
                required=item.required,
                owner="veteran",
                condition_id=condition_ids.get(item.condition_name or ""),
            )
        )

    for warning in linkage_warnings(claim):
        tasks.append(
            Task(
                name="Strengthen service connection",
                detail=warning,
                required=False,
                owner="veteran",
            )
        )

    return tasks


def blockers(claim: Claim) -> List[str]:
    """Hard problems that should stop a claim from being marked VSO-ready."""
    problems: List[str] = []

    if not claim.conditions:
        problems.append("No conditions have been claimed yet.")

    for item in missing_evidence(claim):
        if item.required:
            scope = f" for {item.condition_name}" if item.condition_name else ""
            problems.append(f"Missing required document{scope}: {item.label}")

    for condition in claim.conditions:
        if not condition.has_service_connection_story:
            problems.append(f"No service connection recorded for {condition.name}.")

    return problems


def is_ready_for_vso(claim: Claim) -> bool:
    return not blockers(claim)


def readiness_score(claim: Claim) -> int:
    """A rough 0-100 completeness signal, so a VSO can triage a queue.

    It measures how much of the checklist is done, not the strength of the claim.
    """
    if not claim.conditions:
        return 0

    checklist = missing_evidence(claim)
    required_missing = sum(1 for item in checklist if item.required)
    suggested_missing = len(checklist) - required_missing
    warnings = len(linkage_warnings(claim))

    score = 100 - (required_missing * 20) - (suggested_missing * 5) - (warnings * 5)
    return max(0, min(100, score))
