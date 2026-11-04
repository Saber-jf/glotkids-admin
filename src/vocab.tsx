/**
 * The vocabulary as the panel holds it: the server's words and word sets, and
 * the app's inventory (what the newest build can play, and the app's own
 * words with their sentence-by-sentence descriptions). Read once, changed only
 * through the server (`api.ts`).
 *
 * A word is ONE row everywhere: the word library, every set it is in, the
 * voice studio's lines and the picture studio's assignments all edit the same
 * word, so a fix is made once. Games and categories name a SET; after a change
 * here their word lists and checks are fetched again.
 */
import React from "react";
import { bodyOf, codeOf, createSet as apiCreateSet, createWord as apiCreateWord, deleteAudio, deleteSet, deleteWord, getInventory,
         listSets, listWords, patchSet, patchWord, putAudio,
         type Inventory, type NewWord, type Slot, type Word, type WordPatch, type WordSet } from "./api";
import { useGames } from "./games";
import { useCategories } from "./categories";

interface Vocab {
  words: Word[];
  sets: WordSet[];
  inventory: Inventory | null;
  loading: boolean;
  error: string;
  refresh: () => Promise<void>;
  wordOf: (id: string) => Word | undefined;
  createWord: (w: NewWord) => Promise<Word>;
  /** `base`: the version the edit started from (A02) -- changed elsewhere since → refused, nothing overwritten */
  updateWord: (id: string, p: WordPatch, base?: number) => Promise<Word>;
  removeWord: (id: string) => Promise<void>;
  /** a recording for one slot, and the text it was made from */
  setAudio: (id: string, slot: Slot, asset: string, text: string, durationMs?: number | null) => Promise<Word>;
  clearAudio: (id: string, slot: Slot) => Promise<Word>;
  createSet: (s: { name: string; note?: string; words?: string[] }) => Promise<WordSet>;
  updateSet: (id: string, p: { name?: string; note?: string; words?: string[] }, base?: number) => Promise<WordSet>;
  removeSet: (id: string) => Promise<void>;
  /** writes still on their way to the server */
  pending: number;
  /** resolves when every write sent so far has an answer (A03: publishing waits for it) */
  idle: () => Promise<void>;
}

const Ctx = React.createContext<Vocab | null>(null);

