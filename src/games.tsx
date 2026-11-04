/**
 * The game catalog as the panel holds it: read from the server once, changed
 * only through it (`api.ts`). Every screen that names a game -- the games page,
 * the category editor, the word sets, the checks -- reads it from here, so
 * there is one list of games, the server's.
 */
import React from "react";
import { bodyOf, codeOf, createGame, deleteGame, listGames, orderGames, patchGame,
         type CatalogGame, type GamePatch, type NewGame } from "./api";

interface Games {
  games: CatalogGame[];
  loading: boolean;
  error: string;
  refresh: () => Promise<void>;
  create: (g: NewGame) => Promise<CatalogGame>;
  /** `base`: the version the edit started from; changed since → refused (A02) */
  update: (id: string, p: GamePatch, base?: number) => Promise<CatalogGame>;
  remove: (id: string) => Promise<void>;
  reorder: (ids: string[]) => Promise<void>;
}

const Ctx = React.createContext<Games | null>(null);

export function GamesProvider({ children }: { children: React.ReactNode }) {
  const [games, setGames] = React.useState<CatalogGame[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const refresh = React.useCallback(async () => {
    try { setGames(await listGames()); setError(""); } catch (e) { setError((e as Error).message); }
    setLoading(false);
  }, []);
  React.useEffect(() => { refresh(); }, [refresh]);
  /* an answer older than what is held never replaces it (A02) */
  const put = (g: CatalogGame) => setGames((l) => (l.some((x) => x.id === g.id)
    ? l.map((x) => (x.id === g.id && x.updatedAt <= g.updatedAt ? g : x)) : [...l, g]));
  const value: Games = {
    games, loading, error, refresh,
    async create(g) { const made = await createGame(g); put(made); return made; },
    async update(id, p, base) {
      try { const next = await patchGame(id, p, base); put(next); return next; }
      catch (e) { const cur = bodyOf(e).current as CatalogGame | undefined; if (codeOf(e) === "STALE" && cur) put(cur); throw e; }
    },
    async remove(id) { await deleteGame(id); setGames((l) => l.filter((x) => x.id !== id)); },
    async reorder(ids) { setGames(await orderGames(ids)); },
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useGames(): Games {
  const g = React.useContext(Ctx);
  if (!g) throw new Error("GamesProvider yok");
  return g;
}

/** the games a category step can play: playable, not hidden */
export const playable = (l: CatalogGame[]) => l.filter((g) => g.kind === "game" && g.status !== "hidden");

/** what a new game can be made from: the games the app can play with new
 *  words (server: `isTemplate`) */
export const isTemplate = (g: CatalogGame) => g.takesWords;
