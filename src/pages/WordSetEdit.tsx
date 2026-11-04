import React from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { FolderTree, Gamepad2, Lock, Trash2 } from "lucide-react";
import { SetReadiness, SetWordList } from "../components/SetWords";
import { FormField, Loading, Notice, PageHeader, Panel, Pill } from "../components/common";
import { codeOf } from "../api";
import { useVocab } from "../vocab";
import { useGames } from "../games";
import { useCategories } from "../categories";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

/**
 * One word set: its words, in order, from the shared library. Adding a word
 * either picks one the library already has (a word is never made twice) or
 * makes a new one there. Who plays the set is listed beside it.
 */
export function WordSetEdit() {
  const { id } = useParams();
  const { sets, updateSet, removeSet, loading } = useVocab();
  const { games } = useGames();
  const { categories } = useCategories();
  const nav = useNavigate();
  const set = sets.find((s) => s.id === id);
  const [name, setName] = React.useState(set?.name ?? "");
  const [note, setNote] = React.useState(set?.note ?? "");
  const [error, setError] = React.useState("");
  React.useEffect(() => { setName(set?.name ?? ""); setNote(set?.note ?? ""); }, [set?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (loading) return <Loading />;
  if (!set) return <p className="text-sm text-muted-foreground">Set bulunamadı. <Link className="text-primary underline-offset-4 hover:underline" to="/kelime-setleri">Listeye dön</Link></p>;

  const ro = set.builtin;
  const run = (p: Promise<unknown>) => p.then(() => setError("")).catch((e: Error) =>
    setError(codeOf(e) === "STALE" ? "Bu set başka bir yerde (başka bir sekmede) değişti; güncel hâli gösteriliyor, değişikliğinizi yeniden yapın." : e.message));
  const usedGames = games.filter((x) => set.usedBy.games.includes(x.id));
  const usedCats = categories.filter((x) => set.usedBy.categories.includes(x.id));

  return (
    <>
      <PageHeader back={{ to: "/kelime-setleri", label: "Kelime setleri" }}
        title={
          <input value={name} disabled={ro} onChange={(e) => setName(e.target.value)} aria-label="Setin adı"
                 onBlur={() => name.trim() && name !== set.name && run(updateSet(set.id, { name: name.trim() }, set.updatedAt))}
                 className="-ml-1.5 w-full max-w-xl rounded-md bg-transparent px-1.5 py-0.5 text-2xl font-semibold tracking-tight outline-none transition-colors hover:bg-muted/60 focus:bg-background focus:ring-3 focus:ring-ring/50 disabled:hover:bg-transparent" />
        }
        meta={<>kimlik: {set.id}{ro && <Pill><Lock /> uygulamanın</Pill>}</>}
        actions={!ro && <>
          <Button variant="destructive" onClick={async () => {
            if (set.usedBy.games.length + set.usedBy.categories.length) {
              alert(`Bu seti kullananlar var: ${[...usedGames.map((x) => x.name), ...usedCats.map((x) => x.title)].join(", ")}`); return;
            }
            if (!confirm(`"${set.name}" silinsin mi? Kelimeler kütüphanede kalır.`)) return;
            try { await removeSet(set.id); nav("/kelime-setleri"); } catch (e) { setError((e as Error).message); }
          }}><Trash2 data-icon="inline-start" />Sil</Button>
        </>} />
      {error && <Notice tone="bad" className="mb-4">{error}</Notice>}

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <SetWordList set={set} />

        <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          <Panel title="Hazırlık"><SetReadiness set={set} /></Panel>
          <Panel title="Bu seti oynatanlar" icon={<Gamepad2 />}>
            {usedGames.length + usedCats.length === 0 ? <p className="text-sm text-muted-foreground">Henüz hiçbir oyun ya da kategori bu seti seçmedi.</p> : (
              <ul className="space-y-1">
                {usedGames.map((x) => <li key={x.id}><Link to={`/oyunlar/${x.id}`} className="flex items-center gap-2 text-sm font-medium hover:text-primary"><Gamepad2 className="size-3.5 text-muted-foreground" />{x.name}</Link></li>)}
                {usedCats.map((x) => <li key={x.id}><Link to={`/kategoriler/${x.id}`} className="flex items-center gap-2 text-sm font-medium hover:text-primary"><FolderTree className="size-3.5 text-muted-foreground" />{x.title}</Link></li>)}
              </ul>
            )}
            {!ro && <Button asChild variant="link" size="sm" className="mt-2 h-auto px-0"><Link to={`/oyunlar/yeni?set=${set.id}`}>Bu setle yeni oyun yap →</Link></Button>}
          </Panel>
          <Panel title="Not">
            <FormField label={<span className="sr-only">Not</span>}>
              <Textarea value={note} disabled={ro} onChange={(e) => setNote(e.target.value)}
                onBlur={() => note !== set.note && run(updateSet(set.id, { note }, set.updatedAt))} placeholder="Bu set neyi öğretiyor?" />
            </FormField>
          </Panel>
        </aside>
      </div>

    </>
  );
}
