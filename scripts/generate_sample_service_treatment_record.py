"""Generate a synthetic in-service treatment record PDF for local testing.

Requires: pip install fpdf2

Usage:
    python scripts/generate_sample_service_treatment_record.py
    -> writes tests/fixtures/sample_service_treatment_record.pdf
"""

from pathlib import Path

from fpdf import FPDF

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "tests" / "fixtures" / "sample_service_treatment_record.pdf"


class ServiceTreatmentRecord(FPDF):
    def header(self):
        self.set_font("Helvetica", "B", 10)
        self.cell(0, 5, "DEPARTMENT OF THE ARMY", align="C", new_x="LMARGIN", new_y="NEXT")
        self.set_font("Helvetica", "", 9)
        self.cell(0, 4, "1ST BRIGADE COMBAT TEAM, 82ND AIRBORNE DIVISION", align="C", new_x="LMARGIN", new_y="NEXT")
        self.cell(0, 4, "SERVICE TREATMENT RECORD / FIELD MEDICAL ENCOUNTER", align="C", new_x="LMARGIN", new_y="NEXT")
        self.ln(3)

    def section(self, title: str) -> None:
        self.set_font("Helvetica", "B", 9)
        self.set_fill_color(240, 240, 240)
        self.cell(0, 6, title, fill=True, new_x="LMARGIN", new_y="NEXT")
        self.ln(1)


def build_pdf() -> FPDF:
    pdf = ServiceTreatmentRecord()
    pdf.set_auto_page_break(auto=True, margin=15)
    pdf.add_page()

    pdf.set_font("Helvetica", "", 8)
    pdf.cell(95, 4, "Patient: REYES, DANA MARIE")
    pdf.cell(95, 4, "Encounter date: 2011-04-09", new_x="LMARGIN", new_y="NEXT")
    pdf.cell(95, 4, "DOB: 03/12/1988")
    pdf.cell(95, 4, "Rank / MOS: SGT / 11B Infantryman", new_x="LMARGIN", new_y="NEXT")
    pdf.cell(95, 4, "Unit: A Co, 2-504 PIR")
    pdf.cell(95, 4, "Location: Kandahar Province, Afghanistan", new_x="LMARGIN", new_y="NEXT")
    pdf.cell(0, 4, "Provider: CPT Rebecca Holt, PA-C - Role 1 Aid Station", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(3)

    pdf.section("CHIEF COMPLAINT / MECHANISM OF INJURY")
    pdf.set_font("Helvetica", "", 9)
    pdf.multi_cell(
        0,
        4,
        "Patient evaluated after IED blast during mounted patrol. Reports acute bilateral ear "
        "pain and ringing, headache, and lower back pain after vehicle impact. No loss of "
        "consciousness reported; oriented x4 at scene.",
    )
    pdf.ln(2)

    pdf.section("ASSESSMENT / DIAGNOSES")
    pdf.set_font("Courier", "", 8)
    for row in [
        "Acoustic trauma / tinnitus, bilateral - service-related blast exposure",
        "Lumbar strain without radiculopathy",
        "Headache, post-concussive symptoms - monitor",
    ]:
        pdf.cell(0, 4, row, new_x="LMARGIN", new_y="NEXT")
    pdf.ln(2)

    pdf.section("TREATMENT PROVIDED IN THEATER")
    pdf.set_font("Helvetica", "", 9)
    pdf.multi_cell(
        0,
        4,
        "- Ibuprofen 800 mg PO x3 days\n"
        "- Cervical/lumbar spine assessment; no acute neuro deficit\n"
        "- Hearing conservation referral placed\n"
        "- Light duty 72 hours; return to clinic if symptoms worsen\n"
        "- Documented in unit AAR as in-service blast injury",
    )
    pdf.ln(2)

    pdf.section("FOLLOW-UP")
    pdf.set_font("Helvetica", "", 9)
    pdf.multi_cell(
        0,
        4,
        "Follow-up at Role 1 on 2011-04-12: persistent tinnitus and intermittent back pain. "
        "Patient cleared for modified duty; recommended audiology evaluation upon redeployment.",
    )
    pdf.ln(4)
    pdf.set_font("Helvetica", "I", 7)
    pdf.set_text_color(100, 100, 100)
    pdf.multi_cell(
        0,
        3,
        "SYNTHETIC SAMPLE FOR VACARE TESTING ONLY - NOT A REAL MILITARY MEDICAL RECORD. "
        "Fictional veteran Dana Reyes for hackathon document parsing demos.",
    )
    return pdf


def main() -> None:
    OUT.parent.mkdir(parents=True, exist_ok=True)
    build_pdf().output(str(OUT))
    print(f"Wrote {OUT}")


if __name__ == "__main__":
    main()
