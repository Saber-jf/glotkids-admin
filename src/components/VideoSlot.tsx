/**
 * A category's film, as it will play on a phone.
 *
 * The app fills the screen with a film and crops what does not fit (rule 16):
 * a phone held sideways is about 19.5:9, a tablet 4:3, so the same film loses
 * its top and bottom on one and its sides on the other. This slot shows both
 * frames with the film inside, says how much each loses, and offers the other
 * choice -- the whole film with bands ("contain") -- for one that was not shot
 * for the phone. It also takes the upload (with progress: films are large)
 * and reads the film's length and size in the browser, so a wrong file is
 * seen before it is published.
 */
import React from "react";
import { Film, Library, Monitor, Smartphone, Tablet, Trash2, TriangleAlert, Upload } from "lucide-react";
import { useStore } from "../store";
import { urlOf } from "../blobs";
import type { Asset } from "../types";
import { LibraryPicker } from "./Media";
import { Notice, fmtSize } from "./common";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

export type Fit = "cover" | "contain";

/** the screens a film is cut for: width / height, held sideways */
const SCREENS = [
  { id: "phone", label: "Telefon", ratio: 19.5 / 9, icon: Smartphone },
  { id: "tablet", label: "Tablet", ratio: 4 / 3, icon: Tablet },
] as const;
/** a film larger than this is a long wait on a phone (server: VIDEO_WARN_BYTES) */
export const VIDEO_WARN_BYTES = 40 * 1024 * 1024;
const ACCEPT = "video/mp4,video/quicktime";

interface Meta { w: number; h: number; seconds: number }

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;
const ratioName = (r: number) =>
  Math.abs(r - 16 / 9) < 0.03 ? "16:9" : Math.abs(r - 19.5 / 9) < 0.05 ? "19,5:9" : Math.abs(r - 4 / 3) < 0.03 ? "4:3"
  : Math.abs(r - 1) < 0.03 ? "kare" : r.toFixed(2).replace(".", ",") + ":1";

/** what a screen of `screen` (w/h) loses of a film of `film` (w/h) when it fills */
export function cropOf(film: number, screen: number): { side: "top-bottom" | "sides" | "none"; lost: number } {
  if (Math.abs(film - screen) / screen < 0.02) return { side: "none", lost: 0 };
  return film < screen ? { side: "top-bottom", lost: 1 - film / screen } : { side: "sides", lost: 1 - screen / film };
}

/** plain words for how a film sits on the screens */
export function framingNotes(m: Meta, fit: Fit): { tone: "warn" | "plain"; text: string }[] {
  const r = m.w / m.h;
  const out: { tone: "warn" | "plain"; text: string }[] = [];
  if (r < 1) out.push({ tone: "warn", text: "Dikey bir video: uygulama yatay oynar. Yatay (en az 16:9) çekilmiş bir film yükleyin." });
  for (const s of SCREENS) {
    const c = cropOf(r, s.ratio);
    const pct = Math.round(c.lost * 100);
    if (c.side === "none") { out.push({ tone: "plain", text: `${s.label}: tam oturur.` }); continue; }
    if (fit === "contain")
      out.push({ tone: "plain", text: `${s.label}: tamamı görünür, ${c.side === "sides" ? "üstte ve altta" : "yanlarda"} bant kalır.` });
    else
      out.push({ tone: pct >= 15 ? "warn" : "plain",
                 text: `${s.label}: ${c.side === "sides" ? "sağdan ve soldan" : "üstten ve alttan"} toplam %${pct} kırpılır.` });
  }
  if (fit === "cover" && out.some((x) => x.tone === "warn"))
    out.push({ tone: "plain", text: "Önemli olan (maskotların yüzü, kelimenin resmi) çerçevenin ortasında kalsın; olmuyorsa “Tamamını göster”i seçin." });
  if (m.seconds > 90) out.push({ tone: "warn", text: `${clock(m.seconds)} uzun: 4–8 yaş için bir ara video 10–60 sn olmalı.` });
  if (m.seconds > 0 && m.seconds < 3) out.push({ tone: "warn", text: "3 saniyeden kısa: çocuk ne olduğunu anlamadan geçer." });
  return out;
}

