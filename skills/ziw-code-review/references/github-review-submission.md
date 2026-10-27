# GitHub review submission

Use only for an explicit GitHub PR `--submit`. Publish the completed local
verdict and actionable findings as one current-head GitHub review.

## Identity

Read `AGENTS.md` and workflow config. Repo identity rules win.

- In `zaks-io` repos, use `gh-useotto`, attributed to `useotto-dev[bot]`.
- Elsewhere, use the configured client/identity. Stop before submission if write identity is unknown.
- Plain `gh` is only for repo-policy human-account actions, such as external-bot triggers. Local review submission is not such a trigger.
- Compare API `user.login` with the configured account login, not display names, Git authors, or body claims.
- Never print credentials, private keys, tokens, or authenticated headers.

## Freshness

1. Resolve repo owner/name, PR number/URL, base SHA, and GitHub `headRefOid`.
2. Require the locally reviewed head to equal `headRefOid` exactly.
3. Complete the local mode, evidence recommendation, verdict, conformance, and P0-P2 findings before checking duplicates.
4. Inspect existing reviews and inline comments through the API. Reuse only when all match:
   - `commit_id` equals the full reviewed head SHA.
   - `user.login` equals the configured account.
   - State is `COMMENTED` and `submitted_at` is present.
   - Body contains `<!-- ziw-local-review head=<full-sha> -->` exactly.
   - Mode, evidence recommendation, verdict, and conformance agree with the completed report.
   - Body and inline comments cover every actionable P0-P2 finding.
5. Recheck the PR head before returning an existing URL or posting. If changed, refresh and rerun review.

If no equivalent review passes every check, post the completed current report.

## Review shape

Submit through `POST /repos/{owner}/{repo}/pulls/{pull_number}/reviews` using the
[GitHub review API](https://docs.github.com/en/rest/pulls/reviews).

- `commit_id`: exact reviewed SHA.
- `event`: always `COMMENT`.
- `body`: compact report, verdict, checks, and hidden freshness marker.
- `comments`: one inline comment per attachable actionable P0-P2 finding; empty for zero findings.

Put `APPROVE`, `NEEDS REVISION`, or `DO NOT MERGE` in the body. Never use
GitHub `APPROVE`/`REQUEST_CHANGES` events.

Each inline finding needs severity, confidence, impact, evidence, and smallest
fix direction. Anchor `path`, `line`, and `side` to the current diff. Use
`start_line`/`start_side` only when a range is necessary. Keep unattachable
`file:line` findings in the body.

Suppress P3/style comments. Never repeat an inline finding as a second top-level
comment. Serialize JSON with `jq` or equivalent; send via the chosen CLI's
`api --input`. Never interpolate review text into shell source.

## Verification

After posting, verify the response's PR, `commit_id`, `user.login`, `COMMENTED`
state, exact marker, verdict, and body/inline P0-P2 findings against the completed report.
Return its `html_url` as `GitHub submission: POSTED <review URL>`.

For a rejected inline location, move that finding into the body and retry once.
For any other failure, return `FAILED` with a safe error summary and preserve
the local report. Never fall back to scattered issue or top-level PR comments.

## Done

One verified current-head review preserves the verdict/marker and every
attachable P0-P2 finding appears once inline. Return its URL.
