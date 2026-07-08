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
amount of work that advances the delivery scope, then exits. It does not loop
in-context until the delivery scope is empty; that grows context without bound.

Each tick should use model judgment over refreshed evidence to choose the next
safe action. The loop is intentionally light on context, not light on reasoning:
load or delegate the evidence needed to decide, then act, delegate, repair,
nudge, or escalate. The examples in this contract bound context and cadence, not
the orchestrator's authority to choose an unlisted safe workflow action.

For a verified-ready delivery scope, every tick should assume the scoped tickets
are intended to move through implementation, PR, review, and merge unless current
evidence proves a real blocker. The Linear `Backlog` state is different: it is
not dispatchable until triage promotes correct, committed tickets into the ready
state. Routine label/status drift is repaired as part of the tick instead of
becoming a human escalation.

Each tick:

1. Wake light. Load only repo config, scope, the dispatch ledger, and the review
   checkpoint. Refresh local Git refs, HEAD, worktree list, and
   `git status --short --branch` when a local checkout is in play. Do not carry
   diffs, logs, or issue histories across ticks.
2. Rebuild the queue from systems of record. When the synced skill directory
   includes `scripts/tick-snapshot.mjs`, run
   `node <skill-dir>/scripts/tick-snapshot.mjs --repo <org/repo>` first: one
   call returns baseline health, the open-PR footprint, per-PR head SHAs,
   mergeable state, unresolved review-thread counts, check rollups, and
   review verdicts as JSON. Reason over that snapshot instead of assembling
   the same state from many tool calls; it needs an authenticated `gh`, and
   with `--linear-team <KEY>` plus either a `linear-graphql.mjs setup` credential
   or `LINEAR_API_KEY`, it also returns the open issue queue with unresolved
   `blockedBy` identifiers per issue. Then run
   `node <skill-dir>/scripts/tick-plan.mjs <snapshot.json> --config <config.json> --state <queue-state.json>`
   when compact queue/config JSON is available. The planner deterministically
   returns active footprint, capacity action, collision-safe dispatch selection,
   Linear DAG roots/frontier, dispatchable starts, ready-state promotions,
   hosted-review actions, and human-merge PR label decisions. Use
   `node <skill-dir>/scripts/linear-dag-start.mjs <snapshot.json> --config <config.json>`
   when only the Linear dependency frontier is needed. Never dispatch an issue
   whose snapshot or tracker state shows an incomplete blocker. Use tracker
   tooling for issue bodies and comments. Delegate the inventory read to an
   isolated triage worker when the runtime has one; keep only the compact queue
   (ID, state, readiness, blockers, PR, owner, next action) in the main context.
3. Reconcile the ledger against refreshed tracker and PR state. Trust external
   state; drop stale ledger entries; re-dispatch or escalate stuck workers.
4. Refresh the repo-level active delivery footprint: open PRs, active PR-scoped
   previews, and implementation dispatches that have not yet produced a PR.
   Count repo/project preview capacity, not only the requested issue filter.
   Open PRs include drafts. Draft state is not hidden work, and a draft PR that
   has not synced to the tracker still consumes capacity and must be advanced or
   repaired before redispatching that ticket.
   Count only agent- or human-delegated product PRs against the delivery cap;
   track bot dependency PRs (dependabot, renovate) as a separate drain count.
   Bot PRs are merge/close work to advance, not delegation slots — they must
   not starve new dispatch.
5. Act on at most a bounded slice of work this tick: advance returned PRs, active
   previews, and stuck draft PRs first. Optimize delivery-slot turnover over
   worker count: merge green PRs, route fixes, run `gh pr update-branch <pr>` on
   GitHub PRs after main moves, and inspect previews before dispatching new
   work. Do not delegate routine branch updates; delegate only after the update
   reports a merge conflict or equivalent manual conflict state. Dispatch new
   startable work only when the active PR/preview cap has headroom and active
   work has no near term drain action. Before fanning out, compare predicted
   file footprints against active PRs, active branches, and selected candidates;
   hold colliding or unknown-footprint tickets for triage or a later tick
   instead of spending spare slots. Draft state is an orchestration repair
   signal, not a code review request, and capacity pressure is not a reason to
   close a draft or in-progress PR.
6. Delegate every context-heavy step (implement, review, triage) to an isolated
   worker. Reduce each worker result into the compact queue and ledger before
   continuing.
7. Persist only the ledger and checkpoint. Append friction entries. If the queue
   is completely blocked, report blocked and stop the recurring run for this
   scope. Otherwise exit.
8. Sleep until the next scheduled tick only when future external signal can still
   arrive without user intervention.

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
- A transient tick with no safe action is normal when workers, checks, reviews,
  or providers are still expected to produce signal. Record a heartbeat and
  sleep.
- Before rerunning a preview or hosted check, inspect the workflow state. A job
  that is still progressing is wait evidence, not failure evidence.
- A completely blocked queue is not a transient tick. Stop the schedule, not just
  the tick, when every scoped item is terminal or waiting on a blocker the
  orchestrator cannot safely clear.
- Also stop the schedule when any hard stop condition in the skill is met
  (tooling unavailable, budget exhausted, thrash breaker tripped).

## Cross-Tick State

The tracker and code host are the source of truth. The ledger and checkpoint are
the only things a tick may carry forward, and both are non-authoritative caches
reconciled against external state on the next tick. A tick must work correctly
even when the ledger is empty (fresh process, new environment).
