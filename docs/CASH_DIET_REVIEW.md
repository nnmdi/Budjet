# Cash Diet: application review and next-work roadmap

Reviewed October 18, 2026. Source baseline: `05a4dc5` on `nnmdi/Budjet/main`.

## Verdict

Cash Diet is a useful personal-finance prototype with substantial frontend functionality. It is not ready for secure, multi-user financial records. The highest-value next work is a trustworthy ledger and honest local-profile experience, followed by authenticated durable storage. Adding bank connections before these foundations would amplify existing balance and privacy problems.

This review covers the tracked frontend, Express API, financial utilities, classifier, import/export, persistence, deployment workflow, and project configuration. Findings marked **reproduced** were exercised in isolated local handler/utility probes. Other findings come from source inspection. This is not a penetration test, visual browser acceptance test, or inspection of the live deployment or a separate backend repository.

## What is actually here

| Area | Implemented | Current limit |
| --- | --- | --- |
| App architecture | React 19 + Vite + TypeScript frontend, one Express server | No FastAPI microservices, PostgreSQL, or Plaid implementation in this repository |
| Budgets | Create, rename, delete, balance reset, savings goals | Budget names double as record IDs; balances are mutable running totals |
| Transactions | Manual entry, recurrence expansion, search, bulk deletion, CSV export | Inconsistent future-entry posting; cross-budget refund and undo problems |
| Statement import | CSV preview, column mapping, category/type edits, automatic budget creation | Custom parser, no durable duplicate detection or complete backup restore |
| Bills | Recurring bill/income list, payment recording, due-date advance | No budget/account association in bill model; date and undo defects |
| Analytics | Linear-trend forecast, what-if scenarios, statistical outliers | Synthetic sparse-data history; unvalidated uncertainty; arbitrary growth claim |
| Classification | Browser-side Naive Bayes with seed examples and user training | No documented evaluation; repeated training and shared browser training state |
| Personal storage | Browser localStorage by email; transient guest mode | Local profiles are not secure accounts; no cross-device backup |
| Collaboration | Room creation/join, SSE broadcasts, mutation sync | Code-only access; JSON-file persistence; weak queue isolation and conflict handling |
| Delivery | GitHub Pages workflow, full-stack build scripts | Pages cannot host Express; external API needs CORS and durable hosting |

The UI and page title already used Cash Diet. This update completes remaining package, workflow, service-log, and documentation naming. Existing storage keys and the `/Budjet/` Pages path remain compatible. The GitHub repository slug itself has not been renamed.

## Priority 0: protect records and make balances trustworthy

### 1. Local login does not protect an account

**Evidence:** `src/components/AuthOverlay.tsx`, `handleSubmit`; `src/App.tsx`, initial user state and `handleLogin`.

`passwordHash` contains the user's literal trimmed password. Sign-in compares strings in localStorage. The UI considers a stored email sufficient to restore the signed-in state. There is no server authentication, password hashing service, session validation, account recovery, or encryption of the ledger. “Decrypting personal ledger” is inaccurate UI copy.

**Next change:** immediately make the local profile mode explicit and remove misleading security claims/password collection, or implement real server-side authentication before advertising accounts. A production account flow needs password hashing, authenticated sessions, authorization, and recovery. Hashing a value only in the browser does not establish server-side access control.

### 2. Shared rooms expose read/write access without authentication — reproduced

**Evidence:** `server.ts`, all `/api/rooms` handlers, `generateRoomCode`.

Knowing a six-digit code permits reading the room, receiving updates, and submitting mutations. The API trusts user names/emails in requests. There is no membership check, role enforcement, attempt limit, room expiration, or collision check when generating a code. A collision can overwrite an existing room. A local route probe read a room successfully with no credentials.

**Next change:** use authenticated membership and authorization for every room operation, with secure invitation tokens, bounded attempts, and collision-safe IDs. Until that is built, keep public shared-room use disabled or clearly limited to disposable demonstration data. This review does not establish whether the deployed API is currently reachable.

### 3. Creating a room applies historical transactions twice — reproduced

**Evidence:** `src/App.tsx`, `handleCreateRoom`; `server.ts`, `create_budget` and `add_transaction` sync actions.

The client sends each budget's current balance, then sends all its transactions. The server starts from that current balance and applies the historical transactions again. Probe: a budget at **$900**, already reflecting a **$100 expense**, becomes **$800** when copied using this sequence.

