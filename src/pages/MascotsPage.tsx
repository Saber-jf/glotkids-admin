/**
 * MASKOTLAR (2026-10-17): who the child plays with, managed here.
 *
 * Two ROLES: the learner (the one the child helps -- the app's own is the
 * bunny Lili) and the friend (the peer who repeats -- the otter Kuki). A
 * MASCOT fills a role: a name, a base Lottie file, and SETS (an emotions set:
 * sevinme, üzülme, ağlama…; a walk set) whose clips are MAPPED onto what the
 * app plays -- each behaviour with variants. How the two get about (walking
 * or hopping, on the map and in the scenes) is one setting for both.
 *
 * The wizard of one mascot:
 *   1 Kimlik       its name (and how the lines will say it), a note
 *   2 Dosyalar     the base file, the gaze file, the sets
 *   3 Davranışlar  every behaviour → its clip and variants; the walks
 *   4 Duruş        where its feet are, measured on the rest pose
 *   5 Adı          every line that says the name; the studio's lines
 *   6 Yayın        the checks, and live or not
 */
import React from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { AlertTriangle, ArrowLeft, ArrowRight, Check, ChevronRight, Download, Drama, Footprints, Lock, Mic, Play, Plus, Rocket,
         Ruler, Smartphone, Smile, Trash2, Upload, X } from "lucide-react";
import { codeOf, createMascot, deleteMascot, fetchFile, getMascots, patchMascot, putTravel, uploadAsset,
         type Behaviour, type ClipRef, type Mascot, type MascotPatch, type MascotRole, type MascotRoleInfo, type MascotSet,
         type MascotsView, type Way } from "../api";
import { assetUrl } from "../blobs";
import { useStore } from "../store";
import { fillNames, renameIn, turkishForms } from "@/lib/names";
import { LottieClip, forgetDoc, loadDoc, measure, useDoc, useStills, type LottieDoc, type Measure } from "../components/Lottie";
import { Chips, FormField, Loading, Modal, ModalActions, Notice, PageHeader, Panel, Pill, Select,
         TONE, fmtSize, type Tone, SaveChip } from "../components/common";
import { flushEdits, useAutosave } from "@/lib/autosave";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useSticky } from "../lib/sticky";

const STATUS_LABEL = { live: "Uygulamada", draft: "Taslak", hidden: "Gizli" } as const;
const ROLE_LABEL: Record<MascotRole, { title: string; sub: string }> = {
  learner: { title: "Öğrenen", sub: "Çocuğun yardım ettiği: acıkır, ister, sevinir. Derslerde konuşmaz." },
  friend: { title: "Arkadaş", sub: "Akran: kelimeyi öğretmenden sonra tekrar eder, hareketleri yapar." },
};
const GROUP_LABEL: Record<Behaviour["group"], string> = {
  rest: "Dinlenme", feel: "Duygular", talk: "Konuşma ve gösterme", verb: "Hareketler (fiiller)", walk: "Yürüyüş", scene: "Sahneler",
};
const SET_KINDS = [
  { id: "feel", label: "Duygular (sevinme, üzülme, ağlama…)" },
  { id: "walk", label: "Yürüme / sekme" },
  { id: "verb", label: "Hareketler" },
  { id: "other", label: "Diğer" },
] as const;
const WAY_ITEMS = [{ id: "stroll" as Way, label: "Yürüyerek (adım adım)" }, { id: "walk" as Way, label: "Sekerek (zıplayarak)" }];
/** the rest pose each role is measured on */
const REST: Record<MascotRole, string> = { learner: "breathe", friend: "idle" };

function useMascots() {
  const [view, setView] = React.useState<MascotsView | null>(null);
  const [error, setError] = React.useState("");
  const load = React.useCallback(async () => {
    try { setView(await getMascots()); setError(""); } catch (e) { setError((e as Error).message); }
  }, []);
  React.useEffect(() => { void load(); }, [load]);
  return { view, error, load, setView };
}

/** a role's rest clip in a file, by the contract's frames when the file keeps them */
function restOf(doc: LottieDoc | null, role: MascotRole): [number, number] | null {
  const m = doc?.markers?.find((x) => x.cm === REST[role]);
  return m ? [m.tm, m.tm + m.dr] : null;
}

function Preview({ asset, role, size = 120, marker }: { asset: string | null | undefined; role: MascotRole; size?: number; marker?: string }) {
  const { doc, error } = useDoc(asset);
  if (!asset) return <div style={{ width: size, height: size }} className="flex shrink-0 items-center justify-center rounded-lg bg-muted text-xs text-muted-foreground">dosya yok</div>;
  if (error) return <div style={{ width: size, height: size }} className="flex shrink-0 items-center justify-center rounded-lg bg-destructive/10 p-2 text-center text-xs text-destructive">{error}</div>;
  const m = marker ? doc?.markers?.find((x) => x.cm === marker) : null;
  const seg = m ? [m.tm, m.tm + m.dr] as const : restOf(doc, role);
  return doc ? <LottieClip doc={doc} from={seg?.[0]} to={seg?.[1]} size={size} /> : <div style={{ width: size, height: size }} className="flex shrink-0 items-center justify-center"><Spinner /></div>;
}

/* ── the page: one tab per role, every animation of the mascot in play ───── */

