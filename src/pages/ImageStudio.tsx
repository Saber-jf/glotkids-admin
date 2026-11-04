import React from "react";
import { CheckCircle2, Download, Eraser, ImagePlus, KeyRound, Layers, Loader2, Sparkles,
         Trash2, Wand2, XCircle } from "lucide-react";
import { Thumb } from "../components/Media";
import { EmptyState, FormField, Modal, ModalActions, Notice, PageHeader, Panel, Pill, Select } from "../components/common";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useStore } from "../store";
import { assetBlob as blobOf, useAssetUrl } from "../blobs";
import { useVocab } from "../vocab";
import { QUALITIES, QUALITY_LABEL, STYLES, clearBackground, costOf, type Quality } from "../imagegen";
import { ApiError, codeOf, getJob, images, newJobId, type Job } from "../api";
import { KeyCard, useKeys } from "../components/Keys";
import type { Asset, GenImage, ImageKind, ImageProvider } from "../types";
import type { Word } from "../api";
import { GameIcon } from "../components/GameParts";
import { useSticky } from "../lib/sticky";

const PROVIDER_NAME: Record<ImageProvider, string> = { openai: "OpenAI", gemini: "Gemini" };
/* a transparency checkerboard that follows the theme */
const CHECKER = { backgroundImage: "conic-gradient(var(--muted) 25%, var(--card) 0 50%, var(--muted) 0 75%, var(--card) 0)", backgroundSize: "16px 16px" };
const usd = (n: number) => `$${n.toFixed(n < 0.1 ? 3 : 2)}`;


