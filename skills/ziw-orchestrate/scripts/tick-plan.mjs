#!/usr/bin/env node
// Convert compact orchestration JSON into deterministic workflow decisions.
//
// Usage:
//   node tick-plan.mjs <snapshot-or-envelope.json> [--config config.json] [--state state.json]
//
// Input may be the direct output of tick-snapshot.mjs or an envelope:
//   {
//     "snapshot": { ...tick-snapshot output... },
//     "config": { "workerConcurrencyCap": 3 },
//     "state": {
//       "startableTickets": [{ "id": "ZAK-1", "footprint": ["src/foo.ts"] }],
//       "dispatches": [],
//       "previews": [],
//       "reviewEvidenceByPr": {
//         "12": { "reviewedHeadSha": "abc", "reviewVerdict": "Ready to Merge" }
//       }
//     }
//   }

import { createHash } from "node:crypto";

import { loadPlannerInput } from "./planner-input.mjs";
import { coversIssue } from "./delivery-identity.mjs";
import { issuesWithDeliveryEvidence, reconcileActiveDelivery } from "./active-dispatches.mjs";
import { extractLinearIssues, linearDagStart } from "./linear-dag-start.mjs";
import { linearDispatchScope, restrictLinearDag } from "./dispatch-scope.mjs";
import {
  activeDeliveryFootprint,
  capacityDecision,
  dispatchSelectionDecision,
  hasCompletedIndependentReview,
  hostedReviewEscalationDecision,
  humanMergePrLabelDecision,
  mergeEligibilityDecision,
  readyStatePromotionDecision,
  reviewEvidenceDecision,
} from "./workflow-contract.mjs";

const startedAt = performance.now();
let inputs;
try {
  inputs = loadPlannerInput(process.argv.slice(2));
} catch (error) {
  console.error(`tick-plan: ${error.message}`);
  process.exit(1);
}
const { snapshot, config, state, diagnostics, debug, pretty } = inputs;

const normalize = (value) =>
  String(value ?? "")
    .trim()
    .toLowerCase();

const toArray = (value) => {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
};

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

const mergePrLists = (snapshotPrs, statePrs) => {
  const byNumber = new Map();
  for (const pr of [...toArray(snapshotPrs), ...toArray(statePrs)]) {
    const prior = byNumber.get(pr.number);
    if (prior?.issueRef && pr.issueRef && prior.issueRef !== pr.issueRef)
      throw new Error("pullRequests: conflicting explicit issue associations for one PR");
    byNumber.set(pr.number, {
      ...prior,
      ...pr,
      issueRef: pr.issueRef ?? prior?.issueRef ?? null,
      footprint: [...new Set([...toArray(prior?.footprint), ...toArray(pr.footprint)])],
      issueRefs: [...new Set([...toArray(prior?.issueRefs), ...toArray(pr.issueRefs)])],
      possibleIssueRefs: [
        ...new Set([...toArray(prior?.possibleIssueRefs), ...toArray(pr.possibleIssueRefs)]),
      ],
    });
  }
  return [...byNumber.values()];
};

const evidenceForPr = (state, pr) => {
  const byPr = state.reviewEvidenceByPr ?? state.reviewEvidence ?? {};
  const explicit = byPr[pr.number] ?? {};
  const currentFingerprint = reviewDiffFingerprintForPr(state, pr);
  const reviewedFingerprint =
    explicit.reviewedDiffFingerprint ?? explicit.reviewedReviewDiffFingerprint;
  const currentRevisionVerdict =
    currentFingerprint &&
    normalize(currentFingerprint) === normalize(reviewedFingerprint) &&
    ["needs revision", "do not merge"].includes(
      normalize(explicit.reviewVerdict ?? explicit.codeReviewVerdict),
    );
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
          reviewEvidenceCurrent: true,
          reviewedHeadSha: pr.headSha,
          reviewedDiffFingerprint: currentFingerprint,
          reviewedReviewDiffFingerprint: currentFingerprint,
          reviewVerdict: "Ready to Merge",
          changesRequested: Boolean(explicit.changesRequested || currentRevisionVerdict),
        }
      : {};
  if (currentApprovals.length > 0) return { ...explicit, ...githubEvidence };

  if (
    currentFingerprint &&
    reviewedFingerprint &&
    normalize(currentFingerprint) !== normalize(reviewedFingerprint)
  ) {
    return {
      ...explicit,
      reviewEvidenceCurrent: false,
      hasReviewEvidence: false,
      reviewDiffFingerprint: currentFingerprint,
    };
  }
  if (currentFingerprint && normalize(currentFingerprint) === normalize(reviewedFingerprint)) {
    const completed = hasCompletedIndependentReview(explicit);
    return {
      ...explicit,
      hasReviewEvidence: completed,
      reviewEvidenceCurrent: completed,
      reviewDiffFingerprint: currentFingerprint,
      reviewedDiffFingerprint: reviewedFingerprint,
      ...(completed ? { reviewedHeadSha: pr.headSha } : {}),
    };
  }
  return {
    ...explicit,
    hasReviewEvidence: hasCompletedIndependentReview(explicit),
    reviewEvidenceCurrent:
      hasCompletedIndependentReview(explicit) && explicit.reviewEvidenceCurrent === true,
  };
};

