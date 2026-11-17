/**
 * ŞARKI VİDEOLARI (2026-11-17): the films of the app's "Şarkılar" tab.
 *
 * The app has a bar at the bottom: songs, the map, the parent's area. The
 * songs are FILMS with a children's song mixed in, made and edited outside
 * and uploaded here finished (server: modules/songvideos.ts). A film has:
 *
 *   the film      an MP4 (H.264 + AAC)
 *   a poster      the card's picture -- the child picks by it
 *   a category    whose map row opens it on the phone ("Hep açık": none)
 *   its rights    the film and its song may be used (Suno's free plan: no)
 *
 * "Uygulamaya koy" and then Yayınla: posters travel with the release, the
 * films do not -- a phone streams one the first time it is watched and keeps
 * it, so a big film never holds back new recordings.
 */
import React from "react";
import { ArrowDown, ArrowUp, Check, Clapperboard, ImageDown, Plus, Trash2 } from "lucide-react";
import { codeOf, createSongVideo, deleteSongVideo, listSongVideos, patchSongVideo,
         type SongVideo, type SongVideoPatch, type VideoCategory } from "../api";
import { assetUrl } from "../blobs";
import { useStore } from "../store";
import { EmptyState, FormField, Loading, Notice, PageHeader, Panel, Pill, SaveChip } from "../components/common";
import { Slot } from "../components/Media";
import { VideoSlot } from "../components/VideoSlot";
import { flushEdits, useAutosave } from "@/lib/autosave";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";

