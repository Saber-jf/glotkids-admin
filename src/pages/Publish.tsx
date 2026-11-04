import React from "react";
import { Link } from "react-router-dom";
import { flushEdits } from "@/lib/autosave";
import { AlertTriangle, CheckCircle2, RefreshCw, Rocket, Send, Smartphone, Undo2, XCircle } from "lucide-react";
import { FormField, IconTile, Loading, Notice, PageHeader, Panel, Pill, Section, TONE_TEXT, fmtSize, type Tone } from "../components/common";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { CHANNELS, getDraft, listReleases, pointChannel, publish, type Channel, type Diff, type Draft, type Release } from "../api";
import { codeOf, type DraftIssue } from "../api";
import { useGames } from "../games";
import { useCategories } from "../categories";
import { useStore } from "../store";
import { useVocab } from "../vocab";

const CHANNEL: Record<Channel, { name: string; to: string; who: string; tone: Tone }> = {
  test: { name: "Test", to: "Teste al", who: "Ekibin telefonları ve simülatör (geliştirme sürümü)", tone: "warn" },
  production: { name: "Üretim", to: "Üretime al", who: "Mağazadan indiren herkes", tone: "ok" },
};

/**
 * Publishing: what phones receive. The panel edits a draft all day; a phone
 * never reads it. Publishing freezes everything marked live that passes its
 * checks into release N, and points the test channel at it. Once it has been
 * seen on a phone, the same release is promoted to production. Rolling back
 * is pointing a channel at an older release -- nothing is rebuilt.
 */
