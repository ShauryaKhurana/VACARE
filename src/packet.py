"""Human-readable output: claim summary and the VSO-ready packet.

Everything here is plain text so it can be printed in a terminal, saved to a
file, or pasted into an email without any extra tooling.
"""

from __future__ import annotations

from typing import List

from src import evidence_rules
from src.models import Claim, Condition

DISCLAIMER = (
    "VACARE helps organize a claim. It does not provide legal advice and cannot\n"
    "predict or guarantee a VA decision. A VSO or accredited representative\n"
    "reviews and files the claim."
)

LINE = "=" * 68
THIN = "-" * 68


def _fmt(value: object, fallback: str = "not provided") -> str:
    if value is None or value == "":
        return fallback
    if hasattr(value, "value"):  # Enum
        return str(value.value).replace("_", " ")
    return str(value)


def veteran_profile(claim: Claim) -> str:
    v = claim.veteran
    return "\n".join([
        "VETERAN PROFILE",
        THIN,
        f"Name:            {v.full_name}",
        f"Date of birth:   {_fmt(v.dob)}",
        f"Contact:         {_fmt(v.email)} / {_fmt(v.phone)}",
        f"Branch:          {_fmt(v.branch, 'not provided')}",
        f"Service period:  {_fmt(v.service_start, 'unknown')} to {_fmt(v.service_end, 'unknown')}",
        f"Discharge:       {_fmt(v.discharge_type)}",
    ])


def _condition_block(claim: Claim, condition: Condition) -> List[str]:
    event = claim.find_service_event(condition.service_event_id)
    attached = claim.evidence_for_condition(condition.id)

    link_notes = []
    if condition.started_in_service:
        link_notes.append("began during service")
    if condition.worsened_in_service:
        link_notes.append("worsened during service")
    if event:
        link_notes.append(f"tied to event '{event.title}'")

    lines = [
        f"* {condition.name} ({evidence_rules.categorize(condition).replace('_', ' ')})",
        f"    Diagnosis:      {_fmt(condition.diagnosis, 'not yet diagnosed')}",
        f"    Onset:          {_fmt(condition.onset_date, 'unknown')}",
        f"    Symptoms today: {condition.current_symptoms}",
        f"    In treatment:   {'yes' if condition.currently_treated else 'no'}",
        f"    Service link:   {', '.join(link_notes) if link_notes else 'NONE RECORDED'}",
    ]
    if attached:
        lines.append(f"    Evidence:       {', '.join(item.label for item in attached)}")
    if condition.notes:
        lines.append(f"    Notes:          {condition.notes}")
    return lines


def conditions_section(claim: Claim) -> str:
    lines = ["CLAIMED CONDITIONS", THIN]
    if not claim.conditions:
        lines.append("No conditions entered yet.")
    for condition in claim.conditions:
        lines.extend(_condition_block(claim, condition))
        lines.append("")
    return "\n".join(lines).rstrip()


def service_events_section(claim: Claim) -> str:
    lines = ["IN-SERVICE EVENTS", THIN]
    if not claim.service_events:
        lines.append("No in-service events described yet.")
    for event in claim.service_events:
        lines.extend([
            f"* {event.title} ({_fmt(event.event_date, 'date unknown')})",
            f"    Where:      {_fmt(event.location, 'not provided')}",
            f"    What:       {event.description}",
            f"    Witnesses:  {_fmt(event.witnesses, 'none named')}",
            f"    In records: {'yes' if event.documented_in_service_records else 'no'}",
            "",
        ])
    return "\n".join(lines).rstrip()


def evidence_section(claim: Claim) -> str:
    lines = ["EVIDENCE ON HAND", THIN]
    if not claim.evidence:
        lines.append("No documents collected yet.")
    for item in claim.evidence:
        location = f" -> {item.file_uri}" if item.file_uri else ""
        lines.append(f"* {evidence_rules.friendly(item.evidence_type)}{location}")
    return "\n".join(lines)