export function MascotsPage() {
  const { view, error, load, setView } = useMascots();
  const [params, setParams] = useSearchParams();
  /* the role last looked at, when the link does not name one (`useSticky`) */
  const [keptRole, setKeptRole] = useSticky<MascotRole>("mascots.role", "learner");
  const [making, setMaking] = React.useState<MascotRole | null>(null);
  const [busy, setBusy] = React.useState(false);
  const nav = useNavigate();
  if (error) return <Notice tone="bad">{error}</Notice>;
  if (!view) return <Loading />;
  if (!view.contract) return <Notice tone="warn" icon={<AlertTriangle />}>Sunucu uygulamanın maskot sözleşmesini henüz bilmiyor. Uygulama klasöründe <code>npm run inventory</code> çalıştırıp envanteri gönderin (Uygulama sayfası).</Notice>;
  const tab: MascotRole = params.get("rol") === "friend" ? "friend" : params.get("rol") === "learner" ? "learner" : keptRole;
  const role = view.roles.find((r) => r.role === tab)!;
  const nameOf = (r: MascotRoleInfo) => view.list.find((m) => m.role === r.role && m.status === "live")?.name ?? r.builtin?.name ?? "";
  const setTravel = async (t: { map: Way; scene: Way }) => {
    setBusy(true);
    try { const out = await putTravel(t); setView({ ...view, travel: out }); } catch (e) { alert((e as Error).message); }
    setBusy(false);
  };
  return (
    <>
      <PageHeader title="Maskotlar"
        sub="Her maskotun uygulamada oynayan bütün animasyonları: sevinme, acıkma, şaşırma, konuşma, hareketler, yürüyüşler, sahneler. Birine tıklayınca oynar; “Değiştir” ile yerine yeni bir Lottie koyabilir ya da varyant ekleyebilirsiniz. Değişiklik yayınla telefonlara gider, uygulama güncellemesi gerekmez." />
      <Tabs value={tab} onValueChange={(v) => { setKeptRole(v as MascotRole); setParams(v === "friend" ? { rol: "friend" } : {}); }} className="mb-5">
        <TabsList className="h-auto">
          {view.roles.map((r) => (
            <TabsTrigger key={r.role} value={r.role} className="gap-2 px-4 py-2 text-sm">
              <span className="font-semibold">{nameOf(r)}</span>
              <span className="text-muted-foreground">· {ROLE_LABEL[r.role].title}</span>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
        <RoleTab key={tab} view={view} role={role} reload={load} onNew={() => setMaking(tab)} />
        <aside className="space-y-4">
          <Panel title="Nasıl yürüsünler?" icon={<Footprints />}
            description="İki maskot yan yana gider; seçim ikisi için. Bir sonraki yayında telefonlara iner.">
            <div className="space-y-3">
              <FormField label="Haritada (duraklar arasında)">
                <Chips value={view.travel.map} items={WAY_ITEMS} onChange={(v) => void setTravel({ ...view.travel, map: v })} />
              </FormField>
              <FormField label="Sahnelerde (oyunlardan önce)">
                <Chips value={view.travel.scene} items={WAY_ITEMS} onChange={(v) => void setTravel({ ...view.travel, scene: v })} />
              </FormField>
            </div>
            {busy && <Loading className="mt-2">Kaydediliyor…</Loading>}
          </Panel>
          <DesignerKit view={view} />
          <Panel title="Telefonda ne olur">
            <ol className="list-decimal space-y-1.5 pl-4 text-sm text-muted-foreground">
              <li>Değişiklik önce taslaktır; “Uygulamaya koy” ve ardından <b className="font-medium text-foreground">Yayınla</b> ile telefonlara iner.</li>
              <li>Telefon dosyayı sözleşmeye göre <b className="font-medium text-foreground">bir daha</b> denetler; uymayan dosya ekrana hiç gelmez, uygulamanın kendi maskotu kalır.</li>
              <li>Değişim yalnız menüde/haritada olur; oyunun ortasında karakter değişmez.</li>
              <li>Bir animasyonun birden çok varyantı varsa her seferinde biri seçilir.</li>
            </ol>
          </Panel>
        </aside>
      </div>
      {making && <NewMascot role={making} view={view} onClose={() => setMaking(null)} onMade={(id) => { void load(); nav(`/maskotlar/${id}`); }} />}
    </>
  );
}

/** the mascot whose animations a tab edits: the one in play, or the app's own
 *  edited copy (a draft started from the app's file), else none yet */
function workOf(view: MascotsView, role: MascotRoleInfo): Mascot | null {
  const mine = view.list.filter((m) => m.role === role.role);
  return mine.find((m) => m.status === "live")
    ?? mine.find((m) => m.status === "draft" && !!role.builtin?.base && m.base === role.builtin.base && m.name === role.builtin.name)
    ?? null;
}

/** one take of a behaviour: which file, which frames, and where it came from */
interface Take { asset: string; set: string; marker: string; label: string }

function RoleTab({ view, role, reload, onNew }: { view: MascotsView; role: MascotRoleInfo; reload: () => Promise<void>; onNew: () => void }) {
  const work = workOf(view, role);
  const others = view.list.filter((m) => m.role === role.role && m.id !== work?.id);
  const baseAsset = work?.base ?? role.builtin?.base ?? null;
  const setAsset = (set: string) => (set === "base" ? baseAsset : work?.sets.find((s) => s.id === set)?.asset ?? null);
  const setLabel = (set: string) => (set === "base" ? "Ana dosya" : work?.sets.find((s) => s.id === set)?.label || set);
  /* every take a behaviour plays now, in order */
  const takesOf = (b: Behaviour): Take[] => {
    if (b.group === "walk") {
      const fam = b.key.startsWith("stroll") ? work?.strollSet : work?.walkSet;
      const set = fam ?? "base";
      const a = setAsset(set);
      return a ? [{ asset: a, set, marker: b.key, label: setLabel(set) }] : [];
    }
    const refs = work?.map[b.key]?.length ? work.map[b.key]! : [{ set: "base", marker: b.key }];
    return refs.flatMap((r) => { const a = setAsset(r.set); return a ? [{ asset: a, set: r.set, marker: r.marker, label: setLabel(r.set) }] : []; });
  };
  const [sel, setSel] = React.useState<{ key: string; i: number }>({ key: role.role === "learner" ? "tickle" : "celebrate", i: 0 });
  const [editing, setEditing] = React.useState<Behaviour | null>(null);
  const [error, setError] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const selB = role.behaviours.find((b) => b.key === sel.key) ?? role.behaviours[0]!;
  const selTakes = takesOf(selB);
  const selTake = selTakes[Math.min(sel.i, selTakes.length - 1)];

  /* a working mascot to write to: the one there is, or the app's own copied */
  const ensureWork = async (): Promise<Mascot> => {
    if (work) return work;
    if (!role.builtin) throw new Error("Uygulamanın kendi maskotu sunucuda yok.");
    return createMascot(role.role, role.builtin.name, "builtin");
  };
  const run = async (f: () => Promise<unknown>) => {
    setBusy(true); setError("");
    try { await f(); await reload(); } catch (e) { setError((e as Error).message); }
    setBusy(false);
  };
  /* sets no behaviour, walk or stroll uses any more are dropped */
  const tidy = (m: Mascot, sets: MascotSet[], map: Mascot["map"], walkSet = m.walkSet, strollSet = m.strollSet) => {
    const used = new Set([...Object.values(map).flat().map((r) => r.set), walkSet, strollSet]);
    return sets.filter((s) => !s.id.startsWith("anim-") || used.has(s.id));
  };
  const revert = (b: Behaviour) => run(async () => {
    if (!work) return;
    if (b.group === "walk") {
      const k = b.key.startsWith("stroll") ? "strollSet" : "walkSet";
      const p = { walkSet: work.walkSet, strollSet: work.strollSet, [k]: null };
      await patchMascot(work.id, { ...p, sets: tidy(work, work.sets, work.map, p.walkSet, p.strollSet) }, work.updatedAt);
      return;
    }
    const map = { ...work.map }; delete map[b.key];
    await patchMascot(work.id, { map, sets: tidy(work, work.sets, map) }, work.updatedAt);
  });
  const dropTake = (b: Behaviour, i: number) => run(async () => {
    if (!work) return;
    const refs = (work.map[b.key] ?? []).filter((_, k) => k !== i);
    const map = { ...work.map };
    if (refs.length) map[b.key] = refs; else delete map[b.key];
    await patchMascot(work.id, { map, sets: tidy(work, work.sets, map) }, work.updatedAt);
    setSel({ key: b.key, i: 0 });
  });
  const goLive = () => run(async () => { if (work) await patchMascot(work.id, { status: "live" }, work.updatedAt); });

  const changed = (b: Behaviour) => b.group === "walk"
    ? !!(b.key.startsWith("stroll") ? work?.strollSet : work?.walkSet)
    : !!work?.map[b.key]?.length;
  const groups = (["feel", "rest", "talk", "verb", "walk", "scene"] as const)
    .map((g) => [g, role.behaviours.filter((b) => b.group === g)] as const).filter(([, bs]) => bs.length);
  const errs = work?.issues.filter((i) => i.level === "error") ?? [];
  return (
    <div className="min-w-0 space-y-5">
      <Card size="sm" className="flex-row flex-wrap items-center gap-4 px-4">
        <Preview asset={baseAsset} role={role.role} size={72} />
        <div className="min-w-0 flex-1">
          <div className="font-heading text-lg font-semibold">{work?.name ?? role.builtin?.name}</div>
          <div className="text-sm text-muted-foreground">{ROLE_LABEL[role.role].sub}</div>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {!work ? <Pill tone="ok">uygulamanın kendi animasyonları</Pill>
              : work.status === "live" ? <Pill tone="ok"><Smartphone />uygulamada (panelden)</Pill>
              : <Pill tone="warn">taslak: telefona gitmedi</Pill>}
            {work && <Pill tone="plain">{Object.keys(work.map).length + (work.walkSet ? 1 : 0) + (work.strollSet ? 1 : 0)} değişiklik</Pill>}
            {errs.length > 0 && <Pill tone="bad">{errs.length} hata</Pill>}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {work && work.status !== "live" && <Button disabled={busy || errs.length > 0} onClick={goLive}><Smartphone data-icon="inline-start" />Uygulamaya koy</Button>}
          {work && <Button variant="outline" asChild><Link to={`/maskotlar/${work.id}`}>Ayrıntılı düzenle<ChevronRight /></Link></Button>}
        </div>
      </Card>
      {error && <Notice tone="bad">{error}</Notice>}
      {errs.map((i) => <Notice key={i.text} tone="bad" icon={<AlertTriangle />}>{i.text}</Notice>)}

      <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
        <div className="min-w-0 space-y-5">
          {groups.map(([g, bs]) => (
            <section key={g}>
              <h2 className="mb-2 font-heading text-base font-semibold">{GROUP_LABEL[g]} <span className="font-normal text-muted-foreground">{bs.length}</span></h2>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(128px,1fr))] gap-2.5">
                {bs.map((b) => (
                  <AnimCard key={b.key} b={b} takes={takesOf(b)} changed={changed(b)} selected={sel.key === b.key}
                    onPlay={() => setSel({ key: b.key, i: 0 })} />
                ))}
              </div>
            </section>
          ))}
        </div>
        <aside className="lg:sticky lg:top-4 lg:self-start">
          <Panel title={selB.label} description={selB.when} contentClassName="space-y-3">
            {selTake ? <TakePlayer take={selTake} size={252} /> : <div className="h-60 rounded-lg bg-muted" />}
            <div className="font-mono text-xs text-muted-foreground">{selB.key}{selTake ? ` · ${selTake.label} · ${selTake.marker === "*" ? "tüm dosya" : selTake.marker}` : ""}</div>
            {selTakes.length > 1 && (
              <div className="flex flex-wrap gap-1.5">
                {selTakes.map((t, i) => (
                  <span key={`${t.set}/${t.marker}/${i}`} className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs", i === sel.i ? "border-primary bg-primary/10" : "")}>
                    <button type="button" onClick={() => setSel({ key: selB.key, i })}>{i === 0 ? "asıl" : `varyant ${i}`}</button>
                    {work?.map[selB.key]?.length ? <button type="button" title="Çıkar" className="text-muted-foreground hover:text-destructive" onClick={() => void dropTake(selB, i)}><X className="size-3" /></button> : null}
                  </span>
                ))}
              </div>
            )}
            {selB.group === "scene" ? (
              <p className="text-xs text-muted-foreground">Sahneler sözleşmedeki karelerde oynar (replikler ve dönüşler o karelere bağlı): tek tek değiştirilmez, yeni bir ana dosyayla gelir.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                <Button size="sm" disabled={busy} onClick={() => setEditing(selB)}><Upload data-icon="inline-start" />Değiştir</Button>
                {changed(selB) && <Button size="sm" variant="outline" disabled={busy} onClick={() => void revert(selB)}>Uygulamanınkine dön</Button>}
              </div>
            )}
          </Panel>
        </aside>
      </div>

      <section className="space-y-2">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h2 className="font-heading text-base font-semibold">Başka karakterler <span className="font-normal text-muted-foreground">{others.length}</span></h2>
          <Button size="sm" variant="outline" onClick={onNew}><Plus data-icon="inline-start" />Yeni maskot (ayı, panda…)</Button>
        </div>
        {others.length === 0 ? <p className="text-sm text-muted-foreground">Bu rol için başka karakter yok. Yeni bir karakter tasarımcının yeni dosyasıyla, kendi adıyla gelir.</p> : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {others.map((m) => (
              <Link key={m.id} to={`/maskotlar/${m.id}`} className="group block rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
                <Card size="sm" className="h-full flex-row items-center gap-3 px-3 transition-shadow group-hover:shadow-md">
                  <Preview asset={m.base} role={m.role} size={64} />
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="truncate font-medium">{m.name}</div>
                    <div className="flex flex-wrap gap-1"><Pill tone={m.status === "live" ? "ok" : "plain"}>{STATUS_LABEL[m.status]}</Pill>
                      {m.issues.some((i) => i.level === "error") && <Pill tone="bad">hata</Pill>}</div>
                  </div>
                  <ChevronRight className="size-4 text-muted-foreground" />
                </Card>
              </Link>
            ))}
          </div>
        )}
      </section>

      {editing && <ReplaceClip b={editing} role={role} view={view} current={takesOf(editing)[0] ?? null}
        onClose={() => setEditing(null)}
        onSave={(f) => run(async () => { await f(await ensureWork()); setEditing(null); setSel({ key: editing.key, i: 0 }); })} />}
    </div>
  );
}

