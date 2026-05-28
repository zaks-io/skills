# Project Config Template

Create `docs/agents/workflow/config.md` with this shape. Keep it metadata-only.

```markdown
# Agent Config

Last updated: YYYY-MM-DD

## Repo

- Name:
- Default branch:
- Branch prefix:
- Package manager:
- Install:
- Full local gate:
- Focused checks:
- Build:
- Generated artifacts:
- Preview checks:
- Production deploy path:
- Production approval required: yes

## Issue Tracker

- Provider:
- Provider location:
- Metadata verified:
- Verified IDs:
- Label source of truth:
- Label docs:
- Project, board, repo, milestone, or roadmap:
- Routing label:
- Triage scope:
- Orphan policy:
- Issue key examples:
- Ready state: Todo
- Active states: In Progress, Blocked, In Review, Changes Requested, Ready to Merge
- Done state: Done
- Status transition owner: Agent Queue
- Readiness labels: needs-triage, needs-info, ready-for-agent, ready-for-human, remote-worker, wontfix
- Risk labels: risk-normal, risk-security-sensitive, risk-schema, risk-cross-cutting
- Type labels: Bug, Feature, Improvement, Tech Debt, Spike, Hotfix
- Area labels:
- Priority policy:
- Dependency policy:
- Agent-ready issue body:
- Labels are signals, not authority:

## Work Coordination

- Authoritative issue state:
- Authoritative PR state:
- Authoritative check state:
- Authoritative deploy state:
- Queue mutation authority:
- Implement authority:
- Review authority:
- Merge authority:
- Claim record:
- Queue local state:
- Handoff format:

## Agent Runtimes

- Local Codex:
- Remote worker:
- Claude:
- Claude Code source of truth:
- Claude Code imports:
- Claude Code symlinks:
- Claude Code verification:
- Review model policy:
- Agent Queue:
- Agent Review:
- Agent Implement:

## Pull Requests

- PR title:
- PR body:
- Required checks:
- Code review:
- CodeRabbit:
- Issue update:
- Merge authority:

## Environments

- Local: self-contained unless this repo says otherwise
- Local commands:
- Local services:
- Development: may use cloud backing services while the app runs locally
- Development backing services:
- Preview: PR-scoped unless this repo says otherwise
- Preview purpose:
- Production: explicit approval required
- Production forbidden without approval:
- Hosted checks allowed without approval:
- Hosted checks requiring approval:

## Unknowns

- [ ] Missing or unverified config item.
```

Keep the generated config terse. Include fields only when they give agents
values they will reference repeatedly. Prefer explicit commands, exact tracker
names, and provider IDs where the tracker exposes them. If a value cannot be
verified, put it in `Unknowns` with the source that should verify it. If the repo
differs from the org-wide defaults, document the mapping in this file instead of
changing the shared skills.

If a repo keeps separate label docs such as `docs/agents/triage-labels.md`, make
those docs mirror this config or point back here. Do not leave separate docs with
only readiness labels while risk, type, area, or ownership labels live elsewhere.

State authority should live in external systems:

- issue workflow state lives in the configured issue tracker
- claim records live in the configured issue tracker as supported fields,
  assignments, labels, and comments
- branch and PR state lives in the code host
- check and preview state lives in CI, preview, or hosted check providers
- deployment state lives in the deployment provider
- Queue local state is non-authoritative scratch or checkpoints only
