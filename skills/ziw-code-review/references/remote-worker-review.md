# Remote worker review

Use when the user requests remote-worker branch/PR review. These instructions
are for the caller; an active reviewer returns instead of launching a worker.

## Start options

- Use the remote provider in `docs/agents/workflow/config.md` for a review-only run on the PR branch/head.
- Supply a fresh session without implementation context per the [review lifecycle](../../ziw-orchestrate/references/integrate-checklist.md#review-lifecycle).
- Disable auto-PR creation when supported.
- Supply the installed review skill path; if inaccessible, provide the skill and applicable references.
- Hosted secrets are opt-in per issue. Default to local checks unless the prompt explicitly authorizes preview/production credentials.
- Never print, store, or commit provider API keys.

## Prompt template

```text
Review only. Do not edit, commit, push, open a PR, trigger hosted bots,
mutate tracker/code-host state, merge, or deploy. Do the work yourself under
the supplied skill's Review limits; do not delegate.

Repo/branch: <repo and branch or PR URL>
Immutable target SHA: <full head or checkpoint SHA>
Base SHA or merge base: <full SHA>
Intent: <request or issue outcome>
Linked issue and acceptance criteria: <URL/key and exact criteria, or missing>
Cited spec sections: <exact sections, or none>
Required checks: <commands and code-host checks>
Review round/limit and history: <round, limit, findings and attempted fixes>
Review-diff fingerprint: <orchestrator value, or missing>
Review skill: <installed ziw-code-review/SKILL.md path or supplied instructions>

Read the skill and applicable references, AGENTS.md or CLAUDE.md, workflow
config, docs/agents/remote-worker-agent.md or provider docs when present,
and touched-file repo skills.
Read docs/specs/README.md and docs/adr/README.md when present. Use the
configured glossary or the skill's glossary-discovery reference.

Resolve only the immutable target SHA. Verify checkout and diff against
that target/base; stop stale or missing-input on mismatch. Missing fingerprint
means missing evidence; never derive it from the SHA.

Review correctness, security, data loss, races, API/schema contracts,
enum/status handling, tests, and scope. Scope drift includes adjacent tickets,
optional polish, broad refactors, and new surfaces outside the issue.
Run cheap focused checks. Verify findings with file:line evidence.
Prioritize P0/P1 correctness, security/auth, data loss, migrations,
concurrency, and API contracts. Treat config/numeric limits as high-risk
until production bounds, rollback, and monitoring justify them.
Suppress nits, speculation, broad refactors, and optional micro-optimizations.

Return the skill's canonical ## REVIEW REPORT, including conformance and
applicable workflow/PR fields. Do not substitute a reduced report.
```
