// Proof for the voice-reply language fix.
//
// Real path: the app's real HTTP upload, real ffmpeg normalization, real Meta
// ASR, and real Spark translation. A transparent local proxy sits in front of
// the real Meta API only to count /v1/chat/completions calls, which proves an
// English transcript makes no translation call.
//
// Both families are the English-profile Brooks family. The German fixture is
// a prepared 16 kHz WAV; the English fixture goes through the identical path.
// Every database and audio file lives under /tmp/opencode.

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import { DatabaseSync } from 'node:sqlite';

import { Browser, sleep } from './browser.mjs';

const ROOT = '/home/ksheep/sproutcomm';
const TMP = '/tmp/opencode/voice-language';
const PROXY_PORT = 8795;
const APP_PORT = 8796;
const UPSTREAM = new URL(process.env.META_UPSTREAM || 'https://api.meta.ai');

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
      if (res.ok) return res.json();
    } catch {}
    await sleep(200);
  }
  throw new Error(`server on ${port} did not start`);
}

/* ---------------- transparent counting proxy ---------------- */

let chatCalls = 0;
const transport = UPSTREAM.protocol === 'https:' ? https : http;

const proxy = http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/v1/chat/completions') chatCalls++;

  const upstreamReq = transport.request(
    {
      protocol: UPSTREAM.protocol,
      hostname: UPSTREAM.hostname,
      port: UPSTREAM.port || undefined,
      method: req.method,
      path: req.url,
      headers: { ...req.headers, host: UPSTREAM.host }
    },
    (upstreamRes) => {
      res.writeHead(upstreamRes.statusCode, upstreamRes.headers);
      upstreamRes.pipe(res);
    }
  );

  upstreamReq.on('error', (err) => {
    if (!res.headersSent) res.writeHead(502, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: { message: `proxy error: ${err.message}` } }));
  });

  req.pipe(upstreamReq);
});
await new Promise((resolve) => proxy.listen(PROXY_PORT, '127.0.0.1', resolve));

/* ---------------- app on a temp database ---------------- */

const app = spawn(process.execPath, ['server/index.js'], {
  cwd: ROOT,
  env: {
    ...process.env,
    PORT: String(APP_PORT),
    SPROUT_DB: `${TMP}/voice-language.db`,
    SPROUT_AUDIO_DIR: `${TMP}/audio`,
    META_BASE_URL: `http://127.0.0.1:${PROXY_PORT}`
  },
  stdio: ['ignore', 'pipe', 'pipe']
});
app.stdout.on('data', () => {});
app.stderr.on('data', (d) => console.error('[test-server]', String(d).trim()));

let db;
let browser;

