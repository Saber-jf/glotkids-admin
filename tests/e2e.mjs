/**
 * The panel in a real browser (headless Chrome), against a throwaway server
 * of its own: a fresh data folder, its own port, ADMIN_TOKEN on. Pages really
 * mount and unmount, requests really go out -- some are held back, failed or
 * answered out of order on purpose -- and two tabs really edit the same thing.
 * Providers are never called: their routes are answered by the test.
 *
 *   npm run test:e2e        (Chrome must be installed; nothing is paid)
 */
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import puppeteer from "puppeteer-core";

const here = path.dirname(new URL(import.meta.url).pathname);
const SERVER_DIR = path.resolve(here, "../../loplop-server");
const APP_DIR = path.resolve(here, "../../loplop");
const PANEL_DIR = path.resolve(here, "..");
const API_PORT = 8800 + Math.floor(Math.random() * 50);
const WEB_PORT = 5300 + Math.floor(Math.random() * 50);
const TOKEN = "E2E_TOKEN_" + Math.random().toString(36).slice(2);
const API = `http://127.0.0.1:${API_PORT}`;
const WEB = `http://localhost:${WEB_PORT}`;
const CHROME = process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

let fail = 0;
const ok = (what, cond, note = "") => {
  if (!cond) { fail++; console.error(`  HATA  ${what}${note ? "  — " + note : ""}`); }
  else console.log(`  gecti  ${what}${note ? "  (" + note + ")" : ""}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (f, ms = 8000, step = 100) => {
  const end = Date.now() + ms;
  for (;;) { try { const v = await f(); if (v) return v; } catch { /* not yet */ } if (Date.now() > end) return null; await sleep(step); }
};
const api = async (method, p, body) => {
  const r = await fetch(API + p, { method, headers: { Authorization: `Bearer ${TOKEN}`, ...(body ? { "Content-Type": "application/json" } : {}) },
                                   body: body ? JSON.stringify(body) : undefined });
  const t = await r.text();
  return { status: r.status, body: t ? JSON.parse(t) : null };
};
async function upload(buf, name, mime) {
  const f = new FormData();
  f.append("file", new Blob([buf], { type: mime }), name);
  const r = await fetch(`${API}/api/assets`, { method: "POST", body: f, headers: { Authorization: `Bearer ${TOKEN}` } });
  return r.json();
}

/* ── the servers ──────────────────────────────────────────────────────────── */
const data = mkdtempSync(path.join(tmpdir(), "loplop-panel-e2e-"));
const srv = spawn(process.execPath, ["--import", "tsx", "src/server.ts"], {
  /* the server's embedded database in the test's own folder: never a DATABASE_URL from the shell or .env */
  cwd: SERVER_DIR, env: { ...process.env, DATA_DIR: data, PORT: String(API_PORT), LOG_LEVEL: "error", APP_DIR, ADMIN_TOKEN: TOKEN,
                          DATABASE_URL: "", NODE_ENV: "test" },
  stdio: ["ignore", "inherit", "inherit"] });
const web = spawn(path.join(PANEL_DIR, "node_modules/.bin/vite"), ["--port", String(WEB_PORT), "--strictPort"], {
  cwd: PANEL_DIR, env: { ...process.env, API_TARGET: API }, stdio: ["ignore", "ignore", "inherit"] });
const stop = () => { try { srv.kill(); } catch {} try { web.kill(); } catch {} };
process.on("exit", stop);

let browser;
try {
  ok("sunucu açıldı", !!(await until(async () => (await fetch(`${API}/api/health`)).ok, 20000)));
  ok("panel açıldı", !!(await until(async () => (await fetch(WEB)).ok, 20000)));
  browser = await puppeteer.launch({ executablePath: CHROME, headless: "new" });
  const errors = [];
  async function tab(token = TOKEN) {
    const p = await browser.newPage();
    await p.setViewport({ width: 1400, height: 1000 });
    if (token) await p.evaluateOnNewDocument((t) => localStorage.setItem("loplop-admin-token", t), token);
    p.on("pageerror", (e) => errors.push(e.message));
    p.on("dialog", (d) => d.accept());
    return p;
  }
  const text = (p) => p.evaluate(() => document.body.innerText);
  const clickText = async (p, t, sel = "button, a") => {
    const done = await p.evaluate((t, sel) => {
      const el = [...document.querySelectorAll(sel)].find((e) => e.textContent.trim().includes(t) && !e.disabled);
      if (!el) return false; el.click(); return true;
    }, t, sel);
    if (!done) throw new Error(`yok: ${t}`);
  };
  /* set a React-controlled input's value as a user would */
  const typeInto = async (p, selector, value) => {
    await p.$eval(selector, (el, v) => {
      const set = Object.getOwnPropertyDescriptor(el.constructor.prototype, "value").set;
      set.call(el, v); el.dispatchEvent(new Event("input", { bubbles: true }));
    }, value);
  };

  /* content to work on */
  const set = (await api("POST", "/api/sets", { name: "E2E Set", note: "notum", words: ["apple", "banana", "bread"] })).body;
  const cat = (await api("POST", "/api/categories", { title: "E2E Kategori", set: set.id })).body;

  /* ── S10 · login and media through the media token ───────────────────── */
  console.log("\nS10 · giriş ve medya");
  {
    const p = await tab(null);
    await p.goto(`${WEB}/kelime-setleri/kitchen`, { waitUntil: "networkidle0" });
    ok("anahtar yokken giriş ekranı", /PANEL ANAHTARI|Panel anahtarı/i.test(await text(p)));
    await p.close();
    const q = await tab();
    const urls = [];
    q.on("request", (r) => urls.push(r.url()));
    await q.goto(`${WEB}/kelime-setleri/kitchen`, { waitUntil: "networkidle0" });
    const imgs = await q.evaluate(() => [...document.images].map((i) => [i.complete && i.naturalWidth > 0, i.src]));
    ok("resimler medya belirteciyle yüklenir", imgs.length > 0 && imgs.every(([loaded, src]) => loaded && /[?&]m=/.test(src)), `${imgs.length} resim`);
    ok("hiçbir adreste admin anahtarı yok", !urls.some((u) => u.includes(TOKEN)));
    await q.close();
  }

  /* ── S09 · a provider's 401 is not a logout ──────────────────────────── */
  console.log("\nS09 · sağlayıcı hatası oturumu düşürmez");
  {
    const p = await tab();
    await p.setRequestInterception(true);
    let adminFail = false;
    p.on("request", (r) => {
      if (r.url().includes("/api/ai/eleven/voices"))
        return r.respond({ status: 502, contentType: "application/json", body: JSON.stringify({ error: "ElevenLabs anahtarı reddetti", code: "PROVIDER_AUTH_FAILED" }) });
      if (r.url().includes("/api/settings/keys") && r.method() === "GET")
        return r.respond({ status: 200, contentType: "application/json", body: JSON.stringify({ elevenlabs: { set: true, source: "panel", hint: "…abcd" }, openai: { set: false, source: null, hint: null }, gemini: { set: false, source: null, hint: null } }) });
      if (adminFail && r.url().includes("/api/words"))
        return r.respond({ status: 401, contentType: "application/json", body: JSON.stringify({ error: "Giriş gerekli", code: "ADMIN_UNAUTHORIZED" }) });
      r.continue();
    });
    await p.goto(`${WEB}/ses-studyosu?sekme=ayarlar`, { waitUntil: "networkidle0" });
    await sleep(500);
    ok("yanlış sağlayıcı anahtarı: panel açık kalır", !/PANEL ANAHTARI/i.test(await text(p)) && /Ses stüdyosu/.test(await text(p)));
    adminFail = true;
    await p.goto(`${WEB}/kelimeler`, { waitUntil: "networkidle0" });
    ok("gerçek panel kimlik hatası girişe götürür", !!(await until(async () => /PANEL ANAHTARI/i.test(await text(p)), 4000)));
    await p.close();
  }

  /* ── S01 · renaming a set in the UI keeps its words ──────────────────── */
  console.log("\nS01 · set adı ve notu (arayüzden)");
  {
    const p = await tab();
    await p.goto(`${WEB}/kelime-setleri/${set.id}`, { waitUntil: "networkidle0" });
    await p.focus("input.text-2xl");
    await typeInto(p, "input.text-2xl", "E2E Set Yeni Ad");
    await p.$eval("input.text-2xl", (el) => el.blur());
    const named = await until(async () => (await api("GET", `/api/sets/${set.id}`)).body.name === "E2E Set Yeni Ad");
    if (!named) console.log("    (ad kaydedilmedi; sunucuda:", JSON.stringify((await api("GET", `/api/sets/${set.id}`)).body), "ekranda:", (await text(p)).slice(0, 300).replace(/\n/g, " | "), ")");
    await p.focus("textarea");
    await typeInto(p, "textarea", "yeni not");
    await p.$eval("textarea", (el) => el.blur());
    const s1 = await until(async () => { const b = (await api("GET", `/api/sets/${set.id}`)).body; return b.note === "yeni not" ? b : null; });
    ok("ad ve not değişti, kelimeler yerinde", s1?.name === "E2E Set Yeni Ad" && s1?.words.join() === "apple,banana,bread", JSON.stringify(s1?.words));
    await p.close();
  }

  /* ── A01 · leaving right after an edit loses nothing ─────────────────── */
  console.log("\nA01 · hızlı gezinmede düzenleme kaybolmaz");
  {
    const p = await tab();
    await p.goto(`${WEB}/kategoriler/${cat.id}`, { waitUntil: "networkidle0" });
    await typeInto(p, "main input", "Hızlı Başlık");
    await sleep(100);
    await clickText(p, "Kategoriler", "nav a");
    const saved = await until(async () => (await api("GET", `/api/categories/${cat.id}`)).body.title === "Hızlı Başlık");
    ok("başlık değişti, 100 ms sonra listeye gidildi: kaydedildi", !!saved);
    await p.goto(`${WEB}/kategoriler/${cat.id}`, { waitUntil: "networkidle0" });
    ok("geri dönünce değişiklik orada", (await p.$eval("main input", (el) => el.value)) === "Hızlı Başlık");

    /* move a step (the wizard's flow step) and go straight to Publish */
    await p.goto(`${WEB}/kategoriler/${cat.id}?adim=akis`, { waitUntil: "networkidle0" });
    const before = (await api("GET", `/api/categories/${cat.id}`)).body.steps.map((s) => s.id);
    const order = [];
    p.on("request", (r) => { if (/\/api\/(categories|releases\/draft)/.test(r.url()) && r.method() !== "OPTIONS") order.push(`${r.method()} ${r.url().replace(/.*\/api/, "")}`); });
    await p.evaluate(() => { const b = [...document.querySelectorAll("li[id^=adim-] button")].find((x) => x.querySelector("svg") && !x.disabled); b?.click(); });
    await clickText(p, "Yayınla", "nav a");
    await until(async () => /Şimdi yayınlansa giden/.test(await text(p)), 8000);
    const after = (await api("GET", `/api/categories/${cat.id}`)).body.steps.map((s) => s.id);
    ok("adım taşınıp hemen Yayınla'ya gidildi: sıra kaydedildi", after.join() !== before.join(), `${before.join()} → ${after.join()}`);
    const iPatch = order.findIndex((x) => x.startsWith("PATCH")), iDraft = order.findIndex((x) => x.includes("releases/draft"));
    ok("yayın taslağı kaydedilmiş sırayı gördü (önce kayıt, sonra taslak)", iPatch >= 0 && iDraft > iPatch, order.join(" · "));
    await p.close();
  }
  {
    /* offline: the save fails, the editor leaves, the server returns */
    const p = await tab();
    await p.goto(`${WEB}/kategoriler/${cat.id}`, { waitUntil: "networkidle0" });
    await p.setRequestInterception(true);
    let offline = true;
    p.on("request", (r) => (offline && r.method() === "PATCH" && r.url().includes("/api/categories/") ? r.abort("internetdisconnected") : r.continue()));
    await typeInto(p, "main input", "Çevrimdışı Başlık");
    const shown = await until(async () => /Kaydedilemedi/.test(await text(p)), 5000);
    ok("başarısız kayıt 'Kaydedildi' görünmez, 'Kaydedilemedi' görünür", !!shown && !/Kaydedildi\b/.test(await text(p).then((t) => t.split("Kaydedilemedi")[0].slice(-40))));
    await clickText(p, "Oyunlar", "nav a");
    offline = false;
    const back = await until(async () => (await api("GET", `/api/categories/${cat.id}`)).body.title === "Çevrimdışı Başlık", 15000, 300);
    ok("sayfadan çıkıldı, bağlantı döndü: taslak kendiliğinden kaydedildi", !!back);
    await p.close();
  }

  /* ── A02 · out of order answers, two tabs ────────────────────────────── */
  console.log("\nA02 · ters sıralı yanıtlar ve iki sekme");
  {
    const p = await tab();
    await p.goto(`${WEB}/kategoriler/${cat.id}`, { waitUntil: "networkidle0" });
    await p.setRequestInterception(true);
    let first = true;
    p.on("request", async (r) => {
      if (r.method() === "PATCH" && r.url().includes("/api/categories/") && first) { first = false; await sleep(1800); }
      r.continue();
    });
    await typeInto(p, "main input", "Yavaş A");
    await sleep(900);                                     /* A is on its way, held */
    await typeInto(p, "main input", "Hızlı B");
    const end = await until(async () => (await api("GET", `/api/categories/${cat.id}`)).body.title === "Hızlı B", 8000);
    await sleep(600);
    ok("yavaş A, sonra B: en yeni (B) kalır", !!end && (await api("GET", `/api/categories/${cat.id}`)).body.title === "Hızlı B");
    await p.close();

    const a = await tab(), b = await tab();
    await a.goto(`${WEB}/kategoriler/${cat.id}`, { waitUntil: "networkidle0" });
    await b.goto(`${WEB}/kategoriler/${cat.id}`, { waitUntil: "networkidle0" });
    await a.bringToFront();
    await typeInto(a, "main input", "A sekmesi");
    await until(async () => (await api("GET", `/api/categories/${cat.id}`)).body.title === "A sekmesi");
    await b.bringToFront();                       /* a person switches to the other tab */
    await typeInto(b, "main input", "B sekmesi");
    const conflict = await until(async () => /Taslağınız silinmedi/.test(await text(b)), 6000);
    ok("ikinci sekme çakışmayı görür, sessizce ezmez", !!conflict && (await api("GET", `/api/categories/${cat.id}`)).body.title === "A sekmesi");
    ok("çakışmada taslak silinmez", (await b.$eval("main input", (el) => el.value)) === "B sekmesi");
    await clickText(b, "Benimkini üstüne yaz");
    ok("bilerek üstüne yazınca kaydedilir", !!(await until(async () => (await api("GET", `/api/categories/${cat.id}`)).body.title === "B sekmesi")));
    await a.close(); await b.close();
  }

  /* ── A03 · a slow studio save holds publishing ───────────────────────── */
  console.log("\nA03 · yavaş stüdyo kaydı yayını bekletir");
  {
    const p = await tab();
    await p.goto(`${WEB}/ses-studyosu?sekme=ayarlar`, { waitUntil: "networkidle0" });
    await p.setRequestInterception(true);
    const seen = [];
    p.on("request", async (r) => {
      if (r.url().endsWith("/api/db") && r.method() === "PUT") { seen.push("put-start"); await sleep(2000); seen.push("put-sent"); }
      if (r.url().includes("/api/releases/draft")) seen.push("draft");
      r.continue();
    });
    await typeInto(p, 'input[type=number]', "777");
    await sleep(700);
    await clickText(p, "Yayınla", "nav a");
    await until(async () => /Şimdi yayınlansa giden/.test(await text(p)), 10000);
    ok("taslak, stüdyo kaydı bittikten sonra alındı", seen.indexOf("draft") > seen.indexOf("put-sent") && seen.includes("put-sent"), seen.join(" · "));
    const db = (await api("GET", "/api/db")).body.db;
    ok("ve kayıt gerçekten sunucuda", db.seed === 777);
    await p.close();
  }

  /* ── A06 · offline studio edit, then a reload ────────────────────────── */
  console.log("\nA06 · çevrimdışı stüdyo değişikliği, sonra yenileme");
  {
    const p = await tab();
    await p.goto(`${WEB}/ses-studyosu?sekme=ayarlar`, { waitUntil: "networkidle0" });
    await p.setRequestInterception(true);
    let block = true;
    p.on("request", (r) => (block && r.url().endsWith("/api/db") && r.method() === "PUT" ? r.abort("internetdisconnected") : r.continue()));
    await typeInto(p, 'input[type=number]', "4321");
    await until(async () => /ulaşılamıyor/.test(await text(p)), 5000);
    block = false;
    p.removeAllListeners("request");
    await p.setRequestInterception(false);
    await p.reload({ waitUntil: "networkidle0" });
    ok("yenilemede sunucu eski belgeyi verir, yerel değişiklik ezilmeden önerilir", /sunucuya ulaşmamış stüdyo değişiklikleri/.test(await text(p)));
    ok("öneri kendiliğinden yazılmadı", (await api("GET", "/api/db")).body.db.seed === 777);
    await clickText(p, "Geri yükle");
    ok("kullanıcı geri yükleyince sunucuya yazılır", !!(await until(async () => (await api("GET", "/api/db")).body.db.seed === 4321, 8000)));
    await p.close();
  }

  /* ── A04 · Gemini icon cleaned with the key on; the original survives ── */
  console.log("\nA04 · anahtar açıkken Gemini ikonu şeffaflaştırma");
  {
    const orig = await upload(readFileSync(path.join(APP_DIR, "src/assets/icons/apple.png")), "apple-gen.png", "image/png");
    const p = await tab();
    await p.goto(`${WEB}/gorsel-studyosu?sekme=uret`, { waitUntil: "networkidle0" });
    await p.setRequestInterception(true);
    p.on("request", (r) => {
      if (r.url().includes("/api/ai/images"))
        return r.respond({ status: 200, contentType: "application/json",
          body: JSON.stringify({ id: "job-x", kind: "images", status: "done", assets: [orig], errors: [] }) });
      if (r.url().includes("/api/settings/keys") && r.method() === "GET")
        return r.respond({ status: 200, contentType: "application/json", body: JSON.stringify({ elevenlabs: { set: false }, openai: { set: true }, gemini: { set: true } }) });
      r.continue();
    });
    await p.reload({ waitUntil: "networkidle0" });
    await p.evaluate(() => { const s = [...document.querySelectorAll("select")].find((x) => [...x.options].some((o) => o.value === "gemini")); if (s) { const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set; set.call(s, "gemini"); s.dispatchEvent(new Event("change", { bubbles: true })); } });
    await sleep(300);
    const fileReqs = [];
    p.on("request", (r) => { if (r.url().includes(`/api/assets/${orig.id}`)) fileReqs.push({ auth: !!r.headers().authorization, url: r.url() }); });
    await clickText(p, "görsel üret");
    await until(async () => (await api("GET", "/api/db")).body.db.gens?.length >= 2, 10000, 300);
    const gens = (await api("GET", "/api/db")).body.db.gens ?? [];
    ok("orijinal ve şeffaf kopya ayrı kayıt olarak saklandı", gens.length >= 2 && gens.some((g) => g.asset === orig.id), `${gens.length} kayıt`);
    ok("dosya baytı başlıkla (yetkili) alındı, URL'de anahtar yok", fileReqs.some((x) => x.auth) && !fileReqs.some((x) => x.url.includes(TOKEN)));
    ok("orijinal dosya duruyor", (await api("GET", `/api/assets/${orig.id}/usage`)).status === 200 && (await fetch(`${API}/api/assets/${orig.id}`, { headers: { Authorization: `Bearer ${TOKEN}` } })).ok);

    /* A05: that same picture as a category card, then deleted from the gallery */
    await api("PATCH", `/api/categories/${cat.id}`, { icon: orig.id });
    p.removeAllListeners("request");
    await p.setRequestInterception(false);
    await p.goto(`${WEB}/gorsel-studyosu?sekme=uret`, { waitUntil: "networkidle0" });
    const before = (await api("GET", "/api/db")).body.db.gens.length;
    const alerts = [];
    p.removeAllListeners("dialog");
    p.on("dialog", (d) => { alerts.push(d.message()); d.accept(); });
    await p.evaluate((id) => {
      const card = [...document.querySelectorAll("img")].find((i) => i.src.includes(id))?.closest(".overflow-hidden");
      card?.querySelector('button[title="Sil"]')?.click();
    }, orig.id);
    await until(async () => alerts.length >= 2, 5000);
    ok("A05: kategori kartındaki görsel silinmez, açıkça söylenir", (await fetch(`${API}/api/assets/${orig.id}`, { headers: { Authorization: `Bearer ${TOKEN}` } })).ok
       && alerts.some((m) => /Dosya silinmedi|kullanılıyor/.test(m)), alerts.join(" | "));
    await until(async () => (await api("GET", "/api/db")).body.db.gens.length < before, 4000);
    ok("galeri kaydı kalkar (bilinçli seçim), dosya kalır", (await api("GET", "/api/db")).body.db.gens.length < before);
    await p.close();
  }

  /* ── A07 · leaving a paid batch starts nothing new ───────────────────── */
  console.log("\nA07 · ücretli toplu iş: sayfadan çıkınca yeni istek başlamaz");
  {
    const cur = (await api("GET", "/api/db")).body;
    const voices = (cur.db.voices ?? []).map((v) => ({ ...v, voiceId: "voice-x" }));
    await api("PUT", "/api/db", { rev: cur.rev, db: { ...cur.db, voices } });
    const p = await tab();
    await p.setRequestInterception(true);
    let tts = 0;
    p.on("request", async (r) => {
      const u = r.url();
      if (u.includes("/api/ai/eleven/credits")) return r.respond({ status: 200, contentType: "application/json", body: '{"used":0,"limit":1000000}' });
      if (u.includes("/api/settings/keys") && r.method() === "GET")
        return r.respond({ status: 200, contentType: "application/json", body: JSON.stringify({ elevenlabs: { set: true }, openai: { set: false }, gemini: { set: false } }) });
      if (u.includes("/api/ai/eleven/tts")) { tts++; await sleep(1500); return r.respond({ status: 502, contentType: "application/json", body: '{"error":"sahte","code":"PROVIDER_ERROR"}' }); }
      r.continue();
    });
    await p.goto(`${WEB}/ses-studyosu`, { waitUntil: "networkidle0" });
    await clickText(p, "Eksik ve eskileri seç");
    await clickText(p, "Seçilenleri üret");
    await clickText(p, "satırı üret");
    await until(async () => tts >= 1, 4000);
    await p.goto(`${WEB}/oyunlar`, { waitUntil: "networkidle0" });
    const at = tts;
    await sleep(4000);
    ok("sayfadan çıkıldıktan sonra yeni ücretli istek başlamadı", tts === at && at <= 2, `${at} → ${tts}`);
    await p.close();
  }

  /* ── A08 / A09 · stale takes, fixed line ids ─────────────────────────── */
  console.log("\nA08/A09 · eski metinden kayıt, sabit satır kimliği");
  {
    const mp3 = await upload(Buffer.from("ID3-fake-audio-" + "x".repeat(80)), "apple-tr.mp3", "audio/mpeg");
    await api("PUT", "/api/words/apple/audio/tr", { asset: mp3.id, text: "Türkçesi, eski elma." });
    const p = await tab();
    await p.goto(`${WEB}/ses-studyosu`, { waitUntil: "networkidle0" });
    const t = await text(p);
    ok("eski metinden kayıt 'yayına girmez' olarak görünür", /eski metin · yayına girmez/.test(t));
    const draft = (await api("GET", "/api/releases/draft")).body;
    ok("ve taslakta yayına girmez", !draft.manifest.clips["teacher/tr_apple"] && draft.issues.some((i) => i.item === "teacher/tr_apple"));
    await p.evaluate(() => { const row = [...document.querySelectorAll("li")].find((l) => l.textContent.includes("teacher/tr_apple")); [...(row?.querySelectorAll("button") ?? [])].find((b) => b.textContent.includes("bu metin için onayla"))?.click(); });
    const fixed = await until(async () => (await api("GET", "/api/words/apple")).body.audio.tr?.text === "Türkçesi, elma.");
    ok("açık onay: kayıt yeni metne bağlandı, yayına girer", !!fixed && !!(await api("GET", "/api/releases/draft")).body.manifest.clips["teacher/tr_apple"]);
    await clickText(p, "Satır ekle");
    await p.evaluate(() => {
      const inp = [...document.querySelectorAll("input")].find((i) => i.placeholder === "ör. hello_o");
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
      set.call(inp, "en_apple"); inp.dispatchEvent(new Event("input", { bubbles: true }));
      const ta = document.querySelector(".fixed textarea, [role=dialog] textarea") ?? [...document.querySelectorAll("textarea")].pop();
      const s2 = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set;
      s2.call(ta, "çakışan satır"); ta.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await sleep(200);
    const blocked = await p.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Kaydet")?.disabled);
    ok("teacher/en_apple sabit satıra verilemez (kaydet kapalı, neden yazılı)", blocked === true && /kelimenin kaydı/.test(await text(p)));
    await p.close();
  }

  console.log("\nSes ayarları · her kartın kendi Kaydet düğmesi (2026-10-21)");
  {
    const p = await tab();
    const db = async () => (await api("GET", "/api/db")).body.db;
    await p.goto(`${WEB}/ses-studyosu?sekme=ayarlar`, { waitUntil: "networkidle0" });
    await until(async () => p.evaluate(() => !!document.querySelector('[aria-label="Kuki sesini kaydet"]')));
    /* no key in the test: the voice is typed as an id, in Kuki's card */
    const typeVoice = (v) => p.evaluate((v) => {
      const card = document.querySelector('[aria-label="Kuki sesini kaydet"]').closest('[data-slot="card"]') ?? document.querySelector('[aria-label="Kuki sesini kaydet"]').closest("div.rounded-xl, div");
      const inp = [...card.querySelectorAll('input[placeholder="ses kimliği (voice_id)"]')][0];
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
      set.call(inp, v); inp.dispatchEvent(new Event("input", { bubbles: true }));
    }, v);
    const before = (await db()).voices?.find((v) => v.speaker === "otter")?.voiceId ?? "";
    await typeVoice("kuki-yeni-ses");
    await sleep(1500);
    ok("kartta ses değiştirmek tek başına kaydetmez, kart söyler",
       ((await db()).voices?.find((v) => v.speaker === "otter")?.voiceId ?? "") === before && /Kaydedilmemiş değişiklik var/.test(await text(p)));
    await p.click('[aria-label="Kuki sesini kaydet"]');
    const saved = await until(async () => (await db()).voices?.find((v) => v.speaker === "otter")?.voiceId === "kuki-yeni-ses");
    ok("Kaydet'e basınca sunucuya yazılır ve kart 'Kaydedildi' der", !!saved && !!(await until(async () => /Kaydedildi · bundan sonraki üretimler bu sesle/.test(await text(p)))));
    ok("öbür kartlar değişmez", ((await db()).voices?.find((v) => v.speaker === "bunny")?.voiceId ?? "") !== "kuki-yeni-ses");
    await p.close();
  }

  console.log("\nUygulamanın cümleleri ve tek kayıt kuralı (2026-10-20)");
  {
    const p = await tab();
    await p.goto(`${WEB}/ses-studyosu?sekme=foy`, { waitUntil: "networkidle0" });
    await until(async () => /Ben de söyleyeyim!/.test(await text(p)));
    ok("Föy uygulamanın kendi cümlelerini de gösteriyor (otter/me_too)", /Ben de söyleyeyim!/.test(await text(p)) && /uygulamanın cümlesi/.test(await text(p)));
    const fileOf = async (name) => { const f = path.join(data, name); writeFileSync(f, Buffer.from("ID3-fake-audio-" + name + "x".repeat(200))); return f; };
    const uploadTo = async (clip, file) => {
      const h = await p.evaluateHandle((c) => [...document.querySelectorAll("li")].find((l) => l.textContent.includes(c))?.querySelector('input[type="file"]'), clip);
      await h.asElement().uploadFile(file);
    };
    const db = async () => (await api("GET", "/api/db")).body.db;
    await uploadTo("otter/me_too", await fileOf("me_too_1.mp3"));
    const first = await until(async () => (await db()).lines.find((l) => l.clip === "otter/me_too")?.approved);
    ok("ilk kayıt: cümle belgeye girer ve kaydı kullanılır", !!first);
    await uploadTo("otter/me_too", await fileOf("me_too_2.mp3"));
    const second = await until(async () => { const a = (await db()).lines.find((l) => l.clip === "otter/me_too")?.approved; return a && a !== first ? a : null; });
    const takes = (await db()).takes.filter((t) => t.clip === "otter/me_too");
    ok("ikinci kayıt hemen kullanılır, satırda tek kayıt kalır", !!second && takes.length === 1 && takes[0].asset === second, `${takes.length}`);
    const gone = await until(async () => (await fetch(`${API}/api/assets/${first}`, { headers: { Authorization: `Bearer ${TOKEN}` } })).status === 404);
    ok("önceki kaydın dosyası silinir", !!gone);
    await p.close();
  }

  /* ── decision 3 · the paid jobs history ──────────────────────────────── */
  console.log("\nKarar 3 · ücretli iş geçmişi");
  {
    const p = await tab();
    await p.setRequestInterception(true);
    let paid = 0;
    const job = (id, status, extra = {}) => ({ id, kind: id.startsWith("img") ? "images" : "tts", status, errors: [], assets: [],
      createdAt: Date.now() - 60000, updatedAt: Date.now(), ...extra });
    p.on("request", (r) => {
      const u = r.url();
      if (/\/api\/ai\/(eleven|openai|gemini)\//.test(u) && r.method() === "POST") paid++;
      if (u.endsWith("/api/ai/jobs")) return r.respond({ status: 200, contentType: "application/json", body: JSON.stringify([
        job("tts-1", "done"), job("tts-2", "failed", { errors: ["PROVIDER_AUTH_FAILED"] }), job("tts-3", "uncertain", { errors: ["PROVIDER_TIMEOUT"] }),
        job("img-1", "partial", { errors: ["2. görsel kaydedilemedi"] }), job("img-2", "running"),
      ]) });
      r.continue();
    });
    await p.goto(`${WEB}/uretim-isleri`, { waitUntil: "networkidle2" });
    const t = await text(p);
    ok("beş durumun hepsi Türkçe adıyla görünür",
       ["çalışıyor", "tamamlandı", "başarısız", "sonucu belirsiz", "kısmen"].every((w) => t.includes(w)));
    ok("belirsiz iş: ücretlendirilmiş olabilir, otomatik yeniden gönderilmez",
       /ücretlendirmiş olabilir/.test(t) && /Otomatik olarak yeniden gönderilmez/.test(t));
    ok("'çift ücret olmaz' diye bir vaat yok", !/çift ücret(lendirme)? (olmaz|yok)/i.test(t));
    const resend = await p.evaluate(() => [...document.querySelectorAll("button")].some((b) => /yeniden gönder|tekrar dene|yeniden üret/i.test(b.textContent)));
    await sleep(4500);
    ok("sayfada yeniden gönderme düğmesi yok, sayfa kendiliğinden ücretli istek atmaz", !resend && paid === 0, `${paid}`);
    await p.close();
  }

  /* ── the voice workshop: languages, pronunciation, workshop ─────────────── */
  console.log("\nSes atölyesi · diller, telaffuz, atölye");
  {
    const take = await upload(Buffer.from("ID3-fake-audio-" + "y".repeat(80)), "it.mp3", "audio/mpeg");
    const p = await tab();
    await p.setRequestInterception(true);
    const said = [];
    let dictCalls = 0;
    p.on("request", async (r) => {
      const u = r.url();
      if (u.includes("/api/ai/eleven/credits")) return r.respond({ status: 200, contentType: "application/json", body: '{"used":0,"limit":1000000}' });
      if (u.includes("/api/ai/eleven/voices")) return r.respond({ status: 200, contentType: "application/json", body: '[{"voice_id":"voice-x","name":"X"}]' });
      if (u.includes("/api/settings/keys") && r.method() === "GET")
        return r.respond({ status: 200, contentType: "application/json", body: JSON.stringify({ elevenlabs: { set: true }, openai: { set: false }, gemini: { set: false } }) });
      if (u.includes("/api/ai/eleven/tts")) { said.push(JSON.parse(r.postData())); return r.respond({ status: 200, contentType: "application/json", body: JSON.stringify({ ...take, jobId: "j" }) }); }
      if (u.includes("/api/ai/eleven/pronunciation")) { dictCalls++; return r.respond({ status: 200, contentType: "application/json", body: '{"id":"d1","version_id":"v1","rules":1}' }); }
      r.continue();
    });
    const db = async () => (await api("GET", "/api/db")).body.db;
    const choose = (p, optionText, value) => p.evaluate((t, v) => {
      const sel = [...document.querySelectorAll("select")].find((x) => [...x.options].some((o) => o.textContent.includes(t)));
      const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set;
      set.call(sel, v); sel.dispatchEvent(new Event("change", { bubbles: true }));
    }, optionText, value);
    const fill = (p, pick, value) => p.evaluate((pick, v) => {
      const el = eval(pick);
      const set = Object.getOwnPropertyDescriptor(el.constructor.prototype, "value").set;
      set.call(el, v); el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("focusout", { bubbles: true }));
    }, pick, value);

    await p.goto(`${WEB}/ses-studyosu?sekme=ayarlar`, { waitUntil: "networkidle0" });
    await choose(p, "İtalyanca (it)", "it");
    await clickText(p, "Dil ekle");
    ok("Ses ayarlarından İtalyanca eklenir", !!(await until(async () => (await db()).languages?.some((l) => l.code === "it"))));

    await p.goto(`${WEB}/ses-studyosu?sekme=telaffuz`, { waitUntil: "networkidle0" });
    await fill(p, `[...document.querySelectorAll("li")].find((l) => l.firstChild?.textContent === "apple").querySelector("input")`, "/ˈæpəl/");
    ok("Telaffuz: kelimenin IPA'sı yazılır (eğik çizgiler atılır)", !!(await until(async () => (await db()).pron?.apple?.ipa === "ˈæpəl")));
    await clickText(p, "Sözlüğü gönder");
    ok("ElevenLabs sözlüğü gönderilir ve hangi listeden olduğu saklanır", !!(await until(async () => (await db()).pronDict?.id === "d1")) && dictCalls === 1);

    await p.goto(`${WEB}/ses-studyosu`, { waitUntil: "networkidle0" });
    await clickText(p, "İtalyanca");
    await until(async () => p.evaluate(() => !!document.querySelector('[aria-label="teacher/tr_apple çevirisi"]')));
    ok("İtalyanca föyde kelimeler 'çeviri yok' görünür, İngilizce satırlar yok",
       /çeviri yok/.test(await text(p)) && !(await p.evaluate(() => document.body.innerText.includes("teacher/en_apple"))));
    await fill(p, `document.querySelector('[aria-label="teacher/tr_apple çevirisi"]')`, "mela");
    ok("çeviri yazılır (yalnız anlam; şablon gerisini ekler)", !!(await until(async () => (await db()).i18n?.it?.words?.apple?.meaning === "mela")));
    await p.evaluate(() => {
      const row = document.querySelector('[aria-label="teacher/tr_apple çevirisi"]').closest("li");
      row.querySelector('button[title="ElevenLabs ile üret"]').click();
    });
    await clickText(p, "1 satırı üret");
    const it = await until(async () => said.find((b) => b.language_code === "it"));
    ok("İtalyanca satır it diliyle ve şablonla gider", !!it && /In italiano, mela\./.test(it.text), it?.text);
    ok("kayıt o dilin onaylı kaydı olur, Türkçeye dokunmaz",
       !!(await until(async () => (await db()).localeApproved?.it?.["teacher/tr_apple"]?.asset === take.id))
       && !(await db()).takes.some((t) => t.clip === "teacher/tr_apple" && !t.lang && t.asset === take.id));
    await clickText(p, "Kapat");

    await p.goto(`${WEB}/ses-studyosu?sekme=atolye`, { waitUntil: "networkidle0" });
    await choose(p, "Eleven v4", "eleven_v4");
    await fill(p, `[...document.querySelectorAll("textarea")].find((t) => t.placeholder.startsWith("selam_ogretmen"))`, "elma_soru, heyecanlı, {apple} nerede?");
    await clickText(p, "Hepsini üret");
    const v4 = await until(async () => said.find((b) => b.model_id === "eleven_v4"));
    ok("Atölye · v4: duygu etiketi + kelime metnin içinde IPA ile", v4?.text === "[excited] /ˈæpəl/ nerede?" && v4?.language_code === "tr" && !v4?.pronunciation_dictionary_locators, v4?.text);
    ok("atölye kaydı saklanır", !!(await until(async () => (await db()).workshop?.some((w) => w.name === "elma_soru" && w.tag === "[excited]"))));
    await choose(p, "Eleven v4", "eleven_flash_v2_5");
    await fill(p, `[...document.querySelectorAll("textarea")].find((t) => t.placeholder.startsWith("selam_ogretmen"))`, "elma_iki, heyecanlı, {apple} burada!");
    await clickText(p, "Hepsini üret");
    const fl = await until(async () => said.find((b) => b.model_id === "eleven_flash_v2_5"));
    ok("Atölye · başka model: etiket gönderilmez, kelime düz, sözlük yanında",
       fl?.text === "apple burada!" && fl?.pronunciation_dictionary_locators?.[0]?.pronunciation_dictionary_id === "d1", JSON.stringify(fl));
    await fill(p, `[...document.querySelectorAll("textarea")].find((t) => t.placeholder.startsWith("selam_ogretmen"))`, "elma_soru, sakin, başka metin");
    await sleep(200);
    ok("aynı adla başka metin: yeni ad istenir, üretilmez", /yeni bir dosya adı verin/.test(await text(p)));
    await p.close();
  }

  /* ── the workshop's text boxes: what is pasted is what is sent ──────────── */
  console.log("\nAtölye · yapıştırılan metin gönderilir, eski örnek kalmaz");
  {
    const p = await tab();
    await p.setRequestInterception(true);
    const designs = [], tries = [];
    let block = false;
    p.on("request", async (r) => {
      const u = r.url();
      if (u.includes("/api/ai/eleven/credits")) return r.respond({ status: 200, contentType: "application/json", body: '{"used":0,"limit":1000000}' });
      if (u.includes("/api/ai/eleven/voices")) return r.respond({ status: 200, contentType: "application/json", body: '[{"voice_id":"voice-x","name":"X"}]' });
      if (u.includes("/api/settings/keys") && r.method() === "GET")
        return r.respond({ status: 200, contentType: "application/json", body: JSON.stringify({ elevenlabs: { set: true }, openai: { set: false }, gemini: { set: false } }) });
      if (u.includes("/api/ai/eleven/design") && !u.includes("design-save")) {
        designs.push(JSON.parse(r.postData()));
        if (block) return r.respond({ status: 422, contentType: "application/json",
          body: JSON.stringify({ error: "ElevenLabs bu isteği içerik kuralları nedeniyle engelledi (ücret alınmaz): 403 — safety guidelines", code: "PROVIDER_BLOCKED" }) });
        const a = await upload(Buffer.from("ID3-fake-design-" + designs.length + "z".repeat(60)), `voice-design__g${designs.length}.mp3`, "audio/mpeg");
        return r.respond({ status: 200, contentType: "application/json", body: JSON.stringify({ job: {}, previews: [{ ...a, generatedVoiceId: `g${designs.length}` }] }) });
      }
      if (u.includes("/api/ai/eleven/tts")) {
        tries.push(JSON.parse(r.postData()));
        const a = await upload(Buffer.from("ID3-fake-try-" + tries.length + "q".repeat(60)), "t.mp3", "audio/mpeg");
        return r.respond({ status: 200, contentType: "application/json", body: JSON.stringify({ ...a, jobId: "j" }) });
      }
      r.continue();
    });
    /* select everything in the box and put the new text in at once, as a paste does */
    const paste = (p, pick, value) => p.evaluate((pick, v) => {
      const el = eval(pick); el.focus(); el.select();
      document.execCommand("insertText", false, v);
    }, pick, value);
    const desc = `[...document.querySelectorAll("textarea")].find((t) => t.placeholder.startsWith("Türkçe konuşan, sıcak"))`;
    const sample = `[...document.querySelectorAll("label")].find((l) => l.textContent.includes("Örnek konuşma")).querySelector("textarea")`;
    await p.goto(`${WEB}/ses-studyosu?sekme=atolye`, { waitUntil: "networkidle0" });

    await paste(p, desc, "A warm, friendly young woman voicing a cheerful cartoon rabbit; light and bright.");
    await paste(p, sample, "Merhaba! Ben Lili. Bugün seninle mutfakta yeni şeyler keşfedeceğiz, çok heyecanlıyım, hadi gel, birlikte oynayalım mı?");
    await clickText(p, "Ses örnekleri üret");
    await until(async () => designs.length === 1);
    ok("yapıştırılan tarif ve örnek konuşma gönderilir", designs[0]?.description.startsWith("A warm, friendly young woman") && designs[0]?.text.startsWith("Merhaba! Ben Lili"));
    ok("örnek ekranda", !!(await until(async () => /Örnek 1/.test(await text(p)))));

    block = true;
    await paste(p, desc, "A youthful childlike cartoon voice, playful and sweet, for a little otter friend.");
    await clickText(p, "Ses örnekleri üret");
    await until(async () => designs.length === 2);
    ok("ikinci yapıştırma: YENİ tarif gider, eskisi değil", designs[1]?.description.startsWith("A youthful childlike"), designs[1]?.description);
    const t2 = await until(async () => { const t = await text(p); return /güvenlik kuralları/.test(t) ? t : null; });
    ok("engellenen tarif: açıkça söylenir, anahtar hatası denmez", !!t2 && !/anahtarı reddetti/.test(t2));
    ok("engellenince önceki tasarımın örneği ekranda kalmaz", !/Örnek 1/.test(t2 ?? ""));

    const tryBox = `[...document.querySelectorAll("textarea")].find((t) => t.value.startsWith("Merhaba! Bugün birlikte"))`;
    await paste(p, tryBox, "Selam! {banana} çok tatlı bir meyve.");
    await clickText(p, "Deneme üret");
    await until(async () => tries.length === 1);
    ok("deneme: yapıştırılan metin gönderilir", /Selam! banana çok tatlı bir meyve\./.test(tries[0]?.text ?? ""), tries[0]?.text);
    await p.close();
  }

  /* ── a 7th category, start to end: the wizard, a film, a release, the phone ─ */
  console.log("\nKategori sihirbazı · 7. kategori: ekle, yayınla, telefonda oku, sil");
  {
    /* E2E_SHOTS=<dir> keeps a picture of each step (for looking, not checking) */
    const shot = async (p, name) => { if (process.env.E2E_SHOTS) await p.screenshot({ path: path.join(process.env.E2E_SHOTS, `${name}.png`) }); };
    /* the app's own reader of a release, as a phone runs it */
    const { build } = await import(path.join(APP_DIR, "node_modules/esbuild/lib/main.js"));
    const dir = mkdtempSync(path.join(tmpdir(), "loplop-appread-"));
    const entry = path.join(dir, "entry.ts");
    writeFileSync(entry, `export { readManifest } from "${APP_DIR}/src/core/remote";\nexport { remoteCategory } from "${APP_DIR}/src/content/remote";\n`);
    await build({ entryPoints: [entry], bundle: true, platform: "node", format: "esm", outfile: path.join(dir, "app.mjs"), logLevel: "silent",
                  loader: { ".png": "dataurl", ".mp4": "empty", ".mp3": "empty", ".m4a": "empty" },
                  alias: { "react-native": path.join(APP_DIR, "tools/loadcheck/rn.js"), "expo-speech": path.join(APP_DIR, "tools/loadcheck/misc.js"),
                           "expo-audio": path.join(APP_DIR, "tools/loadcheck/misc.js") } });
    const app = await import(path.join(dir, "app.mjs"));

    const p = await tab();
    await p.setViewport({ width: 1400, height: 1100 });
    await p.goto(`${WEB}/kategoriler`, { waitUntil: "networkidle0" });
    await clickText(p, "Yeni kategori");
    await until(async () => p.url().endsWith("/kategoriler/yeni"));
    await typeInto(p, "main input", "Deniz Dünyası");
    await typeInto(p, 'input[placeholder^="ör. altı deniz"]', "beş kelime, üç oyun");
    await shot(p, "1-kart");
    await clickText(p, "Oluştur ve kelimelere geç");
    const made = await until(async () => /\/kategoriler\/([a-z0-9-]+)\?adim=kelimeler/.exec(p.url())?.[1]);
    ok("sihirbaz: kart doldurulur, kategori oluşur, kelimelere geçilir", !!made, p.url());
    const cid = made;
    await until(async () => /Seti oluştur/.test(await text(p)));
    await clickText(p, "Seti oluştur");
    await until(async () => (await api("GET", `/api/categories/${cid}`)).body.set);
    await until(async () => /Kütüphaneden ekle/.test(await text(p)));
    await clickText(p, "Kütüphaneden ekle");
    await until(async () => p.evaluate(() => !!document.querySelector("[role=dialog]")));
    await p.evaluate(() => {
      for (const en of ["apple", "banana", "bread", "milk", "water"])
        [...document.querySelectorAll("[role=dialog] li button")].find((b) => b.querySelector("span span")?.textContent === en)?.click();
    });
    await clickText(p, "5 kelimeyi ekle");
    const setId = (await api("GET", `/api/categories/${cid}`)).body.set;
    ok("kelimeler: yeni set kurulur, kütüphaneden beş kelime eklenir", !!(await until(async () => (await api("GET", `/api/sets/${setId}`)).body.words.length === 5)));
    await shot(p, "2-kelimeler");

    await clickText(p, "Devam: Akış");
    await until(async () => /Açılış videosu/.test(await text(p)));
    const fresh = (await api("GET", `/api/categories/${cid}`)).body;
    ok("akış: oyunlar hazır gelir (Lili'ye ver → Bul bakalım → kartsız tekrar)",
       fresh.steps.filter((x) => x.kind === "game").map((x) => `${x.game}:${x.teach}`).join() === "drag:true,pop:false,drag:false");
    const file = await p.$("li#adim-0 input[type=file]");
    await file.uploadFile(path.join(APP_DIR, "src/assets/video/rabbit-otter-intro.mp4"));
    const vid = await until(async () => (await api("GET", `/api/categories/${cid}`)).body.steps[0].video, 15000);
    ok("açılış videosu sürükle-bırak alanından yüklenir ve adıma bağlanır", !!vid);
    const seen = await until(async () => p.evaluate(() => {
      const v = document.querySelector("li#adim-0 video");
      return v && v.videoWidth > 0 ? `${v.videoWidth}x${v.videoHeight}` : null;
    }), 10000);
    ok("önizleme videoyu oynatır ve ölçer (telefon çerçevesinde)", !!seen && /kırpılır|oturur/.test(await text(p)), seen ?? "");
    await shot(p, "3-akis");
    await clickText(p, "Tamamını göster");
    ok("yerleşim: “tamamını göster” saklanır", !!(await until(async () => (await api("GET", `/api/categories/${cid}`)).body.steps[0].fit === "contain")));

    await clickText(p, "Devam: Kontrol ve yayın");
    await until(async () => /Kontrol listesi/.test(await text(p)));
    await clickText(p, "Uygulamada", "[role=radio]");
    ok("kontrol: hatasız kategori “Uygulamada” yapılır", !!(await until(async () => (await api("GET", `/api/categories/${cid}`)).body.status === "live")));
    await shot(p, "4-yayin");

    await p.goto(`${WEB}/yayinla`, { waitUntil: "networkidle0" });
    await until(async () => /Teste yayınla/.test(await text(p)), 10000);
    const before = (await api("GET", "/api/releases")).body.releases.length;
    await clickText(p, "Teste yayınla");
    ok("Yayınla sayfasından teste yayınlanır", !!(await until(async () => (await api("GET", "/api/releases")).body.releases.length > before, 10000)));
    const m = await (await fetch(`${API}/api/app/manifest?build=1&schema=1&channel=test`)).json();
    const mc = m.categories.find((c) => c.id === cid);
    ok("telefonun manifestinde: kategori, videosu (bantlı) ve oyunların motorları",
       !!mc && mc.steps[0].video === vid && mc.steps[0].fit === "contain" && !!m.assets[vid]?.md5
       && mc.steps.filter((x) => x.kind === "game").map((x) => x.template).join() === "drag,pop,drag");
    const remote = app.readManifest(m, (id) => (m.assets[id] ? `file:///release/${id}.${m.assets[id].ext}` : null));
    const rc = remote.categories.find((c) => c.id === cid);
    const played = rc && app.remoteCategory(rc).category;
    ok("uygulamanın kendi okuyucusu kategoriyi alır: beş kelime, dosyadan video, bantlı",
       !!played && rc.words.length === 5 && played.steps[0].kind === "video" && /^file:\/\/\/release\//.test(played.steps[0].uri)
       && played.steps[0].fit === "contain" && played.id === `server:${cid}`, played ? JSON.stringify(played.steps[0]) : "kategori yok");

    await p.goto(`${WEB}/kategoriler/${cid}?adim=yayin`, { waitUntil: "networkidle0" });
    await p.evaluate(() => document.querySelector('button[title="Kategoriyi sil"]')?.click());
    ok("kategori silinir (onaydan sonra), liste sayfasına dönülür",
       !!(await until(async () => (await api("GET", `/api/categories/${cid}`)).status === 404)) && !!(await until(async () => p.url().endsWith("/kategoriler"))));
    await api("POST", "/api/releases", { note: "kategori çıktı", channels: ["test"] });
    const m2 = await (await fetch(`${API}/api/app/manifest?build=1&schema=1&channel=test`)).json();
    ok("yeni yayında kategori yok; telefon bir sonraki açılışta onu menüden kaldırır", !m2.categories.some((c) => c.id === cid));
    await p.close();
  }

  /* ── the drawn map grows: a row after the app's six, made on the panel ──── */
  console.log("\nYol haritası · yeni sıra: kategoriden kur, yayınla, telefonda haritayı büyüt, sil");
  {
    const shot = async (p, name) => { if (process.env.E2E_SHOTS) await p.screenshot({ path: path.join(process.env.E2E_SHOTS, `${name}.png`), fullPage: true }); };
    /* the app's map as its inventory reports it. An app folder that still
       reports the painted map (before its `npm run inventory` for the drawn
       one): a second build reports the drawn map with the app's own ids, so
       the panel's side is tested either way -- and it is said */
    const inv = (await api("GET", "/api/inventory")).body;
    if (inv.roadmap?.kind !== "drawn") {
      console.log("  not  uygulamanın envanteri henüz çizili haritayı bildirmiyor; 2. derleme bildiriyor");
      const drawn = { kind: "drawn", since: 1, stopsPerRow: 4,
        stops: inv.categories.flatMap((c) => ["1", "2", "3", "music"].map((k) => ({ id: `${c.id}-${k}`, kind: k, row: c.id }))) };
      ok("çizili haritalı 2. derleme", (await api("PUT", "/api/inventory", { ...inv, app: { ...inv.app, build: inv.app.build + 1 }, roadmap: drawn })).status === 200);
    }
    const { build } = await import(path.join(APP_DIR, "node_modules/esbuild/lib/main.js"));
    const dir = mkdtempSync(path.join(tmpdir(), "loplop-appread-"));
    const entry = path.join(dir, "entry.ts");
    /* the map module as a namespace: its row API is the app's to change */
    writeFileSync(entry, `export { readManifest } from "${APP_DIR}/src/core/remote";\nexport * as meadow from "${APP_DIR}/src/core/meadowmap";\n`);
    await build({ entryPoints: [entry], bundle: true, platform: "node", format: "esm", outfile: path.join(dir, "app.mjs"), logLevel: "silent",
                  loader: { ".png": "dataurl", ".mp4": "empty", ".mp3": "empty", ".m4a": "empty" },
                  alias: { "react-native": path.join(APP_DIR, "tools/loadcheck/rn.js"), "expo-speech": path.join(APP_DIR, "tools/loadcheck/misc.js"),
                           "expo-audio": path.join(APP_DIR, "tools/loadcheck/misc.js") } });
    const app = await import(path.join(dir, "app.mjs"));

    /* a live category for the row: a set of five app words, the skeleton's three games */
    const ws = (await api("POST", "/api/sets", { name: "Harita seti", words: ["apple", "banana", "bread", "milk", "water"] })).body;
    const hc = (await api("POST", "/api/categories", { title: "Harita Kategorisi", set: ws.id })).body;
    const hl = await api("PATCH", `/api/categories/${hc.id}`, { status: "live" });
    ok("sıra için uygulamada bir kategori", hl.status === 200, JSON.stringify(hl.body.issues ?? hl.body).slice(0, 200));

    const p = await tab();
    await p.setViewport({ width: 1400, height: 1000 });
    await p.goto(`${WEB}/yol-haritasi`, { waitUntil: "networkidle0" });
    ok("sol menüde Yol haritası; önizleme uygulamanın 6 sırasını soluk çizer (24 durak), resim yok",
       !!(await until(async () => p.evaluate(() => {
         const rows = [...document.querySelectorAll("[data-testid=map-preview] [data-row]")];
         return rows.length === 6 && rows.every((r) => r.getAttribute("opacity") === "0.45")
           && document.querySelectorAll("[data-testid=map-preview] [data-stop]").length === 24
           && !document.querySelector("[data-testid=map-preview] image");
       }))) && /Haritanın sıraları/.test(await text(p)) && /Hayvan Dostlarımız/.test(await text(p)));
    await shot(p, "harita-1-genel");
    await clickText(p, "Yeni sıra");
    await until(async () => p.evaluate(() => !!document.querySelector("[role=dialog] select")));
    await p.evaluate((id) => { const s = document.querySelector("[role=dialog] select");
      const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set; set.call(s, id); s.dispatchEvent(new Event("change", { bubbles: true })); }, hc.id);
    await clickText(p, "Oluştur", "[role=dialog] button");
    const sid = await until(async () => /\/yol-haritasi\/([a-z0-9-]+)$/.exec(p.url())?.[1]);
    ok("kategoriden yeni sıra oluşur, düzenleyici açılır", !!sid, p.url());
    const row = await until(async () => { const r = (await api("GET", "/api/roadmap")).body.slides.find((x) => x.id === sid); return r?.stops.length === 3 ? r : null; }, 8000);
    ok("sıranın adı kategorinin adı; üç durak 1 · 2 · 3, her oyun önündeki videoyla", !!row && row.title === "Harita Kategorisi" && row.category === hc.id
       && row.stops.map((x) => x.kind).join() === "1,2,3"
       && row.stops.map((x) => x.steps.join("+")).join(",") === "open+game-1,to-2+game-2,to-3+game-3"
       /* F04: every stop a new id of its own, never "<row>-1, -2, -3" again */
       && row.stops.every((x) => x.id.startsWith(`${sid}-`)) && new Set(row.stops.map((x) => x.id)).size === 3
       && !row.stops.some((x) => "x" in x) && !("image" in row),
       row ? row.stops.map((x) => `${x.kind}:${x.id}:${x.steps.join("+")}`).join(",") : "");
    const firstIds = row?.stops.map((x) => x.id).join() ?? "";
    await until(async () => /Yeniden diz/.test(await text(p)));
    await clickText(p, "Yeniden diz");
    await sleep(1200);
    const again = (await api("GET", "/api/roadmap")).body.slides.find((x) => x.id === sid);
    ok("F04: yeniden dizmek aynı derslerin kimliğini korur", again.stops.map((x) => x.id).join() === firstIds, again.stops.map((x) => x.id).join());
    /* a music stop: last, wants a song */
    await p.evaluate(() => [...document.querySelectorAll("label")].find((l) => l.textContent.trim() === "Müzik durağı")?.querySelector("button")?.click());
    const withMusic = await until(async () => { const r = (await api("GET", "/api/roadmap")).body.slides.find((x) => x.id === sid); return r.stops.length === 4 ? r : null; }, 8000);
    ok("müzik durağı sona eklenir, şarkısı yoksa hata", !!withMusic && withMusic.stops[3].kind === "music"
       && withMusic.stops.slice(0, 3).map((x) => x.id).join() === firstIds && withMusic.issues.some((i) => /şarkısı yok/.test(i.text)),
       withMusic?.issues.map((i) => i.text).join(" | "));
    ok("önizleme düzenlenen sırayı çerçeveler, 4 durağıyla", !!(await until(async () => p.evaluate((id) =>
      document.querySelectorAll(`[data-testid=map-preview] [data-row="${id}"] [data-stop]`).length === 4, sid))));
    await p.evaluate(() => [...document.querySelectorAll("label")].find((l) => l.textContent.trim() === "Müzik durağı")?.querySelector("button")?.click());
    const noMusic = await until(async () => { const r = (await api("GET", "/api/roadmap")).body.slides.find((x) => x.id === sid); return r.stops.length === 3 ? r : null; }, 8000);
    ok("müzik durağı kalkar; sıra hatasız", !!noMusic && !noMusic.issues.some((i) => i.level === "error"), noMusic?.issues.map((i) => i.text).join(" | "));
    await shot(p, "harita-2-sira");
    await clickText(p, "Uygulamada", "[role=radio]");
    ok("sıra uygulamaya konur", !!(await until(async () => (await api("GET", "/api/roadmap")).body.slides.find((x) => x.id === sid)?.status === "live")));
    await p.goto(`${WEB}/yol-haritasi`, { waitUntil: "networkidle0" });
    ok("listede 7. sıra: kategorisi ve durakları", !!(await until(async () => p.evaluate((id) => {
      const card = document.querySelector(`div[data-row="${id}"]`);
      return !!card && card.textContent.includes("Harita Kategorisi") && card.textContent.includes("7");
    }, sid))));
    const rel = await api("POST", "/api/releases", { note: "yeni sıra", channels: ["test"] });
    ok("yayınlanır", rel.status === 201, JSON.stringify(rel.body).slice(0, 200));
    const m = await (await fetch(`${API}/api/app/manifest?build=1&schema=1&channel=test`)).json();
    const ms = m.roadmap?.slides?.[0];
    ok("telefonun manifestinde sıra: kategorisi ve 1 · 2 · 3 durakları; resim, patika, konum yok",
       ms?.id === sid && ms.category === hc.id && ms.stops.map((x) => x.kind).join() === "1,2,3"
       && ms.stops.every((x) => x.category === hc.id && x.steps.length) && !["image", "w", "trail", "entry", "land"].some((k) => k in ms)
       && !ms.stops.some((x) => "x" in x || "y" in x), JSON.stringify(ms));
    const remote = app.readManifest(m, (id) => (m.assets[id] ? `file:///release/${id}.${m.assets[id].ext}` : null));
    ok("uygulamanın okuyucusu sırayı alır: üç durak, her biri kategorinin bir koşusu",
       remote.roadmap?.[0]?.slide.id === sid && remote.roadmap[0].slide.stops.length === 3
       && Object.values(remote.roadmap[0].legs).every((l) => l.category === hc.id), JSON.stringify(remote.roadmap?.[0]?.slide));
    if (typeof app.meadow?.setMapRows === "function") {
      const sl = remote.roadmap[0].slide;
      app.meadow.setMapRows([{ id: sl.id, title: sl.title, kinds: sl.stops.map((x) => x.kind) }]);
      ok("uygulamanın haritası büyür: 7 sıra, 7 bölüm (tek yönlü yol, bölüm başına bir sıra)", app.meadow.ROWS.length === 7 && app.meadow.PAGES === 7,
         `${app.meadow.ROWS.length} sıra, ${app.meadow.PAGES} sayfa`);
      app.meadow.setMapRows([]);
    } else console.log("  not  uygulamanın core/meadowmap.ts'inde setMapRows yok; haritanın büyümesi uygulama tarafında denenir");

    await p.goto(`${WEB}/yol-haritasi/${sid}`, { waitUntil: "networkidle0" });
    await until(async () => p.evaluate(() => !!document.querySelector('button[title="Sırayı sil"]')));
    await p.evaluate(() => document.querySelector('button[title="Sırayı sil"]')?.click());
    ok("sıra silinir", !!(await until(async () => !(await api("GET", "/api/roadmap")).body.slides.some((x) => x.id === sid))));
    await api("PATCH", `/api/categories/${hc.id}`, { status: "draft" });
    await p.close();
  }

  /* ── download packs: the wizard asks for everything, the phone waits for a yes ─ */
  console.log("\nİndirme paketi · sihirbaz: içerik, ne zaman, yayın; telefon izinsiz indirmez");
  {
    const shot = async (p, name) => { if (process.env.E2E_SHOTS) await p.screenshot({ path: path.join(process.env.E2E_SHOTS, `${name}.png`), fullPage: true }); };
    const { build } = await import(path.join(APP_DIR, "node_modules/esbuild/lib/main.js"));
    const dir = mkdtempSync(path.join(tmpdir(), "loplop-appread-"));
    const entry = path.join(dir, "entry.ts");
    writeFileSync(entry, `export { readManifest, wantedFiles } from "${APP_DIR}/src/core/remote";\n`);
    await build({ entryPoints: [entry], bundle: true, platform: "node", format: "esm", outfile: path.join(dir, "app.mjs"), logLevel: "silent",
                  loader: { ".png": "dataurl", ".mp4": "empty", ".mp3": "empty", ".m4a": "empty" },
                  alias: { "react-native": path.join(APP_DIR, "tools/loadcheck/rn.js") } });
    const app = await import(path.join(dir, "app.mjs"));

    /* a live category with a film, and a live land: a game stop and a music stop */
    const ws = (await api("POST", "/api/sets", { name: "Paket seti", words: ["apple", "banana", "bread", "milk", "water"] })).body;
    const pc = (await api("POST", "/api/categories", { title: "Paket Kategorisi", set: ws.id })).body;
    const film = await upload(Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from("ftypisom"), Buffer.alloc(3000, 9)]), "acilis.mp4", "video/mp4");
    await api("PATCH", `/api/categories/${pc.id}`, { steps: pc.steps.map((x) => (x.id === "open" ? { ...x, video: film.id } : x)) });
    ok("paketin kategorisi uygulamada", (await api("PATCH", `/api/categories/${pc.id}`, { status: "live" })).status === 200);
    /* the row's sign is its category's picture: the pack's own file */
    const img = await upload(readFileSync(path.join(APP_DIR, "src/assets/actions/clap.png")), "tabela.png", "image/png");
    await api("PATCH", `/api/categories/${pc.id}`, { icon: img.id });
    const song = await upload(Buffer.from("ID3-fake-song-" + "s".repeat(200)), "sarki.mp3", "audio/mpeg");
    const land = (await api("POST", "/api/roadmap/slides", { title: "Paket Diyarı" })).body;
    const lp = await api("PATCH", `/api/roadmap/slides/${land.id}`, {
      stops: [{ id: `${land.id}-1`, kind: "1", category: pc.id, steps: ["open", "game-1"] },
              { id: `${land.id}-2`, kind: "music", category: pc.id, steps: [], song: song.id }] });
    await api("PATCH", `/api/roadmap/slides/${land.id}`, { status: "live" }, lp.body.updatedAt);

    const p = await tab();
    await p.setViewport({ width: 1400, height: 1000 });
    await p.goto(`${WEB}/paketler`, { waitUntil: "networkidle0" });
    ok("sol menüde İndirme paketleri", /İndirme paketleri/.test(await text(p)));
    await clickText(p, "Yeni paket");
    await until(async () => p.evaluate(() => !!document.querySelector("[role=dialog] input")));
    await typeInto(p, "[role=dialog] input", "Deniz Paketi");
    await clickText(p, "Oluştur", "[role=dialog] button");
    const pid = await until(async () => /\/paketler\/([a-z0-9-]+)$/.exec(p.url())?.[1]);
    ok("paket oluşur, sihirbaz açılır", !!pid, p.url());
    await clickText(p, "Devam: İçerik");
    await until(async () => /Hazır bir sırayı ekle/.test(await text(p)));
    await p.evaluate((id) => { const s = [...document.querySelectorAll("select")].find((x) => [...x.options].some((o) => o.value === id));
      const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set; set.call(s, id); s.dispatchEvent(new Event("change", { bubbles: true })); }, land.id);
    await clickText(p, "Pakete ekle");
    ok("içerik: sıra pakete eklenir; her durağın hazırlığı listelenir (videolar, oyunlar, şarkı)",
       !!(await until(async () => (await api("GET", "/api/roadmap")).body.slides.find((x) => x.id === land.id)?.pack === pid))
       && !!(await until(async () => /şarkı yüklü/.test(await text(p)) && /videolar 1\/3/.test(await text(p)))));
    await shot(p, "paket-1-icerik");
    await clickText(p, "Devam: Ne zaman");
    await until(async () => /Hangi durağa gelince sunulsun/.test(await text(p)));
    await p.evaluate(() => {
      const group = [...document.querySelectorAll("div")].find((d) => d.firstElementChild?.textContent === "Kaç Tane?" && d.children.length === 2);
      [...(group?.querySelectorAll("button") ?? [])].find((b) => b.textContent === "3. oyun")?.click();
    });
    ok("ne zaman: “Kaç Tane?” sırasının 3. oyunu seçilir", !!(await until(async () => (await api("GET", "/api/packs")).body.find((x) => x.id === pid)?.offerAt === "numbers-3")));
    await clickText(p, "Devam: Boyut ve yayın");
    await until(async () => /Telefonun bu pakete onay verince/.test(await text(p)));
    await clickText(p, "Uygulamada", "[role=radio]");
    ok("yayın: paket uygulamaya konur", !!(await until(async () => (await api("GET", "/api/packs")).body.find((x) => x.id === pid)?.status === "live")));
    await shot(p, "paket-2-yayin");
    const rel = await api("POST", "/api/releases", { note: "paket", channels: ["test"] });
    ok("yayınlanır", rel.status === 201, JSON.stringify(rel.body).slice(0, 300));
    const m = await (await fetch(`${API}/api/app/manifest?build=1&schema=1&channel=test`)).json();
    const mp = m.packs?.find((x) => x.id === pid);
    ok("manifestte paket: yalnız ona ait dosyalar (sıra tabelası, video, şarkı)", !!mp && [img.id, film.id, song.id].every((id) => mp.assets.includes(id)), JSON.stringify(mp));
    const wanted = app.wantedFiles(m, new Set()).map((f) => f.id);
    ok("izin yokken telefonun indireceği listede paket dosyası yok", ![img.id, film.id, song.id].some((id) => wanted.includes(id)));
    const file = (id) => (m.assets[id] ? `file:///r/${id}` : null);
    const before = app.readManifest(m, file);
    const after = app.readManifest(m, file, new Set([pid]));
    ok("izin yokken kategori ve sıra oyunda değil; izinle (indirilince) ikisi de oyunda",
       !before.categories.some((c) => c.id === pc.id) && !(before.roadmap ?? []).length && before.packs[0]?.ready === false
       && after.categories.some((c) => c.id === pc.id) && after.roadmap?.[0]?.slide.id === land.id && after.packs[0]?.ready === true);
    await p.goto(`${WEB}/paketler/${pid}`, { waitUntil: "networkidle0" });
    await p.evaluate(() => document.querySelector('button[title="Paketi sil"]')?.click());
    ok("paket silinir; sırası paketsiz kalır", !!(await until(async () => !(await api("GET", "/api/packs")).body.some((x) => x.id === pid)))
       && (await api("GET", "/api/roadmap")).body.slides.find((x) => x.id === land.id)?.pack === null);
    await api("DELETE", `/api/roadmap/slides/${land.id}`);
    await p.close();
  }

  console.log("\nMaskotlar · yürüyüş, yeni maskot, set, eşleme, ölçü, yayın, telefonda okuma");
  {
    const shot = async (p, name) => { if (process.env.E2E_SHOTS) await p.screenshot({ path: path.join(process.env.E2E_SHOTS, `${name}.png`), fullPage: true }); };
    const { build } = await import(path.join(APP_DIR, "node_modules/esbuild/lib/main.js"));
    const dir = mkdtempSync(path.join(tmpdir(), "loplop-mascot-"));
    const entry = path.join(dir, "entry.ts");
    writeFileSync(entry, `export { readManifest } from "${APP_DIR}/src/core/remote";\n`);
    await build({ entryPoints: [entry], bundle: true, platform: "node", format: "esm", outfile: path.join(dir, "app.mjs"), logLevel: "silent",
                  alias: { "react-native": path.join(APP_DIR, "tools/loadcheck/rn.js") } });
    const app = await import(path.join(dir, "app.mjs"));
    /* an emotions set: the bunny's drawing with markers of its own */
    const bunny = JSON.parse(readFileSync(path.join(APP_DIR, "src/assets/bunny_states.json"), "utf8"));
    const tk = bunny.markers.find((x) => x.cm === "tickle");
    const feelFile = path.join(dir, "duygular.json");
    writeFileSync(feelFile, JSON.stringify({ ...bunny, markers: [{ cm: "sevinme_2", tm: tk.tm, dr: tk.dr }, { cm: "aglama", tm: 150, dr: 120 }] }));

    const p = await tab();
    await p.goto(`${WEB}/maskotlar`, { waitUntil: "networkidle0" });
    ok("sol menüde Maskotlar; iki rol, uygulamanın kendi maskotları", !!(await until(async () => {
      const t = await text(p); return /Maskotlar/.test(t) && /Öğrenen/.test(t) && /Arkadaş/.test(t) && /Lili/.test(t) && /Kuki/.test(t); })));
    ok("uygulamanın tavşanı önizlemede oynuyor (Lottie çizdi)", !!(await until(async () => p.evaluate(() => document.querySelectorAll("svg g path").length > 20))));
    await shot(p, "maskot-1-liste");
    await p.evaluate(() => {
      const field = [...document.querySelectorAll("label")].find((l) => l.textContent.startsWith("Haritada"));
      [...(field?.querySelectorAll("[role=radio]") ?? [])].find((b) => b.textContent.startsWith("Sekerek"))?.click();
    });
    ok("yürüyüş: haritada sekerek seçilir", !!(await until(async () => (await api("GET", "/api/mascots")).body.travel.map === "walk")));
    await api("PUT", "/api/mascots/travel", { map: "stroll", scene: "walk" });

    /* ── the gallery: two tabs, every animation, replace one ── */
    const single = path.join(dir, "tek-sevinme.json");
    writeFileSync(single, JSON.stringify({ ...bunny, ip: 0, op: 90, markers: [] }));
    const walkFile = path.join(dir, "yurume.json");
    writeFileSync(walkFile, JSON.stringify(bunny));
    const learnerKeys = (await api("GET", "/api/mascots")).body.roles.find((r) => r.role === "learner").behaviours.map((b) => b.key);
    ok("öğrenen sekmesinde her animasyonun kartı (sevinme, sahneler, yürüyüşler)", !!(await until(async () => {
      const t = await text(p); return learnerKeys.every((k) => t.includes(k)); })), `${learnerKeys.length} animasyon`);
    ok("kartların küçük resimleri çizildi", !!(await until(async () => p.evaluate(() =>
      [...document.querySelectorAll("img")].filter((i) => i.src.startsWith("data:image/png") && i.naturalWidth > 0).length >= 20), 20000)));
    await shot(p, "maskot-0-galeri");
    const tabClick = async (t) => { for (const h of await p.$$("[role=tab]")) if ((await h.evaluate((e) => e.textContent)).includes(t)) { await h.click(); return; } };
    await tabClick("Arkadaş");
    ok("arkadaş sekmesi: Kuki'nin hareketleri ve konuşması", !!(await until(async () => /rol=friend/.test(p.url()) && /act_jump/.test(await text(p)) && /talk/.test(await text(p)))));
    await tabClick("Öğrenen");
    await until(async () => /ear_wiggle/.test(await text(p)));
    const openReplace = async (label) => {
      await clickText(p, label, "button");
      await until(async () => p.evaluate((l) => document.querySelector("aside")?.textContent?.includes(l), label));
      await until(async () => { try { await clickText(p, "Değiştir", "aside button"); return true; } catch { return false; } });
      return until(async () => p.$("[role=dialog] input[type=file]"));
    };
    const mine = async () => (await api("GET", "/api/mascots")).body.list.find((m) => m.role === "learner" && m.name === "Lili");
    await (await openReplace("Sevinme (gülme)")).uploadFile(single);
    await until(async () => p.evaluate(() => [...document.querySelectorAll("[role=dialog] button")].some((b) => b.textContent.includes("Yerine koy") && !b.disabled)), 15000);
    await clickText(p, "Yerine koy", "[role=dialog] button");
    const w1 = await until(async () => { const m = await mine(); return m?.map.tickle?.[0]?.marker === "*" ? m : null; }, 15000);
    ok("Değiştir: tek animasyonluk dosya sevinmenin yerine (uygulamanın Lili'sinin kopyası, taslak)", !!w1 && w1.status === "draft"
       && w1.base === "app-mascot-learner" && w1.sets.some((s) => s.id === w1.map.tickle[0].set));
    await until(async () => !(await p.$("[role=dialog]")));
    await (await openReplace("Sevinme (gülme)")).uploadFile(single);
    await until(async () => p.evaluate(() => [...document.querySelectorAll("[role=dialog] button")].some((b) => b.textContent.includes("Varyant olarak ekle") && !b.disabled)), 15000);
    await clickText(p, "Varyant olarak ekle", "[role=dialog] button");
    ok("varyant eklenir", !!(await until(async () => (await mine())?.map.tickle?.length === 2, 15000)));
    await until(async () => !(await p.$("[role=dialog]")));
    await shot(p, "maskot-0b-degisti");
    await until(async () => { try { await clickText(p, "Uygulamaya koy"); return true; } catch { return false; } });
    ok("uygulamaya konur; taslak yayında maskot olarak gider", !!(await until(async () => (await mine())?.status === "live"))
       && (await api("GET", "/api/releases/draft")).body.manifest.mascots?.list?.[0]?.map?.tickle?.length === 2);
    await until(async () => { try { await clickText(p, "Uygulamanınkine dön", "aside button"); return true; } catch { return false; } });
    ok("uygulamanınkine dönünce eşleme ve artık set kalkar", !!(await until(async () => {
      const m = await mine(); return m && !m.map.tickle && !m.sets.some((s) => s.id.startsWith("anim-tickle")); })));
    await (await openReplace("stroll_r")).uploadFile(walkFile);
    await until(async () => p.evaluate(() => [...document.querySelectorAll("[role=dialog] button")].some((b) => b.textContent.includes("Yerine koy") && !b.disabled)), 15000);
    await clickText(p, "Yerine koy", "[role=dialog] button");
    ok("yürüme seti değişir (altı parça birlikte, uzunluklar denetli)", !!(await until(async () => !!(await mine())?.strollSet, 15000)));
    await until(async () => !(await p.$("[role=dialog]")));
    await api("DELETE", `/api/mascots/${(await mine()).id}`);
    await p.goto(`${WEB}/maskotlar`, { waitUntil: "networkidle0" });

    await clickText(p, "Yeni maskot");
    await until(async () => p.evaluate(() => !!document.querySelector("[role=dialog] input")));
    await typeInto(p, "[role=dialog] input", "Ayı");
    await clickText(p, "dosyası (yalnız", "[role=dialog] [role=radio]");
    await clickText(p, "Oluştur", "[role=dialog] button");
    const mid = await until(async () => /\/maskotlar\/([a-z0-9-]+)$/.exec(p.url())?.[1]);
    ok("maskot oluşur, sihirbaz açılır; ad ekleriyle", !!mid && !!(await until(async () => /Ayı'ya/.test(await text(p)))), p.url());

    await clickText(p, "Devam: Dosyalar ve setler");
    await until(async () => /Set ekle/.test(await text(p)));
    await clickText(p, "Set ekle");
    await until(async () => (await api("GET", "/api/mascots")).body.list.find((x) => x.id === mid)?.sets.length === 1);
    const inputs = await until(async () => { const xs = await p.$$("input[type=file]"); return xs.length >= 3 ? xs : null; });
    await inputs[inputs.length - 1].uploadFile(feelFile);
    ok("set dosyası yüklenir, işaretçileri listelenir", !!(await until(async () => {
      const m = (await api("GET", "/api/mascots")).body.list.find((x) => x.id === mid);
      return m?.sets[0]?.asset && m.files[m.sets[0].id]?.some((x) => x.name === "aglama");
    }, 15000)) && !!(await until(async () => /aglama/.test(await text(p)))));

    await clickText(p, "Devam: Davranışlar");
    await until(async () => /Sevinme \(gülme\)/.test(await text(p)));
    await p.evaluate(() => {
      const row = [...document.querySelectorAll("div.rounded-lg.border")].find((d) => d.textContent.includes("Sevinme (gülme)"));
      const sel = row?.querySelector("select");
      const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set;
      set.call(sel, "set-1|sevinme_2"); sel.dispatchEvent(new Event("change", { bubbles: true }));
    });
    ok("davranış: sevinme duygular setinden", !!(await until(async () =>
      (await api("GET", "/api/mascots")).body.list.find((x) => x.id === mid)?.map.tickle?.[0]?.marker === "sevinme_2")));
    await shot(p, "maskot-2-davranis");

    await clickText(p, "Devam: Duruş");
    await until(async () => /Ölç ve kaydet/.test(await text(p)));
    await until(async () => p.evaluate(() => [...document.querySelectorAll("button")].some((b) => b.textContent.includes("Ölç ve kaydet") && !b.disabled)), 10000);
    await clickText(p, "Ölç ve kaydet");
    const foot = await until(async () => (await api("GET", "/api/mascots")).body.list.find((x) => x.id === mid)?.report?.rest, 15000);
    ok("ölçü: ayak çizgisi ve baş uygulamanın kendi ölçüsüne yakın (aynı çizim)", !!foot && Math.abs(foot.y - 451 / 512) < 0.02
       && Math.abs(foot.top - 85 / 512) < 0.03 && Math.abs(foot.x - 242 / 512) < 0.04, JSON.stringify(foot));
    await shot(p, "maskot-3-durus");

    await clickText(p, "Devam: Adı geçen satırlar");
    ok("adı geçen satırlar yeni adla", !!(await until(async () => /Ayı'nın karnı doydu/.test(await text(p)))));
    await clickText(p, "Devam: Kontrol ve yayın");
    await until(async () => /Uygulamada mı/.test(await text(p)));
    await clickText(p, "Uygulamada", "[role=radio]");
    ok("maskot uygulamaya konur", !!(await until(async () => (await api("GET", "/api/mascots")).body.list.find((x) => x.id === mid)?.status === "live")));
    const rel = await api("POST", "/api/releases", { note: "maskot", channels: ["test"] });
    ok("yayınlanır", rel.status === 201, JSON.stringify(rel.body).slice(0, 300));
    const m = await (await fetch(`${API}/api/app/manifest?build=1&schema=1&channel=test`)).json();
    const r = app.readManifest(m, (id) => (m.assets[id] ? `file:///r/${id}` : null));
    const mm = r.mascots?.list?.[0];
    ok("telefon maskotu okur: adı, dosyaları, eşlemesi, ayakları", mm?.name === "Ayı" && mm.role === "learner" && mm.base.startsWith("file:///r/")
       && mm.sets[0]?.file.startsWith("file:///r/") && mm.map.tickle?.[0]?.marker === "sevinme_2" && !!mm.foot, JSON.stringify(mm).slice(0, 300));
    await p.evaluate(() => document.querySelector('button[title="Maskotu sil"]')?.click());
    ok("maskot silinir", !!(await until(async () => !(await api("GET", "/api/mascots")).body.list.some((x) => x.id === mid))));
    await p.close();
  }

  console.log("\nYeni oyun · arayüzden: motor, ad, set, uygulamaya koy, yayınla, telefonda oku, gizle, sil");
  {
    const shot = async (p, name) => { if (process.env.E2E_SHOTS) await p.screenshot({ path: path.join(process.env.E2E_SHOTS, `${name}.png`), fullPage: true }); };
    const { build } = await import(path.join(APP_DIR, "node_modules/esbuild/lib/main.js"));
    const dir = mkdtempSync(path.join(tmpdir(), "loplop-newgame-"));
    writeFileSync(path.join(dir, "entry.ts"), `export { readManifest } from "${APP_DIR}/src/core/remote";\n`);
    await build({ entryPoints: [path.join(dir, "entry.ts")], bundle: true, platform: "node", format: "esm", outfile: path.join(dir, "app.mjs"),
                  logLevel: "silent", alias: { "react-native": path.join(APP_DIR, "tools/loadcheck/rn.js") } });
    const app = await import(path.join(dir, "app.mjs"));
    /* three new words with pictures, one without */
    const png = (f) => readFileSync(path.join(APP_DIR, "src/assets/icons", f));
    const pics = await Promise.all(["apple.png", "milk.png", "egg.png"].map((f, i) => upload(png(f), `deniz-${i}.png`, "image/png")));
    const words = [["fish", "fish", "balık"], ["crab", "crab", "yengeç"], ["starfish", "starfish", "deniz yıldızı"]];
    for (const [i, [id, en, tr]] of words.entries())
      await api("POST", "/api/words", { id, en, tr, about: `${tr} denizde yaşar.`, icon: pics[i].id });
    await api("POST", "/api/words", { id: "seashell", en: "shell", tr: "deniz kabuğu" });
    const sea = (await api("POST", "/api/sets", { name: "Deniz canlıları", words: ["fish", "crab", "starfish"] })).body;
    const bare = (await api("POST", "/api/sets", { name: "Resimsiz deniz", words: ["fish", "seashell"] })).body;

    const p = await tab();
    await p.goto(`${WEB}/oyunlar/yeni`, { waitUntil: "networkidle0" });
    const t0 = await until(async () => { const t = await text(p); return /Hangi oyundan/.test(t) ? t : null; });
    ok("yalnız açık motorlar: Lili'ye ver ve Bul bakalım; kapalı motor yok", !!t0 && /Lili'ye ver/.test(t0) && /Bul bakalım/.test(t0)
       && !/Hayvan treni/.test(t0));
    ok("Bul bakalım için uyarı: tek başına yayınlanamaz", /tek başına yayınlanamaz/.test(t0 ?? ""));
    await clickText(p, "Lili'ye ver", "button");
    await until(async () => p.$('input[placeholder="ör. Deniz sepeti"]'));
    await typeInto(p, 'input[placeholder="ör. Deniz sepeti"]', "Deniz sepeti");
    const disabled = () => p.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent.includes("Oyunu oluştur"))?.disabled);
    ok("set seçilmeden oluşturulamaz", await disabled() === true && /Kelime seti gerekli/.test(await text(p)));
    const pick = (id) => p.evaluate((id) => { const s = [...document.querySelectorAll("select")].find((x) => [...x.options].some((o) => o.value === id));
      const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set; set.call(s, id); s.dispatchEvent(new Event("change", { bubbles: true })); }, id);
    await pick(bare.id);
    ok("resimsiz kelimeli set: kırmızı uyarı", !!(await until(async () => /1 kelimenin resmi yok/.test(await text(p)))));
    await pick(sea.id);
    await until(async () => /yengeç/.test(await text(p)));
    await p.evaluate(() => document.querySelector("[role=checkbox]")?.click());
    await shot(p, "oyun-1-yeni");
    await clickText(p, "Oyunu oluştur");
    const gid = await until(async () => { const m = /\/oyunlar\/([a-z0-9-]+)$/.exec(p.url())?.[1]; return m && m !== "yeni" ? m : null; });
    const g = gid ? (await api("GET", "/api/games")).body.find((x) => x.id === gid) : null;
    ok("oyun oluşur, uygulamada, doğru motor ve set", !!g && g.template === "drag" && g.status === "live" && g.set === sea.id && !g.builtin,
       g ? JSON.stringify(g).slice(0, 200) : `${p.url()} · ${await p.evaluate(() => [...document.querySelectorAll(".text-destructive, .text-muted-foreground.ml-auto")].map((e) => e.textContent).join(" | "))} · ${await p.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent.includes("Oyunu oluştur"))?.disabled)} · ${JSON.stringify((await api("GET", "/api/games")).body.filter((x) => !x.builtin).map((x) => [x.id, x.status]))}`);

    /* decision 2: the practice engine is never on its own in a release */
    await p.goto(`${WEB}/oyunlar/yeni`, { waitUntil: "networkidle0" });
    await until(async () => /Hangi oyundan/.test(await text(p)));
    await clickText(p, "Bul bakalım", "button");
    await until(async () => p.$('input[placeholder="ör. Deniz sepeti"]'));
    await typeInto(p, 'input[placeholder="ör. Deniz sepeti"]', "Denizde bul");
    await pick(sea.id);
    ok("tek başına Bul bakalım: 'yayına girsin' kapalı ve sebebi yazılı", await p.evaluate(() => document.querySelector("[role=checkbox]")?.disabled === true)
       && /tek başına yayına giremez/.test(await text(p)));
    await clickText(p, "Oyunu oluştur");
    await until(async () => { const m = /\/oyunlar\/([a-z0-9-]+)$/.exec(p.url())?.[1]; return m && m !== "yeni"; });
    const popG = (await api("GET", "/api/games")).body.find((x) => x.name === "Denizde bul");
    const forced = popG ? await api("PATCH", `/api/games/${popG.id}`, { status: "live" }) : null;
    ok("taslak olarak oluşur, tek kopya; sunucu da canlı yapmayı reddeder", popG?.status === "draft"
       && (await api("GET", "/api/games")).body.filter((x) => x.name === "Denizde bul").length === 1
       && forced?.status === 400 && /tanıtmaz/.test(forced.body.error), JSON.stringify(forced?.body)?.slice(0, 160));

    const d = await api("GET", "/api/releases/draft");
    ok("taslak yayında yeni oyun ve üç yeni kelimesi, resimleriyle", d.body.manifest.games.some((x) => x.id === gid)
       && ["fish", "crab", "starfish"].every((w) => d.body.manifest.words.find((x) => x.id === w)?.icon)
       && !d.body.manifest.games.some((x) => x.id === popG?.id));
    const rel = await api("POST", "/api/releases", { note: "yeni oyun", channels: ["test"] });
    ok("yayınlanır", rel.status === 201);
    const m = await (await fetch(`${API}/api/app/manifest?build=1&schema=1&channel=test`)).json();
    const r = app.readManifest(m, (id) => (m.assets[id] ? `file:///r/${id}` : null));
    const pg = r.games.find((x) => x.id === gid);
    ok("telefon oyunu okur: adı, motoru, üç kelime, resimleri dosya", pg?.name === "Deniz sepeti" && pg.template === "drag"
       && pg.words.length === 3 && pg.words.every((w) => w.icon?.startsWith("file:///r/")), JSON.stringify(pg)?.slice(0, 200));

    await p.goto(`${WEB}/oyunlar/${gid}`, { waitUntil: "networkidle0" });
    await until(async () => /Deniz sepeti/.test(await text(p)));
    await p.evaluate(() => { const s = [...document.querySelectorAll("select")].find((x) => [...x.options].some((o) => o.value === "hidden"));
      const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set; set.call(s, "hidden"); s.dispatchEvent(new Event("change", { bubbles: true })); });
    await until(async () => { try { await clickText(p, "Kaydet"); return true; } catch { return false; } });
    ok("gizlenir", !!(await until(async () => (await api("GET", "/api/games")).body.find((x) => x.id === gid)?.status === "hidden", 8000)));
    ok("gizli oyun taslak yayında yok", !(await api("GET", "/api/releases/draft")).body.manifest.games.some((x) => x.id === gid));
    await clickText(p, "Sil");
    ok("silinir", !!(await until(async () => !(await api("GET", "/api/games")).body.some((x) => x.id === gid), 8000)));
    if (popG) await api("DELETE", `/api/games/${popG.id}`);
    await p.close();
  }

  console.log("\nMüzik · durak, konu, yapay zekâ sözleri, tarz, Suno, dosya, lisans kapısı, yayın, telefon");
  {
    const shot = async (p, name) => { if (process.env.E2E_SHOTS) await p.screenshot({ path: path.join(process.env.E2E_SHOTS, `${name}.png`), fullPage: true }); };
    const { build } = await import(path.join(APP_DIR, "node_modules/esbuild/lib/main.js"));
    const dir = mkdtempSync(path.join(tmpdir(), "loplop-music-"));
    writeFileSync(path.join(dir, "entry.ts"), `export { readManifest } from "${APP_DIR}/src/core/remote";\n`);
    await build({ entryPoints: [path.join(dir, "entry.ts")], bundle: true, platform: "node", format: "esm", outfile: path.join(dir, "app.mjs"),
                  logLevel: "silent", alias: { "react-native": path.join(APP_DIR, "tools/loadcheck/rn.js") } });
    const app = await import(path.join(dir, "app.mjs"));
    const mp3 = path.join(dir, "mutfak-v1.mp3");
    writeFileSync(mp3, Buffer.from("ID3" + "suno-mutfak-sarkisi-".repeat(20)));
    await api("PUT", "/api/settings/keys", { name: "anthropic", value: "fake-anthropic-key" });

    const p = await tab();
    /* the AI providers are faked in the page; the server's calls are tested in its own units */
    await p.setRequestInterception(true);
    let wrote = 0;
    p.on("request", (r) => {
      const u = r.url();
      if (u.includes("/api/ai/text-models/anthropic")) return r.respond({ status: 200, contentType: "application/json", body: JSON.stringify({ models: ["claude-opus-5-5", "claude-sonnet-5-5"] }) });
      if (/\/api\/songs\/[^/]+\/lyrics$/.test(u) && r.method() === "POST") {
        wrote++;
        return r.respond({ status: 200, contentType: "application/json", body: JSON.stringify({ draft: { jobId: "x", provider: "anthropic", model: JSON.parse(r.postData()).model,
          title: "Yummy Kitchen", lyrics: "[Chorus]\nBanana, banana! Apple, apple!", style: "kids pop, 115 bpm", at: Date.now() }, job: {} }) });
      }
      r.continue();
    });
    await p.goto(`${WEB}/muzik`, { waitUntil: "networkidle0" });
    const t0 = await until(async () => { const t = await text(p); return /Mutfak · müzik/.test(t) ? t : null; });
    ok("sol menüde Müzik; uygulamanın altı müzik durağı, şarkısız", !!t0 && /Hareketler · müzik/.test(t0) && (t0.match(/şarkı yok/g) ?? []).length >= 6);
    await shot(p, "muzik-1-liste");
    await clickText(p, "Şarkı yap");
    const sid = await until(async () => /\/muzik\/([a-z0-9-]+)$/.exec(p.url())?.[1]);
    ok("şarkı oluşur, sihirbaz açılır; kelimeler durağın kelimeleri", !!sid && !!(await until(async () => /banana/.test(await text(p)))));
    const song = async () => (await api("GET", "/api/songs")).body.songs.find((x) => x.id === sid);
    await clickText(p, "cheese", "button");
    ok("konu: kelime çıkarılır (kendiliğinden kaydedilir)", !!(await until(async () => !(await song())?.brief.words.includes("cheese"))));
    await clickText(p, "Devam: Sözler");
    await until(async () => /Yapay zekâya yazdır/.test(await text(p)));
    await until(async () => p.evaluate(() => [...document.querySelectorAll("option")].some((o) => o.value === "claude-opus-5-5")));
    await clickText(p, "Claude ile sözleri yaz");
    ok("Claude ile yazdırılır, seçilen model gider; taslak gelir, boş metne yerleşir", !!(await until(async () => wrote === 1))
       && !!(await until(async () => p.evaluate(() => document.querySelector('textarea[aria-label="Şarkı sözleri"]')?.value.includes("Banana, banana!")))));
    await typeInto(p, 'textarea[aria-label="Şarkı sözleri"]', "[Verse 1]\nBanana, banana, yellow banana\nApple, apple, red apple\n[Chorus]\nBread and milk, bread and milk\nWater, water, egg and egg\nBanana! Apple! Bread! Milk!");
    ok("sözler kaydedilir; her kelimenin sayısı görünür", !!(await until(async () => (await song())?.lyrics.includes("yellow banana")))
       && /banana ×4/.test(await text(p)));
    await shot(p, "muzik-2-sozler");
    await clickText(p, "Devam: Ses ve tarz");
    await until(async () => /Style of Music/.test(await text(p)));
    await clickText(p, "Çocuk korosu", "[role=radio]");
    await clickText(p, "Hızlı", "[role=radio]");
    ok("tarz: çocuk korosu, hızlı → Suno metni", !!(await until(async () => { const s = await song(); return s?.style.voice === "kids" && s.style.tempo === "fast"; }))
       && await p.evaluate(() => document.querySelector('textarea[aria-label="Tarz metni"]')?.value.includes("children's choir vocals")));
    await clickText(p, "Devam: Üret");
    await until(async () => /suno\.com\/create/.test(await text(p)));
    ok("Suno'ya hazır: sözler, tarz, başlık kopyalama düğmeleri ve suno.com bağlantısı",
       ["Sözleri kopyala", "Tarzı kopyala", "Başlığı kopyala"].every((x) => t0 !== null) && /Sözleri kopyala/.test(await text(p))
       && await p.evaluate(() => !!document.querySelector('a[href="https://suno.com/create"]')));
    const fileInput = await p.$('input[type=file][accept*="audio"]');
    await fileInput.uploadFile(mp3);
    ok("Suno'nun MP3'ü yüklenir, deneme olarak seçilir", !!(await until(async () => { const s = await song(); return s?.takes.length === 1 && s.chosen === s.takes[0].asset && s.takes[0].source === "suno-web"; }, 15000)));
    await shot(p, "muzik-3-uret");
    await clickText(p, "Devam: Lisans ve yayın");
    await until(async () => /Nereden geldi/.test(await text(p)));
    await clickText(p, "Ücretsiz (Basic)", "button");
    await until(async () => (await song())?.license.plan === "free");
    await clickText(p, "Uygulamada", "[role=radio]");
    ok("ücretsiz plan: uygulamaya konamaz, sebebi ekranda", !!(await until(async () => /ücretsiz planıyla/.test(await text(p)))) && (await song()).status === "draft");
    await clickText(p, "Pro", "button");
    await until(async () => (await song())?.license.plan === "pro");
    await until(async () => { try { await clickText(p, "Uygulamada", "[role=radio]"); return (await song())?.status === "live"; } catch { return false; } }, 8000);
    ok("Pro planla uygulamaya konur", (await song())?.status === "live");
    await shot(p, "muzik-4-yayin");
    await p.goto(`${WEB}/yayinla`, { waitUntil: "networkidle0" });
    ok("Yayınla sayfası: taslakta şarkı sayılır ve değişiklik olarak görünür", !!(await until(async () => {
      const t = await text(p); return /şarkı/.test(t) && /kitchen-music/.test(t) ? t : null; }, 10000)));
    await shot(p, "muzik-6-yayinla");
    const rel = await api("POST", "/api/releases", { note: "müzik", channels: ["test"] });
    ok("yayınlanır", rel.status === 201, JSON.stringify(rel.body).slice(0, 200));
    const m = await (await fetch(`${API}/api/app/manifest?build=1&schema=1&channel=test`)).json();
    const r = app.readManifest(m, (id) => (m.assets[id] ? `file:///r/${id}` : null));
    ok("telefon şarkıyı okur: mutfağın müzik durağı, dosyası telefonda", r.songs?.some((x) => x.stop === "kitchen-music" && x.uri.startsWith("file:///r/")), JSON.stringify(r.songs));
    await p.goto(`${WEB}/muzik/${sid}`, { waitUntil: "networkidle0" });
    await until(async () => p.$('button[title="Şarkıyı sil"]'));
    await p.evaluate(() => document.querySelector('button[title="Şarkıyı sil"]')?.click());
    ok("şarkı silinir", !!(await until(async () => !(await song()))));

    /* a song already made: straight to a stop, no wizard */
    await p.goto(`${WEB}/muzik`, { waitUntil: "networkidle0" });
    await until(async () => /Hayvan Dostlarımız · müzik/.test(await text(p)));
    await p.evaluate(() => {
      const card = [...document.querySelectorAll("[data-slot=card]")].find((c) => c.textContent.includes("Hayvan Dostlarımız · müzik"));
      [...(card?.querySelectorAll("button") ?? [])].find((b) => b.textContent.includes("MP3 yükle"))?.click();
    });
    const quick = await until(async () => p.$("[role=dialog] input[type=file]"));
    await quick.uploadFile(mp3);
    await until(async () => /mutfak-v1\.mp3/.test(await text(p)));
    ok("hak onayı olmadan uygulamaya koyma düğmesi kapalı, sebebi yazılı", await p.evaluate(() =>
      [...document.querySelectorAll("[role=dialog] button")].find((b) => b.textContent.includes("Yükle"))?.disabled === true)
      && /kullanım hakkını onaylayın/.test(await text(p)));
    await p.evaluate(() => document.querySelector("[role=dialog] [role=checkbox]")?.click());
    await clickText(p, "Yükle ve uygulamaya koy", "[role=dialog] button");
    const animals = async () => (await api("GET", "/api/songs")).body.songs.find((x) => x.stop === "animals-music");
    const up = await until(async () => { const s = await animals(); return s?.status === "live" ? s : null; }, 15000);
    ok("doğrudan yüklenen şarkı uygulamada: başka kaynak, hak onaylı, seçili", !!up && up.takes[0]?.source === "upload"
       && up.license.confirmed && up.chosen === up.takes[0].asset && up.title === "Hayvan Dostlarımız şarkısı", JSON.stringify(up)?.slice(0, 200));
    ok("liste kartı: şarkı var", !!(await until(async () => p.evaluate(() =>
      [...document.querySelectorAll("[data-slot=card]")].find((c) => c.textContent.includes("Hayvan Dostlarımız · müzik"))?.textContent.includes("şarkı var")))));
    await shot(p, "muzik-5-dogrudan");
    if (up) await api("DELETE", `/api/songs/${up.id}`);
    await p.close();
  }

  console.log("\nF01/F06 · son tuştan hemen sonra adım ya da sayfa değişimi; çakışmada sunucudakini al");
  {
    /* set a field the way a person types: the native setter, then an input event */
    const setNth = (p, sel, n, v) => p.evaluate((sel, n, v) => {
      const el = document.querySelectorAll(sel)[n];
      const set = Object.getOwnPropertyDescriptor(el.constructor.prototype, "value").set;
      set.call(el, v); el.dispatchEvent(new Event("input", { bubbles: true }));
    }, sel, n, v);
    const packOf = async (id) => (await api("GET", "/api/packs")).body.find((x) => x.id === id);

    const pk = (await api("POST", "/api/packs", { title: "Hız paketi" })).body;
    const p = await tab();
    await p.goto(`${WEB}/paketler/${pk.id}`, { waitUntil: "networkidle0" });
    await until(() => p.evaluate(() => document.querySelectorAll("main input").length >= 2));
    await setNth(p, "main input", 1, "yazar yazmaz geçildi");
    await sleep(100);
    await clickText(p, "Devam:");
    const kept = await until(async () => (await packOf(pk.id))?.subtitle === "yazar yazmaz geçildi");
    ok("F01: paket bilgisi, son tuştan 100 ms sonra Devam'a basılınca da kaydedilir", !!kept, JSON.stringify((await packOf(pk.id))?.subtitle));

    /* the roadmap's row name, then straight to the publish page by the sidebar */
    const land = (await api("POST", "/api/roadmap/slides", { title: "Hız sırası" })).body;
    await p.goto(`${WEB}/yol-haritasi/${land.id}`, { waitUntil: "networkidle0" });
    await until(() => p.evaluate(() => !!document.querySelector("input[aria-label='Sıranın adı']")));
    await typeInto(p, "input[aria-label='Sıranın adı']", "Hızlı ad");
    await sleep(100);
    await p.evaluate(() => [...document.querySelectorAll("a")].find((a) => a.getAttribute("href") === "/yayinla")?.click());
    const named = await until(async () => (await api("GET", "/api/roadmap")).body.slides.find((x) => x.id === land.id)?.title === "Hızlı ad");
    ok("F01: sıranın adı, 100 ms sonra Yayınla'ya geçilince de kaydedilir", !!named);
    const pub = await until(async () => { const t = await text(p); return /Yayınla/.test(t) ? t : null; });
    ok("F01: Yayınla sayfası bekleyen kaydı bekledi; 'kaydedilemedi' demiyor", !!pub && !/kaydedilemedi/.test(pub));

    /* F06: two tabs on one pack; the second takes the server's version and saves again */
    const a = await tab(), b = await tab();
    for (const t of [a, b]) {
      await t.goto(`${WEB}/paketler/${pk.id}`, { waitUntil: "networkidle0" });
      await until(() => t.evaluate(() => document.querySelectorAll("main input").length >= 2));
    }
    await setNth(a, "main input", 1, "A sekmesinden");
    await until(async () => (await packOf(pk.id))?.subtitle === "A sekmesinden");
    await setNth(b, "main textarea", 0, "B'nin notu");
    const stale = await until(async () => /başka bir yerde değişti/.test(await text(b)));
    ok("F06: ikinci sekme çakışmayı görür, değişikliği ekranda kalır", !!stale);
    await clickText(b, "Sunucudakini yükle");
    const fresh = await until(() => b.evaluate(() => document.querySelectorAll("main input")[1]?.value === "A sekmesinden"));
    ok("F06: sunucudakini yüklemek formu yeniler", !!fresh);
    await setNth(b, "main textarea", 0, "B yeniden");
    const saved = await until(async () => (await packOf(pk.id))?.note === "B yeniden");
    ok("F06: sonra yapılan değişiklik yeni taban sürümle kaydedilir (yeniden 409 yok)", !!saved && (await packOf(pk.id))?.subtitle === "A sekmesinden");
    for (const t of [a, b, p]) await t.close();
    await api("DELETE", `/api/roadmap/slides/${land.id}`);
    await api("DELETE", `/api/packs/${pk.id}`);
  }

  console.log("\nİnceleme 2 · kapanan sayfanın kaydı, geri tuşu, F08 F09 F10 F11");
  {
    const setNth = (p, sel, n, v) => p.evaluate((sel, n, v) => {
      const el = document.querySelectorAll(sel)[n];
      const set = Object.getOwnPropertyDescriptor(el.constructor.prototype, "value").set;
      set.call(el, v); el.dispatchEvent(new Event("input", { bubbles: true }));
    }, sel, n, v);
    const clickHref = (p, href) => p.evaluate((h) => [...document.querySelectorAll("a")].find((a) => a.getAttribute("href") === h)?.click(), href);
    const packOf = async (id) => (await api("GET", "/api/packs")).body.find((x) => x.id === id);

    /* 1 · a page closed while its save fails: the edit is kept, shown, waited for, retried */
    const pk = (await api("POST", "/api/packs", { title: "Kopuk paket" })).body;
    const p = await tab();
    await p.setRequestInterception(true);
    let failPacks = true;
    p.on("request", (r) => {
      if (failPacks && r.method() === "PATCH" && r.url().includes(`/api/packs/${pk.id}`))
        return r.respond({ status: 500, contentType: "application/json", body: '{"error":"sunucu hatası (test)"}' });
      r.continue();
    });
    await p.goto(`${WEB}/paketler/${pk.id}`, { waitUntil: "networkidle0" });
    await until(() => p.evaluate(() => document.querySelectorAll("main input").length >= 2));
    await setNth(p, "main input", 1, "kaybolmamalı");
    await sleep(100);
    await clickHref(p, "/paketler");
    const banner = await until(async () => /Kapanan bir sayfadaki düzenleme kaydedilemedi/.test(await text(p)));
    ok("kapanan sayfanın başarısız kaydı unutulmaz, üstte gösterilir", !!banner && /Kopuk paket/.test(await text(p)));
    await clickHref(p, "/yayinla");
    const held = await until(async () => /kaydedilemedi\. O sayfaya dönüp çözün|kaydedilemedi/.test(await text(p)) && /Yayın bu yüzden durduruldu/.test(await text(p)));
    ok("Yayınla bekleyen (başarısız) kaydı atlamaz", !!held);
    failPacks = false;
    await clickText(p, "Tekrar dene");
    const landed = await until(async () => (await packOf(pk.id))?.subtitle === "kaybolmamalı");
    ok("“Tekrar dene” kaydı gönderir; uyarı kalkar", !!landed && !!(await until(async () => !/Kapanan bir sayfadaki/.test(await text(p)))));
    p.removeAllListeners("request");
    await p.setRequestInterception(false);

    /* 3 · the game form: the browser's back button asks too */
    const gset = (await api("POST", "/api/sets", { name: "Geri seti", words: ["apple", "banana", "bread"] })).body;
    const g = (await api("POST", "/api/games", { template: "drag", name: "Geri oyunu", set: gset.id })).body;
    await p.goto(`${WEB}/oyunlar`, { waitUntil: "networkidle0" });
    await clickHref(p, `/oyunlar/${g.id}`);
    /* the form itself, not the list still on screen during the change of route */
    await until(() => p.evaluate(() => location.pathname.includes("/oyunlar/") && document.querySelectorAll("main input")[0]?.value === "Geri oyunu"));
    await setNth(p, "main input", 0, "Değişen ad");
    const asked = [];
    p.removeAllListeners("dialog");
    p.on("dialog", (d) => { asked.push(d.message()); d.dismiss(); });
    const was = await p.evaluate(() => `${location.pathname} değer=${document.querySelectorAll("main input")[0]?.value} kirli=${/Kaydedilmemiş değişiklik var/.test(document.body.innerText)}`);
    await p.evaluate(() => history.back());
    await sleep(800);
    ok("geri tuşu kaydedilmemiş oyun formunda sorar; vazgeçince sayfa ve değer kalır",
       asked.some((m) => /Kaydedilmemiş/.test(m)) && (await p.evaluate(() => location.pathname)).endsWith(`/oyunlar/${g.id}`)
       && (await p.evaluate(() => document.querySelectorAll("main input")[0]?.value)) === "Değişen ad",
       `önce ${was}, sonra ${await p.evaluate(() => location.pathname)}, soru: ${asked.join(" | ")}`);
    p.removeAllListeners("dialog");
    p.on("dialog", (d) => d.accept());
    await p.evaluate(() => history.back());
    ok("onaylanınca geri gider", !!(await until(async () => (await p.evaluate(() => location.pathname)) === "/oyunlar")));
    await api("DELETE", `/api/games/${g.id}`);

    /* F08 · no paid picture for the app's own words */
    const sets = (await api("GET", "/api/sets")).body;
    /* the kitchen: its words have bundled recordings (teacher/en_banana …) */
    const appSet = sets.find((x) => x.builtin && x.id === "kitchen") ?? sets.find((x) => x.builtin && x.words.length);
    await api("POST", "/api/words", { id: "kelp", en: "kelp", tr: "yosun", about: "Yosun denizde yaşar.", color: "#2A6FB0" });
    const mixed = (await api("POST", "/api/sets", { name: "Karışık set", words: ["apple", "kelp"] })).body;
    await p.setRequestInterception(true);
    let paid = 0;
    p.on("request", (r) => {
      if (r.url().includes("/api/ai/images")) { paid++; return r.respond({ status: 500, body: "{}" }); }
      if (r.url().includes("/api/settings/keys") && r.method() === "GET")
        return r.respond({ status: 200, contentType: "application/json", body: JSON.stringify({ elevenlabs: { set: false }, openai: { set: true }, gemini: { set: true } }) });
      r.continue();
    });
    await p.goto(`${WEB}/gorsel-studyosu?sekme=toplu`, { waitUntil: "networkidle0" });
    const pickSet = (id) => p.evaluate((id) => { const s = [...document.querySelectorAll("select")].find((x) => [...x.options].some((o) => o.value === id));
      const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set; set.call(s, id); s.dispatchEvent(new Event("change", { bubbles: true })); }, id);
    await pickSet(appSet.id);
    await sleep(300);
    const appState = await p.evaluate(() => { const b = [...document.querySelectorAll("button")].find((b) => /kelime için üret/.test(b.textContent)); return b ? `${b.textContent}|${b.disabled}` : ""; });
    ok("F08: hazır sette hiçbir kelime seçilmez, üret düğmesi kapalı", /^.*0 kelime için üret.*\|true$/.test(appState)
       && /uygulamanın kendi kelime/.test(await text(p)), `${JSON.stringify((await api("GET", "/api/words")).body.filter((w) => appSet.words.includes(w.id)).map((w) => [w.id, w.builtin, !!w.icon]))} ${appSet.id} [${appSet.words.join(",")}] ${appState} ${(await text(p)).match(/[^\n]*uygulamanın[^\n]*/)?.[0] ?? "uyarı yok"}`);
    await pickSet(mixed.id);
    await sleep(300);
    const mixState = await p.evaluate(() => { const b = [...document.querySelectorAll("button")].find((b) => /kelime için üret/.test(b.textContent)); return b?.textContent ?? ""; });
    ok("F08: karışık sette yalnız panelin kelimesi seçili (1)", /1 kelime için üret/.test(mixState) && paid === 0, mixState);
    p.removeAllListeners("request");
    await p.setRequestInterception(false);

    /* F09 · a recording in the app's bundle is not a gap */
    await p.goto(`${WEB}/kelime-setleri/${appSet.id}`, { waitUntil: "networkidle0" });
    const titles = await until(() => p.evaluate(() => [...document.querySelectorAll("span[title]")].map((x) => x.title).filter((t) => / — /.test(t))), 6000);
    /* the app's bundle carries no recordings since 2026-10-20 (the user: the
       first session's takes go); when it does, they are told apart */
    const bundled = ((await api("GET", "/api/inventory")).body?.clips ?? []).length > 0;
    ok("F09: paketteki kayıt 'uygulamanın paketinde', kaydı olmayan 'cihaz sesi' diye ayrılır",
       !!titles && (!bundled || titles.some((t) => /uygulamanın paketinde/.test(t))) && !titles.some((t) => /— eksik$/.test(t))
       && (bundled || titles.some((t) => /cihaz sesi/.test(t))),
       `${appSet.id}: ${(titles ?? []).slice(0, 3).join(" | ")}`);

    /* F10 · the song request's answer is lost, then "put it in the app" fails once */
    const stops = (await api("GET", "/api/songs")).body.stops;
    const st10 = stops[stops.length - 1];
    const before10 = (await api("GET", "/api/songs")).body.songs.filter((x) => x.stop === st10.id).length;
    const assetsBefore = (await api("GET", "/api/assets")).body.length;
    const mp3 = path.join(mkdtempSync(path.join(tmpdir(), "loplop-f10-")), "f10.mp3");
    writeFileSync(mp3, Buffer.from("ID3" + "f10-sarki-".repeat(40)));
    await p.setRequestInterception(true);
    let lostOnce = true, liveFails = 1;
    p.on("request", async (r) => {
      const u = r.url();
      if (lostOnce && r.method() === "POST" && /\/api\/songs$/.test(u)) {
        /* the server does it, the answer never comes back */
        lostOnce = false;
        await fetch(u, { method: "POST", headers: r.headers(), body: r.postData() });
        return r.respond({ status: 502, contentType: "application/json", body: '{"error":"bağlantı koptu (test)"}' });
      }
      if (liveFails > 0 && r.method() === "PATCH" && /\/api\/songs\//.test(u) && /"status":"live"/.test(r.postData() ?? "")) {
        liveFails--;
        return r.respond({ status: 500, contentType: "application/json", body: '{"error":"doğrulama düştü (test)"}' });
      }
      r.continue();
    });
    await p.goto(`${WEB}/muzik`, { waitUntil: "networkidle0" });
    await p.evaluate((title) => {
      const card = [...document.querySelectorAll("li, div")].filter((x) => x.textContent.includes(title) && [...x.querySelectorAll("button")].some((b) => /MP3 yükle/.test(b.textContent)))
        .sort((a, b) => a.textContent.length - b.textContent.length)[0];
      [...card.querySelectorAll("button")].find((b) => /MP3 yükle/.test(b.textContent)).click();
    }, st10.title);
    await until(() => p.evaluate(() => !!document.querySelector("[role=dialog] input[type=file]")));
    await (await p.$("[role=dialog] input[type=file]")).uploadFile(mp3);
    await p.evaluate(() => [...document.querySelectorAll("[role=dialog] label")].find((l) => /ticari bir çocuk uygulamasında/.test(l.textContent))?.querySelector("button")?.click());
    await sleep(300);
    const goBtn = () => p.evaluate(() => [...document.querySelectorAll("[role=dialog] button")].find((b) => /Yükle|tekrar dene/i.test(b.textContent) && !b.disabled)?.click());
    await goBtn();
    await until(async () => /bağlantı koptu/.test(await text(p)));
    await goBtn();
    await until(async () => /uygulamaya konamadı/.test(await text(p)));
    ok("F10: kısmi hatada düğme yalnız kalan adımı dener, 'Taslağı aç' var",
       /Yalnız uygulamaya koymayı tekrar dene/.test(await text(p)) && /Taslağı aç/.test(await text(p)));
    await goBtn();
    await until(async () => !(await p.evaluate(() => !!document.querySelector("[role=dialog] input[type=file]"))), 6000);
    const after10 = (await api("GET", "/api/songs")).body.songs.filter((x) => x.stop === st10.id);
    const assetsAfter = (await api("GET", "/api/assets")).body.length;
    ok("F10: yanıt kaybı + başarısız yayın + iki tekrar = tek şarkı, tek dosya, uygulamada",
       after10.length === before10 + 1 && assetsAfter === assetsBefore + 1 && after10.some((x) => x.status === "live" && x.takes.length === 1),
       `${before10}→${after10.length} şarkı, ${assetsBefore}→${assetsAfter} dosya, ${after10.map((x) => x.status).join(",")}`);
    for (const x of after10) await api("DELETE", `/api/songs/${x.id}`);
    p.removeAllListeners("request");
    await p.setRequestInterception(false);

    /* F11 · speed is part of the request: a change is a new variant, the same request is not paid twice */
    const take = await upload(Buffer.from("ID3-f11-" + "z".repeat(80)), "f11.mp3", "audio/mpeg");
    await p.setRequestInterception(true);
    const said = [];
    p.on("request", (r) => {
      const u = r.url();
      if (u.includes("/api/ai/eleven/credits")) return r.respond({ status: 200, contentType: "application/json", body: '{"used":0,"limit":1000000}' });
      if (u.includes("/api/ai/eleven/voices")) return r.respond({ status: 200, contentType: "application/json", body: '[{"voice_id":"voice-x","name":"X"}]' });
      if (u.includes("/api/settings/keys") && r.method() === "GET")
        return r.respond({ status: 200, contentType: "application/json", body: JSON.stringify({ elevenlabs: { set: true }, openai: { set: false }, gemini: { set: false } }) });
      if (u.includes("/api/ai/eleven/tts")) { said.push(JSON.parse(r.postData())); return r.respond({ status: 200, contentType: "application/json", body: JSON.stringify({ ...take, jobId: "j" }) }); }
      r.continue();
    });
    await p.goto(`${WEB}/ses-studyosu?sekme=atolye`, { waitUntil: "networkidle0" });
    const box = `[...document.querySelectorAll("textarea")].find((t) => t.placeholder.startsWith("selam_ogretmen"))`;
    const fill = (v) => p.evaluate((pick, v) => { const el = eval(pick); const set = Object.getOwnPropertyDescriptor(el.constructor.prototype, "value").set;
      set.call(el, v); el.dispatchEvent(new Event("input", { bubbles: true })); }, box, v);
    await fill("hiz_testi, sakin, Merhaba çocuklar.");
    await clickText(p, "Hepsini üret");
    await until(() => said.length >= 1);
    const db = async () => (await api("GET", "/api/db")).body.db;
    const first = await until(async () => (await db()).workshop?.find((w) => w.name === "hiz_testi"));
    ok("F11: kayıt isteğin parmak izini, hızı ve kararlılığı saklar", !!first?.fp && first.speed === 1 && first.stability === 0.5, JSON.stringify(first ?? {}).slice(0, 160));
    await fill("hiz_testi, sakin, Merhaba çocuklar. ");
    await fill("hiz_testi, sakin, Merhaba çocuklar.");
    await sleep(300);
    ok("F11: aynı istek yeniden ücretlenmez (0 üretilecek)", /0 üretilecek/.test(await text(p)));
    await p.evaluate(() => { const t = [...document.querySelectorAll("[role=slider]")].find((x) => x.closest(".space-y-2\\.5")?.textContent.startsWith("Hız")); t?.focus(); });
    await p.keyboard.press("ArrowRight");
    await sleep(300);
    ok("F11: yalnız hız değişince aynı sayılmaz, varyant önerilir", /1 üretilecek/.test(await text(p)) && /yeni varyant/.test(await text(p)));
    await clickText(p, "Farklı ayarlıları yeni varyant olarak üret");
    await until(() => said.length >= 2);
    const v2 = await until(async () => (await db()).workshop?.find((w) => w.name === "hiz_testi_v2"));
    ok("F11: varyant yeni adla ve yeni hızla üretilir", !!v2 && said[1]?.voice_settings?.speed > 1 && v2.fp !== first.fp,
       `${said[1]?.voice_settings?.speed} ${v2?.name}`);
    p.removeAllListeners("request");
    await p.setRequestInterception(false);
    await p.close();
    await api("DELETE", `/api/packs/${pk.id}`);
  }

  console.log("\nSüzgeçler · sekme, sayfa ve yenileme değişse de seçim kalır (2026-10-20)");
  {
    const p = await tab();
    /* the select that offers `has` among its options */
    const pick = (has, v) => p.evaluate((t, v) => {
      const sel = [...document.querySelectorAll("select")].find((x) => [...x.options].some((o) => o.textContent.trim() === t));
      const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set;
      set.call(sel, v); sel.dispatchEvent(new Event("change", { bubbles: true }));
    }, has, v);
    const valueOf = (has) => p.evaluate((t) =>
      [...document.querySelectorAll("select")].find((x) => [...x.options].some((o) => o.textContent.trim() === t))?.value ?? null, has);
    const firstCategory = () => p.evaluate(() => {
      const sel = [...document.querySelectorAll("select")].find((x) => [...x.options].some((o) => o.textContent.trim() === "Bütün kategoriler"));
      return [...(sel?.options ?? [])].map((o) => o.value).find((v) => v && v !== "-") ?? null;
    });
    await p.goto(`${WEB}/ses-studyosu`, { waitUntil: "networkidle0" });
    const c = await until(firstCategory);
    await pick("Bütün kategoriler", c);
    await pick("Herkes", "teacher");
    await pick("Her durum", "missing");
    const same = async () => (await valueOf("Bütün kategoriler")) === c && (await valueOf("Herkes")) === "teacher" && (await valueOf("Her durum")) === "missing";
    ok("Föy: kategori, konuşmacı, durum seçildi", !!(await until(same, 3000)));
    await clickText(p, "Atölye"); await clickText(p, "Föy");
    ok("başka sekmeye gidip dönünce seçimler duruyor", !!(await until(same, 3000)));
    await clickText(p, "Kelime kütüphanesi", "a");
    await until(async () => /Kelime/.test(await text(p)));
    await clickText(p, "Ses stüdyosu", "a");
    ok("başka sayfaya gidip dönünce seçimler duruyor", !!(await until(same, 3000)));
    await p.reload({ waitUntil: "networkidle0" });
    ok("sayfa yenilenince de duruyor", !!(await until(same, 5000)));
    const fresh = await tab();
    await fresh.goto(`${WEB}/ses-studyosu`, { waitUntil: "networkidle0" });
    const freshCat = await fresh.evaluate(() =>
      [...document.querySelectorAll("select")].find((x) => [...x.options].some((o) => o.textContent.trim() === "Bütün kategoriler"))?.value ?? null);
    ok("yeni bir tarayıcı sekmesi varsayılanlarla açılır", freshCat === "", String(freshCat));
    await fresh.close(); await p.close();
  }

  console.log("\nMVP akışı · özel kategori → kelimeler → üç oyun → haritada bir sıra → test yayını → telefonda oynanır");
  {
    /* 1 · five new words, each with its picture */
    const pics = ["jump", "run", "sit", "wave", "clap"].map((n) => readFileSync(path.join(APP_DIR, `src/assets/actions/${n}.png`)));
    const W = [["octopus", "ahtapot"], ["whale", "balina"], ["seal", "fok"], ["shark", "köpekbalığı"], ["turtle", "kaplumbağa"]];
    for (const [i, [en, tr]] of W.entries()) {
      const icon = await upload(pics[i], `${en}.png`, "image/png");
      await api("POST", "/api/words", { id: en, en, tr, about: `${tr} denizde yaşar.`, icon: icon.id, color: "#2A6FB0" });
    }
    const set = (await api("POST", "/api/sets", { name: "Deniz hayvanları", words: W.map(([en]) => en) })).body;
    /* 2 · the category: its default flow is the series -- cards teach, find practises, drag measures */
    const cat = (await api("POST", "/api/categories", { title: "Deniz Hayvanları", set: set.id })).body;
    const games = cat.steps.filter((x) => x.kind === "game");
    ok("MVP: kategori üç oyunla açılır (öğretir · alıştırır · ölçer)", games.length === 3 && games[0].teach === true, games.map((g) => g.game).join(","));
    const live = await api("PATCH", `/api/categories/${cat.id}`, { status: "live" });
    ok("MVP: kategori hatasız ve uygulamada", live.status === 200 && !live.body.issues.some((i) => i.level === "error"),
       live.body.issues?.map((i) => i.text).join(" | "));
    /* 3 · one row of the drawn map: the category's three games as stops 1 · 2 · 3, no music stop */
    const land = (await api("POST", "/api/roadmap/slides", { title: "Deniz Kıyısı" })).body;
    const run3 = [["open", "game-1"], ["to-2", "game-2"], ["to-3", "game-3"]];
    const lp = await api("PATCH", `/api/roadmap/slides/${land.id}`, {
      stops: run3.map((steps, k) => ({ id: `${land.id}-mvp${k}`, kind: String(k + 1), category: cat.id, steps })) });
    ok("MVP: sıra hatasız (tek kategori, 1 · 2 · 3, öğretim sırası)", lp.status === 200 && !lp.body.issues.some((i) => i.level === "error"),
       lp.body.issues?.map((i) => i.text).join(" | "));
    await api("PATCH", `/api/roadmap/slides/${land.id}`, { status: "live" });
    /* 4 · the panel shows the road from the category */
    const p = await tab();
    await p.goto(`${WEB}/kategoriler/${cat.id}?adim=yayin`, { waitUntil: "networkidle0" });
    const road = await until(async () => { const t = await text(p); return /Telefona giden yol/.test(t) && t.includes("Deniz Kıyısı") ? t : null; });
    ok("MVP: kategori sayfası haritadaki yerini ve teste giden yolu gösterir", !!road);
    await p.close();
    /* 5 · the test release, and what a phone downloads */
    const rel = await api("POST", "/api/releases", { note: "mvp", channels: ["test"] });
    ok("MVP: test yayını oluşur", rel.status === 201, JSON.stringify(rel.body).slice(0, 160));
    const m = await (await fetch(`${API}/api/app/manifest?build=1&schema=1&channel=test`)).json();
    ok("MVP: manifestte kategori, kelimeler, resimleri ve sıra", m.categories.some((c) => c.id === cat.id)
       && W.every(([en]) => m.words.some((w) => w.id === en && w.icon && m.assets[w.icon])) && m.roadmap?.slides?.some((x) => x.id === land.id));
    const file = path.join(mkdtempSync(path.join(tmpdir(), "loplop-mvp-")), "manifest.json");
    writeFileSync(file, JSON.stringify(m));
    /* 6 · the phone's side: the app's own reader and screens, mounted by React */
    const out = await new Promise((resolve) => {
      const c = spawn(process.execPath, ["tools/screentest/run.mjs", "tools/screentest/mvpflow.tsx"], {
        cwd: APP_DIR, env: { ...process.env, MVP_MANIFEST: file,
                             MVP_EXPECT: JSON.stringify({ category: cat.id, words: W.map(([en]) => en), stops: 3 }) } });
      let log = "";
      c.stdout.on("data", (d) => { log += d; }); c.stderr.on("data", (d) => { log += d; });
      c.on("close", (code) => resolve({ code, log }));
    });
    console.log(out.log.split("\n").filter((l) => /gecti|HATA|mvp/.test(l)).map((l) => "     " + l.trim()).join("\n"));
    ok("MVP: uygulama haritayı büyütür ve üç durağı ekranlarıyla sonuna kadar oynar", out.code === 0, out.log.split("\n").filter((l) => /HATA/.test(l)).join(" | "));
    await api("DELETE", `/api/roadmap/slides/${land.id}`);
    await api("PATCH", `/api/categories/${cat.id}`, { status: "draft" });
  }

  console.log("\nYazı tipi · dört rol, uygulamanın fontları, eksik harf raporu, lisans kapısı, yayın (2026-10-23)");
  {
    const p = await tab();
    await p.goto(`${WEB}/yazi-tipi`, { waitUntil: "networkidle0" });
    ok("sol menüde Yazı tipi; dört rol ve uygulamanın kendi fontları", !!(await until(async () => {
      const t = await text(p);
      return /Yazı tipi/.test(t) && /Başlık ve düğmeler/.test(t) && /Güçlü vurgu/.test(t) && /Açıklama ve formlar/.test(t)
        && /Fredoka TR SemiBold/.test(t) && /Nunito Regular/.test(t);
    })));
    ok("uygulamanın fontu tarayıcıda yüklenip örnek çizildi (Başlayalım)", !!(await until(async () =>
      p.evaluate(() => [...document.fonts].some((f) => f.family.includes("app-font-title") && f.status === "loaded")
        && document.body.innerText.includes("Başlayalım")), 10000)));
    /* the official Fredoka: Ğ ğ İ Ş ş missing, a variable file */
    const up = await p.$('[data-testid="font-upload-title"]');
    await up.uploadFile(path.join(APP_DIR, "tools/fonts/src/Fredoka[wdth,wght].ttf"));
    ok("eksik harfli font: harfler tek tek yazılır, uygulamaya konamaz", !!(await until(async () => {
      const t = await text(p);
      return /5 harf yok: Ğ ğ İ Ş ş/.test(t) && /Değişken/.test(t);
    }, 15000)));
    const bad = (await api("GET", "/api/fonts")).body.list.find((x) => x.role === "title");
    ok("“Uygulamaya koy” düğmesi kapalı", await p.evaluate((id) => {
      const b = [...document.querySelectorAll(`[data-font="${id}"] button`)].find((x) => /Uygulamaya koy/.test(x.textContent));
      return !!b && b.disabled;
    }, bad.id));
    /* a whole font of the role's weight */
    await up.uploadFile(path.join(APP_DIR, "src/assets/fonts/Nunito-SemiBold.ttf"));
    const good = await until(async () => (await api("GET", "/api/fonts")).body.list.find((x) => x.role === "title" && /Nunito/.test(x.name)), 15000);
    ok("tam font yüklenir, raporu okunur", !!good && good.report?.missing?.length === 0 && good.report.weight === 600);
    await until(async () => p.$(`[data-font="${good.id}"] [data-testid="font-license"]`));
    await (await p.$(`[data-font="${good.id}"] [data-testid="font-license"]`)).type("SIL OFL 1.1");
    ok("lisans kendiliğinden kaydedilir", !!(await until(async () =>
      (await api("GET", "/api/fonts")).body.list.find((x) => x.id === good.id)?.license === "SIL OFL 1.1")));
    await p.evaluate((id) => [...document.querySelectorAll(`[data-font="${id}"] button`)].find((x) => /Uygulamaya koy/.test(x.textContent))?.click(), good.id);
    ok("uygulamaya girer", !!(await until(async () => (await api("GET", "/api/fonts")).body.list.find((x) => x.id === good.id)?.status === "live")));
    const d = await api("GET", "/api/releases/draft");
    ok("taslakta başlık rolü için bu font (telefona gider)", d.body.manifest.typography?.faces?.[0]?.role === "title"
       && d.body.counts.fonts === 1 && d.body.diff.test.added.some((x) => /yazı tipi: title/.test(x)));
    await p.goto(`${WEB}/yazi-tipi`, { waitUntil: "networkidle0" });
    await p.evaluate(() => [...document.querySelectorAll("button")].find((x) => /Uygulamanınkine dön/.test(x.textContent))?.click());
    ok("“Uygulamanınkine dön” fontu taslağa alır", !!(await until(async () =>
      (await api("GET", "/api/fonts")).body.list.every((x) => x.status !== "live"))));
    for (const x of (await api("GET", "/api/fonts")).body.list) await api("DELETE", `/api/fonts/${x.id}`);
    await p.close();
  }

  console.log("\nRenk paleti · hazır paletler, canlı örnek, kontrast kapısı, uygulamaya gönder, yayın (2026-10-29)");
  {
    const p = await tab();
    await p.goto(`${WEB}/renk-paleti`, { waitUntil: "networkidle0" });
    ok("sol menüde Renk paleti; uygulamanın kendi paleti ve hazır paletler", !!(await until(async () => {
      const t = await text(p);
      return /Renk paleti/.test(t) && /Kayısı × Okyanus/.test(t) && /Sabah Çayırı/.test(t) && /Alacakaranlık/.test(t);
    })));
    await p.click('[data-testid="preset-sabah-cayiri"]');
    const made = await until(async () => (await api("GET", "/api/palettes")).body.list.find((x) => x.name === "Sabah Çayırı"));
    ok("hazır paletle başlanır: düzenlenebilir bir kopya", !!made && made.status === "draft" && made.colors.primary.background === "#FFC83D");
    await until(async () => p.$('[data-testid="palette-preview"]'));
    const bgOf = () => p.evaluate(() => document.querySelector('[data-testid="palette-preview"]')?.getAttribute("style") ?? "");
    ok("örnek, paletin renkleriyle çizilir", !!(await until(async () => /189, 230, 246|#BDE6F6/i.test(await bgOf()))), await bgOf());
    /* a role, changed by its hex field: the preview follows before the server answers */
    const field = await p.$('[data-role="background.start"] input:not([type="color"])');
    await field.click({ clickCount: 3 });
    await field.type("#FFE6CF");
    ok("değiştirince örnek hemen değişir", !!(await until(async () => /255, 230, 207|#FFE6CF/i.test(await bgOf()))));
    ok("değişiklik kendiliğinden kaydedilir", !!(await until(async () =>
      (await api("GET", "/api/palettes")).body.list.find((x) => x.id === made.id)?.colors.background.start === "#FFE6CF")));
    /* an unreadable button text closes the way to the phones */
    const ptext = await p.$('[data-role="primary.text"] input:not([type="color"])');
    await ptext.click({ clickCount: 3 });
    await ptext.type("#FFD24A");
    ok("okunmayan düğme yazısı: kontrast kırmızı, “Uygulamaya gönder” kapalı", !!(await until(async () =>
      p.evaluate(() => !!document.querySelector('[data-testid="palette-send"]')?.disabled && /Okunmayan bir yazı var/.test(document.body.innerText)))));
    /* a swatch fills the chosen role */
    await p.click('[data-role="primary.text"]');
    await p.click('[data-swatch="#2F3B5C"]');
    ok("renk önerisine dokunmak seçili alanı doldurur; gönder açılır", !!(await until(async () =>
      p.evaluate(() => !document.querySelector('[data-testid="palette-send"]')?.disabled))));
    await until(async () => (await api("GET", "/api/palettes")).body.list.find((x) => x.id === made.id)?.colors.primary.text === "#2F3B5C");
    await p.click('[data-testid="palette-send"]');
    ok("uygulamaya gönderilir; Yayınla'ya yol gösterilir", !!(await until(async () =>
      (await api("GET", "/api/palettes")).body.list.find((x) => x.id === made.id)?.status === "live"
      && /Yayınla’ya git/.test(await text(p)))));
    const d = await api("GET", "/api/releases/draft");
    ok("taslakta bu palet (telefona gider)", d.body.manifest.palette?.colors?.background?.start === "#FFE6CF"
       && d.body.counts.palette === "Sabah Çayırı" && d.body.diff.test.added.some((x) => /renk paleti/.test(x)), JSON.stringify(d.body.counts));
    for (const x of (await api("GET", "/api/palettes")).body.list) await api("DELETE", `/api/palettes/${x.id}`);
    await p.close();
  }

  console.log("\nŞarkı videoları · ekle, video + kapak, hak onayı, uygulamaya koy, Yayınla sayısı (2026-11-17)");
  {
    const p = await tab();
    await p.goto(`${WEB}/sarki-videolari`, { waitUntil: "networkidle0" });
    ok("sol menüde Şarkı videoları; boşken ne olacağı yazar", !!(await until(async () => {
      const t = await text(p);
      return /Şarkı videoları/.test(t) && /Henüz şarkı videosu yok/.test(t);
    })));
    await p.type('[data-testid="sv-new-title"]', "Mutfak şarkısı");
    await p.select('[data-testid="sv-new-category"]', "kitchen");
    await p.click('[data-testid="sv-new"]');
    const made = await until(async () => (await api("GET", "/api/song-videos")).body.list.find((x) => x.title === "Mutfak şarkısı"));
    ok("eklenir: taslak, mutfağa bağlı", !!made && made.status === "draft" && made.category === "kitchen");
    const film = await upload(readFileSync(path.join(APP_DIR, "src/assets/video/sample-4x3.mp4")), "mutfak.mp4", "video/mp4");
    const pic = await upload(readFileSync(path.join(APP_DIR, "src/assets/icons/apple.png")), "kapak.png", "image/png");
    await api("PATCH", `/api/song-videos/${made.id}`, { video: film.id, poster: pic.id });
    await p.reload({ waitUntil: "networkidle0" });
    ok("hak onayı yokken uyarı ve “Uygulamaya koy” kapalı", !!(await until(async () =>
      p.evaluate(() => /kullanım hakkı onaylanmadı/.test(document.body.innerText) && !!document.querySelector('[data-testid="sv-live"]')?.disabled))));
    await p.click('[data-testid="sv-rights"]');
    ok("onaylanınca “Uygulamaya koy” açılır", !!(await until(async () =>
      p.evaluate(() => document.querySelector('[data-testid="sv-live"]') && !document.querySelector('[data-testid="sv-live"]').disabled))));
    await p.click('[data-testid="sv-live"]');
    ok("uygulamaya konur", !!(await until(async () => (await api("GET", "/api/song-videos")).body.list.find((x) => x.id === made.id)?.status === "live")));
    const d = await api("GET", "/api/releases/draft");
    ok("taslakta video; film yayını bekletmez (lazy)", d.body.manifest.songVideos?.list?.length === 1 && d.body.manifest.songVideos.lazy[0] === film.id
       && d.body.counts.songVideos === 1, JSON.stringify(d.body.counts));
    await p.goto(`${WEB}/yayinla`, { waitUntil: "networkidle0" });
    ok("Yayınla sayfası videoyu sayar ve filmin sonra indiğini söyler", !!(await until(async () => {
      const t = await text(p);
      return /şarkı videosu/.test(t) && /yayınla birlikte inmez/.test(t);
    })));
    for (const x of (await api("GET", "/api/song-videos")).body.list) await api("DELETE", `/api/song-videos/${x.id}`);
    await p.close();
  }

  ok("hiçbir sayfada yakalanmamış hata yok", errors.length === 0, errors.slice(0, 3).join(" | "));
} catch (e) {
  fail++; console.error("  HATA  beklenmeyen:", e);
} finally {
  await browser?.close();
  stop();
}
console.log(fail ? `\npanel uçtan uca: ${fail} HATA` : "\npanel uçtan uca: hepsi geçti");
process.exit(fail ? 1 : 0);
