export const sameValue = (left, right) =>
  Boolean(left && right && String(left).trim() === String(right).trim());

export function coversIssue(item, issueRef, { includePossible = true } = {}) {
  return Boolean(
    issueRef &&
    (item.issueRef === issueRef ||
      item.issueRefs?.includes(issueRef) ||
      (includePossible && item.possibleIssueRefs?.includes(issueRef))),
  );
}

export function possibleIssueLinks(record, catalog) {
  if (record.issueRef || record.issueRefs?.length) return [];
  const title = String(record.title ?? "")
    .trim()
    .match(/^([A-Z][A-Z0-9]*-\d+)(?:[^a-z0-9]|$)/i)?.[1]
    ?.toUpperCase();
  return catalog.keys.filter((issueKey) => {
    if (title === issueKey) return true;
    const escaped = issueKey.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, "i");
    return [record.branch, record.headRefName, record.worktree, record.path].some((value) =>
      pattern.test(String(value ?? "")),
    );
  });
}