**Next change:** distinguish opening balances from posted ledger entries. Import a snapshot atomically, or reconstruct current balances from opening balances plus posted transactions, never both.

### 4. Future recurrence and cross-budget deletion corrupt current balances — reproduced

**Evidence:** `src/App.tsx`, `handleAddNewTransaction`, `handleDeleteTransactionsBatch`, `handleImportTransactionsBatch`, undo handlers; `server.ts`, `add_transaction` and `delete_transactions`.

- The client initially applies only recurring entries dated up to now; the server immediately applies every entry, including future dates. A future $100 expense reduced the probe's current balance by $100.
- No scheduled posting worker updates the local balance when a future entry becomes due.
- Bulk deletion sums every selected transaction's refund into the first selected budget, even across budgets. Server probe: deleting a $100 expense from A and a $50 expense from B refunded $150 to A and $0 to B.
- Deleting a future entry can refund money that the local client never deducted.
- Import undo similarly assigns the combined impact of multiple budgets to the first budget.

**Next change:** define scheduled versus posted transactions, use stable budget IDs, calculate impact per budget, and handle imports/deletions atomically. Store money in integer cents or an appropriate decimal representation. Establish one financial model shared by client/server.

Acceptance cases: opening $1,000 minus posted $100 = $900; scheduling another $100 keeps today's balance at $900; deleting the scheduled item keeps $900; undo/redo/import/export and room bootstrap preserve these invariants in every budget.

## Priority 1: prevent lost data and misleading outputs

### 5. Mutation validation and import acknowledgment are unreliable — reproduced

**Evidence:** `server.ts`, sync handler; `src/App.tsx`, `handleImportTransactionsBatch`.

The import handler sends `create_budget` with `{ name, balance, created }`, while the API expects `{ budget: { ... } }`. The API catches the failure internally and still responds `success: true`; the probe confirmed no budget was created. Missing `actions` throws before validation. Numbers, names, transaction types, dates, target budget existence, and payload sizes need explicit validation. Unknown/failed actions have no per-action acknowledgment.

**Next change:** runtime schemas, finite/positive amount checks where applicable, atomic transactions, bounded batches, and explicit accepted/rejected action IDs. Move side effects out of React state updater callbacks, which can run more than once in development StrictMode.

### 6. Offline sync is not isolated by user or room

**Evidence:** `src/App.tsx`, `syncActionsToCloud`, `replayOfflineQueue`, stream effect, logout/room handlers.

- One global offline queue stores actions without a target room and replays them into whichever room is current.
- A non-success JSON response need not throw or requeue; replay removes the queue first and displays success regardless of actual acknowledgment.
- `clientVersion` is sent but not used for conflict resolution. Concurrent responses can replace newer client state with older snapshots.
- SSE suppresses updates by display name, so two people sharing a name can miss each other's updates.
- Room ID, undo/redo history, and room state are not consistently cleared or partitioned when logging out or changing users. A retained room can overwrite the next profile's local data.
- Joining a room replaces personal budget state, which is then persisted under the personal profile. Disconnect does not restore a separate personal snapshot.

**Next change:** partition personal/shared state and queues by authenticated user and room; acknowledge before removing queued actions; serialize mutation batches; enforce monotonic versions; identify senders by client/user IDs; clear session-specific state. Test account switching, room switching, retry, duplicate delivery, and concurrent edits.

### 7. Storage is fragile and backups are incomplete

**Evidence:** `server.ts`, `DB_PATH`, `persistRoomsDatabase`; `src/App.tsx`, localStorage effects and initialization; `.gitignore`.

Room data is a synchronous JSON-file write containing financial history and user email/name metadata. Write failures are logged but still allow a success response. This is not reliable multi-instance storage and can disappear on ephemeral hosting. `rooms_db.json` is not currently ignored by git. Browser JSON reads mostly lack recovery or schema/version checks; malformed or unavailable storage can break startup or saving. Clearing site data loses personal records. CSV export does not preserve complete budget balances, bill schedules, goals, settings, and profile state.

**Next change:** durable database with migrations, atomic writes and tested recovery; ignore local runtime data; add versioned full backup/restore and storage-error recovery. Keep personal and shared records distinct.

### 8. Forecasts and dashboard claims can misrepresent the data

