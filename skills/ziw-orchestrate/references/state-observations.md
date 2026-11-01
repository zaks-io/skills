# Record and recover orchestration state

`planner-state.mjs` saves local observations. It performs no external actions. Invalid updates leave state unchanged. Pass `--repo`
and `--state` to every subcommand. `init` creates v3 state. `migrate [--dry-run]`
converts retired formats once with a byte-preserving backup.
Inspect the writer after a lock error; never remove a lock while it may be writing.

## Selection and results

`init --scope EXA-1,EXA-2 --worker-cap 1` persists selection and a lower worker
cap. Omit either option on resume to preserve it; `default` restores its default.
Actions supply `instruction`, context, brief, and a typed `record` command.
Run that command after confirming the result. If `action.record.stdin` exists,
pass that exact JSON to its stdin to preserve PR identity for later merge collection.
Never invent runtime identities.

Recover each saved session or receipt through config. Read its current run and
retrieve its result before recording it. Delayed notifications may concern earlier runs. Recover launches interrupted before receipt storage through the
runtime and claimed ticket. Unresolved evidence holds that ticket.

## Worker and review example

Keep confirmed session, receipt, and run IDs on later observations.

```sh
S=<skill-dir>/scripts
ZIW_STATE=.ziw/state.json
node "$S/planner-state.mjs" init --repo example/app --state "$ZIW_STATE"
node "$S/planner-state.mjs" worker --repo example/app --state "$ZIW_STATE" \
  --issue EXA-1 --branch agent/exa-1 --footprint src/a.ts \
  --session S1 --receipt T1 --run W1 --status running
node "$S/planner-state.mjs" worker --repo example/app --state "$ZIW_STATE" \
  --session S1 --receipt T1 --run W1 --status returned \
  --pr 42 --head h1 --pr-url https://github.com/example/app/pull/42
node "$S/planner-state.mjs" review-request --repo example/app --state "$ZIW_STATE" \
  --pr 42 --session R1 --receipt RT1 --head h1 --fingerprint patch-id:fp1
node "$S/planner-state.mjs" review-result --repo example/app --state "$ZIW_STATE" \
  --pr 42 --session R1 --receipt RT1 --verdict APPROVE --count 1
```

A failed or stopped review uses `review-request --status failed|stopped` with
its saved identity. Results fill head and fingerprint from the matching request
and complete it atomically. `--count 1` means one fresh independent review.
`NEEDS REVISION` records blocking findings. Author QA cannot satisfy review.
Replay preserves terminal results; superseded identities cannot finish newer work.

## Preparation and merges

```sh
node "$S/planner-state.mjs" preparation --repo example/app --state "$ZIW_STATE" \
  --issue EXA-1 --outcome ready --reason 'Required metadata confirmed' \
  --updated-at <confirmed-tracker-revision>
node "$S/planner-state.mjs" merge-result --repo example/app --state "$ZIW_STATE" \
  --pr 42 --head h1 --merge-commit m1 --check passed --issue EXA-1 \
  --tracker-updated-at <confirmed-tracker-revision>
```

Preparation also accepts `needs-slicing` or `needs-human`. An unchanged revision
with unresolved preparation, or a `ready` result still missing metadata, holds.
Failed verification uses `--check failed` without `--tracker-updated-at`.
Resolve it by rerunning the
post-merge check, then rerun the same merge-result command with the actual outcome.
Success requires the confirmed tracker update time. A later nonterminal ticket
revision after completed reconciliation requires a human decision.

## Tracker fallback

`record <file|->` applies supported JSON observations, including `linearIssues`
and `hostedReviewByPr`. Patches have no `v` or `repo`; the state envelope does.
When collection skips the tracker, supply a complete scoped `linearIssues` array
with `issueKey` or `issueUuid`, `state`, `stateType`, `labels`, `footprint`,
`updatedAt`, `blockedBy`, and `missingSections`.
Include dependency facts without expanding scope. Tick again before readiness or merge actions.
