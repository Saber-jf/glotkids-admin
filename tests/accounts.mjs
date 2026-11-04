/**
 * ACCOUNTS in a real browser (2026-10-22): a server with accounts on, a FAKE
 * Supabase (`../loplop-server/tools/fake-supabase.ts`: real signed tokens,
 * codes "sent" to its own output) and the panel -- the e-mail code sign-in,
 * a non-admin turned away (by code, and by Google through the real PKCE round
 * trip), the user list with a parent's progress, ban / unban / delete, the
 * admins list, the audit, signing out.
 *
 *   npm run test:e2e        (runs after tests/e2e.mjs; Chrome must be installed)
 */
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import puppeteer from "puppeteer-core";

const here = path.dirname(new URL(import.meta.url).pathname);
const SERVER_DIR = path.resolve(here, "../../loplop-server");
const APP_DIR = path.resolve(here, "../../loplop");
const PANEL_DIR = path.resolve(here, "..");
const rnd = (a) => a + Math.floor(Math.random() * 50);
const API_PORT = rnd(8860), WEB_PORT = rnd(5360), AUTH_PORT = rnd(54400);
const API = `http://127.0.0.1:${API_PORT}`, WEB = `http://localhost:${WEB_PORT}`, AUTH = `http://127.0.0.1:${AUTH_PORT}`;
const CHROME = process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const BOSS = "boss@ornek.test";

