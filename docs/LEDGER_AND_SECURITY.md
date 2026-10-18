# Ledger and account/storage update

## Balance rules

The shared `src/domain/ledger.ts` module is the source of financial calculations for both the UI and API. A budget has a stable ID and an opening balance in integer cents. Its displayed balance is recomputed from that opening balance plus posted income minus posted expenses. Transaction arithmetic converts amounts to cents before adding or subtracting.

Transactions dated after the workspace's current calendar day remain scheduled and do not change today's balance. They become posted when due; normalization on load, server read, edits, focus, and the 30-second refresh accounts for them exactly once. No background job needs to add their amount repeatedly. The account timezone is selected from the browser at registration and stored with the ledger.

Bulk deletion and imports operate on one complete snapshot across all affected budgets. Room creation copies that snapshot without replaying transaction history. Balance reset changes the opening-balance adjustment, not recorded transaction history. Undo/redo restores full snapshots, including bills and their previous due dates, and history is cleared on profile or room changes.

Bills have an explicit funding budget and a recurrence anchor. January 31 advances to February's last day and then back to March 31. Settlement uses a unique bill-occurrence ID and rejects stale repeated clicks. A bill schedule and a separately entered recurring transaction are separate instructions; avoid entering the same payment in both places.

## Existing personal data

On the existing Pages origin, open a local profile using the same email as before. The first successful load infers opening balances from the saved balances and posted history, then writes one versioned ledger snapshot. It preserves the currently saved totals; it cannot reconstruct whether old buggy code already changed those totals incorrectly. Reconcile the opening/current balance against your own records if needed.

Original budget, transaction, and bill storage keys are retained. The old plaintext password registry and shared classifier-training cache are removed; browser profiles now explicitly have no password or access protection. Old browser profiles are not automatically server accounts. Old global room IDs and offline mutation queues are not reused or replayed into new workspaces.

Old JSON room databases are not silently imported into private server accounts, because they contain no trustworthy ownership records. The old file is not deleted. Preserve it privately if recovery is needed; create a reviewed ledger backup and restore it under the correct authenticated owner. Legacy six-digit room codes are no longer supported.

## Storage and restore

- **Local profiles:** a complete ledger is saved in one localStorage entry with a previous-version copy. Storage/validation failures leave the displayed state unchanged and report the error. Corrupt data is not replaced by an empty ledger; the loading screen provides explicit JSON-backup recovery. Local profiles share the browser's access boundary and are not encrypted vaults.
- **Server accounts:** SQLite stores users, hashed sessions, personal ledgers, private rooms, and membership. WAL mode, full synchronization, foreign keys, and revision-checked writes replace synchronous JSON-file rewrites. Records and sessions survive server restarts on a persistent volume.
- **Export backup / Restore backup:** full versioned JSON contains budgets, opening balances, transactions, goals, timezone, and bills. Restore is an explicit replacement with confirmation and supports session undo. It is a data backup, not an export of passwords, sessions, or room membership.
- **CSV:** quoted multiline fields and escaped quotes are supported. Invalid dates/amounts are rejected with row messages. Positive-amount sign convention can be selected; an explicit Type column takes precedence. Repeat imports match normalized date, budget ID, type, amount, and description. Repeated identical rows within one file preserve their multiplicity. Review previews if bank records omit unique identifiers; identical records from different files cannot always be distinguished automatically. CSV is not a full backup format.

Hosted writes are serialized and require the current revision. Conflicts reject the save rather than overwriting another editor's changes. Use **Reload latest** before retrying a server change whose acknowledgment was interrupted. Hosted changes require a connection; there is no unscoped offline replay queue. Room changes are fetched explicitly using Reload latest. Saved rooms can be reopened from the shared-workspace dialog. Leaving a room loads the separate personal workspace.

## Account and room protection

Server sign-up and sign-in use asynchronous salted scrypt password hashes (N=32768, r=8, p=3), with bounded concurrent hashing. Passwords must contain 12–128 characters. Sign-up requires email confirmation before sign-in. Confirmation links expire after 24 hours and require the signup password; reset links expire after 30 minutes. Both are hashed at rest, single-use, and replaced on reissue. Password reset revokes every existing session, verifies the mailbox, and sends a notification; it does not automatically sign in. Existing hosted accounts migrate to schema 2 and must confirm their email or recover their password. Legacy hashes upgrade after a successful login. Sessions use random 256-bit opaque tokens, only hashed tokens are stored in SQLite, and cookies are HttpOnly, SameSite Lax, and Secure in production. Sessions expire after seven days and logout revokes the session. API ledger routes require a valid session and ownership or membership. Client email/name fields never grant access.

