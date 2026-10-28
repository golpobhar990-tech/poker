
CREATE TABLE IF NOT EXISTS users (
 id BIGSERIAL PRIMARY KEY, username TEXT UNIQUE NOT NULL,
 email TEXT UNIQUE NOT NULL, name TEXT NOT NULL,
 password_hash TEXT NOT NULL, avatar TEXT, chips BIGINT NOT NULL DEFAULT 0 CHECK(chips>=0),
 settings TEXT NOT NULL DEFAULT '{"sound":true,"motion":true}',
 role TEXT NOT NULL DEFAULT 'player', banned BIGINT NOT NULL DEFAULT 0,
 created_at BIGINT NOT NULL, deleted_at BIGINT
);
CREATE TABLE IF NOT EXISTS sessions (
 token_hash TEXT PRIMARY KEY, user_id BIGINT NOT NULL REFERENCES users(id),
 csrf TEXT NOT NULL, expires_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS session_expiry ON sessions(expires_at);
CREATE TABLE IF NOT EXISTS poker_tables (
 id BIGSERIAL PRIMARY KEY, name TEXT NOT NULL, small_blind BIGINT NOT NULL,
 big_blind BIGINT NOT NULL, buy_in BIGINT NOT NULL, state TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS seats (
 user_id BIGINT PRIMARY KEY REFERENCES users(id), table_id BIGINT NOT NULL REFERENCES poker_tables(id),
 last_seen BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS ledger (
 id BIGSERIAL PRIMARY KEY, user_id BIGINT NOT NULL REFERENCES users(id),
 kind TEXT NOT NULL, amount BIGINT NOT NULL, balance_after BIGINT NOT NULL,
 reference TEXT, created_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS ledger_user ON ledger(user_id,id);
CREATE TABLE IF NOT EXISTS operations (
 user_id BIGINT NOT NULL REFERENCES users(id), request_key TEXT NOT NULL,
 route TEXT NOT NULL, body_hash TEXT NOT NULL, response TEXT NOT NULL, created_at BIGINT NOT NULL,
 PRIMARY KEY(user_id,request_key)
);
CREATE TABLE IF NOT EXISTS hands (
 id BIGSERIAL PRIMARY KEY, table_id BIGINT NOT NULL, hand_no BIGINT NOT NULL,
 board TEXT NOT NULL, result TEXT NOT NULL, created_at BIGINT NOT NULL,
 UNIQUE(table_id,hand_no)
);
CREATE TABLE IF NOT EXISTS hand_players (
 hand_id BIGINT NOT NULL REFERENCES hands(id),user_id BIGINT NOT NULL REFERENCES users(id),
 net BIGINT NOT NULL, PRIMARY KEY(hand_id,user_id)
);
CREATE TABLE IF NOT EXISTS rate_limits (
 key TEXT PRIMARY KEY, count BIGINT NOT NULL, reset_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS admin_audit (
 id BIGSERIAL PRIMARY KEY, admin_id BIGINT NOT NULL REFERENCES users(id),
 action TEXT NOT NULL, target TEXT NOT NULL, details TEXT NOT NULL, created_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS club_fees (hand_id BIGINT NOT NULL REFERENCES hands(id), user_id BIGINT NOT NULL REFERENCES users(id), amount BIGINT NOT NULL CHECK(amount>0), created_at BIGINT NOT NULL, PRIMARY KEY(hand_id,user_id));
ALTER TABLE users ALTER COLUMN chips SET DEFAULT 0;
