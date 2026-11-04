/**
 * The categories as the panel holds them: the server's list, changed only
 * through it. Each one comes back with its `issues`, worked out by the server
 * -- the same check that decides whether it may go live.
 *
 * SAVING OUTLIVES THE SCREEN (A01). An edit is not saved by the editor page:
 * it is handed to a queue here, at the root, which outlives every page. A
 * change made a moment before leaving for the list or the publish page is
 * still sent; `flush` waits for it. One request per category at a time, the
 * latest draft wins, and status changes ride in the same queue as the body,
 * so the two can never be sent in the wrong order.
 *
 * NOTHING OVERWRITTEN UNSEEN (A02). Each save names the version it started
 * from (`If-Match`); if another tab saved first the server refuses (409
 * `STALE`) and the draft is KEPT, marked `conflict`, with the server's
 * version beside it -- the editor decides: take theirs, or write mine over it.
 *
 * A TAB CLOSED MID-EDIT (A01). Unsent drafts are mirrored in this browser's
 * storage, named by the server they belong to; on the next visit they are
 * offered back, never sent on their own.
 */
import React from "react";
import { codeOf, bodyOf, createCategory, deleteCategory, health, listCategories, patchCategory,
         type CategoryPatch, type ServerCategory } from "./api";

export type SaveState = "saved" | "dirty" | "saving" | "error" | "conflict";
export interface Pending {
  body: CategoryPatch;
  /** the server version this draft started from */
  base: number;
  state: SaveState;
  message: string;
  /** on a conflict: the server's version, to compare */
  theirs?: ServerCategory;
}

interface Categories {
  categories: ServerCategory[];
  loading: boolean;
  error: string;
  refresh: () => Promise<void>;
  create: (c: { title: string; subtitle?: string; icon?: string | null; set?: string | null }) => Promise<ServerCategory>;
  /** an immediate, one-off write (no queue): for things the editor does not hold */
  update: (id: string, p: CategoryPatch) => Promise<ServerCategory>;
  remove: (id: string) => Promise<void>;
  /** the queue */
  pending: Record<string, Pending>;
  /** a new draft for a category: saved shortly (or at once with `now`) */
  edit: (id: string, body: CategoryPatch, opts?: { now?: boolean }) => void;
  /** send what is waiting and wait for the answers; true when nothing failed */
  flush: (id?: string) => Promise<boolean>;
  /** a conflict: take the server's version (drops the draft) or write the draft over it */
  resolve: (id: string, how: "theirs" | "mine") => Promise<void>;
  /** drafts from an earlier visit, offered back -- never sent on their own */
  recovered: Record<string, { body: CategoryPatch; base: number; at: number }>;
  restore: (id: string) => void;
  dismiss: (id: string) => void;
}

const Ctx = React.createContext<Categories | null>(null);
const DELAY_MS = 700;
const STORE_KEY = "loplop-admin/category-drafts";

