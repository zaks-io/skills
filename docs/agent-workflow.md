# Agent Workflow Details

This document holds the technical contract behind the workflow skills. README is
the usage guide. This file is for agents and maintainers who need the exact
state model and role split.

## Repo Config

Every downstream repo should have:

```text
docs/agents/workflow/config.md
```

Run `workflow-setup` once to create it, and rerun setup when the repo workflow
may have changed. Refresh runs read the existing config first, compare it against
current repo, tracker, CI, worker delegation, and environment state, then patch
stale or missing values. Other workflow skills read that file before guessing
repo-specific details such as package manager, issue tracker location, branch
prefix, review gate, preview checks, deploy rules, and environment safety.

## Systems Of Record

Workflow state must not live only in local agent files.

- Issue workflow state: configured issue tracker
- Claim records: issue tracker fields, assignments, labels, and comments
- Branch and PR state: configured code host
- Check and preview state: CI, preview, or hosted check provider
- Deploy state: deployment provider
- Orchestrator-local state: scratch, polling checkpoints, and duplicate
  suppression only

Agents must refresh the relevant systems of record before mutating anything.

## Roles

- Agent Orchestrator: reads external state, starts or nudges workers, asks for
  review, and owns the authority to mutate workflow status in the issue tracker.
- Agent Implement: owns one delegated issue through implementation, checks,
  code review, PR creation, and handoff.
- Agent Review: reviews PRs and main drift from clean context, reports verdicts
  to Orchestrator, and files or recommends follow-up issues.
- Issue Triage: updates tracker metadata, readiness, dependencies, and issue
  body shape so tickets are clean and ready; when something is unclear, it asks
  the user or leaves exact human next actions.
- Create PR: turns the current branch into a PR after checks and code review.
- Code Review: shared bug-focused review gate.

## Orchestration

Agent Orchestrator owns orchestration, not implementation. It chooses the next
action needed to get tickets handled safely: delegate implementation work, nudge
an existing worker, request another code review, rerun checks, route review
feedback, repair tracker metadata, mark tickets for human review or missing
information, move workflow state, or stop on a real blocker.

Downstream config should say which worker delegation paths the project supports:

- `local-worktree`: Agent Orchestrator starts local subagents, gives each worker
  an isolated worktree or branch, and coordinates issue state, PR state, checks,
  and review through the tracker.
- `issue-assigned`: Agent Orchestrator assigns a tracker-exposed coding agent to
  the ticket. In Linear, that means assigning the agent account to the issue when
  the integration is available. The tracker integration chooses the configured
  environment, the agent executes the ticket, and the agent submits the PR.

Issue-assigned agents can be Cursor, Codex, or any other agent the tracker can
assign. The skills do not infer this from local CLI availability.

Repo config should record only project-specific details that are annoying to
rediscover, such as supported worker delegation paths, routing labels, routing
fields, worker readiness labels, or non-default continuation comment rules. The
tracker remains the source of truth for which agents are currently assignable.

If Agent Orchestrator needs to send fixes, review feedback, failed-check
details, or PR process instructions back to that agent, it should reply on the
original issue thread or configured tracker thread. That keeps the same session
in context. Starting a new assignment is only for cases where the original
session cannot continue.

## Flow

```mermaid
flowchart TD
  Setup["workflow-setup\nCreate repo config"]
  Config["Repo config\ncommands, tracker, agents, environments"]
  Tracker["Issue tracker\nsource of truth for issue state"]
  IssueTriage["workflow-issue-triage\nmetadata and readiness"]
  Orchestrator["workflow-agent-orchestrator\nstate mutation authority"]
  Worker["Implementation worker\nlocal or issue-assigned"]
  CodeReview["workflow-code-review\nreview gate"]
  CreatePR["workflow-create-pr\nchecks, commit, PR, handoff"]
  AgentReview["workflow-agent-review\nindependent review and drift"]

  Setup --> Config
  Config --> Orchestrator
  Config --> IssueTriage
  Config --> Worker
  Config --> CodeReview
  Config --> CreatePR
  Config --> AgentReview

  IssueTriage -->|labels and readiness| Tracker
  Orchestrator -->|select, claim, move states| Tracker
  Orchestrator -->|delegate| Worker
  Worker --> CodeReview
  CodeReview -->|review artifact| CreatePR
  CreatePR -->|PR and handoff| Orchestrator
  Orchestrator -->|request review| AgentReview
  AgentReview -->|clean-context review| CodeReview
  AgentReview -->|verdict| Orchestrator
  AgentReview -->|bug or drift issues| Tracker
```

