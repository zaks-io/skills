import { hasActiveClaim, hasOpenPr } from "./linear-dag-start.mjs";
import { coversIssue, sameValue } from "./delivery-identity.mjs";
import { isLiveWorker as isLiveDispatch } from "./worker-lifecycle.mjs";

const normalize = (value) =>
  String(value ?? "")
    .trim()
    .toLowerCase();
const toArray = (value) => (value == null ? [] : Array.isArray(value) ? value : [value]);
const union = (...values) => [...new Set(values.flatMap(toArray))];
const isDependencyBotPr = (pr) =>
  pr?.isDependencyBot === true ||
  /dependabot|renovate/.test(normalize(pr?.author?.login ?? pr?.author ?? pr?.authorLogin));
const isOpenProductPr = (pr) =>
  !isDependencyBotPr(pr) &&
  pr?.open !== false &&
  pr?.closed !== true &&
  pr?.merged !== true &&
  !pr?.mergedAt &&
  !["closed", "merged"].includes(normalize(pr?.state ?? pr?.status));
const isActiveLinearClaim = (issue) =>
  !["completed", "canceled", "duplicate"].includes(
    normalize(issue?.stateType ?? issue?.state?.type),
  ) && hasActiveClaim(issue);
const isStartedLinearIssue = (issue) =>
  normalize(issue?.stateType ?? issue?.state?.type) === "started";

export const completedByMergedPullRequest = (worktree, mergedPullRequests = []) =>
  mergedPullRequests.some((pr) => {
    if (worktree?.headSha && (pr?.headSha || pr?.headRefOid)) {
      return sameValue(worktree.headSha, pr.headSha ?? pr.headRefOid);
    }
    return sameValue(worktree?.branch, pr?.headRefName ?? pr?.branch);
  });

function mergeWorker(left, right) {
  const leftRefs = union(left.issueRef, left.issueRefs).filter(Boolean);
  const rightRefs = union(right.issueRef, right.issueRefs).filter(Boolean);
  if (leftRefs.length && rightRefs.length && !leftRefs.some((ref) => rightRefs.includes(ref)))
    throw new Error("worker issueRef conflict for shared sessionId or receiptId");
  for (const field of ["sessionId", "issueRef"]) {
    if (left[field] && right[field] && left[field] !== right[field]) {
      throw new Error(`worker ${field} conflict for shared sessionId or receiptId`);
    }
  }
  return {
    ...right,
    ...left,
    sessionId: left.sessionId ?? right.sessionId,
    receiptId: left.receiptId ?? right.receiptId,
    issueRef: left.issueRef ?? right.issueRef,
    issueRefs: union(left.issueRefs, right.issueRefs),
    workerRef: left.sessionId
      ? left.workerRef
      : right.sessionId
        ? right.workerRef
        : (left.workerRef ?? right.workerRef),
    worktree: left.worktree ?? right.worktree,
    branch: left.branch ?? right.branch,
    possibleIssueRefs: union(left.possibleIssueRefs, right.possibleIssueRefs),
    footprint: union(left.footprint, right.footprint),
    source: union(left.source?.split("+"), right.source?.split("+")).join("+"),
    occupiesWorkerSlot: true,
  };
}

