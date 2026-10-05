import { adaptLegacyPlannerInput } from "./legacy-planner-input.mjs";
import { buildIssueCatalog } from "./issue-catalog.mjs";
import { possibleIssueLinks } from "./delivery-identity.mjs";
import { isLiveWorker } from "./worker-lifecycle.mjs";

const array = (value) => (value == null ? [] : Array.isArray(value) ? value : [value]);
const terminal = (record) => !isLiveWorker(record);
const footprint = (record) =>
  [
    ...new Set([
      ...array(record.footprint),
      ...array(record.fileFootprint),
      ...array(record.files),
      ...array(record.paths),
      ...array(record.packages),
    ]),
  ].sort();

const identityNames = new Map(
  [
    "issueKey",
    "issueUuid",
    "sessionId",
    "receiptId",
    "prNumber",
    "previewId",
    "linkedIssues",
    "scopeIssues",
    "candidateIssues",
  ].map((name) => [name.toLowerCase(), name]),
);
export function assertIdentityFieldNames(value, path = "input") {
  if (value == null || typeof value !== "object") return;
  for (const [name, child] of Object.entries(value)) {
    const canonical = identityNames.get(name.toLowerCase());
    if (canonical && canonical !== name)
      throw new Error(`${path}/${name}: identity field must be named ${canonical}`);
    assertIdentityFieldNames(child, `${path}/${name}`);
  }
}

function normalizePrMaps(state, prs, legacy, legacyFields) {
  const aliases = new Map();
  const register = (value, number) => {
    if (value == null) return;
    const alias = String(value);
    const prior = aliases.get(alias);
    aliases.set(alias, prior === false || (prior != null && prior !== number) ? false : number);
  };
  for (const pr of prs) {
    for (const value of [
      pr.number,
      pr.url,
      ...(legacy || legacyFields.size
        ? [pr.headSha, pr.headRefName, ...array(pr.legacyPrAliases)]
        : []),
    ])
      register(value, pr.number);
  }
  const result = { ...state };
  for (const name of [
    "reviewEvidenceByPr",
    "reviewEvidence",
    "hostedReviewByPr",
    "reviewRequestsByPr",
    "reviewRequestByPr",
    "reviewDiffByPr",
    "continuationByPr",
  ]) {
    if (state[name] == null) continue;
    const mapped = {};
    for (const [alias, evidence] of Object.entries(state[name])) {
      const number = /^\d+$/.test(alias)
        ? Number(alias)
        : legacy || legacyFields.has(name)
          ? aliases.get(alias)
          : null;
      if (!Number.isInteger(number) || number < 1)
        throw new Error(`state/${name}: PR reference is unknown or ambiguous; supply PR number`);
      if (mapped[number] && JSON.stringify(mapped[number]) !== JSON.stringify(evidence))
        throw new Error(`state/${name}: contradictory evidence for one PR`);
      mapped[number] = evidence;
    }
    result[name] = mapped;
  }
  return result;
}

