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

import { extractLinearIssues, linearDagStart } from "./linear-dag-start.mjs";
import {
  capacityDecision,
  dispatchSelectionDecision,
  hostedReviewEscalationDecision,
  humanMergePrLabelDecision,
  readyStatePromotionDecision,
  reviewEvidenceDecision,
} from "../../../scripts/workflow-contract.mjs";

const args = process.argv.slice(2);
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
  return (state === "success" || state === "none") && failed.length === 0 && pending.length === 0;
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
  return Object.assign({}, ...keys.map((key) => byPr[key] ?? {}));
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
  if (!hostedReview.recommended && !hostedReview.required && !hostedReview.highRisk) return null;
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

const pullRequests = mergePrLists(snapshot.prs, state.pullRequests);
const linearIssues = extractLinearIssues({
  snapshot,
  state: { tickets: state.tickets ?? state.linearIssues },
});
const linearDag = linearIssues.length > 0 ? linearDagStart(linearIssues, config) : null;
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
    })) ?? [];
const explicitStartableTickets = toArray(state.startableTickets);
const planningState = {
  ...state,
  pullRequests,
  previews: toArray(state.previews),
  dispatches: toArray(state.dispatches ?? state.ledgerDispatches),
  activeWork: toArray(state.activeWork),
  startableTickets:
    explicitStartableTickets.length > 0 ? explicitStartableTickets : linearStartableTickets,
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

const selectedDispatches = dispatch.selected?.length ?? 0;
const nextAction =
  selectedDispatches > 0
    ? "dispatch-selected-work"
    : capacity.action === "DRAIN_ACTIVE_WORK"
      ? "drain-active-work"
      : capacity.action === "WAIT_FOR_EXTERNAL_SIGNAL"
        ? "wait-for-signal"
        : capacity.action === "STOP_COMPLETELY_BLOCKED"
          ? "stop-blocked"
          : dispatch.action;

process.stdout.write(
  `${JSON.stringify(
    {
      repo: snapshot.repo ?? state.repo ?? null,
      baseline: snapshot.baseline ?? null,
      footprint: capacity.footprint,
      nextAction,
      decisions: {
        capacity,
        dispatch,
        readyStatePromotions,
        reviewEvidence,
        linearDag,
        hostedReviews,
        humanMergeLabels,
      },
      counts: {
        openPrs: pullRequests.length,
        startableTickets: planningState.startableTickets.length,
        selectedDispatches,
        deferredDispatches: dispatch.deferred?.length ?? 0,
        linearDagFrontier: linearDag?.frontier.length ?? 0,
        linearDagStarts: linearDag?.starts.length ?? 0,
        linearDagReadyStarts: linearDag?.readyStarts.length ?? 0,
        humanMergeLabelsToApply: humanMergeLabels.filter(
          (decision) => decision.action === "APPLY_HUMAN_MERGE_PR_LABEL",
        ).length,
        humanMergeLabelsToClear: humanMergeLabels.filter(
          (decision) => decision.action === "CLEAR_HUMAN_MERGE_PR_LABEL",
        ).length,
      },
    },
    null,
    2,
  )}\n`,
);
