import React from "react";
import { AlertTriangle, CheckCircle2, CircleDashed, HelpCircle, Loader2, RefreshCw, XCircle } from "lucide-react";
import { PlayButton, Thumb } from "../components/Media";
import { EmptyState, IconTile, Loading, Notice, PageHeader, Pill, type Tone } from "../components/common";
import { listJobs, type Job } from "../api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const STATUS: Record<Job["status"], { label: string; tone: Tone; icon: typeof CheckCircle2; text: string }> = {
  running: { label: "çalışıyor", tone: "accent", icon: Loader2, text: "Sağlayıcıya gitti, cevap bekleniyor." },
  done: { label: "tamamlandı", tone: "ok", icon: CheckCircle2, text: "Bütün sonuçlar kaydedildi." },
  partial: { label: "kısmen", tone: "warn", icon: AlertTriangle, text: "Bazı sonuçlar kaydedildi, sonra bir hata oldu. Kaydedilenler aşağıda." },
  failed: { label: "başarısız", tone: "bad", icon: XCircle, text: "Sağlayıcı isteği reddetti; bir şey üretilmedi." },
  uncertain: { label: "sonucu belirsiz", tone: "warn", icon: HelpCircle,
    text: "İstek sağlayıcıya gitmiş olabilir, ama cevap gelmedi (süre aşımı, bağlantı ya da sunucunun durması). Sağlayıcı üretip ücretlendirmiş olabilir; bunu buradan bilemeyiz. Otomatik olarak yeniden gönderilmez. Önce sağlayıcının kullanım sayfasına bakın, sonra gerekiyorsa stüdyodan YENİ bir üretim başlatın." },
};

/**
 * PAID WORK, AS IT HAPPENED (decision 3, 2026-10-16): every generation the
 * studios started, its state, what it made, and what went wrong. A job asked
 * for again with the same id shows what it already made; an uncertain one is
 * never re-sent from here -- a person decides to start a new one.
 */
export function Jobs() {
  const [jobs, setJobs] = React.useState<Job[] | null>(null);
  const [error, setError] = React.useState("");
  const load = React.useCallback(() => {
    listJobs().then((j) => { setJobs(j); setError(""); }).catch((e: Error) => setError(e.message));
  }, []);
  React.useEffect(() => { load(); }, [load]);
  /* while something is out, look again now and then */
  React.useEffect(() => {
    if (!jobs?.some((j) => j.status === "running")) return;
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [jobs, load]);
  const count = (s: Job["status"]) => jobs?.filter((j) => j.status === s).length ?? 0;

  return (
    <>
      <PageHeader title="Üretim işleri"
        sub="Ses ve görsel stüdyosunun sağlayıcıya gönderdiği her ücretli iş: durumu, ürettikleri ve hataları. Aynı iş ikinci kez gönderildiğinde sunucu sağlayıcıyı yeniden çağırmaz, burada kayıtlı sonucu verir."
        actions={<Button variant="outline" onClick={load}><RefreshCw data-icon="inline-start" />Yenile</Button>} />
      {error && <Notice tone="bad" className="mb-4">{error}</Notice>}
      {jobs && (
        <div className="mb-5 flex flex-wrap gap-2">
          {(Object.keys(STATUS) as Job["status"][]).map((s) => <Pill key={s} tone={STATUS[s].tone}>{STATUS[s].label}: {count(s)}</Pill>)}
        </div>
      )}
      {!jobs ? <Loading />
        : jobs.length === 0 ? <EmptyState icon={<CircleDashed />} title="Henüz ücretli iş yok" sub="Ses ya da görsel stüdyosunda üretim başlatıldığında burada görünür." />
        : (
          <div className="space-y-3">
            {jobs.map((j) => {
              const st = STATUS[j.status];
              const Icon = st.icon;
              return (
                <Card key={j.id} size="sm">
                  <CardContent className="flex gap-3">
                    <IconTile tone={st.tone} size="sm"><Icon className={cn(j.status === "running" && "animate-spin")} /></IconTile>
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{j.kind === "tts" ? "Ses" : j.kind === "images" ? "Görsel" : j.kind}</span>
                        <Pill tone={st.tone}>{st.label}</Pill>
                        <code className="text-xs text-muted-foreground">{j.id}</code>
                        <span className="ml-auto text-xs text-muted-foreground">{new Date(j.createdAt).toLocaleString("tr")}</span>
                      </div>
                      <p className="text-sm text-muted-foreground">{st.text}</p>
                      {j.errors.length > 0 && <ul className="space-y-0.5">{j.errors.map((e, i) => <li key={i} className="text-xs font-medium text-destructive">• {e}</li>)}</ul>}
                      {j.assets.length > 0 && (
                        <div className="flex flex-wrap gap-2 pt-1">
                          {j.assets.map((a) => (
                            <div key={a.id} className="flex items-center gap-2 rounded-md border bg-muted/30 py-1 pr-2.5 pl-1">
                              {a.kind === "audio" ? <PlayButton asset={a} /> : <Thumb asset={a} size={40} />}
                              <span className="text-xs font-medium">{a.name}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
    </>
  );
}
