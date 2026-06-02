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
- Repo-route label: the label that names the target repo (such as `<org>/<repo>`); required before issue-assigned delegation so the agent resolves which repo to clone
- Triage scope: Todo and active or PR-linked current issues by default; backlog only when explicitly requested
- Review-debt intake route: filter, label, project, parent, or status where
  Agent Review files follow-up findings so triage and orchestration include them
  by default
- Review-debt intake policy: review-created findings are current-work intake.
  Concrete one-PR findings become `kind-slice` with `Bug` or `Tech Debt`, risk,
  route, body contract, and readiness when complete. Broader architecture or
  ambiguous findings become `kind-spec` or `kind-epic` for To Issues or
  `ready-for-human` with the exact decision needed.
- Orphan policy:
- Issue key examples:
- Ready state: Todo
- Intake states: Triage, Backlog
- Active states: In Progress, Blocked, In Review, Changes Requested, Ready to Merge
- Done state: Done
- Status transition owner: Issue Triage may reconcile verified stale states and move requested intake cleanup to ready state; Agent Orchestrator owns active workflow transitions
- Readiness labels: needs-triage, needs-info, ready-for-agent, ready-for-human, wontfix
- Readiness label policy:
  - ready-for-agent: no further human refinement is needed before agent handoff; does not mean unblocked or startable; remove when the issue moves to Done
  - needs-info:
  - ready-for-human:
- Worker environment labels:
- Worker environment label policy:
  - remote-cursor: approved to run in the remote Cursor environment; does not mean unblocked or startable
- Startable work criteria: kind-slice, ready state, ready-for-agent, complete body, repo-route label when issue-assigned, no active blockers, no active claim or open PR
- Done cleanup: remove ready-for-agent or the repo-configured readiness label
  when moving an issue to Done
- Agent suitability policy: default agent work includes docs, tests, build/CI,
  small local refactors, scoped bugs with reproduction, and isolated UI changes;
  human planning required for auth, secrets, PII, payments, production,
  destructive data, broad refactors, cross-repo work, unclear domain behavior,
  or performance work without benchmarks
- Kind labels: kind-spec, kind-epic, kind-slice (single-select; skills enforce exclusivity; only kind-slice is dispatchable)
- Risk labels: risk-normal, risk-security-sensitive, risk-schema, risk-cross-cutting
- Risk label policy: use the default risk labels as dimensions, not severity levels; add repo-specific risk labels only when they change routing, checks, approvals, or reviewer assignment
- Review evidence labels: Code review passed
- Review evidence label policy:
  - Code review passed: latest linked PR head SHA passed the configured code review gate; apply only with PR URL and reviewed head SHA evidence; remove when PR head changes, blocking findings appear, linked PR changes, or evidence is missing
- Type labels: Bug, Feature, Improvement, Tech Debt, Spike, Hotfix
- Area labels:
- Priority policy:
- Dependency policy:
- Dependency graph mechanism: tracker relationship/blocker field, or configured body shape
- File footprint convention: where To Issues records predicted files/packages per slice
- Review-debt footprint convention: where Agent Review or triage records likely
  files/packages for review-created `kind-slice` tickets before Orchestrator can
  dispatch them
- Agent-ready issue body: outcome, context docs, likely files/packages/artifacts,
  scope, acceptance criteria, required checks, safety invariants, dependencies
- Labels are signals, not authority:

## Work Coordination

- Worker delegation paths: local-worktree, issue-assigned, or both
- Default worker path:
- Parallelism policy:
- Concurrency cap: max workers dispatched at once (default 3 if unset)
- Stuck-worker timeout: ticks or wall-clock with no branch/PR/worker signal before nudge, re-dispatch, or escalation
- Attempt cap: implement+review attempts on one ticket before the thrash circuit breaker escalates
- Required checks for merge: the CI checks that define green for the integrate gate
- Auto-merge risk tiers: which risk tiers Orchestrator may auto-merge vs route to human merge
- Post-merge preparation: install, build, generated-artifact, or dependency refresh needed before local post-merge checks are trustworthy
- Post-merge check: command or signal that confirms the default branch is healthy after merge, if any
- Authoritative issue state:
- Authoritative PR state:
- Authoritative check state:
- Authoritative deploy state:
- Orchestrator mutation authority:
- Orchestrator recurring mechanism: Claude Code `/loop`, schedule, or wake-up
  timer; Codex automations, either cron automations or heartbeat automations;
  exact configured mechanism or "none"
