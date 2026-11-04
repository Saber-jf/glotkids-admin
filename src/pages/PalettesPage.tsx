/**
 * RENK PALETİ (2026-10-29): the app's chrome colours, managed here.
 *
 * The app draws its chrome -- the screen behind it, cards, the main and the
 * second button, a small accent -- in twelve named ROLES (server:
 * modules/palettes.ts; app: src/core/palette.ts). Scenes, words and mascots
 * keep their own colours. The app ships with its own palette ("Kayısı ×
 * Okyanus"); here another one is made -- from a ready one, or a copy -- and
 * put in play. Publishing sends it to the phones; a phone switches its
 * colours in the menu, all at once.
 *
 * Every change shows at once on the preview beside it (the onboarding and
 * the menu, drawn the way the app draws them) and every text is measured
 * against what it is written on while it is typed: under 3:1 the palette
 * cannot be put in play, under 4.5:1 it is warned about.
 */
import React from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, Check, Copy, Plus, RotateCcw, Send, SwatchBook, Trash2, Wand2 } from "lucide-react";
import { codeOf, createPalette, deletePalette, getPalettes, patchPalette,
         type NamedPalette, type PaletteColors, type PalettesView, type PanelPalette } from "../api";
import { FormField, Loading, Notice, PageHeader, Panel, Pill, SaveChip } from "../components/common";
import { flushEdits, useAutosave } from "@/lib/autosave";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

/* ── colour arithmetic (the app's own, `core/palette.ts`) ─────────────────── */

const HEX = /^#[0-9A-Fa-f]{6}$/;
const lum = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  const f = (c: number) => { const v = c / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f((n >> 16) & 255) + 0.7152 * f((n >> 8) & 255) + 0.0722 * f(n & 255);
};
export const contrast = (a: string, b: string) =>
  HEX.test(a) && HEX.test(b) ? (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05) : 0;
/** the lip under a button: its face, each channel × 0.8 (as the ready palettes) */
export const lipOf = (hex: string) => "#" + [0, 2, 4].map((i) => Math.floor(parseInt(hex.slice(1 + i, 3 + i), 16) * 0.8).toString(16).padStart(2, "0")).join("").toUpperCase();
const alpha = (hex: string, a: number) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};

type Path = [keyof PaletteColors] | [keyof PaletteColors, string];
const get = (c: PaletteColors, p: Path): string =>
  p.length === 1 ? (c[p[0]] as string) : ((c[p[0]] as Record<string, string>)[p[1]] ?? "");
const set = (c: PaletteColors, p: Path, v: string): PaletteColors =>
  p.length === 1 ? { ...c, [p[0]]: v } : { ...c, [p[0]]: { ...(c[p[0]] as object), [p[1]]: v } };

/** the four texts and what each is written on */
export function contrasts(c: PaletteColors) {
  return {
    background: Math.min(contrast(c.background.text, c.background.start), contrast(c.background.text, c.background.end)),
    card: contrast(c.card.text, c.card.background),
    primary: contrast(c.primary.text, c.primary.background),
    secondary: contrast(c.secondary.text, c.secondary.background),
  };
}

/** the roles, grouped as the editor shows them; `text` marks a text and what it is measured against */
const GROUPS: { title: string; rows: { path: Path; label: string; use: string; measure?: keyof ReturnType<typeof contrasts> }[]; lipFor?: "primary" | "secondary" }[] = [
  { title: "Arka plan", rows: [
    { path: ["background", "start"], label: "Üst renk", use: "Geçişin başı (sol üst)" },
    { path: ["background", "end"], label: "Alt renk", use: "Geçişin sonu (sağ alt); sayfa geçişindeki daire de bu renk" },
    { path: ["background", "text"], label: "Yazı", use: "Arka planın üstündeki başlık ve yazılar", measure: "background" },
  ] },
  { title: "Kart", rows: [
    { path: ["card", "background"], label: "Kart", use: "Kutular, ad alanı, seçilmemiş cevaplar, sekmeler" },
    { path: ["card", "text"], label: "Kart yazısı", use: "Kartın üstündeki yazı", measure: "card" },
  ] },
  { title: "Ana düğme", lipFor: "primary", rows: [
    { path: ["primary", "background"], label: "Düğme", use: "İleri, Başlayalım, Önizlemeyi tamamla, seçili sekme" },
    { path: ["primary", "text"], label: "Yazısı / oku", use: "Ana düğmenin yazısı ve oku", measure: "primary" },
    { path: ["primary", "lip"], label: "Dudağı", use: "Altındaki koyu şerit (basınca kaybolur)" },
  ] },
  { title: "İkinci düğme", lipFor: "secondary", rows: [
    { path: ["secondary", "background"], label: "Düğme", use: "Geri, Baştan, seçilen cevap" },
    { path: ["secondary", "text"], label: "Yazısı", use: "İkinci düğmenin yazısı", measure: "secondary" },
    { path: ["secondary", "lip"], label: "Dudağı", use: "Altındaki koyu şerit" },
  ] },
  { title: "Vurgu", rows: [
    { path: ["accent"], label: "Vurgu", use: "Adım çizgileri, uygulamanın adı, küçük vurgular" },
  ] },
];

