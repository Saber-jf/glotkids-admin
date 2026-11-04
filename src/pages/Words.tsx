import React from "react";
import { useSearchParams } from "react-router-dom";
import { BookA, ImageOff, Plus } from "lucide-react";
import { GameIcon } from "../components/GameParts";
import { KIND_LABEL, WordEditor } from "../components/WordEditor";
import { Chips, EmptyState, Loading, PageHeader, Pill, SearchField } from "../components/common";
import type { Word } from "../api";
import { useVocab, wordGaps } from "../vocab";
import { NEEDED_SLOTS } from "../types";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useSticky } from "../lib/sticky";

const NEED = NEEDED_SLOTS.map((s) => s.id);
type Filter = "all" | "own" | "app" | "loose" | "gaps";
const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "Tümü" }, { id: "own", label: "Paneldekiler" }, { id: "app", label: "Uygulamanın" },
  { id: "gaps", label: "Eksiği olanlar" }, { id: "loose", label: "Sette olmayanlar" },
];

/**
 * The word library: every word, once. Sets, games and categories refer to
 * these rows, so a fix here is a fix wherever the word is played.
 */
export function Words() {
  const { words, sets, loading } = useVocab();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useSticky("words.q", "");
  const [filter, setFilter] = React.useState<Filter>("all");
  const open = params.get("w");
  const editing: Word | "new" | null = open === "yeni" ? "new" : (open && words.find((w) => w.id === open)) || null;

  const needle = q.trim().toLocaleLowerCase("tr");
  const gapsOf = (w: Word) => { const g = wordGaps(w, NEED); return (g.icon ? 1 : 0) + (g.about ? 1 : 0) + g.sounds.length; };
  const shown = words.filter((w) =>
    (!needle || `${w.en} ${w.tr} ${w.id}`.toLocaleLowerCase("tr").includes(needle)) &&
    (filter === "all" || (filter === "own" && !w.builtin) || (filter === "app" && w.builtin)
      || (filter === "loose" && w.sets.length === 0) || (filter === "gaps" && gapsOf(w) > 0)));

  return (
    <>
      <PageHeader title="Kelime kütüphanesi"
        sub="Her kelime bir kez: İngilizcesi, Türkçesi, açıklaması, türü, rengi, resmi ve kayıtları. Setler buradan seçer; bir kelimeyi düzeltmek onu kullanan her yerde düzeltir."
        actions={<Button onClick={() => setParams({ w: "yeni" })}><Plus data-icon="inline-start" />Yeni kelime</Button>} />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <SearchField value={q} onChange={setQ} placeholder="Kelime ara" />
        <Chips value={filter} onChange={setFilter} items={FILTERS} />
        <span className="ml-auto text-sm text-muted-foreground tabular-nums">{shown.length} / {words.length} kelime</span>
      </div>
      {loading ? <Loading /> : shown.length === 0
        ? <EmptyState icon={<BookA />} title="Uyan kelime yok" />
        : (
          <Card className="py-0">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-16 pl-4">Resim</TableHead>
                  <TableHead>Kelime</TableHead>
                  <TableHead className="hidden md:table-cell">Setler</TableHead>
                  <TableHead className="pr-4 text-right">Durum</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {shown.map((w) => {
                  const g = wordGaps(w, NEED);
                  return (
                    <TableRow key={w.id} className="cursor-pointer" onClick={() => setParams({ w: w.id })}>
                      <TableCell className="pl-4">
                        {w.icon ? <GameIcon icon={w.icon} size={40} />
                                : <div className="flex size-10 items-center justify-center rounded-md bg-destructive/10 text-destructive"><ImageOff className="size-4" /></div>}
                      </TableCell>
                      <TableCell>
                        <button type="button" className="text-left outline-none focus-visible:underline" onClick={(e) => { e.stopPropagation(); setParams({ w: w.id }); }}>
                          <span className="flex flex-wrap items-baseline gap-x-2">
                            <span className="text-base font-semibold" style={{ color: w.color }}>{w.en}</span>
                            <span className="text-muted-foreground">{w.tr}</span>
                            <span className="text-xs text-muted-foreground">· {KIND_LABEL[w.kind] ?? w.kind}</span>
                          </span>
                        </button>
                        {w.builtin && <Pill className="ml-2">uygulamanın</Pill>}
                      </TableCell>
                      <TableCell className="hidden max-w-64 truncate text-muted-foreground md:table-cell">
                        {w.sets.length ? w.sets.map((id) => sets.find((s) => s.id === id)?.name ?? id).join(", ") : <em>hiçbir sette değil</em>}
                      </TableCell>
                      <TableCell className="pr-4 text-right">
                        <div className="flex flex-wrap justify-end gap-1.5">
                          {g.about && <Pill tone="warn">açıklama yok</Pill>}
                          <Pill tone={g.sounds.length ? "warn" : "ok"}>{g.sounds.length ? `${g.sounds.length} kayıt eksik` : "kayıtlar tamam"}</Pill>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Card>
        )}
      {editing && <WordEditor word={editing === "new" ? null : editing} onClose={() => setParams({})} />}
    </>
  );
}
