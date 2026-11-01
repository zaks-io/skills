#!/usr/bin/env node
import { createHash } from "node:crypto";
import { isMain, runCli } from "./cli.mjs";
import { normalizePlannerModel } from "./planner-model.mjs";

import { loadPlannerInput, validatePlannerArguments } from "./planner-input.mjs";
import { coversIssue } from "./delivery-identity.mjs";
import {
  accountForScope,
  humanMergeAlreadyRouted,
  mergedPrDisposition,
  needsPreparation,
  terminalPr,
} from "./delivery-progress.mjs";
import { retiredPr, savedPrHistory } from "./pr-history.mjs";
import { issuesWithDeliveryEvidence, reconcileActiveDelivery } from "./active-dispatches.mjs";
import { extractLinearIssues, linearDagStart } from "./linear-dag-start.mjs";
import { linearDispatchScope, restrictLinearDag } from "./dispatch-scope.mjs";
import {
  activeDeliveryFootprint,
  capacityDecision,
  currentReviewStatus,
  diffCoverage,
  dispatchSelectionDecision,
  hasCompletedIndependentReview,
  hostedReviewEscalationDecision,
  humanMergePrLabelDecision,
  mergeEligibilityDecision,
  mergeReadinessFacts,
  readyStatePromotionDecision,
  reviewEvidenceDecision,
  reviewVerdictKind,
  riskTier,
} from "./workflow-contract.mjs";

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
  if (["failure", "error", "timed_out", "cancelled", "action_required"].includes(state))
    return "fail";
  if (["pending", "queued", "in_progress", "expected", "waiting"].includes(state)) return "pending";
  if (state === "none") return "absent";
  return "unknown";
};