def checklist_section(claim: Claim) -> str:
    """The missing-items summary a veteran sees before filing."""
    missing = evidence_rules.missing_evidence(claim)
    lines = ["MISSING ITEMS CHECKLIST", THIN]

    required = [item for item in missing if item.required]
    suggested = [item for item in missing if not item.required]

    if not missing:
        lines.append("Nothing missing. Every checklist item is accounted for.")
        return "\n".join(lines)

    if required:
        lines.append("Required before filing:")
        for item in required:
            scope = f" (for {item.condition_name})" if item.condition_name else ""
            lines.append(f"  [ ] {item.label}{scope}")
            lines.append(f"      why: {item.why}")
    if suggested:
        if required:
            lines.append("")
        lines.append("Would strengthen the claim:")
        for item in suggested:
            scope = f" (for {item.condition_name})" if item.condition_name else ""
            lines.append(f"  [ ] {item.label}{scope}")
            lines.append(f"      why: {item.why}")
    return "\n".join(lines)


def status_section(claim: Claim) -> str:
    lines = [
        "CLAIM STATUS",
        THIN,
        f"Claim id:        {claim.id}",
        f"Type:            {_fmt(claim.claim_type)}",
        f"Status:          {_fmt(claim.status)}",
        f"Readiness:       {evidence_rules.readiness_score(claim)}/100 checklist complete",
        f"Open tasks:      {len(claim.open_tasks)}",
    ]
    if claim.status_history:
        lines.append("")
        lines.append("History:")
        for event in claim.status_history:
            note = f" - {event.note}" if event.note else ""
            lines.append(f"  {event.recorded_on} {_fmt(event.status)}{note}")
    if claim.reviews:
        lines.append("")
        lines.append("VSO reviews:")
        for review in claim.reviews:
            lines.append(f"  {review.reviewed_on} {review.reviewer_name}: {_fmt(review.verdict)}")
            if review.review_notes:
                lines.append(f"      {review.review_notes}")
    return "\n".join(lines)


def vso_review_notes(claim: Claim) -> str:
    """What the VSO should look at, in priority order."""
    lines = ["VSO REVIEW NOTES", THIN]

    problems = evidence_rules.blockers(claim)
    warnings = evidence_rules.linkage_warnings(claim)

    if problems:
        lines.append("Blockers (claim is not ready to file):")
        lines.extend(f"  ! {problem}" for problem in problems)
    else:
        lines.append("No blockers. All required documents and service links are recorded.")

    lines.append("")
    if warnings:
        lines.append("Weak points to confirm with the veteran:")
        lines.extend(f"  ? {warning}" for warning in warnings)
    else:
        lines.append("No weak service-connection points flagged.")

    lines.append("")
    lines.append("Suggested VSO actions:")
    if problems:
        lines.append("  1. Send the veteran the missing-items checklist above.")
        lines.append("  2. Re-check readiness once documents arrive.")
    else:
        lines.append("  1. Confirm the veteran's identity and service dates against the DD-214.")
        lines.append("  2. Confirm each condition statement reads the way the veteran means it.")
        lines.append("  3. Record the review verdict and file.")
    return "\n".join(lines)


def claim_summary(claim: Claim) -> str:
    """Short summary for the veteran."""
    return "\n\n".join([
        f"{LINE}\nVACARE CLAIM SUMMARY\n{LINE}",
        veteran_profile(claim),
        conditions_section(claim),
        checklist_section(claim),
        status_section(claim),
        f"{THIN}\n{DISCLAIMER}",
    ])


def vso_packet(claim: Claim) -> str:
    """Full packet for the VSO: everything, with the review notes at the top."""
    return "\n\n".join([
        f"{LINE}\nVSO-READY CLAIM PACKET\n{LINE}",
        vso_review_notes(claim),
        veteran_profile(claim),
        service_events_section(claim),
        conditions_section(claim),
        evidence_section(claim),
        checklist_section(claim),
        status_section(claim),
        f"{THIN}\n{DISCLAIMER}",
    ])