export function ImageStudio() {
  const keys = useKeys();
  const hasKey = !keys || keys.openai.set || keys.gemini.set;
  const asked = new URLSearchParams(window.location.search).get("sekme");
  /* a link that names a tab opens it; otherwise the tab last looked at */
  const [kept, setKept] = useSticky<"make" | "batch" | "settings" | "">("image.tab", "");
  const [tab, setTabNow] = React.useState<"make" | "batch" | "settings">(
    asked === "uret" ? "make" : asked === "toplu" ? "batch" : asked === "ayarlar" ? "settings" : kept || (hasKey ? "make" : "settings"));
  const setTab = (t: "make" | "batch" | "settings") => { setTabNow(t); setKept(t); };
  return (
    <>
      <PageHeader title="Görsel stüdyosu"
        sub="Kelime ikonlarını ve sahne arka planlarını OpenAI ya da Gemini ile üretin. İkonlar uygulamanın ikon setini stil örneği olarak alabilir; her üretilen görsel kaydedilir, beğenileni kelimeye atarsınız." />
      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)} className="mb-6">
        <TabsList>
          {([["make", "Üret", Wand2], ["batch", "Toplu ikon", Layers], ["settings", "Ayarlar", KeyRound]] as const).map(([id, label, Icon]) => (
            <TabsTrigger key={id} value={id}><Icon />{label}</TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      {tab === "make" ? <Make /> : tab === "batch" ? <Batch /> : <Settings />}
    </>
  );
}

/* ── shared: the options every generation takes ────────────────────────────── */

interface Opts { provider: ImageProvider; quality: Quality; n: number; useRefs: boolean; refs: string[]; clean: boolean }

function useOpts(kind: ImageKind): [Opts, (p: Partial<Opts>) => void] {
  const { db } = useStore();
  /* the app's own word pictures are the house style */
  const icons = db.assets.filter((a) => a.kind === "image" && /^(app-word-|seed-icon-)/.test(a.id)).slice(0, 3).map((a) => a.id);
  const [o, setO] = useSticky<Opts>(`image.opts.${kind}`, { provider: db.imageSettings.provider, quality: "medium", n: 2,
    useRefs: kind === "icon", refs: icons, clean: kind === "icon" });
  return [o, (p) => setO((x) => ({ ...x, ...p }))];
}

function OptsFields({ o, set, kind }: { o: Opts; set: (p: Partial<Opts>) => void; kind: ImageKind }) {
  const { db } = useStore();
  const keys = useKeys();
  const [picking, setPicking] = React.useState(false);
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-[1.5fr_1fr_0.7fr] gap-2">
        <FormField label="Sağlayıcı">
          <Select value={o.provider} onChange={(e) => set({ provider: e.target.value as ImageProvider })}>
            {(["openai", "gemini"] as ImageProvider[]).map((p) => (
              <option key={p} value={p}>{PROVIDER_NAME[p]}{keys?.[p].set ? "" : " (anahtar yok)"}</option>
            ))}
          </Select>
        </FormField>
        <FormField label="Kalite">
          <Select value={o.quality} onChange={(e) => set({ quality: e.target.value as Quality })} disabled={o.provider === "gemini"}>
            {QUALITIES.map((q) => <option key={q} value={q}>{QUALITY_LABEL[q]}</option>)}
          </Select>
        </FormField>
        <FormField label="Adet">
          <Select value={o.n} onChange={(e) => set({ n: Number(e.target.value) })}>
            {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}</option>)}
          </Select>
        </FormField>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <Checkbox checked={o.useRefs} onCheckedChange={(v) => set({ useRefs: v === true })} />
        Stil örneği gönder
      </label>
      {o.useRefs && (
        <div className="flex flex-wrap items-center gap-2">
          {o.refs.map((id) => (
            <button key={id} type="button" onClick={() => set({ refs: o.refs.filter((x) => x !== id) })} title="Çıkar"
                    className="rounded-md ring-1 ring-border transition hover:ring-2 hover:ring-destructive"><Thumb asset={db.assets.find((a) => a.id === id)} size={44} /></button>
          ))}
          {o.refs.length < 4 && <Button variant="outline" size="sm" onClick={() => setPicking(true)}><ImagePlus />Ekle</Button>}
        </div>
      )}
      {kind === "icon" && (
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={o.clean} onCheckedChange={(v) => set({ clean: v === true })} />
          Düz arka planı şeffaf yap{o.provider === "openai" ? " (OpenAI zaten şeffaf üretir)" : ""}
        </label>
      )}
      {picking && (
        <Modal title="Stil örneği seç" onClose={() => setPicking(false)} wide>
          <div className="grid grid-cols-4 gap-3 sm:grid-cols-6">
            {db.assets.filter((a) => a.kind === "image" && !o.refs.includes(a.id)).map((a) => (
              <button key={a.id} type="button" onClick={() => { set({ refs: [...o.refs, a.id] }); setPicking(false); }}
                      className="rounded-lg border p-2 transition-colors hover:border-primary/50 hover:bg-primary/5"><Thumb asset={a} size={64} /></button>
            ))}
          </div>
        </Modal>
      )}
    </div>
  );
}

/** a style example as the server wants it: its own file by id, or the bytes */
async function refOf(a: Asset): Promise<{ id?: string; b64?: string; mime?: string } | null> {
  if (a.url?.startsWith("/api/assets/")) return { id: a.id };
  const b = await blobOf(a, "image");
  const b64 = await new Promise<string>((res) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(",")[1] ?? "");
    r.readAsDataURL(b);
  });
  return { b64, mime: b.type || "image/png" };
}

/**
 * A paid picture job, survived: if the answer is lost on the way (the
 * connection dropped), the same job is read back from the server instead of
 * being paid for again (S08).
 */
async function runImageJob(body: Record<string, unknown> & { jobId: string }): Promise<Job> {
  try { return await images(body); }
  catch (e) {
    if (e instanceof ApiError && e.status === 0) {
      for (let i = 0; i < 20; i++) {
        await new Promise((r) => setTimeout(r, 3000));
        try { const j = await getJob(body.jobId); if (j.status !== "running") return j; } catch { /* still away */ }
      }
    }
    throw e;
  }
}

/** run one generation: the server makes and stores the pictures, this keeps
 *  a record of EACH -- the original always, and for a Gemini icon a cleared
 *  copy beside it when that works (A04: a failed clean never loses the
 *  original, and nothing is called done that is not usable) */
