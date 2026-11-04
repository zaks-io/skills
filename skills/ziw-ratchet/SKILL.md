---
name: ziw-ratchet
description: Use to improve one target against a scored rubric in a long-running, unattended loop. Judge models compare each round with references and the last kept version; only measured gains are kept; the run ends with one draft PR.
argument-hint: "[goal|run-dir]"
---

# Ratchet

Improve one target, round after round, against a locked rubric until it reaches
its goal or stops improving. `ratchet.mjs` makes every decision; you carry out
its actions. Rules follow the
[workflow contract](../ziw-setup/references/workflow.md).

## Inputs

A goal, its ticket (create one if none exists), any references the user has,
and Repo Config's Ratchet section, checks, and worker methods.

## Setup

1. Claim the ticket and check out its branch with a clean tree. Stop if Repo
   Config has no Ratchet scheduled resume.
2. Write `setup.json` with the [setup guide](references/setup-guide.md), then:

   ```sh
   S=<skill-dir>/scripts
   RUN=.ziw/ratchet/<run>
   node "$S/ratchet.mjs" init --run "$RUN" --setup <setup.json>
   ```

3. Tick until an `approve` action appears. Show the user its summary; record
   approval only on a yes.

## Each tick

1. Run `node "$S/ratchet.mjs" tick --run "$RUN"`.
2. Carry out each action's `instruction`. Start each judge or implementer as a
   fresh session through config's launch method, with its brief as the whole
   task.
3. Once a result is confirmed, run the matching command: `record`, or the
   action's `completionRecord`, `failureRecord`, or `lostRecord`. Use real
   values; never invent IDs, SHAs, or results.
4. Tick again after each record. When only `recover-session` actions for
   still-running sessions remain, exit. Resume when one completes or at the
   scheduled wake.

Record events as they happen: `record paused --reason <text> --wake <time>`
when a judge has no usage left (then schedule the resume), `record stop`, or
`record cap --rounds <n>`. If a script fails, stop and report its error.

## Rules

- Never judge, implement, or open evidence yourself. Never edit protected paths
  or the run directory by hand.
- Give each session only its brief.
- Create PR must publish the confirmed commit unchanged. If a hook needs a code
  change, record the failure instead of fixing it.
- To change the rubric, references, or judges, finish this run and start a new
  one from its branch.

## Done

Report the outcome and stop reason, where the run report went, kept and
reverted rounds, and what the run needs next.
