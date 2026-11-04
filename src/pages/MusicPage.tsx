/**
 * MÜZİK (2026-10-17): the song at the end of every row of the map.
 *
 * The list is every MUSIC STOP -- the app's own six and every land's -- with
 * its song in the app, or none (a release then holds the stop back). A song
 * is made in five steps:
 *
 *   1 Konu        which words it sings, language, theme, the mascots, length
 *   2 Sözler      typed, or written by Claude / ChatGPT / Gemini (every draft
 *                 kept); live checks: each word sung how often, length
 *   3 Ses, tarz   voice, genre, tempo, mood, instruments -> Suno's "style"
 *   4 Üret        on suno.com (copy style, lyrics, title; drop the MP3s here),
 *                 Suno's official API when it exists, or any file uploaded
 *   5 Yayın       where it came from (Suno plan: free is NOT for the app),
 *                 the checks, live or not
 */
import React from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { AlertTriangle, ArrowLeft, ArrowRight, Check, ChevronRight, ClipboardCopy, ExternalLink, Mic2, Music, Plus, Rocket,
         Smartphone, Sparkles, Trash2, Upload, Wand2 } from "lucide-react";
import { codeOf, createSong, deleteSong, listSongs, patchSong, sunoGenerate, textModels, uploadAsset, writeLyrics,
         newJobId, type LyricsProvider, type MusicStop, type Song, type SongPatch, type SongStyle, type SongTake } from "../api";
import { assetUrl, audioDuration } from "../blobs";
import { useStore } from "../store";
import { useVocab } from "../vocab";
import { KeyCard, useKeys } from "../components/Keys";
import { Chips, EmptyState, FormField, Loading, Modal, ModalActions, Notice, PageHeader, Panel, Pill, Select, TONE, type Tone } from "../components/common";
import { useAutosave } from "@/lib/autosave";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { useSticky } from "../lib/sticky";

const STATUS_LABEL = { live: "Uygulamada", draft: "Taslak", hidden: "Gizli" } as const;
const PROVIDERS: { id: LyricsProvider; label: string; key: "anthropic" | "openai" | "gemini"; prefer: RegExp; hint: string }[] = [
  { id: "anthropic", label: "Claude", key: "anthropic", prefer: /opus/, hint: "console.anthropic.com → API Keys." },
  { id: "openai", label: "ChatGPT", key: "openai", prefer: /^gpt-5/, hint: "platform.openai.com → API keys." },
  { id: "gemini", label: "Gemini", key: "gemini", prefer: /pro/, hint: "aistudio.google.com → Get API key." },
];
const VOICES: { id: SongStyle["voice"]; label: string; en: string }[] = [
  { id: "female", label: "Kadın sesi", en: "warm female vocal" },
  { id: "male", label: "Erkek sesi", en: "friendly male vocal" },
  { id: "kids", label: "Çocuk korosu", en: "children's choir vocals" },
  { id: "duet", label: "Düet", en: "male and female duet" },
  { id: "instrumental", label: "Enstrümantal (sözsüz)", en: "instrumental, no vocals" },
];
const GENRES = [
  { id: "children's song", label: "Çocuk şarkısı" }, { id: "nursery rhyme", label: "Tekerleme" }, { id: "kids pop", label: "Pop" },
  { id: "reggae", label: "Reggae" }, { id: "rock and roll", label: "Rock'n'roll" }, { id: "calypso", label: "Kalipso" },
  { id: "country", label: "Country" }, { id: "marching band", label: "Bando" }, { id: "lullaby", label: "Ninni" },
];
const TEMPO = { slow: { label: "Yavaş", en: "slow tempo" }, medium: { label: "Orta", en: "mid-tempo" }, fast: { label: "Hızlı", en: "upbeat fast tempo" } } as const;
const MOODS = ["happy", "bouncy", "playful", "calm", "silly", "cheerful", "energetic"];
const MOOD_TR: Record<string, string> = { happy: "mutlu", bouncy: "zıplayan", playful: "oyuncu", calm: "sakin", silly: "komik", cheerful: "neşeli", energetic: "enerjik" };
const INSTR = [
  ["ukulele", "ukulele"], ["piano", "piyano"], ["glockenspiel", "glokenşpil"], ["xylophone", "ksilofon"], ["acoustic guitar", "akustik gitar"],
  ["hand claps", "el çırpma"], ["light drums", "hafif davul"], ["flute", "flüt"], ["trumpet", "trompet"], ["synth", "synth"], ["accordion", "akordeon"],
] as const;
const PLANS: { id: "free" | "pro" | "premier"; label: string; tone: Tone; note: string }[] = [
  { id: "free", label: "Ücretsiz (Basic)", tone: "bad", note: "Ticari kullanım yok: şarkı Suno'nundur, uygulamaya konamaz." },
  { id: "pro", label: "Pro", tone: "ok", note: "Abonelik sürerken üretilen şarkılar ticari kullanılabilir." },
  { id: "premier", label: "Premier", tone: "ok", note: "Abonelik sürerken üretilen şarkılar ticari kullanılabilir." },
];

/** the style text Suno takes, from the choices */
export function styleText(st: SongStyle): string {
  const voice = VOICES.find((v) => v.id === st.voice)?.en ?? "";
  return [st.genre, TEMPO[st.tempo].en + (st.bpm ? `, ${st.bpm} bpm` : ""), voice, ...st.instruments, st.mood, "simple catchy melody for young kids"]
    .filter(Boolean).join(", ");
}
/** how often a word is sung (plural too) */
const sung = (en: string, lyrics: string) =>
  (lyrics.match(new RegExp(`(^|[^\\p{L}])${en.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(s|es)?(?=[^\\p{L}]|$)`, "giu")) ?? []).length;
