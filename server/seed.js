// Synthetic demo data. Every family, child and message here is invented.
// No real Head Start family data is ever used in this project.

import { randomBytes, randomUUID } from 'node:crypto';
import { db, isSeeded, one, transaction } from './db.js';

const now = () => new Date().toISOString();
const yesterday = () => {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  d.setHours(18, 30, 0, 0);
  return d.toISOString();
};

export const ACTIVITIES = [
  {
    id: 'act-picture-walk',
    title_en: 'Picture walk: tell the story from the pictures',
    domain: 'Dialogic reading',
    scope_ref: 'Wayne Metro Pre-K scope & sequence — Unit 2: My Family & My Home',
    steps_en: [
      'Look at the cover together and ask: what do you think happens in this story?',
      'Read one page, then pause. Ask your child what they see in the picture.',
      'At the end, ask your child to tell the story back in their own words.'
    ],
    prompt_en: 'Ask your child: what should we read together tomorrow?',
    minutes: 10
  },
  {
    id: 'act-kitchen-letters',
    title_en: 'Letters in our kitchen',
    domain: 'Letter knowledge',
    scope_ref: 'Wayne Metro Pre-K scope & sequence — Unit 3: Letters All Around',
    steps_en: [
      'Find three packages or boxes in the kitchen with letters on them.',
      'Point to one letter. Say its name, then its sound. Ask your child to say it too.',
      'Ask your child to trace that letter on the table with a finger.'
    ],
    prompt_en: 'Ask your child: which letter starts your name?',
    minutes: 8
  },
  {
    id: 'act-counting-stairs',
    title_en: 'Counting on the stairs',
    domain: 'Counting in daily routines',
    scope_ref: 'Michigan pre-K early learning standards — Math: Number & Operations',
    steps_en: [
      'Count the stairs out loud together as you go up or down.',
      'Ask: how many steps to the top? Count again to check.',
      'Find three spoons at dinner. Ask: is this more or fewer than three cups?'
    ],
    prompt_en: 'Ask your child: what is something we can count in our home?',
    minutes: 5
  },
  {
    id: 'act-dinner-questions',
    title_en: 'Two questions at dinner',
    domain: 'Family conversation',
    scope_ref: 'Head Start school readiness — Social & emotional development',
    steps_en: [
      'At a meal, take turns answering: what made you smile today?',
      'Then ask: what was hard today?',
      'Let your child ask you the same two questions.'
    ],
    prompt_en: 'Ask your child: who is someone you helped today?',
    minutes: 6
  }
];

const SEED_ENGAGEMENTS = [
  {
    family: {
      id: 'fam-haddad',
      family_name: 'Haddad family',
      child_name: 'Layla',
      child_age: 4,
      home_language: 'ar'
    },
    activity_id: 'act-picture-walk',
    body_en:
      'Good evening, Haddad family! Tonight we are doing a picture walk with Layla. Sit together, look at the pictures, and ask Layla what she notices. Tell me how it went.',
    translation: {
      lang: 'ar',
      body:
        'مساء الخير، عائلة حداد! الليلة سنقوم بجولة في صور القصة مع ليلى. اجلسوا معًا، انظروا إلى الصور، واسألوا ليلى عمّا تلاحظه. أخبروني كيف سار الأمر.',
      activity_title: 'جولة في الصور: احكِ القصة من الصور',
      activity_steps: [
        'انظروا إلى غلاف الكتاب معًا واسألوا: ماذا سيحدث في هذه القصة برأيكم؟',
        'اقرؤوا صفحة واحدة ثم توقفوا. اسألوا ليلى عمّا تراه في الصورة.',
        'في النهاية، اطلبوا من ليلى أن تحكي القصة بأسلوبها.'
      ],
      activity_prompt: 'اسألوا ليلى: ماذا نحب أن نقرأ معًا غدًا؟'
    }
  },
  {
    family: {
      id: 'fam-rahman',
      family_name: 'Rahman family',
      child_name: 'Arif',
      child_age: 4,
      home_language: 'bn'
    },
    activity_id: 'act-kitchen-letters',
    body_en:
      'Good evening, Rahman family! Tonight we are looking for letters in the kitchen with Arif. Point to a letter, say its name and sound, and let Arif trace it with a finger. Let me know how it went.',
    translation: {
      lang: 'bn',
      body:
        'শুভ সন্ধ্যা, রহমান পরিবার! আজ রাতে আমরা আরিফের সঙ্গে রান্নাঘরে অক্ষর খুঁজব। একটি অক্ষর দেখিয়ে তার নাম ও ধ্বনি বলুন, তারপর আরিফকে আঙুল দিয়ে সেটি লেখাতে বলুন। কেমন হলো জানাবেন।',
      activity_title: 'রান্নাঘরে আমাদের অক্ষর',
      activity_steps: [
        'রান্নাঘরে অক্ষর লেখা তিনটি প্যাকেট বা বাক্স খুঁজুন।',
        'একটি অক্ষর দেখান। তার নাম বলুন, তারপর ধ্বনি বলুন। আরিফকেও বলতে দিন।',
        'আরিফকে আঙুল দিয়ে টেবিলে সেই অক্ষরটি লেখাতে বলুন।'
      ],
      activity_prompt: 'আরিফকে জিজ্ঞাসা করুন: তোমার নামের প্রথম অক্ষর কোনটি?'
    }
  },
  {
    family: {
      id: 'fam-brooks',
      family_name: 'Brooks family',
      child_name: 'Jayden',
      child_age: 3,
      home_language: 'en'
    },
    activity_id: 'act-counting-stairs',
    body_en:
      'Good evening, Brooks family! Tonight we are counting on the stairs with Jayden. Count out loud together, then ask how many steps to the top. Let me know how it went.',
    translation: {
      lang: 'en',
      body:
        'Good evening, Brooks family! Tonight we are counting on the stairs with Jayden. Count out loud together, then ask how many steps to the top. Let me know how it went.',
      activity_title: 'Counting on the stairs',
      activity_steps: [
        'Count the stairs out loud together as you go up or down.',
        'Ask: how many steps to the top? Count again to check.',
        'Find three spoons at dinner. Ask: is this more or fewer than three cups?'
      ],
      activity_prompt: 'Ask your child: what is something we can count in our home?'
    }
  }
];