/** a take, playing */
function TakePlayer({ take, size }: { take: Take; size: number }) {
  const { doc, error } = useDoc(take.asset);
  if (error) return <Notice tone="bad">{error}</Notice>;
  const m = doc?.markers?.find((x) => x.cm === take.marker);
  const seg = take.marker === "*" && doc ? [doc.ip ?? 0, doc.op] as const : m ? [m.tm, m.tm + m.dr] as const : null;
  return doc ? <LottieClip doc={doc} from={seg?.[0]} to={seg?.[1]} size={size} /> : <div style={{ width: size, height: size }} className="flex items-center justify-center"><Spinner /></div>;
}

/** a behaviour in the gallery: a still of its middle frame */
function AnimCard({ b, takes, changed, selected, onPlay }: { b: Behaviour; takes: Take[]; changed: boolean; selected: boolean; onPlay: () => void }) {
  const t = takes[0];
  const { doc } = useDoc(t?.asset);
  const m = t && doc ? (t.marker === "*" ? { tm: doc.ip ?? 0, dr: doc.op - (doc.ip ?? 0) } : doc.markers?.find((x) => x.cm === t.marker)) : null;
  const mid = m ? Math.round(m.tm + m.dr / 2) : null;
  const stills = useStills(doc, mid === null ? [] : [mid], 140);
  const pic = mid === null ? null : stills[mid];
  return (
    <button type="button" onClick={onPlay}
      className={cn("group flex flex-col items-stretch gap-1.5 rounded-xl border bg-card p-2 text-left transition-shadow hover:shadow-md",
        selected && "border-primary ring-3 ring-primary/15")}>
      <div className="relative aspect-square overflow-hidden rounded-lg bg-[repeating-conic-gradient(#0000000a_0_25%,transparent_0_50%)] bg-[length:14px_14px]">
        {pic ? <img src={pic} alt="" className="h-full w-full object-contain" /> : <div className="flex h-full items-center justify-center">{t ? <Spinner /> : <span className="text-xs text-destructive">işaretçi yok</span>}</div>}
        <div className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity group-hover:opacity-100">
          <span className="rounded-full bg-background/90 p-2 shadow"><Play className="size-4" /></span>
        </div>
        <div className="absolute left-1 top-1 flex gap-1">
          {changed && <Pill tone="accent" className="h-5 px-1.5 text-[10px]">yeni</Pill>}
          {takes.length > 1 && <Pill tone="plain" className="h-5 px-1.5 text-[10px]" title={`${takes.length} varyant`}>×{takes.length}</Pill>}
          {b.group === "scene" && <Pill tone="plain" className="h-5 px-1.5 text-[10px]"><Lock className="size-2.5" /></Pill>}
        </div>
      </div>
      <div className="min-w-0 px-0.5">
        <div className="line-clamp-2 text-[13px] font-medium leading-snug">{b.label}</div>
        <div className="truncate font-mono text-[11px] text-muted-foreground">{b.key}</div>
      </div>
    </button>
  );
}

/**
 * Put a new animation in a behaviour's place, or beside it as a variant. The
 * file is a Lottie in the role's box: one animation (played whole) or several
 * under markers (one is chosen). A walk takes a file with that walk's six
 * markers, each the contract's length.
 */
