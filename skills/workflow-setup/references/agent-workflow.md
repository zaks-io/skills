# Agent Workflow Reference

Use this when writing or refreshing `docs/agents/workflow/config.md`.

## Roles

- Agent Queue: keeps tracked work moving, delegates ready implementation work,
  requests independent review, updates tracker state, and stops on human
  blockers.
- Agent Implement: owns one ready issue from claim through implementation, code
  review, iteration, PR creation, and tracker update.
- Agent Review: reviews PRs from a clean subagent or disposable worktree using
  `workflow-code-review`; also reviews main-branch drift from its checkpoint and
  files actionable tracker issues.

## Flow

1. Agent Queue selects ready, unblocked work from the configured tracker.
2. Agent Queue delegates implementation to Agent Implement.
3. Agent Implement claims the issue, implements the scoped change, runs checks,
   runs `workflow-code-review`, fixes blocking findings, and creates or updates
   the PR with `workflow-create-pr`.
4. Agent Queue requests Agent Review for PR review.
5. Agent Review runs `workflow-code-review` in a clean context and reports
   findings without modifying product code.
6. Agent Queue routes findings back to Agent Implement or moves the issue to the
   configured merge-ready state when review and checks are clean.
7. Agent Review periodically reviews main drift and creates tracker issues for
   real regressions or contract gaps.

## Adapter Minimum

Runtime adapter docs such as `AGENTS.md`, `CLAUDE.md`, and repo-local skill docs
should stay short. They should point agents to `docs/agents/workflow/config.md`
and name the core skills:

- `workflow-agent-queue` for queue coordination
- `workflow-agent-implement` for one ready issue through PR creation
- `workflow-agent-review` for independent PR and main drift review
- `workflow-code-review` as the shared review gate
- `workflow-create-pr` for PR creation

Do not duplicate this whole workflow into adapter docs.
