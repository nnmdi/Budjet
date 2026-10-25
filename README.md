# Cash Diet

A personal finance app for budgets, transactions, recurring bills, CSV statements, and what-if cashflow scenarios. Built with React 19, TypeScript, Vite, Tailwind CSS, Express, and SQLite.

The ledger derives balances from opening balances and posted transactions using cent-based arithmetic. Future entries stay scheduled until due. Imports, deletion across budgets, and full undo/redo use the same ledger rules on the client and server.

## Two ways to use it

- **GitHub Pages:** browser-only local profiles with full JSON backup/restore. Profiles have no passwords or access protection and stay in that browser.
- **Hosted backend:** email-verified server accounts with password recovery, salted password hashes, HttpOnly sessions, durable SQLite records, and authenticated private rooms. Requires HTTPS and a persistent data volume in production.

The repository remains `nnmdi/Budjet` and the Pages path remains `/Budjet/`; Cash Diet is the application name. Existing personal data migrates using the same profile email and origin. Old local passwords do not become server credentials.

## Development

Requires Node 22.16 or later.

```bash
git clone https://github.com/nnmdi/Budjet.git cash-diet
cd cash-diet
npm ci
npm run dev
```

Open `http://localhost:3000`. Development data lives in the git-ignored `data/` directory.

```bash
npm test
npm run lint
npm run build
NODE_ENV=production APP_URL=https://your-real-origin DATA_DIR=/private/persistent/cash-diet npm start
```

Production requires an HTTPS origin and persistent DATA_DIR. See [ledger, migration, security, deployment, and backup details](docs/LEDGER_AND_SECURITY.md) before deploying. Email verification and password recovery are implemented. The Docker image, Railway configuration, and automated production checks are ready; actual hosting, verified email delivery, and operational checks must pass before real banking. Follow the [production runbook](docs/PRODUCTION.md).

## GitHub Pages

`npm run build:pages` builds the static site. The **Publish Cash Diet to GitHub Pages** workflow tests, type-checks, builds, and deploys pushes to main. Enable **Settings → Pages → Source → GitHub Actions**.

Site: `https://nnmdi.github.io/Budjet/`. Leave VITE_API_BASE_URL empty for local profiles, or configure a real HTTPS account API and its credentialed CORS/cookie settings as described in the deployment guide. No secrets belong in VITE variables.

Forecasts are experimental, not validated predictions. JSON export is a complete ledger backup; CSV is a transaction interchange format. There is no Plaid or separate FastAPI implementation in this repository. The [original review](docs/CASH_DIET_REVIEW.md) documents the baseline issues; the update guide describes what has changed and what remains.

## FastAPI backend

FastAPI is now the default HTTP backend. It preserves the existing SQLite accounts and ledger through a private compatibility worker and adds account-backed Spending Guard preferences. See [migration and setup](docs/FASTAPI_MIGRATION.md) for Python/Node requirements, local startup, API contracts, rollout checks and the remaining TypeScript compatibility boundary. GitHub Pages remains browser-only until an API is deployed and configured.
