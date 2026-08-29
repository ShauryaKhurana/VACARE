"""Catalog of VA forms, transcribed from va-forms-download-manifest.html.

One entry per form: what it is, who physically fills it out, and where to get
the PDF. Nothing here is claim-specific; src/lanes.py decides which of these a
given veteran actually needs.

Revision dates are as of the manifest (Aug 29, 2026). Form numbers and URLs
drift, so `landing` is always the safe link when a direct PDF 404s.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import Dict, List, Optional


class FilledBy(str, Enum):
    """Who physically completes and signs the form."""

    VETERAN = "veteran"
    VSO = "vso"                # veteran signs, rep countersigns
    DOCTOR = "doctor"
    EMPLOYER = "employer"
    WITNESS = "witness"
    FACILITY = "facility"
    VA = "va"                  # VA issues it; nobody fills it in
    SURVIVOR = "survivor"


# Third parties the veteran has to chase. The doc's point: these are
# dependencies with their own state, not tasks the veteran can just do.
THIRD_PARTY = {FilledBy.DOCTOR, FilledBy.EMPLOYER, FilledBy.WITNESS, FilledBy.FACILITY}


@dataclass(frozen=True)
class Form:
    number: str
    title: str
    filled_by: FilledBy
    pdf: Optional[str] = None
    landing: Optional[str] = None
    note: Optional[str] = None      # the lock or gotcha, in one line
    verified: bool = False          # URL confirmed live in the manifest

    @property
    def is_third_party(self) -> bool:
        return self.filled_by in THIRD_PARTY

    @property
    def best_link(self) -> str:
        return self.pdf or self.landing or ""


VBA = "https://www.vba.va.gov/pubs/forms/vba-{}-are.pdf"
LANDING = "https://www.va.gov/find-forms/about-form-{}/"


def _vba(number: str, title: str, filled_by: FilledBy, note: str = "", verified: bool = False) -> Form:
    """Most VBA forms follow one URL pattern; this keeps the table readable."""
    slug = number.lower()
    return Form(
        number=number,
        title=title,
        filled_by=filled_by,
        pdf=VBA.format(slug),
        landing=LANDING.format(slug),
        note=note or None,
        verified=verified,
    )


CATALOG: Dict[str, Form] = {form.number: form for form in [
    # -- Stage 0: representation, authorization, effective date ---------------
    _vba("21-22", "Appointment of Veterans Service Organization as Representative", FilledBy.VSO,
         "One POA at a time. Filing a new 21-22 or 21-22a silently revokes the prior one."),
    _vba("21-22a", "Appointment of Individual as Claimant's Representative", FilledBy.VSO,
         "Same revocation rule. Attorneys may only charge for work after an initial decision."),
    _vba("21-0845", "Authorization to Disclose Personal Information to a Third Party", FilledBy.VETERAN,
         "Without this or a POA, VA will not speak to anyone but the veteran."),
    _vba("21-0972", "Alternate Signer Certification", FilledBy.VETERAN,
         "Must be on file before anyone else's signature on a claim form is accepted."),
    _vba("21-0966", "Intent to File a Claim", FilledBy.VETERAN,
         "Locks the effective date for 12 months. One active ITF per benefit type."),

    # -- Core claim forms -----------------------------------------------------
    _vba("21-526EZ", "Application for Disability Compensation (Rev Jan 2026)", FilledBy.VETERAN,
         "The master application. Covers lanes 1-4; the lane is a checkbox on the form.",
         verified=True),
    _vba("21-0819", "VA/DoD Joint Disability Evaluation Board Claim (IDES)", FilledBy.VETERAN,
         "Triggered by an MEB referral, not veteran-initiated."),

    # -- Statements, evidence, records ---------------------------------------
    _vba("21-0781", "Statement in Support of Claimed Mental Health Disorder(s)", FilledBy.VETERAN,
         "Required whenever a mental health condition is claimed. 21-0781a was discontinued Jun 2024.",
         verified=True),
    _vba("21-4138", "Statement in Support of Claim", FilledBy.VETERAN,
         "A blank page in the veteran's own words. This is NOT the nexus letter."),
    _vba("21-10210", "Lay/Witness Statement (buddy statement)", FilledBy.WITNESS,
         "The witness fills and signs it, not the veteran."),
    _vba("21-4142", "Authorization to Disclose Information to VA", FilledBy.VETERAN,
         "Signature expires 12 months from the date signed. Track the date, not just existence."),
    _vba("21-4142a", "General Release for Medical Provider Information", FilledBy.VETERAN,
         "The list of providers that accompanies the 4142."),
    _vba("20-10206", "FOIA / Privacy Act Request (C-file pull)", FilledBy.VETERAN),
    _vba("20-10207", "Priority Processing Request", FilledBy.VETERAN),

    # -- Special benefits -----------------------------------------------------
    _vba("21-8940", "Application for Increased Compensation Based on Unemployability (TDIU)", FilledBy.VETERAN,
         "Mandatory before TDIU can be granted. VA will not infer it from the record."),
    _vba("21-4192", "Request for Employment Information (TDIU companion)", FilledBy.EMPLOYER,
         "Each employer from the last year of employment completes one."),
    _vba("21-4140", "Employment Questionnaire (annual TDIU verification)", FilledBy.VETERAN,
         "Arrives annually after a TDIU grant. Non-return triggers a proposed reduction."),
    _vba("21-2680", "Examination for Housebound Status or Aid and Attendance", FilledBy.DOCTOR,
         "The veteran cannot self-complete this. A physician performs and signs it."),
    _vba("21-0779", "Request for Nursing Home Information for Aid and Attendance", FilledBy.FACILITY,
         "Completed by the nursing home's office."),
    _vba("26-4555", "Specially Adapted Housing / Special Home Adaptation Grant", FilledBy.VETERAN,
         "Comes after the qualifying rating exists, not with the claim."),
    _vba("21-4502", "Application for Automobile or Other Conveyance and Adaptive Equipment", FilledBy.VETERAN,
         "Buying the vehicle before VA approves kills the benefit. Approval first, purchase second."),
    Form("10-1394", "Application for Adaptive Equipment - Motor Vehicle", FilledBy.VETERAN,
         pdf="https://www.va.gov/vaforms/medical/pdf/10-1394-fill.pdf",
         landing=LANDING.format("10-1394"),
         note="Separate from the auto allowance, and repeatable.", verified=True),
    Form("10-8678", "Application for Annual Clothing Allowance", FilledBy.VETERAN,
         pdf="https://www.va.gov/vaforms/medical/pdf/10-8678-fill.pdf",
         landing=LANDING.format("10-8678"),
         note="Hard annual deadline: August 1. Miss it and you wait a year."),
    _vba("21-686c", "Request to Add and/or Remove Dependents", FilledBy.VETERAN,
         "Pays only at a combined 30%+. Filed within 1 year of that rating, retro runs to the rating date."),
    _vba("21-674", "Request for Approval of School Attendance (child 18-23)", FilledBy.VETERAN),
    _vba("21-0538", "Mandatory Verification of Dependents", FilledBy.VETERAN),
    _vba("21-8951-2", "Waiver of VA Compensation to Receive Military Pay (drill pay)", FilledBy.VETERAN,
         "Annual. Guard/Reserve only. Ignoring it creates a debt letter."),

    # -- Decision review ------------------------------------------------------
    _vba("20-0995", "Decision Review Request: Supplemental Claim", FilledBy.VETERAN,
         "New evidence required. Duty to assist reattaches. File within 1 year to keep the original pay date."),
    _vba("20-0996", "Decision Review Request: Higher-Level Review", FilledBy.VETERAN,
         "Hard 1-year deadline. No new evidence accepted. Cannot HLR an HLR or a Board decision."),
    Form("10182", "Decision Review Request: Board Appeal (NOD)", FilledBy.VETERAN,
         pdf="https://www.va.gov/vaforms/va/pdf/VA10182.pdf",
         landing=LANDING.format("10182"),
         note="Hard 1-year deadline. Pick a docket on the form. Cannot file two Board appeals in a row.",
         verified=True),
    _vba("21-0958", "Notice of Disagreement (legacy system only)", FilledBy.VETERAN,
         "Only for decisions dated before Feb 19, 2019 still in the legacy system."),
    Form("VA Form 9", "Appeal to Board of Veterans' Appeals (legacy substantive appeal)", FilledBy.VETERAN,
         pdf="https://www.va.gov/vaforms/va/pdf/VA9.pdf",
         landing=LANDING.format("va9"),
         note="Due 60 days after the SOC, or the remainder of the 1-year NOD window, whichever is later."),

    # -- Survivor and debt ----------------------------------------------------
    _vba("21P-534EZ", "Application for DIC, Survivors Pension, and/or Accrued Benefits", FilledBy.SURVIVOR,
         "DIC filed within 1 year of death pays from the month of death."),
    _vba("21P-0847", "Request for Substitution of Claimant Upon Death", FilledBy.SURVIVOR,
         "Within 1 year of death."),
    _vba("21P-601", "Application for Accrued Amounts Due a Deceased Beneficiary", FilledBy.SURVIVOR,
         "Within 1 year of death."),
    _vba("21P-530EZ", "Application for Burial Benefits", FilledBy.SURVIVOR),
    _vba("5655", "Financial Status Report (overpayment waiver)", FilledBy.VETERAN,
         "Waiver request within 180 days of the debt notice."),

    # -- DoD ------------------------------------------------------------------
    Form("DD 293", "Application for Review of Discharge (DRB)", FilledBy.VETERAN,
         pdf="https://www.esd.whs.mil/Portals/54/Documents/DD/forms/dd/dd0293.pdf",
         landing="https://www.esd.whs.mil/Directives/forms/",
         note="Within 15 years of separation.", verified=True),
    Form("DD 149", "Application for Correction of Military Record (BCM/NR)", FilledBy.VETERAN,
         pdf="https://www.esd.whs.mil/Portals/54/Documents/DD/forms/dd/dd0149.pdf",
         landing="https://www.esd.whs.mil/Directives/forms/",
         note="Beyond 15 years, or when the DRB cannot help.", verified=True),

    # -- Not a form, but the veteran has to produce it -------------------------
    Form("DD-214", "Certificate of Release or Discharge from Active Duty", FilledBy.VETERAN,
         landing="https://milconnect.dmdc.osd.mil/",
         note="Not a fillable form. Retrieved via milConnect or an SF-180 to NPRC."),
    Form("Nexus letter", "Medical opinion linking the condition to service", FilledBy.DOCTOR,
         note="No VA form number exists. On a doctor's letterhead, using 'at least as likely as not'."),
    Form("DBQ", "Disability Benefits Questionnaire (21-0960 series)", FilledBy.DOCTOR,
         landing="https://www.benefits.va.gov/compensation/dbq_publicdbqs.asp",
         note="~70 condition-specific forms. Pick by diagnostic code from the VA index."),
]}


def get(number: str) -> Form:
    """Look up a form, failing loudly on a typo rather than silently dropping it."""
    if number not in CATALOG:
        raise KeyError(f"Unknown form number: {number}")
    return CATALOG[number]


def all_forms() -> List[Form]:
    return list(CATALOG.values())
