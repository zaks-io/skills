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

- A skill entrypoint stays under 500 words; Orchestrate stays under 1,000.
  Its execution details now arrive with the planner's actions.
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

## Single-command orchestration, 2026-10-31

Measured against `beb146d`, including frontmatter and Markdown with `wc -w`.

| Instructions                                 | Before | After |
| -------------------------------------------- | -----: | ----: |
| Orchestrate entrypoint                       |    988 |   944 |
| State recording and recovery example         |    653 |   741 |
| Setup entrypoint                             |    255 |   269 |
| Config template                              |    312 |   361 |
| Orchestrate plus workflow contract           |  1,533 | 1,489 |
| First use or recovery, including the example |  2,186 | 2,230 |
| All published Markdown                       |  7,781 | 7,883 |

One tick command replaces the collection and planning pipeline. Actions carry
worker and review briefs plus typed recording commands. The reference retains
runtime identity and replay semantics; the entrypoint drops conformance handling
because the independent review verdict now carries it.

Generated validators ship to every install and are unformatted Ajv output:
`planner-input-validator.mjs` drops from 2,055,557 to 634,909 bytes, and the
migration-only `state-migration-validator.mjs` adds 953,511 bytes until
migration is retired.

## Backlog delivery update

Measured after combining backlog delivery with the single-command planner on
2026-11-01. Counts use `wc -w`, including frontmatter and Markdown.

| Instructions                       | Words |
| ---------------------------------- | ----: |
| Orchestrate entrypoint             |   648 |
| Triage entrypoint                  |   423 |
| To Issues entrypoint               |   398 |
| State recording and recovery guide |   495 |
| Shared workflow contract           |   608 |
| Orchestrate plus contract          | 1,256 |
| First use with recording guide     | 1,751 |

The planner now supplies action instructions and briefs. Scope, concurrency,
and launch context survive resume without copying config or rebuilding state
maps. These word counts exclude per-action output and do not measure runtime
token savings.

## Ratchet

Measured on 2026-11-04 with `wc -w`, including frontmatter and Markdown. Brief
and tick sizes come from the CLI test fixture: one judged criterion, ten pairs.

| Instructions                     |    Words |
| -------------------------------- | -------: |
| Ratchet entrypoint               |      382 |
| Setup guide, loaded at setup     |      543 |
| Shared workflow contract         |      625 |
| One round: entrypoint + contract |    1,007 |
| Tick output per call             | 11 to 69 |
| Judge brief                      |      133 |
| Critique brief                   |      167 |
| Implementer brief                |      180 |

Each judge brief grows by one line per pair and three to seven lines per judged
criterion. Evidence files dominate judge tokens, so setup sizes each evidence
set near the minimum `init` reports.