const reviewDiffFingerprintForPr = (state, pr) =>
  pr.reviewDiffFingerprint ??
  pr.reviewRelevantDiffFingerprint ??
  state.reviewDiffByPr?.[pr.number] ??
  state.reviewDiffByPr?.[String(pr.number ?? "")];

const hostedReviewForPr = (state, pr) => {
  const byPr = state.hostedReviewByPr ?? {};
  const hostedReview = byPr[pr.number] ?? {};
  const requiredAliases = [
    hostedReview.required,
    hostedReview.hostedReviewRequired,
    hostedReview.codeRabbitRequired,
  ].filter((value) => value != null);
  const required =
    requiredAliases.length === 0 ? undefined : requiredAliases.some((value) => value === true);
  return {
    ...hostedReview,
    ...(required == null ? {} : { required, hostedReviewRequired: required }),
  };
};

const humanMergeDecisionForPr = (state, config, pr) => {
  const evidence = evidenceForPr(state, pr);
  const hostedReview = hostedReviewForPr(state, pr);
  const reviewDiffFingerprint = reviewDiffFingerprintForPr(state, pr);
  return {
    pr: pr.number,
    headSha: pr.headSha,
    ...humanMergePrLabelDecision(
      {
        ...pr,
        prState: pr.state,
        prLabels: pr.labels,
        isDraft: pr.isDraft,
        currentPrHeadSha: pr.headSha,
        requiredChecksPassed: checksPassed(pr),
        unresolvedThreads: pr.unresolvedThreads,
        reviewDecision: pr.reviewDecision,
        ...hostedReview,
        ...evidence,
        ...(reviewDiffFingerprint ? { reviewDiffFingerprint } : {}),
      },
      config,
    ),
  };
};

const hostedReviewDecisionForPr = (state, config, pr) => {
  const hostedReview = hostedReviewForPr(state, pr);
  const reviewDiffFingerprint = reviewDiffFingerprintForPr(state, pr);
  if (!hostedReview.required) return null;
  return {
    pr: pr.number,
    headSha: pr.headSha,
    ...hostedReviewEscalationDecision(
      {
        prExists: true,
        prState: pr.isDraft ? "draft" : pr.state,
        currentPrHeadSha: pr.headSha,
        ...hostedReview,
        ...(reviewDiffFingerprint ? { reviewDiffFingerprint } : {}),
      },
      config,
    ),
  };
};

const targetForPr = (pr) => `pr:${pr.number}`;

const reviewRequestForPr = (state, pr) => {
  const byPr = state.reviewRequestsByPr ?? state.reviewRequestByPr ?? {};
  const request = byPr[pr.number] ?? {};
  const currentFingerprint = normalize(reviewDiffFingerprintForPr(state, pr));
  const requestedFingerprint = normalize(
    request.reviewDiffFingerprint ??
      request.reviewRelevantDiffFingerprint ??
      request.reviewedDiffFingerprint,
  );
  if (currentFingerprint && requestedFingerprint) {
    return currentFingerprint === requestedFingerprint ? request : null;
  }
  return normalize(request.headSha ?? request.reviewHeadSha) === normalize(pr.headSha)
    ? request
    : null;
};

