/**
 * The voice studio's logic: the script (every line the app needs recorded,
 * worked out from the content), what generating it would cost, and the one
 * ElevenLabs request -- shaped the way the app's own `scripts/gen-voice.mjs`
 * makes it, so a take from here is interchangeable with a take from there.
 * The server makes the call; the key never reaches the browser.
 */
import { tts, type Inventory, type Slot, type Word, type WordSet } from "./api";
import { placeOf } from "./places";
import type { Asset, Db, Direction, FixedLine, Language, Speaker, Take, VoiceProfile } from "./types";

export interface Line {
  /** the app's clip id: also the file name, `voice/raw/<clip>.mp3` */
  clip: string;
  speaker: Speaker;
  /** what is said; "" in another language until it is translated */
  text: string;
  /** the language it is said in: "tr", "en", or a child's other language */
  lang: string;
  /** in another language: the Turkish it translates (shown beside it) */
  source?: string;
  group: string;
  /** a fixed line: where it is said (`places.ts`); a word's line is placed by its word */
  place?: { category: string; step: string } | null;
  /** every place an app line is said in (the app's inventory); `place` is the first */
  places?: { category: string; step: string }[];
  /** a sentence of the app itself: its text is the app's, edited in the app */
  app?: boolean;
  kind: "word" | "fixed";
  /** the recording in use, if any */
  current?: string;
  /** a word's line: the word and its recording slot */
  word?: { id: string; slot: Slot };
  takes: Take[];
  /** the recording in use was made from a different text */
  stale: boolean;
  dir: Direction;
}

/** the default delivery per kind of line (`DELIVERY` in gen-voice.mjs) */
/* "clear" is not in any of them (2026-10-20): next to ElevenLabs' own
   `[clears throat]` the teacher cleared her throat before the word. And a
   word on its own gets no tag at all (`sentText`). */
const DEFAULT_DIR: Record<string, Direction> = {
  en: { tag: "", stability: 0.6 },
  tr: { tag: "[calm]", stability: 0.6 },
  about: { tag: "[warm, gentle]", stability: 0.5 },
  otter: { tag: "", stability: 0.45 },
  fixed: { tag: "[warm]", stability: 0.5 },
};

/** two texts are the same line if they read the same (the server's `sameText`) */
export const norm = (t: string) => t.normalize("NFC").replace(/\s+/g, " ").trim();

/** "Türkçesi, %." -- the app's `teacherWord.tr` */
const TR_LINE = (tr: string) => `Türkçesi, ${tr}.`;

export interface WordLine { slot: Slot; clip: string; speaker: Speaker; text: string; lang: "tr" | "en"; dirKey: string }

/**
 * The lines one word needs, with the app's clip ids (server: `vocab.ts` →
 * clipOf). `parts`: the description sentence by sentence, for the words the
 * app says that way (the action verbs, `aboutParts` in its inventory).
 */
export function wordLines(w: Pick<Word, "id" | "en" | "tr" | "about">, parts: string[] = []): WordLine[] {
  const out: WordLine[] = [
    { slot: "en", clip: `teacher/en_${w.id}`, speaker: "teacher", text: w.en, lang: "en", dirKey: "en" },
    { slot: "tr", clip: `teacher/tr_${w.id}`, speaker: "teacher", text: TR_LINE(w.tr), lang: "tr", dirKey: "tr" },
  ];
  if (w.about.trim()) out.push({ slot: "about", clip: `teacher/about_${w.id}`, speaker: "teacher", text: w.about, lang: "tr", dirKey: "about" });
  parts.slice(0, 3).forEach((t, i) => out.push({ slot: `about${i + 1}` as Slot, clip: `teacher/about${i + 1}_${w.id}`,
    speaker: "teacher", text: t, lang: "tr", dirKey: "about" }));
  out.push({ slot: "otter", clip: `otter/en_${w.id}`, speaker: "otter", text: w.en, lang: "en", dirKey: "otter" });
  return out;
}

