/**
 * THE PANEL'S DOOR (2026-10-22).
 *
 *   accounts on (the server has a Supabase project)
 *       sign in: e-mail and password (2026-11-14), or Google / Apple; the server lets
 *       the account in only if its e-mail is on the admins list -- any other
 *       signed-in account sees "not an admin" and may sign in with another
 *   accounts off (development, a server without a project)
 *       the server's ADMIN_TOKEN, typed once (as before); without a key on
 *       the server (127.0.0.1) nothing is asked at all
 *
 * Everything inside starts only once the door is open (the media token every
 * file address uses comes first, S10).
 */
import React from "react";
import { KeyRound, LogIn, ShieldX } from "lucide-react";
import { AUTH_EVENT, ApiError, FORBIDDEN_EVENT, getKeys, refreshMedia, setToken } from "../api";
import { loadAuthConfig, signInPassword, signInWith, signOut, signedInEmail, startAuth, type AuthConfig } from "../lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { FormField, IconTile } from "./common";

type State = "checking" | "ok" | "key" | "account" | "forbidden";

export function AuthGate({ children }: { children: React.ReactNode }) {
  const [state, setState] = React.useState<State>("checking");
  const [cfg, setCfg] = React.useState<AuthConfig | null>(null);
  React.useEffect(() => {
    let accounts = false;
    const need = () => setState(accounts ? "account" : "key");
    const forbidden = () => setState("forbidden");
    window.addEventListener(AUTH_EVENT, need);
    window.addEventListener(FORBIDDEN_EVENT, forbidden);
    (async () => {
      let c: AuthConfig | null = null;
      try { c = await loadAuthConfig(); } catch { /* the server is away: the panel says so itself */ }
      setCfg(c);
      if (c?.enabled) {
        accounts = true;
        /* back from Google/Apple: the client takes the code from the address */
        const signed = await startAuth(c).catch(() => null);
        const u = new URL(window.location.href);
        if (u.searchParams.has("code") || u.searchParams.has("error_description")) {
          for (const k of ["code", "error", "error_code", "error_description"]) u.searchParams.delete(k);
          window.history.replaceState(null, "", u.pathname + u.search + u.hash);
        }
        if (!signed) { setState("account"); return; }
      }
      /* in: first the short-lived media token every file address uses (S10) */
      try { await getKeys(); await refreshMedia(); setState("ok"); }
      catch (e) {
        if (e instanceof ApiError && e.status === 403) setState("forbidden");
        else if (e instanceof ApiError && e.status === 401) setState(accounts ? "account" : "key");
        else setState("ok");
      }
    })();
    /* renewed well before its hour is up */
    const t = setInterval(() => { void refreshMedia(); }, 40 * 60 * 1000);
    return () => { window.removeEventListener(AUTH_EVENT, need); window.removeEventListener(FORBIDDEN_EVENT, forbidden); clearInterval(t); };
  }, []);
  if (state === "checking") return null;
  if (state === "ok") return <>{children}</>;
  if (state === "forbidden") return <Forbidden />;
  if (state === "account") return <AccountLogin providers={cfg?.providers ?? ["email"]} />;
  return <KeyLogin />;
}

function Frame({ icon, sub, children }: { icon: React.ReactNode; sub: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <div className="mb-2"><IconTile>{icon}</IconTile></div>
          <CardTitle className="text-lg">GlotKids</CardTitle>
          <CardDescription>{sub}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">{children}</CardContent>
      </Card>
    </div>
  );
}

function AccountLogin({ providers }: { providers: AuthConfig["providers"] }) {
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const run = async (f: () => Promise<void>) => {
    setBusy(true); setError("");
    try { await f(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  const emailOk = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim());
  const ready = emailOk && password.length > 0 && !busy;
  const go = () => run(async () => { await signInPassword(email, password); window.location.reload(); });
  return (
    <Frame icon={<LogIn />} sub="İçerik yönetimi · yönetici girişi">
      {providers.includes("email") && <>
        <FormField label="E-posta">
          <Input autoFocus type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)}
                 onKeyDown={(e) => e.key === "Enter" && ready && go()} data-testid="login-email" />
        </FormField>
        <FormField label="Şifre" hint="Şifreniz yoksa ya da unuttuysanız bir yönetici Kullanıcılar → Yöneticiler'den belirler.">
          <Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)}
                 onKeyDown={(e) => e.key === "Enter" && ready && go()} data-testid="login-password" />
        </FormField>
        <Button className="w-full" disabled={!ready} onClick={go} data-testid="login-go">
          {busy && <Spinner data-icon="inline-start" />}Giriş</Button>
      </>}
      {(providers.includes("google") || providers.includes("apple")) && <>
        {providers.includes("email") && <div className="flex items-center gap-2 text-xs text-muted-foreground"><div className="h-px flex-1 bg-border" />ya da<div className="h-px flex-1 bg-border" /></div>}
        {providers.includes("google") && <Button variant="outline" className="w-full" disabled={busy} onClick={() => run(() => signInWith("google"))}
                                                  data-testid="login-google">Google ile giriş</Button>}
        {providers.includes("apple") && <Button variant="outline" className="w-full" disabled={busy} onClick={() => run(() => signInWith("apple"))}
                                                 data-testid="login-apple">Apple ile giriş</Button>}
      </>}
      {error && <p className="text-sm font-medium text-destructive" data-testid="login-error">{error}</p>}
      <p className="text-xs text-muted-foreground">Panel yalnız yöneticiler içindir; yeni yönetici panelin "Kullanıcılar" sayfasından eklenir.</p>
    </Frame>
  );
}

function Forbidden() {
  const who = signedInEmail();
  return (
    <Frame icon={<ShieldX />} sub="Bu hesabın panel yetkisi yok">
      <p className="text-sm" data-testid="login-forbidden"><b className="font-medium">{who || "Bu hesap"}</b> panelin yöneticileri arasında değil.
        Bir yöneticiden sizi "Kullanıcılar → Yöneticiler" sayfasından eklemesini isteyin.</p>
      <Button className="w-full" onClick={async () => { await signOut(); window.location.reload(); }}>Başka bir hesapla gir</Button>
    </Frame>
  );
}

function KeyLogin() {
  const [key, setKey] = React.useState("");
  const [error, setError] = React.useState("");
  const go = async () => {
    setToken(key.trim());
    try { await getKeys(); window.location.reload(); }
    catch (e) { setError(e instanceof ApiError && e.status === 401 ? "Anahtar yanlış." : (e as Error).message); }
  };
  return (
    <Frame icon={<KeyRound />} sub="İçerik yönetimi · giriş">
      {/* the label is shown in capitals: the e2e test finds the login screen by "PANEL ANAHTARI" */}
      <FormField label={<span className="text-xs uppercase tracking-wide text-muted-foreground">Panel anahtarı</span>}
                 hint="Sunucunun ADMIN_TOKEN değeri. Bu tarayıcıda saklanır.">
        <Input autoFocus type="password" value={key} onChange={(e) => setKey(e.target.value)} onKeyDown={(e) => e.key === "Enter" && go()} />
      </FormField>
      {error && <p className="text-sm font-medium text-destructive">{error}</p>}
      <Button className="w-full" disabled={!key.trim()} onClick={go}>Giriş</Button>
    </Frame>
  );
}
