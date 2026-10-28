// SQLite storage for the slice. One file, no ORM.

import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { config } from './config.js';

fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });
fs.mkdirSync(config.audioDir, { recursive: true });

export const db = new DatabaseSync(config.dbPath);

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS families (
    id            TEXT PRIMARY KEY,
    family_name   TEXT NOT NULL,
    child_name    TEXT NOT NULL,
    child_age     INTEGER NOT NULL,
    home_language TEXT NOT NULL,          -- ar | bn | en | syl
    access_token  TEXT,                   -- parent front door: /f/<token>
    created_at    TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS activities (
    id           TEXT PRIMARY KEY,
    title_en     TEXT NOT NULL,
    domain       TEXT NOT NULL,
    scope_ref    TEXT NOT NULL,
    steps_en     TEXT NOT NULL,           -- JSON array
    prompt_en    TEXT NOT NULL,
    minutes      INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS messages (
    id           TEXT PRIMARY KEY,
    family_id    TEXT NOT NULL REFERENCES families(id),
    activity_id  TEXT NOT NULL REFERENCES activities(id),
    body_en      TEXT NOT NULL,
    status       TEXT NOT NULL,           -- sending | sent | completed | failed
    participants TEXT,
    completed_at TEXT,
    created_at   TEXT NOT NULL,
    source       TEXT NOT NULL DEFAULT 'live'  -- live | seed
  );

  CREATE TABLE IF NOT EXISTS message_translations (
    id              TEXT PRIMARY KEY,
    message_id      TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    lang            TEXT NOT NULL,
    body            TEXT NOT NULL,
    activity_title  TEXT NOT NULL,
    activity_steps  TEXT NOT NULL,        -- JSON array
    activity_prompt TEXT NOT NULL,
    audio_url       TEXT,
    source          TEXT NOT NULL,        -- live | seed | pending
    created_at      TEXT NOT NULL,
    UNIQUE (message_id, lang)
  );

  CREATE TABLE IF NOT EXISTS activity_translations (
    activity_id TEXT NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
    lang        TEXT NOT NULL,
    title       TEXT NOT NULL,
    steps       TEXT NOT NULL,            -- JSON array
    prompt      TEXT NOT NULL,
    source      TEXT NOT NULL,            -- live | seed
    created_at  TEXT NOT NULL,
    PRIMARY KEY (activity_id, lang)
  );

  CREATE TABLE IF NOT EXISTS voice_notes (
    id            TEXT PRIMARY KEY,
    client_id     TEXT,                   -- idempotency key from the parent device
    message_id    TEXT REFERENCES messages(id) ON DELETE SET NULL,
    family_id     TEXT NOT NULL REFERENCES families(id),
    audio_path    TEXT,
    lang          TEXT NOT NULL,
    duration_ms   INTEGER,
    transcript    TEXT,
    transcript_en TEXT,
    status        TEXT NOT NULL,          -- received | transcribing | ready | failed
    error         TEXT,
    created_at    TEXT NOT NULL
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_voice_notes_client
    ON voice_notes (client_id) WHERE client_id IS NOT NULL;

  CREATE TABLE IF NOT EXISTS completion_events (
    id               TEXT PRIMARY KEY,
    client_id        TEXT,                -- idempotency key from the parent device
    message_id       TEXT NOT NULL REFERENCES messages(id),
    family_id        TEXT NOT NULL REFERENCES families(id),
    participants     TEXT NOT NULL,
    activity_minutes INTEGER,
    occurred_at      TEXT NOT NULL,
    created_at       TEXT NOT NULL
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_completion_events_client
    ON completion_events (client_id) WHERE client_id IS NOT NULL;

  CREATE TABLE IF NOT EXISTS documentation_notes (
    id         TEXT PRIMARY KEY,
    family_id  TEXT NOT NULL REFERENCES families(id),
    message_id TEXT REFERENCES messages(id),
    event_id   TEXT REFERENCES completion_events(id),
    standard   TEXT NOT NULL,
    body       TEXT NOT NULL,
    model      TEXT NOT NULL,
    source     TEXT NOT NULL,             -- live | seed
    status     TEXT NOT NULL DEFAULT 'ready',  -- pending | ready | failed
    error      TEXT,
    created_at TEXT NOT NULL
  );
`);

export function one(sql, ...params) {
  return db.prepare(sql).get(...params) ?? null;
}

export function all(sql, ...params) {
  return db.prepare(sql).all(...params);
}

export function run(sql, ...params) {
  return db.prepare(sql).run(...params);
}

export function transaction(fn) {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

/**
 * Every family has an unguessable access token. The parent front door is
 * /f/<token>: possession of the link is the parent's credential, and the
 * session it creates is pinned to that one family.
 */
export function ensureFamilyTokens() {
  const columns = db.prepare('PRAGMA table_info(families)').all();
  if (!columns.some((c) => c.name === 'access_token')) {
    db.exec('ALTER TABLE families ADD COLUMN access_token TEXT');
  }
  const missing = db.prepare('SELECT id FROM families WHERE access_token IS NULL OR access_token = \'\'').all();
  const update = db.prepare('UPDATE families SET access_token = ? WHERE id = ?');
  for (const row of missing) update.run(randomBytes(16).toString('base64url'), row.id);
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_families_token ON families (access_token)');
}

export function ensureDocumentationColumns() {
  const columns = db.prepare('PRAGMA table_info(documentation_notes)').all();
  if (!columns.some((c) => c.name === 'status')) {
    db.exec("ALTER TABLE documentation_notes ADD COLUMN status TEXT NOT NULL DEFAULT 'ready'");
  }
  if (!columns.some((c) => c.name === 'error')) {
    db.exec('ALTER TABLE documentation_notes ADD COLUMN error TEXT');
  }
}

/**
 * A note that is still 'pending' at boot was interrupted by a restart. Mark it
 * failed so the family file never shows an empty document as final.
 */
export function failOrphanedNotes() {
  const result = db
    .prepare(
      "UPDATE documentation_notes SET status = 'failed', error = ? WHERE status = 'pending'"
    )
    .run('Documentation generation was interrupted. The completion is recorded.');
  return result.changes ?? 0;
}

export function isSeeded() {
  return (one('SELECT COUNT(*) AS n FROM families')?.n ?? 0) > 0;
}
