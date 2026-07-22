#!/usr/bin/env node
// Convert compact orchestration JSON into deterministic workflow decisions.
//
// Usage:
//   node tick-plan.mjs <snapshot-or-envelope.json> [--config config.json] [--state state.json]
//
// Input may be the direct output of tick-snapshot.mjs or an envelope:
//   {
//     "snapshot": { ...tick-snapshot output... },
//     "config": { "activePrPreviewCap": 3 },
//     "state": {
//       "startableTickets": [{ "id": "ZAK-1", "footprint": ["src/foo.ts"] }],
//       "dispatches": [],
//       "previews": [],
//       "reviewEvidenceByPr": {
//         "12": { "reviewedHeadSha": "abc", "reviewVerdict": "Ready to Merge" }
//       }
//     }
//   }

import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

import { reconcileActiveDelivery } from "./active-dispatches.mjs";
import { extractLinearIssues, linearDagStart } from "./linear-dag-start.mjs";
import {
  activeDeliveryFootprint,
  capacityDecision,
  dispatchSelectionDecision,
  hostedReviewEscalationDecision,
  humanMergePrLabelDecision,
  mergeEligibilityDecision,
  readyStatePromotionDecision,
  reviewEvidenceDecision,
} from "./workflow-contract.mjs";

const startedAt = performance.now();
const args = process.argv.slice(2);
const debug = args.includes("--debug");
const pretty = args.includes("--pretty");
const usage =
  "Usage: node tick-plan.mjs <snapshot-or-envelope.json> [--config config.json] [--state state.json]";

const fail = (message) => {
  console.error(`tick-plan: ${message}`);
  process.exit(1);
};

const argValue = (flag) => {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
};

const positional = args.filter(
  (arg, index) =>
    !arg.startsWith("--") && args[index - 1] !== "--config" && args[index - 1] !== "--state",
);

if (positional.length !== 1) {
  fail(`expected exactly one input\n${usage}`);
}

const readJson = (source, label) => {
  if (!source) return {};
  try {
    const text = source === "-" ? readFileSync(0, "utf8") : readFileSync(source, "utf8");
    return text.trim() ? JSON.parse(text) : {};
  } catch (error) {
    fail(`cannot read ${label}: ${error.message}`);
  }
};

const normalize = (value) =>
  String(value ?? "")
    .trim()
    .toLowerCase();

const toArray = (value) => {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
};

const firstKey = (item) =>
  [item?.number, item?.id, item?.url, item?.headSha, item?.headRefName]
    .map((value) => String(value ?? "").trim())
    .find(Boolean);

const checksPassed = (pr) => {
  if (typeof pr.requiredChecksPassed === "boolean") return pr.requiredChecksPassed;
  const checks = pr.requiredChecks ?? pr.checks;
  if (!checks) return false;
  const state = normalize(checks.state);
  const failed = toArray(checks.failed);
  const pending = toArray(checks.pending);
  return state === "success" && failed.length === 0 && pending.length === 0;
};

const checkState = (pr) => {
  const checks = pr.requiredChecks ?? pr.checks;
  if (!checks) return "absent";
  if (toArray(checks.failed).length > 0) return "fail";
  if (toArray(checks.pending).length > 0) return "pending";
  const state = normalize(checks.state);
  if (state === "success") return "pass";
  if (state === "none") return "absent";
  return "unknown";
};

const normalizedPr = (pr) => ({
  ...pr,
  id: pr.id ?? pr.url ?? (pr.number ? `PR-${pr.number}` : undefined),
  state: pr.state ?? "open",
  open: pr.open ?? true,
  isDraft: Boolean(pr.isDraft ?? pr.draft ?? normalize(pr.draftState) === "draft"),
  headSha: pr.headSha ?? pr.headRefOid ?? pr.currentPrHeadSha,
});

