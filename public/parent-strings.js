// Parent-view UI strings, baked at build time.
//
// Source: tools/build-parent-strings.mjs. The Arabic and Bangla values were
// produced once with the app's Spark translation path (muse-spark-1.3) and are
// literals here. Nothing in this file calls the network at runtime.
//
// Shape: id -> { en, ar, bn }. Sylheti has no written UI strings on purpose:
// it stays audio-first, and the switch offers English, Arabic and Bangla only.

export const PARENT_STRINGS = {
  "appName": { en: "SproutComm", ar: "SproutComm", bn: "SproutComm" },
  "exit": { en: "Exit", ar: "خروج", bn: "প্রস্থান" },
  "exitAria": { en: "Sign out", ar: "تسجيل الخروج", bn: "প্রস্থান করুন" },
  "languageSwitch": { en: "Reading language", ar: "لغة القراءة", bn: "পড়ার ভাষা" },
  "languageEnglish": { en: "English", ar: "الإنجليزية", bn: "ইংরেজি" },
  "languageArabic": { en: "Arabic", ar: "العربية", bn: "আরবি" },
  "languageBangla": { en: "Bangla", ar: "البنغالية", bn: "বাংলা" },
  "languageSylheti": { en: "Sylheti (Deshi)", ar: "السيلهيتية (ديشي)", bn: "সিলেটি (দেশি)" },
  "today": { en: "Today", ar: "اليوم", bn: "আজ" },
  "yesterday": { en: "Yesterday", ar: "أمس", bn: "গতকাল" },
  "noMessage": { en: "No message tonight yet. Your advocate will send one.", ar: "لا توجد رسالة الليلة بعد. سيرسل لكم مستشاركم رسالة.", bn: "আজ রাতে এখনও কোনো বার্তা নেই। আপনার অ্যাডভোকেট একটি বার্তা পাঠাবেন।" },
  "offlineNote": { en: "You are offline. This is your last saved message; anything you send goes when you are back online.", ar: "لا يوجد اتصال. هذه آخر رسالة محفوظة على هاتفكم. ما ترسلونه الآن سيُرسل عند عودة الاتصال.", bn: "ইন্টারনেট নেই। এটি আপনার সর্বশেষ সংরক্ষিত বার্তা। এখন যা পাঠাবেন, ইন্টারনেট ফিরলে পাঠানো হবে।" },
  "waiting": { en: "waiting to send", ar: "في انتظار الإرسال", bn: "পাঠানোর অপেক্ষায়" },
  "weDidIt": { en: "We did it", ar: "أنجزنا النشاط", bn: "আমরা করেছি" },
  "doneTag": { en: "Done", ar: "تم", bn: "সম্পন্ন" },
  "completedNote": { en: "Your advocate has it. This engagement is being added to your family's file.", ar: "وصل النشاط إلى مستشاركم. يُضاف الآن إلى ملف عائلتكم.", bn: "আপনার অ্যাডভোকেট এটি পেয়েছেন। কাজটি আপনার পরিবারের ফাইলে যোগ হচ্ছে।" },
  "savedOffline": { en: "Saved on your phone. It will be sent when you are back online.", ar: "تم الحفظ على هاتفكم. سيُرسل عند عودة الاتصال.", bn: "ফোনে সংরক্ষিত হয়েছে। ইন্টারনেট ফিরলে পাঠানো হবে।" },
  "voiceMessage": { en: "Voice message from your advocate", ar: "رسالة صوتية من مستشاركم", bn: "আপনার অ্যাডভোকেটের কণ্ঠ বার্তা" },
  "listen": { en: "Listen", ar: "استمع", bn: "শুনুন" },
  "activity": { en: "Tonight's activity", ar: "نشاط الليلة", bn: "আজ রাতের কাজ" },
  "minutes": { en: "min", ar: "دقائق", bn: "মিনিট" },
  "prompt": { en: "Ask your child", ar: "اسألوا طفلكم", bn: "সন্তানকে জিজ্ঞাসা করুন" },
  "voiceNote": { en: "Voice note", ar: "ملاحظة صوتية", bn: "কণ্ঠ বার্তা" },
  "stillUploading": { en: "Still uploading…", ar: "جارٍ رفع التسجيل…", bn: "এখনও আপলোড হচ্ছে…" },
  "replyReady": { en: "Your advocate has your voice note.", ar: "وصلت ملاحظتكم الصوتية إلى مستشاركم.", bn: "আপনার অ্যাডভোকেটের কাছে আপনার কণ্ঠ বার্তা পৌঁছেছে।" },
  "replySending": { en: "Sending to your advocate…", ar: "جارٍ الإرسال إلى مستشاركم…", bn: "আপনার অ্যাডভোকেটের কাছে পাঠানো হচ্ছে…" },
  "replyFailed": { en: "We could not hear that recording. Try again.", ar: "لم نتمكن من سماع هذا التسجيل. حاولوا مرة أخرى.", bn: "আমরা ওই রেকর্ডিংটি শুনতে পাইনি। আবার চেষ্টা করুন।" },
  "voiceOnlyNotice": { en: "This family's home language is delivered by voice only. Text cards are not shown.", ar: "لغة المنزل لهذه الأسرة تُقدَّم صوتيًا فقط. لا تُعرض البطاقات النصية.", bn: "এই পরিবারের ঘরের ভাষা শুধুমাত্র কণ্ঠে শোনানো হয়। লেখার কার্ড দেখানো হয় না।" },
  "record": { en: "Tap to record", ar: "اضغط للتسجيل", bn: "রেকর্ড করতে চাপুন" },
  "stop": { en: "Stop", ar: "إيقاف", bn: "থামুন" },
  "send": { en: "Send", ar: "إرسال", bn: "পাঠান" },
  "cancel": { en: "Cancel", ar: "إلغاء", bn: "বাতিল" },
  "chooseFile": { en: "Choose a recording from your phone", ar: "اختاروا تسجيلاً من هاتفكم", bn: "ফোন থেকে রেকর্ডিং বাছুন" },
  "micOff": { en: "The microphone is not available. Choose a recording from your phone.", ar: "الميكروفون غير متاح. اختاروا تسجيلاً من هاتفكم.", bn: "মাইক ব্যবহার করা যাচ্ছে না। ফোন থেকে রেকর্ডিং বেছে নিন।" },
  "sentNote": { en: "Your voice note was delivered", ar: "وصلت ملاحظتكم الصوتية", bn: "আপনার কণ্ঠ বার্তা পৌঁছেছে" },
  "whoJoined": { en: "Who joined tonight?", ar: "من شارك الليلة؟", bn: "আজ কে কে ছিলেন?" },
  "howLong": { en: "How long did it take?", ar: "كم استغرق النشاط؟", bn: "কাজটি কত সময় নিয়েছে?" },
  "confirm": { en: "Confirm", ar: "تأكيد", bn: "নিশ্চিত করুন" },
  "noteSaved": { en: "Added to your family's file", ar: "تم التسجيل في ملف عائلتكم", bn: "আপনার পরিবারের ফাইলে লিপিবদ্ধ হয়েছে" },
  "joinedParent": { en: "Just me", ar: "أنا فقط", bn: "শুধু আমি" },
  "joinedParentChild": { en: "Me and my child", ar: "أنا وطفلي", bn: "আমি ও আমার সন্তান" },
  "joinedWholeFamily": { en: "Whole family", ar: "كل العائلة", bn: "পুরো পরিবার" },
  "joinedOtherAdult": { en: "Another adult", ar: "شخص بالغ آخر", bn: "অন্য একজন প্রাপ্তবয়স্ক" },
  "toastNoAudio": { en: "Audio is not available on this phone", ar: "الصوت غير متوفر على هذا الهاتف", bn: "এই ফোনে অডিও পাওয়া যাচ্ছে না" },
  "toastNoVoiceAudio": { en: "Voice message audio is not connected yet", ar: "صوت الرسالة الصوتية غير متصل بعد", bn: "কণ্ঠ বার্তার অডিও এখনও সংযুক্ত হয়নি" },
  "toastSavedItemFailed": { en: "One saved item could not be sent", ar: "تعذّر إرسال عنصر واحد محفوظ", bn: "সংরক্ষিত একটি আইটেম পাঠানো যায়নি" },
  "toastSavedItemSent": { en: "Saved item sent", ar: "تم إرسال العنصر المحفوظ", bn: "সংরক্ষিত আইটেম পাঠানো হয়েছে" },
  "toastSavedItemsSent": { en: "{n} saved items sent", ar: "تم إرسال {n} من العناصر المحفوظة", bn: "{n}টি সংরক্ষিত আইটেম পাঠানো হয়েছে" },
  "sendRecordingFailed": { en: "Could not send that recording", ar: "تعذّر إرسال ذلك التسجيل", bn: "সেই রেকর্ডিং পাঠানো যায়নি" },
  "growingSprout": { en: "Growing sprout", ar: "النبتة النامية", bn: "বেড়ে ওঠা চারা" },
  "sproutFinished": { en: "{n} finished", ar: "{n} من الأنشطة المنجزة", bn: "শেষ হয়েছে {n}টি কাজ" },
  "sproutEmpty": { en: "Finish an activity to grow your first leaf", ar: "أنهِ نشاطًا لتنمو ورقتك الأولى", bn: "প্রথম পাতা গজাতে একটি কাজ শেষ করুন" },
  "sectionReplies": { en: "Family replies", ar: "ردود العائلات", bn: "পরিবারের উত্তর" },
  "sectionSend": { en: "Send an engagement", ar: "إرسال مشاركة", bn: "সম্পৃক্ততা পাঠান" },
  "sectionFamilies": { en: "Families", ar: "العائلات", bn: "পরিবারগুলো" },
  "statusReplied": { en: "Replied", ar: "تم الرد", bn: "উত্তর দিয়েছে" },
  "statusWaiting": { en: "Waiting", ar: "في الانتظار", bn: "অপেক্ষমাণ" },
  "statusDone": { en: "Done", ar: "تم", bn: "সম্পন্ন" },
  "yourAdvocate": { en: "Your family advocate", ar: "المدافع عن أسرتك", bn: "আপনার পারিবারিক সহায়ক" },
  "familyFile": { en: "Family file of {child}", ar: "ملف عائلة {child}", bn: "{child} এর পারিবারিক ফাইল" },
  "saveMyReport": { en: "Save my report", ar: "احفظ تقريري", bn: "আমার প্রতিবেদন সংরক্ষণ করুন" },
  "milestoneLead": { en: "You did it!", ar: "لقد فعلتها!", bn: "তুমি পেরেছো!" },
  "milestoneNew": { en: "{child} grew a new leaf — that's {n} finished!", ar: "أنبت {child} ورقة جديدة — ليصبح عدد الأوراق المكتملة {n}!", bn: "{child} একটি নতুন পাতা গজিয়েছে — মোট {n}টি শেষ হয়েছে!" },
  "milestonePast": { en: "A new leaf grew for {child} — {n} activities finished!", ar: "نمت ورقة جديدة لـ {child} — تم إنجاز {n} من الأنشطة!", bn: "{child} এর জন্য একটি নতুন পাতা গজিয়েছে — {n}টি কার্যক্রম শেষ হয়েছে!" },
  "noteAddedTitle": { en: "Family engagement note added", ar: "تمت إضافة ملاحظة إشراك الأسرة", bn: "পারিবারিক সম্পৃক্ততা নোট যোগ করা হয়েছে" },
  "noteAddedBody": { en: "Completed — kept in {child}'s family file.", ar: "مكتمل — يُحفظ في ملف عائلة {child}.", bn: "সম্পন্ন — {child}-এর পারিবারিক ফাইলে রাখা হয়েছে।" },
  "youLabel": { en: "You", ar: "أنت", bn: "আপনি" },
  "messagePlaceholder": { en: "Message or voice note…", ar: "رسالة أو رسالة صوتية…", bn: "বার্তা বা ভয়েস নোট…" },
  "reportTitle": { en: "Family report of {child}", ar: "تقرير الأسرة عن {child}", bn: "{child} এর পারিবারিক প্রতিবেদন" },
  "reportActivities": { en: "Finished activities", ar: "الأنشطة المنجزة", bn: "সমাপ্ত কার্যক্রম" },
  "reportNone": { en: "No finished activities yet. The first leaf is on its way.", ar: "لا توجد أنشطة مكتملة بعد. الورقة الأولى في الطريق.", bn: "এখনও কোনো সমাপ্ত কার্যক্রম নেই। প্রথম পাতাটি পথে রয়েছে।" },
  "printSave": { en: "Print / Save", ar: "طباعة / حفظ", bn: "মুদ্রণ / সংরক্ষণ" },
  "back": { en: "Back", ar: "رجوع", bn: "পেছনে" }
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
