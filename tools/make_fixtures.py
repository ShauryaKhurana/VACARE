"""Generate synthetic test documents for VACARE.

Real DD-214s posted online belong to real veterans - full name, date of birth,
and Social Security number on one page. We do not want those in a repository or
sent to an API, so this script fabricates documents instead.

Everything produced here is stamped SPECIMEN, uses obviously fictional people,
and carries SSN 000-00-0000, which is a number the SSA has never issued.

    python tools/make_fixtures.py

Writes into tests/fixtures/:
    dd214_clean.png       - as if scanned properly
    dd214_scanned.jpg     - rotated, grey, noisy, JPEG artifacts (the real case)
    dd214.txt             - plain text, for fast tests with no image decoding
    medical_record.png    - a clinic note naming two conditions
    decision_letter.png   - a rating decision, for the Lane 5 clocks
"""

from __future__ import annotations

import random
from datetime import date, timedelta
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

FIXTURES = Path(__file__).resolve().parent.parent / "tests" / "fixtures"
WIDTH, HEIGHT = 1700, 2200

VETERAN = {
    "name": "RIVERA, MARCUS ANTHONY",
    "ssn": "000-00-0000",
    "branch": "ARMY / RA",
    "rank": "SGT / E-5",
    "dob": "1990 07 22",
    "entered": "2009 09 14",
    "separated": "2016 11 03",
    "net_service": "07  01  20",
    "character": "HONORABLE",
    "place_entry": "FORT BENNING, GA",
    "home_of_record": "3114 ELM STREET, TUCSON, AZ 85701",
    "station": "FORT CARSON, CO",
    "decorations": "ARMY COMMENDATION MEDAL, ARMY GOOD CONDUCT MEDAL (2), "
                   "AFGHANISTAN CAMPAIGN MEDAL W/ 2 CAMPAIGN STARS, COMBAT ACTION BADGE",
    "remarks": "MEMBER HAS COMPLETED FIRST FULL TERM OF SERVICE. "
               "SERVICE IN AFGHANISTAN FROM 2011 02 03 TO 2012 01 18.",
    "separation_reason": "COMPLETION OF REQUIRED ACTIVE SERVICE",
}


def _font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    """Courier reads like a government form; fall back if it is unavailable."""
    candidates = [
        "/System/Library/Fonts/Supplemental/Courier New Bold.ttf" if bold
        else "/System/Library/Fonts/Supplemental/Courier New.ttf",
        "/System/Library/Fonts/Menlo.ttc",
        "/Library/Fonts/Arial.ttf",
    ]
    for path in candidates:
        if Path(path).exists():
            try:
                return ImageFont.truetype(path, size)
            except OSError:
                continue
    return ImageFont.load_default(size)


def _box(draw, x, y, w, h, number, label, value, small=16, big=26):
    """One numbered block of the form."""
    draw.rectangle([x, y, x + w, y + h], outline="black", width=2)
    draw.text((x + 8, y + 6), f"{number}. {label}", font=_font(small), fill="black")
    draw.text((x + 14, y + 32), value, font=_font(big, bold=True), fill="black")


