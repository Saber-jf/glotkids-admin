import React from "react";
import { Link } from "react-router-dom";
import { Pencil, Plus, RefreshCw } from "lucide-react";
import { GameIcon, QuickEdit, StatusBadge } from "../components/GameParts";
import { Chips, Loading, Notice, PageHeader, SearchField, Section } from "../components/common";
import type { CatalogGame } from "../api";
import { isTemplate, useGames } from "../games";
import { ROLE_LABEL, type GameRole } from "../types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useSticky } from "../lib/sticky";

/* UX03: "52 games" are three different things -- the app's own (mechanics and
   words in its code), the open templates among them (they take new words),
   and the games made here from a template */
type Filter = "all" | "new" | "templates" | "app" | GameRole | "hidden";
const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "Tümü" }, { id: "new", label: "Panelde yapılanlar" },
  { id: "templates", label: "Açık şablonlar" }, { id: "app", label: "Uygulamanın oyunları" },
  { id: "teach", label: ROLE_LABEL.teach }, { id: "practice", label: ROLE_LABEL.practice },
  { id: "measure", label: ROLE_LABEL.measure }, { id: "hidden", label: "Gizli" },
];

export function Games() {
  const { games, loading, error, refresh } = useGames();
  const [q, setQ] = useSticky("games.q", "");
  const [filter, setFilter] = React.useState<Filter>("all");
  const [quick, setQuick] = React.useState<CatalogGame | null>(null);

  const needle = q.trim().toLocaleLowerCase("tr");
  const shown = games.filter((g) =>
    (!needle || [g.name, g.subtitle, g.family, g.id].some((x) => x.toLocaleLowerCase("tr").includes(needle))) &&
    (filter === "all" ? true : filter === "new" ? !g.builtin : filter === "hidden" ? g.status === "hidden"
      : filter === "templates" ? isTemplate(g) : filter === "app" ? g.builtin && g.kind === "game"
      : g.kind === "game" && g.role === filter));
  const groups: { title: string; sub?: string; list: CatalogGame[] }[] = [
    { title: "Yeni oyunlar", sub: "Hazır bir oyundan yapılmış, kendi adı, ikonu ve kelimeleri olan oyunlar.", list: shown.filter((g) => !g.builtin) },
    ...(["teach", "practice", "measure"] as GameRole[]).map((r) => ({
      title: ROLE_LABEL[r], list: shown.filter((g) => g.builtin && g.kind === "game" && g.role === r) })),
    { title: "Sahneler ve deneme sayfaları", sub: "Menüde duran ama oyun olmayan ekranlar.", list: shown.filter((g) => g.builtin && g.kind !== "game") },
  ];

  return (
    <>
      <PageHeader title="Oyunlar"
        sub="Uygulamanın menüsündeki bütün oyunlar, sunucudan. Adını, alt yazısını, resmini ve durumunu buradan değiştirin; hazır bir oyunu seçip kendi kelimeleriyle yeni bir oyun yapın."
        actions={<Button asChild><Link to="/oyunlar/yeni"><Plus data-icon="inline-start" />Yeni oyun</Link></Button>} />

      <Notice tone="plain" className="mb-4">
        <b className="font-medium">Açık şablonlar</b> (ör. Lili'ye ver, Bul bakalım) yeni kelimelerle panelden çoğaltılabilir ve yayınla telefona gider.
        Diğer hazır oyunlar kendi kelimelerini kendisi çizer. <b className="font-medium">Yeni bir oyun mekaniği</b> panelden yapılamaz: uygulamada kod ve bir uygulama güncellemesi ister.
        Haritaya bir oyun değil bir <Link to="/kategoriler" className="font-medium text-primary hover:underline">kategori</Link> konur; oyun o kategorinin bir adımıdır.
      </Notice>
      <div className="mb-6 flex flex-wrap items-center gap-2">
        <SearchField value={q} onChange={setQ} placeholder="Oyun ara" />
        <Chips value={filter} onChange={setFilter} items={FILTERS} />
        <span className="ml-auto text-sm text-muted-foreground tabular-nums">{shown.length} / {games.length} oyun</span>
      </div>

      {loading ? <Loading>Oyunlar yükleniyor…</Loading>
       : error ? <Notice tone="bad" action={<Button variant="outline" size="sm" onClick={refresh}><RefreshCw />Tekrar dene</Button>}><b>Oyunlar alınamadı:</b> {error}</Notice>
       : (
        <div className="space-y-10">
          {groups.filter((g) => g.list.length).map((grp) => (
            <Section key={grp.title} title={grp.title} count={grp.list.length} sub={grp.sub}>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {grp.list.map((g) => <GameCard key={g.id} g={g} onQuick={() => setQuick(g)} />)}
              </div>
            </Section>
          ))}
          {shown.length === 0 && <p className="text-sm text-muted-foreground">Aramaya uyan oyun yok.</p>}
        </div>
      )}
      {quick && <QuickEdit game={quick} onClose={() => setQuick(null)} />}
    </>
  );
}

function GameCard({ g, onQuick }: { g: CatalogGame; onQuick: () => void }) {
  const { games } = useGames();
  const tpl = !g.builtin ? games.find((x) => x.id === g.template) : undefined;
  return (
    <Card size="sm" className={cn("group flex-row items-center gap-3 px-3 transition-shadow hover:shadow-md", g.status === "hidden" && "opacity-60")}>
      <Link to={`/oyunlar/${g.id}`} className="flex min-w-0 flex-1 items-center gap-3 outline-none">
        <GameIcon icon={g.icon} size={48} />
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium">{g.name}</div>
          <div className="truncate text-xs text-muted-foreground">{g.subtitle}</div>
          <div className="mt-1.5 flex min-w-0 items-center gap-1.5">
            <StatusBadge status={g.status} />
            <span className="truncate text-[11px] text-muted-foreground">
              {g.builtin ? g.family : `${tpl?.name ?? g.template} şablonu · ${g.words.length} kelime`}
            </span>
          </div>
        </div>
      </Link>
      <Button variant="ghost" size="icon-sm" onClick={onQuick} title="Adını, resmini değiştir"
              className="text-muted-foreground opacity-60 group-hover:opacity-100"><Pencil /></Button>
    </Card>
  );
}
