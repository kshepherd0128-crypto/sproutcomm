// SproutComm client. Vanilla JS, no build step, no framework: this has to run
// on a cheap Android phone over a weak connection.

import { PARENT_LOCALES, PARENT_LOCALE_DIR, stringsFor } from './parent-strings.js';

const root = document.getElementById('app');

/* ------------------------------------------------------------------ *
 * Parent-view reading language. This is a view preference only: it is
 * stored per family on this device and never sent to the server.
 * ------------------------------------------------------------------ */

const UI_LANG_PREFIX = 'sproutcomm.ui-lang.';
const LANG_LABEL_ID = {
  en: 'languageEnglish',
  ar: 'languageArabic',
  bn: 'languageBangla',
  syl: 'languageSylheti'
};
const JOINED_LABEL_ID = {
  parent: 'joinedParent',
  parent_child: 'joinedParentChild',
  whole_family: 'joinedWholeFamily',
  other_adult: 'joinedOtherAdult'
};
// Sylheti has no written UI strings. The app already showed Bangla labels to
// a Sylheti-profile household, so keep that fallback; content stays audio-only.
const PROFILE_FALLBACK = { syl: 'bn' };

function defaultUiLang(profile) {
  if (PARENT_LOCALES.includes(profile)) return profile;
  return PROFILE_FALLBACK[profile] ?? 'en';
}

function parentUiLang() {
  const family = state.parentFeed?.family ?? state.session?.family;
  let stored = null;
  if (family?.id) {
    try {
      stored = localStorage.getItem(UI_LANG_PREFIX + family.id);
    } catch {
      stored = null;
    }
  }
  if (PARENT_LOCALES.includes(stored)) return stored;
  return defaultUiLang(family?.home_language);
}

function setParentUiLang(lang) {
  if (!PARENT_LOCALES.includes(lang)) return;
  const family = state.parentFeed?.family ?? state.session?.family;
  if (family?.id) {
    try {
      localStorage.setItem(UI_LANG_PREFIX + family.id, lang);
    } catch {
      /* private mode: the switch still works for this view */
    }
  }
  render();
}

const ICON = {
  leaf: `<svg viewBox="0 0 32 32" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 27V16"/><path d="M16 16c0-5 3.5-9 9-9 0 5-3.5 9-9 9Z"/><path d="M16 16c0-5-3.5-9-9-9 0 5 3.5 9 9 9Z"/></svg>`,
  users: `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
  heart: `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/></svg>`,
  back: `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>`,
  speaker: `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H2v6h4l5 4Z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/></svg>`,
  stop: `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>`,
  mic: `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0"/><path d="M12 17v4"/></svg>`,
  check: `<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>`,
  doc: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/><path d="M8 13h8M8 17h5"/></svg>`,
  clock: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>`
};

/* Polish pack: figures beside the completion sheet's "who joined" labels
 * and a clock beside the minutes. The icons aid recognition for
 * low-literacy parents — the text label always stays, the icon never
 * replaces it. currentColor keeps them in step with the pill: muted ink
 * at rest, white on the selected (green) pill. */
const JOINED_ICON = {
  parent: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="7" r="4"/><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/></svg>`,
  parent_child: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="7.5" r="3.8"/><path d="M2.5 20.5V19a6.5 6.5 0 0 1 13 0v1.5"/><circle cx="17.6" cy="12.5" r="2.5"/><path d="M14.6 20.5v-1a3 3 0 0 1 6 0v1"/></svg>`,
  whole_family: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="6" cy="7.5" r="3"/><path d="M1.5 20.5v-1.3a4.8 4.8 0 0 1 9.6 0v1.3"/><circle cx="18" cy="7.5" r="3"/><path d="M12.9 20.5v-1.3a4.8 4.8 0 0 1 9.6 0v1.3"/><circle cx="12" cy="13.5" r="2.3"/><path d="M8.9 20.5v-.8a3.1 3.1 0 0 1 6.2 0v.8"/></svg>`,
  other_adult: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="10" cy="7.5" r="3.8"/><path d="M3.7 20.5V19a6.3 6.3 0 0 1 12.6 0v1.5"/><path d="M18.6 13.8l.73 2.09 2.22.05-1.76 1.35.66 2.12-1.85-1.26-1.85 1.26.66-2.12-1.76-1.35 2.22-.05Z"/></svg>`
};

/* ------------------------------------------------------------------ *
 * State + helpers
 * ------------------------------------------------------------------ */

const state = {
  screen: 'entry',
  session: null,
  entryMode: null,
  entryFamilyId: null,
  entryBusy: false,
  entryError: null,
  families: null,
  activities: null,
  advocateError: null,
  compose: { familyId: '', activityId: '', body: '' },
  sending: false,
  sendError: null,
  sendResult: null,
  familyDetail: null,
  familyError: null,
  parentFeed: null,
  parentError: null,
  parentLoading: false,
  toast: null,
  speaking: false,
  aiConfigured: null,
  linkError: null,
  booting: false,
  inbox: null,
  inboxKey: '',
  record: { open: false, phase: 'idle', seconds: 0, error: null, blob: null, previewUrl: null },
  retryingNote: null,
  familyDetailJson: '',
  complete: { open: false, participants: null, minutes: null, busy: false, error: null, done: false, queued: false, clientId: null },
  offline: false,
  pendingCount: 0,
  localCompleted: null
};

const SESSION_KEY = 'sproutcomm.session';

function restoreSession() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (parsed?.token && parsed?.role) {
      state.session = parsed;
      state.screen = parsed.role === 'advocate' ? 'advocate' : 'parent';
    }
  } catch {
    /* ignore */
  }
}

function saveSession() {
  if (state.session) sessionStorage.setItem(SESSION_KEY, JSON.stringify(state.session));
  else sessionStorage.removeItem(SESSION_KEY);
}

async function api(path, { method = 'GET', body } = {}) {
  const headers = {};
  if (state.session?.token) headers.authorization = `Bearer ${state.session.token}`;
  if (body !== undefined) headers['content-type'] = 'application/json';

  const res = await fetch(path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });

  let payload = null;
  try {
    payload = await res.json();
  } catch {
    payload = null;
  }
  if (!res.ok) {
    const err = new Error(payload?.error || `Request failed (${res.status})`);
    err.payload = payload;
    err.status = res.status;
    throw err;
  }
  return payload;
}

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function truncateMiddle(text, max = 44) {
  const s = String(text ?? '');
  if (s.length <= max) return s;
  const keep = max - 1;
  const head = Math.ceil(keep * 0.62);
  return `${s.slice(0, head)}…${s.slice(-(keep - head))}`;
}

/* T3: the compose field grows with the message being written. */
function growCompose(el) {
  const ta = el ?? document.getElementById('c-body');
  if (!ta) return;
  ta.style.height = 'auto';
  ta.style.height = `${Math.min(ta.scrollHeight, 320)}px`;
}

const DATE_LOCALE = { en: 'en-US', ar: 'ar', bn: 'bn-BD' };

function fmtDate(iso, lang = 'en') {
  if (!iso) return '';
  const d = new Date(iso);
  const today = new Date();
  const dayMs = 24 * 60 * 60 * 1000;
  const sameDay = d.toDateString() === today.toDateString();
  const yesterday = new Date(today.getTime() - dayMs).toDateString() === d.toDateString();
  const locale = DATE_LOCALE[lang] ?? DATE_LOCALE.en;
  const t = stringsFor(lang);
  const sep = lang === 'ar' ? '، ' : ', ';
  const time = d.toLocaleTimeString(locale, {
    hour: 'numeric',
    minute: '2-digit',
    hour12: lang !== 'bn'
  });
  if (sameDay) return `${t.today}${sep}${time}`;
  if (yesterday) return `${t.yesterday}${sep}${time}`;
  return `${d.toLocaleDateString(locale, { month: 'short', day: 'numeric' })}${sep}${time}`;
}

function fmtNum(value, lang = 'en') {
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value ?? '');
  try {
    return n.toLocaleString(DATE_LOCALE[lang] ?? DATE_LOCALE.en);
  } catch {
    return String(n);
  }
}

function toast(message) {
  state.toast = message;
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = message;
  document.body.querySelectorAll('.toast').forEach((n) => n.remove());
  document.body.appendChild(el);
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.remove(), 2600);
}

function loadingCard(text = 'Loading…') {
  return `<div class="card"><p class="muted small">${esc(text)}</p></div>`;
}

