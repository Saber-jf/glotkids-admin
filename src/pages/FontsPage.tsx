/**
 * YAZI TİPİ (2026-10-23): the app's type, managed here.
 *
 * The app draws every text in one of four ROLES (server: modules/fonts.ts;
 * app: src/content/typography.ts): titles and buttons, a strong emphasis,
 * descriptions and forms, and those a little stronger. Each role has the
 * app's own face (Fredoka TR / Nunito, in every build, offline). Here a role
 * can be given another face: upload a TTF/OTF of the role's weight, the
 * server reads the file (its names, weight, every required letter it lacks,
 * the shortest safe line), and a font with no error and a licence can be put
 * in play. Publishing sends it to the phones; a phone loads it in the menu
 * and changes all its faces at once, or keeps the app's own.
 *
 * The previews are drawn with the uploaded file itself (the browser's
 * FontFace), with the Turkish letters that went missing once.
 */
import React from "react";
import { AlertTriangle, Check, RotateCcw, Trash2, Type, Upload } from "lucide-react";
import { codeOf, createFont, deleteFont, fetchFile, getFonts, patchFont, uploadAsset,
         type FontPatch, type FontRole, type FontRoleInfo, type FontsView, type PanelFont } from "../api";
import { assetUrl } from "../blobs";
import { FormField, Loading, Notice, PageHeader, Panel, Pill, SaveChip } from "../components/common";
import { flushEdits, useAutosave } from "@/lib/autosave";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const SAMPLE = ["Başlayalım", "Öğreniyorum · Küçük arkadaşım", "Çç Ğğ İı Öö Şş Üü · 0123456789", "banana · apple · cheese"];
const STATUS_LABEL = { live: "Uygulamada", draft: "Taslak", hidden: "Gizli" } as const;

/* ── the file, as the browser draws it ────────────────────────────────────── */

const loaded = new Map<string, Promise<string>>();
/** a family name the page can use for this asset's font (loaded once) */
function useFace(asset: string | null | undefined): { family: string | null; error: string } {
  const [state, setState] = React.useState<{ family: string | null; error: string }>({ family: null, error: "" });
  React.useEffect(() => {
    if (!asset) { setState({ family: null, error: "" }); return; }
    let live = true;
    if (!loaded.has(asset)) loaded.set(asset, (async () => {
      const blob = await fetchFile(assetUrl(asset));
      const fam = `panel-${asset}`;
      const face = new FontFace(fam, await blob.arrayBuffer());
      await face.load();
      document.fonts.add(face);
      return fam;
    })());
    loaded.get(asset)!.then((family) => { if (live) setState({ family, error: "" }); },
                            (e) => { loaded.delete(asset); if (live) setState({ family: null, error: (e as Error).message }); });
    return () => { live = false; };
  }, [asset]);
  return state;
}

function Sample({ asset, big = false }: { asset: string | null | undefined; big?: boolean }) {
  const { family, error } = useFace(asset);
  if (!asset) return <div className="text-sm text-muted-foreground">Dosya yok</div>;
  if (error) return <Notice tone="bad">Önizleme açılamadı: {error}</Notice>;
  if (!family) return <Loading>Font yükleniyor…</Loading>;
  return (
    <div style={{ fontFamily: `"${family}"` }} className="space-y-1 rounded-lg bg-muted/40 p-3 text-foreground">
      {SAMPLE.map((t, i) => <div key={t} style={{ fontSize: big && i === 0 ? 34 : i === 0 ? 26 : 18, lineHeight: 1.35 }}>{t}</div>)}
    </div>
  );
}

/* ── the page ─────────────────────────────────────────────────────────────── */

