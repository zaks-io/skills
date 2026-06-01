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

Kind (single-select; skills enforce exclusivity even if the tracker group does
not):

- `kind-spec`: holds spec or PRD prose; input to decompose; never dispatched
- `kind-epic`: parent or workstream container; never dispatched
- `kind-slice`: one-PR implementation ticket; the only kind a worker runs

Kind is a separate axis from type. A `kind-slice` still carries one type label.
`workflow-decompose` sets exactly one kind and clears any other `kind-*`.

Readiness:

- `needs-triage`
- `needs-info`
- `ready-for-agent`
- `ready-for-human`
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

## Label Treatment Rules

- Repo config owns the treatment policy for every readiness and worker
  environment label. The defaults below apply only when the repo has no
  different verified mapping.
- `ready-for-agent` means no further human refinement is needed before handing
  the issue to an implementation agent. The issue should be scoped to one PR and
  backed by a complete agent-ready body. It can be present while dependency
  blockers remain.
- Issue Triage should make current tickets agent-ready and keep tracker state
  aligned with external reality. Its default scope is the configured ready state,
  usually `Todo`, plus active or PR-linked issues that need repair. It should
  not review `Backlog` or equivalent future-work states unless the user
  explicitly asks for backlog review.
- During requested intake cleanup, Issue Triage may move complete issues from
  configured intake states such as `Triage` to the configured ready state,
  usually `Todo`. Encode blockers separately; dependency blockers do not prevent
  intake-to-ready promotion. Do not promote `Backlog` by default.
- Startable implementation work is `Todo`, unblocked, labeled `ready-for-agent`,
  and has a complete agent-ready body.
- Issue-assigned agent work, when supported by the repo, uses the repo-configured
  worker environment label, routing field, or metadata the tracker integration
  needs to select the environment.
- When the user explicitly chooses an issue-assigned worker path, Orchestrator or
  Issue Triage may add the configured worker environment label or field after
  verifying the issue identity, repo route, and environment approval criteria. Do
  not require dependencies to be clear just to apply the environment label.
- If a repo uses an extra label such as `remote-worker` or `remote-cursor`,
  record it in `docs/agents/workflow/config.md`; it is not a shared default.
- Labels are coordination signals. The issue tracker is the source of truth for
  workflow state. Issue Triage owns requested intake-to-ready promotion and
  verified stale-state reconciliation, such as marking linked merged PR work
  `Done`. Agent Orchestrator owns active workflow state unless the user
  explicitly says otherwise.
- Blocked work can keep `ready-for-agent`. Blocker relationships, body blockers,
  or workflow state stop scheduling; they do not redefine readiness metadata.
- Worker environment labels are approval and routing metadata. They do not say
  whether the issue needs human refinement, whether dependencies are done, or
  whether Orchestrator may start it now.
- Human setup, credentials, product judgment, provider approval, customer input,
  and ADR decisions use `ready-for-human` or `needs-info`.
- Dependency order should be encoded with tracker relationships when the
  provider supports them.
- Parent or workstream issues are containers unless explicitly marked
  executable. `kind-spec` and `kind-epic` are containers: they are decompose
  input and must never be dispatched to a worker or marked `ready-for-agent`.
  Only `kind-slice` tickets are startable implementation work. `kind-spec` and `kind-epic` are containers: they are decompose
  input and must never be dispatched to a worker or marked `ready-for-agent`.
  Only `kind-slice` tickets are startable implementation work.
- Backlog review is opt-in. Do not scan, rewrite, promote, or reprioritize
  backlog issues during default issue triage.

## Tracker Metadata Verification

Setup must record query-safe tracker metadata for the configured scope:

- exact provider IDs, keys, or display names accepted by the tracker tool
- status field names used by the current tool, such as `status`, `state`, or
  `statusType`
- blocker and dependency relationship fields
- routing and readiness labels
- a read-only verification query that returns the expected issue set

Do not treat an empty tracker response as proof that no work exists until the
configured provider ID or query-safe name has been verified. Do not parse local
tool-result cache files when the tracker tool can answer directly.

Do not mutate a real implementation issue to test whether a delegation field,
agent name, or integration exists. Use read-only metadata, existing verified
config, provider docs, or a user-approved test issue.

## Orphan Rules

An orphan is a real issue that belongs in the workflow but is missing the project,
team, parent, route label, status, body contract, or dependency links that let
Agent Orchestrator reason about it.

- Route orphans when the correct project, team, parent, or label is directly
  evidenced by the issue, linked docs, PR, branch, or configured repo route.
- Leave ambiguous orphans in triage with `needs-info` or `ready-for-human`.
- Do not mark an orphan `ready-for-agent` until routing, body contract, and
  labels are correct. Encode blockers separately.
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
