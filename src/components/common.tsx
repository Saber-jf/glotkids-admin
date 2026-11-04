/**
 * The panel's own building blocks, made of shadcn/ui parts: a page header, a
 * labelled field, a status pill, a dialog, notices, empty and loading states.
 * Every page uses these, so the panel reads as one thing.
 */
import * as React from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, ArrowLeft, CheckCircle2, CircleDot, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { NativeSelect } from "@/components/ui/native-select";
import { Progress } from "@/components/ui/progress";
import { Slider } from "@/components/ui/slider";
import { Spinner } from "@/components/ui/spinner";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

/* ── tones ──────────────────────────────────────────────────────────────── */

export type Tone = "ok" | "warn" | "bad" | "accent" | "plain";

/** the soft background + text of a tone, for pills, icon tiles and notices */
export const TONE: Record<Tone, string> = {
  ok: "bg-success/10 text-success",
  warn: "bg-warning/15 text-warning",
  bad: "bg-destructive/10 text-destructive",
  accent: "bg-primary/10 text-primary",
  plain: "bg-muted text-muted-foreground",
};
export const TONE_TEXT: Record<Tone, string> = {
  ok: "text-success", warn: "text-warning", bad: "text-destructive", accent: "text-primary", plain: "text-muted-foreground",
};

/** a small status pill */
export function Pill({ tone = "plain", className, ...rest }: React.ComponentProps<typeof Badge> & { tone?: Tone }) {
  return <Badge className={cn(TONE[tone], className)} {...rest} />;
}

/** this form's own save state -- not the studio document's (UX02) */
export function SaveChip({ state }: { state: "saved" | "dirty" | "saving" | "error" | "stale" }) {
  const k = {
    saved: { tone: "ok" as Tone, icon: <CheckCircle2 />, text: "Kaydedildi" },
    dirty: { tone: "accent" as Tone, icon: <CircleDot />, text: "Değişti" },
    saving: { tone: "accent" as Tone, icon: <Spinner />, text: "Kaydediliyor" },
    error: { tone: "bad" as Tone, icon: <AlertTriangle />, text: "Kaydedilemedi" },
    stale: { tone: "warn" as Tone, icon: <AlertTriangle />, text: "Başka yerde değişti" },
  }[state];
  return <Pill tone={k.tone} className="h-6">{k.icon}{k.text}</Pill>;
}

/** a square tile holding an icon, tinted by tone */
export function IconTile({ tone = "accent", size = "md", className, children }: {
  tone?: Tone; size?: "sm" | "md" | "lg"; className?: string; children: React.ReactNode;
}) {
  return (
    <div className={cn("flex shrink-0 items-center justify-center rounded-lg", TONE[tone],
      size === "sm" ? "size-8 [&_svg]:size-4" : size === "lg" ? "size-12 [&_svg]:size-6" : "size-10 [&_svg]:size-5", className)}>
      {children}
    </div>
  );
}

/* ── page structure ─────────────────────────────────────────────────────── */

