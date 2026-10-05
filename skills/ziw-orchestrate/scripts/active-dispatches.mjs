import { hasActiveClaim, hasOpenPr } from "./linear-dag-start.mjs";
import {
  issueIdentityIndex,
  issueIdentifier,
  itemMentionsIssue,
  sameValue,
} from "./delivery-identity.mjs";

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

export const completedByMergedPullRequest = (worktree, mergedPullRequests = []) =>
  mergedPullRequests.some((pr) => {
    const sameHead = sameValue(worktree?.headSha, pr?.headSha ?? pr?.headRefOid);
    if (worktree?.headSha && (pr?.headSha || pr?.headRefOid)) return sameHead;
    return sameValue(worktree?.branch, pr?.headRefName ?? pr?.branch);
  });

const itemsMatch = (left, right, knownIds = issueIdentityIndex([], [left, right])) => {
  const leftIssue = issueIdentifier(left, knownIds);
  const rightIssue = issueIdentifier(right, knownIds);
  const leftSession = workerSession(left);
  const rightSession = workerSession(right);
  if (leftIssue && rightIssue && leftIssue !== rightIssue) return false;
  if (leftSession && rightSession && !sameValue(leftSession, rightSession)) return false;
  return (
    sameValue(leftSession, rightSession) ||
    (leftIssue && itemMentionsIssue(right, leftIssue, knownIds)) ||
    (rightIssue && itemMentionsIssue(left, rightIssue, knownIds)) ||
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
  const linearIssues = [
    ...toArray(snapshot.linear?.activeIssues),
    ...toArray(state.activeLinearIssues),
    ...toArray(snapshot.linear?.issues),
    ...toArray(state.tickets ?? state.linearIssues),
    ...toArray(state.startableTickets),
  ];
  const knownIds = issueIdentityIndex(
    [...linearIssues, ...toArray(issuesForPrMetadata)],
    [
      ...toArray(state.dispatches),
      ...toArray(state.ledgerDispatches),
      ...toArray(state.activeWork),
      ...pullRequests,
    ],
  );
  const reconciledPullRequests = pullRequests.map((pr) => ({
    ...pr,
    ...(issueIdentifier(pr, knownIds) ? { issueId: issueIdentifier(pr, knownIds) } : {}),
    footprint: toArray(pr.footprint),
  }));
  const dispatches = [];
  const matchingPrIndex = (item) =>
    reconciledPullRequests.findIndex((pr) => isOpenProductPr(pr) && itemsMatch(item, pr, knownIds));
  const addDispatch = (dispatch) => {
    dispatch = {
      ...dispatch,
      issueId: issueIdentifier(dispatch, knownIds) ?? dispatch.issueId ?? null,
    };
    const prIndex = matchingPrIndex(dispatch);
    if (prIndex >= 0) {
      const pr = reconciledPullRequests[prIndex];
      reconciledPullRequests[prIndex] = {
        ...pr,
        footprint: [...new Set([...toArray(pr.footprint), ...toArray(dispatch.footprint)])],
      };
      return;
    }
    const matchingIndex = dispatches.findIndex((current) =>
      itemsMatch(dispatch, current, knownIds),
    );
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

  const activeLinearIssues = linearIssues.filter(
    (issue) => isActiveLinearClaim(issue) || isStartedLinearIssue(issue),
  );
  const worktrees = [...toArray(snapshot.worktrees), ...toArray(state.worktrees)].filter(
    (worktree) => worktree?.prunable !== true,
  );

  for (const issue of activeLinearIssues) {
    const identifier = issueIdentifier(issue, knownIds);
    if (!identifier) continue;
    const worktree = worktrees.find((candidate) =>
      itemMentionsIssue(candidate, identifier, knownIds),
    );
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
    const identifier = issueIdentifier(issue, knownIds);
    if (identifier)
      issueLabelsById.set(identifier, [
        ...toArray(issueLabelsById.get(identifier)),
        ...toArray(issue.labels),
      ]);
  }
  for (const pr of reconciledPullRequests) {
    const matched = [...issueLabelsById].filter(([identifier]) =>
      itemMentionsIssue(pr, identifier, knownIds),
    );
    const labels = matched.flatMap(([, labels]) => labels);
    if (matched.length > 1 && normalize(pr.riskTier ?? pr.tier) !== "high") pr.riskTier = "medium";
    if (labels.length > 0) {
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
    const matchedIssues = [...issueById].filter(([identifier]) =>
      itemMentionsIssue(worktree, identifier, knownIds),
    );
    const identifier =
      issueIdentifier(worktree, knownIds) ??
      (matchedIssues.length === 1 ? matchedIssues[0][0] : null);
    const issue = issueById.get(identifier);
    addDispatch({
      id: identifier ?? `worktree:${worktree.path ?? worktree.branch ?? worktree.headSha}`,
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

export const issuesWithDeliveryEvidence = (issues, { pullRequests = [], dispatches = [] } = {}) => {
  const knownIds = issueIdentityIndex(toArray(issues), [...pullRequests, ...dispatches]);
  return toArray(issues).map((issue) => {
    const identifiers = [issueIdentifier(issue), issue?.id, issue?.key].filter(Boolean);
    const matchesIssue = (item) =>
      identifiers.some((identifier) => itemMentionsIssue(item, String(identifier), knownIds)) ||
      itemsMatch(issue, item, knownIds);
    return {
      ...issue,
      activeClaim:
        isActiveLinearClaim(issue) ||
        dispatches.some((item) => isLiveDispatch(item) && matchesIssue(item)),
      openPr:
        hasOpenPr(issue) || pullRequests.some((pr) => isOpenProductPr(pr) && matchesIssue(pr)),
    };
  });
};
