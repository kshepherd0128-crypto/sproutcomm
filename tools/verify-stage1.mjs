// Core verification: real Chromium at 390x844, token-link parent entry,
// family isolation, RTL, tap targets. Runs with or without an AI key.

import { Browser, sleep } from './browser.mjs';
import fs from 'node:fs';

const BASE = process.env.BASE_URL || 'http://localhost:8787';
const OUT = '/home/ksheep/sproutcomm/artifacts';
fs.mkdirSync(OUT, { recursive: true });

const browser = await Browser.launch();
const page = await browser.newPage();
const results = [];

function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
}

async function loginAdvocate(p) {
  await p.eval('sessionStorage.clear()');
  await p.goto(BASE);
  await p.waitFor('document.body.innerText.includes("Program staff")');
  await p.clickText('Program staff');
  await p.fill('#adv-pin', '1111');
  await p.submit('form[data-form="advocate-login"]');
  await p.waitFor('document.body.innerText.includes("Send an engagement")');
}

try {
  await page.goto(BASE);
  await page.waitFor('document.body.innerText.includes("SproutComm")');
  await page.screenshot(`${OUT}/01-entry.png`);
  check('entry renders', (await page.text()).includes('Program staff'));

  await page.clickText('Family');
  await page.waitFor('document.body.innerText.toLowerCase().includes("family access")');
  await page.screenshot(`${OUT}/01b-parent-entry.png`);
  check('parent entry asks for the family link', (await page.text()).toLowerCase().includes('opens from the link'));
  await page.click('[data-action="entry-back"]');

  // ---- advocate
  await page.clickText('Program staff');
  await page.fill('#adv-pin', '1111');
  await page.submit('form[data-form="advocate-login"]');
  await page.waitFor('document.body.innerText.includes("Send an engagement")');
  await page.screenshot(`${OUT}/02-advocate.png`);
  const advText = await page.text();
  check('advocate screen renders', advText.includes('Send an engagement'));
  check('three synthetic families', ['Haddad family', 'Rahman family', 'Brooks family'].every((n) => advText.includes(n)));

  // ---- family file + token link
  await page.clickText('Brooks family');
  await page.waitFor('document.body.innerText.includes("Documentation file")');
  await page.screenshot(`${OUT}/03-family-file.png`);
  check('family file shows seeded 1302.50 note', (await page.text()).includes('1302.50'));

  const link = await page.eval(`document.querySelector('code')?.textContent.trim()`);
  check('family token link is shown', /\/f\/[A-Za-z0-9_-]{20,}/.test(link || ''), link || 'missing');

  // ---- parent front door via the token link
  await page.goto(link);
  await page.waitFor('document.querySelector(".parent-msg")');
  await page.screenshot(`${OUT}/04-parent-link.png`);
  check('token link opens the family page', (await page.text()).includes('Brooks family'));
  const finalUrl = await page.eval('location.href');
  check('token is removed from the address bar', finalUrl === BASE + '/', finalUrl);

  const probe = await page.eval(`(() => ({
    width: document.documentElement.scrollWidth,
    listen: document.querySelector('.listen-btn')?.getBoundingClientRect().height,
    actions: [...document.querySelectorAll('.parent-actions .btn')].map(b => Math.round(b.getBoundingClientRect().height))
  }))()`);
  check('no horizontal overflow at 390px', probe.width <= 390, `scrollWidth=${probe.width}`);
  check('tap targets >= 56px', probe.listen >= 56 && probe.actions.every((h) => h >= 56), JSON.stringify(probe));

  // ---- arabic family, RTL
  await loginAdvocate(page);
  await page.clickText('Haddad family');
  await page.waitFor('document.body.innerText.includes("Documentation file")');
  const arLink = await page.eval(`document.querySelector('code')?.textContent.trim()`);
  await page.goto(arLink);
  await page.waitFor('document.querySelector(".parent-msg")');
  await page.screenshot(`${OUT}/05-parent-arabic.png`);
  const ar = await page.eval(`(() => {
    const card = document.querySelector('.parent-msg');
    const body = document.querySelector('.msg-body');
    return { dir: card?.getAttribute('dir'), bodyDir: body ? getComputedStyle(body).direction : null };
  })()`);
  check('arabic card is RTL', ar.dir === 'rtl' && ar.bodyDir === 'rtl', JSON.stringify(ar));

  // ---- bangla
  await loginAdvocate(page);
  await page.clickText('Rahman family');
  await page.waitFor('document.body.innerText.includes("Documentation file")');
  const bnLink = await page.eval(`document.querySelector('code')?.textContent.trim()`);
  await page.goto(bnLink);
  await page.waitFor('document.querySelector(".parent-msg")');
  await page.screenshot(`${OUT}/06-parent-bangla.png`);
  check('bangla feed renders', (await page.text()).includes('রান্নাঘরে'));

  // ---- invalid token is rejected
  await page.goto(`${BASE}/f/this-is-not-a-real-family-token`);
  await page.waitFor('document.body.innerText.includes("not valid")');
  check('invalid family link is rejected', (await page.text()).includes('not valid'));

  const unexpected = page.errors.filter((e) => !/401 \(Unauthorized\)/.test(e));
  check('no page errors', unexpected.length === 0, unexpected.join(' | '));
  const failures = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failures.length}/${results.length} checks passed`);
  if (failures.length) process.exitCode = 1;
} finally {
  await browser.close();
}
