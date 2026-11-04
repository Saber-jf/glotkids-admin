/**
 * A CATEGORY, STEP BY STEP (the wizard).
 *
 * A category is four things, in this order, and the page walks them one at a
 * time -- each step says whether it is done, and what is still missing:
 *
 *   1 Kart        title, subtitle and the picture the child picks it by
 *   2 Kelimeler   its word set (5–7 words): every game in it plays these
 *   3 Akış        what the child walks through -- opening film, game, film,
 *                 game, film, game, the end -- each film uploaded and seen
 *                 in a phone's and a tablet's frame
 *   4 Yayın       is it ready, how big is it, and how it reaches phones
 *
 * Every change is saved a moment after it is made (`categories.tsx`, the
 * queue outlives this page), and the server answers with what is still wrong
 * -- each issue names the step it belongs to (`area`). A new category is
 * created at the end of step 1 (`CategoryNew`) and continues here.
 */
import React from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { AlertTriangle, ArrowDown, ArrowLeft, ArrowRight, ArrowUp, BookA, Check, CheckCircle2, ChevronRight, Clapperboard,
         CloudOff, EyeOff, Film, FolderTree, Gamepad2, ImageIcon, Lock, Plus, Rocket, Smartphone, Sparkles, Trash2 } from "lucide-react";
import { GameIcon, STATUS_LABEL, WordTile } from "../components/GameParts";
import { Slot } from "../components/Media";
import { SetReadiness, SetWordList } from "../components/SetWords";
import { VideoSlot, type Fit } from "../components/VideoSlot";
import { FormField, IconTile, Loading, Notice, PageHeader, Panel, Pill, Select, TONE, fmtSize, type Tone } from "../components/common";
import { getRoadmap, listPacks, type CatalogGame, type FlowIssue, type FlowStep, type Pack, type RoadSlide, type ServerCategory } from "../api";
import { useCategories, type SaveState } from "../categories";
import { isTemplate, useGames } from "../games";
import { ROLE_LABEL } from "../types";
import { useVocab } from "../vocab";
import { StepChip } from "./Categories";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";

/* ── the four steps ───────────────────────────────────────────────────────── */

type StepId = "kart" | "kelimeler" | "akis" | "yayin";
const STEPS: { id: StepId; label: string; sub: string; icon: typeof Film }[] = [
  { id: "kart", label: "Kart", sub: "Adı ve resmi", icon: ImageIcon },
  { id: "kelimeler", label: "Kelimeler", sub: "Serinin kelime seti", icon: BookA },
  { id: "akis", label: "Akış", sub: "Videolar ve oyunlar", icon: Film },
  { id: "yayin", label: "Kontrol ve yayın", sub: "Hazır mı, telefona nasıl gider", icon: Rocket },
];
/** an issue's step: the server names it; an older server did not (then: the flow) */
const areaOf = (i: FlowIssue): StepId => (i.area === "card" ? "kart" : i.area === "words" ? "kelimeler" : "akis");

type Mark = "done" | "warn" | "error" | "todo";
interface StepState { mark: Mark; note: string }

function stepStates(d: Draft, issues: FlowIssue[], hasIcon: boolean): Record<StepId, StepState> {
  const of = (s: StepId) => issues.filter((i) => areaOf(i) === s);
  const mark = (s: StepId, ok: boolean, todo: string): StepState => {
    const xs = of(s);
    const errs = xs.filter((i) => i.level === "error").length, warns = xs.length - errs;
    if (!ok) return { mark: "todo", note: todo };
    if (errs) return { mark: "error", note: `${errs} hata` };
    if (warns) return { mark: "warn", note: `${warns} uyarı` };
    return { mark: "done", note: "tamam" };
  };
  const videos = d.steps.filter((s) => s.kind === "video");
  const filled = videos.filter((s) => s.kind === "video" && s.video).length;
  const all = issues.filter((i) => i.level === "error").length;
  return {
    kart: mark("kart", !!d.title.trim(), "başlık gerekli"),
    kelimeler: mark("kelimeler", !!d.set, "set seçilmedi"),
    akis: { ...mark("akis", true, ""), ...(videos.length && filled < videos.length && !of("akis").some((i) => i.level === "error")
      ? { mark: "warn" as Mark, note: `${filled}/${videos.length} video` } : {}) },
    yayin: all ? { mark: "error", note: `${all} hata yayını durdurur` }
      : hasIcon ? { mark: "done", note: "yayına hazır" } : { mark: "warn", note: "hazır · kart resmi yok" },
  };
}

