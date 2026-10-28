# Poker Four Club — virtual-chip multiplayer

Node.js 24+, Aiven PostgreSQL, vanilla browser UI, server-authoritative no-limit Texas Hold’em. Chips have no cash value. There is no payment, crypto, deposit or withdrawal integration. Only real registered players occupy seats; no bots, fabricated statistics or demo accounts are created.

For Bengali installation instructions, read **SETUP-BN.md**.

## Quick start

1. Install Node.js 24 or later.
2. Run `npm ci` in this directory.
3. Fill the supplied `.env` (or copy `.env.example`). Set your Aiven PostgreSQL `DATABASE_URL`, Aiven CA certificate, and Cloudinary credentials.
4. Run `npm run db:check` to initialize the schema and verify the live database connection. This creates ten empty table configurations, not user accounts or activity.
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

- Four seats per table; two or more players with chips trigger a persisted ten-second countdown. Players cannot bypass the clock with a manual start request.
- Every hand uses a crypto-random shuffled deck, private hole cards, dealer rotation, blinds and no-limit betting.
- All-in calls and raises, incomplete raises, betting-reopen rules, layered side pots, ties, uncalled excess refunds and odd-chip allocation clockwise from the dealer are handled by the server.
- Winner highlights and a result banner appear at showdown. The ten-second countdown follows before the next hand. Motion preferences and the system reduced-motion setting are respected.
- Turns last 45 seconds. On timeout the player checks if possible, otherwise folds. Refreshing/reconnecting restores the persisted hand and private view. Unseen opponent hole cards and the deck are never included in a player response.
- Disconnected seats are returned to the wallet after five minutes when the table becomes idle. Banned players lose sessions immediately, time out normally during an active hand, and leave before the next hand. Zero-stack seats must leave and rejoin with chips.
- Table state updates use authenticated HTTP polling approximately every 900 ms. This is live multiplayer, not a WebSocket implementation. Revision checks reject stale actions; the next poll refreshes the state.
- Wallet-to-table buy-ins move virtual chips into a stack; leaving between hands returns that stack. Wallet balance and table stack are distinct. Hand ledger entries describe the table result; their `balance_after` is the wallet balance, not table equity.

## Free chips and administration

New accounts start with zero chips. Free chip claims are disabled at the API and removed from the UI. Administrators allocate virtual chips through /admin. Password-confirmed virtual-chip transfers to an exact username remain available.

`/admin` requires a current administrator session. The interface covers:

- Latest 500 users: account status, balances, ban/unban and signed virtual-chip adjustments, each with a mandatory reason.
- Ten table configurations: name, blinds and buy-in. Updates require an empty table. The big blind must be twice the small blind, with buy-in at least ten big blinds.
- Latest 100 completed hands, 200 wallet ledger entries and 100 administrator audit entries. Search filters the loaded view; older records remain in SQL.
- Admin accounts cannot be banned through the panel. Admin roles are provisioned by the server operator, not by public signup.

The panel does not expose passwords, session tokens, the active deck or live private hole cards. It does not rig winners or rewrite completed hands.

## Hosting

Run this as a persistent Node.js web service, not static hosting. Set `PORT` as required by the host. Configure outbound access to the Aiven service host/port and `api.cloudinary.com`; browsers must reach `res.cloudinary.com`.

Use an HTTPS reverse proxy and set `NODE_ENV=production` and `COOKIE_SECURE=1`. Production automatically uses Secure cookies. Forward the original Host header. The same-origin UI/API uses HttpOnly, SameSite cookies, CSRF tokens, request idempotency, scrypt passwords, request limits and parameterized SQL. Keep `.env` and CA files out of public assets and source control. Use managed restart and database backups. Rolling processes should allow in-flight requests to finish.

## Verification and limits

Run `npm test` (development dependencies required). At delivery, **42 automated checks passed**, covering ranking, conservation, side pots, all-in behavior, countdowns, card privacy, persisted reconnection, wallet races/idempotency, authorization, bans, profile upload behavior and PostgreSQL SQL compatibility.

The local API tests use a temporary SQLite database, the PostgreSQL compatibility check uses pg-mem, and Cloudinary HTTP responses are mocked in the profile test. These do **not** establish live Aiven transaction/TLS behavior or live Cloudinary account access. Run `npm run db:check`, upload a real profile image, and play from two independent browser sessions with your credentials before release. 64 browser layout checks passed at 320, 390, 768 and 1440 px across member pages, five game tables and all admin tabs, with no page-level horizontal overflow or JavaScript errors. Screenshots of the mobile game views and mobile/desktop administration overview were inspected. These checks use local fixture accounts and SQLite, not live Aiven/Cloudinary access.

