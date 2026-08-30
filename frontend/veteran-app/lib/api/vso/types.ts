// Wire types for the VSO surface, mirroring the Python backend's response
// models VERBATIM (src/api/schemas.py + the enum string values in
// src/models.py) -- snake_case, same field names, same enum literals. The
// intent (plan: async-percolating-dewdrop) is that swapping
// MockVsoApiClient for a real fetch-based client later requires zero field
// mapping: whatever `response.json()` returns already matches these types.

// ---------------------------------------------------------------------------
// Controlled vocabularies (src/models.py) -- exact string enum values.
// ---------------------------------------------------------------------------

export type ClaimStatus =
  | "draft"
  | "ready_for_vso"
  | "in_vso_review"
  | "submitted"
  | "decided";

export type EvidenceType =
  | "dd214"
  | "service_treatment_record"
  | "service_personnel_record"
  | "current_medical_record"
  | "private_doctor_note"
  | "nexus_letter"
  | "buddy_statement"
  | "personal_statement"
  | "hearing_test"
  | "mental_health_evaluation"
  | "imaging"
  | "other";

export type Branch =
  | "army"
  | "navy"
  | "air_force"
  | "marine_corps"
  | "coast_guard"
  | "space_force"
  | "national_guard"
  | "reserves";

export type DischargeType =
  | "honorable"
  | "general"
  | "other_than_honorable"
  | "bad_conduct"
  | "dishonorable"
  | "uncharacterized"
  | "unknown";

export type ClaimType = "initial" | "increase" | "secondary" | "supplemental";

export type TaskStatus = "open" | "done" | "waived";

export type VSOVerdict = "pending" | "needs_more_info" | "approved_to_file";

export type MessageAuthor = "veteran" | "vso" | "system";

/** Presumptive-rule outcome (src/presumptive.py RuleResult). */
export type RuleResult = "MATCH" | "NO_MATCH" | "NOT_ENOUGH_DATA";

/** The only rule_id values the presumptive engine actually emits (src/presumptive.py). */
export type PresumptiveRuleId =
  | "pact_respiratory_gulf_era"
  | "agent_orange_vietnam"
  | "noise_exposure_mos"
  | "chronic_within_one_year";

/** ReviewItemResponse.category (src/api/schemas.py / plan doc). */
export type ReviewCategory =
  | "PRESUMPTIVE_ELIGIBILITY"
  | "SERVICE_CONNECTION"
  | "CURRENT_CONDITION"
  | "MISSING_EVIDENCE";

/** ReviewItemResponse.suggested_state -- never pre-applied, only pre-highlighted. */
export type ReviewSuggestedState = "CONFIRM" | "REJECT" | "NEEDS_REVIEW";

/** Deadline/ITF/POA urgency strings, union of every literal src/itf.py and
 * src/poa.py actually assign ("none", "missing", "ok", "soon", "urgent",
 * "expired") plus DeadlineResponse's schema default ("info"). */
export type Urgency = "none" | "missing" | "ok" | "soon" | "urgent" | "expired" | "info";

// ---------------------------------------------------------------------------
// Response models (src/api/schemas.py)
// ---------------------------------------------------------------------------

export interface VsoQueueItemResponse {
  claim_id: string;
  veteran_name: string;
  status: string;
  /** ISO date string (date.isoformat()). */
  created_on: string;
  /** Comma-joined condition names, already formatted server-side. */
  conditions: string;
}

export interface LiveMessageResponse {
  id: string;
  author: string;
  body: string;
  created_at: string;
}

export interface LiveEvidenceResponse {
  evidence_type: string;
  label: string;
}

export interface CaseLiveResponse {
  case_id: string;
  status: string;
  vso_approved: boolean;
  in_vso_queue: boolean;
  messages: LiveMessageResponse[];
  latest_message_id: string | null;
  message_count: number;
  evidence: LiveEvidenceResponse[];
  evidence_count: number;
}

export interface InboxLiveItemResponse {
  claim_id: string;
  veteran_name: string;
  status: string;
  vso_approved: boolean;
  latest_message_id: string | null;
  latest_author: string | null;
  latest_preview: string | null;
}

export interface ChecklistItemResponse {
  evidence_type: string;
  label: string;
  required: boolean;
  satisfied: boolean;
  condition_name: string | null;
}

export interface RuleResultResponse {
  rule_id: string;
  result: RuleResult;
  explanation: string;
  condition_name: string | null;
}

export interface DeadlineResponse {
  label: string;
  due_on: string | null;
  days_remaining: number | null;
  urgency: Urgency;
}

export interface FormStepResponse {
  form_number: string;
  title: string;
  filled_by: string;
  is_gate: boolean;
}