const mergePrLists = (snapshotPrs, statePrs) => {
  const byKey = new Map();
  for (const pr of [...toArray(snapshotPrs), ...toArray(statePrs)]) {
    const normalized = normalizedPr(pr);
    const key = firstKey(normalized);
    if (!key) continue;
    byKey.set(key, { ...(byKey.get(key) ?? {}), ...normalized });
  }
  return [...byKey.values()];
};

const evidenceForPr = (state, pr) => {
  const byPr = state.reviewEvidenceByPr ?? state.reviewEvidence ?? {};
  const keys = [pr.number, String(pr.number ?? ""), pr.id, pr.url, pr.headSha, pr.headRefName]
    .map((key) => String(key ?? "").trim())
    .filter(Boolean);
  const explicit = Object.assign({}, ...keys.map((key) => byPr[key] ?? {}));
  const currentApprovals = Object.values(pr.latestReviews ?? {}).filter(
    (review) =>
      normalize(review.state) === "approved" &&
      normalize(review.headSha ?? review.commitSha) === normalize(pr.headSha),
  );
  const githubEvidence =
    currentApprovals.length > 0
      ? {
          hasReviewEvidence: true,
          independentReviewCount: currentApprovals.length,
          reviewedHeadSha: pr.headSha,
          reviewVerdict: "Ready to Merge",
        }
      : {};
  if (currentApprovals.length > 0) return { ...explicit, ...githubEvidence };

  const currentFingerprint =
    pr.reviewDiffFingerprint ??
    pr.reviewRelevantDiffFingerprint ??
    state.reviewDiffByPr?.[pr.number];
  const reviewedFingerprint =
    explicit.reviewedDiffFingerprint ?? explicit.reviewRelevantDiffFingerprint;
  if (currentFingerprint && normalize(currentFingerprint) === normalize(reviewedFingerprint)) {
    return {
      ...explicit,
      hasReviewEvidence: true,
      independentReviewCount: Math.max(Number(explicit.independentReviewCount) || 0, 1),
      reviewedHeadSha: pr.headSha,
      reviewVerdict: explicit.reviewVerdict ?? "Ready to Merge",
    };
  }
  return explicit;
};

const hostedReviewForPr = (state, pr) => {
  const byPr = state.hostedReviewByPr ?? {};
  const keys = [pr.number, String(pr.number ?? ""), pr.id, pr.url, pr.headSha, pr.headRefName]
    .map((key) => String(key ?? "").trim())
    .filter(Boolean);
  return Object.assign({}, ...keys.map((key) => byPr[key] ?? {}));
};

const humanMergeDecisionForPr = (state, config, pr) => {
  const evidence = evidenceForPr(state, pr);
  const hostedReview = hostedReviewForPr(state, pr);
  return {
    pr: pr.number ?? pr.id ?? pr.url,
    headSha: pr.headSha,
    ...humanMergePrLabelDecision(
      {
        prState: pr.state,
        prLabels: pr.labels,
        isDraft: pr.isDraft,
        currentPrHeadSha: pr.headSha,
        requiredChecksPassed: checksPassed(pr),
        unresolvedThreads: pr.unresolvedThreads,
        reviewDecision: pr.reviewDecision,
        ...hostedReview,
        ...evidence,
      },
      config,
    ),
  };
};

const hostedReviewDecisionForPr = (state, config, pr) => {
  const hostedReview = hostedReviewForPr(state, pr);
  if (!hostedReview.required) return null;
  return {
    pr: pr.number ?? pr.id ?? pr.url,
    headSha: pr.headSha,
    ...hostedReviewEscalationDecision(
      {
        prExists: true,
        prState: pr.isDraft ? "draft" : pr.state,
        currentPrHeadSha: pr.headSha,
        ...hostedReview,
      },
      config,
    ),
  };
};

const targetForPr = (pr) => `pr:${pr.number ?? pr.id ?? pr.url}`;

