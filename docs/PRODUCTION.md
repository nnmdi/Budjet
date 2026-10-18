# Production launch

Cash Diet serves the frontend and API together from one Docker service. GitHub Pages continues to use browser-only profiles until explicitly rebuilt with an API URL. Do not connect real banks yet.

## Railway

1. Connect `nnmdi/Budjet`, branch `main`, using the root Dockerfile and `railway.json`. Use one service replica in one region.
2. Attach a persistent volume at `/data` before starting the service. SQLite requires filesystem locking. Do not use an ephemeral container disk.
3. Generate an HTTPS domain, then configure the following service variables. Store credentials in Railway, never in Git or VITE variables.

| Variable | Value |
| --- | --- |
| NODE_ENV | production (also set by image) |
| DATA_DIR | /data (also set by image) |
| APP_URL | Exact generated HTTPS origin, without trailing slash |
| PUBLIC_APP_URL | Same HTTPS origin for same-origin hosting |
| TRUST_PROXY | 1 when Railway supplies the single trusted proxy |
| MAIL_PROVIDER | resend |
| RESEND_API_KEY | Secret with email sending permission |
| MAIL_FROM | Cash Diet <security@your-verified-domain> |
| COOKIE_CROSS_SITE | false |

Let Railway provide PORT. Leave CORS_ORIGINS empty for same-origin hosting. The container initializes volume permissions and drops to the node user. Readiness is `/api/ready`; liveness is `/api/health`. Readiness checks database access and email configuration, **not actual provider acceptance or inbox delivery**. Startup deliberately refuses production file-mail fallback.

## Email setup

Verify the sending domain in Resend and publish the DNS records it provides. Use that verified domain in MAIL_FROM. Use the final frontend URL in PUBLIC_APP_URL so links return to the correct account service. Never use a dummy provider key in production.

Development defaults to a private JSON outbox under DATA_DIR/mail; messages are not sent. Confirmation and reset secrets are URL fragments, cleared by the account screen and submitted only after explicit form submission. Verification requires the signup password. Password recovery requires matching new-password fields. Recovery/resend endpoints return generic responses for known and unknown addresses.

## Release checks

Run `npm ci`, `npm test`, `npm run lint`, `npm run build`, `npm run smoke:auth`, and `npm run build:pages`. The smoke test launches a temporary local server with a private file outbox; it sends no real email. It checks signup, verification/replay rejection, login, ledger persistence through recovery, old-session revocation, and online backup.

The production-container GitHub workflow builds the image and checks non-root execution, restrictive data permissions, durable restart state, a readable online backup, readiness, security headers, private-route denial, and foreign-Origin rejection. Its CI mail credentials are placeholders; it performs no mail send.

On the deployed service run `npm run check:production` to check configuration, writable storage and database integrity. From an external machine run `npm run check:deployment -- https://actual-service-origin`. Then use a controlled test account to confirm actual inbox delivery, verification, sign-in, reset, notification, and rejection of an old session. Check browser behavior on mobile and desktop. Monitor readiness, errors, restart loops, disk use, and provider failures. No outbound email delivery test has been performed by the local test suite.

## Backup and rollback

After building, `DATA_DIR=/data npm run backup -- /private-backups/unique-name.sqlite` creates an online backup without overwriting a previous file. Keep encrypted off-volume backups, establish retention and recovery objectives, and prove restore on a separate instance before accepting sensitive data. A restart test alone is not a disaster-recovery test.

Back up before the schema-2 release. It adds verification, token, throttle, and credential-version data without removing ledgers. Existing accounts must confirm their mailbox or reset their password. Do not roll back to an older server against schema 2: its schema guard intentionally rejects newer databases. Restore the matching pre-release backup together with the old image for rollback, retaining the current database privately to reconcile newer writes.

Real-bank readiness additionally requires account deletion/session management, a bank-provider security design, secret rotation, verified host/backup encryption, monitoring ownership, and an independent security review. This release adds no bank tokens or bank integration.
