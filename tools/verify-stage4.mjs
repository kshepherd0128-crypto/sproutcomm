// Stage 4 gate: the completion loop, run for real against the live database.
//
// Part A drives the API exactly as the parent client does, then reads
// completion_events / documentation_notes straight out of SQLite.
// Part B drives the same loop through the UI in Chromium at 390x844.
//
// This is a real run: live Spark translation and live Wonder documentation.

import { Browser, sleep } from './browser.mjs';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';

const BASE = process.env.BASE_URL || 'http://localhost:8787';
const OUT = '/home/ksheep/sproutcomm/artifacts';
const DB_PATH = '/home/ksheep/sproutcomm/data/sproutcomm.db';
fs.mkdirSync(OUT, { recursive: true });

const db = new DatabaseSync(DB_PATH);
const q = (sql, ...p) => db.prepare(sql).get(...p);
const qa = (sql, ...p) => db.prepare(sql).all(...p);

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
};

async function session(role, extra) {
  const res = await fetch(`${BASE}/api/session`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ role, ...extra })
  });
  return res.json();
}

const advocate = await session('advocate', { passcode: '1111' });

async function sendLive(familyId, activityId, body) {
  const res = await fetch(`${BASE}/api/messages`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${advocate.token}` },
    body: JSON.stringify({ family_id: familyId, activity_id: activityId, body_en: body })
  });
  return res.json();
}

const browser = await Browser.launch();
const page = await browser.newPage();

try {
  /* ---------------- Part A: API flow, Arabic household ---------------- */
  const sent = await sendLive(
    'fam-haddad',
    'act-counting-stairs',
    'Good evening, Haddad family! Tonight, count the stairs together with Layla as you go up and down. Tell me how it went.'
  );
  check('live message sent through Spark', Boolean(sent.message_id), sent.feed?.message?.body?.slice(0, 40));

  const familyRow = q('SELECT * FROM families WHERE id = ?', 'fam-haddad');
  const parent = await session('parent', { token: familyRow.access_token });
  const feed = await (await fetch(`${BASE}/api/parent/feed`, {
    headers: { authorization: `Bearer ${parent.token}` }
  })).json();
  check('parent sees the live message', feed.message?.id === sent.message_id);

  const clientId = 'gate4-api-1';
  const completeBody = {
    message_id: feed.message.id,
    participants: 'parent_child',
    activity_minutes: 12,
    client_id: clientId
  };
  const first = await (await fetch(`${BASE}/api/parent/complete`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${parent.token}` },
    body: JSON.stringify(completeBody)
  })).json();

  check('completion returns an event', Boolean(first.event?.id), first.event?.id);
  check('message is marked completed on the server', first.message?.status === 'completed');
  check('participants and minutes are stored', first.event?.participants === 'Layla and parent' && first.event?.activity_minutes === 12,
    JSON.stringify({ p: first.event?.participants, m: first.event?.activity_minutes }));
  check('documentation starts as pending, never fabricated', first.note?.status === 'pending' && first.note?.body === null,
    String(first.note?.status));

  const second = await (await fetch(`${BASE}/api/parent/complete`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${parent.token}` },
    body: JSON.stringify(completeBody)
  })).json();
  check('same client_id returns the same event', second.event?.id === first.event.id, second.event?.id);

  const third = await (await fetch(`${BASE}/api/parent/complete`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${parent.token}` },
    body: JSON.stringify({ ...completeBody, client_id: 'gate4-api-2', activity_minutes: 99 })
  })).json();
  check('a second client_id on the same engagement cannot duplicate it', third.event?.id === first.event.id,
    `${third.event?.id} / minutes ${third.event?.activity_minutes}`);

  const eventCount = q('SELECT COUNT(*) AS n FROM completion_events WHERE message_id = ?', feed.message.id).n;
  const noteCount = q('SELECT COUNT(*) AS n FROM documentation_notes WHERE event_id = ?', first.event.id).n;
  check('SQLite holds exactly one event for this message', eventCount === 1, String(eventCount));
  check('SQLite holds exactly one note for this event', noteCount === 1, String(noteCount));
  check('note is pending or ready, never an invented body',
    ['pending', 'ready'].includes(q('SELECT status FROM documentation_notes WHERE event_id = ?', first.event.id).status));

  // Wait for Wonder.
  let note = null;
  const deadline = Date.now() + 180000;
  while (Date.now() < deadline) {
    note = q('SELECT * FROM documentation_notes WHERE event_id = ?', first.event.id);
    if (note.status !== 'pending') break;
    await sleep(2000);
  }

  check('Wonder writes the note', note?.status === 'ready', `${note?.status}${note?.error ? ' — ' + note.error : ''}`);
  check('note standard is HSPPS 1302.50', note?.standard === 'HSPPS 1302.50', note?.standard);
  check('note model is muse-wonder-1.0', note?.model === 'muse-wonder-1.0', note?.model);
  check('note source is live', note?.source === 'live', note?.source);
  check('note body is non-empty', (note?.body || '').length > 100, `${note?.body?.length ?? 0} chars`);

  const FIELDS = ['Date/Time', 'Family', 'Participants', 'Home Language', 'Engagement Activity',
    'Family Strengths Observed', 'Standard Alignment', 'Follow-Up'];
  const missing = FIELDS.filter((f) => !(note?.body || '').includes(f));
  check('note carries all required fields', missing.length === 0, missing.join(', ') || 'all present');
  check('note names the actual participants', (note?.body || '').includes('Layla and parent'));
  check('note does not leak ISO timestamps', !/T\d{2}:\d{2}:\d{2}\.\d{3}Z/.test(note?.body || ''));

  console.log('\n--- documentation_notes row ---');
  console.log(`id=${note.id}\nstandard=${note.standard}\nmodel=${note.model}\nsource=${note.source}\nstatus=${note.status}`);
  console.log('--- note body ---\n' + note.body + '\n');

  /* ---------------- Part B: same loop through the UI ---------------- */
  const uiSend = await sendLive(
    'fam-brooks',
    'act-picture-walk',
    'Good evening, Brooks family! Tonight, take a picture walk with Jayden. Ask what he notices on each page, then let him tell the story back.'
  );
  const brooks = q('SELECT * FROM families WHERE id = ?', 'fam-brooks');

  await page.goto(BASE + `/f/${brooks.access_token}`);
  await page.waitFor('document.querySelector(".parent-msg")');
  await page.clickText('We did it');
  await page.waitFor('document.querySelector(".sheet")');
  await page.screenshot(`${OUT}/stage4-sheet.png`);
  const sheetText = await page.text();
  check('We did it opens the completion sheet', sheetText.includes('Who joined tonight?') && sheetText.includes('How long did it take?'));

  await page.clickText('Whole family');
  await page.clickText('15 min');
  await page.screenshot(`${OUT}/stage4-sheet-filled.png`);
  await page.click('[data-action="confirm-complete"]');
  await page.waitFor('document.querySelector(".sheet .done-card")', { timeout: 30000 });
  await page.screenshot(`${OUT}/stage4-done.png`);
  check('parent sees the documented confirmation', (await page.text()).includes("Added to your family's file"));

  await sleep(2500);
  await page.screenshot(`${OUT}/stage4-feed-completed.png`);
  check('feed renders the completed state from the server',
    await page.eval('Boolean(document.querySelector(".done-card"))'));

  const uiEvent = q('SELECT * FROM completion_events WHERE message_id = ?', uiSend.message_id);
  check('UI completion wrote an event', Boolean(uiEvent), uiEvent?.id);
  check('UI participants come from the chips', uiEvent?.participants === 'Whole family', uiEvent?.participants);
  check('UI minutes come from the chips', uiEvent?.activity_minutes === 15, String(uiEvent?.activity_minutes));

  // advocate sees the file and the note
  await page.goto(BASE);
  await page.eval('sessionStorage.clear()');
  await page.goto(BASE);
  await page.clickText('Program staff');
  await page.fill('#adv-pin', '1111');
  await page.submit('form[data-form="advocate-login"]');
  await page.waitFor('document.body.innerText.includes("Send an engagement")');
  await page.eval(`document.querySelector('[data-action="open-family"][data-family="fam-brooks"]')?.click()`);
  await page.waitFor('document.body.innerText.includes("Documentation file")');

  let uiNote = null;
  const uiDeadline = Date.now() + 180000;
  while (Date.now() < uiDeadline) {
    uiNote = q('SELECT * FROM documentation_notes WHERE event_id = ?', uiEvent.id);
    if (uiNote.status !== 'pending') break;
    await sleep(2000);
  }
  await page.waitFor('document.body.innerText.includes("Whole family")', { timeout: 90000 });
  await page.screenshot(`${OUT}/stage4-advocate-file.png`);
  const fileText = await page.text();
  check('advocate file renders the live note', fileText.includes('Family Strengths Observed') && fileText.includes('Whole family'),
    uiNote?.status);
  check('the UI note is ready', uiNote?.status === 'ready');

  const failures = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failures.length}/${results.length} checks passed`);
  if (failures.length) process.exitCode = 1;
} finally {
  await browser.close();
  db.close();
}
