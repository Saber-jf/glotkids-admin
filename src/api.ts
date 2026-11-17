/**
 * The server (`../loplop-server`), reached through the dev server's /api proxy.
 * Every call the panel makes to it is here.
 *
 * What lives where (`../loplop/docs/ICERIK-MIMARISI.md`):
 *   words, word sets      /words, /sets              the shared vocabulary
 *   games, categories     /games, /categories        each names a word set
 *   files                 /assets                    content-addressed on disk
 *   releases              /releases, /channels       what phones receive
 *   the app's inventory   /inventory                 what each build can play
 *   the studio document   /db                        voices, fixed lines, takes,
 *                                                    image generations
 */
import type { Asset, Db } from "./types";
import { accessToken } from "./lib/auth";
import { setSpeakerNames } from "./types";

export class ApiError extends Error {
  status: number;
  constructor(status: number, msg: string) { super(msg); this.status = status; }
}

/* ── the panel's key (server: ADMIN_TOKEN) ───────────────────────────────── */

const TOKEN_KEY = "loplop-admin-token";
const storedKey = (): string => { try { return localStorage.getItem(TOKEN_KEY) ?? ""; } catch { return ""; } };
/** what the panel sends: the signed-in account's access token, or (without accounts) the typed key */
export const getToken = (): string => accessToken() || storedKey();
export const setToken = (t: string) => { try { localStorage.setItem(TOKEN_KEY, t); } catch { /* blocked */ } };
/** fired when the server says the PANEL's key is missing or wrong -- only for
 *  `ADMIN_UNAUTHORIZED`; a provider's rejected key is not a logout (S09) */
export const AUTH_EVENT = "loplop-auth-needed";
/** fired when a signed-in account is not one of the panel's admins (`ADMIN_FORBIDDEN`) */
export const FORBIDDEN_EVENT = "loplop-auth-forbidden";

/*
 * MEDIA (S10). An <img>, <audio> or <video> cannot send a header, and the
 * admin key must never travel in a URL. So the panel holds a short-lived,
 * read-only MEDIA token (`/api/auth/media`), refreshed before it runs out,
 * and only that goes into a file address. No key on the server: none needed.
 */
let MEDIA: { token: string; expiresAt: number } | null = null;
export async function refreshMedia(): Promise<void> {
  try {
    const m = await req<{ token: string | null; expiresAt: number | null }>("/auth/media");
    MEDIA = m.token && m.expiresAt ? { token: m.token, expiresAt: m.expiresAt } : null;
  } catch { MEDIA = null; }
}
/** a server file address an <img>, <audio> or <video> can load */
export function withKey(url: string): string {
  /* an address that already carries the token (assetUrl, then audioDuration) gets it once */
  if (!MEDIA || !url.startsWith("/api/assets/") || /[?&]m=/.test(url)) return url;
  return `${url}${url.includes("?") ? "&" : "?"}m=${encodeURIComponent(MEDIA.token)}`;
}
/** a file's bytes, fetched with the panel's own key in a header (never in the URL) */
export async function fetchFile(url: string): Promise<Blob> {
  const t = getToken();
  let r: Response;
  try { r = await fetch(url, { headers: t ? { Authorization: `Bearer ${t}` } : {} }); }
  catch { throw new ApiError(0, "Dosya alınamadı: sunucuya ulaşılamıyor."); }
  if (!r.ok) throw new ApiError(r.status, r.status === 401 ? "Dosya için giriş gerekli." : r.status === 404 ? "Dosya yok." : `Dosya alınamadı (${r.status}).`);
  return r.blob();
}

/** what a refused request carries besides its message */
export interface ApiBody { error?: string; code?: string; [k: string]: unknown }
export const bodyOf = (e: unknown): ApiBody => ((e as { body?: ApiBody }).body ?? {});
export const codeOf = (e: unknown): string | undefined => bodyOf(e).code;

