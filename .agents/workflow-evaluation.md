# Workflow skill evaluation

This records the earlier eight-role candidate. The subsequent Debug,
Architecture, and state-free config changes have separate evidence in
[diagnostic-skill-evaluation.md](diagnostic-skill-evaluation.md).

Evaluated: 2026-10-05. Changes remain local and uncommitted on baseline
`23d958d6297e2908cdd17f2f2a3a99c0a0f7e4b4`.
Fixtures live in [workflow-evaluation/cases.json](workflow-evaluation/cases.json).

## Opus review

Claude CLI verified `claude-opus-5-5`, effort `high`, in persistent session
`b24eb193-73da-4b80-b659-e9f01582362e` in this worktree. The cross-family review
used Author QA mode with read-only tools and no external writes. It did not
produce the independent PR-head evidence required for merge readiness.

The first review found three P2 and four P3 issues. All seven were fixed.
The delta review returned `READY FOR PR`, with evidence `LEAVE UNCHANGED`.
One further P3 about legacy tracker-primary summaries and category scope was
corrected afterward in the docs and matching template summaries.

Reviewed candidate diff SHA-256:
`b034e870a3bad008e2c60879ffb31f71796d91b365e06cb099811ab720328cbe`.
Later changes tighten partial-answer handling, clarify existing legacy routing,
and update measurements and this handoff. Local delta inspection covers those
changes; the affected Grill behavior also has the isolated evaluation below.
The broad review did not run on the final working tree.

## Behavioral evidence

A fresh Opus 5.5 high session, `076fb734-3674-4887-8d27-356458762326`,
applied candidate skill snapshots to nine offline cases. Its prompt supplied
raw observations and relevant tool schemas, without expected answers or author
conclusions. Proposed calls were inspected; no fixture actions were executed.

| Case                                | Observed outcome                                                                                                                       |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `grill_round`                       | Batched independent actor and period questions; held the dependent notification question.                                              |
| `partial_round_answer`              | Failed initially: added exclusivity, imported a 30-day recommendation from another case, and displaced the unanswered period question. |
| `complaint_primary_success`         | Used supported MCP fields; stopped storage after success and preserved the missing-check limitation.                                   |
| `reviewer_missing_complaint_writer` | Stored nothing, reported the gap, and stayed within Author QA authority.                                                               |
| `configured_legacy_glossary`        | Preserved configured legacy authority and left the conflicting draft untouched.                                                        |
| `conflicting_glossaries`            | Requested authority resolution without choosing by filename or editing either file.                                                    |
| `architecture_assessment`           | Presented a concrete candidate and alternatives; kept uncertain intended behavior open, with no implementation or tickets.             |
| `legacy_tracker_complaints`         | Used the authorized legacy sink once and reported the migration gap.                                                                   |
| `ambiguous_complaint_reply`         | Checked the reader, recognized acceptance, and avoided a retry or fallback duplicate.                                                  |

Grill now records only confirmed constraints, carries unanswered ready questions
into the next round, and grounds recommendations in the current task's evidence.
Only `partial_round_answer` was rerun, in fresh Opus 5.5 high session
`2a4d837a-f9d6-49de-9ba6-27db47e09209`, with its own fixture and skill text.
The rerun preserved the nonexclusive permission, reasked the period question,
held notification timing, and supplied no invented numerical default. Its
suggested policy bounds were labeled an assumption rather than confirmed intent.

The nine cases shared one evaluator context; the initial cross-case leakage
shows its limitation. The isolated rerun validates the demonstrated failure,
not every possible planning scenario. These are offline decisions, not live
tracker or complaint integration tests. Earlier answers from the combined
review/evaluation session are excluded from behavioral evidence.

## Validation and instruction budget

The settled candidate passed `pnpm ci:check`: formatting, structure, generated
contract freshness, 250 tests, eight-skill discovery, and the secrets scan.
`claude plugin validate .` passed with its existing root `CLAUDE.md` warning.
`pnpm security:audit` passed its high-severity threshold; one moderate advisory
remains with dependencies unchanged. No application runtime or UI changed.

Final instruction and documentation edits passed `pnpm check`,
`pnpm format:check`, local Markdown target checks, and `git diff --check`.
The full gate is reused because the final edits change only guidance and docs.

Estimated entrypoint tokens fell from 23,556 to 22,197, about 5.8%.
Setup fell from 4,521 to 2,584, about 43%. The
[instruction budget](../docs/skill-instruction-budget.md) records the tokenizer
and conditional reference costs; these are estimates, not billed tokens.

## Artifacts

Review prompts, candidate diffs, result JSON, fixture snapshots, and session
attribution are outside published discovery at
`/tmp/skills-bf237882-opus-review-jyutr4yg`. Full-gate logs are
`/tmp/skills-bf237882-ci-check.log` and
`/tmp/skills-bf237882-final-ci-check.log`. Native Claude transcripts are retained
under `/home/p-skills/.claude/projects/-home-dev--t3-worktrees-skills-t3code-bf237882/`
with the session IDs above. Temporary artifacts may not survive sandbox cleanup.

Final skill-tree snapshot SHA-256:
`09246d74a645af0e0df336b01d36523754896a9e04b5a54edf83475646226713`.
The method hashes sorted skill file paths and contents with NUL delimiters;
`handoff-snapshot.json` records it alongside the baseline. This is a different
snapshot format from the reviewed candidate diff and makes no new review claim.

## Done

The eight published roles incorporate the selected upstream guidance, complaint
storage has one configured primary, affected behavior has bounded evidence, and
checks pass. No PR, publication, merge, deployment, or downstream refresh was
performed.
