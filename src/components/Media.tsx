/**
 * Everything that shows or accepts a file: a thumbnail for any asset, and a
 * slot that takes an upload (or a pick from the library) for one kind.
 */
import React from "react";
import { Drama, FileAudio, FileVideo, ImagePlus, Library, Pause, Play, Trash2, Upload, Type } from "lucide-react";
import { useAssetUrl } from "../blobs";
import { useStore } from "../store";
import type { Asset, AssetKind } from "../types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { EmptyState, Modal, fmtSize } from "./common";

const ACCEPT: Record<AssetKind, string> = {
  /* no SVG (decision 8): the server refuses it anyway, whatever it is called */
  image: "image/png,image/webp,image/jpeg",
  audio: "audio/mpeg,audio/mp4,audio/x-m4a,audio/wav,audio/aac",
  video: "video/mp4,video/quicktime",
  /* a mascot's Lottie (the Maskotlar page uploads these) */
  animation: ".json,application/json",
  /* a font (the Yazı tipi page uploads these): TTF/OTF only, the phone loads nothing else */
  font: ".ttf,.otf,font/ttf,font/otf",
};

export function Thumb({ asset, size = 56 }: { asset?: Asset; size?: number }) {
  const url = useAssetUrl(asset);
  const box = { width: size, height: size };
  if (!asset) return <div style={box} className="shrink-0 rounded-md bg-muted" />;
  if (asset.kind === "image")
    return url ? <img src={url} alt={asset.name} style={box} className="shrink-0 rounded-md bg-muted/60 object-contain p-1" />
               : <div style={box} className="shrink-0 animate-pulse rounded-md bg-muted" />;
  const Icon = asset.kind === "audio" ? FileAudio : asset.kind === "animation" ? Drama : asset.kind === "font" ? Type : FileVideo;
  return (
    <div style={box} className="flex shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
      <Icon size={size * 0.42} />
    </div>
  );
}

/** a tiny play/pause for one sound */
export function PlayButton({ asset }: { asset?: Asset }) {
  const url = useAssetUrl(asset);
  const ref = React.useRef<HTMLAudioElement | null>(null);
  const [on, setOn] = React.useState(false);
  if (!asset || asset.kind !== "audio") return null;
  return (
    <>
      <Button type="button" size="icon-sm" disabled={!url} className="shrink-0 rounded-full"
        onClick={() => { const a = ref.current; if (!a) return; if (on) { a.pause(); a.currentTime = 0; } else a.play(); }}
        aria-label={on ? "Durdur" : "Dinle"}>
        {on ? <Pause /> : <Play className="ml-0.5" />}
      </Button>
      {url && <audio ref={ref} src={url} onPlay={() => setOn(true)} onPause={() => setOn(false)}
                     onEnded={() => setOn(false)} />}
    </>
  );
}

/** pick one asset of a kind out of the library */
export function LibraryPicker({ kind, onPick, onClose }: {
  kind: AssetKind; onPick: (a: Asset) => void; onClose: () => void;
}) {
  const { db } = useStore();
  const list = db.assets.filter((a) => a.kind === kind);
  return (
    <Modal title="Kütüphaneden seç" onClose={onClose} wide>
      {list.length === 0
        ? <EmptyState icon={<Library />} title="Bu türde dosya yok" sub="Kütüphanede bu türde dosya yok. Önce bir dosya yükleyin." />
        : <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
            {list.map((a) => (
              <button key={a.id} type="button" onClick={() => { onPick(a); onClose(); }}
                      className="flex flex-col items-center gap-2 rounded-lg border p-3 text-left transition-colors hover:border-primary/50 hover:bg-primary/5">
                <Thumb asset={a} size={64} />
                <span className="w-full truncate text-center text-xs font-medium">{a.name}</span>
              </button>
            ))}
          </div>}
    </Modal>
  );
}

/**
 * One file slot: empty, it takes a drop, an upload or a pick from the
 * library; filled, it shows the file (playable if it is a sound) and can be
 * swapped or cleared.
 */
export function Slot({ kind, value, onChange, label, compact }: {
  kind: AssetKind; value?: string; onChange: (id: string | undefined) => void;
  label?: string; compact?: boolean;
}) {
  const { db, addAsset } = useStore();
  /* a file the list has not caught up with (made in another window) is
     still shown, straight from the server */
  const asset = db.assets.find((a) => a.id === value)
    ?? (value ? { id: value, kind, name: value.replace(/^app-(game|word)-/, ""), mime: "",
                  size: 0, createdAt: 0, url: `/api/assets/${encodeURIComponent(value)}` } : undefined);
  const input = React.useRef<HTMLInputElement>(null);
  const [over, setOver] = React.useState(false);
  const [picking, setPicking] = React.useState(false);
  const take = async (f?: File | null) => {
    if (!f) return;
    const a = await addAsset(f);
    if (a && a.kind === kind) onChange(a.id);
  };
  const EmptyIcon = kind === "image" ? ImagePlus : kind === "audio" ? FileAudio : FileVideo;

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); take(e.dataTransfer.files[0]); }}
      className={cn("flex min-w-0 items-center gap-3 rounded-lg border transition-colors",
        asset ? "bg-card" : "border-dashed bg-muted/30", over && "border-primary bg-primary/5", compact ? "p-2" : "p-3")}>
      <input ref={input} type="file" accept={ACCEPT[kind]} className="hidden"
             onChange={(e) => { take(e.target.files?.[0]); e.target.value = ""; }} />
      {asset ? (
        <>
          {kind === "audio" ? <PlayButton asset={asset} /> : <Thumb asset={asset} size={compact ? 40 : 52} />}
          <div className="min-w-0 flex-1">
            {label && <div className="text-xs text-muted-foreground">{label}</div>}
            <div className="truncate text-sm font-medium">{asset.name}</div>
            {!compact && <div className="text-xs text-muted-foreground">{fmtSize(asset.size)}</div>}
          </div>
          <Button type="button" variant="ghost" size="icon-sm" onClick={() => input.current?.click()} title="Değiştir"><Upload /></Button>
          <Button type="button" variant="ghost" size="icon-sm" onClick={() => onChange(undefined)} title="Kaldır"
                  className="hover:bg-destructive/10 hover:text-destructive"><Trash2 /></Button>
        </>
      ) : (
        <>
          <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground"><EmptyIcon className="size-4" /></div>
          <div className="min-w-0 flex-1">
            {label && <div className="text-xs text-muted-foreground">{label}</div>}
            <div className="text-xs text-muted-foreground">{compact ? "Eksik" : "Sürükleyip bırakın ya da yükleyin"}</div>
          </div>
          <Button type="button" variant="ghost" size="icon-sm" onClick={() => setPicking(true)} title="Kütüphaneden seç"><Library /></Button>
          <Button type="button" variant="outline" size={compact ? "icon-sm" : "sm"} onClick={() => input.current?.click()} title="Yükle">
            <Upload />{compact ? null : "Yükle"}
          </Button>
        </>
      )}
      {picking && <LibraryPicker kind={kind} onPick={(a) => onChange(a.id)} onClose={() => setPicking(false)} />}
    </div>
  );
}