```mermaid
sequenceDiagram
  participant Q as Agent Orchestrator
  participant I as Issue Triage
  participant T as Issue Tracker
  participant W as Implementation Worker
  participant G as Code Host and PR
  participant R as Agent Review

  I->>T: Clean labels, readiness, dependencies, and orphans
  Q->>T: Refresh ready and active issues
  Q->>G: Refresh PR, branch, check, and preview state
  Q->>T: Claim issue and move to In Progress
  Q->>W: Delegate issue through supported worker path
  W->>T: Post plan and branch
  W->>W: Implement and verify
  W->>W: Run code review and iterate
  W->>G: Open or update PR
  W->>Q: Handoff PR ready for review state
  Q->>T: Move to In Review
  Q->>R: Request independent review
  R->>R: Run code review in clean context
  R->>Q: Changes requested or ready verdict
  Q->>T: Changes Requested or Ready to Merge
```

## Status Ownership

The issue tracker stores the current issue state. Agent Orchestrator is the
default writer for workflow status transitions. Other roles can recommend state
changes, but they should not move active work unless the repo config or user
explicitly delegates that authority.

Default rule:

- Issue Triage can edit labels, readiness, body shape, dependencies, and
  metadata.
- Agent Implement can post plan, branch, PR, check results, and handoff.
- Create PR can attach the PR and report the review-state handoff.
- Agent Review can post findings and verdicts.
- Agent Orchestrator moves `Todo`, `In Progress`, `In Review`,
  `Changes Requested`, and `Ready to Merge`.

## Handoff

Use the shared handoff shape from
`skills/workflow-setup/references/handoff.md`.

Every handoff should say:

- issue, branch, PR, owner, agent path, and environment
- current state and next owner
- checks run
- whether code review covers the current diff
- tracker updates made or requested
- blockers and residual risk

## Environment Model

Downstream config should define these clearly:

- Local: self-contained unless the repo says otherwise.
- Development: may use cloud backing services while the app runs locally.
- Preview: PR-scoped unless the repo says otherwise.
- Production: explicit approval required.

Hosted checks are not automatically safe. Config must say which hosted checks are
allowed without approval and which need approval.

## Adapter Notes

These skills keep a portable `SKILL.md` core for Codex, Claude, and other Agent
Skills systems.

- Side-effecting workflows use manual invocation.
- `workflow-code-review` and `workflow-agent-review` use clean context where the
  agent tooling supports it.
- Tool-specific permissions belong outside the shared skill contract.
- Code host and issue tracker tools come from each repo's workflow config.
- Worker delegation paths are repo-specific. Issue-assigned agents, when
  available, are discovered from the tracker. Repo config records only supported
  paths and project-specific routing or continuation comment details.

## References

Setup uses these bundled references when writing repo config:

- `skills/workflow-setup/references/project-config.md`
- `skills/workflow-setup/references/agent-workflow.md`
- `skills/workflow-setup/references/issue-tracker-contract.md`
- `skills/workflow-setup/references/handoff.md`

## Skill Quality Bar

- One job per skill.
- One top-level heading per skill.
- Explicit `Inputs` and `Done` or `Output` sections.
- Keep provider-specific details in downstream repo config.
- Add scripts only when deterministic behavior or external tooling justifies
  them.
