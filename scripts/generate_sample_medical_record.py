"""Generate a synthetic VA clinic medical record PDF for local testing.

Requires: pip install fpdf2

Usage:
    python scripts/generate_sample_medical_record.py
    -> writes tests/fixtures/sample_medical_record.pdf
"""

from pathlib import Path

from fpdf import FPDF

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "tests" / "fixtures" / "sample_medical_record.pdf"


class ClinicNote(FPDF):
    def header(self):
        self.set_font("Helvetica", "B", 10)
        self.cell(0, 5, "DEPARTMENT OF VETERANS AFFAIRS", align="C", new_x="LMARGIN", new_y="NEXT")
        self.set_font("Helvetica", "", 9)
        self.cell(0, 4, "VA Medical Center - Durham, North Carolina", align="C", new_x="LMARGIN", new_y="NEXT")
        self.cell(0, 4, "Health Summary / Progress Note", align="C", new_x="LMARGIN", new_y="NEXT")
        self.ln(3)

    def section(self, title: str) -> None:
        self.set_font("Helvetica", "B", 9)
        self.set_fill_color(240, 240, 240)
        self.cell(0, 6, title, fill=True, new_x="LMARGIN", new_y="NEXT")
        self.ln(1)


def build_pdf() -> FPDF:
    pdf = ClinicNote()
    pdf.set_auto_page_break(auto=True, margin=15)
    pdf.add_page()

    pdf.set_font("Helvetica", "", 8)
    pdf.cell(95, 4, "Patient: REYES, DANA MARIE")
    pdf.cell(95, 4, "Date of visit: 2026-03-14", new_x="LMARGIN", new_y="NEXT")
    pdf.cell(95, 4, "DOB: 03/12/1988")
    pdf.cell(95, 4, "MRN: VA-DUR-004821", new_x="LMARGIN", new_y="NEXT")
    pdf.cell(95, 4, "Service era: OEF / Army")
    pdf.cell(95, 4, "Provider: Dr. Elena Morales, MD - Primary Care", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(3)

    pdf.section("CHIEF COMPLAINT")
    pdf.set_font("Helvetica", "", 9)
    pdf.multi_cell(
        0,
        4,
        "Follow-up for bilateral tinnitus, hearing difficulty, and chronic low back pain. "
        "Veteran reports ringing in both ears since 2011 after blast exposure in Afghanistan.",
    )
    pdf.ln(2)

    pdf.section("ACTIVE PROBLEM LIST / DIAGNOSES")
    pdf.set_font("Courier", "", 8)
    rows = [
        "H93.19  Tinnitus, bilateral, subjective",
        "H90.3   Sensorineural hearing loss, bilateral",
        "M54.50  Low back pain, unspecified",
        "F43.10  Post-traumatic stress disorder, unspecified (monitoring)",
    ]
    for row in rows:
        pdf.cell(0, 4, row, new_x="LMARGIN", new_y="NEXT")
    pdf.ln(2)

    pdf.section("HISTORY OF PRESENT ILLNESS")
    pdf.set_font("Helvetica", "", 9)
    pdf.multi_cell(
        0,
        4,
        "Ms. Reyes is a 38-year-old Army veteran who served 2007-2013 with deployment to "
        "Afghanistan 2010-2011. She describes constant high-pitched ringing in both ears "
        "since an IED blast in April 2011. Symptoms worsen in quiet rooms and interfere with "
        "sleep. She also reports chronic lumbar pain worsened by prolonged standing; pain "
        "began during service and has persisted since separation. Currently treated in VA "
        "audiology and physical therapy.",
    )
    pdf.ln(2)

    pdf.section("TREATMENT / PLAN")
    pdf.set_font("Helvetica", "", 9)
    pdf.multi_cell(
        0,
        4,
        "- Continue audiology follow-up; hearing aids evaluated 2025-11-02\n"
        "- Tinnitus retraining therapy referral active\n"
        "- Naproxen PRN for back pain; PT twice weekly\n"
        "- Return in 90 days or sooner if worsening",
    )
    pdf.ln(2)

    pdf.section("TREATING PROVIDERS")
    pdf.set_font("Courier", "", 8)
    for provider in [
        "Dr. Elena Morales, MD - Primary Care, VA Durham",
        "Dr. James Okonkwo, AuD - Audiology, VA Durham",
        "PT: Sarah Chen, DPT - Physical Therapy, VA Durham",
    ]:
        pdf.cell(0, 4, provider, new_x="LMARGIN", new_y="NEXT")

    pdf.ln(4)
    pdf.set_font("Helvetica", "I", 7)
    pdf.set_text_color(100, 100, 100)
    pdf.multi_cell(
        0,
        3,
        "SYNTHETIC SAMPLE FOR VACARE TESTING ONLY - NOT A REAL MEDICAL RECORD. "
        "Fictional veteran Dana Reyes for hackathon document parsing demos.",
    )
    return pdf


def main() -> None:
    OUT.parent.mkdir(parents=True, exist_ok=True)
    build_pdf().output(str(OUT))
    print(f"Wrote {OUT}")


if __name__ == "__main__":
    main()
