// Server-side AI proxy. The browser never talks to Meta directly and never
// sees a key or a model id.
//
// Only these models may ever appear below:
//   muse-spark-1.3             translation
//   muse-wonder-1.0            HSPPS 1302.50 documentation
//   muse-voice-transcribe-1.0  speech to text
// No model whose id contains "contributor" is used: family content must not
// be used for training.

import { config, metaKeyProblem } from './config.js';
import { httpError } from './http.js';

const CHAT_URL = `${config.meta.baseUrl}/v1/chat/completions`;
const ASR_URL = `${config.meta.baseUrl}/v1/asr/transcribe`;

// Locked system prompts. Do not edit without a new verification pass.
export const TRANSLATION_PROMPTS = {
  ar: "You are a professional translator for a Head Start preschool program. Translate the user's message into Modern Standard Arabic (fusha), never a regional dialect. Translate everything, including days of the week, times, and place names. Output only the translation.",
  bn: "You are a professional translator for a Head Start preschool program. Translate the user's message fully into Bangla (Bengali) in Bangla script. Translate EVERYTHING, including days of the week, times, and place names. Leave no English words untranslated. Output only the translation.",
  en: "You are a professional translator for a Head Start preschool program. Translate the user's message fully into English. Output only the translation."
};

export const DOCUMENTATION_PROMPT =
  'You are a documentation assistant for a Head Start family advocate. Turn raw engagement events into structured documentation notes aligned to federal Head Start Program Performance Standards section 1302.50 (family engagement). Be precise and factual; invent nothing beyond what the event states. Use these fields: Date/Time, Family, Participants, Home Language, Engagement Activity, Family Strengths Observed, Standard Alignment, Follow-Up.';

function requireKey() {
  if (!config.meta.apiKey) throw httpError(503, metaKeyProblem(), { code: 'missing_meta_key' });
}

async function metaFetch(url, init, { timeoutMs = 120000 } = {}) {
  requireKey();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();
  try {
    const res = await fetch(url, {
      ...init,
      headers: {
        authorization: `Bearer ${config.meta.apiKey}`,
        ...(init.headers || {})
      },
      signal: controller.signal
    });
    const text = await res.text();
    if (!res.ok) {
      // Upstream error text can contain request details. Keep it short and do
      // not echo anything that could include the key.
      throw httpError(502, `Meta API returned ${res.status} from ${new URL(url).pathname}`, {
        code: 'upstream_error',
        upstreamStatus: res.status,
        upstreamDetail: text.slice(0, 400).replace(config.meta.apiKey, '[redacted]')
      });
    }
    return { json: JSON.parse(text), ms: Date.now() - started };
  } catch (err) {
    if (err.name === 'AbortError') {
      throw httpError(504, 'Meta API request timed out', { code: 'upstream_timeout' });
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

function chatText(json) {
  const content = json?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || content.trim() === '') {
    throw httpError(502, 'Meta API returned an empty completion', {
      code: 'empty_completion'
    });
  }
  return content.trim();
}

/**
 * Translate one text block into the family's home language.
 * English is passed through: no model call, no cost.
 */
export async function translateText(text, lang) {
  if (lang === 'en') return { text, raw: null, ms: 0 };
  const system = TRANSLATION_PROMPTS[lang];
  if (!system) throw httpError(400, `No translation prompt for language "${lang}"`);

  const { json, ms } = await metaFetch(CHAT_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model: config.meta.models.translate,
      temperature: 0.3,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: text }
      ]
    })
  });

  return { text: chatText(json), raw: json, ms };
}

/** Translate a parent voice-note transcript back to English for the advocate. */
export async function translateToEnglish(text) {
  const { json, ms } = await metaFetch(CHAT_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model: config.meta.models.translate,
      temperature: 0.3,
      messages: [
        { role: 'system', content: TRANSLATION_PROMPTS.en },
        { role: 'user', content: text }
      ]
    })
  });
  return { text: chatText(json), raw: json, ms };
}

/**
 * Generate the structured HSPPS 1302.50 note.
 * max_tokens is 4500 on purpose: muse-wonder-1.0 reasons for roughly 1,900
 * tokens before it writes anything, and a 1200 cap returns an empty string.
 */
export async function documentEngagement(event) {
  const { json, ms } = await metaFetch(
    CHAT_URL,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: config.meta.models.document,
        temperature: 0.3,
        max_tokens: 4500,
        messages: [
          { role: 'system', content: DOCUMENTATION_PROMPT },
          { role: 'user', content: JSON.stringify(event, null, 2) }
        ]
      })
    },
    { timeoutMs: 240000 }
  );

  return { text: chatText(json), raw: json, ms };
}

/**
 * Transcribe one WAV file (already converted to mono 16-bit 16 kHz PCM).
 * Multipart shape is fixed by the API contract:
 *   part "request" = {"model":"muse-voice-transcribe-1.0","audioEncoding":"WAV"}
 *   part "audio"   = the file
 */
export async function transcribe(wavBuffer, filename = 'note.wav') {
  requireKey();
  const form = new FormData();
  form.append(
    'request',
    JSON.stringify({ model: config.meta.models.transcribe, audioEncoding: 'WAV' })
  );
  form.append('audio', new Blob([wavBuffer], { type: 'audio/wav' }), filename);

  const { json, ms } = await metaFetch(
    ASR_URL,
    { method: 'POST', body: form },
    { timeoutMs: 180000 }
  );

  if (typeof json?.transcript !== 'string') {
    throw httpError(502, 'Transcription response had no transcript field', {
      code: 'bad_transcription_response'
    });
  }
  return {
    transcript: json.transcript.trim(),
    durationMs: json.audioDurationMs ?? null,
    sessionId: json.sessionId ?? null,
    ms
  };
}
