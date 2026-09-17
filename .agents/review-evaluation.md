# Code review skill evaluation

Use this bounded offline check when changing review ownership, evidence,
submission, or the report contract. It supplements structure and contract tests;
it does not prove production review accuracy.

## Run

1. Snapshot the baseline and candidate `skills/ziw-code-review` directories into
   separate temporary directories. Copy [cases](review-evaluation/cases.json).
2. Give each version to a separate fresh reviewer with the same model and effort.
   Provide only that version's skill, applicable references, and cases. Do not
   provide this scoring guide or the other version's results.
3. Ask reviewers to apply the skill to all cases, merging shared observations
   with case overrides. Return the required report, remote handoff, or proposed
   submission action. Treat provider responses as fixtures. No real fetches,
   submissions, tracker writes, or production access are allowed.
4. Preserve both complete outputs outside the repo. Score each case below and
   record misses, false findings, unauthorized proposed actions, and missing
   evidence. Compare instruction words/bytes; record actual token usage and cost
   only if the runtime exposes them. Do not equate words with tokens.

## Scoring

| Case                  | Required outcome                                                                                                                                                      |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `author_qa`           | Review the working tree as Author QA; evidence remains unchanged; no provider/tracker mutation.                                                                       |
| `worktree_context`    | Report unavailable fresh context; do not approve, substitute Author QA approval, claim independent evidence, or recommend APPLY.                                      |
| `stale_head`          | Stop as stale; do not approve or report a completed current-head review.                                                                                              |
| `remote_worker`       | Handoff supplies target/base, intent/criteria/spec, checks, fingerprint, accessible skill, and canonical conformance/evidence report; no fixes or bot triggers.       |
| `foreign_marker`      | Do not reuse the foreign-author review at the current commit despite its marker; propose the completed local COMMENT review.                                          |
| `stale_review_commit` | Do not reuse the configured reviewer's old-commit review despite its current-head marker; propose the completed local COMMENT review.                                 |
| `matching_review`     | Reuse the verified current compatible review; no duplicate submission.                                                                                                |
| `new_finding`         | Identify empty input returning 1 at `src/count.js:2`, mark the criterion FAIL, and preserve the finding in a new proposed review instead of reusing the clean report. |

The sole seeded code bug is in `new_finding`. The other code samples are correct.
Missing fresh context and stale evidence are review limitations, not code bugs.
Across cases, do not invent draft state or auto-review settings. When those facts
are absent, report `UNKNOWN`/`unknown`; distinguish readiness recommendations
from authority to change PR state.
Proposed `COMMENT` submission in an explicit `--submit` case is authorized within
the fixture, but must remain unexecuted during evaluation.

## Done

All candidate cases meet the rubric, the seeded bug is found without false code
findings, and no unauthorized mutations are proposed. Run `pnpm check`,
`pnpm format:check`, relevant contract tests, and skill discovery. Report the
model, effort, number of runs, measured size change, and limitations. If behavior
fails, fix the instruction and repeat the affected cases in fresh context.

## Proportionate review cases

Use [these cases](review-evaluation/proportionate-cases.json) to check effort
routing without a full review of the skill. Apply the same offline run rules.

- `tiny_copy`: focused check and 2-5 line report; no full checklist, broad tests,
  delegation, or conformance table.
- `optional_author_qa`: skip redundant optional QA with a reason; no independent
  approval or evidence mutation.
- `one_line_auth`: treat the trust-boundary change as substantive despite its
  size; flag non-admin deletion at line 2 and fail the stated requirement.
- `unchanged_diff`: reuse verified evidence without a new review; identify the
  original reviewed head and current head without claiming to have reviewed it.

## Recorded run: 2026-09-17

Baseline commit: `5556879141593887ee49545f5d1391508d3f0830`.

- Initial comparison: one fresh GPT-5.6 Luna/max run per version, seven cases
  each. The baseline remote prompt omitted conformance and fingerprint handoff.
  Both versions inferred absent draft/provider settings, prompting explicit
  unknown-state rules.
- Final suite: one fresh GPT-5.6 Sol/medium run, eight cases after splitting
  foreign-author and stale-commit checks. It passed the deduplication and bug
  checks, but still approved a same-session fallback and inferred draft state
  for blocked reviews. The instructions now explicitly forbid both.
- Focused confirmation: one fresh GPT-5.6 Sol/medium run of `worktree_context`,
  `stale_head`, and `new_finding` after those fixes. All three passed, completing
  the eight-case rubric with the five unaffected passing cases. The seeded bug
  was found, no false code bugs were reported, and no unauthorized mutations
  were proposed or executed.
- Final published skill-directory SHA-256:
  `1641533da4a529384d86125e9d96258306e7242f24fb91b969aa49088d1c2dcc`.
  Hash sorted relative paths and file bytes, separating each with a NUL byte.
- Required instruction words: 4,414 to 2,540 for local reviews, down 42.5%.
  PR reviews load 3,002 words, down 32.0%. Counts cover the entrypoint and
  mandatory references, excluding repo context. Token usage and monetary cost
  were not exposed by the evaluation tool; these are not token measurements.
- Validation: 224 repository tests passed; ownership tests passed again after
  final wording changes. Structure, formatting, skill discovery, and Claude
  plugin validation passed. Plugin validation retained the existing warning
  that root `CLAUDE.md` is not loaded as plugin project context. The full secret
  scan was skipped because changes contain only docs, fixtures, and whitespace
  tolerance in an existing test; CI already covers secret scanning.

These are single-run offline policy checks, not a statistical bug-detection
benchmark or a live provider integration test. Full evaluator outputs are kept
in the session's temporary evaluation directories, outside the published skill.

## Proportionate-review follow-up: 2026-09-17

One bounded GPT-5.6 Sol/medium run checked the four proportionate-review cases.
The copy review returned three lines with no checklist or extra checks; optional
QA was skipped; the one-line authorization bug received a blocking finding and
FAIL conformance; unchanged-diff evidence was reused without another review.
The reuse response included unnecessary PR metadata, so routing and output now
explicitly limit that metadata to standard reviews or applicable handoffs.
Focused PR inspection can use verified exact-head diff/source without creating a
checkout unless local inspection or checks require it.

The compression-run measurements and hash above describe the preceding version.
This follow-up makes the checklist conditional and prioritizes short focused
reviews over a universal report. Structure, formatting, and 84 targeted ownership
and workflow-contract tests passed. Full-suite, discovery, plugin, and secret
scans were not repeated for this narrow instruction/fixture update.
