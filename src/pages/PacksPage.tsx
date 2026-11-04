/**
 * İNDİRME PAKETLERİ (2026-10-17): the next part of the world, as one download.
 *
 * A pack is one or more of the roadmap's new rows and everything they need
 * -- the categories their stops open, those categories' games, films and
 * words (pictures and recordings), and the songs of their music stops. It is
 * NOT downloaded with the rest: when the child reaches the stop named here,
 * the map shows "a new adventure", and the phone downloads it only after a
 * grown-up says yes. The wizard asks for it all, step by step:
 *
 *   1 Paket      its name, as a parent sees it on the card
 *   2 İçerik     its rows, and for each stop: the category with its films,
 *                games and words, or the song -- every gap with a way to fix it
 *   3 Ne zaman   the stop at which it is offered
 *   4 Yayın      how big it is, and live or not
 */
import React from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { AlertTriangle, ArrowLeft, ArrowRight, Check, ChevronRight, Clock, Map as MapIcon,
         Package, Plus, Rocket, Smartphone, Trash2 } from "lucide-react";
import { codeOf, createPack, deletePack, getRoadmap, listPacks, patchPack, patchSlide,
         type Pack, type PackPatch, type RoadSlide, type RoadWorld, type Word } from "../api";
import { useCategories } from "../categories";
import { setGaps, useVocab } from "../vocab";
import { NEEDED_SLOTS } from "../types";
import { STOP_C, STOP_LABEL } from "../components/RoadWorld";
import { NewRow } from "./RoadmapPage";
import { EmptyState, FormField, IconTile, Loading, Modal, ModalActions, Notice, PageHeader, Panel, Pill, SaveChip, Select, TONE, fmtSize, type Tone } from "../components/common";
import { flushEdits, useAutosave } from "@/lib/autosave";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";

const STATUS_LABEL = { live: "Uygulamada", draft: "Taslak", hidden: "Gizli" } as const;
const MB = (b: number) => fmtSize(b) || "0 KB";

function useData() {
  const [packs, setPacks] = React.useState<Pack[] | null>(null);
  const [road, setRoad] = React.useState<{ world: RoadWorld | null; slides: RoadSlide[] } | null>(null);
  const [error, setError] = React.useState("");
  const load = React.useCallback(async () => {
    try { const [p, r] = await Promise.all([listPacks(), getRoadmap()]); setPacks(p); setRoad(r); setError(""); }
    catch (e) { setError((e as Error).message); }
  }, []);
  React.useEffect(() => { void load(); }, [load]);
  return { packs, road, error, load, setPacks };
}

/* ── the list ─────────────────────────────────────────────────────────────── */

