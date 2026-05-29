# Agent Workflow Reference

Use this when writing or refreshing `docs/agents/workflow/config.md`.

## Roles

- Agent Orchestrator: keeps tracked work moving, delegates startable
  implementation work, requests independent review, owns the authority to mutate
  workflow status in the configured issue tracker, performs only configured
  merge actions, and stops on human blockers.
- Agent Implement: owns one delegated issue through implementation, code review,
  iteration, PR creation, and handoff.
- Agent Review: reviews PRs from a clean subagent or disposable worktree using
  `workflow-code-review`; also reviews main-branch drift from its checkpoint,
  reports verdicts to Agent Orchestrator, and files actionable tracker issues
  without moving active work between workflow states.
- Issue Triage: periodically updates configured tracker projects, labels,
  priorities, dependencies, orphans, and agent-ready issue bodies before Agent
  Orchestrator selects work; when something is unclear, it asks the user or
  leaves exact human next actions.

## Flow

1. Issue Triage periodically normalizes tracker metadata and readiness.
2. Agent Orchestrator selects startable work from the configured tracker:
   `ready-for-agent`, complete body, and no active blockers.
3. Agent Orchestrator claims the issue and delegates implementation using a
   supported worker path.
4. The implementation worker accepts the issue, implements the scoped change,
   runs checks, runs code review when available, fixes blocking findings, and
   creates or updates the PR.
5. Agent Orchestrator requests Agent Review for PR review.
6. Agent Review runs `workflow-code-review` in a clean context and reports
   findings without modifying product code or moving issue state.
7. Agent Orchestrator routes findings back to the implementation worker or moves
   the issue to the configured merge-ready state when review and checks are
   clean.
8. Agent Review periodically reviews main drift and creates tracker issues for
   real regressions or contract gaps.

## Orchestration

Agent Orchestrator owns orchestration, not implementation. It chooses the next
action needed to get tickets handled safely: delegate implementation work, nudge
an existing worker, request another code review, rerun checks, route review
feedback, repair tracker metadata, mark tickets for human review or missing
information, move workflow state, or stop on a real blocker.

Config should name the worker delegation paths this repo supports:

- `local-worktree`: Agent Orchestrator starts local subagents, gives each worker
  an isolated worktree or branch, and coordinates issue state, PR state, checks,
  and review through the tracker.
- `issue-assigned`: Agent Orchestrator assigns a tracker-exposed coding agent to
  the ticket. In Linear, that means assigning the agent account to the issue when
  the integration is available. The assigned agent works in its configured
  environment and returns a PR.

For issue-assigned delegation:

- The agent may be Cursor, Codex, or any configured assignable agent.
- Do not treat a local CLI with the same brand name as the issue-tracker
  integration.
- Discover currently assignable agents from the issue tracker. Do not copy the
  tracker's live assignee list into config.
- The config should record only project-specific details that are annoying to
  rediscover, such as supported worker delegation paths, routing labels, routing
  fields, readiness label policy, worker environment label policy, startable work
  criteria, or non-default continuation comment rules.
- Worker environment labels, such as `remote-worker` or `remote-cursor`, are
  approval metadata. Apply or preserve them when the issue route and environment
  approval criteria are verified. Do not require dependencies to be clear just to
  set the environment label.
- The issue needs the repo routing label or metadata the integration uses to
  choose the preconfigured environment, when the repo requires one.
- Agent Orchestrator starts work by assigning the selected tracker-exposed agent.
- The assigned agent executes the ticket in its configured environment and
  returns a PR.
- Agent Orchestrator sends review fixes, failed-check details, or PR process
  problems back by replying where the tracker integration continues the same
  assigned-agent session, usually the same issue comments unless config says
  otherwise.

## State Authority

Agent Orchestrator does not store authoritative workflow state locally. It reads
and writes the systems of record:

- issue workflow state: configured issue tracker
- claim records: configured issue tracker fields, assignments, labels, and
  comments
- branch and PR state: configured code host
- check and preview state: CI, preview, or hosted check provider
- deployment state: deployment provider

Orchestrator-local files, run logs, and checkpoints are only scratch state. They
can speed up polling or avoid duplicate work, but agents must refresh the
systems of record before acting.

## Adapter Minimum

Agent adapter docs such as `AGENTS.md`, `CLAUDE.md`, and repo-local skill docs
should stay short. They should point agents to `docs/agents/workflow/config.md`
and name the core skills:

- `workflow-agent-orchestrator` for orchestration
- `workflow-agent-implement` for one startable issue through PR creation
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
