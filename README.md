# Poker Four Club — virtual-chip multiplayer

Node.js 24+, Aiven PostgreSQL, vanilla browser UI, server-authoritative no-limit Texas Hold’em. Chips have no cash value. There is no payment, crypto, deposit or withdrawal integration. Only real registered players occupy seats; no bots, fabricated statistics or demo accounts are created.

For Bengali installation instructions, read **SETUP-BN.md**.

## Quick start

1. Install Node.js 24 or later.
2. Run `npm ci` in this directory.
3. Fill the supplied `.env` (or copy `.env.example`). Set your Aiven PostgreSQL `DATABASE_URL`, Aiven CA certificate, and Cloudinary credentials.
4. Run `npm run db:check` to initialize the schema and verify the live database connection. This creates six empty table configurations, not user accounts or activity.
5. Temporarily set `ADMIN_EMAIL`, `ADMIN_USERNAME`, `ADMIN_NAME`, and `ADMIN_PASSWORD`, then run `npm run admin:create`. Remove `ADMIN_PASSWORD` afterwards. This command creates a new account and fails if the email/username already exists; it never promotes an existing account silently.
6. Run `npm start`. Open `http://localhost:5000`. Log in with the administrator credentials and open `/admin`.

`START-WINDOWS.bat` installs locked dependencies and starts the server after you have configured `.env`.

## Database and TLS

Use an **Aiven PostgreSQL** service, not MySQL. Put its PostgreSQL service URI into `DATABASE_URL`. URL-encode special characters in passwords. Download the project CA certificate from Aiven and save it as `certs/ca.pem`, or set a different absolute `AIVEN_CA_PATH`. As an alternative, set `AIVEN_CA_CERT` to the PEM text with literal `\n` line breaks.

TLS validates the certificate chain and hostname. URI `sslmode`, `sslcert`, `sslkey`, and `sslrootcert` parameters are removed so they cannot override the explicit verified TLS configuration. The schema is initialized idempotently from `schema.postgres.sql`. Users, sessions, wallet ledger, table/deck state, seats, completed hands, request idempotency and admin audit logs persist in PostgreSQL.

Short database transactions use one PostgreSQL advisory lock to serialize chip and game-state mutations, including across multiple app instances sharing the same database. This favors correctness for a small club; high-throughput deployments should partition locks by wallet/table and benchmark before increasing scale. The database is the authority for game clocks. Do not run independent databases for different instances.

`schema.sql` and the explicit local database adapter are used by automated tests only. `npm start` requires PostgreSQL and never silently falls back to SQLite. The uploaded SQLite database is not bundled or automatically imported. If you need existing accounts/history migrated, plan a separate migration before using a populated service. Do not point this release at an unrelated existing schema.

## Profile images

The browser crops JPEG/PNG photos to 256 × 256 and sends a bounded image payload to the authenticated server. The server validates the basic image signature and signs a Cloudinary upload with SHA-256. Only the resulting HTTPS Cloudinary URL is stored on the profile; image bytes live in Cloudinary. API secrets remain on the server. Arbitrary user-supplied remote image URLs are rejected. If Cloudinary is not configured or rejects the upload, the profile operation reports an error; it does not silently store an inline photo.

Replacing/removing a profile photo updates its reference. Previously uploaded Cloudinary assets are not automatically deleted; manage retention in your Cloudinary account. Failed profile saves after a successful upload can also leave an unreferenced asset.

## Gameplay