export function FontsPage() {
  const [view, setView] = React.useState<FontsView | null>(null);
  const [error, setError] = React.useState("");
  const load = React.useCallback(async () => {
    try { setView(await getFonts()); setError(""); } catch (e) { setError((e as Error).message); }
  }, []);
  React.useEffect(() => { void load(); }, [load]);
  if (error) return <Notice tone="bad">{error}</Notice>;
  if (!view) return <Loading />;
  if (!view.contract) return <Notice tone="warn" icon={<AlertTriangle />}>Sunucu uygulamanın yazı tipi sözleşmesini henüz bilmiyor. Uygulama klasöründe <code>npm run inventory</code> çalıştırıp envanteri gönderin (Uygulama sayfası).</Notice>;
  return (
    <>
      <PageHeader title="Yazı tipi"
        sub="Uygulamadaki her yazı dört rolden birindedir. Her rolün uygulamanın içinde gelen kendi fontu vardır; burada bir role başka bir font verebilirsiniz. Yayınla telefonlara gider, uygulama güncellemesi gerekmez." />
      <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          {view.roles.map((r) => <RoleCard key={r.role} role={r} view={view} reload={load} />)}
        </div>
        <aside className="space-y-4">
          <Panel title="Kurallar" icon={<Type />}>
            <ul className="list-disc space-y-1.5 pl-4 text-sm text-muted-foreground">
              <li><b className="font-medium text-foreground">TTF ya da OTF</b>, tek bir ağırlık. WOFF/WOFF2 (web) ve değişken fontlar telefonda güvenle çalışmaz, kabul edilmez.</li>
              <li>Dosyanın <b className="font-medium text-foreground">ağırlığı rolün ağırlığı</b> olmalı (başlık 600, vurgu 700, metin 400, vurgulu metin 600). Telefon kalınlığı taklit etmez.</li>
              <li>Bütün <b className="font-medium text-foreground">Türkçe harfler</b> (Ğ ğ İ ı Ş ş …), İngilizce ve planlanan dillerin harfleri dosyada olmalı. Eksik harf telefonda sistem fontuyla çizilir; aynı kelimede iki font görünür.</li>
              <li>Lisans yazılmadan font uygulamaya konamaz.</li>
            </ul>
          </Panel>
          <Panel title="Telefonda ne olur">
            <ol className="list-decimal space-y-1.5 pl-4 text-sm text-muted-foreground">
              <li>“Uygulamaya koy” ve ardından <b className="font-medium text-foreground">Yayınla</b> ile telefonlara iner.</li>
              <li>Telefon fontu menüde yükler; <b className="font-medium text-foreground">hepsi</b> yüklenince dört rol birden değişir. Biri yüklenemezse uygulamanın kendi fontları kalır.</li>
              <li>Satır yüksekliği her font için ölçülür; uzun harfli bir font satırları biraz uzatır, harf kesilmez.</li>
            </ol>
          </Panel>
          <Panel title="Gerekli harfler">
            <div className="break-words font-mono text-xs leading-relaxed text-muted-foreground">{view.contract.required}</div>
          </Panel>
        </aside>
      </div>
    </>
  );
}

function RoleCard({ role, view, reload }: { role: FontRoleInfo; view: FontsView; reload: () => Promise<void> }) {
  const mine = view.list.filter((f) => f.role === role.role);
  const live = mine.find((f) => f.status === "live");
  const input = React.useRef<HTMLInputElement>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const add = async (file: File) => {
    setBusy(true); setError("");
    try {
      const ext = file.name.toLowerCase().split(".").pop();
      /* the browser often has no type for a font: the extension says it, the server's bytes decide */
      const typed = new Blob([file], { type: ext === "otf" ? "font/otf" : "font/ttf" });
      const a = await uploadAsset(typed, file.name);
      await createFont(role.role, file.name.replace(/\.(ttf|otf)$/i, ""), a.id);
      await reload();
    } catch (e) { setError((e as Error).message); }
    setBusy(false);
  };
  const backToApp = async () => {
    if (!live) return;
    setBusy(true);
    try { await patchFont(live.id, { status: "draft" }, live.updatedAt); await reload(); } catch (e) { setError((e as Error).message); }
    setBusy(false);
  };
  return (
    <Card data-role={role.role}><CardContent className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-lg font-semibold">{role.label} <span className="text-sm font-normal text-muted-foreground">· ağırlık {role.weight}</span></div>
          <div className="text-sm text-muted-foreground">{role.use}</div>
        </div>
        <div className="flex gap-2">
          <input ref={input} type="file" accept=".ttf,.otf" className="hidden" data-testid={`font-upload-${role.role}`}
                 onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void add(f); }} />
          <Button size="sm" onClick={() => input.current?.click()} disabled={busy}><Upload /> Font yükle</Button>
          {live && <Button size="sm" variant="outline" onClick={() => void backToApp()} disabled={busy}><RotateCcw /> Uygulamanınkine dön</Button>}
        </div>
      </div>
      {error && <Notice tone="bad">{error}</Notice>}
      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          <div className="mb-1.5 flex items-center gap-2 text-sm font-medium">
            Uygulamanın kendi fontu: {role.builtin.name} {!live && <Pill tone="ok">Şu an bu</Pill>}
          </div>
          <Sample asset={role.builtin.asset} big={role.role === "title" || role.role === "strong"} />
        </div>
        {live && (
          <div>
            <div className="mb-1.5 flex items-center gap-2 text-sm font-medium">Panelden: {live.name} <Pill tone="accent">Şu an bu</Pill></div>
            <Sample asset={live.asset} big={role.role === "title" || role.role === "strong"} />
          </div>
        )}
      </div>
      {mine.length > 0 && (
        <div className="space-y-3">
          {mine.map((f) => <FontRow key={f.id} font={f} reload={reload} />)}
        </div>
      )}
    </CardContent></Card>
  );
}