function ReplaceClip({ b, role, view, current, onClose, onSave }: {
  b: Behaviour; role: MascotRoleInfo; view: MascotsView; current: Take | null;
  onClose: () => void; onSave: (f: (m: Mascot) => Promise<unknown>) => void;
}) {
  const { addAssetMeta } = useStore();
  const walk = b.group === "walk";
  const family = b.key.startsWith("stroll") ? "stroll" : "walk";
  const familyKeys = Object.keys(role.markers).filter((k) => k.startsWith(`${family}_`));
  const [asset, setAsset] = React.useState<string | null>(null);
  const [marker, setMarker] = React.useState<string>("*");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const { doc } = useDoc(asset);
  const input = React.useRef<HTMLInputElement>(null);
  const markers = doc?.markers ?? [];
  const problems: string[] = [];
  if (doc) {
    if (doc.w !== view.contract?.canvas || doc.h !== view.contract?.canvas) problems.push(`Tuval ${doc.w}×${doc.h}; ${view.contract?.canvas}×${view.contract?.canvas} olmalı.`);
    if (doc.fr !== view.contract?.fr) problems.push(`Kare hızı ${doc.fr}; ${view.contract?.fr} olmalı.`);
    if (walk) for (const k of familyKeys) {
      const m = markers.find((x) => x.cm === k), r = role.markers[k]!;
      if (!m) problems.push(`"${k}" işaretçisi yok.`);
      else if (m.dr !== r.to - r.from) problems.push(`"${k}" ${m.dr} kare; ${r.to - r.from} olmalı.`);
    }
  }
  const take = async (f: File | undefined) => {
    if (!f) return;
    setBusy(true); setError("");
    try {
      const a = await uploadAsset(new Blob([await f.arrayBuffer()], { type: "application/json" }), f.name);
      addAssetMeta(a); forgetDoc(a.id); setAsset(a.id);
      const d = await loadDoc(a.id);
      setMarker(d.markers?.find((x) => x.cm === b.key)?.cm ?? d.markers?.[0]?.cm ?? "*");
    } catch (e) { setError((e as Error).message); }
    setBusy(false);
  };
  const save = (variant: boolean) => onSave(async (m) => {
    let n = 1; const ids = new Set(m.sets.map((s) => s.id));
    while (ids.has(`anim-${b.key.replace(/_/g, "-")}-${n}`)) n++;
    const id = `anim-${b.key.replace(/_/g, "-")}-${n}`;
    const sets = [...m.sets, { id, label: `${b.label}${variant ? " (varyant)" : ""}`.slice(0, 40), kind: walk ? "walk" : b.group, asset }];
    if (walk) return patchMascot(m.id, { sets, [family === "stroll" ? "strollSet" : "walkSet"]: id }, m.updatedAt);
    const ref = { set: id, marker };
    const old = m.map[b.key]?.length ? m.map[b.key]! : [{ set: "base", marker: b.key }];
    return patchMascot(m.id, { sets, map: { ...m.map, [b.key]: variant ? [...old, ref] : [ref] } }, m.updatedAt);
  });
  return (
    <Modal wide title={`${b.label} · değiştir`} description={walk
      ? `Yürüyüşün altı parçası birlikte değişir: dosyada ${familyKeys.join(", ")} işaretçileri, sözleşmedeki uzunlukta.`
      : "Tek animasyonluk bir Lottie (tümü oynar) ya da işaretçili bir dosya (biri seçilir). 512×512, 30 kare/sn."} onClose={onClose}>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <div className="text-sm font-medium">Şimdiki</div>
          {current ? <TakePlayer take={current} size={240} /> : <div className="h-60 rounded-lg bg-muted" />}
        </div>
        <div className="space-y-1.5">
          <div className="text-sm font-medium">Yeni</div>
          {doc ? <TakePlayer take={{ asset: asset!, set: "yeni", marker: walk ? b.key : marker, label: "yeni" }} size={240} />
            : <button type="button" onClick={() => input.current?.click()} disabled={busy}
                className="flex h-60 w-60 flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed text-sm text-muted-foreground hover:bg-muted/40">
                {busy ? <Spinner /> : <Upload className="size-6" />}Lottie dosyası seç (.json)</button>}
          <input ref={input} type="file" accept=".json,application/json" className="hidden" onChange={(e) => { void take(e.target.files?.[0]); e.target.value = ""; }} />
        </div>
      </div>
      {doc && !walk && markers.length > 0 && (
        <FormField label="Hangi animasyon?">
          <Select value={marker} onChange={(e) => setMarker(e.target.value)}>
            <option value="*">Tüm dosya</option>
            {markers.map((x) => <option key={x.cm} value={x.cm}>{x.cm} ({x.dr} kare)</option>)}
          </Select>
        </FormField>
      )}
      {doc && <Button variant="ghost" size="sm" className="w-fit" onClick={() => input.current?.click()}><Upload data-icon="inline-start" />Başka dosya</Button>}
      {error && <Notice tone="bad">{error}</Notice>}
      {problems.map((p) => <Notice key={p} tone="bad">{p}</Notice>)}
      <ModalActions start={<span className="text-xs text-muted-foreground">Değişiklik taslağa yazılır; “Uygulamaya koy” ve Yayınla ile telefonlara gider.</span>}>
        <Button variant="ghost" onClick={onClose}>Vazgeç</Button>
        {!walk && <Button variant="outline" disabled={!doc || problems.length > 0} onClick={() => save(true)}>Varyant olarak ekle</Button>}
        <Button disabled={!doc || problems.length > 0} onClick={() => save(false)}>Yerine koy</Button>
      </ModalActions>
    </Modal>
  );
}

