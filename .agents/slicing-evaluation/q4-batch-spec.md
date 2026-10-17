# Q4 customer requests

Status: Ready for slicing

These four requests are unrelated. Each may ship on its own whenever it is
ready; none depends on another.

## Issue CSV export {#csv-export}

- Issues list gets "Export CSV" for the current filter, streaming up to 50,000
  rows with columns id, title, status, assignee, created_at.
- Uses the existing background job runner for exports over 5,000 rows and emails
  a signed download link that expires after 24 hours.

## Webhook delivery retries {#webhook-retries}

- Failed webhook deliveries retry with exponential backoff (1m, 5m, 30m, 2h,
  12h), then mark the endpoint `failing` and show a banner on its settings page.
- Delivery log shows each attempt with status code and latency.

## Calendar view {#calendar-view}

- New Calendar view of issues by due date, month and week layouts, drag to
  change due date, keyboard navigation between days.

## SAML single sign-on {#saml-sso}

- Workspace owners configure a SAML 2.0 IdP (metadata URL or XML upload),
  enforce SSO for members, and keep one break-glass owner login.
- Just-in-time member provisioning on first SSO login.

## Acceptance signals {#acceptance}

- Each section's behavior works end to end with tests and user docs.
