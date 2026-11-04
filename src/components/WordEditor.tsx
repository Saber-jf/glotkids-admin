/**
 * One word, edited where it lives: the server's vocabulary. The same editor
 * opens from the word library, from a word set and from the voice studio,
 * because a word is one row everywhere -- its English, Turkish, description
 * (rule 10), kind, colour, picture and recordings.
 *
 * The app's own words (`builtin`) are the app's: text, colour and picture
 * are its code, and on a phone the app's own word always wins (CLAUDE.md
 * rule 20). What the panel CAN give them is recordings -- a release carries
 * a take to phones and it plays in place of the bundled one.
 */
import React from "react";
import { AlertTriangle, Lock, Trash2 } from "lucide-react";
import type { Slot, Word, WordKind } from "../api";
import { useCategories } from "../categories";
import { useVocab, wordIdOf } from "../vocab";
import { slotClip, useStore } from "../store";
import { codeOf } from "../api";
import { partsOf, slotText } from "../studio";
import { PALETTE, SOUND_SLOTS } from "../types";
import { GameIcon } from "./GameParts";
import { Slot as FileSlot } from "./Media";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FormField, Modal, ModalActions, Notice, Pill, Select } from "./common";

export const KIND_LABEL: Record<WordKind, string> = {
  thing: "Nesne", action: "Hareket (fiil)", feeling: "Duygu", size: "Ölçü", place: "Konum",
  colour: "Renk", number: "Sayı",
};

interface Draft { en: string; tr: string; about: string; kind: WordKind; color: string; icon: string | null }

