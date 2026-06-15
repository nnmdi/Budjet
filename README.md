# ✈️ BUDJET — Premium Wealth Admin & Real-Time Portfolio Advisor

**BUDJET** is a full-stack, enterprise-grade wealth administration dashboard and predictive modeling platform. Designed with a Swiss-minimalist aesthetic and featuring real-time collaborative workspace synchronization, multi-budget analytics, dynamic advisory engines, and offline-first persistence.

This project is structured as a robust, single-page application (SPA) backed by an Express synchronization server. It serves as a showcase of modern web engineering, demonstrating precise TypeScript typings, responsive layouts, modular state management, and real-time Server-Sent Events (SSE).

---

## 🚀 Key Architectural Features

### 1. Collaborative Sync Engine (Server-Sent Events)
* **Real-Time Rooms:** Users can spin up collaborative sessions or join live rooms with a room code.
* **Server-Sent Events (SSE):** Rather than standard HTTP polling, BUDJET establishes persistent connection pipelines (`EventSource`) to push structural balance updates and synchronized transactions to multiple active clients instantly.
* **Active Presence:** Backed by atomic ID tracking, live active participant avatars are dynamically pulled using the Dicebear avatar API.

### 2. Context-Aware Advisor Intelligence
* **Heuristical Rule Processing:** The dashboard features an active **Advisor Tip Engine** that evaluates total portfolio distributions, liquidity health, and relative cashflows in real-time.
* **Proactive Interventions:** Dynamically alerts users when individual budget pools are depleted (under \$100), when outgoing expenses outpace incoming profits, or when wealth diversification is unbalanced.

### 3. Professional Financial Modeling & Assets
* **Projection Insights:** Features interactive mathematical asset-block models projecting compound savings velocity and 12-month treasury targets.
* **Dynamic Sparklines:** Handeled directly via SVG math rendering, rendering real-time cashflow sparkline trends representing relative volatility across active streams.
* **Due Today Panel:** An active bill/income scheduler where users can set obligations, track statuses, and clear items to instantly update cash reserves.

### 4. Enterprise Offline Stability
* **Queue-Based Offline Persistence:** Built with transaction queue backups on `localStorage`. If the network fails, user actions are buffered and queued locally, automatically syncing back to the cloud room once connectivity is recovered.
* **Financial Layouts:** Designed using OpenType tabular-lining properties to force proportional monospacing on numerical lists, guaranteeing perfect column alignment on transaction grids.

### 5. High-Fidelity Custom Theme
* **Rose & Slate Accents:** Configured with a premium, slate-dark and vibrant rose color palette, utilizing rich negative spaces, precise borders, and elegant interactive elements.

---

## 🛠️ The Tech Stack

### Frontend Architecture
* **React 18 & TypeScript:** Strict types representing transaction types (`expense` | `profit`), category structures, and state mutations.
* **Vite:** High-performance, lightning-fast bundler.
* **Tailwind CSS:** Modern responsive design with custom fluid grid properties.
* **Lucide React:** Premium lightweight unified iconography.

### Backend Infrastructure
* **Node.js & Express:** Lightweight, zero-dependency REST and streaming server.
* **Server-Sent Events (SSE):** Standard multi-event text stream transmission.
* **esbuild:** Bundles the TypeScript server into a self-contained, high-performance CommonJS deployment bundle (`dist/server.cjs`).

---

## 📁 Source Code Directory Setup

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
│       ├── ActiveBudgets.tsx      # SVG Sparklines & target monitors
│       ├── Calculator.tsx         # Asset Block visualizer & cashflow registers
│       ├── DueToday.tsx           # Bill tracker & scheduler interface
│       ├── ProjectionInsights.tsx # Visual growth trajectory charts
│       ├── RecentActivity.tsx     # Filterable spreadsheet with CSV export
│       ├── CollaborationHub.tsx   # Real-time room generator & synchronization controls
│       └── Toast.tsx              # Reactive notifications manager
```

---

## ⚙️ Local Development Setup

To run this project on your physical machine or integrate it into external deployment targets, follow these steps:

### Prerequisites
Ensure you have **Node.js** (v18 or higher) and **npm** installed.

### 1. Installation
Clone your repository and install the production/development dependencies:
```bash
npm install
```

### 2. Fast Development Server
Spins up both the frontend hot-reloader and the Express backend on port `3000`:
```bash
npm run dev
```
Open **[http://localhost:3000](http://localhost:3000)** in your browser.

### 3. Production Compilation
Builds the client SPA and bundles the backend service into `dist/`:
```bash
npm run build
```

### 4. Run Production Build locally
Serves the fully optimized static assets and API routes ready for containers:
```bash
npm start
```

---

## 💼 Recruiter Reference (Why this shows senior ability)

If you are a Recruiter reviewing this codebase, here are several key engineering details to pay attention to in the code:

1. **Modular React Layouts:** Check how state flows down from `App.tsx` into decoupled, highly cohesive subcomponents. This separation of concerns prevents massive file sizes and ensures optimal rendering performance.
2. **Event-Driven Backend Systems:** Rather than resorting to expensive WebSocket server infrastructures, `server.ts` utilizes highly lightweight, standard Server-Sent Events (SSE) keeping room sync operational on single servers.
3. **TypeScript Type Safety:** Look at `/src/types.ts`. All structural states (budgets, transactions, bills) are strictly guarded. You won't find generic `any` objects in this workspace. Every data payload is explicitly typed.
4. **Resilient UX Design:** The application features robust failure fallback logic, offline queues, user friendliness, instant reactive CSV reports generation, and monospaced financial tables.
