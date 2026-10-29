---
name: ziw-code-review
description: Review code for bugs, scope drift, and unmet acceptance criteria. Use for explicit reviews, author QA before a PR, or independent review of a PR before merge.
when_to_use: Use for explicit code review requests or deliberate workflow review handoffs. Do not auto-trigger solely because a commit or PR changed.
argument-hint: "[branch|pr-url|range] [--submit]"
context: fork
agent: general-purpose
---

# Code review

Review a diff and report what's wrong with it. Change nothing. Rules follow the
[workflow contract](../ziw-setup/references/workflow.md).

## Inputs

A working tree, branch, PR, or commit range; its base; and the ticket or
request that states what it should do. Orchestrate also passes the diff
fingerprint and, for a follow-up review, the head to review changes since and
the earlier findings.

## Modes

- **Author QA**: the author asks before opening a PR. It can block the PR, but
  it never counts as review evidence.
- **Independent**: requested by Orchestrate or a user, in a fresh session with
  none of the implementation conversation. This is the review a merge needs. If
  your session isn't fresh, say so and stop.

## Steps

1. Fetch, then record the head SHA, base, and merge base. Review against the
   merge base. For a follow-up, compare `git diff <base>...<deltaFrom>` with
   `git diff <base>...<head>`, and confirm each earlier finding is fixed.
2. Read the ticket's acceptance criteria and the docs it cites.
3. Read the diff and the code around it. Look for bugs, missing criteria, and
   work outside the ticket's scope. For anything beyond a small, low-risk
   change, use the [review checklist](references/review-checklist.md).
4. Prove each finding from the source with a concrete failure path. Skip style
   nits.
5. Run cheap, focused checks when they settle a question.
6. Fill in the criteria table and report.

With `--submit` and a GitHub PR, post the report as a PR review on the
reviewed head.

## Output

```markdown
## REVIEW REPORT

Mode: AUTHOR QA | INDEPENDENT
Reviewed head: <sha> Base: <sha> Fingerprint: <value or none>
Checks run: <commands and results, or none>

| Criterion | Evidence            | Verdict                    |
| --------- | ------------------- | -------------------------- |
| <text>    | <test or file:line> | PASS / FAIL / UNVERIFIABLE |

Findings:

- [P1] <path:line>: <bug and impact>
  Evidence: <how it fails>
  Fix: <smallest fix>

Verdict: APPROVE | NEEDS REVISION
```

A `FAIL` or `UNVERIFIABLE` row, an unfixed earlier finding, or any P0 or P1
finding means `NEEDS REVISION`. Independent reviews always include the
criteria table. For a tiny change in author QA, a three-line report is enough:
verdict, head, and findings or "No findings."

## Rules

- Never push.
- Don't delegate any part of the review.
