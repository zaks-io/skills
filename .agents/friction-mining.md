# Friction Mining

Repo-internal runbook for turning the orchestrator friction logs into skill
improvements. Manual: the user triggers it. Output is a branch or PR against
this repo, never a direct push the user has not asked for.

## Inputs

- The friction-log tickets. Find them in each downstream repo's
  `docs/agents/workflow/config.md` (Work Coordination → friction intake), or
  ask the user which tickets to mine.
- The date or commit of the last mining pass. Check the git log for prior
  `friction-log` commits and the mining notes below.

## Process

1. Digest each friction ticket in an isolated subagent, one per ticket, so raw
   comment threads never enter the main context. Each digest returns: total
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
4. For open skill gaps, prefer mechanism over prose: a script, gate, config
   verification, or structured artifact beats another paragraph. Add prose
   rules only for judgment calls a mechanism cannot make, and put each rule in
   its canonical home (issue-tracker contract, operating profile, or one
   skill) instead of restating it across skills.
5. Apply the edits, run `pnpm check` and `pnpm format:check`, and commit with
   a message naming the mined tickets. List downstream actions separately in
   the final report; do not bury them in skill edits.
6. Post one comment on each mined ticket noting the pass date and the commit
   or PR that addressed it, so the next pass has a checkpoint and the
   orchestrator can reference fixes instead of re-filing entries.

## Rules

- Read-only on Linear except the checkpoint comment in step 6.
- Never paste secrets, diffs, or private logs from friction entries into this
  repo.
- Do not delete or rewrite friction entries; the log is append-only history.
- If a theme demands a behavior change the user has not agreed to (merge
  authority, deploy policy, new label taxonomy), report it as a question, not
  an edit.

## Done

A pass is done when every digested theme is classified fixed, edited, or
downstream; gates pass; the commit or PR exists; and each mined ticket carries
the checkpoint comment.
