# Orchestration recovery evaluation

Evaluated 2026-10-29 against the state-recording changes based on `84fb8ec`.

## Method

A fresh GPT-6.1 Sol session at high effort received Orchestrate, the shared
workflow contract, the state example, and three offline cases. Each asked it
to resume one tick for two ready tickets with worker capacity one. It received
saved state, a provider snapshot, and runtime observations, without expected
answers or implementation context. It could execute the documented local CLIs
but could not read implementation source or tests or perform external actions.

## Observed behavior

| Case                                                                  | Result                                                                                                                                                                         |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Saved worker S1/W1 is still running                                   | Preserved its reservation. The planner emitted no dispatch.                                                                                                                    |
| Worker returned PR 42; pending reviewer R1 completed with approval    | Recorded the matching report and completed the request atomically. The planner emitted dispatch for the other ticket and mark-ready for PR 42, without another review request. |
| Saved worker S1/W2; delayed W1 completion; current status unavailable | Ignored the old notification, preserved W2, and reported unavailable current evidence. No receipt or completion was invented.                                                  |

All eight case recording and planning commands succeeded. The evaluator
distinguished a saved running reservation from fresh confirmation that a worker
is live. The unavailable-runtime hold appeared in its report, leaving saved
state intact.

## Checks and limits

Automated CLI scenarios in [orchestration-resume.test.mjs](../test/orchestration-resume.test.mjs)
cover resume, interruption before receipt persistence, unknown status, and the
literal shell commands in the published example. Regression scenarios in
[state-replay.test.mjs](../test/state-replay.test.mjs) cover superseded receipts,
preserving legacy review records, and enriching older pending reviews.

This was one fresh session with three synthetic cases. It checks instruction
application, not a success rate or live provider integration. Runtime notification
delivery and recovery APIs remain repo-config responsibilities.
