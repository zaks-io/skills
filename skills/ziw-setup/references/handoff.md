# Handoff Contract

Use this shape when one workflow role leaves work for another role, the user,
or a future run. Keep it short and factual.

When the handoff escalates to the user, it must also carry a decision request.
An escalation that hands the user a PR or ticket to go study is invalid; frame
the decision or keep the work.

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
- Review evidence:
- Hosted bot review:
- Tracker updates:
- Blockers:
- Residual risk:
```

Rules:

- Include links or IDs, not pasted private logs or secrets.
- Implementation/repair handoffs preserve the runtime's actual `receiptId` and
  `sessionId`, the tracker `issueKey`/`issueUuid`, worktree `path`, and PR number.
  Say unknown for missing evidence; omit unknown typed fields from JSON. Never
  repurpose a generic `id`, issue UUID, branch, or path as session identity.
- State whether the worker is still running, returned, stopped, or failed, with
  provider evidence. A PR association alone does not release its capacity slot.
  Use the canonical v3 receipt shape in
  [the planner input contract](../../ziw-orchestrate/references/planner-input.md)
  for machine-readable returns. Persist project progress and blockers in Linear;
  Repo Config contains stable mappings and policy only.
- Say whether code review covers the current diff.
- Say whether the diff stayed inside the linked issue's in-scope and
  out-of-scope boundary. If it did not, name the split, revert, or human
  decision needed before handoff.
- The code host is authoritative for PR head, base, merge base, draft state,
  hosted checks, and hosted bot review state. The receiving role reads them
  there. An implementation worker reports the head SHA it pushed and leaves the
  other code-host fields out instead of polling for them.
- List exact check commands and results, including hook runs. If conflicts were
  resolved or the branch was updated after main moved, include the checks run
  after that event.
- Say whether the configured review evidence label is applied, removed, or
  requested for the current PR head SHA.
- Say whether the configured code-host human-merge PR label, such as
  `needs-human-merge`, is applied, removed, or requested, and list the
  merge-ready evidence that justifies it.
- Say whether the PR is draft/pre-review or non-draft/ready-for-review, and who
  owns any required ready-for-review transition.
- Agent Orchestrator and Agent Review report hosted bot review state: skipped,
  complete, auto-review pending, or still required for the current diff, with
  provider, trigger, and the command or PR-description marker used when known.
  For Cursor Bugbot, name the verified trigger or say it is unresolved.
- A role that waited on hosted checks says what it observed and whether they
  used local, development, preview, or production resources. Implementation
  workers do not wait for hosted checks.
- Leave active tracker status changes to Agent Orchestrator unless the user
  explicitly says otherwise. Issue Triage may reconcile verified stale states
  such as merged work marked done, and may promote complete configured intake
  issues during a normal triage run. Linear Backlog promotion still requires an
  explicit Linear Backlog cleanup request.
