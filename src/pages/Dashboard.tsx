import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { AlertTriangle, ArrowRight, BookA, CheckCircle2, FolderTree, Gamepad2, Library, Plus, Rocket } from "lucide-react";
import { getDraft, type Draft, type Word } from "../api";
import { setGaps, useVocab } from "../vocab";
import { NEEDED_SLOTS } from "../types";
import { errorsOf, useCategories } from "../categories";
import { useGames } from "../games";
import { StatusBadge } from "../components/GameParts";
import { IconTile, PageHeader, Panel, Pill } from "../components/common";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export function Dashboard() {
  const { sets, words, wordOf } = useVocab();
  const { games } = useGames();
  const { categories } = useCategories();
  const [draft, setDraft] = React.useState<Draft | null>(null);
  React.useEffect(() => { getDraft().then(setDraft).catch(() => setDraft(null)); }, [games, categories, words]);
  const pending = draft ? draft.diff.test.added.length + draft.diff.test.changed.length + draft.diff.test.removed.length : 0;
  const nav = useNavigate();
  const tiles = [
    { to: "/kategoriler", label: "Kategori", n: categories.length, icon: FolderTree, tone: "accent" as const },
    { to: "/kelime-setleri", label: "Kelime seti", n: sets.length, icon: BookA, tone: "ok" as const },
    { to: "/kelimeler", label: "Kelime", n: words.length, icon: Library, tone: "bad" as const },
    { to: "/oyunlar", label: "Oyun", n: games.length, icon: Gamepad2, tone: "warn" as const },
  ];
  const todo = [
    ...categories.filter((c) => !c.builtin).flatMap((c) => {
      const errs = errorsOf(c);
      return errs ? [{ to: `/kategoriler/${c.id}`, text: `${c.title}: akışta ${errs} hata`, bad: true }] : [];
    }),
    ...games.filter((g) => !g.builtin && g.status === "live").flatMap((g) => {
      const errs = g.issues.filter((i) => i.level === "error").length;
      return errs ? [{ to: `/oyunlar/${g.id}`, text: `${g.name}: ${errs} hata, yayına giremez`, bad: true }] : [];
    }),
    ...sets.filter((s) => s.usedBy.games.length + s.usedBy.categories.length > 0 || !s.builtin).flatMap((s) => {
      const g = setGaps(s.words.map(wordOf).filter((w): w is Word => !!w), NEEDED_SLOTS.map((x) => x.id));
      const out = [];
      if (g.icons) out.push({ to: `/kelime-setleri/${s.id}`, text: `${s.name}: ${g.icons} kelimenin resmi yok`, bad: false });
      if (g.sounds) out.push({ to: `/kelime-setleri/${s.id}`, text: `${s.name}: ${g.sounds}/${g.soundsTotal} ses kaydı eksik`, bad: false });
      return out;
    }),
  ];
  return (
    <>
      <PageHeader title="Genel bakış"
        sub="Uygulamanın içeriği: kategoriler, oyunlar, kelime setleri ve kelimeler. Burada yapılan değişiklik bir taslaktır; telefonlara Yayınla sayfasından gider."
        actions={<>
          <Button variant="outline" onClick={() => nav("/kelime-setleri?yeni=1")}><BookA data-icon="inline-start" />Yeni kelime seti</Button>
          <Button onClick={() => nav("/kategoriler/yeni")}><Plus data-icon="inline-start" />Yeni kategori</Button>
        </>} />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {tiles.map(({ to, label, n, icon: Icon, tone }) => (
          <Link key={to} to={to} className="group rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
            <Card className="flex-row items-center gap-4 px-5 transition-shadow group-hover:shadow-md">
              <IconTile tone={tone} size="lg"><Icon /></IconTile>
              <div>
                <div className="font-heading text-3xl font-semibold leading-none tabular-nums">{n}</div>
                <div className="mt-1 text-sm text-muted-foreground">{label}</div>
              </div>
            </Card>
          </Link>
        ))}
      </div>

      <Link to="/yayinla" className="group mt-4 block rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
        <Card className="flex-row flex-wrap items-center gap-4 px-5 transition-shadow group-hover:shadow-md">
          <IconTile size="lg"><Rocket /></IconTile>
          <div className="min-w-0 flex-1">
            <div className="font-heading text-base font-semibold">{!draft ? "Yayın durumu…" : pending ? `${pending} değişiklik henüz yayınlanmadı` : "Test kanalı taslakla aynı"}</div>
            <div className="text-sm text-muted-foreground">{draft?.blocked ? "Yayını durduran hata var." : "Telefonlar yalnızca yayınlananı görür: önce test, sonra üretim."}</div>
          </div>
          {pending > 0 && <Pill tone={draft?.blocked ? "bad" : "warn"}>{draft?.blocked ? "hata var" : "yayınlanmayı bekliyor"}</Pill>}
          <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
        </Card>
      </Link>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Panel title="Kategoriler" contentClassName="space-y-2">
          {categories.map((c) => {
            const errs = c.builtin ? 0 : errorsOf(c);
            return (
              <Link key={c.id} to={`/kategoriler/${c.id}`}
                    className="flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors hover:bg-muted/50">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{c.title}</div>
                  <div className="text-xs text-muted-foreground">{c.words.length} kelime · {c.steps.length} adım{c.builtin ? " · uygulamada yerel" : ""}</div>
                </div>
                {errs ? <Pill tone="bad">{errs} hata</Pill> : <Pill tone="ok"><CheckCircle2 /> hazır</Pill>}
                <StatusBadge status={c.status} />
              </Link>
            );
          })}
        </Panel>
        <Panel title="Yapılacaklar" description={todo.length ? `${todo.length} madde` : undefined}>
          {todo.length === 0
            ? <p className="flex items-center gap-2 text-sm text-muted-foreground"><CheckCircle2 className="size-4 text-success" /> Eksik bir şey yok.</p>
            : <ul className="-mx-2 space-y-0.5">
                {todo.map((t, i) => (
                  <li key={i}>
                    <Link to={t.to} className="flex items-start gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-muted">
                      <AlertTriangle className={cn("mt-0.5 size-4 shrink-0", t.bad ? "text-destructive" : "text-warning")} />{t.text}
                    </Link>
                  </li>
                ))}
              </ul>}
        </Panel>
      </div>
    </>
  );
}
