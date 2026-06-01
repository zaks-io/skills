# Agent Workflow Reference

Use this when writing or refreshing `docs/agents/workflow/config.md`.

## Roles

- Decompose: turns a spec, PRD, or epic ticket into dependency-ordered one-PR
  `kind-slice` tickets. Adopts hand-created tickets instead of duplicating them,
  applies the agent-ready body and labels, and emits a dependency graph and file
  footprint. Creates tickets; it does not implement or move active work.
- Agent Orchestrator: runs the work loop. Keeps tracked work moving, delegates
  startable `kind-slice` work, calls review and integrate as steps, heals
  unambiguous tracker mistakes, logs friction, owns the authority to mutate
  active workflow status in the configured issue tracker, performs only
  configured merge actions, and stops on human blockers.
- Agent Implement: owns one delegated issue through implementation, code review,
  iteration, PR creation, and handoff.
- Agent Review: a step the orchestrator calls. Reviews PRs from a clean subagent
  or disposable worktree using `workflow-code-review`; also reviews main-branch
  drift from its checkpoint, reports verdicts to Agent Orchestrator, and files
  actionable tracker issues without moving active work between workflow states.
- Issue Triage: the bulk reconciler. Periodically updates configured current
  tracker issues, labels, kinds, priorities, dependencies, orphans, stale
  verified states, and agent-ready issue bodies before Agent Orchestrator selects
  work; its default goal is to make all Todo tickets ready for agents and keep
  tracker state truthful. It does not review backlog unless asked. When something
  is unclear, it asks the user or leaves exact human next actions.
- Spec-conformance: a separate loop that audits the spec set against delivered
  work and files gap tickets for under-delivery or drift. It does not touch code
  or active work.

## Ticket Kinds

Kind is a single-select axis, separate from type. Skills enforce exclusivity even
when the tracker label group does not.

- `kind-spec`, `kind-epic`: containers. Decompose input. Never dispatched.
- `kind-slice`: a one-PR ticket. The only kind a worker runs. Only `kind-slice`
  is startable; the orchestrator hard-refuses to dispatch a container.

## Flow

1. Decompose turns a spec, PRD, or epic ticket into `kind-slice` tickets, applies
   the body contract and labels, and emits the dependency graph and footprint.
2. Issue Triage normalizes current tracker metadata, kinds, readiness, and
   verified stale status.
3. Agent Orchestrator selects startable work from the configured tracker:
   `kind-slice`, `ready-for-agent`, complete body, and no active blockers.
4. Agent Orchestrator claims the issue and delegates implementation using a
   supported worker path.
5. The implementation worker accepts the issue, implements the scoped change,
   runs checks, self-reviews with code review, fixes blocking findings, and opens
   its own PR via `workflow-create-pr`.
6. Agent Orchestrator calls Agent Review as a step.
7. Agent Review runs `workflow-code-review` in a clean context and reports
   findings without modifying product code or moving issue state.
8. Agent Orchestrator routes findings back to the worker, or calls the integrate
   step to merge on green and move the issue to the done state.
9. Spec-conformance audits coverage on its own cadence and files gap tickets.

## Two Loops

- Agent Orchestrator drives work forward, one stateless tick at a time.
- Spec-conformance audits coverage on its own cadence.
- Review and integrate are steps the orchestrator calls inside a tick, not loops.
  Decompose and triage are front-loaded steps the user runs before orchestration.

## Self-Healing

Heal unambiguous mechanical mistakes, escalate intent, never skip silently,
record every fix. Decompose and triage report heals in their run summaries; the
orchestrator logs a friction entry per inline heal. Never fabricate scope or
acceptance criteria; a vague spec dead-ends at the user by design.

## Orchestration

Agent Orchestrator owns orchestration, not implementation. It chooses the next
action needed to get tickets handled safely: delegate a `kind-slice` to a worker,
nudge an existing worker, call the review step, call the integrate step, rerun
checks, route review feedback, heal or repair tracker metadata, log friction,
mark tickets for human review or missing information, move active workflow state,
or stop on a real blocker.

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

## State Authority

Issue Triage may move complete issues from configured intake states to the
configured ready state during requested intake cleanup, and may reconcile
verified stale states such as moving tickets with merged linked PRs to `Done`.
Agent Orchestrator does not store authoritative workflow state locally. It reads
and writes the systems of record:

- issue workflow state: configured issue tracker
- claim records: configured issue tracker fields, assignments, labels, and
  comments
- branch and PR state: configured code host
- check and preview state: CI, preview, or hosted check provider
- deployment state: deployment provider

Orchestrator-local files, run logs, checkpoints, and the dispatch ledger are only
scratch state. They can speed up polling or avoid duplicate work, but agents must
refresh the systems of record before acting. The friction log is retrospective,
not state: append-only comments on a parked ticket, never read back to decide
anything.

## Adapter Minimum

Agent adapter docs such as `AGENTS.md`, `CLAUDE.md`, and repo-local skill docs
should stay short. They should point agents to `docs/agents/workflow/config.md`
and name the core skills:

- `workflow-decompose` for turning a spec, PRD, or epic into `kind-slice` tickets
- `workflow-agent-orchestrator` for the orchestration loop
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
