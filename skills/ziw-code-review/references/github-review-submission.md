# GitHub Review Submission

Use this reference only for an explicit GitHub PR review with `--submit`.
Review locally first, then publish the same verdict and actionable findings as
one GitHub pull-request review.

## Identity

Read `AGENTS.md` and repo workflow config before choosing the GitHub client.
Repo-specific identity rules win.

- For `zaks-io` repositories, use `gh-useotto` so the review is attributed to
  `useotto-dev[bot]`.
- Elsewhere, use the configured GitHub CLI command and identity. If write
  identity is unknown, stop before submission and report the blocker.
- Plain `gh` is reserved for actions that repo policy assigns to the human
  account, such as triggering an external review bot. Local review submission
  is not an external-bot trigger.

Never print tokens, credentials, private keys, or authenticated headers.

## Freshness

1. Resolve repository owner/name, PR number and URL, base SHA, and current
   `headRefOid` from GitHub.
2. Confirm the locally reviewed head exactly equals the current `headRefOid`.
3. Immediately before posting, resolve `headRefOid` again. If it changed, do
   not post stale results. Refresh the checkout and rerun the review.
4. Inspect existing reviews for this head before posting. A body containing
   `<!-- ziw-local-review head=<full-sha> -->` is current local-review evidence.
   Return its URL instead of creating a duplicate review.

Do not treat a review on an older commit as current evidence.

## Review Shape

Submit one review through:

```text
POST /repos/{owner}/{repo}/pulls/{pull_number}/reviews
```

Use a JSON payload with:

- `commit_id`: the exact reviewed head SHA
- `event`: `COMMENT`
- `body`: the compact review report, verdict, checks, and hidden freshness
  marker
- `comments`: one inline comment per actionable finding that can be attached to
  the PR diff

Always use `COMMENT`. Put `APPROVE`, `NEEDS REVISION`, or `DO NOT MERGE` in the
review body as the workflow verdict. Do not use GitHub `APPROVE` or
`REQUEST_CHANGES`; the local bot may be reviewing its own implementation PR and
those events can alter protected-branch state or fail on actor rules.

Each inline comment should contain severity, confidence, concrete impact,
evidence, and the smallest fix direction. Use GitHub's `path`, `line`, and
`side` fields against the current diff. Use `start_line` and `start_side` only
for a finding that genuinely needs a range. If a finding is valid but cannot be
anchored to a changed line, keep its `file:line` evidence in the review body.

Submit P0-P2 findings only. Suppress P3/style comments and do not post the same
finding both inline and as a second top-level comment. A zero-finding review is
a body-only review with an empty `comments` list.

Build the JSON structurally with `jq` or an equivalent serializer and send it
through the selected CLI's `api --input` support. Do not interpolate review text
into shell source.

## Verification

After submission:

1. Verify the API response belongs to the expected PR and commit.
2. Verify its state is `COMMENTED` and capture its `html_url`.
3. Return `GitHub submission: POSTED <review URL>` in the review report.

If the API rejects an inline location, correct the payload once by moving that
finding into the review body. Do not fall back to scattered issue comments or a
plain top-level PR comment. On any other failure, return `FAILED` with the safe
error summary and preserve the local report.

## Done

Submission is done when one current-head GitHub review exists, its body carries
the local verdict and freshness marker, every attachable P0-P2 finding appears
once as an inline thread, and the returned report includes the review URL.
