# Friction Log

Use this reference only when writing friction intake entries or run rollups.
Friction is retrospective signal for improving skills, setup, or slicing. It is
not authoritative state.

## Sink

Use the configured friction intake.

- `comments-on-dedicated-ticket`: append one compact comment per entry on the
  configured friction-log ticket. Do not read the whole thread.
- `ticket-per-finding`: create compact tracker tickets in the configured private
  intake location, usually `Inbox` or `Triage`. These tickets must not carry
  `ready-for-agent` or enter the normal delivery queue until triage converts
  them into concrete work.

If config names no friction intake, do not create public or delivery-queue
tickets. If a private location exists but the dedicated ticket is missing, create
it once only when using `comments-on-dedicated-ticket` and record its ID during
the next setup refresh. Otherwise report a setup `config-gap`.

## When To Write

Write entries at give-up, retry, repair, and stop points:

- escalation
- re-dispatch
- contention deferral
- repeated review bounce
- inline config or tracker metadata heal
- stuck worker
- merge conflict
- post-merge break
- review-created ticket missing required issue shape

At the end of a bounded run, post one compact rollup with counts by category. Do
not post rollups every tick unless the unattended run config asks for it.

For `ticket-per-finding`, avoid one ticket per tick. Create tickets for
actionable events, repeated patterns, or final run rollups that point to an
upstream skill/config improvement.

## Entry Format

Each entry is one compact metadata-only comment:

```text
tick: <id or timestamp>
ticket: <ISSUE-ID or "loop">
category: ambiguous-ticket | dependency-wrong | file-collision | stuck-worker | review-thrash | review-debt-intake | merge-conflict | post-merge-break | config-gap | escalation
what: <one line>
cost: <ticks, retries, or wall-clock burned>
signal: <what would have prevented it, and which upstream skill it points at>
```

Use exactly one canonical category. Do not invent new categories. Put
distinctions in `what` or `signal`.

Do not post status notes, dispatch ledgers, success notes, or `cost: 0 /
signal: none` entries. The log records friction only.

## Rollup Format

```text
run: <id or timestamp>
scope: <ticket IDs, query, project, or filter>
started: <count>
merged: <count>
waiting: <count>
blocked: <count>
first-pass-checks: <passed/total or "unknown">
review-rework: <tickets returned for fixes>
friction: <category=count, category=count>
throughput: <whole-run tickets/hour; optional visible-window tickets/hour>
agent-cost: <tokens, credits, or "unknown">
```

Post the run rollup after the final action, not while work is still settling.

## Category Map

- `ambiguous-ticket`: To Issues or triage needs clearer scope.
- `dependency-wrong`: To Issues or triage dependency modeling was wrong.
- `file-collision`: To Issues footprint prediction or serialization needs work.
- `stuck-worker`: worker liveness or continuation tuning.
- `review-thrash`: slice size, implementation quality, or review routing.
- `review-debt-intake`: Agent Review, To Issues, triage, or setup produced
  malformed follow-up work.
- `merge-conflict`: slicing, base drift, or serialization issue.
- `post-merge-break`: merge or default-branch verification gap.
- `config-gap`: setup/config/tooling facts are missing or stale.
- `escalation`: external owner or authority required.

When an upstream fix for a repeated entry has landed, later occurrences
reference that fix as recurrence evidence instead of re-filing discovery.

The friction intake never replaces escalation. Items needing the user now still
get `ready-for-human`, `needs-info`, `Blocked`, or the configured human-attention
state plus notification.

Never paste secrets, diffs, customer data, signed URLs, private logs, or tokens
into friction intake. Use metadata, IDs, and counts only.
