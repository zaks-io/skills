---
name: workflow-agent-orchestrator
description: Use for Agent Orchestrator, the short-loop agent that orchestrates issue-tracked implementation work by selecting ready issues, launching or nudging workers, requesting Agent Review, updating the tracker, and stopping when human input is needed.
argument-hint: "[loop-budget-or-filter]"
disable-model-invocation: true
---

# Agent Orchestrator

Orchestrate tracked work. Own the authority to mutate workflow status in the
configured issue tracker. Do not become the default implementer or reviewer.

## Inputs

- Repo path and configured issue tracker location.
- Optional loop budget, project, milestone, label, or issue filter.
- Current tracker and PR state for the configured workflow.

## Context

Read first:

- `docs/agents/workflow/config.md`
- `AGENTS.md`
- project status, roadmap, specs, ADRs, and workflow docs referenced by config
- active tracker issues and linked PRs

If config is missing, run or request `workflow-setup` before starting new work.

## State Authority

Do not treat local orchestrator files, logs, or checkpoints as authoritative.
Refresh the systems of record before acting:

- issue workflow state from the configured issue tracker
- claim records from configured issue tracker fields, assignments, labels, and
  comments
- branch and PR state from the configured code host
- check and preview state from CI, preview, or hosted check providers
- deploy state from the deployment provider

Orchestrator may keep local scratch state only for polling, checkpoints, or
duplicate suppression. The next action must be valid against the refreshed
external state.

## Tracker Tooling

Use the configured tracker tool or MCP directly when it is available. Do not
inspect local tool-result caches, CLI transcript files, or generated logs to
understand tracker state while the tracker tool can answer the question.

Before broad queries or mutations, confirm the exact configured tracker
location from `docs/agents/workflow/config.md`:

- provider IDs for team, project, board, repo, milestone, or roadmap
- query-safe names when the provider requires names instead of IDs
- status field names and relationship fields used by the current tool
- configured routing and readiness labels
- read-only query shape that verified the metadata

If config uses a slug or display name that returns empty results but a verified
ID is available, use the ID and patch the config after the orchestration repair.
If neither the configured name nor an ID resolves, stop for `workflow-setup`
refresh instead of guessing.

## Orchestration

Orchestrator chooses the next action needed to get tickets handled safely.
Depending on tracker and PR state, that can mean assigning implementation work,
nudging an existing worker, requesting another code review, rerunning checks,
routing review feedback, marking a ticket for human review or missing
information, repairing tracker metadata, moving workflow state, or stopping on a
real blocker.

Use the worker delegation paths supported by `docs/agents/workflow/config.md`:

- `local-worktree`: Orchestrator starts local subagents, gives each
  implementation worker an isolated worktree or branch, and manages issue state,
  PR state, and review handoff through the tracker.
- `issue-assigned`: Orchestrator delegates the ticket to a tracker-exposed
  coding agent. In Linear this means using the verified delegation field or agent
  account exposed by the integration. The assigned agent works in its configured
  environment and returns a PR.

Orchestrator may use both paths when config allows it, choosing the safest path
for the issue. Orchestrator does not become the implementer or reviewer.

## Loop

On each pass:

1. Refresh code host and issue tracker state for the configured locations using
   the configured tracker tool/MCP and verified IDs.
2. Find ready work: `Todo` plus `ready-for-agent`, unblocked, with a complete
   agent-ready body. Check provider blocker relationships and explicit body
   blockers before treating an issue as ready. Treat labels as signals and
   statuses as the workflow state.
3. Find active work: `In Progress`, `Blocked`, `In Review`,
   `Changes Requested`, and `Ready to Merge`.
4. Check open PRs, failed checks, stale branches, unresolved review comments,
   and workers waiting for feedback.
5. Prefer unblocking active work before starting new work.
6. Select new work by dependency order, milestone/project priority, risk, and
   file/package contention.
7. Choose the next orchestration action:
   - local Agent Implement subagent or worktree for `local-worktree`
   - tracker-exposed assigned agent for `issue-assigned`
   - Agent Review for independent PR review and main-branch drift review
   - additional code review or check rerun when the PR state needs evidence
   - worker nudge or feedback reply when the original worker can continue
   - human-review marker when the next step needs human judgment
   - local Codex for orchestration repair, metadata updates, and small
     coordination fixes
   - planning agent for ambiguous product, security, or architecture
