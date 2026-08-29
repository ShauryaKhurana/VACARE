# Evidence rules

How VACARE decides what a claim is still missing. These are practical
claim-prep heuristics for organizing a packet, not legal standards, and they
never predict a VA decision.

## Condition categories

Each condition is matched against a keyword list (`CATEGORY_KEYWORDS` in
`src/evidence_rules.py`) using its name and diagnosis. First match wins;
anything unmatched becomes `general`.

| Category | Example keywords | Suggested extra evidence |
| --- | --- | --- |
| hearing | tinnitus, hearing loss | audiology / hearing test |
| mental_health | PTSD, depression, anxiety, MST | mental health evaluation, buddy statement |
| tbi | TBI, concussion, head injury | imaging, buddy statement |
| respiratory | asthma, sinusitis, sleep apnea, burn pit | current medical records |
| musculoskeletal | back, knee, shoulder, arthritis | imaging |
| skin | eczema, dermatitis, scar | current medical records |
| digestive | IBS, GERD, ulcer | current medical records |

Adding a category means adding one entry to `CATEGORY_KEYWORDS` and one to
`CATEGORY_EVIDENCE`. No other code changes.

## Required vs suggested

**Required** (a blocker; the claim cannot become `ready_for_vso`):

- DD-214, for every claim
- Service treatment records, for every claim
- Current medical records, for every condition
- At least one condition on the claim
- A recorded service connection for every condition

**Suggested** (shown, but not a blocker):

- A personal statement
- The category evidence in the table above
- A nexus letter, when the condition did not start in service

## Linkage warnings

A condition's service-connection story is checked for three thin spots:

1. No in-service start, worsening, or linked event at all. This is also a blocker.
2. Linked to service, but no specific in-service event was described.
3. The linked event is not in service records and has no named witness, so a
   buddy statement would help.

A condition that is not currently being treated is also flagged, since ongoing
treatment records help show the condition is still present.

## Readiness score

A 0-100 signal for triaging a VSO queue. It measures how much of the checklist
is done, **not** the strength of the claim:

```
100 - (20 x missing required) - (5 x missing suggested) - (5 x linkage warnings)
```

Clamped to 0-100, and always 0 when no conditions have been claimed.

## Tasks

Every checklist item and linkage warning becomes a `Task` owned by the veteran,
so the CLI's `status` command can show a simple to-do list. Tasks are
regenerated from scratch on each readiness check, so they never go stale.
