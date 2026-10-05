const TEAM_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const FOOTPRINT_HEADINGS = new Set([
  "predicted file footprint",
  "file footprint",
  "likely files",
  "likely files packages artifacts",
]);

const normalizeHeading = (value) =>
  String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(and|or)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const compact = (values) => [...new Set(values.map((value) => value.trim()).filter(Boolean))];
const PROSE_TOKENS = new Set(["n/a", "and/or", "either/or", "e.g", "i.e", "etc", "w/", "w/o"]);
const isPlainFootprintEntry = (value) =>
  !/\s/.test(value) &&
  !value.includes("://") &&
  !PROSE_TOKENS.has(value.toLowerCase()) &&
  (value.includes("/") || /^[.\w-]+\.[\w-]+$/.test(value));
// Over-capturing a path only adds a collision check; missing one lets overlapping
// work run in parallel, so bullets yield every path-like token they contain.
const bulletPaths = (text) =>
  text
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .split(/\s+/)
    .map((token) => token.replace(/^[("'[]+|[)"'\],;:.]+$/g, ""))
    .filter(isPlainFootprintEntry);

export function extractLinearFootprint(description = "") {
  const lines = String(description).split(/\r?\n/);
  const entries = [];
  let sectionLevel = 0;
  let fence = null;

  for (const line of lines) {
    const fenceMarker = line.match(/^\s*(`{3,}|~{3,})/)?.[1];
    if (fenceMarker) {
      if (!fence) fence = fenceMarker;
      else if (fenceMarker[0] === fence[0] && fenceMarker.length >= fence.length) fence = null;
      continue;
    }
    if (fence) continue;

    const heading = line.match(/^(#{1,6})\s+(.+?)\s*$/);
    if (heading) {
      const level = heading[1].length;
      if (sectionLevel && level <= sectionLevel) sectionLevel = 0;
      if (!sectionLevel && FOOTPRINT_HEADINGS.has(normalizeHeading(heading[2]))) {
        sectionLevel = level;
      }
      continue;
    }
    if (!sectionLevel) continue;

    const codeSpans = [...line.matchAll(/`([^`]+)`/g)].map((match) => match[1].trim());
    entries.push(...codeSpans.filter((span) => span && !/\s/.test(span)));

    const bullet = line.match(/^\s*[-*]\s+(.+?)\s*$/)?.[1];
    if (bullet) entries.push(...bulletPaths(bullet.replace(/`[^`]*`/g, " ")));
  }

  return compact(entries);
}

export async function resolveLinearTeam(request, selector) {
  const uuid = TEAM_UUID.test(selector);
  const query = uuid
    ? `query($team: ID!) {
        teams(first: 2, filter: { id: { eq: $team } }) { nodes { id key name } }
      }`
    : `query($team: String!) {
        teams(first: 2, filter: { or: [{ key: { eq: $team } }, { name: { eq: $team } }] }) {
          nodes { id key name }
        }
      }`;
  const body = await request({ query, variables: { team: selector } });
  const teams = body.data?.teams?.nodes ?? [];
  if (teams.length === 0) {
    throw new Error(`Linear team ${JSON.stringify(selector)} was not found`);
  }
  if (teams.length > 1) {
    throw new Error(`Linear team ${JSON.stringify(selector)} is ambiguous`);
  }
  return teams[0];
}

const LINEAR_ISSUES_QUERY = `
query($teamId: ID!, $after: String) {
  issues(first: 100, after: $after, filter: {
    team: { id: { eq: $teamId } },
    state: { type: { nin: ["completed", "canceled", "duplicate"] } }
  }) {
    pageInfo { hasNextPage endCursor }
    nodes {
      id identifier title description url priority estimate updatedAt
      state { name type }
      labels { nodes { name } }
      assignee { displayName }
      inverseRelations(first: 250) {
        pageInfo { hasNextPage }
        nodes { type issue { id identifier state { type } } }
      }
    }
  }
}`;

const CLOSED_BLOCKER_TYPES = ["canceled", "duplicate"];
const MAX_DUPLICATE_HOPS = 10;

const LINEAR_ISSUE_RELATIONS_QUERY = `
query($id: String!) {
  issue(id: $id) {
    id identifier
    state { type }
    relations(first: 50) {
      pageInfo { hasNextPage }
      nodes { type relatedIssue { id identifier state { type } } }
    }
  }
}`;

const closedBlockerIds = (rawIssues) => [
  ...new Set(
    rawIssues.flatMap((issue) =>
      (issue.inverseRelations?.nodes ?? [])
        .filter(
          (relation) =>
            relation.type === "blocks" &&
            CLOSED_BLOCKER_TYPES.includes(relation.issue?.state?.type),
        )
        .map((relation) => relation.issue.identifier),
    ),
  ),
];

// A canceled or duplicate blocker still blocks through the open issue it
// duplicates, even across teams or duplicate chains. It is satisfied only when
// the chain ends at completed work or at no open issue at all.
export async function resolveClosedBlockers(request, rawIssues) {
  const lookups = new Map();
  const lookup = async (id) => {
    if (!lookups.has(id)) {
      lookups.set(
        id,
        request({ query: LINEAR_ISSUE_RELATIONS_QUERY, variables: { id } }).then((body) => {
          const issue = body.data?.issue;
          if (!issue) throw new Error(`Linear blocker ${id} was not found`);
          if (issue.relations?.pageInfo?.hasNextPage) {
            throw new Error(`Linear issue ${id} has more than 50 relations`);
          }
          return issue;
        }),
      );
    }
    return lookups.get(id);
  };

  const resolveChain = async (id) => {
    const seen = new Set();
    let current = id;
    let result = null;
    while (current && !seen.has(current)) {
      if (seen.size >= MAX_DUPLICATE_HOPS) {
        throw new Error(
          `Linear blocker ${id} has a duplicate chain over ${MAX_DUPLICATE_HOPS} hops`,
        );
      }
      seen.add(current);
      const issue = await lookup(current);
      const canonical = (issue.relations?.nodes ?? []).find(
        (relation) => relation.type === "duplicate",
      )?.relatedIssue;
      const canonicalType = canonical?.state?.type;
      if (!canonical || canonicalType === "completed") break;
      if (!CLOSED_BLOCKER_TYPES.includes(canonicalType)) {
        result = issueReference(canonical);
        break;
      }
      current = canonical.identifier;
    }
    return [id, result];
  };

  return new Map(await Promise.all(closedBlockerIds(rawIssues).map(resolveChain)));
}

function resolveBlocker(relation, closedBlockers) {
  const id = relation.issue.identifier;
  const type = relation.issue?.state?.type;
  if (type === "completed") return null;
  if (!CLOSED_BLOCKER_TYPES.includes(type)) return issueReference(relation.issue);
  return closedBlockers.get(id) ?? null;
}

const issueReference = (issue) => ({
  ...(issue.id ? { issueUuid: issue.id } : {}),
  ...(issue.identifier ? { issueKey: issue.identifier } : {}),
});
const referenceId = (reference) => reference.issueKey ?? reference.issueUuid;

export function normalizeLinearIssue(issue, closedBlockers = new Map()) {
  if (issue.inverseRelations?.pageInfo?.hasNextPage) {
    throw new Error(`Linear issue ${issue.identifier} has more than 250 inverse relations`);
  }
  return {
    ...issueReference(issue),
    title: issue.title,
    url: issue.url,
    state: issue.state?.name,
    stateType: issue.state?.type,
    priority: issue.priority,
    estimate: issue.estimate ?? null,
    labels: (issue.labels?.nodes ?? []).map((label) => label.name),
    assignee: issue.assignee?.displayName ?? null,
    footprint: extractLinearFootprint(issue.description),
    blockedBy: [
      ...new Map(
        (issue.inverseRelations?.nodes ?? [])
          .filter((relation) => relation.type === "blocks")
          .map((relation) => resolveBlocker(relation, closedBlockers))
          .filter((reference) => reference && referenceId(reference) !== issue.identifier)
          .map((reference) => [referenceId(reference), reference]),
      ).values(),
    ],
    updatedAt: issue.updatedAt,
  };
}

const normalizedLabels = (issue) => {
  const labels =
    issue.labels == null ? [] : Array.isArray(issue.labels) ? issue.labels : [issue.labels];
  return labels.map((label) =>
    String(typeof label === "string" ? label : (label?.name ?? ""))
      .trim()
      .toLowerCase(),
  );
};

export function linearIssueMatchesRoute(issue, routeLabel) {
  if (!routeLabel) return true;
  const normalizedRoute = routeLabel.trim().toLowerCase();
  return normalizedLabels(issue).includes(normalizedRoute);
}

function selectUnroutedIssueIds(issues, states, routeLabel) {
  if (!routeLabel) return [];
  const normalizedRoute = routeLabel.trim().toLowerCase();
  const namespace = normalizedRoute.includes("/") ? `${normalizedRoute.split("/")[0]}/` : null;
  const stateSet = new Set(states);
  return issues
    .filter(
      (issue) =>
        (stateSet.size === 0 ? issue.stateType === "unstarted" : stateSet.has(issue.state)) &&
        !normalizedLabels(issue).some(
          (label) => label === normalizedRoute || (namespace && label.startsWith(namespace)),
        ),
    )
    .map((issue) => issue.issueKey);
}

function selectLinearCandidates(issues, states, routeLabel) {
  const stateSet = new Set(states);
  return issues.filter(
    (issue) =>
      (stateSet.size === 0 || stateSet.has(issue.state)) &&
      linearIssueMatchesRoute(issue, routeLabel),
  );
}

export function selectScopedLinearIssues(issues, states = [], routeLabel) {
  const primary = selectLinearCandidates(issues, states, routeLabel);
  const selected = new Set(primary.map(referenceId));
  const directBlockers = new Set(
    primary.flatMap((issue) => (issue.blockedBy ?? []).map(referenceId)),
  );
  return issues.filter(
    (issue) => selected.has(referenceId(issue)) || directBlockers.has(referenceId(issue)),
  );
}

export function selectActiveLinearIssues(issues, routeLabel) {
  const active = issues.filter(
    (issue) =>
      !["completed", "canceled", "duplicate"].includes(issue.stateType) &&
      Boolean(
        issue.stateType === "started" ||
        issue.activeClaim ||
        issue.delegated ||
        issue.assignedWorker ||
        issue.workerSession ||
        issue.agentSession,
      ),
  );
  const scopedActive = active.filter((issue) => linearIssueMatchesRoute(issue, routeLabel));

  const selected = new Set(scopedActive.map(referenceId));
  const directBlockers = new Set(
    scopedActive.flatMap((issue) => (issue.blockedBy ?? []).map(referenceId)),
  );
  return issues.filter(
    (issue) => selected.has(referenceId(issue)) || directBlockers.has(referenceId(issue)),
  );
}

export async function loadLinearSnapshot({
  request,
  selector,
  states = [],
  routeLabel,
  issueRefs = [],
}) {
  const team = await resolveLinearTeam(request, selector);
  const rawIssues = [];
  let after = null;

  do {
    const body = await request({
      query: LINEAR_ISSUES_QUERY,
      variables: { teamId: team.id, after },
    });
    const page = body.data?.issues;
    if (!page) throw new Error("Linear issues query returned no issues connection");
    rawIssues.push(...page.nodes);
    after = page.pageInfo?.hasNextPage ? page.pageInfo.endCursor : null;
    if (page.pageInfo?.hasNextPage && !after) {
      throw new Error("Linear issues query reported another page without an end cursor");
    }
  } while (after);

  const closedBlockers = await resolveClosedBlockers(request, rawIssues);
  const issues = rawIssues.map((issue) => normalizeLinearIssue(issue, closedBlockers));
  const candidateIssues = selectLinearCandidates(issues, states, routeLabel).map(
    ({ issueKey, issueUuid }) => ({
      ...(issueKey ? { issueKey } : {}),
      ...(issueUuid ? { issueUuid } : {}),
    }),
  );
  const referencedIssues = await loadReferencedIssues(request, issueRefs, issues);
  const metadata = [...issues, ...referencedIssues];

  return {
    team: team.key,
    teamId: team.id,
    teamName: team.name,
    statesFilter: states,
    candidateScope: { routeLabel: routeLabel ?? null, states },
    candidateIssues,
    issueMetadata: metadata.map(({ issueKey, issueUuid, labels }) => ({
      ...(issueKey ? { issueKey } : {}),
      ...(issueUuid ? { issueUuid } : {}),
      labels,
    })),
    unroutedIssueIds: selectUnroutedIssueIds(issues, states, routeLabel),
    includesDirectBlockers: true,
    activeScope: { routeLabel: routeLabel ?? null },
    activeIssues: selectActiveLinearIssues(issues, routeLabel),
    issues: selectScopedLinearIssues(issues, states, routeLabel),
  };
}

const MAX_REFERENCED_ISSUES = 50;
const ISSUE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LINEAR_REFERENCED_ISSUE_QUERY = `
query($id: String!) {
  issue(id: $id) {
    id identifier title url priority estimate updatedAt
    state { name type }
    labels { nodes { name } }
  }
}`;

async function loadReferencedIssues(request, issueRefs, knownIssues) {
  if (!Array.isArray(issueRefs)) throw new Error("Referenced Linear issues must be an array");
  const refs = [
    ...new Map(
      issueRefs.map((ref) => {
        if (
          !ref ||
          typeof ref !== "object" ||
          Array.isArray(ref) ||
          Object.keys(ref).some((name) => !["issueKey", "issueUuid"].includes(name)) ||
          (!ref.issueKey && !ref.issueUuid) ||
          (ref.issueKey !== undefined &&
            (typeof ref.issueKey !== "string" ||
              !/^[A-Za-z][A-Za-z0-9]*-[0-9]+$/.test(ref.issueKey))) ||
          (ref.issueUuid !== undefined &&
            (typeof ref.issueUuid !== "string" || !ISSUE_UUID.test(ref.issueUuid)))
        ) {
          throw new Error(
            "Referenced Linear issues require valid typed issueKey or issueUuid fields",
          );
        }
        return [JSON.stringify([ref.issueUuid?.toLowerCase(), ref.issueKey?.toUpperCase()]), ref];
      }),
    ).values(),
  ];
  const matches = (ref, issue) =>
    (ref.issueUuid && issue.issueUuid?.toLowerCase() === ref.issueUuid.toLowerCase()) ||
    (ref.issueKey && issue.issueKey?.toUpperCase() === ref.issueKey.toUpperCase());
  const unresolved = refs.filter((ref) => !knownIssues.some((issue) => matches(ref, issue)));
  if (unresolved.length > MAX_REFERENCED_ISSUES) {
    throw new Error(`Referenced Linear issue lookup exceeds ${MAX_REFERENCED_ISSUES} issues`);
  }
  const results = [];
  for (const ref of refs) {
    let issue = [...knownIssues, ...results].find((issue) => matches(ref, issue));
    if (!issue) {
      const body = await request({
        query: LINEAR_REFERENCED_ISSUE_QUERY,
        variables: { id: ref.issueUuid ?? ref.issueKey },
      });
      if (!body.data?.issue) throw new Error("Referenced Linear issue was not found");
      issue = normalizeLinearIssue(body.data.issue);
      results.push(issue);
    }
    if (
      (ref.issueKey && issue.issueKey?.toUpperCase() !== ref.issueKey.toUpperCase()) ||
      (ref.issueUuid && issue.issueUuid?.toLowerCase() !== ref.issueUuid.toLowerCase())
    ) {
      throw new Error("Referenced Linear issue identity conflicts with tracker evidence");
    }
  }
  return results;
}
