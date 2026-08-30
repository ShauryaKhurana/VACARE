"""Generate a realistic synthetic DD-214 PDF for local testing.

Requires: pip install fpdf2

Usage:
    python scripts/generate_sample_dd214.py
    -> writes tests/fixtures/sample_dd214.pdf
"""

from pathlib import Path

from fpdf import FPDF

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "tests" / "fixtures" / "sample_dd214.pdf"


class SampleDD214(FPDF):
    def header(self):
        self.set_font("Helvetica", "B", 9)
        self.cell(0, 4, "DEPARTMENT OF DEFENSE", align="C", new_x="LMARGIN", new_y="NEXT")
        self.set_font("Helvetica", "B", 11)
        self.cell(0, 5, "CERTIFICATE OF RELEASE OR DISCHARGE FROM ACTIVE DUTY", align="C", new_x="LMARGIN", new_y="NEXT")
        self.set_font("Helvetica", "", 8)
        self.cell(0, 4, "ARMED FORCES OF THE UNITED STATES", align="C", new_x="LMARGIN", new_y="NEXT")
        self.ln(1)
        self.set_font("Helvetica", "B", 10)
        self.cell(130, 5, "DD FORM 214")
        self.set_font("Helvetica", "", 8)
        self.cell(0, 5, "REPORT OF SEPARATION", align="R", new_x="LMARGIN", new_y="NEXT")
        self.ln(2)

    def field_box(self, num, label, value, w=190, h=12, multiline=False):
        self.set_font("Helvetica", "", 7)
        self.set_text_color(80, 80, 80)
        self.cell(w, 4, f"{num}. {label}")
        self.ln(3)
        self.set_draw_color(0, 0, 0)
        self.set_line_width(0.3)
        y = self.get_y()
        self.rect(self.l_margin, y, w, h)
        self.set_xy(self.l_margin + 2, y + 2)
        self.set_font("Courier", "B" if not multiline else "", 9 if not multiline else 8)
        self.set_text_color(0, 0, 0)
        if multiline:
            self.multi_cell(w - 4, 4, value)
        else:
            self.cell(w - 4, h - 4, value)
        self.set_y(y + h + 2)


