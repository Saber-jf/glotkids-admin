import React from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { AlertTriangle, BookA, CheckCircle2, FolderTree, Save, Trash2 } from "lucide-react";
import { GameIcon, STATUS_LABEL, SetPicker, StatusBadge, WordTile } from "../components/GameParts";
import { Slot } from "../components/Media";
import { FormField, Loading, Notice, PageHeader, Panel, Row, Select } from "../components/common";
import { codeOf, type CatalogGame, type GamePatch } from "../api";
import { useGames } from "../games";
import { useCategories } from "../categories";
import { useVocab } from "../vocab";
import { ROLE_LABEL } from "../types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { useUnsavedGuard } from "@/lib/autosave";

export function GameEdit() {
  const { id } = useParams();
  const { games, loading } = useGames();
  const game = games.find((g) => g.id === id);
  if (loading) return <Loading />;
  if (!game) return <p className="text-sm text-muted-foreground">Oyun bulunamadı. <Link className="text-primary underline-offset-4 hover:underline" to="/oyunlar">Listeye dön</Link></p>;
  /* a fresh form for each game, and after each save the server answered */
  return <Editor key={`${game.id}:${game.updatedAt}`} game={game} />;
}

function Editor({ game }: { game: CatalogGame }) {
  const { games, update, remove } = useGames();
  const { categories } = useCategories();
  const { sets } = useVocab();
  const setName = (id: string | null) => sets.find((x) => x.id === id)?.name ?? "set seçilmedi";
  const nav = useNavigate();
  const [d, setD] = React.useState(game);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const tpl = games.find((g) => g.id === game.template);
  /* an app game's name, words AND card picture are the app's (F07: a release
     carries only the panel's own games, the app draws its cards itself) --
     only its status is the panel's */
  const patch: GamePatch = game.builtin
    ? { status: d.status }
    : { name: d.name.trim(), subtitle: d.subtitle.trim(), icon: d.icon, status: d.status, family: d.family.trim(), set: d.set };
  const dirty = (Object.keys(patch) as (keyof GamePatch)[]).some((k) => JSON.stringify(patch[k]) !== JSON.stringify(game[k]));
  useUnsavedGuard(dirty);
  const inUse = categories.filter((c) => c.steps.some((s) => s.kind === "game" && s.game === game.id));
  const errs = game.issues.filter((i) => i.level === "error");

  const save = async () => {
    setBusy(true); setError("");
    try { await update(game.id, patch, game.updatedAt); }
    catch (e) {
      setError(codeOf(e) === "STALE" ? "Bu oyun siz düzenlerken başka bir yerde değişti; değişikliğiniz yazılmadı. Sayfa güncel hâli gösteriyor." : (e as Error).message);
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader title={d.name || "…"} back={{ to: "/oyunlar", label: "Oyunlar" }} lead={<GameIcon icon={d.icon} size={48} />}
        meta={<><span>kimlik: {game.id} · {game.builtin ? "hazır oyun" : `${tpl?.name ?? game.template} şablonundan`}</span><StatusBadge status={game.status} /></>}
        actions={<>
          {!game.builtin && (
            <Button variant="destructive" onClick={async () => {
              if (inUse.length) { alert(`Bu oyun şu kategorilerde kullanılıyor: ${inUse.map((c) => c.title).join(", ")}`); return; }
              if (!confirm(`"${game.name}" silinsin mi?`)) return;
              try { await remove(game.id); nav("/oyunlar"); } catch (e) { alert((e as Error).message); }
            }}><Trash2 data-icon="inline-start" />Sil</Button>
          )}
          <Button disabled={!dirty || busy || !d.name.trim()} onClick={save}>
            {busy ? <Spinner data-icon="inline-start" /> : <Save data-icon="inline-start" />}{dirty ? "Kaydet" : "Kaydedildi"}</Button>
        </>} />
      {error && <Notice tone="bad" className="mb-4">{error}</Notice>}
      {dirty && !busy && <Notice tone="accent" className="mb-4">Kaydedilmemiş değişiklik var; bu sayfa kendiliğinden kaydetmez.</Notice>}

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="min-w-0 space-y-6">
          <Card>
            <CardContent className="grid gap-5 sm:grid-cols-2">
              <FormField label="Adı" hint={game.builtin ? "Uygulamanın kodunda." : "Menüdeki kartta görünen ad."}><Input value={d.name} disabled={game.builtin} onChange={(e) => setD({ ...d, name: e.target.value })} /></FormField>
              <FormField label="Alt yazı" hint="Kartın altındaki kısa satır."><Input value={d.subtitle} disabled={game.builtin} onChange={(e) => setD({ ...d, subtitle: e.target.value })} /></FormField>
              {game.builtin ? (
                <FormField label="Menü kartı resmi" hint="Hazır oyunun kartını uygulama kendi çizer; panelden değiştirilemez ve yayınla telefona gitmez.">
                  <div className="flex items-center gap-3 rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
                    <GameIcon icon={game.icon} size={40} /> Uygulamanın çizimi
                  </div>
                </FormField>
              ) : (
                <FormField label="Menü kartı resmi" hint="Okumayı bilmeyen çocuk oyunu resimden seçer. Boşsa uygulama kendi çizimini kullanır.">
                  <Slot kind="image" value={d.icon ?? undefined} onChange={(v) => setD({ ...d, icon: v ?? null })} />
                </FormField>
              )}
              <FormField label="Durum" hint={game.builtin ? "Panelin kaydı: menüdeki kartı uygulama yönetir. Kategori adımı olarak her durumda oynar."
                : d.status === "hidden" ? "Menüde görünmez. Bir kategorinin adımıysa orada yine oynar (adım kendi motorunu taşır)."
                : d.status === "draft" ? "Menüye girmez. Bir kategorinin adımıysa orada yine oynar; tek başına yayınlanmaz."
                : "Bir sonraki yayınla telefonların menüsüne gider."}>
                <Select value={d.status} onChange={(e) => setD({ ...d, status: e.target.value as CatalogGame["status"] })}>
                  {(Object.keys(STATUS_LABEL) as CatalogGame["status"][]).map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                </Select>
              </FormField>
              {!game.builtin && (
                <FormField label="Konusu" hint="Kelimelerin neyle ilgili olduğu (ör. Deniz canlıları).">
                  <Input value={d.family} onChange={(e) => setD({ ...d, family: e.target.value })} />
                </FormField>
              )}
            </CardContent>
          </Card>

          {game.builtin && (
            <Panel title="Kelimeler" icon={<BookA />}
              description={game.words.length ? "Bu oyunun uygulamada oynattığı kelimeler. Uygulamanın kendi listesi; burada yalnızca gösterilir."
                : "Bu oyunun kelimeleri uygulamanın kodunda; panelde henüz listelenmiyor."}>
              {game.words.length > 0 && (
                <ul className="grid gap-2 sm:grid-cols-2">
                  {game.words.map((w) => <li key={w.id}><WordTile w={w} size={48} /></li>)}
                </ul>
              )}
            </Panel>
          )}

          {!game.builtin && (
            <Panel title="Kelime seti" icon={<BookA />}
              description="Bu oyunun oynattığı kelimeler bir setten gelir. Bir kelimeyi düzeltmek, onu oynatan her oyunda ve kategoride düzeltir.">
              <SetPicker value={d.set} onChange={(set) => setD({ ...d, set })} needIcon={tpl?.takesWords ?? true} />
            </Panel>
          )}
        </div>

        <aside className="space-y-4">
          <Panel title="Oyunun kendisi" description={game.builtin
              ? (game.takesWords ? "Uygulamanın kendi oyunu; mekaniği ve kelimeleri kodunda. Bu motor açık: ondan başka bir kelime setiyle yeni bir oyun yapılabilir."
                 : "Uygulamanın kendi oyunu; mekaniği ve kelimeleri kodunda. Bu motor kapalı: her kelimesini kendine göre çiziyor, başka kelimelerle oynamak için uygulamada değişiklik gerekir.")
              : "Mekanik şablondan gelir (uygulamanın kodu); ad, resim ve kelime seti bu oyunundur ve uygulama güncellemesi gerekmeden yayınla gider."}>
            <dl className="divide-y">
              <Row k="Şablon" v={tpl?.name ?? game.template} />
              <Row k="Görevi" v={ROLE_LABEL[game.role]} />
              <Row k="Jest" v={game.gesture || "—"} />
              {game.builtin && <Row k="Konusu" v={game.family} />}
              {game.accepts && <Row k="İçerik türü" v={game.accepts} />}
            </dl>
          </Panel>
          {!game.builtin && (
            <Panel title={errs.length ? `${errs.length} hata` : "Yayına girebilir"}
                   icon={errs.length ? <AlertTriangle className="text-destructive" /> : <CheckCircle2 className="text-success" />}>
              {game.issues.length === 0 ? <p className="text-sm text-muted-foreground">Eksik bir şey yok.</p> : (
                <ul className="space-y-1">
                  {game.issues.map((x, i) => <li key={i} className={cn("text-xs font-medium", x.level === "error" ? "text-destructive" : "text-warning")}>• {x.text}</li>)}
                </ul>
              )}
              <p className="mt-3 text-xs text-muted-foreground">Durumu “Uygulamada” olan ve hatası olmayan oyun, <Link to="/yayinla" className="font-medium text-primary hover:underline">Yayınla</Link> sayfasından telefonlara gider.</p>
            </Panel>
          )}
          <Panel title="Kategorilerde" icon={<FolderTree />}
                 description="Bir kategorinin adımı olarak oynarken oyun KATEGORİNİN kelime setini oynatır; kendi seti yalnız menüden açılınca geçerli.">
            {inUse.length === 0 ? (
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>Hiçbir kategorinin akışında değil.</p>
                <p>Haritaya oyun değil kategori konur: bu oyunu bir kategorinin akışına adım olarak ekleyin, sonra kategoriyi Yol haritasında bir sıra yapın.
                  Her kategori adımı için ayrı bir oyun kaydı gerekmez.</p>
                <Button asChild variant="outline" size="sm"><Link to="/kategoriler">Bir kategoriye adım olarak ekle</Link></Button>
              </div>
            ) : (
              <ul className="space-y-1">
                {inUse.map((c) => <li key={c.id} className="text-sm">
                  <Link to={`/kategoriler/${c.id}`} className="font-medium hover:text-primary">{c.title}</Link>
                  <span className="text-xs text-muted-foreground"> · kelimeler: {setName(c.set)}{!game.builtin && c.set !== d.set ? " (oyunun kendi setinden farklı)" : ""}</span>
                </li>)}
              </ul>
            )}
          </Panel>
        </aside>
      </div>
    </>
  );
}
