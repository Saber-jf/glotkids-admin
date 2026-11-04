/**
 * YOL HARİTASI (drawn map, 2026-11-03; the app's docs/YOL-HARITASI-CIZILI.md).
 *
 * The app's only map is drawn by code: one ROW per category -- game stops
 * 1 · 2 · 3 and an optional music stop -- two rows a page. The app ships its
 * six rows (24 stops) in its bundle. A row made here is the next category on
 * the map: picked from the categories made on the Kategoriler page, its stops
 * built from that category's game steps. A release carries the live rows, in
 * order, and phones lay them after their own: no app update. The server's
 * checks keep it one map (`loplop-server/src/modules/roadmap.ts`).
 *
 * The painted map before this (pictures, a drawn trail, stops placed on it,
 * walk/boat entries) is gone; the server still calls a row a "slide".
 */
import React from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { AlertTriangle, ArrowDown, ArrowUp, Check, CheckCircle2, Map as MapIcon, Music, Plus, Rows3,
         Smartphone, Sparkles, Trash2, Wand2 } from "lucide-react";
import { createSlide, deleteSlide, getRoadmap, listPacks, orderSlides, patchSlide, type Pack,
         type FlowStep, type RoadSlide, type RoadWorld, type ServerCategory, type SlideStop, type StopKind } from "../api";
import { useCategories } from "../categories";
import { useGames } from "../games";
import { Slot } from "../components/Media";
import { MapPreview, STOP_C, STOP_LABEL, StopLegend } from "../components/RoadWorld";
import { EmptyState, FormField, IconTile, Loading, Modal, ModalActions, Notice, PageHeader, Panel, Pill, SaveChip, Select } from "../components/common";
import { useAutosave } from "@/lib/autosave";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Spinner } from "@/components/ui/spinner";

const STATUS_LABEL = { live: "Uygulamada", draft: "Taslak", hidden: "Gizli" } as const;

function useRoadmap() {
  const [data, setData] = React.useState<{ world: RoadWorld | null; slides: RoadSlide[] } | null>(null);
  const [error, setError] = React.useState("");
  const load = React.useCallback(() => getRoadmap().then((d) => { setData(d); setError(""); }).catch((e: Error) => setError(e.message)), []);
  React.useEffect(() => { void load(); }, [load]);
  return { data, error, load, setData };
}

/* ── a row's stops, from its category ─────────────────────────────────────── */

/*
 * A STOP'S ID IS NEVER REUSED (F04). A phone remembers which stops a child
 * finished BY ID; "<row>-3" given to a new lesson after the old third stop
 * was deleted (or after building again from a category numbered from 1)
 * handed the new lesson the old one's tick. So a new stop gets an id no stop
 * of this row has had: the row's id and the moment it was made. A stop keeps
 * its id while its lesson stays the same; it gets a new one when it opens
 * another category or other games (another lesson). The server refuses a
 * published stop id bound to another lesson (`roadmap.ts` → `checkSlide`).
 */
let stopSeq = 0;
export function freshStopId(slide: string, taken: readonly { id: string }[]): string {
  const head = slide.slice(0, 44);
  for (;;) {
    const id = `${head}-${Date.now().toString(36)}${(stopSeq++ % 1296).toString(36).padStart(2, "0")}`;
    if (!taken.some((s) => s.id === id)) return id;
  }
}

const isGame = (s: FlowStep) => s.kind === "game";

/** a category's steps in stops: each game with the films/scenes just before it; the closing film joins the last */
export function stopsFrom(cat: ServerCategory): string[][] {
  const groups: string[][] = [];
  let acc: string[] = [];
  for (const s of cat.steps) {
    if (s.kind === "finish") break;
    acc.push(s.id);
    if (isGame(s)) { groups.push(acc); acc = []; }
  }
  if (acc.length && groups.length) groups[groups.length - 1]!.push(...acc);
  return groups;
}

/** a row has at most three game stops: 1 · 2 · 3 */
const GAME_KINDS: StopKind[] = ["1", "2", "3"];

