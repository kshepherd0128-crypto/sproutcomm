// Name the language of a voice transcript.
//
// The transcription contract returns text but no language field, so the
// voice-reply pipeline cannot know from ASR whether a transcript is already
// English. This module answers that question deterministically: Unicode
// script first, then a small stopword comparison for Latin-script languages.
//
// Unknown or ambiguous Latin text returns null. Callers must treat null as
// "not English", because translating a transcript that is already English is
// harmless while leaving a non-English reply untranslated is the bug this
// module exists to prevent.

const SCRIPTS = [
  [/\p{Script=Hiragana}|\p{Script=Katakana}/u, 'ja'],
  [/\p{Script=Hangul}/u, 'ko'],
  [/\p{Script=Han}/u, 'zh'],
  [/\p{Script=Arabic}/u, 'ar'],
  [/\p{Script=Bengali}/u, 'bn'],
  [/\p{Script=Devanagari}/u, 'hi'],
  [/\p{Script=Cyrillic}/u, 'ru'],
  [/\p{Script=Greek}/u, 'el'],
  [/\p{Script=Hebrew}/u, 'he'],
  [/\p{Script=Thai}/u, 'th'],
  [/\p{Script=Tamil}/u, 'ta'],
  [/\p{Script=Telugu}/u, 'te'],
  [/\p{Script=Kannada}/u, 'kn'],
  [/\p{Script=Malayalam}/u, 'ml'],
  [/\p{Script=Gujarati}/u, 'gu'],
  [/\p{Script=Gurmukhi}/u, 'pa'],
  [/\p{Script=Sinhala}/u, 'si'],
  [/\p{Script=Myanmar}/u, 'my'],
  [/\p{Script=Khmer}/u, 'km'],
  [/\p{Script=Lao}/u, 'lo'],
  [/\p{Script=Georgian}/u, 'ka'],
  [/\p{Script=Armenian}/u, 'hy'],
  [/\p{Script=Ethiopic}/u, 'am']
];

