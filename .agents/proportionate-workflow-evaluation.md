# Proportionate workflow evaluation

Evaluated 2026-10-16 for PR 22 in worktree
`/home/dev/.t3/worktrees/skills/t3-60b3c53b`. This records instruction validation,
not project state or live integration results.

## Method

GPT-6.1 Sol, effort `high`, evaluated the seven
[raw cases](workflow-evaluation/proportionate-cases.json) in a fresh T3 child
without implementation history, expected answers, or reviewer conclusions.
Each case was independent within that evaluation session. The evaluator read
the edited skill and applicable references, then proposed actions, commands,
questions, and a user-facing handoff. All case provider observations were
fixtures. No case commands, tracker writes, PR mutations, or worker launches ran.

Task ID:
`node:delegated-task:command%3Amcp%3A8d2c54ab-621a-44be-a5e5-dfbff14581e2%3Adelegate-task%3Apr22-proportionate-behavior-eval-20261016-r1`.
The backing child thread has the same ID with the prefix `thread:` instead of
`node:`. Full evaluator output is retained by that task and locally at
`/tmp/pr22-60b3c53b-proportionate-eval.md`. Temporary files may not survive cleanup.

## Observed decisions

The author inspected all proposed commands, questions, and handoffs. All seven
cases followed the intended scope and authority boundaries.

| Case                                   | Observed proposal                                                                                                                                                                         |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Broken docs link called from Implement | Rerun only the configured link check; leave the full delivery gate to hooks/CI. No extra regression test.                                                                                 |
| Zero timestamp bug                     | Add a public-interface regression, observe failure, apply the narrow predicate repair, and run both required checks. No shipping authority inferred.                                      |
| Confirmed scoped terminology           | Return directly to Implement. No new spec, readiness question, tracker handoff, or repeated clarification.                                                                                |
| Authorization scope change             | Stop expansion of the copy ticket. Ask only unresolved audit/concurrency questions, then maintain Draft until explicit readiness approval and document checks.                            |
| One renamed Setup command              | Verify the command and its CI dependency, patch one field, and preserve unrelated mappings without claiming revalidation. No provider query.                                              |
| Ticket missing only location           | Use the supplied single filename-only lookup, propose the body/readiness repair, and rerun the affected DAG check. No code contents, tests, or human path-finding question.               |
| One snapshot, two lanes                | Reuse inventory, refresh affected records before claim/draft mutations, and reuse mutation responses. Dispatch the unrelated ticket while advancing the PR; stop before human-only merge. |

The evaluator distinguished supplied responses from actual execution. In the
last case it did not invent a worker launch receipt or label mapping. In the
changed-boundary case it accepted the confirmed permission direction and asked
only the remaining questions. No demonstrated case required a corrective rerun.

## Checks and limits

`nvm exec 24 pnpm ci:check` passed with Node 24.21.0: formatting, structure,
generated-contract freshness, 512 tests, ten-skill discovery, and secrets scan.
The existing offline collector fixture now explicitly selects its stubbed
Linear endpoint instead of inheriting the sandbox endpoint. No environment
workaround or disabled check was used. Its focused collector/transport tests
also passed, 27 tests. Friction was recorded once under known issue ZAK-617.

`claude plugin validate .` passed with the existing root `CLAUDE.md` warning
and marketplace-install advice. Debug and Architecture passed skill-creator's
quick validator; other skills retain their supported Claude frontmatter and
pass the repository validator. `git diff --check` passed.

The [instruction budget](../docs/skill-instruction-budget.md) compares the actual
stack base, original PR head, revised entrypoints, and representative reference
paths. Eight rewritten entrypoints fall from 20,872 to 17,976 estimated tokens,
13.9%, and are 6.9% below the PR 21 base. This measures instruction size, not
billed usage or live task performance.

These seven proposed-action cases do not prove live integrations or cover all
possible wording, concurrency, or dependency failures. No app runtime or UI
changed. Required independent PR review is recorded with its reviewed commit
in the PR description as local review only.