function FontRow({ font, reload }: { font: PanelFont; reload: () => Promise<void> }) {
  const base = React.useRef(font.updatedAt);
  React.useEffect(() => { base.current = font.updatedAt; }, [font.updatedAt]);
  const [d, setD] = React.useState({ name: font.name, license: font.license });
  const [stale, setStale] = React.useState(false);
  const [error, setError] = React.useState("");
  const save = async (p: FontPatch) => {
    try {
      const out = await patchFont(font.id, p, base.current); base.current = out.updatedAt; setError(""); setStale(false);
      /* the checks follow the edit (a licence written opens "Uygulamaya koy") */
      void reload();
      return true;
    }
    catch (e) {
      if (codeOf(e) === "STALE") setStale(true); else setError((e as Error).message);
      throw e;
    }
  };
  const auto = useAutosave(d, (v) => save({ name: v.name.trim(), license: v.license }),
                           { ms: 600, skip: (v) => !v.name.trim(), label: `Yazı tipi “${font.name}”` });
  const rep = font.report;
  const errors = font.issues.filter((i) => i.level === "error");
  const setStatus = async (status: "live" | "draft") => {
    if (!(await flushEdits())) return;
    try { await save({ status }); } catch { /* shown */ }
    await reload();
  };
  return (
    <div className="rounded-lg border p-3" data-font={font.id}>
      <div className="flex flex-wrap items-center gap-2">
        <Pill tone={font.status === "live" ? "ok" : "plain"}>{STATUS_LABEL[font.status]}</Pill>
        <div className="min-w-0 flex-1 text-sm text-muted-foreground">
          {rep && !rep.error ? `${rep.family} ${rep.style} · ağırlık ${rep.weight} · ${rep.glyphs} glif · en az satır ${rep.minLine} em` : "dosya okunamadı"}
        </div>
        <SaveChip state={stale ? "stale" : auto.state} />
        {font.status === "live"
          ? <Button size="sm" variant="outline" onClick={() => void setStatus("draft")}>Taslağa al</Button>
          : <Button size="sm" onClick={() => void setStatus("live")} disabled={errors.length > 0}><Check /> Uygulamaya koy</Button>}
        <Button size="sm" variant="ghost" aria-label="Sil" onClick={async () => { if (confirm(`“${font.name}” silinsin mi?`)) { await deleteFont(font.id); await reload(); } }}><Trash2 /></Button>
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <FormField label="Adı"><Input value={d.name} maxLength={60} onChange={(e) => setD({ ...d, name: e.target.value })} /></FormField>
        <FormField label="Lisans" hint="ör. SIL OFL 1.1, ya da satın alma bilgisi">
          <Input value={d.license} maxLength={300} onChange={(e) => setD({ ...d, license: e.target.value })} data-testid="font-license" />
        </FormField>
      </div>
      {error && <Notice tone="bad" className="mt-2">{error}</Notice>}
      {stale && <Notice tone="warn" className="mt-2" action={<Button size="sm" variant="outline" onClick={() => void reload()}>Sunucudakini yükle</Button>}>Bu yazı tipi başka bir yerde değişti.</Notice>}
      <div className="mt-3"><Sample asset={font.asset} /></div>
      {font.issues.length > 0 && (
        <div className="mt-3 space-y-2">
          {font.issues.map((i) => <Notice key={i.text} tone={i.level === "error" ? "bad" : "warn"}>{i.text}</Notice>)}
        </div>
      )}
    </div>
  );
}

export type { FontRole };