const reviewRequestForPr = (state, pr) => {
  const byPr = state.reviewRequestsByPr ?? state.reviewRequestByPr ?? {};
  const request = byPr[pr.number] ?? byPr[String(pr.number ?? "")] ?? byPr[pr.id] ?? {};
  return normalize(request.headSha ?? request.reviewHeadSha) === normalize(pr.headSha)
    ? request
    : null;
};

const prDisposition = (state, config, pr) => {
  const target = targetForPr(pr);
  const evidence = evidenceForPr(state, pr);
  const hostedReview = hostedReviewForPr(state, pr);
  const owner =
    state.continuationByPr?.[pr.number] ?? state.continuationByPr?.[pr.id] ?? "orchestrator";
  const status = checkState(pr);

  if (pr.reviewThreadsTruncated) {
    return { bucket: "holds", value: { target, reason: "EVIDENCE_TRUNCATED" } };
  }
  if (Number(pr.changedFiles) === 0) {
    return {
      bucket: "actions",
      value: {
        target,
        kind: "reconcile-empty-pr",
        owner: "orchestrator",
        reason: "EMPTY_DIFF",
      },
    };
  }
  if (pr.isDraft) {
    return {
      bucket: "actions",
      value: { target, kind: "repair-draft", owner, reason: "DRAFT_PR" },
    };
  }
  if (normalize(pr.reviewDecision) === "changes_requested") {
    return {
      bucket: "actions",
      value: { target, kind: "route-review-fix", owner, reason: "CHANGES_REQUESTED" },
    };
  }
  if (Number(pr.unresolvedThreads ?? 0) > 0) {
    return {
      bucket: "actions",
      value: { target, kind: "route-review-fix", owner, reason: "REVIEW_THREADS_OPEN" },
    };
  }
  if (normalize(pr.mergeable) === "conflicting" || normalize(pr.mergeStateStatus) === "dirty") {
    return {
      bucket: "actions",
      value: { target, kind: "route-conflict-fix", owner, reason: "MERGE_CONFLICT" },
    };
  }
  if (normalize(pr.mergeStateStatus) === "behind") {
    return {
      bucket: "actions",
      value: { target, kind: "update-branch", owner: "orchestrator", reason: "BASE_BEHIND" },
    };
  }
  if (status === "fail") {
    return {
      bucket: "actions",
      value: {
        target,
        kind: "route-check-fix",
        owner,
        reason: "CHECKS_FAILED",
        checks: toArray(pr.checks?.failed),
      },
    };
  }
  if (status === "pending") {
    return { bucket: "waits", value: { target, signal: "checks", reason: "CHECKS_PENDING" } };
  }
  if (status !== "pass") {
    return {
      bucket: "actions",
      value: { target, kind: "verify-checks", owner: "orchestrator", reason: "CHECKS_MISSING" },
    };
  }

  const decision = mergeEligibilityDecision(
    {
      prState: pr.state,
      isDraft: pr.isDraft,
      currentPrHeadSha: pr.headSha,
      requiredChecksPassed: true,
      unresolvedThreads: pr.unresolvedThreads,
      reviewDecision: pr.reviewDecision,
      ...hostedReview,
      ...evidence,
    },
    config,
  );

  if (decision.action === "ARM_AUTO_MERGE") {
    if (pr.autoMergeArmed || pr.autoMergeRequest) {
      return {
        bucket: "waits",
        value: { target, signal: "merge", reason: "AUTO_MERGE_ARMED" },
      };
    }
    return {
      bucket: "actions",
      value: { target, kind: "arm-auto-merge", owner: "orchestrator", reason: "MERGE_READY" },
    };
  }
  if (decision.action === "ROUTE_HUMAN_MERGE") {
    return {
      bucket: "actions",
      value: { target, kind: "route-human-merge", owner: "human", reason: "HUMAN_MERGE_REQUIRED" },
    };
  }
  if (/hosted review/i.test(decision.reason)) {
    const hostedDecision = hostedReviewDecisionForPr(state, config, pr);
    if (hostedDecision?.action === "REQUEST_PR_REVIEW") {
      return {
        bucket: "actions",
        value: {
          target,
          kind: "request-hosted-review",
          owner: "orchestrator",
          reason: "HOSTED_REVIEW_REQUIRED",
          idempotencyKey: `hosted-review:${pr.number ?? pr.id}:${pr.headSha}`,
        },
      };
    }
    if (hostedDecision?.action === "RESOLVE_AUTO_REVIEW_STATE") {
      return {
        bucket: "actions",
        value: {
          target,
          kind: "resolve-hosted-review-mode",
          owner: "orchestrator",
          reason: "HOSTED_REVIEW_MODE_UNKNOWN",
        },
      };
    }
    return {
      bucket: "waits",
      value: { target, signal: "hosted-review", reason: "HOSTED_REVIEW_PENDING" },
    };
  }
  if (/conformance/i.test(decision.reason)) {
    return {
      bucket: "actions",
      value: {
        target,
        kind: "verify-conformance",
        owner: "orchestrator",
        reason: "CONFORMANCE_REQUIRED",
      },
    };
  }
  if (/code review evidence|review depth/i.test(decision.reason)) {
    const existingRequest = reviewRequestForPr(state, pr);
    if (
      existingRequest &&
      !["completed", "failed", "stopped"].includes(normalize(existingRequest.status))
    ) {
      return {
        bucket: "waits",
        value: { target, signal: "review", reason: "REVIEW_IN_FLIGHT" },
      };
    }
    return {
      bucket: "actions",
      value: {
        target,
        kind: "request-review",
        owner: "review-worker",
        reason: "REVIEW_REQUIRED",
        idempotencyKey: `review:${pr.number ?? pr.id}:${pr.headSha}`,
      },
    };
  }
  if (/finding|scope/i.test(decision.reason)) {
    return {
      bucket: "actions",
      value: { target, kind: "route-fix", owner, reason: "FIX_REQUIRED" },
    };
  }
  return { bucket: "holds", value: { target, reason: "MERGE_HELD" } };
};

