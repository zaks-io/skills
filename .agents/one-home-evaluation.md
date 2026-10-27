# One-home trim evaluation

Evaluated 2026-10-27 for the skill instruction trim on branch `t3/trim-skills`,
candidate head `951900ea7e0f38b29b59e0f3dfb8b35a8bd921dd`. This records offline
instruction validation, not live integration results.

## Method

Four fresh GPT-6.1 Sol/high T3 sessions applied the trimmed skills to every
existing fixture set without scoring guides, author conclusions, or worker
reports. Each case was independent; all provider responses were fixtures and
no case commands, complaints, tracker writes, or launches ran.

| Set                                                                                                           | Cases | Rubric                                                                                                                         | Result  |
| ------------------------------------------------------------------------------------------------------------- | ----: | ------------------------------------------------------------------------------------------------------------------------------ | ------- |
| [review](review-evaluation/cases.json) plus [proportionate](review-evaluation/proportionate-cases.json)       |    12 | [review-evaluation.md](review-evaluation.md)                                                                                   | 12 pass |
| [review limits](review-limits-evaluation/cases.json)                                                          |    12 | [review-evaluation.md](review-evaluation.md#review-limit-cases)                                                                | 12 pass |
| [workflow](workflow-evaluation/cases.json) plus [proportionate](workflow-evaluation/proportionate-cases.json) |    16 | [workflow-evaluation.md](workflow-evaluation.md), [proportionate-workflow-evaluation.md](proportionate-workflow-evaluation.md) | 16 pass |
| [diagnostic](diagnostic-skill-evaluation/cases.json) plus [slicing](slicing-evaluation/cases.json)            |    10 | [diagnostic-skill-evaluation.md](diagnostic-skill-evaluation.md), [slicing-evaluation.md](slicing-evaluation.md)               | 10 pass |

Slicing matched the recorded candidate counts: one slice for the many-surface
feature, one for the small feature, two across the rollout gate, and four held
for confirmation.

## Findings fixed after the run

- The shared friction pointer loaded `friction-log.md` only for tracker
  fallback, categories, or rollups. Ambiguous or failed writes and legacy
  tracker-primary intake need its reconciliation rules. Evaluators reached them
  only by stretching the wording; GPT-6 Astra review round 1 reported the same
  gap. The pointer now names those conditions.
- Reviewers and implementers followed "one home" links into the 2,600-token
  integrate checklist although their own sentence sufficed. Role skills now
  state the rule they need without linking the orchestrator's checklist, and
  skill maintenance links a home only when the role must load its detail.

Remaining ambiguity notes predate the trim, such as the absent review verdict
for blocked context and the undefined round boundary for an in-flight review.

## Artifacts

Full evaluator outputs were kept outside skill discovery at
`/tmp/ziw-trim-eval-review.md`, `/tmp/ziw-trim-eval-review-limits.md`,
`/tmp/ziw-trim-eval-workflow.md`, and `/tmp/ziw-trim-eval-diag-slicing.md`.
Temporary files may not survive cleanup.
