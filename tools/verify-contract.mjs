// Outgoing contract check. This does NOT prove the Meta API works (that
// needs a live key); it proves the client-server proxy sends exactly the
// shapes the signed API contract requires: URLs, model ids, temperature,
// max_tokens, multipart parts, and the locked system prompts verbatim.

process.env.META_API_KEY = 'contract-test-key';

const { TRANSLATION_PROMPTS, DOCUMENTATION_PROMPT } = await import('../server/meta.js');
const { translateText, translateToEnglish, documentEngagement, transcribe } = await import('../server/meta.js');

const EXPECTED = {
  ar: "You are a professional translator for a Head Start preschool program. Translate the user's message into Modern Standard Arabic (fusha), never a regional dialect. Translate everything, including days of the week, times, and place names. Output only the translation.",
  bn: "You are a professional translator for a Head Start preschool program. Translate the user's message fully into Bangla (Bengali) in Bangla script. Translate EVERYTHING, including days of the week, times, and place names. Leave no English words untranslated. Output only the translation.",
  en: "You are a professional translator for a Head Start preschool program. Translate the user's message fully into English. Output only the translation.",
  doc: 'You are a documentation assistant for a Head Start family advocate. Turn raw engagement events into structured documentation notes aligned to federal Head Start Program Performance Standards section 1302.50 (family engagement). Be precise and factual; invent nothing beyond what the event states. Use these fields: Date/Time, Family, Participants, Home Language, Engagement Activity, Family Strengths Observed, Standard Alignment, Follow-Up.'
};

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
};

check('Arabic prompt is verbatim', TRANSLATION_PROMPTS.ar === EXPECTED.ar);
check('Bangla prompt is verbatim', TRANSLATION_PROMPTS.bn === EXPECTED.bn);
check('English prompt is verbatim', TRANSLATION_PROMPTS.en === EXPECTED.en);
check('Documentation prompt is verbatim', DOCUMENTATION_PROMPT === EXPECTED.doc);

const calls = [];
globalThis.fetch = async (url, init) => {
  calls.push({ url: String(url), init });
  if (String(url).includes('/asr/transcribe')) {
    return new Response(JSON.stringify({ transcript: 'ok' }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  }
  return new Response(
    JSON.stringify({ choices: [{ message: { content: 'translated' } }] }),
    { status: 200, headers: { 'content-type': 'application/json' } }
  );
};

await translateText('Good evening', 'ar');
const arCall = calls.at(-1);
const arBody = JSON.parse(arCall.init.body);
check('chat URL', arCall.url === 'https://api.meta.ai/v1/chat/completions', arCall.url);
check('bearer auth from env', arCall.init.headers.authorization === 'Bearer contract-test-key');
check('translation model', arBody.model === 'muse-spark-1.3', arBody.model);
check('translation temperature 0.3', arBody.temperature === 0.3, String(arBody.temperature));
check('locked prompt sent as system', arBody.messages[0].role === 'system' && arBody.messages[0].content === EXPECTED.ar);
check('family text sent as user turn', arBody.messages[1].content === 'Good evening');

await translateToEnglish('مرحبا');
const enBody = JSON.parse(calls.at(-1).init.body);
check('to-English uses the English prompt', enBody.messages[0].content === EXPECTED.en);

await documentEngagement({ family: 'Test' });
const docCall = calls.at(-1);
const docBody = JSON.parse(docCall.init.body);
check('documentation model', docBody.model === 'muse-wonder-1.0', docBody.model);
check('documentation temperature 0.3', docBody.temperature === 0.3);
check('documentation max_tokens 4500', docBody.max_tokens === 4500, String(docBody.max_tokens));
check('documentation prompt is system', docBody.messages[0].content === EXPECTED.doc);

const wav = Buffer.alloc(64);
await transcribe(wav, 'note.wav');
const asrCall = calls.at(-1);
check('transcription URL is /v1/asr/transcribe', asrCall.url === 'https://api.meta.ai/v1/asr/transcribe', asrCall.url);
const form = asrCall.init.body;
const requestPart = JSON.parse(form.get('request'));
const audioPart = form.get('audio');
check('multipart request part', requestPart.model === 'muse-voice-transcribe-1.0' && requestPart.audioEncoding === 'WAV', JSON.stringify(requestPart));
check('multipart audio part', audioPart instanceof Blob && audioPart.size === 64 && audioPart.type === 'audio/wav');

const banned = calls.filter((c) => /contributor/i.test(c.url));
check('no contributor model traffic', banned.length === 0);

const failures = results.filter((r) => !r.ok);
console.log(`\n${results.length - failures.length}/${results.length} contract checks passed`);
if (failures.length) process.exitCode = 1;