/** what a designer needs: the app's own file to start from, and the contract */
function DesignerKit({ view }: { view: MascotsView }) {
  const save = async (name: string, blob: Blob) => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  };
  const contract = (r: MascotRoleInfo) => ({
    rol: r.role, tuval: `${view.contract!.canvas}x${view.contract!.canvas}`, kare_hizi: view.contract!.fr,
    en_az_kare: r.minOp ?? null,
    not: "Ana dosya en az bu kadar kare olmalı: sahnelerin sessiz ikizleri (konuşma bitince ağzı kapalı kopyalar) son işaretçiden sonra, dosyanın sonundadır.",
    ...(r.role === "learner" && view.contract!.lookOp ? { bakis_dosyasi_en_az_kare: view.contract!.lookOp } : {}),
    kurallar: { any: "istenen uzunlukta", length: "uzunluğu aynen bu", frames: "kareleri aynen bunlar" },
    isaretciler: Object.fromEntries(Object.entries(r.markers).map(([k, m]) => [k, { bas: m.from, son: m.to, kural: m.hold }])),
    davranislar: r.behaviours.filter((b) => b.mappable).map((b) => ({ isaretci: b.key, ad: b.label, ne_zaman: b.when })),
  });
  return (
    <Panel title="Tasarımcı için" icon={<Drama />}
      description={`Her dosya ${view.contract?.canvas}×${view.contract?.canvas} ve ${view.contract?.fr} kare/sn; davranışlar adlı işaretçilerle (marker). Sahneler ve yürüyüşler sözleşmedeki karelere bağlı.`}>
      <div className="space-y-2">
        {view.roles.map((r) => (
          <div key={r.role} className="space-y-1.5 rounded-lg border p-2.5">
            <div className="text-sm font-medium">{ROLE_LABEL[r.role].title} · {r.builtin?.name}</div>
            <div className="flex flex-wrap gap-1.5">
              {r.builtin?.base && <Button variant="outline" size="sm" onClick={async () => save(`${r.builtin!.name}-ana.json`, await fetchFile(assetUrl(r.builtin!.base!)))}>
                <Download data-icon="inline-start" />Başlangıç dosyası</Button>}
              <Button variant="outline" size="sm" onClick={() => save(`${r.role}-sozlesme.json`, new Blob([JSON.stringify(contract(r), null, 1)], { type: "application/json" }))}>
                <Download data-icon="inline-start" />Sözleşme</Button>
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function NewMascot({ role, view, onClose, onMade }: { role: MascotRole; view: MascotsView; onClose: () => void; onMade: (id: string) => void }) {
  const [name, setName] = React.useState("");
  const [from, setFrom] = React.useState<"builtin" | "empty">("empty");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const own = view.roles.find((r) => r.role === role)?.builtin;
  const make = async () => {
    setBusy(true); setError("");
    try { const m = await createMascot(role, name.trim(), from); onMade(m.id); }
    catch (e) { setError((e as Error).message); setBusy(false); }
  };
  return (
    <Modal title={`Yeni maskot · ${ROLE_LABEL[role].title}`} description={ROLE_LABEL[role].sub} onClose={onClose}>
      <FormField label="Adı" hint="Çocuğun duyduğu ad. Ekleri uygulama kendisi getirir (Ayı'ya, Ayı'nın).">
        <Input autoFocus value={name} maxLength={24} onChange={(e) => setName(e.target.value)} placeholder="ör. Ayı, Panda" />
      </FormField>
      <FormField label="Neyle başlasın?">
        <Chips value={from} onChange={setFrom} items={[
          { id: "empty", label: "Tasarımcının yeni dosyası" },
          { id: "builtin", label: `${own?.name ?? "Uygulamanın"} dosyası (yalnız ad ya da set değişecekse)` },
        ]} />
      </FormField>
      {error && <Notice tone="bad">{error}</Notice>}
      <ModalActions>
        <Button variant="ghost" onClick={onClose}>Vazgeç</Button>
        <Button disabled={!name.trim() || busy} onClick={make}>{busy && <Spinner data-icon="inline-start" />}Oluştur</Button>
      </ModalActions>
    </Modal>
  );
}

/* ── the wizard ───────────────────────────────────────────────────────────── */

type StepId = "kimlik" | "dosyalar" | "davranis" | "durus" | "ad" | "yayin";
const STEPS: { id: StepId; label: string }[] = [
  { id: "kimlik", label: "Kimlik" }, { id: "dosyalar", label: "Dosyalar ve setler" }, { id: "davranis", label: "Davranışlar" },
  { id: "durus", label: "Duruş" }, { id: "ad", label: "Adı geçen satırlar" }, { id: "yayin", label: "Kontrol ve yayın" },
];

export function MascotEdit() {
  const { id } = useParams();
  const { view, error, load, setView } = useMascots();
  const [gen, setGen] = React.useState(0);
  if (error) return <Notice tone="bad">{error}</Notice>;
  if (!view) return <Loading />;
  const m = view.list.find((x) => x.id === id);
  if (!m) return <p className="text-sm text-muted-foreground">Maskot bulunamadı. <Link className="text-primary hover:underline" to="/maskotlar">Listeye dön</Link></p>;
  const role = view.roles.find((r) => r.role === m.role)!;
  return <Wizard key={`${m.id}:${gen}`} m={m} role={role} view={view} reload={load} restart={async () => { await load(); setGen((g) => g + 1); }}
                 onSaved={(x) => setView((v) => v && { ...v, list: v.list.map((y) => (y.id === x.id ? x : y.role === x.role && x.status === "live" && y.status === "live" ? { ...y, status: "draft" } : y)) })} />;
}

type Save = (p: MascotPatch) => Promise<boolean>;

function Wizard({ m, role, view, reload, restart, onSaved }: {
  m: Mascot; role: MascotRoleInfo; view: MascotsView; reload: () => Promise<void>; restart: () => Promise<void>; onSaved: (m: Mascot) => void;
}) {
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const at: StepId = STEPS.find((s) => s.id === params.get("adim"))?.id ?? "kimlik";
  const go = (s: StepId) => { setParams(s === "kimlik" ? {} : { adim: s }); window.scrollTo({ top: 0 }); };
  const base = React.useRef(m.updatedAt);
  const [error, setError] = React.useState("");
  /* a conflict (F06): either start again from the server's version (`restart`),
     or read only its stamp and send this window's waiting edits over it */
  const [stale, setStale] = React.useState(false);
  const [mine, setMine] = React.useState(false);
  React.useEffect(() => {
    if (!mine) return;
    setMine(false); base.current = m.updatedAt; setStale(false); void flushEdits();
  }, [mine, m.updatedAt]); // eslint-disable-line react-hooks/exhaustive-deps
  const save: Save = async (p) => {
    try { const out = await patchMascot(m.id, p, base.current); base.current = out.updatedAt; onSaved(out); setError(""); setStale(false); return true; }
    catch (e) {
      if (codeOf(e) === "STALE") setStale(true); else setError((e as Error).message);
      return false;
    }
  };
  const errs = m.issues.filter((i) => i.level === "error");
  const mark = (s: StepId): { tone: Tone; note: string } => {
    const has = (re: RegExp) => m.issues.some((i) => i.level === "error" && re.test(i.text));
    if (s === "kimlik") return has(/^Adı/) ? { tone: "bad", note: "ad geçersiz" } : { tone: "ok", note: m.name };
    if (s === "dosyalar") return !m.base ? { tone: "plain", note: "ana dosya yok" } : has(/Ana dosya|seti|Bakış/) ? { tone: "bad", note: "dosyada hata" } : { tone: "ok", note: `ana dosya · ${m.sets.length} set` };
    if (s === "davranis") return has(/işaretçisi yok|eşlenemez|davranışı değil|Sekme|Yürüme/) && !!m.base ? { tone: "bad", note: "eşlemede hata" } : { tone: "ok", note: `${Object.keys(m.map).length} eşleme` };
    if (s === "durus") return m.foot ? { tone: "ok", note: "ölçüldü" } : { tone: "warn", note: "ölçülmedi" };
    if (s === "ad") return role.builtin && m.name.trim() !== role.builtin.name ? { tone: "warn", note: `${role.namedLines.length} satır yeni adla` } : { tone: "ok", note: "ad aynı" };
    return errs.length ? { tone: "bad", note: `${errs.length} hata` } : { tone: m.status === "live" ? "ok" : "accent", note: STATUS_LABEL[m.status] };
  };
  const idx = STEPS.findIndex((s) => s.id === at);
  return (
    <>
      <PageHeader back={{ to: "/maskotlar", label: "Maskotlar" }} title={m.name} lead={<Preview asset={m.base} role={m.role} size={56} />}
        meta={<>{ROLE_LABEL[m.role].title} · kimlik: {m.id}</>}
        actions={<>
          <Pill tone={m.status === "live" ? "ok" : "plain"} className="h-6">{m.status === "live" ? <Smartphone /> : null}{STATUS_LABEL[m.status]}</Pill>
          <Button variant="ghost" size="icon" title="Maskotu sil" className="hover:bg-destructive/10 hover:text-destructive" onClick={async () => {
            if (!confirm(`"${m.name}" silinsin mi? Uygulamadaysa bir sonraki yayında ${role.builtin?.name ?? "uygulamanın kendi maskotu"} geri gelir.`)) return;
            await deleteMascot(m.id); nav("/maskotlar");
          }}><Trash2 /></Button>
        </>} />
      {stale && <Notice tone="warn" className="mb-4" action={<>
        <Button size="sm" variant="outline" onClick={() => void restart()}>Sunucudakini yükle</Button>
        <Button size="sm" onClick={async () => { if (confirm("Başka yerde yapılan değişikliğin üstüne bu penceredeki yazılsın mı?")) { await reload(); setMine(true); } }}>Benimkini yaz</Button>
      </>}>Bu maskot başka bir yerde değişti; değişikliğiniz yazılmadı ve ekranda duruyor.</Notice>}
      {error && <Notice tone="bad" className="mb-4">{error}</Notice>}
      <ol className="mb-6 grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
        {STEPS.map((s, i) => {
          const k = mark(s.id), here = s.id === at;
          return (
            <li key={s.id}>
              <button type="button" onClick={() => go(s.id)} aria-current={here ? "step" : undefined}
                className={cn("flex h-full w-full items-center gap-3 rounded-xl border bg-card p-3 text-left transition-colors",
                  here ? "border-primary ring-3 ring-primary/15" : "hover:bg-muted/40")}>
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

      {at === "kimlik" && <IdentityStep m={m} role={role} view={view} save={save} />}
      {at === "dosyalar" && <FilesStep m={m} save={save} />}
      {at === "davranis" && <BehaviourStep m={m} role={role} save={save} />}
      {at === "durus" && <StanceStep m={m} role={role} save={save} />}
      {at === "ad" && <NameStep m={m} role={role} view={view} />}
      {at === "yayin" && <PublishStep m={m} save={save} />}

      <div className="mt-8 flex items-center justify-between border-t pt-4">
        {idx > 0 ? <Button variant="outline" onClick={() => go(STEPS[idx - 1]!.id)}><ArrowLeft data-icon="inline-start" />{STEPS[idx - 1]!.label}</Button> : <span />}
        {idx < STEPS.length - 1
          ? <Button onClick={() => go(STEPS[idx + 1]!.id)}>Devam: {STEPS[idx + 1]!.label}<ArrowRight data-icon="inline-end" /></Button>
          : <Button asChild variant="outline"><Link to="/yayinla"><Rocket data-icon="inline-start" />Yayınla sayfası</Link></Button>}
      </div>
    </>
  );
}

/* 1 · who it is */
function IdentityStep({ m, role, view, save }: { m: Mascot; role: MascotRoleInfo; view: MascotsView; save: Save }) {
  const [d, setD] = React.useState({ name: m.name, note: m.note });
  const auto = useAutosave(d, (v) => save({ name: v.name.trim(), note: v.note }), { ms: 600, skip: (v) => !v.name.trim(), label: `Maskot “${m.name}” adı` });
  const other = view.roles.find((r) => r.role !== m.role);
  const names = { learner: m.role === "learner" ? d.name.trim() || "…" : other?.builtin?.name ?? "", friend: m.role === "friend" ? d.name.trim() || "…" : other?.builtin?.name ?? "" };
  const forms = turkishForms(d.name.trim() || "…");
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_400px]">
      <Card><CardContent className="space-y-5">
        <div className="flex justify-end"><SaveChip state={auto.state} /></div>
        <FormField label="Adı" hint="Çocuğun duyduğu ve gördüğü ad. Kesme işaretini ve ekleri uygulama getirir.">
          <Input value={d.name} maxLength={24} onChange={(e) => setD({ ...d, name: e.target.value })} />
        </FormField>
        <div className="flex flex-wrap gap-1.5">
          {view.forms.map((f) => <Pill key={f} tone="plain">{forms[f] ?? d.name}</Pill>)}
        </div>
        <FormField label="Sesi" hint={m.voice === "own"
          ? `Uygulamadaki ${role.builtin?.name ?? "maskot"} sesiyle yapılmış kayıtlar çalınmaz: Ses stüdyosunda bu maskotun sesiyle kaydedilene kadar cihaz sesi okur.`
          : `Uygulamadaki ${role.builtin?.name ?? "maskot"} kayıtları çalar (aynı karakterin yeni görünüşü için doğru seçim).`}>
          <Chips value={m.voice} onChange={(v) => void save({ voice: v })} items={[
            { id: "keep", label: `${role.builtin?.name ?? "Uygulamanın"} sesi` }, { id: "own", label: "Kendi sesi (yeni karakter)" }]} />
        </FormField>
        <FormField label="Not (yalnız panelde)"><Textarea value={d.note} onChange={(e) => setD({ ...d, note: e.target.value })} placeholder="Kim çizdi, hangi sürüm, neyi değiştirdik?" /></FormField>
      </CardContent></Card>
      <Panel title="Çocuk böyle duyacak" icon={<Mic />} description="Uygulamanın kendi cümlelerinden birkaçı, bu adla.">
        <ul className="space-y-1.5 text-sm">
          {role.namedLines.slice(0, 6).map((l) => <li key={l.clip}>“{fillNames(l.template.replace("%", "…"), names)}”</li>)}
        </ul>
      </Panel>
    </div>
  );
}

/** a Lottie upload: refused by the server for anything that is not a playable file */
function useUpload() {
  const { addAssetMeta } = useStore();
  const [busy, setBusy] = React.useState("");
  const [error, setError] = React.useState("");
  const up = async (slot: string, f: File | undefined): Promise<string | null> => {
    if (!f) return null;
    setBusy(slot); setError("");
    try {
      const a = await uploadAsset(new Blob([await f.arrayBuffer()], { type: "application/json" }), f.name);
      addAssetMeta(a); forgetDoc(a.id); return a.id;
    } catch (e) { setError((e as Error).message); return null; }
    finally { setBusy(""); }
  };
  return { up, busy, error };
}

function FilePick({ label, busy, onFile }: { label: string; busy: boolean; onFile: (f: File | undefined) => void }) {
  const input = React.useRef<HTMLInputElement>(null);
  return (
    <>
      <Button variant="outline" size="sm" disabled={busy} onClick={() => input.current?.click()}>
        {busy ? <Spinner data-icon="inline-start" /> : <Upload data-icon="inline-start" />}{label}</Button>
      <input ref={input} type="file" accept=".json,application/json" className="hidden"
             onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ""; }} />
    </>
  );
}

/* 2 · the files: base, gaze, sets */
function FilesStep({ m, save }: { m: Mascot; save: Save }) {
  const { up, busy, error } = useUpload();
  const { db } = useStore();
  const size = (id: string | null) => (id ? fmtSize(db.assets.find((a) => a.id === id)?.size ?? 0) : "");
  const issues = m.issues.filter((i) => /Ana dosya|Bakış|seti/.test(i.text));
  const newSet = () => {
    const ids = new Set(m.sets.map((s) => s.id));
    let n = 1; while (ids.has(`set-${n}`)) n++;
    void save({ sets: [...m.sets, { id: `set-${n}`, label: "Duygular", kind: "feel", asset: null }] });
  };
  const setAt = (i: number, p: Partial<Mascot["sets"][number]>) => save({ sets: m.sets.map((s, k) => (k === i ? { ...s, ...p } : s)) });
  return (
    <div className="space-y-4">
      {error && <Notice tone="bad">{error}</Notice>}
      {issues.map((i) => <Notice key={i.text} tone={i.level === "error" ? "bad" : "warn"}>{i.text}</Notice>)}
      <div className="grid gap-4 md:grid-cols-2">
        <Panel title="Ana dosya" description="Rolün oynadığı her davranış, sözleşmedeki işaretçilerle. Sahneler ve yürüyüşler buradan oynar.">
          <div className="flex items-center gap-4">
            <Preview asset={m.base} role={m.role} size={112} />
            <div className="space-y-2 text-sm">
              {m.base && <div className="text-muted-foreground">{m.files.base?.length ?? 0} işaretçi · {size(m.base)}</div>}
              <FilePick label={m.base ? "Değiştir" : "Lottie yükle"} busy={busy === "base"}
                        onFile={async (f) => { const id = await up("base", f); if (id) await save({ base: id }); }} />
            </div>
          </div>
        </Panel>
        {m.role === "learner" && (
          <Panel title="Bakış dosyası (isteğe bağlı)" description="Kare numarası bakış açısıdır (70–130 merak bandı). Yoksa derste bu anlarda nefes alır.">
            <div className="flex items-center gap-4">
              <Preview asset={m.look} role={m.role} size={112} marker="__none__" />
              <div className="flex flex-col gap-2">
                <FilePick label={m.look ? "Değiştir" : "Lottie yükle"} busy={busy === "look"}
                          onFile={async (f) => { const id = await up("look", f); if (id) await save({ look: id }); }} />
                {m.look && <Button variant="ghost" size="sm" onClick={() => save({ look: null })}><X data-icon="inline-start" />Kaldır</Button>}
              </div>
            </div>
          </Panel>
        )}
      </div>
      <Panel title="Setler" icon={<Smile />} action={<Button size="sm" variant="outline" onClick={newSet}><Plus data-icon="inline-start" />Set ekle</Button>}
        description="Aynı maskotun başka dosyaları: bir duygu seti (sevinme, üzülme, ağlama…), bir yürüme seti. İşaretçileri Davranışlar adımında eşlenir.">
        {m.sets.length === 0 ? <p className="text-sm text-muted-foreground">Set yok: her davranış ana dosyadan oynar.</p> : (
          <div className="space-y-3">
            {m.sets.map((s, i) => (
              <div key={s.id} className="flex flex-wrap items-start gap-3 rounded-lg border p-3">
                <Preview asset={s.asset} role={m.role} size={72} marker={m.files[s.id]?.[0]?.name} />
                <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-2">
                  <FormField label="Adı"><Input defaultValue={s.label} maxLength={40} onBlur={(e) => e.target.value !== s.label && void setAt(i, { label: e.target.value })} /></FormField>
                  <FormField label="Türü"><Select value={s.kind} onChange={(e) => void setAt(i, { kind: e.target.value })}>
                    {SET_KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}</Select></FormField>
                  <div className="flex flex-wrap gap-1 sm:col-span-2">
                    {(m.files[s.id] ?? []).map((x) => <Pill key={x.name} tone="plain">{x.name} <span className="opacity-60">{x.to - x.from}k</span></Pill>)}
                    {s.asset && !(m.files[s.id] ?? []).length && <span className="text-xs text-destructive">Dosyada işaretçi yok: her klip bir işaretçiyle (marker) adlandırılmalı.</span>}
                  </div>
                </div>
                <div className="flex flex-col gap-1.5">
                  <FilePick label={s.asset ? "Değiştir" : "Lottie yükle"} busy={busy === s.id}
                            onFile={async (f) => { const id = await up(s.id, f); if (id) await setAt(i, { asset: id }); }} />
                  <Button variant="ghost" size="sm" className="hover:text-destructive" onClick={() => {
                    if (confirm(`"${s.label}" seti silinsin mi? Ona eşlenen davranışlar ana dosyaya döner.`)) void save({ sets: m.sets.filter((_, k) => k !== i) });
                  }}><Trash2 data-icon="inline-start" />Sil</Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}

/* 3 · what plays when */
function BehaviourStep({ m, role, save }: { m: Mascot; role: MascotRoleInfo; save: Save }) {
  const [watch, setWatch] = React.useState<{ key: string; ref: ClipRef } | null>(null);
  const setLabel = (set: string) => (set === "base" ? "Ana dosya" : m.sets.find((s) => s.id === set)?.label || set);
  const files = [{ id: "base", asset: m.base }, ...m.sets.map((s) => ({ id: s.id, asset: s.asset }))];
  const takes = (key: string): ClipRef[] => m.map[key]?.length ? m.map[key]! : [{ set: "base", marker: key }];
  const mapped = (key: string) => !!m.map[key]?.length;
  const put = (key: string, refs: ClipRef[]) => {
    const next = { ...m.map };
    /* back to the base file's own clip: no line in the map */
    if (!refs.length || (refs.length === 1 && refs[0]!.set === "base" && refs[0]!.marker === key)) delete next[key];
    else next[key] = refs;
    return save({ map: next });
  };
  const groups = (["rest", "feel", "talk", "verb"] as const).map((g) => [g, role.behaviours.filter((b) => b.group === g)] as const).filter(([, bs]) => bs.length);
  const watchAsset = watch ? files.find((f) => f.id === watch.ref.set)?.asset : null;
  const bad = m.issues.filter((i) => i.level === "error" && /işaretçisi yok|eşlenemez|davranışı değil|Sekme|Yürüme/.test(i.text));
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
      <div className="space-y-4">
        {!m.base && <Notice tone="warn">Önce ana dosyayı yükleyin (Dosyalar adımı).</Notice>}
        {bad.map((i) => <Notice key={i.text} tone="bad">{i.text}</Notice>)}
        {groups.map(([g, bs]) => (
          <Panel key={g} title={GROUP_LABEL[g]} contentClassName="space-y-2">
            {bs.map((b) => (
              <div key={b.key} className="flex flex-wrap items-center gap-2 rounded-lg border p-2.5">
                <div className="min-w-48 flex-1">
                  <div className="text-sm font-medium">{b.label} <span className="font-mono text-xs font-normal text-muted-foreground">{b.key}</span></div>
                  <div className="text-xs text-muted-foreground">{b.when}</div>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {takes(b.key).map((r, i) => (
                    <span key={`${r.set}/${r.marker}/${i}`} className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs",
                      watch?.key === b.key && watch.ref === r ? "border-primary bg-primary/10" : "bg-card")}>
                      <button type="button" onClick={() => setWatch({ key: b.key, ref: r })} title="İzle">
                        {i === 0 ? "" : "varyant · "}{setLabel(r.set)} · {r.marker}</button>
                      {mapped(b.key) && <button type="button" title="Çıkar" className="text-muted-foreground hover:text-destructive"
                        onClick={() => void put(b.key, takes(b.key).filter((_, k) => k !== i))}><X className="size-3" /></button>}
                    </span>
                  ))}
                  <Select className="h-7 w-44 text-xs" value="" onChange={(e) => {
                    const [set, marker] = e.target.value.split("|");
                    if (!set || !marker) return;
                    /* the first pick replaces the implicit base clip; later ones are variants */
                    void put(b.key, mapped(b.key) ? [...takes(b.key), { set, marker }] : [{ set, marker }]);
                  }}>
                    <option value="">{mapped(b.key) ? "+ varyant ekle" : "+ başka klip seç"}</option>
                    {files.map((f) => (m.files[f.id] ?? []).length ? (
                      <optgroup key={f.id} label={setLabel(f.id)}>
                        {(m.files[f.id] ?? []).map((x) => <option key={x.name} value={`${f.id}|${x.name}`}>{x.name}</option>)}
                      </optgroup>) : null)}
                  </Select>
                </div>
              </div>
            ))}
          </Panel>
        ))}
        <Panel title="Yürüyüş" icon={<Footprints />} description="Yürüyüşün kareleri sözleşmede sabit uzunlukta. Başka bir setten gelebilir; hangisinin nerede kullanılacağı Maskotlar sayfasındaki “Nasıl yürüsünler?” seçimi.">
          <div className="grid gap-3 sm:grid-cols-2">
            {([["walkSet", "Sekme (walk_*)"], ["strollSet", "Yürüme (stroll_*)"]] as const).map(([k, label]) => (
              <FormField key={k} label={label}>
                <Select value={m[k] ?? ""} onChange={(e) => void save({ [k]: e.target.value || null })}>
                  <option value="">Ana dosyadan</option>
                  {m.sets.map((s) => <option key={s.id} value={s.id}>{s.label || s.id}</option>)}
                </Select>
              </FormField>
            ))}
          </div>
        </Panel>
        <Notice tone="plain">Sahneler ({role.behaviours.filter((b) => b.group === "scene").length}) her zaman ana dosyadan, sözleşmedeki karelerde oynar: replikler ve dönüşler o karelere bağlı.</Notice>
      </div>
      <aside className="lg:sticky lg:top-4 lg:self-start">
        <Panel title="İzle" description={watch ? `${role.behaviours.find((b) => b.key === watch.key)?.label} · ${setLabel(watch.ref.set)} · ${watch.ref.marker}` : "Bir klibe tıklayın."}>
          <Preview asset={watchAsset ?? m.base} role={m.role} size={260} marker={watch?.ref.marker} />
        </Panel>
      </aside>
    </div>
  );
}

/* 4 · where it stands */
function StanceStep({ m, role, save }: { m: Mascot; role: MascotRoleInfo; save: Save }) {
  const { doc } = useDoc(m.base);
  const own = role.builtin?.foot;
  const [busy, setBusy] = React.useState(false);
  const [got, setGot] = React.useState<Measure | null>((m.report.rest as Measure | undefined) ?? null);
  const rest = restOf(doc, m.role);
  const run = async () => {
    if (!doc || !rest) return;
    setBusy(true);
    const r = await measure(doc, rest[0]);
    setBusy(false);
    if (!r) { alert("Dinlenme pozunda çizim bulunamadı."); return; }
    setGot(r);
    await save({ foot: { x: r.x, y: r.y, top: r.top }, report: { ...m.report, rest: r, at: Date.now() } });
  };
  const S = 300, px = (v: number) => `${(v * 100).toFixed(1)}%`;
  const f = m.foot;
  return (
    <div className="grid gap-6 lg:grid-cols-[auto_1fr]">
      <div className="relative" style={{ width: S, height: S }}>
        {doc && rest ? <LottieClip doc={doc} still={rest[0]} size={S} /> : <div style={{ width: S, height: S }} className="rounded-lg bg-muted" />}
        {own && <>
          <div className="pointer-events-none absolute inset-x-0 border-t-2 border-dashed border-muted-foreground/50" style={{ top: px(own.y) }} />
          <div className="pointer-events-none absolute inset-x-0 border-t-2 border-dashed border-muted-foreground/50" style={{ top: px(own.top) }} />
        </>}
        {f && <>
          <div className="pointer-events-none absolute inset-x-0 border-t-2 border-primary" style={{ top: px(f.y) }} />
          <div className="pointer-events-none absolute inset-x-0 border-t-2 border-primary/60" style={{ top: px(f.top) }} />
          <div className="pointer-events-none absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary" style={{ left: px(f.x), top: px(f.y) }} />
        </>}
      </div>
      <div className="space-y-4">
        <Panel title="Duruş" icon={<Ruler />} description="Haritada maskot ayaklarından patikaya oturur; ayakların nerede olduğu dinlenme pozunda ölçülür (görünen pikseller).">
          <div className="space-y-3 text-sm">
            <p>Kesik çizgiler: {role.builtin?.name}'nin başı ve ayakları. Mor: bu maskotunki.</p>
            {f ? <p>Ayak çizgisi {(f.y * 512).toFixed(0)} px, baş {(f.top * 512).toFixed(0)} px, ayak ortası {(f.x * 512).toFixed(0)} px
              {own && <> · {role.builtin?.name}: {(own.y * 512).toFixed(0)} / {(own.top * 512).toFixed(0)} / {(own.x * 512).toFixed(0)}</>}</p>
              : <p className="text-muted-foreground">Henüz ölçülmedi.</p>}
            {got && <p className="text-xs text-muted-foreground">Genişlik {(got.left * 512).toFixed(0)}–{(got.right * 512).toFixed(0)} px</p>}
            <Button disabled={!doc || !rest || busy} onClick={run}>{busy ? <Spinner data-icon="inline-start" /> : <Ruler data-icon="inline-start" />}Ölç ve kaydet</Button>
          </div>
        </Panel>
        {m.issues.filter((i) => /Duruşu|Ayak/.test(i.text)).map((i) => <Notice key={i.text} tone={i.level === "error" ? "bad" : "warn"}>{i.text}</Notice>)}
        <Notice tone="accent">Sahneler ve oyunlar maskotun yerini kendi ölçüleriyle ayırdı (masalar, tezgâhlar, yürüyüş yolları). Yeni karakter aynı 512 kutuda, aynı zemin çizgisinde ve benzer boyda çizilirse hiçbir ekran bozulmaz.</Notice>
      </div>
    </div>
  );
}

/* 5 · every line that says the name */
function NameStep({ m, role, view }: { m: Mascot; role: MascotRoleInfo; view: MascotsView }) {
  const { db, saveLine } = useStore();
  const own = role.builtin?.name ?? "";
  const other = view.roles.find((r) => r.role !== m.role)?.builtin?.name ?? "";
  const names = m.role === "learner" ? { learner: m.name, friend: other } : { learner: other, friend: m.name };
  const old = m.role === "learner" ? { learner: own, friend: other } : { learner: other, friend: own };
  const same = m.name.trim() === own;
  const re = new RegExp(`(^|[^\\p{L}])${own}('|[^\\p{L}]|$)`, "u");
  const studio = db.lines.filter((l) => re.test(l.text));
  return (
    <div className="space-y-4">
      {same ? <Notice tone="ok" icon={<Check />}>Adı {own}: uygulamadaki kayıtlar olduğu gibi çalınır.</Notice> : (
        <Notice tone="warn" icon={<AlertTriangle />}>Adı “{own}” değil “{m.name}”. Uygulamanın {role.namedLines.length} cümlesi bu adı söylüyor: telefon bunları
          yeni adla, ekleriyle kurar. Uygulamadaki “{own}” diyen kayıtlar bu maskot yayındayken çalınmaz; cümle cihaz sesiyle okunur ya da
          Ses stüdyosunda yeni adla kaydedilip yayınlanır.</Notice>
      )}
      <Panel title="Ses stüdyosundaki satırlar" icon={<Mic />}
        description={studio.length ? `${studio.length} sabit satır “${own}” diyor. Bu maskot yayındayken bunlar yayına girmez.` : `Ses stüdyosunda “${own}” diyen satır yok.`}
        action={studio.length && !same ? <Button size="sm" onClick={() => {
          if (!confirm(`${studio.length} satırda “${own}” → “${m.name}” (ekleriyle). Onaylı kayıtlar eski metinden kalır; yeniden kaydetmeniz gerekir.`)) return;
          for (const l of studio) saveLine({ ...l, text: renameIn(l.text, own, m.name.trim()) });
        }}>Satırlardaki adı değiştir</Button> : undefined}>
        {studio.length > 0 && (
          <ul className="space-y-1.5 text-sm">
            {studio.map((l) => <li key={l.clip}><span className="font-mono text-xs text-muted-foreground">{l.clip}</span> · {l.text}
              {!same && <span className="text-primary"> → {renameIn(l.text, own, m.name.trim())}</span>}</li>)}
          </ul>
        )}
      </Panel>
      <Panel title="Uygulamanın cümleleri" description="Telefonun kendi metinleri; ad belirteçle yazılı ({L}, {F}) ve ekleri dile göre gelir.">
        <ul className="max-h-96 space-y-1 overflow-y-auto text-sm">
          {role.namedLines.map((l) => (
            <li key={l.clip} className="grid gap-x-3 sm:grid-cols-[180px_1fr]">
              <span className="font-mono text-xs text-muted-foreground">{l.clip}</span>
              <span>{same ? fillNames(l.template, old) : <>{fillNames(l.template, names)} <span className="text-xs text-muted-foreground line-through">{fillNames(l.template, old)}</span></>}</span>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}

/* 6 · the checks, and live or not */
function PublishStep({ m, save }: { m: Mascot; save: Save }) {
  const errs = m.issues.filter((i) => i.level === "error"), warns = m.issues.filter((i) => i.level === "warn");
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <div className="space-y-3">
        {errs.length === 0 && warns.length === 0 && <Notice tone="ok" icon={<Check />}>Her şey yerinde.</Notice>}
        {errs.map((i) => <Notice key={i.text} tone="bad" icon={<AlertTriangle />}>{i.text}</Notice>)}
        {warns.map((i) => <Notice key={i.text} tone="warn">{i.text}</Notice>)}
      </div>
      <Panel title="Uygulamada mı?" icon={<Smartphone />}
        description="Bir rolde tek maskot uygulamada olur: bunu koymak aynı roldeki öbürünü taslağa alır. Telefona bir sonraki yayınla gider.">
        <Chips value={m.status} onChange={(s) => void save({ status: s })}
          items={[{ id: "draft", label: "Taslak" }, { id: "live", label: "Uygulamada" }, { id: "hidden", label: "Gizli" }]} />
        {errs.length > 0 && <p className="mt-2 text-xs text-destructive">Hataları giderilmeden uygulamaya konamaz.</p>}
        <Button asChild variant="outline" size="sm" className="mt-3"><Link to="/yayinla"><Rocket data-icon="inline-start" />Yayınla</Link></Button>
      </Panel>
    </div>
  );
}

