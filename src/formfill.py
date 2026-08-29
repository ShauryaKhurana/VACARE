"""Fill the VA Form 21-526EZ from a Claim.

The 526EZ is an AcroForm with 357 named fields, so filling it is a mapping
exercise rather than anything clever. What this module will not do is invent
data: anything we did not collect is left blank and reported in
`missing_for_form`, so the veteran and the VSO can see exactly what still has
to be written in by hand before signing.

The blank template is downloaded once into form_cache/ (gitignored) so the
repo does not carry a 2MB binary and so a form revision can be refreshed by
deleting the cache.
"""

from __future__ import annotations

import logging
import urllib.request
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import Dict, List, Optional

from pypdf import PdfReader, PdfWriter

from src.forms import CATALOG
from src.models import Claim

CACHE_DIR = Path(__file__).resolve().parent.parent / "form_cache"
TEMPLATE_PATH = CACHE_DIR / "21-526EZ.pdf"

# Field prefixes, straight out of the PDF.
HEADER = "F[0].Page_10[0]."
ROWS = "F[0].#subform[10]."
SERVICE = "F[0].#subform[11]."

MAX_DISABILITY_ROWS = 15

# The 526EZ has pages with no fields at all; pypdf warns on each one.
logging.getLogger("pypdf").setLevel(logging.ERROR)


def ensure_template(path: Path = TEMPLATE_PATH) -> Path:
    """Download the blank 526EZ once and keep it in the cache."""
    if path.exists() and path.stat().st_size > 100_000:
        return path
    path.parent.mkdir(parents=True, exist_ok=True)
    url = CATALOG["21-526EZ"].pdf
    with urllib.request.urlopen(url, timeout=120) as response:
        path.write_bytes(response.read())
    return path


def _row_date_field(index: int) -> str:
    """Date field for disability row `index`.

    The form names row 0's date `Date_Disability_Began_Or_Worsened[0]` and the
    remaining 14 rows `Date12[0..13]`. That is inferred from the field
    inventory, not from VA documentation, so it is isolated here.
    """
    if index == 0:
        return f"{ROWS}Date_Disability_Began_Or_Worsened[0]"
    return f"{ROWS}Date12[{index - 1}]"


def _split_date(value: Optional[date]) -> Dict[str, str]:
    if not value:
        return {"month": "", "day": "", "year": ""}
    return {"month": f"{value.month:02d}", "day": f"{value.day:02d}", "year": str(value.year)}


def _digits(value: Optional[str]) -> str:
    return "".join(character for character in (value or "") if character.isdigit())


def _service_link_sentence(claim: Claim, condition) -> str:
    """The 'explain how this relates to service' cell, in the veteran's terms."""
    pieces: List[str] = []
    if condition.started_in_service:
        pieces.append("Began during active service")
    if condition.worsened_in_service:
        pieces.append("Worsened during active service")

    event = claim.find_service_event(condition.service_event_id)
    if event:
        when = f" ({event.event_date})" if event.event_date else ""
        pieces.append(f"Related to: {event.title}{when}. {event.description}")

    if condition.current_symptoms:
        pieces.append(f"Current symptoms: {condition.current_symptoms}")

    return " ".join(pieces).strip()


