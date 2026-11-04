/**
 * ONE WAY TO SAVE A FORM A MOMENT AFTER THE LAST CHANGE (F01).
 *
 * The roadmap, pack, song and mascot editors each had their own timer, and
 * all four lost the last edit the same way: leaving the step or the page
 * within 600–700 ms cleared the timer and nothing was sent. Some also marked
 * the value "sent" before the server answered, so a failed save was never
 * tried again with the same value.
 *
 * Here:
 *   - a value is marked saved only when the server said so;
 *   - one request per form at a time; the newest value wins;
 *   - unmounting SENDS what is waiting instead of dropping it;
 *   - every form with something unsent is in one registry, so the publish
 *     page (`flushEdits`) and the tab's close (`beforeunload`) can wait for
 *     or warn about it;
 *   - a failure keeps the draft on screen and is retried by `retry()` or the
 *     next change -- never in a loop on its own.
 *
 * The categories have their own queue (`categories.tsx`) and the studio
 * document its own (`store.tsx`); both already did this and are untouched.
 */
import React from "react";
import { useBlocker } from "react-router-dom";
import { codeOf } from "../api";

export type AutosaveState = "saved" | "dirty" | "saving" | "error" | "stale";

/** a save says it failed by throwing, or by answering `false` (a caller that shows its own error) */
type SaveFn<T> = (v: T) => Promise<unknown> | unknown;

interface Entry {
  label: string; dirty: () => boolean; flush: () => Promise<boolean>; drop: () => void; message: () => string;
  /** the form is gone from the screen and its last save failed: kept until it lands or is given up */
  orphan?: boolean;
}
const live = new Map<symbol, Entry>();
/* who shows the orphans (the layout's banner) */
const listeners = new Set<() => void>();
let snapshot: { key: symbol; label: string; message: string }[] = [];
const changed = () => {
  snapshot = [...live.entries()].filter(([, e]) => e.orphan).map(([key, e]) => ({ key, label: e.label, message: e.message() || "kaydedilemedi" }));
  listeners.forEach((f) => f());
};

/** send every form's waiting edit -- those still on screen and those left
 *  behind by a page that closed with a failed save -- and wait for the answers */
export async function flushEdits(): Promise<boolean> {
  const all = await Promise.all([...live.entries()].map(async ([key, e]) => {
    const ok = await e.flush();
    if (e.orphan && ok) live.delete(key);
    return ok;
  }));
  changed();
  return all.every(Boolean);
}
export const unsavedEdits = () => [...live.values()].some((e) => e.dirty());

/** edits of pages already closed whose save failed (the layout shows them, with retry) */
export function useOrphanEdits() {
  return React.useSyncExternalStore((f) => { listeners.add(f); return () => { listeners.delete(f); }; }, () => snapshot);
}
/** give up one left-behind edit (the server's version stays) */
export function dropOrphan(key: symbol) {
  live.get(key)?.drop();
  live.delete(key);
  changed();
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", (e) => {
    if (!unsavedEdits()) return;
    e.preventDefault();
    e.returnValue = "";
  });
}

export interface Autosave {
  state: AutosaveState;
  message: string;
  /** send now (and wait); true when the value on screen is the one the server has */
  flush: () => Promise<boolean>;
  /** after a failure: try the same value again */
  retry: () => Promise<boolean>;
  /** forget what is waiting (the server's version is being taken instead) */
  discard: () => void;
}