**Evidence:** `SmartProjections.tsx`, `predictionEngine`; `ProjectionInsights.tsx`; `src/App.tsx`, monthly spend and liquidity comparison.

- Fewer than five historical transactions triggers synthetic history, including a minimum historical balance of $100. An empty or negative account can therefore appear to have assets it does not have.
- Forecasts and history clamp balances at zero, concealing shortfalls.
- Bills are converted to a daily monthly average without respecting their due dates or frequencies. Existing trend plus bill adjustments can count recurring spending twice.
- Filtering historical entries against today's midnight excludes transactions later today; UTC/local date mixing adds boundary errors.
- The 12-month goal claims users are “on track” to grow by exactly 25%, computed as `totalLiquidity * 1.25`, without income, expenses, or evidence.
- Monthly spend includes future entries in the current month. “vs last month” compares this month's net activity against all other dates, not the previous month's balance/activity. The spending cap is hardcoded to $10,000.
- What-if totals sum all configured occurrences, even outside the displayed 12-month chart; one-time frequency `o` is absent from the declared union and falls through a shared schedule utility that defaults to monthly.

**Next change:** an honest no-data state; explicit demo mode; transparent assumptions; schedule-based forecast using posted balance plus dated expected cashflows; visible negative balances; user-defined limits/goals; correctly bounded comparisons. Label uncertainty as experimental until evaluated against held-out history.

### 9. Recurring dates and undo/redo are incomplete — date defect reproduced

**Evidence:** `DueToday.tsx`, `getNextDueDate`; `src/utils.ts`, `generateScheduleDates`; `src/App.tsx`, undo/redo and `handlePayBill`.

Monthly bill advance uses `setMonth` directly: **January 31, 2026 becomes March 3**, skipping February. Different helpers implement month ends differently; chained clamping can also drift from an intended day of month. Date-only strings, UTC strings, and timezone-less timestamps are mixed.

Redo lacks cases for recurring additions, erased transactions, and budget renames. Undoing a bill payment removes the transaction but does not restore the bill's prior due date. Restoring a deleted shared budget can reapply historical amounts to its already-adjusted balance. Bills choose the active or first budget rather than a saved funding budget.

**Next change:** one date-only calendar policy, preserved recurrence anchors, explicit one-time handling, and atomic reversible commands that restore both schedule and ledger state. Associate each bill with a funding budget/account.

### 10. Import/export needs stronger safeguards

**Evidence:** `ImportTransactions.tsx`; `RecentActivity.tsx`, `triggerCSVExport`; `Calculator.tsx`, export and schedule totals.

The importer reads text CSV, despite occasional CSV/Excel wording. It splits lines before parsing quoted fields, loses escaped quotes, silently converts invalid amounts to zero and invalid dates to today, and lacks duplicate checks. Reimporting a file creates new random IDs and counts it again. Loose type substring matching can misclassify data. There is no explicit bank sign-convention selection or robust debit/credit column support.

CSV export does not reliably escape budget names or embedded description quotes/newlines and has no spreadsheet formula neutralization. It is not a lossless backup format.

**Next change:** a proper CSV parser, rejected-row explanations, explicit date/sign/type mapping, file/row limits, duplicate fingerprints, standards-compliant export escaping, and safe spreadsheet text handling. Add XLSX only when intentionally implemented.

## Priority 2: product clarity, privacy, and maintainability