- Four seats per table; two or more players with chips trigger a persisted five-second countdown. Players cannot bypass the clock with a manual start request.
- Every hand uses a crypto-random shuffled deck, private hole cards, dealer rotation, blinds and no-limit betting.
- All-in calls and raises, incomplete raises, betting-reopen rules, layered side pots, ties, uncalled excess refunds and odd-chip allocation clockwise from the dealer are handled by the server.
- Winner highlights and a result banner appear at showdown. The five-second countdown follows before the next hand. Motion preferences and the system reduced-motion setting are respected.
- Turns last 45 seconds. On timeout the player checks if possible, otherwise folds. Refreshing/reconnecting restores the persisted hand and private view. Unseen opponent hole cards and the deck are never included in a player response.
- Disconnected seats are returned to the wallet after five minutes when the table becomes idle. Banned players lose sessions immediately, time out normally during an active hand, and leave before the next hand. Zero-stack seats must leave and rejoin with chips.
- Table state updates use authenticated HTTP polling approximately every 900 ms. This is live multiplayer, not a WebSocket implementation. Revision checks reject stale actions; the next poll refreshes the state.
- Wallet-to-table buy-ins move virtual chips into a stack; leaving between hands returns that stack. Wallet balance and table stack are distinct. Hand ledger entries describe the table result; their `balance_after` is the wallet balance, not table equity.

## Free chips and administration

New accounts receive 5,000 free virtual chips. Players can claim 1,000 / 2,500 / 5,000-chip packs up to a combined 10,000 per UTC day. These are gameplay allowances, not payments or a test checkout. Password-confirmed virtual-chip transfers to an exact username remain available.

`/admin` requires a current administrator session. The interface covers:

- Latest 500 users: account status, balances, ban/unban and signed virtual-chip adjustments, each with a mandatory reason.
- Six table configurations: name, blinds and buy-in. Updates require an empty table. The big blind must be twice the small blind, with buy-in at least ten big blinds.
- Latest 100 completed hands, 200 wallet ledger entries and 100 administrator audit entries. Search filters the loaded view; older records remain in SQL.
- Admin accounts cannot be banned through the panel. Admin roles are provisioned by the server operator, not by public signup.

The panel does not expose passwords, session tokens, the active deck or live private hole cards. It does not rig winners or rewrite completed hands.

## Hosting

Run this as a persistent Node.js web service, not static hosting. Set `PORT` as required by the host. Configure outbound access to the Aiven service host/port and `api.cloudinary.com`; browsers must reach `res.cloudinary.com`.

Use an HTTPS reverse proxy and set `NODE_ENV=production` and `COOKIE_SECURE=1`. Production automatically uses Secure cookies. Forward the original Host header. The same-origin UI/API uses HttpOnly, SameSite cookies, CSRF tokens, request idempotency, scrypt passwords, request limits and parameterized SQL. Keep `.env` and CA files out of public assets and source control. Use managed restart and database backups. Rolling processes should allow in-flight requests to finish.

## Verification and limits

Run `npm test` (development dependencies required). At delivery, **19 automated checks passed**, covering ranking, conservation, side pots, all-in behavior, countdowns, card privacy, persisted reconnection, wallet races/idempotency, authorization, bans, profile upload behavior and PostgreSQL SQL compatibility.

The local API tests use a temporary SQLite database, the PostgreSQL compatibility check uses pg-mem, and Cloudinary HTTP responses are mocked in the profile test. These do **not** establish live Aiven transaction/TLS behavior or live Cloudinary account access. Run `npm run db:check`, upload a real profile image, and play from two independent browser sessions with your credentials before release. Responsive update: 58 browser page/layout checks passed at 320, 360, 390, 600, 768, 1024, 1440 and 1920 px widths, plus 844 × 390 landscape. Checks cover sign-in, lobby, wallet, profile, settings, gameplay and administration, with no page-level horizontal overflow or JavaScript errors. Desktop and mobile gameplay screenshots were visually inspected. These browser checks use isolated API fixtures, not live Aiven/Cloudinary data. Wide ledger/admin tables scroll within their own panels. Mobile poker seats use distinct grid rows; result/countdown banners sit below the felt. Very small displays and enlarged text can scroll vertically.

The supplied schema initialization is for a fresh project database; it is not a general migration framework for unknown older releases. Password reset emails, email verification, tournaments, spectators and account-role management in the UI are outside this release.

Official setup references:
- https://aiven.io/docs/products/postgresql/howto/connect-node
- https://aiven.io/docs/platform/concepts/tls-ssl-certificates
- https://cloudinary.com/documentation/upload_images
- https://cloudinary.com/documentation/authentication_signatures
