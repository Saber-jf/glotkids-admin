/**
 * WHERE A LINE IS SAID: a category and one of its steps. The script is
 * filtered by these two -- the category first ("Mutfak"), then the step as
 * the map shows it: Sahne 1, Oyun 1, Sahne 2, Oyun 2, Sahne 3, Oyun 3, Müzik.
 *
 * The scenes in front of a game share its number: the kitchen opens with two
 * (the living room, then arriving in the kitchen) and both are "Sahne 1",
 * because on the map they are one stop with the first game. The music stop is
 * not a step of the category file; it closes every row on the map, so it is
 * always offered (`MUSIC`). A word's own lines are the category's "Kelimeler".
 *
 * A fixed line stores its place (`FixedLine.category`, `.step`: a step id of
 * the category). Lines written before that carry only a free-text group, so
 * the app's known lines are placed from `KNOWN` -- read from the app's scenes
 * and games (`core/ports.ts`, `ui/*Intro.tsx`, `core/story.ts`).
 */
import type { ServerCategory } from "./api";
import type { FixedLine } from "./types";

export const MUSIC = "music";
export const WORDS = "words";

export interface StepOption { key: string; label: string; steps: string[] }

/** a category's steps as the filter offers them */
export function stepOptions(c: Pick<ServerCategory, "steps">): StepOption[] {
  const out: StepOption[] = [];
  let n = 0;
  let scenes: string[] = [];
  for (const s of c.steps) {
    if (s.kind === "scene" || s.kind === "video") scenes.push(s.id);
    else if (s.kind === "game") {
      n++;
      if (scenes.length) out.push({ key: `scene:${n}`, label: `Sahne ${n}`, steps: scenes });
      scenes = [];
      out.push({ key: `game:${n}`, label: `Oyun ${n}`, steps: [s.id] });
    }
  }
  /* a scene after the last game (none yet): it closes the row */
  if (scenes.length) out.push({ key: `scene:${n + 1}`, label: `Sahne ${n + 1}`, steps: scenes });
  out.push({ key: MUSIC, label: "Müzik", steps: [MUSIC] });
  return out;
}

/** the app's lines, by clip, for documents written before lines had a place */
const KNOWN: Record<string, [string, string]> = {};
const put = (category: string, step: string, clips: string[]) => clips.forEach((c) => { KNOWN[c] = [category, step]; });
put("kitchen", "open-1", ["otter/hello_o", "bunny/hello_b", "otter/glad_o", "bunny/hungry_b", "otter/go_kitchen", "bunny/yay_b", "otter/come_too"]);
put("kitchen", "to-find", ["bunny/want_b", "otter/basket_o", "bunny/help_b", "otter/rule_o"]);
put("kitchen", "find", ["teacher/find_open", "teacher/find_how"]);
put("kitchen", "to-picnic", ["bunny/yay_pic_b", "otter/day_o", "bunny/lay_b", "otter/help_pic_o"]);
put("kitchen", "picnic", ["teacher/picnic_open", "teacher/picnic_how"]);
put("animals", "open", ["otter/ride_o", "bunny/hide_b"]);
put("kitchen", "give", ["teacher/this_is", "teacher/ask_it", "teacher/no_it", "teacher/help_it"]);
put("animals", "train", ["teacher/train_find"]);
put("animals", "to-hide", ["otter/what_o", "otter/seek_o", "bunny/find_b", "bunny/shut_b", "otter/count_o"]);
put("animals", "hide", ["teacher/seek_open", "teacher/seek_how"]);
put("animals", "to-photo", ["otter/trip_day_o", "otter/trip_photo_o", "bunny/trip_yay_b"]);

/** the first kitchen game's lines. Until 2026-10-20 one per word with the word
 *  inside (`look_banana`, `ask_banana`, …); now word-free (`ask_it`, `no_it`,
 *  `help_it`, and `this_is` for the introduction) -- the word is its own clip */
const GIVE = /^teacher\/(look|ask|no|help)_[a-z0-9_]+$/;

export function placeOf(l: Pick<FixedLine, "clip" | "category" | "step">): { category: string; step: string } | null {
  if (l.category && l.step) return { category: l.category, step: l.step };
  const k = KNOWN[l.clip];
  if (k) return { category: k[0], step: k[1] };
  if (l.clip.startsWith("teacher/photo_")) return { category: "animals", step: "photo" };
  if (GIVE.test(l.clip)) return { category: "kitchen", step: "give" };
  return null;
}

/** "Mutfak · Sahne 1" */
export function placeLabel(cats: Pick<ServerCategory, "id" | "title" | "steps">[], category: string, step: string): string {
  const c = cats.find((x) => x.id === category);
  if (!c) return category;
  const o = stepOptions(c).find((x) => x.steps.includes(step));
  return o ? `${c.title} · ${o.label}` : c.title;
}
