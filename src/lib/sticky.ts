/**
 * A CHOICE THAT OUTLIVES ITS SCREEN (user, 2026-10-20).
 *
 * A filter or a tool's dropdown kept its value in `useState`, and the page
 * that owns it unmounts on every tab or page change: pick "Mutfak" in the
 * script, look at the workshop, come back -- and it was "Bütün kategoriler"
 * again. These choices now live under a key, in memory and in the tab's
 * `sessionStorage`, so they survive a tab change, a page change and a reload
 * of the same browser tab. A fresh tab starts from the defaults.
 *
 * Only for how something is LOOKED AT or MADE (a filter, a search, a tab, a
 * model to try) -- never for a record's own field, which is the server's.
 *
 * The key may change (the music model is kept per provider): the value is
 * then the new key's, never the old one carried across.
 *
 * `valid` throws a remembered value away when it no longer fits (a category
 * that was deleted, a set that is gone): the default is used instead. It is
 * asked only once, on reading -- so it must say yes while the list it checks
 * against is still loading, or a good choice is lost before the page has it.
 */
import React from "react";

const PREFIX = "loplop.sticky:";
const memory = new Map<string, unknown>();

function read<T>(key: string): { v: T } | null {
  if (memory.has(key)) return { v: memory.get(key) as T };
  try {
    const s = sessionStorage.getItem(PREFIX + key);
    if (s !== null) return { v: JSON.parse(s) as T };
  } catch { /* private window, blocked storage: memory only */ }
  return null;
}

function write(key: string, v: unknown) {
  memory.set(key, v);
  try { sessionStorage.setItem(PREFIX + key, JSON.stringify(v)); } catch { /* memory only */ }
}

export function useSticky<T>(key: string, initial: T | (() => T), valid?: (v: T) => boolean):
  [T, React.Dispatch<React.SetStateAction<T>>] {
  const first = (): T => {
    const got = read<T>(key);
    if (got && (!valid || valid(got.v))) return got.v;
    return typeof initial === "function" ? (initial as () => T)() : initial;
  };
  const [st, setSt] = React.useState<{ key: string; v: T }>(() => ({ key, v: first() }));
  /* a new key reads its own value, in this same render */
  const now = st.key === key ? st : { key, v: first() };
  if (now !== st) setSt(now);
  const set = React.useCallback<React.Dispatch<React.SetStateAction<T>>>((n) => {
    setSt((p) => {
      const v = typeof n === "function" ? (n as (x: T) => T)(p.key === key ? p.v : (read<T>(key)?.v ?? p.v)) : n;
      write(key, v);
      return { key, v };
    });
  }, [key]);
  return [now.v, set];
}