async function req<T>(path: string, init: RequestInit = {}): Promise<T> {
  let r: Response;
  const t = getToken();
  const headers = new Headers(init.headers);
  if (t) headers.set("Authorization", `Bearer ${t}`);
  try { r = await fetch(`/api${path}`, { ...init, headers }); }
  catch { throw new ApiError(0, "Sunucuya ulaşılamıyor. loplop-server klasöründe `npm run dev` çalışıyor mu?"); }
  if (!r.ok) {
    let msg = `${r.status}`;
    let body: unknown = null;
    try { body = await r.json(); msg = (body as { error?: string }).error ?? msg; } catch { /* not json */ }
    if (r.status === 401 && (body as ApiBody | null)?.code === "ADMIN_UNAUTHORIZED") window.dispatchEvent(new Event(AUTH_EVENT));
    if (r.status === 403 && (body as ApiBody | null)?.code === "ADMIN_FORBIDDEN") window.dispatchEvent(new Event(FORBIDDEN_EVENT));
    const e = new ApiError(r.status, msg);
    (e as ApiError & { body?: unknown }).body = body;
    throw e;
  }
  if (r.status === 204) return undefined as T;
  return r.json() as Promise<T>;
}
const json = (method: string, body: unknown, ifMatch?: number): RequestInit =>
  ({ method, headers: { "Content-Type": "application/json", ...(ifMatch !== undefined ? { "If-Match": `"${ifMatch}"` } : {}) },
     body: JSON.stringify(body) });
const enc = encodeURIComponent;

export interface Health {
  ok: boolean; dataDir: string; auth: boolean; instance: string;
  app: { build: number; version: string } | null;
  channels: Record<string, number | null>;
}
export const health = () => req<Health>("/health");

/* ── the studio document ──────────────────────────────────────────────────── */

export async function getDb(): Promise<{ rev: number; db: Db } | null> {
  try { return await req<{ rev: number; db: Db }>("/db"); }
  catch (e) { if (e instanceof ApiError && e.status === 404) return null; throw e; }
}
export const putDb = (rev: number, db: unknown) => req<{ rev: number; savedAt: string }>("/db", json("PUT", { rev, db }));

/* ── files ────────────────────────────────────────────────────────────────── */

export const listAssets = () => req<Asset[]>("/assets");
/** where a file is used (server: `assetUsage`) -- `archive`: a take or a generated picture only */
export interface Use { kind: string; ref: string; text: string; archive?: boolean }
export const assetUsage = () => req<Record<string, Use[]>>("/assets/usage");
export async function uploadAsset(file: Blob, name: string, id?: string,
                                  onProgress?: (sent: number, total: number) => void): Promise<Asset> {
  const f = new FormData();
  f.append("file", file, name);
  const path = `/assets${id ? `?id=${enc(id)}` : ""}`;
  if (!onProgress) return req<Asset>(path, { method: "POST", body: f });
  /* fetch cannot report how much of an upload has gone: a film is large
     enough that the screen should show it */
  return new Promise<Asset>((resolve, reject) => {
    const x = new XMLHttpRequest();
    x.open("POST", `/api${path}`);
    const t = getToken();
    if (t) x.setRequestHeader("Authorization", `Bearer ${t}`);
    x.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(e.loaded, e.total); };
    x.onerror = () => reject(new ApiError(0, "Sunucuya ulaşılamıyor; dosya yüklenemedi."));
    x.onload = () => {
      let body: unknown = null;
      try { body = JSON.parse(x.responseText); } catch { /* not json */ }
      if (x.status >= 200 && x.status < 300) return resolve(body as Asset);
      if (x.status === 401 && (body as ApiBody | null)?.code === "ADMIN_UNAUTHORIZED") window.dispatchEvent(new Event(AUTH_EVENT));
      const e = new ApiError(x.status, (body as ApiBody | null)?.error ?? (x.status === 413 ? "Dosya çok büyük." : `${x.status}`));
      (e as ApiError & { body?: unknown }).body = body;
      reject(e);
    };
    x.send(f);
  });
}
/** refused with 409 `ASSET_IN_USE` (and its uses) or `ASSET_ARCHIVED` unless
 *  `dropArchive` -- the caller is deleting that very archive record (S06) */
export const deleteAsset = (id: string, dropArchive = false) =>
  req<{ ok: true }>(`/assets/${enc(id)}${dropArchive ? "?archive=drop" : ""}`, { method: "DELETE" });
export const gcAssets = () => req<{ removed: number; bytes: number }>("/assets/gc", { method: "POST" });

/* ── keys: the server keeps them; the panel only learns whether they are set ─ */

export type KeyName = "elevenlabs" | "openai" | "gemini" | "anthropic" | "suno";
export type KeyStatus = Record<KeyName, { set: boolean; source: "panel" | "env" | null; hint: string | null }>;
export const getKeys = () => req<KeyStatus>("/settings/keys");
export const setKeyOnServer = (name: KeyName, value: string) => req<KeyStatus>("/settings/keys", json("PUT", { name, value }));
export const testKey = (name: KeyName) => req<{ ok: boolean; text: string }>(`/ai/test/${name}`);

/* ── AI ───────────────────────────────────────────────────────────────────── */

