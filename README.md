# Workflow Skills

Give your coding agents a repeatable workflow for turning ideas and issues into
tested, independently reviewed pull requests, with less manual coordination.

These skills are reusable instructions for Claude Code, Codex, and other agents
that support Agent Skills. They teach agents how to clarify a plan, split it into
scoped tickets, implement the work, and move it through review and merge under
your repo's rules.

Use them to:

- Diagnose a failure and verify an authorized narrow fix.
- Assess architecture or compare module interfaces before choosing a change.
- Turn a rough idea into an approved spec and dependency-ordered tickets.
- Hand an agent one issue to implement, test, and open as a pull request.
- Review a branch or PR in a fresh agent context.
- Coordinate several agents across a set of issues, track checks and review
  feedback, and advance work until it is done or blocked on human input.

You can run one skill for a specific task or use the full delivery workflow.
Each repo gets a small config at `docs/agents/workflow/config.md` that records
its issue tracker, verification commands, worker setup, and approval rules. It
holds stable values only; progress stays in the tracker, and CI and PR status
are read live.

## Install

Prerequisites:

- Node 24 and `pnpm@10.19.0`
- `gitleaks` for `pnpm security:secrets` and `pnpm ci:check`
- `gh` for downstream fanout PR creation with `--pr`

Install into the current project, selecting skills and agents when prompted:

```sh
npx skills add zaks-io/skills
```

This is the default mode for repos whose remote or cloud workers must get the
workflow skills from a fresh clone. Commit the generated project skill
directories and `skills-lock.json` as a mechanical dependency update.

Refresh project-installed skills:

```sh
npx skills update -p -y
```

From this source repo, discover downstream consumers and open mechanical
refresh PRs for them. [docs/skill-distribution.md](docs/skill-distribution.md)
covers the updater's flags and behavior.

```sh
pnpm skills:downstream
pnpm skills:downstream:update
```

Install globally for one local user:

```sh
npx skills add zaks-io/skills -g
```

List available skills:

```sh
npx skills add zaks-io/skills --list
```

Install the complete workflow skill set:

```sh
npx skills add zaks-io/skills --skill '*'
```

## Distribution

Install `ziw-*` skills together. They all link to the workflow contract in
`ziw-setup`, so a partial install leaves those links unresolved. The managed downstream updater and Claude plugin ship
the complete set. Running one workflow still loads only its relevant instructions.

Use the narrowest distribution mode that still reaches the agents that work the
repo:

- Project skills: commit `.agents/skills`, `.claude/skills`, `.codex/skills`, or
  the target agent's project skill path when repo or cloud workers need the
  skills from a fresh clone. Treat these as vendored generated dependencies from
  `zaks-io/skills`; update them through `npx skills update -p -y` and commit the
  lockfile and generated diff.
- Plugins or marketplaces: prefer these for clients that support versioned
  cross-project distribution, especially Claude Code plugin users. This repo
  already includes `.claude-plugin/plugin.json` for that path.
- Global/user installs: use for personal local convenience only. They do not
  configure remote workers or teammates who clone a downstream repo.

Do not hand-edit downstream generated `ziw-*` skill copies. Change the source in
this repo, run the configured updater in each target repo, and keep the update PR
mechanical.

## Claude Code Plugin

This repo also ships a Claude Code plugin manifest, `.claude-plugin/plugin.json`,
and three sub-agents that keep context-heavy work out of the orchestrator's
thread:

```text
zaks-io-skills:ziw-triager
zaks-io-skills:ziw-implementer
zaks-io-skills:ziw-reviewer
```

Validate the plugin shape when Claude Code is available:

```sh
claude plugin validate .
```

## Quick Start

Set up a repo once, and rerun setup when its workflow changes:

```text
$ziw-setup
```

Then run the normal flow:

```text
$ziw-grill <idea|plan|spec>
$ziw-to-issues <spec>
$ziw-triage
$ziw-orchestrate [tickets|project|until clear]
```

Grill marks a spec `Ready for slicing` only after you approve it. To Issues
slices it into one ticket per feature, splitting only for size, rollout order,
authority, or readiness. Triage makes tickets ready. Orchestrate runs the loop
until the scope is done or waiting on you.

Run one step directly when that's all you need:

```text
$ziw-implement <issue>
$ziw-code-review <branch|pr|range> [--submit]
$ziw-pr
$ziw-debug <symptom>
$ziw-architecture <area|module>
```

## How It Works

The roles, ticket lifecycle, states, labels, and shared rules are in one file:
[workflow.md](skills/ziw-setup/references/workflow.md). Orchestrate follows the
planner scripts in `skills/ziw-orchestrate/scripts`, which decide what to start,
review, and merge.

- [docs/agent-workflow.md](docs/agent-workflow.md): how the skills fit together
  and the design rules for changing them.
- [docs/skill-portfolio.md](docs/skill-portfolio.md): the published skills and
  why each exists.
- [docs/agent-delivery-research.md](docs/agent-delivery-research.md): the
  research behind the workflow.

## Validate This Repo

```sh
pnpm ci:check
```
