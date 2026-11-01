import { coversIssue } from "./delivery-identity.mjs";
import { humanMergePrLabel, implementationReadyLabels } from "./workflow-contract.mjs";

const normalized = (value) =>
  String(value ?? "")
    .trim()
    .toLowerCase();
const list = (value) => (value == null ? [] : [value].flat());
const stateName = (issue) => normalized(issue?.state?.name ?? issue?.state);
const labels = (issue) => list(issue?.labels).map((label) => normalized(label?.name ?? label));

export const terminalIssue = (issue, config = {}) =>
  ["completed", "canceled", "duplicate"].includes(
    normalized(issue.stateType ?? issue.state?.type),
  ) ||
  ["done", "closed", "complete", "completed", ...list(config.doneStates), config.doneState]
    .map(normalized)
    .filter(Boolean)
    .includes(stateName(issue));

export const terminalPr = (pr) =>
  ["closed", "merged"].includes(normalized(pr.state)) || pr.merged === true;

export function mergedPrDisposition(pr, issues, state, config) {
  if (!terminalPr(pr)) return undefined;
  const target = `pr:${pr.number}`;
  const linked = issues.filter((issue) =>
    coversIssue(pr, issue.issueRef, { includePossible: false }),
  );
  const hold = (reason, resolution) => ({
    bucket: "holds",
    value: { target, owner: "human", reason, ...(resolution ? { resolution } : {}) },
  });
  if (normalized(pr.state) !== "merged" && pr.merged !== true) {
    const refs = [pr.issueRef, ...list(pr.issueRefs)].filter(Boolean);
    if (
      !linked.length ||
      !linked.every((issue) => terminalIssue(issue, config)) ||
      refs.some((ref) => !linked.some((issue) => issue.issueRef === ref))
    )
      return hold(
        "PR_CLOSED_UNMERGED",
        "Confirm why it was closed. For the same work, reopen the original PR. For a different attempt, create and explicitly select a new ticket. Complete or cancel the old ticket only when warranted; preserve its evidence.",
      );
    if (!pr.headSha || linked.some((issue) => !issue.updatedAt))
      return hold(
        "CLOSED_PR_EVIDENCE_MISSING",
        "Recollect the closed PR head and terminal ticket revisions before recording settlement.",
      );
    const closedResult = {
      headSha: pr.headSha,
      issues: [...linked]
        .sort((left, right) => left.issueRef.localeCompare(right.issueRef))
        .map((issue) => ({
          ...(issue.issueKey ? { issueKey: issue.issueKey } : {}),
          ...(issue.issueUuid ? { issueUuid: issue.issueUuid } : {}),
          updatedAt: issue.updatedAt,
        })),
    };
    const prior = state.pullRequests?.find((record) => record.number === pr.number)?.closedResult;
    if (JSON.stringify(prior) === JSON.stringify(closedResult)) return null;
    return {
      bucket: "actions",
      value: {
        target,
        kind: "record-closed-pr",
        owner: "orchestrator",
        reason: "CLOSED_PR_SETTLED",
        closedResult,
      },
    };
  }
  if (!pr.headSha || !pr.mergeCommitSha) return hold("MERGE_EVIDENCE_MISSING");
  if (linked.length !== 1) return hold("MERGED_PR_ISSUE_UNRESOLVED");
  const result = state.mergeResultsByPr?.[pr.number];
  const current = result?.headSha === pr.headSha && result?.mergeCommitSha === pr.mergeCommitSha;
  if (current && result.postMergeCheck === "failed")
    return hold(
      "POST_MERGE_CHECK_FAILED",
      "After fixing the default branch or confirming a transient failure, rerun the configured post-merge check. On success reconcile the tracker and use the same merge-result command with --check passed and the confirmed --tracker-updated-at.",
    );
  const issue = linked[0];
  const readiness = implementationReadyLabels(config);
  const removeLabels = list(issue.labels)
    .map((label) => label?.name ?? label)
    .filter((label) => readiness.has(normalized(label)));
  if (
    current &&
    result.trackerUpdatedAt &&
    result.trackerUpdatedAt !== issue.updatedAt &&
    (!terminalIssue(issue, config) || removeLabels.length)
  )
    return hold(
      "MERGED_TICKET_CHANGED",
      "The ticket changed after confirmed reconciliation. Ask its owner whether the reopened work needs a new ticket; preserve the current tracker state.",
    );
  if (current && terminalIssue(issue, config) && !removeLabels.length) return null;
  return {
    bucket: "actions",
    value: {
      target,
      kind: "reconcile-merged-pr",
      owner: "orchestrator",
      reason: "MERGE_CONFIRMED",
      targetState: config.doneState ?? "Done",
      issueRef: issue.issueRef,
      headSha: pr.headSha,
      mergeCommitSha: pr.mergeCommitSha,
      verifyPostMerge: !current,
      removeLabels,
    },
  };
}

export function humanMergeAlreadyRouted(pr, issues, config) {
  const linked = issues.filter((issue) =>
    coversIssue(pr, issue.issueRef, { includePossible: false }),
  );
  const label = normalized(humanMergePrLabel(pr, config));
  return (
    linked.length === 1 &&
    labels(pr).includes(label) &&
    stateName(linked[0]) === normalized(config.readyToMergeState ?? "Ready to Merge")
  );
}

export const needsPreparation = (node) =>
  !node?.startableKind ||
  !node.ready ||
  !node.startableState ||
  node.missingSections?.length > 0 ||
  !node.footprint.length ||
  (node.requiresEstimate && !node.hasEstimate);

