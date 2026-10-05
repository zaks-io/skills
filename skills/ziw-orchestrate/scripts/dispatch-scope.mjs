import { linearIssueMatchesRoute } from "./linear-snapshot.mjs";

const normalize = (value) =>
  String(value ?? "")
    .trim()
    .toLowerCase();
const identifier = (issue) => issue.issueRef;
const identifiers = (values) => (values == null ? null : new Set(values));

export function linearDispatchScope(snapshot = {}, state = {}) {
  const linear = snapshot.linear ?? {};
  const scope = linear.candidateScope ?? {};
  const routeLabel = scope.routeLabel ?? linear.activeScope?.routeLabel;
  const candidateIds = identifiers(linear.candidateIssueRefs);
  const requestedIds = identifiers(state.scopeIssueRefs);
  const states = new Set((scope.states ?? linear.statesFilter ?? []).map(normalize));
  const matchesReservation = (issue) => linearIssueMatchesRoute(issue, routeLabel);
  const matchesCandidate = (issue) =>
    matchesReservation(issue) &&
    (candidateIds == null || candidateIds.has(identifier(issue))) &&
    (requestedIds == null || requestedIds.has(identifier(issue))) &&
    (states.size === 0 || states.has(normalize(issue.state?.name ?? issue.state ?? issue.status)));

  return { matchesCandidate, matchesReservation };
}

export function restrictLinearDag(dag, scope) {
  if (!dag) return dag;
  for (const node of dag.nodes) {
    if (scope.matchesCandidate(node)) continue;
    node.startable = false;
    node.startableBlockers.push("outside requested delivery scope");
  }
  const candidates = new Set(dag.nodes.filter(scope.matchesCandidate).map((node) => node.id));
  dag.starts = dag.starts.filter((id) => candidates.has(id));
  dag.readyStarts = dag.readyStarts.filter((id) => candidates.has(id));
  return dag;
}
