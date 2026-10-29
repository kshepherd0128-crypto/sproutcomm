// Voice notes: store, normalize, transcribe, translate, serve.
//
// The parent records in their own language. The server converts the upload to
// 16 kHz mono PCM WAV, transcribes it with muse-voice-transcribe-1.0, then
// translates the transcript back to English for the advocate.

import fs from 'node:fs';
import path from 'node:path';
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

import { config } from './config.js';
import { all, one, run } from './db.js';
import { httpError } from './http.js';
import { MAX_NOTE_MS, durationMs, toWav16k } from './audio.js';
import { detectLanguage, normalizeLanguageCode } from './lang-detect.js';
import { transcribe, translateToEnglish } from './meta.js';

const nowIso = () => new Date().toISOString();

export function noteAudioSignature(id) {
  return createHmac('sha256', config.audioSecret).update(id).digest('hex').slice(0, 32);
}

export function noteAudioUrl(id) {
  return `/api/voice-notes/${id}/audio?sig=${noteAudioSignature(id)}`;
}

export function audioSignatureValid(id, sig) {
  if (!sig || typeof sig !== 'string') return false;
  const expected = Buffer.from(noteAudioSignature(id));
  const given = Buffer.from(sig);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export function getVoiceNote(id) {
  return one('SELECT * FROM voice_notes WHERE id = ?', id);
}

/**
 * Accept an upload from a family device. Returns as soon as the audio is
 * safely converted; transcription and translation continue in the background
 * so a parent on a slow phone is not held on a spinner.
 */
export async function createVoiceNote({ familyId, messageId, clientId, lang, buffer, filename }) {
  if (clientId) {
    const existing = one('SELECT * FROM voice_notes WHERE client_id = ?', clientId);
    if (existing) return { note: existing, duplicate: true };
  }

  const message = messageId ? one('SELECT * FROM messages WHERE id = ?', messageId) : null;
  if (messageId && !message) throw httpError(404, 'That engagement no longer exists');
  if (message && message.family_id !== familyId) throw httpError(403, 'That engagement belongs to another family');

  const id = randomUUID();
  const rawExt = (path.extname(filename || '') || '.webm').replace(/[^.a-z0-9]/gi, '').slice(0, 8);
  const rawPath = path.join(config.audioDir, `${id}.raw${rawExt}`);
  const wavPath = path.join(config.audioDir, `${id}.wav`);

  fs.writeFileSync(rawPath, buffer);
  try {
    await toWav16k(rawPath, wavPath);
  } finally {
    fs.rmSync(rawPath, { force: true });
  }

  const ms = await durationMs(wavPath);
  if (ms && ms > MAX_NOTE_MS) {
    fs.rmSync(wavPath, { force: true });
    throw httpError(413, 'Voice notes are limited to two minutes');
  }

  run(
    `INSERT INTO voice_notes
       (id, client_id, message_id, family_id, audio_path, lang, duration_ms, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'transcribing', ?)`,
    id,
    clientId || null,
    messageId || null,
    familyId,
    `${id}.wav`,
    lang,
    ms,
    nowIso()
  );

  const note = getVoiceNote(id);
  void processVoiceNote(id);
  return { note, duplicate: false };
}

export async function processVoiceNote(id) {
  const note = getVoiceNote(id);
  if (!note) return;

  try {
    const file = path.join(config.audioDir, note.audio_path);
    if (!fs.existsSync(file)) throw new Error('Recording is missing on the server');

    const result = await transcribe(fs.readFileSync(file), `${id}.wav`);
    const transcript = result.transcript.trim();

    if (!transcript) {
      run(
        "UPDATE voice_notes SET status = 'no_speech', error = ?, duration_ms = ? WHERE id = ?",
        'No speech was detected in this recording',
        result.durationMs ?? note.duration_ms,
        id
      );
      return;
    }

    // The transcript's own language decides whether the advocate needs an
    // English rendering. The family profile language is irrelevant here: an
    // English-profile family can speak German, and today's profile-keyed
    // passthrough left that reply untranslated. A non-English profile keeps
    // its existing behaviour (it still asks Spark), while an English profile
    // makes no extra call when the transcript itself is English.
    const transcriptLang = normalizeLanguageCode(result.language) || detectLanguage(transcript);
    let english = transcript;
    if (transcriptLang !== 'en' || note.lang !== 'en') {
      english = (await translateToEnglish(transcript)).text;
    }

    run(
      `UPDATE voice_notes
          SET status = 'ready', transcript = ?, transcript_en = ?, transcript_lang = ?,
              duration_ms = ?, error = NULL
        WHERE id = ?`,
      transcript,
      english,
      transcriptLang,
      result.durationMs ?? note.duration_ms,
      id
    );
  } catch (err) {
    run(
      "UPDATE voice_notes SET status = 'failed', error = ? WHERE id = ?",
      String(err.message || 'Transcription failed').slice(0, 300),
      id
    );
  }
}

/** Advocate inbox: voice replies across all families, newest first. */
export function listInbox(limit = 20) {
  return all(
    `SELECT v.*, f.family_name, f.child_name, f.home_language,
            m.created_at AS message_created_at, a.title_en AS activity_title
       FROM voice_notes v
       JOIN families f ON f.id = v.family_id
       LEFT JOIN messages m ON m.id = v.message_id
       LEFT JOIN activities a ON a.id = m.activity_id
      ORDER BY v.created_at DESC
      LIMIT ?`,
    limit
  ).map(shapeNote);
}

export function shapeNote(v) {
  return {
    id: v.id,
    family_id: v.family_id,
    family_name: v.family_name,
    child_name: v.child_name,
    home_language: v.home_language,
    message_id: v.message_id,
    message_created_at: v.message_created_at,
    activity_title: v.activity_title,
    created_at: v.created_at,
    status: v.status,
    lang: v.lang,
    duration_ms: v.duration_ms,
    transcript: v.transcript,
    transcript_lang: v.transcript_lang,
    transcript_en: v.transcript_en,
    error: v.error,
    audio_url: v.audio_path ? noteAudioUrl(v.id) : null
  };
}
