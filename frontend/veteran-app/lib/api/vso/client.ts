import type {
  CaseMessageResponse,
  CaseSummaryResponse,
  ChecklistResponse,
  ClaimStatus,
  FilingCheckItem,
  PostMessageRequest,
  ReviewPayloadResponse,
  VsoApproveBody,
  VsoCase,
  VsoCaseTask,
  VsoQueueItemResponse,
  VsoRequestInfoBody,
} from "@/lib/api/vso/types";
import {
  computeReadinessScore,
  findMockCase,
  mockCases,
  type MockCaseRecord,
} from "@/lib/api/vso/mock/caseload";

export interface VsoApiClient {
  listQueue(): Promise<VsoQueueItemResponse[]>;
  getCase(caseId: string): Promise<VsoCase>;
  getChecklist(caseId: string): Promise<ChecklistResponse>;
  getReviewItems(caseId: string): Promise<ReviewPayloadResponse>;
  getMessages(caseId: string): Promise<CaseMessageResponse[]>;
  postMessage(caseId: string, body: PostMessageRequest): Promise<CaseMessageResponse>;
  requestInfo(caseId: string, body: VsoRequestInfoBody): Promise<CaseMessageResponse>;
  approveToFile(caseId: string, body: VsoApproveBody): Promise<CaseSummaryResponse>;
  getPacket(caseId: string): Promise<{ case_id: string; packet: string }>;
  /**
   * The three-item approve-to-file gate (src/poa.py vso_filing_checklist),
   * exposed as its own read so the case detail rail can show "Before you
   * approve" up front -- passing and failing checks alike -- instead of
   * only learning what's wrong after a blocked approveToFile call. Phase 1
   * typed FilingCheckItem and seeded every mock case's filing_checks, but
   * left it unreachable from the interface; this is that missing read.
   */
  getFilingChecks(caseId: string): Promise<FilingCheckItem[]>;
}

const MOCK_LATENCY_MS = 400;

function delay<T>(value: T, ms = MOCK_LATENCY_MS): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

/**
 * Mirrors src/collaboration.py's ApprovalBlockedError (raised server-side as
 * a 400 with a semicolon-joined blocker list) so a real fetch-based client
 * can throw the same shape later without touching any catch site.
 */
export class VsoApprovalBlockedError extends Error {
  constructor(public readonly blockers: string[]) {
    super(blockers.join("; "));
    this.name = "VsoApprovalBlockedError";
  }
}

/**
 * The four triage lanes the inbox groups by (plan Screen 1). Derived from
 * case state rather than stored, the same way the backend recomputes lane
 * from facts instead of persisting it -- there is no `assignedVsoId` or
 * per-VSO queue yet (plan constraint #1), so this is the entire triage
 * model for v1: a shared queue, bucketed client-side.
 */
export type TriageLane = "needs_you" | "waiting_on_veteran" | "ready_to_file" | "with_va";

export const TRIAGE_LANE_LABELS: Record<TriageLane, string> = {
  needs_you: "Needs you",
  waiting_on_veteran: "Waiting on veteran",
  ready_to_file: "Ready to file",
  with_va: "With VA",
};

/** Same ordering the inbox renders lanes in -- most actionable first. */
export const TRIAGE_LANE_ORDER: TriageLane[] = [
  "needs_you",
  "waiting_on_veteran",
  "ready_to_file",
  "with_va",
];

/**
 * The subset of fields triage bucketing needs, deliberately expressed as
 * plain wire-shape values (a ClaimStatus, a blockers list, a boolean)
 * rather than taking a MockCaseRecord -- so this function reads the same
 * way against a real backend later: `status` from VsoQueueItemResponse,
 * `blockers` from ChecklistResponse, `vso_approved` from VsoCase, and
 * `waitingOnVeteran` from an open "VSO requested information" task on
 * VsoCase.tasks. Nothing here is mock-only.
 */
export interface TriageInput {
  status: ClaimStatus;
  vso_approved: boolean;
  blockers: string[];
  waitingOnVeteran: boolean;
}

/**
 * Bucket a case into a triage lane. "Waiting on veteran" is checked before
 * "ready to file" so a case that technically clears the evidence checklist
 * but still has an outstanding request doesn't jump the queue. "With VA"
 * covers both submitted/decided status and an approval that hasn't been
 * submitted yet, since neither needs further VSO attention. Everything
 * else -- including a case whose blockers simply haven't been resolved
 * yet -- lands in "Needs you," the catch-all working queue.
 */
export function deriveTriageLane(input: TriageInput): TriageLane {
  if (input.status === "submitted" || input.status === "decided" || input.vso_approved) {
    return "with_va";
  }
  if (input.waitingOnVeteran) {
    return "waiting_on_veteran";
  }
  return input.blockers.length === 0 ? "ready_to_file" : "needs_you";
}

