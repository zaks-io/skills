---
name: ziw-orchestrate
description: Use to orchestrate tracked work for a ticket set, issue tracker filter, or project. Runs the planner each tick, starts workers, gets reviews, merges or hands off PRs, and stops when nothing safe is left.
argument-hint: "[ticket-ids|filter|project|until-clear]"
---

# Orchestrate

Run the delivery loop. Each run is one tick: plan, do everything the plan
allows, save state, exit. The planner scripts decide what happens; this skill
says how to carry out each action. Terms and rules follow the
[workflow contract](../ziw-setup/references/workflow.md).

## Inputs

Repo config, `docs/agents/workflow/planner.json`, the planner state file, and a
scope: ticket IDs, a filter or project, or by default all ready and active
tickets. Optional limits on ticks or time. For a worker limit, plan with a copy
of `planner.json` that lowers `workerConcurrencyCap`.

## Each tick

1. Plan. On the first tick, create the state file as `{}`.

   ```sh
   S=<skill-dir>/scripts
   node $S/tick-snapshot.mjs --repo <owner/repo> --linear-team <team> \
     --linear-route-label <route label> --state <state-file> > /tmp/snapshot.json
   node $S/tick-plan.mjs /tmp/snapshot.json \
     --config docs/agents/workflow/planner.json --state <state-file>
   ```

   For named tickets, a project, or a filter, first set `scopeIssues` in the
   state file to the scope's tickets, such as `[{"issueKey": "EXA-1"}]`. Remove
   it for the default scope. If the snapshot skipped the tracker, fetch
   the scope with tracker tools, add the tickets to the state file as
   `linearIssues`, each with a `footprint` listing its Likely files, and plan
   again.

2. Do every entry in `actions`, using the table below. Start workers first.
3. Leave `waits` alone; they clear on their own. Report each `hold` with its
   reason. If a hold names missing evidence, make one lookup, plan once more,
   and report what is still missing.
4. Save the state file and exit. For a recurring run, schedule the next tick
   with the runtime's scheduler. If there isn't one, tell the user what to
   schedule.

Stop the run when the scope is done, or when everything left waits on a human.
If a script fails, stop and report the error.

## Actions

- `dispatch`: move the ticket to `targetState`, then
  [start a worker](#start-a-worker). If the move fails, don't start.
- `derive-footprint`: the ticket has no Likely files the planner can read.
  Move it to the intake state, swap `ready-for-agent` for `needs-info`, and
  name the gap.
- `promote-ready`: move the ticket to `targetState`.
- `request-review`: move the ticket to `In Review`, then
  [get a review](#get-a-review).
- `route-fix`, `route-review-fix`, `route-check-fix`, `route-conflict-fix`:
  send the findings, failing checks, or conflict to the PR's worker. For
  `route-fix` and `route-review-fix`, also move the ticket to
  `Changes Requested`.
- `update-branch`: run `gh pr update-branch <pr>`.
- `verify-checks`: no checks reported on this head. Rerun CI once; if it still
  doesn't run, report it.
- `mark-ready`: mark the draft PR ready for review.
- `request-hosted-review`: trigger the configured hosted reviewer, then record
  `{"hostedReviewPending": true, "hostedReviewDiffFingerprint": "<fingerprint>"}`
  under the PR in `hostedReviewByPr`. If the reviewer is unavailable, report it
  as a hold.
- `resolve-hosted-review-mode`: check whether the hosted reviewer runs on its
  own, and record `"autoReviewMode": "enabled"` or `"disabled"` under the PR in
  `hostedReviewByPr`.
- `verify-conformance`: a stale record from an older skill version. Remove
  `conformance` and `conformanceHeadSha` from the PR's `reviewEvidenceByPr`
  entry and plan again.
- `apply-human-merge-pr-label`, `clear-human-merge-pr-label`: add or remove
  `needs-human-merge` on the PR.
- `route-human-merge`: [check the PR](#before-a-merge), move the ticket to
  `Ready to Merge`, and tell the user it's ready for them to merge.
- `arm-auto-merge`: [merge](#merge).
- `reconcile-empty-pr`: find out why the PR has no diff. Close it only if its
  work already merged; otherwise ask its worker.

## Start a worker

Launch one worker per ticket on a configured worker path, with this brief:

> Use `ziw-implement` on `<ticket URL>`. Branch `<ticket branch>`.
> Scope: `<one sentence>`. Out of scope: `<sibling tickets>`. Report the PR
> URL and head when done.

Add it to `dispatches` in the state file:

```json
{
  "issueKey": "EXA-2",
  "sessionId": "S1",
  "branch": "agent/exa-2-x",
  "footprint": ["src/b.ts"],
  "status": "running"
}
```

Use `receiptId` instead of `sessionId` when the launcher returns only a
receipt. Set `status` to `returned` when the worker reports back, back to
`running` when you send it more work, and to `failed` if it dies. Send later
instructions to the same worker.

## Get a review

Launch Code Review in a new session, on a different model from the author when
one is available:

> Use `ziw-code-review` in independent mode on `<PR URL>`. Base `<base>`.
> Fingerprint `<reviewDiffFingerprint>`. Review only changes since
> `<deltaFrom>`, if given, and confirm these earlier findings are fixed:
> `<findings>`. Criteria: `<ticket URL>`.

While it runs, record
`{"reviewDiffFingerprint": "<fingerprint>", "status": "running"}` under the PR
in `reviewRequestsByPr`, so the next tick doesn't start a second review. Set
`status` to `completed` when it finishes, and record the result under the PR in
`reviewEvidenceByPr`:

```json
{
  "reviewedHeadSha": "h1",
  "reviewedDiffFingerprint": "fp1",
  "reviewVerdict": "APPROVE",
  "independentReviewCount": 1
}
```

For a blocking review, use its verdict and add `"blockingFindings": true`.
Comment the verdict on the ticket. After three blocked reviews of one ticket,
stop reviewing it and ask a human.

## Before a merge

Re-read the PR. If anything about it changed since the snapshot, do nothing now
and let the next tick replan.

## Merge

1. [Check the PR](#before-a-merge), then merge it with the configured method.
   If branch rules require it, use auto-merge.
2. Confirm the merge, update the local default branch, and run the post-merge
   check.
3. Move the ticket to `Done` and remove `ready-for-agent`, unless the tracker
   already did. If the post-merge check fails, report it as a broken default
   branch.

## Rules

- Never write code or review diffs yourself; workers and Code Review do that.
- One ticket, one worker, one branch, one PR.
- Don't widen the user's scope.

## Done

Report tickets and PRs changed, workers running, holds with reasons, decisions
needed from the user, and whether the loop continues.
