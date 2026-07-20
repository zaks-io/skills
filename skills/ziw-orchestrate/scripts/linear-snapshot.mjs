const TEAM_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const FOOTPRINT_HEADINGS = new Set([
  "predicted file footprint",
  "file footprint",
  "likely files",
  "likely files packages or artifacts",
]);

const normalizeHeading = (value) =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[,/]+/g, " ")
    .replace(/\s+/g, " ");

const compact = (values) => [...new Set(values.map((value) => value.trim()).filter(Boolean))];
const isPlainFootprintEntry = (value) =>
  !/\s/.test(value) && (value.includes("/") || /^[.\w-]+\.[\w-]+$/.test(value));

export function extractLinearFootprint(description = "") {
  const lines = String(description).split(/\r?\n/);
  const entries = [];
  let inFootprintSection = false;

  for (const line of lines) {
    const heading = line.match(/^##\s+(.+?)\s*$/);
    if (heading) {
      inFootprintSection = FOOTPRINT_HEADINGS.has(normalizeHeading(heading[1]));
      continue;
    }
    if (!inFootprintSection) continue;

    const codeSpans = [...line.matchAll(/`([^`]+)`/g)].map((match) => match[1]);
    if (codeSpans.length > 0) {
      entries.push(...codeSpans);
      continue;
    }

    const bullet = line.match(/^\s*[-*]\s+(.+?)\s*$/)?.[1];
    if (bullet && isPlainFootprintEntry(bullet)) entries.push(bullet);
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
    state: { type: { nin: ["completed", "canceled"] } }
  }) {
    pageInfo { hasNextPage endCursor }
    nodes {
      identifier title description url priority estimate updatedAt
      state { name type }
      labels { nodes { name } }
      assignee { displayName }
      inverseRelations(first: 250) {
        pageInfo { hasNextPage }
        nodes { type issue { identifier state { type } } }
      }
    }
  }
}`;

export function normalizeLinearIssue(issue) {
  if (issue.inverseRelations?.pageInfo?.hasNextPage) {
    throw new Error(`Linear issue ${issue.identifier} has more than 250 inverse relations`);
  }
  return {
    identifier: issue.identifier,
    title: issue.title,
    url: issue.url,
    state: issue.state?.name,
    stateType: issue.state?.type,
    priority: issue.priority,
    estimate: issue.estimate ?? null,
    labels: (issue.labels?.nodes ?? []).map((label) => label.name),
    assignee: issue.assignee?.displayName ?? null,
    footprint: extractLinearFootprint(issue.description),
    blockedBy: (issue.inverseRelations?.nodes ?? [])
      .filter(
        (relation) =>
          relation.type === "blocks" &&
          !["completed", "canceled"].includes(relation.issue?.state?.type),
      )
      .map((relation) => relation.issue.identifier),
    updatedAt: issue.updatedAt,
  };
}

export function selectScopedLinearIssues(issues, states = []) {
  if (states.length === 0) return issues;
  const stateSet = new Set(states);
  const primary = issues.filter((issue) => stateSet.has(issue.state));
  const directBlockers = new Set(primary.flatMap((issue) => issue.blockedBy));
  return issues.filter(
    (issue) => stateSet.has(issue.state) || directBlockers.has(issue.identifier),
  );
}

export function selectActiveLinearIssues(issues, routeLabel) {
  const active = issues.filter((issue) => issue.stateType === "started" || Boolean(issue.assignee));
  if (!routeLabel) return active;

  const normalizedRoute = routeLabel.trim().toLowerCase();
  const routeNamespace = normalizedRoute.includes("/") ? `${normalizedRoute.split("/")[0]}/` : null;
  const usesRouteLabels = issues.some((issue) =>
    (issue.labels ?? []).some((label) => {
      const normalizedLabel = label.trim().toLowerCase();
      return (
        normalizedLabel === normalizedRoute ||
        (routeNamespace && normalizedLabel.startsWith(routeNamespace))
      );
    }),
  );
  if (!usesRouteLabels) return active;
  return active.filter((issue) =>
    (issue.labels ?? []).some((label) => label.trim().toLowerCase() === normalizedRoute),
  );
}

export async function loadLinearSnapshot({ request, selector, states = [], routeLabel }) {
  const team = await resolveLinearTeam(request, selector);
  const issues = [];
  let after = null;

  do {
    const body = await request({
      query: LINEAR_ISSUES_QUERY,
      variables: { teamId: team.id, after },
    });
    const page = body.data?.issues;
    if (!page) throw new Error("Linear issues query returned no issues connection");
    issues.push(...page.nodes.map(normalizeLinearIssue));
    after = page.pageInfo?.hasNextPage ? page.pageInfo.endCursor : null;
    if (page.pageInfo?.hasNextPage && !after) {
      throw new Error("Linear issues query reported another page without an end cursor");
    }
  } while (after);

  return {
    team: team.key,
    teamId: team.id,
    teamName: team.name,
    statesFilter: states,
    includesDirectBlockers: states.length > 0,
    activeScope: { routeLabel: routeLabel ?? null },
    activeIssues: selectActiveLinearIssues(issues, routeLabel),
    issues: selectScopedLinearIssues(issues, states),
  };
}
