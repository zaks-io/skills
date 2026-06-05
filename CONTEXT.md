# Workflow Skills

This context defines the language for shared engineering-agent workflow skills.
It exists so agents and maintainers use the same names for workflow roles,
tracked work, review gates, and repo-local coordination.

## Language

### Core Artifacts

**Workflow Skill**:
A portable instruction set that gives an agent one workflow job.
_Avoid_: playbook, prompt, command

**Skill Adapter**:
Runtime-specific metadata that exposes a **Workflow Skill** to a particular agent system.
_Avoid_: provider copy, wrapper doc

**Claude Code Sub-agent**:
A Claude Code agent definition that loads one or more **Workflow Skills** in isolated context.
_Avoid_: Claude skill, role prompt

**Repo Config**:
The downstream repo's compact lookup table for commands, tracker metadata, delegation paths, checks, and environment rules.
_Avoid_: setup notes, agent docs, project README

**Workflow Lookup Table**:
An alias for **Repo Config** when emphasizing that future agents read values instead of rediscovering them.
_Avoid_: narrative config, runbook

**Downstream Repo**:
A repository that installs or uses these workflow skills.
_Avoid_: target project, client repo

**Agent Adapter Doc**:
A short repo-level instruction file that points agents to the **Repo Config** and core workflow skills.
_Avoid_: duplicated workflow guide

### Tracked Work

**Issue Tracker**:
The external provider that stores issue workflow state, labels, relationships, claims, and comments.
_Avoid_: backlog file, local tracker cache

**Ticket**:
A tracked unit of work in the configured **Issue Tracker**.
_Avoid_: task, card, issue when kind matters

**Kind**:
The single-select axis that says whether a **Ticket** is a spec container, epic container, or implementation slice.
_Avoid_: type, category

**Type**:
The classification axis for the nature of a **Ticket**, such as bug, feature, improvement, tech debt, spike, or hotfix.
_Avoid_: kind, risk

**Container Ticket**:
A `kind-spec` or `kind-epic` **Ticket** that is input for planning and is never dispatched to a worker.
_Avoid_: parent task, executable epic

**Slice Ticket**:
A `kind-slice` **Ticket** scoped to one independently shippable PR.
_Avoid_: task, subtask, work item

**Agent-Ready Body**:
The structured body required before a **Slice Ticket** can be handed to an implementation agent.
_Avoid_: template, checklist, acceptance text

**Readiness Label**:
A label that says whether a **Ticket** still needs human refinement before agent handoff; remove it when the ticket is **Done**.
_Avoid_: status, scheduling gate, completion marker

**Worker Environment Label**:
Approval metadata that says a **Ticket** may run in a configured worker environment.
_Avoid_: readiness label, dependency label, start signal

**Review Evidence Label**:
A label that records current review proof for a linked PR head SHA.
_Avoid_: workflow state, approval state

**Startable Work**:
A **Slice Ticket** in the configured ready state with `ready-for-agent`, a complete body, no active blockers, no active claim, and no open PR.
_Avoid_: ready-for-agent, Todo

**Active Delivery Footprint**:
The repo-level capacity consumed by open PRs, active PR-scoped previews, and implementation dispatches that have not yet produced a PR.
_Avoid_: worker concurrency, queue size

**Active PR/Preview Cap**:
The maximum active delivery footprint allowed before **Agent Orchestrator** must drain existing PRs and previews instead of dispatching more work.
_Avoid_: agent session cap, parallel worker count

**Current Work**:
Tickets in configured ready or active states, plus active or PR-linked tickets that may need tracker repair.
_Avoid_: backlog, all issues

**Backlog**:
Future work that default triage does not scan, rewrite, promote, or reprioritize unless explicitly requested.
_Avoid_: current work, intake

**Intake**:
New or unshaped work that may be promoted to the configured ready state only during requested intake cleanup.
_Avoid_: backlog, startable work

**Completely Blocked**:
A scoped Orchestrator queue with no startable work, no PR, preview, or worker action to advance, no repairable stale state, and no in-flight signal expected without outside input.
_Avoid_: transient wait, sleeping tick

**Orphan**:
A real workflow **Ticket** missing the project, team, parent, route label, status, body, or dependency links needed for orchestration.
_Avoid_: stale issue, stray task

