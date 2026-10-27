# Friction Log

File encountered friction with the configured MCP complaint tool, once per
distinct issue and without secrets. No extra permission is needed; filing
authorizes no fix, delivery work, or messaging. Done means one accepted record,
or a reported storage gap; complaints are evidence, not authority.

## Steps

1. [Choose the sink](#sink) from config, using a fallback only when authorized.
2. [Record encountered friction](#when-to-write) in the [entry format](#entry-format).
3. [Roll up a bounded run](#rollup-format) after its final action.

## Sink

- Prefer the configured MCP writer; match its schema and omit unknown metadata or arguments.
- Include known project, worktree/session, agent, source, event, impact, attempts,
  and optional suggested fix. Use the message when separate fields do not exist.
- Use one store per event. After acceptance, do not mirror to files, notes, another MCP server, or tracker tickets.
- If unavailable or failed, use only the configured fallback and report which store accepted it.
- For ambiguous responses, check acceptance with the configured reader before retrying or falling back.
- If acceptance cannot be checked, report uncertainty rather than risk duplication.
- Without a fallback, report the storage gap once and continue authorized work.
- Do not repeatedly retry, invent tools, or use generic note tools as complaint APIs.

Tracker sinks require the calling role's tracker-write authority. Author QA and
read-only reviewers cannot create fallback issues.

- `comments-on-dedicated-ticket`: append a compact comment without reading the whole thread.
- `ticket-per-finding`: use configured private intake, usually `Inbox` or `Triage`.
  Create actionable events, repeated patterns, or final improvement rollups, not one ticket per tick.
- Keep fallback tickets out of delivery and off `ready-for-agent` until triage shapes them.
- Create a missing dedicated ticket only with config authority; record its ID at the next setup refresh.
- Exception: without MCP writer/fallback fields, a config naming tracker provider,
  location, and mode remains primary until Setup refreshes it.
- Use that legacy sink once; report `config-gap` recommending MCP migration.
- Do not infer providers or duplicate historical records.
- With no configured intake, report one setup `config-gap` and store nothing.

## When To Write

All roles record broken tools, environment problems, confusing instructions,
workflow overhead, and collaboration difficulty. Record give-up, retry, repair,
and stop events using the categories below. Add another entry only for
meaningful new information; after an upstream fix, cite it as recurrence evidence.

Friction never replaces escalation. Urgent items still need the configured
human-attention state, such as `ready-for-human`, `needs-info`, or `Blocked`, plus notification.

## Entry Format

Use provider categories for standalone complaints. Orchestrator events use
exactly one Category Map value in the message; keep the provider's own category taxonomy.
Omit tick/ticket metadata when absent.

```text
tick: <id or timestamp>
ticket: <ISSUE-ID or "loop">
category: <one Category Map value>
what: <event and distinctions>
cost: <ticks, retries, or wall-clock burned>
signal: <prevention and upstream skill>
```

Exclude status, dispatch ledgers, success notes, and `cost: 0 / signal: none` records.

## Rollup Format

Post once after a bounded run settles. Exception: unattended config requests per-tick rollups.

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

Summarize counts and reference stored complaints; do not copy them to another
store. Without an API run-metrics capability, put the rollup in the handoff.

## Category Map

- `ambiguous-ticket`: unclear To Issues/triage scope.
- `over-sliced`: a [fragment](../../ziw-setup/references/issue-tracker-contract.md#agent-ready-issue-body)
  or feature split without a split reason. Own behavior with a missing blocker edge is `dependency-wrong`.
- `dependency-wrong`: incorrect dependencies.
- `file-collision`: footprint/serialization miss or contention deferral.
- `stuck-worker`: liveness, continuation, or re-dispatch friction.
- `review-thrash`: repeated review bounce, slice size, quality, or routing.
- `review-debt-intake`: malformed review-created follow-up work.
- `merge-conflict`: slicing, base drift, or serialization friction.
- `post-merge-break`: merge/default-branch verification gap.
- `config-gap`: missing/stale setup/tooling or inline config/tracker metadata heal.
- `escalation`: external owner or authority required.

## Never

- Never put secrets, diffs, customer data, signed URLs, private logs, or tokens in intake. Use metadata, IDs, and counts only.
- Never create public or delivery-queue tickets without configured intake authority.