const singable = (lyrics: string) => lyrics.split("\n").map((l) => l.trim()).filter((l) => l && !/^\[.*\]$/.test(l));
const secs = (ms: number | null) => (ms === null ? "?" : `${Math.floor(ms / 60000)}:${String(Math.round((ms % 60000) / 1000)).padStart(2, "0")}`);
const uid = () => `lyrics-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

function useSongs() {
  const [data, setData] = React.useState<{ stops: MusicStop[]; songs: Song[] } | null>(null);
  const [error, setError] = React.useState("");
  const load = React.useCallback(async () => {
    try { setData(await listSongs()); setError(""); } catch (e) { setError((e as Error).message); }
  }, []);
  React.useEffect(() => { void load(); }, [load]);
  return { data, error, load, setData };
}

/* ── the list: every music stop ───────────────────────────────────────────── */

export function MusicPage() {
  const { data, error, load } = useSongs();
  const [upload, setUpload] = React.useState<MusicStop | null>(null);
  const { wordOf } = useVocab();
  const nav = useNavigate();
  const [busy, setBusy] = React.useState("");
  if (error) return <Notice tone="bad">{error}</Notice>;
  if (!data) return <Loading />;
  const make = async (stop: MusicStop) => {
    setBusy(stop.id);
    try { const s = await createSong(`${stop.title.replace(/ · müzik$/, "")} şarkısı`, stop.id); nav(`/muzik/${s.id}`); }
    catch (e) { alert((e as Error).message); setBusy(""); }
  };
  const groups = [["app", "Uygulamanın müzik durakları"], ["land", "Harita sıralarının müzik durakları"]] as const;
  return (
    <>
      <PageHeader title="Müzik"
        sub="Her kategorinin sonunda bir müzik durağı var: çocuk o sıranın kelimelerini şarkıyla söyler, şarkı bitince durak sayılır. Şarkıyı burada yaparsınız: sözleri yazın ya da Claude / ChatGPT / Gemini'ye yazdırın, sesi ve tarzı seçin, Suno'da üretip yükleyin. Hazır bir şarkınız varsa durağın “MP3 yükle” düğmesiyle doğrudan koyun." />
      <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          {groups.map(([kind, label]) => {
            const stops = data.stops.filter((s) => s.kind === kind);
            if (!stops.length) return null;
            return (
              <section key={kind} className="space-y-3">
                <h2 className="font-heading text-base font-semibold">{label} <span className="font-normal text-muted-foreground">{stops.length}</span></h2>
                <div className="grid gap-3 md:grid-cols-2">
                  {stops.map((st) => {
                    const songs = data.songs.filter((s) => s.stop === st.id);
                    const live = songs.find((s) => s.status === "live");
                    return (
                      <Card key={st.id} size="sm" className="gap-3 px-4">
                        <div className="flex items-start gap-3">
                          <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-lg", live ? TONE.ok : TONE.plain)}><Music className="size-5" /></span>
                          <div className="min-w-0 flex-1">
                            <div className="truncate font-medium">{st.title}</div>
                            <div className="mt-1 flex flex-wrap gap-1">
                              {st.words.slice(0, 8).map((w) => <span key={w} className="rounded-full bg-muted px-2 py-0.5 text-[11px]">{wordOf(w)?.en ?? w}</span>)}
                            </div>
                          </div>
                          {live ? <Pill tone="ok"><Smartphone />şarkı var</Pill> : <Pill tone="warn">şarkı yok</Pill>}
                        </div>
                        {live?.chosen && <audio controls preload="none" src={assetUrl(live.chosen)} className="h-9 w-full" />}
                        {!live && <p className="text-xs text-muted-foreground">Şarkısı olmayan müzik durağı yayında kilitli kalır; sıra son hazır durağında kutlanır.</p>}
                        <div className="flex flex-wrap items-center gap-2">
                          {songs.map((s) => (
                            <Link key={s.id} to={`/muzik/${s.id}`} className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs hover:bg-muted">
                              {s.title}<span className={cn("size-1.5 rounded-full", s.status === "live" ? "bg-success" : "bg-muted-foreground/40")} />
                              <ChevronRight className="size-3" />
                            </Link>
                          ))}
                          <div className="ml-auto flex flex-wrap gap-2">
                            <Button size="sm" variant="outline" disabled={!!busy} onClick={() => setUpload(st)}><Upload data-icon="inline-start" />MP3 yükle</Button>
                            <Button size="sm" variant={songs.length ? "outline" : "default"} disabled={!!busy} onClick={() => make(st)}>
                              {busy === st.id ? <Spinner data-icon="inline-start" /> : <Plus data-icon="inline-start" />}{songs.length ? "Yeni şarkı" : "Şarkı yap"}</Button>
                          </div>
                        </div>
                      </Card>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
        <aside className="space-y-4">
          <Panel title="Nasıl çalışır" icon={<Mic2 />}>
            <ol className="list-decimal space-y-1.5 pl-4 text-sm text-muted-foreground">
              <li><b className="font-medium text-foreground">Konu:</b> hangi kelimeler, hangi dilde, nasıl bir sahne.</li>
              <li><b className="font-medium text-foreground">Sözler:</b> kendiniz yazın ya da yapay zekâya yazdırın; her kelimenin kaç kez söylendiği görünür.</li>
              <li><b className="font-medium text-foreground">Ses ve tarz:</b> kadın/erkek/çocuk korosu, tür, tempo, çalgılar → Suno'nun "Style" metni.</li>
              <li><b className="font-medium text-foreground">Üret:</b> suno.com'da tek tıkla kopyala-yapıştır, MP3'leri buraya bırakın.</li>
              <li><b className="font-medium text-foreground">Yayın:</b> hangi planla üretildiği yazılır; uygulamaya konur, Yayınla ile telefonlara gider.</li>
            </ol>
          </Panel>
          <Notice tone="warn" icon={<AlertTriangle />}>
            Suno'nun <b>ücretsiz planı</b> ticari değildir: şarkı Suno'nundur ve bu uygulamada kullanılamaz. Pro ya da Premier abonelikle üretin
            (abonelik sürerken üretilen şarkılar ticari kullanılabilir). Suno'nun herkese açık resmi API'si henüz yok.
          </Notice>
        </aside>
      </div>
      {upload && <QuickUpload stop={upload} onClose={() => setUpload(null)} onDone={() => { setUpload(null); void load(); }} />}
    </>
  );
}

/** the operation id of uploading this file to this stop, kept for the tab */
function opFor(file: File, stop: string): string {
  const key = `loplop-admin/song-op/${stop}/${file.name}/${file.size}/${file.lastModified}`;
  try {
    const had = sessionStorage.getItem(key);
    if (had) return had;
    const op = newJobId().replace(/^job-/, "song-");
    sessionStorage.setItem(key, op);
    return op;
  } catch { return `song-${stop}-${file.size}-${file.lastModified}`.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 80); }
}

/**
 * A FILE STRAIGHT TO A STOP: a song already made (anywhere) is uploaded, named
 * and -- with its rights confirmed -- put in the app in one go. Lyrics and
 * style are not needed; the song opens in the wizard later like any other.
 */
function QuickUpload({ stop, onClose, onDone }: { stop: MusicStop; onClose: () => void; onDone: () => void }) {
  const { addAssetMeta } = useStore();
  const [file, setFile] = React.useState<File | null>(null);
  const [title, setTitle] = React.useState(`${stop.title.replace(/ · müzik$/, "")} şarkısı`);
  const [owner, setOwner] = React.useState("");
  const [rights, setRights] = React.useState(false);
  const [live, setLive] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const [dur, setDur] = React.useState<number | null>(null);
  const input = React.useRef<HTMLInputElement>(null);
  /*
   * F10: WHAT WAS ALREADY DONE stays done. The upload, the song record and
   * its take are three requests; when only the last step ("put it in the
   * app") failed, trying again used to upload the file and make the song a
   * second time. Each step's result is kept for this file; a retry goes on
   * from the first step that did not happen.
   */
  const done = React.useRef<{ file: File | null; asset: string | null; song: Song | null; prepared: Song | null }>(
    { file: null, asset: null, song: null, prepared: null });
  const [partial, setPartial] = React.useState<Song | null>(null);
  const nav = useNavigate();
  const pick = (f: File | undefined) => {
    if (!f) return;
    done.current = { file: f, asset: null, song: null, prepared: null };
    setPartial(null);
    setFile(f); setError(""); setDur(null);
    const url = URL.createObjectURL(f);
    void audioDuration(url).then((ms) => { setDur(ms); URL.revokeObjectURL(url); });
  };
  /* the server's copy of the song, when a request's answer was lost and the
     stamp we hold is no longer the song's (a 409 on the retry) */
  const fresh = async (id: string) => (await listSongs()).songs.find((x) => x.id === id) ?? null;
  const go = async () => {
    if (!file) return;
    setBusy(true); setError("");
    const d = done.current.file === file ? done.current : (done.current = { file, asset: null, song: null, prepared: null });
    /* one operation id per file and stop, for this tab: a retry -- even after
       the window was closed and opened again -- names the same file and the
       same song, so the server stores neither twice (review, 2026-10-19) */
    const op = opFor(file, stop.id);
    try {
      if (!d.asset) {
        const a = await uploadAsset(file, file.name, `upl-${op}`);
        if (a.kind !== "audio") throw new Error(`"${file.name}" bir ses dosyası değil.`);
        addAssetMeta(a);
        d.asset = a.id;
      }
      if (!d.song) d.song = await createSong(title.trim(), stop.id, op);
      if (!d.prepared) {
        const take = { takes: [{ asset: d.asset, source: "upload" as const, durationMs: dur, note: file.name, at: Date.now() }], chosen: d.asset,
          license: { plan: "other" as const, owner: owner.trim(), madeAt: "", confirmed: rights, note: "doğrudan yüklendi" } };
        try { d.prepared = await patchSong(d.song.id, take, d.song.updatedAt); }
        catch (e) {
          if (codeOf(e) !== "STALE") throw e;
          const cur = await fresh(d.song.id);
          if (!cur) throw e;
          d.prepared = cur.takes.some((t) => t.asset === d.asset) ? cur : await patchSong(cur.id, take, cur.updatedAt);
        }
      }
      if (live && d.prepared.status !== "live") {
        try {
          try { d.prepared = await patchSong(d.prepared.id, { status: "live" }, d.prepared.updatedAt); }
          catch (e) {
            if (codeOf(e) !== "STALE") throw e;
            const cur = await fresh(d.prepared.id);
            if (!cur) throw e;
            d.prepared = cur.status === "live" ? cur : await patchSong(cur.id, { status: "live" }, cur.updatedAt);
          }
        }
        catch (e) {
          setPartial(d.prepared);
          setError(`Dosya yüklendi ve şarkı taslak olarak kaydedildi; uygulamaya konamadı: ${(e as Error).message}`);
          setBusy(false); return;
        }
      }
      onDone();
    } catch (e) {
      if (d.song) setPartial(d.prepared ?? d.song);
      setError(`${(e as Error).message}${d.asset ? " (yüklenen dosya saklı; tekrar denemek yeniden yüklemez)" : ""}`);
      setBusy(false);
    }
  };
  const sec = dur === null ? null : dur / 1000;
  return (
    <Modal title={`MP3 yükle · ${stop.title}`} description="Hazır bir şarkıyı doğrudan bu durağa koyun: üretmeniz, söz yazmanız gerekmez." onClose={onClose}>
      <button type="button" onClick={() => input.current?.click()} disabled={busy}
        className="flex w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-6 text-sm text-muted-foreground hover:bg-muted/40">
        <Upload className="size-6" />{file ? <span className="font-medium text-foreground">{file.name}</span> : "Ses dosyası seçin (MP3, M4A, WAV)"}
        {file && <span>{dur === null ? "süre ölçülüyor…" : secs(dur)}</span>}
      </button>
      <input ref={input} type="file" accept="audio/mpeg,audio/mp4,audio/x-m4a,audio/wav,audio/aac,.mp3,.m4a,.wav" className="hidden"
             onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }} />
      {sec !== null && sec < 30 && <Notice tone="bad">Şarkı {Math.round(sec)} sn: durak şarkı bitince sayılır, en az 30 sn olmalı.</Notice>}
      {sec !== null && sec >= 30 && (sec < 55 || sec > 100) && <Notice tone="warn">Şarkı {Math.round(sec)} sn; 60–90 sn önerilir.</Notice>}
      <FormField label="Şarkının adı"><Input value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} /></FormField>
      <FormField label="Kim yaptı / lisansı (isteğe bağlı)"><Input value={owner} maxLength={120} onChange={(e) => setOwner(e.target.value)} placeholder="ör. kendi stüdyomuz, Suno Pro hesabı, besteci" /></FormField>
      <label className="flex items-start gap-2 text-sm">
        <Checkbox checked={rights} onCheckedChange={(v) => setRights(v === true)} />
        Bu şarkıyı ticari bir çocuk uygulamasında kullanma hakkımız var.
      </label>
      <label className="flex items-center gap-2 text-sm">
        <Checkbox checked={live} onCheckedChange={(v) => setLive(v === true)} />
        Hemen uygulamaya koy (bir sonraki yayınla telefonlara gider)
      </label>
      {live && !rights && file && <p className="text-xs text-warning">Uygulamaya koymak için kullanım hakkını onaylayın; ya da yalnız taslak olarak yükleyin.</p>}
      {error && <Notice tone="bad">{error}</Notice>}
      <ModalActions>
        <Button variant="ghost" onClick={() => (partial ? onDone() : onClose())}>{partial ? "Kapat" : "Vazgeç"}</Button>
        {partial && <Button variant="outline" onClick={() => { onDone(); nav(`/muzik/${partial.id}`); }}>Taslağı aç</Button>}
        <Button disabled={!file || !title.trim() || busy || (live && !rights)} onClick={go}>
          {busy ? <Spinner data-icon="inline-start" /> : <Upload data-icon="inline-start" />}
          {partial ? (live ? "Yalnız uygulamaya koymayı tekrar dene" : "Tekrar dene") : `Yükle${live ? " ve uygulamaya koy" : ""}`}</Button>
      </ModalActions>
    </Modal>
  );
}

/* ── the wizard ───────────────────────────────────────────────────────────── */

type StepId = "konu" | "sozler" | "tarz" | "uret" | "yayin";
const STEPS: { id: StepId; label: string }[] = [
  { id: "konu", label: "Konu" }, { id: "sozler", label: "Sözler" }, { id: "tarz", label: "Ses ve tarz" },
  { id: "uret", label: "Üret" }, { id: "yayin", label: "Lisans ve yayın" },
];
type Save = (p: SongPatch) => Promise<boolean>;

export function SongEdit() {
  const { id } = useParams();
  const { data, error, load, setData } = useSongs();
  if (error) return <Notice tone="bad">{error}</Notice>;
  if (!data) return <Loading />;
  const song = data.songs.find((s) => s.id === id);
  if (!song) return <p className="text-sm text-muted-foreground">Şarkı bulunamadı. <Link className="text-primary hover:underline" to="/muzik">Listeye dön</Link></p>;
  const stop = data.stops.find((s) => s.id === song.stop) ?? null;
  return <Wizard key={song.id} song={song} stop={stop} reload={load}
                 onSaved={(x) => setData((d) => d && { ...d, songs: d.songs.map((y) => (y.id === x.id ? x : y.stop === x.stop && x.status === "live" && y.status === "live" ? { ...y, status: "draft" } : y)) })} />;
}

function Wizard({ song, stop, reload, onSaved }: { song: Song; stop: MusicStop | null; reload: () => Promise<void>; onSaved: (s: Song) => void }) {
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const at: StepId = STEPS.find((s) => s.id === params.get("adim"))?.id ?? "konu";
  const go = (s: StepId) => { setParams(s === "konu" ? {} : { adim: s }); window.scrollTo({ top: 0 }); };
  const base = React.useRef(song.updatedAt);
  React.useEffect(() => { base.current = song.updatedAt; }, [song.updatedAt]);
  const [error, setError] = React.useState("");
  const save: Save = async (p) => {
    try { const out = await patchSong(song.id, p, base.current); base.current = out.updatedAt; onSaved(out); setError(""); return true; }
    catch (e) {
      const stale = codeOf(e) === "STALE";
      setError(stale ? "Bu şarkı başka bir yerde değişti; sayfa yenileniyor." : (e as Error).message);
      if (stale) void reload();
      return false;
    }
  };
  const errs = song.issues.filter((i) => i.level === "error");
  const mark = (s: StepId): { tone: Tone; note: string } => {
    if (s === "konu") return song.brief.words.length ? { tone: "ok", note: `${song.brief.words.length} kelime` } : { tone: "warn", note: "kelime yok" };
    if (s === "sozler") return song.style.voice === "instrumental" ? { tone: "ok", note: "sözsüz" } : song.lyrics.trim() ? { tone: "ok", note: `${singable(song.lyrics).length} satır` } : { tone: "plain", note: "yazılmadı" };
    if (s === "tarz") return { tone: "ok", note: VOICES.find((v) => v.id === song.style.voice)?.label ?? "" };
    if (s === "uret") return song.chosen ? { tone: "ok", note: `${song.takes.length} deneme · seçili` } : song.takes.length ? { tone: "warn", note: "seçilmedi" } : { tone: "plain", note: "dosya yok" };
    return errs.length ? { tone: "bad", note: `${errs.length} hata` } : { tone: song.status === "live" ? "ok" : "accent", note: STATUS_LABEL[song.status] };
  };
  const idx = STEPS.findIndex((s) => s.id === at);
  return (
    <>
      <PageHeader back={{ to: "/muzik", label: "Müzik" }} title={song.title}
        meta={<>{stop?.title ?? song.stop} · kimlik: {song.id}</>}
        actions={<>
          <Pill tone={song.status === "live" ? "ok" : "plain"} className="h-6">{song.status === "live" ? <Smartphone /> : null}{STATUS_LABEL[song.status]}</Pill>
          <Button variant="ghost" size="icon" title="Şarkıyı sil" className="hover:bg-destructive/10 hover:text-destructive" onClick={async () => {
            if (!confirm(`"${song.title}" silinsin mi? Uygulamadaysa bir sonraki yayında durak yine şarkısız kalır.`)) return;
            await deleteSong(song.id); nav("/muzik");
          }}><Trash2 /></Button>
        </>} />
      {error && <Notice tone="bad" className="mb-4">{error}</Notice>}
      <ol className="mb-6 grid grid-cols-2 gap-2 md:grid-cols-5">
        {STEPS.map((s, i) => {
          const k = mark(s.id), here = s.id === at;
          return (
            <li key={s.id}>
              <button type="button" onClick={() => go(s.id)} aria-current={here ? "step" : undefined}
                className={cn("flex h-full w-full items-center gap-3 rounded-xl border bg-card p-3 text-left transition-colors", here ? "border-primary ring-3 ring-primary/15" : "hover:bg-muted/40")}>
                <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold", here ? "bg-primary text-primary-foreground" : TONE[k.tone])}>
                  {k.tone === "ok" && !here ? <Check className="size-4" /> : k.tone === "bad" && !here ? <AlertTriangle className="size-4" /> : i + 1}</span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{s.label}</span>
                  <span className={cn("block truncate text-xs", k.tone === "bad" ? "text-destructive" : k.tone === "warn" ? "text-warning" : "text-muted-foreground")}>{k.note}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
      {at === "konu" && <BriefStep song={song} stop={stop} save={save} />}
      {at === "sozler" && <LyricsStep song={song} save={save} reload={reload} />}
      {at === "tarz" && <StyleStep song={song} save={save} />}
      {at === "uret" && <MakeStep song={song} save={save} />}
      {at === "yayin" && <PublishStep song={song} save={save} />}
      <div className="mt-8 flex items-center justify-between border-t pt-4">
        {idx > 0 ? <Button variant="outline" onClick={() => go(STEPS[idx - 1]!.id)}><ArrowLeft data-icon="inline-start" />{STEPS[idx - 1]!.label}</Button> : <span />}
        {idx < STEPS.length - 1
          ? <Button onClick={() => go(STEPS[idx + 1]!.id)}>Devam: {STEPS[idx + 1]!.label}<ArrowRight data-icon="inline-end" /></Button>
          : <Button asChild variant="outline"><Link to="/yayinla"><Rocket data-icon="inline-start" />Yayınla sayfası</Link></Button>}
      </div>
    </>
  );
}

/* 1 · what it is about */
function BriefStep({ song, stop, save }: { song: Song; stop: MusicStop | null; save: Save }) {
  const { wordOf } = useVocab();
  const [title, setTitle] = React.useState(song.title);
  const [b, setB] = React.useState(song.brief);
  useAutosave(b, (v) => save({ brief: v }), { label: `Şarkı “${song.title}” konusu` });
  useAutosave(title, (v) => save({ title: v.trim() }), { skip: (v) => !v.trim(), label: `Şarkı “${song.title}” adı` });
  const words = stop?.words ?? song.brief.words;
  const toggle = (w: string) => setB({ ...b, words: b.words.includes(w) ? b.words.filter((x) => x !== w) : [...b.words, w] });
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <Card><CardContent className="space-y-5">
        <FormField label="Şarkının adı" hint="Panelde ve şarkı ekranında görünür."><Input value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} /></FormField>
        <FormField label="Söylenecek kelimeler" hint="Durağın sırası bu kelimeleri öğretti; şarkı her birini en az iki kez söyler.">
          <div className="flex flex-wrap gap-2">
            {words.map((w) => {
              const on = b.words.includes(w), word = wordOf(w);
              return (
                <button key={w} type="button" onClick={() => toggle(w)}
                  className={cn("rounded-full border px-3 py-1 text-sm transition-colors", on ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted")}>
                  {on && <Check className="mr-1 inline size-3" />}{word?.en ?? w} <span className="opacity-60">· {word?.tr}</span>
                </button>
              );
            })}
          </div>
        </FormField>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Dil">
            <Chips value={b.language} onChange={(v) => setB({ ...b, language: v })}
              items={[{ id: "en", label: "İngilizce" }, { id: "en-tr", label: "İngilizce + kısa Türkçe" }]} />
          </FormField>
          <FormField label="Uzunluk">
            <Chips value={b.length} onChange={(v) => setB({ ...b, length: v })}
              items={[{ id: "normal", label: "60–90 sn" }, { id: "short", label: "45–60 sn" }]} />
          </FormField>
        </div>
        <FormField label="Sahne / tema" hint="ör. “piknikte, sepet hazırlarken”, “ormanda saklambaç sonrası dans”.">
          <Input value={b.theme} maxLength={300} onChange={(e) => setB({ ...b, theme: e.target.value })} placeholder="Şarkının geçtiği yer, hikâye" />
        </FormField>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={b.mascots} onCheckedChange={(v) => setB({ ...b, mascots: v === true })} />
          Maskotlar şarkıda adlarıyla geçebilir
        </label>
        <FormField label="Yazara ek not"><Textarea value={b.extra} maxLength={600} onChange={(e) => setB({ ...b, extra: e.target.value })}
          placeholder="ör. “her nakaratta el çırpalım”, “sayarak bitsin: one, two, three”" /></FormField>
      </CardContent></Card>
      <Panel title="İyi bir çocuk şarkısı" icon={<Music />}>
        <ul className="list-disc space-y-1.5 pl-4 text-sm text-muted-foreground">
          <li>Her hedef kelime <b className="font-medium text-foreground">en az iki kez</b>, en önemlileri nakaratta.</li>
          <li>Kısa satırlar, çok tekrar, “Can you say apple? Apple!” gibi soru-cevap.</li>
          <li>Ne korkutucu ne üzgün; marka, gerçek kişi, başka bir şarkıdan alıntı yok.</li>
          <li>60–90 saniye: çocuk sonuna kadar dinler, durak ancak şarkı bitince sayılır.</li>
        </ul>
      </Panel>
    </div>
  );
}

/* 2 · the lyrics: typed or written by an AI */
function LyricsStep({ song, save, reload }: { song: Song; save: Save; reload: () => Promise<void> }) {
  const { wordOf } = useVocab();
  const keys = useKeys();
  const [text, setText] = React.useState(song.lyrics);
  useAutosave(text, (v) => save({ lyrics: v }), { label: `Şarkı “${song.title}” sözleri` });
  const [provider, setProvider] = useSticky<LyricsProvider>("music.provider", "anthropic", (p) => PROVIDERS.some((x) => x.id === p));
  const prov = PROVIDERS.find((p) => p.id === provider)!;
  const [models, setModels] = React.useState<string[]>([]);
  const [model, setModel] = useSticky(`music.model.${provider}`, "");
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState("");
  const area = React.useRef<HTMLTextAreaElement>(null);
  const keyOk = !!keys?.[prov.key]?.set;
  React.useEffect(() => {
    setModels([]);
    if (!keyOk) return;
    let live = true;
    textModels(provider).then((r) => {
      if (!live) return;
      setModels(r.models);
      /* the model chosen last time with this provider, while it is still offered */
      setModel((m) => r.models.includes(m) ? m : r.models.find((x) => prov.prefer.test(x)) ?? r.models[0] ?? "");
    }, (e: Error) => live && setErr(e.message));
    return () => { live = false; };
  }, [provider, keyOk]); // eslint-disable-line react-hooks/exhaustive-deps
  const write = async () => {
    setBusy(true); setErr("");
    try { const r = await writeLyrics(song.id, { jobId: uid(), provider, model, brief: song.brief }); await reload(); if (!text.trim()) setText(r.draft.lyrics); }
    catch (e) { setErr((e as Error).message); await reload(); }
    setBusy(false);
  };
  const insert = (tag: string) => {
    const el = area.current;
    const at = el?.selectionStart ?? text.length;
    const next = `${text.slice(0, at)}${at && text[at - 1] !== "\n" ? "\n" : ""}[${tag}]\n${text.slice(at)}`;
    setText(next);
  };
  const lines = singable(text);
  const estimate = Math.round(lines.length * 3.6);
  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {["Intro", "Verse 1", "Chorus", "Verse 2", "Bridge", "Outro"].map((t) => (
            <Button key={t} size="sm" variant="outline" onClick={() => insert(t)}>[{t}]</Button>
          ))}
          <span className="ml-auto text-xs text-muted-foreground">{lines.length} satır · ~{estimate} sn söylenir</span>
        </div>
        <Textarea ref={area} value={text} onChange={(e) => setText(e.target.value)} rows={22} className="font-mono text-sm leading-relaxed"
          placeholder={"[Verse 1]\nBanana, banana, yellow and long…\n\n[Chorus]\nCan you say apple? Apple!"} aria-label="Şarkı sözleri" />
        <div className="flex flex-wrap gap-1.5">
          {song.brief.words.map((w) => {
            const en = wordOf(w)?.en ?? w, n = sung(en, text);
            return <Pill key={w} tone={n >= 2 ? "ok" : n === 1 ? "warn" : "bad"}>{en} ×{n}</Pill>;
          })}
          {estimate > 0 && (estimate < 45 || estimate > 110) && <Pill tone="warn">uzunluk: {estimate < 45 ? "kısa" : "uzun"}</Pill>}
        </div>
      </div>
      <div className="space-y-4">
        <Panel title="Yapay zekâya yazdır" icon={<Wand2 />} description="Konu adımındaki kelimeler, dil, tema ve uzunlukla; Suno'nun bölüm etiketleriyle. Her taslak saklanır.">
          <div className="space-y-3">
            <Chips value={provider} onChange={setProvider} items={PROVIDERS.map((p) => ({ id: p.id, label: p.label }))} />
            {!keyOk ? <KeyCard name={prov.key} hint={prov.hint} /> : (
              <>
                <FormField label="Model">
                  <Select value={model} onChange={(e) => setModel(e.target.value)}>
                    {!models.length && <option value="">yükleniyor…</option>}
                    {models.map((m) => <option key={m} value={m}>{m}</option>)}
                  </Select>
                </FormField>
                <Button disabled={busy || !model || !song.brief.words.length} onClick={write} className="w-full">
                  {busy ? <Spinner data-icon="inline-start" /> : <Sparkles data-icon="inline-start" />}{prov.label} ile sözleri yaz</Button>
                {!song.brief.words.length && <p className="text-xs text-warning">Önce Konu adımında kelimeleri seçin.</p>}
              </>
            )}
            {err && <Notice tone="bad">{err}</Notice>}
          </div>
        </Panel>
        {song.drafts.length > 0 && (
          <Panel title="Taslaklar" description="Ücretli sonuçlar: hiçbiri kaybolmaz.">
            <div className="max-h-[520px] space-y-3 overflow-y-auto">
              {song.drafts.map((d) => (
                <div key={d.jobId} className="space-y-2 rounded-lg border p-3">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">{d.title || "adsız"}</span>
                    <span>{PROVIDERS.find((p) => p.id === d.provider)?.label} · {d.model}</span>
                    <span>{new Date(d.at).toLocaleString("tr-TR")}</span>
                  </div>
                  <pre className="max-h-40 overflow-y-auto whitespace-pre-wrap rounded bg-muted/40 p-2 font-mono text-xs">{d.lyrics}</pre>
                  {d.style && <div className="text-xs text-muted-foreground">Önerilen tarz: {d.style}</div>}
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" onClick={() => { setText(d.lyrics); if (d.title) void save({ title: d.title }); }}>Bu sözleri kullan</Button>
                    {d.style && <Button size="sm" variant="outline" onClick={() => void save({ style: { ...song.style, text: d.style } })}>Tarzını da al</Button>}
                  </div>
                </div>
              ))}
            </div>
          </Panel>
        )}
      </div>
    </div>
  );
}

/* 3 · the voice and the style */
function StyleStep({ song, save }: { song: Song; save: Save }) {
  const [st, setSt] = React.useState(song.style);
  useAutosave(st, (v) => save({ style: v }), { label: `Şarkı “${song.title}” tarzı` });
  const auto = styleText(st);
  const instr = (en: string) => setSt({ ...st, instruments: st.instruments.includes(en) ? st.instruments.filter((x) => x !== en) : [...st.instruments, en] });
  const moods = st.mood.split(",").map((x) => x.trim()).filter(Boolean);
  const mood = (m: string) => setSt({ ...st, mood: (moods.includes(m) ? moods.filter((x) => x !== m) : [...moods, m]).join(", ") });
  const text = st.text || auto;
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
      <Card><CardContent className="space-y-5">
        <FormField label="Ses"><Chips value={st.voice} onChange={(v) => setSt({ ...st, voice: v })} items={VOICES.map((v) => ({ id: v.id, label: v.label }))} /></FormField>
        <FormField label="Tür"><Chips value={st.genre} onChange={(v) => setSt({ ...st, genre: v })} items={GENRES} /></FormField>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Tempo"><Chips value={st.tempo} onChange={(v) => setSt({ ...st, tempo: v })}
            items={(Object.keys(TEMPO) as (keyof typeof TEMPO)[]).map((k) => ({ id: k, label: TEMPO[k].label }))} /></FormField>
          <FormField label="BPM (isteğe bağlı)" hint="Çocuk şarkıları çoğu zaman 90–130 arası.">
            <Input type="number" min={50} max={200} value={st.bpm ?? ""} onChange={(e) => setSt({ ...st, bpm: e.target.value ? Math.max(50, Math.min(200, Number(e.target.value))) : null })} />
          </FormField>
        </div>
        <FormField label="Duygu">
          <div className="flex flex-wrap gap-1.5">
            {MOODS.map((m) => <button key={m} type="button" onClick={() => mood(m)} className={cn("rounded-full border px-3 py-1 text-sm", moods.includes(m) ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted")}>{MOOD_TR[m]}</button>)}
          </div>
        </FormField>
        <FormField label="Çalgılar">
          <div className="flex flex-wrap gap-1.5">
            {INSTR.map(([en, tr]) => <button key={en} type="button" onClick={() => instr(en)} className={cn("rounded-full border px-3 py-1 text-sm", st.instruments.includes(en) ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted")}>{tr}</button>)}
          </div>
        </FormField>
      </CardContent></Card>
      <div className="space-y-4">
        <Panel title="Suno'nun “Style of Music” metni" description="Seçimlerden kurulur; elle de düzenleyebilirsiniz.">
          <Textarea rows={5} value={text} onChange={(e) => setSt({ ...st, text: e.target.value })} className="font-mono text-xs" aria-label="Tarz metni" />
          <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
            <span className={text.length > 200 ? "text-warning" : ""}>{text.length} karakter{text.length > 200 ? " (kısaltın: 200'ü geçmesin)" : ""}</span>
            {st.text && <button type="button" className="text-primary hover:underline" onClick={() => setSt({ ...st, text: "" })}>Seçimlerden yeniden kur</button>}
          </div>
        </Panel>
        <Panel title="Olmasın (Exclude styles)">
          <Input value={st.exclude} maxLength={400} onChange={(e) => setSt({ ...st, exclude: e.target.value })} placeholder="dark, sad, explicit, heavy distortion, screaming" />
        </Panel>
      </div>
    </div>
  );
}

function Copy({ label, text }: { label: string; text: string }) {
  const [done, setDone] = React.useState(false);
  return (
    <Button size="sm" variant="outline" disabled={!text.trim()} onClick={async () => {
      try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1500); } catch { alert(text); }
    }}>{done ? <Check data-icon="inline-start" /> : <ClipboardCopy data-icon="inline-start" />}{done ? "Kopyalandı" : label}</Button>
  );
}

/* 4 · make it: on suno.com, by Suno's API (when it exists), or upload */
function MakeStep({ song, save }: { song: Song; save: Save }) {
  const { addAssetMeta } = useStore();
  const keys = useKeys();
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState("");
  const [api, setApi] = React.useState("");
  const input = React.useRef<HTMLInputElement>(null);
  const [source, setSource] = useSticky<SongTake["source"]>("music.source", "suno-web");
  const style = song.style.text || styleText(song.style);
  const add = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true); setErr("");
    const takes = [...song.takes];
    try {
      for (const f of [...files]) {
        const a = await uploadAsset(f, f.name);
        if (a.kind !== "audio") throw new Error(`"${f.name}" bir ses dosyası değil.`);
        addAssetMeta(a);
        takes.push({ asset: a.id, source, durationMs: await audioDuration(assetUrl(a.id)), note: f.name, at: Date.now() });
      }
    } catch (e) { setErr((e as Error).message); }
    if (takes.length !== song.takes.length) await save({ takes, chosen: song.chosen ?? takes[takes.length - 1]!.asset });
    setBusy(false);
  };
  const tryApi = async () => {
    setApi("");
    try { await sunoGenerate(song.id); } catch (e) { setApi((e as Error).message); }
  };
  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Suno'da üret (önerilen)" icon={<ExternalLink />} description="Pro ya da Premier hesabınızla, Özel (Custom) modda.">
          <ol className="space-y-3 text-sm">
            {[
              <><Button asChild size="sm"><a href="https://suno.com/create" target="_blank" rel="noreferrer"><ExternalLink data-icon="inline-start" />suno.com/create</a></Button>
                <span className="text-muted-foreground">açın, <b>Custom</b>'ı seçin.</span></>,
              ...(song.style.voice === "instrumental" ? [] : [<><Copy label="Sözleri kopyala" text={song.lyrics} /><span className="text-muted-foreground">→ Lyrics</span></>]),
              <><Copy label="Tarzı kopyala" text={style} /><span className="text-muted-foreground">→ Style of Music</span></>,
              ...(song.style.exclude ? [<><Copy label="Olmasınları kopyala" text={song.style.exclude} /><span className="text-muted-foreground">→ Exclude styles</span></>] : []),
              <><Copy label="Başlığı kopyala" text={song.title} /><span className="text-muted-foreground">→ Title; Instrumental {song.style.voice === "instrumental" ? "açık" : "kapalı"}</span></>,
              <span className="text-muted-foreground">Create: Suno iki versiyon üretir. Beğendiklerinizi MP3 olarak indirip aşağıya bırakın.</span>,
            ].map((x, i) => <li key={i} className="flex flex-wrap items-center gap-2"><span className="font-medium">{i + 1}.</span>{x}</li>)}
          </ol>
        </Panel>
        <Panel title="Suno API (resmi)" description="Suno'nun herkese açık resmi API'si henüz yok; erişim açılınca bu düğme panelin içinden üretecek.">
          {!keys?.suno?.set ? <KeyCard name="suno" hint="Suno resmi API erişimi verdiğinde anahtarı buraya girin." /> : (
            <div className="space-y-3">
              <Button variant="outline" onClick={tryApi}><Sparkles data-icon="inline-start" />Suno API ile üret</Button>
              {api && <Notice tone="warn">{api}</Notice>}
            </div>
          )}
        </Panel>
      </div>
      <Panel title="Dosyalar" icon={<Upload />} description="Suno'dan indirdiğiniz ya da başka yerde yapılmış ses dosyaları (MP3, M4A, WAV). Birini seçin."
        action={<div className="flex flex-wrap items-center gap-2">
          <Select value={source} onChange={(e) => setSource(e.target.value as SongTake["source"])} className="h-8 w-48 text-xs">
            <option value="suno-web">Suno'da üretildi</option><option value="upload">Başka bir kaynaktan</option>
          </Select>
          <Button size="sm" disabled={busy} onClick={() => input.current?.click()}>{busy ? <Spinner data-icon="inline-start" /> : <Upload data-icon="inline-start" />}Dosya ekle</Button>
          <input ref={input} type="file" multiple accept="audio/mpeg,audio/mp4,audio/x-m4a,audio/wav,audio/aac,.mp3,.m4a,.wav" className="hidden"
                 onChange={(e) => { void add(e.target.files); e.target.value = ""; }} />
        </div>}>
        {err && <Notice tone="bad" className="mb-3">{err}</Notice>}
        {song.takes.length === 0 ? <EmptyState icon={<Music />} title="Henüz dosya yok" sub="Suno'nun ürettiği iki versiyonu da bırakabilirsiniz; dinleyip birini seçersiniz." /> : (
          <div className="space-y-2">
            {song.takes.map((t) => {
              const on = song.chosen === t.asset;
              const sec = t.durationMs === null ? null : t.durationMs / 1000;
              return (
                <div key={t.asset} className={cn("flex flex-wrap items-center gap-3 rounded-lg border p-3", on && "border-primary ring-3 ring-primary/15")}>
                  <audio controls preload="none" src={assetUrl(t.asset)} className="h-9 min-w-60 flex-1" />
                  <div className="text-xs text-muted-foreground">{t.note} · {secs(t.durationMs)}
                    {sec !== null && (sec < 55 || sec > 100) && <span className="text-warning"> · 60–90 sn önerilir</span>}</div>
                  <Pill tone="plain">{t.source === "upload" ? "başka kaynak" : t.source === "suno-api" ? "Suno API" : "Suno"}</Pill>
                  <Button size="sm" variant={on ? "default" : "outline"} onClick={() => void save({ chosen: t.asset })}>{on ? <><Check data-icon="inline-start" />Seçili</> : "Bunu seç"}</Button>
                  <Button size="icon-sm" variant="ghost" title="Kaldır" onClick={() => void save({ takes: song.takes.filter((x) => x !== t), chosen: on ? null : song.chosen })}><Trash2 /></Button>
                </div>
              );
            })}
          </div>
        )}
      </Panel>
    </div>
  );
}

/* 5 · where it came from, the checks, live or not */
function PublishStep({ song, save }: { song: Song; save: Save }) {
  const [lic, setLic] = React.useState(song.license);
  useAutosave(lic, (v) => save({ license: v }), { label: `Şarkı “${song.title}” lisansı` });
  const take = song.takes.find((t) => t.asset === song.chosen);
  const errs = song.issues.filter((i) => i.level === "error"), warns = song.issues.filter((i) => i.level === "warn");
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <div className="space-y-4">
        <Panel title="Nereden geldi?" description="Telefona yalnız kullanım hakkı açık olan şarkı gider.">
          {!take ? <Notice tone="warn">Önce Üret adımında bir dosya seçin.</Notice> : take.source !== "upload" ? (
            <div className="space-y-3">
              <FormField label="Suno planı (şarkı üretildiğinde)">
                <div className="grid gap-2 sm:grid-cols-3">
                  {PLANS.map((p) => (
                    <button key={p.id} type="button" onClick={() => setLic({ ...lic, plan: p.id })}
                      className={cn("rounded-lg border p-2.5 text-left text-sm", lic.plan === p.id ? "border-primary ring-3 ring-primary/15" : "hover:bg-muted/40")}>
                      <div className="font-medium">{p.label}</div><div className={cn("text-xs", p.tone === "bad" ? "text-destructive" : "text-muted-foreground")}>{p.note}</div>
                    </button>
                  ))}
                </div>
              </FormField>
              <div className="grid gap-3 sm:grid-cols-2">
                <FormField label="Suno hesabı"><Input value={lic.owner} onChange={(e) => setLic({ ...lic, owner: e.target.value })} placeholder="ekip@ornek.com" /></FormField>
                <FormField label="Üretildiği gün"><Input type="date" value={lic.madeAt} onChange={(e) => setLic({ ...lic, madeAt: e.target.value })} /></FormField>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <FormField label="Kim yaptı, hangi lisansla?"><Input value={lic.owner} onChange={(e) => setLic({ ...lic, owner: e.target.value })} placeholder="ör. stüdyo adı, besteci, lisans" /></FormField>
              <label className="flex items-start gap-2 text-sm">
                <Checkbox checked={lic.confirmed} onCheckedChange={(v) => setLic({ ...lic, confirmed: v === true, plan: "other" })} />
                Bu şarkıyı ticari bir çocuk uygulamasında kullanma hakkımız var.
              </label>
            </div>
          )}
          <FormField label="Not" className="mt-3"><Textarea value={lic.note} onChange={(e) => setLic({ ...lic, note: e.target.value })} placeholder="ör. Suno v5, ikinci versiyon; abonelik faturası Ekim" /></FormField>
        </Panel>
        {errs.length === 0 && warns.length === 0 && <Notice tone="ok" icon={<Check />}>Her şey yerinde.</Notice>}
        {errs.map((i) => <Notice key={i.text} tone="bad" icon={<AlertTriangle />}>{i.text}</Notice>)}
        {warns.map((i) => <Notice key={i.text} tone="warn">{i.text}</Notice>)}
      </div>
      <Panel title="Uygulamada mı?" icon={<Smartphone />} description="Bir durakta tek şarkı uygulamada olur: bunu koymak öbürünü taslağa alır. Telefona bir sonraki yayınla gider; durak o zaman açılır.">
        <Chips value={song.status} onChange={(s) => void save({ status: s })}
          items={[{ id: "draft", label: "Taslak" }, { id: "live", label: "Uygulamada" }, { id: "hidden", label: "Gizli" }]} />
        {errs.length > 0 && <p className="mt-2 text-xs text-destructive">Hataları giderilmeden uygulamaya konamaz.</p>}
        {song.chosen && <audio controls preload="none" src={assetUrl(song.chosen)} className="mt-3 h-9 w-full" />}
        <Button asChild variant="outline" size="sm" className="mt-3"><Link to="/yayinla"><Rocket data-icon="inline-start" />Yayınla</Link></Button>
      </Panel>
    </div>
  );
}

