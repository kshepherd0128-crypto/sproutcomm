// Stage 5 gate: offline parent view + outbound queue, verified by actually
// cutting the network in a real Chromium at 390x844.
//
// Runs against a TEMP database and a dedicated port. The live database and
// its rehearsal rows are never touched.

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { Browser, sleep } from './browser.mjs';

const ROOT = '/home/ksheep/sproutcomm';
const OUT = `${ROOT}/artifacts`;
const TMP = '/tmp/opencode/stage5';
const DB = `${TMP}/offline.db`;
const PORT = 8793;
const AUDIO = '/tmp/opencode/ar_30.wav';

fs.rmSync(TMP, { recursive: true, force: true });
fs.mkdirSync(TMP, { recursive: true });
fs.mkdirSync(OUT, { recursive: true });

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
};

const app = spawn('node', ['server/index.js'], {
  cwd: ROOT,
  env: { ...process.env, PORT: String(PORT), SPROUT_DB: DB },
  stdio: ['ignore', 'pipe', 'pipe']
});
app.stdout.on('data', () => {});
app.stderr.on('data', (d) => console.error('[test-server]', String(d).trim()));

const BASE = `http://127.0.0.1:${PORT}`;
for (let i = 0; i < 100; i++) {
  try {
    if ((await fetch(`${BASE}/health`)).ok) break;
  } catch {}
  await sleep(200);
}

const db = new DatabaseSync(DB);
const family = db.prepare("SELECT * FROM families WHERE id = 'fam-haddad'").get();
const LINK = `${BASE}/f/${family.access_token}`;

const browser = await Browser.launch();
const page = await browser.newPage();

async function outboxItems() {
  return page.eval(`new Promise((resolve) => {
    const open = indexedDB.open('sproutcomm-offline', 1);
    open.onupgradeneeded = () => {
      if (!open.result.objectStoreNames.contains('outbox')) open.result.createObjectStore('outbox', { keyPath: 'id' });
    };
    open.onsuccess = () => {
      const db = open.result;
      if (!db.objectStoreNames.contains('outbox')) return resolve([]);
      const tx = db.transaction('outbox', 'readonly');
      const req = tx.objectStore('outbox').getAll();
      req.onsuccess = () => resolve(req.result.map((i) => ({ id: i.id, type: i.type })));
      req.onerror = () => resolve([]);
    };
    open.onerror = () => resolve([]);
  })`);
}

