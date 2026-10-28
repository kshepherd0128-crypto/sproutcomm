// Stage 2 gate: live Spark translation on send, in the real browser at 390px.
//
// With META_API_KEY set this exercises the real Meta API end to end.
// Without a key it verifies stub-mode honesty instead: no fake translation,
// a visible offline banner, and a send that stops before delivery.

import { Browser, sleep } from './browser.mjs';
import fs from 'node:fs';

const BASE = process.env.BASE_URL || 'http://localhost:8787';
const OUT = '/home/ksheep/sproutcomm/artifacts';
fs.mkdirSync(OUT, { recursive: true });

const health = await (await fetch(`${BASE}/health`)).json();
const LIVE = Boolean(health.ai_configured);
console.log(`AI configured: ${LIVE ? 'yes — live Meta API checks' : 'no — stub-mode honesty checks'}\n`);

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
};

const browser = await Browser.launch();
const page = await browser.newPage();

async function loginAdvocate() {
  await page.goto(BASE);
  await page.eval('sessionStorage.clear()');
  await page.goto(BASE);
  await page.waitFor('document.body.innerText.includes("Program staff")');
  await page.clickText('Program staff');
  await page.fill('#adv-pin', '1111');
  await page.submit('form[data-form="advocate-login"]');
  await page.waitFor('document.body.innerText.includes("Send an engagement")');
}

async function pick(family, activity) {
  await page.eval(`(() => {
    const f = document.querySelector('[name=family_id]');
    f.value = ${JSON.stringify(family)};
    f.dispatchEvent(new Event('change', { bubbles: true }));
    const a = document.querySelector('[name=activity_id]');
    a.value = ${JSON.stringify(activity)};
    a.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
  await sleep(250);
}

async function apiGet(path) {
  return page.eval(`(async () => {
    const s = JSON.parse(sessionStorage.getItem('sproutcomm.session') || '{}');
    const res = await fetch(${JSON.stringify(path)}, { headers: { authorization: 'Bearer ' + s.token } });
    return await res.json();
  })()`);
}

async function sendMessage(text) {
  await page.eval(`(() => {
    const t = document.querySelector('[name=body_en]');
    t.value = ${JSON.stringify(text)};
    t.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  const started = Date.now();
  await page.submit('form[data-form="compose"]');
  await page.waitFor(
    `Boolean(document.querySelector('.compose-preview')) || Boolean(document.querySelector('.notice.error'))`,
    { timeout: LIVE ? 90000 : 20000 }
  );
  return Date.now() - started;
}

try {
  await loginAdvocate();

  if (!LIVE) {
    /* ---------------- stub-mode honesty ---------------- */
    await pick('fam-haddad', 'act-dinner-questions');
    await sleep(500);
    const before = await apiGet('/api/families/fam-haddad');
    const text = await page.text();
    check('offline banner is visible', /Translation is offline/i.test(text));
    check('offline banner names the missing key', text.includes('META_API_KEY'));
    const disabled = await page.eval(`document.querySelector('form[data-form=compose] button[type=submit]').disabled`);
    check('send is blocked for a language that needs translation', disabled === true);
    await page.screenshot(`${OUT}/stage2-stub-banner.png`);

    // Force the submit anyway: the server must refuse, not invent a translation.
    await page.eval(`document.querySelector('form[data-form=compose]').requestSubmit()`);
    await sleep(1200);
    const after = await page.text();
    check('forced send surfaces the real error', /META_API_KEY is not set/.test(after));
    const afterCount = await apiGet('/api/families/fam-haddad');
    check(
      'no message is stored when translation is impossible',
      afterCount.messages.length === before.messages.length,
      `${before.messages.length} -> ${afterCount.messages.length}`
    );
    await page.screenshot(`${OUT}/stage2-stub-error.png`);

    const failures = results.filter((r) => !r.ok);
    console.log(`\n${results.length - failures.length}/${results.length} checks passed`);
    console.log('LIVE TRANSLATION: BLOCKED — no META_API_KEY on this server. Stage 2 live acceptance cannot be claimed.');
    if (failures.length) process.exitCode = 1;
    process.exit(0);
  }

  /* ---------------- live translation ---------------- */
  const cases = [
    {
      family: 'fam-haddad',
      activity: 'act-picture-walk',
      lang: 'ar',
      script: /\p{Script=Arabic}/u,
      body:
        'Good evening, Haddad family! On Thursday at 6:30 PM, sit together and do a picture walk with Layla. Ask her what she notices on each page, then let her tell the story back to you. Reply with a voice note and tell me how it went.'
    },
    {
      family: 'fam-rahman',
      activity: 'act-kitchen-letters',
      lang: 'bn',
      script: /\p{Script=Bengali}/u,
      body:
        'Good evening, Rahman family! On Friday at 5:00 PM, look for letters in the kitchen with Arif. Say the letter name and its sound together, then let him trace the letter with his finger. Send me a voice note and tell me how it went.'
    }
  ];

  for (const c of cases) {
    await loginAdvocate();
    await pick(c.family, c.activity);
    await sleep(300);
    const elapsed = await sendMessage(c.body);
    await page.screenshot(`${OUT}/stage2-sent-${c.lang}.png`);

    const detail = await apiGet(`/api/families/${c.family}`);
    const latest = detail.messages[0];
    const home = latest?.body_home ?? '';
    check(`${c.lang}: message stored`, Boolean(latest), latest ? fmt(latest.created_at) : 'missing');
    check(`${c.lang}: translation is in the target script`, c.script.test(home), clip(home));
    check(`${c.lang}: translation differs from English`, home.trim() !== latest?.body_en?.trim());
    check(`${c.lang}: translation is not empty and not an error string`, home.length > 20, `${home.length} chars`);
    check(`${c.lang}: send round trip under 30s`, elapsed < 30000, `${elapsed}ms`);
    console.log(`      ${c.lang} translation: ${home}`);

    // parent view through the token link, in the same browser
    const link = detail.family.access_path;
    await page.goto(BASE + link);
    await page.waitFor('document.querySelector(".parent-msg")');
    await page.screenshot(`${OUT}/stage2-parent-${c.lang}.png`);
    const parentBody = await page.eval(`document.querySelector('.msg-body')?.innerText.trim()`);
    check(`${c.lang}: parent sees the translated message`, parentBody === home, clip(parentBody));

    if (c.lang === 'ar') {
      const dir = await page.eval(`getComputedStyle(document.querySelector('.msg-body')).direction`);
      check('ar: parent card renders RTL', dir === 'rtl', dir);
    }
    const actTitle = await page.eval(`document.querySelector('.activity-card h2')?.innerText.trim()`);
    check(`${c.lang}: activity title is translated`, c.script.test(actTitle || ''), clip(actTitle));
    const steps = await page.eval(`[...document.querySelectorAll('.activity-card .step')].map(e => e.innerText.trim())`);
    check(`${c.lang}: all activity steps translated`, steps.length > 0 && steps.every((s) => c.script.test(s)), `${steps.length} steps`);
    const latin = [home, actTitle, ...steps].join(' ').match(/[A-Za-z]{3,}/g);
    check(`${c.lang}: no untranslated English left`, !latin, latin ? latin.join(', ') : 'clean');
  }

  const failures = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failures.length}/${results.length} live checks passed`);
  if (failures.length) process.exitCode = 1;
} finally {
  await browser.close();
}

function clip(s, n = 70) {
  if (!s) return 'empty';
  return s.length > n ? s.slice(0, n) + '…' : s;
}
function fmt(iso) {
  return new Date(iso).toLocaleString();
}
