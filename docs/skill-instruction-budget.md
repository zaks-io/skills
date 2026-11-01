# Skill instruction budget

Measured 2026-10-29 for the from-scratch rewrite, against `bdda466`. Counts are
words from `wc -w`, including frontmatter and Markdown.

## Entrypoints

| Skill              | Before | After |
| ------------------ | -----: | ----: |
| `ziw-architecture` |    456 |   184 |
| `ziw-code-review`  |  1,618 |   441 |
| `ziw-debug`        |    714 |   256 |
| `ziw-grill`        |    802 |   328 |
| `ziw-implement`    |  1,200 |   313 |
| `ziw-orchestrate`  |  1,145 |   967 |
| `ziw-pr`           |    936 |   257 |
| `ziw-setup`        |    927 |   233 |
| `ziw-to-issues`    |  1,783 |   369 |
| `ziw-triage`       |  1,968 |   383 |

## Common paths

| Path                 | Before | After | Files after                     |
| -------------------- | -----: | ----: | ------------------------------- |
| One Orchestrate tick |  6,561 | 1,512 | `SKILL.md`, `workflow.md`       |
| One Triage run       |  4,672 |   928 | `SKILL.md`, `workflow.md`       |
| All published skills | 32,509 | 7,044 | 18 Markdown files, down from 36 |

## Budget

- A skill entrypoint stays under 500 words; Orchestrate, which carries the
  planner action table, stays under 1,000.
- A normal run loads its skill and the workflow contract, plus at most one
  method reference (state recovery, the review checklist, or a Debug or Architecture guide).
- Adding a rule means removing or replacing one. A rare case gets "stop and
  report", not a new rule.

## Orchestration recovery update

Measured against `84fb8ec`, also on 2026-10-29. The tables above retain the
original rewrite measurements.

| Instructions                                 | Before | After |
| -------------------------------------------- | -----: | ----: |
| Orchestrate entrypoint                       |    967 |   988 |
| Setup entrypoint                             |    233 |   255 |
| Config template                              |    273 |   312 |
| State recording and recovery example         |      0 |   653 |
| Orchestrate plus workflow contract           |  1,512 | 1,533 |
| First use or recovery, including the example |  1,512 | 2,186 |
| All published Markdown                       |  7,046 | 7,781 |

The entrypoint replaces manual receipt and review JSON instructions with a
validated state recorder. The additional reference supplies the recording
contract and one complete example; routine ticks do not reload it.
