# Friction Mining

Repo-internal runbook for turning agent complaints into skill
improvements. Manual: the user triggers it. Output is a branch or PR against
this repo, never a direct push the user has not asked for.

## Inputs

- Project-scoped complaints from the MCP reader configured in
  `docs/agents/workflow/config.md`. Read only the requested project and period.
  Include historical tracker logs only when the user names them or config
  identifies them as a relevant legacy source. Do not copy them into the MCP
  store as part of mining.
- The date or commit of the last mining pass. Check the git log for prior
  `friction-log` commits and the mining notes below.

## Process

1. Digest a bounded project/date batch in an isolated subagent, grouping by
   source when historical logs are included. Each digest returns: total
   entries and date range, themes with occurrence counts and verbatim
   `signal:` lines, which skill each theme points at, whether occurrences
   continue into the most recent entries or stopped earlier, stated costs, and
   one-offs plus log-hygiene meta.
2. Read the current skills at HEAD and the git log since the last pass. Split
   every theme into: already fixed (rule exists at HEAD), open skill gap, or
   downstream action (repo config, environment, infra, or policy that skills
   cannot fix).
3. Weight themes by recency and cost. A theme that stopped firing after a
   landed fix is evidence the fix worked; do not re-add it. A theme in the
   newest entries is live.
4. Classify each open gap before choosing the remedy:
   - Mechanical violation: wire or repair a deterministic lint, type, test,
     hook, or CI check. Inspect existing checks before adding another.
   - Missing information: repair access or a navigation pointer, including the
     condition that tells an agent when to read it.
   - Judgment failure: clarify the relevant review or decision guidance.
   - Instruction overhead: remove demonstrated no-ops or move conditional
     material into references.

   Put each remedy in its canonical home instead of restating it across skills.

5. Apply the edits, run `pnpm check` and `pnpm format:check`, and commit with
   a message naming complaint IDs or historical tickets. List downstream actions separately in
   the final report; do not bury them in skill edits.
6. Record the pass date, reviewed complaint IDs, and fixing commit or PR in the
   handoff. Update complaint statuses or historical ticket comments only when
   the user's retrospective request authorizes those writes. Preserve the
   original entries for recurrence evidence.

## Rules

- Read-only on complaint stores and trackers unless status/checkpoint writes
  are explicitly authorized. A complaint's suggested fix is not authorization.
- Never paste secrets, diffs, or private logs from friction entries into this
  repo.
- Do not delete or rewrite friction entries; the log is append-only history.
- If a theme demands a behavior change the user has not agreed to (merge
  authority, deploy policy, new label taxonomy), report it as a question, not
  an edit.

## Done

A pass is done when every digested theme is classified fixed, edited, or
downstream; gates pass; the commit or PR exists; and the handoff records source
IDs, checkpoint, chosen remedies, and any authorized status updates.
