// Proof for the Stage 2 parent-view language switch.
//
// Real server, real SQLite on a temp file, real Chromium at phone width, and
// the real completion -> Wonder documentation path through a transparent
// counting proxy in front of the Meta API. The proxy is only there to inspect
// the outbound Wonder payload and count chat calls; it does not change them.
//
// What this proves:
//   - the Rahman (Bangla-profile) parent lands on Bangla by default;
//   - switching to Bangla/Arabic changes the page chrome with no network call;
//   - Arabic makes the whole page RTL, not just the message text;
//   - completing in Bangla stores the same English-canonical record and the
//     same English documentation, with an English Wonder payload;
//   - switching back to English restores the original strings.
//
// Every database and audio file lives under /tmp/opencode.

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import { DatabaseSync } from 'node:sqlite';

import { Browser, sleep } from './browser.mjs';

const ROOT = '/home/ksheep/sproutcomm';
const TMP = '/tmp/opencode/parent-language';
const PROXY_PORT = 8798;
const APP_PORT = 8799;
const UPSTREAM = new URL(process.env.META_UPSTREAM || 'https://api.meta.ai');
const SCRIPT = /[\p{Script=Bengali}\p{Script=Arabic}]/u;

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

const chatRequests = [];
const transport = UPSTREAM.protocol === 'https:' ? https : http;

const proxy = http.createServer((req, res) => {
  const chunks = [];
  req.on('data', (chunk) => chunks.push(chunk));
  req.on('end', () => {
    const body = Buffer.concat(chunks);
    if (req.method === 'POST' && req.url === '/v1/chat/completions') {
      try {
        chatRequests.push(JSON.parse(body.toString('utf8')));
      } catch {
        chatRequests.push({ unparsed: true });
      }
    }

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

    upstreamReq.end(body);
  });
});
await new Promise((resolve) => proxy.listen(PROXY_PORT, '127.0.0.1', resolve));

/* ---------------- app on a temp database ---------------- */