export function PageHeader({ title, sub, actions, back, lead, meta }: {
  title: React.ReactNode; sub?: React.ReactNode; actions?: React.ReactNode;
  /** a link back to the list this page belongs to */
  back?: { to: string; label: string };
  /** a picture before the title */
  lead?: React.ReactNode;
  /** a small line under the title (ids, counts) */
  meta?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="flex min-w-0 items-center gap-3">
        {back && (
          <Button asChild variant="ghost" size="icon" title={back.label}>
            <Link to={back.to}><ArrowLeft /></Link>
          </Button>
        )}
        {lead}
        <div className="min-w-0">
          <h1 className="truncate font-heading text-2xl font-semibold tracking-tight">{title}</h1>
          {meta && <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">{meta}</div>}
          {sub && <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{sub}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/** a titled group of content on a page */
export function Section({ title, count, sub, icon, children, className }: {
  title: React.ReactNode; count?: number; sub?: React.ReactNode; icon?: React.ReactNode;
  children: React.ReactNode; className?: string;
}) {
  return (
    <section className={className}>
      <div className="mb-3">
        <h2 className="flex items-center gap-2 font-heading text-base font-semibold tracking-tight [&_svg]:size-4 [&_svg]:text-muted-foreground">
          {icon}{title}{count !== undefined && <span className="font-normal text-muted-foreground">{count}</span>}
        </h2>
        {sub && <p className="mt-0.5 text-sm text-muted-foreground">{sub}</p>}
      </div>
      {children}
    </section>
  );
}

/** a card with a header (title, optional description and action) and a body */
export function Panel({ title, description, action, icon, children, className, contentClassName }: {
  title: React.ReactNode; description?: React.ReactNode; action?: React.ReactNode; icon?: React.ReactNode;
  children?: React.ReactNode; className?: string; contentClassName?: string;
}) {
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 [&_svg]:size-4">{icon}{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
        {action && <CardAction>{action}</CardAction>}
      </CardHeader>
      {children !== undefined && <CardContent className={contentClassName}>{children}</CardContent>}
    </Card>
  );
}

/* ── forms ──────────────────────────────────────────────────────────────── */

/** a label around its control, with an optional hint under it */
export function FormField({ label, hint, children, className }: {
  label: React.ReactNode; hint?: React.ReactNode; children: React.ReactNode; className?: string;
}) {
  return (
    <label className={cn("grid min-w-0 gap-1.5", className)}>
      <span className="text-sm font-medium leading-none">{label}</span>
      {children}
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </label>
  );
}

/** the browser's own select (kept native: it is fast, accessible and testable), shadcn-styled */
export function Select({ className, ...rest }: React.ComponentProps<typeof NativeSelect>) {
  return <NativeSelect className={cn("w-full", className)} {...rest} />;
}

export function SearchField({ value, onChange, placeholder, className, autoFocus }: {
  value: string; onChange: (v: string) => void; placeholder: string; className?: string; autoFocus?: boolean;
}) {
  return (
    <InputGroup className={cn("w-full max-w-xs", className)}>
      <InputGroupAddon><Search /></InputGroupAddon>
      <InputGroupInput autoFocus={autoFocus} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </InputGroup>
  );
}

/** single-choice filter chips */
export function Chips<T extends string>({ value, onChange, items, className }: {
  value: T; onChange: (v: T) => void; className?: string;
  items: readonly { id: T; label: React.ReactNode }[];
}) {
  return (
    <ToggleGroup type="single" variant="outline" size="sm" spacing={1} value={value}
                 onValueChange={(v) => { if (v) onChange(v as T); }} className={cn("flex-wrap", className)}>
      {items.map((i) => (
        <ToggleGroupItem key={i.id} value={i.id}
          className="data-[state=on]:border-primary/40 data-[state=on]:bg-primary/10 data-[state=on]:text-primary">
          {i.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

/** a labelled progress bar */
export function Meter({ label, have, of, className }: { label: React.ReactNode; have: number; of: number; className?: string }) {
  const pct = of ? Math.round((have / of) * 100) : 0;
  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex justify-between text-sm"><span className="font-medium">{label}</span><span className="text-muted-foreground tabular-nums">{have}/{of}</span></div>
      <Progress value={pct} className={cn("h-1.5", pct === 100 && "[&>[data-slot=progress-indicator]]:bg-success")} />
    </div>
  );
}

/** a labelled slider with its value */
export function Range({ label, value, onChange, min = 0, max = 1, step = 0.01 }: {
  label: string; value: number; onChange: (n: number) => void; min?: number; max?: number; step?: number;
}) {
  return (
    <div className="space-y-2.5">
      <div className="flex justify-between text-sm"><span className="font-medium">{label}</span><span className="text-muted-foreground tabular-nums">{value.toFixed(2)}</span></div>
      <Slider min={min} max={max} step={step} value={[value]} onValueChange={([n]) => onChange(n!)} aria-label={label} />
    </div>
  );
}

/* ── feedback ───────────────────────────────────────────────────────────── */

/** a message across the page: an error, a warning, a note */
export function Notice({ tone = "plain", icon, children, action, className }: {
  tone?: Tone; icon?: React.ReactNode; children: React.ReactNode; action?: React.ReactNode; className?: string;
}) {
  const ring: Record<Tone, string> = {
    ok: "border-success/30 bg-success/5 text-success", warn: "border-warning/30 bg-warning/5 text-warning",
    bad: "border-destructive/30 bg-destructive/5 text-destructive", accent: "border-primary/25 bg-primary/5 text-primary",
    plain: "bg-muted/50 text-muted-foreground",
  };
  return (
    <div role={tone === "bad" ? "alert" : undefined}
         className={cn("flex flex-wrap items-start gap-x-2.5 gap-y-2 rounded-lg border px-3 py-2.5 text-sm [&>svg]:mt-0.5 [&>svg]:size-4 [&>svg]:shrink-0", ring[tone], className)}>
      {icon}
      <div className="min-w-0 flex-1 basis-60">{children}</div>
      {action && <div className="flex flex-wrap items-center gap-2">{action}</div>}
    </div>
  );
}

export function Loading({ children = "Yükleniyor…", className }: { children?: React.ReactNode; className?: string }) {
  return <div className={cn("flex items-center gap-2 text-sm text-muted-foreground", className)}><Spinner />{children}</div>;
}

export function EmptyState({ icon, title, sub, action, className }: {
  icon: React.ReactNode; title: React.ReactNode; sub?: React.ReactNode; action?: React.ReactNode; className?: string;
}) {
  return (
    <Empty className={cn("border", className)}>
      <EmptyHeader>
        <EmptyMedia variant="icon">{icon}</EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        {sub && <EmptyDescription>{sub}</EmptyDescription>}
      </EmptyHeader>
      {action && <EmptyContent>{action}</EmptyContent>}
    </Empty>
  );
}

/* ── dialogs ────────────────────────────────────────────────────────────── */

/**
 * A dialog that is open while it is rendered: the caller mounts it and
 * closes it with `onClose`. `locked` keeps it open (a paid run in progress).
 */
export function Modal({ title, description, onClose, children, wide, locked }: {
  title: React.ReactNode; description?: React.ReactNode; onClose: () => void; children: React.ReactNode;
  wide?: boolean; locked?: boolean;
}) {
  return (
    <Dialog open onOpenChange={(o) => { if (!o && !locked) onClose(); }}>
      <DialogContent showCloseButton={!locked}
        className={cn("max-h-[calc(100vh-4rem)] gap-5 overflow-y-auto p-5", wide ? "sm:max-w-3xl" : "sm:max-w-lg")}
        onInteractOutside={(e) => { if (locked) e.preventDefault(); }}
        /* nothing in it asked for focus: the dialog itself takes it, not its first button */
        onOpenAutoFocus={(e) => { e.preventDefault(); (e.currentTarget as HTMLElement).focus(); }}>
        <DialogHeader className="pr-8">
          <DialogTitle className="text-lg font-semibold">{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : <DialogDescription className="sr-only">{title}</DialogDescription>}
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}

/** the row of buttons at the end of a dialog */
export function ModalActions({ children, start }: { children: React.ReactNode; start?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-4">
      <div>{start}</div>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

/* ── small things ───────────────────────────────────────────────────────── */

/** a key/value line in a definition list */
export function Row({ k, v }: { k: React.ReactNode; v: React.ReactNode }) {
  return (
    <div className="flex gap-3 py-1.5 text-sm">
      <dt className="w-24 shrink-0 text-muted-foreground">{k}</dt>
      <dd className="min-w-0 font-medium">{v}</dd>
    </div>
  );
}

/** a word in its own colour: the colour is the word's (rule: a word carries its colour everywhere) */
export function WordChip({ en, color, className }: { en: string; color: string; className?: string }) {
  return <span className={cn("inline-flex h-6 items-center rounded-full px-2.5 text-xs font-semibold text-white", className)} style={{ background: color }}>{en}</span>;
}

export const fmtSize = (n: number) =>
  n === 0 ? "" : n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`;
