/**
 * Where a file is shown from: the server (`/api/assets/<id>`), with the
 * panel's key when the server wants one (`withKey`). Files used to live in
 * this browser's IndexedDB before there was a server; the server has had all
 * of them since.
 */
import type { Asset } from "./types";
import { fetchFile, withKey } from "./api";

/** the address of a file by its id */
export const assetUrl = (id: string) => withKey(`/api/assets/${encodeURIComponent(id)}`);

/** a URL for an asset an <img>, <audio> or <video> can load */
export function urlOf(asset: Asset | undefined): string | null {
  if (!asset) return null;
  return withKey(asset.url ?? `/api/assets/${encodeURIComponent(asset.id)}`);
}
export const useAssetUrl = urlOf;

/**
 * The bytes behind an asset (a style example, a picture to clean): fetched
 * with the panel's key in a header, and checked to be what was asked for --
 * a refusal's JSON is never handed on as a picture (A04). Throws with a
 * message the screen can show.
 */
export async function assetBlob(a: Asset, kind: Asset["kind"] = a.kind): Promise<Blob> {
  const b = await fetchFile(a.url ?? `/api/assets/${encodeURIComponent(a.id)}`);
  if (!b.type.startsWith(`${kind}/`)) throw new Error(`Beklenen bir ${kind === "image" ? "resim" : kind === "audio" ? "ses" : "video"}, gelen ${b.type || "bilinmeyen"}.`);
  return b;
}

/** how long a recording plays, measured by the browser (M09); null if it cannot tell */
export function audioDuration(url: string): Promise<number | null> {
  return new Promise((res) => {
    const a = new Audio();
    const done = (v: number | null) => { a.src = ""; res(v); };
    a.preload = "metadata";
    a.onloadedmetadata = () => done(Number.isFinite(a.duration) ? Math.round(a.duration * 1000) : null);
    a.onerror = () => done(null);
    setTimeout(() => done(null), 8000);
    a.src = withKey(url);
  });
}

/**
 * WHERE THE PAUSE IS in a frame's take (2026-10-23): the sentence is recorded
 * with a pause at its blank ("Şimdi sırada... [long pause] ...var."), and the
 * phone plays it in two parts with the word's own take in between. This finds
 * the longest silence inside the speech -- never the take's own lead-in or
 * tail -- and gives [end of the first part, start of the second] in seconds,
 * a little inside the silence on both sides. Null when there is no pause long
 * enough to be the blank (a take to make again).
 */
export async function findPause(a: Asset): Promise<[number, number] | null> {
  const blob = await assetBlob(a, "audio");
  const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new Ctx();
  try {
    const buf = await ctx.decodeAudioData(await blob.arrayBuffer());
    return pauseIn(buf.getChannelData(0), buf.sampleRate);
  } finally { void ctx.close(); }
}

/** the same, on samples (kept apart so it can be checked without a browser's decoder) */
export function pauseIn(x: Float32Array, rate: number): [number, number] | null {
  const win = Math.max(1, Math.round(rate * 0.01));
  const rms: number[] = [];
  for (let i = 0; i + win <= x.length; i += win) {
    let s = 0;
    for (let k = i; k < i + win; k++) s += x[k]! * x[k]!;
    rms.push(Math.sqrt(s / win));
  }
  const peak = Math.max(0, ...rms);
  if (!peak) return null;
  const thr = Math.max(0.004, peak * 0.06);
  const first = rms.findIndex((v) => v >= thr);
  let last = rms.length - 1;
  while (last > first && rms[last]! < thr) last--;
  let best: [number, number] = [0, 0], start = -1;
  for (let i = first; i <= last; i++) {
    if (rms[i]! < thr) { if (start < 0) start = i; }
    else if (start >= 0) { if (i - start > best[1] - best[0]) best = [start, i]; start = -1; }
  }
  const sec = (w: number) => (w * win) / rate;
  if (sec(best[1] - best[0]) < 0.25) return null;
  const cut: [number, number] = [+(sec(best[0]) + 0.02).toFixed(3), +(sec(best[1]) - 0.04).toFixed(3)];
  return cut[1] > cut[0] ? cut : null;
}
