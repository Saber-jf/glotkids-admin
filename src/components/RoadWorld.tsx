/**
 * The drawn map as a phone will lay it (the app's docs/YOL-HARITASI-CIZILI.md):
 * two rows a page, the app's own six rows first, then the rows made here, each
 * stop a circle in the app's stop colours. A sketch, not the app's drawing --
 * the phone draws the meadow, the road and the signs itself; what matters here
 * is ORDER: which row comes after which, and which stops each one has.
 */
import React from "react";
import type { RoadSlide, RoadWorld, StopKind } from "../api";

export const STOP_C: Record<StopKind, string> = { "1": "#4A90E2", "2": "#5DB65A", "3": "#F2C230", music: "#F07AAE" };
export const STOP_LABEL: Record<StopKind, string> = { "1": "1", "2": "2", "3": "3", music: "♪" };

/** a row of the map, the app's or one made here */
export interface MapRow { id: string; title: string; kinds: StopKind[]; own: boolean; status?: RoadSlide["status"] }

/** every row in map order: the app's, then the server's */
export function mapRows(world: RoadWorld | null, slides: readonly RoadSlide[]): MapRow[] {
  return [
    ...(world?.rows ?? []).map((r) => ({ id: r.row, title: r.title, kinds: r.stops.map((s) => s.kind), own: true })),
    ...slides.map((s) => ({ id: s.id, title: s.title, kinds: s.stops.map((x) => x.kind), own: false, status: s.status })),
  ];
}

/* a page in the app is 1000 wide; its stops stand at these x (`core/meadowmap.ts` → STOP_X) */
const PAGE_W = 1000, PAGE_H = 560, LANES = [190, 410] as const, STOP_X = [240, 420, 600, 780] as const;

export function MapPreview({ world, slides, focus, onPick, height = 190 }: {
  world: RoadWorld | null; slides: readonly RoadSlide[];
  /** a row to outline */
  focus?: string;
  onPick?: (slide: string) => void;
  height?: number;
}) {
  const rows = mapRows(world, slides);
  /* a row still to come: where the next one goes */
  const all: (MapRow | null)[] = [...rows, null];
  const pages: (MapRow | null)[][] = [];
  for (let i = 0; i < all.length; i += 2) pages.push(all.slice(i, i + 2));
  const scroller = React.useRef<HTMLDivElement>(null);
  /* open at the end of the map: that is where the next row goes */
  React.useEffect(() => { const el = scroller.current; if (el) el.scrollLeft = el.scrollWidth; }, [rows.length]);
  const w = (PAGE_W / PAGE_H) * height;
  return (
    <div ref={scroller} className="flex gap-2 overflow-x-auto rounded-lg border bg-emerald-50/60 p-2 dark:bg-emerald-950/30" data-testid="map-preview">
      {pages.map((page, p) => (
        <svg key={p} viewBox={`0 0 ${PAGE_W} ${PAGE_H}`} style={{ height, width: w }} className="block shrink-0 rounded-md bg-[#d9efc6] dark:bg-[#26402a]">
          <text x={PAGE_W - 24} y={PAGE_H - 22} textAnchor="end" fontSize={30} fill="#5c7a4f" opacity={0.8}>{p + 1}. sayfa</text>
          {/* the road: along the top row, round the right, back along the bottom */}
          {page[0] && <path d={`M 150 ${LANES[0]} H 850 ${page[1] ? `C 940 ${LANES[0]}, 940 ${LANES[1]}, 850 ${LANES[1]} H 150` : ""}`}
                            fill="none" stroke="#e9d3a4" strokeWidth={46} strokeLinecap="round" opacity={page[0].own ? 0.55 : 1} />}
          {page.map((r, k) => {
            const y = LANES[k]!;
            if (!r) return (
              <g key="next" opacity={0.8}>
                <rect x={150} y={y - 60} width={700} height={120} rx={28} fill="none" stroke="#6d3fc8" strokeWidth={5} strokeDasharray="18 14" />
                <text x={500} y={y + 12} textAnchor="middle" fontSize={34} fontWeight={700} fill="#6d3fc8">+ sonraki sıra</text>
              </g>
            );
            const draft = !r.own && r.status !== "live";
            return (
              <g key={r.id} opacity={r.own ? 0.45 : 1} onClick={() => !r.own && onPick?.(r.id)}
                 className={!r.own && onPick ? "cursor-pointer" : undefined} data-row={r.id}>
                {(r.id === focus || draft) && <rect x={110} y={y - 98} width={780} height={168} rx={30} fill="none"
                  stroke={r.id === focus ? "#6d3fc8" : "#c98512"} strokeWidth={r.id === focus ? 8 : 5} strokeDasharray={r.id === focus ? undefined : "20 14"} />}
                <text x={150} y={y - 50} fontSize={34} fontWeight={700} fill="#2d2445">{r.title}{draft ? " · taslak" : ""}</text>
                {r.kinds.map((kind, i) => STOP_X[i] !== undefined && (
                  <g key={i} data-stop={kind}>
                    <circle cx={STOP_X[i]} cy={y} r={38} fill={STOP_C[kind]} stroke="#fff" strokeWidth={7} />
                    <text x={STOP_X[i]} y={y + 13} textAnchor="middle" fontSize={36} fontWeight={800} fill="#fff">{STOP_LABEL[kind]}</text>
                  </g>
                ))}
              </g>
            );
          })}
        </svg>
      ))}
    </div>
  );
}

export function StopLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {(["1", "2", "3", "music"] as StopKind[]).map((k) => (
        <span key={k} className="flex items-center gap-1.5"><span className="size-3 rounded-full" style={{ background: STOP_C[k] }} />
          {k === "music" ? "müzik durağı" : `${k}. oyun durağı`}</span>
      ))}
      <span>· soluk: uygulamanın kendi sıraları · turuncu kesik çerçeve: taslak</span>
    </div>
  );
}
