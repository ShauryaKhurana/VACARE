"""Deterministic presumptive-eligibility checks from DD-214 facts.

These are rules lookups, not legal judgments. Results are safe for the
orchestrator to compute directly (see hackathon requirements §2.14).
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta
from enum import Enum
from typing import List, Optional

from src.models import Claim, Condition

# Sample MOS codes VA associates with noise exposure (not exhaustive).
NOISE_EXPOSURE_MOS = {
    "11B", "11C", "11H", "13B", "13F", "19D", "19K", "68W", "88M", "91B",
    "BM", "GM", "MM", "EN", "AO", "ABE", "ABH", "AD", "AE", "AT",
}

PACT_RESPIRATORY_KEYWORDS = [
    "asthma", "sinus", "rhinitis", "sleep apnea", "apnea", "copd",
    "burn pit", "bronchitis", "respiratory", "sarcoidosis",
]

AGENT_ORANGE_KEYWORDS = [
    "diabetes", "hypertension", "ischemic", "parkinson", "prostate",
    "bladder", "hypothyroid", "monoclonal",
]

VIETNAM_MEDAL_MARKERS = [
    "vietnam service", "vietnam service medal", "vsm", "vietnam campaign",
]

GULF_ERA_START = date(1990, 8, 2)


class RuleResult(str, Enum):
    MATCH = "MATCH"
    NO_MATCH = "NO_MATCH"
    NOT_ENOUGH_DATA = "NOT_ENOUGH_DATA"


@dataclass
class PresumptiveHit:
    rule_id: str
    result: RuleResult
    explanation: str
    condition_name: Optional[str] = None


def _normalize(text: str) -> str:
    return text.strip().lower()


def _condition_text(condition: Condition) -> str:
    parts = [condition.name]
    if condition.diagnosis:
        parts.append(condition.diagnosis)
    return _normalize(" ".join(parts))


def _has_keyword(text: str, keywords: List[str]) -> bool:
    return any(keyword in text for keyword in keywords)


def _service_end(claim: Claim) -> Optional[date]:
    if claim.veteran.service_end:
        return claim.veteran.service_end
    if claim.context.separation_date:
        return claim.context.separation_date
    return None


def _gulf_era_service(claim: Claim) -> Optional[bool]:
    start = claim.veteran.service_start
    end = _service_end(claim)
    if not start and not end:
        return None
    if start and start >= GULF_ERA_START:
        return True
    if end and end >= GULF_ERA_START:
        return True
    return False


def _onset_within_year_of_separation(condition: Condition, service_end: Optional[date]) -> bool:
    if not condition.onset_date or not service_end:
        return False
    return service_end <= condition.onset_date <= service_end + timedelta(days=365)


def evaluate_presumptive(
    claim: Claim,
    *,
    campaign_medals: Optional[List[str]] = None,
    deployments: Optional[List[str]] = None,
    mos_code: Optional[str] = None,
) -> List[PresumptiveHit]:
    """Run deterministic presumptive checks for each claimed condition."""
    hits: List[PresumptiveHit] = []
    medals = [_normalize(m) for m in (campaign_medals or [])]
    places = [_normalize(d) for d in (deployments or [])]
    mos = (mos_code or "").strip().upper()
    gulf_era = _gulf_era_service(claim)
    vietnam_medal = any(
        any(marker in medal for marker in VIETNAM_MEDAL_MARKERS)
        for medal in medals
    ) or any("vietnam" in place for place in places)
    service_end = _service_end(claim)

    for condition in claim.conditions:
        text = _condition_text(condition)
        hits.extend(_checks_for_condition(
            condition, text, gulf_era, vietnam_medal, mos, service_end,
        ))

    return hits


def _checks_for_condition(
    condition: Condition,
    text: str,
    gulf_era: Optional[bool],
    vietnam_medal: bool,
    mos: str,
    service_end: Optional[date],
) -> List[PresumptiveHit]:
    name = condition.name
    results: List[PresumptiveHit] = []

    if _has_keyword(text, PACT_RESPIRATORY_KEYWORDS):
        if gulf_era is True:
            results.append(PresumptiveHit(
                rule_id="pact_respiratory_gulf_era",
                result=RuleResult.MATCH,
                explanation=(
                    "Service on or after Aug 1990 plus a respiratory/PACT-related "
                    "condition may qualify for presumptive service connection."
                ),
                condition_name=name,
            ))
        elif gulf_era is False:
            results.append(PresumptiveHit(
                rule_id="pact_respiratory_gulf_era",
                result=RuleResult.NO_MATCH,
                explanation="Service dates do not show Gulf-era qualifying service.",
                condition_name=name,
            ))
        else:
            results.append(PresumptiveHit(
                rule_id="pact_respiratory_gulf_era",
                result=RuleResult.NOT_ENOUGH_DATA,
                explanation="Add service start/end dates to check PACT presumptive eligibility.",
                condition_name=name,
            ))

    if _has_keyword(text, AGENT_ORANGE_KEYWORDS) or _has_keyword(text, ["agent orange"]):
        if vietnam_medal:
            results.append(PresumptiveHit(
                rule_id="agent_orange_vietnam",
                result=RuleResult.MATCH,
                explanation=(
                    "Vietnam-era theater service is documented; this condition type "
                    "may qualify for Agent Orange presumptive rules."
                ),
                condition_name=name,
            ))
        else:
            results.append(PresumptiveHit(
                rule_id="agent_orange_vietnam",
                result=RuleResult.NOT_ENOUGH_DATA,
                explanation=(
                    "Add Vietnam campaign medal or deployment location from the DD-214 "
                    "to confirm Agent Orange presumptive eligibility."
                ),
                condition_name=name,
            ))

    if _has_keyword(text, ["tinnitus", "hearing", "ear ringing", "deaf"]):
        if mos and mos in NOISE_EXPOSURE_MOS:
            results.append(PresumptiveHit(
                rule_id="noise_exposure_mos",
                result=RuleResult.MATCH,
                explanation=(
                    f"MOS/rate {mos} is on VA's noise-exposure lookup; acoustic trauma "
                    "may be conceded for hearing-related claims."
                ),
                condition_name=name,
            ))
        elif mos:
            results.append(PresumptiveHit(
                rule_id="noise_exposure_mos",
                result=RuleResult.NO_MATCH,
                explanation=f"MOS/rate {mos} is not in our simplified noise-exposure table.",
                condition_name=name,
            ))
        else:
            results.append(PresumptiveHit(
                rule_id="noise_exposure_mos",
                result=RuleResult.NOT_ENOUGH_DATA,
                explanation="Add MOS/rate from the DD-214 to check noise-exposure presumptive rules.",
                condition_name=name,
            ))

    if _onset_within_year_of_separation(condition, service_end):
        results.append(PresumptiveHit(
            rule_id="chronic_within_one_year",
            result=RuleResult.MATCH,
            explanation=(
                "Symptom onset appears within one year of separation; some chronic "
                "conditions may qualify for the one-year presumptive window."
            ),
            condition_name=name,
        ))

    return results
