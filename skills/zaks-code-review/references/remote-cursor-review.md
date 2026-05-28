# Remote Cursor Review

Use this when the user asks for a remote Cursor Background Agent to review a branch or PR.

## Start Options

- Cursor UI: open the Background Agent sidebar or press `Ctrl+E`, choose the repo and branch, then paste the prompt below.
- Cursor API: if `CURSOR_API_KEY` is already available, `POST https://api.cursor.com/v0/agents` with `target.autoCreatePr: false`, the target repo/ref, and the prompt below. Do not print or commit the API key.

For remote review, assume hosted secrets are opt-in per issue. Default to local
checks only unless the prompt explicitly authorizes preview or production
credentials.

Minimal API shape:

```bash
curl --request POST \
  --url https://api.cursor.com/v0/agents \
  --header "Authorization: Bearer $CURSOR_API_KEY" \
  --header "Content-Type: application/json" \
  --data '{
    "prompt": { "text": "<paste the prompt template below>" },
    "source": {
      "repository": "<github repo url>",
      "ref": "<branch or PR head ref>"
    },
    "target": {
      "autoCreatePr": false,
      "branchName": "review/<short-branch-name>"
    }
  }'
```

## Prompt Template

```text
Code review only. Do not edit files, commit, push, or open a PR.

Repo/branch: <repo and branch or PR URL>
Base: <base branch>

Read first:
- AGENTS.md or CLAUDE.md
- docs/agents/remote-cursor-agent.md if present
- CONTEXT.md if present
- docs/specs/README.md and docs/adr/README.md if present
- Any repo-local .claude/skills relevant to touched files

Review the diff against the base branch for correctness, security, data loss, race conditions, API/schema contract drift, missing enum/status handling, missing tests, and scope drift. Run focused checks if cheap. Do not call CodeRabbit.

Use this review rubric:
- Verify every finding with file:line evidence.
- Prioritize P0/P1 correctness, security, auth, data-loss, migration, concurrency, and API-contract issues.
- Treat config/numeric limit changes as high-risk until justified by production bounds, rollback, and monitoring.
- Suppress style nits, low-confidence speculation, broad refactors, and optional micro-optimizations.

Return only:
- Scope check: clean, drift, or missing requirements
- Findings table with severity, confidence, file:line, evidence, impact, and suggested fix
- Checks run
- CodeRabbit recommendation: skip, CLI, or PR review
- Verdict: ready, needs revision, or do not merge
```
