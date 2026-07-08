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
- Intake states: Triage
- Linear Backlog state: Backlog
- Ready-state promotion source states: Triage, Backlog
- Linear Backlog policy: not delegated to Cursor unless explicitly reviewed and
  promoted to Todo; use for uncommitted, intentionally parked, or incorrectly
  shaped work
- Active states: In Progress, Blocked, In Review, Changes Requested, Ready to Merge
- Done state: Done
- Code-host issue sync policy: GitHub PR links and Linear tickets are synced when
  both exist; Linear may auto-advance ticket state from PR status
- Kind labels: kind-spec, kind-epic, kind-slice (single-select; only kind-slice dispatchable)
- Readiness labels: needs-triage, needs-info, ready-for-agent, ready-for-human, wontfix
- Readiness-label query policy: label queries for ready-for-agent or
  ready-for-human exclude state:Done unless explicitly auditing Done cleanup
- Worker environment labels: remote-cursor (approved to run in remote Cursor)
- Repo-route label: <org>/example-app (REQUIRED before issue-assigned delegation;
  tells Cursor which GitHub repo to clone)
- Risk labels: risk-normal, risk-security-sensitive, risk-schema, risk-cross-cutting
- Review evidence labels: code-review-passed
- Type labels: Bug, Feature, Improvement, Tech Debt, Spike, Hotfix
- Estimate field: Linear estimate points
- Estimate scale: 1, 2, 3, 5, 8; split or route to human when a slice would
  exceed 8
- Estimate policy: To Issues and Issue Triage set estimates on `kind-slice`
  tickets when scope evidence is enough; estimates are required before
  `ready-for-agent`; missing required estimates use `needs-info` or
  `ready-for-human`
- Friction intake provider: Linear
- Friction intake location: private team "Skills" project "Agent Friction"
  (team id <team-uuid>, project id <project-uuid>)
- Friction intake visibility: private/internal
- Friction intake mode: ticket-per-finding
- Friction intake default state: Inbox
- Friction intake agent create authority: local and issue-assigned agents may
  create friction tickets only in this private team/project
- Friction intake close authority: nightly triage automation or human
- Friction intake triage cadence: daily Codex automation
- Friction intake cleanup policy: group duplicates, close non-actionable noise,
  and link actionable recurring patterns to skill-improvement PRs
- Friction intake redaction policy: metadata and IDs only; no secrets, private
  logs, signed URLs, customer data, or diffs
- Startable work criteria: kind-slice, Todo, ready-for-agent, remote-cursor,
  repo-route label, configured required estimate, complete body, no active
  blockers, no active claim, no open PR
- Dependency policy: use Linear blocker relationships; if issue A needs issue B
  first, A is blocked by B and B blocks A. Keep blocked-but-ready slices in Todo,
  not Linear Backlog.
- Done cleanup: remove ready-for-agent when moving a ticket to Done

## Work Coordination

- Worker delegation paths: issue-assigned (Cursor), local-worktree
- Default worker path: issue-assigned (Cursor)
- Active PR/preview cap: 3 active delivery slots. Count repo-level open PRs,
  active PR-scoped previews, and Cursor dispatches that have not yet returned a
  PR
- Cap count policy: count each open PR once, add active previews that are not
  clearly linked to an already counted PR, then add unreturned Cursor
  dispatches. Do not double-count a normal linked PR+preview
- Capacity drain policy: when the cap is full, review, merge, close, or escalate
  existing PRs/previews before assigning more Cursor work
- Stuck-worker timeout: no branch/PR/agent-thread reply within <N> min -> direct
  thread nudge, then escalate or re-delegate only if the session cannot continue
- Attempt cap: 3 implement+review cycles before the thrash breaker escalates
- Required checks for merge: <CI check names that define green>
- Auto-merge risk tiers: orchestrator may auto-merge LOW and MEDIUM when green;
  HIGH routes to human merge
- Post-merge preparation: <install/build/generated-artifact refresh needed before
  local main checks, or none>
- Post-merge check: <command/signal on main, or none>
- Verified-ready ticket-set policy: repair routine label/status/route/review
  evidence mismatches and keep scoped ready tickets moving
- Completely-blocked stop policy: stop the recurring orchestrator run for this
  scope and report blockers instead of waking forever
- Authoritative issue state: Linear
- Authoritative PR state: GitHub
- Merge authority: orchestrator for LOW/MEDIUM green PRs; human for HIGH
- Single-ticket one-off policy: a direct user request for one Linear issue grants
  authority to orchestrate only that issue through configured states, including
  Done when merge and verification evidence exists
- Friction intake: private Linear Skills team/project, state Inbox, ticket-per-finding
- Friction review automation: daily Codex automation reviews Inbox, dedupes or
  closes noise, and opens a small PR for concrete skill improvements
- Capacity metrics: open PRs, active previews, active delivery slots, and
  remaining headroom at start and end of orchestration runs

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
- Hosted bot review provider: CodeRabbit or Cursor Bugbot per repo/user
  preference; Cursor Bugbot is the natural alternative when Cursor PR review is
  installed and verified
- Hosted bot review trigger policy: resolve provider auto-review state and exact
  trigger before posting commands
- CodeRabbit config source: root `.coderabbit.yaml`
- CodeRabbit bot handle: @coderabbitai
- CodeRabbit auto-review: enabled for non-draft PRs unless root config says
  otherwise
- CodeRabbit command policy: HIGH-risk diffs require CodeRabbit after local
  review is clean; LOW/MEDIUM skip unless the reviewer is uncertain or the user
  asks. Use top-level PR comments for `@coderabbitai review` or
  `@coderabbitai full review`; add `@coderabbitai ignore` to the PR description
  to skip optional auto-review when rate limits or credits matter.
- Cursor Bugbot command policy: use only verified app auto-review or
  repo-configured trigger; do not reuse CodeRabbit commands.
- Merge authority: see Work Coordination

## Environments

- Local: self-contained unless this repo says otherwise
- Preview: PR-scoped Cursor/GitHub preview environment
- Preview provider cap: 3 active previews
- Preview cleanup policy: close verified duplicate PRs or terminate orphan
  previews before assigning more work; never close draft or in-progress PRs only
  to free capacity
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