function errorNotice(error) {
  if (!error) return '';
  const detail = error.payload?.upstream_detail
    ? `<div class="small" style="margin-top:6px;opacity:.8">${esc(error.payload.upstream_detail)}</div>`
    : '';
  return `<div class="notice error"><strong>${esc(error.message)}</strong>${detail}</div>`;
}

/* ------------------------------------------------------------------ *
 * Entry screen
 * ------------------------------------------------------------------ */

function renderEntry() {
  const mode = state.entryMode;

  return `
  <div class="screen">
    <div class="entry">
      <div class="brand-hero">
        <div class="mark" style="color:#c7e8a8">${ICON.leaf}</div>
        <h1>SproutComm</h1>
        <p>Home-language family engagement for Head Start, documented as it happens.</p>
      </div>

      ${!mode ? `
        <div class="role-list">
          <button class="role-btn" data-action="choose-role" data-role="advocate">
            <span class="glyph">${ICON.users}</span>
            <span><strong>Program staff</strong><span>Send tonight's engagement, read family replies</span></span>
          </button>
          <button class="role-btn" data-action="choose-role" data-role="parent">
            <span class="glyph">${ICON.heart}</span>
            <span><strong>Family</strong><span>See tonight's message and activity</span></span>
          </button>
        </div>
      ` : mode === 'advocate' ? `
        <div class="card stack">
          <div class="eyebrow">Advocate sign in</div>
          <form data-form="advocate-login" class="stack">
            <div class="field">
              <label for="adv-pin">4-digit passcode</label>
              <input id="adv-pin" class="pin-input" type="tel" inputmode="numeric" maxlength="4" autocomplete="off" placeholder="••••" />
            </div>
            ${errorNotice(state.entryError)}
            <button class="btn btn-primary btn-block" type="submit" ${state.entryBusy ? 'disabled' : ''}>
              ${state.entryBusy ? '<span class="spinner"></span>' : 'Continue'}
            </button>
          </form>
          <p class="hint">Demo passcode: 1111</p>
        </div>
        <button class="btn btn-ghost btn-block" data-action="entry-back">Back</button>
      ` : `
        <div class="card stack">
          <div class="eyebrow">Family access</div>
          <p style="font-size:19px;line-height:1.4">Your family page opens from the link your advocate sent you.</p>
          <p class="small muted">The link is yours alone. It opens only your family's messages and activities.</p>
          ${state.linkError ? errorNotice(state.linkError) : ''}
          ${state.booting ? '<div class="notice">Opening your family page…</div>' : ''}
        </div>
        <button class="btn btn-ghost btn-block" data-action="entry-back">Back</button>
      `}
    </div>
  </div>`;
}

/* ------------------------------------------------------------------ *
 * Advocate
 * ------------------------------------------------------------------ */

function topbar(title, subtitle, { back = false, signOut = true, exitLabel = 'Exit', exitAria = 'Sign out' } = {}) {
  return `
    <div class="topbar">
      ${back ? `<button class="icon-btn" data-action="back" aria-label="Back">${ICON.back}</button>` : `<span class="brand">${ICON.leaf}<span>${esc(title)}</span></span>`}
      ${back ? `<span style="font-weight:700">${esc(title)}</span>` : ''}
      <span class="spacer"></span>
      ${subtitle ? `<span class="who">${esc(subtitle)}</span>` : ''}
      ${signOut ? `<button class="icon-btn" data-action="signout" aria-label="${esc(exitAria)}">${esc(exitLabel)}</button>` : ''}
    </div>`;
}

function starterFor(activity, family) {
  if (!activity || !family) return '';
  return `Good evening, ${family.family_name}! Tonight's activity is "${activity.title}." ${activity.steps[0]} Take ${activity.minutes} minutes together and tell me how it went.`;
}

function renderAdvocate() {
  const families = state.families;
  const activities = state.activities;
  const compose = state.compose;
  const family = families?.find((f) => f.id === compose.familyId);
  const activity = activities?.find((a) => a.id === compose.activityId);
  const translationOffline = state.aiConfigured === false;
  const languageBlocked = translationOffline && family && family.home_language !== 'en';

  return `
  <div class="screen advocate-layout">
    ${topbar('SproutComm', 'Marisol Vega')}
    <div class="content advocate-sections">
      <div class="family-head">
        <div class="eyebrow">Advocate home</div>
        <h2>Tonight</h2>
      </div>

      ${state.aiConfigured === false ? `
        <div class="notice warn">
          <strong>Translation is offline on this server.</strong>
          META_API_KEY is not set, so no message can be translated. English families still work; Arabic and Bangla sends stop before delivery rather than going out untranslated.
        </div>` : ''}

      ${renderInbox()}

      ${state.sendResult ? renderSendResult(state.sendResult) : ''}

      <div class="section-title">Send an engagement</div>
      <form class="card stack compose" data-form="compose">
        <div class="field">
          <label for="c-family">Family</label>
          <select id="c-family" name="family_id" required>
            <option value="">Choose a family</option>
            ${(families ?? []).map((f) => `
              <option value="${esc(f.id)}" ${compose.familyId === f.id ? 'selected' : ''}>${esc(f.family_name)} — ${esc(f.language.englishName)}</option>
            `).join('')}
          </select>
        </div>

        <div class="field">
          <label for="c-activity">Tonight's home activity</label>
          <select id="c-activity" name="activity_id" required>
            <option value="">Choose an activity</option>
            ${(activities ?? []).map((a) => `
              <option value="${esc(a.id)}" ${compose.activityId === a.id ? 'selected' : ''}>${esc(a.title)}</option>
            `).join('')}
          </select>
          ${activity ? `<div class="small muted">${esc(activity.domain)} · ${esc(activity.minutes)} min</div>` : ''}
        </div>

        <div class="field">
          <label for="c-body">Message to the family (English)</label>
          <textarea id="c-body" name="body_en" required rows="3" placeholder="Write the message you would say to this family…">${esc(compose.body)}</textarea>
        </div>

        ${family ? `
          <div class="compose-preview">
            <div class="row" style="justify-content:space-between;margin-bottom:6px">
              <span class="tag">Goes out in ${esc(family.language.nativeName)}</span>
              <span class="small muted">${esc(family.child_name)}, age ${esc(family.child_age)}</span>
            </div>
            <div class="small muted">The family sees this in ${esc(family.language.englishName)}${family.language.mode === 'audio' ? ' with a voice-only card' : ' with a listen button'}. The English original stays in the family file.</div>
          </div>
        ` : ''}

        ${errorNotice(state.sendError)}

        <button class="btn btn-primary btn-block" type="submit" ${state.sending || !families || languageBlocked ? 'disabled' : ''}>
          ${state.sending ? '<span class="spinner"></span> Translating…' : 'Send to family'}
        </button>
        <p class="hint" style="text-align:left">${languageBlocked
          ? 'Sending is paused because this family needs a translation and the AI proxy has no key.'
          : 'The message is translated before it is sent. Nothing is sent if translation fails.'}</p>
      </form>

      <div class="section-title">Families</div>
      <div class="families-grid">
        ${!families ? '<div class="skeleton"></div><div class="skeleton"></div>' : families.map(renderFamilyCard).join('')}
      </div>
    </div>
  </div>`;
}

function renderFamilyCard(f) {
  // T2: one status pill per family — Done wins, then Replied, else Waiting.
  const status = f.last_status === 'completed'
    ? '<span class="tag status-pill">Done</span>'
    : f.reply_count > 0
      ? '<span class="tag status-pill"><span class="status-dot"></span>Replied</span>'
      : '<span class="tag amber status-pill">Waiting</span>';
  const languageLabel = f.home_language === 'en' ? 'English' : f.language.nativeName;

  return `
    <button class="family-card" data-action="open-family" data-family="${esc(f.id)}">
      <div class="fc-top">
        <span class="avatar">${esc(f.child_name.slice(0, 1))}</span>
        <span style="flex:1;min-width:0">
          <span class="fc-name">${esc(f.family_name)}</span>
          <span class="fc-sub" style="display:block">${esc(f.child_name)}, age ${esc(f.child_age)} · ${esc(languageLabel)}</span>
        </span>
        ${status}
      </div>
      <div class="fc-activity small muted">
        <span class="fc-activity-title">${esc(f.last_activity || 'No engagement yet')}</span>
        <span class="fc-activity-time">${f.last_message_at ? esc(fmtDate(f.last_message_at)) : ''}</span>
      </div>
      <div class="row small muted" style="justify-content:space-between">
        <span>${f.reply_count ? `${f.reply_count} voice ${f.reply_count === 1 ? 'reply' : 'replies'}` : 'No voice replies'}</span>
        <span>${f.note_count ? `${f.note_count} note${f.note_count === 1 ? '' : 's'}` : ''}</span>
      </div>
    </button>`;
}

