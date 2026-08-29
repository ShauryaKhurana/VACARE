# VA Disability Claim Forms by Lane — with Fill Sequence and Locks

Reference for intake model / UX build. Revision dates verified against VA.gov as of Aug 29, 2026.

Landing page pattern: `https://www.va.gov/forms/{number}/`
Fill-party notation: **[V]** veteran completes · **[3P]** third party completes · **[V+3P]** both sign

---

## Stage 0: Representation and authorization (precedes every lane)

These are not optional extras. They gate who can act, and several have revocation side effects.

| Order | Form | Who | What it does | Lock |
|---|---|---|---|---|
| 0.1 | 21-22 | [V+3P] | Appoints an accredited VSO as POA. VSO signs acceptance. | **One POA at a time. Filing a new 21-22 or 21-22a auto-revokes the prior one.** No rep can file, access the C-file, or speak for the veteran without this of record. |
| 0.1 alt | 21-22a | [V+3P] | Appoints an individual attorney or claims agent | Same revocation rule. **Fee lock: accredited attorneys/agents may only charge fees for work performed after VA issues an initial decision on the claim.** Initial claim prep is free by statute. |
| 0.2 | 21-0845 | [V] | Authorizes VA to discuss the file with a named non-POA third party | Without this or a POA, VA will not talk to anyone but the veteran. |
| 0.3 | 21-0972 | [V+3P] | Alternate signer certification | Must be of record or attached before anyone else's signature on a claim form is accepted. |
| 0.4 | 21-0966 | [V] | Intent to File | **Locks the effective date for 12 months. One active ITF per benefit type.** Filing the 526EZ inside the window inherits the ITF date. Starting the online 526EZ auto-creates one. Applies to initial and supplemental compensation claims, not HLR or Board. |

---

## Lane 1: "I'm getting out"

### 1a. BDD

Sequence:
1. **Window check: 180 to 90 days before separation.** Hard gate. Day 89 = not BDD.
2. **MEB check.** Referral into IDES excludes BDD. Mutually exclusive tracks.
3. 21-22 if using a VSO [V+3P]
4. Gather **complete STRs, including Guard/Reserve unit-held records.** Must be submitted with the claim. Incomplete = kicked out of BDD.
5. 21-526EZ, BDD indicated [V] (Rev Jan 2026)
6. 21-0781 if any mental health condition claimed [V] (Rev Mar 2024; 21-0781a discontinued Jun 2024)
7. 21-4142 + 21-4142a for any private/civilian treatment [V]
8. **Availability lock: must be available for VA exams for 45 days after submission** and complete them before separation. Unavailable = removed from BDD.
9. DD 214 at separation closes the loop. Rating decision targets ~day after discharge.

No ITF needed: effective date is fixed at day after discharge regardless.

### 1b. Other pre-discharge (89 days or fewer)
Same stack minus the window and exam-availability locks. Processed as standard claim; effective date still day after discharge.

### 1c. IDES
1. Triggered by MEB referral, not veteran-initiated
2. 21-0819, VA/DoD Joint Disability Evaluation Board Claim [V]
3. DD 2807-1 [V], DD 2808 [3P: examining clinician]
4. 21-22 still applies for representation

---

## Lane 2: "I've never filed"

Sequence:
1. 21-0966 ITF [V] — file the moment the veteran shows intent. This is the single highest-leverage early action; everything else can take months without cost.
2. 21-22 / 21-22a [V+3P]
3. Evidence gathering: DD 214 (milConnect or SF-180), STRs, private records
4. 21-4142 + 21-4142a [V] — **authorization expires 12 months from signature.** Long development can outlive it; re-signature becomes a task.
5. 21-526EZ [V] — FDC vs Standard election made on the form. FDC breaks silently to Standard if VA has to develop anything. No penalty, just lost speed.
6. Conditional attachments, filed with the 526EZ:
   - 21-0781 [V] — any mental health condition
   - 21-10210 [3P: the witness signs] — buddy statements
   - 21-4138 [V] — overflow narrative
   - 21-686c [V] — dependents, if expecting a combined rating of 30%+ (see Lane 4 for the retro lock)
   - 21-8940 [V] + 21-4192 [3P: employer] — if unemployability is claimed at the outset
