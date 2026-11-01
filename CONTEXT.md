# Workflow Skills

Language for maintaining this repo. The roles, lifecycle, ticket terms, and
labels the skills use are defined once in
[workflow.md](skills/ziw-setup/references/workflow.md); use those names and no
others.

## Repo terms

**Workflow Skill**:
A portable instruction set under `skills/ziw-*` that gives an agent one job.
_Avoid_: playbook, prompt, command

**Workflow Contract**:
`skills/ziw-setup/references/workflow.md`, the one home for shared roles,
states, labels, the ticket body, and rules.

**Skill Adapter**:
Runtime metadata that exposes a skill to one agent system, such as
`agents/openai.yaml`.

**Claude Code Sub-agent**:
A file in root `agents/` that loads one skill in isolated context.

**Repo Config**:
A downstream repo's `docs/agents/workflow/config.md` and `planner.json`: stable
values only, never progress or status.

**Downstream Repo**:
A repo that installs these skills and has its own Repo Config.

**Planner**:
The `tick-snapshot`, `tick-plan`, and `linear-dag-start` scripts in
`skills/ziw-orchestrate/scripts`. They decide what Orchestrate starts, reviews,
and merges; skills never restate their logic.

**Planner State File**:
The JSON file Orchestrate passes to the planner each tick, holding worker and
review records. It is a cache; the tracker and code host win when they disagree.

## Relationships

- A Downstream Repo has one Repo Config.
- A Workflow Skill has one Skill Adapter per runtime and may be loaded by one
  Claude Code Sub-agent.
- Every Workflow Skill follows the Workflow Contract and restates none of it.