/** the lesson a stop plays, as the server compares it: its category and the game steps it opens (films do not count) */
const lessonKey = (cat: ServerCategory, steps: readonly string[]) =>
  `${cat.id}:${cat.steps.filter((s) => s.kind === "game" && steps.includes(s.id)).map((s) => s.id).join(",")}`;

/**
 * THE STOPS OF A ROW, BUILT FROM ITS CATEGORY: the category's game steps in
 * order (at most three), each a stop whose steps are the films and scenes
 * after the game before it, then that game -- the way the app's own rows
 * open their categories. A stop that opens the same lesson as before keeps
 * its id (and the children who finished it); every other one is new (F04).
 * A music stop, wanted, goes last and keeps its id and song.
 */
export function rowStops(slide: string, cat: ServerCategory, old: readonly SlideStop[], music: boolean): SlideStop[] {
  const made: SlideStop[] = [];
  stopsFrom(cat).slice(0, GAME_KINDS.length).forEach((steps, k) => {
    const key = lessonKey(cat, steps);
    const same = old.find((o) => o.kind !== "music" && o.category === cat.id && lessonKey(cat, o.steps) === key && !made.some((m) => m.id === o.id));
    made.push({ id: same?.id ?? freshStopId(slide, [...old, ...made]), kind: GAME_KINDS[k]!, category: cat.id, steps });
  });
  if (music) {
    const was = old.find((o) => o.kind === "music");
    made.push({ id: was?.id ?? freshStopId(slide, [...old, ...made]), kind: "music", category: cat.id, steps: [], song: was?.song ?? null });
  }
  return made;
}

/** the categories a row can be made of: the panel's own (the app's six are already on the map) */
const ownOf = (categories: readonly ServerCategory[]) => categories.filter((c) => !c.builtin);

/* ── the overview ─────────────────────────────────────────────────────────── */

