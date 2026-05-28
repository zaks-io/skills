# Workflow Skills

Shared skills for running agent work the same way across repos.

The basic idea is simple: every repo gets a small workflow config at
`docs/agents/workflow/config.md`. The skills read that file before they touch
issues, branches, PRs, checks, previews, or deploys.

That gives agents the things they usually guess badly:

- which package manager and checks to run
- where tracked work lives
- which labels and statuses mean work is ready
- who can move tickets
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

For private cloud environments, grant the runtime access to this repository
through the provider's GitHub integration, or inject a read-only deploy key or
fine-grained token before running `skills add`.

## Quick Start

Set up a repo:

```text
$workflow-setup
```

That creates or refreshes:

```text
docs/agents/workflow/config.md
```

Then run the normal loop:

```text
$workflow-issue-triage
$workflow-agent-queue
```

Use direct skills when you want one specific action:

```text
$workflow-agent-implement <issue>
$workflow-code-review <branch|pr|range>
$workflow-create-pr
$workflow-agent-review <pr|range>
```

## The Operating Model

The issue tracker is the source of truth for issue state. In most repos that is
Linear. Labels are signals. Status is state.

Agent Queue is the only default role that moves workflow state. It reads the
issue tracker, checks PR and CI state, starts workers, asks for review, and moves
tickets when the external state says that is safe.

Agent Review is a background safety loop. It reviews PRs from clean context,
checks main for drift, and reports bugs or review verdicts. It should not fix
code or move active work.

Agent Implement handles one issue at a time. It implements, verifies, runs code
review, fixes findings, and hands off to PR creation.

Create PR is the shipping gate. If the current diff already has a fresh
`workflow-code-review` result, it can use it. Otherwise it runs review before
committing and opening or updating the PR.

## The Skills

- `workflow-setup`: create or refresh repo workflow config.
- `workflow-issue-triage`: clean tracker labels, readiness, orphans, body shape,
  and dependencies.
- `workflow-agent-queue`: keep tracked work moving without becoming the coder or
  reviewer.
- `workflow-agent-implement`: take one ready issue through implementation,
  checks, review, and PR creation.
- `workflow-code-review`: bug-focused review for branches, PRs, working trees,
  and main drift.
- `workflow-create-pr`: run checks, confirm review, commit, push, create or
  update the PR, and hand off tracker state to Queue.
- `workflow-agent-review`: independent PR review and main-drift review from
  clean context.

## Recommended Flow

1. Run `workflow-setup` once per repo.
2. Run `workflow-issue-triage` before the first queue run and after big intake
   changes.
3. Run `workflow-agent-queue` to keep active work moving.
4. Let Queue delegate implementation and review.
5. Use `workflow-create-pr` directly only when you are already on a branch and
   want to ship it.

For the deeper agent contract, state model, handoff shape, and diagrams, see
[docs/agent-workflow.md](docs/agent-workflow.md).

## Done Means

A repo is ready when:

- `docs/agents/workflow/config.md` exists and has no critical unknowns
- issue tracker state, PR state, checks, previews, and deploy state all have
  named systems of record
- Queue mutation authority is explicit
- local, development, preview, and production rules are explicit
- verification commands are recorded
- `workflow-agent-queue`, `workflow-agent-implement`, `workflow-code-review`,
  and `workflow-create-pr` can run without guessing repo conventions

## Validate This Repo

```sh
pnpm ci:check
```