/** what a slot's recording should say ("" for a sound effect) */
export const slotText = (w: Pick<Word, "id" | "en" | "tr" | "about">, slot: Slot, parts: string[] = []) =>
  wordLines(w, parts).find((l) => l.slot === slot)?.text ?? "";

export const partsOf = (inv: Inventory | null, id: string) => inv?.words.find((w) => w.id === id)?.aboutParts ?? [];

/** the app's own language: its lines are the word table's and the fixed lines' */
export const APP_LANG = "tr";

/** the languages offered when one is added: ElevenLabs' codes, a meaning line to start from */
export const LANGUAGE_CHOICES: Language[] = [
  { code: "it", name: "İtalyanca", meaningTemplate: "In italiano, %." },
  { code: "de", name: "Almanca", meaningTemplate: "Auf Deutsch: %." },
  { code: "es", name: "İspanyolca", meaningTemplate: "En español, %." },
  { code: "fr", name: "Fransızca", meaningTemplate: "En français, %." },
  { code: "pt", name: "Portekizce", meaningTemplate: "Em português, %." },
  { code: "nl", name: "Felemenkçe", meaningTemplate: "In het Nederlands: %." },
  { code: "pl", name: "Lehçe", meaningTemplate: "Po polsku: %." },
  { code: "ru", name: "Rusça", meaningTemplate: "По-русски: %." },
  { code: "ar", name: "Arapça", meaningTemplate: "بالعربية: %." },
  { code: "az", name: "Azerice", meaningTemplate: "Azərbaycanca: %." },
];
export const langName = (db: Pick<Db, "languages">, code: string) =>
  code === "tr" ? "Türkçe" : code === "en" ? "İngilizce" : db.languages.find((l) => l.code === code)?.name ?? code;

/*
 * HOW A LINE IS SAID: ElevenLabs' audio tags, at the start of the text or
 * anywhere in it ("Merhaba! [laughs] Nasılsın?"). Only Eleven v3/v4 read them;
 * any other model would speak the brackets, so they are not sent there.
 */
export const DELIVERY: { label: string; tag: string }[] = [
  { label: "Doğal", tag: "" },
  { label: "Heyecanlı", tag: "[excited]" },
  { label: "Güler yüzlü", tag: "[cheerful]" },
  { label: "Sıcak, şefkatli", tag: "[warmly]" },
  { label: "Neşeli, oyunbaz", tag: "[playful]" },
  { label: "Meraklı", tag: "[curious]" },
  { label: "Şaşkın", tag: "[surprised]" },
  { label: "Sakin", tag: "[calm]" },
  { label: "Fısıltıyla", tag: "[whispers]" },
  { label: "Gülerek", tag: "[laughs]" },
  { label: "Öğretmen gibi", tag: "[calm, teacherly]" },
];
/** a feeling as written in a workshop row: a label above ("heyecanlı"), a tag, or an English word */
export function tagOf(feeling: string): string {
  const f = feeling.trim();
  if (!f) return "";
  if (/^\[.*\]$/.test(f)) return f;
  const hit = DELIVERY.find((d) => d.label.toLocaleLowerCase("tr") === f.toLocaleLowerCase("tr"));
  return hit ? hit.tag : `[${f}]`;
}
export const tagsWork = (model: string) => /^eleven_v[34]/.test(model);
/** Eleven v4 reads IPA written in /slashes/ inside the text */
export const ipaInline = (model: string) => /^eleven_v4/.test(model);

/*
 * AN ENGLISH WORD INSIDE ANOTHER LANGUAGE'S SENTENCE ("{cup} nerede?"):
 * left alone, the engine reads it with the sentence's language and "cup"
 * becomes "cap". ElevenLabs' own answer is the word's IPA -- written in
 * /slashes/ for Eleven v4, or a pronunciation dictionary of phoneme rules
 * (`pron` → `pronDict`) sent with the request for the others. Either way the
 * word is MARKED in the text with braces, so it is never a guess which word
 * is the English one.
 */
