// Stage 3 gate: parent voice note -> server conversion -> live transcription
// -> Spark to English -> advocate inbox, in a real browser at 390x844.
//
// Headless Chromium cannot feed speech into the fake microphone on this host,
// so the browser run uses the app's own "choose a recording" path for the
// audio, which is the same blob -> upload -> convert -> transcribe pipeline.
// MediaRecorder itself is exercised separately (a real blob is produced).

import { Browser, sleep } from './browser.mjs';
import fs from 'node:fs';

const BASE = process.env.BASE_URL || 'http://localhost:8787';
const OUT = '/home/ksheep/sproutcomm/artifacts';
const AUDIO = process.env.TEST_AUDIO || '/tmp/opencode/ar_30.wav';
fs.mkdirSync(OUT, { recursive: true });

const health = await (await fetch(`${BASE}/health`)).json();
if (!health.ai_configured) {
  console.log('LIVE TRANSCRIPTION: BLOCKED — no META_API_KEY on this server.');
  process.exit(1);
}

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
};

const browser = await Browser.launch({
  extraArgs: [
    '--use-fake-ui-for-media-stream',
    '--use-fake-device-for-media-stream',
    '--autoplay-policy=no-user-gesture-required'
  ]
});
await browser.grantPermissions(BASE);
const page = await browser.newPage();

try {
  // family link for the Arabic household
  const adv = await (await fetch(`${BASE}/api/session`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ role: 'advocate', passcode: '1111' })
  })).json();
  const families = await (await fetch(`${BASE}/api/families`, {
    headers: { authorization: `Bearer ${adv.token}` }
  })).json();
  const family = families.families.find((f) => f.home_language === 'ar');
  const link = BASE + family.access_path;

  await page.goto(link);
  await page.waitFor('document.querySelector(".parent-msg")');
  const beforeCount = await page.eval('document.querySelectorAll(".reply-card").length');

  // MediaRecorder really does produce an uploadable blob on this client.
  const blob = await page.eval(`(async () => {
    const s = await navigator.mediaDevices.getUserMedia({ audio: true });
    const r = new MediaRecorder(s, { mimeType: 'audio/webm;codecs=opus' });
    const chunks = [];
    r.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    const done = new Promise((res) => { r.onstop = () => res(new Blob(chunks, { type: r.mimeType })); });
    r.start();
    await new Promise((x) => setTimeout(x, 2000));
    r.stop();
    const b = await done;
    s.getTracks().forEach((t) => t.stop());
    return { size: b.size, type: b.type };
  })()`);
  check('MediaRecorder produces an uploadable blob', blob.size > 0 && /webm|mp4/.test(blob.type), JSON.stringify(blob));

  // open the recorder sheet
  await page.clickText('ملاحظة صوتية');
  await page.waitFor('document.querySelector(".sheet")');
  await page.screenshot(`${OUT}/stage3-recorder.png`);
  check('recorder sheet opens', (await page.text()).includes('تسجيل') || (await page.text()).includes('التسجيل'));

  await page.setFile('input[data-role="audio-file"]', AUDIO);
  await page.waitFor('document.querySelector(".sheet audio")');
  await page.screenshot(`${OUT}/stage3-review.png`);
  check('recording is ready to send', Boolean(await page.eval('document.querySelector(".sheet audio")')));

  await page.click('[data-action="send-record"]');
  await page.waitFor('document.body.innerText.includes("وصلت")', { timeout: 30000 });
  await page.screenshot(`${OUT}/stage3-sent.png`);
  check('parent sees delivery confirmation', (await page.text()).includes('وصلت ملاحظتكم الصوتية'));

  // reload the family page: the reply stays visible to the parent
  await page.goto(link);
  await page.waitFor('document.querySelector(".parent-msg")');
  await sleep(600);
  await page.screenshot(`${OUT}/stage3-parent-reply.png`);
  const ownReply = await page.eval(`document.querySelector('.reply-card audio')?.getAttribute('src') || ''`);
  check('parent sees their own voice note after reload', ownReply.includes('/api/voice-notes/'), ownReply ? 'audio present' : 'missing');

  // advocate inbox
  await page.goto(BASE);
  await page.eval('sessionStorage.clear()');
  await page.goto(BASE);
  await page.clickText('Program staff');
  await page.fill('#adv-pin', '1111');
  await page.submit('form[data-form="advocate-login"]');
  await page.waitFor('document.body.innerText.includes("Send an engagement")');

  let note = null;
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    const inbox = await page.eval(`(async () => {
      const s = JSON.parse(sessionStorage.getItem('sproutcomm.session'));
      const r = await fetch('/api/inbox', { headers: { authorization: 'Bearer ' + s.token } });
      return (await r.json()).notes;
    })()`);
    note = inbox.find((n) => n.family_id === family.id && n.status !== 'transcribing');
    if (note) break;
    await sleep(1500);
  }

  check('voice note reaches the advocate inbox', Boolean(note), note ? note.status : 'missing');
  if (note) {
    check('transcript is in the family home language', /\p{Script=Arabic}/u.test(note.transcript || ''), clip(note.transcript));
    check('transcript is translated to English', /\p{Script=Latin}/u.test(note.transcript_en || ''), clip(note.transcript_en));
    check('note is marked ready', note.status === 'ready', note.status);
    console.log(`      original: ${note.transcript}`);
    console.log(`      english:  ${note.transcript_en}`);

    const audio = await page.eval(`(async () => {
      const r = await fetch(${JSON.stringify(note.audio_url)});
      const b = await r.arrayBuffer();
      return { status: r.status, type: r.headers.get('content-type'), bytes: b.byteLength };
    })()`);
    check('advocate can play the recording', audio.status === 200 && audio.type === 'audio/wav', JSON.stringify(audio));

    const dl = `/tmp/opencode/stage3-note.wav`;
    const buf = await (await fetch(BASE + note.audio_url)).arrayBuffer();
    fs.writeFileSync(dl, Buffer.from(buf));
    const probe = await page.eval(`1`); // keep page alive
    void probe;

    await page.waitFor('document.body.innerText.includes("Family replies")', { timeout: 15000 });
    // The inbox refreshes on a 6s interval; wait for the live translation to
    // land instead of sampling the screen while the note still says
    // "Transcribing".
    await page.waitFor(
      `document.body.innerText.includes(${JSON.stringify(note.transcript_en.slice(0, 24))})`,
      { timeout: 15000 }
    );
    await page.screenshot(`${OUT}/stage3-inbox.png`);
    check('inbox card shows the English translation', (await page.text()).includes(note.transcript_en.slice(0, 24)));

    // family file shows the reply under the engagement
    await page.eval(`document.querySelector('[data-action="open-family"][data-family="${family.id}"]')?.click()`);
    await page.waitFor('document.body.innerText.includes("Documentation file")');
    await page.screenshot(`${OUT}/stage3-family-file.png`);
    check('family file shows the voice reply', (await page.text()).includes('Voice reply'));
  }

  const failures = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failures.length}/${results.length} checks passed`);
  if (failures.length) process.exitCode = 1;
} finally {
  await browser.close();
}

function clip(s, n = 60) {
  if (!s) return 'empty';
  return s.length > n ? s.slice(0, n) + '…' : s;
}