export function CategoriesProvider({ children }: { children: React.ReactNode }) {
  const [categories, setCategories] = React.useState<ServerCategory[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [pending, setPending] = React.useState<Record<string, Pending>>({});
  const [recovered, setRecovered] = React.useState<Categories["recovered"]>({});
  const live = React.useRef<Record<string, Pending>>({});
  const timers = React.useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const flying = React.useRef<Record<string, Promise<void>>>({});
  const server = React.useRef("");
  /* a save that failed for want of a server is tried again, further apart each time */
  const tries = React.useRef<Record<string, number>>({});
  const known = React.useRef<ServerCategory[]>([]);
  known.current = categories;

  const show = () => setPending({ ...live.current });
  /* the newest version wins: an answer older than what we hold never replaces it */
  const put = (c: ServerCategory) =>
    setCategories((l) => (l.some((x) => x.id === c.id)
      ? l.map((x) => (x.id === c.id && x.updatedAt <= c.updatedAt ? c : x)) : [...l, c]));

  /* this browser's copy of what is not yet saved, for the server it belongs to */
  const mirror = () => {
    if (!server.current) return;
    try {
      const keep = Object.fromEntries(Object.entries(live.current)
        .filter(([, p]) => p.state !== "saved").map(([id, p]) => [id, { body: p.body, base: p.base, at: Date.now() }]));
      const all = JSON.parse(localStorage.getItem(STORE_KEY) ?? "{}") as Record<string, unknown>;
      all[server.current] = keep;
      localStorage.setItem(STORE_KEY, JSON.stringify(all));
    } catch { /* storage full or blocked: the in-memory queue still saves */ }
  };

  const refresh = React.useCallback(async () => {
    try { setCategories(await listCategories()); setError(""); } catch (e) { setError((e as Error).message); }
    setLoading(false);
  }, []);
  React.useEffect(() => {
    void refresh();
    health().then((h) => {
      server.current = h.instance ?? "";
      try {
        const all = JSON.parse(localStorage.getItem(STORE_KEY) ?? "{}") as Record<string, Categories["recovered"]>;
        setRecovered(all[server.current] ?? {});
      } catch { /* nothing kept */ }
    }).catch(() => {});
  }, [refresh]);

  /* leaving with unsent work: the browser asks first */
  React.useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (Object.values(live.current).some((p) => p.state !== "saved")) { e.preventDefault(); e.returnValue = ""; }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);

  /** send one category's draft; one request at a time, then again if it changed meanwhile */
  const send = (id: string): Promise<void> => {
    const out = flying.current[id] as Promise<void> | undefined;
    if (out) return out;
    const run = (async () => {
      for (;;) {
        const p = live.current[id];
        if (!p || p.state === "saved" || p.state === "conflict") return;
        const body = p.body;
        live.current[id] = { ...p, state: "saving", message: "" }; show();
        try {
          const r = await patchCategory(id, body, p.base);
          put(r);
          const now = live.current[id]!;
          /* changed again while the request was out: send that next, from the new version */
          tries.current[id] = 0;
          if (now.body !== body) { live.current[id] = { ...now, base: r.updatedAt, state: "dirty" }; continue; }
          live.current[id] = { ...now, base: r.updatedAt, state: "saved", message: "" };
          show(); mirror();
          return;
        } catch (e) {
          const cur = live.current[id]!;
          if (codeOf(e) === "STALE")
            live.current[id] = { ...cur, state: "conflict", message: (e as Error).message,
                                 theirs: bodyOf(e).current as ServerCategory | undefined };
          else {
            live.current[id] = { ...cur, state: "error", message: (e as Error).message };
            /* no server (0) or a server error (5xx): again later, 5 s, 10 s, … 60 s.
               A refusal (4xx: a broken step, a live category with errors) waits for the editor */
            const status = (e as { status?: number }).status ?? 0;
            if (status === 0 || status >= 500) {
              const n = (tries.current[id] = (tries.current[id] ?? 0) + 1);
              clearTimeout(timers.current[id]);
              timers.current[id] = setTimeout(() => {
                const c = live.current[id];
                if (c?.state === "error") { live.current[id] = { ...c, state: "dirty" }; void send(id); }
              }, Math.min(60_000, 5000 * 2 ** (n - 1)));
            }
          }
          show(); mirror();
          return;
        }
      }
    })();
    flying.current[id] = run.finally(() => { delete flying.current[id]; });
    return flying.current[id]!;
  };

  const value: Categories = {
    categories, loading, error, refresh, pending, recovered,
    async create(c) { const made = await createCategory(c); put(made); return made; },
    async update(id, p) { const next = await patchCategory(id, p); put(next); return next; },
    async remove(id) {
      clearTimeout(timers.current[id]); delete live.current[id]; show(); mirror();
      await deleteCategory(id); setCategories((l) => l.filter((x) => x.id !== id));
    },
    edit(id, body, opts) {
      const cur = live.current[id];
      const base = cur && cur.state !== "saved" ? cur.base
        : cur?.base ?? known.current.find((c) => c.id === id)?.updatedAt ?? 0;
      /* a conflict stays a conflict until it is resolved: the edit is kept */
      const conflict = cur?.state === "conflict";
      live.current[id] = { body, base, state: conflict ? "conflict" : "dirty",
                           message: conflict ? cur!.message : "", theirs: conflict ? cur!.theirs : undefined };
      show(); mirror();
      clearTimeout(timers.current[id]);
      if (conflict) return;
      if (opts?.now) void send(id);
      else timers.current[id] = setTimeout(() => void send(id), DELAY_MS);
    },
    async flush(id) {
      const ids = id ? [id] : Object.keys(live.current);
      for (const x of ids) clearTimeout(timers.current[x]);
      await Promise.all(ids.map((x) => send(x)));
      return ids.every((x) => (live.current[x]?.state ?? "saved") === "saved");
    },
    async resolve(id, how) {
      const p = live.current[id];
      if (!p) return;
      if (how === "theirs") {
        delete live.current[id];
        if (p.theirs) put(p.theirs); else await refresh();
        show(); mirror();
        return;
      }
      /* mine: written over the version now on the server */
      live.current[id] = { ...p, base: p.theirs?.updatedAt ?? p.base, state: "dirty", theirs: undefined, message: "" };
      show();
      await send(id);
    },
    restore(id) {
      const r = recovered[id];
      if (!r) return;
      live.current[id] = { body: r.body, base: r.base, state: "dirty", message: "" };
      setRecovered((x) => { const n = { ...x }; delete n[id]; return n; });
      show();
      void send(id);
    },
    dismiss(id) {
      setRecovered((x) => { const n = { ...x }; delete n[id]; return n; });
      try {
        const all = JSON.parse(localStorage.getItem(STORE_KEY) ?? "{}") as Record<string, Record<string, unknown>>;
        if (all[server.current]) delete all[server.current]![id];
        localStorage.setItem(STORE_KEY, JSON.stringify(all));
      } catch { /* nothing kept */ }
    },
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCategories(): Categories {
  const c = React.useContext(Ctx);
  if (!c) throw new Error("CategoriesProvider yok");
  return c;
}

export const errorsOf = (c: ServerCategory) => c.issues.filter((i) => i.level === "error").length;
