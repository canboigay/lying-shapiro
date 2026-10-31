-- Server-side request log: one row per HTML page / API hit (static assets are skipped).
CREATE TABLE IF NOT EXISTS requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts INTEGER NOT NULL,
  day TEXT NOT NULL,
  host TEXT,
  path TEXT,
  query TEXT,
  method TEXT,
  status INTEGER,
  country TEXT,
  region TEXT,
  city TEXT,
  colo TEXT,
  asn INTEGER,
  as_org TEXT,
  browser TEXT,
  os TEXT,
  device TEXT,
  is_bot INTEGER DEFAULT 0,
  bot_name TEXT,
  ref_host TEXT,
  referrer TEXT,
  vhash TEXT,
  ms INTEGER
);
CREATE INDEX IF NOT EXISTS idx_req_day ON requests(day);
CREATE INDEX IF NOT EXISTS idx_req_ts ON requests(ts);

-- Client-side events sent by app.js beacons.
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts INTEGER NOT NULL,
  day TEXT NOT NULL,
  sid TEXT,
  vhash TEXT,
  type TEXT NOT NULL,
  path TEXT,
  item TEXT,
  label TEXT,
  props TEXT,
  country TEXT,
  device TEXT,
  ref_host TEXT,
  vw INTEGER
);
CREATE INDEX IF NOT EXISTS idx_ev_day ON events(day);
CREATE INDEX IF NOT EXISTS idx_ev_type ON events(type, day);
CREATE INDEX IF NOT EXISTS idx_ev_ts ON events(ts);