/** quick colours to pick from: warm, soft and bright, none of them a "boy" or a "girl" colour on its own */
const SWATCHES = [
  "#FFE6CF", "#F9D2BF", "#FFE4C7", "#FFCBB0", "#FFF6C8", "#FFF1D6", "#E6F6DD", "#E3F4C2", "#D7F5EA", "#D4F2EE",
  "#BDE6F6", "#CFE6FF", "#DCEBFF", "#EDE6FF", "#FFE8F2", "#FFFBF4", "#FFFFFF", "#FFF8EC",
  "#FFCA68", "#FFC83D", "#FFB238", "#FFD65A", "#F6D55C", "#FF9F45", "#FF9A3C", "#EF8A34", "#FF8E5E", "#FF8A65",
  "#FF6F61", "#DC6E56", "#F0907A", "#FF9EB5", "#BCE3C9", "#6FDCC0", "#47C8A8", "#23B593", "#2E8540", "#367A4E",
  "#16786C", "#2B8370", "#8ED6E8", "#1C7BA6", "#24809E", "#7468D0", "#5E4EDC", "#4B4AA8", "#43558E", "#29366B",
  "#4B3430", "#3A3026", "#2F3B5C", "#253E4B", "#29463B", "#1F3A4D", "#2D2A5A", "#2E2A5C",
];

/* ── the preview: the app's own screens, drawn with the colours ──────────── */

function Lipped({ face, lip, children, round = false, className = "", style }: {
  face: string; lip: string; children: React.ReactNode; round?: boolean; className?: string; style?: React.CSSProperties;
}) {
  return (
    <div className={`flex items-center justify-center font-bold ${round ? "rounded-full" : "rounded-full px-3"} ${className}`}
         style={{ background: face, boxShadow: `0 4px 0 ${lip}`, ...style }}>{children}</div>
  );
}

/**
 * A phone screen drawn at one size (680 × 314, landscape 19.5:9) and scaled
 * to the space it is given: at any width it is the same picture, nothing
 * wraps onto anything else.
 */
const PHONE = { w: 680, h: 314 };
function Phone({ children, background, testId }: { children: React.ReactNode; background: string; testId?: string }) {
  const box = React.useRef<HTMLDivElement>(null);
  const [k, setK] = React.useState(1);
  React.useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const fit = () => setK(el.clientWidth / PHONE.w);
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={box} className="relative w-full overflow-hidden rounded-[22px] border-4 border-zinc-900" style={{ height: PHONE.h * k + 8 }}>
      <div data-testid={testId} className="absolute left-0 top-0 origin-top-left overflow-hidden text-[12px]"
           style={{ width: PHONE.w, height: PHONE.h, transform: `scale(${k})`, background, fontFamily: "Fredoka, Nunito, system-ui, sans-serif" }}>
        {children}
      </div>
    </div>
  );
}

