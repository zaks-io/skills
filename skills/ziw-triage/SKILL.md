---
name: ziw-triage
description: Use for issue tracker triage of a project's selected ticket or queue, preparing single-PR tickets from repository evidence and routing decomposition or human decisions.
argument-hint: "[ticket|project|team|filter]"
---

# Triage

Prepare unclaimed tickets for Orchestrate and name the next owner for unresolved
work. Terms and labels follow the
[workflow contract](../ziw-setup/references/workflow.md).

## Inputs

The repo config and a selected ticket or queue scope. Queue scope defaults to
intake and ready states; include `Backlog` only when requested. Orchestrate's
`prepare-ticket` action selects exactly one ticket. Never expand that selection.

## Steps

1. Fetch a selected ticket directly. For a queue, run the scoped snapshot:

   ```sh
   node <skill-dir>/../ziw-orchestrate/scripts/tick-snapshot.mjs \
     --config docs/agents/workflow/planner.json \
     --linear-states <scope states> > /tmp/triage-snapshot.json
   ```

   If collection fails or skips the tracker, read the scope once with tracker
   tools. Leave active tickets, tickets with PRs, duplicates, and tickets outside
   scope unchanged. Orchestrate owns active work.

2. For a ticket with a clear outcome and acceptance criteria, inspect bounded,
   relevant repository code, tests, config, and existing commands to fill
   technical gaps such as Checks and Likely files, as the contract allows without
   spec approval. Derive details from evidence; never invent scope, acceptance
   criteria, or paths.

3. Give each prepared ticket one outcome:
   - `ready`: its body and labels are complete. Move it to the ready state with
     `ready-for-agent`, even when blocked.
   - `needs-slicing`: it genuinely needs multiple PRs and has a spec marked
     `Status: Ready for slicing`. Route to To Issues with the split reason and
     `needs-info`.
   - `needs-human`: product scope or another required decision remains unclear,
     including approval of a missing decomposition spec. Add `ready-for-human`
     and the exact question; never invent a spec.

   For either unresolved outcome, remove `ready-for-agent` and return the ticket
   to intake. Include the exact missing evidence when technical preparation
   cannot finish.

4. Combine body and evidenced metadata fixes into one update per ticket. Read
   the ticket back after updating to confirm its final `updatedAt`.
5. For a queue, refresh its snapshot and run
   `<skill-dir>/../ziw-orchestrate/scripts/linear-dag-start.mjs` on it, or on the
   refreshed tracker JSON array. Report cycles and blockers with an owner.

## Rules

- Change only tickets in the requested scope.
- Don't close, cancel, reprioritize, or rewrite scope unless asked.
- If the tracker rate-limits you, stop all tracker calls and report the
  changes still pending.

## Done

Return each prepared ticket's identifier, `outcome` as `ready`, `needs-slicing`,
or `needs-human`, `reason`, and confirmed post-update `updatedAt`. Include changes,
exact questions, and next owners. Report skipped tickets separately without a
preparation outcome. Never report an unconfirmed revision as completed preparation.