export function RoadmapPage() {
  const { data, error, load } = useRoadmap();
  const nav = useNavigate();
  const { categories } = useCategories();
  const [making, setMaking] = React.useState(false);
  if (error) return <Notice tone="bad">{error}</Notice>;
  if (!data) return <Loading />;
  const { world, slides } = data;
  const move = async (i: number, d: -1 | 1) => {
    const ids = slides.map((s) => s.id); const j = i + d;
    [ids[i], ids[j]] = [ids[j]!, ids[i]!];
    await orderSlides(ids); await load();
  };
  const own = world?.rows.length ?? 0;
  return (
    <>
      <PageHeader title="Yol haritası"
        sub="Haritayı uygulama çizer: her kategori bir sıra, her sırada oyun durakları 1 · 2 · 3 ve isteğe bağlı bir müzik durağı. Uygulamanın kendi 6 sırası pakettedir; buradan eklenen sıralar onların arkasına, bu sırayla eklenir. Yayınla telefonlara iner; uygulama güncellemesi gerekmez."
        actions={<Button onClick={() => setMaking(true)} disabled={!world}><Plus data-icon="inline-start" />Yeni sıra</Button>} />
      {!world ? (
        <Notice tone="warn" icon={<AlertTriangle />}>Uygulama çizili haritayı henüz bildirmedi. Uygulamanın klasöründe <code>npm run inventory</code> çalıştırın; sunucu açılışta okur.</Notice>
      ) : (
        <div className="space-y-8">
          <Card className="gap-3 p-4">
            <MapPreview world={world} slides={slides} onPick={(id) => nav(`/yol-haritasi/${id}`)} />
            <StopLegend />
          </Card>

          <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
            <section className="space-y-3">
              <h2 className="font-heading text-base font-semibold">Haritanın sıraları <span className="font-normal text-muted-foreground">{own} + {slides.length}</span></h2>
              <ol className="space-y-2">
                {world.rows.map((r, i) => (
                  <li key={r.row}>
                    <Card size="sm" className="flex-row items-center gap-3 px-3 opacity-60">
                      <span className="w-6 text-center font-heading font-semibold text-muted-foreground tabular-nums">{i + 1}</span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium">{r.title}</div>
                        <div className="text-xs text-muted-foreground">uygulamanın kendi sırası · değiştirilemez</div>
                      </div>
                      <StopDots kinds={r.stops.map((s) => s.kind)} />
                    </Card>
                  </li>
                ))}
                {slides.map((s, i) => (
                  <li key={s.id}>
                    <RowCard slide={s} n={own + i + 1} category={categories.find((c) => c.id === s.category)}
                             up={i > 0 ? () => void move(i, -1) : undefined} down={i < slides.length - 1 ? () => void move(i, 1) : undefined} />
                  </li>
                ))}
              </ol>
              {slides.length === 0 && (
                <EmptyState icon={<MapIcon />} title="Henüz yeni sıra yok"
                  sub="Kategoriler sayfasında kurduğunuz bir kategoriyi seçin: oyunları kendiliğinden duraklara dizilir."
                  action={<Button onClick={() => setMaking(true)}><Plus />İlk sırayı ekle</Button>} />
              )}
            </section>
            <aside className="space-y-4">
              <Panel title="Harita nasıl büyür">
                <ul className="list-disc space-y-1.5 pl-4 text-sm text-muted-foreground">
                  <li><b className="font-medium text-foreground">Bir sıra, bir kategori.</b> Kategorinin oyunları sırayla 1 · 2 · 3 numaralı duraklar olur (en çok üç); isterseniz sonda bir müzik durağı.</li>
                  <li><b className="font-medium text-foreground">Yalnız arkaya eklenir.</b> Uygulamanın 24 durağı ve önceki sıralar yerinde kalır; bir çocuğun durağı asla kaymaz.</li>
                  <li><b className="font-medium text-foreground">Zincir:</b> bir sıra, öncekilerin hepsi uygulamadaysa yayına girer — ada olmaz.</li>
                  <li><b className="font-medium text-foreground">Durak kimlikleri kalıcıdır:</b> ilerleme telefonda kimlikle tutulur. Aynı ders aynı kimliği korur; başka ders yeni kimlik alır.</li>
                  <li><b className="font-medium text-foreground">Resim gerekmez:</b> sıranın tabelası kategorinin resmi, durakların resmi oyunlarının kartı; yoksa telefon kendi çizimini koyar.</li>
                  <li><b className="font-medium text-foreground">Eski sürüm:</b> çizili haritayı bilmeyen bir sürüm sırayı almaz; kategori yine Kategoriler sekmesinde görünür.</li>
                </ul>
              </Panel>
            </aside>
          </div>
        </div>
      )}
      {making && <NewRow categories={ownOf(categories)} onClose={() => setMaking(false)} onMade={(id) => nav(`/yol-haritasi/${id}`)} />}
    </>
  );
}

function StopDots({ kinds }: { kinds: readonly StopKind[] }) {
  return (
    <span className="flex gap-1">
      {kinds.map((k, i) => <span key={i} className="flex size-6 items-center justify-center rounded-full text-[11px] font-bold text-white" style={{ background: STOP_C[k] }}>{STOP_LABEL[k]}</span>)}
    </span>
  );
}

function RowCard({ slide: s, n, category, up, down }: { slide: RoadSlide; n: number; category?: ServerCategory; up?: () => void; down?: () => void }) {
  const errs = s.issues.filter((x) => x.level === "error").length;
  return (
    <Card size="sm" className="gap-2 px-3" data-row={s.id}>
      <div className="flex items-center gap-3">
        <span className="w-6 text-center font-heading font-semibold text-muted-foreground tabular-nums">{n}</span>
        <Link to={`/yol-haritasi/${s.id}`} className="min-w-0 flex-1">
          <div className="truncate font-medium hover:text-primary">{s.title}</div>
          <div className="truncate text-xs text-muted-foreground">
            {category ? category.title : s.category ?? "kategori yok"} · {s.stops.length} durak{s.pack ? ` · paket: ${s.pack}` : " · paketsiz"}
          </div>
        </Link>
        <StopDots kinds={s.stops.map((x) => x.kind)} />
        {errs ? <Pill tone="bad">{errs} hata</Pill> : <Pill tone="ok">hazır</Pill>}
        <Pill tone={s.status === "live" ? "ok" : "plain"}>{STATUS_LABEL[s.status]}</Pill>
        <div className="flex">
          <Button variant="ghost" size="icon-sm" disabled={!up} onClick={up} title="Öne al"><ArrowUp /></Button>
          <Button variant="ghost" size="icon-sm" disabled={!down} onClick={down} title="Arkaya al"><ArrowDown /></Button>
        </div>
      </div>
      {s.issues.length > 0 && (
        <ul className="space-y-0.5 pl-9">{s.issues.map((x, k) => (
          <li key={k} className={cn("text-xs", x.level === "error" ? "font-medium text-destructive" : "text-warning")}>• {x.text}</li>))}</ul>
      )}
    </Card>
  );
}