const LATIN_STOPWORDS = {
  en: 'the and you your yours they their theirs them this that these those there here with from have has had having what when where why who whom which will would could should about after before again against between during through above below over under once today tomorrow yesterday together because while very just only also than then both each few more most other some such any own same too not are were was been being am do does did done doing my our ours he she it its we us him her his hers if or but as of to for by at in on an a is yes no hello hi okay ok thanks thank please sorry',
  de: 'der die das den dem des ein eine einen einem einer eines und oder aber wenn dann als dass dieser diese dieses dort hier von zu in auf an bei für mit aus ist sind war waren bin bist sei sein gewesen habe hast hat haben hatte hatten werde wird werden wurde wurden kann könnte sollte muss möchten nicht nein ja ich du er sie es wir ihr mich dich ihn uns euch mein dein unser euer was welche wer wann wo warum wie alle jede einige mehr meist andere solche nur auch sehr heute morgen gestern zusammen deshalb während bevor nach vor über unter danke bitte tschüss',
  es: 'el la los las un una unos unas de del al a en y o pero si no por para con sin sobre entre hasta desde como que quien quienes cual cuales cuando donde porque muy más también hoy ayer mañana juntos juntas nosotros ellos ellas usted ustedes yo tú él ella es son era eran fue fueron ser estar está están estaba estaban hay ha han he hemos tiene tienen tengo tenemos mi mis tu tus su sus nuestro nuestra este esta estos estas ese esa esos esas lo le les se me te nos os',
  fr: 'le la les un une des du de et ou mais si non pour par avec sans sur sous entre jusqu depuis comme que qui quoi dont où quand pourquoi très plus aussi aujourd hui hier demain ensemble nous vous ils elles je tu il elle est sont était étaient être avoir ai as a avons avez ont avait avaient mon ma mes ton ta tes son sa ses notre nos votre vos leur leurs ce cette ces cet celui celle ceux celles se me te lui y en',
  pt: 'o a os as um uma uns umas de do da dos das em no na nos nas por para com sem sobre entre até desde como que quem qual quais quando onde porque muito mais também hoje ontem amanhã juntos juntas nós eles elas você vocês eu tu ele ela é são era eram foi foram ser estar está estão estava estavam tem têm temos meu minha meus minhas seu sua seus suas nosso nossa este esta estes estas esse essa isso isto',
  it: 'il lo la gli le un uno una di del della dei delle da dal dalla in nel nella su sul sulla per con senza tra fra come che chi cui quando dove perché molto più anche oggi ieri domani insieme noi voi loro io tu lui lei è sono era erano essere avere ho hai ha abbiamo avete hanno mio mia miei mie tuo tua suoi sue nostro nostra questo questa questi queste quello quella',
  nl: 'de het een en of maar als dan dat die deze dit daar hier van te in op aan bij voor met uit is zijn was waren ben bent geweest heb hebt heeft hebben had hadden word wordt worden werd werden kan kunnen zou moeten niet nee ja ik jij hij zij wij jullie mij jou hem haar ons hen mijn jouw haar onze wat welke wie wanneer waar waarom hoe alle elke sommige meer meest andere alleen ook zeer vandaag morgen gisteren samen omdat tijdens na over onder',
  sv: 'och att det en ett den här är var varit vara har hade haft kan kunde ska skulle vill ville måste inte nej ja jag du han hon vi ni de mig dig honom henne oss er min din hans hennes vår vad vilken vem när varför hur alla varje några mer mest andra bara också mycket idag imorgon igår tillsammans eftersom med utan på i vid för från till om',
  da: 'og at det en et den er var været være har havde haft kan kunne skal skulle vil ville måste ikke nej ja jeg du han hun vi de mig dig ham hende os jer min din hans hendes vores jeres hvad hvilken hvem hvornår hvor hvorfor hvordan alle hver nogle mere mest andre kun også meget i dag morgen går sammen fordi med uden på ved for fra til om',
  nb: 'og at det en et den er var vært være har hadde hatt kan kunne skal skulle vil ville måtte ikke nei ja jeg du han hun vi dere de meg deg ham henne oss min din hans hennes vår deres hva hvilken hvem når hvor hvorfor hvordan alle hver noen mer mest andre bare også veldig dag morgen går sammen fordi med uten på ved for fra til om',
  pl: 'i w nie na z do się to że jest są był była było były być mam masz ma mamy macie mają miał miała mieli tak ja ty on ona my wy oni mnie cię go ją nas was ich mój moja moje twój twoja nasz wasz ten ta te tam tu kiedy gdzie dlaczego jak bardzo też już dziś wczoraj jutro razem ponieważ przez bez pod nad dla od',
  tr: 've bir bu şu o da de için ile değil evet hayır ben sen biz siz onlar beni seni onu bizi sizi onları benim senin onun bizim sizin onların ne hangi kim zaman nerede neden nasıl çok daha en bugün yarın dün birlikte çünkü ama veya',
  id: 'dan yang di ke dari untuk dengan tanpa pada dalam ini itu saya kamu dia kami kita mereka aku milik ku mu nya adalah ada tidak ya apa siapa kapan mana mengapa bagaimana sangat lebih juga sudah hari ini kemarin besok bersama karena tetapi atau',
  vi: 'và của là có không được cho với trong này đó tôi bạn anh chị em chúng ta họ những các một hai ba rất cũng đã đang sẽ hôm nay hôm qua ngày mai cùng nhau bởi vì nhưng hoặc',
  ro: 'și de la cu pentru fără pe în din este sunt era erau fi avea am ai are avem aveți au nu da eu tu el ea noi voi ei ele meu mea tău ta său nostru noastre acest această acești aceste ce cine când unde de ce cum foarte mai astăzi ieri mâine împreună pentru că dar sau',
  cs: 'a v na s z do se to že je jsou byl byla bylo být mám máš má máme máte mají měl měla měli ne ano já ty on ona my vy oni mě tě ho ji nás vás je můj moje tvůj náš váš ten ta to ty tam tady kdy kde proč jak velmi také už dnes včera zítra spolu protože přes bez pod nad pro od',
  hu: 'a az egy és vagy de ha hogy ez az ott itt van vannak volt voltak lesz lenni ne nem igen én te ő mi ti ők engem téged őt minket titeket őket enyém tied övé mienk tietek övék mi melyik ki mikor hol miért hogyan minden mindegyik néhány több legtöbb más csak is nagyon ma holnap tegnap együtt mert alatt felett után előtt',
  fi: 'ja on ei se että oli ovat olla olen olet olemme olette minä sinä hän me te he minua sinua häntä meitä teitä heitä minun sinun hänen meidän teidän heidän mikä kuka milloin missä miksi miten kaikki jokainen jotkut enemmän eniten muu vain myös hyvin tänään huomenna eilen yhdessä koska kanssa ilman päällä alla',
  tl: 'ang ng sa mga at o pero kung na ay ito iyon dito doon ako ikaw siya kami tayo kayo sila ko mo niya namin natin ninyo nila akin iyo kanya amin atin inyo kanila ano sino kailan saan bakit paano lahat bawat ilan mas pinaka iba lang din sobrang ngayon bukas kahapon kasama dahil para mula hanggang',
  sw: 'na ya wa kwa ni katika za la kama au lakini ikiwa hiyo hii hapa pale mimi wewe yeye sisi ninyi wao wangu wako wake wetu wenu nini nani lini wapi kwa nini vipi kila wote baadhi zaidi sana pia tayari leo kesho jana pamoja kwa sababu bila juu chini'
};