function renderSendResult(result) {
  const t = result.feed?.message;
  return `
    <div class="card stack" style="border-color:#cfe6bc;background:#f7fbf1">
      <div class="row" style="justify-content:space-between">
        <span class="tag">Sent to ${esc(result.feed?.family?.family_name ?? '')}</span>
        <span class="small muted">${esc(fmtDate(t?.created_at))}</span>
      </div>
      ${t?.body ? `<div class="compose-preview" dir="${esc(t.dir)}">${esc(t.body)}</div>` : '<div class="small muted">Delivered as a voice-first card.</div>'}
      <div class="small muted">The family opens this on their phone with a listen option.</div>
      ${result.access_path ? `<button class="btn btn-secondary btn-block" data-action="open-parent" data-path="${esc(result.access_path)}">Open family view</button>` : ''}
    </div>`;
}

function formatNote(text) {
  return esc(text || '')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/^- /gm, '• ');
}

function renderNoteCard(n) {
  const body = (n.body || '').trim();

  // A ready note without text is never shown as a document.
  if (n.status === 'ready' && body) {
    return `
      <div class="card" style="padding:14px">
        <div class="row" style="justify-content:space-between;margin-bottom:8px">
          <span class="tag amber">${esc(n.standard)}</span>
          <span class="small muted">${esc(fmtDate(n.created_at))}</span>
        </div>
        <div class="note-body">${formatNote(body)}</div>
      </div>`;
  }

  if (n.status === 'pending') {
    return `
      <div class="card" style="padding:14px;border-color:#f2ddc0;background:#fffdf8">
        <div class="row" style="justify-content:space-between;margin-bottom:8px">
          <span class="tag amber">${esc(n.standard)}</span>
          <span class="small muted">${esc(fmtDate(n.created_at))}</span>
        </div>
        <p class="small"><span class="status-dot wait"></span><strong>Documentation in progress.</strong> The completion is recorded; the 1302.50 note is being written.</p>
      </div>`;
  }

  return `
    <div class="card" style="padding:14px;border-color:#f0cccc;background:#fffafa">
      <div class="row" style="justify-content:space-between;margin-bottom:8px">
        <span class="tag amber">${esc(n.standard)}</span>
        <span class="small muted">${esc(fmtDate(n.created_at))}</span>
      </div>
      <p class="small"><strong>Documentation could not be generated.</strong> The completion is recorded and stands on its own.</p>
      <p class="small muted" style="margin-top:6px">${esc(n.error || 'No note text was stored.')}</p>
      <button class="btn btn-ghost" style="min-height:44px;margin-top:10px" data-action="retry-note" data-event="${esc(n.event_id || '')}" ${state.retryingNote ? 'disabled' : ''}>
        ${state.retryingNote === n.event_id ? 'Retrying…' : 'Retry the note'}
      </button>
    </div>`;
}

function renderFamilyDetail() {
  const d = state.familyDetail;
  if (!d) {
    return `<div class="screen">${topbar('Family', '', { back: true })}<div class="content">${state.familyError ? errorNotice(state.familyError) : '<div class="skeleton"></div>'}</div></div>`;
  }
  const f = d.family;

  return `
  <div class="screen">
    ${topbar('Family file', '', { back: true })}
    <div class="content">
      <div class="family-head">
        <h2>${esc(f.family_name)}</h2>
        <p class="muted">${esc(f.child_name)}, age ${esc(f.child_age)} · Home language: ${esc(f.language.englishName)}${f.language.mode === 'audio' ? ' · voice-only' : ''}</p>
      </div>

      <div class="row" style="gap:8px;flex-wrap:wrap">
        <span class="tag">${d.stats.engagements} engagement${d.stats.engagements === 1 ? '' : 's'}</span>
        <span class="tag plain">${d.stats.completed} completed</span>
        <span class="tag plain">${d.stats.replies} voice repl${d.stats.replies === 1 ? 'y' : 'ies'}</span>
        <span class="tag amber">${d.stats.notes} 1302.50 note${d.stats.notes === 1 ? '' : 's'}</span>
      </div>

      ${f.access_path ? `
        <div class="card stack" style="padding:14px">
          <div class="row" style="justify-content:space-between">
            <span class="eyebrow">Family link</span>
            <span class="tag plain">private</span>
          </div>
          <div class="small muted">This is the parent's front door. It opens only this family's page.</div>
          <div class="link-box" title="${esc(location.origin + f.access_path)}">
            <code class="sr-only">${esc(location.origin + f.access_path)}</code>
            <span class="link-box-text" aria-hidden="true">${esc(truncateMiddle(location.origin + f.access_path, 44))}</span>
            <button class="btn btn-ghost link-copy" data-action="copy-link" data-path="${esc(f.access_path)}">Copy</button>
          </div>
          <button class="btn btn-secondary btn-nowrap" style="min-height:48px" data-action="open-parent" data-path="${esc(f.access_path)}">Open family view</button>
        </div>` : ''}

      <div class="section-title">Engagements</div>
      <div class="thread">
        ${d.messages.length === 0 ? '<div class="empty">No engagements yet for this family.</div>' : d.messages.map(renderThreadItem).join('')}
      </div>

      <div class="section-title">Documentation file</div>
      ${d.notes.length === 0
        ? '<div class="empty">No documentation yet. Notes appear here after a family confirms an activity.</div>'
        : d.notes.map(renderNoteCard).join('')}
    </div>
  </div>`;
}

function renderThreadItem(m) {
  const statusTag = m.status === 'completed'
    ? '<span class="tag">Completed</span>'
    : '<span class="tag plain">Sent</span>';

  return `
    <div class="card thread-item" style="padding:15px">
      <div class="meta">
        <span>${esc(fmtDate(m.created_at))}</span>
        <span>·</span>
        <span>${esc(m.activity?.title ?? '')}</span>
        ${statusTag}
      </div>
      <div class="thread-body">${esc(m.body_en)}</div>
      ${m.body_home && m.body_home !== m.body_en ? `
        <details>
          <summary class="small muted" style="cursor:pointer">Home-language version</summary>
          <div class="thread-body" dir="${esc(m.dir ?? 'auto')}" style="margin-top:8px">${esc(m.body_home)}</div>
        </details>` : ''}

      ${m.replies.length ? m.replies.map((r) => `
        <div class="compose-preview">
          <div class="row" style="justify-content:space-between;margin-bottom:6px">
            <span class="tag">${ICON.mic} Voice reply</span>
            <span class="small muted">${esc(fmtDate(r.created_at))}</span>
          </div>
          <div class="small muted">${esc(r.transcript ?? '')}</div>
          ${r.transcript_en ? `<div style="margin-top:8px">${esc(r.transcript_en)}</div>` : ''}
        </div>`).join('') : ''}

      ${m.notes.length ? `<div class="small" style="color:#a85b12">${ICON.doc} ${m.notes[0].status === 'ready' && (m.notes[0].body || '').trim() ? '1302.50 note in the family file' : m.notes[0].status === 'pending' ? '1302.50 note in progress' : '1302.50 note needs attention — see the file'}</div>` : ''}
    </div>`;
}

/* ------------------------------------------------------------------ *
 * Parent feed
 * ------------------------------------------------------------------ */

function renderLangSwitch(t, uiLang) {
  return `
    <div class="lang-bar lang-switch-row">
      <span class="eyebrow">${esc(t.languageSwitch)}</span>
      <div class="lang-switch" role="group" aria-label="${esc(t.languageSwitch)}">
        ${PARENT_LOCALES.map((code) => `
          <button type="button" class="lang-choice ${code === uiLang ? 'selected' : ''}" data-action="set-ui-lang" data-lang="${code}" lang="${code}" dir="${PARENT_LOCALE_DIR[code]}" aria-pressed="${code === uiLang ? 'true' : 'false'}">${esc(t[LANG_LABEL_ID[code]])}</button>
        `).join('')}
      </div>
    </div>`;
}