The supplied schema initialization is for a fresh project database; it is not a general migration framework for unknown older releases. Password reset emails, email verification, tournaments, spectators and account-role management in the UI are outside this release.

Official setup references:
- https://aiven.io/docs/products/postgresql/howto/connect-node
- https://aiven.io/docs/platform/concepts/tls-ssl-certificates
- https://cloudinary.com/documentation/upload_images
- https://cloudinary.com/documentation/authentication_signatures

## Club fee and separate admin access

`/admin` has its own administrator-only sign-in form. Player accounts cannot use the admin login API or admin APIs. Admin login uses a separate HttpOnly session cookie with a two-hour expiry; player login uses a separate cookie. Signing out of the admin panel does not sign the player out. The panel supports user search, signed chip allocation/removal, bans, profile-name edits/photo clearing, session revocation, idle-seat removal, empty-table configuration, and hand/wallet/admin logs. No control reveals passwords or live private cards or rigs outcomes.

Each winning player's positive net hand profit is charged `floor(profit / 20)` virtual chips (5%). Own contributions and refunds are excluded; split/side-pot wins aggregate per user. Example: start 1,000, finish 1,300 before fee → fee 15, final stack 1,285. Profits below 20 chips produce zero fee. Net losing/break-even players pay no fee. Collection and hand settlement are in the same database transaction; a unique hand/user key and persisted settlement flag prevent duplicate collection. The club treasury is the all-time sum of `club_fees`, separate from personal admin wallets. It has no cash value or withdrawal function. Fee ledger rows describe a fee already included in hand_result; do not sum both as independent stack changes.

Two funded players trigger a ten-second countdown, including after every hand. Zero-stack seats sit out; leave and rejoin with a funded wallet to play. An additional Card Match memory game in the lobby is purely practice and has no chip stakes or rewards. Chip-to-pot and pot-to-winner animations respect motion settings.

Existing user balances are retained. Startup changes the PostgreSQL default to zero without resetting existing accounts, and adds an empty club_fees table. Historical hands are not charged retroactively. Back up an existing database before upgrading.

## Version 5: five multiplayer games

The original six Hold’em tables (IDs 1–6) remain. Startup adds Omaha (7), Teen Patti (8), Five-card Draw (9), and Blackjack tournament (10) without changing existing user balances or historical hands. Table type is persisted in the server game state. All types share the same wallet, transaction lock, chip conservation, 10-second countdown, 45-second timeout and 5% positive-net-profit commission. Every game has at most four real player seats; there are no bots. No purchase, deposit, withdrawal or redemption endpoints exist.

- Omaha: four private cards; exactly two hole plus three community cards; no-limit betting.
- Teen Patti: explicitly labeled **seen-hand showdown club variant**, with equal big-blind ante and one no-limit betting round. Trail > pure sequence > sequence > colour > pair > high card. AKQ > A23 > KQJ; suits do not break ties. Blind play and sideshow are not implemented.
- Five-card Draw: five private cards, blinds/first betting round, one exchange of zero to three cards, final betting round. Discards remain out of the deck and are not reshuffled into later draws. All-in players still draw. Timeout keeps all five cards.
- Blackjack: explicitly labeled **peer shared-pot tournament**, not standard house-dealer blackjack. Equal entry is min(big blind, lowest positive stack), pooled from players. Players hit/stand in sequence; nearest non-busted total to 21 wins. Two-card natural beats drawn 21. Equal scores split; all bust refunds entry. No dealer bank, split, double, insurance or 3:2 payout. Aces count as 1 or 11. Timeout stands.

The admin Overview shows all five game types, seated counts, table pause counts and lifetime virtual-chip fees. Tables can be paused/resumed; pausing blocks new seats and next-hand countdowns but lets active hands finish. Ban/unban, chip adjustments, profile moderation, idle-seat removal and session revocation are audited and require a reason. The server rechecks admin role inside write transactions. User cookies cannot access admin APIs. Admin login is additionally limited to eight attempts per IP per 15 minutes.

Verification: `npm test` runs 42 tests, including 360 randomized variant hands, rank selection, soft aces, draw validation, live HTTP multiplayer flows, fee replay protection, separate admin sessions and pause authorization. Local PostgreSQL SQL compatibility uses pg-mem; it does not prove live Aiven TLS, transaction concurrency or Cloudinary credentials. No system can be described as absolutely secure; operational access, credentials and database backups remain the operator’s responsibility.

Rule references used to inform the documented club variants:
- https://www.pokerstars.com/poker/games/omaha/
- https://teenpatti.octro.com/learn-teen-patti/

See `UPDATE-BN.md` for Bengali deployment and administration instructions.
