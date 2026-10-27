# Normal-path-first evaluation

Evaluated 2026-10-27 for branch `t3/simplify-skills`, candidate head
`9c3c745`. This records offline instruction validation, not live integration
results.

## Change under test

Orchestrate, Triage, To Issues, and Implement open with steps an agent can act
from in the common case; request-level modes and fallbacks sit under one later
heading. Rules the planner scripts already apply moved from `planner-input.md`
and `dispatch-policy.md` to `docs/planner-internals.md`, leaving agents the
inputs they write, the diagnostics they resolve, and a compact manual fallback.

## Method

Four fresh GPT-6.1 Sol/high T3 sessions applied the candidate skills to raw
cases without scoring guides, author conclusions, or worker reports. Each case
was independent; every provider response was a fixture, and no case command,
complaint, tracker write, PR mutation, or worker launch ran. The author wrote
the tick-case expectations below from the pre-change rules at `bdda466` before
any evaluator ran.

| Set                                                                                                           | Cases | Rubric                                                                                                                         | Result  |
| ------------------------------------------------------------------------------------------------------------- | ----: | ------------------------------------------------------------------------------------------------------------------------------ | ------- |
| [tick](workflow-evaluation/tick-cases.json)                                                                   |     6 | [Tick cases](#tick-cases)                                                                                                      | 6 pass  |
| [review limits](review-limits-evaluation/cases.json)                                                          |    12 | [review-evaluation.md](review-evaluation.md#review-limit-cases)                                                                | 12 pass |
| [workflow](workflow-evaluation/cases.json) plus [proportionate](workflow-evaluation/proportionate-cases.json) |    16 | [workflow-evaluation.md](workflow-evaluation.md), [proportionate-workflow-evaluation.md](proportionate-workflow-evaluation.md) | 16 pass |
| [slicing](slicing-evaluation/cases.json)                                                                      |     4 | [slicing-evaluation.md](slicing-evaluation.md)                                                                                 | 4 pass  |

Code Review, Grill, Debug, Architecture, and Setup were unchanged, so their
review and diagnostic sets were not rerun. Slicing matched the recorded counts:
one, one, two across the rollout gate, and four held for confirmation.

## Tick cases

These cases cover the moved worker-counting, identity, diagnostic, and
manual-selection rules, and the regrouped Triage modes.

- `worker_pr_without_return`: S1 keeps its slot despite its open PR; returned S2
  frees one. Claim EXA-22 before launch, record receipt R-88 without inventing a
  session ID, hold EXA-23 for capacity, and request fresh-context review of PR 32.
  The planner also emits `request-review` for PR 31; hold it because S1 is still
  pushing.
- `manual_selection_without_planner`: two live workers, session S1 and
  receipt-only R-5; the human assignee and worktree are not workers, leaving
  headroom one. Start remote EXA-33 only and hold EXA-37 for capacity. Hold
  EXA-34 for `file-collision`, EXA-32 at the soft budget stop, and EXA-35 for an
  unknown worker kind under configured limits. Not global blockage.
- `unresolved_reference_hold`: the queue is not clear. After one lookup and one
  replan, both diagnostics stay holds naming the missing evidence; S9 still
  counts. No ID cycling or Repo Config caching.
- `backlog_backfill_without_promotion_authority`: include Backlog. Do not
  promote EXA-50 without Backlog promotion authority; keep EXA-51 a container.
  EXA-52 may be promoted as normal intake or left as outside the named scope.
- `rate_limited_mid_run`: stop every tracker call at the rate limit; report
  EXA-61 and EXA-62 promotions and the EXA-63 risk label as pending.
- `snapshot_skips_linear`: one bounded `list_issues` fallback feeds the
  planner; promote EXA-70 after verifying the contract; withhold EXA-71's
  readiness with the exact Out of scope gap.

- `merge_ready_pr_in_triage_output`: clear EXA-81's review-evidence label and
  PR 43's human-merge label. Leave PR 40's human-merge label and EXA-82's
  review-evidence label unapplied; report both as Orchestrator next actions
  that need its readiness preflight. Also hand Orchestrator the planner's
  review request for PR 41, check fix for PR 43, and human-merge route for
  PR 40; PR 42 waits on checks. No reviewer or fix launch, no code-host thread
  reads, and no `Ready to Merge` move.

The first six matched on the first run. In the Backlog case the evaluator left
EXA-52 outside the named scope. The seventh case was added with the
[ownership fixes](#ownership-fixes); its expectation was written from those
rules before its evaluator ran.

GPT-6 Astra review round 1 found that the first case's fixture claimed the
planner suppresses actions for a PR whose worker is running; it does not. The
case now supplies the planner's real `request-review` for PR 31, and the second
case adds a receipt-only worker and a capacity-bound candidate. Both were rerun
after the review fixes below.

## Findings fixed after the run

- Triage's Linear fallback said to query "or stop" without saying which wins.
  It now queries with configured tracker tools and stops only when those fail.
- `planner-input.md` said to run the collector "every tick", which could read
  as a second collection for the PR lane. It now says once per tick.
- Review round 1: the manual fallback lost receipt-only worker counting and
  terminal-receipt precedence; the published contract lost per-ticket
  `eligibleWorkers`, which callers supply, and the `v: 3` requirement for
  hand-built snapshots, which validation does not enforce. All three are restored.
  Round 2 confirmed them and caught that state takes no version field; the
  contract now requires `v: 3` on the snapshot only.

Other ambiguity notes concern unchanged text: Implement's Author QA paragraph
does not state that QA spends a review round, the delegation prompt lists a
receipt that exists only after launch, and the tracker contract's suitability
threshold for authorization work is judgment-based.

## Ownership fixes

Commit `d72e4fc` settles two contradictions found after the simplification
review. Code Review said only Orchestrator mutates merge-ready state, while
Triage applied the planner's review-evidence and human-merge actions. Triage
now applies only clear actions, which are fail-safe, and reports apply actions
to Orchestrator, whose readiness preflight reads beyond Triage's evidence
boundary. Delegation policy also named an Integrate role that never existed;
Orchestrator now merges only through the integrate checklist.

This narrows Triage's authority, so it was evaluated and reviewed as its own
change: a fresh GPT-6.1 Sol/high session ran the four Triage tick cases and
the proportionate `missing_ticket_location` case at `d72e4fc`, and GPT-6 Astra
reviewed `5ce6d37..d72e4fc` from round 1.

All five matched their expectations. In the merge-ready case the evaluator
cleared only EXA-81 and PR 43, handed both apply actions to Orchestrator with
the preflight reason, and made no code-host reads. It also noted that Triage's
evidence boundary named only tracker tools for mutations, although clearing a
human-merge label writes to the code host; that exception now sits under the
rule.

Astra round 1 found the new case's planner fixture incomplete: for the same
facts, `tick-plan` also emits `route-human-merge` for PR 40, `request-review`
for PR 41, `route-check-fix` for PR 43, and a checks wait for PR 42. The
fixture now lists the planner's actual output, taken from a CLI replay. A
fresh Sol/high session reran the case at `bf6a153` and passed: two clears,
every other planner action handed to Orchestrator, and PR 42 left waiting.
Both evaluators noted that Triage's generic configured-label authority sits
far from the clear-only rule, and that the planner tags label actions with
owner `orchestrator`; both still followed the specific rule.

Astra round 2 replayed the corrected fixture, confirmed the new Triage line
grants only the clear, and approved `5ce6d37..bf6a153` with no findings.

## Artifacts

Full evaluator outputs were kept outside skill discovery at
`/tmp/ziw-simplify-eval-tick.md`, `/tmp/ziw-simplify-eval-review-limits.md`,
`/tmp/ziw-simplify-eval-workflow.md`, and `/tmp/ziw-simplify-eval-slicing.md`.
The ownership runs are at `/tmp/ziw-simplify-eval-triage-ownership.md` and
`/tmp/ziw-simplify-eval-merge-ready-rerun.md`. Temporary files may not survive
cleanup.
