# 📈 Cash Diet: Automated Financial Tracking & Treasury Forecasting Pipeline

[![Live Demo](https://img.shields.io/badge/Live%20Demo-Available-success)](https://ais-pre-t3zydiqi6qmoghgbmbm5vs-605585368137.us-west2.run.app) 
*Explore our live app on Google Cloud Run: [ais-pre-t3zydiqi6qmoghgbmbm5vs-605585368137.us-west2.run.app](https://ais-pre-t3zydiqi6qmoghgbmbm5vs-605585368137.us-west2.run.app)*

Cash Diet is a full-stack personal finance application powered by an automated data pipeline. Beyond standard expense tracking, it actively processes financial records and simulates historical volatility to generate a 90-day cashflow and Treasury-style trend forecast. 

This project bridges the gap between everyday financial management and quantitative risk analytics, utilizing a simplified, user-friendly language designed to be clear and accessible to everyone.

---

## 🏗️ Architecture & Data Pipeline (ETL)

This application is built on a resilient data engineering foundation, designed to handle extraction, transformation, and automated loading/syncing.

*   **Extract:** Retrieves public financial base parameters and syncs with existing live balances and ongoing recurring costs automatically.
*   **Transform:** Processes and cleans raw JSON payloads, standardizing dates, calculating category spending envelopes, and processing transactional data for clean analysis.
*   **Load & Automate:** Integrates with persistent storage queues to reliably store and sync record history, with automated triggers ensuring synchronization and reactive recalculation.

---

## 📊 Predictive Forecasting: 90-Day Treasury Yield & Cashflow Forecast

A core feature of Cash Diet is our forward-looking financial forecasting tool:

*   **90-Day Money Forecast:** Rather than relying purely on historical lookbacks, the application is driven by a predictive mockup model that uses historical spending patterns to simulate potential cashflow trends over the next 90 days. This provides users with a clear visual representation of best-case and worst-case scenarios ("confidence bands") to avoid running out of cash.
*   **What-If Money Calculator:** Allows interactive sandbox testing where users can simulate the long-term impact of future financial events (e.g., adding expenses, salary boosts, or changing frequencies) without altering live transactional logs.

---

## 💻 Tech Stack

*   **Frontend:** React 18, TypeScript, Tailwind CSS, Lucide React (unified iconography), SVG Math Sparklines
*   **Backend & Pipeline:** Node.js, Express
*   **Real-Time Sync:** Server-Sent Events (SSE) for instant multiplayer room updates
*   **Deployment:** Google Cloud Run (GCP)
*   **Data & Persistence:** Structured Local-First Persistence with queue-based fallback syncing

---

## 🎯 Business Impact & Use Case

I developed Cash Diet to demonstrate end-to-end full-stack capabilities. Deploying a live application on Google Cloud Run that continuously ingests, cleans, and simulates real-world financial data in real time demonstrates a complete understanding of product lifecycle, cloud infrastructure, offline-first design, and interactive analytic visualization.

---

## 📁 Directory Setup

```bash
├── server.ts              # Express Real-Time SSE Server (CJS Built)
├── src/
│   ├── main.tsx           # Application Entry Point
│   ├── App.tsx            # Main Application Shell & Core State Engine
│   ├── types.ts           # Standard Financial Typings, Enums, and Interfaces
│   ├── utils.ts           # Financial Math Helpers, Formatters, & Base Presets
│   ├── index.css          # Tailwind Rules & Typography Variables
│   └── components/        # Isolated Modular Presentation Views
│       ├── Sidebar.tsx            # Navigation rail & brand banner
│       ├── ActiveBudgets.tsx      # SVG Sparklines & target monitors (Savings Pool, Safety Fund)
│       ├── Calculator.tsx         # What-If Money Calculator & cashflow registers
│       ├── DueToday.tsx           # Bills & Income Checklist
│       ├── SmartProjections.tsx   # My 90-Day Money Forecast (Sureness Levels & Confidence Paths)
│       ├── ProjectionInsights.tsx # Visual 12-month money goal target progress
│       ├── RecentActivity.tsx     # Filterable spreadsheet of recent transactions (My Money Journal)
│       ├── CollaborationHub.tsx   # Real-time room generator & synchronization controls
│       └── Toast.tsx              # Reactive notifications manager
```

---

## 🚀 Local Setup & Installation

To run this project locally:

1. Clone or download your repository: `git clone https://github.com/YourUsername/cash-diet.git`
2. Navigate to the directory: `cd cash-diet`
3. Install dependencies:
   ```bash
   npm install
   ```
4. Start the development server (frontend hot-reloader + Express backend):
   ```bash
   npm run dev
   ```
5. Build for production (bundles backend using `esbuild` and frontend using `vite`):
   ```bash
   npm run build
   ```
6. Run the production build locally:
   ```bash
   npm start
   ```
