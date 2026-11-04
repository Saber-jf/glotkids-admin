/**
 * A word set's words, edited where they are shown: in order, each with its
 * readiness (picture, description, recordings), added from the shared library
 * or made new there. The set's own page and the category wizard both use it,
 * so a set is edited the same way wherever it is met.
 */
import React from "react";
import { ArrowDown, ArrowUp, Check, FileAudio, ImageOff, Library, Minus, Pencil, Plus } from "lucide-react";
import { GameIcon } from "./GameParts";
import { WordEditor } from "./WordEditor";
import { EmptyState, Meter, Modal, ModalActions, Notice, Pill, SearchField } from "./common";
import { codeOf, type Word, type WordSet } from "../api";
import { SOURCE_LABEL, setGaps, soundSource, useVocab, wordGaps } from "../vocab";
import { NEEDED_SLOTS, PALETTE } from "../types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardHeader, CardTitle } from "@/components/ui/card";

const NEED = NEEDED_SLOTS.map((s) => s.id);
/** the most words a set takes */
export const SET_ROOM = 12;

export function SetWordList({ set, className }: { set: WordSet; className?: string }) {
  const { wordOf, updateSet } = useVocab();
  const [editing, setEditing] = React.useState<Word | "new" | null>(null);
  const [picking, setPicking] = React.useState(false);
  const [error, setError] = React.useState("");
  const ro = set.builtin;
  const words = set.words.map(wordOf).filter((w): w is Word => !!w);
  const run = (p: Promise<unknown>) => p.then(() => setError("")).catch((e: Error) =>
    setError(codeOf(e) === "STALE" ? "Bu set başka bir yerde (başka bir sekmede) değişti; güncel hâli gösteriliyor, değişikliğinizi yeniden yapın." : e.message));
  /* every write names the set's version as this screen shows it (A02) */
  const saveWords = (ids: string[]) => run(updateSet(set.id, { words: ids }, set.updatedAt));
  const move = (i: number, d: -1 | 1) => {
    const ids = [...set.words]; const j = i + d;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j]!, ids[i]!];
    saveWords(ids);
  };
  const full = set.words.length >= SET_ROOM;

  return (
    <Card className={cn("h-fit gap-0 pb-0", className)}>
      <CardHeader className="border-b">
        <CardTitle className="flex flex-wrap items-center gap-2">
          Kelimeler <span className="font-normal text-muted-foreground">({words.length})</span>
          {words.length > 0 && (words.length < 5 || words.length > 7) && <Pill tone="warn">bir seri 5–7 kelime</Pill>}
        </CardTitle>
        {!ro && (
          <CardAction className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" disabled={full} onClick={() => setPicking(true)}><Library />Kütüphaneden ekle</Button>
            <Button size="sm" disabled={full} onClick={() => setEditing("new")}><Plus />Yeni kelime</Button>
          </CardAction>
        )}
      </CardHeader>
      {error && <Notice tone="bad" className="m-3">{error}</Notice>}
      {words.length === 0
        ? <div className="p-4"><EmptyState icon={<Plus />} title="Bu sette kelime yok"
            sub="Kütüphanede olan bir kelimeyi seçin ya da yeni bir kelime ekleyin: İngilizcesi, Türkçesi, açıklaması, resmi ve kayıtları."
            action={!ro && <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setPicking(true)}><Library />Kütüphaneden ekle</Button>
              <Button size="sm" onClick={() => setEditing("new")}><Plus />Yeni kelime</Button>
            </div>} /></div>
        : <ul className="divide-y">
            {words.map((w, i) => {
              const gaps = wordGaps(w, NEED);
              const shared = w.sets.filter((x) => x !== set.id).length;
              return (
                <li key={w.id} className="flex items-center gap-4 px-4 py-3 transition-colors hover:bg-muted/40">
                  {w.icon || w.builtin ? <GameIcon icon={w.icon} size={48} />
                          : <div title="Resmi yok" className="flex size-12 items-center justify-center rounded-md bg-destructive/10 text-destructive"><ImageOff className="size-5" /></div>}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      <span className="text-base font-semibold" style={{ color: w.color }}>{w.en}</span>
                      <span className="text-muted-foreground">{w.tr}</span>
                      {shared > 0 && <Pill>{shared} sette daha</Pill>}
                    </div>
                    <div className="truncate text-sm text-muted-foreground">{w.about || <em className="text-destructive">açıklama cümlesi yok</em>}</div>
                  </div>
                  <div className="hidden gap-1 sm:flex">
                    {NEEDED_SLOTS.map((sl) => {
                      const src = soundSource(w, sl.id);
                      return (
                        <span key={sl.id} title={`${sl.who}: ${sl.label} — ${SOURCE_LABEL[src]}`}
                              className={cn("flex size-6 items-center justify-center rounded-md",
                                src === "panel" ? "bg-success/10 text-success" : src === "bundle" ? "bg-success/10 text-success/70 ring-1 ring-success/30"
                                : src === "device" ? "bg-warning/15 text-warning" : "bg-destructive/10 text-destructive")}>
                          <FileAudio className="size-3.5" />
                        </span>
                      );
                    })}
                  </div>
                  <Pill tone={gaps.sounds.length ? "warn" : "ok"} className="hidden md:inline-flex"
                        title="Panelde ya da uygulamanın paketinde kaydı olmayan yuvalar; telefon onları cihaz sesiyle okur.">
                    {gaps.sounds.length ? `${gaps.sounds.length} kayıtsız (cihaz sesi)` : "kayıtlar tamam"}</Pill>
                  <div className="flex">
                    {!ro && <>
                      <Button variant="ghost" size="icon-sm" onClick={() => move(i, -1)} disabled={i === 0} title="Yukarı"><ArrowUp /></Button>
                      <Button variant="ghost" size="icon-sm" onClick={() => move(i, 1)} disabled={i === words.length - 1} title="Aşağı"><ArrowDown /></Button>
                    </>}
                    <Button variant="ghost" size="icon-sm" onClick={() => setEditing(w)} title="Kelimeyi düzenle" className="text-primary"><Pencil /></Button>
                    {!ro && <Button variant="ghost" size="icon-sm" onClick={() => saveWords(set.words.filter((x) => x !== w.id))} title="Setten çıkar (kütüphanede kalır)"
                                    className="hover:bg-destructive/10 hover:text-destructive"><Minus /></Button>}
                  </div>
                </li>
              );
            })}
          </ul>}
      {editing && <WordEditor word={editing === "new" ? null : editing} color={PALETTE[set.words.length % PALETTE.length]}
        onClose={() => setEditing(null)} onCreated={(w) => saveWords([...set.words, w.id])} />}
      {picking && <PickWords have={set.words} room={SET_ROOM - set.words.length} onClose={() => setPicking(false)}
        onAdd={(ids) => { saveWords([...set.words, ...ids]); setPicking(false); }} />}
    </Card>
  );
}