export function normalizePlannerModel({
  snapshot = {},
  state = {},
  legacyStateFields = [],
  legacyPrMapFields = [],
} = {}) {
  assertIdentityFieldNames(snapshot, "snapshot");
  assertIdentityFieldNames(state, "state");
  const version = snapshot.v ?? 2;
  if (![1, 2, 3].includes(version))
    throw new Error("snapshot/v: unsupported identity contract version");
  const legacy = version !== 3;
  if (legacy) ({ snapshot, state } = adaptLegacyPlannerInput(snapshot, state));
  const records = [];
  const collect = (values, path) =>
    array(values).forEach((record, index) => {
      records.push({ record, path: `${path}/${index}` });
      for (const [position, dependency] of array(record.blockedBy).entries())
        records.push({ record: dependency, path: `${path}/${index}/blockedBy/${position}` });
    });
  for (const name of ["issues", "activeIssues", "issueMetadata"])
    collect(snapshot.linear?.[name], `snapshot/linear/${name}`);
  for (const name of ["tickets", "linearIssues", "activeLinearIssues", "startableTickets"])
    collect(state[name], `state/${name}`);
  const catalog = buildIssueCatalog(records);
  const diagnostics = [...array(snapshot.linear?.identityDiagnostics)];
  const normalize = (record, path, kind) => {
    const {
      issueKey: _issueKey,
      issueUuid: _issueUuid,
      linkedIssues: _linkedIssues,
      blockedBy: _blockedBy,
      ...metadata
    } = record;
    const resolved = catalog.resolve(record, path);
    const normalized = {
      ...metadata,
      issueRef: resolved.issueRef ?? null,
      issueKey: resolved.issueKey,
      issueUuid: resolved.issueUuid,
      footprint: footprint(record),
      ...(kind === "issue"
        ? {
            activeClaim: Boolean(record.activeClaim || record.claimed || record.delegated),
            blockedByRefs: [
              ...new Set(
                array(record.blockedBy)
                  .filter((dependency) => !["completed", "canceled"].includes(dependency.stateType))
                  .map(
                    (dependency, index) =>
                      catalog.resolve(dependency, `${path}/blockedBy/${index}`).issueRef,
                  ),
              ),
            ],
          }
        : {}),
    };
    const linked = array(record.linkedIssues).map((reference, index) => ({
      ...catalog.resolve(reference, `${path}/linkedIssues/${index}`),
      path: `${path}/linkedIssues/${index}`,
    }));
    normalized.issueRefs = [...new Set(linked.map((reference) => reference.issueRef))];
    normalized.possibleIssueRefs = possibleIssueLinks(normalized, catalog);
    if (kind === "worker") {
      const legacyWorker = legacy || legacyStateFields.includes(path.split("/")[1]);
      const statuses = [record.state, record.status].filter((value) => value != null);
      const explicitlyLive = statuses.some((value) =>
        ["running", "active", "started"].includes(String(value).trim().toLowerCase()),
      );
      if (
        !legacyWorker &&
        explicitlyLive &&
        (record.returned === true ||
          record.stopped === true ||
          statuses.some((value) => !isLiveWorker({ state: value })))
      )
        throw new Error(`${path}: contradictory worker lifecycle; refresh provider status`);
      const live = !terminal(record) && record.occupiesWorkerSlot !== false;
      if (!legacyWorker && live && !record.sessionId && !record.receiptId)
        throw new Error(`${path}: live worker needs explicit sessionId or receiptId`);
      normalized.workerRef = record.sessionId
        ? `session:${record.sessionId}`
        : record.receiptId
          ? `receipt:${record.receiptId}`
          : live
            ? `observation:${path}`
            : null;
    }
    if (kind === "issue" && (record.sessionId || record.receiptId))
      normalized.workerRef = record.sessionId
        ? `session:${record.sessionId}`
        : `receipt:${record.receiptId}`;
    if (
      ((kind === "worker" && !terminal(record)) || kind === "pr") &&
      resolved.unresolvedUuid &&
      catalog.hasPartialAliases
    )
      diagnostics.push({
        code: "ISSUE_ALIAS_REQUIRED",
        path,
        issueUuid: resolved.issueUuid,
        blockingStarts: true,
      });
    if (kind === "pr" && catalog.hasPartialAliases)
      for (const reference of linked.filter((reference) => reference.unresolvedUuid))
        diagnostics.push({
          code: "ISSUE_ALIAS_REQUIRED",
          path: reference.path,
          issueUuid: reference.issueUuid,
          blockingStarts: true,
        });
    if (kind === "pr") {
      if (!Number.isInteger(record.number) || record.number < 1)
        throw new Error(`${path}: PR number required`);
      normalized.isDraft = Boolean(record.isDraft ?? record.draft ?? record.draftState === "draft");
      normalized.state = record.state ?? "open";
      normalized.open = record.open ?? true;
      normalized.headSha = record.headSha ?? record.headRefOid ?? record.currentPrHeadSha;
    }
    return normalized;
  };
  const map = (values, kind, path) =>
    array(values).map((record, index) => normalize(record, `${path}/${index}`, kind));
  const linear = { ...snapshot.linear };
  for (const name of ["issues", "activeIssues", "issueMetadata"])
    if (snapshot.linear?.[name] != null)
      linear[name] = map(snapshot.linear[name], "issue", `snapshot/linear/${name}`);
  if (snapshot.linear?.candidateIssues != null)
    linear.candidateIssueRefs = snapshot.linear.candidateIssues.map(
      (reference, index) =>
        catalog.resolve(reference, `snapshot/linear/candidateIssues/${index}`).issueRef,
    );
  delete linear.candidateIssues;
  const normalizedState = { ...state };
  for (const name of ["tickets", "linearIssues", "activeLinearIssues", "startableTickets"])
    if (state[name] != null) normalizedState[name] = map(state[name], "issue", `state/${name}`);
  for (const name of ["dispatches", "ledgerDispatches", "activeWork", "workers"])
    if (state[name] != null) normalizedState[name] = map(state[name], "worker", `state/${name}`);
  for (const [name, kind] of [
    ["pullRequests", "pr"],
    ["worktrees", "worktree"],
    ["previews", "preview"],
  ])
    if (state[name] != null) normalizedState[name] = map(state[name], kind, `state/${name}`);
  if (state.scopeIssues != null)
    normalizedState.scopeIssueRefs = state.scopeIssues.map((reference, index) => {
      const resolved = catalog.resolve(reference, `state/scopeIssues/${index}`);
      if (!catalog.has(resolved.issueRef))
        diagnostics.push({
          code: "REQUESTED_ISSUE_UNKNOWN",
          path: `state/scopeIssues/${index}`,
          blockingStarts: true,
        });
      return resolved.issueRef;
    });
  delete normalizedState.scopeIssues;
  if (state.reviewEvidenceChecks != null)
    normalizedState.reviewEvidenceChecks = state.reviewEvidenceChecks.map((record, index) =>
      normalize(record, `state/reviewEvidenceChecks/${index}`, "evidence"),
    );
  const normalizedSnapshot = {
    ...snapshot,
    v: 3,
    linear,
    prs: map(snapshot.prs, "pr", "snapshot/prs"),
    worktrees: map(snapshot.worktrees, "worktree", "snapshot/worktrees"),
  };
  const prs = [...normalizedSnapshot.prs, ...array(normalizedState.pullRequests)];
  const workerNames = ["dispatches", "ledgerDispatches", "activeWork", "workers"];
  for (const name of workerNames) {
    for (const [index, worker] of array(normalizedState[name]).entries()) {
      if (!worker.issueRef && worker.issueRefs.length === 0 && worker.prNumber != null) {
        const refs = [
          ...new Set(
            prs
              .filter((pr) => pr.number === worker.prNumber)
              .flatMap((pr) => [pr.issueRef, ...pr.issueRefs])
              .filter(Boolean),
          ),
        ];
        worker.issueRef = refs.length === 1 ? refs[0] : null;
        worker.issueRefs = refs;
        if (refs.length) worker.possibleIssueRefs = [];
      }
    }
  }
  const workers = workerNames.flatMap((name) => array(normalizedState[name])).filter(isLiveWorker);
  const claims = [
    ...array(normalizedSnapshot.linear?.issues),
    ...array(normalizedSnapshot.linear?.activeIssues),
    ...array(normalizedState.tickets),
    ...array(normalizedState.activeLinearIssues),
  ].filter(
    (issue) =>
      issue.activeClaim &&
      (issue.sessionId || issue.receiptId) &&
      !["completed", "canceled", "duplicate"].includes(issue.stateType ?? issue.state?.type),
  );
  let linked;
  do {
    linked = false;
    for (const worker of workers.filter((item) => !item.issueRef && item.issueRefs.length === 0)) {
      const peers = [...workers, ...claims].filter(
        (peer) =>
          (worker.sessionId && worker.sessionId === peer.sessionId) ||
          (worker.receiptId && worker.receiptId === peer.receiptId),
      );
      const refs = [
        ...new Set(peers.flatMap((peer) => [peer.issueRef, ...peer.issueRefs]).filter(Boolean)),
      ];
      if (refs.length) {
        worker.issueRef = refs.length === 1 ? refs[0] : null;
        worker.issueRefs = refs;
        worker.possibleIssueRefs = [];
        linked = true;
      }
    }
  } while (linked);
  for (const name of workerNames) {
    for (const [index, worker] of array(normalizedState[name]).entries()) {
      if (
        isLiveWorker(worker) &&
        worker.occupiesWorkerSlot !== false &&
        !worker.issueRef &&
        worker.issueRefs.length === 0 &&
        worker.possibleIssueRefs.length === 0
      )
        diagnostics.push({
          code: "WORKER_ISSUE_UNRESOLVED",
          path: `state/${name}/${index}`,
          blockingStarts: true,
        });
    }
  }
  return {
    snapshot: normalizedSnapshot,
    state: normalizePrMaps(normalizedState, prs, legacy, new Set(legacyPrMapFields)),
    diagnostics,
  };
}