export function reconcileActiveDelivery({
  snapshot = {},
  state = {},
  pullRequests = [],
  issuesForPrMetadata = [],
}) {
  const linearIssues = union(
    snapshot.linear?.activeIssues,
    state.activeLinearIssues,
    snapshot.linear?.issues,
    state.tickets ?? state.linearIssues,
    state.startableTickets,
  );
  const reconciledPullRequests = pullRequests.map((pr) => ({
    ...pr,
    footprint: toArray(pr.footprint),
  }));
  const workerGroups = [];
  const reservations = [];
  const matchingPr = (item, pr) =>
    isOpenProductPr(pr) && (sameValue(item.prNumber, pr.number) || coversIssue(pr, item.issueRef));
  const transferPrFootprint = (item) => {
    const matches = reconciledPullRequests.filter((pr) => matchingPr(item, pr));
    for (const pr of matches) pr.footprint = union(pr.footprint, item.footprint);
    return matches.length > 0;
  };
  const addWorker = (worker) => {
    if (!worker.workerRef) throw new Error("active worker.workerRef is required");
    let merged = { ...worker, footprint: toArray(worker.footprint), occupiesWorkerSlot: true };
    const sessions = new Set(toArray(worker.sessionId));
    const receipts = new Set(toArray(worker.receiptId));
    const observations = new Set(toArray(worker.workerRef));
    let found;
    do {
      found = workerGroups.findIndex(
        (group) =>
          [...group.sessions].some((ref) => sessions.has(ref)) ||
          [...group.receipts].some((ref) => receipts.has(ref)) ||
          [...group.observations].some((ref) => observations.has(ref)),
      );
      if (found < 0) break;
      const [group] = workerGroups.splice(found, 1);
      merged = mergeWorker(group.item, merged);
      for (const ref of group.sessions) sessions.add(ref);
      for (const ref of group.receipts) receipts.add(ref);
      for (const ref of group.observations) observations.add(ref);
    } while (found >= 0);
    workerGroups.push({ item: merged, sessions, receipts, observations });
  };
  const records = [
    ...toArray(state.dispatches).map((item) => ({ ...item, source: item.source ?? "ledger" })),
    ...toArray(state.ledgerDispatches).map((item) => ({
      ...item,
      source: item.source ?? "ledger",
    })),
    ...toArray(state.workers).map((item) => ({
      ...item,
      source: item.source ?? "worker-observation",
    })),
    ...toArray(state.activeWork).map((item) => ({
      ...item,
      source: item.source ?? "local-active-work",
    })),
  ];
  for (const item of records) {
    transferPrFootprint(item);
    if (!isLiveDispatch(item)) continue;
    if (item.occupiesWorkerSlot !== false && (item.workerRef || item.sessionId || item.receiptId))
      addWorker(item);
    else
      reservations.push({ ...item, footprint: toArray(item.footprint), occupiesWorkerSlot: false });
  }
  for (const issue of linearIssues) {
    if (!isActiveLinearClaim(issue) && !isStartedLinearIssue(issue)) continue;
    const endedTrackerSession =
      Boolean(issue.sessionId) &&
      records.some(
        (record) =>
          !isLiveDispatch(record) &&
          sameValue(record.sessionId, issue.sessionId) &&
          (!record.issueRef || record.issueRef === issue.issueRef),
      ) &&
      !records.some(
        (record) =>
          isLiveDispatch(record) &&
          record.occupiesWorkerSlot !== false &&
          sameValue(record.sessionId, issue.sessionId),
      );
    const item = {
      issueRef: issue.issueRef,
      worktree: issue.worktree ?? issue.path,
      path: issue.path,
      branch: issue.branch,
      sessionId: issue.sessionId,
      receiptId: issue.receiptId,
      workerRef: issue.workerRef,
      footprint: toArray(issue.footprint),
      state: "running",
      source: endedTrackerSession
        ? "linear-returned-claim-reservation"
        : isActiveLinearClaim(issue)
          ? "linear-active-claim"
          : "linear-started-reservation",
      occupiesWorkerSlot:
        Boolean(issue.sessionId || issue.receiptId) &&
        isActiveLinearClaim(issue) &&
        !endedTrackerSession,
    };
    transferPrFootprint(item);
    if (item.occupiesWorkerSlot) addWorker(item);
    else reservations.push(item);
  }
  const workers = workerGroups.map((group) => group.item);
  for (const worker of workers) {
    const metadata = [...linearIssues, ...toArray(issuesForPrMetadata)].filter((issue) =>
      coversIssue(worker, issue.issueRef),
    );
    worker.footprint = union(
      worker.footprint,
      metadata.flatMap((issue) => toArray(issue.footprint)),
    );
    transferPrFootprint(worker);
  }
  const worktrees = union(snapshot.worktrees, state.worktrees).filter(
    (item) => item?.prunable !== true,
  );
  for (const tree of worktrees) {
    if (tree.branch && normalize(tree.branch) === normalize(snapshot.baseline?.branch)) continue;
    if (
      tree.dirty !== true &&
      (tree.completedByMergedPr === true || tree.mergedIntoBaseline === true)
    )
      continue;
    const refs = union(tree.issueRef, tree.possibleIssueRefs);
    const footprint = union(
      tree.footprint,
      linearIssues
        .filter((issue) => refs.includes(issue.issueRef))
        .flatMap((issue) => toArray(issue.footprint)),
    );
    reservations.push({
      ...tree,
      issueRef: tree.issueRef ?? null,
      worktree: tree.path ?? tree.worktree,
      receiptId: null,
      sessionId: null,
      workerRef: null,
      state: "running",
      footprint,
      occupiesWorkerSlot: false,
      source: "local-worktree-unmerged",
    });
  }
  const retainedReservations = [];
  for (const reservation of reservations) {
    const matched = workers.filter(
      (worker) =>
        sameValue(reservation.worktree ?? reservation.path, worker.worktree ?? worker.path) ||
        (reservation.issueRef && coversIssue(worker, reservation.issueRef)),
    );
    for (const worker of matched) {
      worker.footprint = union(worker.footprint, reservation.footprint);
      worker.possibleIssueRefs = union(
        worker.possibleIssueRefs,
        reservation.possibleIssueRefs,
        reservation.issueRef,
      );
    }
    const onPr = transferPrFootprint(reservation);
    if (matched.length || onPr) continue;
    const existing = retainedReservations.find(
      (item) =>
        sameValue(item.worktree ?? item.path, reservation.worktree ?? reservation.path) ||
        sameValue(item.receiptId, reservation.receiptId) ||
        (!item.worktree && !reservation.worktree && sameValue(item.issueRef, reservation.issueRef)),
    );
    if (existing) {
      existing.footprint = union(existing.footprint, reservation.footprint);
      existing.possibleIssueRefs = union(
        existing.possibleIssueRefs,
        reservation.possibleIssueRefs,
        reservation.issueRef,
      );
    } else retainedReservations.push(reservation);
  }
  for (const pr of reconciledPullRequests) {
    const matches = [...linearIssues, ...toArray(issuesForPrMetadata)].filter((issue) =>
      coversIssue(pr, issue.issueRef),
    );
    const refs = new Set(matches.map((issue) => issue.issueRef));
    const hintOnly = refs.size > 0 && !pr.issueRef && toArray(pr.issueRefs).length === 0;
    if ((refs.size > 1 || hintOnly) && normalize(pr.riskTier ?? pr.tier) !== "high")
      pr.riskTier = "medium";
    const labels = matches.flatMap((issue) => toArray(issue.labels));
    if (labels.length) pr.issueLabels = union(pr.issueLabels, labels);
  }
  return {
    dispatches: [...workers, ...retainedReservations],
    pullRequests: reconciledPullRequests,
  };
}

export const deriveActiveDispatches = (input) => reconcileActiveDelivery(input).dispatches;
export const issuesWithDeliveryEvidence = (issues, { pullRequests = [], dispatches = [] } = {}) =>
  toArray(issues).map((issue) => ({
    ...issue,
    activeClaim:
      isActiveLinearClaim(issue) ||
      dispatches.some((item) => isLiveDispatch(item) && coversIssue(item, issue.issueRef)),
    openPr:
      hasOpenPr(issue) ||
      pullRequests.some((pr) => isOpenProductPr(pr) && coversIssue(pr, issue.issueRef)),
  }));