function languageName(t, code, fallback) {
  const id = LANG_LABEL_ID[code];
  return id ? t[id] : fallback;
}

function replyStatus(t, status) {
  if (status === 'ready') return t.replyReady;
  if (status === 'failed' || status === 'no_speech') return t.replyFailed;
  return t.replySending;
}

/* ------------------------------------------------------------------ *
 * F1 — The Growing Sprout. One leaf per completed engagement, visual
 * cap 12 leaves, then a flower. Pure SVG + CSS; no images, no network.
 * ------------------------------------------------------------------ */

/* One leaf shape: a pointed oval from its base on the stem to an
 * upturned tip, with a faint centre vein. Coordinates are rounded so the
 * generated markup stays compact. */
function sproutLeaf(x, y, side, len, wid, fill, cls) {
  const tipX = (x + side * len).toFixed(1);
  const tipY = (y - len * 0.42).toFixed(1);
  const upX = (x + side * len * 0.45).toFixed(1);
  const upY = (y - wid - len * 0.16).toFixed(1);
  const lowY = (y + wid * 0.55).toFixed(1);
  const veinY = (y - len * 0.2).toFixed(1);
  return `<path class="${cls}" d="M${x} ${y} Q${upX} ${upY} ${tipX} ${tipY} Q${upX} ${lowY} ${x} ${y} Z" fill="${fill}" stroke="#0f4429" stroke-width="0.7" stroke-opacity="0.35"/><path d="M${x} ${y} Q${upX} ${veinY} ${tipX} ${tipY}" stroke="#0f4429" stroke-width="0.9" opacity="0.22" fill="none"/>`;
}

function sproutSvg(count, { animateLast = false } = {}) {
  const capped = Math.max(0, Math.min(Number(count) || 0, 12));
  const parts = [];

  // Soil: a soft mound the plant grows out of, with a few soil flecks.
  parts.push('<ellipse cx="30" cy="62.5" rx="21" ry="5" fill="#dcebc8"/>');
  parts.push('<circle cx="19" cy="60.5" r="1.1" fill="#0f4429" opacity="0.16"/><circle cx="41" cy="61" r="1.1" fill="#0f4429" opacity="0.16"/><circle cx="30" cy="61.8" r="0.9" fill="#0f4429" opacity="0.12"/>');

  if (capped === 0) {
    // Just planted: a short stem and the two seed leaves.
    parts.push('<path d="M30 60 C29.6 58 30.4 56.4 30 54.5" stroke="#16643a" stroke-width="3" stroke-linecap="round" fill="none"/>');
    parts.push(sproutLeaf(30, 56.5, -1, 7.5, 3, '#7fb069', 'sprout-leaf'));
    parts.push(sproutLeaf(30, 56.5, 1, 7.5, 3, '#16643a', 'sprout-leaf'));
  } else {
    // A gently curved stem the leaves climb.
    parts.push('<path d="M30 60 C28.4 47 31.6 35 30 21" stroke="#16643a" stroke-width="3.4" stroke-linecap="round" fill="none"/>');
    for (let i = 0; i < capped; i++) {
      const y = 52 - i * 2.75;
      const side = i % 2 === 0 ? -1 : 1;
      const len = 14.5 - i * 0.4;
      const wid = 5.2 - i * 0.15;
      const grow = animateLast && i === capped - 1 ? ' grow' : '';
      parts.push(sproutLeaf(30, y, side, len, wid, i % 2 ? '#7fb069' : '#16643a', `sprout-leaf${grow}`));
    }
    if (capped >= 12) {
      // Full growth: a five-petal flower crowns the stem.
      const petals = [];
      for (let k = 0; k < 5; k++) {
        const a = ((k * 72 - 90) * Math.PI) / 180;
        const px = (30 + 4.4 * Math.cos(a)).toFixed(1);
        const py = (13 + 4.4 * Math.sin(a)).toFixed(1);
        petals.push(`<ellipse cx="${px}" cy="${py}" rx="3.4" ry="2.3" transform="rotate(${k * 72} ${px} ${py})" fill="#e9b44c"/>`);
      }
      parts.push(petals.join(''));
      parts.push('<circle cx="30" cy="13" r="2.4" fill="#a85b12"/>');
    } else {
      // A young upright leaf at the tip — the next leaf on its way.
      parts.push('<path d="M30 12.5 C33.2 16 33.2 19.4 30 22.5 C26.8 19.4 26.8 16 30 12.5 Z" fill="#7fb069" stroke="#0f4429" stroke-width="0.7" stroke-opacity="0.35"/>');
    }
  }

  return `
    <svg class="sprout-svg" viewBox="0 0 60 64" width="54" height="58" aria-hidden="true">
      ${parts.join('')}
    </svg>`;
}

function renderSprout(t, count, uiLang) {
  const n = Number(count) || 0;
  const caption = n > 0
    ? t.sproutFinished.replace('{n}', fmtNum(n, uiLang))
    : t.sproutEmpty;
  return `
    <div class="card sprout-card">
      ${sproutSvg(n)}
      <div class="sprout-meta">
        <div class="eyebrow">${esc(t.growingSprout)}</div>
        <p class="small muted">${esc(caption)}</p>
      </div>
    </div>`;
}

function renderParent() {
  const feed = state.parentFeed;
  const session = state.session;
  const uiLang = parentUiLang();
  const t = stringsFor(uiLang);
  const dir = t.dir;
  const bar = { signOut: true, exitLabel: t.exit, exitAria: t.exitAria };

  if (!feed) {
    return `
      <div class="screen locale-${uiLang}" dir="${dir}" lang="${uiLang}">
        ${topbar(t.appName, session?.family?.child_name ?? '', bar)}
        <div class="content">
          ${state.parentError ? errorNotice(state.parentError) : '<div class="skeleton"></div><div class="skeleton"></div>'}
        </div>
      </div>`;
  }

  const m = feed.message;

  if (!m) {
    return `
      <div class="screen locale-${uiLang}" dir="${dir}" lang="${uiLang}">
        ${topbar(t.appName, feed.family.child_name, bar)}
        <div class="content">
          ${renderLangSwitch(t, uiLang)}
          ${renderSprout(t, feed.completed_count, uiLang)}
          <div class="card done-card">
            <div class="check">${ICON.leaf}</div>
            <h2>${esc(feed.family.family_name)}</h2>
            <p class="muted">${esc(t.noMessage)}</p>
          </div>
        </div>
      </div>`;
  }

  const lang = feed.family.language;
  const contentDir = m.dir ?? 'auto';
  const contentLang = m.lang ?? lang.code;
  const textMode = m.mode === 'text';
  const localPending = state.localCompleted === m.id;
  const done = m.status === 'completed' || localPending;

  return `
  <div class="screen locale-${uiLang}" dir="${dir}" lang="${uiLang}">
    ${topbar(t.appName, feed.family.child_name, bar)}
    <div class="content feed">
      ${renderLangSwitch(t, uiLang)}
      <div class="lang-bar">
        <span class="tag ${lang.dir === 'rtl' ? 'rtl' : ''}" lang="${esc(lang.code)}">${esc(languageName(t, lang.code, lang.nativeName))}</span>
        <span class="small muted">${esc(fmtDate(m.created_at, uiLang))}</span>
      </div>

      ${renderSprout(t, feed.completed_count, uiLang)}

      ${state.offline ? `<div class="notice warn">${esc(t.offlineNote)}</div>` : ''}
      ${state.pendingCount > 0 ? `
        <div class="notice">
          <span class="status-dot wait"></span>${esc(fmtNum(state.pendingCount, uiLang))} ${esc(t.waiting)}
        </div>` : ''}

      <section class="card parent-msg activity-card tonight-card ${done ? 'done-card is-done' : ''}" dir="${dir}">
        <div class="msg-meta">
          <span>${esc(feed.family.family_name)}</span>
          ${done || m.completed_at ? `<span class="tag">${esc(t.doneTag)}</span>` : ''}
        </div>
        <div class="row" style="justify-content:space-between;margin-bottom:8px">
          <span class="eyebrow">${esc(t.activity)}</span>
          <span class="small muted" style="display:flex;align-items:center;gap:5px">${ICON.clock}${esc(fmtNum(m.activity.minutes, uiLang))} ${esc(t.minutes)}</span>
        </div>
        <h2 dir="${esc(contentDir)}" lang="${esc(contentLang)}">${esc(m.activity.title)}</h2>
        ${done ? `
          <div class="done-state">
            <span class="check check-sm">${ICON.check}</span>
            <p class="small muted">${esc(localPending ? t.savedOffline : t.completedNote)}</p>
          </div>` : ''}
        <button class="listen-btn ${state.speaking ? 'playing' : ''}" data-action="listen" type="button">
          ${state.speaking ? ICON.stop : ICON.speaker}<span>${esc(t.listen)}</span>
        </button>
        ${textMode
          ? `<p class="msg-body" dir="${esc(contentDir)}" lang="${esc(contentLang)}">${esc(m.body ?? '')}</p>`
          : `<p class="msg-body" style="font-size:17px;color:#5d6d63">${esc(t.voiceMessage)}</p>`}
        <ol class="steps" dir="${esc(contentDir)}" lang="${esc(contentLang)}">
          ${m.activity.steps.map((s) => `<li class="step"><span>${esc(s)}</span></li>`).join('')}
        </ol>
        ${m.activity.prompt ? `
          <div class="prompt">
            <div class="eyebrow" style="margin-bottom:4px">${esc(t.prompt)}</div>
            <div dir="${esc(contentDir)}" lang="${esc(contentLang)}">${esc(m.activity.prompt)}</div>
          </div>` : ''}
      </section>

      ${m.replies?.length ? `
        <div class="card reply-card" style="padding:14px">
          <div class="row" style="justify-content:space-between;margin-bottom:8px">
            <span class="eyebrow">${esc(t.voiceNote)}</span>
            <span class="small muted">${esc(fmtDate(m.replies[0].created_at, uiLang))}</span>
          </div>
          ${m.replies[0].audio_url
            ? `<audio controls preload="metadata" src="${esc(m.replies[0].audio_url)}" style="width:100%"></audio>`
            : `<p class="small muted">${esc(t.stillUploading)}</p>`}
          <p class="small muted" style="margin-top:8px">${esc(replyStatus(t, m.replies[0].status))}</p>
        </div>` : ''}

      ${!textMode ? `<div class="notice warn">${esc(t.voiceOnlyNotice)}</div>` : ''}
    </div>

    <div class="parent-actions">
      <button class="btn btn-primary btn-block" data-action="complete" ${done ? 'disabled' : ''}>
        ${ICON.check} ${esc(t.weDidIt)}
      </button>
      <button class="btn btn-secondary btn-block" data-action="record">
        ${ICON.mic} ${esc(t.voiceNote)}
      </button>
    </div>
    ${state.record.open ? renderRecorder(t) : ''}
    ${state.complete.open ? renderComplete(t) : ''}
  </div>`;
}

