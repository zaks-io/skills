#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import path from "node:path";
import { isMain, parseCli, runCli } from "./cli.mjs";
import { readJson, validatePlannerConfig } from "./planner-input.mjs";
import { readPlannerState } from "./state-file.mjs";
import { validateInput } from "./planner-input-validator.mjs";

import { hasLinearCredential, linearGraphqlRequest } from "./linear-graphql.mjs";
import { loadLinearSnapshot } from "./linear-snapshot.mjs";
import { localWorktrees } from "./worktree-snapshot.mjs";
import { isLiveWorker } from "./worker-lifecycle.mjs";

const usage =
  "Usage: node tick-snapshot.mjs [--config planner.json] [--repo owner/name] [--linear-team KEY] [--linear-route-label LABEL] [--state file] [--hosted-review-bot login] [--limit N] [--no-local-worktrees] [--pretty] [--help]";
const fail = (message) => {
  throw new Error(message);
};
const options = Object.fromEntries([
  ...["config", "repo", "limit", "linear-team", "linear-route-label", "state"].map((name) => [
    name,
    { type: "string" },
  ]),
  ...[
    "linear-state",
    "linear-states",
    "linear-issue-key",
    "linear-issue-uuid",
    "hosted-review-bot",
  ].map((name) => [name, { type: "string", multiple: true }]),
  ...["pretty", "no-local-worktrees"].map((name) => [name, { type: "boolean" }]),
]);
export function stateIssueReferences(state = {}) {
  const references = [];
  const paths = [];
  const append = (reference, sourcePath) => {
    references.push({
      ...(reference.issueKey ? { issueKey: reference.issueKey } : {}),
      ...(reference.issueUuid ? { issueUuid: reference.issueUuid } : {}),
    });
    paths.push(sourcePath);
  };
  for (const [index, reference] of (state.scopeIssues ?? []).entries())
    append(reference, `--state/scopeIssues/${index}`);
  for (const name of [
    "tickets",
    "linearIssues",
    "activeLinearIssues",
    "startableTickets",
    "dispatches",
    "pullRequests",
    "reviewEvidenceChecks",
  ]) {
    for (const [index, record] of (state[name] ?? []).entries()) {
      if (name === "dispatches" && !isLiveWorker(record)) continue;
      const sourcePath = `--state/${name}/${index}`;
      if (record.issueKey || record.issueUuid) append(record, sourcePath);
      for (const field of ["blockedBy", "linkedIssues"])
        for (const [position, reference] of (record[field] ?? []).entries())
          append(reference, `${sourcePath}/${field}/${position}`);
    }
  }
  return { issueRefs: references, issueRefPaths: paths };
}
export async function collectSnapshot(options = {}) {
  const startedAt = performance.now();
  const values = {
    repo: options.repo,
    limit: options.limit,
    "linear-team": options.linearTeam,
    "linear-route-label": options.linearRouteLabel,
    "linear-state": options.linearStates,
    "linear-issue-key": options.issueKeys,
    "linear-issue-uuid": options.issueUuids,
    "hosted-review-bot": options.hostedReviewBots,
    "no-local-worktrees": options.noLocalWorktrees,
  };
  const argValue = (flag) => values[flag.slice(2)];
  const argValues = (flag) => values[flag.slice(2)] ?? [];
  const receiptReferences = stateIssueReferences(options.state);

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
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    fail("--limit must be an integer from 1 to 100");
  }

  const PR_QUERY = `
query($owner: String!, $name: String!, $limit: Int!, $after: String) {
  repository(owner: $owner, name: $name) {
    defaultBranchRef {
      name
      target {
        ... on Commit { oid statusCheckRollup { state contexts(first: 50) { totalCount nodes {
          ... on CheckRun { name conclusion status }
          ... on StatusContext { context state }
        } } } }
      }
    }
    pullRequests(states: OPEN, first: $limit, after: $after, orderBy: { field: UPDATED_AT, direction: DESC }) {
      totalCount
      pageInfo { hasNextPage endCursor }
      nodes {
        number title body url isDraft updatedAt changedFiles
        author { login __typename }
        headRefName headRefOid baseRefName
        mergeable mergeStateStatus reviewDecision
        autoMergeRequest { enabledAt }
        labels(first: 20) { nodes { name } }
        reviewThreads(first: 100) { totalCount nodes { isResolved } }
        reviews(last: 20) { totalCount nodes { author { login __typename } state submittedAt commit { oid } } }
        commits(last: 1) { nodes { commit { statusCheckRollup { state contexts(first: 60) { totalCount nodes {
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
    return {
      state: rollup.state ?? "UNKNOWN",
      failed,
      pending,
      truncated: (rollup.contexts?.totalCount ?? 0) > (rollup.contexts?.nodes?.length ?? 0),
    };
  };

  const normalizeLogin = (login) =>
    String(login)
      .trim()
      .toLowerCase()
      .replace(/\[bot\]$/, "");
  const hostedReviewBots = new Set(argValues("--hosted-review-bot").map(normalizeLogin));

  const latestReviewByAuthor = (reviews, pr, currentFingerprint) => {
    const byAuthor = new Map();
    for (const review of reviews ?? []) {
      if (!review.author?.login) continue;
      if (review.author.__typename !== "Bot" && review.state === "COMMENTED") continue;
      byAuthor.set(review.author.login, {
        // Other actor types, such as Mannequin, stay unattributed and never count.
        ...(["User", "Bot"].includes(review.author.__typename)
          ? { authorType: review.author.__typename }
          : {}),
        state: review.state,
        submittedAt: review.submittedAt,
        headSha: review.commit?.oid ?? null,
      });
    }
    const fingerprints = new Map();
    for (const [login, review] of byAuthor) {
      if (review.headSha === pr.headRefOid) {
        review.reviewDiffFingerprint = currentFingerprint;
      } else if (
        review.headSha &&
        ((review.authorType === "User" && review.state === "APPROVED") ||
          hostedReviewBots.has(normalizeLogin(login)))
      ) {
        if (!fingerprints.has(review.headSha)) {
          fingerprints.set(
            review.headSha,
            patchIdForEndpoint(`repos/${repo}/compare/${pr.baseRefName}...${review.headSha}`),
          );
        }
        const fingerprint = fingerprints.get(review.headSha);
        if (fingerprint) review.reviewDiffFingerprint = fingerprint;
      }
    }
    return Object.fromEntries(byAuthor);
  };

  const isDependencyBotAuthor = (login) => {
    const normalized = String(login ?? "").toLowerCase();
    return normalized.includes("dependabot") || normalized.includes("renovate");
  };

  const pullRequestFiles = (number, expectedCount) => {
    const pages = JSON.parse(
      gh(["api", "--paginate", "--slurp", `repos/${repo}/pulls/${number}/files?per_page=100`]),
    );
    const files = pages.flat();
    if (Number.isInteger(expectedCount) && files.length !== expectedCount) {
      fail(
        `PR #${number} file snapshot returned ${files.length} of ${expectedCount} changed files`,
      );
    }
    return files;
  };

  // Fallback when the PR diff is unavailable. File records omit removed content,
  // so the head is part of the hash and this evidence never outlives its commit.
  const reviewDiffFingerprint = (files, headSha) => {
    const canonicalFiles = files
      .map((file) => ({
        additions: file.additions,
        changes: file.changes,
        deletions: file.deletions,
        filename: file.filename,
        previousFilename: file.previous_filename ?? null,
        sha: file.sha,
        status: file.status,
      }))
      .sort((left, right) => left.filename.localeCompare(right.filename));
    const canonical = { headSha, files: canonicalFiles };
    return `sha256:${createHash("sha256").update(JSON.stringify(canonical)).digest("hex")}`;
  };

  // Large diffs can be unavailable from GitHub. Keep collection usable and let
  // missing historical fingerprints fail closed at the planner boundary.
  const patchIdForEndpoint = (endpoint) => {
    try {
      const diff = execFileSync(
        "gh",
        ["api", endpoint, "-H", "Accept: application/vnd.github.diff"],
        {
          encoding: "utf8",
          maxBuffer: 32 * 1024 * 1024,
          stdio: ["pipe", "pipe", "pipe"],
        },
      );
      const result = execFileSync("git", ["patch-id", "--verbatim"], {
        input: diff,
        encoding: "utf8",
        stdio: ["pipe", "pipe", "pipe"],
      }).trim();
      const match = result.match(/^([a-f0-9]{40,64})\s+[a-f0-9]+$/);
      return match ? `patch-id:${match[1]}` : undefined;
    } catch {
      return undefined;
    }
  };

  const prsByNumber = new Map();
  let after = null;
  let repoData = null;
  do {
    const requestArgs = [
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
    ];
    if (after) requestArgs.push("-f", `after=${after}`);
    const pageData = JSON.parse(gh(requestArgs)).data?.repository;
    if (!pageData?.pullRequests) fail("GitHub query returned no pull request connection");
    repoData ??= pageData;
    for (const pr of pageData.pullRequests.nodes ?? []) prsByNumber.set(pr.number, pr);
    const pageInfo = pageData.pullRequests.pageInfo;
    after = pageInfo?.hasNextPage ? pageInfo.endCursor : null;
    if (pageInfo?.hasNextPage && !after) {
      fail("GitHub pull request query reported another page without an end cursor");
    }
  } while (after);

  const prNodes = [...prsByNumber.values()];
  if (prNodes.length < (repoData.pullRequests.totalCount ?? 0)) {
    fail("GitHub pull request pagination returned fewer PRs than totalCount");
  }
  repoData.pullRequests.nodes = prNodes;

  const baselineRollup = repoData.defaultBranchRef?.target?.statusCheckRollup;
  const baseline = {
    branch: repoData.defaultBranchRef?.name ?? null,
    headSha: repoData.defaultBranchRef?.target?.oid ?? null,
    checks: checkSummary(baselineRollup),
  };
  baseline.green = baseline.checks.state === "SUCCESS";

  const linkedLinearIssues = (body) =>
    [
      ...new Set(
        [
          ...String(body ?? "").matchAll(
            /https:\/\/linear\.app\/[A-Za-z0-9_-]+\/issue\/([A-Za-z][A-Za-z0-9]*-[0-9]+)(?=\/|[?#)\]\s]|$)/gi,
          ),
        ].map((match) => match[1].toUpperCase()),
      ),
    ].map((issueKey) => ({ issueKey }));

  const prs = (repoData.pullRequests?.nodes ?? []).map((pr) => {
    const files = pullRequestFiles(pr.number, pr.changedFiles);
    // Pin the diff to the snapshot head; the PR diff endpoint follows later pushes.
    const fingerprint =
      patchIdForEndpoint(`repos/${repo}/compare/${pr.baseRefName}...${pr.headRefOid}`) ??
      reviewDiffFingerprint(files, pr.headRefOid);
    return {
      number: pr.number,
      title: pr.title,
      linkedIssues: linkedLinearIssues(pr.body),
      url: pr.url,
      state: "open",
      open: true,
      author: pr.author?.login ?? null,
      isBot: pr.author?.__typename === "Bot",
      isDependencyBot: isDependencyBotAuthor(pr.author?.login),
      isDraft: pr.isDraft,
      draftState: pr.isDraft ? "draft" : "ready-for-review",
      updatedAt: pr.updatedAt,
      changedFiles: pr.changedFiles,
      footprint: [
        ...new Set(
          files.flatMap((file) => [file.filename, file.previous_filename]).filter(Boolean),
        ),
      ],
      reviewDiffFingerprint: fingerprint,
      headRefName: pr.headRefName,
      headSha: pr.headRefOid,
      baseRefName: pr.baseRefName,
      mergeable: pr.mergeable,
      mergeStateStatus: pr.mergeStateStatus,
      reviewDecision: pr.reviewDecision,
      autoMergeArmed: Boolean(pr.autoMergeRequest),
      labels: (pr.labels?.nodes ?? []).map((label) => label.name),
      unresolvedThreads: (pr.reviewThreads?.nodes ?? []).filter((t) => !t.isResolved).length,
      reviewThreadsTruncated: (pr.reviewThreads?.totalCount ?? 0) > 100,
      reviewsTruncated: (pr.reviews?.totalCount ?? 0) > (pr.reviews?.nodes?.length ?? 0),
      latestReviews: latestReviewByAuthor(pr.reviews?.nodes, pr, fingerprint),
      checks: checkSummary(pr.commits?.nodes?.[0]?.commit?.statusCheckRollup),
    };
  });

  const linearTeam = argValue("--linear-team");
  const linearRouteLabel = argValue("--linear-route-label") ?? repo;
  const linearStates = [
    ...new Set(
      [...argValues("--linear-state"), ...argValues("--linear-states")]
        .flatMap((value) => String(value).split(","))
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  ];
  let linear = {
    skipped: "no --linear-team or Linear credential; use tracker tooling",
  };
  if (linearTeam && hasLinearCredential()) {
    try {
      linear = await loadLinearSnapshot({
        request: linearGraphqlRequest,
        selector: linearTeam,
        states: linearStates,
        routeLabel: linearRouteLabel,
        issueRefs: [
          ...receiptReferences.issueRefs,
          ...prs.flatMap((pr) => pr.linkedIssues),
          ...argValues("--linear-issue-key").map((issueKey) => ({ issueKey })),
          ...argValues("--linear-issue-uuid").map((issueUuid) => ({ issueUuid })),
        ],
        issueRefPaths: [
          ...receiptReferences.issueRefPaths,
          ...prs.flatMap((pr, index) =>
            pr.linkedIssues.map((_, position) => `snapshot/prs/${index}/linkedIssues/${position}`),
          ),
          ...argValues("--linear-issue-key").map((_, index) => `--linear-issue-key/${index}`),
          ...argValues("--linear-issue-uuid").map((_, index) => `--linear-issue-uuid/${index}`),
        ],
      });
    } catch (error) {
      fail(`Linear query failed: ${error.message}`);
    }
  }

  let worktrees = [];
  if (!values["no-local-worktrees"]) {
    try {
      worktrees = localWorktrees({ baseline, repo });
    } catch (error) {
      fail(`local worktree query failed: ${error.message}`);
    }
  }

  const snapshot = {
    v: 3,
    generatedAt: new Date().toISOString(),
    repo,
    sources: {
      github: "complete",
      linear: linear.skipped ? "missing" : "complete",
      worktrees: values["no-local-worktrees"] ? "skipped" : "complete",
    },
    baseline,
    footprint: {
      openPrCount: repoData.pullRequests?.totalCount ?? prs.length,
      productPrCount: prs.filter((pr) => !pr.isDependencyBot).length,
      draftPrCount: prs.filter((pr) => pr.isDraft).length,
      readyForReviewPrCount: prs.filter((pr) => !pr.isDraft).length,
      botPrCount: prs.filter((pr) => pr.isBot).length,
      dependencyBotPrCount: prs.filter((pr) => pr.isDependencyBot).length,
    },
    prs,
    worktrees,
    linear,
  };
  const snapshotBytes = Buffer.byteLength(JSON.stringify(snapshot));
  snapshot.usage = {
    elapsedMs: Math.round(performance.now() - startedAt),
    outputBytes: snapshotBytes,
    estimatedOutputTokens: Math.ceil(snapshotBytes / 4),
  };
  if (!validateInput(snapshot))
    throw new Error(
      `collected snapshot violates the v3 contract: ${validateInput.errors[0].instancePath}`,
    );
  return snapshot;
}
export function snapshotOptions(values) {
  const root =
    values.config || (values.state && !path.isAbsolute(values.state))
      ? execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim()
      : process.cwd();
  const config = values.config ? readJson(path.resolve(root, values.config), "--config") : {};
  validatePlannerConfig(config);
  const repo = values.repo ?? config.repo;
  const stateFile = values.state ?? config.stateFile;
  return {
    repo,
    linearTeam: values["linear-team"] ?? config.linearTeam,
    linearRouteLabel: values["linear-route-label"] ?? config.linearRouteLabel,
    hostedReviewBots: values["hosted-review-bot"] ?? config.hostedReviewBots,
    state: stateFile
      ? (() => {
          try {
            return readPlannerState(path.resolve(root, stateFile), repo);
          } catch (error) {
            throw new Error(`--state: ${error.message}`);
          }
        })()
      : undefined,
    limit: values.limit,
    noLocalWorktrees: values["no-local-worktrees"],
    linearStates: [...(values["linear-state"] ?? []), ...(values["linear-states"] ?? [])],
    issueKeys: values["linear-issue-key"],
    issueUuids: values["linear-issue-uuid"],
  };
}
export async function main(args) {
  const parsed = parseCli(args, { usage, options });
  if (!parsed) return;
  console.log(
    JSON.stringify(
      await collectSnapshot(snapshotOptions(parsed.values)),
      null,
      parsed.values.pretty ? 2 : 0,
    ),
  );
}
if (isMain(import.meta.url)) await runCli("tick-snapshot", () => main(process.argv.slice(2)));
