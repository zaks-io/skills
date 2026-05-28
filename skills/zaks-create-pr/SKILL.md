---
name: zaks-create-pr
description: Create a pull request with quality checks, Conventional Commits, and a structured PR body (Summary, Changes, Risk, Test plan). Use when the user asks to open a PR, create a pull request, or ship the current branch.
argument-hint: "Optional context to fold into the PR title/body"
---

# Create a pull request

Stop and report if anything blocks progress. Do not invent fixes. Never bypass pre-commit hooks. Never push to `main` or force-push. Never commit secrets.

## 1. Gather context

Run in parallel:

- `git status`
- `git diff HEAD`
- `git branch --show-current`
- `git log --oneline -10`

## 2. Linear lookup

Find the ticket this work belongs to **before** naming the branch or opening the PR:

1. If the current branch already encodes a ticket ID (e.g. `codex/issue-123-foo` -> `ISSUE-123`), fetch it via the Linear MCP (`get_issue`).
2. Otherwise, search Linear (`list_issues` / search) using the branch name, commit subjects, and diff as keywords. If a likely match turns up, confirm with the user before treating it as the ticket. If nothing matches, proceed with no ticket.

When a ticket is found, capture its **original intent** - title, description, scope/out-of-scope, and acceptance criteria - and use it to inform the branch name, PR title, and summary. Hold onto this; step 10 compares it against what actually shipped.

If Linear is unavailable, skip - do not block. Note that it was skipped in the final report.

## 3. Pre-flight

- **Pick the branch automatically.** If already on a feature branch, use it. If on the default branch (`main`/`master`) or detached HEAD, create a new branch without asking - never push to the default branch. Name it `codex/<short-kebab-summary>`, and if a Linear ticket was found in step 2, include its ID, e.g. `codex/issue-123-access-link-viewer`.
- Check for an existing PR: `gh pr list --head <branch> --json number,url`. If one exists, print the URL and exit.
- **Include everything by default.** Assume all changes in the repo - staged and unstaged - go into the PR. Do not ask whether to include unstaged changes.
- **Scope check.** Scan the diff for clearly separate projects or unrelated concerns - independent packages/apps, or a feature mixed with an unrelated refactor. If the changes plausibly belong in more than one PR, stop and ask the user whether they want one combined PR or a split (and how to group it) before continuing. If it reads as one coherent change, proceed with a single PR.

## 4. Quality checks

- Run `pnpm ci:check`.
- On failure, auto-fix and re-run `ci:check`.
- **Never** use `--no-verify`.

## 5. Local code review and CodeRabbit decision

Run local review before committing. This is the default first filter now that CodeRabbit is no longer automatic and is rate-limited to 12 reviews/hr.

- Run `zaks-local-code-review` for project issue work, or
  `zaks-code-review` for a general repo diff. Prefer the read-only
  `zaks-code-reviewer` subagent when available so the reviewer has
  independent context.
- Fix all P0/P1 findings and obvious mechanical P2 findings before committing. Ask the user before broad, architectural, product, security, or data-behavior changes.
- If review fixes changed code, re-run `pnpm ci:check`.
- Record the local-review verdict for the PR report and Linear comment.

Decide whether CodeRabbit is worth spending. Default to **skip**. Trigger it only for genuinely complex or high-risk work:

- Auth, authorization, secrets, payments, destructive data changes, schema migrations, background jobs, generated artifacts, public API/CLI contracts, concurrency, or broad refactors.
- The local review found high-priority issues and the fix was non-trivial.
- The local reviewer still has concrete uncertainty after reading source and running focused checks.
- The user explicitly asks for CodeRabbit on this PR.

If CodeRabbit is warranted, choose exactly one path:

- **Local CLI before commit**: run `cr review --agent --type uncommitted` when available, or `coderabbit review --plain`. Treat missing auth/CLI as skipped unless the user explicitly requested CodeRabbit. Fix only high-priority actionable findings.
- **PR review after create**: mark `CodeRabbit: PR review planned` for step 9. Do not add opt-in keywords to the PR body; request the review explicitly by PR comment.

