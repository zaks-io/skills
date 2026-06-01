# Agent Workflow Reference

Use this when writing or refreshing `docs/agents/workflow/config.md`.

## Roles

- Agent Orchestrator: keeps tracked work moving, delegates startable
  implementation work, requests independent review, owns the authority to mutate
  active workflow status in the configured issue tracker, performs only
  configured merge actions, and stops on human blockers.
- Agent Implement: owns one delegated issue through implementation, code review,
  iteration, PR creation, and handoff.
- Agent Review: reviews PRs from a clean subagent or disposable worktree using
  `workflow-code-review`; also reviews main-branch drift from its checkpoint,
  reports verdicts to Agent Orchestrator, and files actionable tracker issues
  without moving active work between workflow states.
- Issue Triage: periodically updates configured current tracker issues, labels,
  priorities, dependencies, orphans, stale verified states, and agent-ready issue
  bodies before Agent Orchestrator selects work; its default goal is to make all
  Todo tickets ready for agents and keep tracker state truthful. It does not
  review backlog unless asked. When something is unclear, it asks the user or
  leaves exact human next actions.

## Flow

1. Issue Triage periodically normalizes current tracker metadata, readiness, and
   verified stale status.
2. Agent Orchestrator selects startable work from the configured tracker:
   `ready-for-agent`, complete body, and no active blockers.
3. Agent Orchestrator claims the issue and delegates implementation using a
   supported worker path.
4. The implementation worker accepts the issue, implements the scoped change,
   runs checks, runs code review when available, fixes blocking findings, and
   creates or updates the PR.
5. Agent Orchestrator requests Agent Review for PR review.
6. Agent Review runs `workflow-code-review` in a clean context and reports
   findings, CodeRabbit recommendation, PR readiness, and reviewed head SHA
   without modifying product code or moving issue state.
7. Agent Orchestrator routes findings back to the implementation worker, marks a
   clean draft PR ready-for-review when allowed, requests CodeRabbit when the
   current diff needs it, applies or removes `Code review passed`, or moves the
   issue to the configured merge-ready state when review, checks, PR readiness,
   current review evidence, and required CodeRabbit escalation are clean.
8. Agent Review periodically reviews main drift and creates tracker issues for
   real regressions or contract gaps.

## Orchestration

Agent Orchestrator owns orchestration, not implementation. It chooses the next
action needed to get tickets handled safely: delegate implementation work, nudge
an existing worker, request another code review, rerun checks, route review
feedback, request CodeRabbit escalation when the review gate recommends it,
mark draft PRs ready-for-review after review gates pass, repair tracker
metadata, apply or remove review-evidence labels, mark tickets for human review
or missing information, move active workflow state, or stop on a real blocker.

It can be invoked for explicit tickets, a tracker filter, a project, a
milestone, a label, one pass, or an `until clear` target. `Clear` means every
issue in scope has a truthful next state and owner: implemented, delegated,
ready for review, ready to merge, blocked, needs human input, or terminal. It
does not mean implementing vague future work without triage.

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
  set the environment label or promote a complete intake ticket to the ready
  state during requested intake cleanup.
- The issue needs the repo routing label or metadata the integration uses to
  choose the preconfigured environment, when the repo requires one.
- Agent Orchestrator starts work by assigning the selected tracker-exposed agent.
- The assigned agent executes the ticket in its configured environment and
  returns a PR.
- Agent Orchestrator sends review fixes, failed-check details, or PR process
  problems back by replying where the tracker integration continues the same
  assigned-agent session, usually the same issue comments unless config says
  otherwise.
- PR draft state lives in the code host. After clean review and passing required
  checks, Agent Orchestrator should mark a draft PR ready-for-review unless the
  user or repo config explicitly says to keep it draft. If it stays draft, it is
  pre-review, not ready-for-review.
- CodeRabbit escalation follows the `workflow-code-review` recommendation. It
  is required only for high-risk or genuinely complex diffs, or when the user
  asks for it.
- `Code review passed` is a review-evidence label, not workflow state. Apply it
  only with PR URL and reviewed head SHA evidence. Remove it when the PR head
  changes, blocking findings appear, the linked PR changes, or evidence is
  missing.

For local agent runtimes, keep the orchestrator parent thread small and delegate
large context loads to isolated workers when available. Claude Code uses plugin
subagents such as `workflow-triage`, `workflow-implementer`, and
`workflow-reviewer`. Codex and other Agent Skills runtimes should use matching
skill names such as `$workflow-issue-triage`, `$workflow-agent-implement`,
`$workflow-agent-review`, and `$workflow-code-review` inside isolated sessions,
branches, worktrees, or subagents when available.

## State Authority

Issue Triage may move complete issues from configured intake states to the
configured ready state during requested intake cleanup, and may reconcile
verified stale states such as moving tickets with merged linked PRs to `Done`.
Agent Orchestrator does not store authoritative workflow state locally. It reads
and writes the systems of record:

- issue workflow state: configured issue tracker
- claim records: configured issue tracker fields, assignments, labels, and
  comments
- review evidence labels: configured issue tracker labels plus adjacent comments
  or fields that record PR URL and reviewed head SHA
- branch and PR state: configured code host
- check and preview state: CI, preview, or hosted check provider
- deployment state: deployment provider

Orchestrator-local files, run logs, and checkpoints are only scratch state. They
can speed up polling or avoid duplicate work, but agents must refresh the
systems of record before acting.

Create PR can mark the PR ready-for-review when its local gates pass.
Orchestrator repairs draft PRs that should already be ready-for-review after
Agent Review and required checks are clean. Orchestrator applies or removes
`Code review passed` based on current PR head SHA evidence.

## Adapter Minimum

Agent adapter docs such as `AGENTS.md`, `CLAUDE.md`, and repo-local skill docs
should stay short. They should point agents to `docs/agents/workflow/config.md`
and name the core skills:

- `workflow-agent-orchestrator` for orchestration
- `workflow-agent-implement` for one startable issue through PR creation
- `workflow-agent-review` for independent PR and main drift review
- `workflow-issue-triage` for current tracker cleanup, readiness repair, and
  optional backlog or intake backfill when explicitly requested
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
