CREATE TABLE IF NOT EXISTS cms_records (
  collection TEXT NOT NULL,
  id TEXT NOT NULL,
  data TEXT NOT NULL CHECK(json_valid(data) AND length(data) <= 1000000),
  PRIMARY KEY (collection, id)
);
CREATE TABLE IF NOT EXISTS cms_state (
  id INTEGER PRIMARY KEY CHECK(id = 1),
  revision INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 0,
  imported_at TEXT,
  import_hash TEXT,
  updated_at TEXT
);
INSERT OR IGNORE INTO cms_state(id) VALUES(1);
