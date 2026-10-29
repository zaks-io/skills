# Record and recover orchestration state

Use `planner-state.mjs` to initialize saved state or record confirmed observations.
It changes local state only; it never launches workers, queries providers, or
authorizes actions. Config supplies the runtime's observation and recovery methods.
The planner still decides what may run.

## Recording contract

Pass `--repo`, `--state`, and optionally `--record <JSON file or ->`. Without
`--record`, it creates missing state and preserves existing state. `--help` is offline.
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

These fictional receipts illustrate one ticket. Replace them with confirmed
runtime evidence. The shell examples use stdin so each update needs no extra file.

After a worker launches, save its receipt:

```sh
S=<skill-dir>/scripts
ZIW_STATE=.ziw/state.json
node "$S/planner-state.mjs" --state "$ZIW_STATE" --repo example/app --record - <<'JSON'
{"dispatches":[{"issueKey":"EXA-1","sessionId":"S1","runId":"W1","branch":"agent/exa-1","footprint":["src/a.ts"],"status":"running"}]}
JSON
```

On resume, initialize with the same command without `--record`. The saved worker
survives. Recover `S1` through config; if it is still running, follow the runtime's
completion instructions. Replaying the receipt updates that worker rather than
adding another. Once the runtime confirms `W1` returned PR 42:

```sh
node "$S/planner-state.mjs" --state "$ZIW_STATE" --repo example/app --record - <<'JSON'
{"dispatches":[{"sessionId":"S1","runId":"W1","status":"returned","prNumber":42}]}
JSON
```

Take a fresh snapshot and plan. When the plan requests review, launch a fresh
review session and save its receipt before ending the tick:

```sh
node "$S/planner-state.mjs" --state "$ZIW_STATE" --repo example/app --record - <<'JSON'
{"reviewRequestsByPr":{"42":{"sessionId":"R1","headSha":"h1","reviewDiffFingerprint":"patch-id:fp1","status":"running"}}}
JSON
```

The next tick sees a pending review. Recover `R1`; once its report arrives:

```sh
node "$S/planner-state.mjs" --state "$ZIW_STATE" --repo example/app --record - <<'JSON'
{"reviewEvidenceByPr":{"42":{"sessionId":"R1","reviewedHeadSha":"h1","reviewedDiffFingerprint":"patch-id:fp1","reviewVerdict":"APPROVE","independentReviewCount":1}}}
JSON
```

The helper saves that verdict, sets `blockingFindings: false`, and marks request
42 completed in one write. Other workers and PR records remain unchanged.
For `NEEDS REVISION`, it sets the blocking flag instead. Replaying the same result
is harmless; a result for another session, head, or fingerprint is rejected.
Collect fresh provider facts and replan before marking ready or merging.