- **Classifier:** the module singleton and `budjet_dynamic_ml_data` are shared across local profiles. Every transaction change retrains the entire history without resetting weights, overcounting older examples; startup can load persisted examples and train them again. Use per-user model state, deterministic rebuilds or deduplicated incremental learning, and an evaluation set. The “open-source” training-data claim lacks a dataset citation.
- **Outliers:** backend/local implementations are duplicated and differ in IDs/messages. Their metric uses `(amount - median) / standard deviation` while copy refers to a mean, and local text calls this a multiplicative amount. Sparse groups of one or two items cannot trigger the current high-spike branch because it selects the maximum as the two-item median. Low data and dismissed warnings should not imply “Everything Looks Great.” Extract a shared detector with explicit sufficiency and alert semantics.
- **Privacy:** the sidebar sends the user's email to DiceBear as the avatar seed. Generate initials locally or use a random non-identifying seed. External fonts also need to be considered when defining offline/privacy behavior. An SSE URL carries name/email in query parameters.
- **Controls/copy:** `syncRetry`, `liveCollab`, and `tabularNumbers` are only setting state, not controlling their advertised behavior. “Archive Old Funds” merely clears paid bill IDs. The forecast CTA in `ProjectionInsights` routes to projections although its text says calculator. Connect controls to real behavior, or remove them, and simplify confusing treasury terminology.
- **Accessibility:** mobile navigation already includes focus/Escape handling and touch-friendly sizing. Extend those patterns to modal dialogs, form label associations, icon-only controls, chart alternatives, and validation/error announcements. Verify desktop/mobile flows in a browser; source inspection does not establish visual quality.
- **Deployment:** hardcoded port 3000 ignores `PORT`; `npm start` without `NODE_ENV=production` enters development middleware. An external Pages API has no implemented CORS policy. SSE lacks heartbeats and durable multi-instance fan-out. Define one deployment mode first, add health/readiness checks and persistence, then scale collaboration if needed.
- **Code quality:** `App.tsx` is 2,226 lines at baseline and combines storage, transport, ledger changes, undo, and rendering. `any` payloads and non-strict checking hide mistakes. React/React DOM type packages are absent from direct dependencies; React hooks are consequently insufficiently checked, including the invalid `o` frequency union. Split ledger commands, persistence, transport, and views after defining shared domain types.
- **Performance:** production frontend bundle is approximately 563 kB minified / 164 kB gzip, with Vite's >500 kB warning. Lazy-load forecasting, calculator, and import views; debounce expensive analytics; bound/paginate history. Do correctness work before optimizing.
- **Project hygiene:** remove unused Gemini dependencies/environment/capability claims if no AI API is planned. Add a license only after the owner chooses one; add realistic setup, support/privacy information, and documentation that matches implemented behavior.

## Proposed work order and completion gates

| Order | Work | Done when |
| --- | --- | --- |
| 1 | Ledger correctness and regression tests | Per-budget balances survive recurrence, deletion, import, undo/redo, and room bootstrap without double posting; future items are separate from posted records |
| 2 | Honest profiles and analytics | No plaintext password collection in local-only mode; no fabricated personal history or unsupported growth claims; insufficient-data states work |
| 3 | Reliable local persistence and backup | Full versioned backup round-trips; malformed storage recovers; switching profiles/rooms cannot mix records |
| 4 | Authenticated durable backend | Sessions and membership enforced; runtime schema validation; database migrations and recovery; unauthorized read/write tests pass |
| 5 | Shared sync | Per-room queues, explicit acknowledgments, idempotency, conflict policy, monotonic versions, and reconnect/concurrency tests pass |
| 6 | Bank connectivity | Secure backend token storage, consent/disconnect, idempotent bank transaction sync, pending/posted reconciliation, and account mapping work in sandbox before production |
| 7 | Differentiating features | Subscription detection, safe-to-spend, upcoming shortfall alerts, goals, and mobile polish use the verified ledger |

Recommended first coding task: build a shared, tested ledger module with explicit opening balances, integer-cent amounts, posted/scheduled status, and atomic multi-budget changes. In parallel product scope, decide whether the immediate release is a local-only budgeting tool or a real account-based service; this determines authentication and hosting work. No additional bank/retail feature is required to make the current prototype useful.

## Verification performed

- `npm ci --ignore-scripts`: succeeded. Dependency lifecycle scripts intentionally not executed.
- `npm run lint`: succeeded (TypeScript only; not a functional/security guarantee).
- `npm run build`: succeeded; Vite warned about the large frontend chunk.
- `npm run build:pages`: succeeded; same chunk-size warning.
- Isolated probes invoked the actual bundled Express route handlers with mocked filesystem/transport. They reproduced unauthenticated room access, historical double posting, immediate future posting, incorrect cross-budget refunding, malformed-sync failure, and silent failure of the import-shaped budget action.
- An actual bundled date helper reproduced January 31 → March 3 for monthly bills.
- Development startup through the `tsx` CLI was blocked by an environment IPC socket permission (`EPERM`). The handler probes avoided network sockets; no live HTTP, SSE reconnect, deployment, or visual browser pass is claimed.
- No dependency vulnerability scan, real bank connection, external endpoint mutation, or examination of a different backend repository was performed.

These checks describe the baseline defects. This change completes branding/documentation only; the defects above remain work items.