export interface Voice { voice_id: string; name: string; labels?: Record<string, string>; preview_url?: string }
export const listVoices = () => req<Voice[]>("/ai/eleven/voices");
export const credits = () => req<{ used: number; limit: number }>("/ai/eleven/credits");
/* every paid request names its job (S08): asked again with the same id the
   server answers from what it stored and never pays twice */
export const newJobId = () => `job-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
/** `uncertain`: the request may have reached the provider and been charged; never re-sent on its own (decision 3) */
export interface Job { id: string; kind: string; status: "running" | "done" | "partial" | "failed" | "uncertain";
                       assets: Asset[]; errors: string[]; createdAt: number; updatedAt: number }
export const tts = (body: unknown) => req<Asset & { jobId: string }>("/ai/eleven/tts", json("POST", body));
export interface ElevenModel { model_id: string; name: string; languages: string[] }
export const listModels = () => req<ElevenModel[]>("/ai/eleven/models");
/** voice design (paid): previews of a described voice, each with the id to keep it by */
export const designVoice = (body: { description: string; text?: string; jobId: string }) =>
  req<{ job: Job; previews: (Asset & { generatedVoiceId: string | null })[] }>("/ai/eleven/design", json("POST", body));
export const saveDesignedVoice = (body: { name: string; description: string; generatedVoiceId: string }) =>
  req<{ voice_id: string; name: string }>("/ai/eleven/design-save", json("POST", body));
/** the pronunciation dictionary (free): English words as IPA phoneme rules */
export const makePronDict = (body: { name: string; rules: { word: string; ipa: string }[] }) =>
  req<{ id: string; version_id: string | null; rules: number }>("/ai/eleven/pronunciation", json("POST", body));
export const images = (body: unknown) => req<Job>("/ai/images", json("POST", body));
export const getJob = (id: string) => req<Job>(`/ai/jobs/${enc(id)}`);
export const listJobs = () => req<Job[]>("/ai/jobs");

/* ── the vocabulary (server: modules/vocab.ts) ────────────────────────────── */

export const SLOTS = ["en", "tr", "about", "about1", "about2", "about3", "otter", "call"] as const;
export type Slot = (typeof SLOTS)[number];
export type WordKind = "thing" | "action" | "feeling" | "size" | "place" | "colour" | "number";

export interface Word {
  id: string; en: string; tr: string; about: string; kind: WordKind; color: string;
  icon: string | null; builtin: boolean; updatedAt: number;
  audio: Partial<Record<Slot, { asset: string; text: string; updatedAt: number; durationMs: number | null }>>;
  sets: string[];
}
export interface NewWord { id: string; en: string; tr: string; about?: string; kind?: WordKind; color?: string; icon?: string | null }
export type WordPatch = Partial<Omit<NewWord, "id">>;

export interface WordSet {
  id: string; name: string; note: string; builtin: boolean; words: string[];
  createdAt: number; updatedAt: number;
  usedBy: { games: string[]; categories: string[] };
}

export const listWords = () => req<Word[]>("/words");
export const createWord = (w: NewWord) => req<Word>("/words", json("POST", w));
/** `base`: the version the edit started from; changed since → 409 `STALE` (A02) */
export const patchWord = (id: string, p: WordPatch, base?: number) => req<Word>(`/words/${enc(id)}`, json("PATCH", p, base));
export const deleteWord = (id: string) => req<{ ok: true }>(`/words/${enc(id)}`, { method: "DELETE" });
export const putAudio = (id: string, slot: Slot, asset: string, text: string, durationMs?: number | null) =>
  req<Word>(`/words/${enc(id)}/audio/${slot}`, json("PUT", { asset, text, durationMs: durationMs ?? null }));
export const deleteAudio = (id: string, slot: Slot) => req<Word>(`/words/${enc(id)}/audio/${slot}`, { method: "DELETE" });

export const listSets = () => req<WordSet[]>("/sets");
export const createSet = (s: { name: string; note?: string; words?: string[] }) => req<WordSet>("/sets", json("POST", s));
export const patchSet = (id: string, p: { name?: string; note?: string; words?: string[] }, base?: number) =>
  req<WordSet>(`/sets/${enc(id)}`, json("PATCH", p, base));
export const deleteSet = (id: string) => req<{ ok: true }>(`/sets/${enc(id)}`, { method: "DELETE" });

/* ── the game catalog (server: modules/games.ts) ──────────────────────────── */

export type GameRole = "teach" | "practice" | "measure";
export type Status = "live" | "draft" | "hidden";
/** `area`: the part of a category it is about (server: checks.ts) */
export interface Issue { level: "error" | "warn"; text: string; step?: string; area?: "card" | "words" | "flow" }
/** a set's word as a game or category shows it (never edited through them) */
export interface GameWord { id: string; en: string; tr: string; icon: string | null; color: string }
export interface CatalogGame {
  id: string; template: string; builtin: boolean; name: string; subtitle: string; icon: string | null;
  role: GameRole; kind: "game" | "scene" | "demo"; family: string; gesture: string; accepts: string | null;
  set: string | null; config: Record<string, unknown>;
  words: GameWord[]; status: Status; order: number; createdAt: number; updatedAt: number;
  /** can new games be made from it -- can the app play it with new words */
  takesWords: boolean;
  issues: Issue[];
}
export interface NewGame { template: string; name: string; subtitle?: string; family?: string; icon?: string | null; set?: string | null }
export type GamePatch = Partial<Pick<CatalogGame, "name" | "subtitle" | "icon" | "set" | "family" | "status" | "config">>;

export const listGames = () => req<CatalogGame[]>("/games");
export const createGame = (g: NewGame) => req<CatalogGame>("/games", json("POST", g));
export const patchGame = (id: string, p: GamePatch, base?: number) => req<CatalogGame>(`/games/${enc(id)}`, json("PATCH", p, base));
export const deleteGame = (id: string) => req<{ ok: true }>(`/games/${enc(id)}`, { method: "DELETE" });
export const orderGames = (ids: string[]) => req<CatalogGame[]>("/games/order", json("PUT", { ids }));

/* ── categories (server: modules/categories.ts) ──────────────────────────── */

export type FlowStep =
  /** `fit`: "cover" fills the phone and crops, "contain" shows all of it with bands */
  | { id: string; kind: "video"; video: string | null; note: string; fit?: "cover" | "contain" }
  | { id: string; kind: "scene"; scene: string; note: string }
  | { id: string; kind: "game"; game: string | null; teach: boolean }
  | { id: string; kind: "finish" };
export type FlowIssue = Issue;
export interface ServerCategory {
  id: string; builtin: boolean; title: string; subtitle: string; icon: string | null; set: string | null;
  status: Status; order: number; words: GameWord[]; steps: FlowStep[];
  createdAt: number; updatedAt: number; issues: Issue[];
  /** about what a phone downloads for it, in bytes */
  download?: number;
}
export type CategoryPatch = Partial<Pick<ServerCategory, "title" | "subtitle" | "icon" | "set" | "steps" | "status">>;

export const listCategories = () => req<ServerCategory[]>("/categories");
export const createCategory = (c: { title: string; subtitle?: string; icon?: string | null; set?: string | null }) =>
  req<ServerCategory>("/categories", json("POST", c));
export const patchCategory = (id: string, p: CategoryPatch, base?: number) =>
  req<ServerCategory>(`/categories/${enc(id)}`, json("PATCH", p, base));
export const deleteCategory = (id: string) => req<{ ok: true }>(`/categories/${enc(id)}`, { method: "DELETE" });

/* ── the roadmap's rows (server: modules/roadmap.ts) ──────────────────────── */

/*
 * THE DRAWN MAP (2026-11-03, the app's docs/YOL-HARITASI-CIZILI.md): one row
 * per category -- game stops 1, 2, 3 and an optional music stop -- drawn by
 * code. The app ships its six rows; a row made here goes after them. The
 * server still calls a row a "slide" (its table, its routes).
 */
export type StopKind = "1" | "2" | "3" | "music";
/** the app's own map, as its newest build reports it */
export interface RoadWorld {
  kind: "drawn"; since: number;
  /** the most stops one row has (games 1 · 2 · 3 and music) */
  stopsPerRow: number;
  stops: { id: string; kind: StopKind; row: string }[];
  /** the app's rows in map order, each with its category's title */
  rows: { row: string; title: string; stops: { id: string; kind: StopKind }[] }[];
}
/** a stop opens a run of a category's steps -- or, a music stop, plays its song */
export interface SlideStop { id: string; kind: StopKind; category: string; steps: string[]; song?: string | null }
export interface RoadSlide {
  id: string; title: string; stops: SlideStop[]; status: Status; order: number; createdAt: number; updatedAt: number; issues: Issue[];
  /** the category its game stops open (a row is one category), or null */
  category: string | null;
  /** the download pack it travels in */
  pack: string | null;
}
export type SlidePatch = Partial<Pick<RoadSlide, "title" | "stops" | "status" | "pack">>;

/* ── download packs (server: modules/packs.ts) ────────────────────────────── */

export interface Pack {
  id: string; title: string; subtitle: string; note: string; offerAt: string | null; status: Status;
  createdAt: number; updatedAt: number;
  lands: { id: string; title: string; status: Status; stops: number; errors: number }[];
  categories: { id: string; title: string; status: Status }[];
  bytes: number; sizes: { image: number; audio: number; video: number }; files: number; issues: Issue[];
}
export type PackPatch = Partial<Pick<Pack, "title" | "subtitle" | "note" | "offerAt" | "status">>;
export const listPacks = () => req<Pack[]>("/packs");
export const createPack = (title: string, subtitle = "") => req<Pack>("/packs", json("POST", { title, subtitle }));
export const patchPack = (id: string, p: PackPatch, base?: number) => req<Pack>(`/packs/${enc(id)}`, json("PATCH", p, base));
export const deletePack = (id: string) => req<{ ok: true }>(`/packs/${enc(id)}`, { method: "DELETE" });
export const getRoadmap = () => req<{ world: RoadWorld | null; slides: RoadSlide[] }>("/roadmap");
export const createSlide = (title: string) => req<RoadSlide>("/roadmap/slides", json("POST", { title }));
export const patchSlide = (id: string, p: SlidePatch, base?: number) => req<RoadSlide>(`/roadmap/slides/${enc(id)}`, json("PATCH", p, base));
export const deleteSlide = (id: string) => req<{ ok: true }>(`/roadmap/slides/${enc(id)}`, { method: "DELETE" });
export const orderSlides = (ids: string[]) => req<RoadSlide[]>("/roadmap/order", json("PUT", { ids }));

/* ── the app's inventory (server: modules/inventory.ts) ──────────────────── */

export interface TemplateInfo {
  id: string; kind: "game" | "scene" | "demo"; role: GameRole; family: string; gesture: string;
  menu: boolean; open: boolean; needs: { icon: boolean }; slots: string[]; since: number;
  /** can a category step ask it to introduce each word with a card (M05) */
  teach?: boolean;
  name: string; subtitle: string; accepts: string | null;
}
export interface SceneInfo { id: string; name: string; for: string | null; since: number }
export interface Inventory {
  schema: number; app: { version: string; build: number };
  templates: TemplateInfo[]; scenes: SceneInfo[];
  words: { id: string; en: string; tr: string; about: string; aboutParts: string[]; kind: string; color: string; icon: string | null }[];
  sets: { id: string; name: string; words: string[] }[];
  categories: { id: string; title: string; subtitle: string; set: string; steps: { id: string; kind: string }[]; since: number }[];
  clips: string[];
  /** every fixed sentence the app says and the category steps it is said in
   *  (the app's `tools/inventory/lines.ts`); an older app sends none */
  lines?: AppLine[];
}
export interface AppLine {
  clip: string; speaker: "teacher" | "otter" | "bunny"; text: string;
  places: { category: string; step: string }[];
  /** an English line ("three apples", 2026-11-03): made with the English
   *  voice settings (accent, word speed). Absent: the app's own language. */
  lang?: "en";
  /** how it is said: an ElevenLabs tag the line starts from ("[sing-song,
   *  rhythmic]"); a direction set in the studio wins */
  tag?: string;
}
export interface Build { build: number; version: string; schema: number; received_at: number }

export async function getInventory(): Promise<Inventory | null> {
  try { return await req<Inventory>("/inventory"); }
  catch (e) { if (e instanceof ApiError && e.status === 404) return null; throw e; }
}
export const listBuilds = () => req<Build[]>("/inventory/builds");
/** ids the app's inventory brought that the panel had already made (S12) */
export const inventoryConflicts = () =>
  req<{ build?: number; at?: number; items: { kind: string; id: string }[] }>("/inventory/conflicts");

/* ── releases (server: modules/releases.ts) ──────────────────────────────── */

export type Channel = "test" | "production";
export const CHANNELS: Channel[] = ["test", "production"];
export interface Release { id: number; note: string; assets: number; bytes: number; createdAt: number; channels: Channel[] }
export interface Diff { added: string[]; changed: string[]; removed: string[]; newBytes: number }
export interface DraftIssue extends Issue { item: string; kind: "game" | "category" | "clip" | "asset" | "roadmap" | "pack" | "mascot" | "song" | "font" | "palette" | "songvideo" }
export interface Draft {
  issues: DraftIssue[]; blocked: boolean;
  /** what was shown: publishing sends it back and is refused if the draft moved on (A03) */
  fingerprint: string;
  diff: Record<Channel, Diff>;
  counts: { games: number; categories: number; words: number; clips: number; assets: number; bytes: number; songs?: number; mascots?: number; fonts?: number; palette?: string;
            /** the "Şarkılar" films, and the bytes of them a phone fetches only when one is watched */
            songVideos?: number; lazyBytes?: number };
  manifest: {
    games: { id: string; name: string; template: string; requires: number }[];
    categories: { id: string; title: string; requires: number; pack?: string }[];
    roadmap?: { slides: { id: string; title: string; category?: string; pack?: string; stops?: { id: string; kind?: StopKind }[] }[] };
    /** download packs: listed for every phone, downloaded only with a grown-up's yes */
    packs?: { id: string; title: string; offerAt: string | null; lands: string[]; categories: string[]; bytes: number }[];
  };
}

export const listReleases = () =>
  req<{ releases: Release[]; channels: { name: Channel; release: number | null }[] }>("/releases");
export const getDraft = () => req<Draft>("/releases/draft");
export const publish = (note: string, channels: Channel[], expect?: string) =>
  req<{ id: number }>("/releases", json("POST", { note, channels, expect }));
export const pointChannel = (name: Channel, release: number) =>
  req<{ name: Channel; release: number | null }[]>(`/channels/${name}`, json("PUT", { release }));

/* ── mascots (server: modules/mascots.ts) ─────────────────────────────────── */

export type MascotRole = "learner" | "friend";
export type Way = "walk" | "stroll";
export type Hold = "any" | "length" | "frames";
export interface Behaviour { key: string; group: "rest" | "feel" | "talk" | "verb" | "walk" | "scene"; label: string; when: string; mappable: boolean }
export interface Foot { x: number; y: number; top: number }
export interface MascotSet { id: string; label: string; kind: string; asset: string | null }
export interface ClipRef { set: string; marker: string }
export interface MarkerInfo { name: string; from: number; to: number }
export interface Mascot {
  id: string; role: MascotRole; name: string; note: string; base: string | null; look: string | null;
  sets: MascotSet[]; map: Record<string, ClipRef[]>; walkSet: string | null; strollSet: string | null;
  foot: Foot | null; report: Record<string, unknown>; status: Status; createdAt: number; updatedAt: number;
  /** "own": speaks with its own voice; the app's bundled takes of its speaker are not played */
  voice: "keep" | "own";
  issues: Issue[];
  /** the markers each file carries ("base" and each set id) */
  files: Record<string, MarkerInfo[]>;
}
export interface MascotRoleInfo {
  role: MascotRole; slot: string;
  markers: Record<string, { from: number; to: number; hold: Hold }>;
  /** the base file's least length (the scenes' quiet twins live at its end) */
  minOp?: number;
  behaviours: Behaviour[];
  builtin: { name: string; base: string | null; look: string | null; foot: Foot } | null;
  namedLines: { clip: string; speaker: string; template: string; roles: MascotRole[] }[];
}
export interface MascotsView {
  contract: { canvas: number; fr: number; since: number; lookOp: number | null } | null;
  travel: { map: Way; scene: Way };
  roles: MascotRoleInfo[];
  forms: string[];
  list: Mascot[];
}
export type MascotPatch = Partial<Pick<Mascot, "name" | "note" | "base" | "look" | "sets" | "map" | "walkSet" | "strollSet" | "foot" | "report" | "status" | "voice">>;
export const getMascots = () => req<MascotsView>("/mascots").then((v) => {
  /* the studio's speakers are named after the mascots in play */
  const nameOf = (role: MascotRole) => v.list.find((m) => m.role === role && m.status === "live")?.name
    ?? v.roles.find((r) => r.role === role)?.builtin?.name;
  setSpeakerNames({ learner: nameOf("learner"), friend: nameOf("friend") });
  return v;
});
export const createMascot = (role: MascotRole, name: string, from: "builtin" | "empty") =>
  req<Mascot>("/mascots", json("POST", { role, name, from }));
export const patchMascot = (id: string, p: MascotPatch, base?: number) => req<Mascot>(`/mascots/${enc(id)}`, json("PATCH", p, base));
export const deleteMascot = (id: string) => req<{ ok: true }>(`/mascots/${enc(id)}`, { method: "DELETE" });
export const putTravel = (t: { map: Way; scene: Way }) => req<{ map: Way; scene: Way }>("/mascots/travel", json("PUT", t));

/* ── fonts (server: modules/fonts.ts) ─────────────────────────────────────── */

export type FontRole = "title" | "strong" | "body" | "bodyStrong";
export interface FontReport {
  family: string; style: string; postScript: string; weight: number; variable: boolean;
  glyphs: number; unitsPerEm: number; missing: string[]; minLine: number; error?: string;
}
export interface PanelFont {
  id: string; role: FontRole; name: string; note: string; license: string; asset: string | null;
  report: FontReport | null; status: Status; createdAt: number; updatedAt: number; issues: Issue[];
}
export interface FontRoleInfo {
  role: FontRole; weight: number; label: string; use: string;
  builtin: { name: string; file: string; minLine: number; asset: string | null };
}
export interface FontsView { contract: { since: number; required: string } | null; roles: FontRoleInfo[]; list: PanelFont[] }
export type FontPatch = Partial<Pick<PanelFont, "name" | "note" | "license" | "asset" | "status">>;
export const getFonts = () => req<FontsView>("/fonts");
export const createFont = (role: FontRole, name: string, asset: string | null) => req<PanelFont>("/fonts", json("POST", { role, name, asset }));
export const patchFont = (id: string, p: FontPatch, base?: number) => req<PanelFont>(`/fonts/${enc(id)}`, json("PATCH", p, base));
export const deleteFont = (id: string) => req<{ ok: true }>(`/fonts/${enc(id)}`, { method: "DELETE" });

/* ── colour palettes (server: modules/palettes.ts) ─────────────────────────── */

export interface PaletteColors {
  background: { start: string; end: string; text: string };
  card: { background: string; text: string };
  primary: { background: string; text: string; lip: string };
  secondary: { background: string; text: string; lip: string };
  accent: string;
}
export interface NamedPalette extends PaletteColors { id: string; name: string }
export interface PaletteRole { key: string; label: string; use: string }
export interface PanelPalette {
  id: string; name: string; note: string; colors: PaletteColors; status: "live" | "draft";
  createdAt: number; updatedAt: number; issues: Issue[];
  contrast: { background: number; card: number; primary: number; secondary: number } | null;
}
export interface PalettesView {
  contract: { since: number; roles: PaletteRole[]; builtin: NamedPalette; presets: NamedPalette[] } | null;
  list: PanelPalette[];
}
type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? Partial<T[K]> : T[K] };
export type PalettePatch = { name?: string; note?: string; colors?: DeepPartial<PaletteColors>; status?: "live" | "draft" };
export const getPalettes = () => req<PalettesView>("/palettes");
export const createPalette = (name: string, from?: string, colors?: PaletteColors) =>
  req<PanelPalette>("/palettes", json("POST", { name, ...(from ? { from } : {}), ...(colors ? { colors } : {}) }));
export const patchPalette = (id: string, p: PalettePatch, base?: number) => req<PanelPalette>(`/palettes/${enc(id)}`, json("PATCH", p, base));
export const deletePalette = (id: string) => req<{ ok: true }>(`/palettes/${enc(id)}`, { method: "DELETE" });

/* ── songs (server: modules/songs.ts) ─────────────────────────────────────── */

export type LyricsProvider = "anthropic" | "openai" | "gemini";
export interface MusicStop { id: string; title: string; category: string | null; words: string[]; kind: "app" | "land"; land?: string }
export interface SongBrief { language: "en" | "en-tr"; words: string[]; theme: string; mascots: boolean; length: "short" | "normal"; extra: string }
export interface SongStyle {
  voice: "female" | "male" | "kids" | "duet" | "instrumental"; genre: string; tempo: "slow" | "medium" | "fast"; bpm: number | null;
  mood: string; instruments: string[]; text: string; exclude: string;
}
export interface SongTake { asset: string; source: "suno-web" | "suno-api" | "upload"; durationMs: number | null; note: string; at: number }
export interface LyricsDraft { jobId: string; provider: LyricsProvider; model: string; title: string; lyrics: string; style: string; at: number }
export interface SongLicense { plan: "free" | "pro" | "premier" | "other" | null; owner: string; madeAt: string; confirmed: boolean; note: string }
export interface Song {
  id: string; title: string; stop: string; brief: SongBrief; lyrics: string; style: SongStyle; drafts: LyricsDraft[];
  takes: SongTake[]; chosen: string | null; license: SongLicense; status: Status; note: string;
  createdAt: number; updatedAt: number; issues: Issue[];
}
export type SongPatch = Partial<Pick<Song, "title" | "stop" | "brief" | "lyrics" | "style" | "takes" | "chosen" | "license" | "status" | "note">>;
export const listSongs = () => req<{ stops: MusicStop[]; songs: Song[] }>("/songs");
/** `op`: this request's operation id -- sent again (its answer lost), the server returns the song it made the first time */
export const createSong = (title: string, stop: string, op?: string) => req<Song>("/songs", json("POST", { title, stop, ...(op ? { op } : {}) }));
export const patchSong = (id: string, p: SongPatch, base?: number) => req<Song>(`/songs/${enc(id)}`, json("PATCH", p, base));
export const deleteSong = (id: string) => req<{ ok: true }>(`/songs/${enc(id)}`, { method: "DELETE" });
export const writeLyrics = (id: string, b: { jobId: string; provider: LyricsProvider; model: string; brief: SongBrief }) =>
  req<{ draft: LyricsDraft; job: unknown }>(`/songs/${enc(id)}/lyrics`, json("POST", b));
export const sunoGenerate = (id: string) => req<unknown>(`/songs/${enc(id)}/suno`, json("POST", {}));
export const textModels = (p: LyricsProvider) => req<{ models: string[] }>(`/ai/text-models/${p}`);

/* ── song films (server: modules/songvideos.ts): the app's "Şarkılar" tab ── */

export interface VideoCategory { id: string; title: string; kind: "app" | "panel" }
export interface SongVideoRights { confirmed: boolean; owner: string; note: string }
export interface SongVideo {
  id: string; title: string; video: string | null; poster: string | null;
  /** the map row that opens it on the phone; null: always open */
  category: string | null; position: number; status: Status; note: string; rights: SongVideoRights;
  durationMs: number | null; fit: "cover" | "contain"; createdAt: number; updatedAt: number; issues: Issue[];
}
export type SongVideoPatch = Partial<Pick<SongVideo, "title" | "video" | "poster" | "category" | "position" | "status" | "note" | "rights" | "durationMs" | "fit">>;
export const listSongVideos = () => req<{ categories: VideoCategory[]; list: SongVideo[] }>("/song-videos");
/** `op`: this request's operation id -- sent again (its answer lost), the server returns the film it made the first time */
export const createSongVideo = (title: string, category: string | null, op?: string) =>
  req<SongVideo>("/song-videos", json("POST", { title, category, ...(op ? { op } : {}) }));
export const patchSongVideo = (id: string, p: SongVideoPatch, base?: number) => req<SongVideo>(`/song-videos/${enc(id)}`, json("PATCH", p, base));
export const deleteSongVideo = (id: string) => req<{ ok: true }>(`/song-videos/${enc(id)}`, { method: "DELETE" });

/* ── accounts (Supabase, 2026-10-22): who is signed in, the admins, the app's accounts ── */

export interface Me { via: "account" | "key" | "open"; email: string | null; name: string | null; accounts: boolean }
export const getMe = () => req<Me>("/auth/me");

export interface Admin { email: string; name: string; addedBy: string; createdAt: number; lastLoginAt: number | null; bound: boolean; seeded: boolean }
export const listAdmins = () => req<Admin[]>("/admins");
export const addAdmin = (email: string, name: string, password?: string) =>
  req<{ email: string; account: "created" | "existing" | "later"; password?: boolean }>("/admins",
    json("POST", { email, name, ...(password ? { password } : {}) }));
/** an admin's panel password (2026-11-14): sent to the server, which hands it to Supabase only */
export const setAdminPassword = (email: string, password: string) =>
  req<{ ok: true }>(`/admins/${enc(email)}/password`, json("POST", { password }));
export const removeAdmin = (email: string) => req<{ ok: true }>(`/admins/${enc(email)}`, { method: "DELETE" });

export interface ProgressSummary { profiles: { label: string; stops: number; words: number; series: number; at: string | null }[] }
export interface Account {
  id: string; email: string; provider: string; createdAt: number; lastSignInAt: number | null; bannedUntil: number | null;
  admin: boolean; lastSeenAt: number | null;
  backup: { rev: number; bytes: number; updatedAt: number; device: string; summary: ProgressSummary } | null;
}
export interface AuditEntry { id: number; at: number; actor: string; action: string; target: string; detail: string }
export const listAccounts = (page: number, perPage: number, q: string) =>
  req<{ users: Account[]; total: number | null; page: number; perPage: number }>(`/users?page=${page}&perPage=${perPage}&q=${enc(q)}`);
export const getAccount = (id: string) => req<Account & { events: AuditEntry[] }>(`/users/${enc(id)}`);
export const banAccount = (id: string, banned: boolean) => req<Account>(`/users/${enc(id)}/ban`, json("POST", { banned }));
export const deleteAccount = (id: string) => req<{ ok: true }>(`/users/${enc(id)}`, { method: "DELETE" });
export const deleteAccountProgress = (id: string) => req<{ ok: true; deleted: boolean }>(`/users/${enc(id)}/progress`, { method: "DELETE" });
export const listAudit = (limit = 200) => req<AuditEntry[]>(`/audit?limit=${limit}`);
