-- Fourth & Down — Full Database Schema
-- All tables created upfront for all 8 phases

-- ============================================
-- Core: Players, Sessions, Devices
-- ============================================

CREATE TABLE IF NOT EXISTS players (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#3b82f6',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL DEFAULT (date('now')),
  scene_mode TEXT,
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  ended_at TEXT
);

CREATE TABLE IF NOT EXISTS session_players (
  session_id INTEGER NOT NULL REFERENCES sessions(id),
  player_id INTEGER NOT NULL REFERENCES players(id),
  joined_at TEXT NOT NULL DEFAULT (datetime('now')),
  left_at TEXT,
  PRIMARY KEY (session_id, player_id)
);

-- ============================================
-- Drink Tracking (Universal)
-- ============================================

CREATE TABLE IF NOT EXISTS drinks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id INTEGER NOT NULL REFERENCES players(id),
  session_id INTEGER REFERENCES sessions(id),
  drink_type TEXT NOT NULL CHECK (drink_type IN ('rocks_glass', 'beer', 'pellegrino')),
  timestamp TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================
-- Darts
-- ============================================

CREATE TABLE IF NOT EXISTS dart_games (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER REFERENCES sessions(id),
  game_type TEXT NOT NULL,
  game_code TEXT,
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  ended_at TEXT,
  winner_id INTEGER REFERENCES players(id)
);

CREATE TABLE IF NOT EXISTS dart_game_players (
  game_id INTEGER NOT NULL REFERENCES dart_games(id),
  player_id INTEGER NOT NULL REFERENCES players(id),
  team_id INTEGER,
  final_score INTEGER,
  PRIMARY KEY (game_id, player_id)
);

CREATE TABLE IF NOT EXISTS dart_shots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id INTEGER NOT NULL REFERENCES dart_games(id),
  player_id INTEGER NOT NULL REFERENCES players(id),
  turn_number INTEGER NOT NULL,
  dart_number INTEGER NOT NULL CHECK (dart_number BETWEEN 1 AND 3),
  segment INTEGER NOT NULL,
  multiplier INTEGER NOT NULL DEFAULT 1 CHECK (multiplier BETWEEN 1 AND 3),
  score INTEGER NOT NULL,
  timestamp TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================
-- Trivia
-- ============================================

CREATE TABLE IF NOT EXISTS trivia_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER REFERENCES sessions(id),
  round_structure TEXT,
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  ended_at TEXT
);

CREATE TABLE IF NOT EXISTS trivia_questions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL,
  external_id TEXT,
  question TEXT NOT NULL,
  correct_answer TEXT NOT NULL,
  wrong_answers TEXT NOT NULL DEFAULT '[]',
  category TEXT,
  stated_difficulty TEXT,
  times_served INTEGER NOT NULL DEFAULT 0,
  times_correct INTEGER NOT NULL DEFAULT 0,
  rating_up INTEGER NOT NULL DEFAULT 0,
  rating_down INTEGER NOT NULL DEFAULT 0,
  retired INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS trivia_answers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  trivia_session_id INTEGER NOT NULL REFERENCES trivia_sessions(id),
  question_id INTEGER NOT NULL REFERENCES trivia_questions(id),
  player_id INTEGER NOT NULL REFERENCES players(id),
  answer TEXT,
  correct INTEGER NOT NULL DEFAULT 0,
  response_time_ms INTEGER,
  timestamp TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS trivia_player_sounds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  trivia_session_id INTEGER NOT NULL REFERENCES trivia_sessions(id),
  player_id INTEGER NOT NULL REFERENCES players(id),
  color TEXT NOT NULL,
  sound_file TEXT NOT NULL
);

-- ============================================
-- Catch Phrase
-- ============================================

CREATE TABLE IF NOT EXISTS catchphrase_words (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  word TEXT NOT NULL,
  category TEXT,
  difficulty TEXT,
  times_served INTEGER NOT NULL DEFAULT 0,
  rating_up INTEGER NOT NULL DEFAULT 0,
  rating_down INTEGER NOT NULL DEFAULT 0,
  retired INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS catchphrase_rounds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER REFERENCES sessions(id),
  describer_player_id INTEGER REFERENCES players(id),
  team_id INTEGER,
  word_id INTEGER REFERENCES catchphrase_words(id),
  guessed INTEGER NOT NULL DEFAULT 0,
  time_to_guess_ms INTEGER
);

-- ============================================
-- Blackjack
-- ============================================

