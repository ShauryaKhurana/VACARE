// Mock caseload: 10-12 realistic cases spanning every state the plan calls
// out -- blocked on required evidence, waiting on a veteran reply, ready to
// file, already approved, an expiring ITF deadline, a fresh unread message,
// a high-condition-count case, and presumptive PACT/Agent Orange/noise-
// exposure matches. Evidence labels are the backend's exact FRIENDLY_NAMES
// (src/evidence_rules.py) and rule_ids are the exact values src/presumptive.py
// emits, so the review pane's provenance reads as genuine, not placeholder.
//
// Ids follow the backend's `uuid4().hex[:12]` shape (src/models.py new_id())
// so nothing about the mock data looks distinguishable from a real case id.

import type {
  ChecklistItemResponse,
  ClaimStatus,
  ClaimType,
  DeadlineResponse,
  FilingCheckItem,
  FormStepResponse,
  ReviewItemResponse,
  RuleResultResponse,
  VsoCaseCondition,
  VsoCaseEvidenceItem,
  VsoCaseStatusEvent,
  VsoCaseTask,
  VsoCaseVeteran,
} from "@/lib/api/vso/types";
import type { CaseMessageResponse } from "@/lib/api/vso/types";

// Exact labels from src/evidence_rules.py FRIENDLY_NAMES -- kept as a lookup
// here (rather than re-typed inline per item) so every checklist row in the
// mock matches the backend's wording verbatim.
export const FRIENDLY_NAMES = {
  dd214: "DD-214 (discharge document)",
  service_treatment_record: "Service treatment records",
  service_personnel_record: "Service personnel records",
  current_medical_record: "Current medical records showing the condition today",
  private_doctor_note: "Private doctor's note",
  nexus_letter: "Nexus letter linking the condition to service",
  buddy_statement: "Buddy statement from someone who served with you",
  personal_statement: "Your personal statement describing the event and symptoms",
  hearing_test: "Audiology / hearing test results",
  mental_health_evaluation: "Mental health evaluation",
  imaging: "Imaging (X-ray, MRI, or CT)",
  other: "Other supporting document",
} as const;

/**
 * Mirrors src/evidence_rules.py `readiness_score()` exactly:
 * 100 - (required_missing * 20) - (suggested_missing * 5) - (warnings * 5),
 * clamped to [0, 100]. Computing it from the checklist here (rather than
 * hand-typing a score per case) is what keeps the breakdown honest -- the
 * UI can recover the same required/suggested/warning counts this produced.
 */
export function computeReadinessScore(
  evidenceChecklist: ChecklistItemResponse[],
  warningsCount: number,
): number {
  const requiredMissing = evidenceChecklist.filter((i) => i.required && !i.satisfied).length;
  const suggestedMissing = evidenceChecklist.filter((i) => !i.required && !i.satisfied).length;
  const score = 100 - requiredMissing * 20 - suggestedMissing * 5 - warningsCount * 5;
  return Math.max(0, Math.min(100, score));
}

/** Everything the mock needs for one case: the union of every wire response
 * the real backend would serve from separate endpoints (queue, checklist,
 * review, live, messages), plus the VsoCase composite fields Phase 2 needs. */
export interface MockCaseRecord {
  case_id: string;
  status: ClaimStatus;
  claim_type: ClaimType;
  veteran: VsoCaseVeteran;
  conditions: VsoCaseCondition[];
  evidence: VsoCaseEvidenceItem[];
  tasks: VsoCaseTask[];
  status_history: VsoCaseStatusEvent[];
  created_on: string;

  lane: string;
  lane_title: string;
  path_hint: string | null;
  evidence_checklist: ChecklistItemResponse[];
  presumptive_hits: RuleResultResponse[];
  blockers: string[];
  warnings: string[];
  deadlines: DeadlineResponse[];
  form_sequence: FormStepResponse[];
  next_ask: string | null;

  review_summary: string;
  review_items: ReviewItemResponse[];

  messages: CaseMessageResponse[];
  vso_approved: boolean;
  filing_checks: FilingCheckItem[];
}

const FORM_SEQUENCE_STANDARD: FormStepResponse[] = [
  { form_number: "21-0966", title: "Intent to File", filled_by: "veteran", is_gate: false },
  { form_number: "21-22", title: "Appointment of VSO", filled_by: "veteran", is_gate: true },
  { form_number: "21-526EZ", title: "Application for Disability Compensation", filled_by: "vso", is_gate: true },
];

function conditionSummary(conditions: VsoCaseCondition[]): string {
  return conditions.map((c) => c.name).join(", ");
}

