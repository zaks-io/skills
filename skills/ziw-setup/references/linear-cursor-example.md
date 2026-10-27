# Linear + Cursor Example Config

Illustrative `docs/agents/workflow/config.md` for Linear + Cursor, resolving
[operating-profile.md](operating-profile.md) defaults. Replace IDs, names, and
commands with values verified through read-only tracker/repo queries.
Never paste secrets; team/project IDs are workspace identifiers, not credentials.

```markdown
# Agent Config

Project state: Linear. This file stores stable configuration only.

## Repo

- Name: example-app
- Default branch: main
- Branch prefix: cursor (remote worker opens cursor/<slug>; local uses <issue-id>)
- Package manager: pnpm
- Install: pnpm install
- Full local gate: pnpm verify
- Focused checks: pnpm test <path>, pnpm prettier:check
- Production approval required: yes

## Planning Artifacts

- Current-truth spec authority: docs/specs/README.md and docs/specs/\*.md
- Spec paths: docs/specs/\*.md
- Spec format: existing repo template
- Spec status convention: Draft and Ready for slicing
- Spec readiness authority: explicit user confirmation required
- Glossary paths: GLOSSARY.md; preserve CONTEXT.md when that is the configured legacy path
- Context map: none; single context
- ADR path: docs/adr/
- ADR naming and status convention: NNNN-slug.md; Accepted or Superseded
- Authority hierarchy: specs, glossary, ADR rationale, code evidence, tracker slices, conversation context
- Documentation checks: pnpm format:check, pnpm docs:links, git diff --check

## Issue Tracker

- Provider: Linear
- Provider location: team "Example" (id <team-uuid>)
- Metadata lookup queries: list_issues team:"Example" state:Todo
- Status field names: status / statusType
- Ready state: Todo
- Intake states: Triage
- Linear Backlog state: Backlog
- Ready-state promotion source states: Triage, Backlog
- Linear Backlog policy: uncommitted, parked, or unshaped work; no Cursor delegation
  before explicit review and Todo promotion
- Active states: In Progress, Blocked, In Review, Changes Requested, Ready to Merge
- Done state: Done
- Code-host issue sync policy: linked GitHub/Linear records sync; PR status may
  auto-advance tickets
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
- Estimate policy: To Issues/Triage estimate `kind-slice` from sufficient scope
  evidence. Require estimates before `ready-for-agent`; otherwise use `needs-info`
  or `ready-for-human`
- Friction intake provider: Exposure Ledger MCP when its complaint writer is exposed
- Friction intake writer: verify the exact exposed complaint-writing tool
- Friction intake reader: verify the exact exposed project-scoped reader
- Friction intake fallback: none unless explicitly configured
- Friction intake location: project-scoped complaint store
- Friction intake visibility: internal; keep entries secret-free
- Friction intake mode: mcp-complaint
- Friction intake default state: open
- Friction intake agent create authority: local/issue-assigned agents; filing grants
  no delivery authority
- Friction intake close authority: human or explicitly requested retrospective
- Friction intake triage cadence: manual unless recurring review is configured
- Friction intake cleanup policy: classify recurring findings into checks,
  information access, judgment guidance, or instruction overhead
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
- Worker concurrency cap: 3 active Cursor or local repair sessions
- Worker count policy: distinct confirmed sessions until provider-confirmed
  return/stop/failure. PR creation does not release them; humans, PRs, previews,
  and abandoned worktrees alone consume no slots
- Saturation policy: advance PR state and immediately fill every safe worker
  slot; record why any slot remains idle while ready work exists
- Stuck-worker timeout: no branch/PR/agent-thread reply within <N> min -> direct
  thread nudge, then escalate or re-delegate only if the session cannot continue
- Attempt cap: follow `ziw-code-review` Review limits, including cumulative Author QA, high-risk exception, progress stops, and escalation
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
- Single-ticket one-off policy: direct requests authorize only the named issue
  through configured states; Done requires merge and verification evidence
- Friction intake: verified Exposure Ledger MCP complaint writer; no tracker mirroring
- Friction review automation: none; manual project-scoped complaint retrospective
- Capacity metrics: active workers, worker cap, remaining headroom, and
  justified idle slots at tick start and end

## Agent Access

- Issue-assigned agents: Cursor (Linear agent user)
- Issue-assigned delegation: set issue delegate = Cursor (delegate field accepts
  agent name or id)
- Issue-assigned continuation replies: Cursor agent-session thread-root parentId;
  top-level comments do not continue the session.
- Delegation probe policy: never mutate real implementation issues to test
- Session handle: record the cursor.com/agents/bc-<id> URL Cursor posts
- Liveness signals: agent-thread reply, branch push, PR creation, check activity

## Pull Requests

- Draft PR policy: Cursor opens a draft PR; orchestrator marks it ready-for-review
  after review is clean and required checks pass, then verifies non-draft
- Ready-for-review owner: Agent Orchestrator
- Local GitHub review submission actor policy: use the repo-configured local
  agent GitHub identity for explicit `ziw-code-review --submit`; submit
  `COMMENT` reviews only
- Hosted bot review provider policy: optional CodeRabbit or Cursor Bugbot only with a verified integration; resolve availability live
- Hosted bot review trigger policy: resolve provider auto-review state and exact
  trigger before posting commands
- Hosted review risk tiers: `high`
- Hosted review bot logins: `coderabbitai`
- CodeRabbit config source: root `.coderabbit.yaml`
- CodeRabbit bot handle: @coderabbitai
- CodeRabbit auto-review: enabled for non-draft PRs unless root config says
  otherwise
- CodeRabbit command policy: after clean local review, require HIGH-risk review;
  LOW/MEDIUM only for reviewer uncertainty or user request. Top-level PR commands:
  `@coderabbitai review` or `@coderabbitai full review`. Optional auto-review skip:
  PR-description `@coderabbitai ignore` when rate limits/credits matter.
- Cursor Bugbot command policy: use only verified app auto-review or
  repo-configured trigger; do not reuse CodeRabbit commands.
- Merge authority: see Work Coordination

## Environments

- Local: self-contained unless this repo says otherwise
- Preview: PR-scoped Cursor/GitHub preview environment
- Preview provider cap: 3 active previews
- Preview cleanup policy: close proven duplicate PRs or stop orphan previews
  before assigning more; capacity never justifies closing draft/in-progress PRs
- Production: explicit approval required
- Hosted checks allowed without approval: <list or none>
- Hosted checks requiring approval: <list>
```

## Notes On The Cursor Path

Repair a missing repo-route label only when the team maps unambiguously to one
repo; file `config-gap`. Otherwise escalate `needs-info`. See
[delegation-policy.md](../../ziw-orchestrate/references/delegation-policy.md)
for tracker assignment and session-thread continuation mechanics.