7. **C&P exam attendance. This is a lock, not a formality: no-show without good cause on an original claim means VA decides on the record; on an increase it can mean outright denial** (38 CFR 3.655).

Presumptive claims: identical stack. The branch changes what evidence proves service connection, not what gets filled out.

---

## Lane 3: "I got worse"

Sequence:
1. 21-22 if rep changed or lapsed [V+3P]
2. 21-4142 + 21-4142a for treatment since the last rating [V]
3. Optional but high-value: DBQ for the condition (21-0960 series) [3P: clinician]
4. 21-526EZ, increase indicated [V]
5. C&P exam — same no-show lock, and harsher: increase claims can be denied outright for missing it
6. If the condition prevents work → **21-8940 [V] is mandatory before TDIU can be granted, plus 21-4192 [3P] from each employer in the last year of employment.** VA will not infer TDIU into a grant without the 8940 even when the record raises it.

Post-grant lock: TDIU recipients get 21-4140 [V] annually. Non-return triggers a proposed reduction.

**Reduction exposure:** an increase claim reopens the whole rating to review. Ratings in place 5+ years, or 20+ years, carry escalating protection; younger ratings do not. Worth a warning in UX before filing.

---

## Lane 4: "Something new came up"

Sequence:
1. 21-0966 ITF [V] if evidence gathering will take time
2. 21-22 [V+3P] if needed
3. Nexus evidence — for secondary claims, a medical opinion linking new condition to the SC condition is effectively mandatory
4. 21-4142 + 21-4142a [V]
5. 21-526EZ, new/secondary indicated [V]
6. C&P exam lock applies

### Special benefits and their locks

| Benefit | Forms | Who | Lock |
|---|---|---|---|
| TDIU | 21-8940 + 21-4192 | [V] + [3P employer] | 8940 mandatory pre-grant; 4140 annually post-grant |
| Aid & Attendance / Housebound | 21-2680 | **[3P: physician completes and signs]** | Veteran cannot self-complete. UX must route this to a doctor. |
| A&A in nursing home | 21-0779 | **[3P: nursing home official]** | Same. |
| Auto allowance | 21-4502 | [V section + VA certification] | **Purchase-before-approval kills the benefit. VA must approve eligibility before the vehicle is bought. One-time payment.** |
| Adaptive equipment | 10-1394 | [V] | Repeatable, unlike the allowance |
| SAH/SHA housing grant | 26-4555 | [V] | Requires specific qualifying SC conditions already rated; sequence after rating, not with the claim |
| Clothing allowance | 10-8678 | [V] | **Annual deadline: August 1.** Miss it, wait a year. |
| Dependents | 21-686c (+21-674 for a student child 18-23) | [V] | Pays only at combined 30%+. **Retro lock: filed within 1 year of the rating decision that hit 30%, retro pay runs to the rating's effective date. Filed later, pay runs from filing date only.** |
| Drill pay waiver | 21-8951-2 | [V] | Guard/Reserve must waive VA comp for drill days; annual |
| Temporary 100% (4.29/4.30) | none — 21-4138 + hospital/operative records | [V] | Claim within 1 year of hospitalization/surgery for full retro |

---

## Lane 5: "They got it wrong"

The clock is the lock. Every path below runs from the decision notice date.

### Decision tree with deadlines

```
Decision issued (arrives with 20-0998 notice)
│
├─ New evidence exists?
│   YES → 20-0995 Supplemental [V]
│         · no deadline, but >1 yr = effective date resets to filing date
│         · duty to assist reattaches (only lane where it does)
│         · attach: evidence, 21-4142 (fresh 12-mo authorization), 21-10210
│
├─ Same record, rater erred?
│   → 20-0996 HLR [V]
│         · 1 year, hard
│         · NO new evidence accepted. Informal conference optional.
│         · Cannot HLR an HLR. Cannot HLR a Board decision.
│
└─ Want a judge?
    → 10182 Board NOD [V]
          · 1 year, hard
          · docket election ON the form: Direct / Evidence (90-day window) / Hearing (+90 after)
          · Cannot file two Board appeals in a row on the same issue.
```