Mutation requests require JSON and a trusted Origin. Explicit credentialed CORS supports an optional external API; unknown origins fail closed. Rate limits bound authentication attempts, room creation, and joining. Authentication throttles are persisted in SQLite across restarts; other route limits are in-process for the documented single-instance deployment.

Rooms use random IDs and separate 256-bit invitation secrets. Only hashes of those secrets are stored. Authenticated invited users become members. Owners can issue replacement invitations and remove members. Removal invalidates outstanding invitations so a removed member cannot reuse an old link to rejoin. A remaining member can still edit the room; invitations should be shared privately.

The avatar no longer sends a user's email to an external avatar service. No Gemini dependency or browser-stored training history is needed for the local classifier.

## Running a hosted account service

Use Node **22.16 or later**. SQLite and its online-backup API are built into this runtime.

```bash
npm ci
npm test
npm run lint
npm run build
NODE_ENV=production APP_URL=https://cash-diet.example DATA_DIR=/private/persistent/cash-diet PORT=3000 npm start
```

Replace the example origin with the real HTTPS origin. Terminate HTTPS at a configured reverse proxy and use `TRUST_PROXY=1` only when exactly one trusted proxy is present. Production startup refuses a missing DATA_DIR, non-HTTPS APP_URL, or missing Resend sender/API-key configuration. Set MAIL_PROVIDER=resend, RESEND_API_KEY, and MAIL_FROM in the host secrets. Mount DATA_DIR on a private persistent filesystem with SQLite locking support; an ephemeral container filesystem or object-storage mount is not durable SQLite hosting. Use one application instance with this deployment model. The database file is mode 0600 and new data directories are mode 0700; restrict existing directories and volume access too. Runtime databases and backups are excluded from git.

For local development, `npm run dev` serves HTTP at `http://localhost:3000` and uses `./data`. Use that origin in the browser, or configure APP_URL to the exact development origin. The development cookie deliberately lacks Secure so local HTTP works.

To keep the frontend on Pages and host the API separately, build with `VITE_API_BASE_URL=https://your-api-origin`, set server `CORS_ORIGINS=https://nnmdi.github.io`, and configure `COOKIE_CROSS_SITE=true` for a cross-site HTTPS deployment. Some browsers block third-party cookies; a same-origin frontend/API is the preferred deployment. Leave VITE_API_BASE_URL empty to keep the Pages site as a browser-only local-profile app. Never store secrets in VITE variables.

Back up a running SQLite database using the online-backup script, not by copying only the main file while WAL writes are active:

```bash
DATA_DIR=/private/persistent/cash-diet npm run backup -- /private/backups/cash-diet-2026-10-18.sqlite
```

The script refuses to overwrite an existing backup. Store backups privately and test restore on a separate instance. For an operator restore, stop the app, retain the current database and its WAL/SHM files privately, place the verified backup at DATA_DIR/cash-diet.sqlite with mode 0600, and start the app with no stale WAL/SHM files from the previous database. A complete database backup includes credential hashes and sessions and must be treated as sensitive.

## Validation and remaining work

The automated suite covers money calculations, due-date transitions, CSV round trips, invalid input, duplicate imports, multi-budget deletion, full undo/redo, legacy migration, API session/Origin checks, authorization, invitation rotation/revocation, revision conflicts, SQLite restart persistence, and actual React profile/budget/transaction flows using a DOM test environment. CI runs these tests and both build modes.

The update also removes the hardcoded 25% yearly-growth claim, fabricated sparse-data forecast history, the fake monthly percentage, and no-op settings. Forecasting remains experimental; its trend/bill model and uncertainty bands still need evaluation and a separate schedule-based redesign before being advertised as reliable predictions.

Email verification and password recovery are implemented and covered by API and component tests. See [production launch and email configuration](PRODUCTION.md). Before real banking or a public account-service launch, define account deletion/session-management policies, configure and verify production hosting/backups/monitoring, and review the deployment's security. No bank tokens are stored or live bank accounts connected by this change. SQLite files/backups require host or volume encryption if at-rest encryption is part of the deployment requirements. Full real-browser visual/cross-browser testing remains necessary: the browser download in this environment failed, so DOM component tests are not claimed as a visual browser pass.
