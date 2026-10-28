// Part 2 hardening evidence. All work happens on temp databases; the live
// database is never touched or reseeded.
//
// A. engagementEvent carries the family's ready voice reply.
// B. Empty Wonder output becomes a failed note, never a stored empty note.
// C. A pending note orphaned by a restart is marked failed at boot.
// D. The family file refuses to render a "ready" note with no text.
//
// B/C/D use a local upstream that returns an empty completion, because the
// only way to force that condition is to control the upstream response.

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { Browser, sleep } from './browser.mjs';

const ROOT = '/home/ksheep/sproutcomm';
const TMP = '/tmp/opencode/hardening';
fs.rmSync(TMP, { recursive: true, force: true });
fs.mkdirSync(TMP, { recursive: true });

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
};

async function waitForServer(port, timeout = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/health`);
      if (res.ok) return;
    } catch {}
    await sleep(200);
  }
  throw new Error(`server on ${port} did not start`);
}

/* ---------------- A: voice reply in the Wonder payload ---------------- */

process.env.SPROUT_DB = `${TMP}/payload.db`;
process.env.META_API_KEY = 'hardening-test-key';
const dbPath = process.env.SPROUT_DB;

const { seedIfEmpty } = await import('../server/seed.js');
const { db } = await import('../server/db.js');
seedIfEmpty();

const msg = db.prepare(
  `SELECT m.* FROM messages m JOIN families f ON f.id = m.family_id
    WHERE f.id = 'fam-rahman' LIMIT 1`
).get();

db.prepare(
  `INSERT INTO voice_notes
     (id, message_id, family_id, lang, duration_ms, transcript, transcript_en, status, created_at)
   VALUES (?, ?, ?, 'bn', 9000, ?, ?, 'ready', ?)`
).run(
  'voice-hardening-1',
  msg.id,
  'fam-rahman',
  'আমরা আজ সিঁড়িতে একসঙ্গে গুনেছি, আরিফ নিজেই শেষ তিনটি ধাপ গুনেছে।',
  'We counted on the stairs together today, and Arif counted the last three steps himself.',
  new Date().toISOString()
);

db.prepare(
  `INSERT INTO completion_events
     (id, message_id, family_id, participants, activity_minutes, occurred_at, created_at)
   VALUES (?, ?, ?, ?, ?, ?, ?)`
).run('event-hardening-1', msg.id, 'fam-rahman', 'Arif and parent', 9, new Date().toISOString(), new Date().toISOString());

const { buildEngagementEvent } = await import('../server/store.js');
const payload = buildEngagementEvent(db.prepare('SELECT * FROM completion_events WHERE id = ?').get('event-hardening-1'));

check('payload carries the voice reply as family_voice_reply',
  payload.family_voice_reply ===
    'We counted on the stairs together today, and Arif counted the last three steps himself.',
  String(payload.family_voice_reply));
check('payload still carries only stored facts', Object.keys(payload).sort().join(',') ===
  'activity,activity_minutes,advocate_message_sent_at,completed_at,family,family_voice_reply,participants,standard',
  Object.keys(payload).join(','));

/* ---------------- B/C/D: empty Wonder, orphan, rendering ---------------- */

let upstreamContent = '   ';
const emptyUpstream = http.createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ choices: [{ message: { content: upstreamContent } }] }));
});
await new Promise((r) => emptyUpstream.listen(8790, '127.0.0.1', r));

const APP_PORT = 8791;
const app = spawn('node', ['server/index.js'], {
  cwd: ROOT,
  env: {
    ...process.env,
    PORT: String(APP_PORT),
    SPROUT_DB: `${TMP}/empty.db`,
    META_BASE_URL: 'http://127.0.0.1:8790',
    META_API_KEY: 'hardening-test-key'
  },
  stdio: ['ignore', 'pipe', 'pipe']
});
app.stdout.on('data', () => {});
app.stderr.on('data', (d) => console.error('[test-server]', String(d).trim()));
await waitForServer(APP_PORT);

const BASE = `http://127.0.0.1:${APP_PORT}`;
const adv = await (await fetch(`${BASE}/api/session`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ role: 'advocate', passcode: '1111' })
})).json();

const openDb = new DatabaseSync(`${TMP}/empty.db`);
const haddad = openDb.prepare("SELECT * FROM families WHERE id = 'fam-haddad'").get();
const parent = await (await fetch(`${BASE}/api/session`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ role: 'parent', token: haddad.access_token })
})).json();
const feed = await (await fetch(`${BASE}/api/parent/feed`, {
  headers: { authorization: `Bearer ${parent.token}` }
})).json();

const completion = await (await fetch(`${BASE}/api/parent/complete`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', authorization: `Bearer ${parent.token}` },
  body: JSON.stringify({
    message_id: feed.message.id,
    participants: 'parent_child',
    activity_minutes: 10,
    client_id: 'empty-wonder-1'
  })
})).json();