const envelope = readJson(positional[0], "input");
const snapshot =
  envelope.snapshot ??
  (envelope.prs || envelope.baseline || envelope.footprint || envelope.linear ? envelope : {});
const config = {
  ...(envelope.config ?? {}),
  ...readJson(argValue("--config"), "--config"),
};
const state = {
  ...(envelope.queue ?? {}),
  ...(envelope.state ?? {}),
  ...readJson(argValue("--state"), "--state"),
};

if (!snapshot.repo && !state.repo) {
  fail("snapshot is missing repo identity; refusing to plan from empty or partial evidence");
}

const initialPullRequests = mergePrLists(snapshot.prs, state.pullRequests);
const delivery = reconcileActiveDelivery({
  snapshot,
  state,
  pullRequests: initialPullRequests,
});
const pullRequests = delivery.pullRequests;
const activeDispatches = delivery.dispatches;
const linearQueried =
  (snapshot.linear?.skipped == null && Array.isArray(snapshot.linear?.issues)) ||
  state.tickets != null ||
  state.linearIssues != null;
const linearIssues = extractLinearIssues({
  snapshot,
  state: { tickets: state.tickets ?? state.linearIssues },
});
const linearDag = linearIssues.length > 0 ? linearDagStart(linearIssues, config) : null;
const linearNodesById = new Map((linearDag?.nodes ?? []).map((node) => [node.id, node]));
const downstreamCount = (rootId) => {
  const seen = new Set();
  const visit = (id) => {
    for (const child of linearNodesById.get(id)?.blocks ?? []) {
      if (seen.has(child)) continue;
      seen.add(child);
      visit(child);
    }
  };
  visit(rootId);
  return seen.size;
};
const linearStartableTickets =
  linearDag?.nodes
    .filter((node) => node.startable)
    .map((node) => ({
      id: node.id,
      title: node.title,
      url: node.url,
      labels: node.labels,
      state: node.state,
      stateType: node.stateType,
      estimate: node.estimate,
      footprint: node.footprint,
      unlockCount: downstreamCount(node.id),
    })) ?? [];
