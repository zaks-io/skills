# Flag change audit log

Status: Ready for slicing

## Outcome {#outcome}

Organization owners can answer "who changed this flag, when, and what changed"
from the API, the CLI, the MCP server, and the Control Panel.

## Recording {#recording}

- Every Flag write path records one audit event in the same database
  transaction as the write: create, update, delete, promote, and approval-apply.
  These five writers live in `apps/api/src/flags/`.
- An event stores org_id, flag_key, actor (user id or API key id), action,
  before/after JSON diff of changed fields, request_id, and created_at.
- New `audit_events` table with an index on (org_id, created_at desc) and
  (org_id, flag_key, created_at desc).
- A failed audit insert fails the write. No write succeeds without its event.

## Read API {#read-api}

- `GET /api/orgs/:org/audit-events?flag=&actor=&since=&until=&cursor=`
  returns newest first, 50 per page, with an opaque cursor.
- Only organization owners may read. Everyone else gets 404, not 403.

## CLI {#cli}

- `acme audit list [--flag <key>] [--actor <id>] [--since <date>] [--json]`
  prints a table (time, actor, action, flag) or JSON, following pagination with
  `--all`.

## MCP {#mcp}

- New `list_audit_events` tool with the same filters as the read API, returning
  at most 200 events and a cursor.

## Control Panel {#control-panel}

- Settings gains an "Audit log" page for owners: filter bar (flag, actor, date
  range), a table, and a detail drawer showing the before/after diff.
- Loading, empty ("No changes match these filters"), and error states use the
  existing page-state components. Non-owners do not see the nav item.

## Retention {#retention}

- The existing nightly cron worker deletes audit events older than 400 days in
  batches of 10,000.

## Docs {#docs}

- API reference entry, CLI reference entry, and a "Flag audit log" user guide
  page.

## Acceptance signals {#acceptance}

- Each of the five writers produces exactly one event with the correct diff;
  a forced audit insert failure rolls back the write.
- Owner reads filter and paginate correctly; non-owners get 404.
- CLI, MCP, and Control Panel show the same events for the same filters.
- Retention deletes only events older than 400 days.

## Non-goals {#non-goals}

- Audit for non-Flag resources, export to SIEM, alerting.