export function seedIfEmpty({ force = false } = {}) {
  if (isSeeded() && !force) return false;

  transaction(() => {
    if (force) {
      db.exec(`
        DELETE FROM documentation_notes;
        DELETE FROM doc_entries;
        DELETE FROM referrals;
        DELETE FROM completion_events;
        DELETE FROM voice_notes;
        DELETE FROM message_translations;
        DELETE FROM messages;
        DELETE FROM activities;
        DELETE FROM families;
      `);
    }

    const insertActivity = db.prepare(`
      INSERT INTO activities (id, title_en, domain, scope_ref, steps_en, prompt_en, minutes)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    for (const a of ACTIVITIES) {
      insertActivity.run(
        a.id,
        a.title_en,
        a.domain,
        a.scope_ref,
        JSON.stringify(a.steps_en),
        a.prompt_en,
        a.minutes
      );
    }

    const insertFamily = db.prepare(`
      INSERT INTO families (id, family_name, child_name, child_age, home_language, access_token, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const insertMessage = db.prepare(`
      INSERT INTO messages (id, family_id, activity_id, body_en, status, participants, completed_at, created_at, source)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertTranslation = db.prepare(`
      INSERT INTO message_translations
        (id, message_id, lang, body, activity_title, activity_steps, activity_prompt, audio_url, source, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const created = yesterday();

    for (const entry of SEED_ENGAGEMENTS) {
      insertFamily.run(
        entry.family.id,
        entry.family.family_name,
        entry.family.child_name,
        entry.family.child_age,
        entry.family.home_language,
        randomBytes(16).toString('base64url'),
        created
      );

      const messageId = randomUUID();
      const isBrooks = entry.family.id === 'fam-brooks';
      insertMessage.run(
        messageId,
        entry.family.id,
        entry.activity_id,
        entry.body_en,
        isBrooks ? 'completed' : 'sent',
        isBrooks ? `${entry.family.child_name} and parent` : null,
        isBrooks ? created : null,
        created,
        'seed'
      );

      insertTranslation.run(
        randomUUID(),
        messageId,
        entry.translation.lang,
        entry.translation.body,
        entry.translation.activity_title,
        JSON.stringify(entry.translation.activity_steps),
        entry.translation.activity_prompt,
        null,
        'seed',
        created
      );

      if (isBrooks) {
        const eventId = randomUUID();
        db.prepare(`
          INSERT INTO completion_events
            (id, message_id, family_id, participants, activity_minutes, occurred_at, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(eventId, messageId, entry.family.id, 'Jayden and parent', 6, created, created);

        db.prepare(`
          INSERT INTO documentation_notes
            (id, family_id, message_id, event_id, standard, body, model, source, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          randomUUID(),
          entry.family.id,
          messageId,
          eventId,
          'HSPPS 1302.50',
          [
            'Date/Time: Prior evening, 6:30 PM (demo record)',
            'Family: Brooks family',
            'Participants: Jayden (age 3) and parent',
            'Home Language: English',
            'Engagement Activity: Counting on the stairs — counting in daily routines (Michigan pre-K number and operations).',
            'Family Strengths Observed: Parent turned a routine into a counting moment and reported that Jayden counted the last three steps on his own.',
            'Standard Alignment: HSPPS 1302.50 — ongoing communication with families and support for family engagement in children\'s development.',
            'Follow-Up: Offer the kitchen-letters activity next; check whether Jayden counts objects beyond five.'
          ].join('\n'),
          'muse-wonder-1.0',
          'seed',
          created
        );
      }
    }
  });

  return true;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const force = process.argv.includes('--force');
  const did = seedIfEmpty({ force });
  const counts = {
    families: one('SELECT COUNT(*) AS n FROM families')?.n ?? 0,
    activities: one('SELECT COUNT(*) AS n FROM activities')?.n ?? 0,
    messages: one('SELECT COUNT(*) AS n FROM messages')?.n ?? 0
  };
  console.log(did ? 'Seeded demo data.' : 'Database already has data (use --force to reseed).');
  console.log(counts);
}