// Every requested ticket needs a disposition, including tickets the DAG cannot start.
export function accountForScope({
  issues,
  dag,
  scope,
  state,
  config,
  prs,
  actions,
  waits,
  holds,
  workers = [],
}) {
  const byRef = new Map(issues.map((issue) => [issue.issueRef, issue]));
  const nodes = new Map((dag?.nodes ?? []).map((node) => [node.issueRef, node]));
  const requested =
    state.scopeIssueRefs ??
    issues
      .filter((issue) => {
        const node = nodes.get(issue.issueRef);
        return (
          scope.matchesCandidate(issue) &&
          (node?.startableState ||
            state.startableTickets?.some((ticket) => ticket.issueRef === issue.issueRef) ||
            node?.activeClaim ||
            node?.openPr ||
            actions.some((action) => action.target === `ticket:${issue.issueRef}`) ||
            normalized(issue.stateType) === "started")
        );
      })
      .map((issue) => issue.issueRef);
  const progress = [];
  for (const ref of [...new Set(requested)]) {
    const target = `ticket:${ref}`;
    const issue = byRef.get(ref);
    const node = nodes.get(ref);
    const linkedPrs = prs.filter((pr) => coversIssue(pr, ref, { includePossible: false }));
    const targets = new Set([target, ...linkedPrs.map((pr) => `pr:${pr.number}`)]);
    const relevant = (items) => items.filter((item) => targets.has(item.target));
    const pushHold = (reason, owner, extra = {}) => {
      const existing = holds.find((hold) => hold.target === target);
      if (existing) return existing;
      const hold = { target, reason, owner, ...extra };
      holds.push(hold);
      return hold;
    };
    let item;
    let status;
    if (!issue || !issue.state) item = pushHold("TICKET_STATE_MISSING", "orchestrator");
    else if (!scope.matchesReservation(issue)) item = pushHold("OUT_OF_SCOPE", "human");
    else if (relevant(actions).length) {
      item = relevant(actions)[0];
      status = "actionable";
    } else if (relevant(waits).length) {
      item = relevant(waits)[0];
      status = "waiting";
    } else if (
      workers.some((worker) => worker.occupiesWorkerSlot !== false && coversIssue(worker, ref))
    ) {
      item = { reason: "WORKER_RUNNING", owner: "implementation-worker" };
      status = "running";
    } else if (relevant(holds).length)
      item =
        relevant(holds).find((hold) => hold.reason !== "DELIVERY_ALREADY_ACTIVE") ??
        relevant(holds)[0];
    else if (terminalIssue(issue, config)) {
      status = "finished";
      item = { reason: "TRACKER_TERMINAL" };
    } else if (!scope.matchesCandidate(issue)) item = pushHold("OUTSIDE_CANDIDATE_SCOPE", "human");
    else if (labels(issue).includes("ready-for-human"))
      item = pushHold("HUMAN_DECISION_REQUIRED", "human");
    else {
      const preparation = state.preparations?.find(
        (entry) => entry.issueRef === ref && entry.updatedAt === issue.updatedAt,
      );
      if (preparation && preparation.outcome !== "ready")
        item = pushHold(
          preparation.outcome === "needs-slicing" ? "SLICING_REQUIRED" : "HUMAN_DECISION_REQUIRED",
          preparation.outcome === "needs-slicing" ? "ziw-to-issues" : "human",
          { detail: preparation.reason },
        );
      else if (labels(issue).some((label) => ["kind-epic", "kind-spec"].includes(label)))
        item = pushHold("SLICING_REQUIRED", "ziw-to-issues");
      else if (needsPreparation(node)) {
        if (preparation?.outcome === "ready") {
          item = pushHold("PREPARATION_INCONSISTENT", "ziw-triage", {
            missingSections: node?.missingSections ?? [],
            startableBlockers: [
              ...(node?.startableBlockers ?? []),
              ...(!node?.footprint.length ? ["missing predicted file footprint"] : []),
            ],
            resolution:
              "Compare the confirmed ticket with the reported gaps. Fix its body or metadata and recollect the changed revision before preparing again.",
          });
        } else {
          item = {
            target,
            kind: "prepare-ticket",
            owner: "ziw-triage",
            reason: "PREPARATION_REQUIRED",
            missingSections: node?.missingSections ?? [],
            startableBlockers: [
              ...(node?.startableBlockers ?? []),
              ...(!node?.footprint.length ? ["missing predicted file footprint"] : []),
            ],
          };
          actions.push(item);
          status = "actionable";
        }
      } else if (!node.unblocked) {
        item = {
          target,
          signal: "dependency",
          owner: "dependency",
          reason: "DEPENDENCY_BLOCKED",
          blockedBy: node.blockedBy,
        };
        if (dag.cycles.includes(ref))
          item = pushHold("DEPENDENCY_CYCLE", "ziw-triage", { blockedBy: node.blockedBy });
        else {
          waits.push(item);
          status = "waiting";
        }
      } else item = pushHold("DISPATCH_DEFERRED", "orchestrator");
    }
    progress.push({
      target,
      status: status ?? "blocked",
      reason: item.reason,
      ...(item.owner ? { owner: item.owner } : {}),
      ...(item.blockedBy ? { blockedBy: item.blockedBy } : {}),
      ...(item.resolution ? { resolution: item.resolution } : {}),
    });
  }
  return progress;
}
