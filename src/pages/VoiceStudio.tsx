import React from "react";
import { AudioLines, BookA, CheckCircle2, ChevronDown, ChevronRight, KeyRound, Languages as LangIcon, Mic, Pencil, Plus, Sparkles, Square, Trash2, Upload, Wand2, XCircle } from "lucide-react";
import { PlayButton } from "../components/Media";
import { FormField, Modal, ModalActions, Notice, PageHeader, Panel, Pill, Range, SearchField, Select, TONE_TEXT, type Tone } from "../components/common";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Progress } from "@/components/ui/progress";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useStore, type WordTextField } from "../store";
import { useVocab } from "../vocab";
import { wordSlot } from "../store";
import { WordEditor } from "../components/WordEditor";
import { APP_LANG, DELIVERY, MODELS, costOf, enSpeedOf, generate, isFrame, langName, midBlank, marksOf, modelOf, script, sentText, statusOf, tagsWork, unmarked, type Line, type Status } from "../studio";
import { Languages, Pronunciation, Workshop } from "./VoiceWorkshop";
import { credits, listVoices, newJobId, type Voice } from "../api";
import { KeyCard, useKeys } from "../components/Keys";
import { SPEAKERS, type FixedLine, type Speaker, type VoiceProfile } from "../types";
import { useCategories } from "../categories";
import { useSticky } from "../lib/sticky";
import { WORDS, placeLabel, placeOf, stepOptions, type StepOption } from "../places";
import type { ServerCategory } from "../api";

const STATUS: Record<Status, { label: string; tone: Tone }> = {
  untranslated: { label: "çeviri yok", tone: "warn" },
  ready: { label: "kayıtlı", tone: "ok" },
  stale: { label: "eski metin · yayına girmez", tone: "warn" },
  missing: { label: "eksik", tone: "bad" },
};