try {
  /* ---------------- online: load and cache ---------------- */
  await page.goto(LINK);
  await page.waitFor('document.querySelector(".parent-msg")');
  await page.waitFor('navigator.serviceWorker && navigator.serviceWorker.ready.then(() => true)');
  let controlled = await page.eval('Boolean(navigator.serviceWorker.controller)');
  if (!controlled) {
    await page.goto(LINK);
    await page.waitFor('document.querySelector(".parent-msg")');
    controlled = await page.eval('Boolean(navigator.serviceWorker.controller)');
  }
  check('service worker controls the parent page', controlled === true);

  const cached = await page.eval(`Object.keys(localStorage).filter((k) => k.startsWith('sproutcomm.feed.')).length`);
  check('feed is cached on the device', cached > 0, `${cached} cache entries`);
  await page.screenshot(`${OUT}/stage5-online.png`);

  /* ---------------- offline: reload from cache ---------------- */
  await page.setOffline(true);
  const apiFails = await page.eval(`fetch('/api/parent/feed').then(() => false).catch(() => true)`);
  check('network is actually cut', apiFails === true);

  await page.goto(LINK);
  await page.waitFor('document.querySelector(".parent-msg")', { timeout: 20000 });
  await page.screenshot(`${OUT}/stage5-offline-cached.png`);
  const offlineText = await page.text();
  check('cached message renders with no connection', offlineText.includes('Haddad family'));
  check('offline state is visible to the parent', /offline|لا يوجد اتصال/i.test(offlineText));

  /* ---------------- queue a voice note offline ---------------- */
  await page.click('[data-action="record"]');
  await page.waitFor('document.querySelector(".sheet")');
  await page.setFile('input[data-role="audio-file"]', AUDIO);
  await page.waitFor('document.querySelector(".sheet audio")');
  await page.click('[data-action="send-record"]');
  await page.waitFor('document.querySelector(".sheet .done-card")', { timeout: 15000 });
  const queuedVoiceText = await page.text();
  check('voice note queues instead of failing', /will be sent|سيُرسل|পাঠানো হবে/i.test(queuedVoiceText));
  await page.screenshot(`${OUT}/stage5-queued-voice.png`);

  /* ---------------- queue a completion offline ---------------- */
  await page.waitFor('document.querySelector(".sheet") === null', { timeout: 8000 });
  await page.click('[data-action="complete"]');
  await page.waitFor('document.querySelector(".sheet")');
  await page.click('[data-action="set-participants"][data-value="parent_child"]');
  await page.click('[data-action="confirm-complete"]');
  await page.waitFor('document.querySelector(".sheet .done-card")', { timeout: 15000 });
  const queuedCompleteText = await page.text();
  check('completion queues instead of failing', /will be sent|سيُرسل|পাঠানো হবে/i.test(queuedCompleteText));
  await page.screenshot(`${OUT}/stage5-queued-complete.png`);

  await page.waitFor('document.querySelector(".sheet") === null', { timeout: 8000 });
  const queued = await outboxItems();
  check('both actions sit in the local outbox', queued.length === 2, JSON.stringify(queued.map((q) => q.type)));
  const completionItem = queued.find((q) => q.type === 'complete');
  const voiceItem = queued.find((q) => q.type === 'voice-note');

  const feedText = await page.text();
  check('queued state is visible in the feed', /waiting to send|في انتظار الإرسال/i.test(feedText));
  await page.screenshot(`${OUT}/stage5-offline-feed.png`);

  /* ---------------- the queue survives a reload ---------------- */
  await page.goto(LINK);
  await page.waitFor('document.querySelector(".parent-msg")', { timeout: 20000 });
  await sleep(800);
  const afterReload = await outboxItems();
  check('outbox survives an offline reload', afterReload.length === 2, `${afterReload.length} items`);

  /* ---------------- reconnect: flush ---------------- */
  await page.setOffline(false);
  await page.eval(`window.dispatchEvent(new Event('online'))`);

  let flushed = null;
  const deadline = Date.now() + 90000;
  while (Date.now() < deadline) {
    flushed = await outboxItems();
    if (flushed.length === 0) break;
    await sleep(1500);
  }
  check('outbox flushes on reconnect', flushed.length === 0, `${flushed.length} left`);

  // server state after the flush
  let event = db.prepare('SELECT * FROM completion_events WHERE message_id = ?').get(
    db.prepare("SELECT id FROM messages WHERE family_id = 'fam-haddad' ORDER BY created_at DESC LIMIT 1").get().id
  );
  let note = event ? db.prepare('SELECT * FROM documentation_notes WHERE event_id = ?').get(event.id) : null;
  let voice = db.prepare("SELECT * FROM voice_notes WHERE family_id = 'fam-haddad' ORDER BY created_at DESC LIMIT 1").get();

  check('server received the completion', Boolean(event), event?.participants);
  check('server received the voice note', Boolean(voice) && voice.status !== 'failed', voice?.status);

  // wait for ASR + Wonder
  const settle = Date.now() + 120000;
  while (Date.now() < settle) {
    voice = db.prepare("SELECT * FROM voice_notes WHERE family_id = 'fam-haddad' ORDER BY created_at DESC LIMIT 1").get();
    note = event ? db.prepare('SELECT * FROM documentation_notes WHERE event_id = ?').get(event.id) : null;
    if (voice.status === 'ready' && note && note.status !== 'pending') break;
    await sleep(2000);
  }
  check('queued voice note transcribes after flush', voice.status === 'ready', voice.status);
  check('voice transcript is the family language', /\p{Script=Arabic}/u.test(voice.transcript || ''), (voice.transcript || '').slice(0, 40));
  check('queued completion produces a documentation note', note && note.status === 'ready', note?.status);

  // UI catches up with the server
  await page.waitFor('document.body.innerText.includes("Haddad")', { timeout: 15000 });
  await sleep(2500);
  await page.screenshot(`${OUT}/stage5-reconnected.png`);
  const finalText = await page.text();
  check('feed no longer shows a pending queue', !/waiting to send|في انتظار الإرسال/i.test(finalText));
  check('feed shows the completed state from the server',
    await page.eval('Boolean(document.querySelector(".done-card"))'));

  /* ---------------- idempotency across the flush ---------------- */
  const tokenRow = db.prepare("SELECT access_token FROM families WHERE id = 'fam-haddad'").get();
  const parentSession = await (await fetch(`${BASE}/api/session`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ role: 'parent', token: tokenRow.access_token })
  })).json();
  const feed = await (await fetch(`${BASE}/api/parent/feed`, {
    headers: { authorization: `Bearer ${parentSession.token}` }
  })).json();
  const replay = await (await fetch(`${BASE}/api/parent/complete`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${parentSession.token}` },
    body: JSON.stringify({
      message_id: feed.message.id,
      participants: 'parent_child',
      activity_minutes: 10,
      client_id: completionItem.id
    })
  })).json();
  const events = db.prepare('SELECT COUNT(*) AS n FROM completion_events WHERE message_id = ?').get(feed.message.id).n;
  check('replaying the queued completion is idempotent', replay.event.id === event.id && events === 1,
    `${events} event(s)`);

  const form = new FormData();
  form.append('audio', new Blob([fs.readFileSync(AUDIO)], { type: 'audio/wav' }), 'note.wav');
  form.append('message_id', feed.message.id);
  form.append('client_id', voiceItem.id);
  const replayVoice = await (await fetch(`${BASE}/api/parent/voice-notes`, {
    method: 'POST',
    headers: { authorization: `Bearer ${parentSession.token}` },
    body: form
  })).json();
  const voices = db.prepare("SELECT COUNT(*) AS n FROM voice_notes WHERE family_id = 'fam-haddad'").get().n;
  check('replaying the queued voice note is idempotent', replayVoice.duplicate === true && voices === 1,
    `${voices} note(s)`);

  const failures = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failures.length}/${results.length} offline checks passed`);
  if (failures.length) process.exitCode = 1;
} finally {
  await browser.close();
  app.kill('SIGTERM');
  db.close();
}
