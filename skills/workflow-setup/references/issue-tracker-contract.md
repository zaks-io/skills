# Issue Tracker Contract

Use this when writing the issue tracker section of
`docs/agents/workflow/config.md`. The configured tracker can be any provider the
repo uses.

## Default States

- `Triage`
- `Backlog`
- `Todo`
- `In Progress`
- `Blocked`
- `In Review`
- `Changes Requested`
- `Ready to Merge`
- `Done`
- `Canceled`
- `Duplicate`

## Default Labels

Readiness:

- `needs-triage`
- `needs-info`
- `ready-for-agent`
- `ready-for-human`
- `remote-worker`
- `wontfix`

Risk:

- `risk-normal`
- `risk-security-sensitive`
- `risk-schema`
- `risk-cross-cutting`

Type:

- `Bug`
- `Feature`
- `Improvement`
- `Tech Debt`
- `Spike`
- `Hotfix`

## Agent-Ready Issue Body

An issue is ready for Agent Implement only when it is scoped to one PR and
contains:

- outcome
- context docs
- in scope
- out of scope
- acceptance criteria
- required checks
- security, privacy, data, or operational invariants
- dependencies or blockers

## Readiness Rules

- Ready implementation work is `Todo`, unblocked, labeled `ready-for-agent`, and
  has a complete agent-ready body.
- Remote worker work also has `remote-worker`.
- Labels are coordination signals. The issue tracker is the source of truth for
  workflow state. Agent Queue owns the authority to mutate workflow state unless
  the user explicitly says otherwise.
- Blocked work is not labeled `ready-for-agent`.
- Human setup, credentials, product judgment, provider approval, customer input,
  and ADR decisions use `ready-for-human` or `needs-info`.
- Dependency order should be encoded with tracker relationships when the
  provider supports them.
- Parent or workstream issues are containers unless explicitly marked
  executable.

## Orphan Rules

An orphan is a real issue that belongs in the workflow but is missing the project,
team, parent, route label, status, body contract, or dependency links that let
Agent Queue reason about it.

- Route orphans when the correct project, team, parent, or label is directly
  evidenced by the issue, linked docs, PR, branch, or configured repo route.
- Leave ambiguous orphans in triage with `needs-info` or `ready-for-human`.
- Do not mark an orphan `ready-for-agent` until routing, body contract, labels,
  status, and blockers are all correct.
- Do not cancel or close an orphan only because it is stale.

## Creating Tracked Work From Docs

When turning roadmaps, specs, ADRs, or plans into issues:

- extract only explicit capabilities, decisions, constraints, deferred work, and
  dependencies
- create one-PR implementation slices
- group by the configured tracker location, milestone, and parent or workstream
  issue
- apply repo routing, type, risk, area, and readiness labels from config
- leave vague ideas un-ticketed until scope is clear

Do not invent product scope, create new label taxonomies, or paste secrets,
customer data, signed URLs, credentials, or private logs into the tracker.