def build_field_values(claim: Claim) -> Dict[str, str]:
    """Every field we can fill from the claim, as {pdf_field_name: value}."""
    veteran = claim.veteran
    values: Dict[str, str] = {}

    values[f"{HEADER}Veteran_Service_Member_First_Name[0]"] = veteran.first_name
    values[f"{HEADER}Veteran_Service_Member_Last_Name[0]"] = veteran.last_name

    dob = _split_date(veteran.dob)
    values[f"{HEADER}Date_Of_Birth_Month[0]"] = dob["month"]
    values[f"{HEADER}Date_Of_Birth_Day[0]"] = dob["day"]
    values[f"{HEADER}Date_Of_Birth_Year[0]"] = dob["year"]

    if veteran.email:
        values[f"{HEADER}Email_Address_Optional[0]"] = veteran.email

    phone = _digits(veteran.phone)
    if len(phone) >= 10:
        values[f"{HEADER}Daytime_Phone_Number_Area_Code[0]"] = phone[-10:-7]
        values[f"{HEADER}Telephone_Middle_Three_Numbers[0]"] = phone[-7:-4]
        values[f"{HEADER}Telephone_Last_Four_Numbers[0]"] = phone[-4:]

    # Service dates. The form calls the separation date "anticipated" because
    # the same box serves pre-discharge and post-discharge filers.
    entry = _split_date(veteran.service_start)
    values[f"{SERVICE}EntryDate_Month[0]"] = entry["month"]
    values[f"{SERVICE}MostRecentActiveServiceEntryDate_Day[0]"] = entry["day"]
    values[f"{SERVICE}EntryDate_Year[0]"] = entry["year"]

    separation = _split_date(veteran.service_end or claim.context.separation_date)
    values[f"{SERVICE}AnticipatedSeparationDate_Month[0]"] = separation["month"]
    values[f"{SERVICE}AnticipatedSeparationDate_Day[0]"] = separation["day"]
    values[f"{SERVICE}AnticipatedSeparationDate_Year[0]"] = separation["year"]

    for index, condition in enumerate(claim.conditions[:MAX_DISABILITY_ROWS]):
        values[f"{ROWS}CURRENTDISABILITY[{index}]"] = condition.name
        values[f"{ROWS}ExplainHowDisabilityRelatesToEvent_Exposure_Injury[{index}]"] = (
            _service_link_sentence(claim, condition)
        )
        if condition.onset_date:
            values[_row_date_field(index)] = condition.onset_date.strftime("%m/%d/%Y")

        event = claim.find_service_event(condition.service_event_id)
        if event:
            values[f"{ROWS}Specify_Type_Of_Exposure_Event_Or_Injury[{index}]"] = event.title

    signed = _split_date(date.today())
    values["F[0].#subform[12].Date_Signed_Month[0]"] = signed["month"]
    values["F[0].#subform[12].Date_Signed_Day[0]"] = signed["day"]
    values["F[0].#subform[12].Date_Signed_Year[0]"] = signed["year"]

    return {name: value for name, value in values.items() if value}


def missing_for_form(claim: Claim) -> List[str]:
    """Required 526EZ items VACARE never collects. The veteran writes these in."""
    gaps: List[str] = []
    veteran = claim.veteran

    gaps.append("Social Security number (we deliberately do not store one)")
    gaps.append("Mailing address")
    gaps.append("Signature and date (the form must be signed by hand or digitally)")

    if not veteran.service_start:
        gaps.append("Date entered active service")
    if not (veteran.service_end or claim.context.separation_date):
        gaps.append("Separation date")
    if not veteran.phone:
        gaps.append("Daytime phone number")
    if len(claim.conditions) > MAX_DISABILITY_ROWS:
        gaps.append(
            f"{len(claim.conditions) - MAX_DISABILITY_ROWS} extra conditions "
            "(the form has 15 rows; the rest go on a 21-4138)"
        )
    return gaps


@dataclass
class FillResult:
    output_path: Path
    filled_fields: int
    still_needed: List[str]


def fill_526ez(claim: Claim, output_path: Path, template: Optional[Path] = None) -> FillResult:
    """Write a filled 21-526EZ for this claim."""
    template_path = ensure_template(template or TEMPLATE_PATH)
    reader = PdfReader(str(template_path))
    writer = PdfWriter()
    writer.append(reader)

    # Without this, some viewers show the values only after the field is clicked.
    writer.set_need_appearances_writer(True)

    values = build_field_values(claim)
    for page in writer.pages:
        writer.update_page_form_field_values(page, values)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "wb") as handle:
        writer.write(handle)

    return FillResult(
        output_path=output_path,
        filled_fields=len(values),
        still_needed=missing_for_form(claim),
    )