function useGenerate() {
  const { db, addAsset, addAssetMeta, addGen } = useStore();
  return async (o: Opts, kind: ImageKind, prompt: string, subject: string): Promise<string[]> => {
    const model = o.provider === "openai" ? db.imageSettings.openaiModel : db.imageSettings.geminiModel;
    const refs = o.useRefs
      ? (await Promise.all(o.refs.map((id) => db.assets.find((a) => a.id === id)).filter((a): a is Asset => !!a).map(refOf)))
          .filter((r): r is NonNullable<typeof r> => !!r)
      : [];
    const name = subject.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "gorsel";
    const job = await runImageJob({ provider: o.provider, model, kind, prompt, n: o.n, quality: o.quality, refs, name, jobId: newJobId() });
    const problems = [...job.errors];
    for (const raw of job.assets) {
      addAssetMeta(raw);
      addGen({ asset: raw.id, kind, provider: o.provider, model, prompt, subject });
      if (kind === "icon" && o.clean && o.provider === "gemini") {
        try {
          const b = await blobOf(raw, "image");
          const a = await addAsset(new File([await clearBackground(b)], raw.name.replace(/\.(png|jpe?g|webp)$/i, "") + "-seffaf.png", { type: "image/png" }));
          if (!a) throw new Error("şeffaf kopya yüklenemedi");
          addGen({ asset: a.id, kind, provider: o.provider, model, prompt: prompt + " [arka plan temizlendi]", subject });
        } catch (e) { problems.push(`Şeffaflaştırılamadı (orijinal duruyor): ${(e as Error).message}`); }
      }
    }
    return problems;
  };
}

/* ── make one ──────────────────────────────────────────────────────────────── */

