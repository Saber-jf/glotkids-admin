/**
 * What every games screen shares: a game's picture, its status, the small
 * editor for the things a list should let you change in place (name, subtitle,
 * picture, status), and the word set a game or a category plays.
 */
import React from "react";
import { BookA, Gamepad2, ImageOff, Plus } from "lucide-react";
import { Link } from "react-router-dom";
import type { CatalogGame, Word } from "../api";
import { useGames } from "../games";
import { useStore } from "../store";
import { setGaps, useVocab } from "../vocab";
import { NEEDED_SLOTS } from "../types";
import { Slot, Thumb } from "./Media";
import { assetUrl } from "../blobs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState, FormField, Modal, ModalActions, Notice, Pill, Select } from "./common";

export const STATUS_LABEL: Record<CatalogGame["status"], string> = {
  live: "Uygulamada", draft: "Taslak", hidden: "Gizli",
};

export function StatusBadge({ status }: { status: CatalogGame["status"] }) {
  return <Pill tone={status === "live" ? "ok" : status === "draft" ? "warn" : "plain"}>{STATUS_LABEL[status]}</Pill>;
}

/**
 * A picture by asset id. The panel's own uploads are in its document; the
 * app's built-in pictures (`app-game-*`, `app-word-*`, installed by the server
 * from the app's own art) are not, so those come straight from the server.
 */
export function GameIcon({ icon, size = 48 }: { icon: string | null | undefined; size?: number }) {
  const { db } = useStore();
  const asset = icon ? db.assets.find((a) => a.id === icon) : undefined;
  if (asset) return <Thumb asset={asset} size={size} />;
  if (icon)
    return <img src={assetUrl(icon)} alt="" style={{ width: size, height: size }}
                className="shrink-0 rounded-md bg-muted/60 object-contain p-1" />;
  return (
    <div style={{ width: size, height: size }}
         className="flex shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
      <Gamepad2 size={size * 0.42} />
    </div>
  );
}

/** name, subtitle, picture and status -- what the list changes in place */
export function QuickEdit({ game, onClose }: { game: CatalogGame; onClose: () => void }) {
  const { update } = useGames();
  const [name, setName] = React.useState(game.name);
  const [subtitle, setSubtitle] = React.useState(game.subtitle);
  const [icon, setIcon] = React.useState(game.icon);
  const [status, setStatus] = React.useState(game.status);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const save = async () => {
    setBusy(true); setError("");
    /* an app game's name is the app's: only its picture and status are the panel's */
    try { await update(game.id, game.builtin ? { icon, status } : { name: name.trim(), subtitle: subtitle.trim(), icon, status }, game.updatedAt); onClose(); }
    catch (e) { setError((e as Error).message); setBusy(false); }
  };
  return (
    <Modal title={`${game.name} · düzenle`} onClose={onClose}>
      <div className="space-y-4">
        {game.builtin && <Notice tone="accent">
          Uygulamanın kendi oyunu: adı, kelimeleri ve menüdeki yeri uygulamanın kodunda. Buradaki resim ve durum
          panelin kaydıdır (gizli oyun kategori akışında seçilmez); telefona yeni bir oyun gitmez.</Notice>}
        <FormField label="Adı" hint="Menüdeki kartta görünen ad.">
          <Input autoFocus value={name} disabled={game.builtin} onChange={(e) => setName(e.target.value)} />
        </FormField>
        <FormField label="Alt yazı" hint="Kartın altındaki kısa satır: ne yapılacağı.">
          <Input value={subtitle} disabled={game.builtin} onChange={(e) => setSubtitle(e.target.value)} />
        </FormField>
        <FormField label="Menü kartı resmi" hint="Okumayı bilmeyen çocuk oyunu resimden seçer. Boşsa uygulama kendi çizimini kullanır.">
          <Slot kind="image" value={icon ?? undefined} onChange={(v) => setIcon(v ?? null)} />
        </FormField>
        <FormField label="Durum">
          <Select value={status} onChange={(e) => setStatus(e.target.value as CatalogGame["status"])}>
            {(Object.keys(STATUS_LABEL) as CatalogGame["status"][]).map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
          </Select>
        </FormField>
        {error && <Notice tone="bad">{error}</Notice>}
        <ModalActions>
          <Button variant="ghost" onClick={onClose}>Vazgeç</Button>
          <Button disabled={busy || !name.trim()} onClick={save}>Kaydet</Button>
        </ModalActions>
      </div>
    </Modal>
  );
}

/* ── the word set a game or a category plays ─────────────────────────────── */

/** one word of a list: picture, English in its colour, Turkish */
export function WordTile({ w, size = 40, warnIcon }: { w: Pick<Word, "icon" | "en" | "tr" | "color">; size?: number; warnIcon?: boolean }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border bg-card p-2">
      <GameIcon icon={w.icon} size={size} />
      <div className="min-w-0 flex-1">
        <div className="truncate font-semibold leading-tight" style={{ color: w.color }}>{w.en}</div>
        <div className="truncate text-xs text-muted-foreground">{w.tr}</div>
      </div>
      {warnIcon && !w.icon && <ImageOff className="size-4 text-destructive" />}
    </div>
  );
}

