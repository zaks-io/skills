# Loop Contract

Run Orchestrator as the only active work loop, with a light context on every
wake-up. Each tick takes every safe action available now, then exits for the
next external signal or stops the scoped run.

## Steps

1. [Schedule the loop](#self-scheduling) with the runtime's recurring mechanism.
2. [Run one tick](#one-tick) from refreshed systems of record.
3. [Keep context light](#light-context-budget).
4. [Set the next cadence](#tick-cadence) or stop the schedule.
5. [Persist cross-tick state](#cross-tick-state) as non-authoritative caches.

## Self-Scheduling

- Drive the loop without asking a human to trigger each pass.
- Choose a built-in recurring mechanism: Claude scheduled run, `/loop`, timer;
  Codex scheduled task/automation; or the runtime's cron/repeat primitive.
- Exception: with no recurring primitive, run one pass and report the exact command the user should schedule.

## One Tick

- Wake with config, scope, ledger, and review checkpoint only.
- Run the orchestrator's [Steps](../SKILL.md#steps): one shared snapshot and plan, then dispatch and PR actions.
- Use model judgment on refreshed evidence. Load or delegate enough evidence to
  act, repair, nudge, or escalate, including safe actions not listed here.
- Take every safe action now, including follow-ups from mutations. Do not ration
  work to one action per ticket or one dispatch per wake-up.
- A cap, collision, or exhausted budget may hold work. Other safe actions left
  undone at tick exit are friction events.
- Reduce worker returns into the compact queue and ledger before continuing.
- Exit when remaining work waits on workers, checks, reviews, or providers.
  Never wait in context for their signal.
- When a checkout matters, refresh local refs, HEAD, worktrees, and
  `git status --short --branch` before branch, PR-head, baseline-drift,
  worktree, or contention decisions, and again after PR, review, merge, or done
  mutations.
- Delegate heavy inventory reads to isolated triage workers when available;
  retain only ID, state, readiness, blockers, PR, owner, and next action.

## Light Context Budget

Keep only metadata: IDs, states, labels, SHAs, URLs, counts, and next actions.
Delegate full bodies, histories, diffs, file contents, reviews, check logs, and
test output. Do not carry those artifacts across ticks. The context budget
limits retained material, not reasoning or safe action count.

## Tick Cadence

- Match the base interval to how quickly workers, checks, reviews, and providers produce signal.
- After dispatch or when fast signal is expected, use that base interval.
- Roughly double the interval after each quiet transient tick, up to the configured or sensible maximum.
- Any new signal or action resets the interval to base.
- Set the next delay explicitly each tick when the runtime supports it.
- For a transient wait, record a heartbeat, back off, and exit until the scheduled wake-up.
- Inspect workflow state before rerunning previews or hosted checks. A progressing job is wait evidence, not failure evidence.
- Continue scheduling only while external signal can arrive without user intervention.
- Stop the schedule when all scoped items are terminal or blocked on something
  the orchestrator cannot safely clear.
- Apply [Persist and stop](../SKILL.md#persist-and-stop) for complete blockage,
  tooling failures, budget exhaustion, and thrash breakers.

## Cross-Tick State

- Persist only the ledger and review checkpoint as loop state, plus authorized
  tracker updates and friction entries.
- Reconcile caches against tracker, code-host, baseline, worker, and CI state on every wake-up.
- Discard checkpoint claims that disagree with refreshed evidence.
- Checkpoint write failure must not restore stale capacity or PR assumptions next tick.
- Work correctly with an empty ledger after a fresh process or environment.
- Systems of record remain authoritative; local Git, the ledger, and checkpoints do not override them.
