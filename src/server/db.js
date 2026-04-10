import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const db = new Database(path.join(__dirname, '../../game.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE,
    password TEXT,
    alias TEXT,
    photoURL TEXT,
    stats TEXT
  );

  CREATE TABLE IF NOT EXISTS games (
    id TEXT PRIMARY KEY,
    joinCode TEXT,
    status TEXT,
    state TEXT
  );
`);

export function getUser(id) {
  const row = db.prepare('SELECT id, username, alias, photoURL, stats FROM users WHERE id = ?').get(id);
  if (row) {
    return { ...row, stats: JSON.parse(row.stats) };
  }
  return null;
}

export function getUserByUsername(username) {
  return db.prepare('SELECT * FROM users WHERE username = ?').get(username);
}

export function saveUser(user) {
  if (user.password) {
    db.prepare(`
      INSERT INTO users (id, username, password, alias, photoURL, stats)
      VALUES (@id, @username, @password, @alias, @photoURL, @stats)
      ON CONFLICT(id) DO UPDATE SET
        alias = excluded.alias,
        photoURL = excluded.photoURL,
        stats = excluded.stats
    `).run({
      id: user.id,
      username: user.username,
      password: user.password,
      alias: user.alias,
      photoURL: user.photoURL || '',
      stats: JSON.stringify(user.stats || {
        wins: 0, losses: 0, gamesPlayed: 0,
        totalGoldSpent: 0, totalGoldEarned: 0, totalTilesClaimed: 0
      })
    });
  } else {
    db.prepare(`
      UPDATE users SET
        alias = @alias,
        photoURL = @photoURL,
        stats = @stats
      WHERE id = @id
    `).run({
      id: user.id,
      alias: user.alias,
      photoURL: user.photoURL || '',
      stats: JSON.stringify(user.stats)
    });
  }
}

export function getGame(id) {
  const row = db.prepare('SELECT * FROM games WHERE id = ?').get(id);
  if (row) {
    return JSON.parse(row.state);
  }
  return null;
}

export function getGameByJoinCode(joinCode) {
  const row = db.prepare('SELECT * FROM games WHERE joinCode = ? AND status = ?').get(joinCode, 'lobby');
  if (row) {
    return JSON.parse(row.state);
  }
  return null;
}

export function saveGame(state) {
  db.prepare(`
    INSERT INTO games (id, joinCode, status, state)
    VALUES (@id, @joinCode, @status, @state)
    ON CONFLICT(id) DO UPDATE SET
      joinCode = excluded.joinCode,
      status = excluded.status,
      state = excluded.state
  `).run({
    id: state.id,
    joinCode: state.joinCode || null,
    status: state.status,
    state: JSON.stringify(state)
  });
}
