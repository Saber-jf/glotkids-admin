/**
 * The panel's own types: files, and the studio document (voices, fixed lines,
 * takes, image generations). The content -- words, word sets, games,
 * categories, releases -- is the server's and typed where it is fetched
 * (`api.ts`).
 */

export type AssetKind = "image" | "audio" | "video" | "animation" | "font";

/** a file on the server (`GET /api/assets`) */
export interface Asset {
  id: string;
  kind: AssetKind;
  name: string;
  mime: string;
  size: number;
  createdAt: number;
  /** where the panel shows it from (`/api/assets/<id>`) */
  url?: string;
  sha256?: string;
}

/** the word colours offered when a word is made (each still checked for 3:1 on white) */
export const PALETTE = ["#E0A21B", "#E2323E", "#A2621F", "#2A84C8", "#1F7FA8", "#B8860B", "#E06A16",
                        "#6B5646", "#6E6790", "#C06A85", "#8D5E3E", "#C25A26", "#4F8A38", "#6D3FC8"];

/** what a game does in a series of three */
export type GameRole = "teach" | "practice" | "measure";

/* ── the voice studio ─────────────────────────────────────────────────────── */

/** who says a line. The bunny speaks only in the story scenes. */
export type Speaker = "teacher" | "otter" | "bunny";

/* the mascots' names are the Maskotlar page's (the one in play, else the
   app's own): `setSpeakerNames` puts them here when the panel learns them */
export const SPEAKERS: Record<Speaker, { name: string; tint: string }> = {
  teacher: { name: "Elif Öğretmen", tint: "bg-primary/10 text-primary" },
  otter: { name: "Kuki", tint: "bg-success/10 text-success" },
  bunny: { name: "Lili", tint: "bg-pink-500/10 text-pink-700 dark:text-pink-300" },
};

/** one speaker's ElevenLabs voice and its defaults */
export interface VoiceProfile {
  speaker: Speaker;
  voiceId: string;
  /** the teacher and Kuki: a voice for the isolated English words, when
   *  theirs is a Turkish voice that cannot make the sounds ("cat" → "çat",
   *  and as IPA "ket"); the bunny never says an English word */
  enVoiceId?: string;
  model: string;
  similarity: number;
  style: number;
  speed: number;
  /** how fast the isolated English WORDS are said (user, 2026-10-24: "shoes
   *  çok hızlı, ben bile anlamıyorum"); absent: a little under `speed` (`enSpeedOf`) */
  enSpeed?: number;
  /** another voice for this speaker in a child's other language (`it` → voice id) */
  langVoices?: Record<string, string>;
}

/** a line that is not about one word: a scene's or a game's sentence */
export interface FixedLine {
  /** the app's clip id, e.g. "otter/ride_o" -- also the file name */
  clip: string;
  speaker: Speaker;
  text: string;
  /** a label for the line ("Mutfak · Sahne 1"); the filter uses `category` + `step` */
  group: string;
  /** where it is said: a category id and one of its step ids, or "music" (`places.ts`) */
  category?: string;
  step?: string;
  /** the take in use */
  approved?: string;
  /** the text the take in use was approved for, when it was approved for a
   *  changed text ("bu metin için onayla", A08) */
  approvedText?: string;
}

/** one recording of one line: generated or uploaded */
export interface Take {
  id: string;
  clip: string;
  asset: string;
  /** the text it was made from -- a line whose text changed since is stale */
  text: string;
  source: "eleven" | "upload";
  createdAt: number;
  /** the language it is in, when it is one of the children's other languages
   *  (absent: the app's Turkish, or the shared English) */
  lang?: string;
  /** a frame's take (a sentence with a gap for the word): where its pause is,
   *  [end of part 1, start of part 2] in seconds -- measured when it came in;
   *  absent on a frame take means no pause was found (make it again) */
  cut?: [number, number];
  /** measured, and no pause long enough was found */
  noPause?: true;
}

/** the delivery of one line: an audio tag ("[warmly]") and a stability */
export interface Direction { tag: string; stability: number }

