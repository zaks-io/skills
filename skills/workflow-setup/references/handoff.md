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
- Current state:
- Next owner:
- Next action:
- Files changed:
- Checks:
- Code review:
- Tracker updates:
- Blockers:
- Residual risk:
```

Rules:

- Include links or IDs, not pasted private logs or secrets.
- Say whether code review covers the current diff.
- Say whether hosted checks used local, development, preview, or production
  resources.
- Leave tracker status changes to Agent Orchestrator unless the user explicitly says
  otherwise.
