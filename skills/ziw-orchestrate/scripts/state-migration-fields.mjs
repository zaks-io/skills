import { isDeepStrictEqual } from "node:util";

const array = (value) => (value == null ? [] : [value].flat());
const normalizedVerdict = (value) => {
  const verdict = String(value ?? "")
    .trim()
    .toLowerCase();
  if (["approve", "approved", "ready for pr", "ready to merge", "ready_to_merge"].includes(verdict))
    return "APPROVE";
  if (["needs revision", "do not merge"].includes(verdict)) return "NEEDS REVISION";
  return null;
};
export function translateFields(original, kind, path) {
  const result = structuredClone(original);
  const rename = (canonical, aliases, convert = (value) => value) => {
    const entries = [canonical, ...aliases]
      .filter((name) => result[name] != null)
      .map((name) => [name, convert(result[name])]);
    const conflict = entries.find(([, value]) => !isDeepStrictEqual(value, entries[0][1]));
    if (conflict) throw new Error(`${path}/${conflict[0]}: conflicts with ${canonical}`);
    if (entries.length) result[canonical] = entries[0][1];
    for (const name of aliases) delete result[name];
  };
  rename("footprint", ["fileFootprint", "files", "paths", "packages"], (value) =>
    [...new Set(array(value))].sort(),
  );
  rename("unlockCount", ["downstreamCount"]);
  rename("priority", ["objectiveRank"]);
  if (kind === "issue" || kind === "startable") {
    const claims = ["activeClaim", "claimed", "delegated"].filter((name) => result[name] != null);
    if (claims.some((name) => result[name] !== result[claims[0]]))
      throw new Error(`${path}/activeClaim: conflicting claim aliases`);
    if (claims.length) result.activeClaim = claims.some((name) => result[name]);
    delete result.claimed;
    delete result.delegated;
    for (const name of ["blockers", "dependsOn", "dependencies"]) delete result[name];
  }
  if (kind === "worker") delete result.hasPr;
  if (kind === "pr") {
    const numbers = ["number", "prNumber", "prId", "id", "url"].flatMap((name) => {
      const match =
        String(original[name] ?? "").match(/^(?:PR-)?([1-9]\d*)$/i) ??
        String(original[name] ?? "").match(
          /^https:\/\/github\.com\/[^/]+\/[^/]+\/pull\/([1-9]\d*)(?:$|[/?#])/,
        );
      return match ? [[name, Number(match[1])]] : [];
    });
    const conflict = numbers.find(([, number]) => number !== numbers[0][1]);
    if (conflict) throw new Error(`${path}/${conflict[0]}: conflicting PR identity`);
    rename("headSha", ["headRefOid", "currentPrHeadSha"]);
    rename("isDraft", ["draft"]);
  }
  if (kind === "worktree") rename("path", ["worktree"]);
  const evidence = ["pr", "evidence", "request", "hosted", "check"].includes(kind);
  if (evidence) {
    rename("reviewedDiffFingerprint", ["reviewedReviewDiffFingerprint"]);
    if (kind === "request") {
      rename("reviewDiffFingerprint", ["reviewRelevantDiffFingerprint", "reviewedDiffFingerprint"]);
      rename("headSha", ["reviewHeadSha"]);
      delete result.currentReviewDiffFingerprint;
    } else if (kind === "check") {
      rename("reviewDiffFingerprint", [
        "currentReviewDiffFingerprint",
        "reviewRelevantDiffFingerprint",
      ]);
      delete result.codeReviewVerdict;
      delete result.reviewHeadSha;
    } else {
      // Live PR facts override saved current fingerprints before any gate reads them.
      if (kind === "pr") rename("reviewDiffFingerprint", ["reviewRelevantDiffFingerprint"]);
      delete result.currentReviewDiffFingerprint;
      delete result.reviewRelevantDiffFingerprint;
      delete result.reviewHeadSha;
    }
    rename("reviewVerdict", ["codeReviewVerdict"], normalizedVerdict);
    if (result.reviewVerdict === null) delete result.reviewVerdict;
    rename("hostedReviewDiffFingerprint", ["hostedReviewedDiffFingerprint"]);
    rename("independentReviewCount", ["independentReviews"], (value) =>
      Array.isArray(value) ? value.length : typeof value === "number" ? value : value ? 1 : 0,
    );
    for (const [canonical, aliases] of [
      ["hostedReviewRequired", ["codeRabbitRequired"]],
      ["hostedReviewComplete", ["codeRabbitComplete"]],
      ["hostedReviewSkipped", ["codeRabbitSkipped"]],
      ["autoReviewMode", ["autoReview"]],
      ["hostedReviewProvider", ["reviewProvider", "provider"]],
      ["riskTier", ["tier"]],
      ["scopeMatches", ["diffMatchesScope"]],
      ["humanMergePrLabel", ["humanReviewPrLabel"]],
      [
        "humanMergePrLabelApplied",
        ["humanReviewPrLabelApplied", "hasHumanMergePrLabel", "hasHumanReviewPrLabel"],
      ],
      ["prLabels", ["pullRequestLabels"]],
    ])
      rename(canonical, aliases);
    if (kind === "check") {
      rename("requiredChecksPassed", [
        "requiredChecksGreen",
        "checksPassing",
        "checksGreen",
        "ciGreen",
      ]);
      // reviewEvidenceDecision reads evidenceLabel, but never reviewEvidenceLabel.
      rename("hasReviewEvidence", ["evidenceLabel"], Boolean);
    }
    for (const name of [
      "requiredChecksGreen",
      "checksPassing",
      "checksGreen",
      "ciGreen",
      "reviewEvidenceLabel",
      "evidenceLabel",
    ])
      delete result[name];
    const conformance = original.conformance ?? original.conformanceVerdict;
    if (
      original.conformance &&
      original.conformanceVerdict &&
      original.conformance.toLowerCase() !== original.conformanceVerdict.toLowerCase()
    )
      throw new Error(`${path}/conformance: conflicting verdicts`);
    if (["fail", "failed", "unverifiable"].includes(String(conformance).toLowerCase())) {
      const head = original.conformanceHeadSha ?? original.reviewedHeadSha;
      if (!head) throw new Error(`${path}/conformance: blocking conformance has no reviewed head`);
      // The conformance verdict is tied to its head, not an older local review fingerprint.
      delete result.reviewedDiffFingerprint;
      result.reviewedHeadSha = head;
      result.reviewVerdict = "NEEDS REVISION";
      result.blockingFindings = true;
      result.reviewEvidenceCurrent = false;
    }
    for (const name of ["conformance", "conformanceVerdict", "conformanceHeadSha"])
      delete result[name];
  }
  // These undeclared fields passed the old extensible record schema but canonical consumers ignored them.
  for (const name of ["workerSession", "agentSession", "assignedWorker"]) delete result[name];
  return result;
}

export function preserveConformanceFailures(state, failures, errors) {
  const heads = new Map();
  for (const { record, location } of failures) {
    const number =
      record.number ??
      record.prNumber ??
      ["reviewEvidenceByPr", "hostedReviewByPr", "reviewRequestsByPr"]
        .flatMap((name) => Object.entries(state[name] ?? {}))
        .find(([, value]) => value === record)?.[0];
    if (!number) {
      errors.push(`${location}/conformance: blocking conformance needs an explicit PR number`);
      continue;
    }
    const head = record.reviewedHeadSha;
    if (heads.has(String(number)) && heads.get(String(number)) !== head)
      errors.push(`${location}/conformance: contradictory blocking heads for PR ${number}`);
    heads.set(String(number), head);
    // Put the verdict last in the planner's PR/hosted/local merge so a clean copy cannot erase it.
    const evidence = (state.reviewEvidenceByPr ??= {})[number] ?? {};
    delete evidence.reviewedDiffFingerprint;
    state.reviewEvidenceByPr[number] = {
      ...evidence,
      reviewedHeadSha: head,
      reviewVerdict: "NEEDS REVISION",
      blockingFindings: true,
      reviewEvidenceCurrent: false,
    };
  }
}
