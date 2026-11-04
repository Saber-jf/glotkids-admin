/**
 * The panel's studio state: one document (`Db`) the server keeps
 * (`/api/db`, revisioned) -- voices, the fixed lines and their takes,
 * directions, image generations, settings -- and the server's file list.
 *
 * The CONTENT is not in it: words, sets, games and categories are the
 * server's tables (`vocab.tsx`, `games.tsx`, `categories.tsx`). A word's
 * recordings live on the word (`/api/words/:id/audio/:slot`), so the voice
 * studio, the word editor and a release all see the same take; a fixed line
 * keeps its approved take here.
 *
 * Saving: every change goes out shortly after it is made, naming the revision
 * it was based on; a refusal (another window saved first) stops saving and
 * asks what to do. Only the studio's own parts are sent -- an older
 * document's word sets, games and categories (moved into tables by the
 * server, `migrate-json.ts`) are dropped on the first save; the server's
 * history keeps the revision that had them.
 */
import React from "react";
import { ApiError, deleteAsset, getDb, health, listAssets, putDb, uploadAsset, type Slot, type Word } from "./api";
import { audioDuration, findPause } from "./blobs";
import { seed } from "./seed";
import { APP_GROUP, isFrame, midBlank } from "./studio";
import { useVocab } from "./vocab";
import type { Asset, AssetKind, Db, Direction, FixedLine, GenImage, ImageSettings, Language, Take, VoiceProfile, WorkshopTake } from "./types";

const KEY = "loplop-admin/db";

/** what of a word is translated: its meaning, its description, or one sentence of it */
export type WordTextField = "meaning" | "about" | "part1" | "part2" | "part3";