export function WordEditor({ word, onClose, onCreated, color }: {
  /** null: a new word */
  word: Word | null; onClose: () => void; onCreated?: (w: Word) => void; color?: string;
}) {
  const { createWord, updateWord, removeWord, setAudio, clearAudio, sets, inventory, wordOf } = useVocab();
  const { categories } = useCategories();
  const live = word ? wordOf(word.id) ?? word : null;
  const ro = !!live?.builtin;
  const [d, setD] = React.useState<Draft>(live
    ? { en: live.en, tr: live.tr, about: live.about, kind: live.kind, color: live.color, icon: live.icon }
    : { en: "", tr: "", about: "", kind: "thing", color: color ?? PALETTE[0]!, icon: null });
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  /* the version this editor opened on: a save after someone else's is refused, not merged blind (A02) */
  const base = React.useRef(live?.updatedAt);
  const { addTake } = useStore();
  const id = live?.id ?? wordIdOf(d.en);
  const taken = !live && !!id && !!wordOf(id);
  const ok = !!id && !taken && !!d.en.trim() && !!d.tr.trim();
  const parts = live ? partsOf(inventory, live.id) : [];
  const inSets = live ? sets.filter((s) => s.words.includes(live.id)) : [];

  const save = async () => {
    setBusy(true); setError("");
    try {
      if (!live) {
        const w = await createWord({ id, en: d.en.trim(), tr: d.tr.trim(), about: d.about.trim(), kind: d.kind, color: d.color, icon: d.icon });
        onCreated?.(w);
      } else {
        await updateWord(live.id, { en: d.en.trim(), tr: d.tr.trim(), about: d.about.trim(), kind: d.kind, color: d.color, icon: d.icon },
                         base.current);
      }
      onClose();
    } catch (e) {
      setError(codeOf(e) === "STALE"
        ? "Bu kelime siz düzenlerken başka bir yerde değişti; değişikliğiniz yazılmadı. Pencereyi kapatıp yeniden açın, sonra tekrar deneyin."
        : (e as Error).message);
      setBusy(false);
    }
  };
  const recording = async (slot: Slot, asset: string | undefined) => {
    if (!live) return;
    try {
      /* a new file is the slot's recording, and the earlier one goes -- the
         studio's rule, one recording per line (`addTake`) */
      if (asset) addTake({ clip: slotClip(live.id, slot), asset, text: slotText({ ...live, ...d }, slot, parts), source: "upload" });
      else await clearAudio(live.id, slot);
    } catch (e) { setError((e as Error).message); }
  };
  /* the slots this word has: the needed ones, the sentence parts it is said
     in, and its own sound if it already has one */
  const slots = SOUND_SLOTS.filter((s) => !s.optional
    || (s.id.startsWith("about") && Number(s.id.slice(5)) <= parts.length)
    || s.id === "call");

  return (
    <Modal title={live ? `${live.en} · kelime` : "Yeni kelime"} onClose={onClose} wide>
      {ro && (
        <Notice tone="accent" icon={<Lock />}>
          Uygulamanın kendi kelimesi: metni, rengi ve resmi uygulamanın kodunda; telefonda hep uygulamanınki kullanılır.
          Kayıt verilebilir — bir yayınla telefona gider ve paketteki kaydın yerine çalar.
        </Notice>
      )}
      {live && !ro && (() => {
        /* UX01: a word is one row -- a fix here is a fix everywhere it plays */
        const mine = sets.filter((x) => x.words.includes(live.id));
        const cats = categories.filter((c) => mine.some((x) => x.id === c.set));
        return mine.length > 1 || cats.length > 0
          ? <Notice tone="plain">Bu kelime {mine.length} sette ({mine.map((x) => x.name).join(", ")}){cats.length ? ` ve ${cats.length} kategoride (${cats.map((c) => c.title).join(", ")})` : ""}: buradaki değişiklik hepsinde geçerli olur.</Notice>
          : null;
      })()}
      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-4">
          <FormField label="İngilizce" hint={!live ? (id ? `Kimlik: ${id}${taken ? " — bu kelime zaten var; kütüphaneden ekleyin" : ""}` : "Öğretmenin tek başına, temiz söylediği kelime")
                                         : `Kimlik: ${live.id} (değişmez)`}>
            <Input autoFocus={!live} disabled={ro} value={d.en} onChange={(e) => setD({ ...d, en: e.target.value })} placeholder="ör. fish" />
          </FormField>
          <FormField label="Türkçe anlamı"><Input disabled={ro} value={d.tr} onChange={(e) => setD({ ...d, tr: e.target.value })} placeholder="ör. balık" /></FormField>
          <FormField label="Açıklama cümlesi" hint="Türkçe anlamından sonra söylenir; 1–3 kısa cümle, içinde İngilizce kelime geçmez. Kartta yazılmaz (kural 10).">
            <Textarea disabled={ro} value={d.about} onChange={(e) => setD({ ...d, about: e.target.value })} placeholder="ör. Balık suda yaşar, yüzgeçleriyle yüzer." />
          </FormField>
          <FormField label="Türü" hint="Öğretme cümlesinin kalıbı türe göre seçilir (“Bak. Bu bir …” yalnızca nesne için).">
            <Select disabled={ro} value={d.kind} onChange={(e) => setD({ ...d, kind: e.target.value as WordKind })}>
              {(Object.keys(KIND_LABEL) as WordKind[]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
            </Select>
          </FormField>
          <FormField label="Renk" hint="Kelime bu rengi her yerde taşır: kart, etiket, cümle. Beyaz üstünde okunur olmalı.">
            <div className="flex flex-wrap items-center gap-1.5">
              {PALETTE.map((c) => (
                <button key={c} type="button" disabled={ro} onClick={() => setD({ ...d, color: c })} style={{ background: c }}
                        className={cn("size-7 rounded-md transition-transform hover:scale-110 disabled:hover:scale-100",
                          d.color.toLowerCase() === c.toLowerCase() && "ring-2 ring-ring ring-offset-2 ring-offset-background")} aria-label={c} />
              ))}
              <input type="color" disabled={ro} value={d.color} onChange={(e) => setD({ ...d, color: e.target.value })} className="h-7 w-9 cursor-pointer rounded-md border bg-transparent" />
            </div>
          </FormField>
          <FormField label="Resim" hint="Kare, şeffaf arka planlı PNG (önerilen 384×384). Görsel stüdyosunda da üretilebilir.">
            {ro ? <GameIcon icon={d.icon} size={64} />
                : <FileSlot kind="image" value={d.icon ?? undefined} onChange={(v) => setD({ ...d, icon: v ?? null })} />}
          </FormField>
        </div>
        <div className="space-y-4">
          <div className="rounded-xl border p-5 text-center" style={{ background: `${d.color}14` }}>
            <div className="mx-auto mb-3 w-fit"><GameIcon icon={d.icon} size={88} /></div>
            <div className="font-heading text-3xl font-semibold tracking-tight" style={{ color: d.color }}>{d.en || "…"}</div>
            <div className="text-muted-foreground">{d.tr || "…"}</div>
          </div>
          {live ? (
            <div>
              <div className="mb-2 text-sm font-medium">Ses kayıtları</div>
              <div className="space-y-2">
                {slots.map((sl) => {
                  const a = live.audio[sl.id];
                  const want = slotText({ ...live, ...d }, sl.id, parts);
                  const stale = !!a?.text && !!want && a.text !== want;
                  return (
                    <div key={sl.id}>
                      <FileSlot kind="audio" compact value={a?.asset}
                                label={`${sl.who} · ${sl.label}${sl.optional && sl.id === "call" ? " (isteğe bağlı)" : ""}`}
                                onChange={(v) => recording(sl.id, v)} />
                      {want && <div className="mt-1 pl-1 text-[11px] text-muted-foreground">“{want}”
                        {stale && <span className="ml-1 font-medium text-warning"><AlertTriangle className="inline size-3" /> kayıt eski metinden · yayına girmez
                          <button type="button" className="ml-1 text-primary underline-offset-2 hover:underline" title="Kaydı dinleyin: yeni metni söylüyorsa onaylayın"
                            onClick={() => a && setAudio(live.id, sl.id, a.asset, want, a.durationMs).catch((e: Error) => setError(e.message))}>
                            bu metin için onayla</button></span>}
                        {a?.durationMs && a.durationMs > 20_000 ? <span className="ml-1 font-medium text-warning">· {Math.round(a.durationMs / 1000)} sn, uzun</span> : null}</div>}
                    </div>
                  );
                })}
              </div>
              <p className="mt-2 text-xs text-muted-foreground">Kaydı Ses stüdyosunda üretebilir ya da buraya kendi MP3'ünüzü bırakabilirsiniz. Eksik kayıt telefonda Türkçe cihaz sesiyle okunur; Türkçe ses yoksa susulur.</p>
            </div>
          ) : <Notice>Kayıtlar kelime oluşturulunca eklenir.</Notice>}
          {inSets.length > 0 && (
            <div className="space-y-1.5 text-xs text-muted-foreground">
              <div className="flex flex-wrap items-center gap-1">Bu kelime şu setlerde: {inSets.map((s) => <Pill key={s.id}>{s.name}</Pill>)}</div>
              <div>Buradaki değişiklik hepsinde görünür.</div>
            </div>
          )}
        </div>
      </div>
      {error && <Notice tone="bad">{error}</Notice>}
      <ModalActions start={live && !ro ? <Button variant="destructive" disabled={inSets.length > 0}
          title={inSets.length ? "Önce setlerden çıkarın" : undefined}
          onClick={async () => {
            if (!confirm(`"${live.en}" kütüphaneden silinsin mi?`)) return;
            try { await removeWord(live.id); onClose(); } catch (e) { setError((e as Error).message); }
          }}><Trash2 data-icon="inline-start" />Kelimeyi sil</Button> : undefined}>
        <Button variant="ghost" onClick={onClose}>{live ? "Kapat" : "Vazgeç"}</Button>
        {!ro && <Button disabled={!ok || busy} onClick={save}>{live ? "Kaydet" : "Oluştur"}</Button>}
      </ModalActions>
    </Modal>
  );
}
