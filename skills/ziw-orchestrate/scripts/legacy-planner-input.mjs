import { validateCanonicalState } from "./planner-input-validator.mjs";

const array = (value) => (value == null ? [] : Array.isArray(value) ? value : [value]);
const text = (value) => String(value ?? "").trim();
const ticketKey = (value) => /^[A-Z][A-Z0-9]*-\d+$/i.test(text(value));
const uuid = (value) => /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(text(value));
const retired = new Set([
  "id",
  "identifier",
  "issueId",
  "ticket",
  "key",
  "session",
  "workerSession",
  "agentSession",
  "prId",
  "fileFootprint",
  "files",
  "paths",
  "packages",
  "blockers",
  "dependsOn",
  "dependencies",
]);
const retain = (record) =>
  Object.fromEntries(Object.entries(record).filter(([key]) => !retired.has(key)));
const linkedKey = (value) =>
  text(value).match(
    /^https:\/\/linear\.app\/[^/]+\/issue\/([A-Z][A-Z0-9]*-\d+)(?:[^a-z0-9]|$)/i,
  )?.[1];

const legacyPrNumber = (value, path) => {
  const match =
    text(value).match(/^([1-9]\d*)$/) ??
    text(value).match(/^PR-([1-9]\d*)$/i) ??
    text(value).match(/^https:\/\/github\.com\/[^/]+\/[^/]+\/pull\/([1-9]\d*)(?:$|[/?#])/);
  const number = match ? Number(match[1]) : NaN;
  if (!Number.isSafeInteger(number) || number < 1)
    throw new Error(
      `${path}: unresolved legacy PR target; supply PR number or exact GitHub PR URL`,
    );
  return number;
};

export function legacyIssueReference(record, path, { tracker = false } = {}) {
  if (typeof record === "string" || typeof record === "number") record = { identifier: record };
  const result = {};
  const values = [
    record?.issueKey,
    record?.issueUuid,
    record?.issueId,
    record?.identifier,
    record?.ticket,
    record?.key,
  ];
  if (tracker) values.push(record?.id);
  if (!values.some((value) => value != null)) values.push(linkedKey(record?.url));
  for (const value of values.filter((value) => value != null)) {
    const field = uuid(value) ? "issueUuid" : ticketKey(value) ? "issueKey" : null;
    if (!field)
      throw new Error(`${path}: unsupported legacy issue reference; supply issueKey or issueUuid`);
    const normalized = field === "issueKey" ? text(value).toUpperCase() : text(value).toLowerCase();
    if (result[field] && result[field] !== normalized)
      throw new Error(`${path}: conflicting dedicated issue references`);
    result[field] = normalized;
  }
  return result;
}

const footprint = (record) => [
  ...new Set([
    ...array(record.footprint),
    ...array(record.fileFootprint),
    ...array(record.files),
    ...array(record.paths),
    ...array(record.packages),
  ]),
];

export function convertLegacyRecord(record, kind, path) {
  const output = { ...retain(record), footprint: footprint(record) };
  if (kind === "issue" || kind === "startable") {
    Object.assign(output, legacyIssueReference(record, path, { tracker: true }));
    if (!output.issueKey && !output.issueUuid) throw new Error(`${path}: missing issue reference`);
    output.blockedBy = [
      ...new Set([
        ...array(record.blockedBy),
        ...array(record.blockers),
        ...array(record.dependsOn),
        ...array(record.dependencies),
      ]),
    ].map((dependency, index) => ({
      ...legacyIssueReference(dependency?.issue ?? dependency, `${path}/blockedBy/${index}`, {
        tracker: true,
      }),
      ...(dependency?.stateType || dependency?.state?.type
        ? { stateType: dependency.stateType ?? dependency.state.type }
        : {}),
    }));
    output.activeClaim = Boolean(
      record.activeClaim ||
      record.claimed ||
      record.delegated ||
      record.assignedWorker ||
      record.workerSession ||
      record.agentSession,
    );
    const session =
      record.sessionId ?? record.session ?? record.workerSession ?? record.agentSession;
    if (session) output.sessionId = text(session);
    return output;
  }
  if (kind === "worker" || kind === "pr") {
    Object.assign(output, legacyIssueReference(record, path));
    if (kind === "worker") {
      if (
        record.hasPr === true &&
        !["running", "active", "started"].includes(
          text(record.state ?? record.status).toLowerCase(),
        )
      )
        output.returned = true;
      if (record.id != null) output.receiptId = text(record.id);
      const session =
        record.sessionId ?? record.session ?? record.workerSession ?? record.agentSession;
      if (session) output.sessionId = text(session);
      if (record.prNumber != null || record.prId != null)
        output.prNumber = Number(record.prNumber ?? record.prId);
    } else {
      const number =
        record.number ??
        record.prNumber ??
        record.prId ??
        text(record.url).match(/\/pull\/(\d+)(?:$|[/?#])/)?.[1] ??
        text(record.id).match(/^(?:PR-)?(\d+)$/i)?.[1];
      if (!Number.isInteger(Number(number)) || Number(number) < 1)
        throw new Error(`${path}: missing PR number; refresh code-host evidence`);
      output.number = Number(number);
      output.legacyPrAliases = [record.id].filter((value) => value != null).map(text);
      output.headSha = record.headSha ?? record.headRefOid ?? record.currentPrHeadSha;
      output.isDraft = Boolean(
        record.isDraft ?? record.draft ?? text(record.draftState).toLowerCase() === "draft",
      );
      output.state = record.state ?? "open";
      output.open = record.open ?? true;
    }
  } else if (kind === "worktree") {
    Object.assign(output, legacyIssueReference(record, path));
    output.path = record.path ?? record.worktree;
    if (!output.path && !record.branch) throw new Error(`${path}: worktree needs path or branch`);
  } else if (kind === "preview") {
    Object.assign(output, legacyIssueReference(record, path));
    output.previewId = text(record.previewId ?? record.id ?? record.url ?? record.path);
    if (!output.previewId) throw new Error(`${path}: preview identity missing`);
    const number =
      record.prNumber ?? record.prId ?? text(record.prUrl).match(/\/pull\/(\d+)(?:$|[/?#])/)?.[1];
    if (number != null) {
      if (!Number.isInteger(Number(number)) || Number(number) < 1)
        throw new Error(`${path}: invalid legacy preview PR number`);
      output.prNumber = Number(number);
    }
  }
  return output;
}

export function adaptLegacyPlannerInput(snapshot = {}, state = {}) {
  const convert = (records, kind, path) =>
    array(records).map((record, index) => convertLegacyRecord(record, kind, `${path}/${index}`));
  const linear = snapshot.linear ?? {};
  const normalizedLinear = { ...linear };
  for (const name of ["issues", "activeIssues", "issueMetadata"])
    if (linear[name] != null)
      normalizedLinear[name] = convert(linear[name], "issue", `snapshot/linear/${name}`);
  if (linear.candidateIssueIds != null)
    normalizedLinear.candidateIssues = linear.candidateIssueIds.map((id, index) =>
      legacyIssueReference(id, `snapshot/linear/candidateIssueIds/${index}`),
    );
  delete normalizedLinear.candidateIssueIds;
  const normalizedState = { ...state };
  for (const name of ["tickets", "linearIssues", "activeLinearIssues"])
    if (state[name] != null) normalizedState[name] = convert(state[name], "issue", `state/${name}`);
  if (state.startableTickets != null)
    normalizedState.startableTickets = convert(
      state.startableTickets,
      "startable",
      "state/startableTickets",
    );
  for (const name of ["dispatches", "ledgerDispatches", "activeWork", "workers"])
    if (state[name] != null)
      normalizedState[name] = convert(state[name], "worker", `state/${name}`);
  for (const [name, kind] of [
    ["pullRequests", "pr"],
    ["worktrees", "worktree"],
    ["previews", "preview"],
  ])
    if (state[name] != null) normalizedState[name] = convert(state[name], kind, `state/${name}`);
  if (state.scopeIssueIds != null)
    normalizedState.scopeIssues = state.scopeIssueIds.map((id, index) =>
      legacyIssueReference(id, `state/scopeIssueIds/${index}`),
    );
  delete normalizedState.scopeIssueIds;
  if (state.reviewEvidenceChecks != null)
    normalizedState.reviewEvidenceChecks = state.reviewEvidenceChecks.map((record, index) => {
      const { pr: _pr, ...evidence } = retain(record);
      return {
        ...evidence,
        ...(record.ticket != null
          ? legacyIssueReference(record.ticket, `state/reviewEvidenceChecks/${index}/ticket`)
          : {}),
        ...(record.pr != null
          ? { prNumber: legacyPrNumber(record.pr, `state/reviewEvidenceChecks/${index}/pr`) }
          : {}),
      };
    });
  return {
    snapshot: {
      ...snapshot,
      linear: normalizedLinear,
      prs: convert(snapshot.prs, "pr", "snapshot/prs"),
      worktrees: convert(snapshot.worktrees, "worktree", "snapshot/worktrees"),
    },
    state: normalizedState,
  };
}

export function adaptExternalPlannerState(state) {
  const canonical = {};
  const legacy = {};
  const legacyWorkerPaths = [];
  for (const [name, value] of Object.entries(state)) {
    if (validateCanonicalState({ [name]: value })) {
      canonical[name] = value;
    } else if (["dispatches", "ledgerDispatches", "activeWork", "workers"].includes(name)) {
      canonical[name] = value.map((record, index) => {
        if (validateCanonicalState({ [name]: [record] })) return record;
        const path = `state/${name}/${index}`;
        legacyWorkerPaths.push(path);
        return convertLegacyRecord(record, "worker", path);
      });
    } else {
      legacy[name] = value;
    }
  }
  return {
    state: { ...adaptLegacyPlannerInput({}, legacy).state, ...canonical },
    legacyWorkerPaths,
  };
}
