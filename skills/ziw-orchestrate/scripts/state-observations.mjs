import { validateCanonicalState } from "./planner-input-validator.mjs";
import { assertIdentityFieldNames, normalizePlannerModel } from "./planner-model.mjs";
import { isLiveWorker } from "./worker-lifecycle.mjs";
import {
  normalizeReviewMaps,
  recordReviewRequest,
  recordReviewResult,
} from "./review-observations.mjs";

const workerCollections = ["dispatches", "ledgerDispatches", "activeWork", "workers"];
const observationFields = new Set([
  "dispatches",
  "reviewRequestsByPr",
  "reviewEvidenceByPr",
  "hostedReviewByPr",
  "scopeIssues",
  "linearIssues",
]);
const nonempty = (value) => typeof value === "string" && value.trim().length > 0;
const same = (left, right) => nonempty(left) && left === right;
const fail = (message) => {
  throw new Error(message);
};

export function validatePlannerState(state) {
  if (!validateCanonicalState(state)) fail("state does not match the canonical planner schema");
  assertIdentityFieldNames(state, "state");
  normalizePlannerModel({ snapshot: { v: 3 }, state });
}

function recordWorker(state, observation) {
  const allowed = new Set([
    "issueKey",
    "issueUuid",
    "sessionId",
    "receiptId",
    "runId",
    "branch",
    "footprint",
    "status",
    "prNumber",
    "prUrl",
    "headSha",
    "worktree",
  ]);
  if (Object.keys(observation).some((key) => !allowed.has(key)))
    fail("unsupported worker observation field; use status for lifecycle");
  if (!observation.sessionId && !observation.receiptId)
    fail("worker observation needs sessionId or receiptId");
  if (!["running", "returned", "failed", "stopped"].includes(observation.status))
    fail("worker status must be confirmed as running, returned, failed, or stopped");
  if (["state", "returned", "stopped", "occupiesWorkerSlot"].some((key) => key in observation))
    fail("worker observation uses status only for lifecycle");
  const matches = [];
  for (const collection of workerCollections) {
    for (const [index, record] of (state[collection] ?? []).entries()) {
      if (
        same(record.sessionId, observation.sessionId) ||
        same(record.receiptId, observation.receiptId)
      )
        matches.push({ collection, index, record });
    }
  }
  if (!matches.length) {
    if (
      (!observation.issueKey && !observation.issueUuid) ||
      !nonempty(observation.branch) ||
      !Array.isArray(observation.footprint) ||
      !observation.footprint.length ||
      !observation.footprint.every(nonempty)
    )
      fail("a new worker needs its issue, branch, and nonempty footprint");
    (state.dispatches ??= []).push(observation);
    return;
  }
  for (const { collection, index, record } of matches) {
    if (record.previousRunIds?.includes(observation.runId))
      fail("this worker run was superseded; recover the current run");
    if (
      record.runId &&
      record.runId !== observation.runId &&
      (!observation.runId || observation.status !== "running" || isLiveWorker(record))
    )
      fail("worker observation does not match the saved run; recover its current result");
    for (const field of ["sessionId", "receiptId", "issueKey", "issueUuid", "branch"]) {
      if (
        record[field] != null &&
        observation[field] != null &&
        record[field] !== observation[field]
      )
        fail("worker observation conflicts with its saved identity");
    }
    if (
      record.runId === observation.runId &&
      !isLiveWorker(record) &&
      observation.status === "running"
    ) {
      for (const key of ["sessionId", "receiptId"])
        if (observation[key]) record[key] = observation[key];
      continue;
    }
    const updated = { ...record, ...observation };
    if (record.runId && observation.runId !== record.runId)
      updated.previousRunIds = [...new Set([...(record.previousRunIds ?? []), record.runId])];
    if (observation.footprint != null) {
      if (!Array.isArray(observation.footprint) || !observation.footprint.every(nonempty))
        fail("worker footprint must be an array of nonempty paths");
      const previous = record.footprint == null ? [] : [record.footprint].flat();
      updated.footprint = [...new Set([...previous, ...observation.footprint])];
    }
    for (const key of ["state", "returned", "stopped", "occupiesWorkerSlot"]) delete updated[key];
    state[collection][index] = updated;
  }
}

export function applyObservations(state, observation) {
  if (!observation || typeof observation !== "object" || Array.isArray(observation))
    fail("observation must be an object");
  if (Object.keys(observation).some((key) => !observationFields.has(key)))
    fail("unsupported observation field");
  const checked = { ...observation };
  if (checked.scopeIssues === null) delete checked.scopeIssues;
  if (!validateCanonicalState(checked)) fail("observation does not match the planner schema");
  const next = structuredClone(state);
  normalizeReviewMaps(next);
  for (const record of observation.dispatches ?? []) recordWorker(next, record);
  for (const [pr, request] of Object.entries(observation.reviewRequestsByPr ?? {}))
    recordReviewRequest(next, pr, request);
  for (const [pr, evidence] of Object.entries(observation.reviewEvidenceByPr ?? {}))
    recordReviewResult(next, pr, evidence);
  for (const [pr, evidence] of Object.entries(observation.hostedReviewByPr ?? {})) {
    const prior = next.hostedReviewByPr?.[pr] ?? {};
    if (evidence.hostedReviewPending === true && !nonempty(evidence.hostedReviewDiffFingerprint))
      fail("a pending hosted review needs its diff fingerprint");
    (next.hostedReviewByPr ??= {})[pr] = {
      ...prior,
      ...(evidence.hostedReviewPending === true
        ? {
            hostedReviewComplete: false,
            codeRabbitComplete: false,
            hostedReviewSkipped: false,
            codeRabbitSkipped: false,
            skipped: false,
          }
        : {}),
      ...evidence,
    };
  }
  if ("scopeIssues" in observation) {
    if (observation.scopeIssues === null) delete next.scopeIssues;
    else next.scopeIssues = observation.scopeIssues;
  }
  if ("linearIssues" in observation) next.linearIssues = observation.linearIssues;
  validatePlannerState(next);
  return next;
}