const MARK = /\{([^{}]+)\}/g;
export const marksOf = (text: string) => [...text.matchAll(MARK)].map((m) => m[1]!.trim());
export function renderMarks(text: string, pron: Db["pron"], model: string, lang?: string): string {
  /* ON v3/v4 THE MARKED WORD SWITCHES ACCENT AND BACK (user, 2026-10-22):
     "[American accent] squirrel [Turkish accent]". An audio tag lasts until
     the next one, so the sentence's own accent is said again after the word,
     or the rest of the Turkish sentence would be read as American. */
  const back = lang && lang !== "en" && tagsWork(model) ? ACCENT_OF[lang] : undefined;
  /* THE SUFFIX COMES AFTER THE WAY BACK (user, 2026-10-22, by ear): with
     the suffix on the word inside the American span -- "monkey'nin" -- the
     model took the whole token for a Turkish word and read it with Turkish
     sounds; "[American accent] monkey [Turkish accent]'nin" says the word in
     English and the suffix in Turkish, joined, with no pause heard */
  return text.replace(/\{([^{}]+)\}('[\p{L}]+)?/gu, (_m, w: string, suffix = "") => {
    const word = w.trim();
    const ipa = pron[word.toLowerCase()]?.ipa;
    const said = ipaInline(model) && ipa ? `/${ipa}/` : word;
    return back ? `${EN_ACCENT} ${said} [${back} accent]${suffix}` : said + suffix;
  });
}
/**
 * A SENTENCE WITH A GAP FOR THE WORD (the app's `FrameLine`, 2026-10-23):
 * "Şimdi sırada ___ var. Hadi arayalım!", one take for every word. It is
 * recorded with a pause at the blank -- "Şimdi sırada... [long pause]
 * ...var." -- the panel measures the pause (`findPause`) and the phone puts
 * the word's own take in it.
 */
export const BLANK = "___";
export const isFrame = (clip: string) => /^teacher\/f_/.test(clip);
/** the blank has words on both sides: the take is cut in two at its pause */
export const midBlank = (text: string) => {
  const [a = "", b] = text.split(BLANK);
  return b !== undefined && a.trim() !== "" && b.trim() !== "";
};
/** what is read for the blank: a pause, so the take has one to cut at */
export function pauseFor(text: string, tags: boolean): string {
  if (!text.includes(BLANK)) return text;
  const [a = "", b = ""] = text.split(BLANK).map((x) => x.trim());
  if (!a) return `...${b}`;
  if (!b) return `${a}...`;
  return `${a}... ${tags ? "[long pause] " : ""}...${b}`;
}
/** the accent a sentence in this language goes back to after an English word */
const ACCENT_OF: Record<string, string> = {
  tr: "Turkish", it: "Italian", de: "German", es: "Spanish", fr: "French",
  pt: "Portuguese", nl: "Dutch", ru: "Russian", ar: "Arabic", az: "Azerbaijani",
};
/** English words of the vocabulary written in a non-English line WITHOUT braces */
export function unmarked(text: string, english: string[]): string[] {
  const bare = text.replace(MARK, " ");
  return [...new Set(english.filter((w) => w.length > 1
    && new RegExp(`(^|[^\\p{L}])${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[^\\p{L}])`, "iu").test(bare)))];
}
/** which IPA list a dictionary was made from */
export const pronHash = (pron: Db["pron"]) => {
  const t = JSON.stringify(Object.keys(pron).sort().map((k) => [k, pron[k]!.ipa]));
  let h = 2166136261;
  for (let i = 0; i < t.length; i++) h = Math.imul(h ^ t.charCodeAt(i), 16777619);
  return (h >>> 0).toString(16);
};

/**
 * Every line the app needs recorded: each word's lines (on the word, server
 * side), then the fixed lines of scenes and games (the studio document).
 * In another language (`lang`), the teacher's own lines in that language:
 * a word's meaning and description, and the fixed lines -- the English lines
 * are one set for every language and stay in the Turkish script.
 */
