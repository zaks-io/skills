# Contacts always have an email

Status: Ready for slicing

## Outcome {#outcome}

Every contact has an email address so reminders can be sent. Today about 3% of
the 4.2 million existing contact rows have a null `email`.

## Existing rows {#existing-rows}

- Contacts with a null email whose linked account has a verified email take that
  address.
- The rest get `email = 'missing+<contact_id>@invalid.acme.test'` and
  `email_status = 'placeholder'` so the UI can prompt for a real address.
- The backfill runs in resumable batches of 5,000 and logs progress.

## Constraint {#constraint}

- After every existing row has an email, `contacts.email` becomes NOT NULL.
- `POST /api/contacts` and `PATCH /api/contacts/:id` reject a missing or empty
  email with 422.

## Contact form {#contact-form}

- The email field is required and shows "Email is required" when empty.
- Contacts with `email_status = 'placeholder'` show a banner asking for a real
  address.

## Docs {#docs}

- Update `docs/api/contacts.md` to mark email required.

## Acceptance signals {#acceptance}

- Backfill leaves zero null emails and can resume after interruption.
- The NOT NULL constraint applies in production without failing the deploy.
- API returns 422 for missing email; the form blocks submit and shows the
  message; placeholder contacts show the banner.
