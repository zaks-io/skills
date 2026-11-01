---
name: ziw-orchestrate
description: Use to orchestrate a selected issue tracker backlog, ticket set, filter, or project. Prepares tickets, starts workers, gets reviews, and reconciles delivery through merge or human handoff.
argument-hint: "[ticket-ids|filter|project|until-clear]"
---

# Orchestrate

Run the selected delivery scope through preparation, implementation, review, and
merge or human handoff. The planner supplies each action's instructions and
recording command. Terms and authority follow the
[workflow contract](../ziw-setup/references/workflow.md).

## Inputs

Read repo config and `docs/agents/workflow/planner.json`. Resolve a named filter
or project to ticket keys through the tracker.

## Start or resume

Save an explicit selection and any worker limit before the first tick:

```sh
S=<skill-dir>/scripts
node "$S/planner-state.mjs" init --repo <owner/repo> --state <state-file> \
  --scope <comma-separated-ticket-keys> --worker-cap <count>
```

Omit selection and limit options on resume to preserve them. Use `--scope default`
or `--worker-cap default` only when the user's request restores that default.
The default scope includes ready and active tickets. Parked backlog requires
explicit selection. A named scope does not authorize work on its blockers or
siblings. Worker limits can only lower configured capacity.

## Each tick

1. Recover saved workers and reviews through config's runtime methods. Record
   confirmed results before planning. Never infer completion from silence or
   relaunch work whose status is unknown. Read the
   [recording guide](references/state-observations.md) on first use or recovery.
2. Collect current facts and plan:

   ```sh
   node "$S/tick.mjs" --config docs/agents/workflow/planner.json
   ```

   `--worker-cap N` saves a lower cap for subsequent ticks. If the tracker was
   skipped, record a fresh scoped listing as `linearIssues` using the recording
   guide, then tick again. Relative config and state paths resolve from the
   current Git top-level. If a script fails, stop and report its error. A retired
   state format requires the printed migration command once.

3. Execute each `actions` entry's `instruction`. Use its supplied skill, brief,
   ticket, PR, and target state; start implementation workers first.
   `prepare-ticket` invokes Triage on that ticket only and has no branch.
   Recollect after preparation before dispatching it.
4. Save each confirmed launch or result immediately with the action's `record`
   command or argument array. Replace placeholders with confirmed values and
   drop optional runtime identity flags that were not supplied. When
   `action.record.stdin` is present, pass that exact JSON to the command's stdin.
   Later results
   use the typed state subcommands in the recording guide. Recording does not
   perform tracker or code-host actions.
5. Read `tickets`, `waits`, `holds`, and `warnings`. For missing evidence, make
   one lookup and replan once. Report unresolved gaps with their owners. Leave
   ordinary waits for their stated signal. `delivered` accounts for every
   selected ticket; a human merge remains a wait until confirmed and reconciled.
6. Exit this tick. Resume on worker completion or code-host notifications using
   config's continuation method and the runtime's completion instructions.
   Schedule recurring ticks only when requested. If automatic continuation is
   unavailable, report the next invocation and what it awaits.

## Rules

- Preserve saved state and recover interrupted launches before retrying.
- One ticket, one implementation worker, one branch, one PR. Reuse a worker for
  fixes only with a distinct confirmed run ID; otherwise start a fresh worker.
- Every independent review uses a fresh session, on a different model from the
  author when available. For a follow-up review, recover the previous report
  named by the brief and paste its findings. Comment the confirmed verdict on
  the ticket. After three blocked reviews, ask a human.
- Re-read PR facts before merge or human handoff. Changed facts require
  replanning. Merge only within configured authority, then confirm the merge,
  run the post-merge check, and reconcile the ticket before recording success.
- Confirmed external merges also require `reconcile-merged-pr`. A missing or
  closed PR never proves a merge. Follow a hold's resolution instructions;
  never delete saved evidence to release a ticket.
- Never implement or review diffs yourself. Preparation belongs to Triage.

## Done

Report selected ticket outcomes, changed PRs, running workers, waits and holds
with owners, decisions needed, and the event that will resume the run.
