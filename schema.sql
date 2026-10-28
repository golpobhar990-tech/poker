PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS users (
 id INTEGER PRIMARY KEY, username TEXT UNIQUE NOT NULL COLLATE NOCASE,
 email TEXT UNIQUE NOT NULL COLLATE NOCASE, name TEXT NOT NULL,
 password_hash TEXT NOT NULL, avatar TEXT, chips INTEGER NOT NULL DEFAULT 5000 CHECK(chips>=0),
 settings TEXT NOT NULL DEFAULT '{"sound":true,"motion":true}',
 role TEXT NOT NULL DEFAULT 'player', banned INTEGER NOT NULL DEFAULT 0,
 created_at INTEGER NOT NULL, deleted_at INTEGER
);
CREATE TABLE IF NOT EXISTS sessions (
 token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id),
 csrf TEXT NOT NULL, expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS session_expiry ON sessions(expires_at);
CREATE TABLE IF NOT EXISTS poker_tables (
 id INTEGER PRIMARY KEY, name TEXT NOT NULL, small_blind INTEGER NOT NULL,
 big_blind INTEGER NOT NULL, buy_in INTEGER NOT NULL, state TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS seats (
 user_id INTEGER PRIMARY KEY REFERENCES users(id), table_id INTEGER NOT NULL REFERENCES poker_tables(id),
 last_seen INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS ledger (
 id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id),
 kind TEXT NOT NULL, amount INTEGER NOT NULL, balance_after INTEGER NOT NULL,
 reference TEXT, created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ledger_user ON ledger(user_id,id);
CREATE TABLE IF NOT EXISTS operations (
 user_id INTEGER NOT NULL REFERENCES users(id), request_key TEXT NOT NULL,
 route TEXT NOT NULL, body_hash TEXT NOT NULL, response TEXT NOT NULL, created_at INTEGER NOT NULL,
 PRIMARY KEY(user_id,request_key)
);
CREATE TABLE IF NOT EXISTS hands (
 id INTEGER PRIMARY KEY, table_id INTEGER NOT NULL, hand_no INTEGER NOT NULL,
 board TEXT NOT NULL, result TEXT NOT NULL, created_at INTEGER NOT NULL,
 UNIQUE(table_id,hand_no)
);
CREATE TABLE IF NOT EXISTS hand_players (
 hand_id INTEGER NOT NULL REFERENCES hands(id),user_id INTEGER NOT NULL REFERENCES users(id),
 net INTEGER NOT NULL, PRIMARY KEY(hand_id,user_id)
);
CREATE TABLE IF NOT EXISTS rate_limits (
 key TEXT PRIMARY KEY, count INTEGER NOT NULL, reset_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS admin_audit (
 id INTEGER PRIMARY KEY, admin_id INTEGER NOT NULL REFERENCES users(id),
 action TEXT NOT NULL, target TEXT NOT NULL, details TEXT NOT NULL, created_at INTEGER NOT NULL
);
