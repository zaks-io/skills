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
- Project, board, repo, milestone, or roadmap:
- Routing label:
- Issue key examples:
- Ready state: Todo
- Active states: In Progress, Blocked, In Review, Changes Requested, Ready to Merge
- Done state: Done
- Readiness labels: needs-triage, needs-info, ready-for-agent, ready-for-human, remote-worker, wontfix
- Risk labels: risk-normal, risk-security-sensitive, risk-schema, risk-cross-cutting
- Type labels: Bug, Feature, Improvement, Tech Debt, Spike, Hotfix
- Dependency policy:
- Agent-ready issue body:

## Agent Runtimes

- Local Codex:
- Remote worker:
- Claude:
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

- Local:
- Preview:
- Development:
- Production:
- Hosted checks allowed without approval:
- Hosted checks requiring approval:

## Unknowns

- [ ] Missing or unverified config item.
```

Prefer explicit commands and exact issue tracker names. If the repo differs from
the org-wide defaults, document the mapping in this file instead of changing the
shared skills.
