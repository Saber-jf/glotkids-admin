import React from "react";
import { CheckCircle2, Clapperboard, Gamepad2, Lock, LockOpen, Smartphone, TriangleAlert, XCircle } from "lucide-react";
import { IconTile, Notice, PageHeader, Panel, Pill, Section } from "../components/common";
import { inventoryConflicts, listBuilds, type Build, type TemplateInfo } from "../api";
import { useVocab } from "../vocab";
import { ROLE_LABEL } from "../types";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

/**
 * What the app can play, as it said itself (`npm run inventory` in the app →
 * `app-inventory.json`). Engines and live scenes are CODE: the panel can only
 * use what a build has. This page is where to look before planning content:
 * an OPEN engine plays any word set (no app update); a CLOSED one draws its
 * own words and needs an app update to play others.
 */
export function AppInventory() {
  const { inventory: inv } = useVocab();
  const [builds, setBuilds] = React.useState<Build[]>([]);
  const [conflicts, setConflicts] = React.useState<{ kind: string; id: string }[]>([]);
  React.useEffect(() => {
    listBuilds().then(setBuilds).catch(() => setBuilds([]));
    inventoryConflicts().then((c) => setConflicts(c.items)).catch(() => setConflicts([]));
  }, []);
  if (!inv) return (
    <>
      <PageHeader title="Uygulama" />
      <Notice>Uygulama henüz envanterini göndermedi. Uygulamanın klasöründe <code>npm run inventory</code> çalıştırın;
        sunucu açılışta <code>app-inventory.json</code> dosyasını okur.</Notice>
    </>
  );
  const games = inv.templates.filter((t) => t.kind === "game");
  const open = games.filter((t) => t.open), closed = games.filter((t) => !t.open);
  return (
    <>
      <PageHeader title="Uygulama"
        sub="Uygulamanın bu sürümünün oynatabildikleri. Oyun motorları ve canlı sahneler koddur: panel yalnızca sürümde olanı kullanabilir." />
      <div className="mb-6 grid gap-4 md:grid-cols-3">
        <Stat icon={<Smartphone />} value={`Sürüm ${inv.app.build}`} label={`uygulama ${inv.app.version} · içerik şeması ${inv.schema}`} />
        <Stat icon={<Gamepad2 />} tone="ok" value={`${open.length} açık · ${closed.length} kapalı`} label="oyun motoru" />
        <Stat icon={<Clapperboard />} tone="warn" value={String(inv.scenes.length)} label={`canlı sahne · ${inv.clips.length} paketlenmiş kayıt`} />
      </div>

      {conflicts.length > 0 && (
        <Notice tone="warn" icon={<TriangleAlert />} className="mb-6">
          <div className="font-medium">Kimlik çakışması: {conflicts.length}</div>
          <p className="mt-1 text-muted-foreground">Uygulamanın envanteri, panelde daha önce yaratılmış şu kimlikleri de getirdi. Paneldeki içerik korundu
            (uygulamanınki sayılmadı); hangisinin kalacağına birlikte karar verin — birini yeniden adlandırmak gerekir.</p>
          <div className="mt-2 flex flex-wrap gap-1.5">{conflicts.map((c) => <Pill key={`${c.kind}:${c.id}`} tone="warn">{c.kind}: {c.id}</Pill>)}</div>
        </Notice>
      )}

      <Panel title="Ne güncelleme ister, ne istemez" className="mb-8" contentClassName="grid gap-6 md:grid-cols-2">
        <div>
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-success"><CheckCircle2 className="size-4" /> Güncelleme gerekmez — panelden yayınla gider</div>
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            <li>Yeni kelime, kelime seti; resmi, açıklaması, rengi</li>
            <li>Her kayıt: kelimelerin ve sabit cümlelerin (uygulamanın kendi kelimeleri dahil)</li>
            <li>Açık motorla yeni oyun (yeni ad, resim, set)</li>
            <li>Yeni kategori: açık motorlar + video + var olan canlı sahneler</li>
            <li>Yanlışı geri almak: kanalı eski yayına çevirmek</li>
          </ul>
        </div>
        <div>
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-destructive"><XCircle className="size-4" /> Uygulama güncellemesi gerekir</div>
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            <li>Yeni bir oyun motoru (yeni jest, yeni mekanik)</li>
            <li>Kapalı bir motoru başka kelimelerle oynatmak</li>
            <li>Yeni bir canlı sahne (Lottie + senaryo)</li>
            <li>Uygulamanın kendi kategorilerinin akışı, yol haritası durakları</li>
            <li>Yerel modül (ör. mikrofon) → mağaza; yalnız JS → EAS Update</li>
          </ul>
        </div>
      </Panel>

      <div className="space-y-10">
        <Section title="Açık motorlar" icon={<LockOpen />} count={open.length}
                 sub="Kelimeyi resmiyle bir kutuda gösterip söylüyorlar: hiç görmedikleri kelimeyi de oynatırlar. Yeni oyun ve yeni kategori bunlardan kurulur.">
          <div className="grid gap-3 md:grid-cols-2">{open.map((t) => <EngineCard key={t.id} t={t} />)}</div>
        </Section>

        <Section title="Kapalı motorlar" icon={<Lock />} count={closed.length}
                 sub="Her kelimeyi kendine göre çiziyorlar (hayvanlar elle çizili, piknikte her yemek ayrı hazırlanıyor). Uygulamanın kendi serilerinde oynarlar.">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{closed.map((t) => <EngineCard key={t.id} t={t} />)}</div>
        </Section>

        <Section title="Canlı sahneler" icon={<Clapperboard />} count={inv.scenes.length}>
          <div className="flex flex-wrap gap-2">
            {inv.scenes.map((s) => <Pill key={s.id}>{s.name}{s.for ? ` · ${s.for}` : ""}{s.since > 1 ? ` · sürüm ${s.since}+` : ""}</Pill>)}
          </div>
        </Section>

        {builds.length > 0 && (
          <Section title="Bilinen sürümler" sub="Bir telefon kendi sürümüyle sorar ve yalnızca o sürümün oynatabildiğini alır; eski sürümdeki telefona yeni motorlu oyun gitmez.">
            <Card className="py-0">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="pl-4">Sürüm</TableHead><TableHead>Uygulama</TableHead><TableHead>Şema</TableHead>
                    <TableHead className="pr-4 text-right">Alındı</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {builds.map((b) => (
                    <TableRow key={b.build}>
                      <TableCell className="pl-4 font-medium">Sürüm {b.build}</TableCell>
                      <TableCell>{b.version}</TableCell>
                      <TableCell className="text-muted-foreground">{b.schema}</TableCell>
                      <TableCell className="pr-4 text-right text-muted-foreground">{new Date(b.received_at).toLocaleString("tr")}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          </Section>
        )}
      </div>
    </>
  );
}

function Stat({ icon, value, label, tone = "accent" }: { icon: React.ReactNode; value: string; label: string; tone?: "accent" | "ok" | "warn" }) {
  return (
    <Card className="flex-row items-center gap-4 px-5">
      <IconTile tone={tone} size="lg">{icon}</IconTile>
      <div className="min-w-0">
        <div className="font-heading text-xl font-semibold tracking-tight">{value}</div>
        <div className="text-xs text-muted-foreground">{label}</div>
      </div>
    </Card>
  );
}

function EngineCard({ t }: { t: TemplateInfo }) {
  return (
    <Card size="sm">
      <CardContent className="flex items-start gap-3">
        <IconTile tone={t.open ? "ok" : "plain"} size="sm"><Gamepad2 /></IconTile>
        <div className="min-w-0 flex-1 space-y-0.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{t.name}</span>
            <code className="text-xs text-muted-foreground">{t.id}</code>
            {t.since > 1 && <Pill tone="accent">sürüm {t.since}+</Pill>}
          </div>
          <div className="text-xs text-muted-foreground">{ROLE_LABEL[t.role]} · {t.gesture}</div>
          <div className="text-xs text-muted-foreground">{t.family}{t.accepts ? ` · içerik türü ${t.accepts}` : ""}{t.slots.length ? ` · yuvalar: ${t.slots.join(", ")}` : ""}</div>
        </div>
      </CardContent>
    </Card>
  );
}
