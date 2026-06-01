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

## Ticket Kinds

Kind is a single-select axis, separate from type. Skills enforce exclusivity even
when the tracker label group does not.

- `kind-spec`, `kind-epic`: containers. Decompose input. Never dispatched.
- `kind-slice`: a one-PR ticket. The only kind a worker runs. Only `kind-slice`
  is startable; the orchestrator hard-refuses to dispatch a container.

## Agent Suitability

Agent delegation should follow task type, risk, and verification quality. Good
default agent work includes docs, tests, build or CI updates, small local
refactors, scoped bugs with reproduction, and isolated UI changes with target
states. Human planning stays in front of auth, secrets, PII, payments,
production, destructive data, broad refactors, cross-repo changes, unclear
domain behavior, and performance work without benchmarks.

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
   findings, CodeRabbit recommendation, PR readiness, and reviewed head SHA
   without modifying product code or moving issue state.
8. Agent Orchestrator routes findings back to the worker, repairs stuck draft PRs
   or marks them ready-for-review when allowed, requests CodeRabbit when the
   current diff needs it, applies or removes `Code review passed`, or calls the
   integrate step to merge on green, move the issue to the done state, and remove
   `ready-for-agent`.

## Loop Model

- Agent Orchestrator drives work forward, one stateless tick at a time.
- The loop is self-scheduling: it runs on the runtime's own recurring mechanism
  (schedule, `/loop`, or wake-up timer; Codex scheduled task or automation) and
  never needs a human to re-trigger a pass. Each tick wakes light, rebuilds the
  queue from systems of record, acts on a bounded slice, persists only the ledger
  and checkpoint, and sleeps only when future external signal can still arrive.
- If the refreshed scope is completely blocked, Orchestrator stops the recurring
  loop for that scope instead of waking forever. Completely blocked means there
  are no startable tickets, returned PRs to advance, stuck workers to nudge,
  failed checks to rerun or route, stale metadata repairs, or in-flight work that
  can still produce signal. The blocked report names each blocker, next owner,
  and the condition that would make the scope runnable again.
- Review and integrate are steps the orchestrator calls inside a tick, not loops.
  Decompose and triage are front-loaded steps the user runs before orchestration.

## Self-Healing

Use model judgment over current evidence, take the next safe action when the
evidence is enough, escalate missing intent or authority, never skip silently,
record every fix. Decompose and triage report heals in their run summaries; the
orchestrator logs a friction entry per inline heal. Never fabricate scope or
acceptance criteria; a vague spec dead-ends at the user by design.

## Orchestration

Agent Orchestrator owns orchestration, not implementation. Its job is to find
where tickets are stuck in the tracker-to-PR-to-merge pipeline, determine why
they are not advancing, and choose the next safe action needed to get them
handled. It uses model judgment to synthesize tracker state, PR state, checks,
review evidence, worker signals, repo config, and risk into actions. The named
actions are examples, not a complete menu; when a ticket is not moving,
Orchestrator should identify and take any safe workflow action needed to move it
forward. Examples include delegating a `kind-slice` to a worker, nudging an
existing worker, calling the review step, calling the integrate step, rerunning
checks, routing review feedback, requesting CodeRabbit escalation when the review
gate recommends it, diagnosing and repairing stuck draft PRs, marking unblocked
draft PRs ready-for-review, healing or repairing tracker metadata, applying or
removing review-evidence labels, logging friction, marking tickets for human
review when the next step genuinely needs human input, moving active workflow
state, or stopping on a real blocker.

When the user hands Orchestrator a large backlog that has already been triaged or
verified as ready to implement, Orchestrator owns the delivery lane. Routine
misunderstandings about when to apply a label, move a status, attach review
evidence, set repo-route metadata, or mark a PR ready-for-review are workflow
repairs. Orchestrator should fix them from tracker, PR, check, and config
evidence and keep going instead of escalating them.

It can be invoked for explicit tickets, a tracker filter, a project, a
milestone, a label, one pass, or an `until clear` target. `Clear` means every
issue in scope has a truthful next state and owner: implemented, delegated,
ready for review, ready to merge, blocked, needs human input, or terminal. It
does not mean implementing vague future work without triage. If every scoped
issue is blocked and no orchestration action remains, the loop stops for that
scope.

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
  criteria, direct-agent reply targets, or non-default continuation comment
  rules.
- Worker environment labels, such as `remote-worker` or `remote-cursor`, are
  approval metadata. Apply or preserve them when the issue route and environment
  approval criteria are verified. Do not require dependencies to be clear just to
  set the environment label or promote a complete intake ticket to the ready
  state during requested intake cleanup.
- The issue needs the repo routing label or metadata the integration uses to
  choose the preconfigured environment, when the repo requires one.
- The issue needs the configured repo-route label (such as `<org>/<repo>`) so the
  assigned agent can resolve which repository to clone. A missing repo-route
  label is a hard block on delegation: heal it inline when the tracker team maps
  unambiguously to one repo, otherwise escalate `needs-info`.
- Agent Orchestrator starts work by assigning the selected tracker-exposed agent.
- The assigned agent executes the ticket in its configured environment and
  returns a PR.
- Agent Orchestrator sends review fixes, failed-check details, or PR process
  problems back by replying into the assigned agent's session thread, using the
  thread-root comment's `parentId`. For remote Cursor agents, a top-level issue
  comment does not continue the session; record the session handle (such as the
  `cursor.com/agents/bc-<id>` URL) in the ledger.
- PR draft state lives in the code host. When a PR is stuck in draft, Agent
  Orchestrator diagnoses the blocker from repo policy, PR state, checks,
  comments, handoff notes, and the original worker session. Draft state alone is
  not a reason to request code review. If no explicit blocker remains, Agent
  Orchestrator marks the PR ready-for-review, then refreshes the PR state and
  verifies it is non-draft. If it stays draft, it is pre-review, not
  ready-for-review.
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
When it marks a ticket `Done`, it removes `ready-for-agent`.
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

Orchestrator-local files, run logs, checkpoints, and the dispatch ledger are only
scratch state. They can speed up polling or avoid duplicate work, but agents must
refresh the systems of record before acting. The friction log is retrospective,
not state: append-only comments on a parked ticket, never read back to decide
anything.

Create PR can mark the PR ready-for-review when its local gates pass and verify
the code-host PR is non-draft. Orchestrator diagnoses stuck draft PRs without
treating draft state as a review request, repairs blockers, verifies the
code-host PR is non-draft, and applies or removes `Code review passed` based on
current PR head SHA evidence. When Orchestrator moves a ticket to `Done`, it
removes `ready-for-agent`.

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