export function Publish() {
  const [draft, setDraft] = React.useState<Draft | null>(null);
  const [rel, setRel] = React.useState<{ releases: Release[]; channels: { name: Channel; release: number | null }[] } | null>(null);
  const [error, setError] = React.useState("");
  const [note, setNote] = React.useState("");
  const [alsoProd, setAlsoProd] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [done, setDone] = React.useState<number | null>(null);
  const games = useGames(), cats = useCategories(), store = useStore(), vocab = useVocab();
  const [holding, setHolding] = React.useState<string>("");

  /*
   * THE SAME SNAPSHOT (A03). Before the draft is shown -- and again before
   * it is published -- every edit still on its way is sent and waited for:
   * the studio document, the category queue, word and set writes. A failure
   * or a conflict there stops publishing: the draft would not be what is on
   * the screens. The draft carries a fingerprint; publishing sends it back and
   * the server refuses if the draft moved on in between (another tab).
   */
  const settle = React.useCallback(async (): Promise<string> => {
    const [s1, s2, , s3] = await Promise.all([store.flush(), cats.flush(), vocab.idle(), flushEdits()]);
    if (!s1) return "Stüdyo değişiklikleri sunucuya kaydedilemedi (bağlantı ya da başka bir pencere). Önce onu çözün.";
    if (!s2) return "Bir kategori kaydedilemedi ya da başka bir sekmede değişmiş. Kategoriler sayfasından çözün.";
    /* the roadmap, pack, song and mascot editors (F01): a value typed a moment
       before coming here is sent first, or publishing waits for the fix */
    if (!s3) return "Bir harita sırası, paket, şarkı ya da maskot düzenlemesi kaydedilemedi. O sayfaya dönüp çözün.";
    return "";
  }, [store.flush, cats.flush, vocab.idle]); // eslint-disable-line react-hooks/exhaustive-deps

  const load = React.useCallback(async () => {
    setHolding(await settle());
    try { const [d, r] = await Promise.all([getDraft(), listReleases()]); setDraft(d); setRel(r); setError(""); }
    catch (e) { setError((e as Error).message); }
  }, [settle]);
  React.useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  /* a save that finishes after the page opened changes the draft: look again */
  const quiet = store.sync === "saved" && vocab.pending === 0
    && Object.values(cats.pending).every((p) => p.state === "saved");
  const wasQuiet = React.useRef(quiet);
  React.useEffect(() => { if (quiet && !wasQuiet.current) void load(); wasQuiet.current = quiet; }, [quiet, load]);

  const head = (c: Channel) => rel?.channels.find((x) => x.name === c)?.release ?? null;
  const nameOf = (kind: DraftIssue["kind"], id: string) => kind === "roadmap" ? `harita sırası ${id}`
    : kind === "pack" ? `paket ${id}` : kind === "mascot" ? `maskot ${id}` : kind === "song" ? `şarkı ${id}` : kind === "game"
    ? games.games.find((g) => g.id === id)?.name ?? id
    : kind === "category" ? cats.categories.find((c) => c.id === id)?.title ?? id
    : kind === "asset" ? `dosya ${id}` : `kayıt ${id}`;
  /* UX02: every issue links to the form that fixes it */
  const linkOf = (kind: DraftIssue["kind"], id: string): string | null => kind === "category" ? `/kategoriler/${id}`
    : kind === "game" ? `/oyunlar/${id}` : kind === "roadmap" ? `/yol-haritasi/${id}` : kind === "pack" ? `/paketler/${id}`
    : kind === "mascot" ? `/maskotlar/${id}` : kind === "song" ? `/muzik/${id}` : kind === "clip" ? "/ses-studyosu" : null;
  const errors = draft?.issues.filter((i) => i.level === "error") ?? [];
  const warns = draft?.issues.filter((i) => i.level === "warn") ?? [];
  const vsTest = draft?.diff.test;
  const nothingNew = !!vsTest && !vsTest.added.length && !vsTest.changed.length && !vsTest.removed.length;

  const go = async () => {
    if (alsoProd && !confirm("Bu yayın doğrudan ÜRETİME de gidecek: mağazadan indiren her telefon bir sonraki açılışta alacak. Emin misiniz?")) return;
    setBusy(true); setError("");
    const held = await settle();
    if (held) { setHolding(held); setBusy(false); return; }
    try {
      const r = await publish(note.trim(), alsoProd ? ["test", "production"] : ["test"], draft?.fingerprint);
      setDone(r.id); setNote(""); setAlsoProd(false);
      await load();
    } catch (e) {
      if (codeOf(e) === "DRAFT_CHANGED") { setError("Taslak siz bakarken değişti (başka bir sekme ya da yeni kaydedilen bir değişiklik). Yeni hâli aşağıda; gözden geçirip yeniden yayınlayın."); await load(); }
      else setError((e as Error).message);
    }
    setBusy(false);
  };
  const point = async (c: Channel, id: number) => {
    const cur = head(c);
    const verb = cur !== null && id < cur ? "geri alınsın" : "taşınsın";
    if (!confirm(`${CHANNEL[c].name} kanalı ${id}. yayına ${verb} mı?${c === "production" ? " Bütün telefonlar bir sonraki açılışta bunu alır." : ""}`)) return;
    try { await pointChannel(c, id); await load(); } catch (e) { setError((e as Error).message); }
  };

  return (
    <>
      <PageHeader title="Yayınla"
        sub="Telefonlar paneli değil, yayınları okur. “Uygulamada” işaretli ve hatası olmayan oyunlar, kategoriler, kelimeleri, resimleri ve kayıtları tek bir yayında dondurulur. Önce test kanalına gider; telefonda görüldükten sonra üretime alınır."
        actions={<Button variant="outline" onClick={load}><RefreshCw data-icon="inline-start" />Yenile</Button>} />
      {error && <Notice tone="bad" icon={<XCircle />} className="mb-4">{error}</Notice>}
      {holding && <Notice tone="warn" icon={<AlertTriangle />} className="mb-4">{holding} Yayın bu yüzden durduruldu.</Notice>}

      <div className="mb-6 grid gap-4 md:grid-cols-2">
        {CHANNELS.map((c) => {
          const id = head(c);
          const r = rel?.releases.find((x) => x.id === id);
          return (
            <Card key={c} className="flex-row items-center gap-4 px-5">
              <IconTile tone={CHANNEL[c].tone} size="lg"><Smartphone /></IconTile>
              <div className="min-w-0 flex-1">
                <div className="font-heading text-base font-semibold">{CHANNEL[c].name} kanalı</div>
                <div className="text-xs text-muted-foreground">{CHANNEL[c].who}</div>
              </div>
              <div className="text-right">
                {id === null ? <Pill>henüz yayın yok</Pill> : <>
                  <div className="font-heading text-2xl font-semibold tabular-nums">#{id}</div>
                  <div className="text-xs text-muted-foreground">{r ? new Date(r.createdAt).toLocaleString("tr") : ""}</div>
                </>}
              </div>
            </Card>
          );
        })}
      </div>

      {!draft ? <Loading>Taslak hazırlanıyor…</Loading> : (
        <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
          <div className="min-w-0 space-y-6">
            <Panel title="Şimdi yayınlansa giden"
              description="Uygulamanın kendi kelimelerine verilen kayıtlar ve sabit cümlelerin onaylı kayıtları da gider: telefonda paketteki kaydın yerine çalarlar.">
              <div className="grid grid-cols-3 gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-6">
                <Count n={draft.counts.games} label="oyun" />
                <Count n={draft.counts.categories} label="kategori" />
                <Count n={draft.counts.words} label="kelime" />
                <Count n={draft.counts.clips} label="kayıt" />
                {!!draft.counts.songs && <Count n={draft.counts.songs} label="şarkı" />}
                {!!draft.counts.mascots && <Count n={draft.counts.mascots} label="maskot" />}
                {!!draft.counts.fonts && <Count n={draft.counts.fonts} label="yazı tipi" />}
                {!!draft.counts.palette && <Count n={draft.counts.palette} label="renk paleti" />}
                <Count n={draft.counts.assets} label="dosya" />
                <Count n={fmtSize(draft.counts.bytes) || "0"} label="toplam" />
              </div>
              {(draft.manifest.packs ?? []).length > 0 && (
                <div className="mt-4 rounded-lg border bg-muted/30 p-3">
                  <div className="text-sm font-medium">İndirme paketleri <span className="font-normal text-muted-foreground">· telefona listelenir, dosyaları yalnız bir büyüğün onayıyla iner</span></div>
                  <ul className="mt-1.5 space-y-1 text-sm">
                    {draft.manifest.packs!.map((p) => (
                      <li key={p.id}><b className="font-medium">{p.title}</b> <span className="text-muted-foreground">· {p.lands.length} sıra · {p.categories.length} kategori · {fmtSize(p.bytes) || "0"}
                        {p.offerAt ? ` · “${p.offerAt}” durağında sunulur` : " · hemen sunulur"}</span></li>
                    ))}
                  </ul>
                </div>
              )}
              {(draft.manifest.roadmap?.slides ?? []).length > 0 && (
                <div className="mt-4 rounded-lg border bg-muted/30 p-3">
                  <div className="text-sm font-medium">Harita sıraları <span className="font-normal text-muted-foreground">· uygulamanın kendi 6 sırasının arkasına, bu sırayla</span></div>
                  <ul className="mt-1.5 space-y-1 text-sm">
                    {draft.manifest.roadmap!.slides.map((sl) => (
                      <li key={sl.id}><Link to={`/yol-haritasi/${sl.id}`} className="font-medium hover:underline">{sl.title}</Link>
                        <span className="text-muted-foreground"> · {sl.stops?.length ?? 0} durak{sl.stops?.length ? ` (${sl.stops.map((x) => (x.kind === "music" ? "♪" : x.kind)).join(" · ")})` : ""}{sl.pack ? ` · paket: ${sl.pack}` : " · herkese iner"}</span></li>
                    ))}
                  </ul>
                  <p className="mt-1.5 text-xs text-muted-foreground">Girmeyen sıralar ve nedenleri aşağıdaki uyarılarda.</p>
                </div>
              )}
              {(draft.manifest.games.length > 0 || draft.manifest.categories.length > 0) && (
                <ul className="mt-4 space-y-1 text-sm">
                  {draft.manifest.categories.map((c) => <li key={c.id} className="font-medium">Kategori · {c.title}{c.pack && <span className="ml-2 text-xs font-normal text-muted-foreground">paket: {c.pack}</span>}{c.requires > 1 && <span className="ml-2 text-xs font-normal text-muted-foreground">sürüm {c.requires}+ telefonlar</span>}</li>)}
                  {draft.manifest.games.map((g) => <li key={g.id} className="font-medium">Oyun · {g.name}{g.requires > 1 && <span className="ml-2 text-xs font-normal text-muted-foreground">sürüm {g.requires}+ telefonlar</span>}</li>)}
                </ul>
              )}
            </Panel>

            <Panel icon={errors.length ? <XCircle className="text-destructive" /> : <CheckCircle2 className="text-success" />}
              title={<>{errors.length ? `${errors.length} hata yayını durduruyor` : "Yayını durduran bir şey yok"}
                {warns.length > 0 && <span className="text-sm font-normal text-warning">· {warns.length} uyarı</span>}</>}>
              {draft.issues.length === 0 ? <p className="text-sm text-muted-foreground">Bütün kontroller temiz.</p> : (
                <ul className="space-y-1">
                  {[...errors, ...warns].map((x, i) => (
                    <li key={i} className={cn("text-sm", x.level === "error" ? "text-destructive" : "text-warning")}>
                      • {linkOf(x.kind, x.item)
                          ? <Link to={linkOf(x.kind, x.item)!} className="font-medium underline-offset-4 hover:underline">{nameOf(x.kind, x.item)}</Link>
                          : <b className="font-medium">{nameOf(x.kind, x.item)}</b>}: {x.text}
                    </li>
                  ))}
                </ul>
              )}
              {errors.length > 0 && <p className="mt-3 text-xs text-muted-foreground">Hatayı düzeltin ya da o oyunu/kategoriyi “Taslak”a alın; taslak yayına girmez.</p>}
            </Panel>

            <div className="grid gap-4 md:grid-cols-2">
              {CHANNELS.map((c) => <DiffCard key={c} title={`${CHANNEL[c].name} kanalına göre`} d={draft.diff[c]} none={head(c) === null} />)}
            </div>
          </div>

          <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
            <Panel title="Yeni yayın" icon={<Rocket />} contentClassName="space-y-4">
              <FormField label="Not" hint="Ne değişti? Yayın listesinde görünür.">
                <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="ör. Deniz Canlıları kategorisi eklendi" />
              </FormField>
              <label className="flex items-start gap-2.5 text-sm">
                <Checkbox className="mt-0.5" checked={alsoProd} onCheckedChange={(v) => setAlsoProd(v === true)} />
                <span className="font-medium">Üretime de gönder <span className="block text-xs font-normal text-muted-foreground">Önerilmez: önce testte bir telefonda bakın, sonra aşağıdan üretime alın.</span></span>
              </label>
              <Button className="w-full" size="lg" disabled={busy || draft.blocked || nothingNew || !!holding || !quiet} onClick={go}>
                {busy ? <Spinner data-icon="inline-start" /> : <Send data-icon="inline-start" />}
                {holding ? "Kaydedilmemiş değişiklik var" : !quiet ? "Kaydediliyor…" : draft.blocked ? "Önce hataları düzeltin"
                  : nothingNew ? "Testtekinden farkı yok" : alsoProd ? "Teste ve üretime yayınla" : "Teste yayınla"}
              </Button>
              {done !== null && <Notice tone="ok" icon={<CheckCircle2 />}>#{done} yayınlandı. Test telefonu menüyü açınca indirir; bütün dosyaları inince geçer.</Notice>}
            </Panel>
            <Panel title="Telefon ne yapar">
              <ul className="list-disc space-y-1 pl-4 text-xs text-muted-foreground">
                <li>Açılışta elindeki yayını hemen kullanır; ağ beklemez, çevrimdışı da çalışır.</li>
                <li>Sessizce yenisini sorar; varsa eksik dosyaları indirir ve <b className="font-medium text-foreground">ancak hepsi inince</b> geçer. Yarım inmiş bir kategori hiç görünmez.</li>
                <li>Yayın, telefonun sürümünün oynatamadığı oyunu içeriyorsa o telefona o kısım gitmez; güncelleyince gelir.</li>
                <li>Dosyalar içerikleriyle adlanır: iki yayında aynı olan dosya bir kez iner.</li>
              </ul>
            </Panel>
          </aside>
        </div>
      )}

      <Section title="Yayınlar" count={rel?.releases.length} className="mt-10">
        {!rel || rel.releases.length === 0 ? <p className="text-sm text-muted-foreground">Henüz yayın yok.</p> : (
          <Card className="py-0">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-16 pl-4">No</TableHead><TableHead>Not</TableHead>
                  <TableHead className="hidden md:table-cell">Boyut</TableHead><TableHead>Kanal</TableHead>
                  <TableHead className="pr-4 text-right">Kanala al</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rel.releases.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="pl-4 font-heading text-base font-semibold tabular-nums">#{r.id}</TableCell>
                    <TableCell className="max-w-72 whitespace-normal">
                      <div className="truncate font-medium">{r.note || <em className="font-normal text-muted-foreground">not yok</em>}</div>
                      <div className="text-xs text-muted-foreground">{new Date(r.createdAt).toLocaleString("tr")}</div>
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground md:table-cell">{r.assets} dosya · {fmtSize(r.bytes) || "0"}</TableCell>
                    <TableCell><div className="flex gap-1">{r.channels.map((c) => <Pill key={c} tone={CHANNEL[c].tone}>{CHANNEL[c].name}</Pill>)}</div></TableCell>
                    <TableCell className="pr-4 text-right">
                      <div className="flex flex-wrap justify-end gap-1">
                        {CHANNELS.filter((c) => !r.channels.includes(c)).map((c) => {
                          const cur = head(c);
                          const back = cur !== null && r.id < cur;
                          return (
                            <Button key={c} variant="ghost" size="sm" onClick={() => point(c, r.id)}>
                              {back ? <Undo2 /> : <Send />}{back ? `${CHANNEL[c].name}: buna geri al` : CHANNEL[c].to}
                            </Button>
                          );
                        })}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        )}
      </Section>
    </>
  );
}

function Count({ n, label }: { n: number | string; label: string }) {
  return <div className="bg-card p-3 text-center"><div className="font-heading text-xl font-semibold tabular-nums">{n}</div><div className="text-xs text-muted-foreground">{label}</div></div>;
}

function DiffCard({ title, d, none }: { title: string; d: Diff; none: boolean }) {
  const rows: [string, string[], Tone][] = [["eklenecek", d.added, "ok"], ["değişecek", d.changed, "warn"], ["kalkacak", d.removed, "bad"]];
  const empty = !d.added.length && !d.changed.length && !d.removed.length;
  return (
    <Card size="sm">
      <CardContent className="space-y-2">
        <h3 className="flex items-center gap-2 font-medium">{title}{none && <Pill>kanal boş</Pill>}</h3>
        {empty ? <p className="text-sm text-muted-foreground">Fark yok.</p> : (
          <div className="space-y-2">
            {rows.filter(([, l]) => l.length).map(([label, list, tone]) => (
              <div key={label}>
                <div className={cn("text-xs font-semibold", TONE_TEXT[tone])}>{list.length} {label}</div>
                <div className="text-xs text-muted-foreground">{list.slice(0, 12).join(" · ")}{list.length > 12 ? ` · +${list.length - 12}` : ""}</div>
              </div>
            ))}
            {d.newBytes > 0 && <div className="flex items-center gap-1 text-xs text-muted-foreground"><AlertTriangle className="size-3" /> telefon {fmtSize(d.newBytes)} yeni dosya indirecek</div>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
