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
export function commandObservation(command, values, positionals, state) {
  if (command === "init") return {};
  if (command === "record") {
    if (positionals.length !== 1) throw new Error("record needs one observation file or -");
    return parseJson(
      readFileSync(positionals[0] === "-" ? 0 : positionals[0], "utf8"),
      "observation",
    );
  }
  const identity = {
    ...(values.session ? { sessionId: values.session } : {}),
    ...(values.receipt ? { receiptId: values.receipt } : {}),
  };
  if (!identity.sessionId && !identity.receiptId)
    throw new Error(`${command} needs --session or --receipt`);
  if (command === "worker") {
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
          ...supplied(values, ["branch", "footprint", "status"]),
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
