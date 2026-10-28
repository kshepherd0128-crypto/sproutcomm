// Stage verification walkthrough in a real browser at 390x844.
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

try {
  await page.goto(BASE);
  await page.waitFor('document.body.innerText.includes("SproutComm")');
  await page.screenshot(`${OUT}/01-entry.png`);
  check('entry renders', (await page.text()).includes('Program staff'));

  // Advocate login
  await page.clickText('Program staff');
  await page.fill('#adv-pin', '1111');
  await page.submit('form[data-form="advocate-login"]');
  await page.waitFor('document.body.innerText.includes("Send an engagement")');
  await page.screenshot(`${OUT}/02-advocate.png`);
  const advText = await page.text();
  check('advocate screen renders', advText.includes('Send an engagement') && advText.includes('Haddad family'));
  check('three synthetic families', ['Haddad family', 'Rahman family', 'Brooks family'].every((n) => advText.includes(n)));

  // Family file
  await page.clickText('Brooks family');
  await page.waitFor('document.body.innerText.includes("Documentation file")');
  await page.screenshot(`${OUT}/03-family-file.png`);
  check('family file shows seeded 1302.50 note', (await page.text()).includes('1302.50'));
  await page.click('[data-action="back"]');

  // Sign out, parent login as Arabic family
  await page.click('[data-action="signout"]');
  await page.waitFor('document.body.innerText.includes("Program staff")');
  await page.clickText('Family');
  await page.waitFor('document.body.innerText.toLowerCase().includes("choose your family")');
  await page.screenshot(`${OUT}/04-parent-picker.png`);
  await page.clickText('Haddad family');
  await page.fill('#par-pin', '2222');
  await page.submit('form[data-form="parent-login"]');
  await page.waitFor('document.body.innerText.includes("العربية")');
  await page.screenshot(`${OUT}/05-parent-arabic.png`);

  const ar = await page.eval(`(() => {
    const card = document.querySelector('.parent-msg');
    const body = document.querySelector('.msg-body');
    return {
      dir: card?.getAttribute('dir'),
      bodyDir: body ? getComputedStyle(body).direction : null,
      hasListen: Boolean(document.querySelector('.listen-btn')),
      listenHeight: document.querySelector('.listen-btn')?.getBoundingClientRect().height,
      actionHeights: [...document.querySelectorAll('.parent-actions .btn')].map(b => Math.round(b.getBoundingClientRect().height)),
      width: document.documentElement.scrollWidth
    };
  })()`);
  check('arabic card is RTL', ar.dir === 'rtl' && ar.bodyDir === 'rtl', JSON.stringify(ar));
  check('listen button present and large', ar.hasListen && ar.listenHeight >= 56, `h=${ar.listenHeight}`);
  check('tap targets >= 56px', ar.actionHeights.every((h) => h >= 56), JSON.stringify(ar.actionHeights));
  check('no horizontal overflow at 390px', ar.width <= 390, `scrollWidth=${ar.width}`);

  // Bangla family
  await page.click('[data-action="signout"]');
  await page.waitFor('document.body.innerText.includes("Program staff")');
  await page.clickText('Family');
  await page.waitFor('document.body.innerText.toLowerCase().includes("choose your family")');
  await page.clickText('Rahman family');
  await page.fill('#par-pin', '2222');
  await page.submit('form[data-form="parent-login"]');
  await page.waitFor('document.body.innerText.includes("বাংলা")');
  await page.screenshot(`${OUT}/06-parent-bangla.png`);
  check('bangla feed renders', (await page.text()).includes('রান্নাঘরে'));

  check('no page errors', page.errors.length === 0, page.errors.join(' | '));
  const failures = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failures.length}/${results.length} checks passed`);
  if (failures.length) process.exitCode = 1;
} finally {
  await browser.close();
}
