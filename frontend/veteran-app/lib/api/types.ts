// Domain types shared by every component and by the mock/real API client.
// Requirements doc Frontend LLD, Section 6.1.

/** Session/routing identifier only -- never a name, SSN, or file number (requirements Section 4.5). */
export type RoutingId = string;

export type ClaimType =
  | "original"
  | "increase"
  | "presumptive"
  | "supplemental"
  | "higher-level-review"
  | "fdc";

export const CLAIM_TYPE_LABELS: Record<ClaimType, string> = {
  original: "Original claim",
  increase: "Claim for increase",
  presumptive: "Presumptive claim",
  supplemental: "Supplemental claim",
  "higher-level-review": "Higher-level review",
  fdc: "Fully developed claim",
};

export type ClaimStage =
  | "submitted"
  | "development"
  | "exam-scheduled"
  | "resolved";

export type ConditionOutcome = "granted" | "denied" | "pending";

export interface Condition {
  id: string;
  name: string;
  outcome: ConditionOutcome;
  /** 0-100, present once decided. */
  rating?: number;
  /** true = deterministic/presumptive, drives the "computed" tag. */
  computedEligible: boolean;
  /** Plain-language reason, shown in the decision breakdown. */
  reason?: string;
}

export type AttentionItemAction =
  | "upload-document"
  | "e-sign-release"
  | "message-vso";

export interface AttentionItem {
  id: string;
  title: string;
  detail: string;
  action: AttentionItemAction;
  actionLabel: string;
}

export interface UpcomingItem {
  id: string;
  title: string;
  detail: string;
  /** ISO date string. */
  date: string;
}

export type UpdateEntrySource = "va" | "vso" | "veteran";

export interface UpdateEntry {
  id: string;
  source: UpdateEntrySource;
  text: string;
  /** ISO date string. */
  timestamp: string;
}

export interface VsoInfo {
  name: string;
  organization: string;
  accreditationId: string;
  contactMethods: { type: "phone" | "message" | "email"; value: string }[];
}

export interface Decision {
  combinedRating: number;
  monthlyAmount: number;
  conditions: Condition[];
  unlocks: string[];
  /** Step-by-step combined-rating math, shown in the "How we got to X%" walkthrough. */
  mathSteps: { label: string; value: string }[];
}

export interface Claim {
  routingId: RoutingId;
  claimType: ClaimType;
  stage: ClaimStage;
  vso: VsoInfo;
  conditions: Condition[];
  needsAttention: AttentionItem[];
  upcoming: UpcomingItem[];
  updates: UpdateEntry[];
  decision?: Decision;
}

// Chat message union -- mirrors the assembled Talk wireframe exactly.
export interface ConfirmationField {
  label: string;
  value: string;
}

export type ChatMessage =
  | { id: string; type: "ai-text"; text: string }
  | { id: string; type: "veteran-text"; text: string }
  | { id: string; type: "document-upload"; prompt: string; documentType: "dd214" | "medical-record" | "other" }
  | { id: string; type: "confirmation-card"; fields: ConfirmationField[] }
  | { id: string; type: "eligibility-card"; conditions: Condition[] }
  | { id: string; type: "statement-builder"; prompt: string }
  /** Fixed choices for the current question, rendered as tappable answers.
   *  Without this, choice-only steps (e.g. "Done uploading") are unanswerable. */
  | { id: string; type: "quick-replies"; options: string[] };
