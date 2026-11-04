/**
 * THE VOICE WORKSHOP (2026-10-16): the ElevenLabs workshop's tools inside the
 * studio, on the studio's key, voices, jobs and archive --
 *
 *   Atölye     a try, then many lines at once ("dosya_adı, duygu, metin"),
 *              in any language, each a paid job the server keeps; a voice
 *              designed from a description; everything downloadable as a ZIP
 *   Telaffuz   English words said inside another language's sentence: their
 *              IPA, for Eleven v4 in the text and for the other models as an
 *              ElevenLabs pronunciation dictionary
 *   Diller     the children's other languages (Settings)
 *
 * Nothing paid starts without a click and a shown cost; nothing paid is ever
 * re-sent on its own (decision 3).
 */
import React from "react";
import { BookA, Download, Play, Plus, RefreshCw, Sparkles, Square, Trash2, Wand2, XCircle } from "lucide-react";
import { PlayButton } from "../components/Media";
import { FormField, Notice, Panel, Pill, Range, SearchField, Select } from "../components/common";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { useStore } from "../store";
import { useVocab } from "../vocab";
import { useKeys } from "../components/Keys";
import { assetBlob, urlOf } from "../blobs";
import { designVoice, listVoices, makePronDict, newJobId, saveDesignedVoice, tts, type Voice } from "../api";
import { DELIVERY, LANGUAGE_CHOICES, MODELS, dictFor, ipaInline, langName, marksOf, pronHash, sentText, tagOf, tagsWork } from "../studio";
import { useSticky } from "../lib/sticky";
import { parseRows, zipStore } from "../zip";
import { SPEAKERS, type Asset, type Language, type Speaker } from "../types";

const rateOf = (model: string) => MODELS.find((m) => m.id === model)?.rate ?? 1;

/* ── Atölye ─────────────────────────────────────────────────────────────── */

