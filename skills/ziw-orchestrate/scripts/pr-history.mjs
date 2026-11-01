import { isLiveWorker } from "./worker-lifecycle.mjs";

const normalized = (value) =>
  String(value ?? "")
    .trim()
    .toLowerCase();
const identity = (value) =>
  typeof value === "string"
    ? { [/^[A-Za-z][A-Za-z0-9]*-\d+$/.test(value) ? "issueKey" : "issueUuid"]: value }
    : value;
const references = (record) =>
  [record, ...(record?.linkedIssues ?? []), ...(record?.issueRefs ?? []).map(identity)].filter(
    (reference) => reference?.issueKey || reference?.issueUuid,
  );
const possiblySameIssue = (left, right) => {
  const comparable = ["issueKey", "issueUuid"].filter((key) => left[key] && right[key]);
  return (
    !comparable.length || comparable.some((key) => normalized(left[key]) === normalized(right[key]))
  );
};

export function savedPrNumber(record, repo) {
  if (record.prNumber != null || record.number != null) return record.prNumber ?? record.number;
  const url = String(record.prUrl ?? record.url ?? "");
  const prefix = `https://github.com/${repo}/pull/`;
  return url.startsWith(prefix)
    ? Number(url.slice(prefix.length).match(/^([1-9]\d*)(?:$|[/?#])/)?.[1]) || undefined
    : undefined;
}

// Open PRs are always collected separately. Only saved history can be retired here.
export function retiredPr(state, number) {
  if (number == null) return false;
  const workers = (state.dispatches ?? []).filter(
    (worker) => savedPrNumber(worker, state.repo) === Number(number),
  );
  if (workers.some(isLiveWorker)) return false;
  const pr = state.pullRequests?.find((record) => record.number === Number(number));
  const result = state.mergeResultsByPr?.[number];
  const refs = [
    ...workers,
    pr,
    result,
    ...(state.reviewEvidenceChecks ?? []).filter((record) => record.prNumber === Number(number)),
  ].flatMap(references);
  const scope = state.scopeIssues ?? state.scopeIssueRefs?.map(identity);
  const possiblySelected = scope?.some((issue) =>
    refs.some((ref) => possiblySameIssue(issue, ref)),
  );
  if (possiblySelected) return false;
  if (scope != null) return refs.length > 0;
  const merged =
    result?.postMergeCheck === "passed" && result.trackerUpdatedAt && references(result).length;
  const closed =
    normalized(pr?.state) === "closed" &&
    pr.merged !== true &&
    pr.headSha &&
    pr.closedResult?.headSha === pr.headSha &&
    pr.closedResult.issues?.length;
  return Boolean(merged || closed);
}
