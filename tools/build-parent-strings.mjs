// Build-time only: bake the parent-view UI strings into one dictionary.
//
// The English strings below are the source. Each Arabic and Bangla value is
// produced once, here, through the app's existing Spark translation path
// (server/meta.js -> muse-spark-1.3) and then written as a literal into
// public/parent-strings.js. The browser never calls a translation API when a
// parent taps the language switch.
//
// Run from the repo root:
//   node tools/build-parent-strings.mjs
//
// META_API_KEY is read from the environment or ~/.config/sproutcomm/env. This
// script is not part of `npm start` and is never imported by the client.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { translateText } from '../server/meta.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT = path.join(ROOT, 'public', 'parent-strings.js');

// id -> English source. Keep this list finite and in sync with the parent view.
const SOURCE = {
  appName: 'SproutComm',
  exit: 'Exit',
  exitAria: 'Sign out',
  languageSwitch: 'Reading language',
  languageEnglish: 'English',
  languageArabic: 'Arabic',
  languageBangla: 'Bangla',
  languageSylheti: 'Sylheti (Deshi)',
  today: 'Today',
  yesterday: 'Yesterday',
  noMessage: 'No message tonight yet. Your advocate will send one.',
  offlineNote:
    'You are offline. This is your last saved message; anything you send goes when you are back online.',
  waiting: 'waiting to send',
  weDidIt: 'We did it',
  doneTag: 'Done',
  completedNote:
    "Your advocate has it. This engagement is being added to your family's file.",
  savedOffline: 'Saved on your phone. It will be sent when you are back online.',
  voiceMessage: 'Voice message from your advocate',
  listen: 'Listen',
  activity: "Tonight's activity",
  minutes: 'min',
  prompt: 'Ask your child',
  voiceNote: 'Voice note',
  stillUploading: 'Still uploading…',
  replyReady: 'Your advocate has your voice note.',
  replySending: 'Sending to your advocate…',
  replyFailed: 'We could not hear that recording. Try again.',
  voiceOnlyNotice:
    "This family's home language is delivered by voice only. Text cards are not shown.",
  record: 'Tap to record',
  stop: 'Stop',
  send: 'Send',
  cancel: 'Cancel',
  chooseFile: 'Choose a recording from your phone',
  micOff: 'The microphone is not available. Choose a recording from your phone.',
  sentNote: 'Your voice note was delivered',
  whoJoined: 'Who joined tonight?',
  howLong: 'How long did it take?',
  confirm: 'Confirm',
  noteSaved: "Added to your family's file",
  joinedParent: 'Just me',
  joinedParentChild: 'Me and my child',
  joinedWholeFamily: 'Whole family',
  joinedOtherAdult: 'Another adult',
  toastNoAudio: 'Audio is not available on this phone',
  toastNoVoiceAudio: 'Voice message audio is not connected yet',
  toastSavedItemFailed: 'One saved item could not be sent',
  toastSavedItemSent: 'Saved item sent',
  toastSavedItemsSent: '{n} saved items sent',
  sendRecordingFailed: 'Could not send that recording',
  growingSprout: 'Growing sprout',
  sproutFinished: '{n} finished',
  sproutEmpty: 'Finish an activity to grow your first leaf',
  sectionReplies: 'Family replies',
  sectionSend: 'Send an engagement',
  sectionFamilies: 'Families',
  statusReplied: 'Replied',
  statusWaiting: 'Waiting',
  statusDone: 'Done'
};

// The product name is a proper noun and is intentionally identical everywhere.
const LATIN_ALLOWED = new Set(['appName']);

