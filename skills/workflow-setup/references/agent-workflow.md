# Agent Workflow Reference

Use this when writing or refreshing `docs/agents/workflow/config.md`.

## Roles

- Agent Queue: keeps tracked work moving, delegates ready implementation work,
  requests independent review, owns the authority to mutate workflow status in
  the configured issue tracker, performs only configured merge actions, and
  stops on human blockers.
- Agent Implement: owns one delegated issue through implementation, code review,
  iteration, PR creation, and handoff.
- Agent Review: reviews PRs from a clean subagent or disposable worktree using
  `workflow-code-review`; also reviews main-branch drift from its checkpoint,
  reports verdicts to Agent Queue, and files actionable tracker issues without
  moving active work between workflow states.
- Issue Triage: periodically cleans configured tracker projects, labels,
  priorities, dependencies, orphans, and agent-ready issue bodies before Agent
  Queue selects work.

## Flow

1. Issue Triage periodically normalizes tracker metadata and readiness.
2. Agent Queue selects ready, unblocked work from the configured tracker.
3. Agent Queue claims the issue and delegates implementation to Agent Implement.
4. Agent Implement accepts the issue, implements the scoped change, runs checks,
   runs `workflow-code-review`, fixes blocking findings, and creates or updates
   the PR with `workflow-create-pr`.
5. Agent Queue requests Agent Review for PR review.
6. Agent Review runs `workflow-code-review` in a clean context and reports
   findings without modifying product code or moving issue state.
7. Agent Queue routes findings back to Agent Implement or moves the issue to the
   configured merge-ready state when review and checks are clean.
8. Agent Review periodically reviews main drift and creates tracker issues for
   real regressions or contract gaps.

## State Authority

Agent Queue does not store authoritative workflow state locally. It reads and
writes the systems of record:

- issue workflow state: configured issue tracker
- claim records: configured issue tracker fields, assignments, labels, and
  comments
- branch and PR state: configured code host
- check and preview state: CI, preview, or hosted check provider
- deployment state: deployment provider

Queue-local files, run logs, and checkpoints are only scratch state. They can
speed up polling or avoid duplicate work, but agents must refresh the systems of
record before acting.

## Adapter Minimum

Runtime adapter docs such as `AGENTS.md`, `CLAUDE.md`, and repo-local skill docs
should stay short. They should point agents to `docs/agents/workflow/config.md`
and name the core skills:

- `workflow-agent-queue` for queue coordination
- `workflow-agent-implement` for one ready issue through PR creation
- `workflow-agent-review` for independent PR and main drift review
- `workflow-issue-triage` for tracker project cleanup and readiness backfill
- `workflow-code-review` as the shared review gate
- `workflow-create-pr` for PR creation

Do not duplicate this whole workflow into adapter docs.

For Claude Code, configure the target repo's Claude Code integration as the
source of truth for Claude-facing agent, command, and skill registration. The
integration should import the target repo's agent markdown, usually `AGENTS.md`
through a one-line `CLAUDE.md` `@AGENTS.md` import when supported. If Claude
Code requires exact paths, symlink repo-local Claude Code files into the
integration location and record the verified links in
`docs/agents/workflow/config.md`.
