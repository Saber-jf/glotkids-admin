/**
 * A mascot's Lottie in the panel: played (a behaviour's frames, looping) and
 * measured (where its feet are on the rest pose).
 *
 * The LIGHT players only: they have no expression engine, so nothing in a
 * file ever runs as code here (the server refuses a file with expressions
 * anyway; the phone's native player has none either).
 */
import * as React from "react";
import lottie from "lottie-web/build/player/lottie_light";
import lottieCanvas from "lottie-web/build/player/lottie_light_canvas";
import { fetchFile } from "../api";
import { assetUrl } from "../blobs";
import { cn } from "@/lib/utils";

export type LottieDoc = { w: number; h: number; fr: number; ip?: number; op: number; markers?: { cm: string; tm: number; dr: number }[] } & Record<string, unknown>;

/* one parse per file: a mascot file is 1–2 MB */
const docs = new Map<string, Promise<LottieDoc>>();
export function loadDoc(asset: string): Promise<LottieDoc> {
  let p = docs.get(asset);
  if (!p) {
    p = fetchFile(assetUrl(asset)).then((b) => b.text()).then((t) => JSON.parse(t) as LottieDoc);
    p.catch(() => docs.delete(asset));
    docs.set(asset, p);
  }
  return p;
}
/** a file was replaced under its id: read it again */
export const forgetDoc = (asset: string) => docs.delete(asset);

export function useDoc(asset: string | null | undefined): { doc: LottieDoc | null; error: string } {
  const [st, setSt] = React.useState<{ id: string | null; doc: LottieDoc | null; error: string }>({ id: null, doc: null, error: "" });
  React.useEffect(() => {
    if (!asset) return;
    let live = true;
    loadDoc(asset).then((doc) => live && setSt({ id: asset, doc, error: "" }),
                        (e: Error) => live && setSt({ id: asset, doc: null, error: e.message }));
    return () => { live = false; };
  }, [asset]);
  return st.id === asset ? st : { doc: null, error: "" };
}

/** a segment of a file, looping (or one frame, held) */
export function LottieClip({ doc, from, to, still, size = 160, className, paused }: {
  doc: LottieDoc | null; from?: number; to?: number; still?: number; size?: number; className?: string; paused?: boolean;
}) {
  const box = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    const el = box.current;
    if (!el || !doc) return;
    /* the light player changes the data it is given: hand it a copy */
    const anim = lottie.loadAnimation({ container: el, renderer: "svg", loop: true, autoplay: false,
                                        animationData: structuredClone(doc) });
    if (still !== undefined) anim.goToAndStop(still, true);
    else if (from !== undefined && to !== undefined && to > from) {
      if (paused) anim.goToAndStop(from, true);
      else anim.playSegments([from, to], true);
    } else if (!paused) anim.play();
    return () => anim.destroy();
  }, [doc, from, to, still, paused]);
  return <div ref={box} style={{ width: size, height: size }}
              className={cn("shrink-0 overflow-hidden rounded-lg bg-[repeating-conic-gradient(#0000000a_0_25%,transparent_0_50%)] bg-[length:16px_16px]", className)} />;
}

/**
 * Where the drawing is on one frame, in its box (0..1): the top of the head,
 * the line the feet stand on, the middle of the feet, and its left/right.
 * Rendered to a canvas and read by alpha -- what is SEEN, as the app's own
 * numbers were measured (`core/roadmap.ts` → FOOT).
 */