/** the onboarding's age page, at the phone's landscape shape */
export function OnboardingPreview({ c }: { c: PaletteColors }) {
  return (
    <Phone testId="palette-preview" background={`linear-gradient(135deg, ${c.background.start}, ${c.background.end})`}>
      <div className="absolute left-[6%] top-[7%] flex gap-1">
        {[0, 1, 2, 3, 4].map((k) => <div key={k} className="h-[5px] rounded-full" style={{ width: k === 2 ? 26 : 14, background: k <= 2 ? c.accent : alpha(c.background.text, 0.2) }} />)}
      </div>
      <div className="absolute left-[6%] top-[20%] w-[36%] space-y-2">
        <div className="text-[18px] font-extrabold leading-tight" style={{ color: c.background.text }}>Her oyunda yeni bir keşif</div>
        <div className="font-semibold" style={{ color: c.background.text, opacity: 0.85 }}>Kaç yaşında?</div>
        <div className="grid grid-cols-3 gap-1.5">
          {[3, 4, 5, 6, 7, 8].map((a) => {
            const on = a === 5;
            return <div key={a} className="rounded-full border-2 py-1 text-center font-bold"
                        style={{ background: on ? c.secondary.background : c.card.background, color: on ? c.secondary.text : c.card.text,
                                 borderColor: on ? c.secondary.lip : alpha(c.card.text, 0.15) }}>{on ? "✓ " : ""}{a} yaş</div>;
          })}
        </div>
        <div className="rounded-lg border-2 px-2 py-1.5 font-bold" style={{ background: c.card.background, color: c.card.text, borderColor: c.secondary.lip }}>Ada</div>
      </div>
      <div className="absolute right-[5%] top-[13%] flex aspect-video w-[50%] items-center justify-center overflow-hidden rounded-xl"
           style={{ background: "linear-gradient(180deg,#BFE6F7 0 55%,#9FD47F 55%)" }}>
        <div className="absolute bottom-2 left-2 rounded-full px-2 py-0.5 font-bold" style={{ background: c.card.background, color: c.card.text }}>Boyama</div>
        <div className="absolute left-2 top-2 rounded-full px-2 py-0.5 font-bold" style={{ background: c.card.background, color: c.card.text }}>🔊 yellow</div>
        <div className="text-[28px]">🐰🦦</div>
      </div>
      <div className="absolute bottom-[7%] left-[6%]">
        <Lipped face={c.secondary.background} lip={c.secondary.lip} className="h-7" style={{ color: c.secondary.text }}>‹ Geri</Lipped>
      </div>
      <div className="absolute bottom-[7%] right-[5%] flex items-center gap-2">
        <Lipped face={c.secondary.background} lip={c.secondary.lip} className="h-7" style={{ color: c.secondary.text }}>Baştan</Lipped>
        <Lipped face={c.primary.background} lip={c.primary.lip} round className="h-9 w-9 text-[18px]" style={{ color: c.primary.text }}>→</Lipped>
      </div>
    </Phone>
  );
}

/** the menu's tabs and the Main film's buttons */
export function MenuPreview({ c }: { c: PaletteColors }) {
  const tabs = ["Main", "Tek dersler", "Kategoriler", "Onboarding"];
  return (
    <Phone background="linear-gradient(180deg,#9ED6F0 0 60%,#A6D97E 60%)">
      <div className="absolute inset-x-0 top-[7%] flex justify-center gap-1.5">
        {tabs.map((t, i) => (
          <Lipped key={t} face={i === 3 ? c.primary.background : c.card.background} lip={i === 3 ? c.primary.lip : c.secondary.lip}
                  className="h-6" style={{ color: i === 3 ? c.primary.text : c.card.text }}>{t}</Lipped>
        ))}
      </div>
      <div className="absolute bottom-[14%] left-1/2 -translate-x-1/2">
        <Lipped face={c.primary.background} lip={c.primary.lip} className="h-10 gap-2 px-4 text-[15px]" style={{ color: c.primary.text }}>
          <span className="flex h-6 w-6 items-center justify-center rounded-full text-[11px]" style={{ background: c.primary.text, color: c.primary.background }}>▶</span>
          Başlayalım
        </Lipped>
      </div>
      <div className="absolute bottom-[6%] right-[4%]">
        <Lipped face={c.card.background} lip={c.secondary.lip} className="h-7" style={{ color: c.card.text }}>Atla ›</Lipped>
      </div>
    </Phone>
  );
}

