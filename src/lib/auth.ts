/**
 * THE PANEL'S SIGN-IN (Supabase Auth, 2026-10-22).
 *
 * The server says how to sign in (`GET /api/app/auth`: the project's address
 * and its PUBLIC key -- the service key never leaves the server). With
 * accounts on, the panel signs in with Supabase -- a 6-digit code by e-mail,
 * or Google / Apple in this window -- and sends the session's access token to
 * the server, which lets it in only if the e-mail is on the admins list. The
 * code is only sent to an e-mail that already has an account
 * (`shouldCreateUser: false`): adding an admin makes theirs.
 *
 * Without accounts (development, or a server not yet given a project) the old
 * way stays: the server's ADMIN_TOKEN, typed once (`api.ts` → setToken).
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export interface AuthConfig { enabled: boolean; url: string | null; anonKey: string | null; providers: ("email" | "google" | "apple")[] }

let client: SupabaseClient | null = null;
let access = "";
let email = "";

/** the session's access token, kept current by the client's own refresh */
export const accessToken = () => access;
export const signedInEmail = () => email;
export const accountsEnabled = () => !!client;

export async function loadAuthConfig(): Promise<AuthConfig> {
  const r = await fetch("/api/app/auth");
  if (!r.ok) throw new Error(`${r.status}`);
  return r.json() as Promise<AuthConfig>;
}

/** start the client (once) and read the session this browser kept; null when signed out */
export async function startAuth(cfg: AuthConfig): Promise<string | null> {
  if (!cfg.enabled || !cfg.url || !cfg.anonKey) return null;
  if (!client) {
    client = createClient(cfg.url, cfg.anonKey, {
      auth: { flowType: "pkce", persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: "loplop-panel-auth" },
    });
    client.auth.onAuthStateChange((_e, s) => { access = s?.access_token ?? ""; email = s?.user.email ?? ""; });
  }
  const { data } = await client.auth.getSession();
  access = data.session?.access_token ?? "";
  email = data.session?.user.email ?? "";
  return access || null;
}

const need = () => { if (!client) throw new Error("Hesaplar kurulmadı."); return client; };

/** Supabase's messages, as a person reads them */
function say(e: { message?: string; code?: string } | null): string {
  const m = `${e?.code ?? ""} ${e?.message ?? ""}`;
  if (/otp_disabled|Signups not allowed/i.test(m)) return "Bu e-posta panelin yöneticileri arasında değil. Bir yöneticiden sizi eklemesini isteyin.";
  if (/otp_expired|invalid|expired/i.test(m)) return "Kod yanlış ya da süresi dolmuş. Yeni bir kod isteyin.";
  if (/rate|too many|security purposes/i.test(m)) return "Çok sık denendi; biraz bekleyip yeniden deneyin.";
  if (/banned/i.test(m)) return "Bu hesap engellenmiş.";
  if (/fetch|network/i.test(m)) return "Giriş sunucusuna ulaşılamıyor.";
  return e?.message || "Giriş başarısız.";
}

export async function sendCode(to: string): Promise<void> {
  const { error } = await need().auth.signInWithOtp({ email: to.trim().toLowerCase(), options: { shouldCreateUser: false } });
  if (error) throw new Error(say(error));
}

export async function verifyCode(to: string, code: string): Promise<void> {
  const { data, error } = await need().auth.verifyOtp({ email: to.trim().toLowerCase(), token: code.trim(), type: "email" });
  if (error) throw new Error(say(error));
  access = data.session?.access_token ?? "";
  email = data.session?.user.email ?? "";
}

/** Google or Apple: this window goes there and comes back signed in */
export async function signInWith(provider: "google" | "apple"): Promise<void> {
  const { error } = await need().auth.signInWithOAuth({ provider, options: { redirectTo: `${window.location.origin}/` } });
  if (error) throw new Error(say(error));
}

export async function signOut(): Promise<void> {
  if (client) await client.auth.signOut().catch(() => {});
  access = ""; email = "";
}