function toQueueItem(record: MockCaseRecord): VsoQueueItemResponse {
  return {
    claim_id: record.case_id,
    veteran_name: `${record.veteran.first_name} ${record.veteran.last_name}`,
    status: record.status,
    created_on: record.created_on,
    conditions: record.conditions.map((c) => c.name).join(", "),
  };
}

function toVsoCase(record: MockCaseRecord): VsoCase {
  return {
    case_id: record.case_id,
    status: record.status,
    claim_type: record.claim_type,
    veteran: record.veteran,
    conditions: record.conditions,
    evidence: record.evidence,
    tasks: record.tasks,
    status_history: record.status_history,
    vso_approved: record.vso_approved,
    created_on: record.created_on,
  };
}

/** True when a case's task list contains an open "VSO requested
 * information" task -- the exact task name src/collaboration.py's
 * vso_request_info always creates. Exported so callers building a
 * TriageInput from VsoCase.tasks (a real, non-mock-only field) can reuse
 * this instead of re-matching the string themselves. */
export function hasOpenInfoRequest(tasks: VsoCaseTask[]): boolean {
  return tasks.some((task) => task.name === "VSO requested information" && task.status === "open");
}

function toChecklist(record: MockCaseRecord): ChecklistResponse {
  return {
    case_id: record.case_id,
    lane: record.lane,
    lane_title: record.lane_title,
    path_hint: record.path_hint,
    status: record.status,
    required_fields_still_missing: [],
    evidence_checklist: record.evidence_checklist,
    presumptive_hits: record.presumptive_hits,
    blockers: record.blockers,
    warnings: record.warnings,
    readiness_score: computeReadinessScore(record.evidence_checklist, record.warnings.length),
    vso_packet_ready: record.blockers.length === 0,
    next_ask: record.next_ask,
    deadlines: record.deadlines,
    form_sequence: record.form_sequence,
  };
}

function generatePacketText(record: MockCaseRecord): string {
  const veteranName = `${record.veteran.first_name} ${record.veteran.last_name}`;
  const conditionLines = record.conditions
    .map((c) => `  - ${c.name}${c.diagnosis ? ` (${c.diagnosis})` : ""}`)
    .join("\n");
  const evidenceLines = record.evidence.map((e) => `  - ${e.title ?? e.evidence_type}`).join("\n");
  const readiness = computeReadinessScore(record.evidence_checklist, record.warnings.length);
  return [
    `VSO PACKET -- ${veteranName}`,
    `Case ID: ${record.case_id}`,
    `Status: ${record.status}`,
    `Readiness: ${readiness}/100`,
    "",
    "Conditions:",
    conditionLines || "  (none on file)",
    "",
    "Evidence on hand:",
    evidenceLines || "  (none on file)",
    "",
    "Blockers:",
    record.blockers.length ? record.blockers.map((b) => `  - ${b}`).join("\n") : "  (none)",
  ].join("\n");
}

function requireCase(caseId: string): MockCaseRecord {
  const record = findMockCase(caseId);
  if (!record) {
    throw new Error(`VSO case not found: ${caseId}`);
  }
  return record;
}

/**
 * Mock implementation over the in-repo caseload fixtures -- no network
 * calls, same shape discipline as lib/api/client.ts's MockApiClient. When
 * a real backend is wired up, only this file's implementation changes:
 * every method already returns exactly what `/api/...` would (plan:
 * async-percolating-dewdrop, "Data layer"). Mutating methods mutate the
 * `mockCases` records in place so the UI reflects changes across
 * navigations within the same session, the same way a real backend's
 * database would.
 */
class MockVsoApiClient implements VsoApiClient {
  async listQueue(): Promise<VsoQueueItemResponse[]> {
    return delay(mockCases.map(toQueueItem));
  }

  async getCase(caseId: string): Promise<VsoCase> {
    return delay(toVsoCase(requireCase(caseId)));
  }

  async getChecklist(caseId: string): Promise<ChecklistResponse> {
    return delay(toChecklist(requireCase(caseId)));
  }

  async getReviewItems(caseId: string): Promise<ReviewPayloadResponse> {
    const record = requireCase(caseId);
    return delay({
      case_id: record.case_id,
      lane: record.lane,
      summary: record.review_summary,
      items: record.review_items,
    });
  }

  async getMessages(caseId: string): Promise<CaseMessageResponse[]> {
    return delay([...requireCase(caseId).messages]);
  }

