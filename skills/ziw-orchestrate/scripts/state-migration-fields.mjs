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
const reviewCount = (value) =>
  Array.isArray(value) ? value.length : typeof value === "number" ? value : value ? 1 : 0;
// beb146d spread saved PRs, hosted records, and evidence into one review state and
// read each alias only after its canonical field, from whichever layer set it.
export const LAYERED_ALIASES = [
  ["reviewedDiffFingerprint", ["reviewedReviewDiffFingerprint"]],
  ["reviewVerdict", ["codeReviewVerdict"], normalizedVerdict],
  ["hostedReviewDiffFingerprint", ["hostedReviewedDiffFingerprint"]],
  ["independentReviewCount", ["independentReviews"], reviewCount],
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
];
// beb146d only ORed these aliases into their flag, so a false alias changed nothing;
// promoting it would mask a true flag computed from live hosted reviews.
export const OR_FLAGS = new Set([
  "hostedReviewRequired",
  "hostedReviewComplete",
  "hostedReviewSkipped",
]);
export const inertOrAlias = (canonical, value) =>
  OR_FLAGS.has(canonical) && (value == null || value === false);
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
    if (kind === "request") {
      // beb146d's request coverage never read reviewedReviewDiffFingerprint.
      delete result.reviewedReviewDiffFingerprint;
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
      if (kind === "pr") {
        // beb146d read this fallback only after the live fingerprint, so it must not
        // become the saved PR's reviewDiffFingerprint; convertState moves it to reviewDiffByPr.
        const fallback = result.reviewRelevantDiffFingerprint;
        if (
          fallback != null &&
          result.reviewDiffFingerprint != null &&
          fallback !== result.reviewDiffFingerprint
        )
          throw new Error(
            `${path}/reviewRelevantDiffFingerprint: conflicts with reviewDiffFingerprint`,
          );
      } else delete result.reviewRelevantDiffFingerprint;
      delete result.currentReviewDiffFingerprint;
      delete result.reviewHeadSha;
    }
    // beb146d spread the fingerprint of a live hosted bot review before hosted records
    // and evidence, so this alias applied only without one. v3 has no such slot.
    if (
      (kind === "hosted" || kind === "evidence") &&
      result.hostedReviewDiffFingerprint == null &&
      result.hostedReviewedDiffFingerprint != null
    )
      throw new Error(
        `${path}/hostedReviewedDiffFingerprint: beb146d ranked it below a live hosted bot review, which v3 cannot express; delete it if the PR shows that review, or write it as hostedReviewDiffFingerprint to keep it authoritative`,
      );
    for (const [canonical, aliases, convert] of LAYERED_ALIASES) {
      for (const name of aliases) if (inertOrAlias(canonical, result[name])) delete result[name];
      rename(canonical, aliases, convert);
    }
    if (result.reviewVerdict === null) delete result.reviewVerdict;
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
    // convertState refuses conformance that gated a PR; requests and checks never read it.
    for (const name of ["conformance", "conformanceVerdict", "conformanceHeadSha"])
      delete result[name];
  }
  // These undeclared fields passed the old extensible record schema but canonical consumers ignored them.
  for (const name of ["workerSession", "agentSession", "assignedWorker"]) delete result[name];
  return result;
}

export const conformanceVerdict = (record) => {
  const verdict = String(record.conformance ?? record.conformanceVerdict ?? "")
    .trim()
    .toLowerCase();
  return verdict === "failed" ? "fail" : verdict || null;
};
