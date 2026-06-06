---
name: ziw-remote-ticket
description: Use to create or adopt a repo-scoped remote Cursor-ready Linear ticket from a concrete task, including skill-update tickets, then move that ticket through the configured workflow with triage and orchestrate.
argument-hint: "[repo|issue-scope] [task]"
disable-model-invocation: true
---

# Remote Ticket

Create or adopt exactly one remote-worker-ready ticket for a concrete repo task,
then hand it to the existing workflow loop. This is for requests such as "update
the skills on project X" where the desired output is a Linear ticket that Cursor
can implement and return as a PR.

This skill creates and coordinates work. It does not edit the target repo by
hand, review the diff by hand, merge, or deploy.

## Inputs

- Target repo path, GitHub repo, or repo-route label.
- Concrete task text from the user.
- Target repo `docs/agents/workflow/config.md`.
- Configured issue tracker team, project, ready state, labels, delegate field,
  worker environment label, repo-route label, and active PR/preview cap.
- Optional parent issue, project, priority, due date, or requested worker.

## When To Use

Use this when the user wants a remote Cursor ticket created and pushed through
the workflow for a small repo-scoped task.

Good fit:

- update repo workflow skills
- refresh generated agent config
- small docs, test, build, or maintenance tasks with clear checks
- one-command upgrades with a reviewable diff

Poor fit:

- vague product ideas; use `ziw-to-issues`
- backlog cleanup; use `ziw-triage`
- already-created multi-ticket plans; use `ziw-orchestrate`
- high-risk auth, secrets, production, or data work without human decisions

## Context

Read first:

- target repo `docs/agents/workflow/config.md`
- target repo `AGENTS.md`
- the issue tracker contract referenced by setup:
  [../ziw-setup/references/issue-tracker-contract.md](../ziw-setup/references/issue-tracker-contract.md)
- the issue-assigned delegation rules from Orchestrate:
  [../ziw-orchestrate/SKILL.md](../ziw-orchestrate/SKILL.md)

If config is missing or stale enough that route, labels, statuses, checks, or
Cursor delegation cannot be verified, create or request a setup ticket first
instead of guessing.

## Workflow

1. Resolve the target repo from config or the user's explicit repo name.
2. Verify the tracker location, ready state, type/risk labels, readiness label,
   worker environment label, repo-route label, and Cursor delegate value.
3. Search for an existing matching ticket by repo route, task command, target
   files, and outcome. Adopt a strong match instead of creating a duplicate.
4. Create or normalize one `kind-slice` ticket with the body contract below.
5. Apply labels and fields only from config: type, risk, repo route,
   `ready-for-agent`, and the configured worker environment label such as
   `remote-cursor`.
6. Put the ticket in the configured ready state when the body is complete.
7. Run `ziw-triage` on that ticket if metadata had to be repaired.
8. Run `ziw-orchestrate <issue-id> until no safe action remains` so Orchestrator
   handles Cursor delegation, session continuation, review, PR state, and
   tracker updates.

Do not set the Cursor delegate directly unless the Orchestrator preflight passes:
`kind-slice`, `ready-for-agent`, worker environment approval, repo-route label,
complete body, unblocked, no active claim, no open PR, and active delivery
headroom under the configured cap.

## Ticket Body

Create the issue using the repo's body contract. Include:

- outcome
- context docs
- likely files, packages, or artifacts
- in scope
- out of scope
- acceptance criteria
- required checks
- security, privacy, data, and operational invariants
- dependencies or blockers

Write acceptance criteria as proof obligations. If any required field is
unknown, leave a specific question, apply the configured human-input label or
state, and do not mark the ticket `ready-for-agent`.

## Skill Update Ticket

For "update the skills on this project" or equivalent, create a ticket like:

```markdown
## Outcome

The repo's installed workflow skills are refreshed from `zaks-io/skills`, and
the update is returned as a PR.

## Context docs

- `AGENTS.md`
- `docs/agents/workflow/config.md`
- existing skill or agent config files touched by the install command

## Likely files, packages, or artifacts

- `AGENTS.md`
- `CLAUDE.md`
- `.codex/skills/`, `.claude/skills/`, `skills/`, or repo-local agent docs,
  depending on the target repo's current setup

## In scope

- Run `npx skills add zaks-io/skills --all`.
- Inspect and keep the generated skill/config updates that belong to this repo.
- Run the repo-configured checks.
- Create a PR with the resulting changes.

## Out of scope

- Do not change production, deploy, rotate secrets, or broaden workflow policy.
- Do not edit unrelated application behavior.

## Acceptance criteria

- The command completes or the worker records the exact blocker.
- Generated changes are committed in one scoped PR.
- The PR body lists the files changed and checks run.
- No unrelated local or generated noise is included.

## Required checks

- The target repo's configured full local gate.
- `git status --short` reviewed before PR creation.

## Security, privacy, data, and operational invariants

- Do not paste secrets, credentials, private logs, or signed URLs into the issue
  or PR.
- Do not deploy production.

## Dependencies or blockers

- Cursor delegation requires the configured repo-route label and worker
  environment metadata.
```

Use the target repo's exact check command and route label when known. If the repo
config says a different install command is required, record that in the issue and
explain the difference from the generic `npx skills add zaks-io/skills --all`
request.

## Moving The Ticket

After the ticket exists:

- If it is ready and unblocked, call `ziw-orchestrate` for that issue.
- If Cursor returns a PR, let Orchestrator call review and PR-state handling.
- If Cursor needs changes, reply through the agent-session thread, not a
  top-level issue comment.
- If the ticket cannot be delegated, leave the exact blocker in the issue and
  report the next owner.

For one-off user requests, keep scope to the created ticket. Do not fan out into
the rest of the repo backlog unless the user asks.

## Guardrails

- Do not create duplicate tickets.
- Do not mark containers `ready-for-agent`.
- Do not invent labels, statuses, routes, acceptance criteria, or delegates.
- Do not add `remote-cursor` unless config verifies that label means Cursor is
  approved for the target repo.
- Do not delegate without the repo-route label.
- Never deploy to or modify production without explicit approval.

## Done

Report:

- created or adopted issue ID and URL
- labels, route, worker environment metadata, and ready state applied
- whether Cursor delegation started or why it did not
- Orchestrator status: delegated, PR returned, in review, blocked, or waiting
- checks required by the ticket
- blockers, human questions, and next owner
