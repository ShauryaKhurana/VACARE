import type { Claim, VsoInfo } from "@/lib/api/types";

// Six fixtures covering every state the wireframes require (LLD Section 6.2),
// so no screen is ever built against a guess.

const sharedVso: VsoInfo = {
  name: "Maria Alvarez",
  organization: "Disabled American Veterans (DAV)",
  accreditationId: "DAV-2291",
  contactMethods: [
    { type: "phone", value: "(555) 019-2231" },
    { type: "message", value: "In-app message" },
    { type: "email", value: "malvarez@dav.org" },
  ],
};

export const claimJustSubmitted: Claim = {
  routingId: "route-just-submitted",
  claimType: "original",
  stage: "submitted",
  vso: sharedVso,
  conditions: [
    { id: "c1", name: "Tinnitus", outcome: "pending", computedEligible: true },
    { id: "c2", name: "Right shoulder strain", outcome: "pending", computedEligible: false },
  ],
  needsAttention: [],
  upcoming: [
    {
      id: "u1",
      title: "VA may reach out to confirm receipt",
      detail: "This is routine and usually happens within the first couple of weeks.",
      date: addDays(10),
    },
  ],
  updates: [
    {
      id: "e1",
      source: "vso",
      text: "Your claim was submitted to VA today. I'll let you know the moment anything changes.",
      timestamp: addDays(0),
    },
  ],
};

export const claimInDevelopment: Claim = {
  routingId: "route-in-development",
  claimType: "original",
  stage: "development",
  vso: sharedVso,
  conditions: [
    { id: "c1", name: "Tinnitus", outcome: "pending", computedEligible: true },
    { id: "c2", name: "Right shoulder strain", outcome: "pending", computedEligible: false },
    { id: "c3", name: "PTSD", outcome: "pending", computedEligible: false },
  ],
  needsAttention: [
    {
      id: "a1",
      title: "Private medical records for your shoulder",
      detail:
        "VA is asking for records from a provider outside VA. Uploading them helps avoid a delay.",
      action: "upload-document",
      actionLabel: "Upload records",
    },
    {
      id: "a2",
      title: "Consent to release records (VA Form 4142)",
      detail: "This lets VA request your private records directly, so you don't have to chase them down yourself.",
      action: "e-sign-release",
      actionLabel: "Review and sign",
    },
  ],
  upcoming: [
    {
      id: "u1",
      title: "Records request deadline",
      detail: "VA has asked for the shoulder records by this date. There's time -- no need to rush.",
      date: addDays(21),
    },
  ],
  updates: [
    {
      id: "e1",
      source: "va",
      text: "VA is reviewing your claim (this stage is called \"development\"). They've requested additional evidence for your shoulder condition.",
      timestamp: addDays(-2),
    },
    {
      id: "e2",
      source: "vso",
      text: "I saw VA's request come through. Let's get those shoulder records uploaded so we're not waiting on the mail.",
      timestamp: addDays(-2),
    },
    {
      id: "e3",
      source: "veteran",
      text: "Sent a message asking about timeline.",
      timestamp: addDays(-1),
    },
  ],
};

export const claimExamScheduled: Claim = {
  routingId: "route-exam-scheduled",
  claimType: "original",
  stage: "exam-scheduled",
  vso: sharedVso,
  conditions: [
    { id: "c1", name: "Tinnitus", outcome: "pending", computedEligible: true },
    { id: "c2", name: "Right shoulder strain", outcome: "pending", computedEligible: false },
    { id: "c3", name: "PTSD", outcome: "pending", computedEligible: false },
  ],
  needsAttention: [
    {
      id: "a1",
      title: "Confirm your exam appointment",
      detail:
        "VA scheduled an exam for your shoulder condition. Save the contractor's number so you don't miss the call.",
      action: "message-vso",
      actionLabel: "See exam details",
    },
  ],
  upcoming: [
    {
      id: "u1",
      title: "Shoulder exam appointment",
      detail: "VA may call from an unknown number to confirm. Save it as \"possible VA call.\"",
      date: addDays(9),
    },
  ],
  updates: [
    {
      id: "e1",
      source: "va",
      text: "An exam has been scheduled with an outside provider (QTC) for your shoulder condition.",
      timestamp: addDays(-3),
    },
    {
      id: "e2",
      source: "vso",
      text: "This exam is routine -- the examiner fills out a structured form that's used directly in your rating.",
      timestamp: addDays(-3),
    },
  ],
};

const resolvedBase: Pick<Claim, "vso" | "needsAttention" | "upcoming"> = {
  vso: sharedVso,
  needsAttention: [],
  upcoming: [],
};