export function VoiceStudio() {
  const asked = new URLSearchParams(window.location.search).get("sekme");
  type Tab = "script" | "workshop" | "pron" | "settings";
  /* a link that names a tab opens it; otherwise the tab last looked at */
  const [kept, setKept] = useSticky<Tab>("voice.tab", "script");
  const [tab, setTabNow] = React.useState<Tab>(
    asked === "ayarlar" ? "settings" : asked === "atolye" ? "workshop" : asked === "telaffuz" ? "pron" : asked === "foy" ? "script" : kept);
  const setTab = (t: Tab) => { setTabNow(t); setKept(t); };
  return (
    <>
      <PageHeader title="Ses stüdyosu"
        sub="Uygulamanın kaydedilmesi gereken bütün cümleleri: her kelimenin satırları (İngilizce kelime, Türkçe anlamı, açıklama, Kuki'nin tekrarı) ve sahnelerle oyunların sabit cümleleri. ElevenLabs ile üretin ya da kendi kaydınızı yükleyin, dinleyip seçin. Seçilen kayıt bir sonraki yayınla telefona gider ve paketteki kaydın yerine çalar." />
      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)} className="mb-6">
        <TabsList>
          {([["script", "Föy", Mic], ["workshop", "Atölye", AudioLines], ["pron", "Telaffuz", BookA], ["settings", "Ses ayarları", KeyRound]] as const).map(([id, label, Icon]) => (
            <TabsTrigger key={id} value={id}><Icon />{label}</TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      {tab === "script" ? <Script onSettings={() => setTab("settings")} />
        : tab === "workshop" ? <Workshop /> : tab === "pron" ? <Pronunciation /> : <Settings />}
    </>
  );
}

/* ── the script ────────────────────────────────────────────────────────────── */

function Script({ onSettings }: { onSettings: () => void }) {
  const { db } = useStore();
  const { words, sets, inventory, wordOf } = useVocab();
  const [lang, setLang] = useSticky("voice.script.lang", APP_LANG);
  const all = React.useMemo(() => script(db, words, sets, inventory, lang), [db, words, sets, inventory, lang]);
  /* the vocabulary's English: written bare in a sentence of another language, it is misread */
  const english = React.useMemo(() => [...new Set(words.map((w) => w.en.trim().toLowerCase()))], [words]);
  const [wordOpen, setWordOpen] = React.useState<string | null>(null);
  /* where a line is said: a category, then one of its steps (`places.ts`) */
  const { categories: unsorted } = useCategories();
  const categories = React.useMemo(() => [...unsorted].sort((a, b) => a.order - b.order), [unsorted]);
  /* the filters stay what they were when the tab or the page comes back (`useSticky`) */
  const [cat, setCat] = useSticky("voice.script.cat", "");
  const [step, setStep] = useSticky("voice.script.step", "");
  const catOf = categories.find((c) => c.id === cat);
  const inCategory = (l: Line, c: ServerCategory) => l.kind === "word"
    ? c.words.some((w) => w.id === l.word!.id) : placesOf(l).some((p) => p.category === c.id);
  const unplaced = (l: Line) => !categories.some((c) => inCategory(l, c));
  const options: StepOption[] = catOf
    ? [...stepOptions(catOf), ...(all.some((l) => l.kind === "word" && inCategory(l, catOf)) ? [{ key: WORDS, label: "Kelimeler", steps: [] }] : [])]
    : [];
  const option = options.find((o) => o.key === step);
  const placed = (l: Line) => (!cat || (cat === NONE ? unplaced(l) : !!catOf && inCategory(l, catOf)))
    && (!option || (option.key === WORDS ? l.kind === "word"
      : placesOf(l).some((p) => p.category === cat && option.steps.includes(p.step))));
  const [status, setStatus] = useSticky<Status | "">("voice.script.status", "");
  const [speaker, setSpeaker] = useSticky<Speaker | "">("voice.script.speaker", "");
  const [q, setQ] = useSticky("voice.script.q", "");
  /* a remembered category, step or language that is gone is let go of */
  React.useEffect(() => {
    if (cat && cat !== NONE && categories.length && !catOf) { setCat(""); setStep(""); }
    else if (step && catOf && !options.some((o) => o.key === step)) setStep("");
  }, [categories.length, cat, step, catOf?.id]);
  React.useEffect(() => {
    if (lang !== APP_LANG && !db.languages.some((l) => l.code === lang)) setLang(APP_LANG);
  }, [lang, db.languages.length]);
  const [sel, setSel] = React.useState<Set<string>>(new Set());
  const [open, setOpen] = React.useState<string | null>(null);
  const [running, setRunning] = React.useState<Line[] | null>(null);
  const [editing, setEditing] = React.useState<FixedLine | "new" | null>(null);

  const list = all.filter((l) => placed(l) && (!status || statusOf(l) === status)
    && (!speaker || l.speaker === speaker)
    && (!q || `${l.text} ${l.clip}`.toLocaleLowerCase("tr").includes(q.toLocaleLowerCase("tr"))));
  const count = (s: Status) => all.filter((l) => statusOf(l) === s).length;
  const chosen = all.filter((l) => sel.has(l.clip));
  const toggle = (clip: string) => setSel((s) => { const n = new Set(s); if (n.has(clip)) n.delete(clip); else n.add(clip); return n; });
  const hasKey = !!useKeys()?.elevenlabs.set;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <LangIcon className="size-4 text-muted-foreground" />
        <ToggleGroup type="single" variant="outline" size="sm" spacing={1} value={lang}
                     onValueChange={(c) => { if (!c) return; setLang(c); setSel(new Set()); setStatus(""); }}>
          {[APP_LANG, ...db.languages.map((l) => l.code)].map((c) => (
            <ToggleGroupItem key={c} value={c} className="data-[state=on]:border-foreground data-[state=on]:bg-foreground data-[state=on]:text-background">
              {langName(db, c)}</ToggleGroupItem>
          ))}
        </ToggleGroup>
        <Button variant="link" size="sm" onClick={onSettings}>+ dil ekle</Button>
        {lang !== APP_LANG && <span className="text-xs text-muted-foreground">İngilizce satırlar bütün diller için aynıdır ve Türkçe föyde durur.</span>}
      </div>
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Satır" n={all.length} />
        <Stat label="Kayıtlı" n={count("ready")} tone="ok" onClick={() => setStatus("ready")} />
        <Stat label="Eksik" n={count("missing")} tone="bad" onClick={() => setStatus("missing")} />
        {lang === APP_LANG
          ? <Stat label="Metni değişmiş" n={count("stale")} tone="warn" onClick={() => setStatus("stale")} />
          : <Stat label="Çeviri yok" n={count("untranslated")} tone="warn" onClick={() => setStatus("untranslated")} />}
      </div>

      {lang !== APP_LANG && (
        <Notice tone="accent" icon={<LangIcon />} className="mb-4">
          <b>Çeviri kuralı:</b> İngilizce kelime hiçbir cümlenin içinde değildir; uygulama onu cümlenin önünde bir,
          arkasında iki kez kendi kaydıyla söyler ("banana. Lili bunu istiyor. banana. banana."). Bu yüzden çeviri
          de kelimeye bağlı bir şey taşımaz: artikel, cinsiyet ya da ek yok. "Questo è <i>un</i>…" değil "Questo si
          chiama…", "Das ist <i>ein</i>…" değil "Das heißt…"; "bunu" için cinsiyetsiz bir işaret sözü ("questo",
          "das", "esto", "هذا"). Her cümle bir kez çevrilir; kelime eklemek çeviri gerektirmez.
          <br /><b>Boşluklu cümleler</b> (<code>f_…</code>): kelimenin yeri <code>___</code> olarak kalır, tam bir kez,
          ve ona ek ya da artikel yapışmaz — "Lili vuole ___.", "Hadi bir ___ fotoğrafı çekelim!". Cümle bir
          duraklamayla kaydedilir; uygulama kelimenin kendi kaydını o duraklamaya koyar.
        </Notice>
      )}
      {!hasKey && (
        <Notice tone="warn" icon={<KeyRound />} className="mb-4" action={<Button variant="outline" size="sm" onClick={onSettings}>Anahtarı gir</Button>}>
          Üretmek için ElevenLabs API anahtarı gerekiyor. Kendi kayıtlarınızı anahtar olmadan da yükleyebilirsiniz.
        </Notice>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <SearchField value={q} onChange={setQ} placeholder="Metinde ya da dosya adında ara" className="min-w-[200px] max-w-none flex-1" />
        <Select value={cat} onChange={(e) => { setCat(e.target.value); setStep(""); }} className="w-auto">
          <option value="">Bütün kategoriler</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
          {all.some(unplaced) && <option value={NONE}>Kategorisiz</option>}
        </Select>
        <Select value={step} onChange={(e) => setStep(e.target.value)} disabled={!catOf} className="w-auto"
                title={catOf ? "" : "Önce bir kategori seçin"}>
          <option value="">{catOf ? "Bütün adımlar" : "Sahne / oyun"}</option>
          {options.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
        </Select>
        <Select value={speaker} onChange={(e) => setSpeaker(e.target.value as Speaker | "")} className="w-auto">
          <option value="">Herkes</option>
          {(Object.keys(SPEAKERS) as Speaker[]).map((s) => <option key={s} value={s}>{SPEAKERS[s].name}</option>)}
        </Select>
        <Select value={status} onChange={(e) => setStatus(e.target.value as Status | "")} className="w-auto">
          <option value="">Her durum</option>
          {(Object.keys(STATUS) as Status[]).map((s) => <option key={s} value={s}>{STATUS[s].label}</option>)}
        </Select>
        <Button variant="outline" onClick={() => setSel(new Set(list.filter((l) => statusOf(l) === "missing" || statusOf(l) === "stale").map((l) => l.clip)))}>
          Eksik ve eskileri seç</Button>
        <Button variant="secondary" onClick={() => setEditing("new")}><Plus data-icon="inline-start" />Satır ekle</Button>
      </div>

      <Card className="gap-0 py-0">
        <div className="grid grid-cols-[32px_120px_1fr_270px_110px_150px] items-center gap-3 border-b bg-muted/50 px-4 py-2 text-xs font-medium text-muted-foreground max-lg:hidden">
          <Checkbox aria-label="Hepsini seç" checked={list.length > 0 && list.every((l) => sel.has(l.clip))}
                    onCheckedChange={(v) => setSel(v === true ? new Set([...sel, ...list.map((l) => l.clip)]) : new Set([...sel].filter((c) => !list.some((l) => l.clip === c))))} />
          <span>Kim</span><span>Metin</span><span>Yönlendirme</span><span>Durum</span><span className="text-right">Kayıt</span>
        </div>
        {list.length === 0 ? <p className="p-6 text-sm text-muted-foreground">Bu filtrede satır yok.</p> : (
          <ul className="divide-y">
            {list.map((l) => (
              <LineRow key={`${lang}:${l.clip}`} l={l} where={l.place ? placeLabel(categories, l.place.category, l.place.step) : l.group} english={english} checked={sel.has(l.clip)} onCheck={() => toggle(l.clip)}
                       open={open === l.clip} onOpen={() => setOpen(open === l.clip ? null : l.clip)}
                       onGenerate={() => setRunning([l])}
                       onEdit={l.app ? undefined : () => l.word ? setWordOpen(l.word.id) : setEditing(db.lines.find((x) => x.clip === l.clip) ?? null)} />
            ))}
          </ul>
        )}
      </Card>

      {sel.size > 0 && (
        <div className="sticky bottom-4 z-10 mt-4 flex flex-wrap items-center gap-3 rounded-xl border bg-popover px-4 py-3 text-popover-foreground shadow-lg ring-1 ring-foreground/5">
          <span className="font-medium">{sel.size} satır seçildi</span>
          <span className="text-sm text-muted-foreground">≈ {costOf(chosen, db.voices, db.pron).toLocaleString("tr")} kredi</span>
          <Button variant="ghost" className="ml-auto" onClick={() => setSel(new Set())}>Seçimi temizle</Button>
          <Button onClick={() => setRunning(chosen.filter((l) => l.text.trim()))}><Wand2 data-icon="inline-start" />Seçilenleri üret</Button>
        </div>
      )}
      {running && <Generate lines={running} onClose={() => setRunning(null)} onDone={() => setSel(new Set())} />}
      {editing && <EditLine line={editing === "new" ? null : editing} categories={categories}
                            at={catOf && option && option.key !== WORDS ? { category: catOf.id, step: option.steps[0]! } : null}
                            onClose={() => setEditing(null)} />}
      {wordOpen && wordOf(wordOpen) && <WordEditor word={wordOf(wordOpen)!} onClose={() => setWordOpen(null)} />}
    </>
  );
}

function Stat({ label, n, tone, onClick }: { label: string; n: number; tone?: Tone; onClick?: () => void }) {
  return (
    <button type="button" onClick={onClick} disabled={!onClick} className="group rounded-xl text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
      <Card size="sm" className={cn("px-4", onClick && "transition-shadow group-hover:shadow-md")}>
        <div className={cn("font-heading text-2xl font-semibold tabular-nums", tone && TONE_TEXT[tone])}>{n}</div>
        <div className="text-xs text-muted-foreground">{label}</div>
      </Card>
    </button>
  );
}

function LineRow({ l, where, english, checked, onCheck, open, onOpen, onGenerate, onEdit }: {
  l: Line; where: string; english: string[]; checked: boolean; onCheck: () => void; open: boolean; onOpen: () => void;
  onGenerate: () => void; onEdit?: () => void;
}) {
  const { db, addAsset, addTake, addLocaleTake, pickLocaleTake, setDirection, saveLine, measureTake } = useStore();
  const { setAudio } = useVocab();
  const local = l.lang !== APP_LANG && l.lang !== "en";
  /* the take in use is declared right for the text as it is now: a word's is
     re-stamped on the word, a fixed line's records the text it was approved for */
  const approveFor = (x: Line) => {
    if (!x.current) return;
    if (local) pickLocaleTake(x.lang, x.clip, x.current, x.text);
    else if (x.word) setAudio(x.word.id, x.word.slot, x.current, x.text).catch((e: Error) => alert(e.message));
    else {
      const line = db.lines.find((y) => y.clip === x.clip);
      if (line) saveLine({ ...line, approvedText: x.text });
    }
  };
  const st = statusOf(l);
  const cur = db.assets.find((a) => a.id === l.current);
  const input = React.useRef<HTMLInputElement>(null);
  const upload = async (f?: File | null) => {
    if (!f) return;
    const a = await addAsset(f);
    if (a?.kind !== "audio") return;
    if (local) addLocaleTake(l.lang, { clip: l.clip, asset: a.id, text: l.text, source: "upload" });
    else addTake({ clip: l.clip, asset: a.id, text: l.text, source: "upload" });
  };
  /* an English word inside a sentence of another language, marked or not:
     the app never says one that way any more (2026-10-20) */
  /* a sentence with a gap for the word (`f_…`, 2026-10-23): its take must
     have a pause the phone can put the word in */
  const frame = isFrame(l.clip);
  const take = frame && l.current ? db.takes.find((t) => t.clip === l.clip && t.asset === l.current && !t.lang) : undefined;
  const cutNeeded = frame && l.lang === APP_LANG && midBlank(l.text);
  const bare = l.lang !== "en"
    ? [...new Set([...unmarked(l.text, english), ...marksOf(l.text)])] : [];
  const noIpa = marksOf(l.text).filter((w) => !db.pron[w.toLowerCase()]);
  return (
    <li className={cn("transition-colors", checked && "bg-primary/5")}>
      <div className="grid grid-cols-[32px_120px_1fr_270px_110px_150px] items-center gap-3 px-4 py-2.5 max-lg:grid-cols-[32px_1fr] max-lg:gap-y-2">
        <Checkbox checked={checked} onCheckedChange={onCheck} aria-label={`${l.clip} seç`} />
        <div className="max-lg:hidden"><Who s={l.speaker} /></div>
        <div className="min-w-0 space-y-0.5">
          <div className="flex items-center gap-2">
            <span className="lg:hidden"><Who s={l.speaker} /></span>
            {local ? <LocalText l={l} />
              : <span className={cn("text-sm font-medium", l.lang === "en" && "italic text-primary")}>{l.text}</span>}
          </div>
          {local && <div className="text-[11px] text-muted-foreground">Türkçesi: {l.source}</div>}
          {bare.length > 0 && <div className="text-[11px] font-medium text-warning"
               title="Cümlenin içindeki İngilizce kelime o dilin harfleriyle okunur (cup → cap) ve başka dilde artikel ya da ek ister. Uygulama kelimeyi cümlenin önünde ve arkasında kendi temiz kaydıyla söyler.">
            Cümlenin içinde İngilizce kelime var: {bare.join(", ")} — cümleyi kelimesiz yazın ("Lili bunu istiyor."), kelimenin yeri için ___ kullanın</div>}
          {cutNeeded && take && (take.cut
            ? <div className="text-[11px] text-muted-foreground"
                   title="Telefon kaydı bu sessizlikte ikiye böler ve kelimenin kendi kaydını araya koyar (150 ms boşlukla)">
                Kelimenin yeri: {take.cut[0].toFixed(2).replace(".", ",")}–{take.cut[1].toFixed(2).replace(".", ",")} sn</div>
            : <div className="flex items-center gap-2 text-[11px] font-medium text-warning">
                {take.noPause ? "Kayıtta kelimenin yeri için bir duraklama bulunamadı — yeniden üretin (telefon şimdilik eski kalıbı çalar)"
                  : "Kelimenin yeri ölçülüyor…"}
                <button type="button" className="text-primary hover:underline" onClick={() => measureTake(take.id)}>Ölç</button>
              </div>)}
          {noIpa.length > 0 && <div className="text-[11px] font-medium text-warning">IPA'sı yok (Telaffuz): {noIpa.join(", ")}</div>}
          <div className="flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground">
            <code>{l.clip}</code> · {where}
            {frame && <span title="Her kelime için tek kayıt: ___ yerinde bir duraklamayla okunur, telefon kelimenin kendi kaydını oraya koyar; kaydı yoksa uygulama eski kalıbı söyler (kelime · cümle · kelime · kelime)">· boşluklu cümle</span>}
            {onEdit ? <button type="button" onClick={onEdit} className="inline-flex items-center gap-0.5 text-primary hover:underline"><Pencil className="size-3" /> {l.kind === "fixed" ? "düzenle" : "kelimeyi aç"}</button>
              : <span title="Bu cümle uygulamanın kendisinde yazılı; metni uygulamada değişir">· uygulamanın cümlesi</span>}
          </div>
        </div>
        <div className="flex items-center gap-1.5 max-lg:col-start-2">
          <NativeSelect size="sm" value={DELIVERY.some((d) => d.tag === l.dir.tag) ? l.dir.tag : "*"} title="Nasıl söylesin? (yalnız Eleven v3/v4 okur)"
                  onChange={(e) => { if (e.target.value !== "*") setDirection(l.clip, { ...l.dir, tag: e.target.value }); }}
                  className="w-24 shrink-0 [&_select]:text-xs">
            {DELIVERY.map((d) => <option key={d.label} value={d.tag}>{d.label}</option>)}
            <option value="*" disabled>özel</option>
          </NativeSelect>
          <Input value={l.dir.tag} onChange={(e) => setDirection(l.clip, { ...l.dir, tag: e.target.value })}
                 title="Ses etiketi: metnin başına eklenir (eleven_v3)" className="h-7 min-w-0 px-2 text-xs md:text-xs" />
          <Input type="number" min={0} max={1} step={0.05} value={l.dir.stability}
                 onChange={(e) => setDirection(l.clip, { ...l.dir, stability: Number(e.target.value) })}
                 title="Kararlılık: düşük = daha ifadeli, yüksek = daha düz" className="h-7 w-16 shrink-0 px-1.5 text-xs md:text-xs" />
        </div>
        <div className="flex flex-wrap items-center gap-1 max-lg:col-start-2">
          <Pill tone={STATUS[st].tone}>{STATUS[st].label}</Pill>
          {/* A08: an explicit, traceable decision -- this take is right for the new text */}
          {st === "stale" && <button type="button" className="text-[11px] font-medium text-primary hover:underline" title="Kaydı dinleyin: yeni metni söylüyorsa onaylayın"
            onClick={() => approveFor(l)}>bu metin için onayla</button>}
        </div>
        <div className="flex items-center justify-end gap-0.5 max-lg:col-start-2 max-lg:justify-start">
          {cur && <PlayButton asset={cur} />}
          <Button variant="ghost" size="sm" onClick={onOpen} className="gap-0.5 px-1.5 text-muted-foreground" title="Denemeler">
            {open ? <ChevronDown /> : <ChevronRight />}{l.takes.length}</Button>
          <input ref={input} type="file" accept="audio/*" className="hidden" onChange={(e) => { upload(e.target.files?.[0]); e.target.value = ""; }} />
          <Button variant="ghost" size="icon-sm" onClick={() => input.current?.click()} title="Kendi kaydını yükle"><Upload /></Button>
          <Button variant="ghost" size="icon-sm" onClick={onGenerate} disabled={!l.text.trim()} title="ElevenLabs ile üret" className="text-primary hover:bg-primary/10 hover:text-primary"><Wand2 /></Button>
        </div>
      </div>
      {open && <Takes l={l} />}
    </li>
  );
}

function Who({ s }: { s: Speaker }) {
  return <span className={cn("inline-flex h-5 items-center rounded-full px-2 text-xs font-medium whitespace-nowrap", SPEAKERS[s].tint)}>{SPEAKERS[s].name}</span>;
}

/** another language's line: its text is written here (a word's meaning only -- the template adds the rest) */
function LocalText({ l }: { l: Line }) {
  const { db, setWordText, setLineText } = useStore();
  const tr = db.i18n[l.lang] ?? { words: {}, lines: {} };
  const field: WordTextField | null = !l.word ? null : l.word.slot === "tr" ? "meaning" : l.word.slot === "about" ? "about"
    : (`part${l.word.slot.slice(5)}` as WordTextField);
  const value = !l.word ? tr.lines[l.clip] ?? ""
    : field === "meaning" ? tr.words[l.word.id]?.meaning ?? "" : field === "about" ? tr.words[l.word.id]?.about ?? ""
    : tr.words[l.word.id]?.parts?.[Number(l.word.slot.slice(5)) - 1] ?? "";
  const tmpl = db.languages.find((x) => x.code === l.lang)?.meaningTemplate ?? "%";
  const [draft, setDraft] = React.useState(value);
  /* the stored text changed elsewhere (another window): show it */
  const [seen, setSeen] = React.useState(value);
  if (seen !== value) { setSeen(value); setDraft(value); }
  const save = () => { if (draft === value) return; if (l.word) setWordText(l.lang, l.word.id, field!, draft); else setLineText(l.lang, l.clip, draft); };
  return (
    <span className="flex min-w-0 flex-1 items-center gap-1.5">
      {field === "meaning" && <span className="text-xs text-muted-foreground">{tmpl.split("%")[0]}</span>}
      <Input value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={save} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
             placeholder={field === "meaning" ? "anlamı" : "çeviri"} aria-label={`${l.clip} çevirisi`}
             className="h-7 min-w-0 flex-1 px-2 font-medium" />
      {field === "meaning" && <span className="text-xs text-muted-foreground">{tmpl.split("%")[1]}</span>}
    </span>
  );
}

function Takes({ l }: { l: Line }) {
  const { db, removeTake, pickTake: pickApp, pickLocaleTake } = useStore();
  const local = l.lang !== APP_LANG && l.lang !== "en";
  const pickTake = (clip: string, asset: string) => {
    if (local) pickLocaleTake(l.lang, clip, asset, l.takes.find((t) => t.asset === asset)?.text ?? l.text);
    else pickApp(clip, asset);
  };
  const model = modelOf(db.voices, l.speaker);
  return (
    <div className="mx-4 mb-3 space-y-2 rounded-lg border bg-muted/40 p-3">
      <div className="text-xs text-muted-foreground">
        Gönderilen metin ({model}): <code className="text-foreground">{sentText(l, model, db.pron)}</code>
      </div>
      {l.takes.length === 0 ? <p className="text-sm text-muted-foreground">Henüz deneme yok: üretin ya da yükleyin.</p> : (
        <ul className="space-y-1.5">
          {l.takes.map((t, i) => {
            const a = db.assets.find((x) => x.id === t.asset);
            const inUse = l.current === t.asset;
            return (
              <li key={t.id} className={cn("flex flex-wrap items-center gap-3 rounded-md border bg-card px-2 py-1.5", inUse && "border-success/40 bg-success/5")}>
                <PlayButton asset={a} />
                <span className="text-sm font-medium">Deneme {l.takes.length - i}</span>
                <Pill>{t.source === "eleven" ? "ElevenLabs" : "yüklendi"}</Pill>
                {t.text !== l.text && <Pill tone="warn">eski metin</Pill>}
                <span className="text-xs text-muted-foreground">{new Date(t.createdAt).toLocaleString("tr")}</span>
                <div className="ml-auto flex items-center gap-1">
                  {inUse ? <Pill tone="ok"><CheckCircle2 /> kullanılıyor</Pill>
                         : <Button variant="secondary" size="sm" onClick={() => pickTake(l.clip, t.asset)}>Bunu kullan</Button>}
                  <Button variant="ghost" size="icon-sm" onClick={() => removeTake(t.id)} title="Denemeyi sil" className="hover:bg-destructive/10 hover:text-destructive"><Trash2 /></Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/* ── generating: always behind a confirmation that shows the cost ────────── */

function Generate({ lines, onClose, onDone }: { lines: Line[]; onClose: () => void; onDone: () => void }) {
  const { db, addAssetMeta, addTake, addLocaleTake } = useStore();
  const hasKey = !!useKeys()?.elevenlabs.set;
  const cost = costOf(lines, db.voices, db.pron);
  /* what would not be said as written: tags a model cannot read, marked words without IPA */
  const tagless = [...new Set(lines.filter((l) => l.dir.tag && !tagsWork(modelOf(db.voices, l.speaker))).map((l) => SPEAKERS[l.speaker].name))];
  const noIpa = [...new Set(lines.flatMap((l) => marksOf(l.text)).filter((w) => !db.pron[w.toLowerCase()]))];
  const noVoice = [...new Set(lines.map((l) => l.speaker))].filter((s) => !db.voices.find((v) => v.speaker === s)?.voiceId);
  const [left, setLeft] = React.useState<number | null>(null);
  const [state, setState] = React.useState<"ready" | "running" | "done">("ready");
  const [progress, setProgress] = React.useState(0);
  const [errors, setErrors] = React.useState<string[]>([]);
  const stop = React.useRef(false);
  React.useEffect(() => {
    credits().then((c) => setLeft(c.limit - c.used)).catch((e: Error) => setErrors([e.message]));
    /* leaving (the page, or the modal) stops the run: no NEW paid line starts
       unseen. The line already out finishes and is kept by the server (A07) */
    return () => { stop.current = true; };
  }, []);
  /* closing the tab mid-run: the browser asks */
  React.useEffect(() => {
    if (state !== "running") return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [state]);
  const run = async () => {
    if (state !== "ready") return;            /* a second click is not a second run */
    setState("running"); stop.current = false;
    for (let i = 0; i < lines.length && !stop.current; i++) {
      const l = lines[i]!;
      const v = db.voices.find((x) => x.speaker === l.speaker)!;
      try {
        /* the server has already stored the mp3 when this returns; the job id
           means a lost answer is read back, never paid for twice (S08) */
        const a = await generate(l, v, db.seed, newJobId(), db.pron, db.pronDict);
        addAssetMeta(a);
        if (l.lang !== APP_LANG && l.lang !== "en") addLocaleTake(l.lang, { clip: l.clip, asset: a.id, text: l.text, source: "eleven" });
        else addTake({ clip: l.clip, asset: a.id, text: l.text, source: "eleven" });
      } catch (e) {
        setErrors((x) => [...x, `${l.clip}: ${(e as Error).message}`]);
        if (/401|403|anahtar/i.test((e as Error).message)) break;
      }
      setProgress(i + 1);
    }
    setState("done"); onDone();
  };
  const blocked = !hasKey || noVoice.length > 0 || (left !== null && left < cost);
  return (
    <Modal title={state === "ready" ? "Üretmeden önce" : state === "running" ? "Üretiliyor…" : "Bitti"}
           locked={state === "running"} onClose={onClose}>
      {state === "ready" && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-px overflow-hidden rounded-lg border bg-border text-center">
            <Figure n={lines.length} label="satır" />
            <Figure n={`≈${cost.toLocaleString("tr")}`} label="kredi" />
            <Figure n={left === null ? "—" : left.toLocaleString("tr")} label="kalan kredi" />
          </div>
          <p className="text-xs text-muted-foreground">Kredi tahminidir: metin + ses etiketi uzunluğu × modelin karakter fiyatı. Yeni kayıt satırın kaydı olur; satırın önceki kaydı ve dosyası silinir.</p>
          {!hasKey && <Warn>ElevenLabs anahtarı ayarlı değil (Ses ayarları).</Warn>}
          {tagless.length > 0 && <Note>{tagless.join(", ")}: seçili model duygu etiketlerini okumaz, etiketler gönderilmeyecek (Eleven v3/v4 seçin).</Note>}
          {noIpa.length > 0 && <Note>IPA'sı olmayan işaretli kelimeler cümlenin diliyle okunabilir: {noIpa.join(", ")} (Telaffuz sekmesi).</Note>}
          {noVoice.map((s) => <Warn key={s}>{SPEAKERS[s].name} için ses seçilmedi.</Warn>)}
          {left !== null && left < cost && <Warn>Kalan kredi bu iş için yetmiyor.</Warn>}
          {errors.map((e, i) => <Warn key={i}>{e}</Warn>)}
          <ModalActions>
            <Button variant="ghost" onClick={onClose}>Vazgeç</Button>
            <Button disabled={blocked} onClick={run}><Sparkles data-icon="inline-start" />{lines.length} satırı üret</Button>
          </ModalActions>
        </div>
      )}
      {state !== "ready" && (
        <div className="space-y-4">
          <Progress value={(progress / lines.length) * 100} className="h-2" />
          <div className="flex items-center gap-2 text-sm font-medium">
            {state === "running" ? <Spinner /> : <CheckCircle2 className="size-4 text-success" />}
            {progress} / {lines.length} satır
          </div>
          {errors.map((e, i) => <Warn key={i}>{e}</Warn>)}
          <ModalActions>
            {state === "running"
              ? <Button variant="destructive" onClick={() => { stop.current = true; }}><Square data-icon="inline-start" />Durdur</Button>
              : <Button onClick={onClose}>Kapat</Button>}
          </ModalActions>
        </div>
      )}
    </Modal>
  );
}

const Figure = ({ n, label }: { n: React.ReactNode; label: string }) => (
  <div className="bg-card p-3"><div className="font-heading text-2xl font-semibold tabular-nums">{n}</div><div className="text-xs text-muted-foreground">{label}</div></div>
);

const Note = ({ children }: { children: React.ReactNode }) => <Notice tone="warn">{children}</Notice>;

const Warn = ({ children }: { children: React.ReactNode }) => <Notice tone="bad" icon={<XCircle />}>{children}</Notice>;

/** the Föy's "Kategorisiz": lines placed in no category */
const NONE = "-";
/* a fixed line's places: an app sentence may be said in several steps */
const placesOf = (l: Line) => l.places?.length ? l.places : l.place ? [l.place] : [];

function EditLine({ line, categories, at, onClose }: {
  line: FixedLine | null; categories: ServerCategory[];
  /** a new line starts where the filter is */
  at: { category: string; step: string } | null; onClose: () => void;
}) {
  const { db, saveLine, removeLine } = useStore();
  const { wordOf } = useVocab();
  const [l, setL] = React.useState<FixedLine>(() => {
    if (!line) return { clip: "teacher/", speaker: "teacher", text: "", group: "Genel", ...(at ?? {}) };
    const p = placeOf(line);
    return p ? { ...line, ...p } : line;
  });
  const cat = categories.find((c) => c.id === l.category);
  /* every step of its own: the two scenes of "Sahne 1" are told apart by their scene */
  const steps = cat ? stepOptions(cat).flatMap((o) => o.steps.map((id) => {
    const s = cat.steps.find((x) => x.id === id);
    const what = o.steps.length > 1 && s && s.kind === "scene" ? ` · ${s.scene}` : "";
    return { id, label: `${o.label}${what}` };
  })) : [];
  const id = l.clip.split("/")[1] ?? "";
  const clip = `${l.speaker}/${id}`;
  const taken = clip !== line?.clip && db.lines.some((x) => x.clip === clip);
  /* A09: a word's clip ids are the word's -- a fixed line may not take one */
  const wordOwned = !!wordSlot(wordOf, clip);
  return (
    <Modal title={line ? "Satırı düzenle" : "Yeni satır"} onClose={onClose}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Konuşan">
            <Select value={l.speaker} onChange={(e) => setL({ ...l, speaker: e.target.value as Speaker })}>
              {(Object.keys(SPEAKERS) as Speaker[]).map((s) => <option key={s} value={s}>{SPEAKERS[s].name}</option>)}
            </Select>
          </FormField>
          <FormField label="Kimlik" hint={<span className={cn((taken || wordOwned) && "text-destructive")}>Dosya: {clip}.mp3{taken ? " — kullanılıyor" : wordOwned ? " — bu bir kelimenin kaydı; başka bir kimlik verin" : ""}</span>}>
            <Input value={id} onChange={(e) => setL({ ...l, clip: `${l.speaker}/${e.target.value.replace(/[^a-z0-9_]/g, "")}` })} placeholder="ör. hello_o" />
          </FormField>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Kategori">
            <Select value={l.category ?? ""} onChange={(e) => {
              const c = categories.find((x) => x.id === e.target.value);
              setL({ ...l, category: c?.id, step: c ? stepOptions(c)[0]?.steps[0] : undefined });
            }}>
              <option value="">Kategorisiz</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
            </Select>
          </FormField>
          <FormField label="Nerede söyleniyor">
            <Select value={l.step ?? ""} disabled={!cat} onChange={(e) => setL({ ...l, step: e.target.value })}>
              {steps.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </Select>
          </FormField>
        </div>
        <FormField label="Metin" hint="İngilizce kelime Türkçe cümlenin içine yazılmaz; ayrı bir satır olarak söylenir.">
          <Textarea value={l.text} onChange={(e) => setL({ ...l, text: e.target.value })} />
        </FormField>
        <ModalActions start={line ? <Button variant="destructive" onClick={() => { removeLine(line.clip); onClose(); }}><Trash2 data-icon="inline-start" />Sil</Button> : undefined}>
          <Button variant="ghost" onClick={onClose}>Vazgeç</Button>
          <Button disabled={!id || !l.text.trim() || taken || wordOwned}
                  onClick={() => {
                    const placed = l.category && l.step;
                    const { category: _c, step: _s, ...bare } = l;
                    saveLine(placed ? { ...l, clip, text: l.text.trim(), group: placeLabel(categories, l.category!, l.step!).slice(0, 80) }
                      : { ...bare, clip, text: l.text.trim() }, line?.clip);
                    onClose();
                  }}>Kaydet</Button>
        </ModalActions>
      </div>
    </Modal>
  );
}

/* ── settings ──────────────────────────────────────────────────────────────── */

function Settings() {
  const { db, saveVoice, setSeed } = useStore();
  const keys = useKeys();
  const [voices, setVoices] = React.useState<Voice[]>([]);
  /* the account's voices, once the server has a key to ask with */
  React.useEffect(() => {
    if (keys?.elevenlabs.set) listVoices().then(setVoices).catch(() => setVoices([]));
  }, [keys?.elevenlabs.set, keys?.elevenlabs.hint]);

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <KeyCard name="elevenlabs" className="lg:col-span-2" hint="elevenlabs.io → Profile → API keys." />
      <Languages />
      {(Object.keys(SPEAKERS) as Speaker[]).map((s) => {
        const v = db.voices.find((x) => x.speaker === s) ?? { speaker: s, voiceId: "", model: "eleven_v3", similarity: 0.8, style: 0.4, speed: 0.92 };
        return <VoiceCard key={s} v={v} voices={voices} onChange={saveVoice} />;
      })}

      <Panel title="Tohum (seed)" description="Bütün kadro için tek tohum: denemeler bir oturumdan ötekine kaymaz (uygulamanın betiği 4242 kullanıyor).">
        <Input type="number" value={db.seed} onChange={(e) => setSeed(Number(e.target.value) || 0)} className="w-40" aria-label="Tohum" />
      </Panel>
    </div>
  );
}

/** who each card is, said plainly: "Kuki" and "Lili" are one letter apart */
const ROLE: Record<Speaker, string> = {
  teacher: "öğretmen · yönergeler, anlamlar ve İngilizce kelimenin kendisi",
  otter: "samur, arkadaş · kendi cümleleri ve İngilizce kelimeyi tekrar edişi",
  bunny: "tavşan, öğrenen · yalnız sahnelerdeki cümleleri",
};

/*
 * ONE SPEAKER'S VOICE, SAVED ON PURPOSE (user, 2026-10-21). Each change used to
 * be written at once, invisibly: a voice picked on the wrong card, or a save
 * that did not go through, looked exactly like one that did. Now the card
 * keeps a draft, says when it has unsaved changes, and "Kaydet" writes it and
 * says how that went. The script and every recording use what was saved.
 */
function VoiceCard({ v, voices, onChange }: { v: VoiceProfile; voices: Voice[]; onChange: (v: VoiceProfile) => void }) {
  const { db, flush, syncError } = useStore();
  const langs = db.languages;
  const [d, setD] = React.useState<VoiceProfile>(v);
  const [state, setState] = React.useState<"idle" | "saving" | "saved" | "failed">("idle");
  const same = (x: VoiceProfile, y: VoiceProfile) => JSON.stringify(x) === JSON.stringify(y);
  const dirty = !same(d, v);
  /* the saved copy changed elsewhere while nothing waits here: show it */
  const saved = JSON.stringify(v);
  React.useEffect(() => { if (!dirty) setD(JSON.parse(saved) as VoiceProfile); }, [saved]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (p: Partial<VoiceProfile>) => { setD((x) => ({ ...x, ...p })); setState("idle"); };
  const save = async () => {
    setState("saving");
    onChange(d);
    /* the document takes the change on the next render; then it is sent */
    await new Promise((r) => setTimeout(r, 50));
    setState((await flush()) ? "saved" : "failed");
  };
  const nameOf = (id?: string) => voices.find((x) => x.voice_id === id)?.name ?? (id || "—");
  const preview = voices.find((x) => x.voice_id === d.voiceId)?.preview_url;
  const pick = (value: string, onPick: (id: string) => void, label: string) => (
    <FormField label={label} hint={voices.length ? undefined : "Anahtar girilince hesabınızdaki sesler listelenir; kimliği elle de yazabilirsiniz."}>
      {voices.length ? (
        <Select value={value} onChange={(e) => onPick(e.target.value)}>
          <option value="">— seçin —</option>
          {voices.map((x) => <option key={x.voice_id} value={x.voice_id}>{x.name}{x.labels?.gender ? ` · ${x.labels.gender}` : ""}{x.labels?.accent ? ` · ${x.labels.accent}` : ""}</option>)}
        </Select>
      ) : <Input value={value} onChange={(e) => onPick(e.target.value.trim())} placeholder="ses kimliği (voice_id)" />}
    </FormField>
  );
  return (
    <Card>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="font-heading font-semibold"><Who s={d.speaker} /></h3>
            <p className="mt-1 text-xs text-muted-foreground">{ROLE[d.speaker]}</p>
          </div>
          {preview && <audio controls src={preview} className="h-8 w-48" />}
        </div>
        <p className="text-xs text-muted-foreground" aria-label={`${SPEAKERS[d.speaker].name} kayıtlı ses`}>
          Kayıtlı: <b className="text-foreground">{nameOf(v.voiceId)}</b>
          {d.speaker !== "bunny" && <> · İngilizce kelimeler: <b className="text-foreground">{v.enVoiceId ? nameOf(v.enVoiceId) : "aynı ses"}</b></>}
          {" · "}{v.model}
        </p>
        {pick(d.voiceId, (id) => set({ voiceId: id }), "Ses")}
        {/* the two who say the English word: a Turkish voice cannot make its
            sounds ("cat" came out "çat", and as IPA "ket"), so each may say it
            in a voice whose language it is (2026-10-21) */}
        {d.speaker !== "bunny" && pick(d.enVoiceId ?? "", (id) => set({ enVoiceId: id || undefined }),
          "İngilizce kelimeler için ses (isteğe bağlı)")}
        {langs.map((l) => <React.Fragment key={l.code}>{pick(d.langVoices?.[l.code] ?? "", (id) => {
          const lv = { ...(d.langVoices ?? {}) };
          if (id) lv[l.code] = id; else delete lv[l.code];
          set({ langVoices: lv });
        }, `${l.name} için ses (boşsa yukarıdaki)`)}</React.Fragment>)}
        <FormField label="Model">
          <Select value={d.model} onChange={(e) => set({ model: e.target.value })}>
            {MODELS.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </Select>
        </FormField>
        <Range label="Benzerlik" value={d.similarity} onChange={(n) => set({ similarity: n })} />
        <Range label="Stil (ifade gücü)" value={d.style} onChange={(n) => set({ style: n })} />
        <Range label="Hız" value={d.speed} min={0.7} max={1.2} onChange={(n) => set({ speed: n })} />
        {d.speaker !== "bunny" && (
          <Range label="İngilizce kelime hızı (tek kelime kayıtları)" value={enSpeedOf(d)} min={0.7} max={1.2}
                 onChange={(n) => set({ enSpeed: n })} />
        )}
        <div className="flex flex-wrap items-center gap-3 border-t pt-3">
          <Button onClick={save} disabled={!dirty || state === "saving"} aria-label={`${SPEAKERS[d.speaker].name} sesini kaydet`}>
            {state === "saving" ? <Spinner data-icon="inline-start" /> : <CheckCircle2 data-icon="inline-start" />}Kaydet</Button>
          {dirty && <Button variant="ghost" onClick={() => { setD(v); setState("idle"); }}>Vazgeç</Button>}
          {dirty ? <span className="text-sm font-medium text-warning">Kaydedilmemiş değişiklik var</span>
            : state === "saved" ? <span className="text-sm font-medium text-success">Kaydedildi · bundan sonraki üretimler bu sesle</span>
            : state === "failed" ? <span className="text-sm font-medium text-destructive">Kaydedilemedi{syncError ? `: ${syncError}` : ""}</span>
            : null}
        </div>
      </CardContent>
    </Card>
  );
}
