---
name: ziw-triage
description: Use for issue tracker triage of a project's queue, making tickets ready for Orchestrate or routing each one to To Issues, a human, or Orchestrate, and fixing labels and dependencies.
argument-hint: "[project|team|filter]"
---

# Triage

Leave the queue with only ready tickets in the ready state, and a named next
owner for every other ticket. Terms and labels follow the
[workflow contract](../ziw-setup/references/workflow.md).

## Inputs

The repo config and a scope. By default the scope is the intake and ready
states; other states, such as `Backlog`, only when the user names them.

## Steps

1. Run the snapshot for the scope:

   ```sh
   node <skill-dir>/../ziw-orchestrate/scripts/tick-snapshot.mjs --repo <owner/repo> \
     --linear-team <team> --linear-route-label <route label> \
     --linear-states <intake>,<ready> > /tmp/triage-snapshot.json
   ```

   If the snapshot skipped the tracker, list the scope once with tracker tools
   instead.

2. Give each ticket one outcome:
   - **Ready**: the body and labels are complete. Move it to the ready state
     with `ready-for-agent`, even when it is blocked.
   - **To Issues**: too big, vague, a container, or missing body sections. Add
     `needs-info` with the exact gap.
   - **Human**: needs a human decision. Add `ready-for-human` and the question.
   - **Leave**: in progress, has a PR, a duplicate, or parked outside the
     requested scope. Orchestrate owns active work; note anything stale for it.

   For To Issues and Human, also remove `ready-for-agent` and move the ticket
   to the intake state.

3. Fix metadata the evidence makes obvious: a missing route, kind, or risk
   label, and blockers stated in a ticket or its spec. Make one combined update
   per ticket.
4. Rerun the snapshot, then the dependency check, and report its cycles and
   blockers with the fix or owner for each:

   ```sh
   node <skill-dir>/../ziw-orchestrate/scripts/linear-dag-start.mjs /tmp/triage-snapshot.json
   ```

   If you listed tickets with tracker tools, pass them as a JSON array instead.

## Rules

- Read only the tracker, config, cited specs, and script output. Never read
  code, PRs, or CI to decide scope or order.
- Change only tickets in the requested scope.
- Don't close, cancel, reprioritize, or rewrite scope unless asked.
- If the tracker rate-limits you, stop all tracker calls and report the
  changes still pending.

## Done

Report the scope, each ticket's outcome, the changes made, and the exact gaps
and questions with their owners.