export const claimResolvedPartial: Claim = {
  routingId: "route-resolved-partial",
  claimType: "original",
  stage: "resolved",
  ...resolvedBase,
  conditions: [
    { id: "c1", name: "Tinnitus", outcome: "granted", rating: 10, computedEligible: true, reason: "Service connection conceded based on your military job code's noise-exposure match." },
    { id: "c2", name: "Right shoulder strain", outcome: "granted", rating: 20, computedEligible: false, reason: "Current diagnosis and in-service event both documented; exam confirmed the connection." },
    { id: "c3", name: "PTSD", outcome: "denied", rating: 0, computedEligible: false, reason: "The exam did not find enough evidence linking your current symptoms to an in-service event." },
  ],
  updates: [
    {
      id: "e1",
      source: "va",
      text: "A decision has been made on your claim.",
      timestamp: addDays(-1),
    },
  ],
  decision: {
    combinedRating: 30,
    monthlyAmount: 524.31,
    conditions: [
      { id: "c1", name: "Tinnitus", outcome: "granted", rating: 10, computedEligible: true, reason: "Service connection conceded based on your military job code's noise-exposure match." },
      { id: "c2", name: "Right shoulder strain", outcome: "granted", rating: 20, computedEligible: false, reason: "Current diagnosis and in-service event both documented; exam confirmed the connection." },
      { id: "c3", name: "PTSD", outcome: "denied", rating: 0, computedEligible: false, reason: "The exam did not find enough evidence linking your current symptoms to an in-service event." },
    ],
    unlocks: [
      "VA health care enrollment",
      "Priority processing for future claims tied to these conditions",
    ],
    mathSteps: [
      { label: "Highest rating (shoulder)", value: "20%" },
      { label: "Next rating (tinnitus), combined with remaining efficiency", value: "20% + 10% of the remaining 80% = 28%, rounded to 30%" },
      { label: "Combined rating", value: "30%" },
    ],
  },
};

export const claimResolvedFullGrant: Claim = {
  routingId: "route-resolved-full-grant",
  claimType: "presumptive",
  stage: "resolved",
  ...resolvedBase,
  conditions: [
    { id: "c1", name: "Tinnitus", outcome: "granted", rating: 10, computedEligible: true, reason: "Service connection conceded based on your military job code's noise-exposure match." },
    { id: "c2", name: "Asthma (PACT Act)", outcome: "granted", rating: 30, computedEligible: true, reason: "Presumptive condition -- your deployment location and service dates qualify automatically under the PACT Act." },
  ],
  updates: [
    {
      id: "e1",
      source: "va",
      text: "A decision has been made on your claim.",
      timestamp: addDays(-1),
    },
  ],
  decision: {
    combinedRating: 40,
    monthlyAmount: 755.28,
    conditions: [
      { id: "c1", name: "Tinnitus", outcome: "granted", rating: 10, computedEligible: true, reason: "Service connection conceded based on your military job code's noise-exposure match." },
      { id: "c2", name: "Asthma (PACT Act)", outcome: "granted", rating: 30, computedEligible: true, reason: "Presumptive condition -- your deployment location and service dates qualify automatically under the PACT Act." },
    ],
    unlocks: [
      "VA health care enrollment",
      "VA home loan funding fee waiver",
      "Property tax exemption (varies by state -- ask your VSO)",
      "Education benefits for dependents (Fry Scholarship eligibility varies)",
    ],
    mathSteps: [
      { label: "Highest rating (asthma)", value: "30%" },
      { label: "Next rating (tinnitus), combined with remaining efficiency", value: "30% + 10% of the remaining 70% = 37%, rounded to 40%" },
      { label: "Combined rating", value: "40%" },
    ],
  },
};

export const claimResolvedDenied: Claim = {
  routingId: "route-resolved-denied",
  claimType: "original",
  stage: "resolved",
  ...resolvedBase,
  conditions: [
    { id: "c1", name: "Lower back strain", outcome: "denied", rating: 0, computedEligible: false, reason: "No record of an in-service event was found, and the exam did not establish a service connection." },
  ],
  updates: [
    {
      id: "e1",
      source: "va",
      text: "A decision has been made on your claim.",
      timestamp: addDays(-1),
    },
  ],
  decision: {
    combinedRating: 0,
    monthlyAmount: 0,
    conditions: [
      { id: "c1", name: "Lower back strain", outcome: "denied", rating: 0, computedEligible: false, reason: "No record of an in-service event was found, and the exam did not establish a service connection." },
    ],
    unlocks: [],
    mathSteps: [{ label: "Combined rating", value: "0% -- no conditions granted this time" }],
  },
};

function addDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

export const fixturesByRoutingId: Record<string, Claim> = {
  [claimJustSubmitted.routingId]: claimJustSubmitted,
  [claimInDevelopment.routingId]: claimInDevelopment,
  [claimExamScheduled.routingId]: claimExamScheduled,
  [claimResolvedPartial.routingId]: claimResolvedPartial,
  [claimResolvedFullGrant.routingId]: claimResolvedFullGrant,
  [claimResolvedDenied.routingId]: claimResolvedDenied,
};

/** Default fixture used for any routing ID not explicitly seeded above (e.g. a fresh session). */
export const defaultFixture = claimInDevelopment;