def build_pdf() -> FPDF:
    pdf = SampleDD214()
    pdf.set_auto_page_break(auto=True, margin=15)
    pdf.add_page()

    pdf.field_box("1", "NAME (Last, First, Middle Initial)", "REYES, DANA MARIE")
    pdf.set_font("Helvetica", "", 8)
    pdf.cell(95, 5, "2. DEPARTMENT / COMPONENT / BRANCH")
    pdf.cell(95, 5, "3. SOCIAL SECURITY NUMBER", new_x="LMARGIN", new_y="NEXT")
    y = pdf.get_y()
    pdf.rect(10, y, 95, 10)
    pdf.rect(105, y, 95, 10)
    pdf.set_xy(12, y + 2)
    pdf.set_font("Courier", "B", 9)
    pdf.cell(90, 6, "ARMY / ACTIVE DUTY / USA")
    pdf.set_xy(107, y + 2)
    pdf.set_font("Courier", "", 9)
    pdf.cell(90, 6, "XXX-XX-4321")
    pdf.set_y(y + 12)

    pdf.set_font("Helvetica", "", 8)
    pdf.cell(63, 5, "4. GRADE, RATE OR RANK")
    pdf.cell(63, 5, "5. DATE OF BIRTH (YYYYMMDD)")
    pdf.cell(64, 5, "6. RESERVE OBLIGATION TERMINATION", new_x="LMARGIN", new_y="NEXT")
    y = pdf.get_y()
    for x, w, val in [(10, 63, "E-5 / SGT"), (73, 63, "19880312"), (136, 64, "NONE")]:
        pdf.rect(x, y, w, 10)
        pdf.set_xy(x + 2, y + 2)
        pdf.set_font("Courier", "B", 9)
        pdf.cell(w - 4, 6, val)
    pdf.set_y(y + 12)

    pdf.field_box("7a", "DATE OF SEPARATION OR TRANSFER TO RESERVE (YYYYMMDD)", "20130830", h=10)
    pdf.field_box("7b", "TYPE OF SEPARATION", "DISCHARGE", h=10)

    pdf.set_font("Helvetica", "B", 8)
    pdf.cell(0, 5, "PERIOD(S) OF SERVICE", new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Helvetica", "", 8)
    pdf.cell(95, 5, "12a. DATE ENTERED ACTIVE DUTY THIS PERIOD")
    pdf.cell(95, 5, "12b. SEPARATION DATE THIS PERIOD", new_x="LMARGIN", new_y="NEXT")
    y = pdf.get_y()
    pdf.rect(10, y, 95, 10)
    pdf.rect(105, y, 95, 10)
    pdf.set_xy(12, y + 2)
    pdf.set_font("Courier", "B", 10)
    pdf.cell(90, 6, "20070601")
    pdf.set_xy(107, y + 2)
    pdf.cell(90, 6, "20130830")
    pdf.set_y(y + 12)

    pdf.field_box("12c", "NET ACTIVE SERVICE THIS PERIOD", "6 YEARS 2 MONTHS 29 DAYS", h=10)
    pdf.field_box("13", "PRIMARY SPECIALTY (MOS/AOC/NEC) AND NUMBER / TITLE", "11B / INFANTRYMAN", h=10)
    pdf.field_box("14", "LAST DUTY ASSIGNMENT AND STATION", "1ST BRIGADE, 82ND AIRBORNE DIVISION, FORT BRAGG, NC", h=12)

    pdf.add_page()
    pdf.set_font("Helvetica", "B", 9)
    pdf.cell(0, 5, "RECORD OF SERVICE (continued)", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(2)

    pdf.field_box("18", "REMARKS", "COMBAT INFANTRYMAN BADGE. DEPLOYED OEF 2010-2011 AFGHANISTAN.", h=14, multiline=True)
    pdf.field_box("24", "CHARACTER OF SERVICE", "HONORABLE", h=10)
    pdf.field_box("26", "SEPARATION AUTHORITY", "AR 635-200, CHAPTER 8", h=10)
    pdf.field_box("27", "REENTRY CODE", "RE-1", h=10)

    pdf.set_font("Helvetica", "B", 8)
    pdf.cell(0, 5, "28. DECORATIONS, MEDALS, BADGES, CITATIONS AND CAMPAIGN RIBBONS AWARDED OR AUTHORIZED", new_x="LMARGIN", new_y="NEXT")
    y = pdf.get_y()
    pdf.rect(10, y, 190, 28)
    pdf.set_xy(12, y + 2)
    pdf.set_font("Courier", "", 8)
    pdf.multi_cell(
        186,
        4,
        "AFGHANISTAN CAMPAIGN MEDAL WITH CAMPAIGN STAR\n"
        "ARMY COMMENDATION MEDAL\n"
        "ARMY ACHIEVEMENT MEDAL\n"
        "NATIONAL DEFENSE SERVICE MEDAL\n"
        "GLOBAL WAR ON TERRORISM SERVICE MEDAL\n"
        "COMBAT INFANTRYMAN BADGE",
    )
    pdf.set_y(y + 30)

    pdf.field_box("30", "DEPARTURE FROM SERVICE LOCATION", "FORT BRAGG, NC", h=10)
    pdf.field_box("31", "TYPE OF DISCHARGE", "REGULAR", h=10)

    pdf.ln(4)
    pdf.set_font("Helvetica", "I", 7)
    pdf.set_text_color(100, 100, 100)
    pdf.multi_cell(
        0,
        3,
        "SYNTHETIC SAMPLE FOR VACARE TESTING ONLY - NOT AN OFFICIAL MILITARY DOCUMENT. "
        "Contains fictional veteran Dana Reyes for hackathon document parsing demos.",
    )
    return pdf


def main() -> None:
    OUT.parent.mkdir(parents=True, exist_ok=True)
    build_pdf().output(str(OUT))
    print(f"Wrote {OUT}")


if __name__ == "__main__":
    main()
