# Project Config Template

Create `docs/agents/workflow/config.md` with this shape. Keep it metadata-only.

```markdown
# Agent Config

Last updated: YYYY-MM-DD

## Verification

- Scope:
- Evidence sources:
- Safe commands run:
- Read-only tool calls:
- Inferred values:
- Critical unknowns:

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
- Query-safe names:
- Read-only verification query:
- Tracker tool query contract:
- Status field names:
- Dependency and blocker fields:
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
- Status transition owner: Agent Orchestrator
- Readiness labels: needs-triage, needs-info, ready-for-agent, ready-for-human, wontfix
- Readiness label policy:
  - ready-for-agent: no further human refinement is needed before agent handoff; does not mean unblocked or startable
  - needs-info:
  - ready-for-human:
- Worker environment labels:
- Worker environment label policy:
  - remote-cursor: approved to run in the remote Cursor environment; does not mean unblocked or startable
- Startable work criteria: ready state, ready-for-agent, complete body, no active blockers, no active claim or open PR
- Risk labels: risk-normal, risk-security-sensitive, risk-schema, risk-cross-cutting
- Type labels: Bug, Feature, Improvement, Tech Debt, Spike, Hotfix
- Area labels:
- Priority policy:
- Dependency policy:
- Agent-ready issue body:
- Labels are signals, not authority:

## Work Coordination

- Worker delegation paths: local-worktree, issue-assigned, or both
- Default worker path:
- Parallelism policy:
- Authoritative issue state:
- Authoritative PR state:
- Authoritative check state:
- Authoritative deploy state:
- Orchestrator mutation authority:
- Implement authority:
- Review authority:
- Merge authority:
- Claim record:
- Orchestrator local state:
- Handoff format:

## Agent Access

- Local Codex:
- Issue-assigned agents: none, or project-specific routing/continuation notes
- Issue-assigned delegation: tool or field, verified agent names or IDs, and continuation path
- Delegation probe policy: never mutate real implementation issues
- Claude:
- Claude Code source of truth:
- Claude Code imports:
- Claude Code symlinks:
- Claude Code verification:
- Review model policy:
- Agent Orchestrator:
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

Every populated value that can affect workflow behavior must be verified during
setup or explicitly marked inferred. If it cannot be verified, move it to
`Unknowns` instead of leaving it in the main config as authoritative. Keep
verification evidence compact and grouped by source, not as a long transcript.

Provider locations must be query-safe. Store the exact ID, key, or display name
accepted by the tracker tool, plus the read-only query that verified it. Do not
store only a repo slug when the provider requires a different team, project, or
board name.

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
- Orchestrator local state is non-authoritative scratch or checkpoints only

Every configured readiness or worker environment label needs a short treatment
policy in this file. `ready-for-agent` should answer "does a human need to refine
this ticket before I hand it to an implementation agent?" It must not be used as
a dependency, status, or scheduling signal. Worker environment labels such as
`remote-cursor` should answer "is this issue allowed to run in that configured
environment?" They must not be used as dependency, status, or scheduling signals.

Issue-assigned worker config should be stable enough for Orchestrator to act
without probing real work. Record the configured worker path, environment labels
or fields, environment approval labels, delegation tool or field, known agent
names or IDs when verified, and the parallelism policy. If the tool cannot
expose assignable agents through a read-only query, record that unknown instead
of forcing Orchestrator to discover it by assignment.
