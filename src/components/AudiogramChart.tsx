import { AC_FREQUENCIES, BC_FREQUENCIES } from "../types";
import type { AcFreq, BcFreq, FittingData } from "../types";

const WIDTH = 460;
const HEIGHT = 220;
const PAD_L = 44;
const PAD_R = 14;
const PAD_T = 16;
const PAD_B = 30;
const DB_MIN = -10;
const DB_MAX = 120;
const DB_STEP = 20;

const xByFreq = new Map<number, number>();
AC_FREQUENCIES.forEach((f, i) => {
  xByFreq.set(
    f,
    PAD_L + (i / (AC_FREQUENCIES.length - 1)) * (WIDTH - PAD_L - PAD_R),
  );
});

function y(db: number): number {
  const ratio = (db - DB_MIN) / (DB_MAX - DB_MIN);
  return PAD_T + ratio * (HEIGHT - PAD_T - PAD_B);
}

function pointsFor(data: FittingData, ear: "L" | "R", kind: "ac" | "bc"): Array<[number, number]> {
  const freqs = kind === "ac" ? AC_FREQUENCIES : BC_FREQUENCIES;
  return freqs
    .map((f) => {
      const v =
        kind === "ac"
          ? data.ears[ear].ac[f as AcFreq]
          : data.ears[ear].bc[f as BcFreq];
      return v === null ? null : ([xByFreq.get(f)!, y(v)] as [number, number]);
    })
    .filter((p): p is [number, number] => p !== null);
}

function polyline(points: Array<[number, number]>): string {
  return points.map(([x, yy]) => `${x},${yy}`).join(" ");
}

const SERIES = [
  { ear: "L", kind: "ac", color: "#155e75", dash: "", symbol: "×" },
  { ear: "L", kind: "bc", color: "#0e7490", dash: "6 4", symbol: "]" },
  { ear: "R", kind: "ac", color: "#e11d48", dash: "", symbol: "○" },
  { ear: "R", kind: "bc", color: "#be123c", dash: "6 4", symbol: "[" },
] as const;

export function AudiogramChart({ data }: { data: FittingData }) {
  const dbLines: number[] = [];
  for (let db = DB_MIN; db <= DB_MAX; db += DB_STEP) dbLines.push(db);

  return (
    <div className="audiogram">
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label="听力曲线图">
        {dbLines.map((db) => (
          <g key={db}>
            <line
              x1={PAD_L}
              x2={WIDTH - PAD_R}
              y1={y(db)}
              y2={y(db)}
              stroke="#e2e8f0"
              strokeWidth={1}
            />
            <text x={PAD_L - 6} y={y(db) + 3.5} textAnchor="end" fontSize={9} fill="#64748b">
              {db}
            </text>
          </g>
        ))}
        {AC_FREQUENCIES.map((f) => (
          <g key={f}>
            <line
              x1={xByFreq.get(f)}
              x2={xByFreq.get(f)}
              y1={PAD_T}
              y2={HEIGHT - PAD_B}
              stroke="#eef2f7"
              strokeWidth={1}
            />
            <text
              x={xByFreq.get(f)}
              y={HEIGHT - PAD_B + 16}
              textAnchor="middle"
              fontSize={9.5}
              fill="#475569"
            >
              {f >= 1000 ? `${f / 1000}k` : f}
            </text>
          </g>
        ))}
        <text x={6} y={PAD_T + 8} fontSize={9} fill="#94a3b8">dB HL</text>

        {SERIES.map((s) => {
          const pts = pointsFor(data, s.ear, s.kind);
          if (pts.length === 0) return null;
          return (
            <g key={`${s.ear}-${s.kind}`}>
              <polyline
                points={polyline(pts)}
                fill="none"
                stroke={s.color}
                strokeWidth={1.8}
                strokeDasharray={s.dash}
              />
              {pts.map(([x, yy], i) => (
                <text
                  key={i}
                  x={x}
                  y={yy + 3.2}
                  textAnchor="middle"
                  fontSize={11}
                  fontWeight={700}
                  fill={s.color}
                >
                  {s.symbol}
                </text>
              ))}
            </g>
          );
        })}
      </svg>
      <div className="chart-legend">
        <span><i className="legend-line" style={{ background: "#155e75" }} />左耳 气导 ×</span>
        <span><i className="legend-line dashed" style={{ background: "#0e7490" }} />左耳 骨导 ]</span>
        <span><i className="legend-line" style={{ background: "#e11d48" }} />右耳 气导 ○</span>
        <span><i className="legend-line dashed" style={{ background: "#be123c" }} />右耳 骨导 [</span>
      </div>
    </div>
  );
}
