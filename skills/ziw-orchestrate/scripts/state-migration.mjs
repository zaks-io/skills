import { isDeepStrictEqual } from "node:util";
import { validateLegacyState, validateOldCanonicalState } from "./state-migration-validator.mjs";
import { convertLegacyRecord, legacyIssueReference } from "./state-migration-records.mjs";
import { preserveConformanceFailures, translateFields } from "./state-migration-fields.mjs";
import { validateState } from "./planner-input-validator.mjs";
import { isLiveWorker } from "./worker-lifecycle.mjs";

const workers = ["dispatches", "ledgerDispatches", "workers", "activeWork"];
const sources = {
  dispatches: "ledger",
  ledgerDispatches: "ledger",
  workers: "worker-observation",
  activeWork: "local-active-work",
};
const kinds = {
  tickets: "issue",
  linearIssues: "issue",
  activeLinearIssues: "issue",
  startableTickets: "startable",
  pullRequests: "pr",
  worktrees: "worktree",
  previews: "preview",
};
const maps = {
  reviewEvidenceByPr: "evidence",
  reviewEvidence: "evidence",
  reviewRequestsByPr: "request",
  reviewRequestByPr: "request",
  hostedReviewByPr: "hosted",
  reviewDiffByPr: null,
  continuationByPr: null,
};

