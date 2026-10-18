# Cash Diet

A personal finance prototype for tracking budgets, recording income and expenses, importing CSV statements, and exploring cashflow scenarios.

## Current implementation

- React 19, TypeScript, Vite, Tailwind CSS, and Express.
- Budgets, transaction history, savings targets, and a recurring bills checklist.
- CSV import with column mapping and a local Naive Bayes category classifier.
- What-if calculator, experimental cashflow forecasts, and statistical spending alerts.
- Browser storage for personal data; optional shared rooms through Express and Server-Sent Events.
- GitHub Pages deployment for the static personal-budget interface.

**Prototype limitations:** login profiles and passwords currently live in browser storage, and shared rooms do not enforce server-side authentication. Forecasts can use synthetic history when records are sparse. Do not treat the current login as secure account protection or the forecast as a validated prediction. See the [code review and prioritized roadmap](docs/CASH_DIET_REVIEW.md) for findings and reproduction results.

This repository does not currently include the separate FastAPI services, PostgreSQL, or Plaid bank connection code.

## Local development

```bash
git clone https://github.com/nnmdi/Budjet.git cash-diet
cd cash-diet
npm ci
npm run dev
```

The development server listens on port 3000.

```bash
npm run lint
npm run build
NODE_ENV=production npm start
```

`npm run lint` currently runs TypeScript checking; it does not run ESLint or functional tests.

## GitHub Pages

Run `npm run build:pages` to build the static frontend. The **Publish Cash Diet to GitHub Pages** workflow builds and deploys pushes to `main`. Enable **Settings → Pages → Source → GitHub Actions**.

The current repository URL is `https://github.com/nnmdi/Budjet`, and its Pages path is `https://nnmdi.github.io/Budjet/`. Cash Diet is the application name; the repository slug and Pages base path remain `Budjet` so existing links keep working. Existing browser-storage keys also remain compatible with saved data.

Personal budgets save in the current browser and origin. Data from another domain does not transfer automatically. The CSV export/import flow transfers transaction rows, not a complete account backup.

Shared rooms require a running Express API. `VITE_API_BASE_URL` configures an external API origin for a Pages build, but the current server still needs an explicit CORS implementation for cross-origin use. The standalone Pages build calculates anomaly alerts locally. Never put secret keys in `VITE_*` variables.

`robots.txt` and `noindex` request search-engine exclusion; they do not restrict access.
