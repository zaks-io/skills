# Linear + Cursor Example Config

A worked `docs/agents/workflow/config.md` for a repo whose tracker is Linear and
whose remote worker is Cursor. Copy the shape; replace IDs, names, and commands
with verified values for the target repo. This shows how the
[operating-profile.md](operating-profile.md) defaults resolve into concrete
config so the loop reads values instead of rediscovering them.

Values below are illustrative. Verify every one during setup with read-only
tracker and repo queries. Do not paste secrets; team and project IDs are
workspace identifiers, not credentials.

```markdown
# Agent Config

Last updated: 2026-06-01

## Verification

- Scope: this repo + its Linear team
- Evidence sources: package.json, CI workflow, Linear read-only queries, git
- Safe commands run: <install>, <full gate> (dry), git remote -v
- Read-only tool calls: list_teams, list_issues delegate:Cursor, list_comments
- Inferred values: none
- Critical unknowns: none

## Repo

- Name: example-app
- Default branch: main
- Branch prefix: cursor (remote worker opens cursor/<slug>; local uses <issue-id>)
- Package manager: pnpm
- Install: pnpm install
- Full local gate: pnpm verify
- Focused checks: pnpm test <path>, pnpm prettier:check
- Production approval required: yes

## Issue Tracker

- Provider: Linear
- Provider location: team "Example" (id <team-uuid>)
- Read-only verification query: list_issues team:"Example" state:Todo
- Status field names: status / statusType
- Ready state: Todo
- Intake states: Triage, Backlog
- Active states: In Progress, Blocked, In Review, Changes Requested, Ready to Merge
- Done state: Done
- Kind labels: kind-spec, kind-epic, kind-slice (single-select; only kind-slice dispatchable)
- Readiness labels: needs-triage, needs-info, ready-for-agent, ready-for-human, wontfix
- Worker environment labels: remote-cursor (approved to run in remote Cursor)
- Repo-route label: <org>/example-app (REQUIRED before issue-assigned delegation;
  tells Cursor which GitHub repo to clone)
- Risk labels: risk-normal, risk-security-sensitive, risk-schema, risk-cross-cutting
- Review evidence labels: Code review passed
- Type labels: Bug, Feature, Improvement, Tech Debt, Spike, Hotfix
- Startable work criteria: kind-slice, Todo, ready-for-agent, remote-cursor,
  repo-route label, complete body, no active blockers, no active claim, no open PR
- Done cleanup: remove ready-for-agent when moving a ticket to Done

## Work Coordination

- Worker delegation paths: issue-assigned (Cursor), local-worktree
- Default worker path: issue-assigned (Cursor)
- Concurrency cap: 3 concurrent Cursor agents
- Stuck-worker timeout: no branch/PR/agent-thread reply within <N> min -> direct
  thread nudge, then escalate or re-delegate only if the session cannot continue
- Attempt cap: 3 implement+review cycles before the thrash breaker escalates
- Required checks for merge: <CI check names that define green>
- Auto-merge risk tiers: orchestrator may auto-merge LOW and MEDIUM when green;
  HIGH routes to human merge
- Post-merge preparation: <install/build/generated-artifact refresh needed before
  local main checks, or none>
- Post-merge check: <command/signal on main, or none>
- Verified-ready backlog policy: repair routine label/status/route/review
  evidence mismatches and keep scoped ready tickets moving
- Completely-blocked stop policy: stop the recurring orchestrator run for this
  scope and report blockers instead of waking forever
- Authoritative issue state: Linear
- Authoritative PR state: GitHub
- Merge authority: orchestrator for LOW/MEDIUM green PRs; human for HIGH
- Friction-log ticket: <parked Linear ticket id, out of the work queue>

## Agent Access

- Issue-assigned agents: Cursor (Linear agent user)
- Issue-assigned delegation: set issue delegate = Cursor (delegate field accepts
  agent name or id)
- Issue-assigned continuation replies: reply INTO the Cursor agent-session thread
  via the thread-root comment's parentId. A top-level issue comment does NOT
  continue the session.
- Delegation probe policy: never mutate real implementation issues to test
- Session handle: record the cursor.com/agents/bc-<id> URL Cursor posts
- Liveness signals: agent-thread reply, branch push, PR creation, check activity

## Pull Requests

- Draft PR policy: Cursor opens a draft PR; orchestrator marks it ready-for-review
  after review is clean and required checks pass, then verifies non-draft
- Ready-for-review owner: Agent Orchestrator
- CodeRabbit: required for HIGH-risk diffs after local review is clean; skip for
  LOW/MEDIUM unless the reviewer is uncertain or the user asks
- Merge authority: see Work Coordination

## Environments

- Local: self-contained unless this repo says otherwise
- Production: explicit approval required
- Hosted checks allowed without approval: <list or none>
- Hosted checks requiring approval: <list>

## Unknowns

- [ ] (none if fully verified)
```

## Notes On The Cursor Path

- Delegation = set the issue delegate to the Cursor agent user. The human stays
  assignee.
- The repo-route label (`<org>/<repo>`) must be present before delegation so
  Cursor resolves the correct GitHub repo. If the Linear team maps unambiguously
  to one repo, heal the label inline and log a `config-gap`; otherwise escalate
  `needs-info`.
- Continue a session only by replying into its agent-session thread. See
  [operating-profile.md](operating-profile.md) for the full mechanic and the
  delegation preflight table.
