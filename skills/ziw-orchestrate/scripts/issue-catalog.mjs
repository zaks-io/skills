const key = (value) => (value == null ? null : String(value).trim().toUpperCase());
const uuid = (value) => (value == null ? null : String(value).trim().toLowerCase());

export function buildIssueCatalog(records = []) {
  const byKey = new Map();
  const byUuid = new Map();
  for (const { record, path } of records) {
    const issueKey = key(record.issueKey);
    const issueUuid = uuid(record.issueUuid);
    if (!issueKey && !issueUuid) throw new Error(`${path}: missing issueKey or issueUuid`);
    const priorUuid = byKey.get(issueKey)?.issueUuid;
    const priorKey = byUuid.get(issueUuid)?.issueKey;
    if (
      (priorUuid && issueUuid && priorUuid !== issueUuid) ||
      (priorKey && issueKey && priorKey !== issueKey)
    )
      throw new Error(`${path}: contradictory tracker UUID/key mapping`);
    const entry = {
      issueKey: issueKey ?? priorKey ?? null,
      issueUuid: issueUuid ?? priorUuid ?? null,
    };
    if (entry.issueKey) byKey.set(entry.issueKey, entry);
    if (entry.issueUuid) byUuid.set(entry.issueUuid, entry);
  }
  const resolve = (reference, path = "issue") => {
    const issueKey = key(reference.issueKey);
    const issueUuid = uuid(reference.issueUuid);
    const keyed = byKey.get(issueKey);
    const identified = byUuid.get(issueUuid);
    if (issueKey && identified?.issueKey && issueKey !== identified.issueKey)
      throw new Error(`${path}: explicit issue key contradicts tracker UUID`);
    if (issueUuid && keyed?.issueUuid && issueUuid !== keyed.issueUuid)
      throw new Error(`${path}: explicit issue UUID contradicts tracker key`);
    const entry = keyed ?? identified;
    return {
      issueRef: entry?.issueKey ?? issueKey ?? entry?.issueUuid ?? issueUuid,
      issueKey: entry?.issueKey ?? issueKey,
      issueUuid: entry?.issueUuid ?? issueUuid,
      unresolvedUuid: Boolean(issueUuid && !identified && !keyed),
    };
  };
  return {
    resolve,
    keys: [...byKey.keys()].sort(),
    hasPartialAliases: [...byKey.values()].some((record) => !record.issueUuid),
    has: (ref) => byKey.has(key(ref)) || byUuid.has(uuid(ref)),
  };
}