export interface Measure { x: number; y: number; top: number; left: number; right: number }
export function measure(doc: LottieDoc, frame: number): Promise<Measure | null> {
  const N = 512;
  /* the player draws only into a canvas of its own, in a container that is
     in the page and has a size (one handed a detached context draws nothing):
     off screen, one pixel per unit */
  const holder = document.createElement("div");
  holder.style.cssText = `position:fixed;left:-10000px;top:0;width:${N}px;height:${N}px;pointer-events:none`;
  document.body.appendChild(holder);
  return new Promise((resolve) => {
    const anim = lottieCanvas.loadAnimation({
      container: holder, renderer: "canvas", loop: false, autoplay: false, animationData: structuredClone(doc),
      rendererSettings: { clearCanvas: true, preserveAspectRatio: "xMidYMid meet", dpr: 1 },
    });
    const done = (m: Measure | null) => { anim.destroy(); holder.remove(); resolve(m); };
    const read = () => {
      /* a jump to the frame it is already on draws nothing: away and back */
      anim.goToAndStop(frame + 1, true);
      anim.goToAndStop(frame, true);
      const canvas = holder.querySelector("canvas");
      const ctx = canvas?.getContext("2d", { willReadFrequently: true });
      if (!canvas || !ctx || canvas.width !== N || canvas.height !== N) return done(null);
      const { data } = ctx.getImageData(0, 0, N, N);
      let top = N, bottom = -1, left = N, right = -1;
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        if (data[(y * N + x) * 4 + 3]! < 24) continue;
        if (y < top) top = y; if (y > bottom) bottom = y;
        if (x < left) left = x; if (x > right) right = x;
      }
      if (bottom < 0) return done(null);
      /* the feet: the middle of what is drawn in the lowest 4% of the figure */
      let sx = 0, n = 0;
      const band = Math.max(4, Math.round((bottom - top) * 0.04));
      for (let y = bottom - band; y <= bottom; y++) for (let x = 0; x < N; x++)
        if (data[(y * N + x) * 4 + 3]! >= 24) { sx += x; n++; }
      done({ x: (n ? sx / n : (left + right) / 2) / N, y: (bottom + 1) / N, top: top / N, left: left / N, right: (right + 1) / N });
    };
    if (anim.isLoaded) read(); else anim.addEventListener("DOMLoaded", read);
  });
}

/**
 * Stills of many frames of one file, drawn by ONE player: a gallery of forty
 * behaviours as forty live players would parse a 1.3 MB file forty times.
 * Cached per file and frame; a picture is a PNG data address.
 */
const stillCache = new Map<string, string>();
const docIds = new WeakMap<object, number>();
let nextDocId = 1;
const docKey = (doc: object) => { let k = docIds.get(doc); if (!k) { k = nextDocId++; docIds.set(doc, k); } return k; };

export function renderStills(doc: LottieDoc, frames: readonly number[], size = 160): Promise<Record<number, string>> {
  const k = docKey(doc);
  const out: Record<number, string> = {};
  const todo = [...new Set(frames)].filter((f) => {
    const hit = stillCache.get(`${k}:${size}:${f}`);
    if (hit) out[f] = hit;
    return !hit;
  });
  if (!todo.length) return Promise.resolve(out);
  const holder = document.createElement("div");
  holder.style.cssText = `position:fixed;left:-10000px;top:0;width:${size}px;height:${size}px;pointer-events:none`;
  document.body.appendChild(holder);
  return new Promise((resolve) => {
    const anim = lottieCanvas.loadAnimation({
      container: holder, renderer: "canvas", loop: false, autoplay: false, animationData: structuredClone(doc),
      rendererSettings: { clearCanvas: true, preserveAspectRatio: "xMidYMid meet", dpr: 1 },
    });
    const read = () => {
      const canvas = holder.querySelector("canvas");
      for (const f of todo) {
        anim.goToAndStop(f + 1, true);
        anim.goToAndStop(f, true);
        const url = canvas?.toDataURL("image/png") ?? "";
        stillCache.set(`${k}:${size}:${f}`, url);
        out[f] = url;
      }
      anim.destroy(); holder.remove(); resolve(out);
    };
    if (anim.isLoaded) read(); else anim.addEventListener("DOMLoaded", read);
  });
}

export function useStills(doc: LottieDoc | null, frames: readonly number[], size = 160): Record<number, string> {
  const [got, setGot] = React.useState<Record<number, string>>({});
  const key = frames.join(",");
  React.useEffect(() => {
    if (!doc || !frames.length) return;
    let live = true;
    void renderStills(doc, frames, size).then((r) => { if (live) setGot((g) => ({ ...g, ...r })); });
    return () => { live = false; };
  }, [doc, key, size]); // eslint-disable-line react-hooks/exhaustive-deps
  return got;
}
