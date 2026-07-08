#!/usr/bin/env node
// Tick snapshot for ziw-orchestrate: assemble the code-host state one tick
// needs as a single JSON blob, so the orchestrator reasons over a compact
// snapshot instead of dozens of tool round-trips.
//
// Usage:
//   node tick-snapshot.mjs [--repo owner/name] [--limit 50] [--linear-team KEY]
//
// GitHub state comes from the `gh` CLI (must be installed and authenticated).
// Linear state is included only when --linear-team is given and either
// LINEAR_API_KEY exists or linear-graphql.mjs setup has stored a local macOS
// credential; otherwise the tracker section reports skipped and the caller uses
// its tracker tooling as usual. Blocker relations and issue bodies stay on the
// tracker tools; this snapshot is workflow metadata only.

import { execFileSync } from "node:child_process";

import { hasLinearCredential, linearGraphqlRequest } from "./linear-graphql.mjs";

const args = process.argv.slice(2);
const argValue = (flag) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
};

const fail = (message) => {
  console.error(`tick-snapshot: ${message}`);
  process.exit(1);
};

const gh = (ghArgs, input) => {
  try {
    return execFileSync("gh", ghArgs, {
      encoding: "utf8",
      input,
      maxBuffer: 32 * 1024 * 1024,
    });
  } catch (error) {
    fail(`gh ${ghArgs[0]} failed: ${error.stderr?.toString().trim() || error.message}`);
  }
};

const deriveRepo = () => {
  try {
    const url = execFileSync("git", ["remote", "get-url", "origin"], { encoding: "utf8" }).trim();
    const match = url.match(/[:/]([^/:]+\/[^/]+?)(?:\.git)?$/);
    if (match) return match[1];
  } catch {
    // fall through to the explicit error below
  }
  return undefined;
};

const repo = argValue("--repo") ?? deriveRepo();
if (!repo || !repo.includes("/")) fail("cannot determine repo; pass --repo owner/name");
const [owner, name] = repo.split("/");
const limit = Number(argValue("--limit") ?? 50);

const PR_QUERY = `
query($owner: String!, $name: String!, $limit: Int!) {
  repository(owner: $owner, name: $name) {
    defaultBranchRef {
      name
      target {
        ... on Commit { oid statusCheckRollup { state contexts(first: 50) { nodes {
          ... on CheckRun { name conclusion status }
          ... on StatusContext { context state }
        } } } }
      }
    }
    pullRequests(states: OPEN, first: $limit, orderBy: { field: UPDATED_AT, direction: DESC }) {
      totalCount
      nodes {
        number title url isDraft updatedAt
        author { login __typename }
        headRefName headRefOid baseRefName
        mergeable mergeStateStatus reviewDecision
        labels(first: 20) { nodes { name } }
        reviewThreads(first: 100) { totalCount nodes { isResolved } }
        reviews(last: 20) { nodes { author { login } state submittedAt } }
        commits(last: 1) { nodes { commit { statusCheckRollup { state contexts(first: 60) { nodes {
          ... on CheckRun { name conclusion status }
          ... on StatusContext { context state }
        } } } } } }
      }
    }
  }
}`;

const checkSummary = (rollup) => {
  if (!rollup) return { state: "NONE", failed: [], pending: [] };
  const failed = [];
  const pending = [];
  for (const node of rollup.contexts?.nodes ?? []) {
    const label = node.name ?? node.context ?? "unknown";
    const outcome = node.conclusion ?? node.state ?? node.status ?? "UNKNOWN";
    if (["FAILURE", "ERROR", "TIMED_OUT", "CANCELLED", "ACTION_REQUIRED"].includes(outcome)) {
      failed.push(label);
    } else if (["PENDING", "QUEUED", "IN_PROGRESS", "EXPECTED", "WAITING"].includes(outcome)) {
      pending.push(label);
    }
  }
  return { state: rollup.state ?? "UNKNOWN", failed, pending };
};

const latestReviewByAuthor = (reviews) => {
  const byAuthor = new Map();
  for (const review of reviews ?? []) {
    if (!review.author?.login || review.state === "COMMENTED") continue;
    byAuthor.set(review.author.login, { state: review.state, submittedAt: review.submittedAt });
  }
  return Object.fromEntries(byAuthor);
};

