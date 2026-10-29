import { isDeepStrictEqual } from "node:util";

const nonempty = (value) => typeof value === "string" && value.trim().length > 0;
const hasIdentity = (value) => Boolean(value?.sessionId || value?.receiptId);
const overlaps = (left, right) =>
  ["sessionId", "receiptId"].some((key) => nonempty(left[key]) && left[key] === right[key]);
const sameReview = (left, right) =>
  overlaps(left, right) &&
  ["sessionId", "receiptId"].every((key) => !left[key] || !right[key] || left[key] === right[key]);
const identity = (request) =>
  Object.fromEntries(
    ["sessionId", "receiptId"].filter((key) => request[key]).map((key) => [key, request[key]]),
  );
const fail = (message) => {
  throw new Error(message);
};

export function normalizePrMaps(state, prs, legacy, legacyFields) {
  const array = (value) => (value == null ? [] : Array.isArray(value) ? value : [value]);
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
      const numeric = /^\d+$/.test(alias) ? Number(alias) : null;
      const legacyNumber = legacy || legacyFields.has(name) ? aliases.get(alias) : null;
      const number = numeric ?? legacyNumber;
      if (
        !Number.isSafeInteger(number) ||
        number < 1 ||
        (numeric != null && legacyNumber != null && legacyNumber !== numeric)
      )
        throw new Error(`state/${name}: PR reference is unknown or ambiguous; supply PR number`);
      if (mapped[number] && JSON.stringify(mapped[number]) !== JSON.stringify(evidence))
        throw new Error(`state/${name}: contradictory evidence for one PR`);
      mapped[number] = evidence;
    }
    result[name] = mapped;
  }
  return result;
}

export function normalizeReviewMaps(state) {
  for (const [alias, canonical] of [
    ["reviewRequestByPr", "reviewRequestsByPr"],
    ["reviewEvidence", "reviewEvidenceByPr"],
  ]) {
    if (!state[alias]) continue;
    for (const [pr, record] of Object.entries(state[alias])) {
      if (state[canonical]?.[pr] && !isDeepStrictEqual(state[canonical][pr], record))
        fail("saved review maps contain conflicting entries for the same PR");
      (state[canonical] ??= {})[pr] = record;
    }
    delete state[alias];
  }
}

export function recordReviewRequest(state, pr, request) {
  const allowed = new Set(["sessionId", "receiptId", "headSha", "reviewDiffFingerprint", "status"]);
  if (Object.keys(request).some((key) => !allowed.has(key)))
    fail("unsupported review request field");
  if (
    !["running", "failed", "stopped"].includes(request.status) ||
    !nonempty(request.headSha) ||
    !nonempty(request.reviewDiffFingerprint) ||
    !hasIdentity(request)
  )
    fail(
      "a review request needs confirmed status, headSha, reviewDiffFingerprint, and a sessionId or receiptId",
    );
  const prior = state.reviewRequestsByPr?.[pr];
  const previousRequests = prior?.previousRequests ?? [];
  if (previousRequests.some((old) => overlaps(old, request)))
    fail("this review identity was superseded; recover the current review");
  const matching = prior && sameReview(prior, request);
  const sameDiff = prior?.reviewDiffFingerprint === request.reviewDiffFingerprint;
  const compatibleHead = prior?.headSha == null || prior.headSha === request.headSha;
  const enrich = prior?.status === "running" && !hasIdentity(prior) && sameDiff && compatibleHead;
  if (prior && overlaps(prior, request) && (!matching || !sameDiff || !compatibleHead))
    fail("review identity conflicts with the saved session, head, or diff");
  if (
    request.status !== "running" &&
    (!prior || !(matching || enrich) || !sameDiff || !compatibleHead)
  )
    fail("review failure does not match the saved request");
  if (prior?.status === "running" && sameDiff && !(matching || enrich))
    fail("a review is already running for this diff; recover its saved session");
  if (matching && prior.status === "completed") {
    if (request.status === "running") {
      state.reviewRequestsByPr[pr] = { ...prior, ...identity(request) };
      return;
    }
    fail("a completed review cannot be changed to failed or stopped");
  }
  if (matching && ["failed", "stopped"].includes(prior.status) && request.status === "running")
    fail("a failed or stopped review needs a fresh review session");
  const history = [...previousRequests];
  if (hasIdentity(prior) && !matching) history.push(identity(prior));
  (state.reviewRequestsByPr ??= {})[pr] = {
    ...(matching ? identity(prior) : {}),
    ...request,
    ...(history.length ? { previousRequests: history } : {}),
  };
}

export function recordReviewResult(state, pr, evidence) {
  const allowed = new Set([
    "sessionId",
    "receiptId",
    "reviewedHeadSha",
    "reviewedDiffFingerprint",
    "reviewVerdict",
    "independentReviewCount",
    "blockingFindings",
  ]);
  if (Object.keys(evidence).some((key) => !allowed.has(key)))
    fail("unsupported review result field");
  if (
    !nonempty(evidence.reviewedHeadSha) ||
    !nonempty(evidence.reviewedDiffFingerprint) ||
    !["APPROVE", "NEEDS REVISION"].includes(evidence.reviewVerdict) ||
    !Number.isInteger(evidence.independentReviewCount) ||
    evidence.independentReviewCount < 1
  )
    fail(
      "a review result needs reviewedHeadSha, reviewedDiffFingerprint, verdict, and independentReviewCount",
    );
  const request = state.reviewRequestsByPr?.[pr];
  if (request?.previousRequests?.some((old) => overlaps(old, evidence)))
    fail("this review identity was superseded; recover the current review");
  if (
    !request ||
    request.reviewDiffFingerprint !== evidence.reviewedDiffFingerprint ||
    request.headSha !== evidence.reviewedHeadSha ||
    !sameReview(request, evidence)
  )
    fail("review result does not match the saved request session, head, and diff");
  const verifiedIdentity = { ...identity(request), ...identity(evidence) };
  const result = {
    ...evidence,
    ...verifiedIdentity,
    blockingFindings: evidence.reviewVerdict === "NEEDS REVISION",
  };
  if (evidence.blockingFindings != null && evidence.blockingFindings !== result.blockingFindings)
    fail("review verdict contradicts its blocking findings");
  if (request.status === "completed") {
    if (isDeepStrictEqual({ ...state.reviewEvidenceByPr?.[pr], ...verifiedIdentity }, result)) {
      state.reviewEvidenceByPr[pr] = result;
      state.reviewRequestsByPr[pr] = { ...request, ...verifiedIdentity };
      return;
    }
    fail("the completed review has a different result; recover the review session");
  }
  if (request.status !== "running") fail("the review request is not running");
  (state.reviewEvidenceByPr ??= {})[pr] = result;
  state.reviewRequestsByPr[pr] = { ...request, ...verifiedIdentity, status: "completed" };
}
