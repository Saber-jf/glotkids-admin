import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { BookA, Lock, Plus, RefreshCw } from "lucide-react";
import { GameIcon, NewSetModal } from "../components/GameParts";
import { EmptyState, Loading, Notice, PageHeader, Pill, Section } from "../components/common";
import type { Word, WordSet } from "../api";
import { setGaps, useVocab } from "../vocab";
import { NEEDED_SLOTS } from "../types";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Word sets: the 5–7 words a series is built on (rule 11). A set is a list of
 * words from the shared library -- a word is never copied into it -- and
 * games and categories name a set. The app's own sets arrive with its
 * inventory and are read-only here; a recording given to one of their words
 * still reaches phones with a release.
 */
export function WordSets() {
  const { sets, loading, error, refresh, createSet } = useVocab();
  const [params, setParams] = useSearchParams();
  const nav = useNavigate();
  const own = sets.filter((s) => !s.builtin), app = sets.filter((s) => s.builtin);
  return (
    <>
      <PageHeader title="Kelime setleri"
        sub="Bir serinin 5–7 kelimesi. Kelimeler ortak kütüphanedendir: bir kelime birden çok sette olabilir ve düzeltmesi her yerde görünür. Oyunlar ve kategoriler bir set seçer."
        actions={<>
          <Button asChild variant="outline"><Link to="/kelimeler"><BookA data-icon="inline-start" />Kelime kütüphanesi</Link></Button>
          <Button onClick={() => setParams({ yeni: "1" })}><Plus data-icon="inline-start" />Yeni kelime seti</Button>
        </>} />
      {loading ? <Loading />
       : error ? <Notice tone="bad" action={<Button variant="outline" size="sm" onClick={refresh}><RefreshCw />Tekrar dene</Button>}><b>Setler alınamadı:</b> {error}</Notice>
       : (
        <div className="space-y-10">
          <Section title="Paneldeki setler" count={own.length}>
            {own.length === 0
              ? <EmptyState icon={<BookA />} title="Henüz panelde kurulmuş set yok"
                       sub="Yeni bir set, uygulamanın açık oyunlarıyla (Lili'ye ver, Bul bakalım) güncelleme gerekmeden oynanır."
                       action={<Button onClick={() => setParams({ yeni: "1" })}>İlk seti kur</Button>} />
              : <div className="grid gap-4 md:grid-cols-2">{own.map((s) => <SetCard key={s.id} s={s} />)}</div>}
          </Section>
          <Section title="Uygulamanın kendi setleri" count={app.length}
                   sub="Uygulamanın envanterinden gelir; kelime listesi uygulamanın kodunda. Kelimelerine kayıt verilebilir; yeni bir set bu kelimeleri de kullanabilir.">
            <div className="grid gap-4 md:grid-cols-2">{app.map((s) => <SetCard key={s.id} s={s} />)}</div>
          </Section>
        </div>
      )}
      {params.get("yeni") === "1" && <NewSetModal create={createSet} onClose={() => setParams({})}
        onMade={(id) => nav(`/kelime-setleri/${id}`)} />}
    </>
  );
}

function SetCard({ s }: { s: WordSet }) {
  const { wordOf } = useVocab();
  const words = s.words.map(wordOf).filter((w): w is Word => !!w);
  const g = setGaps(words, NEEDED_SLOTS.map((x) => x.id));
  const used = s.usedBy.games.length + s.usedBy.categories.length;
  return (
    <Link to={`/kelime-setleri/${s.id}`} className="group block rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
      <Card className="h-full transition-shadow group-hover:shadow-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">{s.name}{s.builtin && <Lock className="size-3.5 text-muted-foreground" />}</CardTitle>
          <CardDescription>{s.words.length} kelime · {used ? `${used} oyun/kategoride` : "henüz kullanılmıyor"}</CardDescription>
          <CardAction>
            {g.icons + g.sounds + g.about === 0 ? <Pill tone="ok">tamam</Pill>
              : <Pill tone="warn">{[g.sounds && `${g.sounds} ses`, g.icons && `${g.icons} resim`, g.about && `${g.about} açıklama`].filter(Boolean).join(" · ")} eksik</Pill>}
          </CardAction>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {words.map((w) => (
            <div key={w.id} className="flex items-center gap-1.5 rounded-md border bg-muted/30 py-1 pr-2.5 pl-1">
              <GameIcon icon={w.icon} size={24} />
              <span className="text-sm font-medium" style={{ color: w.color }}>{w.en}</span>
            </div>
          ))}
        </CardContent>
      </Card>
    </Link>
  );
}