/* ── the children's other languages (2026-10-16) ─────────────────────────────
   The app teaches English to Turkish children; the same app may teach it to
   Italian, German or Spanish children. What changes is the TEACHER's own
   language: a word's meaning ("Türkçesi, elma." → "In italiano, mela."), its
   description, the fixed lines. The English lines stay one set for all. */

/** a child's language other than Turkish */
export interface Language { code: string; name: string; meaningTemplate: string }

/** one language's texts: a word's meaning/description, a fixed line's sentence */
export interface Translation {
  words: Record<string, { meaning?: string; about?: string; parts?: string[] }>;
  lines: Record<string, string>;
}

/** a free take made in the workshop tab: not a line of the app's script */
export interface WorkshopTake {
  id: string; name: string; text: string; tag: string; lang: string;
  voiceId: string; model: string; asset: string; createdAt: number;
  /** the whole request's fingerprint (`1:<hash>`, F11); absent on takes made before it */
  fp?: string;
  /** the two settings the old duplicate check did not know */
  speed?: number; stability?: number;
}

/* ── the image studio ─────────────────────────────────────────────────────── */

export type ImageProvider = "openai" | "gemini";
export type ImageKind = "icon" | "background";

/** one generated picture, kept so a paid result is never lost */
export interface GenImage {
  id: string;
  asset: string;
  kind: ImageKind;
  provider: ImageProvider;
  model: string;
  prompt: string;
  /** what it is of: free text, or a word ("animals/dog") from the batch tab */
  subject: string;
  createdAt: number;
}

export interface ImageSettings {
  provider: ImageProvider;
  openaiModel: string;
  geminiModel: string;
}

/** the studio document (`/api/db`). `assets` is not saved in it: it is the
 *  server's file list, filled in when the panel opens. */
export interface Db {
  version: 1;
  assets: Asset[];
  voices: VoiceProfile[];
  lines: FixedLine[];
  takes: Take[];
  directions: Record<string, Direction>;
  seed: number;
  gens: GenImage[];
  imageSettings: ImageSettings;
  languages: Language[];
  i18n: Record<string, Translation>;
  /** the take in use per line in another language: `it` → clip → take */
  localeApproved: Record<string, Record<string, { asset: string; text: string }>>;
  /** English words said inside another language's sentence: their IPA */
  pron: Record<string, { ipa: string }>;
  /** the ElevenLabs dictionary made from `pron` (`hash` says from which list) */
  pronDict?: { id: string; version: string | null; hash: string };
  workshop: WorkshopTake[];
}

/** a word's recording slots (server: `vocab.ts` → SLOTS), and who says each */
export const SOUND_SLOTS: { id: import("./api").Slot; label: string; who: string; optional?: boolean }[] = [
  { id: "en", label: "İngilizce kelime", who: "Elif Öğretmen" },
  { id: "tr", label: "Türkçe anlamı", who: "Elif Öğretmen" },
  { id: "about", label: "Açıklama cümlesi", who: "Elif Öğretmen" },
  { id: "otter", label: "Tekrar", who: "Kuki" },
  { id: "about1", label: "Açıklama · 1. cümle", who: "Elif Öğretmen", optional: true },
  { id: "about2", label: "Açıklama · 2. cümle", who: "Elif Öğretmen", optional: true },
  { id: "about3", label: "Açıklama · 3. cümle", who: "Elif Öğretmen", optional: true },
  { id: "call", label: "Kendi sesi (hayvan vb.)", who: "Efekt", optional: true },
];

/** the slots every word needs; the rest only some words have */
export const NEEDED_SLOTS = SOUND_SLOTS.filter((s) => !s.optional);

export const ROLE_LABEL: Record<GameRole, string> = {
  teach: "1. oyun · öğretir",
  practice: "2. oyun · alıştırır",
  measure: "3. oyun · ölçer",
};

/** the bunny and otter speakers are whoever plays the learner and friend roles now */
export function setSpeakerNames(n: { learner?: string; friend?: string }) {
  if (n.learner) SPEAKERS.bunny.name = n.learner;
  if (n.friend) SPEAKERS.otter.name = n.friend;
}