After each new decision the tree re-runs, with the exclusions above. After a Board denial: 20-0995 within 1 year preserves the date, or CAVC.

### Terminal and side paths
- **CAVC Notice of Appeal: 120 days from Board decision, jurisdictional, no equitable extension in practice.** Court form, not VA.
- CUE: written motion, no form, no deadline, only against final decisions, one shot per decision per theory. RO-level CUE typically packaged on 21-4138.
- **Proposed reduction (inbound): 60 days to submit evidence, 30 days to request a predetermination hearing.** Model as a push alert, not a lane.

### Legacy (pre-Feb 2019 decisions still in the old system)
21-0958 NOD within 1 year → SOC arrives → **VA Form 9 within 60 days of the SOC or the remainder of the 1-year NOD window, whichever is later.** Opt-in to AMA available at SOC/SSOC via 20-0995 or 20-0996.

---

## Off-lane gates

### Discharge character
- DD 293 [V] — Discharge Review Board, **within 15 years of separation**
- DD 149 [V] — BCM/NR, beyond 15 years or DRB-ineligible cases
- VA runs its own character-of-discharge determination and can grant despite an OTH; a claim can be filed without waiting for DoD. Route both in parallel, not serially.

### Survivor
- 21P-534EZ [survivor] — DIC/pension/accrued. **DIC filed within 1 year of death pays from the month of death; later, from filing.**
- 21P-0847 [survivor] — substitution into a pending claim, **within 1 year of death**
- 21P-601 [survivor] — accrued benefits, **within 1 year of death**
- 21P-530EZ — burial

### Overpayment
- VA Form 5655 [V] + written waiver request. **Waiver request within 180 days of the debt notice.** Dispute and waiver are separate tracks that can run in parallel.

---

## Sequencing rules worth encoding as validation logic

1. **POA before representative action.** No 21-22/22a of record = the rep's submissions bounce. New POA silently revokes old — surface this loudly if a veteran already has a GDVS/VetPro POA (Baxter's manual VBMS check is this exact problem).
2. **ITF before evidence gathering, always.** Zero cost, 12-month date lock. The only scenario where it's pointless is pre-discharge.
3. **4142 authorizations age out at 12 months.** Track signature date, not just existence.
4. **Third-party forms are dependencies, not tasks.** 21-4192 (employer), 21-2680 (physician), 21-0779 (facility), DBQs (clinician), 21-10210 (witness). The veteran's task is "get this to X," and your model needs chase states for them.
5. **Exam attendance is a state, not a form.** No-show is the quiet killer across lanes 2, 3, 4.
6. **The 1-year windows compound.** Decision date drives: lane deadlines (HLR/Board), effective-date preservation (supplemental), dependents retro (686c), DIC retro, substitution, accrued. One decision-date field feeds six countdown timers.
7. **Approval-before-purchase (auto allowance) and the August 1 clothing deadline** are the two special-benefit locks that cost real money when missed.
8. **Attorney fee lock shapes the marketplace sequence:** no initial decision, no chargeable attorney work. Referral economics only exist in Lane 5.

---

## Build notes (carried from v1)

**21-526EZ covers lanes 1-4.** One entity, lane discriminator, conditional attachments.

**The intake collision:** increase vs. secondary vs. supplemental all present as "more money for my rating." Disambiguate on: existing rating for this exact condition (increase) / different condition caused by SC condition (secondary) / previously denied or underrated with unseen evidence (supplemental) / same but no new evidence (HLR).

**DBQs:** ~70 forms in the 21-0960 series. Scrape the index, key off diagnostic code, don't hardcode.

**Revision drift:** monthly diff against form landing pages, alert on revision-date change. 21-0781a died silently mid-2024.

**Verify before build:** Separation Health Assessment form number, current CAVC instrument, 21-4140 active status.