const STATUS_LABEL = { live: "Uygulamada", draft: "Taslak", hidden: "Gizli" } as const;
const ALWAYS = "";
const opId = () => `sv-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

export function SongVideosPage() {
  const [view, setView] = React.useState<{ categories: VideoCategory[]; list: SongVideo[] } | null>(null);
  const [error, setError] = React.useState("");
  const load = React.useCallback(async () => {
    try { setView(await listSongVideos()); setError(""); } catch (e) { setError((e as Error).message); }
  }, []);
  React.useEffect(() => { void load(); }, [load]);
  const [title, setTitle] = React.useState("");
  const [cat, setCat] = React.useState(ALWAYS);
  const [busy, setBusy] = React.useState(false);
  const op = React.useRef(opId());
  const add = async () => {
    if (!title.trim()) return;
    setBusy(true);
    try {
      await createSongVideo(title.trim(), cat || null, op.current);
      op.current = opId(); setTitle(""); await load();
    } catch (e) { setError((e as Error).message); }
    setBusy(false);
  };
  /* the order on the tab: swap with a neighbour */
  const move = async (i: number, d: -1 | 1) => {
    if (!view || !(await flushEdits())) return;
    const a = view.list[i], b = view.list[i + d];
    if (!a || !b) return;
    try {
      await patchSongVideo(a.id, { position: b.position === a.position ? a.position + d : b.position }, a.updatedAt);
      await patchSongVideo(b.id, { position: a.position }, b.updatedAt);
    } catch (e) { setError((e as Error).message); }
    await load();
  };
  if (!view) return error ? <Notice tone="bad">{error}</Notice> : <Loading />;
  return (
    <>
      <PageHeader title="Şarkı videoları"
        sub="Uygulamanın alttaki menüsündeki Şarkılar sekmesi. Şarkısı içine eklenmiş, bitmiş bir videoyu (MP4) ve kartının resmini yükleyin; video, çocuk haritada o kategoriye ulaşınca açılır. Yayınla telefonlara gider, uygulama güncellemesi gerekmez." />
      <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <Card><CardContent className="flex flex-wrap items-end gap-3">
            <FormField label="Yeni videonun adı" className="min-w-[220px] flex-1">
              <Input value={title} maxLength={80} placeholder="ör. Mutfak şarkısı" data-testid="sv-new-title"
                     onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void add(); }} />
            </FormField>
            <FormField label="Ne zaman açılır" className="min-w-[220px]">
              <CategorySelect value={cat} onChange={setCat} categories={view.categories} testId="sv-new-category" />
            </FormField>
            <Button onClick={() => void add()} disabled={busy || !title.trim()} data-testid="sv-new"><Plus /> Video ekle</Button>
          </CardContent></Card>
          {error && <Notice tone="bad">{error}</Notice>}
          {view.list.length === 0
            ? <EmptyState icon={<Clapperboard />} title="Henüz şarkı videosu yok" sub="Uygulamada Şarkılar sekmesi boş çerçeveler ve “Yeni şarkılar yolda!” gösterir." />
            : view.list.map((v, i) => (
                <VideoCard key={v.id} v={v} categories={view.categories} reload={load}
                           first={i === 0} last={i === view.list.length - 1} onMove={(d) => void move(i, d)} />
              ))}
        </div>
        <aside className="space-y-4">
          <Panel title="Video" icon={<Clapperboard />}>
            <ul className="list-disc space-y-1.5 pl-4 text-sm text-muted-foreground">
              <li><b className="font-medium text-foreground">MP4 (H.264 + AAC)</b>, yatay. MOV her Android telefonda oynamaz.</li>
              <li>Uygulama videoyu <b className="font-medium text-foreground">ekranı doldurarak</b> oynatır; telefonda 19,5:9 çekilmiş bir film hiçbir şey kaybetmez. Kenarı kesilmemesi gereken film için “Bantlı” seçin.</li>
              <li>720p ve ~2 Mbps yeterli: çoğu şarkı 30 MB'ın altında kalır. En çok 250 MB.</li>
              <li>1–3 dakika, 4–8 yaş için en iyisi.</li>
            </ul>
          </Panel>
          <Panel title="Telefonda ne olur">
            <ol className="list-decimal space-y-1.5 pl-4 text-sm text-muted-foreground">
              <li>“Uygulamaya koy” ve ardından <b className="font-medium text-foreground">Yayınla</b>.</li>
              <li>Kapak resimleri yayınla iner; <b className="font-medium text-foreground">videolar inmez</b>. Çocuk bir videoyu ilk açtığında sunucudan oynar ve telefona kaydedilir; sonra internetsiz de oynar.</li>
              <li>Kategorisi olan video, çocuk haritada o kategorinin ilk durağına ulaşana kadar <b className="font-medium text-foreground">kilitli</b> görünür. “Hep açık” videolar baştan açıktır.</li>
              <li>Sıra, Şarkılar sekmesindeki sıradır.</li>
            </ol>
          </Panel>
          <Panel title="Hak">
            <p className="text-sm text-muted-foreground">Videonun ve içindeki şarkının ticari kullanım hakkı onaylanmadan video uygulamaya konamaz. Suno'nun <b className="font-medium text-foreground">ücretsiz planıyla</b> yapılan şarkı ticari kullanılamaz (Pro/Premier gerekir).</p>
          </Panel>
        </aside>
      </div>
    </>
  );
}

function CategorySelect({ value, onChange, categories, testId }: {
  value: string; onChange: (v: string) => void; categories: VideoCategory[]; testId?: string;
}) {
  return (
    <NativeSelect value={value} onChange={(e) => onChange(e.target.value)} data-testid={testId}>
      <NativeSelectOption value={ALWAYS}>Hep açık</NativeSelectOption>
      {categories.map((c) => (
        <NativeSelectOption key={c.id} value={c.id}>{c.title}{c.kind === "panel" ? " (panel)" : ""} · haritada ulaşınca</NativeSelectOption>
      ))}
    </NativeSelect>
  );
}

function VideoCard({ v, categories, reload, first, last, onMove }: {
  v: SongVideo; categories: VideoCategory[]; reload: () => Promise<void>;
  first: boolean; last: boolean; onMove: (d: -1 | 1) => void;
}) {
  const { addAsset } = useStore();
  const base = React.useRef(v.updatedAt);
  React.useEffect(() => { base.current = v.updatedAt; }, [v.updatedAt]);
  const [d, setD] = React.useState({ title: v.title, note: v.note, owner: v.rights.owner, rightsNote: v.rights.note });
  const [stale, setStale] = React.useState(false);
  const [error, setError] = React.useState("");
  const [grabbing, setGrabbing] = React.useState(false);
  const save = async (p: SongVideoPatch) => {
    try {
      const out = await patchSongVideo(v.id, p, base.current); base.current = out.updatedAt; setError(""); setStale(false);
      void reload();
      return true;
    } catch (e) {
      if (codeOf(e) === "STALE") setStale(true); else setError((e as Error).message);
      throw e;
    }
  };
  const auto = useAutosave(d, (x) => save({ title: x.title.trim(), note: x.note, rights: { ...v.rights, owner: x.owner, note: x.rightsNote } }),
                           { ms: 600, skip: (x) => !x.title.trim(), label: `Şarkı videosu “${v.title}”` });
  /* one change at a time, after any typing went out */
  const now = async (p: SongVideoPatch) => {
    if (!(await flushEdits())) return;
    try { await save(p); } catch { /* shown */ }
    await reload();
  };
  /* the film's length, read by the browser (the server cannot) */
  const measure = (seconds: number) => {
    const ms = Math.round(seconds * 1000);
    if (Number.isFinite(ms) && ms > 0 && Math.abs((v.durationMs ?? 0) - ms) > 500) void now({ durationMs: ms });
  };
  /* the poster from the film: the frame it shows at 3 s, as a JPEG */
  const posterFromFilm = async () => {
    if (!v.video) return;
    setGrabbing(true); setError("");
    try {
      const el = document.createElement("video");
      el.crossOrigin = "anonymous"; el.muted = true; el.preload = "auto"; el.src = assetUrl(v.video);
      await new Promise<void>((res, rej) => { el.onloadeddata = () => res(); el.onerror = () => rej(new Error("Video açılamadı.")); });
      el.currentTime = Math.min(3, (el.duration || 6) / 2);
      await new Promise<void>((res) => { el.onseeked = () => res(); });
      const c = document.createElement("canvas");
      c.width = el.videoWidth; c.height = el.videoHeight;
      c.getContext("2d")!.drawImage(el, 0, 0);
      const blob = await new Promise<Blob | null>((res) => c.toBlob(res, "image/jpeg", 0.88));
      if (!blob) throw new Error("Kare alınamadı.");
      const a = await addAsset(new File([blob], `${v.id}-kapak.jpg`, { type: "image/jpeg" }));
      if (!a) throw new Error("Kapak kaydedilemedi.");
      await now({ poster: a.id });
    } catch (e) { setError((e as Error).message); }
    setGrabbing(false);
  };
  const errors = v.issues.filter((i) => i.level === "error");
  return (
    <Card data-song-video={v.id}><CardContent className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Pill tone={v.status === "live" ? "ok" : "plain"}>{STATUS_LABEL[v.status]}</Pill>
        <div className="min-w-0 flex-1 truncate text-lg font-semibold">{v.title}</div>
        <SaveChip state={stale ? "stale" : auto.state} />
        <Button size="icon-sm" variant="ghost" aria-label="Yukarı" disabled={first} onClick={() => onMove(-1)}><ArrowUp /></Button>
        <Button size="icon-sm" variant="ghost" aria-label="Aşağı" disabled={last} onClick={() => onMove(1)}><ArrowDown /></Button>
        {v.status === "live"
          ? <Button size="sm" variant="outline" onClick={() => void now({ status: "draft" })}>Taslağa al</Button>
          : <Button size="sm" onClick={() => void now({ status: "live" })} disabled={errors.length > 0} data-testid="sv-live"><Check /> Uygulamaya koy</Button>}
        <Button size="sm" variant="ghost" aria-label="Sil"
                onClick={async () => { if (confirm(`“${v.title}” silinsin mi?`)) { await deleteSongVideo(v.id); await reload(); } }}><Trash2 /></Button>
      </div>
      <div className="grid gap-4 lg:grid-cols-[1fr_260px]">
        <div className="space-y-2">
          <div className="text-sm font-medium">Video</div>
          <VideoSlot value={v.video} fit={v.fit} onChange={(a) => void now({ video: a })} onFit={(f) => void now({ fit: f })} />
          {v.video && <video key={v.video} src={assetUrl(v.video)} preload="metadata" className="hidden"
                             onLoadedMetadata={(e) => measure((e.target as HTMLVideoElement).duration)} />}
          {v.durationMs !== null && <div className="text-xs text-muted-foreground">Süre: {Math.floor(v.durationMs / 60000)}:{String(Math.round((v.durationMs % 60000) / 1000)).padStart(2, "0")}</div>}
        </div>
        <div className="space-y-2">
          <div className="text-sm font-medium">Kapak (kartın resmi)</div>
          <Slot kind="image" value={v.poster ?? undefined} onChange={(a) => void now({ poster: a ?? null })} />
          <Button size="sm" variant="outline" disabled={!v.video || grabbing} onClick={() => void posterFromFilm()}>
            <ImageDown /> {grabbing ? "Alınıyor…" : "Videodan kare al"}
          </Button>
          <div className="text-xs text-muted-foreground">4:3 civarı bir resim kartı en iyi doldurur; köşeleri yuvarlatılır.</div>
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <FormField label="Adı" hint="kartın köşesinde yazar (yetişkin okur)">
          <Input value={d.title} maxLength={80} onChange={(e) => setD({ ...d, title: e.target.value })} />
        </FormField>
        <FormField label="Ne zaman açılır">
          <CategorySelect value={v.category ?? ALWAYS} categories={categories} onChange={(c) => void now({ category: c || null })} />
        </FormField>
      </div>
      <div className="rounded-lg border p-3">
        <label className="flex items-center gap-2 text-sm font-medium">
          <Checkbox checked={v.rights.confirmed} data-testid="sv-rights"
                    onCheckedChange={(c) => void now({ rights: { confirmed: c === true, owner: d.owner, note: d.rightsNote } })} />
          Videonun ve içindeki şarkının ticari kullanım hakkı var
        </label>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <FormField label="Kim yaptı / hangi hesap" hint="ör. Suno Pro hesabı, animasyon: ekip">
            <Input value={d.owner} maxLength={120} onChange={(e) => setD({ ...d, owner: e.target.value })} />
          </FormField>
          <FormField label="Not">
            <Input value={d.rightsNote} maxLength={600} onChange={(e) => setD({ ...d, rightsNote: e.target.value })} />
          </FormField>
        </div>
      </div>
      {error && <Notice tone="bad">{error}</Notice>}
      {stale && <Notice tone="warn" action={<Button size="sm" variant="outline" onClick={() => void reload()}>Sunucudakini yükle</Button>}>Bu video başka bir yerde değişti.</Notice>}
      {v.issues.length > 0 && (
        <div className="space-y-2">
          {v.issues.map((i) => <Notice key={i.text} tone={i.level === "error" ? "bad" : "warn"}>{i.text}</Notice>)}
        </div>
      )}
    </CardContent></Card>
  );
}