const prDisposition = (state, config, pr) => {
  const target = targetForPr(pr);
  const evidence = evidenceForPr(state, pr);
  const hostedReview = hostedReviewForPr(state, pr);
  const owner = state.continuationByPr?.[pr.number] ?? "orchestrator";
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
      ...pr,
      prState: pr.state,
      isDraft: pr.isDraft,
      currentPrHeadSha: pr.headSha,
      requiredChecksPassed: true,
      unresolvedThreads: pr.unresolvedThreads,
      reviewDecision: pr.reviewDecision,
      ...hostedReview,
      ...evidence,
      ...(reviewDiffFingerprintForPr(state, pr)
        ? { reviewDiffFingerprint: reviewDiffFingerprintForPr(state, pr) }
        : {}),
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
      value: {
        target,
        kind: "route-human-merge",
        owner: "human",
        reason: /not configured/.test(decision.reason)
          ? "MERGE_AUTHORITY_MISSING"
          : "HUMAN_MERGE_REQUIRED",
      },
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
          idempotencyKey: `hosted-review:${pr.number}:${
            reviewDiffFingerprintForPr(state, pr) ?? pr.headSha
          }`,
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
  if (/finding|scope/i.test(decision.reason)) {
    return {
      bucket: "actions",
      value: { target, kind: "route-fix", owner, reason: "FIX_REQUIRED" },
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
        idempotencyKey: `review:${pr.number}:${
          pr.reviewDiffFingerprint ?? pr.reviewRelevantDiffFingerprint ?? pr.headSha
        }`,
      },
    };
  }
  return { bucket: "holds", value: { target, reason: "MERGE_HELD" } };
};

const initialPullRequests = mergePrLists(snapshot.prs, state.pullRequests);
const scope = linearDispatchScope(snapshot, state);
const delivery = reconcileActiveDelivery({
  snapshot: {
    ...snapshot,
    linear: {
      ...snapshot.linear,
      issues: toArray(snapshot.linear?.issues).filter(scope.matchesReservation),
      activeIssues: toArray(snapshot.linear?.activeIssues).filter(scope.matchesReservation),
    },
  },
  state: {
    ...state,
    ...(state.tickets == null ? {} : { tickets: state.tickets.filter(scope.matchesReservation) }),
    ...(state.linearIssues == null
      ? {}
      : { linearIssues: state.linearIssues.filter(scope.matchesReservation) }),
    startableTickets: toArray(state.startableTickets).filter(scope.matchesReservation),
    activeLinearIssues: toArray(state.activeLinearIssues).filter(scope.matchesReservation),
  },
  pullRequests: initialPullRequests,
  issuesForPrMetadata: [
    ...toArray(snapshot.linear?.issueMetadata),
    ...toArray(snapshot.linear?.issues),
    ...toArray(snapshot.linear?.activeIssues),
    ...toArray(state.tickets ?? state.linearIssues),
  ],
});
const pullRequests = delivery.pullRequests;
const actionPullRequests =
  state.scopeIssueRefs == null
    ? pullRequests
    : pullRequests.filter((pr) =>
        state.scopeIssueRefs.some((ref) => coversIssue(pr, ref, { includePossible: false })),
      );
const activeDispatches = delivery.dispatches;
const linearQueried =
  (snapshot.linear?.skipped == null && Array.isArray(snapshot.linear?.issues)) ||
  state.tickets != null ||
  state.linearIssues != null;
const linearIssues = issuesWithDeliveryEvidence(
  extractLinearIssues({
    snapshot,
    state: { tickets: state.tickets ?? state.linearIssues },
  }),
  { pullRequests, dispatches: activeDispatches },
);
const linearDag = restrictLinearDag(
  linearIssues.length > 0 ? linearDagStart(linearIssues, config) : null,
  scope,
);
const blockingIdentityDiagnostics = diagnostics.some((diagnostic) => diagnostic.blockingStarts);
if (linearDag && blockingIdentityDiagnostics) {
  linearDag.starts = [];
  linearDag.readyStarts = [];
  for (const node of linearDag.nodes) {
    node.startable = false;
    node.startableBlockers.push("unresolved delivery identity evidence");
  }
}
const linearNodesById = new Map((linearDag?.nodes ?? []).map((node) => [node.issueRef, node]));
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
      issueRef: node.issueRef,
      id: node.issueRef,
      title: node.title,
      url: node.url,
      labels: node.labels,
      state: node.state,
      stateType: node.stateType,
      estimate: node.estimate,
      footprint: node.footprint,
      unlockCount: downstreamCount(node.issueRef),
    })) ?? [];
