---
name: workflow-agent-queue
description: Use for Agent Queue, the short-loop agent that keeps the issue tracker implementation queue moving by selecting ready issues, launching or nudging Agent Implement, requesting Agent Review, updating issue tracker, and stopping when human input is needed.
argument-hint: "[loop-budget-or-filter]"
disable-model-invocation: true
---

# Agent Queue

Coordinate the queue. Own the authority to mutate workflow status in the
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

Do not treat local queue files, logs, or checkpoints as authoritative. Refresh
the systems of record before acting:

- issue workflow state from the configured issue tracker
- claim records from configured issue tracker fields, assignments, labels, and
  comments
- branch and PR state from the configured code host
- check and preview state from CI, preview, or hosted check providers
- deploy state from the deployment provider

Queue may keep local scratch state only for polling, checkpoints, or duplicate
suppression. The next action must be valid against the refreshed external state.

## Loop

On each pass:

1. Refresh code host and issue tracker state for the configured locations.
2. Find ready work: `Todo` plus `ready-for-agent`, unblocked, with a complete
   agent-ready body. Treat labels as signals and statuses as the workflow state.
3. Find active work: `In Progress`, `Blocked`, `In Review`,
   `Changes Requested`, and `Ready to Merge`.
4. Check open PRs, failed checks, stale branches, unresolved review comments,
   and workers waiting for feedback.
5. Prefer unblocking active work before starting new work.
6. Select new work by dependency order, milestone/project priority, risk, and
   file/package contention.
7. Choose runtime from config:
   - Agent Implement for ready implementation issues
   - Agent Review for independent PR review and main-branch drift review
   - local Codex for queue repair, metadata updates, and small coordination fixes
   - planning agent for ambiguous product, security, or architecture
8. Build the worker prompt from config, issue body, linked docs, required checks,
   branch/worktree, and `workflow-agent-implement`.
9. Record delegation or action in the issue tracker.
10. Continue until no safe action remains or the user-specified loop budget ends.

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
9. Merge only when config grants Agent Queue merge authority and all approval
   rules are satisfied. Otherwise stop with the PR ready for human merge.

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
- Never add `ready-for-agent` unless the issue satisfies the body contract.
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