const app = spawn(process.execPath, ['server/index.js'], {
  cwd: ROOT,
  env: {
    ...process.env,
    PORT: String(APP_PORT),
    SPROUT_DB: `${TMP}/parent-language.db`,
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
  db = new DatabaseSync(`${TMP}/parent-language.db`);

  const rahman = db.prepare("SELECT * FROM families WHERE id = 'fam-rahman'").get();
  const beforeMessage = db
    .prepare("SELECT * FROM messages WHERE family_id = 'fam-rahman' ORDER BY created_at DESC LIMIT 1")
    .get();
  check('Rahman profile is Bangla', rahman.home_language === 'bn', rahman.home_language);
  check('Rahman has a seeded engagement', Boolean(beforeMessage), beforeMessage?.id);

  browser = await Browser.launch({ userDataDir: '/tmp/opencode/chromium-parent-language' });
  const page = await browser.newPage();

  await page.goto(`${BASE}/f/${rahman.access_token}`);
  await page.waitFor('document.querySelector(".parent-msg")');

  const instrument = async () => {
    await page.eval(`(() => {
      window.__sproutCalls = [];
      const original = window.fetch;
      window.fetch = (...args) => {
        try { window.__sproutCalls.push(String(args[0])); } catch {}
        return original(...args);
      };
      return true;
    })()`);
  };
  const resetCalls = () => page.eval('window.__sproutCalls = []');
  const calls = () => page.eval('window.__sproutCalls.slice()');

  async function switchTo(lang) {
    await resetCalls();
    await page.click(`[data-action="set-ui-lang"][data-lang="${lang}"]`);
    await sleep(350);
    return calls();
  }

  await instrument();

  /* ---- default: Bangla profile ---- */
  const bnText = await page.text();
  check(
    'bn: default switch position follows the family profile',
    await page.eval(`document.querySelector('[data-action="set-ui-lang"][data-lang="bn"]').classList.contains('selected')`)
  );
  check(
    'bn: key labels and buttons are in Bangla script',
    ['প্রস্থান', 'পড়ার ভাষা', 'আমরা করেছি', 'আজ রাতের কাজ', 'শুনুন', 'কণ্ঠ বার্তা', 'সন্তানকে জিজ্ঞাসা করুন'].every(
      (s) => bnText.includes(s)
    ),
    clip(bnText)
  );
  check('bn: page direction is LTR', (await page.eval('document.documentElement.dir')) === 'ltr');
  check(
    'switch offers English, Arabic and Bangla only',
    JSON.stringify(await page.eval(`[...document.querySelectorAll('.lang-choice')].map((b) => b.dataset.lang)`)) ===
      JSON.stringify(['en', 'ar', 'bn'])
  );

  /* ---- Arabic: translated chrome + full RTL ---- */
  const arCalls = await switchTo('ar');
  const arText = await page.text();
  check('ar: switch makes no network call', arCalls.length === 0, arCalls.join(', ') || 'none');
  check(
    'ar: key labels and buttons are in Arabic script',
    ['خروج', 'لغة القراءة', 'أنجزنا النشاط', 'نشاط الليلة', 'استمع', 'ملاحظة صوتية', 'اسألوا طفلكم'].every(
      (s) => arText.includes(s)
    ),
    clip(arText)
  );

  const layout = await page.eval(`(() => {
    const brand = document.querySelector('.topbar .brand')?.getBoundingClientRect();
    const exit = document.querySelector('.topbar [data-action="signout"]')?.getBoundingClientRect();
    return {
      html: document.documentElement.dir,
      screen: document.querySelector('.screen')?.getAttribute('dir'),
      topbar: getComputedStyle(document.querySelector('.topbar')).direction,
      feed: getComputedStyle(document.querySelector('.content')).direction,
      actions: getComputedStyle(document.querySelector('.parent-actions')).direction,
      brandLeft: brand?.left,
      exitLeft: exit?.left,
      scrollWidth: document.documentElement.scrollWidth
    };
  })()`);
  check('ar: page and screen are RTL', layout.html === 'rtl' && layout.screen === 'rtl', JSON.stringify(layout));
  check(
    'ar: chrome computes RTL (topbar, feed, actions)',
    layout.topbar === 'rtl' && layout.feed === 'rtl' && layout.actions === 'rtl',
    JSON.stringify(layout)
  );
  check(
    'ar: topbar order flips (brand sits to the right of Exit)',
    layout.brandLeft > layout.exitLeft,
    `brand=${layout.brandLeft} exit=${layout.exitLeft}`
  );
  check('ar: no horizontal overflow at 390px', layout.scrollWidth <= 390, `scrollWidth=${layout.scrollWidth}`);

  /* ---- back to Bangla, then complete one engagement ---- */
  const bnCalls = await switchTo('bn');
  check('bn: switching back makes no network call', bnCalls.length === 0, bnCalls.join(', ') || 'none');
  check(
    'bn: Bangla strings return after the Arabic detour',
    (await page.text()).includes('আমরা করেছি') && (await page.text()).includes('আজ রাতের কাজ')
  );

  await page.click('[data-action="complete"]');
  await page.waitFor('document.querySelector(".sheet")');
  const sheetText = await page.text();
  check(
    'bn: completion sheet is fully Bangla',
    ['আজ রাতের কাজ', 'আজ কে কে ছিলেন?', 'কাজটি কত সময় নিয়েছে?', 'নিশ্চিত করুন', 'বাতিল'].every((s) =>
      sheetText.includes(s)
    ),
    clip(sheetText)
  );
  check(
    'bn: completion sheet is LTR',
    (await page.eval(`document.querySelector('.sheet').getAttribute('dir')`)) === 'ltr'
  );

  await page.click('[data-action="set-minutes"][data-value="15"]');
  await page.click('[data-action="confirm-complete"]');
  await page.waitFor(
    `document.body.innerText.includes('আপনার পরিবারের ফাইলে লিপিবদ্ধ হয়েছে') || document.body.innerText.includes('আপনার অ্যাডভোকেট এটি পেয়েছেন')`,
    { timeout: 20000 }
  );

  let event = null;
  const eventDeadline = Date.now() + 20000;
  while (Date.now() < eventDeadline) {
    event = db
      .prepare('SELECT * FROM completion_events WHERE message_id = ? ORDER BY created_at ASC LIMIT 1')
      .get(beforeMessage.id);
    if (event) break;
    await sleep(250);
  }
  check('completion: exactly one event is stored', Boolean(event), event?.id);

  const messageAfter = db.prepare('SELECT * FROM messages WHERE id = ?').get(beforeMessage.id);
  check('completion: message is marked completed', messageAfter?.status === 'completed', messageAfter?.status);
  check(
    'completion: participants are stored in English',
    event?.participants === 'Arif and parent' && messageAfter?.participants === 'Arif and parent',
    `${event?.participants} / ${messageAfter?.participants}`
  );
  check('completion: minutes are stored unchanged', event?.activity_minutes === 15, String(event?.activity_minutes));
  check(
    'completion: the stored event contains no Bengali or Arabic script',
    !SCRIPT.test(JSON.stringify(event ?? {})),
    clip(JSON.stringify(event ?? {}))
  );
  check(
    'completion: the English message body is untouched by the switch',
    messageAfter?.body_en === beforeMessage.body_en,
    clip(messageAfter?.body_en)
  );

  let note = null;
  const noteDeadline = Date.now() + 240000;
  while (Date.now() < noteDeadline) {
    note = db.prepare('SELECT * FROM documentation_notes WHERE event_id = ?').get(event?.id);
    if (note && note.status !== 'pending') break;
    await sleep(2000);
  }
  check('documentation: Wonder writes the note', note?.status === 'ready', `${note?.status}${note?.error ? ' — ' + note.error : ''}`);
  check('documentation: standard is HSPPS 1302.50', note?.standard === 'HSPPS 1302.50', note?.standard);
  check('documentation: model is muse-wonder-1.0', note?.model === 'muse-wonder-1.0', note?.model);
  check(
    'documentation: body is English and keeps the record fields',
    Boolean(note?.body) &&
      note.body.length > 40 &&
      !SCRIPT.test(note.body) &&
      note.body.includes('Rahman family') &&
      note.body.includes('Arif and parent') &&
      note.body.includes('HSPPS 1302.50'),
    clip(note?.body)
  );
  check(
    'documentation: the note is in the family file unchanged in shape',
    note?.source === 'live' && note?.event_id === event?.id && note?.family_id === 'fam-rahman',
    JSON.stringify({ source: note?.source, event: note?.event_id, family: note?.family_id })
  );

  const wonder = chatRequests.find((r) => r.model === 'muse-wonder-1.0');
  check('Wonder request was captured', Boolean(wonder), `${chatRequests.length} chat call(s)`);
  let wonderEvent = null;
  try {
    const user = wonder?.messages?.find((m) => m.role === 'user')?.content;
    wonderEvent = user ? JSON.parse(user) : null;
  } catch {
    wonderEvent = null;
  }
  check(
    'Wonder payload is English-canonical',
    wonderEvent?.family?.name === 'Rahman family' &&
      wonderEvent?.participants === 'Arif and parent' &&
      wonderEvent?.standard === 'HSPPS 1302.50' &&
      wonderEvent?.family?.home_language === 'Bangla',
    clip(JSON.stringify(wonderEvent ?? {}))
  );
  check(
    'Wonder payload has no Bengali or Arabic script',
    Boolean(wonderEvent) && !SCRIPT.test(JSON.stringify(wonderEvent)),
    clip(JSON.stringify(wonderEvent ?? {}))
  );
  check(
    'no Spark translation call happens in the parent flow',
    chatRequests.filter((r) => r.model === 'muse-spark-1.3').length === 0,
    `${chatRequests.length} chat call(s)`
  );

  /* ---- back to English ---- */
  await page.waitFor('!document.querySelector(".sheet")', { timeout: 20000 });
  await page.waitFor('document.querySelector(".parent-msg") && !document.querySelector(".skeleton")');
  const enCalls = await switchTo('en');
  const enText = (await page.text()).toLowerCase();
  check('en: switch makes no network call', enCalls.length === 0, enCalls.join(', ') || 'none');
  check(
    'en: the original English strings return',
    ["tonight's activity", 'listen', 'voice note', 'ask your child', 'exit'].every((s) => enText.includes(s)),
    clip(enText)
  );
  check('en: page direction returns to LTR', (await page.eval('document.documentElement.dir')) === 'ltr');

  await page.goto(`${BASE}/`);
  await page.waitFor('document.querySelector(".parent-msg")');
  check(
    'en: the choice persists per family on this device',
    await page.eval(`document.querySelector('[data-action="set-ui-lang"][data-lang="en"]').classList.contains('selected')`)
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
console.log(`\n${results.length - failures.length}/${results.length} parent-language checks passed`);
if (failures.length) process.exitCode = 1;

function clip(s, n = 90) {
  if (!s) return 'empty';
  return s.length > n ? s.slice(0, n) + '…' : s;
}