/** how ready a set's words are: pictures, recordings, descriptions */
export function SetReadiness({ set }: { set: WordSet }) {
  const { wordOf } = useVocab();
  const words = set.words.map(wordOf).filter((w): w is Word => !!w);
  const g = setGaps(words, NEED);
  return (
    <div className="space-y-4">
      <Meter label="Resimler" have={words.length - g.icons} of={words.length} />
      <Meter label="Ses kayıtları" have={g.soundsTotal - g.sounds} of={g.soundsTotal} />
      <Meter label="Açıklama cümleleri" have={words.length - g.about} of={words.length} />
      <p className="text-xs text-muted-foreground">Kayıtlar panelden ya da uygulamanın paketinden sayılır; kaydı hiç olmayan satırı telefon kendi sesiyle okur (Türkçe ses yoksa susar). Uygulamanın kendi kelimelerinin resmi uygulamada çizili.</p>
    </div>
  );
}

/** words the library already has: added to the set, never copied */
function PickWords({ have, room, onAdd, onClose }: { have: string[]; room: number; onAdd: (ids: string[]) => void; onClose: () => void }) {
  const { words } = useVocab();
  const [q, setQ] = React.useState("");
  const [picked, setPicked] = React.useState<string[]>([]);
  const needle = q.trim().toLocaleLowerCase("tr");
  const offer = words.filter((w) => !have.includes(w.id)
    && (!needle || `${w.en} ${w.tr} ${w.id}`.toLocaleLowerCase("tr").includes(needle)));
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length < room ? [...p, id] : p));
  return (
    <Modal title="Kütüphaneden kelime ekle" onClose={onClose} wide>
      <SearchField autoFocus value={q} onChange={setQ} placeholder="İngilizce ya da Türkçe ara" className="max-w-none" />
      {offer.length === 0 ? <p className="text-sm text-muted-foreground">Uyan kelime yok. Yeni kelime olarak ekleyin.</p> : (
        <ul className="grid max-h-[50vh] gap-2 overflow-y-auto p-0.5 sm:grid-cols-3">
          {offer.map((w) => {
            const on = picked.includes(w.id);
            return (
              <li key={w.id}>
                <button type="button" onClick={() => toggle(w.id)}
                  className={cn("flex w-full items-center gap-2 rounded-lg border p-2 text-left transition-colors",
                    on ? "border-primary bg-primary/5 ring-2 ring-primary/15" : "hover:bg-muted/40")}>
                  <GameIcon icon={w.icon} size={36} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium" style={{ color: w.color }}>{w.en}</span>
                    <span className="block truncate text-xs text-muted-foreground">{w.tr}{w.builtin ? " · uygulamanın" : ""}</span>
                  </span>
                  <span aria-hidden className={cn("flex size-4 shrink-0 items-center justify-center rounded-[4px] border border-input",
                    on && "border-primary bg-primary text-primary-foreground")}>{on && <Check className="size-3" />}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <ModalActions start={<span className="text-xs text-muted-foreground">{picked.length} seçili · en çok {room} kelime eklenebilir</span>}>
        <Button variant="ghost" onClick={onClose}>Vazgeç</Button>
        <Button disabled={picked.length === 0} onClick={() => onAdd(picked)}>{picked.length} kelimeyi ekle</Button>
      </ModalActions>
    </Modal>
  );
}