8. Build the worker prompt, assignment comment, or tracker handoff from config,
   issue body, linked docs, required checks, branch/worktree, and
   `workflow-agent-implement`.
9. Record delegation or action in the issue tracker.
10. Continue until no safe action remains or the user-specified loop budget ends.

## Issue-Assigned Agents

Use issue-assigned agents only when the issue tracker currently exposes an
assignable agent for the ticket. The agent might be Cursor, Codex, or another
configured worker. This is issue-tracker assignment, not a local CLI invocation.
Use config only for project-specific routing or continuation comment details
that are not obvious from the tracker.

Before starting issue-assigned work, run a read-only preflight:

- resolve the issue by configured tracker ID, not only by a human-friendly team
  or project name
- verify status, readiness labels, routing labels, priority, and issue body
- verify blockers and dependencies from provider relationships and body text
- verify the requested agent is exposed by the tracker or the config has a
  previously verified delegation tool, field, or agent ID
- verify the issue is not already claimed, delegated, linked to an open PR, or
  waiting on review feedback

Do not mutate a real issue to discover whether an agent name or delegation field
works. Use read-only metadata, a documented config value, or stop with the exact
missing config item. If the user explicitly approves a probe, use only a
dedicated test issue and restore it afterward.

To start issue-assigned work:

- verify the issue is ready, unblocked, and has the configured repo routing
  label, worker routing/readiness label, field, or metadata the integration
  needs, when config names one
- if the user explicitly requested issue-assigned agents and an otherwise-ready
  issue is missing only the configured worker routing label or field, repair
  that routing metadata and continue; do not ask again
- assign the selected agent to the issue through the configured issue tracker
- record the delegation in the issue tracker, including expected PR and check
  requirements

The assigned agent owns the configured environment, implementation run, and PR
return path. If Orchestrator needs to reach that same session, reply on the
original issue comments unless config names a different continuation comment
location. Do not start a new assignment for PR fixes while the original session
can continue.

For Linear issue-assigned agents, use the Linear tool/MCP delegation mechanism
when it exists, such as a `delegate` field or verified agent ID. Do not confuse a
human assignee with an issue-assigned coding agent. Record the returned
delegation metadata when the tool provides it.

## PR Review Loop

For Agent Implement PRs:

1. Confirm code review happened when feasible.
2. Ask Agent Review to run `workflow-code-review` in a subagent or
   disposable worktree.
3. Post actionable findings as PR review comments when configured.
4. Move the issue to `Changes Requested` when author fixes are needed.
5. Send feedback to Agent Implement or the original worker thread when
   available.
6. Keep fixes on the same branch and PR.
7. After fixes, ask Agent Review to rerun review and required checks.
8. Move to `Ready to Merge` only when Agent Review is clean and required checks
   pass.
9. Merge only when config grants Agent Orchestrator merge authority and all
   approval rules are satisfied. Otherwise stop with the PR ready for human
   merge.

## Stop Conditions

Stop and report when:

- no ready unblocked work exists
- all active work is waiting on humans, credentials, providers, production
  access, customer input, or merge authority
- the next action needs a product, security, ADR, or scope decision
- issue tracker, code host, or required worker tooling is unavailable
- checks fail for a reason the orchestrator cannot safely fix
- the configured loop budget is exhausted

## Guardrails

- Never assign blocked work to a worker.
- Never use a real implementation issue as a capability probe.
- Never add `ready-for-agent` unless the issue satisfies the body contract.
- Mark issues `ready-for-human`, `needs-info`, `Blocked`, or the configured
  equivalent when human review, approval, credentials, product input, or security
  judgment is the next owner.
- Never start a new worker for review fixes when the original worker can
  continue.
- Never inline implementation or PR review when an Agent Implement or Agent
  Review handoff is available.
- Never merge or deploy production without explicit approval.
- Never treat a label alone as permission to change state, merge, deploy, or use
  hosted resources.
- Keep tracker comments metadata-only. Do not paste secrets or private logs.

## Done

Report:

- issues started, nudged, reviewed, blocked, or moved
- PRs checked and their state
- workers launched or messaged
- issue updates made
- remaining blockers and next safe action