const STOPWORDS = Object.fromEntries(
  Object.entries(LATIN_STOPWORDS).map(([code, words]) => [code, new Set(words.split(' '))])
);

// ASR responses sometimes use ISO 639-3 or a BCP-47 tag. The pipeline stores
// the same two-letter codes the rest of the app uses (families.home_language,
// the locked prompts), so normalise anything the API hands us.
const ISO3_TO_ISO1 = {
  ara: 'ar', ben: 'bn', ces: 'cs', chi: 'zh', zho: 'zh', dan: 'da', deu: 'de',
  dut: 'nl', ell: 'el', eng: 'en', est: 'et', fin: 'fi', fra: 'fr', fre: 'fr',
  ger: 'de', guj: 'gu', heb: 'he', hin: 'hi', hun: 'hu', hye: 'hy', ind: 'id',
  ita: 'it', jpn: 'ja', kan: 'kn', kat: 'ka', khm: 'km', kor: 'ko', lao: 'lo',
  mal: 'ml', mya: 'my', nld: 'nl', nor: 'no', pan: 'pa', pol: 'pl', por: 'pt',
  ron: 'ro', rum: 'ro', rus: 'ru', sin: 'si', spa: 'es', swe: 'sv', tam: 'ta',
  tel: 'te', tha: 'th', tur: 'tr', ukr: 'uk', vie: 'vi', zsm: 'ms'
};

export function normalizeLanguageCode(code) {
  if (typeof code !== 'string') return null;
  const base = code.trim().toLowerCase().split(/[-_]/)[0];
  if (!base) return null;
  return ISO3_TO_ISO1[base] ?? (/^[a-z]{2}$/.test(base) ? base : null);
}

// A single ambiguous function word is not enough to call a transcript English.
// These words are distinctive enough (or are common short English replies) to
// stand alone.
const STRONG_ENGLISH = new Set(
  ('the and you your yours they their theirs them this that these those there here with from have has had ' +
    'what when where why how we our today tomorrow yesterday together because would could should not ' +
    'yes no hello hi okay ok thanks thank please sorry').split(' ')
);

export function detectLanguage(text) {
  if (typeof text !== 'string' || text.trim() === '') return null;

  for (const [script, code] of SCRIPTS) {
    if (script.test(text)) return code;
  }

  const tokens = text.toLowerCase().match(/\p{Script=Latin}+/gu) ?? [];
  if (!tokens.length) return null;

  const scores = [];
  for (const [code, words] of Object.entries(STOPWORDS)) {
    let hits = 0;
    for (const token of tokens) if (words.has(token)) hits++;
    if (hits > 0) scores.push([code, hits]);
  }
  if (!scores.length) return null;

  scores.sort((a, b) => b[1] - a[1]);
  const [best, bestScore] = scores[0];

  // A tie means the text does not clearly belong to one language. Returning
  // null makes the caller translate, which is safe for every language.
  if (scores[1] && scores[1][1] === bestScore) return null;

  // Be conservative about claiming English: an English transcript must not
  // hide a non-English reply. Short English replies (yes, thanks, okay) are
  // covered by the strong-word list.
  if (best === 'en' && !tokens.some((token) => STRONG_ENGLISH.has(token))) return null;

  return best;
}
