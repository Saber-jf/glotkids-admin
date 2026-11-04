/**
 * The image studio's logic: the house styles as prompts, what a picture
 * roughly costs, and a background remover for the provider that cannot draw
 * on transparency. The calls themselves are the server's (`api.images`): it
 * holds the OpenAI and Gemini keys and stores every picture as it arrives.
 */
import type { ImageKind, ImageProvider } from "./types";


/* ── house styles ─────────────────────────────────────────────────────────── */

export interface Style { id: string; name: string; kind: ImageKind; prompt: (subject: string) => string }

/** The app's look (CLAUDE.md): the kitchen's seven pictures are soft-shaded,
 *  each with a small face; the scenes are warm and Ghibli-like, with a calm
 *  middle where the characters and the sentence go. */
export const STYLES: Style[] = [
  { id: "app-icon", name: "Uygulamanın ikon seti", kind: "icon", prompt: (s) =>
    `A single cute ${s}, kawaii children's illustration in the exact style of the reference pictures: ` +
    `one object centred, soft gentle shading, a small friendly face with dot eyes and rosy cheeks, ` +
    `rounded shapes, warm saturated colours, clean soft outline, subtle soft drop shadow, ` +
    `isolated on a plain transparent background. No text, no letters, no frame, no other objects.` },
  { id: "flat-icon", name: "Düz ikon (yüzsüz)", kind: "icon", prompt: (s) =>
    `A simple flat vector illustration of a ${s} for a children's learning app: one object centred, ` +
    `bold friendly shapes, clean outline, warm colours, no face, isolated on a plain transparent background. ` +
    `No text, no frame.` },
  { id: "ghibli-bg", name: "Ghibli manzara", kind: "background", prompt: (s) =>
    `A wide landscape background of ${s}, inspired by Studio Ghibli: warm sunlight, soft clouds, ` +
    `lush layered greenery, gentle painterly textures, calm pastel palette. Keep the middle and the lower ` +
    `third open and uncluttered so characters can stand there. No people, no animals, no characters, no text.` },
  { id: "flat-bg", name: "Düz çizgi film arka plan", kind: "background", prompt: (s) =>
    `A wide flat cartoon background of ${s} for a children's app: simple layered shapes, soft colours, ` +
    `no gradients, calm empty middle for characters. No people, no animals, no text.` },
];

/* ── cost: approximate, from the providers' published prices ─────────────── */

export const QUALITIES = ["low", "medium", "high"] as const;
export type Quality = typeof QUALITIES[number];
export const QUALITY_LABEL: Record<Quality, string> = { low: "Düşük", medium: "Orta", high: "Yüksek" };

/** dollars per picture */
export function costOf(p: ImageProvider, kind: ImageKind, q: Quality): number {
  if (p === "gemini") return 0.039;
  const square = { low: 0.011, medium: 0.042, high: 0.167 }[q];
  const wide = { low: 0.016, medium: 0.063, high: 0.25 }[q];
  return kind === "icon" ? square : wide;
}

/* ── background removal, for a picture drawn on a plain colour ────────────── */

/**
 * Flood-fills from every edge pixel that is close to the corners' colour and
 * makes it transparent, feathering the boundary. Works for an object on a
 * plain background (Gemini cannot draw on transparency); it leaves enclosed
 * areas of the same colour alone, because they are not reached from the edge.
 */
export async function clearBackground(blob: Blob, tolerance = 30): Promise<Blob> {
  const bmp = await createImageBitmap(blob);
  const c = document.createElement("canvas");
  c.width = bmp.width; c.height = bmp.height;
  const g = c.getContext("2d")!;
  g.drawImage(bmp, 0, 0);
  const img = g.getImageData(0, 0, c.width, c.height);
  const d = img.data, W = c.width, H = c.height;
  const at = (x: number, y: number) => (y * W + x) * 4;
  const corners = [at(0, 0), at(W - 1, 0), at(0, H - 1), at(W - 1, H - 1)];
  const ref = [0, 1, 2].map((k) => corners.reduce((s, i) => s + d[i + k]!, 0) / 4);
  const dist = (i: number) => Math.hypot(d[i]! - ref[0]!, d[i + 1]! - ref[1]!, d[i + 2]! - ref[2]!);
  const seen = new Uint8Array(W * H);
  const stack: number[] = [];
  for (let x = 0; x < W; x++) stack.push(x, x + (H - 1) * W);
  for (let y = 0; y < H; y++) stack.push(y * W, y * W + W - 1);
  while (stack.length) {
    const p = stack.pop()!;
    if (seen[p]) continue;
    seen[p] = 1;
    const i = p * 4, e = dist(i);
    if (e > tolerance * 1.6) continue;
    /* feather: fully clear inside the tolerance, fading across the edge */
    d[i + 3] = e <= tolerance ? 0 : Math.round(255 * ((e - tolerance) / (tolerance * 0.6)));
    if (e > tolerance) continue;
    const x = p % W, y = (p - x) / W;
    if (x > 0) stack.push(p - 1);
    if (x < W - 1) stack.push(p + 1);
    if (y > 0) stack.push(p - W);
    if (y < H - 1) stack.push(p + W);
  }
  g.putImageData(img, 0, 0);
  return new Promise((res) => c.toBlob((b) => res(b!), "image/png"));
}
