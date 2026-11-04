/**
 * API keys, as the panel sees them now that the server keeps them: whether
 * each is set, where it came from and its last four characters -- never the
 * key. Entering one sends it to the server once; it does not come back.
 */
import React from "react";
import { CheckCircle2, Eye, EyeOff, KeyRound, XCircle } from "lucide-react";
import { getKeys, setKeyOnServer, testKey, type KeyName, type KeyStatus } from "../api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import { Spinner } from "@/components/ui/spinner";
import { Notice, Pill } from "./common";

/** the keys' status, shared by every screen that needs it */
const listeners = new Set<(k: KeyStatus | null) => void>();
let cache: KeyStatus | null = null;
async function refresh() {
  try { cache = await getKeys(); } catch { cache = null; }
  listeners.forEach((f) => f(cache));
}
export function useKeys(): KeyStatus | null {
  const [k, setK] = React.useState<KeyStatus | null>(cache);
  React.useEffect(() => {
    listeners.add(setK);
    if (!cache) refresh();
    return () => { listeners.delete(setK); };
  }, []);
  return k;
}

const NAME: Record<KeyName, string> = { elevenlabs: "ElevenLabs", openai: "OpenAI", gemini: "Gemini", anthropic: "Claude (Anthropic)", suno: "Suno" };

export function KeyCard({ name, hint, className = "" }: { name: KeyName; hint: string; className?: string }) {
  const keys = useKeys();
  const st = keys?.[name];
  const [value, setValue] = React.useState("");
  const [show, setShow] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [check, setCheck] = React.useState<{ ok: boolean; text: string } | null>(null);
  const test = async () => {
    setCheck(null);
    try { setCheck(await testKey(name)); } catch (e) { setCheck({ ok: false, text: (e as Error).message }); }
  };
  const save = async (v: string) => {
    setBusy(true);
    try { await setKeyOnServer(name, v); await refresh(); setValue(""); if (v) await test(); else setCheck(null); }
    catch (e) { setCheck({ ok: false, text: (e as Error).message }); }
    setBusy(false);
  };
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          <KeyRound className="size-4 text-muted-foreground" /> {NAME[name]} API anahtarı
          {st?.set
            ? <Pill tone="ok"><CheckCircle2 /> ayarlı {st.hint} · {st.source === "env" ? ".env" : "panelden"}</Pill>
            : <Pill tone="warn">ayarlı değil</Pill>}
        </CardTitle>
        <CardDescription>
          {hint} Anahtar sunucuda saklanır (<code>loplop-server/data/secrets.json</code>) ve tarayıcıya bir daha gelmez; istekleri sunucu yapar.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <InputGroup className="min-w-[220px] flex-1">
            <InputGroupInput type={show ? "text" : "password"} value={value} onChange={(e) => setValue(e.target.value)} autoComplete="off"
                             placeholder={st?.set ? "Yeni anahtarla değiştir" : "Anahtarı yapıştırın"} />
            <InputGroupAddon align="inline-end">
              <InputGroupButton size="icon-xs" onClick={() => setShow(!show)} title={show ? "Gizle" : "Göster"}>{show ? <EyeOff /> : <Eye />}</InputGroupButton>
            </InputGroupAddon>
          </InputGroup>
          <Button disabled={!value.trim() || busy} onClick={() => save(value.trim())}>{busy && <Spinner data-icon="inline-start" />}Kaydet ve dene</Button>
          {st?.set && <Button variant="outline" onClick={test}>Dene</Button>}
          {st?.source === "panel" && <Button variant="destructive" onClick={() => save("")}>Kaldır</Button>}
        </div>
        {check && <Notice tone={check.ok ? "ok" : "bad"} icon={check.ok ? <CheckCircle2 /> : <XCircle />}>{check.text}</Notice>}
      </CardContent>
    </Card>
  );
}
