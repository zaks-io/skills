# Config template

Setup writes the Markdown below to `docs/agents/workflow/config.md` and the JSON
to `docs/agents/workflow/planner.json`. Fill only fields that apply. Record only
stable values: no secrets, status, or progress.

```markdown
# Workflow config

## Repo

- Default branch: main
- Branch prefix:
- Install:
- Focused checks:
- Full local gate:
- Required CI checks:
- Post-merge check:
- Production deploy: <how it happens>; requires explicit approval

## Planning

- Specs: <directory>
- Glossary: <path, or none>

## Tracker

- Provider and location: <for example, Linear team EXA, project Atlas>
- Route label: <owner/repo>
- States: workflow defaults, or each lifecycle step whose state differs
- Labels: <only names that differ from the workflow defaults>
- Estimates: <field, scale, and the largest estimate one ticket may carry; or
  none>
- Dependencies: <tracker blocking relation, or a body section>

## Workers

- Worker paths: <local worktree, remote agent, or both>
- Launch: <tool or command that starts a worker on one ticket>
- Follow-ups: <how to send a worker more instructions>

## Review and merge

- Merge method: squash | merge | rebase
- Hosted reviewer: <name and trigger, or none>
- Planner state file: <git-ignored path, such as .ziw/state.json>

## Friction

- Complaint tool: <tool name, or none>
```

```json
{
  "readyState": "Todo",
  "mergeAuthority": "human",
  "hostedReviewBots": ["coderabbitai"],
  "workerConcurrencyCap": 2
}
```

`planner.json` holds the values the planner reads. Always set `readyState`,
`mergeAuthority`, and `hostedReviewBots` (or `"hostedReviewRiskTiers": []` with
no hosted reviewer). The other defaults match the contract: cap 3, in progress
`In Progress`, hosted review required at high risk; set a field only when it
differs. Field names and types are in
[planner-input.schema.json](../../ziw-orchestrate/references/planner-input.schema.json).