function Strip({ c, className = "" }: { c: PaletteColors; className?: string }) {
  const xs = [c.background.start, c.background.end, c.card.background, c.primary.background, c.secondary.background, c.accent, c.background.text];
  return <div className={`flex h-5 overflow-hidden rounded-md border ${className}`}>{xs.map((x, i) => <div key={i} className="flex-1" style={{ background: x }} />)}</div>;
}

/* ── the page ─────────────────────────────────────────────────────────────── */

export function PalettesPage() {
  const [view, setView] = React.useState<PalettesView | null>(null);
  const [error, setError] = React.useState("");
  const [sel, setSel] = React.useState<string | null>(null);
  const load = React.useCallback(async () => {
    try { const v = await getPalettes(); setView(v); setError(""); return v; } catch (e) { setError((e as Error).message); return null; }
  }, []);
  React.useEffect(() => { void load(); }, [load]);
  if (error) return <Notice tone="bad">{error}</Notice>;
  if (!view) return <Loading />;
  if (!view.contract) return <Notice tone="warn" icon={<AlertTriangle />}>Sunucu uygulamanın renk paleti sözleşmesini henüz bilmiyor. Uygulama klasöründe <code>npm run inventory</code> çalıştırıp envanteri gönderin (Uygulama sayfası).</Notice>;
  const contract = view.contract;
  const live = view.list.find((p) => p.status === "live");
  const current = view.list.find((p) => p.id === sel) ?? live ?? view.list[0] ?? null;
  const start = async (name: string, from?: string, colors?: PaletteColors) => {
    try {
      const made = await createPalette(name, from, colors);
      await load(); setSel(made.id);
    } catch (e) { setError((e as Error).message); }
  };
  return (
    <>
      <PageHeader title="Renk paleti"
        sub="Uygulamanın arka planı, kartları ve düğmeleri bu renklerle çizilir (sahneler, kelimeler ve maskotlar kendi renklerinde kalır). Değiştirdikçe yandaki örnek değişir; “Uygulamaya gönder” ve ardından Yayınla ile telefonlara iner." />
      <div className="grid gap-6 xl:grid-cols-[260px_1fr]">
        <aside className="space-y-4">
          <Panel title="Şu an uygulamada" icon={<SwatchBook />}>
            {live
              ? <div className="space-y-2"><div className="font-medium">{live.name}</div><Strip c={live.colors} /></div>
              : <div className="space-y-2"><div className="font-medium">{contract.builtin.name} <span className="text-xs text-muted-foreground">(uygulamanın kendi paleti)</span></div><Strip c={contract.builtin} /></div>}
          </Panel>
          <Panel title="Paletlerim">
            <div className="space-y-2">
              {view.list.length === 0 && <div className="text-sm text-muted-foreground">Henüz yok. Aşağıdaki hazır paletlerden biriyle başlayın.</div>}
              {view.list.map((p) => (
                <button key={p.id} type="button" onClick={() => setSel(p.id)} data-palette={p.id}
                        className={`w-full rounded-lg border p-2 text-left transition hover:bg-muted/50 ${current?.id === p.id ? "ring-2 ring-primary" : ""}`}>
                  <div className="mb-1 flex items-center gap-2 text-sm font-medium">{p.name} {p.status === "live" && <Pill tone="ok">Uygulamada</Pill>}
                    {p.issues.some((i) => i.level === "error") && <Pill tone="bad">hata</Pill>}</div>
                  <Strip c={p.colors} />
                </button>
              ))}
            </div>
          </Panel>
          <Panel title="Hazır paletler" description="Biriyle başlayın; kopyası düzenlenir, hazır olan değişmez.">
            <div className="space-y-2">
              {contract.presets.map((p: NamedPalette) => (
                <div key={p.id} className="rounded-lg border p-2">
                  <div className="mb-1 flex items-center justify-between gap-2 text-sm font-medium">
                    <span>{p.name}{p.id === contract.builtin.id && <span className="ml-1 text-xs font-normal text-muted-foreground">· uygulamanın kendi</span>}</span>
                    <Button size="xs" variant="outline" data-testid={`preset-${p.id}`} onClick={() => void start(p.name, p.id)}><Plus /> Bununla başla</Button>
                  </div>
                  <Strip c={p} />
                </div>
              ))}
            </div>
          </Panel>
        </aside>
        <div>
          {current
            ? <PaletteEditor key={current.id} p={current} reload={load} onCopy={(name, colors) => void start(name, undefined, colors)}
                             onGone={() => setSel(null)} />
            : <Card><CardContent className="space-y-4">
                <div className="text-sm text-muted-foreground">Şu an uygulama kendi paletini (“{contract.builtin.name}”) kullanıyor. Bir hazır paletle başlayın ya da onun kopyasını açın.</div>
                <div className="grid max-w-3xl gap-4"><OnboardingPreview c={contract.builtin} /><MenuPreview c={contract.builtin} /></div>
                <Button onClick={() => void start(`${contract.builtin.name} (kopya)`, contract.builtin.id)}><Copy /> Kendi paletinin kopyasını aç</Button>
              </CardContent></Card>}
        </div>
      </div>
    </>
  );
}