export function VideoSlot({ value, fit, onChange, onFit, readOnly }: {
  value: string | null; fit: Fit; onChange: (asset: string | null) => void; onFit: (f: Fit) => void; readOnly?: boolean;
}) {
  const { db, addAsset } = useStore();
  const asset: Asset | undefined = db.assets.find((a) => a.id === value)
    ?? (value ? { id: value, kind: "video", name: value, mime: "", size: 0, createdAt: 0, url: `/api/assets/${encodeURIComponent(value)}` } : undefined);
  const url = urlOf(asset);
  const input = React.useRef<HTMLInputElement>(null);
  const [over, setOver] = React.useState(false);
  const [picking, setPicking] = React.useState(false);
  const [sending, setSending] = React.useState<{ name: string; sent: number; total: number } | null>(null);
  const [error, setError] = React.useState("");
  /* the measured film belongs to the file it was measured from */
  const [measured, setMeasured] = React.useState<(Meta & { of: string }) | null>(null);
  const meta = measured && measured.of === value ? measured : null;
  const [screen, setScreen] = React.useState<(typeof SCREENS)[number]["id"]>("phone");

  const take = async (f?: File | null) => {
    if (!f) return;
    if (!/^video\//.test(f.type)) { setError(`"${f.name}" bir video değil. MP4 (H.264) yükleyin.`); return; }
    setError(""); setSending({ name: f.name, sent: 0, total: f.size });
    try {
      const a = await addAsset(f, (sent, total) => setSending({ name: f.name, sent, total }));
      if (a?.kind === "video") onChange(a.id);
      else setError("Dosya bir video olarak kaydedilmedi.");
    } catch (e) { setError((e as Error).message); }
    setSending(null);
  };

  const ext = (asset?.name.split(".").pop() ?? "").toLowerCase();
  const notes = meta ? framingNotes(meta, fit) : [];
  const S = SCREENS.find((s) => s.id === screen)!;

  if (sending) {
    const pct = sending.total ? Math.round((sending.sent / sending.total) * 100) : 0;
    return (
      <div className="space-y-2 rounded-lg border bg-muted/30 p-4">
        <div className="flex items-center gap-2 text-sm"><Film className="size-4 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate font-medium">{sending.name}</span>
          <span className="text-muted-foreground tabular-nums">{fmtSize(sending.sent) || "0 KB"} / {fmtSize(sending.total)}</span></div>
        <Progress value={pct} className="h-2" />
        <div className="text-xs text-muted-foreground">Yükleniyor… %{pct}. Sayfadan çıkmayın.</div>
      </div>
    );
  }

  if (!asset) {
    return (
      <div className="space-y-2">
        <input ref={input} type="file" accept={ACCEPT} className="hidden" onChange={(e) => { take(e.target.files?.[0]); e.target.value = ""; }} />
        <div role="button" tabIndex={readOnly ? -1 : 0} aria-disabled={readOnly}
             onClick={() => !readOnly && input.current?.click()}
             onKeyDown={(e) => { if (!readOnly && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); input.current?.click(); } }}
             onDragOver={(e) => { e.preventDefault(); if (!readOnly) setOver(true); }} onDragLeave={() => setOver(false)}
             onDrop={(e) => { e.preventDefault(); setOver(false); if (!readOnly) take(e.dataTransfer.files[0]); }}
             className={cn("flex flex-col items-center gap-2 rounded-lg border border-dashed px-4 py-6 text-center transition-colors",
               readOnly ? "opacity-60" : "cursor-pointer hover:border-primary/50 hover:bg-primary/5", over && "border-primary bg-primary/5")}>
          <div className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary"><Upload className="size-5" /></div>
          <div className="text-sm font-medium">Videoyu buraya sürükleyin ya da tıklayıp seçin</div>
          <div className="max-w-md text-xs text-muted-foreground">MP4 (H.264 + AAC), yatay. En iyisi 19,5:9 (ör. 2340×1080) — telefonda hiçbir şey kırpılmaz; 16:9 da olur. 10–60 sn, 40 MB'ın altında.</div>
          {!readOnly && <Button type="button" variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); setPicking(true); }}><Library />Kütüphaneden seç</Button>}
        </div>
        {error && <Notice tone="bad" icon={<TriangleAlert />}>{error}</Notice>}
        {picking && <LibraryPicker kind="video" onPick={(a) => onChange(a.id)} onClose={() => setPicking(false)} />}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <input ref={input} type="file" accept={ACCEPT} className="hidden" onChange={(e) => { take(e.target.files?.[0]); e.target.value = ""; }} />
      <div className="flex flex-wrap items-center gap-2">
        <ToggleGroup type="single" variant="outline" size="sm" spacing={0} value={screen} onValueChange={(v) => v && setScreen(v as typeof screen)}>
          {SCREENS.map((s) => <ToggleGroupItem key={s.id} value={s.id}><s.icon />{s.label}</ToggleGroupItem>)}
        </ToggleGroup>
        <span className="text-xs text-muted-foreground">böyle görünecek</span>
        <div className="ml-auto flex gap-1">
          {!readOnly && <>
            <Button type="button" variant="ghost" size="sm" onClick={() => input.current?.click()} title="Başka bir video yükle"><Upload />Değiştir</Button>
            <Button type="button" variant="ghost" size="icon-sm" onClick={() => setPicking(true)} title="Kütüphaneden seç"><Library /></Button>
            <Button type="button" variant="ghost" size="icon-sm" onClick={() => onChange(null)} title="Videoyu kaldır"
                    className="hover:bg-destructive/10 hover:text-destructive"><Trash2 /></Button>
          </>}
        </div>
      </div>
      {/* the screen, with the film filling it (or banded) exactly as the app will */}
      <div className="mx-auto overflow-hidden rounded-xl bg-black ring-4 ring-foreground/80"
           style={{ aspectRatio: String(S.ratio), maxWidth: screen === "phone" ? "100%" : "70%" }}>
        {url && <video key={url} src={url} controls playsInline preload="metadata" className="h-full w-full"
                       style={{ objectFit: fit }}
                       onLoadedMetadata={(e) => { const v = e.currentTarget; setMeasured({ of: value ?? "", w: v.videoWidth, h: v.videoHeight, seconds: v.duration || 0 }); }} />}
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span className="max-w-60 truncate font-medium text-foreground" title={asset.name}>{asset.name}</span>
        {meta && <><span>{clock(meta.seconds)}</span><span>{meta.w}×{meta.h} · {ratioName(meta.w / meta.h)}</span></>}
        {asset.size > 0 && <span className={cn(asset.size > VIDEO_WARN_BYTES && "font-medium text-warning")}>{fmtSize(asset.size)}</span>}
      </div>
      {!readOnly && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium">Ekrana yerleşim</span>
          <ToggleGroup type="single" variant="outline" size="sm" spacing={0} value={fit} onValueChange={(v) => v && onFit(v as Fit)}>
            <ToggleGroupItem value="cover" title="Ekranı doldurur, sığmayan kenarlar kırpılır (önerilen)"><Monitor />Ekranı doldur</ToggleGroupItem>
            <ToggleGroupItem value="contain" title="Filmin tamamı görünür, boş kalan yerde bant olur"><Film />Tamamını göster</ToggleGroupItem>
          </ToggleGroup>
        </div>
      )}
      {(notes.length > 0 || ext === "mov" || asset.size > VIDEO_WARN_BYTES) && (
        <ul className="space-y-1 rounded-lg border bg-muted/30 p-3 text-xs">
          {notes.map((n, i) => <li key={i} className={cn("flex gap-1.5", n.tone === "warn" ? "font-medium text-warning" : "text-muted-foreground")}>
            {n.tone === "warn" ? <TriangleAlert className="mt-px size-3.5 shrink-0" /> : <span className="w-3.5 shrink-0 text-center">·</span>}{n.text}</li>)}
          {ext === "mov" && <li className="flex gap-1.5 font-medium text-warning"><TriangleAlert className="mt-px size-3.5 shrink-0" />MOV dosyası: Android telefonlar oynatamayabilir. MP4 (H.264) olarak dışa aktarın.</li>}
          {asset.size > VIDEO_WARN_BYTES && <li className="flex gap-1.5 font-medium text-warning"><TriangleAlert className="mt-px size-3.5 shrink-0" />{fmtSize(asset.size)}: her telefon bunu indirmeden kategoriyi açamaz. Daha düşük bit hızıyla (ör. 2–4 Mbps) dışa aktarın.</li>}
        </ul>
      )}
      {error && <Notice tone="bad" icon={<TriangleAlert />}>{error}</Notice>}
      {picking && <LibraryPicker kind="video" onPick={(a) => onChange(a.id)} onClose={() => setPicking(false)} />}
    </div>
  );
}
