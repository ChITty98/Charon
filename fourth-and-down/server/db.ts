import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync, mkdirSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));

const DATA_DIR = join(__dirname, '..', 'data');
if (!existsSync(DATA_DIR)) {
  mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = join(DATA_DIR, 'fourth-and-down.db');

const db = new Database(DB_PATH);

// Enable WAL mode for better concurrent read performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Run schema
const schema = readFileSync(join(__dirname, 'schema.sql'), 'utf-8');
db.exec(schema);

// Seed default admin config if not exists
const seedDefaults = db.transaction(() => {
  const existing = db.prepare('SELECT key FROM admin_config WHERE key = ?').get('pin');
  if (!existing) {
    // Default PIN: 1234 (stored as plain text — low-security local app)
    db.prepare('INSERT INTO admin_config (key, value) VALUES (?, ?)').run('pin', '1234');
  }

  // Seed default bar inventory
  const invCount = db.prepare('SELECT COUNT(*) as c FROM bar_inventory').get() as { c: number };
  if (invCount.c === 0) {
    const items = [
      ['spirit', "Maker's Mark", "Maker's Mark", 'full'],
      ['spirit', "Maker's Mark", "Private Selection Fireside Spice", 'full'],
      ['spirit', 'Knob Creek', 'Knob Creek Bourbon', 'full'],
      ['spirit', 'Bulleit', 'Bulleit Bourbon', 'full'],
      ['spirit', "Michter's", "Michter's Rye", 'full'],
      ['spirit', 'Jameson', 'Black Barrel', 'full'],
      ['spirit', null, 'Vodka', 'full'],
      ['premixed', 'Tattersall', 'Old Fashioned (70 proof)', 'full'],
      ['bitters', 'Angostura', 'Aromatic Bitters', 'full'],
      ['bitters', 'Watkins', 'Aromatic Bitters', 'full'],
      ['bitters', 'Dashfire', 'Old Fashioned Bitters', 'full'],
      ['bitters', 'Fee Brothers', 'Old Fashion Aromatic', 'full'],
      ['bitters', 'Angostura', 'Orange Bitters', 'full'],
      ['bitters', 'Watkins', 'Orange Bitters', 'full'],
      ['bitters', 'Tattersall', 'Bitter Orange Liqueur', 'full'],
      ['sweetener', null, 'Sugar', 'full'],
      ['sweetener', null, 'Simple Syrup', 'full'],
      ['sweetener', null, 'Demerara Syrup', 'full'],
      ['sweetener', null, 'Maple Syrup', 'full'],
      ['sweetener', 'Stone Water', 'Old Fashioned Mix', 'full'],
      ['garnish', null, 'Cherries', 'full'],
      ['garnish', null, 'Cherry Juice', 'full'],
    ];
    const insert = db.prepare('INSERT INTO bar_inventory (item_type, brand, name, status) VALUES (?, ?, ?, ?)');
    for (const item of items) {
      insert.run(...item);
    }
  }

  // Seed built-in scenes
  const sceneCount = db.prepare('SELECT COUNT(*) as c FROM scenes').get() as { c: number };
  if (sceneCount.c === 0) {
    const scenes = [
      ['Family Movie Night', 'builtin', JSON.stringify({
        theater_lights: { brightness: 10, color: '#ff8c00' },
        rec_room_lights: { power: false },
        nanoleaf: { power: false },
        onkyo: { power: true, input: 'appletv', volume: 35 },
      })],
      ['John Wick Mode', 'builtin', JSON.stringify({
        sequence: true,
        steps: [
          { type: 'audio', file: 'thx-deep-note.mp3', delay: 0 },
          { type: 'lights', target: 'all', brightness: 100, transition: 0, delay: 0 },
          { type: 'lights', target: 'all', brightness: 0, transition: 8000, delay: 2000 },
          { type: 'nanoleaf', effect: 'pulse', color: '#ff0000', delay: 3000 },
          { type: 'nanoleaf', color: '#330000', brightness: 30, delay: 8000 },
          { type: 'lights', target: 'theater_bias', brightness: 20, color: '#ff4400', delay: 10000 },
          { type: 'onkyo', power: true, input: 'appletv', volume: 42, delay: 1000 },
        ],
      })],
      ['Party Mode', 'builtin', JSON.stringify({
        rec_room_lights: { brightness: 80, color: '#ff00ff' },
        bar_lights: { brightness: 60, color: '#ff8800' },
        pool_lights: { brightness: 100 },
        nanoleaf: { power: true, effect: 'Fireworks' },
        mode: 'party',
      })],
      ['Bar Mode', 'builtin', JSON.stringify({
        rec_room_lights: { brightness: 30, color: '#ff6600' },
        bar_lights: { brightness: 40, color: '#ff8800' },
        nanoleaf: { power: true, effect: 'Northern Lights', brightness: 40 },
      })],
    ];
    const insert = db.prepare('INSERT INTO scenes (name, type, config) VALUES (?, ?, ?)');
    for (const scene of scenes) {
      insert.run(...scene);
    }
  }

  // Seed DJ config
  const djCount = db.prepare('SELECT COUNT(*) as c FROM dj_config').get() as { c: number };
  if (djCount.c === 0) {
    const games = [
      ['darts', 1, 2, 8],
      ['trivia', 1, 2, null],
      ['catchphrase', 1, 4, null],
      ['blackjack', 1, 1, 7],
      ['pool', 1, 2, 2],
      ['farkle', 1, 2, 6],
      ['yahtzee', 1, 1, 6],
      ['ship_captain_crew', 1, 2, 6],
    ];
    const insert = db.prepare('INSERT INTO dj_config (game_type, enabled, min_players, max_players) VALUES (?, ?, ?, ?)');
    for (const g of games) {
      insert.run(...g);
    }
  }
});
seedDefaults();

export default db;