const raw = gh([
  "api",
  "graphql",
  "-f",
  `query=${PR_QUERY}`,
  "-F",
  `owner=${owner}`,
  "-F",
  `name=${name}`,
  "-F",
  `limit=${limit}`,
]);
const repoData = JSON.parse(raw).data.repository;

const baselineRollup = repoData.defaultBranchRef?.target?.statusCheckRollup;
const baseline = {
  branch: repoData.defaultBranchRef?.name ?? null,
  headSha: repoData.defaultBranchRef?.target?.oid ?? null,
  checks: checkSummary(baselineRollup),
};
baseline.green = baseline.checks.state === "SUCCESS" || baseline.checks.state === "NONE";

const prs = (repoData.pullRequests?.nodes ?? []).map((pr) => ({
  number: pr.number,
  title: pr.title,
  url: pr.url,
  state: "open",
  open: true,
  author: pr.author?.login ?? null,
  isBot: pr.author?.__typename === "Bot",
  isDraft: pr.isDraft,
  draftState: pr.isDraft ? "draft" : "ready-for-review",
  updatedAt: pr.updatedAt,
  headRefName: pr.headRefName,
  headSha: pr.headRefOid,
  baseRefName: pr.baseRefName,
  mergeable: pr.mergeable,
  mergeStateStatus: pr.mergeStateStatus,
  reviewDecision: pr.reviewDecision,
  labels: (pr.labels?.nodes ?? []).map((label) => label.name),
  unresolvedThreads: (pr.reviewThreads?.nodes ?? []).filter((t) => !t.isResolved).length,
  reviewThreadsTruncated: (pr.reviewThreads?.totalCount ?? 0) > 100,
  latestReviews: latestReviewByAuthor(pr.reviews?.nodes),
  checks: checkSummary(pr.commits?.nodes?.[0]?.commit?.statusCheckRollup),
}));

const linearTeam = argValue("--linear-team");
let linear = {
  skipped: "no --linear-team or Linear credential; use tracker tooling",
};
if (linearTeam && hasLinearCredential()) {
  const LINEAR_QUERY = `
query($team: String!) {
  issues(first: 100, filter: {
    team: { key: { eq: $team } },
    state: { type: { nin: ["completed", "canceled"] } }
  }) {
    nodes {
      identifier title url priority updatedAt
      state { name type }
      labels { nodes { name } }
      assignee { displayName }
      inverseRelations(first: 20) { nodes { type issue { identifier state { type } } } }
    }
  }
}`;
  try {
    const body = await linearGraphqlRequest({
      query: LINEAR_QUERY,
      variables: { team: linearTeam },
    });
    linear = {
      team: linearTeam,
      issues: body.data.issues.nodes.map((issue) => ({
        identifier: issue.identifier,
        title: issue.title,
        url: issue.url,
        state: issue.state?.name,
        stateType: issue.state?.type,
        priority: issue.priority,
        labels: (issue.labels?.nodes ?? []).map((label) => label.name),
        assignee: issue.assignee?.displayName ?? null,
        blockedBy: (issue.inverseRelations?.nodes ?? [])
          .filter((rel) => rel.type === "blocks" && rel.issue?.state?.type !== "completed")
          .map((rel) => rel.issue.identifier),
        updatedAt: issue.updatedAt,
      })),
    };
  } catch (error) {
    linear = { error: `Linear query failed: ${error.message}; use tracker tooling` };
  }
}

process.stdout.write(
  `${JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      repo,
      baseline,
      footprint: {
        openPrCount: repoData.pullRequests?.totalCount ?? prs.length,
        productPrCount: prs.filter((pr) => !pr.isBot).length,
        draftPrCount: prs.filter((pr) => pr.isDraft).length,
        readyForReviewPrCount: prs.filter((pr) => !pr.isDraft).length,
        botPrCount: prs.filter((pr) => pr.isBot).length,
      },
      prs,
      linear,
    },
    null,
    2,
  )}\n`,
);
