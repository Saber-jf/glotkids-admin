import React from "react";
import { Drama, Eraser, FileAudio, Film, Image as ImageIcon, Images, Trash2, Upload } from "lucide-react";
import { PlayButton, Thumb } from "../components/Media";
import { EmptyState, Notice, PageHeader, Pill, fmtSize } from "../components/common";
import { useStore } from "../store";
import type { Asset, AssetKind } from "../types";
import { assetUsage, gcAssets, type Use } from "../api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSticky } from "../lib/sticky";

const TABS: { id: AssetKind | "all"; label: string; icon: typeof Images }[] = [
  { id: "all", label: "Hepsi", icon: Images },
  { id: "image", label: "İkonlar", icon: ImageIcon },
  { id: "audio", label: "Sesler", icon: FileAudio },
  { id: "video", label: "Videolar", icon: Film },
  { id: "animation", label: "Animasyonlar", icon: Drama },
];

export function MediaLibrary() {
  const { db, addAsset, removeAsset, removeGen } = useStore();
  const [gcText, setGcText] = React.useState("");
  /* who uses what is the SERVER's answer (S06/A05): every reference it knows,
     fetched again after each change -- never a guess from this screen */
  const [usage, setUsage] = React.useState<Record<string, Use[]>>({});
  const loadUsage = React.useCallback(() => { assetUsage().then(setUsage).catch(() => {}); }, []);
  React.useEffect(() => { loadUsage(); }, [loadUsage, db.assets.length, db.lines, db.gens]);
  const del = async (a: Asset, uses: Use[]) => {
    const archive = uses.length > 0 && uses.every((u) => u.archive);
    if (!confirm(archive ? `${a.name} yalnız arşivde (deneme/üretim kaydı). Arşiv kaydıyla birlikte silinsin mi?` : `${a.name} silinsin mi?`)) return;
    try {
      await removeAsset(a.id, archive);
      if (archive) db.gens.filter((g) => g.asset === a.id).forEach((g) => removeGen(g.id));
      setGcText("");
    } catch (e) { setGcText(`Silinmedi: ${(e as Error).message}`); }
    loadUsage();
  };
  const [tab, setTab] = useSticky<AssetKind | "all">("media.tab", "all");
  const [over, setOver] = React.useState(false);
  const input = React.useRef<HTMLInputElement>(null);
  const list = db.assets.filter((a) => tab === "all" || a.kind === tab).sort((a, b) => b.createdAt - a.createdAt);
  const upload = async (files: FileList | null) => { for (const f of Array.from(files ?? [])) await addAsset(f); };

  return (
    <>
      <PageHeader title="Medya kütüphanesi"
        sub="Kelime ikonları (PNG, JPEG, WebP — SVG kabul edilmez), ses kayıtları (MP3/M4A/AAC/WAV) ve videolar (MP4/MOV) ve maskot animasyonları (Lottie JSON, Maskotlar sayfasından). Sunucu dosyanın türünü içeriğinden anlar. Bir dosya birden çok yerde kullanılabilir."
        actions={<>
          <Button variant="outline" title="Hiçbir dosya adının ve hiçbir yayının kullanmadığı baytları diskten siler"
            onClick={async () => { try { const r = await gcAssets(); setGcText(r.removed ? `${r.removed} artık dosya silindi (${fmtSize(r.bytes)}).` : "Silinecek artık dosya yok."); } catch (e) { setGcText((e as Error).message); } }}>
            <Eraser data-icon="inline-start" />Artıkları temizle</Button>
          <Button onClick={() => input.current?.click()}><Upload data-icon="inline-start" />Dosya yükle</Button>
        </>} />
      {gcText && <Notice className="mb-4">{gcText}</Notice>}
      <input ref={input} type="file" multiple className="hidden" accept="image/png,image/jpeg,image/webp,audio/mpeg,audio/mp4,audio/x-m4a,audio/aac,audio/wav,video/mp4,video/quicktime,.json,application/json"
             onChange={(e) => { upload(e.target.files); e.target.value = ""; }} />
      <Tabs value={tab} onValueChange={(v) => setTab(v as AssetKind | "all")} className="mb-4">
        <TabsList>
          {TABS.map(({ id, label, icon: Icon }) => (
            <TabsTrigger key={id} value={id}>
              <Icon />{label}
              <span className="text-muted-foreground tabular-nums">{db.assets.filter((a) => id === "all" || a.kind === id).length}</span>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      <div onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
           onDrop={(e) => { e.preventDefault(); setOver(false); upload(e.dataTransfer.files); }}
           className={cn("rounded-xl transition-shadow", over && "ring-4 ring-primary/30")}>
        {list.length === 0
          ? <EmptyState icon={<Upload />} title="Burada dosya yok" sub="Dosyaları buraya sürükleyip bırakabilirsiniz." />
          : <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {list.map((a) => {
                const uses = usage[a.id] ?? [];
                const used = uses.filter((u) => !u.archive).map((u) => u.text);
                const archived = uses.length > 0 && used.length === 0;
                return (
                  <Card key={a.id} size="sm" className="pt-0">
                    <div className="flex h-32 items-center justify-center border-b bg-muted/40">
                      <Thumb asset={a} size={88} />
                    </div>
                    <CardContent className="flex flex-1 flex-col gap-2">
                      <div className="truncate text-sm font-medium" title={a.name}>{a.name}</div>
                      <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                        {fmtSize(a.size) || "başlangıç içeriği"}
                        {used.length ? <Pill tone="ok">{used.length} yerde</Pill> : archived ? <Pill>yalnız arşivde</Pill> : <Pill>kullanılmıyor</Pill>}
                      </div>
                      <div className="mt-auto flex items-center justify-between">
                        <PlayButton asset={a} />
                        <Button variant="ghost" size="icon-sm" title={used.length ? `Kullanılıyor: ${used.join(", ")}` : "Sil"}
                                disabled={used.length > 0} onClick={() => void del(a, uses)}
                                className="ml-auto hover:bg-destructive/10 hover:text-destructive">
                          <Trash2 />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>}
      </div>
    </>
  );
}