**Dependency Graph**:
The ordering relationships between **Slice Tickets** used to find safe parallel work.
_Avoid_: ticket list, roadmap

**File Footprint**:
A prediction of the files, directories, or packages a **Slice Ticket** is likely to touch.
_Avoid_: changed files, ownership map

### Workflow Roles

**Setup**:
The workflow role that creates or refreshes **Repo Config** from current evidence.
_Avoid_: onboarding, bootstrap

**To Issues**:
The workflow role that turns a spec, PRD, epic, or plan into dependency-ordered **Slice Tickets**.
_Avoid_: planning, ticket writing

**Issue Triage**:
The workflow role that repairs current tracker metadata, readiness, dependencies, body shape, and verified stale states.
_Avoid_: backlog grooming, product triage

**Agent Orchestrator**:
The workflow role that runs the work loop by selecting startable work, delegating workers, calling review and integrate steps, and moving active workflow state.
_Avoid_: implementer, reviewer, project manager

**Agent Implement**:
The workflow role that owns one delegated **Slice Ticket** through code changes, checks, code review, PR creation, and handoff.
_Avoid_: orchestrator, worker loop

**Implementation Worker**:
The agent or session performing **Agent Implement** for one **Slice Ticket**.
_Avoid_: orchestrator, reviewer

**Agent Review**:
The workflow role that reviews PRs or main drift from clean context and reports verdicts without implementing fixes.
_Avoid_: code review label, PR approval

**Code Review**:
The bug-focused review gate used by implementation, PR review, and main-drift review.
_Avoid_: style pass, lint, Agent Review

**Create PR**:
The workflow role that turns a branch into a checked, reviewed, ready-for-review pull request.
_Avoid_: publish, ship, merge

**Integrate**:
The merge gate called by **Agent Orchestrator** after review, required checks, PR state, and merge authority are satisfied.
_Avoid_: merge button, deploy

### Coordination State

**System Of Record**:
An external provider that is authoritative for workflow state, PR state, check state, preview state, or deploy state.
_Avoid_: local cache, transcript, scratch file

**Claim Record**:
Tracker metadata showing that a worker owns or is already handling a **Ticket**.
_Avoid_: local lock, assignment note

**Dispatch Ledger**:
The orchestrator's ephemeral cache of in-flight delegations used only for duplicate suppression and stuck-worker detection.
_Avoid_: system of record, workflow state

**Friction Log**:
A write-only retrospective record of places where orchestration struggled.
_Avoid_: decision log, blocker state

**Self-Healing**:
Using model judgment over direct evidence to repair stale or inconsistent workflow state while escalating missing intent or authority.
_Avoid_: guessing, cleanup sweep, rigid checklist

**Escalation**:
Marking or reporting that the next safe action requires human, provider, credential, product, security, customer, or ADR input.
_Avoid_: friction log entry, failure

**Handoff**:
A compact factual transfer from one workflow role to another, the user, or a future run.
_Avoid_: status update, summary

**Clean Context**:
An isolated review or worker context that reconstructs intent from repo artifacts instead of parent conversation history.
_Avoid_: fresh eyes, new chat

### Delegation And Review

**Worker Delegation Path**:
The configured mechanism **Agent Orchestrator** uses to start an **Implementation Worker**.
_Avoid_: agent type, runtime

**Local Worktree Delegation**:
A worker path where orchestration starts an isolated local branch, worktree, session, or subagent.
_Avoid_: local CLI, manual run

**Issue-assigned Delegation**:
A worker path where orchestration assigns a tracker-exposed coding agent to a **Ticket**.
_Avoid_: local Cursor, local Codex, human assignee

**Continuation Target**:
The configured reply location that reaches the same assigned worker session.
_Avoid_: issue comment, PR comment

**Ready For Review**:
The code-host PR state where a PR is non-draft and ready for external review or merge gating.
_Avoid_: Code review passed, In Review

**Pre-review**:
The PR state where a draft PR still needs checks, requested author prep, required author fixes, or human prep before it is ready for review.
_Avoid_: ready-for-review

**Green**:
The configured merge-ready evidence set for a PR.
_Avoid_: checks passed, looks good

**CodeRabbit Escalation**:
Requesting CodeRabbit only when the review gate recommends it, the diff is high-risk or complex, or the user asks.
_Avoid_: default review step, required review