export const mergePrLists = (snapshotPrs, statePrs) => {
  const byNumber = new Map();
  const live = new Set(toArray(snapshotPrs));
  for (const pr of [...toArray(statePrs), ...toArray(snapshotPrs)]) {
    const prior = byNumber.get(pr.number);
    if (prior?.issueRef && pr.issueRef && prior.issueRef !== pr.issueRef)
      throw new Error("pullRequests: conflicting explicit issue associations for one PR");
    byNumber.set(pr.number, {
      ...prior,
      ...pr,
      ...(live.has(pr)
        ? {
            merged: normalize(pr.state) === "merged" || pr.merged === true,
            closed: ["merged", "closed"].includes(normalize(pr.state)),
            mergedAt: pr.mergedAt,
            mergeCommitSha: pr.mergeCommitSha,
          }
        : {}),
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

const normalizeLogin = (login) => normalize(login).replace(/\[bot\]$/, "");
const hostedReviewBots = (config) =>
  new Set(
    (
      config.hostedReviewBots ??
      (normalize(config.hostedReviewProvider).replace(/[\s_-]/g, "") === "coderabbit"
        ? ["coderabbitai"]
        : [])
    ).map(normalizeLogin),
  );
const reviewCoversPr = (review, fingerprint, pr) =>
  diffCoverage(
    review.reviewDiffFingerprint,
    review.headSha ?? review.commitSha,
    fingerprint,
    pr.headSha,
  ) === true;

const COMPLETED_REVIEW_STATES = new Set(["approved", "commented"]);

export const evidenceForPr = (state, pr, config) => {
  const byPr = state.reviewEvidenceByPr ?? {};
  const explicit = byPr[pr.number] ?? {};
  const currentFingerprint = reviewDiffFingerprintForPr(state, pr);
  const reviewedFingerprint = explicit.reviewedDiffFingerprint;
  const coverage = diffCoverage(
    reviewedFingerprint,
    explicit.reviewedHeadSha,
    currentFingerprint,
    pr.headSha,
  );
  const currentRevisionVerdict = coverage === true && reviewVerdictKind(explicit) === "revision";
  const bots = hostedReviewBots(config);
  const currentApprovals = Object.entries(pr.latestReviews ?? {}).filter(
    ([login, review]) =>
      review.authorType === "User" &&
      !bots.has(normalizeLogin(login)) &&
      normalize(review.state) === "approved" &&
      reviewCoversPr(review, currentFingerprint, pr),
  );
  const githubEvidence =
    currentApprovals.length > 0
      ? {
          hasReviewEvidence: true,
          independentReviewCount: currentApprovals.length,
          reviewEvidenceCurrent: true,
          reviewedHeadSha: pr.headSha,
          reviewedDiffFingerprint: currentFingerprint,
          reviewVerdict: "APPROVE",
          changesRequested: Boolean(explicit.changesRequested || currentRevisionVerdict),
        }
      : {};
  if (currentApprovals.length > 0) return { ...explicit, ...githubEvidence };

  if (coverage === false) {
    return {
      ...explicit,
      reviewEvidenceCurrent: false,
      hasReviewEvidence: false,
      ...(currentFingerprint ? { reviewDiffFingerprint: currentFingerprint } : {}),
    };
  }
  if (coverage === true) {
    const completed = hasCompletedIndependentReview(explicit);
    // Matching evidence is restated in the current format so later checks compare like with like.
    return {
      ...explicit,
      hasReviewEvidence: completed,
      reviewEvidenceCurrent: completed,
      ...(currentFingerprint
        ? { reviewDiffFingerprint: currentFingerprint, reviewedDiffFingerprint: currentFingerprint }
        : {}),
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
  state.reviewDiffByPr?.[pr.number] ??
  state.reviewDiffByPr?.[String(pr.number ?? "")];

export const hostedReviewForPr = (state, pr, config) => {
  const record = state.hostedReviewByPr?.[pr.number] ?? {};
  const currentFingerprint = reviewDiffFingerprintForPr(state, pr);
  const bots = hostedReviewBots(config);
  const complete = Object.entries(pr.latestReviews ?? {}).some(
    ([login, review]) =>
      review.authorType === "Bot" &&
      bots.has(normalizeLogin(login)) &&
      COMPLETED_REVIEW_STATES.has(normalize(review.state)) &&
      reviewCoversPr(review, currentFingerprint, pr),
  );
  return {
    ...(complete
      ? {
          hostedReviewComplete: true,
          hostedReviewDiffFingerprint: currentFingerprint,
          hostedReviewHeadSha: pr.headSha,
        }
      : {}),
    ...record,
    ...(record.skipped == null ? {} : { hostedReviewSkipped: record.skipped }),
  };
};

// Any recorded request requires hosted review; the risk tier comes from the
// same merged state that merge readiness uses.
const hostedReviewRequirement = (sources, reviewState, config) => {
  const aliases = sources
    .flatMap((source) => [source.required, source.hostedReviewRequired])
    .filter((value) => value != null);
  const tiers =
    config.hostedReviewRiskTiers === undefined ? ["high"] : toArray(config.hostedReviewRiskTiers);
  const tierRequired = tiers.map(normalize).includes(riskTier(reviewState, config));
  if (aliases.length === 0 && !tierRequired) return {};
  const required = tierRequired || aliases.includes(true);
  return { required, hostedReviewRequired: required };
};

// Code-host facts from this tick override any copy saved with older evidence.
export const livePrFacts = (state, pr) => {
  const fingerprint = reviewDiffFingerprintForPr(state, pr);
  const unresolvedThreads = pr.unresolvedReviewThreads ?? pr.unresolvedThreads;
  // Known PR labels replace saved label-presence flags, which the contract reads first.
  const liveLabels =
    pr.labels == null
      ? {}
      : {
          prLabels: pr.labels,
          humanMergePrLabelApplied: undefined,
        };
  return {
    prState: pr.state,
    ...liveLabels,
    isDraft: pr.isDraft,
    headSha: pr.headSha,
    currentPrHeadSha: pr.headSha,
    requiredChecksPassed: checksPassed(pr),
    unresolvedThreads,
    unresolvedReviewThreads: unresolvedThreads,
    reviewDecision: pr.reviewDecision,
    reviewThreadsTruncated: pr.reviewThreadsTruncated,
    reviewDiffFingerprint: fingerprint,
  };
};

const reviewContextForPr = (state, config, pr) => {
  const hostedRecord = hostedReviewForPr(state, pr, config);
  const evidence = evidenceForPr(state, pr, config);
  const live = livePrFacts(state, pr);
  const merged = { ...pr, ...hostedRecord, ...evidence, ...live };
  const requirement = hostedReviewRequirement([hostedRecord, evidence], merged, config);
  return {
    reviewState: { ...merged, ...requirement },
    hostedReview: { ...hostedRecord, ...requirement, ...live },
  };
};

const humanMergeDecisionForPr = (state, config, pr) => ({
  pr: pr.number,
  headSha: pr.headSha,
  ...humanMergePrLabelDecision(reviewContextForPr(state, config, pr).reviewState, config),
});

const hostedReviewDecisionForPr = (state, config, pr) => {
  const { hostedReview } = reviewContextForPr(state, config, pr);
  if (!hostedReview.required) return null;
  return {
    pr: pr.number,
    headSha: pr.headSha,
    ...hostedReviewEscalationDecision(
      { ...hostedReview, prExists: true, prState: pr.isDraft ? "draft" : pr.state },
      config,
    ),
  };
};

const targetForPr = (pr) => `pr:${pr.number}`;

const reviewRequestForPr = (state, pr) => {
  const byPr = state.reviewRequestsByPr ?? {};
  const request = byPr[pr.number] ?? {};
  const coverage = diffCoverage(
    request.reviewDiffFingerprint,
    request.headSha,
    reviewDiffFingerprintForPr(state, pr),
    pr.headSha,
  );
  return coverage === true ? request : null;
};

const previousReviewHeadForPr = (state, pr, config) => {
  const currentFingerprint = reviewDiffFingerprintForPr(state, pr);
  const explicit = (state.reviewEvidenceByPr ?? {})[pr.number] ?? {};
  const priorFingerprint = explicit.reviewedDiffFingerprint;
  const priorHead = explicit.reviewedHeadSha;
  const hasVerdict = explicit.blockingFindings || reviewVerdictKind(explicit) !== null;
  if (
    priorHead &&
    hasVerdict &&
    (currentFingerprint
      ? priorFingerprint && normalize(priorFingerprint) !== normalize(currentFingerprint)
      : normalize(priorHead) !== normalize(pr.headSha))
  ) {
    return priorHead;
  }
  const bots = hostedReviewBots(config);
  return Object.entries(pr.latestReviews ?? {})
    .filter(
      ([login, review]) =>
        review.authorType === "User" &&
        !bots.has(normalizeLogin(login)) &&
        ["approved", "changes_requested"].includes(normalize(review.state)) &&
        (currentFingerprint
          ? review.reviewDiffFingerprint &&
            normalize(review.reviewDiffFingerprint) !== normalize(currentFingerprint)
          : normalize(review.headSha ?? review.commitSha) !== normalize(pr.headSha)),
    )
    .sort(([, left], [, right]) =>
      normalize(right.submittedAt).localeCompare(normalize(left.submittedAt)),
    )
    .map(([, review]) => review.headSha ?? review.commitSha)
    .find(Boolean);
};

const prDisposition = (state, config, pr, issues) => {
  const terminal = mergedPrDisposition(pr, issues, state, config);
  if (terminal !== undefined) return terminal;
  const target = targetForPr(pr);
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

  const reviewDiffFingerprint = reviewDiffFingerprintForPr(state, pr);
  const { reviewState } = reviewContextForPr(state, config, pr);
  const review = currentReviewStatus(reviewState, config);
  const facts = mergeReadinessFacts(reviewState);
  // A ready PR that already passed local review gets its follow-up fixes
  // reviewed by the required hosted reviewer instead of a second local pass.
  const explicitEvidence = (state.reviewEvidenceByPr ?? {})[pr.number];
  const hostedReviewsDelta =
    !facts.draft && facts.hostedReviewBlocked && reviewVerdictKind(explicitEvidence) === "clean";
  // Known scope drift is fixed before review, readiness, or hosted review.
  if (review.status === "blocking" || facts.scopeMismatch) {
    return {
      bucket: "actions",
      value: { target, kind: "route-fix", owner, reason: "FIX_REQUIRED" },
    };
  }
  if (review.status === "missing" && !hostedReviewsDelta) {
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
    const deltaFrom = previousReviewHeadForPr(state, pr, config);
    const attempt =
      existingRequest &&
      createHash("sha256")
        .update(
          JSON.stringify({
            sessionId: existingRequest.sessionId,
            receiptId: existingRequest.receiptId,
            status: existingRequest.status,
          }),
        )
        .digest("hex")
        .slice(0, 16);
    return {
      bucket: "actions",
      value: {
        target,
        kind: "request-review",
        owner: "review-worker",
        reason: "REVIEW_REQUIRED",
        ...(reviewDiffFingerprint ? { reviewDiffFingerprint } : {}),
        ...(deltaFrom ? { deltaFrom } : {}),
        idempotencyKey: `review:${pr.number}:${reviewDiffFingerprint ?? pr.headSha}${attempt ? `:after:${attempt}` : ""}`,
      },
    };
  }
  if (facts.draft) {
    return {
      bucket: "actions",
      value: { target, kind: "mark-ready", owner: "orchestrator", reason: "REVIEW_CLEAN" },
    };
  }

  if (facts.hostedReviewBlocked) {
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
  const decision = mergeEligibilityDecision(reviewState, config);
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
    if (humanMergeAlreadyRouted(pr, issues, config))
      return {
        bucket: "waits",
        value: {
          target,
          signal: "human",
          owner: "human",
          reason: "AWAITING_HUMAN_MERGE",
        },
      };
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
  return { bucket: "holds", value: { target, reason: "MERGE_HELD" } };
};

export function planTick({
  snapshot: rawSnapshot,
  config = {},
  state: rawState = { v: 3, repo: rawSnapshot?.repo },
  debug = false,
  stateValidated = false,
}) {
  const startedAt = performance.now();
  validatePlannerArguments({ snapshot: rawSnapshot, config, state: rawState, stateValidated });
  const { snapshot, state, diagnostics } = normalizePlannerModel({
    snapshot: rawSnapshot,
    state: { ...rawState, pullRequests: savedPrHistory(rawState) },
  });
  const observedIssues = [
    ...toArray(snapshot.linear?.issues ?? state.tickets ?? state.linearIssues),
    ...toArray(snapshot.linear?.activeIssues),
    ...toArray(snapshot.linear?.issueMetadata),
  ];
  if (state.workerLimit != null)
    config = {
      ...config,
      workerConcurrencyCap: Math.min(
        state.workerLimit,
        config.workerConcurrencyCap ?? config.cap ?? 3,
      ),
    };
  const initialPullRequests = mergePrLists(
    snapshot.prs,
    toArray(state.pullRequests).filter(
      (pr) =>
        snapshot.prs.some((live) => live.number === pr.number) ||
        !retiredPr(state, pr.number, observedIssues),
    ),
  );
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
  const hasUnresolvedPreparation = (issueRef) =>
    state.preparations?.some(
      (record) =>
        record.issueRef === issueRef &&
        (record.outcome !== "ready" || needsPreparation(linearNodesById.get(issueRef))) &&
        record.updatedAt === linearIssues.find((issue) => issue.issueRef === issueRef)?.updatedAt,
    );
  const hasTerminalPr = (issueRef) =>
    pullRequests.some((pr) => terminalPr(pr) && coversIssue(pr, issueRef));
  const linearStartableTickets =
    linearDag?.nodes
      .filter(
        (node) =>
          node.startable &&
          !needsPreparation(node) &&
          !hasUnresolvedPreparation(node.issueRef) &&
          !hasTerminalPr(node.issueRef),
      )
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
    if (hasUnresolvedPreparation(id) || hasTerminalPr(id)) continue;
    if (!scope.matchesCandidate(ticket) || ticket.activeClaim || ticket.openPr) {
      excludedCandidates.push({
        target: `ticket:${id}`,
        reason: scope.matchesCandidate(ticket) ? "DELIVERY_ALREADY_ACTIVE" : "OUT_OF_SCOPE",
      });
      continue;
    }
    if (!ticket.footprint.length) {
      if (!issueById.has(id))
        excludedCandidates.push({
          target: `ticket:${id}`,
          reason: "TICKET_STATE_MISSING",
          owner: "orchestrator",
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
    startableTickets: blockingIdentityDiagnostics ? [] : [...startableTicketsById.values()],
  };

  const readyStatePromotions = toArray(state.tickets ?? snapshot.linear?.issues)
    .filter(scope.matchesCandidate)
    .filter(
      (ticket) => !hasUnresolvedPreparation(ticket.issueRef) && !hasTerminalPr(ticket.issueRef),
    )
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
    .filter((pr) => !terminalPr(pr))
    .map((pr) => hostedReviewDecisionForPr(state, config, pr))
    .filter(Boolean);
  const capacity = capacityDecision(planningState, config);
  const dispatch = dispatchSelectionDecision(planningState, config);
  const humanMergeLabels = actionPullRequests
    .filter((pr) => !terminalPr(pr))
    .map((pr) => humanMergeDecisionForPr(state, config, pr));
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
    const disposition = prDisposition(state, config, pr, linearIssues);
    if (!disposition) continue;
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
      footprint: toArray(ticket.footprint),
    });
  }
  for (const ticket of dispatch.deferred ?? []) {
    if (ticket.reason === "missing predicted file footprint") {
      dispatchActions.push({
        target: `ticket:${ticket.issueRef}`,
        kind: "prepare-ticket",
        owner: "ziw-triage",
        reason: "FOOTPRINT_MISSING",
        missingSections: linearNodesById.get(ticket.issueRef)?.missingSections ?? [],
        startableBlockers: ["missing predicted file footprint"],
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
  const reopenedPrs = snapshot.prs.filter(
    (pr) =>
      !terminalPr(pr) &&
      state.pullRequests.some((saved) => saved.number === pr.number && saved.closedResult),
  );
  const actions = [
    ...dispatchActions,
    ...labelActions,
    ...prActions,
    ...reopenedPrs.map((pr) => ({
      target: `pr:${pr.number}`,
      kind: "record-pr-state",
      owner: "orchestrator",
      reason: "PR_REOPENED",
    })),
  ];
  const tickets = accountForScope({
    issues: linearIssues,
    dag: linearDag,
    scope,
    state,
    config,
    prs: actionPullRequests,
    actions,
    waits,
    holds,
    workers: activeDispatches,
  });

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
    tickets,
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
    return compactPlan;
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
  return {
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
  };
}
export function main(args) {
  const input = loadPlannerInput(args);
  if (!input) return;
  console.log(JSON.stringify(planTick(input), null, input.pretty || input.debug ? 2 : 0));
}
if (isMain(import.meta.url)) await runCli("tick-plan", () => main(process.argv.slice(2)));
