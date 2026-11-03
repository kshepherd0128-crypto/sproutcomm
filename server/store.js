// Domain logic for the slice: families, engagements, the parent feed.

import { randomUUID } from 'node:crypto';
import { all, one, run, transaction } from './db.js';
import { language } from './languages.js';
import { documentEngagement, translateText } from './meta.js';
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

/* ------------------------------------------------------------------ *
 * Completion + HSPPS 1302.50 documentation
 * ------------------------------------------------------------------ */

const PARTICIPANT_CODES = {
  parent: () => 'Parent',
  parent_child: (family) => `${family.child_name} and parent`,
  whole_family: () => 'Whole family',
  other_adult: () => 'Parent and another adult'
};

function resolveParticipants(family, participants) {
  const raw = String(participants || '').trim();
  if (PARTICIPANT_CODES[raw]) return PARTICIPANT_CODES[raw](family);
  if (raw) return raw.slice(0, 140);
  return `${family.child_name} and parent`;
}

const displayTime = (iso) =>
  new Date(iso).toLocaleString('en-US', { dateStyle: 'long', timeStyle: 'short', timeZone: 'America/Detroit' });

/**
 * The Wonder payload is assembled only from rows already on disk plus the
 * participants and minutes the parent supplied at confirmation. Nothing is
 * inferred, summarised, or added from outside the record.
 */
export function buildEngagementEvent(event) {
  const family = getFamily(event.family_id);
  const message = one('SELECT * FROM messages WHERE id = ?', event.message_id);
  const activity = message ? getActivity(message.activity_id) : null;
  const reply = message
    ? one(
        `SELECT * FROM voice_notes
          WHERE message_id = ? AND status = 'ready'
            AND transcript_en IS NOT NULL AND trim(transcript_en) <> ''
          ORDER BY created_at DESC LIMIT 1`,
        message.id
      )
    : null;

  return {
    completed_at: displayTime(event.occurred_at),
    family: {
      name: family.family_name,
      child: family.child_name,
      child_age: family.child_age,
      home_language: language(family.home_language).englishName
    },
    activity: activity
      ? {
          title: activity.title_en,
          domain: activity.domain,
          scope_reference: activity.scope_ref
        }
      : null,
    participants: event.participants,
    activity_minutes: event.activity_minutes,
    advocate_message_sent_at: message ? displayTime(message.created_at) : null,
    family_voice_reply: reply ? reply.transcript_en : null,
    standard: 'HSPPS 1302.50'
  };
}

export async function generateNote(eventId) {
  const event = one('SELECT * FROM completion_events WHERE id = ?', eventId);
  if (!event) throw httpError(404, 'Completion not found');

  const note = one(
    'SELECT * FROM documentation_notes WHERE event_id = ? ORDER BY created_at ASC LIMIT 1',
    eventId
  );
  if (!note) throw httpError(404, 'No documentation record for this completion');

  run("UPDATE documentation_notes SET status = 'pending', error = NULL WHERE id = ?", note.id);

  try {
    const { text } = await documentEngagement(buildEngagementEvent(event));

    // A note without a body is not a note. Treat it exactly like a generation
    // failure so the file shows an honest state instead of an empty document.
    const body = String(text || '').trim();
    if (body.length < 40) {
      throw new Error('Documentation returned no usable text');
    }

    // Status and body land in the same UPDATE: a 'ready' row always has text.
    run(
      "UPDATE documentation_notes SET status = 'ready', body = ?, error = NULL WHERE id = ?",
      body,
      note.id
    );
    return { ...note, status: 'ready', body, error: null };
  } catch (err) {
    const message = String(err.message || 'Documentation could not be generated').slice(0, 300);
    run(
      "UPDATE documentation_notes SET status = 'failed', error = ? WHERE id = ?",
      message,
      note.id
    );
    // The completion stands on its own; the file shows the note as failed.
    return { ...note, status: 'failed', error: message };
  }
}

export async function retryNote(eventId) {
  const event = one('SELECT * FROM completion_events WHERE id = ?', eventId);
  if (!event) throw httpError(404, 'Completion not found');
  const note = await generateNote(eventId);
  return {
    id: note.id,
    status: note.status,
    body: note.status === 'ready' ? note.body : null,
    error: note.error ?? null
  };
}

function completionResult(event) {
  const message = one('SELECT * FROM messages WHERE id = ?', event.message_id);
  const note = one(
    'SELECT * FROM documentation_notes WHERE event_id = ? ORDER BY created_at ASC LIMIT 1',
    event.id
  );
  return {
    event: {
      id: event.id,
      occurred_at: event.occurred_at,
      participants: event.participants,
      activity_minutes: event.activity_minutes
    },
    message: message
      ? {
          id: message.id,
          status: message.status,
          completed_at: message.completed_at,
          participants: message.participants
        }
      : null,
    note: note
      ? {
          id: note.id,
          status: note.status,
          body: note.status === 'ready' && note.body?.trim() ? note.body : null,
          error: note.error ?? null,
          standard: note.standard
        }
      : null
  };
}

