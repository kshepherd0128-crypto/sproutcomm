// Domain logic for the slice: families, engagements, the parent feed.

import { randomUUID } from 'node:crypto';
import { all, one, run, transaction } from './db.js';
import { language } from './languages.js';
import { translateText } from './meta.js';
import { noteAudioUrl, shapeNote } from './notes.js';
import { httpError } from './http.js';

const nowIso = () => new Date().toISOString();

function parseSteps(json) {
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function listActivities() {
  return all('SELECT * FROM activities ORDER BY title_en').map((a) => ({
    id: a.id,
    title: a.title_en,
    domain: a.domain,
    scope_ref: a.scope_ref,
    steps: parseSteps(a.steps_en),
    prompt: a.prompt_en,
    minutes: a.minutes
  }));
}

export function getActivity(id) {
  return one('SELECT * FROM activities WHERE id = ?', id);
}

export function getFamily(id) {
  return one('SELECT * FROM families WHERE id = ?', id);
}

export function getFamilyByToken(token) {
  if (!token || typeof token !== 'string' || token.length < 16 || token.length > 128) return null;
  return one('SELECT * FROM families WHERE access_token = ?', token);
}

function familyShape(f) {
  if (!f) return null;
  const meta = language(f.home_language);
  return {
    id: f.id,
    family_name: f.family_name,
    child_name: f.child_name,
    child_age: f.child_age,
    home_language: f.home_language,
    language: {
      code: meta.code,
      englishName: meta.englishName,
      nativeName: meta.nativeName,
      dir: meta.dir,
      mode: meta.mode,
      transcriptionUnverified: Boolean(meta.transcriptionUnverified)
    }
  };
}

export function listFamilies() {
  const rows = all(`
    SELECT f.*,
      (SELECT m.created_at FROM messages m
        WHERE m.family_id = f.id AND m.status != 'failed'
        ORDER BY m.created_at DESC LIMIT 1) AS last_message_at,
      (SELECT m.status FROM messages m
        WHERE m.family_id = f.id AND m.status != 'failed'
        ORDER BY m.created_at DESC LIMIT 1) AS last_status,
      (SELECT a.title_en FROM messages m JOIN activities a ON a.id = m.activity_id
        WHERE m.family_id = f.id AND m.status != 'failed'
        ORDER BY m.created_at DESC LIMIT 1) AS last_activity,
      (SELECT COUNT(*) FROM voice_notes v
        WHERE v.family_id = f.id AND v.status = 'ready') AS reply_count,
      (SELECT COUNT(*) FROM documentation_notes d
        WHERE d.family_id = f.id) AS note_count
    FROM families f
    ORDER BY f.family_name
  `);

  return rows.map((r) => ({
    ...familyShape(r),
    access_path: `/f/${r.access_token}`,
    last_message_at: r.last_message_at,
    last_status: r.last_status,
    last_activity: r.last_activity,
    reply_count: r.reply_count,
    note_count: r.note_count
  }));
}

/**
 * Cache activity translations per (activity, language). Activities repeat
 * across families, so this keeps a send to one Spark call once warm.
 */
async function ensureActivityTranslation(activity, lang) {
  const steps = parseSteps(activity.steps_en);
  if (lang === 'en') {
    return {
      title: activity.title_en,
      steps,
      prompt: activity.prompt_en,
      source: 'live'
    };
  }

  const cached = one(
    'SELECT * FROM activity_translations WHERE activity_id = ? AND lang = ?',
    activity.id,
    lang
  );
  if (cached) {
    return {
      title: cached.title,
      steps: parseSteps(cached.steps),
      prompt: cached.prompt,
      source: cached.source
    };
  }

  const [title, prompt, ...translatedSteps] = await Promise.all([
    translateText(activity.title_en, lang),
    translateText(activity.prompt_en, lang),
    ...steps.map((step) => translateText(step, lang))
  ]);

  const result = {
    title: title.text,
    steps: translatedSteps.map((s) => s.text),
    prompt: prompt.text,
    source: 'live'
  };

  run(
    `INSERT OR REPLACE INTO activity_translations
       (activity_id, lang, title, steps, prompt, source, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    activity.id,
    lang,
    result.title,
    JSON.stringify(result.steps),
    result.prompt,
    'live',
    nowIso()
  );

  return result;
}

/**
 * Compose an engagement for one family.
 * Translation happens before the row is written: a failed translation leaves
 * no half-delivered message in the family's file.
 */
export async function createEngagement({ familyId, activityId, bodyEn, advocateName }) {
  const family = getFamily(familyId);
  if (!family) throw httpError(404, 'Family not found');

  const activity = getActivity(activityId);
  if (!activity) throw httpError(404, 'Activity not found');

  const body = String(bodyEn || '').trim();
  if (body.length < 2) throw httpError(400, 'Message is empty');
  if (body.length > 2000) throw httpError(400, 'Message is too long');

  const langMeta = language(family.home_language);
  const lang = family.home_language;

  let translated = null;
  let activityTranslation = null;

  if (langMeta.mode === 'text') {
    const [bodyTranslation, actTranslation] = await Promise.all([
      translateText(body, lang),
      ensureActivityTranslation(activity, lang)
    ]);
    translated = bodyTranslation.text;
    activityTranslation = actTranslation;
  } else {
    // Audio-first language: no text card in the parent view. The activity is
    // still named in English for the advocate's own file.
    activityTranslation = {
      title: activity.title_en,
      steps: parseSteps(activity.steps_en),
      prompt: activity.prompt_en,
      source: 'live'
    };
  }

  const messageId = randomUUID();
  const createdAt = nowIso();

  transaction(() => {
    run(
      `INSERT INTO messages (id, family_id, activity_id, body_en, status, created_at, source)
       VALUES (?, ?, ?, ?, 'sent', ?, 'live')`,
      messageId,
      family.id,
      activity.id,
      body,
      createdAt
    );

    if (translated !== null) {
      run(
        `INSERT INTO message_translations
           (id, message_id, lang, body, activity_title, activity_steps,
            activity_prompt, audio_url, source, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, NULL, 'live', ?)`,
        randomUUID(),
        messageId,
        lang,
        translated,
        activityTranslation.title,
        JSON.stringify(activityTranslation.steps),
        activityTranslation.prompt,
        createdAt
      );
    }
  });

  return {
    messageId,
    lang,
    translated,
    activityTranslation,
    accessPath: `/f/${family.access_token}`
  };
}

function translationFor(messageId, lang) {
  return one(
    'SELECT * FROM message_translations WHERE message_id = ? AND lang = ?',
    messageId,
    lang
  );
}

/** What the parent device shows. One latest engagement, in the home language. */
export function getFeed(familyId) {
  const family = getFamily(familyId);
  if (!family) return null;

  const shaped = familyShape(family);
  const message = one(
    `SELECT * FROM messages
      WHERE family_id = ? AND status != 'failed'
      ORDER BY created_at DESC LIMIT 1`,
    family.id
  );

  if (!message) {
    return { family: shaped, message: null, synced_at: nowIso() };
  }

  const activity = getActivity(message.activity_id);
  const langMeta = language(family.home_language);
  const t = translationFor(message.id, family.home_language);

  const textMode = langMeta.mode === 'text';

  return {
    family: shaped,
    message: {
      id: message.id,
      created_at: message.created_at,
      status: message.status,
      completed_at: message.completed_at,
      participants: message.participants,
      source: message.source,
      lang: family.home_language,
      dir: langMeta.dir,
      mode: langMeta.mode,
      body: textMode ? t?.body ?? null : null,
      activity: {
        title: textMode ? t?.activity_title ?? activity?.title_en ?? '' : activity?.title_en ?? '',
        steps: textMode
          ? parseSteps(t?.activity_steps ?? activity?.steps_en ?? '[]')
          : parseSteps(activity?.steps_en ?? '[]'),
        prompt: textMode ? t?.activity_prompt ?? activity?.prompt_en ?? '' : activity?.prompt_en ?? '',
        minutes: activity?.minutes ?? null,
        domain: activity?.domain ?? null
      },
      audio_url: t?.audio_url ?? null,
      translation_source: t?.source ?? null,
      reply_count: one(
        "SELECT COUNT(*) AS n FROM voice_notes WHERE message_id = ? AND status = 'ready'",
        message.id
      ).n,
      replies: all(
        `SELECT * FROM voice_notes WHERE message_id = ? ORDER BY created_at DESC LIMIT 3`,
        message.id
      ).map((v) => ({
        id: v.id,
        created_at: v.created_at,
        status: v.status,
        duration_ms: v.duration_ms,
        audio_url: v.audio_path ? noteAudioUrl(v.id) : null
      })),
      has_note: Boolean(
        one('SELECT 1 AS x FROM documentation_notes WHERE message_id = ?', message.id)
      )
    },
    synced_at: nowIso()
  };
}

/** Advocate's view of one family: history, replies, documentation. */
export function getFamilyDetail(familyId) {
  const family = getFamily(familyId);
  if (!family) return null;

  const messages = all(
    `SELECT * FROM messages WHERE family_id = ? ORDER BY created_at DESC`,
    family.id
  ).map((m) => {
    const activity = getActivity(m.activity_id);
    const t = translationFor(m.id, family.home_language);
    const replies = all(
      `SELECT v.*, f.family_name, f.child_name, f.home_language
         FROM voice_notes v JOIN families f ON f.id = v.family_id
        WHERE v.message_id = ? ORDER BY v.created_at DESC`,
      m.id
    ).map(shapeNote);
    const notes = all(
      'SELECT * FROM documentation_notes WHERE message_id = ? ORDER BY created_at DESC',
      m.id
    ).map((n) => ({
      id: n.id,
      created_at: n.created_at,
      standard: n.standard,
      body: n.body,
      source: n.source
    }));

    return {
      id: m.id,
      created_at: m.created_at,
      status: m.status,
      completed_at: m.completed_at,
      participants: m.participants,
      body_en: m.body_en,
      body_home: t?.body ?? null,
      dir: language(family.home_language).dir,
      source: m.source,
      activity: activity
        ? {
            title: activity.title_en,
            domain: activity.domain,
            scope_ref: activity.scope_ref,
            minutes: activity.minutes
          }
        : null,
      replies,
      notes
    };
  });

  const notes = all(
    `SELECT d.*, m.created_at AS message_created_at
       FROM documentation_notes d
       LEFT JOIN messages m ON m.id = d.message_id
      WHERE d.family_id = ?
      ORDER BY d.created_at DESC`,
    family.id
  ).map((n) => ({
    id: n.id,
    created_at: n.created_at,
    standard: n.standard,
    body: n.body,
    source: n.source,
    model: n.model
  }));

  return {
    family: { ...familyShape(family), access_path: `/f/${family.access_token}` },
    messages,
    notes,
    stats: {
      engagements: messages.filter((m) => m.status !== 'failed').length,
      completed: messages.filter((m) => m.status === 'completed').length,
      replies: messages.reduce((n, m) => n + m.replies.length, 0),
      notes: notes.length
    }
  };
}
