# Loop Contract

How Agent Orchestrator runs as a recurring loop without growing its context.
Agent Orchestrator is the only active work loop. This file defines how each
wake-up behaves so a long-running loop stays as light as a first run.

## Self-Scheduling

The loop must drive itself. Do not require a human to re-trigger each pass.

Use whatever recurring mechanism the runtime already has:

- Claude Code: a scheduled run, a `/loop`, or a wake-up timer between ticks.
- Codex: a scheduled task or automation.
- Any runtime: its native cron, timer, or repeat primitive.

Pick the most appropriate built-in. Never invent a manual entry point or ask the
user to kick each tick. If the runtime has no recurring primitive, run one pass
and report the exact command the user should schedule.

## One Tick

A tick is a single, stateless-against-external-state pass. It does the smallest
amount of work that advances the queue, then exits. It does not loop in-context
until the backlog is empty; that grows context without bound.

Each tick:

1. Wake light. Load only repo config, scope, the dispatch ledger, and the review
   checkpoint. Refresh local Git refs, HEAD, worktree list, and
   `git status --short --branch` when a local checkout is in play. Do not carry
   diffs, logs, or issue histories across ticks.
2. Rebuild the queue from systems of record. Delegate the inventory read to an
   isolated triage worker when the runtime has one; keep only the compact queue
   (ID, state, readiness, blockers, PR, owner, next action) in the main context.
3. Reconcile the ledger against refreshed tracker and PR state. Trust external
   state; drop stale ledger entries; re-dispatch or escalate stuck workers.
4. Act on at most a bounded slice of work this tick: advance returned PRs first,
   then dispatch new startable work up to `cap - in-flight`. Prefer advancing
   active work over starting new work.
5. Delegate every context-heavy step (implement, review, triage) to an isolated
   worker. Reduce each worker result into the compact queue and ledger before
   continuing.
6. Persist only the ledger and checkpoint. Append friction entries. Exit.
7. Sleep until the next scheduled tick.

Refresh local Git state again before any action that depends on current branches,
PR heads, default-branch drift, worktrees, or file contention. Local Git is not
the authority, but stale local observations must not drive orchestration.
Refresh it again after any code-host or tracker mutation that changes PR,
review, merge, or done state before choosing the next action.

## Light Context Budget

The token sink is not this skill; it is re-reading heavy artifacts every tick.
Keep these out of the main context and behind isolated workers:

- full issue descriptions and comment histories
- diffs, patches, and file contents
- full PR reviews and check logs
- test output

Keep only metadata: IDs, states, labels, SHAs, URLs, counts, and the next
action per ticket.

## Tick Cadence

- Choose a cadence that matches how fast external state changes, not a fixed
  short interval. Polling faster than workers produce signal wastes ticks.
- A tick with no safe action is normal. Record nothing but a heartbeat and sleep.
- Stop the schedule, not just the tick, when a hard stop condition in the skill
  is met (tooling unavailable, budget exhausted, thrash breaker tripped).

## Cross-Tick State

The tracker and code host are the source of truth. The ledger and checkpoint are
the only things a tick may carry forward, and both are non-authoritative caches
reconciled against external state on the next tick. A tick must work correctly
even when the ledger is empty (fresh process, new environment).