export const uid = (p: string) =>
  `${p}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** "Hayvan Dostlarımız" -> "hayvan-dostlarimiz" */
export function slug(s: string): string {
  const map: Record<string, string> = { ç: "c", ğ: "g", ı: "i", İ: "i", ö: "o", ş: "s", ü: "u" };
  return s.trim().toLowerCase().replace(/[çğıİöşü]/g, (c) => map[c] ?? c)
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export function kindOf(file: File): AssetKind | null {
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("audio/")) return "audio";
  if (file.type.startsWith("video/")) return "video";
  return null;
}

export type Sync = "loading" | "saved" | "saving" | "offline" | "conflict";
export interface Recovery { at: number; baseRev: number; serverRev: number }

interface Store {
  db: Db;
  /** the server's document has arrived at least once: until then nothing on
   *  screen is real and nothing may be edited or saved */
  loaded: boolean;
  sync: Sync;
  syncError: string;
  /** throw away this window's changes and take the server's document */
  reloadFromServer: () => Promise<void>;
  /** save what is on screen now; true when the server has exactly it (A03) */
  flush: () => Promise<boolean>;
  /** work this browser kept that the server does not have, offered on opening (A06) */
  recovery: Recovery | null;
  restoreLocal: () => void;
  discardLocal: () => void;
  /** upload a file; `onProgress` follows a large one (a film) as it goes */
  addAsset: (file: File, onProgress?: (sent: number, total: number) => void) => Promise<Asset | null>;
  /** an asset the server already stored (a generated recording or picture) */
  addAssetMeta: (a: Asset) => void;
  /** delete a file -- the SERVER decides if it may (S06/A05): throws its
   *  refusal (409, with what uses it); the list changes only on success.
   *  `dropArchive`: the caller is deleting the archive record that keeps it */
  removeAsset: (id: string, dropArchive?: boolean) => Promise<void>;
  saveVoice: (v: VoiceProfile) => void;
  saveLine: (l: FixedLine, was?: string) => void;
  removeLine: (clip: string) => void;
  setDirection: (clip: string, d: Direction | null) => void;
  setSeed: (n: number) => void;
  /** a new recording of a line: it is put to use at once and the line's
   *  earlier recordings go, files included (user, 2026-10-20) */
  addTake: (t: Omit<Take, "id" | "createdAt">) => Take;
  removeTake: (id: string) => void;
  /** a frame's take: find its pause again (an older take, or a retry) */
  measureTake: (id: string) => void;
  /** put a take to use on its line (or clear it) */
  pickTake: (clip: string, asset: string | undefined) => void;
  addGen: (g: Omit<GenImage, "id" | "createdAt">) => void;
  removeGen: (id: string) => void;
  saveImageSettings: (s: ImageSettings) => void;
  /* the children's other languages */
  saveLanguage: (l: Language) => void;
  removeLanguage: (code: string) => void;
  /** a word's meaning/description or a fixed line's sentence in a language ("" clears it) */
  setWordText: (lang: string, word: string, field: WordTextField, text: string) => void;
  setLineText: (lang: string, clip: string, text: string) => void;
  /** a take in another language: put to use at once, the earlier ones go */
  addLocaleTake: (lang: string, t: Omit<Take, "id" | "createdAt" | "lang">) => void;
  pickLocaleTake: (lang: string, clip: string, asset: string | undefined, text: string) => void;
  /** an English word's IPA ("" removes it) */
  setPron: (word: string, ipa: string) => void;
  setPronDict: (d: Db["pronDict"]) => void;
  addWorkshop: (w: Omit<WorkshopTake, "id" | "createdAt">) => void;
  removeWorkshop: (id: string) => void;
}

const Ctx = React.createContext<Store | null>(null);

/** what is saved: the studio's own parts, never the file list */
const docOf = (db: Db) => ({
  version: 1 as const, voices: db.voices, lines: db.lines, takes: db.takes, directions: db.directions,
  seed: db.seed, gens: db.gens, imageSettings: db.imageSettings,
  languages: db.languages, i18n: db.i18n, localeApproved: db.localeApproved, pron: db.pron,
  ...(db.pronDict ? { pronDict: db.pronDict } : {}), workshop: db.workshop,
});

/** a document from the server, filled in where it predates a newer part */
function complete(db: Partial<Db>, assets: Asset[]): Db {
  const s = seed();
  return { version: 1, assets, voices: db.voices ?? s.voices, lines: db.lines ?? s.lines,
           takes: db.takes ?? [], directions: db.directions ?? {}, seed: db.seed ?? s.seed,
           gens: db.gens ?? [], imageSettings: db.imageSettings ?? s.imageSettings,
           languages: db.languages ?? [], i18n: db.i18n ?? {}, localeApproved: db.localeApproved ?? {},
           pron: db.pron ?? {}, pronDict: db.pronDict, workshop: db.workshop ?? [] };
}

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const vocab = useVocab();
  const [db, setDb] = React.useState<Db>(seed);
  const [sync, setSync] = React.useState<Sync>("loading");
  const [loaded, setLoaded] = React.useState(false);
  const [syncError, setSyncError] = React.useState("");
  const rev = React.useRef(0);
  /* the document as the server last confirmed it: nothing to save if equal */
  const confirmed = React.useRef("");

  /* what is not yet confirmed, kept in this browser as a last resort (A06):
     named by the server it belongs to and the revision it was based on, so it
     is only ever offered back for that server, and never written blind */
  const server = React.useRef("");
  const keepLocal = (doc: object) => {
    try { localStorage.setItem(KEY, JSON.stringify({ v: 2, server: server.current, baseRev: rev.current, at: Date.now(), doc })); }
    catch { /* full or blocked: the server copy is what counts */ }
  };
  const dropLocal = () => { try { localStorage.removeItem(KEY); } catch { /* blocked */ } };
  const [recovery, setRecovery] = React.useState<Recovery | null>(null);
  const local = React.useRef<{ doc: Partial<Db>; baseRev: number } | null>(null);

  const open = React.useCallback(async () => {
    setSync("loading"); setSyncError("");
    try {
      const [got, assets, h] = await Promise.all([getDb(), listAssets(), health().catch(() => null)]);
      server.current = h?.instance ?? "";
      let doc: Db;
      if (got) { doc = complete(got.db, assets); rev.current = got.rev; }
      else {
        /* a new server: start it from the seed -- unless another window (or
           React's development double start) just did, then take that one */
        doc = complete(seed(), assets);
        try { rev.current = (await putDb(0, docOf(doc))).rev; }
        catch (e) {
          const now = e instanceof ApiError && e.status === 409 ? await getDb() : null;
          if (!now) throw e;
          doc = complete(now.db, assets); rev.current = now.rev;
        }
      }
      confirmed.current = JSON.stringify(docOf(doc));
      /* work this browser kept and the server does not have: offered, not applied */
      try {
        const raw = JSON.parse(localStorage.getItem(KEY) ?? "null") as { v?: number; server?: string; baseRev?: number; at?: number; doc?: Partial<Db> } | null;
        if (raw?.v === 2 && raw.server && raw.server === server.current && raw.doc
            && JSON.stringify(docOf(complete(raw.doc, assets))) !== confirmed.current) {
          local.current = { doc: raw.doc, baseRev: raw.baseRev ?? 0 };
          setRecovery({ at: raw.at ?? 0, baseRev: raw.baseRev ?? 0, serverRev: rev.current });
        } else if (raw && raw.v !== 2) dropLocal();
      } catch { /* unreadable: nothing to offer */ }
      setDb(doc);
      setLoaded(true);
      setSync("saved");
    } catch (e) {
      setSync("offline"); setSyncError((e as Error).message);
    }
  }, []);
  React.useEffect(() => { open(); }, [open]);

  /*
   * SAVING (A06): one request at a time, shortly after the last change, and
   * after a failure ONE retry policy -- 5 s, 10 s, 20 s, … at most 60 s; a
   * conflict stops it until the editor decides. `flush` sends now and says
   * whether what is on screen is what the server has (A03).
   */
  const latest = React.useRef(db);
  latest.current = db;
  const syncRef = React.useRef(sync);
  syncRef.current = sync;
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const flying = React.useRef<Promise<boolean> | null>(null);
  const failures = React.useRef(0);
  const later = (ms: number) => { if (timer.current) clearTimeout(timer.current); timer.current = setTimeout(() => void saveNow(), ms); };
  async function saveNow(): Promise<boolean> {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    if (flying.current) await flying.current;
    if (syncRef.current === "conflict" || syncRef.current === "loading") return false;
    const doc = docOf(latest.current);
    const text = JSON.stringify(doc);
    if (text === confirmed.current) return true;
    setSync("saving");
    const run = (async () => {
      try {
        const r = await putDb(rev.current, doc);
        rev.current = r.rev; confirmed.current = text; failures.current = 0;
        setSyncError("");
        return true;
      } catch (e) {
        if (e instanceof ApiError && e.status === 409) { setSync("conflict"); setSyncError(e.message); return false; }
        setSync("offline"); setSyncError((e as Error).message);
        failures.current++;
        later(Math.min(60_000, 5000 * 2 ** (failures.current - 1)));
        return false;
      }
    })();
    flying.current = run;
    const ok = await run;
    flying.current = null;
    if (!ok) return false;
    /* changed while it was out: that goes next */
    if (JSON.stringify(docOf(latest.current)) !== confirmed.current) return saveNow();
    setSync("saved"); dropLocal();
    void sweep();
    return true;
  }

  /*
   * ONE RECORDING PER LINE, AND IT IS THE NEWEST (user, 2026-10-20: "yeni
   * kayıt eklendiğinde bir önceki kayıt silinmeli"). A new take replaces the
   * line's earlier ones in the document at once; their FILES are deleted only
   * once the document that no longer names them is the server's, and the
   * server still refuses a file something live uses (a word, an approval
   * elsewhere). Published releases keep their bytes -- a rollback needs them.
   */
  const vocabNow = React.useRef(vocab);
  vocabNow.current = vocab;
  const retiring = React.useRef(new Map<string, number>());   // asset -> sweeps tried
  const sweeping = React.useRef(false);
  const usedNow = (id: string) => {
    const d = latest.current;
    return d.takes.some((t) => t.asset === id) || d.lines.some((l) => l.approved === id)
      || Object.values(d.localeApproved).some((m) => Object.values(m).some((x) => x.asset === id))
      || vocabNow.current.words.some((w) => Object.values(w.audio).some((a) => a?.asset === id));
  };
  async function sweep() {
    if (sweeping.current || !retiring.current.size) return;
    if (JSON.stringify(docOf(latest.current)) !== confirmed.current) return;   // not the server's yet
    sweeping.current = true;
    try {
      for (const [id, n] of [...retiring.current]) {
        /* still named (a word not yet switched over): next time, a few times at most */
        if (usedNow(id)) { if (n >= 5) retiring.current.delete(id); else retiring.current.set(id, n + 1); continue; }
        try {
          await deleteAsset(id, true);
          retiring.current.delete(id);
          setDb((d) => ({ ...d, assets: d.assets.filter((a) => a.id !== id) }));
        } catch (e) {
          if (e instanceof ApiError && e.status === 409 && n < 5) retiring.current.set(id, n + 1);
          else retiring.current.delete(id);
        }
      }
    } finally { sweeping.current = false; }
  }
  /* A FRAME'S PAUSE, measured in the browser once the take has come in
     (2026-10-23): written on the take as `cut`, or `noPause` when the take
     has none long enough to be the blank */
  const measure = (takeId: string, asset: string) => {
    void findPause({ id: asset, kind: "audio" } as Asset).then(
      (cut) => setDb((d) => ({ ...d, takes: d.takes.map((x) => (x.id !== takeId ? x
        : cut ? { ...x, cut, noPause: undefined } : { ...x, cut: undefined, noPause: true })) })),
      () => setDb((d) => ({ ...d, takes: d.takes.map((x) => (x.id === takeId ? { ...x, cut: undefined, noPause: true } : x)) })));
  };
  const retire = (ids: (string | undefined)[], keep: string) => {
    for (const id of new Set(ids)) if (id && id !== keep) retiring.current.set(id, retiring.current.get(id) ?? 0);
    void sweep();
  };

  React.useEffect(() => {
    if (!loaded) return;
    const text = JSON.stringify(docOf(db));
    if (text === confirmed.current) return;
    keepLocal(docOf(db));
    if (sync === "loading" || sync === "conflict") return;
    /* "saved" is shown only for what the server confirmed */
    if (sync === "saved") setSync("saving");
    if (failures.current === 0) later(600);
  }, [db, loaded, sync === "loading" || sync === "conflict"]); // eslint-disable-line react-hooks/exhaustive-deps

  /* an app sentence's text is the app's: a copy in the document follows it,
     so a recording made before the app changed it shows as made from an old text */
  React.useEffect(() => {
    const app = new Map((vocab.inventory?.lines ?? []).map((l) => [l.clip, l.text]));
    if (!loaded || !app.size) return;
    setDb((d) => {
      let changed = false;
      const lines = d.lines.map((l) => {
        const t = app.get(l.clip);
        if (t === undefined || t === l.text) return l;
        changed = true;
        return { ...l, text: t };
      });
      return changed ? { ...d, lines } : d;
    });
  }, [loaded, vocab.inventory]);

  /* closing the tab with unconfirmed work: the browser asks */
  React.useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (loaded && JSON.stringify(docOf(latest.current)) !== confirmed.current) { e.preventDefault(); e.returnValue = ""; }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [loaded]);

  /* a word's recording is the server's: written there, not in the document */
  const fail = (e: unknown) => alert(`Kayıt kelimeye yazılamadı: ${(e as Error).message}`);
  const applyWord = (clip: string, asset: string | undefined, text: string) => {
    const w = wordSlot(vocab.wordOf, clip);
    if (!w) return false;
    if (!asset) { vocab.clearAudio(w.word, w.slot).catch(fail); return true; }
    /* its length goes with it: the release lists recordings too long for a child to wait through (M09) */
    const a = db.assets.find((x) => x.id === asset);
    void (a?.url ? audioDuration(a.url) : Promise.resolve(null))
      .then((ms) => vocab.setAudio(w.word, w.slot, asset, text, ms)).then(() => void sweep()).catch(fail);
    return true;
  };
  const textOf = (d: Db, clip: string, asset: string | undefined) =>
    d.takes.find((t) => t.clip === clip && t.asset === asset)?.text ?? "";

  const store: Store = {
    db, loaded, sync, syncError,
    reloadFromServer: open,
    flush: saveNow,
    recovery,
    restoreLocal() {
      const l = local.current;
      if (!l) return;
      /* applied as an edit: saved over the server's current revision, which
         the editor was shown and agreed to */
      setDb((d) => complete(l.doc, d.assets));
      local.current = null; setRecovery(null);
    },
    discardLocal() { local.current = null; setRecovery(null); dropLocal(); },
    async addAsset(file, onProgress) {
      if (!kindOf(file)) return null;
      const a = await uploadAsset(file, file.name, undefined, onProgress);
      setDb((d) => ({ ...d, assets: [a, ...d.assets] }));
      return a;
    },
    addAssetMeta: (a) => setDb((d) => ({ ...d, assets: [a, ...d.assets] })),
    async removeAsset(id, dropArchive = false) {
      await deleteAsset(id, dropArchive);
      setDb((d) => ({ ...d, assets: d.assets.filter((a) => a.id !== id) }));
    },
    saveVoice: (v) => setDb((d) => ({ ...d, voices: d.voices.some((x) => x.speaker === v.speaker)
      ? d.voices.map((x) => (x.speaker === v.speaker ? v : x)) : [...d.voices, v] })),
    saveLine: (l, was) => setDb((d) => {
      const key = was ?? l.clip;
      return { ...d, lines: d.lines.some((x) => x.clip === key)
        ? d.lines.map((x) => (x.clip === key ? l : x)) : [...d.lines, l] };
    }),
    removeLine: (clip) => setDb((d) => ({ ...d, lines: d.lines.filter((l) => l.clip !== clip) })),
    setDirection: (clip, dir) => setDb((d) => {
      const directions = { ...d.directions };
      if (dir) directions[clip] = dir; else delete directions[clip];
      return { ...d, directions };
    }),
    setSeed: (n) => setDb((d) => ({ ...d, seed: n })),
    addTake(t) {
      const take: Take = { ...t, id: uid("take"), createdAt: Date.now() };
      const mine = (x: Take) => x.clip === t.clip && !x.lang;
      const gone = [...db.takes.filter(mine).map((x) => x.asset), current(db, vocab.wordOf, t.clip)];
      setDb((d) => {
        let next = { ...d, takes: [...d.takes.filter((x) => !mine(x)), take] };
        if (wordSlot(vocab.wordOf, t.clip)) return next;
        /* an app sentence enters the document when it is first recorded */
        if (!next.lines.some((l) => l.clip === t.clip)) {
          const a = vocab.inventory?.lines?.find((l) => l.clip === t.clip);
          if (a) next = { ...next, lines: [...next.lines, { clip: a.clip, speaker: a.speaker, text: a.text, group: APP_GROUP,
                                                            ...(a.places[0] ?? {}) }] };
        }
        return applyLine(next, t.clip, t.asset);
      });
      applyWord(t.clip, t.asset, t.text);
      retire(gone, t.asset);
      if (isFrame(t.clip) && !t.lang && midBlank(t.text)) measure(take.id, t.asset);
      return take;
    },
    measureTake(id) {
      const t = db.takes.find((x) => x.id === id);
      if (t) measure(t.id, t.asset);
    },
    removeTake(id) {
      const t = db.takes.find((x) => x.id === id);
      if (t?.lang) {
        const lang = t.lang;
        setDb((d) => {
          const mine = { ...(d.localeApproved[lang] ?? {}) };
          if (mine[t.clip]?.asset === t.asset) delete mine[t.clip];
          return { ...d, takes: d.takes.filter((x) => x.id !== id), localeApproved: { ...d.localeApproved, [lang]: mine } };
        });
        return;
      }
      const inUse = !!t && current(db, vocab.wordOf, t.clip) === t.asset;
      setDb((d) => {
        let next = { ...d, takes: d.takes.filter((x) => x.id !== id) };
        if (t && inUse && !wordSlot(vocab.wordOf, t.clip)) next = applyLine(next, t.clip, undefined);
        return next;
      });
      if (t && inUse) applyWord(t.clip, undefined, "");
    },
    pickTake(clip, asset) {
      if (applyWord(clip, asset, textOf(db, clip, asset))) return;
      setDb((d) => applyLine(d, clip, asset));
    },
    addGen: (g) => setDb((d) => ({ ...d, gens: [{ ...g, id: uid("gen"), createdAt: Date.now() }, ...d.gens] })),
    removeGen: (id) => setDb((d) => ({ ...d, gens: d.gens.filter((g) => g.id !== id) })),
    saveImageSettings: (s) => setDb((d) => ({ ...d, imageSettings: s })),
    saveLanguage: (l) => setDb((d) => ({ ...d, languages: d.languages.some((x) => x.code === l.code)
      ? d.languages.map((x) => (x.code === l.code ? l : x)) : [...d.languages, l] })),
    /* the language goes from the list; its texts and takes stay (an archive),
       so adding it back finds them */
    removeLanguage: (code) => setDb((d) => ({ ...d, languages: d.languages.filter((x) => x.code !== code) })),
    setWordText: (lang, word, field, text) => setDb((d) => {
      const tr = d.i18n[lang] ?? { words: {}, lines: {} };
      const w = { ...(tr.words[word] ?? {}) };
      if (field === "meaning" || field === "about") { if (text.trim()) w[field] = text; else delete w[field]; }
      else {
        const parts = [...(w.parts ?? [])];
        parts[Number(field.slice(4)) - 1] = text;
        while (parts.length && !parts.at(-1)?.trim()) parts.pop();
        w.parts = Array.from(parts, (x) => x ?? "");
      }
      return { ...d, i18n: { ...d.i18n, [lang]: { ...tr, words: { ...tr.words, [word]: w } } } };
    }),
    setLineText: (lang, clip, text) => setDb((d) => {
      const tr = d.i18n[lang] ?? { words: {}, lines: {} };
      const lines = { ...tr.lines };
      if (text.trim()) lines[clip] = text; else delete lines[clip];
      return { ...d, i18n: { ...d.i18n, [lang]: { ...tr, lines } } };
    }),
    addLocaleTake(lang, t) {
      const take: Take = { ...t, lang, id: uid("take"), createdAt: Date.now() };
      const same = (x: Take) => x.clip === t.clip && x.lang === lang;
      retire([...db.takes.filter(same).map((x) => x.asset), db.localeApproved[lang]?.[t.clip]?.asset], t.asset);
      setDb((d) => ({ ...d, takes: [...d.takes.filter((x) => !same(x)), take],
                      localeApproved: { ...d.localeApproved, [lang]: { ...(d.localeApproved[lang] ?? {}), [t.clip]: { asset: t.asset, text: t.text } } } }));
    },
    pickLocaleTake: (lang, clip, asset, text) => setDb((d) => {
      const mine = { ...(d.localeApproved[lang] ?? {}) };
      if (asset) mine[clip] = { asset, text }; else delete mine[clip];
      return { ...d, localeApproved: { ...d.localeApproved, [lang]: mine } };
    }),
    setPron: (word, ipa) => setDb((d) => {
      const pron = { ...d.pron };
      const k = word.trim().toLowerCase();
      if (ipa.trim()) pron[k] = { ipa: ipa.trim().replace(/^\/|\/$/g, "") }; else delete pron[k];
      return { ...d, pron };
    }),
    setPronDict: (p) => setDb((d) => ({ ...d, pronDict: p })),
    addWorkshop: (w) => setDb((d) => ({ ...d, workshop: [{ ...w, id: uid("ws"), createdAt: Date.now() }, ...d.workshop] })),
    removeWorkshop: (id) => setDb((d) => ({ ...d, workshop: d.workshop.filter((x) => x.id !== id) })),
  };
  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

/* ── where a line's recording in use is kept ────────────────────────────────
   A word's lines live on the word (server), so the word editor, the studio
   and a release see the same file; a fixed line keeps its own here. The clip
   ids are the app's (server: `vocab.ts` → clipOf). */
const WORD_CLIP = /^(teacher|otter)\/(en|tr|about|about1|about2|about3)_(.+)$/;
const CALL_CLIP = /^animal\/(.+)$/;

export function wordSlot(wordOf: (id: string) => Word | undefined, clip: string): { slot: Slot; word: string } | null {
  const c = CALL_CLIP.exec(clip);
  if (c) return wordOf(c[1]!) ? { slot: "call", word: c[1]! } : null;
  const m = WORD_CLIP.exec(clip);
  if (!m) return null;
  const [, who, kind, word] = m;
  if (!wordOf(word!)) return null;
  if (who === "otter") return kind === "en" ? { slot: "otter", word: word! } : null;
  return { slot: kind as Slot, word: word! };
}

/** the clip a word's slot is recorded as -- `wordSlot` the other way round */
export function slotClip(word: string, slot: Slot): string {
  if (slot === "call") return `animal/${word}`;
  if (slot === "otter") return `otter/en_${word}`;
  return `teacher/${slot}_${word}`;
}

export function current(db: Db, wordOf: (id: string) => Word | undefined, clip: string): string | undefined {
  const w = wordSlot(wordOf, clip);
  if (w) return wordOf(w.word)?.audio[w.slot]?.asset;
  return db.lines.find((l) => l.clip === clip)?.approved;
}

function applyLine(db: Db, clip: string, asset: string | undefined): Db {
  /* a new take is approved for its own text: an earlier "approved for this text" goes with the old one */
  return { ...db, lines: db.lines.map((l) => (l.clip === clip ? { ...l, approved: asset, approvedText: undefined } : l)) };
}

export function useStore(): Store {
  const s = React.useContext(Ctx);
  if (!s) throw new Error("StoreProvider yok");
  return s;
}
