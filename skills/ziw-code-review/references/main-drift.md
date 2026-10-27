# Main drift and review-debt intake

Use only for independent checkpoint review or explicitly authorized review-debt
intake. Ordinary PR review recommends follow-ups without creating issues.
For intake without main drift, skip checkpoint handling.

## Checkpoint review

Keep the checkpoint outside the repo:

```text
${CODEX_HOME:-$HOME/.codex}/automation-state/ziw-review/<repo-slug>/last-reviewed-origin-main
```

- First run records current `origin/main` and stops unless backfill was requested.
- Otherwise review checkpoint-to-current as merged product state.
- A non-ancestor checkpoint is a history problem; report it without replacing the range or advancing over unreviewed work.
- Collect spec sections cited by tickets linked to merged PRs in the range. Verify merged behavior using the core conformance table.
- Separate escaped conformance drift from new bugs; report audited sections/outcomes.
- Advance only after review and authorized issue updates complete. On failure, report incomplete intake and keep the checkpoint.

## Tracker intake

- Group findings sharing one fix. Search duplicates by problem, files, PR, and range before creating/updating issues.
- Use the configured provider location and review-debt routing. Exception: use the normal repo route if no debt route exists; report the setup gap.
- Unknown provider/location blocks intake.
- Use configured routing/risk labels and `Bug` or `Tech Debt` unless another type fits.
- Use `kind-slice` only for one concrete PR with criteria/checks; otherwise `kind-spec` or `kind-epic` for To Issues.
- Add `ready-for-agent` only when config permits ready debt and the [body contract](../../ziw-setup/references/issue-tracker-contract.md#agent-ready-issue-body) is complete.
- Otherwise leave issues in configured intake for triage. Use `needs-info`/`ready-for-human` only for a named missing decision.
- Keep issue text metadata-only; include reviewed range and file evidence.
- Escalate product, security, customer, credential, provider, or ADR judgments instead of ticketing them.
- Suppress low-confidence, duplicate, and style-only issues.

Return issues created/recommended, checkpoint outcome, audited sections, and next
owner/action to Orchestrator.