/**
 * A game or a category does not keep words of its own: it NAMES a word set
 * (rule 11: a series is one set across its games). A fix to a word is then a
 * fix everywhere it is played. The words are edited on the set's own page.
 */
export function SetPicker({ value, onChange, needIcon = true, readOnly }: {
  value: string | null; onChange: (id: string | null) => void; needIcon?: boolean; readOnly?: boolean;
}) {
  const { sets, wordOf, createSet } = useVocab();
  const [making, setMaking] = React.useState(false);
  const set = sets.find((x) => x.id === value);
  const words = (set?.words ?? []).map(wordOf).filter((w): w is Word => !!w);
  const g = setGaps(words, NEEDED_SLOTS.map((x) => x.id));
  const own = sets.filter((x) => !x.builtin), app = sets.filter((x) => x.builtin);
  return (
    <div className="space-y-3">
      {!readOnly && (
        <div className="flex flex-wrap gap-2">
          <Select value={value ?? ""} onChange={(e) => onChange(e.target.value || null)} className="min-w-[260px] flex-1">
            <option value="">— kelime seti seçin —</option>
            {own.length > 0 && <optgroup label="Paneldeki setler">
              {own.map((x) => <option key={x.id} value={x.id}>{x.name} ({x.words.length} kelime)</option>)}
            </optgroup>}
            <optgroup label="Uygulamanın kendi setleri">
              {app.map((x) => <option key={x.id} value={x.id}>{x.name} ({x.words.length} kelime)</option>)}
            </optgroup>
          </Select>
          <Button variant="outline" onClick={() => setMaking(true)}><Plus data-icon="inline-start" />Yeni set</Button>
        </div>
      )}
      {!set ? <EmptyState icon={<BookA />} title="Henüz kelime seti seçilmedi"
                sub="Kelimeler bir setten gelir; aynı set birden çok oyunda ve kategoride kullanılabilir." /> : (
        <div className="rounded-lg border bg-muted/30 p-3">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="font-semibold">{set.name}</span>
            {set.builtin && <Pill>uygulamanın</Pill>}
            {words.length < 2 ? <Pill tone="bad">en az 2 kelime</Pill>
              : (words.length < 5 || words.length > 7) && <Pill tone="warn">bir seri 5–7 kelime</Pill>}
            {needIcon && g.icons > 0 && <Pill tone="bad">{g.icons} kelimenin resmi yok</Pill>}
            {g.sounds > 0 && <Pill tone="warn">{g.sounds} kayıt eksik</Pill>}
            {g.about > 0 && <Pill tone="warn">{g.about} açıklama eksik</Pill>}
            <Button asChild variant="link" size="sm" className="ml-auto h-auto px-0">
              <Link to={`/kelime-setleri/${set.id}`}>Seti düzenle →</Link>
            </Button>
          </div>
          {words.length === 0 ? <p className="text-sm text-muted-foreground">Bu set boş: kelimeleri setin sayfasında ekleyin.</p> : (
            <ul className="grid gap-2 sm:grid-cols-2">
              {words.map((w) => <li key={w.id}><WordTile w={w} warnIcon={needIcon} /></li>)}
            </ul>
          )}
        </div>
      )}
      {making && <NewSetModal onClose={() => setMaking(false)} onMade={(id) => { onChange(id); setMaking(false); }} create={createSet} />}
    </div>
  );
}

/** a new, empty word set: its words are added on its own page */
export function NewSetModal({ onClose, onMade, create }: {
  onClose: () => void; onMade: (id: string) => void;
  create: (s: { name: string; note?: string }) => Promise<{ id: string }>;
}) {
  const [name, setName] = React.useState("");
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  return (
    <Modal title="Yeni kelime seti" description="Set boş açılır; kelimeleri setin sayfasında kütüphaneden seçer ya da yeni kelime olarak eklersiniz." onClose={onClose}>
      <div className="space-y-4">
        <FormField label="Adı"><Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="ör. Deniz Canlıları" /></FormField>
        <FormField label="Not"><Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Bu set neyi öğretiyor?" /></FormField>
        {error && <Notice tone="bad">{error}</Notice>}
        <ModalActions>
          <Button variant="ghost" onClick={onClose}>Vazgeç</Button>
          <Button disabled={!name.trim() || busy} onClick={async () => {
            setBusy(true); setError("");
            try { const s = await create({ name: name.trim(), note: note.trim() }); onMade(s.id); }
            catch (e) { setError((e as Error).message); setBusy(false); }
          }}>Oluştur</Button>
        </ModalActions>
      </div>
    </Modal>
  );
}