def build_dd214() -> Image.Image:
    image = Image.new("RGB", (WIDTH, HEIGHT), "white")
    draw = ImageDraw.Draw(image)

    draw.text((WIDTH // 2 - 430, 40), "CERTIFICATE OF RELEASE OR DISCHARGE FROM ACTIVE DUTY",
              font=_font(30, bold=True), fill="black")
    draw.text((WIDTH // 2 - 200, 82), "This is an important record. SAFEGUARD IT.",
              font=_font(18), fill="black")

    top = 130
    _box(draw, 60, top, 1000, 78, "1", "NAME (Last, First, Middle)", VETERAN["name"])
    _box(draw, 1060, top, 580, 78, "2", "DEPARTMENT, COMPONENT AND BRANCH", VETERAN["branch"])

    row = top + 78
    _box(draw, 60, row, 500, 78, "3", "SOCIAL SECURITY NUMBER", VETERAN["ssn"])
    _box(draw, 560, row, 500, 78, "4a", "GRADE, RATE OR RANK", VETERAN["rank"])
    _box(draw, 1060, row, 580, 78, "5", "DATE OF BIRTH (YYYYMMDD)", VETERAN["dob"])

    row += 78
    _box(draw, 60, row, 790, 78, "7a", "PLACE OF ENTRY INTO ACTIVE DUTY", VETERAN["place_entry"])
    _box(draw, 850, row, 790, 78, "7b", "HOME OF RECORD AT TIME OF ENTRY",
         VETERAN["home_of_record"], big=20)

    row += 78
    _box(draw, 60, row, 790, 78, "8a", "LAST DUTY ASSIGNMENT AND MAJOR COMMAND",
         VETERAN["station"])
    _box(draw, 850, row, 790, 78, "9", "COMMAND TO WHICH TRANSFERRED", "NOT APPLICABLE", big=20)

    row += 78
    draw.rectangle([60, row, 1640, row + 130], outline="black", width=2)
    draw.text((68, row + 6), "13. DECORATIONS, MEDALS, BADGES, CITATIONS AND CAMPAIGN RIBBONS",
              font=_font(16), fill="black")
    words, line, y = VETERAN["decorations"].split(), "", row + 34
    for word in words:
        if len(line) + len(word) > 72:
            draw.text((74, y), line, font=_font(20, bold=True), fill="black")
            y += 26
            line = word
        else:
            line = f"{line} {word}".strip()
    draw.text((74, y), line, font=_font(20, bold=True), fill="black")

    row += 130
    draw.text((68, row + 10), "12. RECORD OF SERVICE", font=_font(18, bold=True), fill="black")
    row += 38
    _box(draw, 60, row, 526, 78, "12a", "DATE ENTERED AD THIS PERIOD", VETERAN["entered"])
    _box(draw, 586, row, 527, 78, "12b", "SEPARATION DATE THIS PERIOD", VETERAN["separated"])
    _box(draw, 1113, row, 527, 78, "12c", "NET ACTIVE SERVICE (YY MM DD)", VETERAN["net_service"])

    row += 78
    draw.rectangle([60, row, 1640, row + 150], outline="black", width=2)
    draw.text((68, row + 6), "18. REMARKS", font=_font(16), fill="black")
    words, line, y = VETERAN["remarks"].split(), "", row + 34
    for word in words:
        if len(line) + len(word) > 74:
            draw.text((74, y), line, font=_font(19), fill="black")
            y += 26
            line = word
        else:
            line = f"{line} {word}".strip()
    draw.text((74, y), line, font=_font(19), fill="black")

    row += 150
    _box(draw, 60, row, 790, 78, "23", "TYPE OF SEPARATION", "DISCHARGE")
    _box(draw, 850, row, 790, 78, "24", "CHARACTER OF SERVICE", VETERAN["character"])

    row += 78
    _box(draw, 60, row, 1580, 78, "28", "NARRATIVE REASON FOR SEPARATION",
         VETERAN["separation_reason"], big=22)

    # Unmistakable on any copy, and visible to the model reading it.
    watermark = Image.new("RGBA", image.size, (255, 255, 255, 0))
    mark = ImageDraw.Draw(watermark)
    mark.text((190, 1180), "SPECIMEN - NOT A REAL DD-214",
              font=_font(78, bold=True), fill=(220, 40, 40, 70))
    mark.text((360, 1290), "SYNTHETIC TEST DATA", font=_font(60, bold=True),
              fill=(220, 40, 40, 60))
    image = Image.alpha_composite(image.convert("RGBA"), watermark).convert("RGB")

    draw = ImageDraw.Draw(image)
    draw.text((60, HEIGHT - 60),
              "Generated by tools/make_fixtures.py for software testing. Not a government record.",
              font=_font(18), fill=(150, 150, 150))
    return image


def degrade(image: Image.Image, seed: int = 7) -> Image.Image:
    """Make it look like a phone photo of an old photocopy."""
    random.seed(seed)
    out = image.convert("L")                                  # grey, like a fax
    out = out.rotate(-1.4, expand=True, fillcolor=235)        # never straight
    out = out.resize((int(out.width * 0.62), int(out.height * 0.62)))
    out = out.filter(ImageFilter.GaussianBlur(0.6))

    pixels = out.load()
    for _ in range(int(out.width * out.height * 0.02)):       # scanner speckle
        x = random.randrange(out.width)
        y = random.randrange(out.height)
        pixels[x, y] = max(0, min(255, pixels[x, y] + random.randint(-70, 70)))

    return out.convert("RGB")


MEDICAL_RECORD = """
        SONORAN VALLEY FAMILY MEDICINE
        1180 W Congress St, Tucson AZ 85745
        ---------------------------------------------
        PATIENT: Rivera, Marcus A.        DOB: 07/22/1990
        DATE OF VISIT: 2026-03-11         MRN: SPECIMEN-0001

        ASSESSMENT AND PLAN

        1. Tinnitus, bilateral - Patient reports constant high-pitched
           ringing in both ears, present since 2011 following blast
           exposure during deployment. Worse at night; interferes with
           sleep onset. Referred to audiology.

        2. Chronic lumbar strain with radiculopathy - Ongoing low back
           pain since 2012, radiating into the right leg. Pain worse with
           standing beyond 20 minutes. Currently managed with physical
           therapy and NSAIDs. MRI ordered.

        3. Adjustment disorder with anxiety - Reports hypervigilance and
           difficulty in crowds. Declined medication; counseling offered.

        Provider: A. Okonkwo, MD
        ---------------------------------------------
        SPECIMEN - SYNTHETIC TEST RECORD, NOT A REAL PATIENT
"""

DECISION_LETTER = """
        DEPARTMENT OF VETERANS AFFAIRS
        Regional Office - Phoenix, AZ

        Date: June 4, 2026
        In Reply Refer To: SPECIMEN
        Marcus A. Rivera
        File Number: 00 000 000

        RATING DECISION

        We have made a decision on your claim for service connected
        compensation received on January 12, 2026.

        DECISION
        1. Service connection for tinnitus is granted with an evaluation
           of 10 percent effective January 12, 2026.
        2. Service connection for chronic lumbar strain is denied.

        The evidence does not show a link between your current back
        condition and an event in service.

        You have one year from the date of this letter to appeal.
        Your rights are explained in the enclosed VA Form 20-0998.

        SPECIMEN - SYNTHETIC TEST DOCUMENT, NOT A REAL VA DECISION
"""


# Separation orders are dated relative to today so the BDD demo (180-90 days
# before separation) keeps working instead of going stale in a week.
SEPARATION_DATE = date.today() + timedelta(days=125)

SEPARATION_ORDERS = f"""
        DEPARTMENT OF THE ARMY
        HEADQUARTERS, 4TH INFANTRY DIVISION
        FORT CARSON, COLORADO 80913

        ORDERS 214-0037                      {date.today().strftime('%d %B %Y').upper()}

        RIVERA, MARCUS A.    SGT / E-5    000-00-0000
        4TH BRIGADE COMBAT TEAM, FORT CARSON, CO

        You are released from active duty and assigned to the US Army
        Reserve Control Group effective the date shown below.

        PROJECTED SEPARATION DATE: {SEPARATION_DATE.strftime('%d %B %Y').upper()}
        TYPE OF SEPARATION:        RELEASE FROM ACTIVE DUTY
        CHARACTER OF SERVICE:      HONORABLE (ANTICIPATED)
        TERMINAL LEAVE BEGINS:     {(SEPARATION_DATE - timedelta(days=30)).strftime('%d %B %Y').upper()}

        Member is directed to complete pre-separation counseling and the
        Separation Health Assessment prior to the date above.

        FOR THE COMMANDER

        SPECIMEN - SYNTHETIC TEST DOCUMENT, NOT REAL MILITARY ORDERS
"""

NEXUS_LETTER = """
        SONORAN VALLEY FAMILY MEDICINE
        1180 W Congress St, Tucson AZ 85745

        March 18, 2026

        RE: Marcus A. Rivera        DOB: 07/22/1990

        To Whom It May Concern:

        I have treated Mr. Rivera since 2023 and have reviewed his service
        treatment records, including documented blast exposure during his
        deployment to Afghanistan in 2011.

        It is my professional medical opinion that his bilateral tinnitus
        is AT LEAST AS LIKELY AS NOT caused by acoustic trauma sustained
        during his active military service. The onset of his symptoms
        immediately following documented blast exposure, and the absence
        of any pre-service history of hearing complaints, support this
        conclusion.

        It is further my opinion that his chronic lumbar strain is at
        least as likely as not aggravated beyond its natural progression
        by the same in-service event.

        Sincerely,
        A. Okonkwo, MD
        Board Certified, Family Medicine

        SPECIMEN - SYNTHETIC TEST DOCUMENT, NOT A REAL MEDICAL OPINION
"""

BUDDY_STATEMENT = """
        STATEMENT IN SUPPORT OF CLAIM
        (Lay / Witness Statement)

        Name of Witness: Daniel R. Alvarez
        Relationship: Served together, 4th Brigade Combat Team

        I served with Marcus Rivera in Afghanistan in 2011. On 3 February
        2011 I was in the second vehicle of a convoy outside Kandahar when
        the lead vehicle struck an improvised explosive device. Marcus was
        in that lead vehicle.

        I helped pull him out. He could not hear properly for several days
        afterward and kept asking us to repeat ourselves. He complained
        about his ears ringing constantly for the rest of the deployment.

        Before that day I never heard him complain about his hearing or
        his back. Afterward he had trouble carrying his gear and would
        stretch his back out during every halt.

        I certify that the statements above are true to the best of my
        knowledge and belief.

        Signed: Daniel R. Alvarez        Date: 2026-04-02

        SPECIMEN - SYNTHETIC TEST DOCUMENT, NOT A REAL WITNESS STATEMENT
"""

SERVICE_TREATMENT_RECORD = """
        CHRONOLOGICAL RECORD OF MEDICAL CARE
        FORWARD OPERATING BASE - KANDAHAR, AFGHANISTAN

        PATIENT: RIVERA, MARCUS A.       SSN: 000-00-0000
        UNIT: 4TH BCT                    DATE: 2011 02 04

        CHIEF COMPLAINT: Ringing in both ears, headache, low back pain
        following IED blast 3 FEB 2011.

        HISTORY: Member was in lead vehicle of convoy struck by IED.
        No loss of consciousness reported. Reports immediate onset of
        bilateral tinnitus and difficulty hearing. Also reports lower
        back pain after being pulled from the vehicle.

        EXAM: Tympanic membranes intact bilaterally. Whisper test
        abnormal at 3 feet. Lumbar paraspinal tenderness noted, range
        of motion mildly limited by pain.

        ASSESSMENT: 1. Acoustic trauma with bilateral tinnitus
                    2. Acute lumbar strain

        PLAN: Motrin 800mg. Quarters x 24 hours. Hearing protection
        counseling. Follow up if symptoms persist. Audiology referral
        on return to home station.

        Provider: CPT J. Lin, PA-C

        SPECIMEN - SYNTHETIC TEST RECORD, NOT A REAL PATIENT
"""

AUDIOLOGY_REPORT = """
        SOUTHERN ARIZONA VA HEALTH CARE SYSTEM
        AUDIOLOGY AND SPEECH PATHOLOGY

        PATIENT: Rivera, Marcus A.     DOB: 07/22/1990
        DATE OF EXAM: 2026-04-15

        PURE TONE AIR CONDUCTION THRESHOLDS (dB HL)

                  500Hz  1000Hz  2000Hz  3000Hz  4000Hz
        RIGHT       15      20      25      45      55
        LEFT        15      20      30      50      60

        SPEECH RECOGNITION: Right 92%   Left 88%

        TINNITUS ASSESSMENT: Patient reports constant bilateral
        high-pitched tinnitus, present since 2011 blast exposure.
        Tinnitus matched at 4000 Hz. Reported as persistent and
        interfering with sleep onset.

        IMPRESSION: Bilateral high-frequency sensorineural hearing
        loss consistent with noise exposure. Constant bilateral
        tinnitus reported.

        Audiologist: M. Chen, AuD, CCC-A

        SPECIMEN - SYNTHETIC TEST RECORD, NOT A REAL PATIENT
"""


def text_page(body: str, seed: int = 3) -> Image.Image:
    """Render a text document as a slightly imperfect scan."""
    image = Image.new("RGB", (1400, 1900), "white")
    draw = ImageDraw.Draw(image)
    y = 70
    for line in body.strip("\n").splitlines():
        draw.text((70, y), line.rstrip(), font=_font(24), fill="black")
        y += 34
    return degrade(image, seed=seed)


def dd214_text() -> str:
    return (
        "CERTIFICATE OF RELEASE OR DISCHARGE FROM ACTIVE DUTY\n"
        "SPECIMEN - SYNTHETIC TEST DATA, NOT A REAL DD-214\n"
        f"1. NAME (Last, First, Middle): {VETERAN['name']}\n"
        f"2. DEPARTMENT, COMPONENT AND BRANCH: {VETERAN['branch']}\n"
        f"3. SOCIAL SECURITY NUMBER: {VETERAN['ssn']}\n"
        f"4a. GRADE, RATE OR RANK: {VETERAN['rank']}\n"
        f"5. DATE OF BIRTH: {VETERAN['dob']}\n"
        f"7b. HOME OF RECORD: {VETERAN['home_of_record']}\n"
        f"12a. DATE ENTERED AD THIS PERIOD: {VETERAN['entered']}\n"
        f"12b. SEPARATION DATE THIS PERIOD: {VETERAN['separated']}\n"
        f"12c. NET ACTIVE SERVICE: {VETERAN['net_service']}\n"
        f"13. DECORATIONS: {VETERAN['decorations']}\n"
        f"18. REMARKS: {VETERAN['remarks']}\n"
        f"24. CHARACTER OF SERVICE: {VETERAN['character']}\n"
        f"28. NARRATIVE REASON FOR SEPARATION: {VETERAN['separation_reason']}\n"
    )


def main() -> None:
    FIXTURES.mkdir(parents=True, exist_ok=True)

    clean = build_dd214()
    scanned = degrade(clean)
    medical = text_page(MEDICAL_RECORD, seed=5)
    decision = text_page(DECISION_LETTER, seed=9)

    pages = {
        "dd214_clean": clean,
        "dd214_scanned": scanned,
        "medical_record": medical,
        "decision_letter": decision,
        "separation_orders": text_page(SEPARATION_ORDERS, seed=11),
        "nexus_letter": text_page(NEXUS_LETTER, seed=13),
        "buddy_statement": text_page(BUDDY_STATEMENT, seed=17),
        "service_treatment_record": text_page(SERVICE_TREATMENT_RECORD, seed=19),
        "audiology_report": text_page(AUDIOLOGY_REPORT, seed=23),
    }

    scanned.save(FIXTURES / "dd214_scanned.jpg", quality=48)
    (FIXTURES / "dd214.txt").write_text(dd214_text())

    for name, image in pages.items():
        if name != "dd214_scanned":
            image.save(FIXTURES / f"{name}.png")
        # PDF copies, because that is what most veterans actually upload.
        image.convert("RGB").save(FIXTURES / f"{name}.pdf", "PDF", resolution=150.0)

    print(f"Wrote fixtures to {FIXTURES}:")
    for path in sorted(FIXTURES.iterdir()):
        print(f"  {path.name:24} {path.stat().st_size // 1024:>5} KB")


if __name__ == "__main__":
    main()
