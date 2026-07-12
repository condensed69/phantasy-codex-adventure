CREATE TABLE IF NOT EXISTS run_sessions (
  id TEXT PRIMARY KEY,
  seed INTEGER NOT NULL,
  started_at INTEGER NOT NULL,
  consumed_at INTEGER
) STRICT;

CREATE TABLE IF NOT EXISTS leaderboard_runs (
  id TEXT PRIMARY KEY,
  player_name TEXT NOT NULL CHECK(length(player_name) BETWEEN 2 AND 16),
  level INTEGER NOT NULL CHECK(level BETWEEN 1 AND 99),
  total_xp INTEGER NOT NULL CHECK(total_xp BETWEEN 0 AND 10000000),
  weapon TEXT NOT NULL CHECK(weapon IN ('sword', 'spear', 'wand')),
  seed INTEGER NOT NULL,
  duration_seconds INTEGER NOT NULL,
  submitted_at INTEGER NOT NULL
) STRICT;

CREATE INDEX IF NOT EXISTS leaderboard_rank
ON leaderboard_runs(total_xp DESC, level DESC, duration_seconds ASC, submitted_at ASC);

CREATE INDEX IF NOT EXISTS run_sessions_cleanup
ON run_sessions(started_at);
