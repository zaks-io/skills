import config from "./config.mjs";
import { definitions, canonicalDefinitions } from "./records.mjs";

const ref = (name) => ({ $ref: `#/definitions/${name}` });
const array = (name) => ({ type: "array", items: ref(name) });
const recordMap = (name) => ({ type: "object", additionalProperties: ref(name) });
const object = { type: "object" };
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
const snapshotProperties = {
  repo,
  v: { type: "integer", minimum: 1, maximum: 2 },
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
  worktrees: array("work"),
  linear: {
    type: "object",
    properties: {
      skipped: { type: ["string", "null"] },
      issues: array("issue"),
      activeIssues: array("issue"),
      issueMetadata: array("issue"),
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
            issueKey: canonicalDefinitions.issueReference.properties.issueKey,
            issueUuid: canonicalDefinitions.issueReference.properties.issueUuid,
          },
          anyOf: [{ required: ["issueKey"] }, { required: ["issueUuid"] }],
        },
      },
      unroutedIssueIds: { type: "array", items: text },
      candidateIssueIds: { type: "array", items: text },
      statesFilter: { type: "array", items: text },
      activeScope: {
        type: "object",
        properties: { routeLabel: { type: ["string", "null"] } },
      },
      candidateScope: {
        type: "object",
        properties: {
          routeLabel: { type: ["string", "null"] },
          states: { type: "array", items: text },
        },
      },
    },
  },
  usage: object,
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

const legacyInput = {
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
  definitions: {
    ...definitions,
    config,
    state,
    snapshot: { type: "object", additionalProperties: false, properties: snapshotProperties },
  },
};

const canonicalSnapshotProperties = {
  ...snapshotProperties,
  v: { const: 3 },
  prs: array("pullRequest"),
  worktrees: array("worktree"),
  linear: {
    ...snapshotProperties.linear,
    properties: {
      ...snapshotProperties.linear.properties,
      candidateIssueIds: false,
      candidateIssueRefs: false,
      candidateIssues: array("issueReference"),
    },
  },
};
export const canonicalState = {
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
export const canonicalInput = {
  ...legacyInput,
  properties: {
    ...canonicalSnapshotProperties,
    snapshot: ref("snapshot"),
    config: ref("config"),
    state: ref("state"),
    queue: ref("state"),
  },
  definitions: {
    ...canonicalDefinitions,
    config,
    state: canonicalState,
    snapshot: {
      type: "object",
      additionalProperties: false,
      properties: canonicalSnapshotProperties,
    },
  },
};

const prefixReferences = (value) => {
  if (Array.isArray(value)) return value.map(prefixReferences);
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value).map(([name, child]) => [
      name,
      name === "$ref" && child.startsWith("#/definitions/")
        ? child.replace("#/definitions/", "#/definitions/canonical_")
        : prefixReferences(child),
    ]),
  );
};
const canonicalBranch = prefixReferences(canonicalInput);
delete canonicalBranch.$id;
delete canonicalBranch.$schema;
delete canonicalBranch.definitions;
const legacyBranch = { ...legacyInput };
delete legacyBranch.$id;
delete legacyBranch.$schema;
delete legacyBranch.definitions;

export default {
  $schema: legacyInput.$schema,
  $id: legacyInput.$id,
  title: legacyInput.title,
  if: {
    type: "object",
    anyOf: [
      { required: ["v"], properties: { v: { const: 3 } } },
      {
        required: ["snapshot"],
        properties: {
          snapshot: { type: "object", required: ["v"], properties: { v: { const: 3 } } },
        },
      },
    ],
  },
  then: canonicalBranch,
  else: legacyBranch,
  definitions: {
    ...legacyInput.definitions,
    ...Object.fromEntries(
      Object.entries(canonicalInput.definitions).map(([name, schema]) => [
        `canonical_${name}`,
        prefixReferences(schema),
      ]),
    ),
  },
};