CREATE TABLE IF NOT EXISTS blackjack_hands (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER REFERENCES sessions(id),
  player_id INTEGER NOT NULL REFERENCES players(id),
  result TEXT NOT NULL CHECK (result IN ('win', 'loss', 'push', 'blackjack', 'bust')),
  timestamp TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================
-- Pool
-- ============================================

CREATE TABLE IF NOT EXISTS pool_games (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER REFERENCES sessions(id),
  winner_id INTEGER NOT NULL REFERENCES players(id),
  loser_id INTEGER REFERENCES players(id),
  breaker_id INTEGER REFERENCES players(id),
  solids_player_id INTEGER REFERENCES players(id),
  balls_remaining INTEGER DEFAULT 0,
  timestamp TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================
-- Poker
-- ============================================

CREATE TABLE IF NOT EXISTS poker_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER REFERENCES sessions(id),
  game_type TEXT NOT NULL DEFAULT 'cash',
  chip_set TEXT NOT NULL DEFAULT 'monte_carlo',
  buy_in_amount INTEGER NOT NULL DEFAULT 20,
  blind_structure TEXT NOT NULL DEFAULT '[]',
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  ended_at TEXT
);

CREATE TABLE IF NOT EXISTS poker_players (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  poker_session_id INTEGER NOT NULL REFERENCES poker_sessions(id),
  player_id INTEGER NOT NULL REFERENCES players(id),
  total_buy_in INTEGER NOT NULL DEFAULT 0,
  cash_out INTEGER,
  hands_won INTEGER NOT NULL DEFAULT 0
);

-- ============================================
-- Cribbage
-- ============================================

CREATE TABLE IF NOT EXISTS cribbage_games (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER REFERENCES sessions(id),
  player1_id INTEGER NOT NULL REFERENCES players(id),
  player2_id INTEGER NOT NULL REFERENCES players(id),
  winner_id INTEGER REFERENCES players(id),
  final_scores TEXT NOT NULL DEFAULT '{}',
  timestamp TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================
-- Dice Games
-- ============================================

CREATE TABLE IF NOT EXISTS dice_games (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER REFERENCES sessions(id),
  game_type TEXT NOT NULL,
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  ended_at TEXT,
  winner_id INTEGER REFERENCES players(id)
);

CREATE TABLE IF NOT EXISTS dice_game_players (
  game_id INTEGER NOT NULL REFERENCES dice_games(id),
  player_id INTEGER NOT NULL REFERENCES players(id),
  final_score INTEGER,
  PRIMARY KEY (game_id, player_id)
);

-- ============================================
-- Dominoes
-- ============================================

CREATE TABLE IF NOT EXISTS domino_games (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER REFERENCES sessions(id),
  game_type TEXT NOT NULL DEFAULT 'block',
  winner_id INTEGER REFERENCES players(id),
  timestamp TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================
-- Bar / Old Fashioned Lab
-- ============================================

CREATE TABLE IF NOT EXISTS bar_inventory (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_type TEXT NOT NULL CHECK (item_type IN ('spirit', 'bitters', 'sweetener', 'garnish', 'premixed')),
  brand TEXT,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'full' CHECK (status IN ('full', 'open', 'low', 'empty')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS cocktail_builds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id INTEGER REFERENCES players(id),
  session_id INTEGER REFERENCES sessions(id),
  base_spirit_id INTEGER REFERENCES bar_inventory(id),
  bitters TEXT NOT NULL DEFAULT '[]',
  sweetener_id INTEGER REFERENCES bar_inventory(id),
  rating INTEGER CHECK (rating BETWEEN 1 AND 5),
  timestamp TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================
-- Teams & DJ
-- ============================================

CREATE TABLE IF NOT EXISTS teams (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  player1_id INTEGER NOT NULL REFERENCES players(id),
  player2_id INTEGER NOT NULL REFERENCES players(id)
);

CREATE TABLE IF NOT EXISTS team_stats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  team_id INTEGER NOT NULL REFERENCES teams(id),
  game_type TEXT NOT NULL,
  games_played INTEGER NOT NULL DEFAULT 0,
  games_won INTEGER NOT NULL DEFAULT 0,
  synergy_score REAL NOT NULL DEFAULT 0
);

-- ============================================
-- Scenes & Devices
-- ============================================

CREATE TABLE IF NOT EXISTS scenes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL DEFAULT 'custom',
  config TEXT NOT NULL DEFAULT '{}',
  audio_file TEXT
);

CREATE TABLE IF NOT EXISTS device_config (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  device_type TEXT NOT NULL CHECK (device_type IN ('hue', 'nanoleaf', 'onkyo', 'projector', 'lutron')),
  name TEXT NOT NULL,
  ip TEXT NOT NULL,
  auth_token TEXT,
  extra_config TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS light_zone_mapping (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  light_id TEXT NOT NULL,
  device_type TEXT NOT NULL,
  zone TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS dj_config (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  game_type TEXT NOT NULL UNIQUE,
  enabled INTEGER NOT NULL DEFAULT 1,
  min_players INTEGER NOT NULL DEFAULT 2,
  max_players INTEGER
);

CREATE TABLE IF NOT EXISTS admin_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- ============================================
-- Migrations — add columns to existing tables
-- ============================================

-- Pool: add loser_id, solids_player_id, balls_remaining if missing
-- SQLite doesn't support IF NOT EXISTS on ALTER TABLE, so we catch errors in code
