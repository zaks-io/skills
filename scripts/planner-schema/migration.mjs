import { definitions, canonicalDefinitions } from "./migration-records.mjs";
const ref = (name) => ({ $ref: `#/definitions/${name}` });
const array = (name) => ({ type: "array", items: ref(name) });
const recordMap = (name) => ({ type: "object", additionalProperties: ref(name) });
const text = { type: "string" };
const repo = { type: "string", pattern: "^[^\\s/]+/[^\\s/]+$" };
const promotionOptions = {
  type: "object",
  additionalProperties: false,
  properties: {
    requestedReadyStatePromotion: { type: "boolean" },
    requestedLinearBacklogReview: { type: "boolean" },
  },
};
const state = {
  type: "object",
  additionalProperties: false,
  properties: {
    repo,
    pullRequests: array("pullRequest"),
    tickets: array("issue"),
    linearIssues: array("issue"),
    activeLinearIssues: array("issue"),
    startableTickets: array("startableTicket"),
    scopeIssueIds: { type: "array", items: { type: "string", pattern: "\\S" } },
    ...Object.fromEntries(
      ["dispatches", "ledgerDispatches", "activeWork", "workers", "worktrees", "previews"].map(
        (name) => [name, array("work")],
      ),
    ),
    ...Object.fromEntries(
      [
        "reviewEvidenceByPr",
        "reviewEvidence",
        "hostedReviewByPr",
        "reviewRequestsByPr",
        "reviewRequestByPr",
      ].map((name) => [name, recordMap("evidence")]),
    ),
    reviewEvidenceChecks: array("reviewEvidenceCheck"),
    reviewDiffByPr: { type: "object", additionalProperties: text },
    continuationByPr: { type: "object", additionalProperties: text },
    readyStatePromotionOptions: promotionOptions,
    activeSignalExpected: { type: "boolean" },
    localBudgetUsagePercent: { type: "number", minimum: 0 },
    tokenBudgetRemaining: { type: "number", minimum: 0 },
    timeBudgetRemainingMinutes: { type: "number", minimum: 0 },
  },
};

const canonicalState = {
  ...state,
  properties: {
    ...state.properties,
    scopeIssueIds: false,
    scopeIssues: array("issueReference"),
    ...Object.fromEntries(
      [
        "reviewEvidenceByPr",
        "reviewEvidence",
        "hostedReviewByPr",
        "reviewRequestsByPr",
        "reviewRequestByPr",
      ].map((name) => [
        name,
        { ...recordMap("evidence"), propertyNames: { pattern: "^[1-9][0-9]*$" } },
      ]),
    ),
    ...Object.fromEntries(
      ["dispatches", "ledgerDispatches", "activeWork", "workers"].map((name) => [
        name,
        array("worker"),
      ]),
    ),
    worktrees: array("worktree"),
    previews: array("preview"),
    reviewDiffByPr: {
      ...state.properties.reviewDiffByPr,
      propertyNames: { pattern: "^[1-9][0-9]*$" },
    },
    continuationByPr: {
      ...state.properties.continuationByPr,
      propertyNames: { pattern: "^[1-9][0-9]*$" },
    },
  },
};

export const legacyStateSchema = { ...state, $id: "migration-legacy", definitions };
export const oldCanonicalStateSchema = {
  ...canonicalState,
  $id: "migration-canonical",
  definitions: canonicalDefinitions,
};
