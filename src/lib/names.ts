/**
 * A mascot's name in the forms the app's lines ask for (`{L:e}` → "Lili'ye").
 * The same rule as the app's `turkishForms` (`loplop/src/content/locales/tr.ts`):
 * the suffix follows the last vowel as it is SAID -- a final `y` after a
 * consonant is "i" (Tony'ye) -- and a vowel-final name takes y / n.
 */
export function turkishForms(name: string): Record<string, string> {
  const low = name.toLocaleLowerCase("tr");
  const V = "aeıioöuü";
  const said = /[^aeıioöuü]y$/.test(low) ? low.slice(0, -1) + "i" : low;
  const last = [...said].reverse().find((c) => V.includes(c)) ?? "e";
  const vowelEnd = V.includes(said[said.length - 1] ?? "");
  const back = "aıou".includes(last);
  const round = "oöuü".includes(last);
  const A = back ? "a" : "e";
  const I = back ? (round ? "u" : "ı") : (round ? "ü" : "i");
  const hard = !vowelEnd && "fsthçkşp".includes(said[said.length - 1] ?? "");
  const D = hard ? "t" : "d";
  const at = (x: string) => `${name}'${x}`;
  return {
    "": name,
    e: at((vowelEnd ? "y" : "") + A),
    in: at((vowelEnd ? "n" : "") + I + "n"),
    i: at((vowelEnd ? "y" : "") + I),
    de: at(D + A),
    den: at(D + A + "n"),
    le: at((vowelEnd ? "y" : "") + "l" + A),
  };
}

/** a line's template (`{L:e} yardım edelim`) with these names */
export function fillNames(template: string, names: { learner: string; friend: string }): string {
  return template.replace(/\{([LF])(?::([^}\s]+))?\}/g, (_m, who: string, form: string | undefined) => {
    const n = who === "L" ? names.learner : names.friend;
    return (form ? turkishForms(n)[form] : undefined) ?? n;
  });
}

/**
 * A text with one name swapped for another, every form of it: "Lili'ye"
 * becomes "Ayı'ya", not "Ayı'ye". Longest forms first, whole words only.
 */
export function renameIn(text: string, from: string, to: string): string {
  const a = turkishForms(from), b = turkishForms(to);
  const keys = Object.keys(a).sort((x, y) => a[y]!.length - a[x]!.length);
  let out = text;
  for (const k of keys) {
    const esc = a[k]!.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    out = out.replace(new RegExp(`(^|[^\\p{L}'])${esc}(?![\\p{L}'])`, "gu"), (_m, pre: string) => pre + b[k]!);
  }
  return out;
}