export function Workshop() {
  const { db, addAssetMeta, addWorkshop, removeWorkshop, removeAsset, saveVoice } = useStore();
  const hasKey = !!useKeys()?.elevenlabs.set;
  const [voices, setVoices] = React.useState<Voice[]>([]);
  const loadVoices = React.useCallback(() => { if (hasKey) listVoices().then(setVoices).catch(() => setVoices([])); }, [hasKey]);
  React.useEffect(loadVoices, [loadVoices]);
  const teacher = db.voices.find((v) => v.speaker === "teacher");
  /* the workshop's tool choices stay what they were (`useSticky`) */
  const [voiceId, setVoiceId] = useSticky("workshop.voice", teacher?.voiceId ?? "");
  const [model, setModel] = useSticky("workshop.model", teacher?.model ?? "eleven_v3", (m) => MODELS.some((x) => x.id === m));
  const [lang, setLang] = useSticky("workshop.lang", "tr");
  const [stability, setStability] = React.useState(0.5);
  const [speed, setSpeed] = React.useState(1);
  const [testTag, setTestTag] = useSticky("workshop.tag", "[excited]");
  const [testText, setTestText] = React.useState("Merhaba! Bugün birlikte hayvan dostlarımızı tanıyalım mı?");
  const [testAsset, setTestAsset] = React.useState<Asset | null>(null);
  const [source, setSource] = React.useState("");
  const rows = parseRows(source);
  const bad = rows.filter((r) => r.error);
  const [busy, setBusy] = React.useState<"" | "test" | "batch">("");
  const [progress, setProgress] = React.useState(0);
  const [errors, setErrors] = React.useState<string[]>([]);
  const stop = React.useRef(false);
  React.useEffect(() => () => { stop.current = true; }, []);
  const [q, setQ] = useSticky("workshop.q", "");

  /* the speakers' own voices first, then the rest of the account */
  const named = (Object.keys(SPEAKERS) as Speaker[]).flatMap((s) => {
    const v = db.voices.find((x) => x.speaker === s);
    const ids = v ? [[v.voiceId, ""], ...Object.entries(v.langVoices ?? {}).map(([l, id]) => [id, ` · ${langName(db, l)}`])] : [];
    return ids.filter(([id]) => id).map(([id, note]) => ({ id: id!, label: `${SPEAKERS[s].name}${note}` }));
  });
  const langs = ["tr", "en", ...db.languages.map((l) => l.code)];
  const settings = (text: string, tag: string) => ({
    voiceId, model_id: model, text: sentText({ text, dir: { tag, stability } }, model, db.pron),
    language_code: lang || undefined, seed: db.seed,
    voice_settings: { stability, similarity_boost: 0.8, style: 0.4, use_speaker_boost: true, speed },
    pronunciation_dictionary_locators: dictFor(text, model, db.pronDict),
  });
  const credits = (items: { text: string; tag: string }[]) =>
    Math.ceil(items.reduce((n, x) => n + sentText({ text: x.text, dir: { tag: x.tag, stability } }, model, db.pron).length * rateOf(model), 0));
  /*
   * F11: WHAT WAS REALLY ASKED FOR. A take is "the same" only if the whole
   * request that made it was the same: the text as sent (IPA included), the
   * voice, model, language, seed, every voice setting (speed and stability
   * too -- they change the sound) and the pronunciation dictionary's version.
   * That is the take's fingerprint, versioned; the same request is never paid
   * for twice, a changed one is a new take (a variant, under a new name).
   */
  const fpOf = (text: string, tag: string) => {
    const t = JSON.stringify({ v: 1, ...settings(text, tag), dict: db.pronDict ? `${db.pronDict.id}@${db.pronDict.version ?? ""}` : "" });
    let h = 2166136261;
    for (let i = 0; i < t.length; i++) h = Math.imul(h ^ t.charCodeAt(i), 16777619);
    return `1:${(h >>> 0).toString(16)}`;
  };
  const say = async (name: string, text: string, tag: string) => {
    const a = await tts({ ...settings(text, tag), name, jobId: newJobId() });
    addAssetMeta(a);
    addWorkshop({ name, text, tag, lang, voiceId, model, asset: a.id, fp: fpOf(text, tag), speed, stability });
    return a;
  };

  const test = async () => {
    if (busy || !testText.trim()) return;
    if (!confirm(`Bir deneme üretilecek (≈${credits([{ text: testText, tag: testTag }])} kredi). Devam edilsin mi?`)) return;
    setBusy("test"); setErrors([]); setTestAsset(null);
    try { setTestAsset(await say(`deneme_${Date.now().toString(36)}`, testText.trim(), testTag)); }
    catch (e) { setErrors([(e as Error).message]); }
    finally { setBusy(""); }
  };
  /* a name already made from the same text and settings is not made again; a
     name made from something else must be renamed (no silent overwrite) */
  const sameAs = (name: string, text: string, tag: string) =>
    db.workshop.find((w) => w.name === name && (w.fp
      ? w.fp === fpOf(text, tag)
      /* a take from before fingerprints: its speed and stability were not
         written down -- the same only at the defaults it was made with */
      : w.text === text && w.tag === tag && w.voiceId === voiceId && w.model === model && w.lang === lang && speed === 1 && stability === 0.5));
  const clash = rows.filter((r) => !r.error && db.workshop.some((w) => w.name === r.name) && !sameAs(r.name, r.text, tagOf(r.feeling)));
  const todo = rows.filter((r) => !r.error && !sameAs(r.name, r.text, tagOf(r.feeling)));
  /* a name taken by another request: the next free "<name>_v2", "_v3" … */
  const variantName = (name: string, taken: Set<string>) => { let k = 2; while (taken.has(`${name}_v${k}`)) k++; return `${name}_v${k}`; };
  const batch = async (variants = false) => {
    if (busy || !todo.length || bad.length || (clash.length && !variants)) return;
    const taken = new Set(db.workshop.map((w) => w.name));
    const jobs = todo.map((r) => {
      if (!clash.includes(r)) return { ...r };
      const n = variantName(r.name, taken); taken.add(n);
      return { ...r, name: n };
    });
    if (!confirm(`${jobs.length} kayıt üretilecek (≈${credits(jobs.map((r) => ({ text: r.text, tag: tagOf(r.feeling) })))} kredi)${variants && clash.length ? `; ${clash.length} tanesi yeni varyant adıyla (${jobs.filter((j) => !rows.some((r) => r.name === j.name)).map((j) => j.name).join(", ")})` : ""}. Gönderilmiş bir istek durdurulamaz. Devam edilsin mi?`)) return;
    setBusy("batch"); setErrors([]); setProgress(0); stop.current = false;
    for (let i = 0; i < jobs.length && !stop.current; i++) {
      const r = jobs[i]!;
      try { await say(r.name, r.text, tagOf(r.feeling)); }
      catch (e) {
        setErrors((x) => [...x, `${r.name}: ${(e as Error).message}`]);
        if (/anahtar|401|403/i.test((e as Error).message)) break;
      }
      setProgress(i + 1);
    }
    setBusy("");
  };

  const list = db.workshop.filter((w) => !q || `${w.name} ${w.text}`.toLocaleLowerCase("tr").includes(q.toLocaleLowerCase("tr")));
  const assetOf = (id: string) => db.assets.find((a) => a.id === id);
  const zip = async () => {
    try {
      const files = await Promise.all(list.filter((w) => assetOf(w.asset)).map(async (w) =>
        ({ name: `${w.name}.mp3`, data: new Uint8Array(await (await assetBlob(assetOf(w.asset)!, "audio")).arrayBuffer()) })));
      const url = URL.createObjectURL(zipStore(files));
      const a = document.createElement("a"); a.href = url; a.download = "loplop-sesler.zip"; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (e) { setErrors([(e as Error).message]); }
  };
  const remove = async (id: string, asset: string) => {
    if (!confirm("Bu kayıt atölyeden ve galeriden silinsin mi?")) return;
    try { await removeAsset(asset, true); removeWorkshop(id); }
    catch (e) { alert((e as Error).message); }
  };
  const tagsOff = !tagsWork(model);

  return (
    <div className="grid gap-6 xl:grid-cols-[360px_1fr]">
      <div className="space-y-6">
        <Panel title="Ses ve model" contentClassName="space-y-4">
          <FormField label="Ses" hint={voices.length ? undefined : "Anahtar girilince hesabınızdaki sesler listelenir."}>
            {voices.length || named.length ? (
              <Select value={voiceId} onChange={(e) => setVoiceId(e.target.value)}>
                <option value="">— seçin —</option>
                {named.length > 0 && <optgroup label="Kadro">{named.map((n) => <option key={n.label} value={n.id}>{n.label}</option>)}</optgroup>}
                {voices.length > 0 && <optgroup label="Hesaptaki sesler">{voices.map((v) => <option key={v.voice_id} value={v.voice_id}>{v.name}</option>)}</optgroup>}
              </Select>
            ) : <Input value={voiceId} onChange={(e) => setVoiceId(e.target.value.trim())} placeholder="ses kimliği (voice_id)" />}
          </FormField>
          <FormField label="Model">
            <Select value={model} onChange={(e) => setModel(e.target.value)}>
              {MODELS.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </Select>
          </FormField>
          <FormField label="Dil" hint="Metnin dili: telaffuz ve sayıların okunuşu buna göre. İngilizce kelimeyi {süslü parantez} içine yazın.">
            <Select value={lang} onChange={(e) => setLang(e.target.value)}>
              {langs.map((l) => <option key={l} value={l}>{langName(db, l)}</option>)}
              <option value="">Otomatik (model karar versin)</option>
            </Select>
          </FormField>
          <Range label="Kararlılık (düşük = daha ifadeli)" value={stability} min={0} max={1} step={0.05} onChange={setStability} />
          <Range label="Hız" value={speed} min={0.7} max={1.2} step={0.05} onChange={setSpeed} />
          {tagsOff && <Notice tone="warn">Bu model duygu etiketlerini okumaz; etiketler gönderilmez. Duygu için Eleven v3 ya da v4 seçin.</Notice>}
        </Panel>

        <Panel title="Önce bir deneme" description="Deneme de ElevenLabs kredisi kullanır ve aşağıdaki listeye eklenir." contentClassName="space-y-4">
          <FormField label="Nasıl söylesin?">
            <Select value={testTag} onChange={(e) => setTestTag(e.target.value)} disabled={tagsOff}>
              {DELIVERY.map((d) => <option key={d.label} value={d.tag}>{d.label}{d.tag ? ` · ${d.tag}` : ""}</option>)}
            </Select>
          </FormField>
          <Textarea rows={3} value={testText} onChange={(e) => setTestText(e.target.value)} aria-label="Deneme metni" />
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="secondary" disabled={!hasKey || !voiceId || !!busy} onClick={test}>
              {busy === "test" ? <Spinner data-icon="inline-start" /> : <Play data-icon="inline-start" />}Deneme üret</Button>
            {testAsset && <div className="flex items-center gap-2 text-sm"><PlayButton asset={testAsset} /> son deneme</div>}
          </div>
        </Panel>

        <Design voices={voices} onSaved={(id) => { loadVoices(); setVoiceId(id); }}
                onAssign={(s, id) => { const v = db.voices.find((x) => x.speaker === s); if (v) saveVoice({ ...v, voiceId: id }); }} />
      </div>

      <div className="min-w-0 space-y-6">
        <Panel title="Toplu üretim" contentClassName="space-y-3"
          description={<>Her satır ayrı bir MP3. İlk iki virgülden sonrası okunacak metindir; duygu boş kalabilir,
            Türkçe yazılabilir (<i>heyecanlı, güler yüzlü, meraklı…</i>) ya da etiket olarak (<code>[excited]</code>).
            Metnin içine de etiket konabilir: <code>Merhaba! [laughs] Nasılsın?</code></>}>
          <div className="rounded-md border bg-muted/50 px-3 py-2 font-mono text-xs text-muted-foreground">dosya_adı, duygu, okunacak metin</div>
          <Textarea rows={8} spellCheck={false} value={source} onChange={(e) => setSource(e.target.value)} className="font-mono text-xs md:text-xs" aria-label="Toplu satırlar"
                    placeholder={"selam_ogretmen, güler yüzlü, Merhaba, nasılsın canım?\nlili_hosgeldin, heyecanlı, Hoş geldin!\nbardak_nerede, meraklı, {cup} nerede?"} />
          <div className="text-xs text-muted-foreground tabular-nums">
            {rows.length} satır · {todo.length} üretilecek · ≈{credits(todo.map((r) => ({ text: r.text, tag: tagOf(r.feeling) })))} kredi
          </div>
          {bad.map((r) => <Warn key={r.line}>Satır {r.line}: {r.error}</Warn>)}
          {clash.map((r) => <Warn key={r.name}>"{r.name}" adıyla başka bir metin ya da ayarla (ses, model, dil, hız, kararlılık, telaffuz) üretilmiş kayıt var: yeni bir dosya adı verin ya da yeni varyant olarak üretin.</Warn>)}
          {rows.some((r) => marksOf(r.text).some((w) => !db.pron[w.toLowerCase()])) &&
            <Warn>Süslü parantezli bazı kelimelerin IPA'sı yok (Telaffuz sekmesi): {[...new Set(rows.flatMap((r) => marksOf(r.text)).filter((w) => !db.pron[w.toLowerCase()]))].join(", ")}</Warn>}
          <div className="flex flex-wrap gap-2">
            <Button disabled={!hasKey || !voiceId || !!busy || !todo.length || bad.length > 0 || clash.length > 0} onClick={() => void batch()}>
              {busy === "batch" ? <Spinner data-icon="inline-start" /> : <Wand2 data-icon="inline-start" />}
              {busy === "batch" ? `${progress} / ${todo.length}` : "Hepsini üret"}</Button>
            {clash.length > 0 && !busy && <Button variant="outline" disabled={!hasKey || !voiceId || bad.length > 0} onClick={() => void batch(true)}>
              <Wand2 data-icon="inline-start" />Farklı ayarlıları yeni varyant olarak üret</Button>}
            {busy === "batch" && <Button variant="destructive" onClick={() => { stop.current = true; }}><Square data-icon="inline-start" />Kuyruğu durdur</Button>}
          </div>
          {errors.map((e, i) => <Warn key={i}>{e}</Warn>)}
          <p className="text-xs text-muted-foreground">Satırlar sırayla gönderilir. Aynı ad, metin ve ayarla üretilmiş kayıt yeniden üretilmez.
            Durdurmak, gönderilmiş isteği iptal etmez. Her kayıt sunucuda saklanır; sayfayı kapatmak bir şey kaybettirmez.</p>
        </Panel>

        <Panel title={<>Kayıtlar <span className="font-normal text-muted-foreground">({db.workshop.length})</span></>}
          action={<div className="flex flex-wrap gap-2">
            <SearchField value={q} onChange={setQ} placeholder="Ad ya da metinde ara" className="w-56" />
            <Button variant="outline" disabled={!list.length} onClick={zip}><Download data-icon="inline-start" />ZIP indir ({list.length})</Button>
          </div>}>
          {list.length === 0 ? <p className="text-sm text-muted-foreground">Henüz kayıt yok: bir deneme ya da toplu üretim yapın.</p> : (
            <ul className="divide-y">
              {list.map((w) => {
                const a = assetOf(w.asset);
                return (
                  <li key={w.id} className="flex flex-wrap items-center gap-3 py-2">
                    <PlayButton asset={a} />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium">{w.name}</div>
                      <div className="truncate text-xs text-muted-foreground">{w.tag && <code>{w.tag} </code>}{w.text}</div>
                    </div>
                    <Pill>{langName(db, w.lang)}</Pill>
                    <span className="text-xs text-muted-foreground">{w.model}</span>
                    {a && <Button asChild variant="ghost" size="icon-sm"><a href={urlOf(a) ?? "#"} download={`${w.name}.mp3`} title="İndir"><Download /></a></Button>}
                    <Button variant="ghost" size="icon-sm" onClick={() => remove(w.id, w.asset)} title="Sil" className="hover:bg-destructive/10 hover:text-destructive"><Trash2 /></Button>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}

/* ── voice design ─────────────────────────────────────────────────────── */

function Design({ voices, onSaved, onAssign }: { voices: Voice[]; onSaved: (id: string) => void; onAssign: (s: Speaker, id: string) => void }) {
  const { addAssetMeta } = useStore();
  const hasKey = !!useKeys()?.elevenlabs.set;
  const [description, setDescription] = React.useState("");
  const [text, setText] = React.useState("");
  const [name, setName] = React.useState("");
  const [speaker, setSpeaker] = React.useState<Speaker | "">("");
  const [busy, setBusy] = React.useState(false);
  const [previews, setPreviews] = React.useState<(Asset & { generatedVoiceId: string | null })[]>([]);
  const [msg, setMsg] = React.useState("");
  const ok = description.trim().length >= 20 && description.trim().length <= 1000 && (!text.trim() || (text.trim().length >= 100 && text.trim().length <= 1000));
  const make = async () => {
    if (busy || !ok) return;
    if (!confirm("Ses örnekleri üretilecek (ElevenLabs kredisi kullanır). Devam edilsin mi?")) return;
    /* a new try starts empty: a failed one must not leave the LAST design's
       samples playing as if they were this description's (2026-10-16) */
    setBusy(true); setMsg(""); setPreviews([]);
    try {
      const r = await designVoice({ description: description.trim(), text: text.trim() || undefined, jobId: newJobId() });
      r.previews.forEach((p) => addAssetMeta(p));
      setPreviews(r.previews);
      setMsg(`${r.previews.length} örnek geldi: bu tarif ve bu örnek konuşmayla.`);
    } catch (e) {
      const m = (e as Error).message;
      setMsg(/içerik kuralları|safety|guideline/i.test(m)
        ? `ElevenLabs bu tarifi güvenlik kuralları nedeniyle engelledi (kredi harcanmadı). Çocuk sesi tarifleri engelleniyor: "child", "childlike", "kid", yaş ya da "çocuklara hitap eden" gibi ifadeleri çıkarın; karakteri yetişkin bir seslendirme sanatçısının sesi olarak tarif edin ("a young woman voicing a cute cartoon otter").`
        : m);
    }
    finally { setBusy(false); }
  };
  const keep = async (gid: string) => {
    if (!name.trim()) { setMsg("Önce kaydedilecek sesin adını yazın."); return; }
    setBusy(true); setMsg("");
    try {
      const v = await saveDesignedVoice({ name: name.trim(), description: description.trim(), generatedVoiceId: gid });
      if (speaker) onAssign(speaker, v.voice_id);
      onSaved(v.voice_id);
      setMsg(`"${v.name}" hesabınıza kaydedildi${speaker ? ` ve ${SPEAKERS[speaker].name} sesi yapıldı` : ""}.`);
    } catch (e) { setMsg((e as Error).message); }
    finally { setBusy(false); }
  };
  return (
    <Panel title="Ses tasarla" icon={<Sparkles />} contentClassName="space-y-4"
           description={<>Örnekler kredi kullanır. "Kaydet ve kullan" sesi ElevenLabs hesabınıza ekler (boş ses yeri gerekir). {voices.length} ses var.</>}>
      <FormField label={`Ses tarifi · 20–1000 karakter (${description.trim().length})`}>
        <Textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)}
                  placeholder="Türkçe konuşan, sıcak ve neşeli bir çizgi film tavşanı. Yumuşak, net ve meraklı bir ses…" />
      </FormField>
      <FormField label={`Örnek konuşma · isteğe bağlı, 100–1000 karakter (${text.trim().length})`}
             hint={text.trim() && text.trim().length < 100
               ? `En az 100 karakter olmalı: ${100 - text.trim().length} karakter daha yazın (düğme o zaman açılır).`
               : "Boş bırakılırsa ElevenLabs kendisi yazar (İngilizce). Türkçe duymak için Türkçe yazın."}>
        <Textarea rows={2} value={text} onChange={(e) => setText(e.target.value)} />
      </FormField>
      <div className="grid grid-cols-2 gap-2">
        <FormField label="Sesin adı"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="ör. Lili" maxLength={100} /></FormField>
        <FormField label="Kadroya ata (isteğe bağlı)">
          <Select value={speaker} onChange={(e) => setSpeaker(e.target.value as Speaker | "")}>
            <option value="">— yok —</option>
            {(Object.keys(SPEAKERS) as Speaker[]).map((s) => <option key={s} value={s}>{SPEAKERS[s].name}</option>)}
          </Select>
        </FormField>
      </div>
      <Button variant="secondary" disabled={!hasKey || !ok || busy} onClick={make}>
        {busy ? <Spinner data-icon="inline-start" /> : <Sparkles data-icon="inline-start" />}Ses örnekleri üret</Button>
      {previews.length > 0 && (
        <ul className="space-y-1.5">
          {previews.map((p, i) => (
            <li key={p.id} className="flex items-center gap-2 rounded-md border bg-muted/40 px-2 py-1.5">
              <PlayButton asset={p} /><span className="text-sm font-medium">Örnek {i + 1}</span>
              {p.generatedVoiceId && <Button variant="secondary" size="sm" className="ml-auto" disabled={busy} onClick={() => keep(p.generatedVoiceId!)}>Kaydet ve kullan</Button>}
            </li>
          ))}
        </ul>
      )}
      {msg && (/engelledi|reddetti|hata/i.test(msg) ? <Notice tone="bad" icon={<XCircle />}>{msg}</Notice> : <p className="text-sm text-muted-foreground">{msg}</p>)}
    </Panel>
  );
}

/* ── Telaffuz ─────────────────────────────────────────────────────────── */

export function Pronunciation() {
  const { db, setPron, setPronDict } = useStore();
  const { words } = useVocab();
  const hasKey = !!useKeys()?.elevenlabs.set;
  const english = [...new Set([...words.map((w) => w.en.trim().toLowerCase()), ...Object.keys(db.pron)])].filter(Boolean).sort();
  const [extra, setExtra] = React.useState("");
  const [q, setQ] = useSticky("pron.q", "");
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState("");
  const rules = Object.entries(db.pron).filter(([, v]) => v.ipa).map(([word, v]) => ({ word, ipa: v.ipa }));
  const hash = pronHash(db.pron);
  const fresh = db.pronDict?.hash === hash;
  const sync = async () => {
    if (!rules.length || busy) return;
    setBusy(true); setMsg("");
    try {
      const d = await makePronDict({ name: `loplop-${hash}`, rules });
      setPronDict({ id: d.id, version: d.version_id, hash });
      setMsg(`Sözlük gönderildi: ${d.rules} kelime.`);
    } catch (e) { setMsg((e as Error).message); }
    finally { setBusy(false); }
  };
  const shown = english.filter((w) => !q || w.includes(q.toLowerCase()));
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
      <Panel title="İngilizce kelimelerin telaffuzu (IPA)" icon={<BookA />}
             action={<SearchField value={q} onChange={setQ} placeholder="Kelime ara" className="w-48" />}>
        <ul className="divide-y">
          {shown.map((w) => (
            <li key={w} className="grid grid-cols-[140px_1fr_32px] items-center gap-3 py-1.5">
              <span className="font-medium">{w}</span>
              <Input defaultValue={db.pron[w]?.ipa ?? ""} placeholder="ör. kʌp" onBlur={(e) => { if (e.target.value.trim() !== (db.pron[w]?.ipa ?? "")) setPron(w, e.target.value); }}
                     className="h-8 font-mono" aria-label={`${w} IPA`} />
              {db.pron[w] ? <Button variant="ghost" size="icon-sm" title="Kaldır" onClick={() => setPron(w, "")} className="hover:bg-destructive/10 hover:text-destructive"><Trash2 /></Button> : <span />}
            </li>
          ))}
        </ul>
        <div className="mt-3 flex gap-2 border-t pt-3">
          <Input value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="Listede olmayan bir İngilizce kelime" />
          <Button variant="secondary" disabled={!extra.trim()} onClick={() => { setPron(extra, db.pron[extra.trim().toLowerCase()]?.ipa || "?"); setExtra(""); }}><Plus data-icon="inline-start" />Ekle</Button>
        </div>
      </Panel>
      <div className="space-y-4">
        <Panel title="Nasıl çalışır?" contentClassName="space-y-3 text-sm">
          <p>Başka bir dilin cümlesindeki İngilizce kelime o dilin harfleriyle okunur: Türkçe cümlede <b>cup</b> "cap" olur.
            ElevenLabs'in çözümü kelimenin <b>IPA</b> yazımıdır, ve bu her dil için aynı çalışır (Türkçe, İtalyanca, Almanca…).</p>
          <ol className="list-decimal space-y-1 pl-5">
            <li>Cümlede İngilizce kelimeyi süslü paranteze alın: <code>{"{cup}"} nerede?</code></li>
            <li>Burada o kelimenin IPA'sını yazın: <code>cup → kʌp</code></li>
            <li><b>Eleven v4</b>: kelime metne <code>/kʌp/</code> olarak yazılıp gönderilir.</li>
            <li>Öbür modeller: kelime düz gider, yanında bu sözlük (fonem kuralları) gönderilir.</li>
          </ol>
          <p className="text-xs text-muted-foreground">ElevenLabs'e göre IPA %80–90 tutarlı: önemli satırlarda 2–3 deneme üretip en iyisini seçin.
            Sözlüğü fonem kuralıyla okumayan bir model onu yok sayar; o modelde kelimeyi ayrı satır olarak kaydetmek (uygulamanın kuralı) en güvenli yoldur.</p>
        </Panel>
        <Panel title="ElevenLabs sözlüğü" contentClassName="space-y-3"
               description={<>Kredi kullanmaz. Değişen liste yeni bir sözlük olur; eski sürümle üretilmiş kayıtlar değişmez.{ipaInline("eleven_v4") ? " Eleven v4 sözlüğe ihtiyaç duymaz." : ""}</>}>
          <p className="flex flex-wrap items-center gap-2 text-sm">{rules.length} kelimenin IPA'sı var. {db.pronDict
            ? fresh ? <Pill tone="ok">güncel</Pill> : <Pill tone="warn">liste değişti · yeniden gönderin</Pill>
            : <Pill tone="warn">henüz gönderilmedi</Pill>}</p>
          <Button disabled={!hasKey || !rules.length || busy || fresh} onClick={sync}>
            {busy ? <Spinner data-icon="inline-start" /> : <RefreshCw data-icon="inline-start" />}Sözlüğü gönder</Button>
          {msg && <p className="text-sm text-muted-foreground">{msg}</p>}
        </Panel>
      </div>
    </div>
  );
}

/* ── Diller (Ses ayarları) ────────────────────────────────────────────── */

export function Languages() {
  const { db, saveLanguage, removeLanguage } = useStore();
  const free = LANGUAGE_CHOICES.filter((c) => !db.languages.some((l) => l.code === c.code));
  const [pick, setPick] = React.useState("");
  const add = (l: Language) => { saveLanguage(l); setPick(""); };
  return (
    <Panel title="Çocukların dilleri" className="lg:col-span-2"
      description={<>Uygulama Türkçe konuşan çocuklara İngilizce öğretiyor. Başka bir dili eklerseniz öğretmenin
        o dildeki cümleleri (kelimenin anlamı, açıklaması, oyunların ve sahnelerin cümleleri) Föy'de o dilin sekmesinde üretilir;
        İngilizce kelimeler bütün diller için aynı kayıttır. Şablondaki <code>%</code> kelimenin anlamının yeridir.</>}>
      <ul className="mb-4 divide-y rounded-lg border">
        <li className="grid grid-cols-[60px_1fr_1fr_32px] items-center gap-3 px-3 py-2 text-sm"><code>tr</code><span className="font-medium">Türkçe</span><span className="text-muted-foreground">Türkçesi, %.</span><span /></li>
        {db.languages.map((l) => (
          <li key={l.code} className="grid grid-cols-[60px_1fr_1fr_32px] items-center gap-3 px-3 py-2">
            <code className="text-sm">{l.code}</code>
            <Input value={l.name} onChange={(e) => saveLanguage({ ...l, name: e.target.value })} aria-label={`${l.code} adı`} />
            <Input value={l.meaningTemplate} onChange={(e) => saveLanguage({ ...l, meaningTemplate: e.target.value })}
                   aria-invalid={!l.meaningTemplate.includes("%")} title="% = anlamın yeri" />
            <Button variant="ghost" size="icon-sm" title="Kaldır" className="hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => { if (confirm(`${l.name} listeden kaldırılsın mı? Çevirileri ve kayıtları silinmez; yeniden eklenince geri gelir.`)) removeLanguage(l.code); }}><XCircle /></Button>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        <Select value={pick} onChange={(e) => setPick(e.target.value)} className="w-60">
          <option value="">— dil seçin —</option>
          {free.map((c) => <option key={c.code} value={c.code}>{c.name} ({c.code})</option>)}
        </Select>
        <Button variant="secondary" disabled={!pick} onClick={() => add(free.find((c) => c.code === pick)!)}><Plus data-icon="inline-start" />Dil ekle</Button>
      </div>
    </Panel>
  );
}

const Warn = ({ children }: { children: React.ReactNode }) => <Notice tone="bad" icon={<XCircle />}>{children}</Notice>;