function Make() {
  const { db } = useStore();
  const keys = useKeys();
  const [kind, setKind] = useSticky<ImageKind>("image.make.kind", "icon", (k) => STYLES.some((s) => s.kind === k));
  const styles = STYLES.filter((s) => s.kind === kind);
  const [style, setStyle] = useSticky("image.make.style", styles[0]!.id, (id) => styles.some((s) => s.id === id));
  const [subject, setSubject] = React.useState("");
  const [prompt, setPrompt] = React.useState("");
  const [edited, setEdited] = React.useState(false);
  const [o, set] = useOpts(kind);
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState("");
  const run = useGenerate();
  const st = STYLES.find((s) => s.id === style) ?? styles[0]!;
  React.useEffect(() => { if (!edited) setPrompt(st.prompt(subject || (kind === "icon" ? "red apple" : "a sunny meadow"))); }, [subject, style, kind, edited]);
  const cost = costOf(o.provider, kind, o.quality) * o.n;
  const go = async () => {
    setBusy(true); setErr("");
    try { const p = await run(o, kind, prompt, subject || st.name); if (p.length) setErr(p.join(" · ")); }
    catch (e) { setErr((e as Error).message); }
    setBusy(false);
  };
  const list = db.gens.filter((g) => g.kind === kind);

  return (
    <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
      <Card className="h-fit lg:sticky lg:top-20">
        <CardContent className="space-y-4">
          <Tabs value={kind} onValueChange={(v) => { const k = v as ImageKind; setKind(k); setStyle(STYLES.find((x) => x.kind === k)!.id); setEdited(false); }}>
            <TabsList className="w-full">
              <TabsTrigger value="icon">İkon</TabsTrigger>
              <TabsTrigger value="background">Arka plan</TabsTrigger>
            </TabsList>
          </Tabs>
          <FormField label="Konu" hint={kind === "icon" ? "İngilizce yazmak daha iyi sonuç verir: \"red apple\", \"a pair of socks\"." : "ör. \"a sunny beach with an island\", \"a cosy kitchen\""}>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder={kind === "icon" ? "red apple" : "a sunny meadow"} />
          </FormField>
          <FormField label="Stil">
            <Select value={style} onChange={(e) => { setStyle(e.target.value); setEdited(false); }}>
              {styles.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </FormField>
          <FormField label="İstem (prompt)" hint={edited ? "Elle düzenlendi — stil ya da konu değişince yenilenmez." : "Stil ve konudan kuruldu; düzenleyebilirsiniz."}>
            <Textarea value={prompt} onChange={(e) => { setPrompt(e.target.value); setEdited(true); }} className="min-h-[130px] font-mono text-xs" />
          </FormField>
          <OptsFields o={o} set={set} kind={kind} />
          {err && <Notice tone="bad" icon={<XCircle />}>{err}</Notice>}
          <Button className="w-full" size="lg" disabled={busy || !keys?.[o.provider].set || !prompt.trim()} onClick={go}>
            {busy ? <Spinner data-icon="inline-start" /> : <Sparkles data-icon="inline-start" />}
            {busy ? "Üretiliyor…" : `${o.n} görsel üret · ≈ ${usd(cost)}`}
          </Button>
          {keys && !keys[o.provider].set && <p className="text-xs font-medium text-warning">{PROVIDER_NAME[o.provider]} anahtarı ayarlı değil (Ayarlar sekmesi).</p>}
        </CardContent>
      </Card>
      <div className="min-w-0">
        <h2 className="mb-3 font-heading text-base font-semibold">Üretilenler <span className="font-normal text-muted-foreground">({list.length})</span></h2>
        {list.length === 0
          ? <EmptyState icon={<Wand2 />} title="Henüz üretilmiş görsel yok" sub="Soldan bir konu yazıp üretin. Her sonuç burada kalır." />
          : <div className={cn("grid gap-4", kind === "icon" ? "grid-cols-2 sm:grid-cols-3 xl:grid-cols-4" : "grid-cols-1 sm:grid-cols-2")}>
              {list.map((g) => <GenCard key={g.id} g={g} />)}
            </div>}
      </div>
    </div>
  );
}

function GenCard({ g, onUse, used }: { g: GenImage; onUse?: () => void; used?: boolean }) {
  const { db, addAsset, addGen, removeGen, removeAsset } = useStore();
  const { words } = useVocab();
  const asset = db.assets.find((a) => a.id === g.asset);
  const url = useAssetUrl(asset);
  const [assigning, setAssigning] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const inUse = words.some((w) => w.icon === g.asset);
  const clean = async () => {
    if (!asset) return;
    setBusy(true);
    try {
      const b = await blobOf(asset, "image");
      const a = await addAsset(new File([await clearBackground(b)], asset.name.replace(/\.(png|jpe?g|webp)$/i, "") + "-seffaf.png", { type: "image/png" }));
      if (!a) throw new Error("şeffaf kopya yüklenemedi");
      addGen({ ...g, asset: a.id, prompt: g.prompt + " [arka plan temizlendi]" });
    } catch (e) { alert(`Şeffaflaştırılamadı; orijinal duruyor. ${(e as Error).message}`); }
    setBusy(false);
  };
  return (
    <Card className={cn("gap-0 py-0", used && "ring-2 ring-success")}>
      <div className={cn("flex items-center justify-center border-b", g.kind === "icon" ? "aspect-square" : "aspect-video")} style={CHECKER}>
        {url ? <img src={url} alt={g.subject} className="h-full w-full object-contain" /> : <Loader2 className="animate-spin text-muted-foreground" />}
      </div>
      <div className="space-y-2 p-3">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <Pill tone="accent">{PROVIDER_NAME[g.provider]}</Pill>
          {inUse && <Pill tone="ok"><CheckCircle2 /> kelimede</Pill>}
          <span className="min-w-0 truncate text-xs text-muted-foreground" title={g.prompt}>{g.subject}</span>
        </div>
        <div className="flex flex-wrap items-center gap-1">
          {onUse ? <Button variant={used ? "ghost" : "secondary"} size="sm" onClick={onUse} disabled={used}>{used ? "Kullanılıyor" : "Bunu kullan"}</Button>
            : g.kind === "icon" && <Button variant="secondary" size="sm" onClick={() => setAssigning(true)}>Kelimeye ata</Button>}
          {g.kind === "icon" && <Button variant="ghost" size="icon-sm" onClick={clean} disabled={busy} title="Düz arka planı şeffaf yap">
            {busy ? <Spinner /> : <Eraser />}</Button>}
          {url && <Button asChild variant="ghost" size="icon-sm"><a href={url} download={asset?.name} title="İndir"><Download /></a></Button>}
          <Button variant="ghost" size="icon-sm" title="Sil" className="ml-auto hover:bg-destructive/10 hover:text-destructive" onClick={async () => {
            if (!confirm("Bu görsel galeriden kaldırılsın mı? Başka bir yerde kullanılmıyorsa dosyası da silinir.")) return;
            /* the gallery record goes; the FILE goes only if the server says
               nothing else uses it (S06/A05) -- a card or a word keeps it */
            try { await removeAsset(g.asset, true); removeGen(g.id); }
            catch (e) {
              if (codeOf(e) === "ASSET_IN_USE") { removeGen(g.id); alert(`Galeriden kaldırıldı. Dosya silinmedi: ${(e as Error).message}`); }
              else alert(`Silinemedi: ${(e as Error).message}`);
            }
          }}><Trash2 /></Button>
        </div>
      </div>
      {assigning && <Assign g={g} onClose={() => setAssigning(false)} />}
    </Card>
  );
}

function Assign({ g, onClose }: { g: GenImage; onClose: () => void }) {
  const { sets, wordOf, updateWord } = useVocab();
  const [set, setSet] = useSticky("image.assign.set", sets.find((s) => !s.builtin)?.id ?? sets[0]?.id ?? "", (id) => !sets.length || sets.some((s) => s.id === id));
  const words = (sets.find((s) => s.id === set)?.words ?? []).map(wordOf).filter((w): w is Word => !!w);
  return (
    <Modal title="Kelimeye ikon olarak ata" onClose={onClose}>
      <div className="space-y-4">
        <FormField label="Kelime seti">
          <Select value={set} onChange={(e) => setSet(e.target.value)}>
            {sets.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        </FormField>
        {/* F08: the app's own words draw their picture from the app; the server refuses a new one */}
        {words.some((w) => w.builtin) && <p className="text-xs text-muted-foreground">Soluk olanlar uygulamanın kendi kelimeleri: resimleri uygulamada çizili, buradan değişmez.</p>}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {words.map((w) => (
            <button key={w.id} type="button" disabled={w.builtin} title={w.builtin ? "Uygulamanın kelimesi: resmi uygulamada" : undefined}
                    onClick={() => { updateWord(w.id, { icon: g.asset }).then(onClose).catch((e: Error) => alert(`Atanamadı (görsel galeride duruyor): ${e.message}`)); }}
                    className="flex items-center gap-2 rounded-lg border p-2 text-left transition-colors enabled:hover:border-primary/50 enabled:hover:bg-primary/5 disabled:opacity-40">
              <GameIcon icon={w.icon} size={36} />
              <span className="text-sm font-medium" style={{ color: w.color }}>{w.en}</span>
            </button>
          ))}
        </div>
      </div>
    </Modal>
  );
}

/* ── batch: icons for a set's words ────────────────────────────────────────── */

function Batch() {
  const { db } = useStore();
  const { sets, wordOf, updateWord } = useVocab();
  const keys = useKeys();
  const wordsOf = (id: string) => (sets.find((s) => s.id === id)?.words ?? []).map(wordOf).filter((w): w is Word => !!w);
  /* F08: only a word the panel may change can take a picture -- the app's own
     words are drawn by the app, and the server refuses a new icon for them.
     So they are never chosen, never counted as missing, never paid for. */
  const needs = (w: Word) => !w.builtin && !w.icon;
  /* open on the first set that is missing pictures it can take */
  const [setId, setSetId] = useSticky("image.batch.set", (sets.find((s) => wordsOf(s.id).some(needs)) ?? sets.find((s) => !s.builtin) ?? sets[0])?.id ?? "",
                                      (id) => !sets.length || sets.some((s) => s.id === id));
  const found = sets.find((s) => s.id === setId);
  const set = found ? { id: found.id, name: found.name, words: wordsOf(found.id) } : undefined;
  const setWordIcon = (_set: string, word: string, asset: string) => {
    updateWord(word, { icon: asset }).catch((e: Error) => alert(`Görsel üretildi ama kelimeye atanamadı; galeride duruyor, yeniden ücret ödemeden tekrar atanabilir. (${e.message})`));
  };
  const [style, setStyle] = useSticky("image.batch.style", "app-icon", (id) => STYLES.some((s) => s.id === id));
  const [o, setO] = useOpts("icon");
  const [sel, setSel] = React.useState<Set<string>>(new Set());
  const [confirming, setConfirming] = React.useState(false);
  const [progress, setProgress] = React.useState<{ done: number; of: number; errors: string[] } | null>(null);
  const run = useGenerate();
  /* leaving the page stops the batch: no NEW paid call starts unseen (A07);
     one already out finishes and is kept by the server */
  const alive = React.useRef(true);
  React.useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  React.useEffect(() => { setSel(new Set(set?.words.filter(needs).map((w) => w.id) ?? [])); }, [setId]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!set) return <EmptyState icon={<Layers />} title="Kelime seti yok" />;
  const st = STYLES.find((s) => s.id === style)!;
  const chosen = set.words.filter((w) => sel.has(w.id) && !w.builtin);
  const fixed = set.words.filter((w) => w.builtin).length;
  const cost = costOf(o.provider, "icon", o.quality) * o.n * chosen.length;
  const go = async () => {
    setConfirming(false);
    const p = { done: 0, of: chosen.length, errors: [] as string[] };
    setProgress({ ...p });
    for (const w of chosen) {
      if (!alive.current) return;
      try { (await run(o, "icon", st.prompt(w.en), `${set.id}/${w.id}`)).forEach((m) => p.errors.push(`${w.en}: ${m}`)); }
      catch (e) { p.errors.push(`${w.en}: ${(e as Error).message}`); }
      p.done++;
      if (alive.current) setProgress({ ...p });
    }
  };
  return (
    <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
      <Card className="h-fit lg:sticky lg:top-20">
        <CardContent className="space-y-4">
          <FormField label="Kelime seti">
            <Select value={setId} onChange={(e) => setSetId(e.target.value)}>
              {sets.map((s) => {
                const ws = wordsOf(s.id), own = ws.filter((w) => !w.builtin);
                return <option key={s.id} value={s.id}>{s.name} ({own.length ? `${own.filter((w) => !w.icon).length} ikon eksik` : "uygulamanın kelimeleri — resimleri uygulamada"})</option>;
              })}
            </Select>
          </FormField>
          {fixed > 0 && <Notice tone="plain">{fixed === set.words.length
            ? "Bu setin bütün kelimeleri uygulamanın kendi kelimeleri: resimleri uygulamada çizili, burada üretilen bir görsel onlara atanamaz."
            : `${fixed} kelime uygulamanın kendi kelimesi: seçilemez, resmi uygulamada.`}</Notice>}
          <FormField label="Stil">
            <Select value={style} onChange={(e) => setStyle(e.target.value)}>
              {STYLES.filter((s) => s.kind === "icon").map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </FormField>
          <OptsFields o={o} set={setO} kind="icon" />
          <Button className="w-full" size="lg"
                  disabled={!chosen.length || !keys?.[o.provider].set || (progress !== null && progress.done < progress.of)}
                  onClick={() => setConfirming(true)}>
            <Sparkles data-icon="inline-start" />{chosen.length} kelime için üret · ≈ {usd(cost)}
          </Button>
          {progress && (
            <div className="space-y-1.5">
              <Progress value={(progress.done / progress.of) * 100} className="h-2" />
              <div className="text-xs text-muted-foreground tabular-nums">{progress.done} / {progress.of}</div>
              {progress.errors.map((e, i) => <div key={i} className="text-xs font-medium text-destructive">{e}</div>)}
            </div>
          )}
        </CardContent>
      </Card>
      <div className="min-w-0 space-y-3">
        {set.words.map((w) => {
          const cands = db.gens.filter((g) => g.subject === `${set.id}/${w.id}`);
          return (
            <Card key={w.id} size="sm">
              <CardContent className="space-y-3">
                <div className="flex items-center gap-3">
                  <Checkbox checked={sel.has(w.id) && !w.builtin} disabled={w.builtin} aria-label={`${w.en} seç`}
                            onCheckedChange={() => setSel((s) => { const n = new Set(s); if (n.has(w.id)) n.delete(w.id); else n.add(w.id); return n; })} />
                  <div className="rounded-md" style={CHECKER}><GameIcon icon={w.icon} size={48} /></div>
                  <div>
                    <div className="font-medium" style={{ color: w.color }}>{w.en}</div>
                    <div className="text-xs text-muted-foreground">{w.tr} · {w.builtin ? "uygulamanın kelimesi: resmi uygulamada" : w.icon ? "ikonu var" : "ikon yok"}</div>
                  </div>
                  <span className="ml-auto text-xs text-muted-foreground">{cands.length} aday</span>
                </div>
                {cands.length > 0 && (
                  <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 xl:grid-cols-6">
                    {cands.map((g) => <GenCard key={g.id} g={g} used={w.icon === g.asset} onUse={w.builtin ? undefined : () => setWordIcon(set.id, w.id, g.asset)} />)}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
      {confirming && (
        <Modal title="Üretmeden önce" onClose={() => setConfirming(false)}>
          <div className="space-y-2 text-sm">
            <p>{chosen.length} kelime × {o.n} görsel = <b>{chosen.length * o.n} görsel</b>, {PROVIDER_NAME[o.provider]} ile.</p>
            <p>Tahmini maliyet: <b>≈ {usd(cost)}</b> <span className="text-muted-foreground">(sağlayıcının yayımlanmış fiyatlarına göre yaklaşık)</span></p>
          </div>
          <ModalActions>
            <Button variant="ghost" onClick={() => setConfirming(false)}>Vazgeç</Button>
            <Button onClick={go}><Sparkles data-icon="inline-start" />Üret</Button>
          </ModalActions>
        </Modal>
      )}
    </div>
  );
}

/* ── settings ──────────────────────────────────────────────────────────────── */

function Settings() {
  const { db, saveImageSettings } = useStore();
  const s = db.imageSettings;
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <KeyCard name="openai" hint="platform.openai.com → API keys. Görsel modelleri için kuruluş doğrulaması gerekebilir." />
      <KeyCard name="gemini" hint="aistudio.google.com → Get API key." />
      <Panel title="Modeller" className="lg:col-span-2"
             description="Sağlayıcılar yeni model çıkardıkça adı buradan değiştirilir. Maliyetler yaklaşıktır; güncel fiyat için sağlayıcının sayfasına bakın.">
        <div className="grid gap-4 sm:grid-cols-3">
          <FormField label="Varsayılan sağlayıcı">
            <Select value={s.provider} onChange={(e) => saveImageSettings({ ...s, provider: e.target.value as ImageProvider })}>
              <option value="openai">OpenAI</option><option value="gemini">Gemini</option>
            </Select>
          </FormField>
          <FormField label="OpenAI görsel modeli" hint="ör. gpt-image-1">
            <Input value={s.openaiModel} onChange={(e) => saveImageSettings({ ...s, openaiModel: e.target.value.trim() })} />
          </FormField>
          <FormField label="Gemini görsel modeli" hint="ör. gemini-2.5-flash-image">
            <Input value={s.geminiModel} onChange={(e) => saveImageSettings({ ...s, geminiModel: e.target.value.trim() })} />
          </FormField>
        </div>
      </Panel>
    </div>
  );
}
