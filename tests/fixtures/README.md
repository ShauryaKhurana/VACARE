# Synthetic test documents

Fabricated documents for testing and demos. **None of these are real.** Every
one is stamped SPECIMEN and uses SSN `000-00-0000`, a number the SSA has never
issued.

They exist because the "sample DD-214" images findable online are real
veterans' records, complete with real names, birth dates, and Social Security
numbers. Those must not go into a repository or an API request.

Regenerate with `python tools/make_fixtures.py`. Each document is written as
both `.png` and `.pdf`; the PDF is what a veteran usually uploads.

## The documents

| File | Type detected | What it gives the claim |
| --- | --- | --- |
| `dd214_scanned.pdf` / `.jpg` | `dd214` | Identity, service dates, discharge. Rotated, grey, speckled - the realistic case |
| `dd214_clean.pdf` / `.png` | `dd214` | Same, crisp |
| `dd214.txt` | `dd214` | Plain text, for fast tests |
| `separation_orders.pdf` | `separation_orders` | Still serving + a projected separation date, which puts the claim in the BDD lane |
| `service_treatment_record.pdf` | `service_treatment_record` | In-service treatment right after the blast |
| `medical_record.pdf` | `medical_record` | Three current conditions with onset dates and providers |
| `audiology_report.pdf` | `audiology_report` | Hearing thresholds; closes the audiology checklist item |
| `nexus_letter.pdf` | `nexus_letter` | The "at least as likely as not" opinion |
| `buddy_statement.pdf` | `buddy_statement` | Witness account of the IED strike |
| `decision_letter.pdf` | `decision_letter` | A rating decision dated 2026-06-04, which starts the appeal clocks |

The separation orders are dated relative to *today*, so the BDD window
(180-90 days before separation) stays valid instead of going stale.

## Demo scripts

All of them start at <http://127.0.0.1:8000/chat>.

**Lane 2 - first claim.** Paste:

> Convoy hit an IED outside Kandahar in April 2011, my buddy Alvarez was in the
> truck with me. My ears have rung nonstop ever since and my lower back kills me
> when I stand more than twenty minutes. I see a civilian doc at Mercy. Wife and
> two kids.

Then upload `dd214_scanned.pdf` (watch identity fill itself), answer **none**,
upload `audiology_report.pdf` (watch the audiology item leave the checklist),
then **That's everything**.

**Lane 1 - still serving.** Same story, but upload `separation_orders.pdf`
instead of the DD-214. The lane becomes BDD and a window-closing countdown
appears.

**Lane 3 - increase.** Say the rated condition got worse: answer **30%**, then
*"A condition I'm rated for got worse"*. Note the harsher no-show warning on the
C&P exam step.

**Lane 5 - appeal.** Upload `decision_letter.pdf` at any point. The lane
switches to decision review and the Board / HLR clocks start.

Keep in mind the medical record adds three conditions on top of whatever the
story mentioned, so a tidy demo either skips it or opens with one condition.