const issueById = new Map(linearIssues.map((issue) => [issue.issueRef, issue]));
const explicitStartableTickets = issuesWithDeliveryEvidence(
  toArray(state.startableTickets).map((ticket) => ({
    ...issueById.get(ticket.issueRef),
    ...ticket,
  })),
  { pullRequests, dispatches: activeDispatches },
);
const excludedCandidates = [];
const startableTicketsById = new Map(
  linearStartableTickets.map((ticket) => [ticket.issueRef, ticket]),
);
for (const ticket of explicitStartableTickets) {
  const id = ticket.issueRef;
  if (!id) continue;
  if (!scope.matchesCandidate(ticket) || ticket.activeClaim || ticket.openPr) {
    excludedCandidates.push({
      target: `ticket:${id}`,
      reason: scope.matchesCandidate(ticket) ? "DELIVERY_ALREADY_ACTIVE" : "OUT_OF_SCOPE",
    });
    continue;
  }
  startableTicketsById.set(id, {
    ...(startableTicketsById.get(id) ?? {}),
    ...ticket,
    issueRef: id,
  });
}
const planningState = {
  ...state,
  pullRequests,
  previews: toArray(state.previews),
  dispatches: activeDispatches,
  workers: [],
  activeWork: [],
  ledgerDispatches: [],
  startableTickets: blockingIdentityDiagnostics ? [] : [...startableTicketsById.values()],
};

const readyStatePromotions = toArray(state.tickets ?? snapshot.linear?.issues)
  .filter(scope.matchesCandidate)
  .map((ticket) => ({
    ticket: ticket.issueRef,
    ...readyStatePromotionDecision(ticket, config, state.readyStatePromotionOptions ?? {}),
  }));

const reviewEvidence = toArray(state.reviewEvidenceChecks)
  .filter(
    (evidence) =>
      state.scopeIssueRefs == null ||
      (evidence.prNumber != null
        ? actionPullRequests.some((pr) => pr.number === evidence.prNumber)
        : state.scopeIssueRefs.includes(evidence.issueRef)),
  )
  .map((evidence) => ({
    target: evidence.prNumber ?? evidence.issueRef,
    actionTarget:
      evidence.prNumber != null
        ? `pr:${evidence.prNumber}`
        : evidence.issueRef
          ? `ticket:${evidence.issueRef}`
          : null,
    ...reviewEvidenceDecision(evidence),
  }));

const hostedReviews = actionPullRequests
  .map((pr) => hostedReviewDecisionForPr(state, config, pr))
  .filter(Boolean);
const capacity = capacityDecision(planningState, config);
const dispatch = dispatchSelectionDecision(planningState, config);
const humanMergeLabels = actionPullRequests.map((pr) => humanMergeDecisionForPr(state, config, pr));
const trackerStateUpdates = toArray(dispatch.selected).map((ticket) => ({
  ticket: ticket.issueRef,
  targetState: config.inProgressState ?? "In Progress",
  timing: "before-dispatch",
}));

const selectedDispatches = dispatch.selected?.length ?? 0;
const dispatchActions = [];
const prActions = [];
const waits = [];
const holds = [...excludedCandidates];
const warnings = diagnostics.map((diagnostic) => ({
  reason: diagnostic.code,
  path: diagnostic.path,
  ...(diagnostic.issueUuid ? { issueUuid: diagnostic.issueUuid } : {}),
  ...(diagnostic.issueKey ? { issueKey: diagnostic.issueKey } : {}),
}));

for (const reservation of activeDispatches.filter((item) => item.occupiesWorkerSlot === false)) {
  const id = reservation.issueRef;
  const target = id
    ? `ticket:${id}`
    : reservation.worktree
      ? `worktree:${reservation.worktree}`
      : reservation.path
        ? `worktree:${reservation.path}`
        : reservation.branch
          ? `worktree:${reservation.branch}`
          : reservation.receiptId;
  if (holds.some((hold) => hold.target === target)) continue;
  holds.push({
    target,
    reason: "DELIVERY_ALREADY_ACTIVE",
    source: reservation.source,
  });
}

