// Supported home languages for v1.
//
// `mode` drives the parent view: "text" languages get a translated text card
// plus a listen button; "audio" languages (Sylheti) get voice only, because
// written Sylheti is not a reliable channel for our families. Sylheti speech
// recognition is unverified — the UI must never promise that it works.

export const LANGUAGES = {
  ar: {
    code: 'ar',
    englishName: 'Arabic',
    nativeName: 'العربية',
    dir: 'rtl',
    mode: 'text',
    speechLocale: 'ar-SA'
  },
  bn: {
    code: 'bn',
    englishName: 'Bangla',
    nativeName: 'বাংলা',
    dir: 'ltr',
    mode: 'text',
    speechLocale: 'bn-BD'
  },
  en: {
    code: 'en',
    englishName: 'English',
    nativeName: 'English',
    dir: 'ltr',
    mode: 'text',
    speechLocale: 'en-US'
  },
  syl: {
    code: 'syl',
    englishName: 'Sylheti (Deshi)',
    nativeName: 'সিলেটি',
    dir: 'ltr',
    mode: 'audio',
    speechLocale: 'bn-BD',
    transcriptionUnverified: true
  }
};

export function language(code) {
  return LANGUAGES[code] ?? LANGUAGES.en;
}

export function publicLanguages() {
  return Object.values(LANGUAGES).map((l) => ({
    code: l.code,
    englishName: l.englishName,
    nativeName: l.nativeName,
    dir: l.dir,
    mode: l.mode,
    transcriptionUnverified: Boolean(l.transcriptionUnverified)
  }));
}
