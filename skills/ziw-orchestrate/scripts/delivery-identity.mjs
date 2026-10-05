const normalize = (value) =>
  String(value ?? "")
    .trim()
    .toLowerCase();
const isTicketKey = (value) => /^[A-Z][A-Z0-9]+-\d+$/i.test(value) && !/^PR-\d+$/i.test(value);
const isUuid = (value) => /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value);
const issueFields = (item) => [item?.issueId, item?.identifier, item?.ticket, item?.key];
const explicitIdentities = (item) =>
  [...issueFields(item), item?.id]
    .map((value) => String(value ?? "").trim())
    .filter((value) => isTicketKey(value) || isUuid(value));
const linkedKey = (item) =>
  String(item?.url ?? "")
    .match(/^https:\/\/linear\.app\/[^/]+\/issue\/([A-Z][A-Z0-9]+-\d+)(?:[^a-z0-9]|$)/i)?.[1]
    ?.toUpperCase();

export const sameValue = (left, right) => left && right && normalize(left) === normalize(right);

export function issueIdentityIndex(items = [], evidence = []) {
  const index = new Map();
  for (const item of items) {
    const identities = explicitIdentities(item);
    const key = identities.find(isTicketKey)?.toUpperCase() ?? linkedKey(item);
    if (!key) continue;
    index.set(normalize(key), key);
    for (const uuid of identities.filter(isUuid)) {
      const prior = index.get(normalize(uuid));
      if (prior && prior !== key)
        throw new Error("conflicting tracker UUID and ticket key mapping");
      index.set(normalize(uuid), key);
    }
  }
  for (const item of evidence) {
    const key = explicitIdentities(item).find(isTicketKey)?.toUpperCase() ?? linkedKey(item);
    if (key) index.set(normalize(key), key);
  }
  return index;
}

export function issueIdentifier(item, knownIds = new Map()) {
  const exact =
    issueFields(item)
      .map((value) => String(value ?? "").trim())
      .find((value) => isTicketKey(value) || isUuid(value)) ??
    (isTicketKey(item?.id) || knownIds.has(normalize(item?.id)) ? String(item.id).trim() : null);
  if (exact)
    return (
      knownIds.get(normalize(exact)) ??
      (isTicketKey(exact) ? exact.toUpperCase() : normalize(exact))
    );
  const linked = linkedKey(item);
  if (linked) return linked;
  const title = String(item?.title ?? "")
    .trim()
    .match(/^([A-Z][A-Z0-9]+-\d+)(?:[^a-z0-9]|$)/i)?.[1];
  return title ? (knownIds.get(normalize(title)) ?? null) : null;
}

export function itemMentionsIssue(item, identifier, knownIds = new Map()) {
  if (!identifier) return false;
  const canonical = knownIds.get(normalize(identifier)) ?? identifier;
  const linkedIdentifier = issueIdentifier(item, knownIds);
  if (linkedIdentifier) return sameValue(linkedIdentifier, canonical);
  if (!isTicketKey(canonical)) return false;
  const escaped = canonical.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, "i");
  return [item?.branch, item?.headRefName, item?.worktree, item?.path].some((value) =>
    pattern.test(String(value ?? "")),
  );
}
