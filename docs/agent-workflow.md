# Agent workflow details

Maintainer notes on how the workflow skills fit together. The contract agents
follow is [workflow.md](../skills/ziw-setup/references/workflow.md); it holds
the roles, lifecycle, states, labels, ticket body, and shared rules. Don't
repeat those here.

The research basis is [agent-delivery-research.md](agent-delivery-research.md).
The published skill surface and trim criteria are in
[skill-portfolio.md](skill-portfolio.md).

## Flow

1. `ziw-setup` writes `docs/agents/workflow/config.md` and `planner.json`.
2. `ziw-grill` settles a plan into a spec. The spec stays `Status: Draft`
   until the user approves `Status: Ready for slicing`.
3. `ziw-to-issues` slices a ready spec into one-PR tickets.
4. `ziw-triage` prepares clear tickets from repository evidence or routes them.
5. `ziw-orchestrate` is the delivery entrypoint for a selected backlog. It asks
   Triage to prepare incomplete tickets, starts `ziw-implement` workers, gets
   `ziw-code-review` reviews, and reconciles merges or hands PRs to a human.
6. `ziw-implement` delivers a ticket and opens the PR with `ziw-pr`.

`ziw-debug` and `ziw-architecture` are standalone methods any role can use.
`ziw-ratchet` takes the Implement role for one ticket and improves its target
over many rounds against a locked rubric; its script decides every keep and
revert, and the run ends in one draft PR.

## Design rules

- **The scripts decide.** `tick.mjs` collects facts, plans, and enriches actions in one
  command. Its snapshot, planning, and DAG helpers compute capacity, collisions,
  review currency, and merge readiness. Skills execute action instructions and
  typed recording commands without restating that logic.
  [planner-internals.md](planner-internals.md) documents the scripts.
- **One home per rule.** A rule lives in one file. Shared rules live in the
  workflow contract; everything else lives in the one skill that uses it.
- **Unknown cases stop.** A skill doesn't enumerate edge cases. When the
  contract, config, and planner don't cover something, the agent stops and
  reports the decision it needs.
- **Config holds stable values only.** Progress, blockers, and CI or review
  status are read live, never cached in config.
