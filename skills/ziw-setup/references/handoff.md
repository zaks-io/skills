# Handoff Contract

Use this shape when one workflow role leaves work for another role, the user,
or a future run. Keep it short and factual.

```markdown
## Handoff

- Issue:
- Branch:
- PR:
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
- Checks:
- Hosted checks:
- Code review:
- Review evidence:
- CodeRabbit:
- Tracker updates:
- Blockers:
- Residual risk:
```

Rules:

- Include links or IDs, not pasted private logs or secrets.
- Say whether code review covers the current diff.
- Record the current PR head SHA, base branch SHA, and merge base used for
  review and checks. If any are unknown, say unknown and who must refresh them.
- List exact check commands and results. If conflicts were resolved, docs were
  touched, or the branch was updated after main moved, include the final command
  evidence after that event.
- When Markdown or docs changed, include the configured docs formatting check,
  such as `pnpm format:docs:check` when the target repo provides it.
- Say whether `Code review passed` is applied, removed, or requested for the
  current PR head SHA.
- Say whether the PR is draft/pre-review or non-draft/ready-for-review, and who
  owns any required ready-for-review transition.
- Say whether CodeRabbit is skipped, complete, auto-review pending, or still
  required for the current diff. Include auto-review mode when known and the
  command or PR-description marker used, such as `@coderabbitai full review` or
  `@coderabbitai ignore`.
- Say which hosted checks were observed for the current head, whether they were
  pending, passing, failing, or still progressing, and whether they used local,
  development, preview, or production resources.
- Leave active tracker status changes to Agent Orchestrator unless the user
  explicitly says otherwise. Issue Triage may reconcile verified stale states
  such as merged work marked done, and may promote complete intake issues to the
  configured ready state during requested ready-state promotion from intake or
  Linear Backlog cleanup.
