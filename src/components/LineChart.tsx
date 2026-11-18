import { useI18n } from "../i18n";

export interface ChartPoint {
  label: string;
  value: number;
}

interface Props {
  points: ChartPoint[];
  yMin: number;
  yMax: number;
  yTicks: number[];
  yFormat?: (v: number) => string;
  ariaLabel: string;
}

const W = 640;
const H = 230;
const PAD = { l: 56, r: 16, t: 14, b: 30 };

/** Single-series SVG line chart with a soft area fill. No chart dependency. */
export default function LineChart({ points, yMin, yMax, yTicks, yFormat = String, ariaLabel }: Props) {
  const { t } = useI18n();
  if (points.length === 0) return <p className="empty-hint">{t("trackers.chartEmpty")}</p>;
  const iw = W - PAD.l - PAD.r;
  const ih = H - PAD.t - PAD.b;
  const x = (i: number) => PAD.l + (points.length === 1 ? iw / 2 : (i / (points.length - 1)) * iw);
  const y = (v: number) => PAD.t + ih - ((Math.min(Math.max(v, yMin), yMax) - yMin) / (yMax - yMin)) * ih;
  const line = points.map((p, i) => `${i ? "L" : "M"}${x(i)},${y(p.value)}`).join(" ");
  const area = `${line} L${x(points.length - 1)},${PAD.t + ih} L${x(0)},${PAD.t + ih} Z`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="line-chart" role="img" aria-label={ariaLabel}>
      {yTicks.map((tk) => (
        <g key={tk}>
          <line x1={PAD.l} x2={W - PAD.r} y1={y(tk)} y2={y(tk)} className="chart-grid" />
          <text x={PAD.l - 10} y={y(tk) + 4} textAnchor="end" className="chart-tick">{yFormat(tk)}</text>
        </g>
      ))}
      {points.length > 1 && <path d={area} className="chart-area" />}
      {points.length > 1 && <path d={line} className="chart-line" fill="none" />}
      {points.map((p, i) => (
        <circle key={p.label + i} cx={x(i)} cy={y(p.value)} r={3.6} className="chart-dot">
          <title>{`${p.label}: ${yFormat(p.value)}`}</title>
        </circle>
      ))}
      <text x={PAD.l} y={H - 8} className="chart-tick">{points[0].label}</text>
      {points.length > 1 && (
        <text x={W - PAD.r} y={H - 8} textAnchor="end" className="chart-tick">{points[points.length - 1].label}</text>
      )}
    </svg>
  );
}