/** a new row: a category picked, its title and stops from it; optionally into a pack */
export function NewRow({ categories, pack, onClose, onMade }: {
  categories: readonly ServerCategory[]; pack?: string; onClose: () => void; onMade: (id: string) => void;
}) {
  const [pick, setPick] = React.useState(categories[0]?.id ?? "");
  const [music, setMusic] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const cat = categories.find((c) => c.id === pick);
  const games = cat ? stopsFrom(cat).length : 0;
  const make = async () => {
    if (!cat) return;
    setBusy(true); setError("");
    try {
      const s = await createSlide(cat.title);
      await patchSlide(s.id, { stops: rowStops(s.id, cat, [], music), ...(pack ? { pack } : {}) }, s.updatedAt);
      onMade(s.id);
    } catch (e) { setError((e as Error).message); setBusy(false); }
  };
  return (
    <Modal title="Yeni sıra" description="Haritanın sonuna eklenir. Bir kategori seçin: adı sıranın adı olur, oyunları sırayla 1 · 2 · 3 numaralı duraklar." onClose={onClose}>
      <FormField label="Kategori" hint={cat ? `${games} oyun${games > 3 ? " — yalnız ilk üçü durak olur" : ""}` : "Önce Kategoriler'de bir kategori kurun."}>
        <Select value={pick} onChange={(e) => setPick(e.target.value)} aria-label="Kategori">
          {categories.length === 0 && <option value="">— kategori yok —</option>}
          {categories.map((c) => <option key={c.id} value={c.id}>{c.title} ({c.status === "live" ? "uygulamada" : "taslak"})</option>)}
        </Select>
      </FormField>
      <label className="flex items-center gap-2 text-sm">
        <Checkbox checked={music} onCheckedChange={(v) => setMusic(v === true)} />Sonda bir müzik durağı (şarkısı sonra yüklenir ya da Müzik sayfasından yapılır)
      </label>
      {error && <Notice tone="bad">{error}</Notice>}
      <ModalActions>
        <Button variant="ghost" onClick={onClose}>Vazgeç</Button>
        <Button disabled={!cat || !games || busy} onClick={make}>{busy && <Spinner data-icon="inline-start" />}Oluştur</Button>
      </ModalActions>
    </Modal>
  );
}

/* ── one row ──────────────────────────────────────────────────────────────── */

type Draft = Pick<RoadSlide, "title" | "stops" | "pack">;

export function RoadSlideEdit() {
  const { id } = useParams();
  const { data, error, load, setData } = useRoadmap();
  /* taking the server's version starts the editor again from it (F06) */
  const [gen, setGen] = React.useState(0);
  if (error) return <Notice tone="bad">{error}</Notice>;
  if (!data) return <Loading />;
  const i = data.slides.findIndex((s) => s.id === id);
  if (i < 0) return <p className="text-sm text-muted-foreground">Sıra bulunamadı. <Link className="text-primary hover:underline" to="/yol-haritasi">Yol haritasına dön</Link></p>;
  return <Editor key={`${id}:${gen}`} world={data.world} slides={data.slides} index={i} reload={load}
                 restart={async () => { await load(); setGen((g) => g + 1); }}
                 onSaved={(s) => setData((d) => d && { ...d, slides: d.slides.map((x) => (x.id === s.id ? s : x)) })} />;
}

