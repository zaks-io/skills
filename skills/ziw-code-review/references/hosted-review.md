# Hosted review

Use for existing PRs or explicit hosted-review requests. Return recommendations
and report fields; the caller owns authorized triggers and description edits.

## Current evidence

- Read workflow config, provider config at the reviewed head, and the PR body, review bodies, and every inline comment, including human reviews.
- Unresolved blocking inline findings invalidate a clean summary.
- Report auto-review mode. For CodeRabbit, inspect root `.coderabbit.yaml` and `reviews.auto_review`; use verified policy for other providers.
- Include draft/incremental behavior only when it changes the recommendation.

## Recommendation

- Default to `SKIP`. Use the [review lifecycle](../../ziw-orchestrate/references/integrate-checklist.md#review-lifecycle) for local/hosted order and readiness.
- Recommend `PR REVIEW` when configured risk tiers require it, explicitly requested, or concrete unresolved uncertainty warrants another reviewer. Name that uncertainty.
- Risks include auth, secrets, payments, destructive data, migrations, background jobs, public contracts, and cross-cutting refactors.
- Recommend `WAIT` without a command for pending current review.
- Let eligible automatic push review run; evaluate completed current findings instead of requesting duplicates.
- Unknown auto-review mode, actor, or permissions means report the gap without a command.
- Recommend `CLI` only for explicit local CodeRabbit requests before a PR exists; never as hosted fallback or an inferred Bugbot CLI.
- Auth, credits, or rate limits may policy-skip optional review. Required/explicit provider failures remain unresolved.
- For permitted manual CodeRabbit review, recommend `@coderabbitai review` incrementally or `@coderabbitai full review` for a full pass.
- Optional automatic CodeRabbit review may use `@coderabbitai ignore` in the PR description only when policy permits.
- For other providers, recommend verified configured commands only.
- Evaluate findings against source. Prioritize P0/P1, security, data loss, correctness regressions, production blockers, and user-requested findings.

## Report fields

```text
Hosted bot review provider: <none | CodeRabbit | Cursor Bugbot | other | unknown>
Hosted bot review recommendation: SKIP | WAIT | CLI | PR REVIEW, because <reason>
Hosted bot review state: auto-review <enabled | disabled | opt-in | provider-specific | unknown>; hosted review <none | pending | complete | unknown>
Hosted bot review command: <none | verified command>
```

Report unknown, pending, and policy-skipped states explicitly; none proves clean completion.
An unconfigured provider has unknown automatic settings, not disabled settings.