/**
 * Parent confirms the activity. The completion is recorded immediately; the
 * Wonder note is generated in the background and can fail without taking the
 * completion down with it.
 */
export async function completeEngagement({
  familyId,
  messageId,
  participants,
  activityMinutes,
  clientId
}) {
  const family = getFamily(familyId);
  if (!family) throw httpError(404, 'Family not found');

  // Idempotency: a retry of the same tap returns the original event + note.
  if (clientId) {
    const existing = one('SELECT * FROM completion_events WHERE client_id = ?', clientId);
    if (existing) return completionResult(existing);
  }

  const message = messageId
    ? one('SELECT * FROM messages WHERE id = ? AND family_id = ?', messageId, familyId)
    : null;
  if (!message) throw httpError(404, "That engagement is not in this family's file");

  // One completion per engagement, even if the device sends a new id.
  const already = one(
    'SELECT * FROM completion_events WHERE message_id = ? ORDER BY created_at ASC LIMIT 1',
    message.id
  );
  if (already) return completionResult(already);

  if (message.status !== 'sent') {
    throw httpError(409, 'This engagement cannot be completed');
  }

  const activity = getActivity(message.activity_id);
  const minutes = Number(activityMinutes) > 0
    ? Math.min(Math.round(Number(activityMinutes)), 180)
    : activity?.minutes ?? null;

  const eventId = randomUUID();
  const noteId = randomUUID();
  const occurredAt = nowIso();
  const participantsText = resolveParticipants(family, participants);

  transaction(() => {
    run(
      `INSERT INTO completion_events
         (id, client_id, message_id, family_id, participants, activity_minutes, occurred_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      eventId,
      clientId || null,
      message.id,
      family.id,
      participantsText,
      minutes,
      occurredAt,
      occurredAt
    );
    run(
      "UPDATE messages SET status = 'completed', participants = ?, completed_at = ? WHERE id = ?",
      participantsText,
      occurredAt,
      message.id
    );
    run(
      `INSERT INTO documentation_notes
         (id, family_id, message_id, event_id, standard, body, model, source, status, created_at)
       VALUES (?, ?, ?, ?, ?, '', ?, 'live', 'pending', ?)`,
      noteId,
      family.id,
      message.id,
      eventId,
      'HSPPS 1302.50',
      'muse-wonder-1.0',
      occurredAt
    );
  });

  const event = one('SELECT * FROM completion_events WHERE id = ?', eventId);
  void generateNote(eventId);
  return completionResult(event);
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
  // Read-only progress count for the parent's Growing Sprout (F1): how many
  // engagements this family has completed. No record logic changes.
  const completedCount = one(
    'SELECT COUNT(*) AS n FROM completion_events WHERE family_id = ?',
    family.id
  ).n;
  const message = one(
    `SELECT * FROM messages
      WHERE family_id = ? AND status != 'failed'
      ORDER BY created_at DESC LIMIT 1`,
    family.id
  );

  if (!message) {
    return { family: shaped, message: null, completed_count: completedCount, synced_at: nowIso() };
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
    completed_count: completedCount,
    synced_at: nowIso()
  };
}

/* ------------------------------------------------------------------ *
 * Teacher / advocate documentation toolkit: doc log + referrals.
 * Advocate-side only. Attempts are doc-log entries of call / text /
 * visit types — there is no separate attempts system; the header
 * documentation count is simply the doc-log length.
 * ------------------------------------------------------------------ */

export const DOC_ENTRY_TYPES = [
  'Home visit',
  'Phone call',
  'Text or message',
  'Office meeting',
  'School event',
  'Referral',
  'Follow-up',
  'Absence follow-up'
];

export const REFERRAL_CATEGORIES = [
  'Housing',
  'Food',
  'Health',
  'Mental health',
  'Employment',
  'Childcare',
  'Other'
];

export const REFERRAL_STATUSES = ['Pending', 'Completed', 'Family declined', 'No response'];

function shapeDocEntry(row) {
  if (!row) return null;
  return {
    id: row.id,
    family_id: row.family_id,
    entry_type: row.entry_type,
    note_text: row.note_text,
    outcome: row.outcome ?? null,
    occurred_at: row.occurred_at,
    occurred_display: displayTime(row.occurred_at),
    created_at: row.created_at
  };
}

function shapeReferral(row) {
  if (!row) return null;
  return {
    id: row.id,
    family_id: row.family_id,
    category: row.category,
    agency_name: row.agency_name,
    date_referred: row.date_referred,
    status: row.status,
    follow_up_date: row.follow_up_date ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

export function listDocEntries(familyId) {
  return all(
    'SELECT * FROM doc_entries WHERE family_id = ? ORDER BY occurred_at DESC, created_at DESC',
    familyId
  ).map(shapeDocEntry);
}

export function listReferrals(familyId) {
  return all(
    'SELECT * FROM referrals WHERE family_id = ? ORDER BY date_referred DESC, created_at DESC',
    familyId
  ).map(shapeReferral);
}

function cleanDate(value, field) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const datePart = raw.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datePart) || Number.isNaN(new Date(`${datePart}T12:00:00Z`).getTime())) {
    throw httpError(400, `${field} is not a valid date`);
  }
  return datePart;
}

export function createDocEntry({ familyId, entryType, noteText, outcome, occurredAt, clientId }) {
  const family = getFamily(familyId);
  if (!family) throw httpError(404, 'Family not found');

  // Idempotency: a retry of the same submit returns the original entry.
  if (clientId) {
    const existing = one('SELECT * FROM doc_entries WHERE client_id = ?', String(clientId));
    if (existing) return { entry: shapeDocEntry(existing), duplicate: true };
  }

  const type = String(entryType || '').trim();
  if (!DOC_ENTRY_TYPES.includes(type)) throw httpError(400, 'Choose a documentation type');

  const note = String(noteText || '').trim();
  if (note.length < 2) throw httpError(400, 'Note is empty');
  if (note.length > 4000) throw httpError(400, 'Note is too long');

  const outcomeText = String(outcome || '').trim().slice(0, 1000) || null;

  let occurred = nowIso();
  if (occurredAt) {
    const parsed = new Date(occurredAt);
    if (Number.isNaN(parsed.getTime())) throw httpError(400, 'Date and time are not valid');
    occurred = parsed.toISOString();
  }

  const id = randomUUID();
  const createdAt = nowIso();
  run(
    `INSERT INTO doc_entries
       (id, client_id, family_id, entry_type, note_text, outcome, occurred_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    clientId ? String(clientId) : null,
    family.id,
    type,
    note,
    outcomeText,
    occurred,
    createdAt
  );
  return { entry: shapeDocEntry(one('SELECT * FROM doc_entries WHERE id = ?', id)), duplicate: false };
}

export function createReferral({ familyId, category, agencyName, dateReferred, status, followUpDate, clientId }) {
  const family = getFamily(familyId);
  if (!family) throw httpError(404, 'Family not found');

  if (clientId) {
    const existing = one('SELECT * FROM referrals WHERE client_id = ?', String(clientId));
    if (existing) return { referral: shapeReferral(existing), duplicate: true };
  }

  const cat = String(category || '').trim();
  if (!REFERRAL_CATEGORIES.includes(cat)) throw httpError(400, 'Choose a service category');

  const agency = String(agencyName || '').trim();
  if (agency.length < 2) throw httpError(400, 'Agency name is empty');
  if (agency.length > 300) throw httpError(400, 'Agency name is too long');

  const referred = cleanDate(dateReferred, 'Date referred') || nowIso().slice(0, 10);
  const followUp = followUpDate ? cleanDate(followUpDate, 'Follow-up date') : null;

  const st = String(status || 'Pending').trim();
  if (!REFERRAL_STATUSES.includes(st)) throw httpError(400, 'Choose a referral status');

  const id = randomUUID();
  const createdAt = nowIso();
  run(
    `INSERT INTO referrals
       (id, client_id, family_id, category, agency_name, date_referred, status, follow_up_date, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    clientId ? String(clientId) : null,
    family.id,
    cat,
    agency,
    referred,
    st,
    followUp,
    createdAt,
    createdAt
  );
  return { referral: shapeReferral(one('SELECT * FROM referrals WHERE id = ?', id)), duplicate: false };
}

export function updateReferralStatus({ familyId, referralId, status }) {
  const family = getFamily(familyId);
  if (!family) throw httpError(404, 'Family not found');
  const existing = one('SELECT * FROM referrals WHERE id = ? AND family_id = ?', referralId, familyId);
  if (!existing) throw httpError(404, 'Referral not found');
  const st = String(status || '').trim();
  if (!REFERRAL_STATUSES.includes(st)) throw httpError(400, 'Choose a referral status');
  run('UPDATE referrals SET status = ?, updated_at = ? WHERE id = ?', st, nowIso(), referralId);
  return { referral: shapeReferral(one('SELECT * FROM referrals WHERE id = ?', referralId)) };
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
      source: n.source,
      status: n.status,
      error: n.error,
      event_id: n.event_id
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
    model: n.model,
    status: n.status,
    error: n.error,
    event_id: n.event_id
  }));

  const docEntries = listDocEntries(family.id);
  const referrals = listReferrals(family.id);

  return {
    family: { ...familyShape(family), access_path: `/f/${family.access_token}` },
    messages,
    notes,
    doc_entries: docEntries,
    referrals,
    stats: {
      engagements: messages.filter((m) => m.status !== 'failed').length,
      completed: messages.filter((m) => m.status === 'completed').length,
      replies: messages.reduce((n, m) => n + m.replies.length, 0),
      notes: notes.length,
      documentation: docEntries.length
    }
  };
}
