import React from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Check, Sparkles } from "lucide-react";
import { GameIcon, SetPicker } from "../components/GameParts";
import { Slot } from "../components/Media";
import { FormField, PageHeader } from "../components/common";
import { useVocab } from "../vocab";
import { isTemplate, useGames } from "../games";
import { ROLE_LABEL } from "../types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";

/**
 * A new game: one of the app's OPEN engines as its mechanics (it draws a word
 * from its picture, so it can play words it has never seen), a name, a
 * picture, and a word set. No app update: it reaches phones with the next
 * release (`Yayınla`). Only open engines are offered (server: `isTemplate`).
 */
export function GameNew() {
  const { games, create, update } = useGames();
  const nav = useNavigate();
  const templates = games.filter(isTemplate);
  const [tplId, setTplId] = React.useState("");
  const tpl = templates.find((g) => g.id === tplId);
  const [name, setName] = React.useState("");
  const [subtitle, setSubtitle] = React.useState("");
  const [family, setFamily] = React.useState("");
  const [icon, setIcon] = React.useState<string | null>(null);
  const [params] = useSearchParams();
  const [set, setSet] = React.useState<string | null>(params.get("set"));
  const { sets, inventory } = useVocab();
  /* decision 2: an engine that does not introduce words only practises them */
  const practiceOnly = (id: string) => !inventory?.templates.find((t) => t.id === id)?.teach;
  const count = sets.find((x) => x.id === set)?.words.length ?? 0;
  const [live, setLive] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const ok = !!tpl && !!name.trim() && !!set && count >= 2;
  /* decision 2: a practice engine is played in a category, never alone */
  const canLive = !!tpl && !practiceOnly(tpl.id);

  const make = async () => {
    if (!tpl) return;
    setBusy(true); setError("");
    try {
      const g = await create({ template: tpl.id, name: name.trim(), subtitle: subtitle.trim(), family: family.trim() || undefined, icon, set });
      /* the game exists now: whatever the server says about putting it in the
         app, its page is where it is fixed -- never a second copy from here */
      if (live && canLive) {
        try { await update(g.id, { status: "live" }); }
        catch (e) { alert(`Oyun taslak olarak oluşturuldu. ${(e as Error).message}`); }
      }
      nav(`/oyunlar/${g.id}`);
    } catch (e) { setError((e as Error).message); setBusy(false); }
  };

  return (
    <>
      <PageHeader title="Yeni oyun" back={{ to: "/oyunlar", label: "Oyunlar" }}
        sub="Hazır oyunlardan birini seçin: mekaniği o oyunun olur. Sonra adını, resmini ve kelimelerini verin." />

      <Step n={1} title="Hangi oyundan?" done={!!tpl}>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {templates.map((g) => (
            <button key={g.id} type="button" onClick={() => { setTplId(g.id); if (!subtitle) setSubtitle(g.subtitle); }}
              className={cn("flex items-start gap-3 rounded-xl border bg-card p-3 text-left transition-colors",
                tplId === g.id ? "border-primary ring-3 ring-primary/15" : "hover:border-primary/40 hover:bg-muted/30")}>
              <GameIcon icon={g.icon} size={48} />
              <span className="min-w-0 flex-1 space-y-0.5">
                <span className="block truncate font-medium">{g.name}</span>
                <span className="block truncate text-xs text-muted-foreground">{g.gesture}</span>
                <span className="block text-[11px] text-muted-foreground">{ROLE_LABEL[g.role]} · şimdiki kelimeleri: {g.family}</span>
                {practiceOnly(g.id) && <span className="block text-[11px] font-medium text-warning">Kelimeleri tanıtmaz: tek başına yayınlanamaz, yalnız bir kategoride tanıtan adımdan sonra kullanılır.</span>}
              </span>
              {tplId === g.id && <Check className="size-4 text-primary" />}
            </button>
          ))}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Listede yalnızca uygulamanın yeni kelimelerle oynatabildiği oyunlar var: ikisi de kelimeyi resmiyle bir kutuda gösterip söylüyor.
          Öbür oyunlar her kelimeyi kendine göre çiziyor (hayvanlar elle çizili, piknikte her yemek başka hazırlanıyor); bir balığı çizemezlerdi.
        </p>
      </Step>

      {tpl && (
        <>
          <Step n={2} title="Adı ve resmi" done={!!name.trim()}>
            <Card>
              <CardContent className="grid gap-5 sm:grid-cols-2">
                <FormField label="Adı" hint="Menüdeki kartta görünen ad."><Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="ör. Deniz sepeti" /></FormField>
                <FormField label="Alt yazı"><Input value={subtitle} onChange={(e) => setSubtitle(e.target.value)} /></FormField>
                <FormField label="Konusu" hint={`Boş kalırsa: ${tpl.family}`}><Input value={family} onChange={(e) => setFamily(e.target.value)} placeholder="ör. Deniz canlıları" /></FormField>
                <FormField label="Menü kartı resmi" hint="Kare, şeffaf PNG. Görsel stüdyosunda da üretilebilir.">
                  <Slot kind="image" value={icon ?? undefined} onChange={(v) => setIcon(v ?? null)} />
                </FormField>
              </CardContent>
            </Card>
          </Step>
          <Step n={3} title="Kelime seti" done={!!set && count >= 2}>
            <Card><CardContent><SetPicker value={set} onChange={setSet} needIcon={tpl.takesWords} /></CardContent></Card>
          </Step>
          <Card className="sticky bottom-4 mt-6 shadow-lg">
            <CardContent className="flex flex-wrap items-center gap-3">
              <label className={cn("flex items-center gap-2 text-sm", !canLive && "text-muted-foreground")}>
                <Checkbox checked={live && canLive} disabled={!canLive} onCheckedChange={(v) => setLive(v === true)} />
                {canLive ? "Bir sonraki yayına girsin (yoksa taslak olarak kalır)"
                  : "Bu oyun tek başına yayına giremez: taslak olarak oluşur, bir kategoride tanıtan adımdan sonra kullanılır"}
              </label>
              {error && <span className="text-sm font-medium text-destructive">{error}</span>}
              <span className="ml-auto text-xs text-muted-foreground">{!name.trim() ? "Ad gerekli · " : ""}{!set ? "Kelime seti gerekli" : count < 2 ? "Sette en az iki kelime gerekli (her turda bir alternatif)" : ""}</span>
              <Button disabled={!ok || busy} onClick={make}>
                {busy ? <Spinner data-icon="inline-start" /> : <Sparkles data-icon="inline-start" />}Oyunu oluştur</Button>
            </CardContent>
          </Card>
        </>
      )}
    </>
  );
}

function Step({ n, title, done, children }: { n: number; title: string; done: boolean; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="mb-3 flex items-center gap-2.5 font-heading text-base font-semibold">
        <span className={cn("flex size-6 items-center justify-center rounded-full text-xs font-semibold",
          done ? "bg-success text-white" : "bg-primary/10 text-primary")}>
          {done ? <Check className="size-3.5" /> : n}
        </span>
        {title}
      </h2>
      {children}
    </section>
  );
}
