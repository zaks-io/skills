import config from "./config.mjs";
import { definitions } from "./records.mjs";

const ref = (name) => ({ $ref: `#/definitions/${name}` });
const array = (name) => ({ type: "array", items: ref(name) });
const text = { type: "string" };
const object = { type: "object" };
const repo = { type: "string", pattern: "^[^\\s/]+/[^\\s/]+$" };
const prMap = (record = ref("evidence")) => ({
  type: "object",
  propertyNames: { pattern: "^[1-9][0-9]*$" },
  additionalProperties: record,
});
const stateProperties = {
  repo,
  v: { const: 3 },
  workerLimit: { type: "integer", minimum: 0 },
  preparations: {
    type: "array",
    items: {
      type: "object",
      additionalProperties: false,
      required: ["updatedAt", "outcome", "reason"],
      properties: {
        ...definitions.issueReference.properties,
        updatedAt: { type: "string", pattern: "\\S" },
        outcome: { enum: ["ready", "needs-slicing", "needs-human"] },
        reason: { type: "string", pattern: "\\S" },
      },
      anyOf: [{ required: ["issueKey"] }, { required: ["issueUuid"] }],
    },
  },
  mergeResultsByPr: {
    type: "object",
    propertyNames: { pattern: "^[1-9][0-9]*$" },
    additionalProperties: {
      type: "object",
      additionalProperties: false,
      required: ["headSha", "mergeCommitSha", "postMergeCheck"],
      properties: {
        ...definitions.issueReference.properties,
        headSha: { type: "string", pattern: "\\S" },
        mergeCommitSha: { type: "string", pattern: "\\S" },
        postMergeCheck: { enum: ["passed", "failed"] },
        trackerUpdatedAt: { type: "string", pattern: "\\S" },
      },
    },
  },

  pullRequests: array("pullRequest"),
  ...Object.fromEntries(
    ["tickets", "linearIssues", "activeLinearIssues"].map((name) => [name, array("issue")]),
  ),
  startableTickets: array("startableTicket"),
  scopeIssues: array("issueReference"),
  dispatches: array("worker"),
  worktrees: array("worktree"),
  previews: array("preview"),
  ...Object.fromEntries(
    ["reviewEvidenceByPr", "hostedReviewByPr", "reviewRequestsByPr"].map((name) => [name, prMap()]),
  ),
  reviewEvidenceChecks: array("reviewEvidenceCheck"),
  reviewDiffByPr: prMap(text),
  continuationByPr: prMap(text),
  readyStatePromotionOptions: {
    type: "object",
    additionalProperties: false,
    properties: {
      requestedReadyStatePromotion: { type: "boolean" },
      requestedLinearBacklogReview: { type: "boolean" },
    },
  },
  activeSignalExpected: { type: "boolean" },
  ...Object.fromEntries(
    ["localBudgetUsagePercent", "tokenBudgetRemaining", "timeBudgetRemainingMinutes"].map(
      (name) => [name, { type: "number", minimum: 0 }],
    ),
  ),
};
export const state = {
  type: "object",
  additionalProperties: false,
  required: ["v", "repo"],
  properties: stateProperties,
};
const observation = {
  type: "object",
  additionalProperties: false,
  properties: Object.fromEntries(
    [
      "dispatches",
      "reviewRequestsByPr",
      "reviewEvidenceByPr",
      "hostedReviewByPr",
      "scopeIssues",
      "linearIssues",
      "workerLimit",
      "preparations",
      "mergeResultsByPr",
      "pullRequests",
    ].map((name) => [name, stateProperties[name]]),
  ),
};
const snapshotProperties = {
  v: { const: 3 },
  repo,
  generatedAt: text,
  sources: object,
  baseline: {
    type: "object",
    properties: {
      branch: { type: ["string", "null"] },
      headSha: { type: ["string", "null"] },
      green: { type: "boolean" },
      checks: ref("checks"),
    },
  },
  footprint: object,
  prs: array("pullRequest"),
  worktrees: array("worktree"),
  usage: object,
  linear: {
    type: "object",
    properties: {
      skipped: { type: ["string", "null"] },
      ...Object.fromEntries(
        ["issues", "activeIssues", "issueMetadata"].map((name) => [name, array("issue")]),
      ),
      candidateIssues: array("issueReference"),
      candidateIssueIds: false,
      candidateIssueRefs: false,
      identityDiagnostics: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["code", "path", "blockingStarts"],
          properties: {
            code: { const: "REFERENCED_ISSUE_NOT_FOUND" },
            path: { type: "string", pattern: "\\S" },
            blockingStarts: { const: true },
            ...definitions.issueReference.properties,
          },
          anyOf: [{ required: ["issueKey"] }, { required: ["issueUuid"] }],
        },
      },
      unroutedIssueIds: { type: "array", items: text },
      statesFilter: { type: "array", items: text },
      activeScope: { type: "object", properties: { routeLabel: { type: ["string", "null"] } } },
      candidateScope: {
        type: "object",
        properties: {
          routeLabel: { type: ["string", "null"] },
          states: { type: "array", items: text },
        },
      },
    },
  },
};
const snapshot = {
  type: "object",
  additionalProperties: false,
  required: ["v"],
  properties: snapshotProperties,
};
export default {
  $schema: "http://json-schema.org/draft-07/schema#",
  $id: "https://github.com/zaks-io/skills/planner-input.schema.json",
  title: "Orchestrator planner input",
  type: "object",
  additionalProperties: false,
  properties: {
    ...snapshotProperties,
    snapshot: ref("snapshot"),
    config: ref("config"),
    state: ref("state"),
    queue: ref("state"),
  },
  anyOf: [{ required: ["v"] }, { required: ["snapshot"] }],
  definitions: { ...definitions, config, state, observation, snapshot },
};
