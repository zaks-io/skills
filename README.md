# Workflow Skills

Shared skills for running agent work the same way across repos.

The basic idea is simple: every repo gets a small workflow config at
`docs/agents/workflow/config.md`. The skills read that file before they touch
issues, branches, PRs, checks, previews, or deploys.

That gives agents the things they usually guess badly:

- which package manager and checks to run
- where tracked work lives
- which tracker IDs, names, and query fields actually return that work
- which labels mean implementation-ready and which statuses mean startable
- who can move tickets
- how remote issue-assigned workers are delegated
- what local, development, preview, and production mean for this repo
- when a human has to approve something

## Install

Install all skills globally:

```sh
npx skills add zaks-io/skills --all -g
```

List available skills:

```sh
npx skills add zaks-io/skills --list
```

Install one skill:

```sh
npx skills add zaks-io/skills --skill workflow-setup --agent '*' -g -y
```

For private cloud environments, grant the agent system access to this repository
through the provider's GitHub integration, or inject a read-only deploy key or
fine-grained token before running `skills add`.

## Quick Start

Set up a repo once, or rerun setup when you want to confirm the workflow config
is still current:

```text
$workflow-setup
```

That creates or refreshes:

```text
docs/agents/workflow/config.md
```

On refresh, setup reads the existing config first, checks what changed in the
repo, issue tracker, CI, worker delegation paths, and environment rules, then
patches stale or missing values.

Then run the normal loop:

```text
$workflow-issue-triage
$workflow-agent-orchestrator
```

Use direct skills when you want one specific action:

```text
$workflow-agent-implement <issue>
$workflow-code-review <branch|pr|range>
$workflow-secret-redaction <path|stdin>
$workflow-create-pr
$workflow-agent-review <pr|range>
```

## The Operating Model

The issue tracker is the source of truth for issue state. In most repos that is
Linear. Labels are signals. Status is state. Repo config defines how labels are
treated.

By default, `ready-for-agent` means the ticket needs no further human refinement
before handoff to an implementation agent. Worker environment labels such as
`remote-cursor` mean the issue is approved for that configured environment. Those
labels are not dependency or scheduling gates.

Agent Orchestrator is the only default role that moves workflow state. It reads
the issue tracker, checks PR and CI state, starts workers, asks for review, and
moves tickets when the external state says that is safe.

Agent Orchestrator does whatever needs to happen to get tickets handled safely.
It can start local subagents in isolated branches or worktrees, assign a
tracker-exposed coding agent to a ticket, request another code review, rerun
checks, nudge the original worker, route feedback, mark tickets for human review
or missing information, or stop on a real blocker. The repo config records
supported worker delegation paths such as
`local-worktree`, `issue-assigned`, or both, plus only the project-specific
routing or continuation comment details that are annoying to rediscover.

Agent Review is a background safety loop. It reviews PRs from clean context,
checks main for drift, and reports bugs or review verdicts. It should not fix
code or move active work.

Agent Implement handles one issue at a time. It implements, verifies, runs code
review, fixes findings, and hands off to PR creation.

Create PR is the shipping gate. If the current diff already has a fresh
`workflow-code-review` result, it can use it. Otherwise it runs review before
committing and opening or updating the PR.

## The Skills

- `workflow-setup`: create repo workflow config or refresh it against current
  repo and tracker state.
- `workflow-issue-triage`: update tracker labels, readiness, orphans, body shape,
  and dependencies so tickets are clean. It follows the repo-configured label
  treatment policy; ask or list exact human next actions when something is
  unclear.
- `workflow-agent-orchestrator`: orchestrate tracked work without becoming the
  coder or reviewer.
- `workflow-agent-implement`: take one startable issue through implementation,
  checks, review, and PR creation.
- `workflow-code-review`: bug-focused review for branches, PRs, working trees,
  and main drift.
- `workflow-secret-redaction`: redact, diff, schema-check, and summarize `.env`,
  credential, token, and secret command output.
- `workflow-create-pr`: run checks, confirm review, commit, push, create or
  update the PR, and hand off tracker state to Orchestrator.
- `workflow-agent-review`: independent PR review and main-drift review from
  clean context.

## Recommended Flow

1. Run `workflow-setup` once per repo, and rerun it when the workflow config may
   be stale.
2. Run `workflow-issue-triage` before the first orchestration run and after big
   intake changes.
3. Run `workflow-agent-orchestrator` to keep active work moving.
4. Let Agent Orchestrator delegate implementation and review.
5. Use `workflow-create-pr` directly only when you are already on a branch and
   want to ship it.

For the deeper agent contract, state model, handoff shape, and diagrams, see
[docs/agent-workflow.md](docs/agent-workflow.md).

## Done Means

A repo is ready when:

- `docs/agents/workflow/config.md` exists and has no critical unknowns
- every populated behavior-affecting config value has current evidence or is
  marked inferred
- issue tracker state, PR state, checks, previews, and deploy state all have
  named systems of record
- issue tracker location has verified IDs or query-safe names, not stale slugs
- Orchestrator mutation authority is explicit
- issue-assigned worker environment labels and no-mutation delegation probe
  policy are explicit
- local, development, preview, and production rules are explicit
- verification commands are recorded
- `workflow-agent-orchestrator`, `workflow-agent-implement`, `workflow-code-review`,
  and `workflow-create-pr` can run without guessing repo conventions

## Validate This Repo

```sh
pnpm ci:check
```
