# Skill instruction budget

Measured 2026-10-27 for the from-scratch rewrite, against `bdda466`. Counts are
words from `wc -w`, including frontmatter and Markdown.

## Entrypoints

| Skill              | Before | After |
| ------------------ | -----: | ----: |
| `ziw-architecture` |    456 |   184 |
| `ziw-code-review`  |  1,618 |   447 |
| `ziw-debug`        |    714 |   256 |
| `ziw-grill`        |    802 |   329 |
| `ziw-implement`    |  1,200 |   346 |
| `ziw-orchestrate`  |  1,145 |   973 |
| `ziw-pr`           |    936 |   279 |
| `ziw-setup`        |    927 |   233 |
| `ziw-to-issues`    |  1,783 |   368 |
| `ziw-triage`       |  1,968 |   383 |

## Common paths

| Path                 | Before | After | Files after                     |
| -------------------- | -----: | ----: | ------------------------------- |
| One Orchestrate tick |  6,561 | 1,535 | `SKILL.md`, `workflow.md`       |
| One Triage run       |  4,672 |   945 | `SKILL.md`, `workflow.md`       |
| All published skills | 32,509 | 7,136 | 18 Markdown files, down from 36 |

## Budget

- A skill entrypoint stays under 500 words; Orchestrate, which carries the
  planner action table, stays under 1,000.
- A normal run loads its skill and the workflow contract, plus at most one
  method reference (the review checklist or a Debug or Architecture guide).
- Adding a rule means removing or replacing one. A rare case gets "stop and
  report", not a new rule.
