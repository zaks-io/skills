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
- Spec status line: `Status: Draft` or `Status: Ready for slicing`
- Glossary: <path, or none>

## Tracker

- Provider and location: <for example, Linear team EXA, project Atlas>
- Route label: <owner/repo>
- States: intake `Triage`, ready `Todo`, in progress `In Progress`,
  review `In Review`, changes `Changes Requested`, merge `Ready to Merge`,
  done `Done`
- Labels: <only names that differ from the workflow defaults>
- Estimates: <field and scale, or none>
- Dependencies: <tracker blocking relation, or a body section>

## Workers

- Worker paths: <local worktree, remote agent, or both>
- Launch: <tool or command that starts a worker on one ticket>
- Follow-ups: <how to send a worker more instructions>
- Concurrency cap: <number>

## Review and merge

- Merge authority: human | agent
- Merge method: squash | merge | rebase
- Hosted reviewer: <name and trigger, the risk tiers that require it, or none>
- Planner state file: <git-ignored path, such as .ziw/state.json>

## Friction

- Complaint tool: <tool name, or none>
```

```json
{
  "workerConcurrencyCap": 2,
  "readyState": "Todo",
  "inProgressState": "In Progress",
  "mergeAuthority": "human",
  "hostedReviewRiskTiers": ["high"],
  "hostedReviewBots": ["coderabbitai"]
}
```

`planner.json` repeats the config values the planner reads. Valid fields are in
[planner-input.schema.json](../../ziw-orchestrate/references/planner-input.schema.json);
use exact JSON types and leave out what you don't need.
