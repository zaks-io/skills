import { hasActiveClaim, hasOpenPr } from "./linear-dag-start.mjs";

const normalize = (value) =>
  String(value ?? "")
    .trim()
    .toLowerCase();

const toArray = (value) => {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
};

const isLiveDispatch = (dispatch) =>
  dispatch?.returned !== true &&
  dispatch?.stopped !== true &&
  dispatch?.hasPr !== true &&
  !["returned", "stopped", "failed", "completed", "stale"].includes(
    normalize(dispatch?.state ?? dispatch?.status),
  );

const issueIdentifier = (item) => {
  const exact = [item?.issueId, item?.identifier, item?.ticket, item?.key, item?.id]
    .map((value) => String(value ?? "").trim())
    .find((value) => /^[A-Z][A-Z0-9]+-\d+$/i.test(value) && !/^PR-\d+$/i.test(value));
  if (exact) return exact.toUpperCase();
  const embedded = [item?.branch, item?.headRefName, item?.url, item?.path, item?.worktree]
    .map(
      (value) =>
        String(value ?? "").match(/(?:^|[^a-z0-9])([A-Z][A-Z0-9]+-\d+)(?:[^a-z0-9]|$)/i)?.[1],
    )
    .find(Boolean)
    ?.toUpperCase();
  if (embedded) return embedded;
  return String(item?.title ?? "")
    .trim()
    .match(/^([A-Z][A-Z0-9]+-\d+)(?:[^a-z0-9]|$)/i)?.[1]
    ?.toUpperCase();
};

const itemMentionsIssue = (item, identifier) => {
  if (!identifier) return false;
  const escaped = identifier.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, "i");
  const linkedIdentifier = issueIdentifier(item);
  if (
    /^[A-Z][A-Z0-9]+-\d+$/i.test(identifier) &&
    linkedIdentifier &&
    !sameValue(linkedIdentifier, identifier)
  )
    return false;
  return (
    [
      item?.issueId,
      item?.identifier,
      item?.ticket,
      item?.id,
      item?.key,
      item?.url,
      item?.branch,
      item?.headRefName,
      item?.worktree,
      item?.path,
    ].some((value) => pattern.test(String(value ?? ""))) ||
    ((!linkedIdentifier || sameValue(linkedIdentifier, identifier)) &&
      new RegExp(`^${escaped}([^a-z0-9]|$)`, "i").test(String(item?.title ?? "").trim()))
  );
};

const sameValue = (left, right) => left && right && normalize(left) === normalize(right);

export const completedByMergedPullRequest = (worktree, mergedPullRequests = []) =>
  mergedPullRequests.some((pr) => {
    const sameHead = sameValue(worktree?.headSha, pr?.headSha ?? pr?.headRefOid);
    if (worktree?.headSha && (pr?.headSha || pr?.headRefOid)) return sameHead;
    return sameValue(worktree?.branch, pr?.headRefName ?? pr?.branch);
  });

const itemsMatch = (left, right) => {
  const leftIssue = issueIdentifier(left);
  const rightIssue = issueIdentifier(right);
  const leftSession = workerSession(left);
  const rightSession = workerSession(right);
  if (leftIssue && rightIssue && leftIssue !== rightIssue) return false;
  if (leftSession && rightSession && !sameValue(leftSession, rightSession)) return false;
  return (
    sameValue(leftSession, rightSession) ||
    (leftIssue && rightIssue && leftIssue === rightIssue) ||
    sameValue(left?.branch ?? left?.headRefName, right?.branch ?? right?.headRefName) ||
    sameValue(left?.worktree ?? left?.path, right?.worktree ?? right?.path) ||
    sameValue(left?.id, right?.id)
  );
};

const workerSession = (item) =>
  [item?.session, item?.sessionId, item?.workerSession, item?.agentSession].find(
    (value) => typeof value === "string" && value.trim(),
  );

const mergeDispatches = (existing, incoming) => ({
  ...existing,
  ...incoming,
  id: existing.id ?? incoming.id,
  issueId: existing.issueId ?? incoming.issueId,
  branch: existing.branch ?? incoming.branch,
  headSha: existing.headSha ?? incoming.headSha,
  worktree: existing.worktree ?? incoming.worktree,
  session: workerSession(existing) ?? workerSession(incoming) ?? null,
  footprint: [...new Set([...toArray(existing.footprint), ...toArray(incoming.footprint)])],
  occupiesWorkerSlot:
    existing.occupiesWorkerSlot !== false || incoming.occupiesWorkerSlot !== false,
  source:
    sameValue(existing.worktree, incoming.worktree) && existing.source
      ? existing.source
      : [...new Set([existing.source, incoming.source].filter(Boolean))].join("+"),
});

const isDependencyBotPr = (pr) => {
  if (pr?.isDependencyBot === true) return true;
  const login = normalize(pr?.author?.login ?? pr?.author ?? pr?.authorLogin);
  return login.includes("dependabot") || login.includes("renovate");
};

const isOpenProductPr = (pr) =>
  !isDependencyBotPr(pr) &&
  pr?.open !== false &&
  pr?.closed !== true &&
  pr?.merged !== true &&
  !pr?.mergedAt &&
  !["closed", "merged"].includes(normalize(pr?.state ?? pr?.status));

const isActiveLinearClaim = (issue) => {
  const stateType = normalize(issue?.stateType ?? issue?.state?.type);
  if (["completed", "canceled", "duplicate"].includes(stateType)) return false;
  return hasActiveClaim(issue);
};

const isStartedLinearIssue = (issue) =>
  normalize(issue?.stateType ?? issue?.state?.type) === "started";

