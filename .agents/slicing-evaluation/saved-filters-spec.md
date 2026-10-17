# Saved filters on the Issues list

Status: Ready for slicing

## Outcome {#outcome}

People who triage issues every day stop rebuilding the same filter. They save
the current Issues-list filter under a name, reopen it from the sidebar, and
share it with a teammate.

## Data {#data}

- New `saved_filters` table: id, owner_user_id, workspace_id, name (1-80 chars,
  unique per owner), filter_json (the existing serialized filter state used by
  the `?f=` URL param), created_at, updated_at.
- Saved filters are private to their owner. Sharing shares a link, not the row.

## API {#api}

- `POST /api/saved-filters` create, `GET /api/saved-filters` list the caller's
  filters, `PATCH /api/saved-filters/:id` rename, `DELETE /api/saved-filters/:id`.
- Only the owner can read, rename, or delete. Other callers get 404.
- Duplicate name returns 409 with the existing filter id.

## Issues list {#issues-list}

- A "Save filter" button appears in the filter bar when any filter is active.
  It opens a dialog with a name field, prefilled from the active filters.
- Saving adds the filter to the sidebar and selects it.

## Sidebar {#sidebar}

- A "Saved filters" section lists the caller's filters alphabetically.
- Each entry has a menu with Rename, Copy link, and Delete. Delete asks for
  confirmation.
- Empty state: "Save a filter from the Issues list to see it here."

## Sharing {#sharing}

- Copy link copies the Issues-list URL with the saved `?f=` state. Recipients
  see the same filtered list; they do not get the saved filter itself.

## Docs {#docs}

- Add a "Saved filters" section to `docs/user/issues.md`.

## Acceptance signals {#acceptance}

- Owner can create, list, rename, delete; non-owner gets 404.
- Duplicate name returns 409.
- Sidebar shows saved filters and the empty state.
- Copied link reproduces the filtered list for another signed-in user.
- e2e: save a filter, reload, open it from the sidebar.

## Non-goals {#non-goals}

- Team-shared saved filters, saved sort orders, notifications.