/* ------------------------------------------------------------------ *
 * Listen (browser speech fallback; server audio takes over when present)
 * ------------------------------------------------------------------ */

const SPEECH_LOCALE = { ar: 'ar-SA', bn: 'bn-BD', en: 'en-US', syl: 'bn-BD' };

function speak() {
  const m = state.parentFeed?.message;
  if (!m) return;
  const t = stringsFor(parentUiLang());

  if (!('speechSynthesis' in window)) {
    toast(t.toastNoAudio);
    return;
  }

  if (state.speaking) {
    window.speechSynthesis.cancel();
    state.speaking = false;
    render();
    return;
  }

  const text = m.body ?? '';
  if (!text) {
    toast(t.toastNoVoiceAudio);
    return;
  }

  const locale = SPEECH_LOCALE[m.lang] ?? 'en-US';
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = locale;
  utter.rate = 0.92;

  // Prefer a voice that actually matches the home language; otherwise the
  // phone may read Arabic with an English voice.
  const voices = window.speechSynthesis.getVoices?.() ?? [];
  const base = locale.split('-')[0];
  const match = voices.find((v) => v.lang.replace('_', '-').toLowerCase().startsWith(base));
  if (match) utter.voice = match;

  utter.onend = () => { state.speaking = false; render(); };
  utter.onerror = () => {
    state.speaking = false;
    render();
    toast(t.toastNoAudio);
  };

  state.speaking = true;
  window.speechSynthesis.speak(utter);
  render();
}




/* ------------------------------------------------------------------ *
 * Offline: cached feed + outbox (IndexedDB)
 * ------------------------------------------------------------------ */

const FEED_CACHE_PREFIX = 'sproutcomm.feed.';
const OUTBOX_DB = 'sproutcomm-offline';
const OUTBOX_STORE = 'outbox';

const isNetworkError = (err) => !err || !err.status;

