# Planner input contract

Run the collector and planner once per tick with one shared state file. Done means
`tick-plan` accepts the input and each diagnostic is resolved or kept as a hold.
[planner-input.schema.json](planner-input.schema.json) defines every field;
validation errors name the failing path.

## Steps

1. [Run the scripts](#run-the-scripts) with the shared state file.
2. [Write config JSON](#config-json) from verified repo config.
3. [Record workers and review evidence](#state-records) in the state file.
4. [Resolve diagnostics](#diagnostics) with one lookup, then hold.

## Run the scripts

```bash
node <skill-dir>/scripts/tick-snapshot.mjs --repo <owner/repo> \
  --linear-team <KEY|UUID|NAME> --state <state.json> > <snapshot.json>
node <skill-dir>/scripts/tick-plan.mjs <snapshot.json> \
  --config <config.json> --state <state.json>
```

- Linear access: run `linear-graphql.mjs setup` once on macOS. Otherwise supply
  `LINEAR_API_KEY` or a `LINEAR_API_URL` proxy through project tooling, or use
  configured tracker tools.
- Candidates and active claims need the repo route label. Override it with
  `--linear-route-label <label>`.
- Add `--hosted-review-bot <login>` for each configured hosted reviewer.
- For only the dependency frontier, run
  `node <skill-dir>/scripts/linear-dag-start.mjs <snapshot.json> --config <config.json>`.
- Use tracker tools for full issue bodies and comments.
- Invalid input exits 1, reports errors on stderr, and emits no plan. Fix the
  reported paths. `--pretty` formats output; use `--debug` only to diagnose a decision.

## Config JSON

Derive values from verified `docs/agents/workflow/config.md`; never pass the
Markdown file. Include only schema fields.

| Repo setting                 | JSON field                                                                                | Accepted value                                   |
| ---------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------ |
| Worker concurrency cap       | `workerConcurrencyCap`                                                                    | Integer at least 0                               |
| Ready state                  | `readyState`                                                                              | Tracker state name                               |
| Merge authority              | `mergeAuthority`                                                                          | Configured authority, such as `human` or `agent` |
| Delivery mode                | `deliveryMode`                                                                            | `production` or `velocity`                       |
| Hosted review bots           | `hostedReviewBots`                                                                        | Array of bot logins                              |
| Hosted review risk tiers     | `hostedReviewRiskTiers`                                                                   | Tier or array of `low`, `medium`, `high`         |
| Auto-merge risk tiers        | `autoMergeRiskTiers`                                                                      | Tier or array of `low`, `medium`, `high`         |
| Required independent reviews | `requiredIndependentReviews`                                                              | Positive integer or object keyed by risk tier    |
| Require conformance evidence | `requireConformanceEvidence`                                                              | Boolean                                          |
| Local budget stops           | `localBudgetSoftStopPercent`, `localBudgetHardStopPercent`                                | Both 0 to 100, soft no greater than hard         |
| Worker routing               | `remoteWorkerPaths`, `localWorkerPaths`, `defaultWorkerPath`, `localStartsBelowSoftLimit` | Configured worker paths and limit                |

- Always pass `mergeAuthority`. Missing or blank authority routes merge-ready PRs to human merge.
- Omitted optional policies keep helper defaults.
- Use exact types and lowercase enums: `false`, not `"false"`; `3`, not `"3"`.
- Empty label strings disable labels where supported.

## State records

The state file carries what only you know: the worker ledger, requested scope,
budget usage, and review evidence.

- Identify issues by `issueKey`, `issueUuid`, or both. Arrays such as
  `linkedIssues`, `blockedBy`, and `state.scopeIssues` hold typed references,
  such as `{ "issueKey": "SKI-12" }`.
- Record each dispatch with the session or receipt ID the worker runtime
  supplied. Never derive one from an issue, branch, or worktree.
- Keep a dispatch `running` until the provider confirms return, stop, or
  failure. Opening or linking a PR does not end it.
- `state.scopeIssues` limits starts and PR actions to the named issues. An
  empty list authorizes no starts. Omit it for queue-wide runs; never store it
  in Repo Config.
- Set `localBudgetUsagePercent` only from a real budget reading.
- Link PRs to issues only through explicit issue fields or `linkedIssues`.
  Branch names and titles never grant PR authority.
- Clean review evidence needs an explicit `reviewVerdict`, a positive
  `independentReviewCount` or a list of completed independent reviewers with
  identities, plus `reviewedDiffFingerprint` and `reviewedHeadSha`. A
  fingerprint alone creates no verdict or review.
- Explicit `state.hostedReviewByPr` fields override derived hosted-review
  state, including `skipped`.
- Never record a failed or unavailable query as an empty collection.
- Valid JSON grants no authority and proves no currency. Apply output through
  [Review lifecycle](integrate-checklist.md#review-lifecycle).

## Diagnostics

`ISSUE_ALIAS_REQUIRED`, `REQUESTED_ISSUE_UNKNOWN`, `WORKER_ISSUE_UNRESOLVED`,
and `REFERENCED_ISSUE_NOT_FOUND` mean incomplete evidence, not an empty or
finished queue.

- Make one bounded read-only lookup: rerun the collector with the shared
  `--state`, adding repeatable `--linear-issue-key` or `--linear-issue-uuid`
  flags for references it cannot find on its own.
- Replan once. Keep remaining diagnostics as holds and name the missing evidence.
- Do not cycle through ID fields or cache lookup results in Repo Config.
