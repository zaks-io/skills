# Diagnostic and design skill evaluation

Evaluated: 2026-10-05, on baseline
`23d958d6297e2908cdd17f2f2a3a99c0a0f7e4b4` in worktree
`/home/dev/.t3/worktrees/skills/t3code-bf237882`.
This records validation evidence for adding Debug and Architecture and keeping
Repo Config free of project state. It is not a project backlog.

## Adoption ratings

The author adopted Opus's provisional ratings: Debug 7/10, Architecture 6/10.
They judge workflow value, distinct demand, overlap, and instruction cost rather
than measured effectiveness. The initial author ratings were 9/10 and 8/10;
review correctly challenged the lack of usage evidence. The maintained
rationale is in [the portfolio](../docs/skill-portfolio.md).

## Opus review

Persistent Claude CLI session: `3b2cbef9-a8f8-4211-b9aa-1a7819ed6927`.
Both results verify `claude-opus-5-5`, effort `high`. The reviewer read repository
context and the meaningful delta from the previously reviewed eight-role work,
with read-only tools, no MCP calls, and no external writes.

The initial review found five Medium and ten Low items. The corrections cover
suite distribution and reference validation, bug evidence through the delivery
handoff, diagnostic scope and trust boundaries, stable config/template fields,
glossary roles, and advisory architecture semantics. The recheck returned
`approve`; all Medium findings were resolved. This was Author QA, not independent
PR-head evidence for merge readiness.

The reviewer withdrew its suggestion to restore optional providers as configured:
no enabled integration had been verified. Stable allowed-provider policy remains
in config, while availability is resolved live and historical gaps stay in Linear.

Reviewed final candidate diff SHA-256:
`5694e21cd05b3c5ffdb5120acda10cc8e9d0ec704af4bb582493689d4669e262`.
After approval, remaining Low items were corrected or verified locally: ratings
in this handoff, a broken example sentence, template token recount, frontmatter
rationale, and malformed URI handling with a focused regression. The broad review
was not rerun for those bounded changes.

The new skills keep minimal name/description frontmatter because the generic
skill-creator validator rejects optional Claude `argument-hint` fields. Existing
skills retain their supported hints; invocation examples remain in README.
Both new skills pass that helper, repository validation, and Claude plugin validation.

## Independent behavioral evidence

Fixtures are in [diagnostic-skill-evaluation/cases.json](diagnostic-skill-evaluation/cases.json).
Each case used a fresh delegate with no conversation history, expected answer,
reviewer findings, or author rating. Evaluators were requested as GPT-6 Luna,
effort `xhigh`. Each read one isolated prompt containing its skill, conditional
references, and raw observations. Actions stayed offline and proposed only.

| Case                           | Delegate task under `/root/`     | Observed result                                                                                                                          |
| ------------------------------ | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Diagnosis only                 | `debug_diagnosis_eval`           | Localized the header divergence, requested safe boundary evidence, and left no repair applied.                                           |
| Direct narrow fix              | `debug_fix_eval`                 | Identified the zero/falsy cause, proposed a public regression and local repair, and claimed no verification run or shipping authority.   |
| Repeated intermittent failure  | `debug_intermittent_eval`        | Proposed controlled barriers, real adapter evidence, and bounded samples; did not infer architecture failure from three attempts.        |
| Concrete architecture friction | `architecture_friction_eval`     | Initial response failed to clearly separate unconfirmed API invalidation behavior from structural consolidation. Guidance was tightened. |
| No architecture candidate      | `architecture_no_candidate_eval` | Retained the working module, disclosed evidence limits, and manufactured no candidate or interview.                                      |
| Config without state           | `setup_state_eval`               | Removed snapshots, omitted the unsupported required gate, proposed scoped tracker intake, and left optional integrations disabled.       |

Only the demonstrated architectural failure was rerun, in fresh task
`architecture_friction_recheck`. It separated the suspected API defect from
structural advice, flagged the possible semantic change, and kept intent/failure
questions for Grill after selection. The five other cases retain their initial
scoped evidence; later changes strengthened boundaries without altering their
paths. These outcomes do not prove live integrations, performance improvements,
or all possible debugging scenarios.

## Checks and instruction cost

Final `pnpm ci:check` passed: structure, generated-contract freshness,
253 tests, ten-skill discovery, formatting, and secrets scanning. The new link
gate checks direct Markdown file targets across README, docs, skills, and agents;
it does not validate remote resources or heading anchors. Its regressions cover
reference moves, encoded paths, fenced examples, and malformed escapes.

`claude plugin validate .` passed with the existing root `CLAUDE.md` warning.
Both new skills passed skill-creator quick validation. `git diff --check` passed.
The earlier dependency audit is reused because dependencies did not change.
No application runtime or UI changed.

The [instruction budget](../docs/skill-instruction-budget.md) uses
`tiktoken 0.14.0 / o200k_base`. Debug's entrypoint is 1,034 tokens;
Architecture's is 644. Existing eight entrypoints total 22,473 versus 23,556
at baseline; all ten total 24,151. These are file estimates, not billed tokens.
The disputed `project-config.md` count was independently recomputed as 5,538;
the unchanged number was coincidental, not a stale measurement.

## External records and artifacts

Historical config follow-ups were transferred to
[SKI-5](https://linear.app/zaks-io/issue/SKI-5/retain-workflow-integration-verification-gaps-outside-repo-config)
as parked verification context. Its save response verified the stable team UUID,
and the issue was updated with that evidence. Optional integrations were not
enabled or marked ready for implementation. Project follow-ups stay in Linear;
complaints 27 and 28 stay in Exposure Ledger without mirrored complaint text.

Reviewer prompts, candidate diffs, result JSON, attribution, isolated fixture
snapshots, and case assessments are at
`/tmp/skills-bf237882-diagnostic-review-ff19kckc`. Delegate responses remain in
this T3 thread's child tasks named above. The native Claude transcript is under
`/home/p-skills/.claude/projects/-home-dev--t3-worktrees-skills-t3code-bf237882/`
with the reviewer session ID. Full-gate logs are
`/tmp/skills-bf237882-diagnostic-ci-check.log` and
`/tmp/skills-bf237882-diagnostic-final-ci-check.log`; the measurement script is
`/tmp/skills-bf237882-diagnostic-tokens.py`. Temporary artifacts may not survive
sandbox cleanup.

## Done

Ten skills are discoverable, shared guidance has canonical owners, ratings and
loaded paths are recorded, and Repo Config/templates contain stable policy.
Opus review, bounded behavioral evaluation, and required checks are complete.
No PR, publication, merge, deployment, or downstream refresh was performed.
