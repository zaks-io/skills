# To Issues slicing evaluation

Evaluated: 2026-10-17. Candidate is the one-slice-per-feature change to
`skills/ziw-to-issues/SKILL.md`, stacked on the PR 21 head `3f68b61`. Fixtures
live in [slicing-evaluation/cases.json](slicing-evaluation/cases.json).

## Why

Agents running To Issues kept splitting one feature into many tickets: seven
for a feature the owner expected as one, three after pushback. Two earlier
fixes (`3616c22`, `5ba0e5f`) stopped layer and fragment tickets, but the split
reasons still let every observable part count as a distinct outcome, made a
different risk label a reason on its own, and invited a tracer bullet followed
by widening slices.

## Method

Each run was a fresh, offline session given only the skill snapshot, the
issue tracker contract, the fixture config, and one spec. The prompt asked for
the draft slice list with estimates, risk labels, and split reasons, any
pre-write questions, and the Done summary. It contained no expected answer.
Tracker, complaint, and network tools were disabled; nothing was written.

Codex runs used `gpt-6.1-sol`, effort high, read-only sandbox. Claude runs used
`claude-sonnet-5-5` with only the Read tool and no MCP servers.

## Results

Baseline columns are the skill before this change: `main` at `671cede` and the
PR 21 rewrite at `3f68b61`. The candidate column is the final stacked text.

| Case                        | Model  | `671cede` | PR 21 | Candidate                     |
| --------------------------- | ------ | --------: | ----: | ----------------------------- |
| `one_feature_many_surfaces` | Sol    |         5 |     5 | 1, at the 16-point maximum    |
| `one_feature_many_surfaces` | Sonnet |         6 |       | 2, size split at ~30 points   |
| `one_feature_small`         | Sol    |         1 |       | 1                             |
| `rollout_gate`              | Sol    |         2 |       | 2, backfill before NOT NULL   |
| `separate_features`         | Sol    |           |       | 4, held for user confirmation |

Every baseline split of the many-surfaces feature cited a distinct CLI, MCP,
UI, or retention outcome; Sonnet also cited different risk labels. The
candidate kept surfaces, retention, tests, and docs together. Sonnet chose one
risk label and named the other risks in the invariants section.

An intermediate draft told agents to ask when the risk policy could not choose
one label. Runs on that draft stopped on that question for ordinary merged
slices, so the final text keeps every risk's checks instead. The
`one_feature_small` case and the intermediate drafts were run on the
`main`-based text, which had the same slicing rules.

Sessions, baseline: Sol `01a14ab5-7901-7132-ac42-efecadd3f231`,
`01a14ab3-964c-7d23-9188-5eb7727f9f51`, `01a14ab3-964c-72e1-b12f-5127efa8286c`,
PR 21 `01a14acf-a81f-7d81-99e7-4439f4212b8f`; Sonnet
`06985273-8110-4398-bdb5-ff4d0f084098`. Candidate: Sol
`01a14acf-a82f-7132-a3e7-f078b519d0af`, `01a14abf-f730-7981-8504-a9d7ce426b18`,
`01a14acf-a82a-71d2-86e5-0e425d36f570`, `01a14acf-a820-7761-9623-a66975d51e9f`;
Sonnet `1e9fd6bd-ece5-4a61-b1fd-cca71a699175`.

## Limits

One run per case and model, so these show direction, not rates. The fixtures
are synthetic; the owner's seven-ticket spec was not available. Size remains
the agent's estimate: an agent that underestimates can still merge too much,
and one that overestimates can still split. Opus was not evaluated.

## Done

The candidate stops surface-by-surface and risk-label splits on the reproduced
case for both model families, keeps the legitimate rollout split, and asks
before writing more than three new slices.
