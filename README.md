# Zaks.io Skills

Shared agent skills for Zaks.io repositories.

## Install

List available skills:

```sh
npx skills add zaks-io/skills --list
```

Install all skills globally for all supported agents:

```sh
npx skills add zaks-io/skills --all -g
```

Install one skill:

```sh
npx skills add zaks-io/skills --skill zaks-code-review --agent '*' -g -y
```

For private cloud environments, grant the runtime access to this repository
through the provider's GitHub integration, or inject a read-only deploy key or
fine-grained token before running `skills add`.

## Skills

- `zaks-code-review`: bug-focused local diff, PR, and remote Cursor review.
- `zaks-create-pr`: PR creation with checks, local review, and Linear updates.
- `zaks-goal-keep-agent-queue-moving`: queue coordination across Linear, worker agents, PRs, and CI.
- `zaks-goal-review-main-and-queue-fixes`: periodic main-branch review and issue filing.
- `zaks-implement-issue`: one Linear issue to one scoped branch and PR.
- `zaks-local-code-review`: pre-PR local review against issue and repo invariants.
- `zaks-neon-postgres`: Neon Serverless Postgres setup and operations guide.
- `zaks-next-pr`: next-work-to-PR coordinator workflow.
- `zaks-review-pr`: PR review against issue, docs, checks, and security invariants.

## Validate

```sh
npm run check
```

The check verifies skill frontmatter names, `agents/openai.yaml` prompts, and
the required `skills/<name>/SKILL.md` layout.