### Environments

**Local Environment**:
A self-contained environment unless the downstream repo says otherwise.
_Avoid_: development

**Development Environment**:
An environment that may use cloud backing services while the app runs locally.
_Avoid_: local

**Preview Environment**:
A PR-scoped environment unless the downstream repo says otherwise.
_Avoid_: staging, production

**Production Environment**:
The live environment that always requires explicit approval before mutation or deployment.
_Avoid_: prod-like, preview

**Hosted Check**:
A provider-backed verification step whose safety must be named in **Repo Config**.
_Avoid_: local check, CI in general

## Relationships

- A **Downstream Repo** has one **Repo Config**.
- A **Workflow Skill** may have one or more **Skill Adapters**.
- A **Claude Code Sub-agent** loads one or more **Workflow Skills**.
- A **Container Ticket** may produce many **Slice Tickets** through **To Issues**.
- A **Slice Ticket** has exactly one **Kind** and one **Type**.
- A **Slice Ticket** has one **Agent-Ready Body** before it can become **Startable Work**.
- **Readiness Labels** and **Worker Environment Labels** are metadata, not workflow state.
- **Startable Work** is always a **Slice Ticket**, but not every **Slice Ticket** is **Startable Work**.
- **Issue Triage** prepares **Current Work** for **Agent Orchestrator**.
- **Active Delivery Footprint** is compared to the **Active PR/Preview Cap**
  before **Agent Orchestrator** dispatches more work.
- **Agent Orchestrator** delegates **Agent Implement** through a **Worker Delegation Path**.
- **Agent Implement** produces a PR and a **Handoff** for **Agent Orchestrator**.
- **Agent Review** calls **Code Review** from **Clean Context**.
- **Agent Orchestrator** calls **Integrate** only after the PR is **Green** and merge authority exists.
- **Dispatch Ledger** is reconciled against **Systems Of Record** on every orchestrator tick.
- **Friction Log** records repeated workflow pain but never decides workflow state.

## Example Dialogue

> **Dev:** "This epic is ready for agents."
> **Domain expert:** "Use **Container Ticket** for the epic; only the **Slice Tickets** created by **To Issues** can be marked with a **Readiness Label**."
>
> **Dev:** "The ticket has `ready-for-agent`, so Orchestrator can start it."
> **Domain expert:** "Not by itself. **Startable Work** also needs the ready state, no active blockers, a complete **Agent-Ready Body**, no active claim, and no open PR."
>
> **Dev:** "The remote Cursor label means the issue is unblocked."
> **Domain expert:** "No. A **Worker Environment Label** only approves the configured environment; blockers still live in relationships, body text, or workflow state."
>
> **Dev:** "The workers are idle, so Orchestrator can start three more tickets."
> **Domain expert:** "Not if open PRs or previews already fill the **Active PR/Preview Cap**. Drain those first."

## Flagged Ambiguities

- "Ready" is overloaded. Use **Ready For Review** for PR state, **Readiness Label** for tracker metadata, and **Startable Work** for work Orchestrator may dispatch.
- "Agent" is overloaded. Use **Implementation Worker** for the coding agent, **Agent Orchestrator** for the control loop, and **Issue-assigned Delegation** for tracker-exposed coding agents.
- "Review" is overloaded. Use **Code Review** for the bug-focused gate and **Agent Review** for the clean-context role that invokes it.
- "Kind" and "type" are distinct. **Kind** controls dispatchability; **Type** classifies the nature of the work.
- "Draft" does not mean "waiting for CodeRabbit" or "needs another code review". A draft PR is **Pre-review** until Orchestrator verifies there is a real blocker or makes it non-draft **Ready For Review**.
- "Backlog clear" does not mean implementing vague future work. It means each scoped ticket has a truthful next state and owner.
- Local CLI availability does not prove **Issue-assigned Delegation** exists. That path must come from the **Issue Tracker** or verified **Repo Config**.
- The **Dispatch Ledger** is not workflow state. The relevant **Systems Of Record** must be refreshed before acting.
- "Concurrency" is ambiguous. Use **Active PR/Preview Cap** for delivery
  capacity and **Worker Delegation Path** or provider session limit for worker
  mechanics.