export function PacksPage() {
  const { packs, road, error } = useData();
  const nav = useNavigate();
  const [making, setMaking] = React.useState(false);
  if (error) return <Notice tone="bad">{error}</Notice>;
  if (!packs || !road) return <Loading />;
  return (
    <>
      <PageHeader title="İndirme paketleri"
        sub="Haritanın bir sonraki parçası ve ihtiyaç duyduğu her şey tek bir indirme olarak: sıraları, kategorileri, oyunları, videoları, kelimeleri ve şarkıları. Paket herkese otomatik inmez: çocuk seçtiğiniz durağa gelince haritada “Yeni bir macera!” kartı çıkar ve bir büyük onaylarsa iner."
        actions={<Button onClick={() => setMaking(true)}><Plus data-icon="inline-start" />Yeni paket</Button>} />
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <section className="space-y-3">
          {packs.length === 0 ? (
            <EmptyState icon={<Package />} title="Henüz paket yok"
              sub="Bir paket haritanın bir ya da birkaç yeni sırasından oluşur. Önce paketi açın; sihirbaz sırayı, kategorileri, videoları ve şarkıları adım adım ister."
              action={<Button onClick={() => setMaking(true)}><Plus />İlk paketi oluştur</Button>} />
          ) : packs.map((p) => {
            const errs = p.issues.filter((i) => i.level === "error").length;
            return (
              <Link key={p.id} to={`/paketler/${p.id}`} className="group block rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
                <Card size="sm" className="flex-row items-center gap-4 px-4 transition-shadow group-hover:shadow-md">
                  <IconTile tone="accent" size="lg"><Package /></IconTile>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{p.title}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {p.lands.length} sıra · {p.categories.length} kategori · {MB(p.bytes)} · {p.offerAt ? `“${p.offerAt}” durağında sunulur` : "sunulma noktası yok"}
                    </div>
                  </div>
                  {errs ? <Pill tone="bad">{errs} hata</Pill> : <Pill tone="ok">hazır</Pill>}
                  <Pill tone={p.status === "live" ? "ok" : "plain"}>{STATUS_LABEL[p.status]}</Pill>
                  <ChevronRight className="size-4 text-muted-foreground" />
                </Card>
              </Link>
            );
          })}
        </section>
        <aside className="space-y-4">
          <Panel title="Telefonda ne olur">
            <ol className="list-decimal space-y-1.5 pl-4 text-sm text-muted-foreground">
              <li>Yayınla gelen pakette yalnız adı ve boyutu vardır; dosyaları <b className="font-medium text-foreground">inmez</b>.</li>
              <li>Çocuk seçtiğiniz durağa gelince haritada <b className="font-medium text-foreground">“Yeni bir macera!”</b> kartı çıkar: ad, durak sayısı, MB.</li>
              <li>“İndir” bir <b className="font-medium text-foreground">büyüğün onayını</b> ister: yazıyla bir çarpma — okumayı bilmeyen çocuk geçemez.</li>
              <li>Yer yoksa söylenir. İnerken ilerleme görünür; kesilirse kalan dosyalar sonra iner.</li>
              <li>Hepsi inip doğrulanınca sıraları haritaya eklenir; haritanın sonundaki çocuk yeni durağı açık bulur.</li>
              <li>Paket sonraki yayınlarda kendini günceller. Ebeveyn haritadaki “İndirilenler”den silebilir; ilerleme kalır.</li>
            </ol>
          </Panel>
        </aside>
      </div>
      {making && <NewPack onClose={() => setMaking(false)} onMade={(id) => nav(`/paketler/${id}`)} />}
    </>
  );
}

function NewPack({ onClose, onMade }: { onClose: () => void; onMade: (id: string) => void }) {
  const [title, setTitle] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const make = async () => {
    setBusy(true); setError("");
    try { const p = await createPack(title.trim()); onMade(p.id); }
    catch (e) { setError((e as Error).message); setBusy(false); }
  };
  return (
    <Modal title="Yeni paket" description="Sonra sihirbaz sıraları, kategorileri, videoları ve şarkıları adım adım isteyecek." onClose={onClose}>
      <FormField label="Adı" hint="Haritadaki kartta ebeveyne görünür (ör. “Deniz Ülkesi”).">
        <Input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && title.trim()) void make(); }} />
      </FormField>
      {error && <Notice tone="bad">{error}</Notice>}
      <ModalActions>
        <Button variant="ghost" onClick={onClose}>Vazgeç</Button>
        <Button disabled={!title.trim() || busy} onClick={make}>{busy && <Spinner data-icon="inline-start" />}Oluştur</Button>
      </ModalActions>
    </Modal>
  );
}

/* ── the wizard ───────────────────────────────────────────────────────────── */

type StepId = "paket" | "icerik" | "zaman" | "yayin";
const STEPS: { id: StepId; label: string; sub: string; icon: typeof Package }[] = [
  { id: "paket", label: "Paket", sub: "Adı, kartta görünen", icon: Package },
  { id: "icerik", label: "İçerik", sub: "Sıralar, kategoriler, videolar, şarkılar", icon: MapIcon },
  { id: "zaman", label: "Ne zaman", sub: "Hangi durakta sunulsun", icon: Clock },
  { id: "yayin", label: "Boyut ve yayın", sub: "Kaç MB, uygulamada mı", icon: Rocket },
];

