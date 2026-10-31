# Record and recover orchestration state

Use `planner-state.mjs` to initialize saved state or record confirmed observations.
It changes local state only; it never launches workers, queries providers, or
authorizes actions. Config supplies the runtime's observation and recovery methods.
The planner still decides what may run.

## Recording contract

Pass `--repo` and `--state` to every subcommand. `init` creates missing v3 state;
`record <file|->` applies a JSON observation. `worker`, `review-request`, and
`review-result` build typed observations. `migrate [--dry-run]` converts an older
file once with a byte-preserving backup. `--help` is offline.
Only one writer may hold the state lock. A lock error means inspect the writer;
never delete a lock while its owner may still be writing.

An observation uses the existing state fields:

| Field                | Update                                                                                                                                                                            |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `dispatches`         | Match saved workers by session or receipt ID, preserving their issue and file reservations. New records need an issue, branch, and footprint.                                     |
| `reviewRequestsByPr` | Record a running review by PR number, with its session or receipt, `headSha`, and `reviewDiffFingerprint`. A confirmed `failed` or `stopped` observation must match that request. |
| `reviewEvidenceByPr` | Record the matching session's verdict, `reviewedHeadSha`, `reviewedDiffFingerprint`, and `independentReviewCount`. This completes its request atomically.                         |
| `hostedReviewByPr`   | Update the named PR's hosted-review fields. A pending request needs its fingerprint and clears old completion flags.                                                              |
| `scopeIssues`        | Replace the requested scope; `null` restores default scope.                                                                                                                       |
| `linearIssues`       | Replace the tracker fallback listing with a fresh, complete listing of the scope.                                                                                                 |

For older pending reviews missing a session or head, record the recovered
request with those fields before its result. Superseded receipts cannot replace
newer runs or reviews.

Worker status is `running`, `returned`, `failed`, or `stopped`, based on current
runtime evidence. Include `runId` whenever the runtime supplies it, including
later observations. A different run can start after the saved run ends; an older
run's result cannot finish the newer one. Replaying a launch preserves its
terminal status, including when both records lack `runId`. Without run IDs,
follow-up work needs a fresh worker on the same ticket branch, with new session
and receipt IDs wherever supplied. Reusing either saved ID identifies the ended
worker. A missing response or inaccessible session is unknown, not failed.
Leave its record intact and report the hold.

Recover the saved session or receipt after interruption. Read the current run
and retrieve its result before recording it; a delayed notification alone may
refer to an earlier run. If launch succeeded before its receipt was saved,
recover it through the runtime and the claimed ticket before launching again.
If that cannot be established, report the hold.

## Worked example

These fictional IDs stand for confirmed runtime receipts. Use both session and
receipt IDs when supplied, and retain the run ID on later worker observations.

```sh
S=<skill-dir>/scripts
ZIW_STATE=.ziw/state.json
node "$S/planner-state.mjs" init --repo example/app --state "$ZIW_STATE"
node "$S/planner-state.mjs" worker --repo example/app --state "$ZIW_STATE" \
  --issue EXA-1 --branch agent/exa-1 --footprint src/a.ts \
  --session S1 --receipt T1 --run W1 --status running
```

On resume, recover `S1` through config. Replaying its receipt preserves the saved
worker's terminal state. Once the runtime confirms `W1` returned PR 42:

```sh
node "$S/planner-state.mjs" worker --repo example/app --state "$ZIW_STATE" \
  --session S1 --receipt T1 --run W1 --status returned --pr 42
```

Tick again. When review is requested, launch a fresh session and save its receipt:

```sh
node "$S/planner-state.mjs" review-request --repo example/app --state "$ZIW_STATE" \
  --pr 42 --session R1 --receipt RT1 --head h1 --fingerprint patch-id:fp1
```

A confirmed failed or stopped review uses the same identity with
`review-request --status failed` or `--status stopped`. The saved request supplies
its head and fingerprint when omitted. The next tick can request a fresh review.

Once the report arrives, record its verdict and the number of independent reviews
it represents. `--count` is required; use 1 for one fresh review session.

```sh
node "$S/planner-state.mjs" review-result --repo example/app --state "$ZIW_STATE" \
  --pr 42 --session R1 --receipt RT1 --verdict APPROVE --count 1
```

The helper fills the reviewed head and fingerprint from the matching saved
request inside the same locked transaction, sets `blockingFindings: false`, and
completes that request. `NEEDS REVISION` sets the blocking flag. A mismatched
identity fails. Replaying the same result is harmless.

Use `record` for `scopeIssues`, `linearIssues`, and `hostedReviewByPr`, and for any
other supported observation needing the full JSON form. Observation patches
have no `v` or `repo`; the file envelope does. Collect fresh provider facts and
tick again before marking ready or merging.