const explicitStartableTickets = toArray(state.startableTickets);
const startableTicketsById = new Map(linearStartableTickets.map((ticket) => [ticket.id, ticket]));
for (const ticket of explicitStartableTickets) {
  const id = ticket.id ?? ticket.identifier;
  if (!id) continue;
  startableTicketsById.set(id, { ...(startableTicketsById.get(id) ?? {}), ...ticket, id });
}
const planningState = {
  ...state,
  pullRequests,
  previews: toArray(state.previews),
  dispatches: activeDispatches,
  activeWork: toArray(state.activeWork),
  startableTickets: [...startableTicketsById.values()],
};

const readyStatePromotions = toArray(state.tickets ?? snapshot.linear?.issues).map((ticket) => ({
  ticket: ticket.id ?? ticket.identifier ?? ticket.url,
  ...readyStatePromotionDecision(ticket, config, state.readyStatePromotionOptions ?? {}),
}));

const reviewEvidence = toArray(state.reviewEvidenceChecks).map((evidence) => ({
  target: evidence.pr ?? evidence.ticket ?? evidence.currentPrHeadSha,
  ...reviewEvidenceDecision(evidence),
}));

const hostedReviews = pullRequests
  .map((pr) => hostedReviewDecisionForPr(state, config, pr))
  .filter(Boolean);
const capacity = capacityDecision(planningState, config);
const dispatch = dispatchSelectionDecision(planningState, config);
const humanMergeLabels = pullRequests.map((pr) => humanMergeDecisionForPr(state, config, pr));
const trackerStateUpdates = toArray(dispatch.selected).map((ticket) => ({
  ticket: ticket.id,
  targetState: config.inProgressState ?? "In Progress",
  timing: "before-dispatch",
}));

const selectedDispatches = dispatch.selected?.length ?? 0;
const dispatchActions = [];
const prActions = [];
const waits = [];
const holds = [];
const warnings = [];

for (const pr of pullRequests) {
  const disposition = prDisposition(state, config, pr);
  ({ actions: prActions, waits, holds })[disposition.bucket].push(disposition.value);
}
for (const worker of activeDispatches.filter((item) => item.occupiesWorkerSlot !== false)) {
  waits.push({
    target: `worker:${worker.issueId ?? worker.id}`,
    signal: "worker",
    reason: "WORKER_RUNNING",
    source: worker.source,
  });
}
for (const ticket of dispatch.selected ?? []) {
  dispatchActions.push({
    target: `ticket:${ticket.id}`,
    kind: "dispatch",
    owner:
      ticket.worker === "remote"
        ? (config.remoteWorkerPath ?? "remote-worker")
        : ticket.worker === "local"
          ? (config.localWorkerPath ?? "local-worker")
          : (config.defaultWorkerPath ?? "implementation-worker"),
    reason: "STARTABLE",
    targetState: config.inProgressState ?? "In Progress",
  });
}
for (const ticket of dispatch.deferred ?? []) {
  if (ticket.reason === "missing predicted file footprint") {
    dispatchActions.push({
      target: `ticket:${ticket.id}`,
      kind: "derive-footprint",
      owner: "orchestrator",
      reason: "FOOTPRINT_MISSING",
    });
    continue;
  }
  holds.push({
    target: `ticket:${ticket.id}`,
    reason:
      ticket.reason === "predicted file footprint collides with active or selected work"
        ? "FILE_COLLISION"
        : "DISPATCH_DEFERRED",
    ...(ticket.conflictsWith ? { conflictsWith: ticket.conflictsWith } : {}),
  });
}

for (const promotion of readyStatePromotions) {
  if (promotion.action !== "PROMOTE_TO_READY_STATE") continue;
  dispatchActions.push({
    target: `ticket:${promotion.ticket}`,
    kind: "promote-ready",
    owner: "orchestrator",
    reason: "IMPLEMENTATION_READY",
    targetState: promotion.targetState,
  });
}