export const mockCases: MockCaseRecord[] = [
  // 1. Needs you -- blocked on a required document, VSO hasn't acted yet.
  {
    case_id: "4f2a91c7e6b3",
    status: "ready_for_vso",
    claim_type: "initial",
    created_on: "2026-07-02",
    veteran: {
      first_name: "James",
      last_name: "Whitfield",
      dob: "1985-03-14",
      email: "james.whitfield@example.com",
      phone: "910-555-0142",
      branch: "army",
      service_start: "2004-06-01",
      service_end: "2012-08-15",
      discharge_type: "honorable",
    },
    conditions: [
      {
        id: "cond-jw-1",
        name: "Lumbar strain",
        diagnosis: "Chronic lumbar strain",
        onset_date: "2010-01-10",
        started_in_service: true,
        worsened_in_service: true,
        currently_treated: true,
        current_symptoms: "Lower back pain radiating to left leg, worse after long drives",
        notes: null,
      },
    ],
    evidence: [
      { id: "ev-jw-1", evidence_type: "service_treatment_record", title: "STR excerpt 2009-2011", source: "veteran upload", condition_id: null },
      { id: "ev-jw-2", evidence_type: "current_medical_record", title: "VA primary care note, Jun 2026", source: "veteran upload", condition_id: "cond-jw-1" },
    ],
    tasks: [
      { id: "task-jw-1", name: "Obtain: DD-214 (discharge document)", detail: "every claim needs this to prove service and in-service treatment", required: true, owner: "veteran", status: "open", condition_id: null },
    ],
    status_history: [
      { id: "sh-jw-1", status: "draft", note: null, recorded_on: "2026-06-20" },
      { id: "sh-jw-2", status: "ready_for_vso", note: "Veteran submitted for VSO review", recorded_on: "2026-07-02" },
    ],
    lane: "ready_for_vso",
    lane_title: "Ready for VSO review",
    path_hint: "first_claim",
    evidence_checklist: [
      { evidence_type: "dd214", label: FRIENDLY_NAMES.dd214, required: true, satisfied: false, condition_name: null },
      { evidence_type: "service_treatment_record", label: FRIENDLY_NAMES.service_treatment_record, required: true, satisfied: true, condition_name: null },
      { evidence_type: "current_medical_record", label: FRIENDLY_NAMES.current_medical_record, required: true, satisfied: true, condition_name: "Lumbar strain" },
      { evidence_type: "imaging", label: FRIENDLY_NAMES.imaging, required: false, satisfied: false, condition_name: "Lumbar strain" },
    ],
    presumptive_hits: [],
    blockers: ["Missing required document: DD-214 (discharge document)"],
    warnings: ["Lumbar strain: linked to service but no specific in-service event was described."],
    deadlines: [
      { label: "Intent to File (21-0966) window", due_on: "2026-11-20", days_remaining: 83, urgency: "soon" },
    ],
    form_sequence: FORM_SEQUENCE_STANDARD,
    next_ask: "Ask the veteran to upload their DD-214.",
    review_summary: "One required document missing; service connection story is thin for the lumbar strain.",
    review_items: [
      {
        id: "rev-jw-1",
        category: "MISSING_EVIDENCE",
        finding: "DD-214 has not been uploaded. Required to verify service dates and discharge type.",
        suggested_state: "NEEDS_REVIEW",
        evidence_refs: [],
        rule_result_ids: [],
      },
      {
        id: "rev-jw-2",
        category: "SERVICE_CONNECTION",
        finding: "Lumbar strain is linked to service, but no specific in-service event (injury, incident) was described.",
        suggested_state: "NEEDS_REVIEW",
        evidence_refs: ["ev-jw-1"],
        rule_result_ids: [],
      },
    ],
    messages: [
      { id: "msg-jw-1", claim_id: "4f2a91c7e6b3", author: "system", body: "Claim submitted for VSO review. A representative will look at your packet soon.", created_at: "2026-07-02T14:02:00Z" },
      { id: "msg-jw-2", claim_id: "4f2a91c7e6b3", author: "veteran", body: "Let me know if you need anything else from me.", created_at: "2026-07-02T14:05:00Z" },
    ],
    vso_approved: false,
    filing_checks: [
      { label: "Back-pay start date (21-0966)", ok: true, detail: "21-0966 on file: 2026-06-15 · valid through 2027-06-15", optional: false, missing_items: [] },
      { label: "VSO representation (21-22)", ok: true, detail: "21-22 on file: 2026-06-18", optional: false, missing_items: [] },
      { label: "Required evidence", ok: false, detail: "1 required item(s) still missing:", optional: false, missing_items: ["DD-214 (discharge document)"] },
    ],
  },

  // 2. Waiting on veteran -- VSO already requested the hearing test, clock running.
  {
    case_id: "9d3e6a1f5c82",
    status: "in_vso_review",
    claim_type: "initial",
    created_on: "2026-06-18",
    veteran: {
      first_name: "Maria",
      last_name: "Contreras",
      dob: "1990-11-02",
      email: "maria.contreras@example.com",
      phone: "512-555-0198",
      branch: "army",
      service_start: "2009-01-10",
      service_end: "2017-04-22",
      discharge_type: "honorable",
    },
    conditions: [
      {
        id: "cond-mc-1",
        name: "Tinnitus",
        diagnosis: null,
        onset_date: "2016-09-01",
        started_in_service: true,
        worsened_in_service: false,
        currently_treated: false,
        current_symptoms: "Constant ringing in both ears, worse in quiet rooms",
        notes: "MOS 11B, ranges and convoy duty",
      },
      {
        id: "cond-mc-2",
        name: "Bilateral hearing loss",
        diagnosis: null,
        onset_date: "2016-09-01",
        started_in_service: true,
        worsened_in_service: false,
        currently_treated: false,
        current_symptoms: "Difficulty following conversation in group settings",
        notes: null,
      },
    ],
    evidence: [
      { id: "ev-mc-1", evidence_type: "dd214", title: "DD-214", source: "veteran upload", condition_id: null },
      { id: "ev-mc-2", evidence_type: "service_treatment_record", title: "STR", source: "veteran upload", condition_id: null },
    ],
    tasks: [
      { id: "task-mc-1", name: "VSO requested information", detail: "Please schedule an audiology exam and upload the results so we can document your hearing loss and tinnitus.", required: true, owner: "veteran", status: "open", condition_id: null },
    ],
    status_history: [
      { id: "sh-mc-1", status: "ready_for_vso", note: "Veteran submitted for VSO review", recorded_on: "2026-06-18" },
      { id: "sh-mc-2", status: "in_vso_review", note: "VSO requested more information", recorded_on: "2026-06-22" },
    ],
    lane: "in_vso_review",
    lane_title: "In VSO review",
    path_hint: "first_claim",
    evidence_checklist: [
      { evidence_type: "dd214", label: FRIENDLY_NAMES.dd214, required: true, satisfied: true, condition_name: null },
      { evidence_type: "service_treatment_record", label: FRIENDLY_NAMES.service_treatment_record, required: true, satisfied: true, condition_name: null },
      { evidence_type: "current_medical_record", label: FRIENDLY_NAMES.current_medical_record, required: true, satisfied: false, condition_name: "Tinnitus" },
      { evidence_type: "hearing_test", label: FRIENDLY_NAMES.hearing_test, required: false, satisfied: false, condition_name: "Tinnitus" },
    ],
    presumptive_hits: [
      {
        rule_id: "noise_exposure_mos",
        result: "MATCH",
        explanation: "MOS/rate 11B is on VA's noise-exposure lookup; acoustic trauma may be conceded for hearing-related claims.",
        condition_name: "Tinnitus",
      },
    ],
    blockers: ["Missing required document: Current medical records showing the condition today (Tinnitus)"],
    warnings: [],
    deadlines: [
      { label: "Intent to File (21-0966) window", due_on: "2026-12-01", days_remaining: 94, urgency: "soon" },
    ],
    form_sequence: FORM_SEQUENCE_STANDARD,
    next_ask: "Waiting on the veteran's audiology exam results.",
    review_summary: "Strong presumptive match on noise exposure; waiting on the veteran to close the audiology gap.",
    review_items: [
      {
        id: "rev-mc-1",
        category: "PRESUMPTIVE_ELIGIBILITY",
        finding: "Job code 11B matched VA's noise-exposure table -- acoustic trauma may be conceded without further proof.",
        suggested_state: "CONFIRM",
        evidence_refs: [],
        rule_result_ids: ["noise_exposure_mos"],
      },
      {
        id: "rev-mc-2",
        category: "MISSING_EVIDENCE",
        finding: "No current medical record documents the tinnitus or hearing loss today.",
        suggested_state: "NEEDS_REVIEW",
        evidence_refs: [],
        rule_result_ids: [],
      },
    ],
    messages: [
      { id: "msg-mc-1", claim_id: "9d3e6a1f5c82", author: "system", body: "Claim submitted for VSO review. A representative will look at your packet soon.", created_at: "2026-06-18T09:10:00Z" },
      { id: "msg-mc-2", claim_id: "9d3e6a1f5c82", author: "vso", body: "Please schedule an audiology exam and upload the results so we can document your hearing loss and tinnitus.", created_at: "2026-06-22T16:40:00Z" },
    ],
    vso_approved: false,
    filing_checks: [
      { label: "Back-pay start date (21-0966)", ok: true, detail: "21-0966 on file: 2026-06-10 · valid through 2027-06-10", optional: false, missing_items: [] },
      { label: "VSO representation (21-22)", ok: true, detail: "21-22 on file: 2026-06-12", optional: false, missing_items: [] },
      { label: "Required evidence", ok: false, detail: "1 required item(s) still missing:", optional: false, missing_items: ["Current medical records showing the condition today (Tinnitus)"] },
    ],
  },

  // 3. Ready to file -- every gate passes, presumptive PACT match.
  {
    case_id: "1b7f4e9a2d63",
    status: "in_vso_review",
    claim_type: "initial",
    created_on: "2026-05-30",
    veteran: {
      first_name: "David",
      last_name: "Nguyen",
      dob: "1988-07-19",
      email: "david.nguyen@example.com",
      phone: "619-555-0177",
      branch: "marine_corps",
      service_start: "2007-02-01",
      service_end: "2015-10-30",
      discharge_type: "honorable",
    },
    conditions: [
      {
        id: "cond-dn-1",
        name: "Asthma",
        diagnosis: "Reactive airway disease",
        onset_date: "2015-12-01",
        started_in_service: false,
        worsened_in_service: false,
        currently_treated: true,
        current_symptoms: "Shortness of breath and wheezing during exertion",
        notes: "Deployed to Al Asad Airbase, burn pit exposure",
      },
    ],
    evidence: [
      { id: "ev-dn-1", evidence_type: "dd214", title: "DD-214", source: "veteran upload", condition_id: null },
      { id: "ev-dn-2", evidence_type: "service_treatment_record", title: "STR", source: "veteran upload", condition_id: null },
      { id: "ev-dn-3", evidence_type: "current_medical_record", title: "Pulmonology note, May 2026", source: "veteran upload", condition_id: "cond-dn-1" },
      { id: "ev-dn-4", evidence_type: "personal_statement", title: "Personal statement", source: "veteran upload", condition_id: null },
    ],
    tasks: [],
    status_history: [
      { id: "sh-dn-1", status: "ready_for_vso", note: "Veteran submitted for VSO review", recorded_on: "2026-05-30" },
      { id: "sh-dn-2", status: "in_vso_review", note: "Review started by VSO", recorded_on: "2026-06-02" },
    ],
    lane: "in_vso_review",
    lane_title: "In VSO review",
    path_hint: "first_claim",
    evidence_checklist: [
      { evidence_type: "dd214", label: FRIENDLY_NAMES.dd214, required: true, satisfied: true, condition_name: null },
      { evidence_type: "service_treatment_record", label: FRIENDLY_NAMES.service_treatment_record, required: true, satisfied: true, condition_name: null },
      { evidence_type: "current_medical_record", label: FRIENDLY_NAMES.current_medical_record, required: true, satisfied: true, condition_name: "Asthma" },
      { evidence_type: "personal_statement", label: FRIENDLY_NAMES.personal_statement, required: false, satisfied: true, condition_name: null },
    ],
    presumptive_hits: [
      {
        rule_id: "pact_respiratory_gulf_era",
        result: "MATCH",
        explanation: "Service on or after Aug 1990 plus a respiratory/PACT-related condition may qualify for presumptive service connection.",
        condition_name: "Asthma",
      },
    ],
    blockers: [],
    warnings: [],
    deadlines: [
      { label: "Intent to File (21-0966) window", due_on: "2026-10-05", days_remaining: 37, urgency: "soon" },
    ],
    form_sequence: FORM_SEQUENCE_STANDARD,
    next_ask: null,
    review_summary: "Checklist complete, PACT Act presumptive match confirmed, no open blockers.",
    review_items: [
      {
        id: "rev-dn-1",
        category: "PRESUMPTIVE_ELIGIBILITY",
        finding: "Gulf War-era service plus a PACT Act-listed respiratory condition (asthma) qualifies for presumptive service connection.",
        suggested_state: "CONFIRM",
        evidence_refs: ["ev-dn-3"],
        rule_result_ids: ["pact_respiratory_gulf_era"],
      },
      {
        id: "rev-dn-2",
        category: "CURRENT_CONDITION",
        finding: "Pulmonology note from May 2026 documents active treatment for reactive airway disease.",
        suggested_state: "CONFIRM",
        evidence_refs: ["ev-dn-3"],
        rule_result_ids: [],
      },
    ],
    messages: [
      { id: "msg-dn-1", claim_id: "1b7f4e9a2d63", author: "system", body: "Claim submitted for VSO review. A representative will look at your packet soon.", created_at: "2026-05-30T11:00:00Z" },
      { id: "msg-dn-2", claim_id: "1b7f4e9a2d63", author: "vso", body: "Thanks David, your packet looks thorough -- reviewing now.", created_at: "2026-06-02T09:15:00Z" },
    ],
    vso_approved: false,
    filing_checks: [
      { label: "Back-pay start date (21-0966)", ok: true, detail: "21-0966 on file: 2026-05-20 · valid through 2027-05-20", optional: false, missing_items: [] },
      { label: "VSO representation (21-22)", ok: true, detail: "21-22 on file: 2026-05-22", optional: false, missing_items: [] },
      { label: "Required evidence", ok: true, detail: "All required documents on the checklist are present.", optional: false, missing_items: [] },
    ],
  },

  // 4. With VA -- already approved by the VSO, awaiting submission.
  {
    case_id: "e5c82a4f1b96",
    status: "in_vso_review",
    claim_type: "initial",
    created_on: "2026-05-10",
    veteran: {
      first_name: "Angela",
      last_name: "Brooks",
      dob: "1979-01-25",
      email: "angela.brooks@example.com",
      phone: "404-555-0163",
      branch: "air_force",
      service_start: "1999-08-01",
      service_end: "2019-08-01",
      discharge_type: "honorable",
    },
    conditions: [
      {
        id: "cond-ab-1",
        name: "Degenerative disc disease",
        diagnosis: "L4-L5 degenerative disc disease",
        onset_date: "2016-03-01",
        started_in_service: true,
        worsened_in_service: true,
        currently_treated: true,
        current_symptoms: "Chronic lower back pain, limited range of motion",
        notes: null,
      },
    ],
    evidence: [
      { id: "ev-ab-1", evidence_type: "dd214", title: "DD-214", source: "veteran upload", condition_id: null },
      { id: "ev-ab-2", evidence_type: "service_treatment_record", title: "STR", source: "veteran upload", condition_id: null },
      { id: "ev-ab-3", evidence_type: "current_medical_record", title: "Orthopedic note, Apr 2026", source: "veteran upload", condition_id: "cond-ab-1" },
      { id: "ev-ab-4", evidence_type: "imaging", title: "Lumbar MRI, Mar 2026", source: "veteran upload", condition_id: "cond-ab-1" },
    ],
    tasks: [],
    status_history: [
      { id: "sh-ab-1", status: "ready_for_vso", note: "Veteran submitted for VSO review", recorded_on: "2026-05-10" },
      { id: "sh-ab-2", status: "in_vso_review", note: "Review started by VSO", recorded_on: "2026-05-12" },
      { id: "sh-ab-3", status: "in_vso_review", note: "VSO approved -- ready for VA submission", recorded_on: "2026-05-20" },
    ],
    lane: "in_vso_review",
    lane_title: "In VSO review",
    path_hint: "first_claim",
    evidence_checklist: [
      { evidence_type: "dd214", label: FRIENDLY_NAMES.dd214, required: true, satisfied: true, condition_name: null },
      { evidence_type: "service_treatment_record", label: FRIENDLY_NAMES.service_treatment_record, required: true, satisfied: true, condition_name: null },
      { evidence_type: "current_medical_record", label: FRIENDLY_NAMES.current_medical_record, required: true, satisfied: true, condition_name: "Degenerative disc disease" },
      { evidence_type: "imaging", label: FRIENDLY_NAMES.imaging, required: false, satisfied: true, condition_name: "Degenerative disc disease" },
    ],
    presumptive_hits: [],
    blockers: [],
    warnings: [],
    deadlines: [
      { label: "Intent to File (21-0966) window", due_on: "2026-09-15", days_remaining: 17, urgency: "urgent" },
    ],
    form_sequence: FORM_SEQUENCE_STANDARD,
    next_ask: null,
    review_summary: "Approved to file. Download the 526EZ and submit to the VA sandbox when ready.",
    review_items: [
      {
        id: "rev-ab-1",
        category: "CURRENT_CONDITION",
        finding: "MRI and orthopedic note both document active degenerative disc disease consistent with the claimed condition.",
        suggested_state: "CONFIRM",
        evidence_refs: ["ev-ab-3", "ev-ab-4"],
        rule_result_ids: [],
      },
    ],
    messages: [
      { id: "msg-ab-1", claim_id: "e5c82a4f1b96", author: "system", body: "Claim submitted for VSO review. A representative will look at your packet soon.", created_at: "2026-05-10T08:30:00Z" },
      { id: "msg-ab-2", claim_id: "e5c82a4f1b96", author: "vso", body: "Your packet looks good. Approved to file with VA. You can download the 526EZ and send it to the VA sandbox when ready.", created_at: "2026-05-20T13:05:00Z" },
    ],
    vso_approved: true,
    filing_checks: [
      { label: "Back-pay start date (21-0966)", ok: true, detail: "21-0966 on file: 2026-05-01 · valid through 2027-05-01", optional: false, missing_items: [] },
      { label: "VSO representation (21-22)", ok: true, detail: "21-22 on file: 2026-05-03", optional: false, missing_items: [] },
      { label: "Required evidence", ok: true, detail: "All required documents on the checklist are present.", optional: false, missing_items: [] },
    ],
  },

  // 5. Needs you -- ITF window closing in under 30 days (urgent).
  {
    case_id: "7a3f9c1e6b45",
    status: "ready_for_vso",
    claim_type: "initial",
    created_on: "2026-08-10",
    veteran: {
      first_name: "Robert",
      last_name: "Kim",
      dob: "1992-05-08",
      email: "robert.kim@example.com",
      phone: "213-555-0119",
      branch: "navy",
      service_start: "2011-03-15",
      service_end: "2019-03-15",
      discharge_type: "honorable",
    },
    conditions: [
      {
        id: "cond-rk-1",
        name: "Right shoulder impingement",
        diagnosis: "Rotator cuff impingement syndrome",
        onset_date: "2018-02-01",
        started_in_service: true,
        worsened_in_service: false,
        currently_treated: true,
        current_symptoms: "Sharp pain overhead, weakness lifting objects",
        notes: null,
      },
    ],
    evidence: [
      { id: "ev-rk-1", evidence_type: "dd214", title: "DD-214", source: "veteran upload", condition_id: null },
      { id: "ev-rk-2", evidence_type: "service_treatment_record", title: "STR", source: "veteran upload", condition_id: null },
      { id: "ev-rk-3", evidence_type: "current_medical_record", title: "Orthopedic note, Jul 2026", source: "veteran upload", condition_id: "cond-rk-1" },
    ],
    tasks: [],
    status_history: [
      { id: "sh-rk-1", status: "ready_for_vso", note: "Veteran submitted for VSO review", recorded_on: "2026-08-10" },
    ],
    lane: "ready_for_vso",
    lane_title: "Ready for VSO review",
    path_hint: "first_claim",
    evidence_checklist: [
      { evidence_type: "dd214", label: FRIENDLY_NAMES.dd214, required: true, satisfied: true, condition_name: null },
      { evidence_type: "service_treatment_record", label: FRIENDLY_NAMES.service_treatment_record, required: true, satisfied: true, condition_name: null },
      { evidence_type: "current_medical_record", label: FRIENDLY_NAMES.current_medical_record, required: true, satisfied: true, condition_name: "Right shoulder impingement" },
      { evidence_type: "imaging", label: FRIENDLY_NAMES.imaging, required: false, satisfied: false, condition_name: "Right shoulder impingement" },
    ],
    presumptive_hits: [],
    blockers: [],
    warnings: [],
    deadlines: [
      { label: "Intent to File (21-0966) window", due_on: "2026-09-10", days_remaining: 12, urgency: "urgent" },
    ],
    form_sequence: FORM_SEQUENCE_STANDARD,
    next_ask: "Checklist is complete -- ready for initial review.",
    review_summary: "Checklist complete; back-pay window closes in 12 days, prioritize this review.",
    review_items: [
      {
        id: "rev-rk-1",
        category: "CURRENT_CONDITION",
        finding: "Orthopedic note from July 2026 documents active treatment for shoulder impingement.",
        suggested_state: "CONFIRM",
        evidence_refs: ["ev-rk-3"],
        rule_result_ids: [],
      },
    ],
    messages: [
      { id: "msg-rk-1", claim_id: "7a3f9c1e6b45", author: "system", body: "Claim submitted for VSO review. A representative will look at your packet soon.", created_at: "2026-08-10T10:00:00Z" },
    ],
    vso_approved: false,
    filing_checks: [
      { label: "Back-pay start date (21-0966)", ok: true, detail: "21-0966 on file: 2026-08-09 · valid through 2027-08-09", optional: false, missing_items: [] },
      { label: "VSO representation (21-22)", ok: true, detail: "21-22 on file: 2026-08-09", optional: false, missing_items: [] },
      { label: "Required evidence", ok: true, detail: "All required documents on the checklist are present.", optional: false, missing_items: [] },
    ],
  },

  // 6. Needs you -- fresh unread veteran message (drives the unread dot).
  {
    case_id: "2d6b8f4a9e13",
    status: "in_vso_review",
    claim_type: "increase",
    created_on: "2026-07-28",
    veteran: {
      first_name: "Sandra",
      last_name: "Lee",
      dob: "1983-09-30",
      email: "sandra.lee@example.com",
      phone: "702-555-0184",
      branch: "army",
      service_start: "2002-01-05",
      service_end: "2010-01-05",
      discharge_type: "honorable",
    },
    conditions: [
      {
        id: "cond-sl-1",
        name: "Major depressive disorder",
        diagnosis: "MDD, recurrent",
        onset_date: "2009-06-01",
        started_in_service: true,
        worsened_in_service: true,
        currently_treated: true,
        current_symptoms: "Persistent low mood, sleep disruption, reduced concentration",
        notes: null,
      },
    ],
    evidence: [
      { id: "ev-sl-1", evidence_type: "dd214", title: "DD-214", source: "veteran upload", condition_id: null },
      { id: "ev-sl-2", evidence_type: "mental_health_evaluation", title: "C&P mental health exam, Jul 2026", source: "veteran upload", condition_id: "cond-sl-1" },
    ],
    tasks: [],
    status_history: [
      { id: "sh-sl-1", status: "ready_for_vso", note: "Veteran submitted for VSO review", recorded_on: "2026-07-28" },
      { id: "sh-sl-2", status: "in_vso_review", note: "VSO opened the case", recorded_on: "2026-07-29" },
    ],
    lane: "in_vso_review",
    lane_title: "In VSO review",
    path_hint: "increase",
    evidence_checklist: [
      { evidence_type: "dd214", label: FRIENDLY_NAMES.dd214, required: true, satisfied: true, condition_name: null },
      { evidence_type: "service_treatment_record", label: FRIENDLY_NAMES.service_treatment_record, required: true, satisfied: false, condition_name: null },
      { evidence_type: "current_medical_record", label: FRIENDLY_NAMES.current_medical_record, required: true, satisfied: true, condition_name: "Major depressive disorder" },
      { evidence_type: "buddy_statement", label: FRIENDLY_NAMES.buddy_statement, required: false, satisfied: false, condition_name: "Major depressive disorder" },
    ],
    presumptive_hits: [],
    blockers: ["Missing required document: Service treatment records"],
    warnings: [],
    deadlines: [],
    form_sequence: FORM_SEQUENCE_STANDARD,
    next_ask: "Veteran just replied -- review their new message.",
    review_summary: "Veteran sent a new message; service treatment records still outstanding.",
    review_items: [
      {
        id: "rev-sl-1",
        category: "MISSING_EVIDENCE",
        finding: "Service treatment records have not been provided; needed to corroborate in-service onset.",
        suggested_state: "NEEDS_REVIEW",
        evidence_refs: [],
        rule_result_ids: [],
      },
    ],
    messages: [
      { id: "msg-sl-1", claim_id: "2d6b8f4a9e13", author: "system", body: "Claim submitted for VSO review. A representative will look at your packet soon.", created_at: "2026-07-28T15:20:00Z" },
      { id: "msg-sl-2", claim_id: "2d6b8f4a9e13", author: "vso", body: "Hi Sandra, could you request a copy of your service treatment records from the National Archives when you have a moment?", created_at: "2026-07-29T10:00:00Z" },
      { id: "msg-sl-3", claim_id: "2d6b8f4a9e13", author: "veteran", body: "Just submitted the request today -- they said it could take a couple weeks. Anything else I should do in the meantime?", created_at: "2026-08-29T08:45:00Z" },
    ],
    vso_approved: false,
    filing_checks: [
      { label: "Back-pay start date (21-0966)", ok: true, detail: "Not applicable for this claim.", optional: true, missing_items: [] },
      { label: "VSO representation (21-22)", ok: true, detail: "21-22 on file: 2026-07-25", optional: false, missing_items: [] },
      { label: "Required evidence", ok: false, detail: "1 required item(s) still missing:", optional: false, missing_items: ["Service treatment records"] },
    ],
  },

  // 7. Needs you -- high condition count (5), stress-tests the dense row layout.
  {
    case_id: "c94a7e2f8b56",
    status: "ready_for_vso",
    claim_type: "initial",
    created_on: "2026-08-01",
    veteran: {
      first_name: "Michael",
      last_name: "Torres",
      dob: "1981-12-11",
      email: "michael.torres@example.com",
      phone: "915-555-0155",
      branch: "army",
      service_start: "2000-04-01",
      service_end: "2020-04-01",
      discharge_type: "honorable",
    },
    conditions: [
      { id: "cond-mt-1", name: "Tinnitus", diagnosis: null, onset_date: "2015-06-01", started_in_service: true, worsened_in_service: false, currently_treated: false, current_symptoms: "Ringing in both ears", notes: "MOS 19K, armor crewman" },
      { id: "cond-mt-2", name: "Lumbar radiculopathy", diagnosis: "L5-S1 radiculopathy", onset_date: "2014-02-01", started_in_service: true, worsened_in_service: true, currently_treated: true, current_symptoms: "Sciatic pain down right leg", notes: null },
      { id: "cond-mt-3", name: "PTSD", diagnosis: "Post-traumatic stress disorder", onset_date: "2013-01-01", started_in_service: true, worsened_in_service: true, currently_treated: true, current_symptoms: "Hypervigilance, nightmares, avoidance", notes: null },
      { id: "cond-mt-4", name: "Sleep apnea", diagnosis: "Obstructive sleep apnea", onset_date: "2019-01-01", started_in_service: false, worsened_in_service: false, currently_treated: true, current_symptoms: "Daytime fatigue, witnessed apnea episodes", notes: "Secondary to PTSD, per treating physician" },
      { id: "cond-mt-5", name: "Right knee strain", diagnosis: null, onset_date: "2016-05-01", started_in_service: true, worsened_in_service: false, currently_treated: false, current_symptoms: "Pain on stairs, occasional swelling", notes: null },
    ],
    evidence: [
      { id: "ev-mt-1", evidence_type: "dd214", title: "DD-214", source: "veteran upload", condition_id: null },
      { id: "ev-mt-2", evidence_type: "service_treatment_record", title: "STR", source: "veteran upload", condition_id: null },
      { id: "ev-mt-3", evidence_type: "mental_health_evaluation", title: "PTSD C&P exam, Jul 2026", source: "veteran upload", condition_id: "cond-mt-3" },
    ],
    tasks: [
      { id: "task-mt-1", name: "Obtain: Current medical records showing the condition today", detail: "a current diagnosis or treatment record is needed", required: true, owner: "veteran", status: "open", condition_id: "cond-mt-1" },
      { id: "task-mt-2", name: "Obtain: Current medical records showing the condition today", detail: "a current diagnosis or treatment record is needed", required: true, owner: "veteran", status: "open", condition_id: "cond-mt-5" },
    ],
    status_history: [
      { id: "sh-mt-1", status: "ready_for_vso", note: "Veteran submitted for VSO review", recorded_on: "2026-08-01" },
    ],
    lane: "ready_for_vso",
    lane_title: "Ready for VSO review",
    path_hint: "first_claim",
    evidence_checklist: [
      { evidence_type: "dd214", label: FRIENDLY_NAMES.dd214, required: true, satisfied: true, condition_name: null },
      { evidence_type: "service_treatment_record", label: FRIENDLY_NAMES.service_treatment_record, required: true, satisfied: true, condition_name: null },
      { evidence_type: "current_medical_record", label: FRIENDLY_NAMES.current_medical_record, required: true, satisfied: false, condition_name: "Tinnitus" },
      { evidence_type: "current_medical_record", label: FRIENDLY_NAMES.current_medical_record, required: true, satisfied: true, condition_name: "Lumbar radiculopathy" },
      { evidence_type: "current_medical_record", label: FRIENDLY_NAMES.current_medical_record, required: true, satisfied: true, condition_name: "PTSD" },
      { evidence_type: "current_medical_record", label: FRIENDLY_NAMES.current_medical_record, required: true, satisfied: true, condition_name: "Sleep apnea" },
      { evidence_type: "current_medical_record", label: FRIENDLY_NAMES.current_medical_record, required: true, satisfied: false, condition_name: "Right knee strain" },
      { evidence_type: "hearing_test", label: FRIENDLY_NAMES.hearing_test, required: false, satisfied: false, condition_name: "Tinnitus" },
    ],
    presumptive_hits: [
      {
        rule_id: "noise_exposure_mos",
        result: "MATCH",
        explanation: "MOS/rate 19K is on VA's noise-exposure lookup; acoustic trauma may be conceded for hearing-related claims.",
        condition_name: "Tinnitus",
      },
      {
        rule_id: "chronic_within_one_year",
        result: "MATCH",
        explanation: "Symptom onset appears within one year of separation; some chronic conditions may qualify for the one-year presumptive window.",
        condition_name: "Lumbar radiculopathy",
      },
    ],
    blockers: [
      "Missing required document: Current medical records showing the condition today (Tinnitus)",
      "Missing required document: Current medical records showing the condition today (Right knee strain)",
    ],
    warnings: ["Right knee strain: not currently being treated. Ongoing treatment records help show the condition is still present."],
    deadlines: [
      { label: "Intent to File (21-0966) window", due_on: "2026-10-28", days_remaining: 60, urgency: "soon" },
    ],
    form_sequence: FORM_SEQUENCE_STANDARD,
    next_ask: "Five conditions claimed -- two still need current medical records.",
    review_summary: "Five conditions claimed; noise-exposure and one-year-window presumptive matches found, two evidence gaps remain.",
    review_items: [
      {
        id: "rev-mt-1",
        category: "PRESUMPTIVE_ELIGIBILITY",
        finding: "Job code 19K matched VA's noise-exposure table for the claimed tinnitus.",
        suggested_state: "CONFIRM",
        evidence_refs: [],
        rule_result_ids: ["noise_exposure_mos"],
      },
      {
        id: "rev-mt-2",
        category: "PRESUMPTIVE_ELIGIBILITY",
        finding: "Lumbar radiculopathy onset falls within one year of separation, within the chronic-condition presumptive window.",
        suggested_state: "CONFIRM",
        evidence_refs: [],
        rule_result_ids: ["chronic_within_one_year"],
      },
      {
        id: "rev-mt-3",
        category: "MISSING_EVIDENCE",
        finding: "No current medical record for tinnitus or right knee strain.",
        suggested_state: "NEEDS_REVIEW",
        evidence_refs: [],
        rule_result_ids: [],
      },
    ],
    messages: [
      { id: "msg-mt-1", claim_id: "c94a7e2f8b56", author: "system", body: "Claim submitted for VSO review. A representative will look at your packet soon.", created_at: "2026-08-01T09:00:00Z" },
    ],
    vso_approved: false,
    filing_checks: [
      { label: "Back-pay start date (21-0966)", ok: true, detail: "21-0966 on file: 2026-07-30 · valid through 2027-07-30", optional: false, missing_items: [] },
      { label: "VSO representation (21-22)", ok: true, detail: "21-22 on file: 2026-07-30", optional: false, missing_items: [] },
      { label: "Required evidence", ok: false, detail: "2 required item(s) still missing:", optional: false, missing_items: ["Current medical records showing the condition today (Tinnitus)", "Current medical records showing the condition today (Right knee strain)"] },
    ],
  },

  // 8. Needs you -- combined noise + Agent Orange presumptive picture, moderate readiness.
  {
    case_id: "5f1e3a9c7d24",
    status: "ready_for_vso",
    claim_type: "initial",
    created_on: "2026-08-15",
    veteran: {
      first_name: "Patricia",
      last_name: "Alvarez",
      dob: "1975-02-20",
      email: "patricia.alvarez@example.com",
      phone: "480-555-0133",
      branch: "air_force",
      service_start: "1994-05-01",
      service_end: "2014-05-01",
      discharge_type: "honorable",
    },
    conditions: [
      {
        id: "cond-pa-1",
        name: "Sinusitis",
        diagnosis: "Chronic sinusitis",
        onset_date: "2013-01-01",
        started_in_service: true,
        worsened_in_service: true,
        currently_treated: true,
        current_symptoms: "Chronic congestion, facial pain, recurring infections",
        notes: "Deployed Southwest Asia 1995-1996",
      },
    ],
    evidence: [
      { id: "ev-pa-1", evidence_type: "dd214", title: "DD-214", source: "veteran upload", condition_id: null },
      { id: "ev-pa-2", evidence_type: "service_treatment_record", title: "STR", source: "veteran upload", condition_id: null },
    ],
    tasks: [
      { id: "task-pa-1", name: "Obtain: Current medical records showing the condition today", detail: "a current diagnosis or treatment record is needed", required: true, owner: "veteran", status: "open", condition_id: "cond-pa-1" },
    ],
    status_history: [
      { id: "sh-pa-1", status: "ready_for_vso", note: "Veteran submitted for VSO review", recorded_on: "2026-08-15" },
    ],
    lane: "ready_for_vso",
    lane_title: "Ready for VSO review",
    path_hint: "first_claim",
    evidence_checklist: [
      { evidence_type: "dd214", label: FRIENDLY_NAMES.dd214, required: true, satisfied: true, condition_name: null },
      { evidence_type: "service_treatment_record", label: FRIENDLY_NAMES.service_treatment_record, required: true, satisfied: true, condition_name: null },
      { evidence_type: "current_medical_record", label: FRIENDLY_NAMES.current_medical_record, required: true, satisfied: false, condition_name: "Sinusitis" },
      { evidence_type: "personal_statement", label: FRIENDLY_NAMES.personal_statement, required: false, satisfied: false, condition_name: null },
    ],
    presumptive_hits: [
      {
        rule_id: "pact_respiratory_gulf_era",
        result: "MATCH",
        explanation: "Service on or after Aug 1990 plus a respiratory/PACT-related condition may qualify for presumptive service connection.",
        condition_name: "Sinusitis",
      },
    ],
    blockers: ["Missing required document: Current medical records showing the condition today (Sinusitis)"],
    warnings: [],
    deadlines: [
      { label: "Intent to File (21-0966) window", due_on: "2026-11-12", days_remaining: 75, urgency: "soon" },
    ],
    form_sequence: FORM_SEQUENCE_STANDARD,
    next_ask: "Request a current medical record for the sinusitis.",
    review_summary: "PACT Act presumptive match on Gulf-era respiratory service; one evidence gap remains.",
    review_items: [
      {
        id: "rev-pa-1",
        category: "PRESUMPTIVE_ELIGIBILITY",
        finding: "Gulf War-era service plus a PACT Act-listed respiratory condition (sinusitis) qualifies for presumptive service connection.",
        suggested_state: "CONFIRM",
        evidence_refs: [],
        rule_result_ids: ["pact_respiratory_gulf_era"],
      },
      {
        id: "rev-pa-2",
        category: "MISSING_EVIDENCE",
        finding: "No current medical record documents the sinusitis today.",
        suggested_state: "NEEDS_REVIEW",
        evidence_refs: [],
        rule_result_ids: [],
      },
    ],
    messages: [
      { id: "msg-pa-1", claim_id: "5f1e3a9c7d24", author: "system", body: "Claim submitted for VSO review. A representative will look at your packet soon.", created_at: "2026-08-15T12:00:00Z" },
    ],
    vso_approved: false,
    filing_checks: [
      { label: "Back-pay start date (21-0966)", ok: true, detail: "21-0966 on file: 2026-08-14 · valid through 2027-08-14", optional: false, missing_items: [] },
      { label: "VSO representation (21-22)", ok: true, detail: "21-22 on file: 2026-08-14", optional: false, missing_items: [] },
      { label: "Required evidence", ok: false, detail: "1 required item(s) still missing:", optional: false, missing_items: ["Current medical records showing the condition today (Sinusitis)"] },
    ],
  },

  // 9. Waiting on veteran -- Agent Orange / Vietnam presumptive match, nexus letter requested.
  {
    case_id: "8b2d6f4a1c97",
    status: "in_vso_review",
    claim_type: "initial",
    created_on: "2026-06-05",
    veteran: {
      first_name: "William",
      last_name: "Park",
      dob: "1950-10-04",
      email: "william.park@example.com",
      phone: "808-555-0111",
      branch: "army",
      service_start: "1969-03-01",
      service_end: "1971-03-01",
      discharge_type: "honorable",
    },
    conditions: [
      {
        id: "cond-wp-1",
        name: "Type 2 diabetes mellitus",
        diagnosis: "Type 2 diabetes mellitus",
        onset_date: "2020-04-01",
        started_in_service: false,
        worsened_in_service: false,
        currently_treated: true,
        current_symptoms: "Managed with medication, neuropathy in feet",
        notes: "Vietnam Service Medal, boots-on-ground 1970",
      },
    ],
    evidence: [
      { id: "ev-wp-1", evidence_type: "dd214", title: "DD-214", source: "veteran upload", condition_id: null },
      { id: "ev-wp-2", evidence_type: "current_medical_record", title: "Endocrinology note, May 2026", source: "veteran upload", condition_id: "cond-wp-1" },
    ],
    tasks: [
      { id: "task-wp-1", name: "VSO requested information", detail: "Could you ask your doctor for a short nexus letter connecting your diabetes diagnosis to Agent Orange exposure? It strengthens the presumptive claim.", required: true, owner: "veteran", status: "open", condition_id: "cond-wp-1" },
    ],
    status_history: [
      { id: "sh-wp-1", status: "ready_for_vso", note: "Veteran submitted for VSO review", recorded_on: "2026-06-05" },
      { id: "sh-wp-2", status: "in_vso_review", note: "VSO requested more information", recorded_on: "2026-06-09" },
    ],
    lane: "in_vso_review",
    lane_title: "In VSO review",
    path_hint: "first_claim",
    evidence_checklist: [
      { evidence_type: "dd214", label: FRIENDLY_NAMES.dd214, required: true, satisfied: true, condition_name: null },
      { evidence_type: "service_treatment_record", label: FRIENDLY_NAMES.service_treatment_record, required: true, satisfied: false, condition_name: null },
      { evidence_type: "current_medical_record", label: FRIENDLY_NAMES.current_medical_record, required: true, satisfied: true, condition_name: "Type 2 diabetes mellitus" },
      { evidence_type: "nexus_letter", label: FRIENDLY_NAMES.nexus_letter, required: false, satisfied: false, condition_name: "Type 2 diabetes mellitus" },
    ],
    presumptive_hits: [
      {
        rule_id: "agent_orange_vietnam",
        result: "MATCH",
        explanation: "Vietnam-era theater service is documented; this condition type may qualify for Agent Orange presumptive rules.",
        condition_name: "Type 2 diabetes mellitus",
      },
    ],
    blockers: ["Missing required document: Service treatment records"],
    warnings: [],
    deadlines: [],
    form_sequence: FORM_SEQUENCE_STANDARD,
    next_ask: "Waiting on the veteran's nexus letter and service treatment records.",
    review_summary: "Agent Orange presumptive match confirmed; awaiting service treatment records and an optional nexus letter.",
    review_items: [
      {
        id: "rev-wp-1",
        category: "PRESUMPTIVE_ELIGIBILITY",
        finding: "Vietnam Service Medal and boots-on-ground service in 1970 match VA's Agent Orange presumptive exposure list.",
        suggested_state: "CONFIRM",
        evidence_refs: [],
        rule_result_ids: ["agent_orange_vietnam"],
      },
      {
        id: "rev-wp-2",
        category: "MISSING_EVIDENCE",
        finding: "Service treatment records not yet provided.",
        suggested_state: "NEEDS_REVIEW",
        evidence_refs: [],
        rule_result_ids: [],
      },
    ],
    messages: [
      { id: "msg-wp-1", claim_id: "8b2d6f4a1c97", author: "system", body: "Claim submitted for VSO review. A representative will look at your packet soon.", created_at: "2026-06-05T10:30:00Z" },
      { id: "msg-wp-2", claim_id: "8b2d6f4a1c97", author: "vso", body: "Could you ask your doctor for a short nexus letter connecting your diabetes diagnosis to Agent Orange exposure? It strengthens the presumptive claim.", created_at: "2026-06-09T14:00:00Z" },
    ],
    vso_approved: false,
    filing_checks: [
      { label: "Back-pay start date (21-0966)", ok: true, detail: "Not applicable for this claim.", optional: true, missing_items: [] },
      { label: "VSO representation (21-22)", ok: true, detail: "21-22 on file: 2026-06-01", optional: false, missing_items: [] },
      { label: "Required evidence", ok: false, detail: "1 required item(s) still missing:", optional: false, missing_items: ["Service treatment records"] },
    ],
  },

  // 10. Ready to file -- chronic-within-one-year presumptive match, PTSD.
  {
    case_id: "3e7c9a5f2b68",
    status: "in_vso_review",
    claim_type: "initial",
    created_on: "2026-07-14",
    veteran: {
      first_name: "Jennifer",
      last_name: "Diaz",
      dob: "1994-04-17",
      email: "jennifer.diaz@example.com",
      phone: "303-555-0177",
      branch: "army",
      service_start: "2013-07-01",
      service_end: "2021-07-01",
      discharge_type: "honorable",
    },
    conditions: [
      {
        id: "cond-jd-1",
        name: "PTSD",
        diagnosis: "Post-traumatic stress disorder",
        onset_date: "2021-11-15",
        started_in_service: true,
        worsened_in_service: true,
        currently_treated: true,
        current_symptoms: "Nightmares, hypervigilance, difficulty in crowds",
        notes: null,
      },
    ],
    evidence: [
      { id: "ev-jd-1", evidence_type: "dd214", title: "DD-214", source: "veteran upload", condition_id: null },
      { id: "ev-jd-2", evidence_type: "service_treatment_record", title: "STR", source: "veteran upload", condition_id: null },
      { id: "ev-jd-3", evidence_type: "mental_health_evaluation", title: "C&P mental health exam, Jun 2026", source: "veteran upload", condition_id: "cond-jd-1" },
      { id: "ev-jd-4", evidence_type: "buddy_statement", title: "Buddy statement, SGT Ellis", source: "veteran upload", condition_id: "cond-jd-1" },
    ],
    tasks: [],
    status_history: [
      { id: "sh-jd-1", status: "ready_for_vso", note: "Veteran submitted for VSO review", recorded_on: "2026-07-14" },
      { id: "sh-jd-2", status: "in_vso_review", note: "Review started by VSO", recorded_on: "2026-07-16" },
    ],
    lane: "in_vso_review",
    lane_title: "In VSO review",
    path_hint: "first_claim",
    evidence_checklist: [
      { evidence_type: "dd214", label: FRIENDLY_NAMES.dd214, required: true, satisfied: true, condition_name: null },
      { evidence_type: "service_treatment_record", label: FRIENDLY_NAMES.service_treatment_record, required: true, satisfied: true, condition_name: null },
      { evidence_type: "current_medical_record", label: FRIENDLY_NAMES.current_medical_record, required: true, satisfied: true, condition_name: "PTSD" },
      { evidence_type: "buddy_statement", label: FRIENDLY_NAMES.buddy_statement, required: false, satisfied: true, condition_name: "PTSD" },
    ],
    presumptive_hits: [
      {
        rule_id: "chronic_within_one_year",
        result: "MATCH",
        explanation: "Symptom onset appears within one year of separation; some chronic conditions may qualify for the one-year presumptive window.",
        condition_name: "PTSD",
      },
    ],
    blockers: [],
    warnings: [],
    deadlines: [
      { label: "Intent to File (21-0966) window", due_on: "2026-12-20", days_remaining: 113, urgency: "ok" },
    ],
    form_sequence: FORM_SEQUENCE_STANDARD,
    next_ask: null,
    review_summary: "Checklist complete, one-year presumptive window confirmed, buddy statement on file.",
    review_items: [
      {
        id: "rev-jd-1",
        category: "PRESUMPTIVE_ELIGIBILITY",
        finding: "PTSD onset falls within one year of separation, within the chronic-condition presumptive window.",
        suggested_state: "CONFIRM",
        evidence_refs: [],
        rule_result_ids: ["chronic_within_one_year"],
      },
      {
        id: "rev-jd-2",
        category: "SERVICE_CONNECTION",
        finding: "Buddy statement from SGT Ellis corroborates the in-service stressor event.",
        suggested_state: "CONFIRM",
        evidence_refs: ["ev-jd-4"],
        rule_result_ids: [],
      },
    ],
    messages: [
      { id: "msg-jd-1", claim_id: "3e7c9a5f2b68", author: "system", body: "Claim submitted for VSO review. A representative will look at your packet soon.", created_at: "2026-07-14T13:00:00Z" },
      { id: "msg-jd-2", claim_id: "3e7c9a5f2b68", author: "vso", body: "Everything looks complete -- finishing my review now.", created_at: "2026-07-16T09:30:00Z" },
    ],
    vso_approved: false,
    filing_checks: [
      { label: "Back-pay start date (21-0966)", ok: true, detail: "21-0966 on file: 2026-07-12 · valid through 2027-07-12", optional: false, missing_items: [] },
      { label: "VSO representation (21-22)", ok: true, detail: "21-22 on file: 2026-07-12", optional: false, missing_items: [] },
      { label: "Required evidence", ok: true, detail: "All required documents on the checklist are present.", optional: false, missing_items: [] },
    ],
  },

  // 11. With VA -- submitted to VA Benefits Intake already.
  {
    case_id: "a6f4d8b2e759",
    status: "submitted",
    claim_type: "initial",
    created_on: "2026-04-02",
    veteran: {
      first_name: "Carlos",
      last_name: "Mendoza",
      dob: "1986-08-22",
      email: "carlos.mendoza@example.com",
      phone: "210-555-0166",
      branch: "marine_corps",
      service_start: "2005-09-01",
      service_end: "2013-09-01",
      discharge_type: "honorable",
    },
    conditions: [
      {
        id: "cond-cm-1",
        name: "Tinnitus",
        diagnosis: null,
        onset_date: "2011-01-01",
        started_in_service: true,
        worsened_in_service: false,
        currently_treated: false,
        current_symptoms: "Constant high-pitched ringing",
        notes: "MOS 0311, rifleman",
      },
    ],
    evidence: [
      { id: "ev-cm-1", evidence_type: "dd214", title: "DD-214", source: "veteran upload", condition_id: null },
      { id: "ev-cm-2", evidence_type: "service_treatment_record", title: "STR", source: "veteran upload", condition_id: null },
      { id: "ev-cm-3", evidence_type: "hearing_test", title: "Audiology results, Mar 2026", source: "veteran upload", condition_id: "cond-cm-1" },
    ],
    tasks: [],
    status_history: [
      { id: "sh-cm-1", status: "ready_for_vso", note: "Veteran submitted for VSO review", recorded_on: "2026-04-02" },
      { id: "sh-cm-2", status: "in_vso_review", note: "VSO approved -- ready for VA submission", recorded_on: "2026-04-10" },
      { id: "sh-cm-3", status: "submitted", note: "Submitted to VA Benefits Intake", recorded_on: "2026-04-15" },
    ],
    lane: "submitted",
    lane_title: "Submitted to VA",
    path_hint: "first_claim",
    evidence_checklist: [
      { evidence_type: "dd214", label: FRIENDLY_NAMES.dd214, required: true, satisfied: true, condition_name: null },
      { evidence_type: "service_treatment_record", label: FRIENDLY_NAMES.service_treatment_record, required: true, satisfied: true, condition_name: null },
      { evidence_type: "current_medical_record", label: FRIENDLY_NAMES.current_medical_record, required: true, satisfied: true, condition_name: "Tinnitus" },
      { evidence_type: "hearing_test", label: FRIENDLY_NAMES.hearing_test, required: false, satisfied: true, condition_name: "Tinnitus" },
    ],
    presumptive_hits: [
      {
        rule_id: "noise_exposure_mos",
        result: "NO_MATCH",
        explanation: "MOS/rate 0311 is not in our simplified noise-exposure table.",
        condition_name: "Tinnitus",
      },
    ],
    blockers: [],
    warnings: [],
    deadlines: [],
    form_sequence: FORM_SEQUENCE_STANDARD,
    next_ask: null,
    review_summary: "Filed with VA on 2026-04-15. Tracking the VA's decision.",
    review_items: [
      {
        id: "rev-cm-1",
        category: "CURRENT_CONDITION",
        finding: "Audiology results from March 2026 confirm tinnitus is currently present.",
        suggested_state: "CONFIRM",
        evidence_refs: ["ev-cm-3"],
        rule_result_ids: [],
      },
    ],
    messages: [
      { id: "msg-cm-1", claim_id: "a6f4d8b2e759", author: "vso", body: "Your packet looks good. Approved to file with VA. You can download the 526EZ and send it to the VA sandbox when ready.", created_at: "2026-04-10T11:00:00Z" },
      { id: "msg-cm-2", claim_id: "a6f4d8b2e759", author: "system", body: "Submitted to VA Benefits Intake.", created_at: "2026-04-15T09:00:00Z" },
    ],
    vso_approved: true,
    filing_checks: [
      { label: "Back-pay start date (21-0966)", ok: true, detail: "21-0966 on file: 2026-03-28 · valid through 2027-03-28", optional: false, missing_items: [] },
      { label: "VSO representation (21-22)", ok: true, detail: "21-22 on file: 2026-03-30", optional: false, missing_items: [] },
      { label: "Required evidence", ok: true, detail: "All required documents on the checklist are present.", optional: false, missing_items: [] },
    ],
  },

  // 12. With VA / decided -- the VA has already issued a decision.
  {
    case_id: "6c1a5e9f3d82",
    status: "decided",
    claim_type: "initial",
    created_on: "2026-01-08",
    veteran: {
      first_name: "Betty",
      last_name: "Simmons",
      dob: "1970-06-30",
      email: "betty.simmons@example.com",
      phone: "615-555-0122",
      branch: "air_force",
      service_start: "1990-01-15",
      service_end: "2010-01-15",
      discharge_type: "honorable",
    },
    conditions: [
      {
        id: "cond-bs-1",
        name: "Hypertension",
        diagnosis: "Essential hypertension",
        onset_date: "2008-05-01",
        started_in_service: true,
        worsened_in_service: false,
        currently_treated: true,
        current_symptoms: "Managed with daily medication",
        notes: null,
      },
    ],
    evidence: [
      { id: "ev-bs-1", evidence_type: "dd214", title: "DD-214", source: "veteran upload", condition_id: null },
      { id: "ev-bs-2", evidence_type: "service_treatment_record", title: "STR", source: "veteran upload", condition_id: null },
      { id: "ev-bs-3", evidence_type: "current_medical_record", title: "Cardiology note, Dec 2025", source: "veteran upload", condition_id: "cond-bs-1" },
    ],
    tasks: [],
    status_history: [
      { id: "sh-bs-1", status: "ready_for_vso", note: "Veteran submitted for VSO review", recorded_on: "2026-01-08" },
      { id: "sh-bs-2", status: "in_vso_review", note: "VSO approved -- ready for VA submission", recorded_on: "2026-01-15" },
      { id: "sh-bs-3", status: "submitted", note: "Submitted to VA Benefits Intake", recorded_on: "2026-01-20" },
      { id: "sh-bs-4", status: "decided", note: "VA decision received", recorded_on: "2026-06-30" },
    ],
    lane: "decided",
    lane_title: "Decided",
    path_hint: "first_claim",
    evidence_checklist: [
      { evidence_type: "dd214", label: FRIENDLY_NAMES.dd214, required: true, satisfied: true, condition_name: null },
      { evidence_type: "service_treatment_record", label: FRIENDLY_NAMES.service_treatment_record, required: true, satisfied: true, condition_name: null },
      { evidence_type: "current_medical_record", label: FRIENDLY_NAMES.current_medical_record, required: true, satisfied: true, condition_name: "Hypertension" },
    ],
    presumptive_hits: [],
    blockers: [],
    warnings: [],
    deadlines: [],
    form_sequence: FORM_SEQUENCE_STANDARD,
    next_ask: null,
    review_summary: "VA granted service connection at 10% on 2026-06-30.",
    review_items: [
      {
        id: "rev-bs-1",
        category: "CURRENT_CONDITION",
        finding: "Cardiology note documents ongoing hypertension management consistent with the claimed condition.",
        suggested_state: "CONFIRM",
        evidence_refs: ["ev-bs-3"],
        rule_result_ids: [],
      },
    ],
    messages: [
      { id: "msg-bs-1", claim_id: "6c1a5e9f3d82", author: "system", body: "Submitted to VA Benefits Intake.", created_at: "2026-01-20T09:00:00Z" },
      { id: "msg-bs-2", claim_id: "6c1a5e9f3d82", author: "system", body: "VA decision received: granted at 10%.", created_at: "2026-06-30T09:00:00Z" },
    ],
    vso_approved: true,
    filing_checks: [
      { label: "Back-pay start date (21-0966)", ok: true, detail: "21-0966 on file: 2026-01-05 · valid through 2027-01-05", optional: false, missing_items: [] },
      { label: "VSO representation (21-22)", ok: true, detail: "21-22 on file: 2026-01-06", optional: false, missing_items: [] },
      { label: "Required evidence", ok: true, detail: "All required documents on the checklist are present.", optional: false, missing_items: [] },
    ],
  },
];

export function findMockCase(caseId: string): MockCaseRecord | undefined {
  return mockCases.find((c) => c.case_id === caseId);
}

export { conditionSummary };