function Stepper({ at, states, onGo, locked }: {
  at: StepId; states: Record<StepId, StepState> | null; onGo: (s: StepId) => void; locked?: boolean;
}) {
  return (
    <ol className="mb-6 grid grid-cols-2 gap-2 md:grid-cols-4">
      {STEPS.map((s, i) => {
        const st = states?.[s.id];
        const here = s.id === at;
        const tone: Tone = !st ? "plain" : st.mark === "done" ? "ok" : st.mark === "error" ? "bad" : st.mark === "warn" ? "warn" : "plain";
        return (
          <li key={s.id}>
            <button type="button" disabled={locked && !here} onClick={() => onGo(s.id)} aria-current={here ? "step" : undefined}
              className={cn("flex h-full w-full items-center gap-3 rounded-xl border bg-card p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                here ? "border-primary ring-3 ring-primary/15" : "hover:bg-muted/40")}>
              <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold",
                here ? "bg-primary text-primary-foreground" : TONE[tone])}>
                {st?.mark === "done" && !here ? <Check className="size-4" /> : st?.mark === "error" && !here ? <AlertTriangle className="size-4" /> : i + 1}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{s.label}</span>
                <span className={cn("block truncate text-xs", st && st.mark !== "todo" && st.mark !== "done" ? (st.mark === "error" ? "text-destructive" : "text-warning") : "text-muted-foreground")}>
                  {st ? st.note : s.sub}</span>
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

/** how the card looks in the app's Kategoriler tab */
function CardPreview({ title, subtitle, icon }: { title: string; subtitle: string; icon: string | null }) {
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="w-44 rounded-2xl border-b-4 border-primary/30 bg-card p-4 text-center shadow-sm ring-1 ring-foreground/10">
        <div className="mx-auto mb-2 w-fit"><GameIcon icon={icon} size={88} /></div>
        <div className="truncate font-heading font-semibold">{title || "Başlık"}</div>
        <div className="truncate text-xs text-muted-foreground">{subtitle || "alt başlık"}</div>
      </div>
      <span className="flex items-center gap-1 text-xs text-muted-foreground"><Smartphone className="size-3" /> Uygulamada · Kategoriler sekmesi</span>
    </div>
  );
}

/* ── a new category: step 1, then the wizard ──────────────────────────────── */

export function CategoryNew() {
  const { create } = useCategories();
  const nav = useNavigate();
  const [title, setTitle] = React.useState("");
  const [subtitle, setSubtitle] = React.useState("");
  const [icon, setIcon] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const make = async () => {
    setBusy(true); setError("");
    try {
      const c = await create({ title: title.trim(), subtitle: subtitle.trim(), icon });
      nav(`/kategoriler/${c.id}?adim=kelimeler`);
    } catch (e) { setError((e as Error).message); setBusy(false); }
  };
  return (
    <>
      <PageHeader title="Yeni kategori" back={{ to: "/kategoriler", label: "Kategoriler" }}
        sub="Dört adımda: kart, kelimeler, akış (videolar ve oyunlar), kontrol ve yayın. Her adım bir öncekinin üstüne kurulur; istediğiniz zaman geri dönüp değiştirebilirsiniz." />
      <Stepper at="kart" states={null} onGo={() => {}} locked />
      <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
        <Card>
          <CardContent className="space-y-5">
            <FormField label="Başlık" hint="Uygulamanın Kategoriler sekmesindeki kartta görünür.">
              <Input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="ör. Deniz Dünyası"
                     onKeyDown={(e) => { if (e.key === "Enter" && title.trim() && !busy) void make(); }} />
            </FormField>
            <FormField label="Alt başlık" hint="Kısa bir satır: kaç kelime, ne yapılıyor.">
              <Input value={subtitle} onChange={(e) => setSubtitle(e.target.value)} placeholder="ör. altı deniz canlısı, üç oyun" />
            </FormField>
            <FormField label="Kart resmi" hint="Okumayı bilmeyen çocuk kategoriyi resimden seçer. Kare, şeffaf PNG. Sonra da eklenebilir.">
              <Slot kind="image" value={icon ?? undefined} onChange={(v) => setIcon(v ?? null)} />
            </FormField>
            {error && <Notice tone="bad">{error}</Notice>}
            <div className="flex justify-end border-t pt-4">
              <Button disabled={!title.trim() || busy} onClick={make}>
                {busy ? <Spinner data-icon="inline-start" /> : null}Oluştur ve kelimelere geç<ArrowRight data-icon="inline-end" />
              </Button>
            </div>
          </CardContent>
        </Card>
        <aside className="space-y-4">
          <CardPreview title={title} subtitle={subtitle} icon={icon} />
          <Notice tone="accent">Kategori taslak olarak açılır: üç oyunu hazır gelir (Lili'ye ver → Bul bakalım → tekrar), siz kelimeleri ve videoları verirsiniz. Telefonlara ancak siz “Uygulamada” yapıp yayınladığınızda gider.</Notice>
        </aside>
      </div>
    </>
  );
}

/* ── an existing category ─────────────────────────────────────────────────── */

export function CategoryFlow() {
  const { id } = useParams();
  const { categories, loading } = useCategories();
  const c = categories.find((x) => x.id === id);
  if (loading) return <Loading />;
  if (!c) return <p className="text-sm text-muted-foreground">Kategori bulunamadı. <Link className="text-primary underline-offset-4 hover:underline" to="/kategoriler">Listeye dön</Link></p>;
  return <Flow key={c.id} cat={c} />;
}

type Draft = Pick<ServerCategory, "title" | "subtitle" | "icon" | "set" | "steps">;

function Flow({ cat }: { cat: ServerCategory }) {
  const { remove, pending, edit, flush, resolve, recovered, restore, dismiss } = useCategories();
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const at: StepId = (STEPS.find((s) => s.id === params.get("adim"))?.id) ?? "kart";
  const go = (s: StepId) => { setParams(s === "kart" ? {} : { adim: s }); window.scrollTo({ top: 0 }); };
  const ro = cat.builtin;
  const mine = pending[cat.id];
  /* the editor opens on what is waiting to be saved, if anything: the queue
     (`categories.tsx`) holds drafts across pages, so coming back finds them */
  const [d, setD] = React.useState<Draft>(() => {
    const b = mine?.body;
    return { title: b?.title ?? cat.title, subtitle: b?.subtitle ?? cat.subtitle, icon: b?.icon !== undefined ? b.icon : cat.icon,
             set: b?.set !== undefined ? b.set : cat.set, steps: b?.steps ?? cat.steps };
  });
  const state: SaveState = mine?.state ?? "saved";
  const message = mine?.message ?? "";
  /* the checks are the server's, for what it has SAVED; while a newer draft
     is on its way they are last-known */
  const issues: FlowIssue[] = cat.issues;
  const errs = issues.filter((i) => i.level === "error");

  const body = (x: Draft) => ({ ...x, title: x.title.trim() || cat.title, subtitle: x.subtitle.trim() });
  /* every CHANGE goes to the queue; it is saved a moment later even if this
     page is gone (A01). Only a change: opening the page (or React running an
     effect twice in development) sends nothing (A02) */
  const sent = React.useRef(JSON.stringify(body(d)));
  React.useEffect(() => {
    if (ro) return;
    const now = JSON.stringify(body(d));
    if (now === sent.current) return;
    sent.current = now;
    edit(cat.id, body(d));
  }, [d]); // eslint-disable-line react-hooks/exhaustive-deps
  /* the status rides in the same queue as the body, sent at once and waited for */
  const setStatus = async (status: ServerCategory["status"]) => {
    edit(cat.id, { ...body(d), status }, { now: true });
    if (!(await flush(cat.id))) alert("Durum değiştirilemedi; nedeni sayfanın üstünde yazıyor (hatası olan kategori “Uygulamada” yapılamaz).");
  };
  const status = mine?.body.status ?? cat.status;
  const states = stepStates(d, issues, !!d.icon);
  const idx = STEPS.findIndex((s) => s.id === at);

  return (
    <>
      <PageHeader title={d.title || "…"} back={{ to: "/kategoriler", label: "Kategoriler" }} lead={<GameIcon icon={d.icon} size={48} />}
        meta={<>kimlik: {cat.id} · {cat.words.length} kelime · {d.steps.length} adım
          {!ro && cat.download ? <> · telefona ≈{fmtSize(cat.download)}</> : null}</>}
        actions={<>
          {ro ? <Pill><Lock /> Uygulamada yerel · yalnızca gösterim</Pill> : <SaveBadge state={state} />}
          <StatusPill status={status} />
          {!ro && <Button variant="ghost" size="icon" title="Kategoriyi sil" className="hover:bg-destructive/10 hover:text-destructive" onClick={async () => {
            if (!confirm(`"${cat.title}" silinsin mi? Kelimeleri, seti ve videoları kütüphanede kalır.`)) return;
            try { await remove(cat.id); nav("/kategoriler"); } catch (e) { alert((e as Error).message); }
          }}><Trash2 /></Button>}
        </>} />
      {state === "error" && <Notice tone="bad" icon={<CloudOff />} className="mb-4"><b className="font-medium">Kaydedilemedi: {message}</b> Taslak bu pencerede duruyor; sunucu dönünce yeniden denenir.</Notice>}
      {state === "conflict" && (
        <Notice tone="warn" icon={<AlertTriangle />} className="mb-4" action={<>
          <Button variant="outline" size="sm" onClick={async () => {
            const t = mine?.theirs;
            await resolve(cat.id, "theirs");
            if (t) { const n = { title: t.title, subtitle: t.subtitle, icon: t.icon, set: t.set, steps: t.steps };
                     sent.current = JSON.stringify(body(n)); setD(n); }
          }}>Sunucudakini al</Button>
          <Button size="sm" onClick={() => void resolve(cat.id, "mine")}>Benimkini üstüne yaz</Button>
        </>}>
          Bu kategori başka bir yerde (başka bir sekmede) değişti. Taslağınız silinmedi. Sunucudaki:
          “{mine?.theirs?.title ?? "?"}”, {mine?.theirs?.steps.length ?? "?"} adım.
        </Notice>
      )}
      {recovered[cat.id] && !mine && (
        <Notice tone="accent" className="mb-4" action={<>
          <Button variant="outline" size="sm" onClick={() => dismiss(cat.id)}>At</Button>
          <Button size="sm" onClick={() => { const r = recovered[cat.id]!; restore(cat.id);
            setD((x) => { const n = { ...x, ...(r.body as Partial<Draft>) }; sent.current = JSON.stringify(body(n)); return n; }); }}>Geri yükle</Button>
        </>}>
          Bu tarayıcıda kaydedilmemiş bir taslak bulundu ({new Date(recovered[cat.id]!.at).toLocaleString("tr")}).
        </Notice>
      )}

      <Stepper at={at} states={states} onGo={go} />

      <fieldset disabled={ro} className="min-w-0">
        {at === "kart" && <CardStep d={d} setD={setD} ro={ro} issues={issues.filter((i) => areaOf(i) === "kart")} />}
        {at === "kelimeler" && <WordsStep d={d} setD={setD} cat={cat} ro={ro} issues={issues.filter((i) => areaOf(i) === "kelimeler")} />}
        {at === "akis" && <FlowStepPage d={d} setD={setD} ro={ro} issues={issues} />}
        {at === "yayin" && <PublishStep cat={cat} d={d} ro={ro} states={states} issues={issues} status={status}
                                        canLive={errs.length === 0} saving={state !== "saved"} onStatus={setStatus} onGo={go} />}
      </fieldset>

      <div className="mt-8 flex items-center justify-between border-t pt-4">
        {idx > 0 ? <Button variant="outline" onClick={() => go(STEPS[idx - 1]!.id)}><ArrowLeft data-icon="inline-start" />{STEPS[idx - 1]!.label}</Button> : <span />}
        {idx < STEPS.length - 1
          ? <Button onClick={() => go(STEPS[idx + 1]!.id)}>Devam: {STEPS[idx + 1]!.label}<ArrowRight data-icon="inline-end" /></Button>
          : <Button asChild variant="outline"><Link to="/yayinla"><Rocket data-icon="inline-start" />Yayınla sayfası</Link></Button>}
      </div>
    </>
  );
}

function SaveBadge({ state }: { state: SaveState }) {
  if (state === "saving") return <Pill tone="accent" className="h-6"><Spinner /> Kaydediliyor</Pill>;
  if (state === "dirty") return <Pill className="h-6">Değişti</Pill>;
  if (state === "error") return <Pill tone="bad" className="h-6"><CloudOff /> Kaydedilemedi</Pill>;
  if (state === "conflict") return <Pill tone="warn" className="h-6"><AlertTriangle /> Çakışma</Pill>;
  return <Pill tone="ok" className="h-6"><CheckCircle2 /> Kaydedildi</Pill>;
}

function StatusPill({ status }: { status: ServerCategory["status"] }) {
  return <Pill tone={status === "live" ? "ok" : status === "draft" ? "plain" : "plain"} className="h-6">
    {status === "live" ? <Smartphone /> : status === "hidden" ? <EyeOff /> : null}{STATUS_LABEL[status]}</Pill>;
}

function Issues({ list, className }: { list: FlowIssue[]; className?: string }) {
  if (!list.length) return null;
  const errs = list.filter((i) => i.level === "error");
  return (
    <Notice tone={errs.length ? "bad" : "warn"} icon={<AlertTriangle />} className={className}>
      <ul className="space-y-0.5">{list.map((x, i) => <li key={i}>{x.text}</li>)}</ul>
    </Notice>
  );
}

type SetD = React.Dispatch<React.SetStateAction<Draft>>;

/* ── 1 · the card ─────────────────────────────────────────────────────────── */

function CardStep({ d, setD, ro, issues }: { d: Draft; setD: SetD; ro: boolean; issues: FlowIssue[] }) {
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
      <Card>
        <CardContent className="space-y-5">
          <FormField label="Başlık" hint="Uygulamanın Kategoriler sekmesindeki kartta."><Input value={d.title} onChange={(e) => setD({ ...d, title: e.target.value })} /></FormField>
          <FormField label="Alt başlık"><Input value={d.subtitle} onChange={(e) => setD({ ...d, subtitle: e.target.value })} placeholder="ör. altı kelime, üç oyun" /></FormField>
          <FormField label="Kart resmi" hint="Okumayı bilmeyen çocuk kategoriyi resimden seçer.">
            {ro ? <GameIcon icon={d.icon} size={72} />
                : <Slot kind="image" value={d.icon ?? undefined} onChange={(v) => setD({ ...d, icon: v ?? null })} />}
          </FormField>
          {!ro && !d.icon && <Notice tone="warn">Kart resmi yok: uygulama ilk kelimenin resmini gösterir.</Notice>}
          <Issues list={issues} />
        </CardContent>
      </Card>
      <aside><CardPreview title={d.title} subtitle={d.subtitle} icon={d.icon} /></aside>
    </div>
  );
}

/* ── 2 · the words ────────────────────────────────────────────────────────── */

function WordsStep({ d, setD, cat, ro, issues }: { d: Draft; setD: SetD; cat: ServerCategory; ro: boolean; issues: FlowIssue[] }) {
  const { sets, createSet } = useVocab();
  const set = sets.find((s) => s.id === d.set);
  const [name, setName] = React.useState(d.title);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const own = sets.filter((x) => !x.builtin), app = sets.filter((x) => x.builtin);
  const makeSet = async (s: { name: string; words?: string[] }) => {
    setBusy(true); setError("");
    try { const made = await createSet(s); setD((x) => ({ ...x, set: made.id })); }
    catch (e) { setError((e as Error).message); }
    setBusy(false);
  };

  if (ro) return (
    <Panel title="Kelimeler" icon={<BookA />} description="Uygulamanın kendi kelimeleri; değişiklikleri uygulamanın kodunda.">
      <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{cat.words.map((w) => <li key={w.id}><WordTile w={w} size={48} /></li>)}</ul>
    </Panel>
  );

  const picker = (
    <Select value={d.set ?? ""} onChange={(e) => setD({ ...d, set: e.target.value || null })} className="min-w-[240px] flex-1" aria-label="Kelime seti">
      <option value="">— kelime seti seçin —</option>
      {own.length > 0 && <optgroup label="Paneldeki setler">{own.map((x) => <option key={x.id} value={x.id}>{x.name} ({x.words.length} kelime)</option>)}</optgroup>}
      <optgroup label="Uygulamanın kendi setleri">{app.map((x) => <option key={x.id} value={x.id}>{x.name} ({x.words.length} kelime)</option>)}</optgroup>
    </Select>
  );

  if (!set) return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">Bir kategori bir kelime setiyle oynar: üç oyunun üçü de aynı 5–7 kelimeyi kullanır. Kelimeler ortak kütüphanededir; aynı kelime birden çok sette olabilir.</p>
      <div className="grid gap-4 md:grid-cols-2">
        <Panel title="Bu kategori için yeni set" icon={<Plus />} description="Boş bir set açılır; kelimeleri hemen aşağıda kütüphaneden seçer ya da yenisini eklersiniz." contentClassName="space-y-3">
          <FormField label="Setin adı"><Input value={name} onChange={(e) => setName(e.target.value)} /></FormField>
          <Button disabled={!name.trim() || busy} onClick={() => makeSet({ name: name.trim() })}>{busy && <Spinner data-icon="inline-start" />}Seti oluştur</Button>
        </Panel>
        <Panel title="Var olan bir seti kullan" icon={<BookA />} description="Başka bir oyunun ya da kategorinin seti. Kelimelerdeki bir düzeltme hepsinde görünür.">
          <div className="flex flex-wrap gap-2">{picker}</div>
        </Panel>
      </div>
      {error && <Notice tone="bad">{error}</Notice>}
      <Issues list={issues} />
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium">Set:</span>{picker}
        <Button asChild variant="ghost" size="sm"><Link to={`/kelime-setleri/${set.id}`}>Setin sayfası<ChevronRight /></Link></Button>
      </div>
      {set.builtin && (
        <Notice tone="accent" icon={<Lock />} action={<Button size="sm" variant="outline" disabled={busy}
            onClick={() => makeSet({ name: `${d.title} kelimeleri`, words: set.words })}>Kopyasını oluştur ve kullan</Button>}>
          Uygulamanın kendi seti: kelime listesi uygulamanın kodunda, buradan eklenip çıkarılamaz. Listeyi değiştirmek için bir kopyasını oluşturun.
        </Notice>
      )}
      {error && <Notice tone="bad">{error}</Notice>}
      <Issues list={issues} />
      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <SetWordList set={set} />
        <aside className="space-y-4">
          <Panel title="Hazırlık"><SetReadiness set={set} /></Panel>
          <Panel title="Her kelimede olsun">
            <ul className="list-disc space-y-1 pl-4 text-xs text-muted-foreground">
              <li>Resim: kare, şeffaf PNG — oyun kelimeyi resmiyle gösterir.</li>
              <li>Türkçesi ve 1–3 cümlelik açıklama (içinde İngilizce kelime yok).</li>
              <li>Kayıtlar: öğretmenin İngilizcesi, Türkçesi, açıklaması; Kuki'nin tekrarı. Ses stüdyosunda üretilir; yoksa telefon cihaz sesiyle okur.</li>
            </ul>
          </Panel>
        </aside>
      </div>
    </div>
  );
}

/* ── 3 · the flow ─────────────────────────────────────────────────────────── */

const ROLE_OF = ["öğretir", "alıştırır", "tekrar sorar"];
/** what each open engine does, in a sentence */
const ENGINE_NOTE: Record<string, string> = {
  drag: "Sürükle-bırak: kelimeyi Lili'ye verir. Kelimeleri önce kartla tanıtabilir.",
  pop: "Dokun: söylenen şeyi bulur. Tanıtmaz — önce tanıtan bir oyun gerekir.",
};

/** a friendly name for each step, from where it stands */
function titles(steps: FlowStep[]): string[] {
  let games = 0;
  return steps.map((s, i) => {
    if (s.kind === "game") { games++; return `${games}. oyun · ${ROLE_OF[games - 1] ?? "oyun"}`; }
    if (s.kind === "video" || s.kind === "scene") {
      const film = s.kind === "video";
      if (games === 0) return film ? "Açılış videosu" : "Açılış sahnesi";
      return steps.slice(i + 1).some((x) => x.kind === "game")
        ? `${games + 1}. oyundan önce ${film ? "video" : "canlı sahne"}` : film ? "Kapanış videosu" : "Kapanış sahnesi";
    }
    return "Bitiş · kutlama";
  });
}

function FlowStepPage({ d, setD, ro, issues }: { d: Draft; setD: SetD; ro: boolean; issues: FlowIssue[] }) {
  const setStep = (i: number, s: FlowStep) => setD((x) => ({ ...x, steps: x.steps.map((y, j) => (j === i ? s : y)) }));
  const move = (i: number, dir: -1 | 1) => setD((x) => {
    const steps = [...x.steps]; const j = i + dir;
    [steps[i], steps[j]] = [steps[j]!, steps[i]!];
    return { ...x, steps };
  });
  const add = (kind: FlowStep["kind"]) => setD((x) => {
    const taken = new Set(x.steps.map((s) => s.id));
    let n = 1; while (taken.has(`${kind}-${n}`)) n++;
    const sid = `${kind}-${n}`;
    const s: FlowStep = kind === "video" ? { id: sid, kind, video: null, note: "", fit: "cover" }
      : kind === "scene" ? { id: sid, kind, scene: "", note: "" }
      : kind === "game" ? { id: sid, kind, game: null, teach: !x.steps.some((y) => y.kind === "game") }
      : { id: "done", kind: "finish" };
    const end = x.steps.findIndex((y) => y.kind === "finish");
    const steps = [...x.steps];
    if (kind === "finish" || end < 0) steps.push(s); else steps.splice(end, 0, s);
    return { ...x, steps };
  });
  const names = titles(d.steps);
  const general = issues.filter((i) => areaOf(i) === "akis" && !i.step);
  return (
    <div className="space-y-4">
      <Card size="sm">
        <CardContent className="flex flex-wrap items-center gap-1">
          <span className="mr-2 text-xs font-medium text-muted-foreground">Çocuğun yolu</span>
          {d.steps.map((s, i) => (
            <React.Fragment key={s.id + i}>
              {i > 0 && <ChevronRight className="size-3.5 shrink-0 text-muted-foreground/50" />}
              <a href={`#adim-${i}`} className="rounded-md outline-none hover:ring-2 hover:ring-ring/40"><StepChip s={s} /></a>
            </React.Fragment>
          ))}
        </CardContent>
      </Card>
      <p className="text-sm text-muted-foreground">Videolar hikâyeyi anlatır ve bir sonraki oyuna bağlar; üç oyun aynı kelimelerle oynar. Video yoksa uygulama notunuzu gösteren bir yer tutucu açar.</p>
      {/* prompt 3: three different abilities, so nobody waits for the third from the first */}
      <details className="rounded-lg border bg-muted/30 p-3 text-sm">
        <summary className="cursor-pointer font-medium">Sahne, video ve maskot: hangisi panelden yapılır?</summary>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-muted-foreground">
          <li><b className="font-medium text-foreground">Canlı sahne seçmek:</b> uygulamanın içindeki hazır sahnelerden biri (salon, orman, sahil…). Her biri kendi konusunun hikâyesini anlatır; yeni kategorinin kelimeleri sahneye kendiliğinden girmez.</li>
          <li><b className="font-medium text-foreground">Video (MP4) koymak:</b> başka yerde hazırlanmış bir film yüklenir; panel film üretmez ve bir sahneden MP4 çıkarmaz.</li>
          <li><b className="font-medium text-foreground">Yeni bir canlı sahne yazmak</b> (arka plan, replikler, hareketler): uygulamada kod ve bir güncelleme ister.</li>
          <li><b className="font-medium text-foreground">Maskotun davranışını değiştirmek:</b> Maskotlar sayfasında Lottie dosyasıyla; sahneleri değiştirmez, maskotun her yerdeki hâlini değiştirir.</li>
        </ul>
      </details>
      <Issues list={general} />
      <ol className="relative space-y-3 before:absolute before:top-6 before:bottom-6 before:left-6 before:w-px before:bg-border">
        {d.steps.map((s, i) => (
          <StepCard key={s.id + i} index={i} count={d.steps.length} step={s} title={names[i]!} ro={ro}
            issues={issues.filter((x) => x.step === s.id)}
            onChange={(n) => setStep(i, n)} onMove={(dir) => move(i, dir)}
            onRemove={() => setD((x) => ({ ...x, steps: x.steps.filter((_, j) => j !== i) }))} />
        ))}
      </ol>
      {!ro && (
        <div className="flex flex-wrap gap-2 pl-[3.75rem]">
          <Button variant="outline" onClick={() => add("video")}><Film data-icon="inline-start" />Video ekle</Button>
          <Button variant="outline" onClick={() => add("game")}><Gamepad2 data-icon="inline-start" />Oyun ekle</Button>
          <Button variant="ghost" onClick={() => add("scene")}><Clapperboard data-icon="inline-start" />Canlı sahne ekle</Button>
          {!d.steps.some((s) => s.kind === "finish") && <Button variant="ghost" onClick={() => add("finish")}><Sparkles data-icon="inline-start" />Bitiş ekle</Button>}
        </div>
      )}
    </div>
  );
}

const KIND: Record<FlowStep["kind"], { icon: typeof Film; tint: string }> = {
  video: { icon: Film, tint: "bg-sky-500/10 text-sky-700 dark:text-sky-300" },
  scene: { icon: Clapperboard, tint: TONE.warn },
  game: { icon: Gamepad2, tint: TONE.accent },
  finish: { icon: Sparkles, tint: TONE.ok },
};

function StepCard({ step: s, title, index, count, ro, issues, onChange, onMove, onRemove }: {
  step: FlowStep; title: string; index: number; count: number; ro: boolean; issues: FlowIssue[];
  onChange: (s: FlowStep) => void; onMove: (d: -1 | 1) => void; onRemove: () => void;
}) {
  const { inventory } = useVocab();
  const k = KIND[s.kind];
  const Icon = k.icon;
  const bad = issues.some((x) => x.level === "error");
  return (
    <li id={`adim-${index}`} className="relative flex scroll-mt-20 gap-3">
      <div className={cn("z-10 flex size-12 shrink-0 flex-col items-center justify-center rounded-xl ring-4 ring-background", k.tint)}>
        <Icon className="size-4" /><span className="text-[10px] font-semibold tabular-nums">{index + 1}</span>
      </div>
      <Card size="sm" className={cn("min-w-0 flex-1", bad && "ring-destructive/40")}>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{title}</span>
            <code className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">{s.id}</code>
            {!ro && (
              <div className="ml-auto flex">
                <Button type="button" variant="ghost" size="icon-sm" disabled={index === 0} onClick={() => onMove(-1)} title="Yukarı"><ArrowUp /></Button>
                <Button type="button" variant="ghost" size="icon-sm" disabled={index === count - 1} onClick={() => onMove(1)} title="Aşağı"><ArrowDown /></Button>
                <Button type="button" variant="ghost" size="icon-sm" onClick={onRemove} title="Adımı sil" className="hover:bg-destructive/10 hover:text-destructive"><Trash2 /></Button>
              </div>
            )}
          </div>

          {s.kind === "video" && (
            <div className="grid gap-4 xl:grid-cols-[1fr_260px]">
              <VideoSlot value={s.video} fit={s.fit ?? "cover"} readOnly={ro}
                         onChange={(v) => onChange({ ...s, video: v })} onFit={(f: Fit) => onChange({ ...s, fit: f })} />
              <div className="space-y-3">
                <FormField label="Senaryo / not" hint="Video çekilene kadar uygulama bu notu yer tutucuda gösterir; çekim ekibi için de bir özet.">
                  <Textarea value={s.note} onChange={(e) => onChange({ ...s, note: e.target.value })} placeholder="ör. Lili ile Kuki denize iner, balıklara el sallar." className="min-h-28" />
                </FormField>
                {!ro && <Button type="button" variant="link" size="sm" className="h-auto px-0 text-left whitespace-normal"
                  onClick={() => onChange({ id: s.id, kind: "scene", scene: "", note: s.note })}>Video yerine canlı sahne kullan</Button>}
              </div>
            </div>
          )}
          {s.kind === "scene" && (
            <div className="space-y-3">
              <div className="grid gap-4 md:grid-cols-2">
                <FormField label="Sahne" hint="Canlı sahneler uygulamanın içinde çizilir; her biri kendi serisi için yazıldı ve o serinin yerini, kelimelerini gösterir.">
                  <Select value={s.scene} onChange={(e) => onChange({ ...s, scene: e.target.value })}>
                    <option value="">— seçin —</option>
                    {(inventory?.scenes ?? []).map((x) => <option key={x.id} value={x.id}>{x.name}{x.for ? ` · ${x.for} serisi için` : ""}</option>)}
                  </Select>
                </FormField>
                <FormField label="Not"><Input value={s.note} onChange={(e) => onChange({ ...s, note: e.target.value })} placeholder="Senaryo özeti" /></FormField>
              </div>
              {!ro && <Button type="button" variant="link" size="sm" className="h-auto px-0"
                onClick={() => onChange({ id: s.id, kind: "video", video: null, note: s.note, fit: "cover" })}>Bunun yerine video yükle</Button>}
            </div>
          )}
          {s.kind === "game" && <GameChoice s={s} ro={ro} onChange={onChange} />}
          {s.kind === "finish" && <p className="text-sm text-muted-foreground">Dizinin sonu: kutlama, sonra menüye dönüş.</p>}

          {issues.length > 0 && <ul className="space-y-1 border-t pt-2">{issues.map((x, i) =>
            <li key={i} className={cn("text-xs font-medium", x.level === "error" ? "text-destructive" : "text-warning")}>• {x.text}</li>)}</ul>}
        </CardContent>
      </Card>
    </li>
  );
}

/** the games a step can play: the app's open engines, and the panel's games made from them */
function GameChoice({ s, ro, onChange }: { s: Extract<FlowStep, { kind: "game" }>; ro: boolean; onChange: (s: FlowStep) => void }) {
  const { games } = useGames();
  const { inventory } = useVocab();
  const options: CatalogGame[] = [
    ...games.filter(isTemplate),
    ...games.filter((g) => !g.builtin && g.status !== "hidden" && games.some((t) => t.id === g.template && isTemplate(t))),
  ];
  const game = games.find((g) => g.id === s.game);
  const teaches = (g?: CatalogGame) => !!g && !!inventory?.templates.find((t) => t.id === g.template)?.teach;
  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-2">
        {options.map((g) => {
          const on = g.id === s.game;
          return (
            <button key={g.id} type="button" onClick={() => onChange({ ...s, game: g.id, teach: teaches(g) ? s.teach : false })}
              aria-pressed={on}
              className={cn("flex items-start gap-3 rounded-lg border p-2.5 text-left transition-colors disabled:cursor-not-allowed",
                on ? "border-primary bg-primary/5 ring-2 ring-primary/15" : "hover:border-primary/40 hover:bg-muted/30")}>
              <GameIcon icon={g.icon} size={40} />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5 font-medium">{g.name}{on && <Check className="size-4 text-primary" />}</span>
                <span className="block text-xs text-muted-foreground">
                  {g.builtin ? ENGINE_NOTE[g.template] ?? `${ROLE_LABEL[g.role]} · ${g.gesture}` : `${games.find((x) => x.id === g.template)?.name ?? g.template} ile yapılmış oyun`}
                </span>
              </span>
            </button>
          );
        })}
      </div>
      {game && (teaches(game)
        ? <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={s.teach} onCheckedChange={(v) => onChange({ ...s, teach: v === true })} />
            Kelimeleri önce kartla tanıtsın <span className="text-xs text-muted-foreground">(serinin ilk oyununda açık; sonrakilerde kapalıyken kartsız sorar)</span>
          </label>
        : <p className="text-xs text-muted-foreground">Bu oyun kelimeleri tanıtmaz; seride ondan önce kartla tanıtan bir oyun olmalı.</p>)}
      {!s.game && !ro && <p className="text-xs font-medium text-destructive">Bir oyun seçin.</p>}
    </div>
  );
}

/* ── 4 · check and publish ────────────────────────────────────────────────── */

function PublishStep({ cat, d, ro, states, issues, status, canLive, saving, onStatus, onGo }: {
  cat: ServerCategory; d: Draft; ro: boolean; states: Record<StepId, StepState>; issues: FlowIssue[];
  status: ServerCategory["status"]; canLive: boolean; saving: boolean;
  onStatus: (s: ServerCategory["status"]) => void; onGo: (s: StepId) => void;
}) {
  const videos = d.steps.filter((s): s is Extract<FlowStep, { kind: "video" }> => s.kind === "video");
  const games = d.steps.filter((s) => s.kind === "game").length;
  const STATUS: { id: ServerCategory["status"]; title: string; text: string; icon: typeof Film }[] = [
    { id: "draft", title: "Taslak", text: "Üzerinde çalışıyorsunuz; hiçbir yayına girmez.", icon: FolderTree },
    { id: "live", title: "Uygulamada", text: "Bir sonraki yayınla telefonların Kategoriler sekmesine iner.", icon: Smartphone },
    { id: "hidden", title: "Gizli", text: "Yayınlardan çıkar; silinmez, sonra geri açılabilir.", icon: EyeOff },
  ];
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <div className="min-w-0 space-y-4">
        <Panel title="Kontrol listesi" description={saving ? "Son değişiklik kaydediliyor; liste kaydedilince yenilenir." : "Sunucunun denetimi: hata yayını durdurur, uyarı durdurmaz."}>
          <ul className="divide-y">
            {(["kart", "kelimeler", "akis"] as const).map((s) => {
              const st = states[s];
              const list = issues.filter((i) => areaOf(i) === s);
              const meta = STEPS.find((x) => x.id === s)!;
              return (
                <li key={s} className="py-3 first:pt-0 last:pb-0">
                  <div className="flex items-center gap-3">
                    <IconTile size="sm" tone={st.mark === "done" ? "ok" : st.mark === "error" ? "bad" : st.mark === "warn" ? "warn" : "plain"}>
                      {st.mark === "done" ? <Check /> : st.mark === "todo" ? <meta.icon /> : <AlertTriangle />}</IconTile>
                    <div className="min-w-0 flex-1">
                      <div className="font-medium">{meta.label}</div>
                      <div className="text-xs text-muted-foreground">{st.note}</div>
                    </div>
                    {st.mark !== "done" && <Button variant="outline" size="sm" type="button" onClick={() => onGo(s)}>Düzelt<ChevronRight /></Button>}
                  </div>
                  {list.length > 0 && <ul className="mt-2 space-y-0.5 pl-11">{list.map((x, i) =>
                    <li key={i} className={cn("text-xs", x.level === "error" ? "font-medium text-destructive" : "text-warning")}>• {x.text}</li>)}</ul>}
                </li>
              );
            })}
          </ul>
        </Panel>

        {!ro && (
          <Panel title="Durum" description="Telefonlar paneli değil yayınları okur: “Uygulamada” işaretlemek tek başına bir şey göndermez.">
            <div role="radiogroup" className="grid gap-2 sm:grid-cols-3">
              {STATUS.map((x) => {
                const on = status === x.id, off = x.id === "live" && !canLive;
                return (
                  <button key={x.id} type="button" role="radio" aria-checked={on} disabled={off} onClick={() => !on && onStatus(x.id)}
                    className={cn("rounded-lg border p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                      on ? "border-primary bg-primary/5 ring-2 ring-primary/15" : "hover:bg-muted/40")}>
                    <div className="flex items-center gap-1.5 font-medium"><x.icon className="size-4" />{x.title}{on && <Check className="ml-auto size-4 text-primary" />}</div>
                    <div className="mt-1 text-xs text-muted-foreground">{off ? "Önce hataları düzeltin." : x.text}</div>
                  </button>
                );
              })}
            </div>
          </Panel>
        )}
      </div>

      <aside className="space-y-4">
        <Panel title="Telefona inecek">
          <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border bg-border text-center">
            <Fig n={cat.words.length} label="kelime" />
            <Fig n={`${videos.filter((v) => v.video).length}/${videos.length}`} label="video" />
            <Fig n={games} label="oyun" />
            <Fig n={cat.download ? `≈${fmtSize(cat.download)}` : "—"} label="indirme" />
          </dl>
          <p className="mt-3 text-xs text-muted-foreground">Telefon yeni yayını arka planda indirir ve ancak bütün dosyaları inince gösterir; büyük videolar bu bekleyişi uzatır.</p>
        </Panel>
        <NextSteps cat={cat} status={status} />
      </aside>
    </div>
  );
}

/*
 * UX01 -- AFTER THE CATEGORY: THE REST OF THE WAY TO A PHONE. The category is
 * the centre; the map, the pack and the test release are the next stops on
 * one road, each with its state and a link -- not three sidebar entries the
 * editor has to know about. (The text that stood here said a new category
 * cannot be on the map; it can, since the roadmap grows from the panel.)
 */
function NextSteps({ cat, status }: { cat: ServerCategory; status: ServerCategory["status"] }) {
  const [road, setRoad] = React.useState<RoadSlide[] | null>(null);
  const [packs, setPacks] = React.useState<Pack[]>([]);
  React.useEffect(() => {
    getRoadmap().then((r) => setRoad(r.slides)).catch(() => setRoad([]));
    listPacks().then(setPacks).catch(() => setPacks([]));
  }, []);
  const lands = (road ?? []).filter((sl) => sl.stops.some((st) => st.category === cat.id));
  const inPacks = [...new Set(lands.map((l) => l.pack).filter((x): x is string => !!x))].map((id) => packs.find((p) => p.id === id) ?? { id, title: id, status: "draft" as const });
  const live = status === "live";
  const Item = ({ n, done, title, children }: { n: number; done: boolean | null; title: string; children: React.ReactNode }) => (
    <li className="flex gap-3">
      <span className={cn("flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
        done === true ? "bg-success/10 text-success" : done === false ? "bg-warning/15 text-warning" : "bg-muted text-muted-foreground")}>
        {done === true ? <Check className="size-3.5" /> : n}</span>
      <div className="min-w-0 flex-1 space-y-1 text-sm"><div className="font-medium">{title}</div><div className="text-xs text-muted-foreground">{children}</div></div>
    </li>
  );
  return (
    <Panel title="Telefona giden yol" description="Kategori hazır olunca sırada bunlar var. Haritada yer ve paket isteğe bağlı.">
      <ol className="space-y-3">
        <Item n={1} done={live} title="Uygulamada">
          {live ? "Kategori bir sonraki yayına girer." : "Durumu “Uygulamada” yapın (yukarıda); taslak hiçbir yayına girmez."}
        </Item>
        <Item n={2} done={road === null ? null : lands.length > 0 || null} title="Haritada yeri (isteğe bağlı)">
          {road === null ? "Harita okunuyor…" : lands.length ? (
            <ul className="space-y-0.5">{lands.map((l) => (
              <li key={l.id}><Link to={`/yol-haritasi/${l.id}`} className="font-medium text-primary hover:underline">{l.title}</Link>
                {" "}· {l.stops.filter((st) => st.category === cat.id).length} durak · {STATUS_LABEL[l.status]}
                {l.issues.some((i) => i.level === "error") && <span className="text-destructive"> · hata var</span>}</li>))}</ul>
          ) : <>Haritada değil: telefonda yalnız <b className="font-medium">Kategoriler</b> sekmesinde açılır.{" "}
                <Link to="/yol-haritasi" className="font-medium text-primary hover:underline">Yol haritasında bir sıra yapın</Link>
                {" "}(“Yeni sıra”da bu kategoriyi seçin; oyunları kendiliğinden duraklara dizilir).</>}
        </Item>
        <Item n={3} done={inPacks.length ? inPacks.every((p) => p.status === "live") : null} title="İndirme paketi (isteğe bağlı)">
          {inPacks.length ? <>{inPacks.map((p) => <Link key={p.id} to={`/paketler/${p.id}`} className="mr-2 font-medium text-primary hover:underline">{p.title}</Link>)}
              — paketi uygulamada değilse bu kategori de yayına girmez (herkese inen temel içeriğe düşmez).</>
            : lands.length ? "Paketsiz: yayınla birlikte herkese iner." : "Haritadaki bir sırayı pakete bağlamak, onu bir büyüğün onayıyla indirilen ayrı bir parça yapar."}
        </Item>
        <Item n={4} done={null} title="Telefonda test, sonra üretim">
          <Link to="/yayinla" className="font-medium text-primary hover:underline">Yayınla</Link> → <b className="font-medium">Teste yayınla</b>; test telefonunda
          Kategoriler sekmesinden{lands.length ? " ve haritadan" : ""} baştan sona oynayın; sonra aynı yayını <b className="font-medium">Üretime al</b>.
          Uygulama güncellemesi gerekmez: kelimeler, resimler, kayıtlar, videolar, açık oyunlar ve harita sıraları yayınla gider.
        </Item>
      </ol>
    </Panel>
  );
}

const Fig = ({ n, label }: { n: React.ReactNode; label: string }) => (
  <div className="bg-card p-3"><dd className="font-heading text-lg font-semibold tabular-nums">{n}</dd><dt className="text-xs text-muted-foreground">{label}</dt></div>
);