// A short human review pass after Spark produced the first table. These keep
// the parent view's terminology consistent with the rest of the app (one word
// for "advocate", one word for "voice note") and fix one mistranslation
// ("still uploading" came back as "downloading"). They are applied on every
// rebuild so the baked file stays reproducible.
const REVIEW_FIXES = {
  ar: {
    noMessage: 'لا توجد رسالة الليلة بعد. سيرسل لكم مستشاركم رسالة.',
    offlineNote:
      'لا يوجد اتصال. هذه آخر رسالة محفوظة على هاتفكم. ما ترسلونه الآن سيُرسل عند عودة الاتصال.',
    waiting: 'في انتظار الإرسال',
    weDidIt: 'أنجزنا النشاط',
    completedNote: 'وصل النشاط إلى مستشاركم. يُضاف الآن إلى ملف عائلتكم.',
    savedOffline: 'تم الحفظ على هاتفكم. سيُرسل عند عودة الاتصال.',
    voiceMessage: 'رسالة صوتية من مستشاركم',
    minutes: 'دقائق',
    prompt: 'اسألوا طفلكم',
    voiceNote: 'ملاحظة صوتية',
    stillUploading: 'جارٍ رفع التسجيل…',
    replyReady: 'وصلت ملاحظتكم الصوتية إلى مستشاركم.',
    replySending: 'جارٍ الإرسال إلى مستشاركم…',
    replyFailed: 'لم نتمكن من سماع هذا التسجيل. حاولوا مرة أخرى.',
    stop: 'إيقاف',
    send: 'إرسال',
    chooseFile: 'اختاروا تسجيلاً من هاتفكم',
    micOff: 'الميكروفون غير متاح. اختاروا تسجيلاً من هاتفكم.',
    sentNote: 'وصلت ملاحظتكم الصوتية',
    whoJoined: 'من شارك الليلة؟',
    howLong: 'كم استغرق النشاط؟',
    noteSaved: 'تم التسجيل في ملف عائلتكم',
    joinedWholeFamily: 'كل العائلة',
    joinedOtherAdult: 'شخص بالغ آخر',
    languageSylheti: 'السيلهيتية (ديشي)'
  },
  bn: {
    noMessage: 'আজ রাতে এখনও কোনো বার্তা নেই। আপনার অ্যাডভোকেট একটি বার্তা পাঠাবেন।',
    offlineNote:
      'ইন্টারনেট নেই। এটি আপনার সর্বশেষ সংরক্ষিত বার্তা। এখন যা পাঠাবেন, ইন্টারনেট ফিরলে পাঠানো হবে।',
    waiting: 'পাঠানোর অপেক্ষায়',
    weDidIt: 'আমরা করেছি',
    doneTag: 'সম্পন্ন',
    completedNote:
      'আপনার অ্যাডভোকেট এটি পেয়েছেন। কাজটি আপনার পরিবারের ফাইলে যোগ হচ্ছে।',
    savedOffline: 'ফোনে সংরক্ষিত হয়েছে। ইন্টারনেট ফিরলে পাঠানো হবে।',
    voiceMessage: 'আপনার অ্যাডভোকেটের কণ্ঠ বার্তা',
    activity: 'আজ রাতের কাজ',
    prompt: 'সন্তানকে জিজ্ঞাসা করুন',
    voiceNote: 'কণ্ঠ বার্তা',
    replyReady: 'আপনার অ্যাডভোকেটের কাছে আপনার কণ্ঠ বার্তা পৌঁছেছে।',
    replySending: 'আপনার অ্যাডভোকেটের কাছে পাঠানো হচ্ছে…',
    replyFailed: 'আমরা ওই রেকর্ডিংটি শুনতে পাইনি। আবার চেষ্টা করুন।',
    voiceOnlyNotice:
      'এই পরিবারের ঘরের ভাষা শুধুমাত্র কণ্ঠে শোনানো হয়। লেখার কার্ড দেখানো হয় না।',
    record: 'রেকর্ড করতে চাপুন',
    chooseFile: 'ফোন থেকে রেকর্ডিং বাছুন',
    micOff: 'মাইক ব্যবহার করা যাচ্ছে না। ফোন থেকে রেকর্ডিং বেছে নিন।',
    sentNote: 'আপনার কণ্ঠ বার্তা পৌঁছেছে',
    whoJoined: 'আজ কে কে ছিলেন?',
    howLong: 'কাজটি কত সময় নিয়েছে?',
    noteSaved: 'আপনার পরিবারের ফাইলে লিপিবদ্ধ হয়েছে',
    joinedParentChild: 'আমি ও আমার সন্তান',
    joinedOtherAdult: 'অন্য একজন প্রাপ্তবয়স্ক',
    exitAria: 'প্রস্থান করুন',
    toastNoVoiceAudio: 'কণ্ঠ বার্তার অডিও এখনও সংযুক্ত হয়নি',
    toastSavedItemFailed: 'সংরক্ষিত একটি আইটেম পাঠানো যায়নি',
    toastSavedItemSent: 'সংরক্ষিত আইটেম পাঠানো হয়েছে'
  }
};

