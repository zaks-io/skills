---
name: ziw-setup
description: Use for workflow setup when creating or refreshing a repo's agent workflow config (docs/agents/workflow/config.md and planner.json) with its commands, tracker, workers, and merge policy.
argument-hint: "[repo-path]"
---

# Setup

Write or refresh `docs/agents/workflow/config.md` and
`docs/agents/workflow/planner.json` from the
[config template](references/config-template.md). The
[workflow contract](references/workflow.md) defines the roles, states, and
labels the config maps.

## Inputs

Repo path, any existing config, and what to set up or refresh.

## Steps

1. Read the existing config, `AGENTS.md`, and the template. On a refresh,
   change only the fields asked about or shown to be stale.
2. Fill each field from evidence:
   - Commands and checks from package scripts, task runners, hooks, and CI.
   - Tracker location, states, and labels from a read-only tracker query.
   - Workers, merge authority, deploys, and the complaint tool from repo docs
     or the user.
3. Leave a field out when you can't verify it, and list it as a gap.
4. Write both files. Keep `planner.json` consistent with the config.
5. Make sure `AGENTS.md`, or the repo's agent instructions file, points to
   the config.

## Rules

- Read-only provider queries only. Don't install, deploy, or create tracker
  states or labels without approval.
- Never put secrets, status, or progress in config.
- Don't hand-edit installed `ziw-*` skill copies; refresh them from source.

## Done

Report the files written, fields verified or changed, gaps, and which workflows
those gaps block.