export function convertState(state) {
  const result = {};
  let scopeAlias;
  const errors = [];
  const conformanceFailures = [];
  const translate = (record, kind, location) => {
    const next = translateFields(record, kind, location);
    if (
      ["fail", "failed", "unverifiable"].includes(
        String(record.conformance ?? record.conformanceVerdict).toLowerCase(),
      )
    )
      conformanceFailures.push({ record: next, location });
    return next;
  };
  const attempt = (path, record, operation) => {
    try {
      return operation();
    } catch (error) {
      const metadata = Object.fromEntries(
        [
          "issueKey",
          "issueId",
          "identifier",
          "branch",
          "footprint",
          "fileFootprint",
          "files",
          "paths",
          "packages",
        ]
          .filter((name) => record?.[name] != null)
          .map((name) => [name, record[name]]),
      );
      errors.push(`${error.message} [${JSON.stringify(metadata)}]`);
      return null;
    }
  };
  const convert = (record, kind, location, canonical) =>
    attempt(location, record, () => {
      if (
        !canonical &&
        kind === "worker" &&
        record.id != null &&
        record.receiptId != null &&
        String(record.id).trim() !== record.receiptId
      )
        throw new Error(`${location}/id: conflicts with receiptId`);
      let next = canonical ? structuredClone(record) : convertLegacyRecord(record, kind, location);
      // Check conflicts on original aliases before the legacy adapter materializes its fallback fields.
      translateFields(record, kind, location);
      next = translate(next, kind, location);
      if (
        kind === "worker" &&
        isLiveWorker(next) &&
        next.occupiesWorkerSlot !== false &&
        !next.sessionId &&
        !next.receiptId
      )
        throw new Error(`${location}: anonymous live worker has no faithful v3 identity`);
      if (kind === "pr") {
        for (const name of ["sessionId", "receiptId", "prNumber"]) delete next[name];
      }
      if (kind === "worktree") {
        // beb146d reserved the named ticket through this reference; v3 worktrees
        // link tickets only by branch name, so dropping it would free the ticket.
        if (next.issueKey || next.issueUuid)
          throw new Error(
            `${location}: worktree reserves ${next.issueKey ?? next.issueUuid} by issue reference, which v3 worktrees cannot express; delete the entry (ticks collect live worktrees) and record any running worker with planner-state worker`,
          );
        // beb146d reset session and receipt IDs on worktree reservations, so they carry no meaning.
        for (const name of ["receiptId", "sessionId"]) delete next[name];
      }
      return next;
    });
  for (const [name, value] of Object.entries(state)) {
    if (name === "v") continue;
    const checked =
      name === "pullRequests"
        ? value.map(({ sessionId, ...pr }) =>
            typeof sessionId === "string" && sessionId.trim() ? { ...pr, sessionId } : pr,
          )
        : value;
    const canonical = validateOldCanonicalState({ [name]: checked });
    if (!canonical && !validateLegacyState({ [name]: value })) {
      errors.push(`state/${name}: invalid historical state field`);
      continue;
    }
    if (workers.includes(name)) {
      result[name] = value
        .map((record, index) => {
          const location = `state/${name}/${index}`;
          const next = convert(
            record,
            "worker",
            location,
            canonical || validateOldCanonicalState({ [name]: [record] }),
          );
          return next && { ...next, source: next.source ?? sources[name] };
        })
        .filter(Boolean);
    } else if (kinds[name])
      result[name] = checked
        .map((record, index) => convert(record, kinds[name], `state/${name}/${index}`, canonical))
        .filter(Boolean);
    else if (name === "scopeIssueIds")
      scopeAlias = value
        .map((record, index) =>
          attempt(`state/${name}/${index}`, record, () =>
            legacyIssueReference(record, `state/${name}/${index}`),
          ),
        )
        .filter(Boolean);
    else if (name === "reviewEvidenceChecks")
      result[name] = value
        .map((record, index) => {
          const location = `state/${name}/${index}`;
          return attempt(location, record, () => {
            let next = record;
            if (!canonical) {
              const { pr, ticket, ...rest } = record;
              const number =
                pr == null
                  ? null
                  : (String(pr).match(/^(?:PR-)?([1-9]\d*)$/i)?.[1] ??
                    String(pr).match(/\/pull\/([1-9]\d*)/)?.[1]);
              if (pr != null && !number) throw new Error(`${location}/pr: unresolved PR reference`);
              next = {
                ...rest,
                ...(ticket != null ? legacyIssueReference(ticket, `${location}/ticket`) : {}),
                ...(number ? { prNumber: Number(number) } : {}),
              };
            }
            return translate(next, "check", location);
          });
        })
        .filter(Boolean);
    else if (name in maps && maps[name])
      result[name] = Object.fromEntries(
        Object.entries(value)
          .map(([key, record]) => [
            key,
            attempt(`state/${name}/${key}`, record, () =>
              translate(record, maps[name], `state/${name}/${key}`),
            ),
          ])
          .filter(([, record]) => record),
      );
    else result[name] = structuredClone(value);
  }
  if (state.scopeIssueIds && state.scopeIssues && !isDeepStrictEqual(scopeAlias, state.scopeIssues))
    errors.push("state/scopeIssueIds: conflicts with scopeIssues");
  if (scopeAlias) result.scopeIssues ??= scopeAlias;
  const prs = result.pullRequests ?? [];
  const aliases = new Map();
  for (const pr of prs)
    for (const alias of [
      pr.number,
      pr.url,
      pr.headSha,
      pr.headRefName,
      ...(pr.legacyPrAliases ?? []),
    ]) {
      if (alias == null) continue;
      const key = String(alias);
      aliases.set(key, aliases.has(key) && aliases.get(key) !== pr.number ? false : pr.number);
    }
  for (const name of Object.keys(maps)) {
    if (!result[name]) continue;
    const mapped = {};
    for (const [key, record] of Object.entries(result[name]))
      attempt(`state/${name}/${key}`, record, () => {
        const number = /^\d+$/.test(key) ? Number(key) : aliases.get(key);
        if (
          !Number.isSafeInteger(number) ||
          number < 1 ||
          (aliases.has(key) && aliases.get(key) !== number)
        )
          throw new Error(`state/${name}/${key}: PR alias is unknown or ambiguous`);
        if (mapped[number] && !isDeepStrictEqual(mapped[number], record))
          throw new Error(`state/${name}/${key}: contradictory evidence for PR ${number}`);
        mapped[number] = record;
      });
    result[name] = mapped;
  }
  for (const [alias, canonical] of [
    ["reviewEvidence", "reviewEvidenceByPr"],
    ["reviewRequestByPr", "reviewRequestsByPr"],
  ]) {
    if (result[alias] && result[canonical] && !isDeepStrictEqual(result[alias], result[canonical]))
      errors.push(
        `state/${alias}: mixed maps have caller-dependent semantics; reconcile with ${canonical}`,
      );
    if (result[alias]) result[canonical] ??= result[alias];
    delete result[alias];
  }
  // beb146d ranked a saved PR's reviewRelevantDiffFingerprint after the live and
  // saved reviewDiffFingerprint but before reviewDiffByPr, the slot v3 still reads.
  const fallbacks = {};
  for (const pr of prs) {
    delete pr.legacyPrAliases;
    const fallback = pr.reviewRelevantDiffFingerprint;
    delete pr.reviewRelevantDiffFingerprint;
    if (fallback == null || pr.reviewDiffFingerprint != null) continue;
    if (fallbacks[pr.number] != null && fallbacks[pr.number] !== fallback)
      errors.push(
        `state/pullRequests: conflicting reviewRelevantDiffFingerprint for PR ${pr.number}`,
      );
    fallbacks[pr.number] = fallback;
  }
  if (Object.keys(fallbacks).length)
    result.reviewDiffByPr = { ...result.reviewDiffByPr, ...fallbacks };
  preserveConformanceFailures(result, conformanceFailures, errors);
  const dispatches = workers.flatMap((name) => result[name] ?? []);
  for (const name of workers) delete result[name];
  if (workers.some((name) => state[name])) result.dispatches = dispatches;
  const converted = { ...result, v: 3 };
  if (!validateState(converted))
    for (const error of validateState.errors) {
      const location =
        `state${error.instancePath}/${error.params.additionalProperty ?? error.params.missingProperty ?? ""}`.replace(
          /\/$/,
          "",
        );
      const segments = error.instancePath.split("/").filter(Boolean);
      let record = converted;
      for (const segment of segments) record = record?.[segment];
      const metadata = Object.fromEntries(
        ["issueKey", "branch", "footprint"]
          .filter((name) => record?.[name] != null)
          .map((name) => [name, record[name]]),
      );
      errors.push(`${location}: ${error.message} [${JSON.stringify(metadata)}]`);
    }
  if (errors.length)
    throw new Error(
      `migration refused:\n${errors.join("\n")}\nFor each entry: recover its runtime identity (session or receipt ID) and add it to the record, or confirm the worker or review has ended and delete that entry. No state or backup was written.`,
    );
  return converted;
}