const actions = [...dispatchActions, ...prActions];

if (!linearQueried) warnings.push({ reason: "TRACKER_STATE_MISSING" });
const wakeState =
  actions.length > 0
    ? "act-now"
    : warnings.length > 0
      ? "incomplete"
      : waits.length > 0
        ? "waiting"
        : holds.length > 0
          ? "blocked"
          : "delivered";
const { generatedAt: _generatedAt, ...snapshotEvidence } = snapshot;
const snapshotHash = createHash("sha256")
  .update(JSON.stringify({ snapshot: snapshotEvidence, state }))
  .digest("hex")
  .slice(0, 16);
const compactPlan = {
  v: 2,
  snapshotAt: snapshot.generatedAt ?? null,
  snapshotHash,
  repo: snapshot.repo ?? state.repo,
  base: {
    ref: snapshot.baseline?.branch ?? snapshot.baseline?.ref ?? null,
    sha: snapshot.baseline?.headSha ?? snapshot.baseline?.sha ?? null,
  },
  capacity: dispatch.capacity,
  execution: { completion: "attempt-all-actions", mode: "parallel", lanes: ["dispatch", "pr"] },
  actions,
  waits,
  holds,
  warnings,
  wake: { state: wakeState },
};
const compactBytes = Buffer.byteLength(JSON.stringify(compactPlan));
compactPlan.usage = {
  elapsedMs: Math.round(performance.now() - startedAt),
  outputBytes: compactBytes,
  estimatedOutputTokens: Math.ceil(compactBytes / 4),
  ...(state.tokenBudgetRemaining != null
    ? { tokenBudgetRemaining: Number(state.tokenBudgetRemaining) }
    : {}),
  ...(state.timeBudgetRemainingMinutes != null
    ? { timeBudgetRemainingMinutes: Number(state.timeBudgetRemainingMinutes) }
    : {}),
};

if (!debug) {
  process.stdout.write(`${JSON.stringify(compactPlan, null, pretty ? 2 : 0)}\n`);
  process.exit(0);
}

const footprint = activeDeliveryFootprint(planningState);
const nextAction =
  selectedDispatches > 0
    ? "dispatch-selected-work"
    : capacity.action === "WAIT_FOR_EXTERNAL_SIGNAL"
      ? "wait-for-signal"
      : capacity.action === "STOP_COMPLETELY_BLOCKED"
        ? "stop-blocked"
        : dispatch.action;
const debugDispatch = { ...dispatch, footprint };
process.stdout.write(
  `${JSON.stringify(
    {
      ...compactPlan,
      footprint,
      nextAction,
      decisions: {
        capacity,
        dispatch: debugDispatch,
        trackerStateUpdates,
        readyStatePromotions,
        reviewEvidence,
        linearDag,
        hostedReviews,
        humanMergeLabels,
        activeDispatches: activeDispatches.map((activeDispatch) => ({
          id: activeDispatch.id,
          issueId: activeDispatch.issueId ?? null,
          source: activeDispatch.source,
          branch: activeDispatch.branch ?? null,
          worktree: activeDispatch.worktree ?? null,
          footprint: toArray(activeDispatch.footprint),
        })),
      },
      counts: {
        openPrs: footprint.prs,
        startableTickets: planningState.startableTickets.length,
        selectedDispatches,
        trackerStateUpdates: trackerStateUpdates.length,
        deferredDispatches: dispatch.deferred?.length ?? 0,
        activeDispatches: activeDispatches.length,
        synthesizedDispatches: activeDispatches.filter(
          (activeDispatch) => activeDispatch.source !== "ledger",
        ).length,
        linearDagFrontier: linearDag?.frontier.length ?? 0,
        linearDagStarts: linearDag?.starts.length ?? 0,
        linearDagReadyStarts: linearDag?.readyStarts.length ?? 0,
      },
    },
    null,
    2,
  )}\n`,
);