function PaletteEditor({ p, reload, onCopy, onGone }: {
  p: PanelPalette; reload: () => Promise<PalettesView | null>; onCopy: (name: string, colors: PaletteColors) => void; onGone: () => void;
}) {
  const base = React.useRef(p.updatedAt);
  React.useEffect(() => { base.current = p.updatedAt; }, [p.updatedAt]);
  const [d, setD] = React.useState({ name: p.name, colors: p.colors });
  const [focus, setFocus] = React.useState<Path>(["primary", "background"]);
  const [stale, setStale] = React.useState(false);
  const [error, setError] = React.useState("");
  const [sent, setSent] = React.useState(false);
  const save = async (v: typeof d) => {
    try {
      const out = await patchPalette(p.id, { name: v.name.trim(), colors: v.colors }, base.current);
      base.current = out.updatedAt; setError(""); setStale(false);
      void reload();
      return true;
    } catch (e) {
      if (codeOf(e) === "STALE") setStale(true); else setError((e as Error).message);
      throw e;
    }
  };
  /* a colour half typed is not sent: every role a whole "#RRGGBB" */
  const whole = (c: PaletteColors) => GROUPS.every((g) => g.rows.every((r) => HEX.test(get(c, r.path))));
  const auto = useAutosave(d, save, { ms: 500, skip: (v) => !v.name.trim() || !whole(v.colors), label: `Palet “${p.name}”` });
  const pick = (path: Path, v: string) => setD((x) => ({ ...x, colors: set(x.colors, path, v.toUpperCase()) }));
  const cr = contrasts(d.colors);
  const blocking = Object.values(cr).some((v) => v < 3) || !whole(d.colors);
  const setStatus = async (status: "live" | "draft") => {
    if (!(await flushEdits())) return;
    try {
      const out = await patchPalette(p.id, { status }, base.current);
      base.current = out.updatedAt; setSent(status === "live"); setError("");
    } catch (e) {
      if (codeOf(e) === "STALE") setStale(true); else setError((e as Error).message);
    }
    await reload();
  };
  return (
    <div className="grid gap-6 2xl:grid-cols-[1fr_460px]">
      <Card><CardContent className="space-y-5">
        <div className="flex flex-wrap items-center gap-2">
          <Pill tone={p.status === "live" ? "ok" : "plain"}>{p.status === "live" ? "Uygulamada" : "Taslak"}</Pill>
          <SaveChip state={stale ? "stale" : auto.state} />
          <div className="flex-1" />
          {p.status === "live"
            ? <Button size="sm" variant="outline" onClick={() => void setStatus("draft")}><RotateCcw /> Uygulamadan al</Button>
            : <Button size="sm" onClick={() => void setStatus("live")} disabled={blocking} data-testid="palette-send"><Send /> Uygulamaya gönder</Button>}
          <Button size="sm" variant="outline" onClick={() => onCopy(`${d.name} (kopya)`, d.colors)}><Copy /> Kopyasını oluştur</Button>
          <Button size="sm" variant="ghost" aria-label="Sil" onClick={async () => {
            if (!confirm(`“${p.name}” silinsin mi?`)) return;
            await deletePalette(p.id); onGone(); await reload();
          }}><Trash2 /></Button>
        </div>
        {sent && <Notice tone="ok" icon={<Check />} action={<Button size="sm" asChild><Link to="/yayinla">Yayınla’ya git</Link></Button>}>
          Uygulamaya kondu. Telefonlara inmesi için yayınlayın; telefon renkleri menüde, hepsini birden değiştirir.</Notice>}
        {error && <Notice tone="bad">{error}</Notice>}
        {stale && <Notice tone="warn" action={<Button size="sm" variant="outline" onClick={() => void reload()}>Sunucudakini yükle</Button>}>Bu palet başka bir yerde değişti.</Notice>}
        <FormField label="Adı"><Input value={d.name} maxLength={60} onChange={(e) => setD({ ...d, name: e.target.value })} data-testid="palette-name" /></FormField>

        {GROUPS.map((g) => (
          <div key={g.title} className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-semibold">{g.title}
              {g.lipFor && <Button size="xs" variant="ghost" onClick={() => pick([g.lipFor!, "lip"], lipOf(d.colors[g.lipFor!].background))}>
                <Wand2 /> Dudağı düğmeden türet</Button>}
            </div>
            <div className="grid gap-2 md:grid-cols-2">
              {g.rows.map((r) => {
                const v = get(d.colors, r.path);
                const on = focus.join(".") === r.path.join(".");
                const m = r.measure ? cr[r.measure] : null;
                return (
                  <div key={r.path.join(".")} onClick={() => setFocus(r.path)}
                       className={`flex items-center gap-3 rounded-lg border p-2 ${on ? "ring-2 ring-primary" : ""}`} data-role={r.path.join(".")}>
                    <input type="color" value={HEX.test(v) ? v : "#000000"} onChange={(e) => pick(r.path, e.target.value)} onFocus={() => setFocus(r.path)}
                           className="h-10 w-12 shrink-0 cursor-pointer rounded border-0 bg-transparent p-0" aria-label={`${g.title} · ${r.label}`} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 text-sm font-medium">{r.label}
                        {m !== null && <Pill tone={m < 3 ? "bad" : m < 4.5 ? "warn" : "ok"}>{m.toFixed(1)}:1</Pill>}</div>
                      <div className="truncate text-xs text-muted-foreground">{r.use}</div>
                    </div>
                    <Input value={v} maxLength={7} className="w-24 font-mono uppercase" onFocus={() => setFocus(r.path)}
                           onChange={(e) => pick(r.path, e.target.value.startsWith("#") ? e.target.value : `#${e.target.value}`)} />
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        <div className="space-y-2">
          <div className="text-sm font-semibold">Renk önerileri <span className="font-normal text-muted-foreground">· seçili alana uygulanır: {GROUPS.flatMap((g) => g.rows.map((r) => ({ ...r, g: g.title }))).find((r) => r.path.join(".") === focus.join("."))?.g} › {GROUPS.flatMap((g) => g.rows).find((r) => r.path.join(".") === focus.join("."))?.label}</span></div>
          <div className="flex flex-wrap gap-1.5">
            {SWATCHES.map((x) => (
              <button key={x} type="button" title={x} onClick={() => pick(focus, x)} data-swatch={x}
                      className="h-7 w-7 rounded-md border shadow-sm transition hover:scale-110" style={{ background: x }} />
            ))}
          </div>
        </div>
        {(() => {
          const bad = Object.entries(cr).filter(([, v]) => v < 4.5);
          return bad.length > 0 && (
            <Notice tone={bad.some(([, v]) => v < 3) ? "bad" : "warn"}>
              {bad.some(([, v]) => v < 3) ? "Okunmayan bir yazı var (3:1'in altı): bu palet uygulamaya gönderilemez." : "Bazı yazılar zayıf (4.5:1'in altı): çocuklar ve ebeveynler zor okuyabilir."}
            </Notice>
          );
        })()}
      </CardContent></Card>

      <aside className="space-y-4 2xl:sticky 2xl:top-4 2xl:self-start">
        <Panel title="Telefonda böyle görünür" description="Onboarding'in yaş sayfası ve menünün düğmeleri, bu renklerle.">
          <div className="space-y-3">
            <OnboardingPreview c={d.colors} />
            <MenuPreview c={d.colors} />
          </div>
        </Panel>
      </aside>
    </div>
  );
}
