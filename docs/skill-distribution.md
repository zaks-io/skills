# Skill Distribution

Last researched: 2026-06-14

This repo is the upstream source for shared `ziw-*` workflow skills. Downstream
repos may still need committed project skill files because remote, cloud, and
issue-assigned workers often start from a fresh clone and cannot rely on a
human's global install.

## Source Findings

- Agent Skills are portable folders with `SKILL.md`, optional scripts,
  references, and assets. The format is designed for reusable, version-controlled
  procedural knowledge. Source:
  [Agent Skills overview](https://agentskills.io/home) and
  [specification](https://agentskills.io/specification).
- Codex reads repo skills from `.agents/skills` up the working tree, user skills
  from `$HOME/.agents/skills`, admin skills from `/etc/codex/skills`, and
  supports symlinked skill folders. Codex recommends plugins for reusable
  distribution beyond one repo. Source:
  [Codex Agent Skills](https://developers.openai.com/codex/skills).
- Claude Code treats standalone `.claude/` skills as personal or
  project-specific configuration. It recommends plugins when the same
  skills or agents are shared across projects, need namespacing, or need easier
  updates. Source:
  [Claude Code skills](https://code.claude.com/docs/en/skills) and
  [Claude Code plugins](https://code.claude.com/docs/en/plugins).
- The `npx skills` CLI installs to project scope by default, documents project
  skills as committed with the project and shared with the team, supports global
  installs for one user, recommends symlink installs when possible, and provides
  `npx skills update -p -y` for non-interactive project refreshes. Source:
  [vercel-labs/skills](https://github.com/vercel-labs/skills).

## Policy

Use project-scoped skills when the repo must be self-contained for teammates,
CI-like workers, issue-assigned agents, or cloud agents. Commit:

- `skills-lock.json`
- the canonical project skill directory, usually `.agents/skills`
- cross-agent symlinks, such as `.claude/skills/ziw-*` pointing at
  `.agents/skills/ziw-*`, when the target agent uses a different path

Use plugins or marketplaces when the client supports them and the goal is shared
cross-project distribution with versioned updates. This is the right direction
for Claude Code teams that can install a marketplace or plugin through project,
managed, or user settings. It is not a replacement for project-scoped skills
when the worker that needs the skill will only clone the target repo.

Use global installs only for local personal convenience. They are not sufficient
for repo-owned workflow behavior, remote workers, or teammates.

## Update Flow

From this source repo, discover downstream repos with `skills-lock.json` entries
that reference `zaks-io/skills`:

```sh
pnpm skills:downstream
```

Open update PRs for downstream repos:

```sh
pnpm skills:downstream:update
```

The coordinator reports which repos changed, failed, or already had matching
PRs. The update command creates temporary `git worktree` checkouts, commits the
generated skill refresh on deterministic daily branches, pushes those branches,
and opens or reuses GitHub PRs. PR bodies include `@coderabbitai ignore` so
CodeRabbit does not spend review quota on the mechanical refresh.

The worktree branches from `main` by default, with `origin/main` as a fallback,
so the source checkout can be dirty without becoming the update base or being
modified. Changed apply-only worktrees are kept for inspection; committed,
pushed, PR-created, and unchanged worktrees are removed unless
`--keep-worktree` is passed. Use `--base-ref <ref>` to choose another base and
`--worktree-root <path>` to choose the scratch location. Use `--in-place` only
when direct checkout mutation is intentional; dirty in-place checkouts are
skipped unless `--allow-dirty` is passed.

Use the lower-level script entrypoint for local-only branches or commits:

```sh
node scripts/update-downstream-skills.mjs --apply --commit
node scripts/update-downstream-skills.mjs --apply --check --trust-check-commands --commit
node scripts/update-downstream-skills.mjs --apply --repo ~/src/agent-paste --commit
```

For downstream repos with `skills-lock.json`:

```sh
npx skills update -p -y
```

For first install or repos without a lockfile:

```sh
npx skills add zaks-io/skills --all -y
```

Then inspect `git status --short`, keep only the generated skill dependency diff
and any intentionally updated repo-local workflow config, run the target repo's
configured checks, and open one mechanical PR.

Do not hand-edit generated downstream `ziw-*` skill bodies. Fix the skill in
this repo, rerun the project updater in each target repo, and commit the
generated result.

## Done

A downstream skill refresh is done when the lockfile and project skill paths
match the intended upstream source, the repo-configured checks have run, and the
PR clearly says which source and command produced the update.
