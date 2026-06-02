# Handoff Contract

Use this shape when one workflow role leaves work for another role, the user,
or a future run. Keep it short and factual.

```markdown
## Handoff

- Issue:
- Branch:
- PR:
- Owner:
- Agent path:
- Environment:
- PR state:
- Current state:
- Next owner:
- Next action:
- Files changed:
- Checks:
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
- Say whether `Code review passed` is applied, removed, or requested for the
  current PR head SHA.
- Say whether the PR is draft/pre-review or non-draft/ready-for-review, and who
  owns any required ready-for-review transition.
- Say whether CodeRabbit is skipped, complete, or still required for the current
  diff.
- Say whether hosted checks used local, development, preview, or production
  resources.
- Leave active tracker status changes to Agent Orchestrator unless the user
  explicitly says otherwise. Issue Triage may reconcile verified stale states
  such as merged work marked done, and may promote complete intake issues to the
  configured ready state only during requested intake cleanup.