for (const node of linearDag?.nodes ?? []) {
  if (!scope.matchesCandidate(node) || (!node.activeClaim && !node.openPr)) continue;
  if (holds.some((hold) => hold.target === `ticket:${node.issueRef}`)) continue;
  holds.push({
    target: `ticket:${node.issueRef}`,
    reason: "DELIVERY_ALREADY_ACTIVE",
    source:
      activeDispatches.find((dispatch) => coversIssue(dispatch, node.issueRef))?.source ??
      "open-pr-or-claim",
  });
}

for (const pr of actionPullRequests) {
  const disposition = prDisposition(state, config, pr);
  ({ actions: prActions, waits, holds })[disposition.bucket].push(disposition.value);
}
for (const worker of activeDispatches.filter((item) => item.occupiesWorkerSlot !== false)) {
  waits.push({
    target: `worker:${worker.workerRef}`,
    signal: "worker",
    reason: "WORKER_RUNNING",
    source: worker.source,
  });
}
for (const ticket of dispatch.selected ?? []) {
  dispatchActions.push({
    target: `ticket:${ticket.issueRef}`,
    kind: "dispatch",
    owner:
      ticket.workerPath ??
      (ticket.worker === "remote"
        ? (config.remoteWorkerPath ?? "remote-worker")
        : ticket.worker === "local"
          ? (config.localWorkerPath ?? "local-worker")
          : (config.defaultWorkerPath ?? "implementation-worker")),
    reason: "STARTABLE",
    targetState: config.inProgressState ?? "In Progress",
  });
}
for (const ticket of dispatch.deferred ?? []) {
  if (ticket.reason === "missing predicted file footprint") {
    dispatchActions.push({
      target: `ticket:${ticket.issueRef}`,
      kind: "derive-footprint",
      owner: "orchestrator",
      reason: "FOOTPRINT_MISSING",
    });
    continue;
  }
  holds.push({
    target: `ticket:${ticket.issueRef}`,
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

const labelActions = [
  ...humanMergeLabels.map((decision) => ({
    ...decision,
    target: `pr:${decision.pr}`,
  })),
  ...reviewEvidence.map((decision) => ({ ...decision, target: decision.actionTarget })),
]
  .filter((decision) => decision.target && /^(APPLY|CLEAR)_/.test(decision.action))
  .map((decision) => ({
    target: decision.target,
    kind: decision.action.toLowerCase().replaceAll("_", "-"),
    owner: "orchestrator",
    reason: decision.reason,
    ...(decision.label ? { label: decision.label } : {}),
    ...(decision.headSha ? { headSha: decision.headSha } : {}),
  }));
const actions = [...dispatchActions, ...labelActions, ...prActions];

if (!linearQueried) warnings.push({ reason: "TRACKER_STATE_MISSING" });
if (toArray(snapshot.linear?.unroutedIssueIds).length > 0) {
  warnings.push({
    reason: "UNROUTED_TRACKER_ISSUES",
    count: snapshot.linear.unroutedIssueIds.length,
  });
}
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
  v: 3,
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
  actions.length > 0
    ? selectedDispatches > 0
      ? "dispatch-selected-work"
      : "advance-actions"
    : wakeState === "waiting"
      ? "wait-for-signal"
      : wakeState === "incomplete"
        ? "resolve-evidence"
        : wakeState === "blocked"
          ? "stop-blocked"
          : "delivered";
const explainedCapacity =
  actions.length > 0 && capacity.action === "STOP_COMPLETELY_BLOCKED"
    ? { ...capacity, action: "ADVANCE_ACTIONS", reason: "actionable PR or tracker work remains" }
    : capacity;
const debugDispatch = { ...dispatch, footprint };
process.stdout.write(
  `${JSON.stringify(
    {
      ...compactPlan,
      footprint,
      nextAction,
      decisions: {
        capacity: explainedCapacity,
        dispatch: debugDispatch,
        trackerStateUpdates,
        readyStatePromotions,
        reviewEvidence,
        linearDag,
        hostedReviews,
        humanMergeLabels,
        activeDispatches: activeDispatches.map((activeDispatch) => ({
          issueRef: activeDispatch.issueRef ?? null,
          workerRef: activeDispatch.workerRef ?? null,
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