try {
  const health = await waitForServer(APP_PORT);
  check('test server has a live Meta key', health.ai_configured === true);
  if (!health.ai_configured) throw new Error('META_API_KEY is required for the real-path proof');

  const BASE = `http://127.0.0.1:${APP_PORT}`;
  db = new DatabaseSync(`${TMP}/voice-language.db`);

  const brooks = db.prepare("SELECT * FROM families WHERE id = 'fam-brooks'").get();
  const message = db
    .prepare("SELECT * FROM messages WHERE family_id = 'fam-brooks' ORDER BY created_at DESC LIMIT 1")
    .get();
  const parent = await post(`${BASE}/api/session`, { role: 'parent', token: brooks.access_token });
  const advocate = await post(`${BASE}/api/session`, { role: 'advocate', passcode: '1111' });

  check('Brooks family profile is English', brooks.home_language === 'en', brooks.home_language);
  check('parent session is pinned to Brooks', parent.family.id === 'fam-brooks', parent.family.family_name);

  async function upload(fixture, clientId) {
    const form = new FormData();
    form.append('message_id', message.id);
    form.append('client_id', clientId);
    form.append(
      'audio',
      new Blob([fs.readFileSync(`${ROOT}/tools/fixtures/${fixture}`)], { type: 'audio/wav' }),
      fixture
    );
    const callsBefore = chatCalls;
    const res = await fetch(`${BASE}/api/parent/voice-notes`, {
      method: 'POST',
      headers: { authorization: `Bearer ${parent.token}` },
      body: form
    });
    const body = await res.json();
    if (!res.ok) throw new Error(`upload failed: ${res.status} ${JSON.stringify(body)}`);

    let note = null;
    const deadline = Date.now() + 90000;
    while (Date.now() < deadline) {
      note = db.prepare('SELECT * FROM voice_notes WHERE id = ?').get(body.id);
      if (note && note.status !== 'transcribing') break;
      await sleep(500);
    }
    if (!note) throw new Error('voice note disappeared');
    return { note, calls: chatCalls - callsBefore };
  }

  async function inboxNote(id) {
    const inbox = await get(`${BASE}/api/inbox`, advocate.token);
    return inbox.notes.find((n) => n.id === id) ?? null;
  }

  /* ---- non-English transcript on an English-profile family ---- */
  const german = await upload('voice-de.wav', 'voice-language-de-1');
  check('German fixture reaches ready', german.note.status === 'ready', german.note.status);
  check(
    'original transcript stays German',
    /(wir|haben|heute|zusammen|treppe|gezählt)/i.test(german.note.transcript || ''),
    clip(german.note.transcript)
  );
  check('detected language is surfaced as de', german.note.transcript_lang === 'de', String(german.note.transcript_lang));
  check(
    'advocate English rendering is English',
    Boolean(german.note.transcript_en) &&
      german.note.transcript_en !== german.note.transcript &&
      /counted|stairs|together/i.test(german.note.transcript_en) &&
      !/[äöüß]/i.test(german.note.transcript_en),
    clip(german.note.transcript_en)
  );
  check('German transcript used exactly one translation call', german.calls === 1, `${german.calls} chat call(s)`);

  const germanInbox = await inboxNote(german.note.id);
  check('advocate inbox carries the English rendering', germanInbox?.transcript_en === german.note.transcript_en,
    clip(germanInbox?.transcript_en));
  check('advocate inbox still carries the original transcript', germanInbox?.transcript === german.note.transcript);

  /* ---- English transcript on the same family ---- */
  const english = await upload('voice-en.wav', 'voice-language-en-1');
  check('English fixture reaches ready', english.note.status === 'ready', english.note.status);
  check(
    'English transcript is unchanged in transcript_en',
    english.note.transcript_en === english.note.transcript,
    clip(english.note.transcript_en)
  );
  check('detected language is surfaced as en', english.note.transcript_lang === 'en', String(english.note.transcript_lang));
  check('English transcript made no translation call', english.calls === 0, `${english.calls} chat call(s)`);

  const englishInbox = await inboxNote(english.note.id);
  check('English note passes through the advocate inbox unchanged', englishInbox?.transcript_en === englishInbox?.transcript);

  /* ---- the advocate screen itself renders the English rendering ---- */
  browser = await Browser.launch();
  const page = await browser.newPage();
  await page.goto(BASE);
  await page.waitFor('document.body.innerText.includes("Program staff")');
  await page.clickText('Program staff');
  await page.fill('#adv-pin', '1111');
  await page.submit('form[data-form="advocate-login"]');
  await page.waitFor('document.body.innerText.includes("Family replies")', { timeout: 15000 });
  const screenText = await page.text();
  check(
    'advocate screen shows the English rendering of the German reply',
    screenText.includes(german.note.transcript_en.slice(0, 24)),
    clip(german.note.transcript_en)
  );
  check(
    'advocate screen labels the original by detected language',
    screenText.includes('Original (DE)'),
    'Original (DE)'
  );
} catch (err) {
  check('test completed without an exception', false, err.message);
} finally {
  if (browser) await browser.close();
  if (db) db.close();
  app.kill('SIGTERM');
  proxy.close();
  fs.rmSync(TMP, { recursive: true, force: true });
}

const failures = results.filter((r) => !r.ok);
console.log(`\n${results.length - failures.length}/${results.length} voice-reply language checks passed`);
if (failures.length) process.exitCode = 1;

async function post(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`${url} returned ${res.status}`);
  return res.json();
}

async function get(url, token) {
  const res = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`${url} returned ${res.status}`);
  return res.json();
}

function clip(s, n = 70) {
  if (!s) return 'empty';
  return s.length > n ? s.slice(0, n) + '…' : s;
}
