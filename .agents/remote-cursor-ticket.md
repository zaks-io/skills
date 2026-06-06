# Remote Cursor Ticket Runbook

Use this repo-internal runbook when a user asks to create a remote
Cursor-ready Linear ticket for a concrete repo task, then move that ticket
through the workflow.

This is not a published skill. Do not add it under `skills/`, include
`agents/openai.yaml`, or list it in published skill discovery.

## Inputs

- Target repo path, GitHub repo, or repo-route label.
- Concrete task text from the user.
- Target repo `docs/agents/workflow/config.md`.
- Configured tracker team, project, ready state, type and risk labels,
  readiness label, worker environment label, repo-route label, Cursor delegate,
  and active PR/preview cap.
- Optional parent issue, project, priority, due date, or requested worker.

## Workflow

1. Resolve the target repo from config or the user's explicit repo name.
2. Verify tracker location, ready state, label names, repo-route label, worker
   environment label, and Cursor delegate value.
3. Search for an existing matching ticket by repo route, task command, likely
   files, and outcome. Adopt a strong match instead of creating a duplicate.
4. Create or normalize one `kind-slice` ticket with the body contract below.
5. Apply only configured labels and fields: type, risk, repo route,
   `ready-for-agent`, and the worker environment label such as `remote-cursor`.
6. Put the ticket in the configured ready state when the body is complete.
7. Run or apply the equivalent of `ziw-triage` on the ticket if metadata had to
   be repaired.
8. Run or apply the equivalent of `ziw-orchestrate <issue-id>` until no safe
   action remains. Orchestrator handles Cursor delegation, session continuation,
   review, PR state, and tracker updates.

Do not set the Cursor delegate directly unless the Orchestrator preflight passes:
`kind-slice`, `ready-for-agent`, worker environment approval, repo-route label,
complete body, unblocked, no active claim, no open PR, and active delivery
headroom under the configured cap.

## Ticket Body

Create the issue using the target repo's body contract:

- outcome
- context docs
- likely files, packages, or artifacts
- in scope
- out of scope
- acceptance criteria
- required checks
- security, privacy, data, and operational invariants
- dependencies or blockers

If any required field is unknown, leave a specific question, apply the
configured human-input label or state, and do not mark the ticket
`ready-for-agent`.

## Skill Update Ticket Template

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

Use the target repo's exact check command and route label when known. If config
says a different install command is required, record that in the issue and
explain the difference from the generic `npx skills add zaks-io/skills --all`
request.

## Done

Report:

- created or adopted issue ID and URL
- labels, route, worker environment metadata, and ready state applied
- whether Cursor delegation started or why it did not
- Orchestrator status: delegated, PR returned, in review, blocked, or waiting
- checks required by the ticket
- blockers, human questions, and next owner