const LOCALES = ['ar', 'bn'];
const SCRIPT = { ar: /\p{Script=Arabic}/u, bn: /\p{Script=Bengali}/u };

function validate(locale, id, value) {
  if (!value) throw new Error(`${locale}/${id}: empty translation`);
  if (LATIN_ALLOWED.has(id)) return;
  if (!SCRIPT[locale].test(value)) {
    throw new Error(`${locale}/${id}: no ${locale === 'ar' ? 'Arabic' : 'Bengali'} script: ${value}`);
  }
  const latin = value.match(/[A-Za-z]{2,}/g);
  if (latin) throw new Error(`${locale}/${id}: untranslated Latin text: ${latin.join(', ')} — ${value}`);
  if (id === 'toastSavedItemsSent' && !value.includes('{n}')) {
    throw new Error(`${locale}/${id}: lost the {n} placeholder: ${value}`);
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const strings = {};
  for (const id of Object.keys(SOURCE)) {
    strings[id] = { en: SOURCE[id] };
  }

  for (const locale of LOCALES) {
    console.log(`\n${locale}: translating ${Object.keys(SOURCE).length} strings with muse-spark-1.3`);
    let n = 0;
    for (const [id, text] of Object.entries(SOURCE)) {
      n += 1;
      if (LATIN_ALLOWED.has(id)) {
        strings[id][locale] = text;
        console.log(`  ${n}/${Object.keys(SOURCE).length} ${id} (proper noun)`);
        continue;
      }
      let lastError = null;
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          const result = await translateText(text, locale);
          const value = result.text.replace(/^["“]|["”]$/g, '').trim();
          validate(locale, id, value);
          strings[id][locale] = value;
          lastError = null;
          break;
        } catch (err) {
          lastError = err;
          console.error(`  ${n}/${Object.keys(SOURCE).length} ${id} attempt ${attempt} failed: ${err.message}`);
          await sleep(600 * attempt);
        }
      }
      if (lastError) throw lastError;
      console.log(`  ${n}/${Object.keys(SOURCE).length} ${id}`);
    }

    for (const [id, value] of Object.entries(REVIEW_FIXES[locale] ?? {})) {
      validate(locale, id, value);
      strings[id][locale] = value;
    }
    console.log(`  applied ${Object.keys(REVIEW_FIXES[locale] ?? {}).length} review fixes`);
  }

  const lines = Object.entries(strings).map(
    ([id, values]) =>
      `  ${JSON.stringify(id)}: { en: ${JSON.stringify(values.en)}, ar: ${JSON.stringify(values.ar)}, bn: ${JSON.stringify(values.bn)} }`
  );

  const body = `// Parent-view UI strings, baked at build time.
//
// Source: tools/build-parent-strings.mjs. The Arabic and Bangla values were
// produced once with the app's Spark translation path (muse-spark-1.3) and are
// literals here. Nothing in this file calls the network at runtime.
//
// Shape: id -> { en, ar, bn }. Sylheti has no written UI strings on purpose:
// it stays audio-first, and the switch offers English, Arabic and Bangla only.

export const PARENT_STRINGS = {
${lines.join(',\n')}
};

export const PARENT_LOCALES = ['en', 'ar', 'bn'];

export const PARENT_LOCALE_DIR = { en: 'ltr', ar: 'rtl', bn: 'ltr' };

/** All parent-view strings for one locale, plus its reading direction. */
export function stringsFor(lang) {
  const code = PARENT_LOCALES.includes(lang) ? lang : 'en';
  const out = { lang: code, rtl: code === 'ar', dir: PARENT_LOCALE_DIR[code] };
  for (const id of Object.keys(PARENT_STRINGS)) {
    out[id] = PARENT_STRINGS[id][code] ?? PARENT_STRINGS[id].en;
  }
  return out;
}
`;

  fs.writeFileSync(OUT, body);
  console.log(`\nWrote ${path.relative(ROOT, OUT)} (${Object.keys(strings).length} strings x 3 locales).`);
}

main().catch((err) => {
  console.error(`\nBuild failed: ${err.message}`);
  process.exitCode = 1;
});