  async postMessage(caseId: string, body: PostMessageRequest): Promise<CaseMessageResponse> {
    const record = requireCase(caseId);
    const message: CaseMessageResponse = {
      id: `msg-${crypto.randomUUID().slice(0, 8)}`,
      claim_id: caseId,
      author: body.author,
      body: body.body,
      created_at: new Date().toISOString(),
    };
    record.messages.push(message);
    // Mirrors src/collaboration.py post_message: the first VSO note on a
    // case still sitting in the raw "ready_for_vso" queue opens the case.
    if (body.author === "vso" && record.status === "ready_for_vso") {
      record.status = "in_vso_review";
      record.status_history.push({
        id: `sh-${crypto.randomUUID().slice(0, 8)}`,
        status: "in_vso_review",
        note: "VSO opened the case",
        recorded_on: new Date().toISOString().slice(0, 10),
      });
    }
    return delay(message);
  }

  async requestInfo(caseId: string, body: VsoRequestInfoBody): Promise<CaseMessageResponse> {
    const record = requireCase(caseId);

    // Mirrors src/collaboration.py vso_request_info: opens the case (if not
    // already open), files a formal follow-up task, and posts the request
    // as a message from the VSO -- distinct from postMessage, which never
    // creates a task. This is the "request evidence" action, not a note.
    record.status = "in_vso_review";
    record.tasks.push({
      id: `task-${crypto.randomUUID().slice(0, 8)}`,
      name: "VSO requested information",
      detail: body.request_text,
      required: true,
      owner: "veteran",
      status: "open",
      condition_id: null,
    });
    record.status_history.push({
      id: `sh-${crypto.randomUUID().slice(0, 8)}`,
      status: "in_vso_review",
      note: "VSO requested more information",
      recorded_on: new Date().toISOString().slice(0, 10),
    });

    const message: CaseMessageResponse = {
      id: `msg-${crypto.randomUUID().slice(0, 8)}`,
      claim_id: caseId,
      author: "vso",
      body: body.request_text,
      created_at: new Date().toISOString(),
    };
    record.messages.push(message);
    return delay(message);
  }

  async getFilingChecks(caseId: string): Promise<FilingCheckItem[]> {
    return delay([...requireCase(caseId).filing_checks]);
  }

  async approveToFile(caseId: string, body: VsoApproveBody): Promise<CaseSummaryResponse> {
    const record = requireCase(caseId);
    const blockers = filingCheckBlockers(record.filing_checks);
    if (blockers.length > 0) {
      // Real latency before the rejection, same as a real 400 round trip --
      // callers should not be able to distinguish "blocked" from "slow".
      await delay(undefined);
      throw new VsoApprovalBlockedError(blockers);
    }

    record.vso_approved = true;
    record.status_history.push({
      id: `sh-${crypto.randomUUID().slice(0, 8)}`,
      status: record.status,
      note: "VSO approved -- ready for VA submission",
      recorded_on: new Date().toISOString().slice(0, 10),
    });
    record.messages.push({
      id: `msg-${crypto.randomUUID().slice(0, 8)}`,
      claim_id: caseId,
      author: "vso",
      body: `Your packet looks good. ${body.note} You can download the 526EZ and send it to the VA sandbox when ready.`,
      created_at: new Date().toISOString(),
    });

    const readiness = computeReadinessScore(record.evidence_checklist, record.warnings.length);
    return delay({
      case_id: record.case_id,
      status: record.status,
      veteran_name: `${record.veteran.first_name} ${record.veteran.last_name}`,
      lane: record.lane,
      condition_count: record.conditions.length,
      readiness_score: readiness,
    });
  }

  async getPacket(caseId: string): Promise<{ case_id: string; packet: string }> {
    const record = requireCase(caseId);
    return delay({ case_id: record.case_id, packet: generatePacketText(record) });
  }
}

/**
 * Mirrors src/collaboration.py approval_blockers: everything that is
 * neither ok nor optional blocks approval, with "Required evidence"
 * expanded to its individual missing items (same as the backend does)
 * instead of the generic check label. Exported (not just used internally by
 * approveToFile) so the case detail page's "Before you approve" rail and
 * its Approve button's disabled state read the exact same blocker list the
 * mutation itself would reject on -- one source of truth instead of the UI
 * re-deriving its own guess at what blocks approval.
 */
export function filingCheckBlockers(checks: FilingCheckItem[]): string[] {
  const blockers: string[] = [];
  for (const check of checks) {
    if (check.ok || check.optional) continue;
    if (check.label === "Required evidence" && check.missing_items.length > 0) {
      blockers.push(...check.missing_items);
    } else {
      blockers.push(check.label);
    }
  }
  return blockers;
}

// A real implementation would live alongside this one and be selected here,
// same as lib/api/client.ts -- there is no live VSO backend wired up yet
// (no CORS, no auth; plan constraint #2), so mock is the only implementation.
export const vsoApiClient: VsoApiClient = new MockVsoApiClient();
