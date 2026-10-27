# Planner input contract

Produce valid JSON for `tick-plan` using current provider evidence. Done means
validation passes and each diagnostic is resolved or retained as a hold.
[planner-input.schema.json](planner-input.schema.json) defines all fields and types.

## Steps

1. [Collect and plan](#input-files-and-precedence) with the same state file.
2. [Set policy](#policy-and-evidence) from verified repo config.
3. [Use typed identities](#role-specific-identity) in v3 input.
4. [Resolve diagnostics](#worker-lifecycle-and-unresolved-references) once.
5. [Record review evidence](#review-evidence-and-legacy-boundary) before acting on PR output.

## Input files and precedence

```bash
node <skill-dir>/scripts/tick-snapshot.mjs --repo <owner/repo> \
  --linear-team <KEY|UUID|NAME> --state <state.json> > <snapshot.json>
node <skill-dir>/scripts/tick-plan.mjs <snapshot.json> \
  --config <config.json> --state <state.json>
```

- Use `linear-graphql.mjs setup` once on macOS; otherwise supply `LINEAR_API_KEY`
  or proxy `LINEAR_API_URL` through project tooling, or use configured tracker tools.
- Candidates and active claims require the repo route label.
  Override it with `--linear-route-label <label>`.
- Add `--hosted-review-bot <login>` per configured reviewer to retain historical review fingerprints.
- Use tracker tools for full bodies and comments.
- For only the dependency frontier, run
  `node <skill-dir>/scripts/linear-dag-start.mjs <snapshot.json> --config <config.json>`.

Pass the snapshot directly or as `{ "snapshot": {...}, "config": {...}, "state": {...} }`.
Direct snapshot fields may accompany inline config/state, but not a nested snapshot.

- `--config` overrides inline config; `--state` overrides inline state, which overrides legacy `queue`.
- Merges are shallow; supplied maps replace earlier maps.
- Each file must be a JSON object. Validation precedes merging; overrides cannot hide invalid earlier inputs.
- `snapshot.repo` or `state.repo` must identify `owner/repo`; both must match when present.
- `-` reads stdin for one file; `--pretty` formats output. Use `--debug` only for diagnostics.

## Policy and evidence

Derive values from verified `docs/agents/workflow/config.md`, not by passing the
Markdown file. Include only schema-supported keys and aliases.

| Repo setting                 | JSON field                                                 | Accepted value                                   |
| ---------------------------- | ---------------------------------------------------------- | ------------------------------------------------ |
| Worker concurrency cap       | `workerConcurrencyCap`                                     | Integer at least 0                               |
| Ready state                  | `readyState`                                               | Tracker state name                               |
| Merge authority              | `mergeAuthority`                                           | Configured authority, such as `human` or `agent` |
| Delivery mode                | `deliveryMode`                                             | `production` or `velocity`                       |
| Hosted review bots           | `hostedReviewBots`                                         | Array of bot logins                              |
| Hosted review risk tiers     | `hostedReviewRiskTiers`                                    | Tier or array of `low`, `medium`, `high`         |
| Auto-merge risk tiers        | `autoMergeRiskTiers`                                       | Tier or array of `low`, `medium`, `high`         |
| Required independent reviews | `requiredIndependentReviews`                               | Positive integer or object keyed by risk tier    |
| Require conformance evidence | `requireConformanceEvidence`                               | Boolean                                          |
| Local budget stops           | `localBudgetSoftStopPercent`, `localBudgetHardStopPercent` | Both 0 to 100, soft no greater than hard         |

- Always pass `mergeAuthority` from config. Missing or blank authority routes merge-ready PRs to human merge.
- Other omitted optional policies keep helper defaults.
- Use exact types: `false`, not `"false"`; `3`, not `"3"`. Policy enums are lowercase.
- Empty label strings disable labels where supported.
- Unknown envelope, config, state, and review-evidence fields are errors.
- Provider records may retain extra metadata; only documented fields affect decisions.
- Never replace an unavailable query with an empty collection.

Routing config also accepts `remoteWorkerPaths`, `localWorkerPaths`,
`defaultWorkerPath`, and `localStartsBelowSoftLimit`. State uses
`localBudgetUsagePercent`. Startable records use `eligibleWorkers`, with aliases
`workerPaths`, `allowedWorkers`, or `workers`.

## Role-specific identity

New producers and handoffs use snapshot `v: 3` and array queue collections.

| Record                     | Identity                         | Associations                                                |
| -------------------------- | -------------------------------- | ----------------------------------------------------------- |
| Issue, metadata, startable | `issueKey`, `issueUuid`, or both | Confirmed claim `sessionId`/`receiptId` when known          |
| Worker receipt             | `receiptId` and/or `sessionId`   | Issue fields, `prNumber`, branch/path, footprint, lifecycle |
| PR                         | Positive integer `number`        | Issue fields or typed `linkedIssues`                        |
| Worktree                   | `path`                           | Branch, head, dirty/merged state, footprint                 |
| Preview                    | `previewId`                      | Optional `prNumber`, URL/path, lifecycle                    |

- `issueKey` is a tracker key; `issueUuid` is a UUID. Session, receipt, and preview IDs are opaque nonblank strings.
- A UUID-shaped session ID remains a session. Do not infer issue identity from its spelling.
- Retired v3 issue fields `id`, `identifier`, `issueId`, `ticket`, and `key` are rejected.
- `issueRef` is resolved output, not producer input.
- Use arrays of typed references such as `{ "issueKey": "SKI-12" }` for `linkedIssues`, `candidateIssues`, `blockedBy`, and `state.scopeIssues`.
- `candidateIssues` selects candidates; `blockedBy` records dependencies, with optional provider `stateType` for satisfied blockers.
- Blockers outside candidate scope never become extra candidates. Metadata supplies aliases, labels, and risk without reserving workers.
- `candidateScope` retains route and requested states for rechecking combined evidence.
- `state.scopeIssues` narrows starts, PR actions, and review-label actions. Other PRs retain collision reservations.
- Empty candidate or requested-scope arrays authorize no starts. Omit requested scope only for queue requests; keep it out of Repo Config.
- Tracker records and dependencies establish aliases; workers and PRs cannot manufacture them.
- Use explicit issue fields or `linkedIssues` for PR authority; branch/path, title, and coincidental-number hints cannot grant it.
- The collector extracts exact Linear issue URLs from PR bodies into `linkedIssues`.
- PR `footprint` contains changed paths and previous filenames for renames; `changedFiles` is a count.
- PR evidence/request maps use positive PR-number keys, never heads, branches, URLs, or issue keys.
- `reviewEvidenceChecks` needs `prNumber` or a typed issue reference for its label target.

## Worker lifecycle and unresolved references

Use [dispatch-policy.md](dispatch-policy.md#worker-concurrency) for worker counting and lifecycle evidence.

- `ISSUE_ALIAS_REQUIRED` needs tracker alias evidence; `REQUESTED_ISSUE_UNKNOWN` needs the requested record.
- `WORKER_ISSUE_UNRESOLVED` means a live worker lacks an issue association.
- `REFERENCED_ISSUE_NOT_FOUND` in `snapshot.linear.identityDiagnostics` preserves a missing record and its source path.
- These diagnostics mean incomplete evidence, not an empty or completed queue.
- Resolve them with one bounded read-only lookup and one replan for the current evidence.
- Shared `--state` lets the collector resolve receipt, scope, dependency, and PR references automatically; do not enumerate those IDs again.
- Add optional references with repeatable `--linear-issue-key` or `--linear-issue-uuid` flags.
- After that lookup, retain missing or contradictory references as diagnostics and request the concrete evidence.
- Do not cycle through ID fields or cache lookup outcomes in Repo Config.
- Fix validation errors at their reported paths. Invalid input exits 1, reports to stderr, and emits no plan.

## Review evidence and legacy boundary

- Reusing equivalent-diff evidence requires an explicit clean `reviewVerdict` and positive `independentReviewCount` or completed `independentReviews` list.
- Filter lists to completed independent reviewers and record their identity; fingerprints alone cannot create a verdict or review.
- Record reviewed identity in `reviewedDiffFingerprint` or `reviewedReviewDiffFingerprint`, plus `reviewedHeadSha`.
- `reviewRelevantDiffFingerprint` identifies the current diff.
- Explicit `state.hostedReviewByPr` fields override derived fields, including completion and `skipped`.
- Keep verdicts, fingerprints, counts, and conformance tied to current provider evidence; valid JSON grants no currency or mutation authority.
- Apply output through [Review lifecycle and evidence](integrate-checklist.md#review-lifecycle).
