import { isDeepStrictEqual } from "node:util";
import { validateLegacyState, validateOldCanonicalState } from "./state-migration-validator.mjs";
import { convertLegacyRecord, legacyIssueReference } from "./state-migration-records.mjs";
import { LAYERED_ALIASES, conformanceVerdict, translateFields } from "./state-migration-fields.mjs";
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
  const reviewLayers = [];
  const translate = (record, kind, location) => {
    return translateFields(record, kind, location);
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
        reviewLayers.push({ number: next.number, rank: 0, location, record });
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
        // beb146d read reviewEvidence only when reviewEvidenceByPr was absent.
        if (
          name === "hostedReviewByPr" ||
          name === (state.reviewEvidenceByPr ? "reviewEvidenceByPr" : "reviewEvidence")
        )
          reviewLayers.push({
            number,
            rank: name === "hostedReviewByPr" ? 1 : 2,
            location: `state/${name}/${key}`,
            record: state[name][key],
          });
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
  // beb146d ranked a saved PR's reviewRelevantDiffFingerprint after the merged
  // reviewDiffFingerprint but before reviewDiffByPr, the slot v3 still reads. Later
  // duplicate PR records overwrite earlier ones, null included, as its merge did.
  const fallbacks = new Map();
  for (const pr of prs) {
    delete pr.legacyPrAliases;
    if ("reviewRelevantDiffFingerprint" in pr)
      fallbacks.set(pr.number, pr.reviewRelevantDiffFingerprint);
    delete pr.reviewRelevantDiffFingerprint;
  }
  for (const [number, fallback] of fallbacks)
    if (fallback != null) result.reviewDiffByPr = { ...result.reviewDiffByPr, [number]: fallback };
  errors.push(...layeredAliasConflicts(reviewLayers));
  errors.push(...conformanceRefusals(reviewLayers));
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

// beb146d layered saved PR, hosted and evidence records in that rank order. A promoted
// alias would outrank canonical values from other layers, and dropping an unrecognized
// verdict would expose a lower layer's verdict that beb146d hid.
function layeredAliasConflicts(layers) {
  const errors = [];
  for (const [number, records] of layersByPr(layers)) {
    for (const [canonical, aliases, convert = (value) => value] of LAYERED_ALIASES) {
      const names = [canonical, ...aliases];
      const setters = records.filter(({ record }) => names.some((name) => name in record));
      const values = setters.map(({ record }) => {
        const name = names.find((field) => record[field] != null);
        return name == null ? null : convert(record[name]);
      });
      const usesAlias = setters.some(({ record }) => aliases.some((name) => name in record));
      const exposesVerdict =
        canonical === "reviewVerdict" &&
        values.at(-1) === null &&
        values.some((value) => value !== null);
      if (
        usesAlias ? values.every((value) => isDeepStrictEqual(value, values[0])) : !exposesVerdict
      )
        continue;
      const ranked = usesAlias
        ? `the alias ${aliases.join(" or ")} below the canonical field`
        : `the unrecognized verdict in ${setters.at(-1).location} above the others, and v3 drops it`;
      errors.push(
        `PR ${number}: ${setters.map(({ location }) => location).join(", ")} disagree on ${canonical}; beb146d ranked ${ranked}. Write the value beb146d used as ${canonical} in each record, or delete the stale one`,
      );
    }
  }
  return errors;
}

function layersByPr(layers) {
  const byPr = new Map();
  for (const layer of layers) byPr.set(layer.number, [...(byPr.get(layer.number) ?? []), layer]);
  for (const records of byPr.values()) records.sort((left, right) => left.rank - right.rank);
  return byPr;
}

const CONFORMANCE_FIELDS = ["conformance", "conformanceVerdict", "conformanceHeadSha"];

// beb146d spread saved PR records (later duplicates winning), then hosted, then evidence
// records field by field, and gated merge on the result by PR head, live review coverage and
// requireConformanceEvidence. v3 has no conformance gate, so only a merged PASS without a
// head, which never gated anything, drops; every other merged verdict refuses.
function conformanceRefusals(layers) {
  const errors = [];
  for (const records of layersByPr(layers).values()) {
    const setters = records.filter(({ record }) =>
      CONFORMANCE_FIELDS.some((name) => name in record),
    );
    const merged = Object.assign(
      {},
      ...setters.map(({ record }) =>
        Object.fromEntries(
          CONFORMANCE_FIELDS.filter((name) => name in record).map((name) => [name, record[name]]),
        ),
      ),
    );
    const verdict = conformanceVerdict(merged);
    if (!verdict || (verdict === "pass" && merged.conformanceHeadSha == null)) continue;
    errors.push(
      `${setters.map(({ location }) => `${location}/conformance`).join(", ")}: beb146d gated merge on this conformance by PR head, live review coverage and requireConformanceEvidence, which v3 cannot express. Delete the conformance fields if it no longer gates this PR; otherwise record its outcome as review evidence for the current head, or delete this PR's review evidence so the current head gets a fresh review`,
    );
  }
  return errors;
}