- Issue Triage mutation authority:
- Implement authority:
- Review authority:
- Merge authority:
- Claim record:
- Orchestrator local state:
- Verified-ready backlog policy: when the user scopes a set of tickets that has
  already been reviewed as implementation-ready, Orchestrator owns moving every
  ticket through implementation, PR, review, and merge, and repairs routine label,
  status, route, handoff, and review-evidence mismatches from current evidence
- Completely-blocked stop policy: stop the recurring orchestrator run for the
  scoped queue when no startable tickets, PRs to advance, stuck workers to nudge,
  checks to rerun or route, stale metadata repairs, or in-flight work can still
  produce signal
- Friction-log ticket: dedicated ticket ID, parked out of the work queue, for orchestrator friction comments
- Delivery metrics: merge rate, first-pass check rate, review rework, stuck workers, human escalations, and agent cost when available
- Handoff format:

## Agent Access

- Local Codex:
- Issue-assigned agents: none, or project-specific routing/continuation notes
- Issue-assigned delegation: tool or field, verified agent names or IDs, and continuation path
- Issue-assigned continuation replies: reply into the agent-session thread (its thread-root comment's parentId); top-level issue comments are not continuation unless verified here. For Linear + Cursor this is the "agent session" thread; record the session handle (such as the cursor.com/agents/bc-id URL)
- Issue-assigned liveness signals: session reply, branch, PR, check activity, or provider-specific signal that proves the worker is alive
- Issue-assigned stuck-worker policy: nudge the existing continuation target before re-delegating unless current evidence proves the session cannot continue
- Delegation probe policy: never mutate real implementation issues
- Claude:
- Claude Code source of truth:
- Claude Code imports:
- Claude Code symlinks:
- Claude Code verification:
- Claude loop terminology:
- Codex automations terminology:
- Review model policy: use the strongest configured reasoning path for
  orchestration and review decisions where evidence must be synthesized; use
  cheaper paths only for mechanical inventory reads when configured
- Agent Orchestrator:
- Agent Review:
- Agent Implement:

## Pull Requests

- PR title:
- PR body:
- Required checks:
- Code review:
- CodeRabbit:
- Draft PR policy: draft only while checks, requested human prep, or required
  author fixes are incomplete; draft state alone is not a code review request.
  Agent Orchestrator diagnoses stuck draft PRs, marks unblocked drafts
  ready-for-review, and verifies the code-host PR is non-draft unless this repo
  says otherwise. A kept-draft PR is pre-review, not ready-for-review
- Ready-for-review owner: Agent Orchestrator
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

Triage scope should describe current work, not the whole backlog. By default,
Issue Triage reviews Todo and active or PR-linked issues, verifies their labels,
body contracts, blockers, and external state, and marks proven merged work done.
Backlog, roadmap, someday, or future-work states are reviewed only when the user
explicitly asks for backlog review or first-run backlog backfill.

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
a dependency, status, or scheduling signal, and it must be removed when the
ticket moves to Done. Worker environment labels such as `remote-cursor` should
answer "is this issue allowed to run in that configured environment?" They must
not be used as dependency, status, or scheduling signals.

Issue-assigned worker config should be stable enough for Orchestrator to act
without probing real work. Record the configured worker path, environment labels
or fields, environment approval labels, delegation tool or field, known agent
names or IDs when verified, and the parallelism policy. If the tool cannot
expose assignable agents through a read-only query, record that unknown instead
of forcing Orchestrator to discover it by assignment.
