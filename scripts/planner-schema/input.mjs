import config from "./config.mjs";
import { definitions } from "./records.mjs";

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
  v: { type: "integer", minimum: 1 },
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
  definitions: {
    ...definitions,
    config,
    state,
    snapshot: { type: "object", additionalProperties: false, properties: snapshotProperties },
  },
};