export function PackEdit() {
  const { id } = useParams();
  const { packs, road, error, load, setPacks } = useData();
  const [gen, setGen] = React.useState(0);
  if (error) return <Notice tone="bad">{error}</Notice>;
  if (!packs || !road) return <Loading />;
  const pack = packs.find((p) => p.id === id);
  if (!pack) return <p className="text-sm text-muted-foreground">Paket bulunamadı. <Link className="text-primary hover:underline" to="/paketler">Listeye dön</Link></p>;
  return <Wizard key={`${pack.id}:${gen}`} pack={pack} road={road} reload={load} restart={async () => { await load(); setGen((g) => g + 1); }}
                 onSaved={(p) => setPacks((xs) => xs && xs.map((x) => (x.id === p.id ? p : x)))} />;
}

function Wizard({ pack, road, reload, restart, onSaved }: {
  pack: Pack; road: { world: RoadWorld | null; slides: RoadSlide[] }; reload: () => Promise<void>; restart: () => Promise<void>; onSaved: (p: Pack) => void;
}) {
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const at: StepId = STEPS.find((s) => s.id === params.get("adim"))?.id ?? "paket";
  const go = (s: StepId) => { setParams(s === "paket" ? {} : { adim: s }); window.scrollTo({ top: 0 }); };
  const base = React.useRef(pack.updatedAt);
  const [error, setError] = React.useState("");
  /* a conflict (F06): either start again from the server's version (`restart`),
     or read only its stamp and send this window's waiting edits over it */
  const [stale, setStale] = React.useState(false);
  const [mine, setMine] = React.useState(false);
  React.useEffect(() => {
    if (!mine) return;
    setMine(false); base.current = pack.updatedAt; setStale(false); void flushEdits();
  }, [mine, pack.updatedAt]); // eslint-disable-line react-hooks/exhaustive-deps
  const save = async (p: PackPatch): Promise<boolean> => {
    try { const out = await patchPack(pack.id, p, base.current); base.current = out.updatedAt; onSaved(out); setError(""); setStale(false); return true; }
    catch (e) {
      if (codeOf(e) === "STALE") setStale(true); else setError((e as Error).message);
      return false;
    }
  };
  const lands = road.slides.filter((s) => s.pack === pack.id);
  const errs = pack.issues.filter((i) => i.level === "error");
  const mark = (s: StepId): { tone: Tone; note: string } => {
    if (s === "paket") return pack.title.trim() ? { tone: "ok", note: "tamam" } : { tone: "plain", note: "ad gerekli" };
    if (s === "icerik") return !lands.length ? { tone: "plain", note: "sıra yok" }
      : lands.some((l) => l.issues.some((i) => i.level === "error")) || pack.categories.some((c) => c.status !== "live")
        ? { tone: "bad", note: "eksik var" } : { tone: "ok", note: `${lands.length} sıra · ${pack.categories.length} kategori` };
    if (s === "zaman") return pack.offerAt ? { tone: "ok", note: pack.offerAt } : { tone: "warn", note: "seçilmedi" };
    return errs.length ? { tone: "bad", note: `${errs.length} hata` } : { tone: pack.status === "live" ? "ok" : "accent", note: `${MB(pack.bytes)} · ${STATUS_LABEL[pack.status]}` };
  };
  const idx = STEPS.findIndex((s) => s.id === at);
  return (
    <>
      <PageHeader back={{ to: "/paketler", label: "İndirme paketleri" }} title={pack.title}
        meta={<>kimlik: {pack.id} · {lands.length} sıra · {MB(pack.bytes)}</>}
        actions={<>
          <Pill tone={pack.status === "live" ? "ok" : "plain"} className="h-6">{pack.status === "live" ? <Smartphone /> : null}{STATUS_LABEL[pack.status]}</Pill>
          <Button variant="ghost" size="icon" title="Paketi sil" className="hover:bg-destructive/10 hover:text-destructive" onClick={async () => {
            if (!confirm(`"${pack.title}" paketi silinsin mi? Sıraları ve kategorileri silinmez; paketsiz kalırlar.`)) return;
            await deletePack(pack.id); nav("/paketler");
          }}><Trash2 /></Button>
        </>} />
      {stale && <Notice tone="warn" className="mb-4" action={<>
        <Button size="sm" variant="outline" onClick={() => void restart()}>Sunucudakini yükle</Button>
        <Button size="sm" onClick={async () => { if (confirm("Başka yerde yapılan değişikliğin üstüne bu penceredeki yazılsın mı?")) { await reload(); setMine(true); } }}>Benimkini yaz</Button>
      </>}>Bu paket başka bir yerde değişti; değişikliğiniz yazılmadı ve ekranda duruyor.</Notice>}
      {error && <Notice tone="bad" className="mb-4">{error}</Notice>}
      <ol className="mb-6 grid grid-cols-2 gap-2 md:grid-cols-4">
        {STEPS.map((s, i) => {
          const m = mark(s.id), here = s.id === at;
          return (
            <li key={s.id}>
              <button type="button" onClick={() => go(s.id)} aria-current={here ? "step" : undefined}
                className={cn("flex h-full w-full items-center gap-3 rounded-xl border bg-card p-3 text-left transition-colors",
                  here ? "border-primary ring-3 ring-primary/15" : "hover:bg-muted/40")}>
                <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold", here ? "bg-primary text-primary-foreground" : TONE[m.tone])}>
                  {m.tone === "ok" && !here ? <Check className="size-4" /> : m.tone === "bad" && !here ? <AlertTriangle className="size-4" /> : i + 1}</span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{s.label}</span>
                  <span className={cn("block truncate text-xs", m.tone === "bad" ? "text-destructive" : m.tone === "warn" ? "text-warning" : "text-muted-foreground")}>{m.note}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>

      {at === "paket" && <InfoStep pack={pack} save={save} />}
      {at === "icerik" && <ContentStep pack={pack} road={road} lands={lands} reload={reload} />}
      {at === "zaman" && <WhenStep pack={pack} road={road} lands={lands} save={save} />}
      {at === "yayin" && <PublishStep pack={pack} save={save} />}

      <div className="mt-8 flex items-center justify-between border-t pt-4">
        {idx > 0 ? <Button variant="outline" onClick={() => go(STEPS[idx - 1]!.id)}><ArrowLeft data-icon="inline-start" />{STEPS[idx - 1]!.label}</Button> : <span />}
        {idx < STEPS.length - 1
          ? <Button onClick={() => go(STEPS[idx + 1]!.id)}>Devam: {STEPS[idx + 1]!.label}<ArrowRight data-icon="inline-end" /></Button>
          : <Button asChild variant="outline"><Link to="/yayinla"><Rocket data-icon="inline-start" />Yayınla sayfası</Link></Button>}
      </div>
    </>
  );
}

/* 1 · the pack: its name, as a parent sees it */
function InfoStep({ pack, save }: { pack: Pack; save: (p: PackPatch) => Promise<boolean> }) {
  const [d, setD] = React.useState({ title: pack.title, subtitle: pack.subtitle, note: pack.note });
  const auto = useAutosave(d, (v) => save({ title: v.title.trim(), subtitle: v.subtitle.trim(), note: v.note }),
                           { ms: 600, skip: (v) => !v.title.trim(), label: `Paket “${pack.title}” bilgisi` });
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
      <Card><CardContent className="space-y-5">
        <div className="flex justify-end"><SaveChip state={auto.state} /></div>
        <FormField label="Adı" hint="Haritadaki kartta: “Yeni bir macera! {ad}”."><Input value={d.title} onChange={(e) => setD({ ...d, title: e.target.value })} /></FormField>
        <FormField label="Kısa açıklama" hint="Kartta adın altında, ebeveyn için (ör. “yeni bir sahil, üç oyun ve bir şarkı”)."><Input value={d.subtitle} onChange={(e) => setD({ ...d, subtitle: e.target.value })} /></FormField>
        <FormField label="Not (yalnız panelde)"><Textarea value={d.note} onChange={(e) => setD({ ...d, note: e.target.value })} placeholder="Bu paket neyi getiriyor, ne zaman çıkacak?" /></FormField>
      </CardContent></Card>
      <OfferCardPreview title={d.title} subtitle={d.subtitle} stops={0} bytes={pack.bytes} />
    </div>
  );
}

/** the card a phone will show on the map */
function OfferCardPreview({ title, subtitle, stops, bytes }: { title: string; subtitle: string; stops: number; bytes: number }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3 rounded-3xl border-b-[6px] border-[#E3CFAF] bg-[#FFFDF7] p-4 text-[#3B2C63] shadow-sm ring-1 ring-foreground/10">
        <div className="flex size-14 shrink-0 items-center justify-center rounded-full bg-[#DDF1FB]"><MapIcon className="size-6 text-[#2F6DB5]" /></div>
        <div className="min-w-0 flex-1">
          <div className="truncate font-heading font-bold">Yeni bir macera! {title || "…"}</div>
          <div className="truncate text-sm opacity-70">{subtitle ? `${subtitle} · ` : ""}{stops || "…"} durak · {Math.max(1, Math.round(bytes / 1048576))} MB</div>
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="rounded-full bg-[#6B3FBF] px-4 py-1.5 text-sm font-bold text-white">İndir</span>
          <span className="rounded-full bg-white px-4 py-1.5 text-center text-sm font-bold ring-1 ring-[#D9C8AE]">Sonra</span>
        </div>
      </div>
      <p className="flex items-center gap-1 text-xs text-muted-foreground"><Smartphone className="size-3" /> Telefonda haritanın altında böyle görünür</p>
    </div>
  );
}

/* 2 · what is in it: rows, and for each stop everything it needs */
function ContentStep({ pack, road, lands, reload }: {
  pack: Pack; road: { world: RoadWorld | null; slides: RoadSlide[] }; lands: RoadSlide[]; reload: () => Promise<void>;
}) {
  const nav = useNavigate();
  const { categories } = useCategories();
  const { sets, wordOf } = useVocab();
  const free = road.slides.filter((s) => !s.pack);
  const [adding, setAdding] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const attach = async (sid: string, packId: string | null) => {
    const s = road.slides.find((x) => x.id === sid);
    if (!s) return;
    setBusy(true);
    try { await patchSlide(sid, { pack: packId }, s.updatedAt); await reload(); } catch (e) { alert((e as Error).message); }
    setBusy(false);
  };
  const [making, setMaking] = React.useState(false);
  /* everything a category needs, as a list with a way to fix each */
  const catChecks = (cid: string): { ok: boolean; warn?: boolean; text: string; to: string }[] => {
    const c = categories.find((x) => x.id === cid);
    if (!c) return [{ ok: false, text: "kategori yok", to: "/kategoriler" }];
    const steps = c.steps;
    const vids = steps.filter((s) => s.kind === "video");
    const filled = vids.filter((s) => s.kind === "video" && s.video).length;
    const games = steps.filter((s) => s.kind === "game");
    const chosen = games.filter((s) => s.kind === "game" && s.game).length;
    const set = sets.find((x) => x.id === c.set);
    const words = (set?.words ?? []).map(wordOf).filter((w): w is Word => !!w);
    const g = setGaps(words, NEEDED_SLOTS.map((x) => x.id));
    return [
      { ok: c.status === "live", text: c.status === "live" ? "uygulamada" : "uygulamada değil (Kontrol ve yayın adımı)", to: `/kategoriler/${c.id}?adim=yayin` },
      { ok: filled === vids.length, warn: true, text: `videolar ${filled}/${vids.length}`, to: `/kategoriler/${c.id}?adim=akis` },
      { ok: chosen === games.length && games.length > 0, text: `oyunlar ${chosen}/${games.length}`, to: `/kategoriler/${c.id}?adim=akis` },
      { ok: words.length >= 2 && g.icons === 0, text: `${words.length} kelime · ${g.icons ? `${g.icons} resim eksik` : "resimler tamam"}`, to: `/kategoriler/${c.id}?adim=kelimeler` },
      { ok: g.sounds === 0, warn: true, text: g.sounds ? `${g.sounds} kayıt eksik (telefon cihaz sesiyle okur)` : "kayıtlar tamam", to: "/ses-studyosu" },
    ];
  };
  return (
    <div className="space-y-4">
      <Notice tone="accent">Bir paket haritanın sonuna eklenecek bir ya da birkaç sıradır. Her sıranın durakları bir kategorinin oyunlarını açar ya da bir şarkı çalar.
        Burada hepsinin hazır olup olmadığını görür, eksik olana tek tıkla gidersiniz.</Notice>
      {lands.length === 0 && <EmptyState icon={<MapIcon />} title="Pakette sıra yok"
        sub="Bir kategoriden yeni bir sıra oluşturup bu pakete ekleyin ya da Yol haritası'nda hazırladığınız paketsiz bir sırayı seçin." />}
      {lands.map((l) => (
        <Card key={l.id}>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="min-w-0 flex-1">
                <div className="font-medium">{l.title} <span className="text-xs font-normal text-muted-foreground">· {l.stops.length} durak · {categories.find((c) => c.id === l.category)?.title ?? "kategori yok"}</span></div>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  <Pill tone={l.status === "live" ? "ok" : "plain"}>{STATUS_LABEL[l.status]}</Pill>
                  {l.issues.filter((i) => i.level === "error").length > 0 && <Pill tone="bad">{l.issues.filter((i) => i.level === "error").length} hata</Pill>}
                </div>
              </div>
              <Button asChild variant="outline" size="sm"><Link to={`/yol-haritasi/${l.id}`}>Sırayı düzenle<ChevronRight /></Link></Button>
              <Button variant="ghost" size="sm" disabled={busy} onClick={() => void attach(l.id, null)}>Paketten çıkar</Button>
            </div>
            {l.stops.length === 0 ? <p className="text-sm text-muted-foreground">Bu sırada durak yok: sıra düzenleyicisinde bir kategori seçin.</p> : (
              <ul className="space-y-2">
                {l.stops.map((st) => (
                  <li key={st.id} className="rounded-lg border p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="flex size-7 items-center justify-center rounded-full text-xs font-bold text-white" style={{ background: STOP_C[st.kind] }}>{STOP_LABEL[st.kind]}</span>
                      <span className="font-medium">{st.kind === "music" ? "Müzik durağı" : categories.find((c) => c.id === st.category)?.title ?? "kategori seçilmedi"}</span>
                      <code className="text-xs text-muted-foreground">{st.id}</code>
                    </div>
                    {st.kind === "music" ? (
                      <div className="mt-2 flex items-center gap-2 text-sm">
                        {st.song ? <><Check className="size-4 text-success" /> şarkı yüklü</> : <><AlertTriangle className="size-4 text-destructive" /> şarkı yok</>}
                        {!st.song && <Button asChild variant="link" size="sm" className="h-auto px-1"><Link to={`/yol-haritasi/${l.id}`}>yükle</Link></Button>}
                      </div>
                    ) : st.category ? (
                      <ul className="mt-2 grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
                        {catChecks(st.category).map((c, k) => (
                          <li key={k}>
                            <Link to={c.to} className={cn("flex items-center gap-1.5 rounded-md px-2 py-1 text-sm hover:bg-muted",
                              c.ok ? "text-success" : c.warn ? "text-warning" : "text-destructive")}>
                              {c.ok ? <Check className="size-3.5" /> : <AlertTriangle className="size-3.5" />}{c.text}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      ))}
      <Card><CardContent className="flex flex-wrap items-end gap-2">
        <Button onClick={() => setMaking(true)}><Plus data-icon="inline-start" />Yeni sıra oluştur ve ekle</Button>
        <span className="text-sm text-muted-foreground">ya da</span>
        <FormField label="Hazır bir sırayı ekle" className="min-w-[220px] flex-1">
          <Select value={adding} onChange={(e) => setAdding(e.target.value)}>
            <option value="">— paketsiz sıralar —</option>
            {free.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
          </Select>
        </FormField>
        <Button variant="outline" disabled={!adding || busy} onClick={() => { void attach(adding, pack.id); setAdding(""); }}>Pakete ekle</Button>
        <Button asChild variant="ghost"><Link to="/kategoriler/yeni"><Plus data-icon="inline-start" />Yeni kategori</Link></Button>
      </CardContent></Card>
      {pack.issues.length > 0 && <Notice tone={pack.issues.some((i) => i.level === "error") ? "bad" : "warn"} icon={<AlertTriangle />}>
        <ul className="space-y-0.5">{pack.issues.map((x, k) => <li key={k}>{x.text}</li>)}</ul></Notice>}
      {making && <NewRow categories={categories.filter((c) => !c.builtin)} pack={pack.id} onClose={() => setMaking(false)}
                         onMade={(id) => nav(`/yol-haritasi/${id}`)} />}
    </div>
  );
}

/* 3 · when it is offered: a stop of the world before it */
function WhenStep({ pack, road, lands, save }: {
  pack: Pack; road: { world: RoadWorld | null; slides: RoadSlide[] }; lands: RoadSlide[]; save: (p: PackPatch) => Promise<boolean>;
}) {
  const firstLand = road.slides.findIndex((s) => s.id === lands[0]?.id);
  const before = firstLand >= 0 ? road.slides.slice(0, firstLand) : road.slides.filter((s) => s.pack !== pack.id);
  const groups = [
    /* the app's own rows, by their categories' titles, then the rows made here */
    ...(road.world?.rows ?? []).map((r) => ({ label: r.title, stops: r.stops })),
    ...before.map((s) => ({ label: `${s.title} (yeni sıra)`, stops: s.stops })),
  ];
  const name = (k: string) => (k === "music" ? "müzik" : `${k}. oyun`);
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
      <Panel title="Hangi durağa gelince sunulsun?" icon={<Clock />}
             description="Çocuk bu durağa ulaştığında (açıldığında) haritada kart çıkar. Önerilen: paketin hemen öncesindeki bölümün sonlarına doğru — örneğin 4. kategoriye gelince 5. ve 6.'yı sunmak.">
        <div className="space-y-4">
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" name="offer" checked={!pack.offerAt} onChange={() => void save({ offerAt: null })} />
            Hemen (uygulama açılır açılmaz)
          </label>
          {groups.map((g) => (
            <div key={g.label}>
              <div className="mb-1.5 text-xs font-medium text-muted-foreground">{g.label}</div>
              <div className="flex flex-wrap gap-1.5">
                {g.stops.map((s) => (
                  <button key={s.id} type="button" onClick={() => void save({ offerAt: s.id })}
                    className={cn("rounded-full border px-3 py-1 text-sm transition-colors", pack.offerAt === s.id ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted")}>
                    {name(s.kind)}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Panel>
      <aside className="space-y-4">
        <Panel title="Böyle olacak">
          <p className="text-sm text-muted-foreground">
            {pack.offerAt ? <>Çocuk <b className="font-medium text-foreground">{pack.offerAt}</b> durağına gelince </> : <>Uygulama açılınca </>}
            haritada <b className="font-medium text-foreground">“Yeni bir macera! {pack.title}”</b> kartı çıkar. Bir büyük onaylarsa paket iner ve
            sıraları haritanın sonuna eklenir. “Sonra” denirse bir sonraki açılışta yeniden sorulur; ebeveyn “İndirilenler”den de indirebilir.</p>
        </Panel>
        <Notice>Öncesindeki paket inmemiş bir telefona bu paket sunulmaz: sıralar zincirdir.</Notice>
      </aside>
    </div>
  );
}

/* 4 · how big, and live */
function PublishStep({ pack, save }: { pack: Pack; save: (p: PackPatch) => Promise<boolean> }) {
  const errs = pack.issues.filter((i) => i.level === "error");
  const stops = pack.lands.reduce((n, l) => n + l.stops, 0);
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
      <div className="space-y-4">
        <Panel title="Boyut" description="Telefonun bu pakete onay verince indireceği: yalnız pakete ait dosyalar (herkese zaten inenler sayılmaz).">
          <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border bg-border text-center sm:grid-cols-4">
            {([["Toplam", pack.bytes], ["Videolar", pack.sizes.video], ["Resimler", pack.sizes.image], ["Sesler", pack.sizes.audio]] as const).map(([k, v]) => (
              <div key={k} className="bg-card p-3"><dd className="font-heading text-lg font-semibold tabular-nums">{MB(v)}</dd><dt className="text-xs text-muted-foreground">{k}</dt></div>
            ))}
          </dl>
          <p className="mt-3 text-xs text-muted-foreground">{pack.files} dosya · videolar 2–4 Mbps ile dışa aktarılırsa paket küçülür. 150 MB'ın üstü mobil veride uzun sürer.</p>
        </Panel>
        <Panel title="Kontrol">
          {pack.issues.length === 0 ? <p className="flex items-center gap-2 text-sm text-success"><Check className="size-4" />Eksik bir şey yok.</p> : (
            <ul className="space-y-1">{pack.issues.map((x, k) => <li key={k} className={cn("text-sm", x.level === "error" ? "font-medium text-destructive" : "text-warning")}>• {x.text}</li>)}</ul>
          )}
        </Panel>
        <Panel title="Durum" description="“Uygulamada” işaretli paket bir sonraki yayınla telefonlara listelenir; dosyaları yine yalnız onayla iner.">
          <div role="radiogroup" className="grid gap-2 sm:grid-cols-3">
            {(["draft", "live", "hidden"] as const).map((st) => {
              const on = pack.status === st, off = st === "live" && errs.length > 0;
              return (
                <button key={st} type="button" role="radio" aria-checked={on} disabled={off} onClick={() => !on && void save({ status: st })}
                  className={cn("rounded-lg border p-3 text-left disabled:cursor-not-allowed disabled:opacity-50", on ? "border-primary bg-primary/5 ring-2 ring-primary/15" : "hover:bg-muted/40")}>
                  <div className="flex items-center gap-1.5 font-medium">{STATUS_LABEL[st]}{on && <Check className="ml-auto size-4 text-primary" />}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{off ? "Önce hataları düzeltin." : st === "live" ? "Sunulur, onayla iner." : st === "draft" ? "Üzerinde çalışıyorsunuz." : "Yayınlardan çıkar."}</div>
                </button>
              );
            })}
          </div>
        </Panel>
      </div>
      <aside className="space-y-4">
        <OfferCardPreview title={pack.title} subtitle={pack.subtitle} stops={stops} bytes={pack.bytes} />
        <Panel title="Sonra">
          <ol className="list-decimal space-y-1.5 pl-4 text-sm">
            <li>Paketin sıraları ve kategorileri de “Uygulamada” olmalı.</li>
            <li><Link to="/yayinla" className="font-medium text-primary hover:underline">Yayınla</Link>: önce test kanalına.</li>
            <li>Test telefonunda sunulma durağına gelin (geliştirme sürümünde “DEV · gezinti” ile), kartı görün, indirin, oynayın.</li>
            <li>Sonra üretime alın.</li>
          </ol>
        </Panel>
      </aside>
    </div>
  );
}
