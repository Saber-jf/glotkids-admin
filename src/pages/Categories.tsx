import React from "react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import { ChevronRight, Clapperboard, Film, FolderTree, Gamepad2, Lock, Plus, RefreshCw, Sparkles } from "lucide-react";
import { GameIcon, StatusBadge } from "../components/GameParts";
import { EmptyState, Loading, Notice, PageHeader, Pill, Section, TONE, WordChip } from "../components/common";
import type { FlowStep, ServerCategory } from "../api";
import { errorsOf, useCategories } from "../categories";
import { useGames } from "../games";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function Categories() {
  const { categories, loading, error, refresh } = useCategories();
  const [params] = useSearchParams();
  /* an old link ("?yeni=1") opens the wizard */
  if (params.get("yeni") === "1") return <Navigate to="/kategoriler/yeni" replace />;
  const own = categories.filter((c) => !c.builtin);
  const app = categories.filter((c) => c.builtin);
  return (
    <>
      <PageHeader title="Kategoriler"
        sub="Bir kategori bir seridir: kelimeleri ve çocuğun yürüdüğü akış — açılış videosu, üç oyun, aralarındaki geçişler ve bitiş. Üç oyun da kategorinin kelimeleriyle oynar."
        actions={<Button asChild><Link to="/kategoriler/yeni"><Plus data-icon="inline-start" />Yeni kategori</Link></Button>} />
      {loading ? <Loading>Kategoriler yükleniyor…</Loading>
       : error ? <Notice tone="bad" action={<Button variant="outline" size="sm" onClick={refresh}><RefreshCw />Tekrar dene</Button>}><b>Kategoriler alınamadı:</b> {error}</Notice>
       : (
        <div className="space-y-10">
          <Section title="Yeni kategoriler" count={own.length} sub="Sunucudan gelir. Uygulamaya konduğunda uygulamanın Kategoriler sekmesinde görünür.">
            {own.length === 0
              ? <EmptyState icon={<FolderTree />} title="Henüz yeni kategori yok"
                       sub="Bir kategori kelimeleri, videoları ve üç oyunuyla burada kurulur."
                       action={<Button asChild><Link to="/kategoriler/yeni">İlk kategoriyi ekle</Link></Button>} />
              : <div className="grid gap-4 md:grid-cols-2">{own.map((c) => <CategoryCard key={c.id} c={c} />)}</div>}
          </Section>
          <Section title="Uygulamanın kendi kategorileri" count={app.length} sub="Uygulamanın içinde, yerel. Burada yalnızca gösterilir; değişiklikleri uygulamanın kodunda yapılır.">
            <div className="grid gap-4 md:grid-cols-2">{app.map((c) => <CategoryCard key={c.id} c={c} />)}</div>
          </Section>
        </div>
      )}
    </>
  );
}

export function StepChip({ s }: { s: FlowStep }) {
  const { games } = useGames();
  const g = s.kind === "game" ? games.find((x) => x.id === s.game) : undefined;
  const tone = s.kind === "game" ? TONE.accent : s.kind === "finish" ? TONE.ok : TONE.plain;
  const Icon = s.kind === "game" ? Gamepad2 : s.kind === "finish" ? Sparkles : s.kind === "video" ? Film : Clapperboard;
  return (
    <span title={s.id} className={cn("flex h-6 shrink-0 items-center gap-1 rounded-md px-1.5 text-xs font-medium", tone)}>
      <Icon className="size-3.5" />
      {s.kind === "game" ? g?.name ?? "oyun seçilmedi" : s.kind === "finish" ? "Bitiş" : ""}
    </span>
  );
}

function CategoryCard({ c }: { c: ServerCategory }) {
  const errs = errorsOf(c);
  return (
    <Link to={`/kategoriler/${c.id}`} className="group block rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
      <Card className="h-full transition-shadow group-hover:shadow-md">
        <CardHeader className="grid-cols-[auto_1fr_auto] items-start gap-x-3">
          <div className="row-span-2"><GameIcon icon={c.icon} size={44} /></div>
          <CardTitle className="col-start-2 truncate text-base">{c.title}</CardTitle>
          <CardDescription className="col-start-2 truncate">{c.subtitle || `${c.words.length} kelime`}</CardDescription>
          <div className="col-start-3 row-span-2 row-start-1 flex flex-wrap justify-end gap-1.5">
            {c.builtin ? <Pill><Lock /> yerel</Pill>
              : errs ? <Pill tone="bad">{errs} hata</Pill> : <Pill tone="ok">hazır</Pill>}
            <StatusBadge status={c.status} />
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {c.words.map((w) => <WordChip key={w.id} en={w.en} color={w.color} />)}
            {c.words.length === 0 && <span className="text-xs text-muted-foreground">Henüz kelime yok</span>}
          </div>
          <div className="flex flex-wrap items-center gap-1 border-t pt-3">
            {c.steps.map((s, i) => (
              <React.Fragment key={s.id + i}>
                {i > 0 && <ChevronRight className="size-3.5 shrink-0 text-muted-foreground/50" />}
                <StepChip s={s} />
              </React.Fragment>
            ))}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
