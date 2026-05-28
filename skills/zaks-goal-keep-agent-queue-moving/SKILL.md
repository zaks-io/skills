---
name: zaks-goal-keep-agent-queue-moving
description: Use when running the loop whose goal is to keep the implementation queue moving across Linear issues, worker agents, PR review, CI checks, and Changes Requested feedback loops.
---

# Zaks Keep Agent Queue Moving

Coordinate work. Do not turn the queue-moving loop into the default local
implementer.

## Required Context

Read these first:

- `AGENTS.md`
- `docs/ops/project-status.md`
- `docs/ops/status/phase-backlog.md`
- `docs/agents/workflow.md`
- `docs/agents/autonomous-loop.md`
- `docs/agents/issue-tracker.md`
- `docs/agents/environment-adapters.md`
- `docs/agents/skill-usage.md`

## Loop

On each run:

1. List project issues from the repo's configured Linear project or roadmap.
2. Find `Todo` issues with `ready-for-agent`, no blockers, and no active
   assignee/delegate.
3. Find active `In Progress`, `Blocked`, `In Review`, `Changes Requested`, and
   `Ready to Merge` issues.
4. Include agent-ready issues filed by
   `zaks-goal-review-main-and-queue-fixes` in the same queue as other
   `Todo` + `ready-for-agent` work.
5. Check PR state for active work before starting new work.
6. Select work by milestone order, dependency order, priority, risk, and
   file/package contention.
7. Choose an executor runtime:
   - Cursor Composer 2.5 for isolated, well-scoped implementation work.
   - Codex for local repo edits, verification, queue maintenance, and PR
     watching.
   - Claude for planning, docs/spec refinement, or second-pass review.
8. Build a prompt package from the issue, linked docs, repo instructions,
   required checks, and runtime adapter.
9. Delegate the work and record the run in Linear.
10. Require or run a pre-PR local review with
    `zaks-local-code-review` where the environment supports it.
11. Watch PRs, failed checks, stale branches, blockers, and review comments.
12. Update Linear using `docs/agents/autonomous-loop.md`.

## Review Loop

For a PR opened by a delegated worker:

1. Confirm the implementation branch received a pre-PR local review when
   feasible.
2. Create or use a clean local worktree for the PR.
3. Run `zaks-review-pr` using the strongest available review model and
   reasoning tier.
4. Post actionable findings as normal GitHub PR review comments.
5. Move Linear to `Changes Requested` when fixes are required.
6. Reply in the original worker thread whenever possible so the same
   environment, branch, and PR continue.
7. Include PR comments, failed checks, acceptance gaps, and security concerns
   the worker must address.
8. After the worker pushes fixes, rerun review from a clean worktree.
9. Move the issue back to `In Review` for another pass, then to
   `Ready to Merge` only when review and required checks are clean.

## Runtime Bias

Use Cursor Composer 2.5 whenever the issue is agent-ready, implementation-heavy,
and locally or CI verifiable.

Do not route to Cursor by default when the issue needs new product judgment,
security posture changes, credentials, provider approval, ADR changes, or broad
planning. Escalate those to a human or use a planning/review agent first.

The queue-moving loop remains responsible for quality: issue interpretation, code
review, test quality, security invariants, CI status, PR feedback loops, and
surfacing important risks to the user.

## Escalation

Escalate instead of improvising when work needs:

- product scope not captured in the issue
- a security posture change
- credentials, provider approval, hosted deploys, or production smoke tests
- an ADR decision or contradiction
- merge authority
- cross-issue tradeoffs

## Guardrails

- Never assign blocked work to an implementation worker.
- Never delegate Cursor work without both `ready-for-agent` and `remote-cursor`.
- Never add `ready-for-agent` unless the issue body contract is satisfied.
- Never start a fresh worker for review fixes when the original worker thread is
  still available.
- Never merge PRs unless a human explicitly grants that authority.