let note = null;
const deadline = Date.now() + 30000;
while (Date.now() < deadline) {
  note = openDb.prepare('SELECT * FROM documentation_notes WHERE event_id = ?').get(completion.event.id);
  if (note.status !== 'pending') break;
  await sleep(500);
}

check('empty Wonder output is a failure, not an empty note', note.status === 'failed', note.status);
check('failure stores no body text', !note.body || note.body.trim() === '', JSON.stringify(note.body));
check('failure keeps an honest reason', /no usable text|empty completion/i.test(note.error || ''), note.error);
check('the completion still stands', openDb.prepare(
  'SELECT status, completed_at FROM messages WHERE id = ?'
).get(feed.message.id).status === 'completed');

// A short, non-empty body is also not a usable note.
upstreamContent = 'OK';
const rahman = openDb.prepare("SELECT * FROM families WHERE id = 'fam-rahman'").get();
const rahmanParent = await (await fetch(`${BASE}/api/session`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ role: 'parent', token: rahman.access_token })
})).json();
const rahmanFeed = await (await fetch(`${BASE}/api/parent/feed`, {
  headers: { authorization: `Bearer ${rahmanParent.token}` }
})).json();
const shortCompletion = await (await fetch(`${BASE}/api/parent/complete`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', authorization: `Bearer ${rahmanParent.token}` },
  body: JSON.stringify({
    message_id: rahmanFeed.message.id,
    participants: 'whole_family',
    activity_minutes: 8,
    client_id: 'short-wonder-1'
  })
})).json();

let shortNote = null;
const shortDeadline = Date.now() + 30000;
while (Date.now() < shortDeadline) {
  shortNote = openDb.prepare('SELECT * FROM documentation_notes WHERE event_id = ?').get(shortCompletion.event.id);
  if (shortNote.status !== 'pending') break;
  await sleep(500);
}
check('a too-short Wonder body is also refused', shortNote.status === 'failed' && /no usable text/i.test(shortNote.error || ''),
  `${shortNote.status}: ${shortNote.error}`);

const detail = await (await fetch(`${BASE}/api/families/fam-haddad`, {
  headers: { authorization: `Bearer ${adv.token}` }
})).json();
check('API never returns a body for a failed note', detail.notes[0].body === null || detail.notes[0].body === '');

// D: force the old bad state (ready + empty) and check the UI refuses it.
openDb.prepare("UPDATE documentation_notes SET status = 'ready', body = '' WHERE event_id = ?").run(completion.event.id);

const browser = await Browser.launch();
const page = await browser.newPage();
await page.goto(BASE);
await page.clickText('Program staff');
await page.fill('#adv-pin', '1111');
await page.submit('form[data-form="advocate-login"]');
await page.waitFor('document.body.innerText.includes("Send an engagement")');
await page.eval(`document.querySelector('[data-action="open-family"][data-family="fam-haddad"]').click()`);
await page.waitFor('document.body.innerText.includes("Documentation file")');
await sleep(500);

const emptyBodies = await page.eval('document.querySelectorAll(".note-body").length');
const fileText = await page.text();
check('family file does not render an empty note', emptyBodies === 0, `${emptyBodies} .note-body nodes`);
check('family file shows the honest failure instead', /could not be generated/i.test(fileText));
await page.screenshot('/home/ksheep/sproutcomm/artifacts/part2-empty-note-guard.png');
await browser.close();

// C: orphaned pending note is failed at boot.
openDb.prepare("UPDATE documentation_notes SET status = 'pending', body = '', error = NULL WHERE event_id = ?").run(completion.event.id);
const old = new Date(Date.now() - 60 * 60 * 1000).toISOString();
openDb.prepare('UPDATE documentation_notes SET created_at = ? WHERE event_id = ?').run(old, completion.event.id);
openDb.close();

app.kill('SIGTERM');
await sleep(800);
const app2 = spawn('node', ['server/index.js'], {
  cwd: ROOT,
  env: { ...process.env, PORT: String(APP_PORT), SPROUT_DB: `${TMP}/empty.db`, META_BASE_URL: 'http://127.0.0.1:8790', META_API_KEY: 'hardening-test-key' },
  stdio: ['ignore', 'pipe', 'pipe']
});
app2.stdout.on('data', () => {});
app2.stderr.on('data', () => {});
await waitForServer(APP_PORT);
await sleep(300);

const recheck = new DatabaseSync(`${TMP}/empty.db`);
const orphan = recheck.prepare('SELECT status, error FROM documentation_notes WHERE event_id = ?').get(completion.event.id);
check('interrupted pending note is failed at boot', orphan.status === 'failed', orphan.status);
check('interrupted note explains itself', /interrupted/i.test(orphan.error || ''), orphan.error);
recheck.close();

app2.kill('SIGTERM');
emptyUpstream.close();

const failures = results.filter((r) => !r.ok);
console.log(`\n${results.length - failures.length}/${results.length} hardening checks passed`);
if (failures.length) process.exitCode = 1;
