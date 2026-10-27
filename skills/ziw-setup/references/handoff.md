# Handoff Contract

Use for role-to-role, user, or future-run handoffs. Keep facts brief.
User escalations need a decision request, not a PR or ticket to study.
Frame the decision or keep the work.

```markdown
## Decision Request

- Question: <one sentence>
- Options:
  - <option A>: <tradeoff>
  - <option B>: <tradeoff>
  - <option C, when it adds a distinct useful choice>: <tradeoff>
- Recommendation: <option and why>
- Blocks: <what waits on this decision; what proceeds without it>
```

```markdown
## Handoff

- Issue URL, issueKey, and issueUuid when known:
- receiptId and sessionId for implementation/repair work:
- Worker lifecycle and provider evidence:
- Branch and worktree path:
- PR URL and number:
- PR head SHA:
- Base SHA:
- Merge base:
- Owner:
- Agent path:
- Environment:
- PR state:
- Current state:
- Next owner:
- Next action:
- Files changed:
- Scope audit:
- Checks:
- Hosted checks:
- Code review:
- Review rounds, limit, prior findings, attempted fixes, and stop condition:
- Review evidence:
- Hosted bot review:
- Tracker updates:
- Blockers:
- Residual risk:
```

Rules:

- Include links/IDs, never secrets or pasted private logs.
- Preserve actual runtime `receiptId`/`sessionId`, tracker `issueKey`/`issueUuid`,
  worktree `path`, and PR number. Report missing evidence as unknown;
  omit unknown typed JSON fields. Never substitute a generic `id`, issue UUID,
  branch, or path for session identity.
- Report running, returned, stopped, or failed lifecycle with provider evidence.
  A linked PR alone does not release capacity. Machine-readable returns use
  [canonical v3 receipts](../../ziw-orchestrate/references/planner-input.md).
- Persist progress/blockers in Linear; config holds stable mappings and policy.
- State whether review covers the current diff.
- Preserve cumulative completed rounds, including Author QA, across continuations.
  Carry prior findings, fixes, limits, and stop conditions; follow
  [Review limits](../../ziw-code-review/SKILL.md#review-limits).
- Audit linked-issue scope and non-goals. Name any required split, revert, or human decision.
- Receivers read head, base, merge base, draft state, hosted checks, and bot review
  from the authoritative code host. Implementers report only their pushed head;
  omit other code-host fields rather than polling.
- List exact check commands/results, including hooks and checks after conflict
  resolution or branch updates.
- Report review-evidence and human-merge labels as applied, removed, or requested.
  Include the current-diff fingerprint and merge-ready evidence.
- State draft/pre-review or non-draft/ready-for-review and who owns the transition.
- Orchestrator/Review report hosted review as skipped, complete, auto-review
  pending, or required for the current diff. Include provider, trigger, and known
  command/description marker. Name Bugbot's verified trigger or unresolved gap.
- Hosted-check observers report results and local/development/preview/production
  resources used. Implementers do not wait for hosted checks.
- Orchestrator owns active tracker transitions unless the user explicitly authorizes
  otherwise. Triage may reconcile proven stale states or promote complete configured
  intake during normal runs. Linear Backlog promotion requires explicitly requested cleanup.
