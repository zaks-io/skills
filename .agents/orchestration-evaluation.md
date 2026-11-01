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

## Backlog delivery evaluation, 2026-11-01

A fresh GPT-6 Astra session received the revised published instructions and two
offline provider snapshots. The request selected two tickets with one worker
and human-only merges. One ticket was ready; the other lacked Checks and Likely
files. Later evidence confirmed a worker return, a product question on the
second ticket, and a manual merge. The evaluator could run the published local
CLIs but could not inspect implementation or tests or perform external actions.

All seven recording and planning commands succeeded. The evaluator persisted
scope and the worker cap before planning, dispatched the ready ticket, and
selected Triage for the other. It replaced the plan file, reopened saved state,
and recorded the confirmed worker return by action ID alone. The later plan
requested post-merge verification and tracker reconciliation. The unchanged
product question remained a human hold rather than another preparation action.

The evaluator did not invent missing file paths, a product question, or a
successful verification result. It reported that the fictional scenario did not
supply those details. The merged ticket also retained the conservative tracker
reservation until reconciliation, alongside its actionable PR operation.

`action-recording.test.mjs` exercises the action receipt CLI through worker
return and independent review. `orchestration-progress.test.mjs` checks scope
accounting, dependency waits, preparation revisions, limits, and merge handling.
`terminal-pr-snapshot.test.mjs` exercises authoritative terminal collection.
The worker example in the recording guide is executed by the resume suite.

This remains an offline evaluation. It does not establish live notification
delivery, tracker write success, or a measured reduction in runtime token use.

## Independent review and regressions

Two fresh GPT-6 Astra reviews examined the uncommitted change against
`beb146d2c69ad501e21d281a3dd99aba7a5a59b1`. The first found duplicate dispatch
before merge reconciliation, failed-review retry identity reuse, unbounded
completed PR collection, and loss of the confirmed worker branch on resume.
All four were fixed with offline regressions. Its missing-kind classification
finding was already fixed during that review and was confirmed in the recheck.

The recheck found no material issues and passed 253 focused tests, the structure
check, and formatting. It reviewed all 38 changed files at content fingerprint
`85c1fec73f135541c5539273fde59ba2584fc70af427d194e74e70630a30a7ef`, computed from
sorted path and file SHA256 entries. This review note was added afterwards.

The full local gate passed 674 tests, skill discovery, generated-contract
freshness, formatting, and the secrets scan. Claude plugin validation passed
with existing advisory warnings. New history coverage verifies that 51 settled
merges do not consume tracker lookups for a new selection; incomplete or failed
reconciliation receipts remain recoverable.