export function useAutosave<T>(value: T, save: SaveFn<T>, opts: { ms?: number; skip?: (v: T) => boolean; label?: string } = {}): Autosave {
  const ms = opts.ms ?? 700;
  const key = React.useRef(Symbol("autosave")).current;
  const latest = React.useRef(value);
  latest.current = value;
  const saveRef = React.useRef(save);
  saveRef.current = save;
  const skipRef = React.useRef(opts.skip);
  skipRef.current = opts.skip;
  /* what the server last confirmed */
  const confirmed = React.useRef(JSON.stringify(value));
  const flying = React.useRef<Promise<boolean> | null>(null);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = React.useRef(true);
  const failed = React.useRef(false);
  const [state, setStateRaw] = React.useState<AutosaveState>("saved");
  const [message, setMessageRaw] = React.useState("");
  const setState = (s: AutosaveState) => { if (mounted.current) setStateRaw(s); };
  const lastMessage = React.useRef("");
  const setMessage = (m: string) => { lastMessage.current = m; if (mounted.current) setMessageRaw(m); };

  const waiting = () => {
    const v = latest.current;
    return JSON.stringify(v) !== confirmed.current && !(skipRef.current?.(v) ?? false);
  };

  const run = React.useCallback(async (): Promise<boolean> => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    if (flying.current) await flying.current;
    if (!waiting()) { failed.current = false; setState("saved"); return true; }
    const job = (async () => {
      /* the newest value at each turn: a change made while a request flies is sent after it */
      for (;;) {
        const v = latest.current;
        const text = JSON.stringify(v);
        if (text === confirmed.current || (skipRef.current?.(v) ?? false)) { setState("saved"); return true; }
        setState("saving");
        try {
          const out = await saveRef.current(v);
          if (out === false) throw new Error("");
          confirmed.current = text;
          failed.current = false;
          setMessage("");
        } catch (e) {
          failed.current = true;
          setMessage((e as Error).message);
          setState(codeOf(e) === "STALE" ? "stale" : "error");
          return false;
        }
      }
    })();
    flying.current = job;
    try { return await job; } finally { if (flying.current === job) flying.current = null; }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* a change: wait a moment, then send */
  const text = JSON.stringify(value);
  React.useEffect(() => {
    if (!waiting()) return;
    failed.current = false;
    setState("dirty");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { timer.current = null; void run(); }, ms);
  }, [text]); // eslint-disable-line react-hooks/exhaustive-deps

  /* registered while mounted; on unmount whatever waits is SENT, and stays
     registered until it lands so publishing still waits for it */
  React.useEffect(() => {
    mounted.current = true;
    const entry: Entry = { label: opts.label ?? "Bir düzenleme", dirty: waiting, flush: run,
                           drop: () => { confirmed.current = JSON.stringify(latest.current); }, message: () => lastMessage.current };
    live.set(key, entry);
    return () => {
      mounted.current = false;
      if (!waiting()) { live.delete(key); return; }
      /* the page closed with an edit unsent: send it; if that fails the edit is
         NOT forgotten -- it stays here, the layout says so and offers a retry,
         and publishing waits for it (review, 2026-10-19) */
      void run().then((ok) => {
        if (ok) live.delete(key);
        else { entry.orphan = true; changed(); }
      });
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const discard = React.useCallback(() => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    confirmed.current = JSON.stringify(latest.current);
    failed.current = false;
    setState("saved"); setMessage("");
  }, []);

  return { state, message, flush: run, retry: run, discard };
}

/**
 * A form saved by its own button (the game editor): nothing is sent on its
 * own, but leaving it with changes asks first -- closing the tab, a link, a
 * `navigate()`, and the browser's back and forward buttons (`useBlocker`,
 * which needs the data router set up in `main.tsx`).
 */
export function useUnsavedGuard(dirty: boolean, message = "Kaydedilmemiş değişiklikler var. Sayfadan çıkılsın mı?") {
  const blocker = useBlocker(({ currentLocation, nextLocation }) =>
    dirty && (currentLocation.pathname !== nextLocation.pathname || currentLocation.search !== nextLocation.search));
  React.useEffect(() => {
    if (blocker.state !== "blocked") return;
    if (window.confirm(message)) blocker.proceed(); else blocker.reset();
  }, [blocker, message]);
  React.useEffect(() => {
    if (!dirty) return;
    const unload = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", unload);
    return () => window.removeEventListener("beforeunload", unload);
  }, [dirty]);
}