function idb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(OUTBOX_DB, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(OUTBOX_STORE)) {
        db.createObjectStore(OUTBOX_STORE, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function outboxAdd(item) {
  const db = await idb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(OUTBOX_STORE, 'readwrite');
    tx.objectStore(OUTBOX_STORE).put(item);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
  db.close();
  await refreshOutboxCount();
}

async function outboxAll() {
  const db = await idb();
  const items = await new Promise((resolve, reject) => {
    const tx = db.transaction(OUTBOX_STORE, 'readonly');
    const req = tx.objectStore(OUTBOX_STORE).getAll();
    req.onsuccess = () => resolve(req.result ?? []);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return items.sort((a, b) => a.createdAt - b.createdAt);
}

async function outboxDelete(id) {
  const db = await idb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(OUTBOX_STORE, 'readwrite');
    tx.objectStore(OUTBOX_STORE).delete(id);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
  db.close();
  await refreshOutboxCount();
}

async function refreshOutboxCount() {
  try {
    state.pendingCount = (await outboxAll()).length;
  } catch {
    state.pendingCount = 0;
  }
  if (state.screen === 'parent') render();
}

function cacheFeed(feed) {
  try {
    localStorage.setItem(
      FEED_CACHE_PREFIX + feed.family.id,
      JSON.stringify({ saved_at: Date.now(), feed })
    );
  } catch {
    /* private mode or full storage: online use is unaffected */
  }
}

function cachedFeed(familyId) {
  try {
    const raw = localStorage.getItem(FEED_CACHE_PREFIX + familyId);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

async function postVoiceNote(blob, messageId, clientId, filename = 'note.webm') {
  const form = new FormData();
  form.append('audio', blob, filename);
  form.append('message_id', messageId);
  form.append('client_id', clientId);

  let res;
  try {
    res = await fetch('/api/parent/voice-notes', {
      method: 'POST',
      headers: { authorization: `Bearer ${state.session.token}` },
      body: form
    });
  } catch {
    throw Object.assign(new Error('Offline'), { network: true });
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || stringsFor(parentUiLang()).sendRecordingFailed);
    err.status = res.status;
    throw err;
  }
  return data;
}

let flushing = false;

async function flushOutbox({ quiet = false } = {}) {
  if (flushing || !state.session || state.session.role !== 'parent') return;

  const t = stringsFor(parentUiLang());
  flushing = true;
  let sent = 0;
  try {
    const items = await outboxAll();
    for (const item of items) {
      try {
        if (item.type === 'voice-note') {
          await postVoiceNote(item.blob, item.message_id, item.id, item.filename);
        } else if (item.type === 'complete') {
          await api('/api/parent/complete', { method: 'POST', body: item.payload });
        }
        await outboxDelete(item.id);
        state.offline = false;
        sent += 1;
      } catch (err) {
        if (isNetworkError(err) || err.status === 401) break;
        // The server will never accept this item; drop it and say so.
        await outboxDelete(item.id);
        toast(err.message || t.toastSavedItemFailed);
      }
    }
  } finally {
    flushing = false;
  }

  await refreshOutboxCount();
  if (sent > 0) {
    if (!quiet) {
      toast(
        sent === 1
          ? t.toastSavedItemSent
          : t.toastSavedItemsSent.replace('{n}', fmtNum(sent, t.lang))
      );
    }
    if (state.screen === 'parent') {
      state.localCompleted = null;
      await loadParentFeed();
    }
  }
}

/* ------------------------------------------------------------------ *
 * Voice notes
 * ------------------------------------------------------------------ */

let recorder = null;
let recChunks = [];
let recTimer = null;
let recStream = null;
let closeTimer = null;

const formatSecs = (n) => `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`;

function releaseRecorder() {
  clearInterval(recTimer);
  recTimer = null;
  if (recStream) recStream.getTracks().forEach((t) => t.stop());
  recStream = null;
  recorder = null;
  recChunks = [];
}

function openRecorder() {
  if (!state.parentFeed?.message) return;
  clearTimeout(closeTimer);
  state.record = { open: true, phase: 'idle', seconds: 0, error: null, blob: null, previewUrl: null };
  render();
}

function closeRecorder({ refresh = false } = {}) {
  releaseRecorder();
  clearTimeout(closeTimer);
  if (state.record.previewUrl) URL.revokeObjectURL(state.record.previewUrl);
  state.record = { open: false, phase: 'idle', seconds: 0, error: null, blob: null, previewUrl: null };
  render();
  if (refresh) loadParentFeed();
}

async function startRecording() {
  const t = stringsFor(parentUiLang());
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
    state.record.error = t.micOff;
    render();
    return;
  }

  try {
    recStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find(
      (type) => window.MediaRecorder.isTypeSupported?.(type)
    );
    recorder = new MediaRecorder(recStream, mime ? { mimeType: mime } : undefined);
    recChunks = [];

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) recChunks.push(event.data);
    };

    recorder.onstop = () => {
      const blob = new Blob(recChunks, { type: recorder?.mimeType || 'audio/webm' });
      releaseRecorder();
      state.record.blob = blob;
      state.record.previewUrl = URL.createObjectURL(blob);
      state.record.phase = 'review';
      render();
    };

    recorder.start();
    state.record.phase = 'recording';
    state.record.seconds = 0;
    state.record.error = null;
    render();

    recTimer = setInterval(() => {
      state.record.seconds += 1;
      const el = document.querySelector('.rec-timer');
      if (el) el.textContent = formatSecs(state.record.seconds);
      if (state.record.seconds >= 120) stopRecording();
    }, 1000);
  } catch {
    releaseRecorder();
    state.record.error = t.micOff;
    state.record.phase = 'idle';
    render();
  }
}

function stopRecording() {
  clearInterval(recTimer);
  recTimer = null;
  if (recorder && recorder.state !== 'inactive') recorder.stop();
}

async function sendRecording() {
  const blob = state.record.blob;
  if (!blob) return;
  const t = stringsFor(parentUiLang());
  const clientId = crypto.randomUUID();
  const messageId = state.parentFeed.message.id;

  state.record.phase = 'sending';
  state.record.error = null;
  render();

  try {
    await postVoiceNote(blob, messageId, clientId);
    state.record.phase = 'sent';
    render();
    closeTimer = setTimeout(() => closeRecorder({ refresh: true }), 2200);
  } catch (err) {
    if (isNetworkError(err)) {
      await outboxAdd({
        id: clientId,
        type: 'voice-note',
        message_id: messageId,
        blob,
        filename: 'note.webm',
        createdAt: Date.now()
      });
      state.offline = true;
      state.record.phase = 'queued';
      render();
      closeTimer = setTimeout(() => closeRecorder({ refresh: true }), 2400);
      return;
    }
    state.record.phase = 'review';
    state.record.error = err;
    render();
  }
}

function renderRecorder(t) {
  const r = state.record;
  return `
    <div class="sheet-backdrop" data-action="close-record"></div>
    <div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(t.voiceNote)}" dir="${t.rtl ? 'rtl' : 'ltr'}" lang="${t.lang}">
      <div class="grab"></div>
      <div class="eyebrow">${esc(t.voiceNote)}</div>

      ${r.phase === 'idle' ? `
        <p class="rec-status">${esc(t.record)}</p>
        <button class="mic-btn" data-action="start-record" aria-label="${esc(t.record)}">${ICON.mic}</button>
        <label class="btn btn-ghost btn-block" style="cursor:pointer;position:relative">
          ${esc(t.chooseFile)}
          <input type="file" accept="audio/*" data-role="audio-file" style="position:absolute;inset:0;opacity:0;width:100%;height:100%" />
        </label>
        ${r.error ? `<div class="notice error">${esc(r.error.message || r.error)}</div>` : ''}
        <button class="btn btn-ghost btn-block" data-action="close-record">${esc(t.cancel)}</button>
      ` : ''}

      ${r.phase === 'recording' ? `
        <div class="rec-timer">${formatSecs(r.seconds)}</div>
        <button class="mic-btn recording" data-action="stop-record" aria-label="${esc(t.stop)}">${ICON.stop}</button>
        <p class="rec-status">${esc(t.stop)}</p>
      ` : ''}

      ${r.phase === 'review' || r.phase === 'sending' ? `
        <audio controls src="${esc(r.previewUrl || '')}"></audio>
        ${r.error ? `<div class="notice error">${esc(r.error.message || r.error)}</div>` : ''}
        <div class="row-btns">
          <button class="btn btn-ghost" data-action="close-record" ${r.phase === 'sending' ? 'disabled' : ''}>${esc(t.cancel)}</button>
          <button class="btn btn-primary" data-action="send-record" ${r.phase === 'sending' ? 'disabled' : ''}>
            ${r.phase === 'sending' ? '<span class="spinner"></span>' : esc(t.send)}
          </button>
        </div>
      ` : ''}

      ${r.phase === 'sent' ? `
        <div class="done-card">
          <div class="check">${ICON.check}</div>
          <p>${esc(t.sentNote)}</p>
        </div>
      ` : ''}

      ${r.phase === 'queued' ? `
        <div class="done-card">
          <div class="check">${ICON.check}</div>
          <p>${esc(t.savedOffline)}</p>
        </div>
      ` : ''}
    </div>`;
}


/* ------------------------------------------------------------------ *
 * "We did it" completion
 * ------------------------------------------------------------------ */

function openComplete() {
  const message = state.parentFeed?.message;
  if (!message || message.status === 'completed') return;
  clearTimeout(closeTimer);
  // F3: nothing is pre-chosen. The record must be the parent's own taps, so
  // participants and minutes start empty and Confirm stays disabled until
  // the parent picks both.
  state.complete = {
    open: true,
    participants: null,
    minutes: null,
    busy: false,
    error: null,
    done: false,
    queued: false,
    clientId: crypto.randomUUID()
  };
  render();
}

function closeComplete({ refresh = false } = {}) {
  const wasDone = state.complete.done;
  state.complete = {
    open: false,
    participants: null,
    minutes: null,
    busy: false,
    error: null,
    done: false,
    queued: false,
    clientId: null
  };
  render();
  if (refresh || wasDone) loadParentFeed();
}

async function confirmComplete() {
  const c = state.complete;
  const message = state.parentFeed?.message;
  if (!c.open || c.busy || !message) return;
  // F3: a completion with no explicit parent choice is never sent.
  if (!c.participants || !c.minutes) return;

  c.busy = true;
  c.error = null;
  render();

  try {
    await api('/api/parent/complete', {
      method: 'POST',
      body: {
        message_id: message.id,
        participants: c.participants,
        activity_minutes: c.minutes,
        client_id: c.clientId
      }
    });
    c.done = true;
    c.busy = false;
    render();
    closeTimer = setTimeout(() => closeComplete({ refresh: true }), 1900);
  } catch (err) {
    if (isNetworkError(err)) {
      await outboxAdd({
        id: c.clientId,
        type: 'complete',
        payload: {
          message_id: message.id,
          participants: c.participants,
          activity_minutes: c.minutes,
          client_id: c.clientId
        },
        createdAt: Date.now()
      });
      state.offline = true;
      state.localCompleted = message.id;
      c.queued = true;
      c.done = true;
      c.busy = false;
      render();
      closeTimer = setTimeout(() => closeComplete({ refresh: true }), 2400);
      return;
    }
    c.busy = false;
    c.error = err;
    render();
  }
}

function renderComplete(t) {
  const c = state.complete;
  const minutes = [5, 10, 15, 20];
  const ready = Boolean(c.participants) && Boolean(c.minutes);
  const sproutCount = (Number(state.parentFeed?.completed_count) || 0) + 1;

  return `
    <div class="sheet-backdrop" data-action="close-complete"></div>
    <div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(t.weDidIt)}" dir="${t.rtl ? 'rtl' : 'ltr'}" lang="${t.lang}">
      <div class="grab"></div>
      ${c.done ? `
        <div class="done-card">
          <div class="sprout-celebrate">${sproutSvg(sproutCount, { animateLast: true })}</div>
          <h2>${esc(t.weDidIt)}</h2>
          <p>${esc(c.queued ? t.savedOffline : t.noteSaved)}</p>
        </div>
      ` : `
        <div class="eyebrow">${esc(t.activity)}</div>
        <h2>${esc(t.weDidIt)}</h2>

        <div>
          <span class="field-label">${esc(t.whoJoined)}</span>
          <div class="chip-row">
            ${['parent', 'parent_child', 'whole_family', 'other_adult'].map((code) => `
              <button class="chip ${c.participants === code ? 'selected' : ''}" data-action="set-participants" data-value="${code}">
                ${JOINED_ICON[code]}<span>${esc(t[JOINED_LABEL_ID[code]])}</span>
              </button>`).join('')}
          </div>
        </div>

        <div>
          <span class="field-label">${esc(t.howLong)}</span>
          <div class="chip-row">
            ${minutes.map((m) => `
              <button class="chip ${c.minutes === m ? 'selected' : ''}" data-action="set-minutes" data-value="${m}">
                ${ICON.clock}<span>${esc(fmtNum(m, t.lang))} ${esc(t.minutes)}</span>
              </button>`).join('')}
          </div>
        </div>

        ${errorNotice(c.error)}

        <button class="btn btn-primary btn-block" data-action="confirm-complete" ${c.busy || !ready ? 'disabled' : ''}>
          ${c.busy ? '<span class="spinner"></span>' : esc(t.confirm)}
        </button>
        <button class="btn btn-ghost btn-block" data-action="close-complete" ${c.busy ? 'disabled' : ''}>${esc(t.cancel)}</button>
      `}
    </div>`;
}

/* ------------------------------------------------------------------ *
 * Advocate inbox
 * ------------------------------------------------------------------ */

async function loadInbox() {
  try {
    const data = await api('/api/inbox');
    const key = JSON.stringify(data.notes);
    if (key !== state.inboxKey) {
      state.inbox = data.notes;
      state.inboxKey = key;
      if (state.screen === 'advocate') render();
    }
  } catch {
    /* the inbox is not critical to the compose flow */
  }
}

function renderInbox() {
  const notes = state.inbox ?? [];
  if (!notes.length) {
    return `
    <div class="section-title">Family replies</div>
    <div class="empty">No new replies yet. Family voice replies land here first.</div>`;
  }

  return `
    <div class="section-title">Family replies</div>
    <div class="stack">
      ${notes.slice(0, 2).map((n) => {
        const wait = n.status === 'transcribing';
        return `
        <div class="card note-card" style="padding:15px">
          <div class="row" style="justify-content:space-between">
            <span class="tag">${ICON.mic} ${esc(n.family_name)}</span>
            <span class="small muted">${esc(fmtDate(n.created_at))}</span>
          </div>
          ${wait ? `
            <p class="muted small" style="margin-top:8px"><span class="status-dot wait"></span>Transcribing the family's reply…</p>
          ` : n.status === 'ready' ? `
            <p class="translated">${esc(n.transcript_en || '')}</p>
            <details>
              <summary>Original (${esc((n.transcript_lang || n.lang).toUpperCase())})</summary>
              <div class="small" dir="${(n.transcript_lang || n.lang) === 'ar' ? 'rtl' : 'ltr'}" style="margin-top:6px">${esc(n.transcript || '')}</div>
            </details>
            ${n.audio_url ? `<audio controls preload="metadata" src="${esc(n.audio_url)}"></audio>` : ''}
          ` : `
            <p class="muted small" style="margin-top:8px">${esc(n.error || 'This reply could not be processed.')}</p>
          `}
          <div class="row" style="justify-content:space-between;margin-top:10px;gap:8px">
            <span class="small muted" style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(n.child_name)} · ${esc(n.activity_title || 'Engagement')}</span>
            <button class="btn btn-ghost" style="min-height:38px;padding:0 12px;font-size:14px;white-space:nowrap;flex:none" data-action="open-family" data-family="${esc(n.family_id)}">Open file</button>
          </div>
        </div>`;
      }).join('')}
    </div>`;
}

/* ------------------------------------------------------------------ *
 * Data loading
 * ------------------------------------------------------------------ */

async function loadAdvocate() {
  try {
    const [families, activities] = await Promise.all([
      api('/api/families'),
      api('/api/activities')
    ]);
    state.families = families.families;
    state.activities = activities.activities;
    if (!state.compose.familyId && state.families[0]) {
      state.compose.familyId = state.families[0].id;
    }
    if (!state.compose.activityId && state.activities[0]) {
      state.compose.activityId = state.activities[0].id;
    }
    if (!state.compose.body.trim()) {
      state.compose.body = starterFor(
        state.activities.find((a) => a.id === state.compose.activityId),
        state.families.find((f) => f.id === state.compose.familyId)
      );
    }
    state.advocateError = null;
    loadInbox();
  } catch (err) {
    state.advocateError = err;
    if (err.status === 401 || err.status === 403) signOut();
  }
  render();
}

async function loadFamilyDetail(id) {
  state.familyDetail = null;
  state.familyError = null;
  render();
  try {
    state.familyDetail = await api(`/api/families/${encodeURIComponent(id)}`);
    state.familyDetailJson = JSON.stringify(state.familyDetail);
  } catch (err) {
    state.familyError = err;
  }
  render();
}

async function loadParentFeed() {
  state.parentLoading = true;
  try {
    state.parentFeed = await api('/api/parent/feed');
    state.parentError = null;
    state.offline = false;
    cacheFeed(state.parentFeed);
  } catch (err) {
    if (err.status === 401 || err.status === 403) {
      signOut();
      return;
    }
    const cached = state.session?.family?.id ? cachedFeed(state.session.family.id) : null;
    if (isNetworkError(err) && cached) {
      state.parentFeed = cached.feed;
      state.parentError = null;
      state.offline = true;
    } else {
      state.parentError = err;
    }
  }
  state.parentLoading = false;
  await refreshOutboxCount();
  render();
  if (!state.offline) await flushOutbox({ quiet: true });
}

function signOut() {
  if (state.session?.token) {
    fetch('/api/session', {
      method: 'DELETE',
      headers: { authorization: `Bearer ${state.session.token}` }
    }).catch(() => {});
  }
  state.session = null;
  state.screen = 'entry';
  state.entryMode = null;
  state.entryFamilyId = null;
  state.families = null;
  state.parentFeed = null;
  saveSession();
  render();
}

/* ------------------------------------------------------------------ *
 * Render + events
 * ------------------------------------------------------------------ */

function render() {
  const active = document.activeElement;
  const hadBodyFocus = active?.id === 'c-body';
  const caret = hadBodyFocus ? active.selectionStart : null;

  let html = '';
  if (state.screen === 'entry') html = renderEntry();
  else if (state.screen === 'advocate') html = renderAdvocate();
  else if (state.screen === 'family') html = renderFamilyDetail();
  else html = renderParent();

  root.innerHTML = html;

  // The whole page follows the parent's reading language, including the
  // browser's own scrollbar and text direction. Advocate and entry views stay
  // English/LTR.
  const pageLang = state.screen === 'parent' ? parentUiLang() : 'en';
  document.documentElement.lang = pageLang;
  document.documentElement.dir = state.screen === 'parent' ? (PARENT_LOCALE_DIR[pageLang] ?? 'ltr') : 'ltr';

  if (hadBodyFocus) {
    const body = document.getElementById('c-body');
    if (body) {
      body.focus();
      if (caret !== null) body.setSelectionRange(caret, caret);
    }
  }
  growCompose();
}

document.addEventListener('click', async (event) => {
  const el = event.target.closest('[data-action]');
  if (!el) return;
  const action = el.dataset.action;

  if (action === 'choose-role') {
    state.entryMode = el.dataset.role;
    state.entryError = null;
    state.linkError = null;
    render();
    document.querySelector('input')?.focus();
    return;
  }

  if (action === 'entry-back') {
    state.entryMode = null;
    state.entryFamilyId = null;
    state.entryError = null;
    render();
    return;
  }

  if (action === 'signout') {
    signOut();
    return;
  }

  if (action === 'set-ui-lang') {
    setParentUiLang(el.dataset.lang);
    return;
  }

  if (action === 'back') {
    state.screen = 'advocate';
    state.familyDetail = null;
    render();
    return;
  }

  if (action === 'open-family') {
    state.screen = 'family';
    await loadFamilyDetail(el.dataset.family);
    return;
  }

  if (action === 'open-parent') {
    window.location.href = el.dataset.path;
    return;
  }

  if (action === 'copy-link') {
    const url = location.origin + el.dataset.path;
    try {
      await navigator.clipboard.writeText(url);
      toast('Family link copied');
    } catch {
      toast(url);
    }
    return;
  }

  if (action === 'listen') {
    speak();
    return;
  }

  if (action === 'record') {
    openRecorder();
    return;
  }

  if (action === 'start-record') {
    await startRecording();
    return;
  }

  if (action === 'stop-record') {
    stopRecording();
    return;
  }

  if (action === 'send-record') {
    await sendRecording();
    return;
  }

  if (action === 'close-record') {
    closeRecorder();
    return;
  }

  if (action === 'complete') {
    openComplete();
    return;
  }

  if (action === 'set-participants') {
    state.complete.participants = el.dataset.value;
    render();
    return;
  }

  if (action === 'set-minutes') {
    state.complete.minutes = Number(el.dataset.value);
    render();
    return;
  }

  if (action === 'confirm-complete') {
    await confirmComplete();
    return;
  }

  if (action === 'close-complete') {
    if (!state.complete.busy) closeComplete();
    return;
  }

  if (action === 'retry-note') {
    const eventId = el.dataset.event;
    if (!eventId || state.retryingNote) return;
    state.retryingNote = eventId;
    render();
    try {
      await api(`/api/documentation/${encodeURIComponent(eventId)}/retry`, { method: 'POST' });
    } catch {
      /* the refreshed file shows the real state either way */
    }
    state.retryingNote = null;
    await loadFamilyDetail(state.familyDetail?.family.id);
    return;
  }
});

document.addEventListener('submit', async (event) => {
  const form = event.target.closest('form[data-form]');
  if (!form) return;
  event.preventDefault();
  const kind = form.dataset.form;

  if (kind === 'advocate-login') {
    const passcode = form.querySelector('#adv-pin')?.value ?? '';
    state.entryBusy = true;
    state.entryError = null;
    render();
    try {
      const result = await api('/api/session', { method: 'POST', body: { role: 'advocate', passcode } });
      state.session = { token: result.token, role: 'advocate' };
      saveSession();
      state.screen = 'advocate';
      state.entryBusy = false;
      render();
      await loadAdvocate();
    } catch (err) {
      state.entryError = err;
      state.entryBusy = false;
      render();
    }
    return;
  }

  if (kind === 'compose') {
    const familyId = form.querySelector('[name=family_id]').value;
    const activityId = form.querySelector('[name=activity_id]').value;
    const bodyEn = form.querySelector('[name=body_en]').value;
    state.compose = { familyId, activityId, body: bodyEn };

    if (!familyId || !activityId || !bodyEn.trim()) {
      toast('Add a family, activity and message');
      return;
    }

    state.sending = true;
    state.sendError = null;
    state.sendResult = null;
    render();

    try {
      const result = await api('/api/messages', {
        method: 'POST',
        body: { family_id: familyId, activity_id: activityId, body_en: bodyEn }
      });
      state.sendResult = result;
      state.compose = { familyId, activityId, body: '' };
      state.sending = false;
      render();
      window.scrollTo({ top: 0, behavior: 'smooth' });
      await loadAdvocate();
      state.sendResult = result;
      render();
    } catch (err) {
      state.sendError = err;
      state.sending = false;
      render();
    }
  }
});

document.addEventListener('input', (event) => {
  if (event.target.id === 'c-body') {
    state.compose.body = event.target.value;
    growCompose(event.target);
  }
});

document.addEventListener('change', (event) => {
  if (event.target.matches('[data-role="audio-file"]')) {
    const file = event.target.files?.[0];
    if (!file) return;
    state.record.blob = file;
    state.record.previewUrl = URL.createObjectURL(file);
    state.record.phase = 'review';
    state.record.error = null;
    render();
    return;
  }

  const form = event.target.closest('form[data-form="compose"]');
  if (!form) return;
  const familyId = form.querySelector('[name=family_id]').value;
  const activityId = form.querySelector('[name=activity_id]').value;
  const bodyEl = form.querySelector('[name=body_en]');
  const previousFamily = state.compose.familyId;
  const previousActivity = state.compose.activityId;

  state.compose.familyId = familyId;
  state.compose.activityId = activityId;
  state.compose.body = bodyEl.value;

  // Offer a starter message when the activity (or family) changes and the
  // advocate has not written anything custom yet.
  const untouched =
    !state.compose.body.trim() ||
    state.compose.body === starterFor(
      state.activities?.find((a) => a.id === previousActivity),
      state.families?.find((f) => f.id === previousFamily)
    );

  if (untouched && activityId && familyId) {
    const activity = state.activities.find((a) => a.id === activityId);
    const family = state.families.find((f) => f.id === familyId);
    state.compose.body = starterFor(activity, family);
  }

  render();
});

/* ------------------------------------------------------------------ */

// Parent front door: /f/<token> starts a family-pinned session.
function linkToken() {
  const match = location.pathname.match(/^\/f\/([A-Za-z0-9_-]+)\/?$/);
  return match ? match[1] : null;
}

async function bootFromLink(token) {
  state.booting = true;
  state.linkError = null;
  state.screen = 'entry';
  state.entryMode = 'parent';
  render();
  try {
    const result = await api('/api/session', { method: 'POST', body: { role: 'parent', token } });
    state.session = { token: result.token, role: 'parent', family: result.family };
    saveSession();
    try {
      // Remember which family link this device opened, so an offline reopen
      // can trust it without asking the network.
      localStorage.setItem(`sproutcomm.link.${result.family.id}`, token);
    } catch {
      /* storage may be unavailable; online use is unaffected */
    }
    // Keep the link out of the address bar once the session exists.
    history.replaceState({}, '', '/');
    state.booting = false;
    state.screen = 'parent';
    render();
    await loadParentFeed();
  } catch (err) {
    // Offline reopen from the same family link: keep the existing session and
    // show the cached feed. A link for a different family is not trusted.
    const existing = state.session;
    if (isNetworkError(err) && existing?.role === 'parent' && existing.family?.id) {
      let savedLink = null;
      try {
        savedLink = localStorage.getItem(`sproutcomm.link.${existing.family.id}`);
      } catch {
        savedLink = null;
      }
      if (savedLink === token) {
        history.replaceState({}, '', '/');
        state.offline = true;
        state.booting = false;
        state.screen = 'parent';
        render();
        await loadParentFeed();
        return;
      }
    }

    state.booting = false;
    state.linkError = err;
    state.screen = 'entry';
    state.entryMode = 'parent';
    render();
  }
}

async function boot() {
  try {
    const res = await fetch('/health');
    const health = await res.json();
    state.aiConfigured = Boolean(health.ai_configured);
  } catch {
    state.aiConfigured = null;
  }

  restoreSession();

  const token = linkToken();
  if (token) {
    await bootFromLink(token);
    return;
  }

  render();
  if (state.screen === 'advocate') {
    loadAdvocate();
  } else if (state.screen === 'parent') {
    await refreshOutboxCount();
    loadParentFeed();
  }
}

window.addEventListener('online', () => {
  state.offline = false;
  if (state.screen === 'parent') loadParentFeed();
  else flushOutbox({ quiet: true });
});

window.addEventListener('offline', () => {
  state.offline = true;
  if (state.screen === 'parent') render();
});

// A dead link can outlive the browser's online event; retry the queue.
setInterval(() => {
  if (document.hidden) return;
  if (state.session?.role === 'parent' && state.pendingCount > 0) {
    flushOutbox({ quiet: true });
  }
}, 10000);

if ('serviceWorker' in navigator && window.isSecureContext) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}

// While a note is being written, refresh the family file until it lands.
setInterval(async () => {
  if (state.screen !== 'family' || !state.familyDetail || document.hidden || state.retryingNote) return;
  if (!state.familyDetail.notes.some((n) => n.status === 'pending')) return;
  try {
    const detail = await api(`/api/families/${encodeURIComponent(state.familyDetail.family.id)}`);
    const json = JSON.stringify(detail);
    if (json !== state.familyDetailJson) {
      state.familyDetail = detail;
      state.familyDetailJson = json;
      render();
    }
  } catch {
    /* keep the current file on screen */
  }
}, 5000);

// Keep the advocate's reply list fresh while the screen is visible.
setInterval(() => {
  if (state.screen === 'advocate' && state.session?.role === 'advocate' && !document.hidden) {
    loadInbox();
  }
}, 6000);

boot();
