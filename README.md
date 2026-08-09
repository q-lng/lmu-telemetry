# lmu-telemetry

A webapp for reading/visualizing **Le Mans Ultimate** telemetry (DuckDB format),
MoTeC i2 style: open a session, see every available channel, synchronized
graphs, track map, lap comparison — plus a user-account layer (friends/follows,
session sharing, notifications) and an admin panel for site-wide configuration.

> The project is evolving into an **LMU community hub** (community-wide session
> tracking, a Discord bot, dedicated hosting) — see
> [CONTEXT.md](CONTEXT.md) for the detailed goal (in French) and the
> [GitHub Project board](https://github.com/users/q-lng/projects/2) for
> day-to-day progress.

## Stack

- **TypeScript end to end.** No Python in this project.
- **Backend**: Node.js + Fastify + PostgreSQL (accounts/social/preferences) +
  the `duckdb` package (reads telemetry files directly, no ORM).
- **Frontend**: Vite + React + TypeScript, graphs with **uPlot**.
- **Everything runs in Docker / docker-compose**, dev included.

## Getting started

```bash
cp .env.example .env   # fill in the secrets (see below)
docker compose up --build
```

- Frontend: http://localhost:5173
- Backend: http://localhost:3891
- Uploaded session files (`.duckdb`) are stored in `data/` (gitignored).

### Environment variables (`.env`)

| Variable | Description |
| --- | --- |
| `POSTGRES_PASSWORD` | Password for the Postgres database (accounts/social/preferences). |
| `COOKIE_SECRET` | Session cookie signing secret. |
| `COOKIE_SECURE` | `true` in prod behind HTTPS, `false` locally. |
| `PUBLIC_BASE_URL` | Public URL of the app — used to build clickable links in emails (password reset). |
| `MAIL_HOST`, `MAIL_PORT`, `MAIL_SECURE`, `MAIL_USER`, `MAIL_PASSWORD`, `MAIL_FROM` | SMTP. Leave empty to disable email sending (logged, never fatal). |

## Structure

```
data/           .duckdb files (gitignored, mounted into the backend container)
backend/        Fastify + TS API
frontend/       Vite + React + TS app
docs/SCHEMA.md  DuckDB schema reference for telemetry files
CONTEXT.md      project decisions, goal, progress (French)
TASKS.md        archived task log (French, frozen as of 2026-08-03 — see the
                GitHub Project board above for current tracking)
```

## Features

- Telemetry reading/visualization: synchronized uPlot graphs, track map, lap
  comparison (same session or an external file), delta-time channel.
- User accounts: friends/follows, session and lap sharing (public/friends/
  private), public or private profiles, notifications (friend requests, new
  followers).
- Telemetry view display presets, saved server-side (follow the account, not
  the browser).
- Admin panel (`/admin`): user management (plan, admin role, activate/
  deactivate, password reset) and site-wide display configuration (site
  font, data-display font, text size, default accent color and offered
  palette, neon glow effect).
- MoTeC export: **not implemented** (see [CONTEXT.md](CONTEXT.md) — deliberately
  shelved, the format isn't documented reliably enough publicly).

## Data schema

See [docs/SCHEMA.md](docs/SCHEMA.md) before touching the backend — the DuckDB
format is unusual (one table per channel, not a flat table), with a time-
reconstruction rule that has to be respected for continuous channels.

## Conventions

- DuckDB channel/table names contain spaces and special characters → always
  quote SQL identifiers and whitelist them before any interpolation.
- User preferences are always stored server-side, never in `localStorage`.
- Icons: inline SVG only, never emoji (see
  `frontend/src/components/icons.tsx`).
- GitHub-facing content (issues, PRs, this README) is in English; the
  project's own reference docs (`CLAUDE.md`, `CONTEXT.md`, `TASKS.md`) are in
  French.
