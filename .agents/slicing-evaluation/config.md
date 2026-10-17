# Agent Config

## Repo

- Name: `acme/tracker-web`
- Default branch: `main`
- Package manager: pnpm
- Full local gate: `pnpm verify`
- Focused checks: `pnpm --filter web test`, `pnpm --filter api test`, `pnpm typecheck`, `pnpm e2e --grep <name>`

## Planning Artifacts

- Spec paths: `docs/specs/*.md`
- Spec status convention: `Draft`, `Ready for slicing`

## Issue Tracker

- Provider: Linear, team `ACM`
- Ready state: `Todo`; intake states: `Triage`
- Kind labels: `kind-spec`, `kind-epic`, `kind-slice`
- Readiness labels: `ready-for-agent`, `ready-for-human`, `needs-info`
- Type labels: `Feature`, `Bug`, `Improvement`, `Tech Debt`
- Risk labels: `risk-normal`, `risk-security-sensitive`, `risk-schema`, `risk-cross-cutting`
- Area labels: `frontend`, `backend`
- Routing label: `acme/tracker-web`
- Estimate: Linear estimate field, scale 0/1/2/4/8/16 points, required before `ready-for-agent`; To Issues may set estimates. 16 is the largest one-PR slice.
- Dependency fields: native Linear `blockedBy`/`blocks`; if A needs B first, A is blocked by B
- Footprint: `## Likely files, packages, or artifacts`, one backticked path per bullet
- Body contract: outcome; context docs; likely files, packages, or artifacts; in scope; out of scope; acceptance criteria; required checks; security, privacy, data, and operational invariants; dependencies or blockers

## Deploy

- Every merge to `main` deploys to production automatically after `pnpm verify`.
- Database migrations run before the new app version starts. Postgres validates existing rows when a NOT NULL constraint is added.