export function script(db: Db, words: Word[], sets: WordSet[], inv: Inventory | null, lang = APP_LANG): Line[] {
  if (lang !== APP_LANG) return localeScript(db, words, sets, inv, lang);
  const out: Line[] = [];
  const takesOf = (clip: string) => db.takes.filter((t) => t.clip === clip && !t.lang).sort((a, b) => b.createdAt - a.createdAt);
  for (const w of words) {
    const group = sets.find((s) => s.words.includes(w.id))?.name ?? "Sette olmayan kelimeler";
    for (const l of wordLines(w, partsOf(inv, w.id))) {
      const takes = takesOf(l.clip);
      const a = w.audio[l.slot];
      const take = takes.find((t) => t.asset === a?.asset);
      /* the text a recording was made from: its take's, or the one stored with
         it (an upload in the word editor) */
      const madeFrom = take?.text ?? a?.text ?? "";
      out.push({ clip: l.clip, speaker: l.speaker, text: l.text, lang: l.lang, group, kind: "word",
                 word: { id: w.id, slot: l.slot }, current: a?.asset, takes,
                 stale: !!a && !!madeFrom && norm(madeFrom) !== norm(l.text),
                 dir: db.directions[l.clip] ?? DEFAULT_DIR[l.dirKey]! });
    }
  }
  for (const l of fixedLines(db, inv)) {
    const takes = takesOf(l.clip);
    const take = takes.find((t) => t.asset === l.approved);
    /* the text the approval was for: an explicit approval, else its take's */
    const madeFrom = l.approvedText ?? take?.text;
    /* an English app line ("three apples") is made like a word's English:
       the accent, the word speed, no delivery tag */
    out.push({ clip: l.clip, speaker: l.speaker, text: l.text, lang: l.lang ?? "tr", group: l.group, place: l.places[0] ?? placeOf(l),
               places: l.places, app: l.app, kind: "fixed",
               current: l.approved, takes, stale: !!l.approved && madeFrom !== undefined && norm(madeFrom) !== norm(l.text),
               dir: db.directions[l.clip] ?? appDir(l) });
  }
  return out;
}

/*
 * THE FIXED LINES: the studio document's, and every sentence the app itself
 * says (its inventory, 2026-10-20). An app sentence is the app's: its text is
 * the app's even when the document holds an older copy, so a recording made
 * before the app changed the sentence shows as made from an old text. It
 * enters the document only when it is recorded (`addTake`).
 */
export function fixedLines(db: Db, inv: Inventory | null):
  (FixedLine & { places: { category: string; step: string }[]; app: boolean; lang?: "en"; tag?: string })[] {
  const app = new Map((inv?.lines ?? []).map((l) => [l.clip, l]));
  const out = db.lines.map((l) => {
    const a = app.get(l.clip);
    return a ? { ...l, text: a.text, places: a.places, app: true, lang: a.lang, tag: a.tag } : { ...l, places: [], app: false };
  });
  const have = new Set(db.lines.map((l) => l.clip));
  for (const a of inv?.lines ?? [])
    if (!have.has(a.clip)) out.push({ clip: a.clip, speaker: a.speaker, text: a.text, group: APP_GROUP, places: a.places,
                                      app: true, lang: a.lang, tag: a.tag });
  return out;
}
/** an app line's delivery before the studio sets one: the app's suggested
 *  tag (the counting song is sung), else the default for its language */
const appDir = (l: { lang?: "en"; tag?: string }): Direction => {
  const base = DEFAULT_DIR[l.lang === "en" ? "en" : "fixed"]!;
  return l.tag ? { ...base, tag: l.tag } : base;
};

/** the group an app sentence is filed under before it is recorded */
export const APP_GROUP = "Uygulamanın cümleleri";

