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
- `manual_selection_without_planner`: one live worker; the human assignee and
  worktree are not workers. Start remote EXA-33 only. Hold EXA-34 for
  `file-collision`, EXA-32 at the soft budget stop, and EXA-35 for an unknown
  worker kind under configured limits. Not global blockage.
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

All six matched. In the Backlog case the evaluator left EXA-52 outside the
named scope.

## Findings fixed after the run

- Triage's Linear fallback said to query "or stop" without saying which wins.
  It now queries with configured tracker tools and stops only when those fail.
- `planner-input.md` said to run the collector "every tick", which could read
  as a second collection for the PR lane. It now says once per tick.

Other ambiguity notes concern unchanged text: Implement's Author QA paragraph
does not state that QA spends a review round, the delegation prompt lists a
receipt that exists only after launch, and the tracker contract's suitability
threshold for authorization work is judgment-based.

## Artifacts

Full evaluator outputs were kept outside skill discovery at
`/tmp/ziw-simplify-eval-tick.md`, `/tmp/ziw-simplify-eval-review-limits.md`,
`/tmp/ziw-simplify-eval-workflow.md`, and `/tmp/ziw-simplify-eval-slicing.md`.
Temporary files may not survive cleanup.
