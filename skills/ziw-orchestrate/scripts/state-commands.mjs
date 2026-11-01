import { readFileSync } from "node:fs";
import { parseJson } from "./state-file.mjs";

const positive = (value, name, zero = false) => {
  if (
    !/^\d+$/.test(value ?? "") ||
    !Number.isSafeInteger(Number(value)) ||
    Number(value) < (zero ? 0 : 1)
  )
    throw new Error(`${name} must be ${zero ? "a non-negative" : "a positive"} integer`);
  return Number(value);
};
const supplied = (values, fields) =>
  Object.fromEntries(fields.filter((key) => values[key] != null).map((key) => [key, values[key]]));
const required = (value, name) => {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${name} is required`);
  return value;
};
const issueReference = (value) =>
  /^[A-Za-z][A-Za-z0-9]*-\d+$/.test(value)
    ? { issueKey: value.toUpperCase() }
    : { issueUuid: value };
export function commandObservation(command, values, positionals, state) {
  if (command === "record") {
    if (positionals.length !== 1) throw new Error("record needs one observation file or -");
    return parseJson(
      readFileSync(positionals[0] === "-" ? 0 : positionals[0], "utf8"),
      "observation",
    );
  }
  // Planner actions render record commands with <sessionId>-style placeholders;
  // saving one verbatim would bind state to an identity no runtime can recover.
  for (const [name, value] of Object.entries(values))
    if ([value].flat().some((entry) => typeof entry === "string" && /^<.*>$/.test(entry)))
      throw new Error(
        `--${name} still holds the placeholder ${value}; use the runtime's ID or drop the flag`,
      );
  if (command === "init")
    return {
      ...(values.scope != null
        ? {
            scopeIssues:
              values.scope === "default"
                ? null
                : values.scope
                    .split(",")
                    .map((value) => issueReference(required(value.trim(), "scope issue"))),
          }
        : {}),
      ...(values["worker-cap"] != null
        ? {
            workerLimit:
              values["worker-cap"] === "default"
                ? null
                : positive(values["worker-cap"], "--worker-cap", true),
          }
        : {}),
    };
  if (command === "preparation")
    return {
      preparations: [
        {
          ...issueReference(required(values.issue, "--issue")),
          outcome: required(values.outcome, "--outcome"),
          reason: required(values.reason, "--reason"),
          updatedAt: required(values["updated-at"], "--updated-at"),
        },
      ],
    };
  if (command === "merge-result")
    return {
      mergeResultsByPr: {
        [positive(values.pr, "--pr")]: {
          ...issueReference(required(values.issue, "--issue")),
          headSha: required(values.head, "--head"),
          mergeCommitSha: required(values["merge-commit"], "--merge-commit"),
          postMergeCheck: required(values.check, "--check"),
          ...(values.check === "passed"
            ? { trackerUpdatedAt: required(values["tracker-updated-at"], "--tracker-updated-at") }
            : {}),
        },
      },
    };
  const identity = {
    ...(values.session ? { sessionId: values.session } : {}),
    ...(values.receipt ? { receiptId: values.receipt } : {}),
  };
  if (!identity.sessionId && !identity.receiptId)
    throw new Error(`${command} needs --session or --receipt`);
  if (command === "worker") {
    if (
      values["pr-url"] != null &&
      values["pr-url"] !== `https://github.com/${state.repo}/pull/${positive(values.pr, "--pr")}`
    )
      throw new Error("--pr-url must match this repository and --pr");
    if (values.status === "returned") {
      positive(values.pr, "--pr");
      required(values.head, "--head");
      required(values["pr-url"], "--pr-url");
    }
    const issue = values.issue
      ? /^[A-Za-z][A-Za-z0-9]*-\d+$/.test(values.issue)
        ? { issueKey: values.issue.toUpperCase() }
        : { issueUuid: values.issue }
      : {};
    return {
      dispatches: [
        {
          ...identity,
          ...issue,
          ...supplied(values, ["branch", "footprint", "status", "worktree"]),
          ...(values.head ? { headSha: values.head } : {}),
          ...(values["pr-url"] ? { prUrl: values["pr-url"] } : {}),
          ...(values.run ? { runId: values.run } : {}),
          ...(values.pr ? { prNumber: positive(values.pr, "--pr") } : {}),
        },
      ],
    };
  }
  const pr = positive(values.pr, "--pr");
  const request = state.reviewRequestsByPr?.[pr];
  if (command === "review-request")
    return {
      reviewRequestsByPr: {
        [pr]: {
          ...identity,
          status: values.status ?? "running",
          headSha: values.head ?? request?.headSha,
          reviewDiffFingerprint: values.fingerprint ?? request?.reviewDiffFingerprint,
        },
      },
    };
  if (command === "review-result") {
    // The recorder verifies both identities; copying coverage here keeps result binding inside the lock.
    return {
      reviewEvidenceByPr: {
        [pr]: {
          ...identity,
          reviewedHeadSha: request?.headSha,
          reviewedDiffFingerprint: request?.reviewDiffFingerprint,
          reviewVerdict: values.verdict,
          independentReviewCount: positive(values.count, "--count"),
        },
      },
    };
  }
  throw new Error(`unknown command: ${command}`);
}
