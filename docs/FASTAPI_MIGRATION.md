# FastAPI migration

FastAPI/Uvicorn is the default HTTP application (`python -m backend.run`, port 3000). It serves the React build and preserves the existing `/api/auth/*`, workspace and room routes. Express remains available only through `npm run start:legacy` for controlled rollback; it does not run beside FastAPI in the production container.

## Compatibility boundary

This is the API migration stage, not a complete rewrite of all business logic in Python. A private Node child process (`server/fastapi-worker.ts`) reuses the tested SQLite store, password verification, single-use email tokens, ledger normalization and Spending Guard calculations. It communicates over stdin/stdout and opens no port. FastAPI owns HTTP routing, request limits, trusted-origin checks, CORS, secure cookies, security headers, frontend delivery and the worker lifecycle. Passwords and cookies are never sent to another network service.

Keeping the data routines avoids changing account hashes, SQLite IDs, balance mathematics or email-token formats during the HTTP migration. The TypeScript spending calculator also keeps the React preview and authoritative server calculation on the same rules. Future Python ports can replace one domain module at a time against the existing tests. Node 22 remains a runtime dependency until that work is done.

## Spending Guard API

- `GET /api/spending-guard`: own personal preferences and server-derived alerts.
- `PUT /api/spending-guard`: `{ "preferences": { "rules": { "budget-id": { "limit": 300, "reserve": 50 } }, "acknowledged": [] }, "version": 0 }`.
- `?roomId=<id>` selects a shared workspace. Access is checked on every request; each member's alert preferences remain personal.
- Responses include `preferences`, settings `version`, `ledgerVersion` and `states`. States are calculated from the saved ledger, never from an untrusted request's transactions.
- First save uses version zero. Stale settings writes return 409. Reload server settings and review before saving again.
- Amounts accept finite values from zero to $10 billion; zero disables that rule. Existing threshold, minimum-balance and pace behavior is unchanged.

React server profiles load and save these preferences through the API. They refresh after ledger changes, once a minute while open, or with **Reload server settings**. A rejected or failed save shows an error. Browser-only profiles continue to work locally. Existing browser limits are imported only with the explicit **Import this browser's saved limits into my account** action; an import replaces account limits for this workspace. No browser profile or ledger is automatically uploaded.

## Data and rollout

The API opens the existing `DATA_DIR/cash-diet.sqlite`. Users, sessions, password hashes, ledgers and room membership are preserved. It adds `spending_preferences` with user and ledger foreign keys and revision checks; existing tables and schema version are unchanged. Old Express builds ignore this additive table. Full database backups include preferences; frontend ledger JSON backups do not.

Before deployment, take a database backup with `npm run backup -- /private/path/pre-fastapi.sqlite`, retain the previous image, and ensure only one HTTP application writes the database at a time. The application uses one Uvicorn worker and one internal data worker; it is intended for one service replica on a persistent volume. Do not scale replicas against independent SQLite volumes. A timed-out core request is not replayed automatically; the next call can restart a failed core and the client should reload before retrying an uncertain write.

## Run locally

Use Python 3.11+ and Node 22.16+:

```sh
python3 -m venv .venv
. .venv/bin/activate
pip install -r backend/requirements-dev.txt
npm ci
npm run dev
```

`npm run dev` builds the React app and private core, then starts FastAPI. Rebuild after frontend/core edits; this command does not run a frontend HMR server. Python-only development can use `python -m uvicorn backend.main:app --reload --port 3000` after a build. `npm run dev:legacy` starts the prior Express/Vite developer flow for comparison only.

Development mail goes to private files in `DATA_DIR/mail`. Production must use real Resend configuration. Do not expose the development outbox or use it as a production fallback.

## Checks

```sh
npm test
npm run lint
npm run build
python -m pytest backend/tests -q
npm run smoke:auth
npm run build:pages
```

The Python integration suite exercises FastAPI routing, existing-database compatibility, restart persistence, origin checks, request-size limits, room permissions, authoritative spending calculations and conflicting preference writes. The existing HTTP authentication smoke now starts FastAPI and checks verification, recovery, session revocation and preserved ledger state.

## Hosting

The Dockerfile starts FastAPI as the existing non-root `node` user and retains the private persistent volume and readiness endpoint. Python runtime dependencies are pinned separately from test dependencies. Railway can keep its existing Dockerfile build and `/api/ready` health check.

Production requires `NODE_ENV=production`, HTTPS `APP_URL`, `PUBLIC_APP_URL`, persistent `DATA_DIR`, `MAIL_PROVIDER=resend`, `RESEND_API_KEY` and a verified-domain `MAIL_FROM`. Optional cross-origin frontends additionally require exact `CORS_ORIGINS`, appropriate secure cookie settings and a frontend build with `VITE_API_BASE_URL`. Prefer serving React from the API origin because browsers may block cross-site cookies. Set `TRUST_PROXY=1` only with an explicit trusted-proxy configuration; `TRUSTED_PROXY_IPS` defaults to loopback.

Publishing source or a GitHub Pages build does not deploy the Python backend or activate account sync on the browser-only Pages site. Backend rollout must be verified separately. This migration adds no email/push overspending notifications or scheduled background checks; transactional account email behavior is preserved.
