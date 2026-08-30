"""Filling the 21-526EZ."""

import pytest
from pypdf import PdfReader

from src import formfill
from src.formfill import TEMPLATE_PATH, build_field_values, fill_526ez, missing_for_form
from src.sample_data import build_sample_claim

HEADER = formfill.HEADER
ROWS = formfill.ROWS

needs_template = pytest.mark.skipif(
    not TEMPLATE_PATH.exists(), reason="blank 526EZ not cached; run once with network access"
)


def test_field_values_cover_identity_conditions_and_service_dates():
    values = build_field_values(build_sample_claim())

    assert values[f"{HEADER}Veteran_Service_Member_First_Name[0]"] == "Dana"
    assert values[f"{HEADER}Date_Of_Birth_Year[0]"] == "1988"
    assert values[f"{HEADER}Date_Of_Birth_Month[0]"] == "03"      # zero padded
    assert values[f"{ROWS}CURRENTDISABILITY[0]"] == "Tinnitus"
    assert values[f"{ROWS}CURRENTDISABILITY[1]"] == "Lower back pain"
    assert values["F[0].#subform[11].AnticipatedSeparationDate_Year[0]"] == "2013"


def test_phone_is_split_into_the_three_boxes_the_form_uses():
    values = build_field_values(build_sample_claim())
    assert values[f"{HEADER}Daytime_Phone_Number_Area_Code[0]"] == "555"
    assert values[f"{HEADER}Telephone_Middle_Three_Numbers[0]"] == "014"
    assert values[f"{HEADER}Telephone_Last_Four_Numbers[0]"] == "2277"


def test_the_service_link_cell_explains_the_connection():
    values = build_field_values(build_sample_claim())
    explanation = values[f"{ROWS}ExplainHowDisabilityRelatesToEvent_Exposure_Injury[0]"]
    assert "Began during active service" in explanation
    assert "Convoy IED blast" in explanation


def test_row_zero_uses_a_differently_named_date_field():
    """The form names row 0's date field differently from rows 1-14."""
    assert formfill._row_date_field(0).endswith("Date_Disability_Began_Or_Worsened[0]")
    assert formfill._row_date_field(1).endswith("Date12[0]")
    assert formfill._row_date_field(14).endswith("Date12[13]")


def test_empty_values_are_not_written():
    claim = build_sample_claim()
    claim.veteran.email = None
    claim.veteran.phone = None
    values = build_field_values(claim)
    assert not any(value == "" for value in values.values())
    assert f"{HEADER}Email_Address_Optional[0]" not in values


def test_nothing_is_invented_for_data_we_do_not_have():
    """Blank because it was never given -- not because we withhold it."""
    claim = build_sample_claim()          # no SSN or address collected
    values = build_field_values(claim)
    assert not any("SocialSecurity" in name for name in values)
    assert not any("MailingAddress" in name for name in values)

    gaps = " ".join(missing_for_form(claim))
    assert "Social Security" in gaps and "Mailing address" in gaps


def test_everything_we_have_is_filled_in():
    """Given an SSN and address, every box that takes them is populated."""
    from src.models import MailingAddress

    claim = build_sample_claim()
    claim.veteran.ssn = "000-00-0000"
    claim.veteran.address = MailingAddress(
        street="3114 Elm Street", city="Tucson", state="AZ", zip_code="857011234",
    )
    values = build_field_values(claim)

    # The form repeats the SSN in every page header, so all of them count.
    first_three = [n for n in values if "SocialSecurityNumber_FirstThreeNumbers" in n]
    assert len(first_three) >= 7, "an SSN box was left blank on some page"
    assert all(values[name] == "000" for name in first_three)

    assert values[f"{HEADER}CurrentMailingAddress_NumberAndStreet[0]"] == "3114 Elm Street"
    assert values[f"{HEADER}CurrentMailingAddress_City[0]"] == "Tucson"
    assert values[f"{HEADER}CurrentMailingAddress_StateOrProvince[0]"] == "AZ"
    assert values[f"{HEADER}CurrentMailingAddress_ZIPOrPostalCode_FirstFiveNumbers[0]"] == "85701"
    assert values[f"{HEADER}CurrentMailingAddress_ZIPOrPostalCode_LastFourNumbers[0]"] == "1234"

    # Only a signature is left, because a form must be signed by a person.
    gaps = missing_for_form(claim)
    assert len(gaps) == 1 and "Signature" in gaps[0]


def test_more_conditions_than_rows_is_reported():
    claim = build_sample_claim()
    template = claim.conditions[0]
    while len(claim.conditions) <= formfill.MAX_DISABILITY_ROWS:
        extra = template.model_copy(update={"id": f"x{len(claim.conditions)}",
                                            "name": f"Condition {len(claim.conditions)}"})
        claim.conditions.append(extra)

    values = build_field_values(claim)
    rows = [name for name in values if "CURRENTDISABILITY" in name]
    assert len(rows) == formfill.MAX_DISABILITY_ROWS
    assert any("extra conditions" in gap for gap in missing_for_form(claim))


@needs_template
def test_filling_produces_a_pdf_with_the_values_embedded(tmp_path):
    output = tmp_path / "filled.pdf"
    result = fill_526ez(build_sample_claim(), output)

    assert output.exists() and output.stat().st_size > 100_000
    assert result.filled_fields > 15

    fields = PdfReader(str(output)).get_fields()
    assert fields[f"{HEADER}Veteran_Service_Member_First_Name[0]"]["/V"] == "Dana"
    assert fields[f"{ROWS}CURRENTDISABILITY[0]"]["/V"] == "Tinnitus"