let fail = 0;
const ok = (what, cond, note = "") => {
  if (!cond) { fail++; console.error(`  HATA  ${what}${note ? "  — " + note : ""}`); }
  else console.log(`  gecti  ${what}${note ? "  (" + note + ")" : ""}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (f, ms = 10000, step = 100) => {
  const end = Date.now() + ms;
  for (;;) { try { const v = await f(); if (v) return v; } catch { /* not yet */ } if (Date.now() > end) return null; await sleep(step); }
};

/* ── the fake Supabase: its codes come out on its output ── */
const codes = new Map();
const fake = spawn(process.execPath, ["--import", "tsx", "tools/fake-supabase.ts"], {
  cwd: SERVER_DIR, env: { ...process.env, FAKE_SUPABASE_PORT: String(AUTH_PORT) }, stdio: ["ignore", "pipe", "inherit"] });
fake.stdout.on("data", (d) => { for (const m of String(d).matchAll(/KOD\s+(\S+)\s+→\s+(\d{6})/g)) codes.set(m[1], m[2]); });
const code = (email) => until(async () => codes.get(email), 8000);

const data = mkdtempSync(path.join(tmpdir(), "loplop-panel-accounts-"));
const srv = spawn(process.execPath, ["--import", "tsx", "src/server.ts"], {
  cwd: SERVER_DIR, env: { ...process.env, DATA_DIR: data, PORT: String(API_PORT), LOG_LEVEL: "error", APP_DIR, ADMIN_TOKEN: "",
                          DATABASE_URL: "", NODE_ENV: "test", SUPABASE_URL: AUTH, SUPABASE_ANON_KEY: "fake-anon-key",
                          SUPABASE_SERVICE_ROLE_KEY: "fake-service-key", ADMIN_EMAILS: BOSS, AUTH_PROVIDERS: "email,google,apple" },
  stdio: ["ignore", "inherit", "inherit"] });
const web = spawn(path.join(PANEL_DIR, "node_modules/.bin/vite"), ["--port", String(WEB_PORT), "--strictPort"], {
  cwd: PANEL_DIR, env: { ...process.env, API_TARGET: API }, stdio: ["ignore", "ignore", "inherit"] });
const stop = () => { for (const c of [fake, srv, web]) try { c.kill(); } catch {} };
process.on("exit", stop);

/* a parent signs in "in the app" and backs up a progress document */
async function parent(email) {
  const h = { apikey: "fake-anon-key", "Content-Type": "application/json" };
  codes.delete(email);
  await fetch(`${AUTH}/auth/v1/otp`, { method: "POST", headers: h, body: JSON.stringify({ email, create_user: true }) });
  const s = await (await fetch(`${AUTH}/auth/v1/verify`, { method: "POST", headers: h,
    body: JSON.stringify({ type: "email", email, token: await code(email) }) })).json();
  const doc = { schema: 1, active: "p-1", profiles: [{ id: "p-1", label: "1", createdAt: 1, stops: ["kitchen-1", "kitchen-2"],
               words: { apple: { met: 2, firstAt: 1, lastAt: 2 }, egg: { met: 1, firstAt: 1, lastAt: 1 } }, open: "kitchen-3", at: "kitchen-2", series: {} }] };
  const r = await fetch(`${API}/api/me/progress`, { method: "PUT", headers: { Authorization: `Bearer ${s.access_token}`, "Content-Type": "application/json" },
                                                     body: JSON.stringify({ rev: null, data: doc, device: "iPad" }) });
  return r.status;
}

let browser;
try {
  ok("sahte Supabase açıldı", !!(await until(async () => (await fetch(`${AUTH}/auth/v1/.well-known/jwks.json`)).ok, 20000)));
  ok("sunucu açıldı (hesaplar açık)", !!(await until(async () => (await (await fetch(`${API}/api/app/auth`)).json()).enabled, 20000)));
  ok("panel açıldı", !!(await until(async () => (await fetch(WEB)).ok, 20000)));
  ok("bir ebeveyn uygulamadan yedekledi", (await parent("anne@ornek.test")) === 200);
  browser = await puppeteer.launch({ executablePath: CHROME, headless: "new" });
  const errors = [];
  const fresh = async () => {
    const ctx = await browser.createBrowserContext();
    const p = await ctx.newPage();
    await p.setViewport({ width: 1400, height: 1000 });
    p.on("pageerror", (e) => errors.push(e.message));
    p.on("dialog", (d) => d.accept());
    return p;
  };
  const text = (p) => p.evaluate(() => document.body.innerText);
  const typeInto = async (p, selector, value) => {
    await p.waitForSelector(selector, { timeout: 8000 });
    await p.$eval(selector, (el, v) => {
      const set = Object.getOwnPropertyDescriptor(el.constructor.prototype, "value").set;
      set.call(el, v); el.dispatchEvent(new Event("input", { bubbles: true }));
    }, value);
  };
  const click = async (p, sel) => { await p.waitForSelector(sel, { timeout: 8000 }); await p.$eval(sel, (el) => el.click()); };
  const signIn = async (p, email) => {
    await p.goto(WEB, { waitUntil: "networkidle0" });
    await typeInto(p, '[data-testid="login-email"]', email);
    await click(p, '[data-testid="login-send"]');
    const c = await code(email);
    if (!c) throw new Error(`kod gelmedi: ${await p.$eval('[data-testid="login-error"]', (e) => e.innerText).catch(() => "?")}`);
    await typeInto(p, '[data-testid="login-code"]', c ?? "000000");
    await click(p, '[data-testid="login-verify"]');
  };

  console.log("\n1 · giriş");
  const p = await fresh();
  await p.goto(WEB, { waitUntil: "networkidle0" });
  ok("giriş ekranı: e-posta, Google, Apple", !!(await p.$('[data-testid="login-email"]')) && !!(await p.$('[data-testid="login-google"]'))
     && !!(await p.$('[data-testid="login-apple"]')));
  await signIn(p, BOSS);
  ok("yönetici e-posta koduyla girer", !!(await until(async () => /Genel bakış/.test(await text(p)) && !(await p.$('[data-testid="login-email"]')))));
  ok("üst çubukta kim olduğu", !!(await until(async () => (await text(p)).includes(BOSS))));

  console.log("\n2 · kullanıcılar");
  await p.goto(`${WEB}/kullanicilar`, { waitUntil: "networkidle0" });
  const row = await until(async () => { const t = await p.$eval('[data-testid="user-anne@ornek.test"]', (e) => e.innerText); return t; });
  ok("ebeveyn listede, yedeğiyle", !!row && /1 çocuk · 2 durak · 2 kelime/.test(row), row ?? "");
  ok("yönetici işaretli", !!(await until(async () => /yönetici/.test(await p.$eval(`[data-testid="user-${BOSS}"]`, (e) => e.innerText)))));
  await typeInto(p, '[data-testid="users-search"]', "anne");
  ok("arama", !!(await until(async () => !(await p.$(`[data-testid="user-${BOSS}"]`)) && !!(await p.$('[data-testid="user-anne@ornek.test"]')))));
  await click(p, '[data-testid="ban-anne@ornek.test"]');
  ok("engellenir", !!(await until(async () => /engelli/.test(await p.$eval('[data-testid="user-anne@ornek.test"]', (e) => e.innerText)))));
  await click(p, '[data-testid="unban-anne@ornek.test"]');
  ok("engel kalkar", !!(await until(async () => /etkin/.test(await p.$eval('[data-testid="user-anne@ornek.test"]', (e) => e.innerText)))));
  await click(p, '[data-testid="delete-anne@ornek.test"]');
  await typeInto(p, '[data-testid="confirm-email"]', "anne@ornek.test");
  await click(p, '[data-testid="confirm-go"]');
  ok("e-postası yazılarak silinir", !!(await until(async () => !(await p.$('[data-testid="user-anne@ornek.test"]')))));

  console.log("\n3 · yöneticiler ve işlem kaydı");
  await p.evaluate(() => [...document.querySelectorAll('[role="tab"]')].find((e) => e.textContent.includes("Yöneticiler"))
    ?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true })));
  await typeInto(p, '[data-testid="admin-email"]', "ayse@ornek.test");
  await click(p, '[data-testid="admin-add"]');
  ok("yönetici eklenir", !!(await until(async () => !!(await p.$('[data-testid="admin-ayse@ornek.test"]')))));
  await click(p, '[data-testid="admin-remove-ayse@ornek.test"]');
  ok("yönetici çıkarılır", !!(await until(async () => !(await p.$('[data-testid="admin-ayse@ornek.test"]')))));
  await p.evaluate(() => [...document.querySelectorAll('[role="tab"]')].find((e) => e.textContent.includes("İşlem kaydı"))
    ?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true })));
  const log = await until(async () => { const t = await text(p); return /hesabı sildi/.test(t) && /hesabı engelledi/.test(t) && /yönetici ekledi/.test(t) ? t : null; });
  ok("işlem kaydında silme, engelleme, ekleme", !!log);

  console.log("\n4 · yönetici olmayanlar");
  const q = await fresh();
  await q.goto(WEB, { waitUntil: "networkidle0" });
  await typeInto(q, '[data-testid="login-email"]', "yabanci@ornek.test");
  await click(q, '[data-testid="login-send"]');
  ok("kayıtlı olmayan e-postaya kod gitmez, söylenir", !!(await until(async () => /yöneticileri arasında değil/.test(await text(q)))));
  await click(q, '[data-testid="login-google"]');
  ok("Google ile giren ama yönetici olmayan: yetki yok ekranı", !!(await until(async () => !!(await q.$('[data-testid="login-forbidden"]')), 15000)));
  ok("adresinde kod kalmaz", !/code=/.test(q.url()));

  console.log("\n5 · çıkış");
  /* a menu opens on a real pointer press, not on a synthetic click */
  await p.waitForSelector('[data-testid="user-menu"]');
  await p.click('[data-testid="user-menu"]');
  await p.waitForSelector('[data-testid="sign-out"]', { timeout: 8000 });
  await p.click('[data-testid="sign-out"]');
  ok("çıkış giriş ekranına döner", !!(await until(async () => !!(await p.$('[data-testid="login-email"]')))));
  await p.reload({ waitUntil: "networkidle0" });
  ok("yeniden açılınca oturum yok", !!(await p.$('[data-testid="login-email"]')));

  ok("hiçbir sayfada yakalanmamış hata yok", errors.length === 0, errors.slice(0, 3).join(" | "));
} catch (e) {
  fail++; console.error("  HATA  beklenmeyen:", e);
} finally {
  await browser?.close();
  stop();
}
console.log(fail ? `\npanel hesaplar: ${fail} HATA` : "\npanel hesaplar: hepsi geçti");
process.exit(fail ? 1 : 0);