export function VocabProvider({ children }: { children: React.ReactNode }) {
  const [words, setWords] = React.useState<Word[]>([]);
  const [sets, setSets] = React.useState<WordSet[]>([]);
  const [inventory, setInventory] = React.useState<Inventory | null>(null);
  /* the recordings the app carries in its bundle: a word's slot recorded there is not a gap (F09) */
  if (inventory) bundled = new Set(inventory.clips ?? []);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const games = useGames(), cats = useCategories();

  const refresh = React.useCallback(async () => {
    try {
      const [w, s, inv] = await Promise.all([listWords(), listSets(), getInventory()]);
      setWords(w); setSets(s); setInventory(inv); setError("");
    } catch (e) { setError((e as Error).message); }
    setLoading(false);
  }, []);
  React.useEffect(() => { refresh(); }, [refresh]);

  /* games and categories show their set's words and are checked against
     them: fetched again after any change here */
  const others = () => { void games.refresh(); void cats.refresh(); };
  const putWord = (w: Word) => setWords((l) => (l.some((x) => x.id === w.id) ? l.map((x) => (x.id === w.id ? w : x)) : [...l, w]));
  const putSet = (s: WordSet) => setSets((l) => (l.some((x) => x.id === s.id) ? l.map((x) => (x.id === s.id ? s : x)) : [...l, s]));
  /* a set's words changed: every word knows which sets it is in */
  const setsChanged = async () => { setWords(await listWords()); others(); };

  const byId = React.useMemo(() => new Map(words.map((w) => [w.id, w])), [words]);

  /* every write is counted until it is answered: the publish page waits */
  const [pending, setPending] = React.useState(0);
  const flying = React.useRef(new Set<Promise<unknown>>());
  const track = <T,>(p: Promise<T>): Promise<T> => {
    flying.current.add(p); setPending((n) => n + 1);
    const done = () => { flying.current.delete(p); setPending((n) => n - 1); };
    p.then(done, done);
    return p;
  };
  /* a write refused because the row moved on: take the row as it is now, and
     say so -- the edit is not lost, it is the caller's to redo (A02) */
  const stale = (e: unknown, put: (x: never) => void): never => {
    const cur = bodyOf(e).current;
    if (codeOf(e) === "STALE" && cur) put(cur as never);
    throw e;
  };

  const value: Vocab = {
    words, sets, inventory, loading, error, refresh, pending,
    idle: async () => { while (flying.current.size) await Promise.allSettled([...flying.current]); },
    wordOf: (id) => byId.get(id),
    async createWord(w) { const made = await track(apiCreateWord(w)); putWord(made); return made; },
    async updateWord(id, p, base) {
      const next = await track(patchWord(id, p, base)).catch((e) => stale(e, putWord as never));
      putWord(next); others(); return next;
    },
    async removeWord(id) { await track(deleteWord(id)); setWords((l) => l.filter((x) => x.id !== id)); },
    async setAudio(id, slot, asset, text, durationMs) {
      const next = await track(putAudio(id, slot, asset, text, durationMs)); putWord(next); others(); return next;
    },
    async clearAudio(id, slot) { const next = await track(deleteAudio(id, slot)); putWord(next); others(); return next; },
    async createSet(s) { const made = await track(apiCreateSet(s)); putSet(made); if (s.words?.length) await setsChanged(); return made; },
    async updateSet(id, p, base) {
      const next = await track(patchSet(id, p, base)).catch((e) => stale(e, putSet as never));
      putSet(next); if (p.words) await setsChanged(); else others(); return next;
    },
    async removeSet(id) { await track(deleteSet(id)); setSets((l) => l.filter((x) => x.id !== id)); await setsChanged(); },
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useVocab(): Vocab {
  const v = React.useContext(Ctx);
  if (!v) throw new Error("VocabProvider yok");
  return v;
}

/** a word id from its English: what the app builds its clip ids from */
export const wordIdOf = (en: string) => en.trim().toLowerCase()
  .replace(/[çğıİöşü]/g, (c) => ({ ç: "c", ğ: "g", ı: "i", İ: "i", ö: "o", ş: "s", ü: "u" } as Record<string, string>)[c] ?? c)
  .replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40);

/*
 * WHERE A WORD'S PICTURE AND VOICE REALLY COME FROM (F09). The panel only
 * knows what was uploaded to it; a phone also has the app's bundle. So a slot
 * is one of four things, and only the last is a real gap:
 *   panel   a recording on the server (it replaces the bundled one)
 *   bundle  a recording in the app's bundle (the inventory's `clips`)
 *   device  no recording: the phone reads the text with its own voice
 *           (Turkish only with a Turkish voice, else silence -- rule 2)
 *   none    nothing at all: a sound effect with no file, or no text
 * An app word's picture is the app's (a bundled image or a drawing), never missing.
 */
let bundled: ReadonlySet<string> = new Set();
export type SoundSource = "panel" | "bundle" | "device" | "none";
export const SOURCE_LABEL: Record<SoundSource, string> = {
  panel: "panelden kayıt", bundle: "uygulamanın paketinde", device: "kayıt yok: cihaz sesi okur", none: "hiçbir karşılığı yok",
};
/** the app's clip id of a word's slot (server: vocab.ts → clipOf) */
export const clipOfSlot = (word: string, slot: Slot): string =>
  slot === "otter" ? `otter/en_${word}` : slot === "call" ? `animal/${word}` : `teacher/${slot}_${word}`;
export function soundSource(w: Word, slot: Slot): SoundSource {
  if (w.audio[slot]) return "panel";
  if (bundled.has(clipOfSlot(w.id, slot))) return "bundle";
  if (slot === "call") return "none";
  const text = slot === "en" || slot === "otter" ? w.en : slot === "tr" ? w.tr : slot === "about" ? w.about : "";
  return text.trim() ? "device" : "none";
}
const recorded = (src: SoundSource) => src === "panel" || src === "bundle";

/** what a word still needs before it is ready for a phone: a slot with no
 *  recording ANYWHERE (panel or bundle) -- the phone reads it with its own voice */
export function wordGaps(w: Word, needed: readonly Slot[]) {
  return {
    icon: !w.icon && !w.builtin,
    about: !w.about.trim(),
    sounds: needed.filter((s) => !recorded(soundSource(w, s)) && (s !== "about" || !!w.about.trim())),
  };
}

/** a set's readiness: pictures, recordings and descriptions still missing */
export function setGaps(words: Word[], needed: readonly Slot[]) {
  let icons = 0, sounds = 0, about = 0, total = 0;
  for (const w of words) {
    const g = wordGaps(w, needed);
    if (g.icon) icons++;
    if (g.about) about++;
    sounds += g.sounds.length;
    total += needed.filter((s) => s !== "about" || !!w.about.trim()).length;
  }
  return { icons, sounds, about, soundsTotal: total };
}
