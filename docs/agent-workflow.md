# Agent Workflow Details

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
4. `ziw-triage` makes tickets ready or routes them.
5. `ziw-orchestrate` runs the loop: it starts `ziw-implement` workers, gets
   `ziw-code-review` reviews, and merges or hands PRs to a human.
6. `ziw-implement` delivers a ticket and opens the PR with `ziw-pr`.

`ziw-debug` and `ziw-architecture` are standalone methods any role can use.

## Design rules

- **The scripts decide.** `tick-snapshot`, `tick-plan`, and `linear-dag-start`
  compute capacity, collisions, review currency, and merge readiness. Skills
  say how to carry out the planner's actions and never restate its logic.
  [planner-internals.md](planner-internals.md) documents the scripts.
- **One home per rule.** A rule lives in one file. Shared rules live in the
  workflow contract; everything else lives in the one skill that uses it.
- **Unknown cases stop.** A skill doesn't enumerate edge cases. When the
  contract, config, and planner don't cover something, the agent stops and
  reports the decision it needs.
- **Config holds stable values only.** Progress, blockers, and CI or review
  status are read live, never cached in config.