const isUnmergedWorktree = (worktree) =>
  worktree?.dirty === true ||
  (worktree?.completedByMergedPr !== true && worktree?.mergedIntoBaseline !== true);

export function reconcileActiveDelivery({
  snapshot = {},
  state = {},
  pullRequests = [],
  issuesForPrMetadata = [],
}) {
  const reconciledPullRequests = pullRequests.map((pr) => ({
    ...pr,
    footprint: toArray(pr.footprint),
  }));
  const dispatches = [];
  const matchingPrIndex = (item) =>
    reconciledPullRequests.findIndex((pr) => isOpenProductPr(pr) && itemsMatch(item, pr));
  const addDispatch = (dispatch) => {
    const prIndex = matchingPrIndex(dispatch);
    if (prIndex >= 0) {
      const pr = reconciledPullRequests[prIndex];
      reconciledPullRequests[prIndex] = {
        ...pr,
        footprint: [...new Set([...toArray(pr.footprint), ...toArray(dispatch.footprint)])],
      };
      return;
    }
    const matchingIndex = dispatches.findIndex((current) => itemsMatch(dispatch, current));
    if (matchingIndex >= 0) {
      dispatches[matchingIndex] = mergeDispatches(dispatches[matchingIndex], dispatch);
      return;
    }
    dispatches.push(dispatch);
  };

  for (const dispatch of [...toArray(state.dispatches), ...toArray(state.ledgerDispatches)].filter(
    isLiveDispatch,
  )) {
    addDispatch({
      ...dispatch,
      occupiesWorkerSlot: dispatch.occupiesWorkerSlot !== false,
      source: dispatch.source ?? "ledger",
    });
  }
  for (const activeWork of toArray(state.activeWork).filter(isLiveDispatch)) {
    addDispatch({
      ...activeWork,
      occupiesWorkerSlot: activeWork.occupiesWorkerSlot !== false,
      source: activeWork.source ?? "local-active-work",
    });
  }

  const linearIssues = [
    ...toArray(snapshot.linear?.activeIssues),
    ...toArray(state.activeLinearIssues),
    ...toArray(snapshot.linear?.issues),
    ...toArray(state.tickets ?? state.linearIssues),
    ...toArray(state.startableTickets),
  ];
  const activeLinearIssues = linearIssues.filter(
    (issue) => isActiveLinearClaim(issue) || isStartedLinearIssue(issue),
  );
  const worktrees = [...toArray(snapshot.worktrees), ...toArray(state.worktrees)].filter(
    (worktree) => worktree?.prunable !== true,
  );

  for (const issue of activeLinearIssues) {
    const identifier = issueIdentifier(issue);
    if (!identifier) continue;
    const worktree = worktrees.find((candidate) => itemMentionsIssue(candidate, identifier));
    addDispatch({
      id: identifier,
      issueId: identifier,
      state: "running",
      occupiesWorkerSlot: isActiveLinearClaim(issue),
      source: `${isActiveLinearClaim(issue) ? "linear-active-claim" : "linear-started-reservation"}${worktree ? "+local-worktree" : ""}`,
      session: workerSession(issue) ?? null,
      branch: worktree?.branch ?? null,
      headSha: worktree?.headSha ?? null,
      worktree: worktree?.path ?? null,
      footprint: toArray(issue.footprint),
    });
  }

  const issueById = new Map(
    linearIssues
      .map((issue) => [issueIdentifier(issue), issue])
      .filter(([identifier]) => identifier),
  );
  const issueLabelsById = new Map();
  for (const issue of [...linearIssues, ...toArray(issuesForPrMetadata)]) {
    const identifier = issueIdentifier(issue);
    if (identifier)
      issueLabelsById.set(identifier, [
        ...toArray(issueLabelsById.get(identifier)),
        ...toArray(issue.labels),
      ]);
  }
  for (const pr of reconciledPullRequests) {
    const labels = issueLabelsById.get(issueIdentifier(pr));
    if (labels) {
      pr.issueLabels = [...new Set([...toArray(pr.issueLabels), ...labels])];
    }
  }
  for (const worktree of worktrees) {
    if (
      (worktree.branch && normalize(worktree.branch) === normalize(snapshot.baseline?.branch)) ||
      !isUnmergedWorktree(worktree)
    ) {
      continue;
    }
    const identifier = issueIdentifier(worktree);
    const issue = issueById.get(identifier);
    addDispatch({
      id: identifier ?? worktree.branch ?? worktree.path ?? worktree.headSha,
      issueId: identifier ?? null,
      state: "running",
      occupiesWorkerSlot: false,
      source: "local-worktree-unmerged",
      branch: worktree.branch ?? null,
      headSha: worktree.headSha ?? null,
      worktree: worktree.path ?? null,
      footprint: toArray(issue?.footprint),
    });
  }

  return {
    dispatches,
    pullRequests: reconciledPullRequests,
  };
}

export const deriveActiveDispatches = (input) => reconcileActiveDelivery(input).dispatches;

export const issuesWithDeliveryEvidence = (issues, { pullRequests = [], dispatches = [] } = {}) =>
  toArray(issues).map((issue) => {
    const identifiers = [issueIdentifier(issue), issue?.id, issue?.key].filter(Boolean);
    const matchesIssue = (item) =>
      identifiers.some((identifier) => itemMentionsIssue(item, String(identifier))) ||
      itemsMatch(issue, item);
    return {
      ...issue,
      activeClaim:
        isActiveLinearClaim(issue) ||
        dispatches.some((item) => isLiveDispatch(item) && matchesIssue(item)),
      openPr:
        hasOpenPr(issue) || pullRequests.some((pr) => isOpenProductPr(pr) && matchesIssue(pr)),
    };
  });