Do not spend CodeRabbit on docs-only, tests-only, copy/UI-only, formatting-only, simple dependency metadata, or small isolated bug fixes with good tests. Do not use CodeRabbit autofix unless the user explicitly asks.

## 6. Commit

- Stage everything (`git add -A`), then unstage any `.env*` or credential files - never commit secrets. If the user chose to split into multiple PRs in step 3, stage only the files for this PR instead.
- Conventional Commits:

  ```text
  <type>: <short description>

  [body, if needed]

  [Linear: ISSUE-123]
  ```

- If pre-commit hooks fail, fix the root cause and create a **new** commit (never amend).

## 7. PR description

**Title**: Linear ticket title if available, otherwise derived from commits. Under 70 chars.

**Body**:

```markdown
## Summary

[1-3 sentences - the why, not the what]

## Changes

- [key change]
- [key change]

## Risk: LOW | MEDIUM | HIGH

- Areas touched: [systems/modules]
- Security: [auth/secrets/data handling, or "none"]
- Performance: [DB/API/caching, or "none"]
- Breaking: [yes/no - list if yes]

## Test plan

- [ ] [verification step]
- [ ] [verification step]

[Linear: ISSUE-123](url)
```

Risk levels:

- **HIGH**: auth, schema migrations, external APIs, secrets
- **MEDIUM**: business logic, new features, non-trivial refactors
- **LOW**: UI tweaks, docs, tests only

## 8. Push and create

```bash
git push -u origin <branch>
gh pr create --title "<title>" --body "$(cat <<'EOF'
<body>
EOF
)"
```

Capture the PR number from the returned URL.

## 9. CodeRabbit PR review (only if selected)

Run this step only when step 5 chose the PR-review path or the user explicitly asks for CodeRabbit after the PR exists. Otherwise skip it; do not wait for automation.

- Request review with a PR comment: `@coderabbitai review`. Use `@coderabbitai full review` only for a broad, high-risk PR that needs a complete pass.
- Fetch comments with `gh pr view <number> --comments` and `gh api repos/{owner}/{repo}/pulls/<number>/comments`.
- Fix only high-priority actionable findings: P0/P1, security, data loss, correctness regressions, production blockers, or items the user specifically requests.
- Commit fixes as new commits, never amend published commits. Re-run `pnpm ci:check` after fixes.
- Skip nits, style preferences, optional micro-optimizations, and broad rewrites. Reply briefly on the thread if needed.
- Do not re-run CodeRabbit unless a high-priority issue remains or the fix materially changed the risky part of the PR.

Stop and ask the user before opening a wide-ranging change or if findings are ambiguous.

## 10. Link and update Linear

Only if a ticket was found in step 2. Skip cleanly if Linear is unavailable.

1. **Link the PR to the ticket.** Attach the PR URL to the issue via the Linear MCP (`create_attachment`, title = PR title). The PR body's `[Linear: <ID>]` line also lets the GitHub-Linear integration auto-link; the attachment guarantees the link regardless of integration setup.
2. **Fix the status.** Move the issue to **In Review** (or the repo's review-equivalent status). Never move it to `Done` - the PR is not merged. If the issue was still in `Todo`/`Backlog`, this also corrects it.
3. **Comment on the ticket** with `save_comment`. State the outcome and, explicitly, **how the implementation diverged from the ticket's original intent** captured in step 2:

   ```md
   PR: <url>

   Results:

   - Checks run: <ci:check, local review, CodeRabbit skipped/CLI/PR review - pass/fail>
   - Acceptance criteria: <met / partially met - which>

   Differences from the original plan:

   - <scope, approach, or file changes that deviate from the issue - or "none">
   - <follow-up issues created for deferred work>
   ```

   If the implementation matched the ticket exactly, say so rather than omitting the section.

## 11. Report

```text
PR:     <url>
Title:  <title>
Risk:   <LOW|MEDIUM|HIGH>
Review: local review <verdict>; CodeRabbit <skipped|CLI|PR review>
Linear: <ID @ status, or "none" / "skipped">
```

## Rules

- Never bypass pre-commit hooks.
- Never commit secrets.
- Never push to `main` or force-push.
- Prefer `pnpm dlx` over `npx`.