function localeScript(db: Db, words: Word[], sets: WordSet[], inv: Inventory | null, lang: string): Line[] {
  const L = db.languages.find((l) => l.code === lang);
  if (!L) return [];
  const tr = db.i18n[lang] ?? { words: {}, lines: {} };
  const approved = db.localeApproved[lang] ?? {};
  const out: Line[] = [];
  const add = (x: Omit<Line, "takes" | "current" | "stale" | "lang">) => {
    const a = approved[x.clip];
    out.push({ ...x, lang, current: a?.asset, stale: !!a && !!x.text && norm(a.text) !== norm(x.text),
               takes: db.takes.filter((t) => t.clip === x.clip && t.lang === lang).sort((p, q) => q.createdAt - p.createdAt) });
  };
  for (const w of words) {
    const group = sets.find((s) => s.words.includes(w.id))?.name ?? "Sette olmayan kelimeler";
    const t = tr.words[w.id] ?? {};
    for (const l of wordLines(w, partsOf(inv, w.id))) {
      if (l.lang === "en") continue;
      const text = l.slot === "tr" ? (t.meaning ? L.meaningTemplate.replace("%", t.meaning) : "")
        : l.slot === "about" ? t.about ?? "" : t.parts?.[Number(l.slot.slice(5)) - 1] ?? "";
      add({ clip: l.clip, speaker: l.speaker, text, source: l.text, group, kind: "word", word: { id: w.id, slot: l.slot },
            dir: db.directions[l.clip] ?? DEFAULT_DIR[l.dirKey]! });
    }
  }
  for (const l of fixedLines(db, inv))
    /* the English lines are one set for every language */
    if (l.lang !== "en") add({ clip: l.clip, speaker: l.speaker, text: tr.lines[l.clip] ?? "", source: l.text, group: l.group,
          place: l.places[0] ?? placeOf(l), places: l.places, app: l.app, kind: "fixed",
          dir: db.directions[l.clip] ?? DEFAULT_DIR.fixed! });
  return out;
}

export type Status = "untranslated" | "missing" | "stale" | "ready";
export const statusOf = (l: Line): Status =>
  (!l.text.trim() ? "untranslated" : !l.current ? "missing" : l.stale ? "stale" : "ready");

/* ── cost ─────────────────────────────────────────────────────────────────── */

/** credits per character, by model (ElevenLabs' published rates; approximate) */
export const MODELS: { id: string; name: string; rate: number }[] = [
  { id: "eleven_v4", name: "Eleven v4 (duygu etiketleri + metin içi IPA)", rate: 1 },
  { id: "eleven_v3", name: "Eleven v3 (duygu etiketleri)", rate: 1 },
  { id: "eleven_multilingual_v2", name: "Multilingual v2", rate: 1 },
  { id: "eleven_flash_v2_5", name: "Flash v2.5 (hızlı, yarı fiyat)", rate: 0.5 },
  { id: "eleven_turbo_v2_5", name: "Turbo v2.5 (yarı fiyat)", rate: 0.5 },
];

/** the text ElevenLabs gets: the delivery tag in front (v3/v4 only, as
 *  gen-voice.mjs does), the marked English words as the model needs them */
export function sentText(l: Pick<Line, "text" | "dir"> & { lang?: string }, model = "eleven_v3", pron: Db["pron"] = {}): string {
  /* AN ENGLISH WORD ON ITS OWN GOES AS ITS IPA (Eleven v4, 2026-10-21). In a
     Turkish voice the three letters of "cat" were read as Turkish letters --
     the child heard "çat". The word's sounds, not its spelling, leave the
     model nothing to guess. Without an IPA (or on another model) the word
     goes as it is. */
  const ipa = l.lang === "en" && ipaInline(model) ? pron[l.text.trim().toLowerCase()]?.ipa : undefined;
  const accent = l.lang === "en" && tagsWork(model) ? EN_ACCENT : "";
  if (ipa) return `${accent} /${ipa}/`.trim();
  const text = pauseFor(tagsWork(model) ? l.text : l.text.replace(/\[[^\]]{1,40}\]\s*/g, ""), tagsWork(model));
  /* A WORD ON ITS OWN GETS NO TAG. With nothing to colour, the model performs
     the tag instead -- a throat cleared before "banana", a laugh -- and the
     isolated word is the model pronunciation the child copies (2026-10-20). */
  const tag = tagsWork(model) && !alone(text) ? l.dir.tag : "";
  return `${accent} ${tag} ${renderMarks(text, pron, model, l.lang)}`.replace(/\s+/g, " ").trim();
}
/* AN ENGLISH LINE IS SAID WITH AN AMERICAN ACCENT (user, 2026-10-22).
   ElevenLabs' own accent tag (v3/v4: "[American accent]", the model's
   documented form). It is the one tag a word on its own does get: it says
   how the voice sounds, not something to perform, so there is nothing for
   the model to act out in front of the word. Only lines whose language is
   English ("en_*", Kuki's copy) -- a Turkish sentence keeps its own voice. */