export interface ChecklistResponse {
  case_id: string;
  lane: string;
  lane_title: string;
  path_hint: string | null;
  status: ClaimStatus;
  required_fields_still_missing: string[];
  evidence_checklist: ChecklistItemResponse[];
  presumptive_hits: RuleResultResponse[];
  blockers: string[];
  warnings: string[];
  /** 100 - (required_missing * 20) - (suggested_missing * 5) - (warnings * 5), clamped 0-100.
   * Always render this WITH the three inputs (src/evidence_rules.py readiness_score) --
   * never the bare number, per the plan's "never present a computed value as a decision." */
  readiness_score: number;
  vso_packet_ready: boolean;
  next_ask: string | null;
  deadlines: DeadlineResponse[];
  form_sequence: FormStepResponse[];
}

export interface ReviewItemResponse {
  id: string;
  category: ReviewCategory;
  finding: string;
  suggested_state: ReviewSuggestedState;
  evidence_refs: string[];
  rule_result_ids: string[];
}

export interface ReviewPayloadResponse {
  case_id: string;
  lane: string;
  summary: string;
  items: ReviewItemResponse[];
}

export interface CaseMessageResponse {
  id: string;
  claim_id: string;
  author: MessageAuthor;
  body: string;
  /** ISO datetime string (datetime.isoformat()). */
  created_at: string;
}

export interface CaseSummaryResponse {
  case_id: string;
  status: ClaimStatus;
  veteran_name: string;
  lane: string;
  condition_count: number;
  readiness_score: number;
}

/**
 * The approve-to-file gate (src/poa.py FilingCheckItem / vso_filing_checklist).
 * Exactly three of these back the "Before you approve" rail: back-pay start
 * date (21-0966), VSO representation (21-22), required evidence. Ready to
 * approve iff every item is `ok || optional` (checklist_ready_to_approve).
 */
export interface FilingCheckItem {
  label: string;
  ok: boolean;
  detail: string;
  optional: boolean;
  missing_items: string[];
}

// ---------------------------------------------------------------------------
// Request bodies (src/api/schemas.py)
// ---------------------------------------------------------------------------

export interface PostMessageRequest {
  author: MessageAuthor;
  body: string;
}

export interface VsoRequestInfoBody {
  reviewer_name: string;
  request_text: string;
}

export interface VsoApproveBody {
  reviewer_name: string;
  note: string;
}

// ---------------------------------------------------------------------------
// Composite type for the case detail view (built in Phase 2, typed now)
// ---------------------------------------------------------------------------

export interface VsoCaseVeteran {
  first_name: string;
  last_name: string;
  dob: string | null;
  email: string | null;
  phone: string | null;
  branch: Branch | null;
  service_start: string | null;
  service_end: string | null;
  discharge_type: DischargeType;
}

export interface VsoCaseCondition {
  id: string;
  name: string;
  diagnosis: string | null;
  onset_date: string | null;
  started_in_service: boolean;
  worsened_in_service: boolean;
  currently_treated: boolean;
  current_symptoms: string;
  notes: string | null;
}

export interface VsoCaseEvidenceItem {
  id: string;
  evidence_type: EvidenceType;
  title: string | null;
  source: string | null;
  condition_id: string | null;
}

export interface VsoCaseTask {
  id: string;
  name: string;
  detail: string | null;
  required: boolean;
  owner: "veteran" | "vso";
  status: TaskStatus;
  condition_id: string | null;
}

export interface VsoCaseStatusEvent {
  id: string;
  status: ClaimStatus;
  note: string | null;
  /** ISO date string. */
  recorded_on: string;
}

/**
 * Full case record for the detail view (Phase 2). NOTE: no backend endpoint
 * returns this shape today -- GET /api/cases/{id} only returns
 * CaseSummaryResponse (case_id, status, veteran_name, lane, condition_count,
 * readiness_score); veteran demographics, held-evidence titles, tasks, and
 * status history are otherwise unreachable over JSON (plan constraint #3).
 * The mock (lib/api/vso/mock/caseload.ts) serves this in full so Phase 2 can
 * build against it; wiring a real client will need the backend engineer to
 * add `GET /api/cases/{id}/full` returning this shape. Do not build that
 * endpoint here -- it's out of scope and owned by another engineer.
 */
export interface VsoCase {
  case_id: string;
  status: ClaimStatus;
  claim_type: ClaimType;
  veteran: VsoCaseVeteran;
  conditions: VsoCaseCondition[];
  evidence: VsoCaseEvidenceItem[];
  tasks: VsoCaseTask[];
  status_history: VsoCaseStatusEvent[];
  /** True once any VSOReview carries verdict `approved_to_file` (mirrors
   * src/collaboration.py `vso_approved()`). Not on CaseSummaryResponse today
   * -- another field the eventual `/full` endpoint needs to add. */
  vso_approved: boolean;
  /** ISO date string. */
  created_on: string;
}
