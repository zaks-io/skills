---
name: zaks-code-review
description: Bug-focused pre-PR code review for local diffs, PRs, and remote Cursor review handoffs. Use when asked to review code, check a diff, run a pre-commit or pre-PR review, decide whether CodeRabbit is warranted, or prepare a remote Cursor Background Agent review prompt.
---

# Code Review

Run an independent, bug-focused review before commit or PR. The goal is to catch correctness, security, data-loss, and regression risks locally so CodeRabbit is reserved for genuinely hard changes.

## Operating Mode

- Prefer running this as a separate reviewer or subagent so the implementation context does not bias the review.
- If invoked as a subagent, remote Cursor agent, or with `review-only`, do not edit, commit, push, or resolve threads. Return findings only.
- If invoked in the main agent and the user explicitly asks to fix, auto-fix only mechanical, low-risk issues. Ask before architectural, product, security, or data-behavior changes.
- Focus on high-signal defects. Suppress style nits, preference comments, broad refactors, and speculative advice.

## Workflow

1. Establish the base and scope.

   ```bash
   git status --short
   git branch --show-current
   git remote get-url origin 2>/dev/null || true
   git rev-parse --verify origin/main >/dev/null 2>&1 && echo main || echo master
   ```

2. Recover intent before judging implementation. Read the user request, issue or PR body when available, recent commits, and repo instructions. Compare delivered files against intent and flag missing requirements or unrelated drift separately from code findings.

3. Read the diff with shape first, then detail.

   ```bash
   BASE=main
   git rev-parse --verify origin/main >/dev/null 2>&1 || BASE=master
   git diff "origin/$BASE"...HEAD --stat
   git diff "origin/$BASE"...HEAD -- ':(exclude)*.lock' ':(exclude)package-lock.json' ':(exclude)yarn.lock' ':(exclude)bun.lock'
   git diff --stat
   git diff -- ':(exclude)*.lock' ':(exclude)package-lock.json' ':(exclude)yarn.lock' ':(exclude)bun.lock'
   ```

4. Load [references/review-checklist.md](references/review-checklist.md), then run each category against the diff. For large diffs, review by ownership area and grep for sibling enum/status/type values instead of relying only on changed files.

5. Verify before reporting. Every finding needs file:line evidence, a clear failure mode, severity, confidence, and a concrete fix direction. If the evidence cannot be quoted from source, lower confidence and keep it out of the main findings unless the impact is severe.

6. Run or recommend focused verification. Use existing project checks first. Add small targeted tests only when they materially prove or prevent the bug being reported.

7. Decide whether CodeRabbit is worth spending. Default to no after a clean local review. Escalate only when the change is high risk or genuinely complex: auth, authorization, secrets, payments, destructive data changes, schema migrations, concurrency, background jobs, generated artifacts, public API contracts, broad refactors, unfamiliar framework behavior, or unresolved local-review uncertainty.

8. If CodeRabbit is used, fix only high-priority actionable findings: P0/P1, security, data-loss, correctness regressions, or blockers. Do not chase nits, taste, formatting, optional micro-optimizations, or broad rewrites unless the user explicitly asks.

## CodeRabbit Options

Use exactly one path when escalation is warranted:

- Local CLI before PR: run `cr review --agent --type uncommitted` when available, or `coderabbit review --plain`. Treat missing auth or missing CLI as a skip unless the user asked for CodeRabbit specifically.
- PR review after create: comment `@coderabbitai review` for incremental review or `@coderabbitai full review` only for a broad, risky PR that needs a complete pass.

Do not add CodeRabbit opt-in keywords to PR descriptions by default. Do not use CodeRabbit autofix unless the user explicitly requests it.

## Remote Cursor Review

Use a remote Cursor Background Agent when the user wants an independent remote-environment review, local setup differs from CI, or a clean checkout is useful. Load [references/remote-cursor-review.md](references/remote-cursor-review.md) for the launch options and prompt template. Cursor remote agents may not have personal `~/.claude` or `~/.agents` skills, so the prompt must carry the review brief and point to repo-local instructions.

## Report Format

```markdown
## REVIEW REPORT

Scope check: CLEAN | DRIFT DETECTED | REQUIREMENTS MISSING
Diff: <N files, +X/-Y>
Checks run: <commands or "not run">
CodeRabbit recommendation: SKIP | CLI | PR REVIEW, because <reason>

Findings:

- [P1] (confidence: 9/10) path/file.ts:42 - <bug and impact>
  Evidence: <short quoted line or source fact>
  Fix: <specific direction>

High-priority remaining: <none or list>
Verdict: READY TO LAND | NEEDS REVISION | DO NOT MERGE
```