export const EN_ACCENT = "[American accent]";
/** one word and nothing else: "banana" (a word slot's phrase, "three apples",
 *  has no tag by default either -- `DEFAULT_DIR.en`) */
export const alone = (text: string) => text.replace(/[^\p{L}\p{N}\s'-]/gu, " ").trim().split(/\s+/).filter(Boolean).length <= 1;

export const modelOf = (voices: VoiceProfile[], speaker: Speaker) =>
  voices.find((v) => v.speaker === speaker)?.model ?? "eleven_v3";

export function costOf(lines: Line[], voices: VoiceProfile[], pron: Db["pron"] = {}): number {
  return Math.ceil(lines.reduce((n, l) => {
    const model = modelOf(voices, l.speaker);
    const rate = MODELS.find((m) => m.id === model)?.rate ?? 1;
    return n + sentText(l, model, pron).length * rate;
  }, 0));
}

/** how fast an English word is said: the speaker's own setting, or a little
 *  under its sentences' speed -- never under ElevenLabs' 0.7 */
export const enSpeedOf = (v: Pick<VoiceProfile, "speed" | "enSpeed">): number =>
  Math.max(0.7, Math.min(1.2, v.enSpeed ?? +(v.speed - 0.1).toFixed(2)));

/** the voice a speaker uses for a line's language */
export function voiceFor(v: VoiceProfile, lang: string): string {
  if (lang === "en") return v.speaker !== "bunny" && v.enVoiceId ? v.enVoiceId : v.voiceId;
  if (lang !== APP_LANG) return v.langVoices?.[lang] || v.voiceId;
  return v.voiceId;
}

/** the dictionary to send, when the line has marked words and the model reads dictionaries */
export function dictFor(text: string, model: string, d: Db["pronDict"]) {
  return d && !ipaInline(model) && marksOf(text).length
    ? [{ pronunciation_dictionary_id: d.id, ...(d.version ? { version_id: d.version } : {}) }] : undefined;
}

/* ── generating: the server holds the key and stores the take ───────────── */

/** one take of one line; the server calls ElevenLabs exactly as
 *  scripts/gen-voice.mjs does and keeps the mp3 as an asset */
export async function generate(l: Line, v: VoiceProfile, seed: number, jobId: string,
                               pron: Db["pron"] = {}, pronDict?: Db["pronDict"]): Promise<Asset> {
  const voice = voiceFor(v, l.lang);
  if (!voice) throw new Error(`${l.speaker} için ses kimliği seçilmedi (Ses ayarları).`);
  if (!l.text.trim()) throw new Error(`${l.clip}: bu dilde metni yok.`);
  return tts({
    voiceId: voice,
    text: sentText(l, v.model, pron),
    model_id: v.model,
    pronunciation_dictionary_locators: dictFor(l.text, v.model, pronDict),
    /* not optional: left out, the engine reads a Turkish sentence with
       English vowels and says nothing about it (gen-voice.mjs) */
    language_code: l.lang,
    seed,
    voice_settings: { stability: l.dir.stability, similarity_boost: v.similarity,
                      style: v.style, use_speaker_boost: true,
                      /* the English word slower than the sentences (2026-10-24) */
                      speed: l.lang === "en" ? enSpeedOf(v) : v.speed },
    name: l.clip.replace("/", "__"),
    jobId,
  });
}