function Editor({ world, slides, index, reload, restart, onSaved }: {
  world: RoadWorld | null; slides: RoadSlide[]; index: number; reload: () => Promise<void>; restart: () => Promise<void>; onSaved: (s: RoadSlide) => void;
}) {
  const slide = slides[index]!;
  const nav = useNavigate();
  const { categories } = useCategories();
  const { games } = useGames();
  const own = ownOf(categories);
  const [d, setD] = React.useState<Draft>({ title: slide.title, stops: slide.stops, pack: slide.pack });
  const [packs, setPacks] = React.useState<Pack[]>([]);
  React.useEffect(() => { listPacks().then(setPacks).catch(() => setPacks([])); }, []);
  const base = React.useRef(slide.updatedAt);
  const issues = slide.issues;
  /* a moment after each change the row is saved, naming the version it started
     from; leaving the page sends what is waiting (F01, `lib/autosave.ts`) */
  const auto = useAutosave(d, async (v) => {
    const s = await patchSlide(slide.id, v, base.current);
    base.current = s.updatedAt; onSaved(s);
  }, { ms: 600, label: `Harita sırası “${slide.title}”` });
  const { state, message } = auto;
  /* "write mine over it": the server's version is read for its stamp only, then the draft is sent */
  const [mine, setMine] = React.useState(false);
  React.useEffect(() => {
    if (!mine) return;
    setMine(false); base.current = slide.updatedAt; void auto.retry();
  }, [mine, slide.updatedAt]); // eslint-disable-line react-hooks/exhaustive-deps

  const setStatus = async (status: RoadSlide["status"]) => {
    if (!(await auto.flush())) { alert("Önce sıranın son değişikliği kaydedilmeli."); return; }
    try { const s = await patchSlide(slide.id, { ...d, status }, base.current); base.current = s.updatedAt; onSaved(s); }
    catch (e) { alert((e as Error).message); }
  };
  const errs = issues.filter((x) => x.level === "error");
  const catId = d.stops.find((s) => s.kind !== "music" && s.category)?.category ?? "";
  const cat = categories.find((c) => c.id === catId);
  const musicStop = d.stops.find((s) => s.kind === "music");
  const rebuild = (c: ServerCategory | undefined, music: boolean) => {
    if (!c) return;
    setD((x) => ({ ...x, stops: rowStops(slide.id, c, x.stops, music) }));
  };
  const stepName = (sid: string) => {
    const s = cat?.steps.find((x) => x.id === sid);
    if (!s) return sid;
    if (s.kind === "game") return games.find((g) => g.id === s.game)?.name ?? "oyun";
    return s.kind === "video" ? "video" : s.kind === "scene" ? "canlı sahne" : "bitiş";
  };
  const setStop = (k: number, s: SlideStop) => setD((x) => ({ ...x, stops: x.stops.map((y, j) => (j === k ? s : y)) }));
  /* the preview shows this row as it is being edited */
  const shown = slides.map((s) => (s.id === slide.id ? { ...s, title: d.title, stops: d.stops } : s));

  return (
    <>
      <PageHeader back={{ to: "/yol-haritasi", label: "Yol haritası" }}
        title={<input value={d.title} onChange={(e) => setD({ ...d, title: e.target.value })} aria-label="Sıranın adı"
                      className="-ml-1.5 w-full max-w-xl rounded-md bg-transparent px-1.5 py-0.5 text-2xl font-semibold tracking-tight outline-none hover:bg-muted/60 focus:bg-background focus:ring-3 focus:ring-ring/50" />}
        meta={<>kimlik: {slide.id} · haritanın {(world?.rows.length ?? 6) + index + 1}. sırası · {d.stops.length} durak</>}
        actions={<>
          <SaveChip state={state} />
          <Button variant="ghost" size="icon" title="Sırayı sil" className="hover:bg-destructive/10 hover:text-destructive" onClick={async () => {
            if (!confirm(`"${slide.title}" sırası silinsin mi?${slide.status === "live" ? " Uygulamada: bir sonraki yayında telefonlardan kalkar." : ""}`)) return;
            await deleteSlide(slide.id); nav("/yol-haritasi");
          }}><Trash2 /></Button>
        </>} />
      {state === "stale" && <Notice tone="warn" className="mb-4" action={<>
        <Button size="sm" variant="outline" onClick={() => { auto.discard(); void restart(); }}>Sunucudakini yükle</Button>
        <Button size="sm" onClick={async () => { if (confirm("Başka yerde yapılan değişikliğin üstüne bu penceredeki yazılsın mı?")) { await reload(); setMine(true); } }}>Benimkini yaz</Button>
      </>}>Bu sıra başka bir yerde değişti; değişikliğiniz yazılmadı ve ekranda duruyor.</Notice>}
      {state === "error" && <Notice tone="bad" className="mb-4" action={<Button size="sm" variant="outline" onClick={() => void auto.retry()}>Yeniden dene</Button>}>Kaydedilemedi: {message}</Notice>}

      <div className="space-y-6">
        <Card className="gap-3 p-4">
          <MapPreview world={world} slides={shown} focus={slide.id} height={150} />
          <StopLegend />
        </Card>

        <Panel title="1 · Kategori ve duraklar" icon={<Rows3 />}
               description="Bir sıra bir kategoridir. Kategorinin oyunları sırayla 1 · 2 · 3 numaralı duraklar olur; her durak önündeki videoyu ya da sahneyi de açar.">
          <div className="space-y-4">
            <div className="flex flex-wrap items-end gap-2 rounded-lg border bg-muted/30 p-3">
              <FormField label="Kategori" className="min-w-[240px] flex-1">
                <Select value={catId} aria-label="Sıranın kategorisi" onChange={(e) => {
                  const c = own.find((x) => x.id === e.target.value);
                  if (!c) return;
                  /* the row's name follows its category, unless it was named by hand */
                  setD((x) => ({ ...x, title: !x.title.trim() || x.title === cat?.title ? c.title : x.title, stops: rowStops(slide.id, c, x.stops, !!musicStop) }));
                }}>
                  {!catId && <option value="">— kategori seçin —</option>}
                  {own.map((c) => <option key={c.id} value={c.id}>{c.title} ({c.status === "live" ? "uygulamada" : "taslak"})</option>)}
                </Select>
              </FormField>
              <Button variant="outline" disabled={!cat} onClick={() => rebuild(cat, !!musicStop)}
                      title="Kategorinin oyunları değiştiyse durakları yeniden kurar; aynı dersler kimliğini korur"><Wand2 data-icon="inline-start" />Yeniden diz</Button>
              <label className="flex h-9 items-center gap-2 text-sm">
                <Checkbox checked={!!musicStop} disabled={!cat} onCheckedChange={(v) => rebuild(cat, v === true)} />Müzik durağı
              </label>
            </div>
            {d.stops.length === 0 ? <p className="text-sm text-muted-foreground">Durak yok: bir kategori seçin.</p> : (
              <ol className="space-y-2">
                {d.stops.map((s, k) => (
                  <li key={s.id} className="flex flex-wrap items-start gap-3 rounded-lg border p-3">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white" style={{ background: STOP_C[s.kind] }}>{STOP_LABEL[s.kind]}</span>
                    <div className="min-w-0 flex-1 space-y-1">
                      {s.kind === "music" ? (
                        <>
                          <div className="flex items-center gap-1.5 font-medium"><Music className="size-4" />Müzik durağı</div>
                          <Slot kind="audio" value={s.song ?? undefined} onChange={(v) => setStop(k, { ...s, song: v ?? null })} />
                          <p className="text-xs text-muted-foreground">Şarkı sonuna kadar çalınca durak sayılır. MP3/M4A, 60–90 sn; ya da <Link to="/muzik" className="text-primary hover:underline">Müzik</Link> sayfasından yapın.</p>
                        </>
                      ) : (
                        <>
                          <div className="font-medium">{s.kind}. oyun · {s.steps.filter((x) => cat?.steps.find((y) => y.id === x)?.kind === "game").map(stepName).join(", ") || "oyun yok"}</div>
                          <div className="flex flex-wrap gap-1.5 text-xs text-muted-foreground">
                            {s.steps.map((x) => <span key={x} className="rounded bg-muted px-1.5 py-0.5">{stepName(x)} <code>{x}</code></span>)}
                          </div>
                        </>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <code className="text-xs text-muted-foreground">{s.id}</code>
                      {s.kind !== "music" && <Button variant="ghost" size="sm" className="h-6 px-2 text-xs"
                        title="Kategorinin içinde oyun değiştiyse: bu durak yeni bir ders olur, onu bitirmiş çocuklar yeni dersi bitirmiş sayılmaz"
                        onClick={() => { if (confirm("Bu durak yeni bir ders sayılsın mı? Yeni kimlik alır; eski ilerleme eski derste kalır.")) setStop(k, { ...s, id: freshStopId(slide.id, d.stops) }); }}>
                        yeni ders</Button>}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </Panel>

        <Panel title="2 · İndirme paketi" icon={<Sparkles />}
               description="Paketteki sıra herkese otomatik inmez: çocuk sunulma durağına gelince bir büyüğün onayıyla iner.">
          <div className="flex flex-wrap items-end gap-3">
            <FormField label="Paket" className="min-w-[260px]">
              <Select value={d.pack ?? ""} onChange={(e) => setD({ ...d, pack: e.target.value || null })}>
                <option value="">Paketsiz (herkese yayınla iner)</option>
                {packs.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
              </Select>
            </FormField>
            {d.pack && <Link to={`/paketler/${d.pack}`} className="pb-2 text-xs font-medium text-primary hover:underline">Paketi aç →</Link>}
          </div>
        </Panel>

        <Panel title="3 · Kontrol ve durum" icon={<CheckCircle2 />}
               description="Sunucunun denetimi: hata yayına girmeyi durdurur, uyarı durdurmaz.">
          <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
            <div>
              {issues.length === 0 ? <p className="flex items-center gap-2 text-sm text-success"><Check className="size-4" />Eksik bir şey yok.</p> : (
                <ul className="space-y-1">{issues.map((x, k) => (
                  <li key={k} className={cn("text-sm", x.level === "error" ? "font-medium text-destructive" : "text-warning")}>• {x.text}</li>))}</ul>
              )}
            </div>
            <div role="radiogroup" className="grid gap-2">
              {(["draft", "live", "hidden"] as const).map((st) => {
                const on = slide.status === st, off = st === "live" && errs.length > 0;
                return (
                  <button key={st} type="button" role="radio" aria-checked={on} disabled={off || state === "saving"} onClick={() => !on && void setStatus(st)}
                    className={cn("flex items-start gap-2 rounded-lg border p-3 text-left disabled:cursor-not-allowed disabled:opacity-50",
                      on ? "border-primary bg-primary/5 ring-2 ring-primary/15" : "hover:bg-muted/40")}>
                    <IconTile size="sm" tone={on ? "accent" : "plain"}>{st === "live" ? <Smartphone /> : st === "draft" ? <Sparkles /> : <Trash2 />}</IconTile>
                    <span className="min-w-0">
                      <span className="block font-medium">{STATUS_LABEL[st]}</span>
                      <span className="block text-xs text-muted-foreground">{st === "live" ? (off ? "Önce hataları düzeltin." : "Bir sonraki yayınla telefonların haritasına iner.")
                        : st === "draft" ? "Üzerinde çalışıyorsunuz; yayına girmez." : "Yayınlardan çıkar, silinmez."}</span>
                    </span>
                  </button>
                );
              })}
              <Button asChild variant="outline" size="sm"><Link to="/yayinla">Yayınla sayfası</Link></Button>
            </div>
          </div>
        </Panel>
      </div>
    </>
  );
}
