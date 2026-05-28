---
name: zaks-goal-review-main-and-queue-fixes
description: Use when running the periodic loop whose goal is to review new main-branch commits and queue fixes by filing actionable Linear issues for bugs, security regressions, or product-contract drift.
---

# Zaks Review Main And Queue Fixes

Run a sidecar quality loop for `main`. This is a review-and-ticketing loop, not
an implementer and not a PR reviewer.

## Review Model

Use the strongest available code-review-capable model and reasoning setting for
this skill. If only a lower-tier reviewer is available, state that limitation in
the run summary and escalate security, schema, or cross-cutting findings instead
of advancing them on weak evidence.

## Required Context

Read these first:

- `AGENTS.md`
- `docs/ops/project-status.md`
- `docs/ops/status/phase-backlog.md`
- `CONTEXT.md`
- `docs/specs/README.md`
- `docs/adr/README.md`
- `docs/agents/workflow.md`
- `docs/agents/issue-tracker.md`
- `docs/agents/autonomous-loop.md`
- `docs/agents/skill-usage.md`
- changed app or package `README.md` files for the reviewed range

When the reviewed commits touch product direction, security posture, domain
language, package boundaries, build order, or hosted operations, also read the
relevant specs, ADRs, runbooks, or status ledgers named by the changed files.

## Loop

On each scheduled run:

1. Fetch the remote state for `main`.
2. Resolve the current remote head, usually `origin/main`.
3. Load the last-reviewed `origin/main` SHA from runtime-owned state outside
   the repo.
4. If no checkpoint exists, initialize it to the current `origin/main` SHA and
   stop unless the user explicitly asked for a backfill review.
5. If the current SHA matches the checkpoint, stop without creating issues.
6. If the checkpoint is not an ancestor of the current SHA, review the reachable
   commit range that is safe to reason about. If no reliable merge base exists,
   escalate instead of guessing.
7. Create a disposable worktree at the current `origin/main` SHA.
8. Review the diff from checkpoint to current SHA.
9. File Linear issues for actionable problems that should enter the
   implementation queue.
10. Advance the checkpoint only after the review and any required Linear issue
    creation complete.
11. Remove the disposable worktree before finishing, unless preserving it is
    needed for debugging.

Use a runtime-owned checkpoint path such as
`${CODEX_HOME:-$HOME/.codex}/automation-state/zaks-goal-review-main-and-queue-fixes/last-reviewed-origin-main`,
not a tracked repo file.

## Review Scope

Review the new commit range as merged product state, not as an individual PR
handoff.

Check:

- correctness bugs, broken contracts, or regressions introduced by the range
- gaps between committed behavior and the Linear issue or PR intent when that
  context is visible
- security invariant violations from repo docs, ADRs, and changed package
  context
- cross-layer invariant drift where the local change passes tests but the
  merged workflow violates a spec, ADR, route contract, or issue requirement
- API keys, signed URLs, bearer tokens, provider credentials, or other secrets
  leaking into code, tests, docs, logs, screenshots, examples, or Linear prose
- authorization shortcuts that bypass documented tenant boundaries, role checks,
  scopes, operator gates, or storage isolation
- drift from `CONTEXT.md`, `docs/ops/project-status.md`, specs, ADRs, or
  accepted domain language
- missing tests or verification for risky changes
- follow-up work that was discovered but not captured in Linear

Run local checks when they are meaningful for the changed range and cheap enough
for the periodic loop. Prefer focused tests, `pnpm openapi:check`, or package
typechecks for targeted ranges; reserve `pnpm verify` for broader or
cross-package findings.

## Linear Issue Creation

Create Linear issues only for real, actionable findings. Do not file
low-confidence observations, style preferences, duplicate work, or broad product
questions as agent-ready implementation work.

Before creating a new issue, search existing project issues for a matching problem,
affected file, or commit range. If an existing issue covers it, comment with the
new evidence instead of creating a duplicate.

For each new issue:

- team: use the configured Linear team from `docs/agents/issue-tracker.md`
- project: use the configured project or roadmap from
  `docs/agents/issue-tracker.md`, selecting the closest milestone when present
- labels: use the canonical labels from `docs/agents/triage-labels.md`; apply
  `ready-for-agent` only when the body satisfies the full agent-ready contract
- state: `Todo` only when agent-ready and unblocked; otherwise use the default
  new-issue state or closest configured backlog state with `needs-info` or
  `ready-for-human`
- optional labels: apply existing bug, tech-debt, risk, or area labels when the
  team already has them; do not invent non-canonical labels during this loop

Issue bodies must include:

```md
## Outcome

Fix the reviewed-main finding in one concrete slice.

## Context

- AGENTS.md
- CONTEXT.md
- docs/ops/project-status.md
- relevant local context/spec/ADR docs
- Reviewed main range: <old-sha>..<new-sha>

## Finding

What the review found, with file and line references when available.

## In scope

The smallest implementation surface that should fix the issue.

## Out of scope

Product decisions, unrelated cleanup, and any adjacent follow-up not needed for this fix.

## Acceptance criteria

- [ ] Locally verifiable criteria.

## Required checks

Named commands or evidence.

## Security invariants

Metadata-only, no secrets or signed credentials, and any relevant package-specific invariants.

## Dependencies

Known blockers or "None".
```

Keep Linear prose metadata-only. Never include raw secret material, provider
credential details, signed URL fragments, screenshots containing secrets, or
logs that could contain secrets.

## Output

Summarize each run with:

- reviewed range or "no new commits"
- non-linear history or checkpoint problems, if any
- checks run and meaningful failures
- Linear issues created or existing issues updated
- checkpoint advanced to the reviewed SHA
- residual risk or reason for escalation

## Guardrails

- Do not modify product code in this loop.
- Do not merge, revert, or force-push anything.
- Do not create `ready-for-agent` issues unless they satisfy
  `docs/agents/autonomous-loop.md`.
- Do not create Linear tickets for deferred-scope work still parked in
  `docs/ops/status/phase-backlog.md`.
- Escalate instead of ticketing when the finding needs product scope, security
  posture, credential, provider, ADR, customer, deploy, or production-smoke
  judgment.
- Treat review findings as queue input for
  `zaks-goal-keep-agent-queue-moving`; ordinary fixes should be handled
  by the normal implementation agent loop.
