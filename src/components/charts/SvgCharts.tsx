import React, { useState } from 'react';
import { CoefficientDetail, ResidualPoint, ScenarioResult, TrainedModelResult } from '../../types/analytics';

export const CorrelationHeatmap: React.FC<{
  columns: string[];
  values: number[][];
  methods: string[][];
}> = ({ columns, values, methods }) => {
  const [hover, setHover] = useState<{ r: number; c: number } | null>(null);
  const n = columns.length;
  if (n === 0) return null;

  const cellColor = (val: number, method: string) => {
    if (method === 'Self') return 'bg-slate-900 text-white';
    const abs = Math.abs(val);
    if (method === 'Cramér V' || method === 'Eta²') {
      if (abs >= 0.6) return 'bg-indigo-600 text-white';
      if (abs >= 0.35) return 'bg-indigo-200 text-indigo-950';
      if (abs >= 0.15) return 'bg-indigo-50 text-indigo-900';
      return 'bg-slate-50 text-slate-500';
    }
    if (val >= 0.6) return 'bg-teal-700 text-white';
    if (val >= 0.3) return 'bg-teal-100 text-teal-950';
    if (val <= -0.6) return 'bg-rose-700 text-white';
    if (val <= -0.3) return 'bg-rose-100 text-rose-950';
    return 'bg-slate-50 text-slate-600';
  };

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr>
              <th className="p-2 text-left font-medium text-slate-500 border-b border-slate-200">Variable</th>
              {columns.map((c) => (
                <th
                  key={c}
                  className="p-2 text-right font-medium text-slate-600 border-b border-slate-200 max-w-[100px] truncate"
                  title={c}
                >
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {columns.map((rowCol, r) => (
              <tr key={rowCol}>
                <td className="p-2 font-medium text-slate-800 border-b border-slate-100 whitespace-nowrap max-w-[140px] truncate" title={rowCol}>
                  {rowCol}
                </td>
                {columns.map((colCol, c) => {
                  const val = values[r]?.[c] ?? 0;
                  const method = methods[r]?.[c] ?? 'Pearson';
                  const isHovered = hover?.r === r && hover?.c === c;
                  return (
                    <td
                      key={`${r}-${c}`}
                      onMouseEnter={() => setHover({ r, c })}
                      onMouseLeave={() => setHover(null)}
                      className={`p-2 text-right font-mono tabular-nums border border-white transition-colors cursor-default ${cellColor(val, method)} ${isHovered ? 'ring-2 ring-slate-900' : ''}`}
                    >
                      {val.toFixed(2)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="text-xs text-slate-600 min-h-[20px] flex items-center justify-between border-t border-slate-100 pt-2">
        {hover ? (
          <span>
            <strong className="text-slate-900">{columns[hover.r]}</strong> vs{' '}
            <strong className="text-slate-900">{columns[hover.c]}</strong> · Método:{' '}
            <span className="font-mono">{methods[hover.r]?.[hover.c]}</span> · Valor:{' '}
            <span className="font-mono font-semibold">{(values[hover.r]?.[hover.c] ?? 0).toFixed(4)}</span>
          </span>
        ) : (
          <span>Pase el cursor sobre cualquier celda para ver el método estadístico aplicado (Pearson, Spearman, Kendall, Cramér V o Eta²).</span>
        )}
      </div>
    </div>
  );
};

export const HistogramChart: React.FC<{
  bins: Array<{ label: string; start: number; end: number; count: number }>;
  title: string;
  meanVal?: number;
  medianVal?: number;
}> = ({ bins, title, meanVal, medianVal }) => {
  const [hovered, setHovered] = useState<number | null>(null);
  if (bins.length === 0) return null;
  const maxCount = Math.max(1, ...bins.map((b) => b.count));
  const w = 480;
  const h = 190;
  const padL = 36;
  const padR = 14;
  const padT = 18;
  const padB = 34;
  const plotW = w - padL - padR;
  const plotH = h - padT - padB;
  const barW = plotW / bins.length;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs text-slate-600">
        <span className="font-medium text-slate-800">{title}</span>
        {hovered !== null && bins[hovered] ? (
          <span className="font-mono tabular-nums text-teal-700">
            [{bins[hovered].start.toFixed(1)}, {bins[hovered].end.toFixed(1)}]: {bins[hovered].count} obs
          </span>
        ) : (
          <span className="font-mono tabular-nums">
            {meanVal !== undefined ? `Media ${meanVal.toFixed(2)}` : ''}
            {medianVal !== undefined ? ` · Mediana ${medianVal.toFixed(2)}` : ''}
          </span>
        )}
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-auto">
        <line x1={padL} y1={padT + plotH} x2={w - padR} y2={padT + plotH} stroke="#CBD5E1" strokeWidth="1" />
        <line x1={padL} y1={padT} x2={padL} y2={padT + plotH} stroke="#CBD5E1" strokeWidth="1" />
        {bins.map((b, i) => {
          const bh = (b.count / maxCount) * plotH;
          const x = padL + i * barW + 2;
          const y = padT + plotH - bh;
          return (
            <g key={i} onMouseEnter={() => setHovered(i)} onMouseLeave={() => setHovered(null)}>
              <rect
                x={x}
                y={y}
                width={Math.max(4, barW - 4)}
                height={bh}
                fill={hovered === i ? '#0D9488' : '#1E3A5F'}
                rx="2"
              />
              {i % Math.max(1, Math.floor(bins.length / 4)) === 0 && (
                <text
                  x={x + barW / 2}
                  y={h - 10}
                  textAnchor="middle"
                  className="fill-slate-500 text-[9px] font-mono"
                >
                  {b.start.toFixed(1)}
                </text>
              )}
            </g>
          );
        })}
        <text x={padL - 6} y={padT + 8} textAnchor="end" className="fill-slate-500 text-[9px] font-mono">
          {maxCount}
        </text>
        <text x={padL - 6} y={padT + plotH} textAnchor="end" className="fill-slate-500 text-[9px] font-mono">
          0
        </text>
      </svg>
    </div>
  );
};

export const BoxplotStrip: React.FC<{
  min: number;
  q1: number;
  median: number;
  q3: number;
  max: number;
  label: string;
}> = ({ min, q1, median, q3, max, label }) => {
  const span = max - min || 1;
  const pos = (v: number) => 20 + ((v - min) / span) * 420;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-slate-600">
        <span className="font-medium text-slate-800">{label}</span>
        <span className="font-mono tabular-nums">
          Min {min.toFixed(2)} · Q1 {q1.toFixed(2)} · Med {median.toFixed(2)} · Q3 {q3.toFixed(2)} · Max {max.toFixed(2)}
        </span>
      </div>
      <svg viewBox="0 0 460 52" className="w-full h-auto">
        <line x1={pos(min)} y1={24} x2={pos(q1)} y2={24} stroke="#64748B" strokeWidth="1.5" />
        <line x1={pos(q3)} y1={24} x2={pos(max)} y2={24} stroke="#64748B" strokeWidth="1.5" />
        <line x1={pos(min)} y1={16} x2={pos(min)} y2={32} stroke="#475569" strokeWidth="1.5" />
        <line x1={pos(max)} y1={16} x2={pos(max)} y2={32} stroke="#475569" strokeWidth="1.5" />
        <rect
          x={pos(q1)}
          y={11}
          width={Math.max(4, pos(q3) - pos(q1))}
          height={26}
          fill="#CCFBF1"
          stroke="#0D9488"
          strokeWidth="1.5"
          rx="2"
        />
        <line x1={pos(median)} y1={11} x2={pos(median)} y2={37} stroke="#0F172A" strokeWidth="2.5" />
      </svg>
    </div>
  );
};

export const ScatterRegressionPlot: React.FC<{
  points: Array<{ x: number; y: number; label?: string }>;
  xLabel: string;
  yLabel: string;
}> = ({ points, xLabel, yLabel }) => {
  const [hovered, setHovered] = useState<number | null>(null);
  if (points.length < 2) return null;
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const spanX = maxX - minX || 1;
  const spanY = maxY - minY || 1;

  // Simple OLS line
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
  const my = ys.reduce((a, b) => a + b, 0) / ys.length;
  let num = 0;
  let den = 0;
  for (let i = 0; i < points.length; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    den += (xs[i] - mx) ** 2;
  }
  const slope = den > 0 ? num / den : 0;
  const intercept = my - slope * mx;

  const w = 480;
  const h = 230;
  const padL = 52;
  const padR = 16;
  const padT = 16;
  const padB = 34;
  const px = (x: number) => padL + ((x - minX) / spanX) * (w - padL - padR);
  const py = (y: number) => padT + (1 - (y - minY) / spanY) * (h - padT - padB);

  const y1Line = intercept + slope * minX;
  const y2Line = intercept + slope * maxX;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs text-slate-600">
        <span>
          <strong className="text-slate-800">{yLabel}</strong> vs <strong className="text-slate-800">{xLabel}</strong>
        </span>
        {hovered !== null && points[hovered] ? (
          <span className="font-mono tabular-nums text-teal-700">
            {points[hovered].label ? `${points[hovered].label} · ` : ''}
            ({points[hovered].x.toFixed(2)}, {points[hovered].y.toFixed(2)})
          </span>
        ) : (
          <span className="font-mono tabular-nums">n = {points.length}</span>
        )}
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-auto">
        <line x1={padL} y1={h - padB} x2={w - padR} y2={h - padB} stroke="#CBD5E1" strokeWidth="1" />
        <line x1={padL} y1={padT} x2={padL} y2={h - padB} stroke="#CBD5E1" strokeWidth="1" />
        <line
          x1={px(minX)}
          y1={Math.max(padT, Math.min(h - padB, py(y1Line)))}
          x2={px(maxX)}
          y2={Math.max(padT, Math.min(h - padB, py(y2Line)))}
          stroke="#0D9488"
          strokeWidth="2"
          strokeDasharray="4 3"
        />
        {points.map((pt, i) => (
          <circle
            key={i}
            cx={px(pt.x)}
            cy={py(pt.y)}
            r={hovered === i ? 5.5 : 3.6}
            fill={hovered === i ? '#4F46E5' : '#0F172A'}
            fillOpacity={0.82}
            onMouseEnter={() => setHovered(i)}
            onMouseLeave={() => setHovered(null)}
          />
        ))}
        <text x={padL} y={h - 10} className="fill-slate-500 text-[9px] font-mono">
          {minX.toFixed(1)}
        </text>
        <text x={w - padR} y={h - 10} textAnchor="end" className="fill-slate-500 text-[9px] font-mono">
          {maxX.toFixed(1)}
        </text>
        <text x={padL - 6} y={padT + 8} textAnchor="end" className="fill-slate-500 text-[9px] font-mono">
          {maxY.toFixed(1)}
        </text>
        <text x={padL - 6} y={h - padB} textAnchor="end" className="fill-slate-500 text-[9px] font-mono">
          {minY.toFixed(1)}
        </text>
      </svg>
    </div>
  );
};

export const ResidualDiagnosticsCharts: React.FC<{ residuals: ResidualPoint[] }> = ({ residuals }) => {
  if (residuals.length < 3) return null;
  const w = 440;
  const h = 190;
  const padL = 46;
  const padR = 14;
  const padT = 14;
  const padB = 28;

  const preds = residuals.map((r) => r.predicted);
  const resVals = residuals.map((r) => r.residual);
  const minP = Math.min(...preds);
  const maxP = Math.max(...preds);
  const maxAbsR = Math.max(1e-6, ...resVals.map((v) => Math.abs(v)));

  const px = (v: number) => padL + ((v - minP) / (maxP - minP || 1)) * (w - padL - padR);
  const py = (v: number) => padT + ((maxAbsR - v) / (2 * maxAbsR)) * (h - padT - padB);

  const qxMin = Math.min(...residuals.map((r) => r.theoreticalQuantile));
  const qxMax = Math.max(...residuals.map((r) => r.theoreticalQuantile));
  const stdMin = Math.min(...residuals.map((r) => r.standardizedResidual));
  const stdMax = Math.max(...residuals.map((r) => r.standardizedResidual));
  const qSpan = qxMax - qxMin || 1;
  const sSpan = stdMax - stdMin || 1;
  const pqx = (v: number) => padL + ((v - qxMin) / qSpan) * (w - padL - padR);
  const psy = (v: number) => padT + (1 - (v - stdMin) / sSpan) * (h - padT - padB);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div>
        <div className="text-xs font-medium text-slate-800 mb-2">
          Residuos vs Valores Ajustados (Linealidad y Homocedasticidad)
        </div>
        <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-auto border border-slate-200 rounded-md bg-white">
          <line x1={padL} y1={py(0)} x2={w - padR} y2={py(0)} stroke="#0D9488" strokeWidth="1.2" strokeDasharray="4 3" />
          <line x1={padL} y1={padT} x2={padL} y2={h - padB} stroke="#CBD5E1" strokeWidth="1" />
          {residuals.map((r) => (
            <circle
              key={r.index}
              cx={px(r.predicted)}
              cy={py(r.residual)}
              r={r.cooksD > 4 / residuals.length ? 4.5 : 3}
              fill={r.cooksD > 4 / residuals.length ? '#DC2626' : '#0F172A'}
              fillOpacity={0.78}
            />
          ))}
          <text x={padL - 5} y={padT + 9} textAnchor="end" className="fill-slate-500 text-[9px] font-mono">
            +{maxAbsR.toFixed(1)}
          </text>
          <text x={padL - 5} y={h - padB} textAnchor="end" className="fill-slate-500 text-[9px] font-mono">
            -{maxAbsR.toFixed(1)}
          </text>
        </svg>
      </div>

      <div>
        <div className="text-xs font-medium text-slate-800 mb-2">
          Gráfico Q-Q Normal de Residuos Estandarizados
        </div>
        <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-auto border border-slate-200 rounded-md bg-white">
          <line
            x1={pqx(qxMin)}
            y1={psy(qxMin)}
            x2={pqx(qxMax)}
            y2={psy(qxMax)}
            stroke="#4F46E5"
            strokeWidth="1.2"
            strokeDasharray="4 3"
          />
          <line x1={padL} y1={padT} x2={padL} y2={h - padB} stroke="#CBD5E1" strokeWidth="1" />
          {residuals.map((r) => (
            <circle
              key={r.index}
              cx={pqx(r.theoreticalQuantile)}
              cy={psy(r.standardizedResidual)}
              r={3}
              fill="#0F172A"
              fillOpacity={0.8}
            />
          ))}
          <text x={padL - 5} y={padT + 9} textAnchor="end" className="fill-slate-500 text-[9px] font-mono">
            {stdMax.toFixed(1)}
          </text>
          <text x={padL - 5} y={h - padB} textAnchor="end" className="fill-slate-500 text-[9px] font-mono">
            {stdMin.toFixed(1)}
          </text>
        </svg>
      </div>
    </div>
  );
};

export const CoefficientForestPlot: React.FC<{ coefficients: CoefficientDetail[] }> = ({ coefficients }) => {
  if (coefficients.length === 0) return null;
  // Use standardized betas for fair visual comparison across different variable scales!
  const vals = coefficients.map((c) => c.standardizedBeta ?? c.estimate);
  const maxAbs = Math.max(0.1, ...vals.map((v) => Math.abs(v)));

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between text-xs text-slate-500">
        <span>Contribución relativa estandarizada (β estándar por 1 DE de X)</span>
        <span className="font-mono">0 = efecto nulo</span>
      </div>
      <div className="space-y-2">
        {coefficients.map((c) => {
          const val = c.standardizedBeta ?? c.estimate;
          const pct = Math.min(48, (Math.abs(val) / maxAbs) * 46);
          const isPos = val >= 0;
          return (
            <div key={c.feature} className="grid grid-cols-12 items-center gap-3 text-xs">
              <div className="col-span-4 truncate font-medium text-slate-800" title={c.feature}>
                {c.feature}
              </div>
              <div className="col-span-6 relative h-6 bg-slate-100 rounded flex items-center">
                <div className="absolute left-1/2 top-0 bottom-0 w-px bg-slate-400" />
                <div
                  className={`absolute h-3 rounded-sm ${isPos ? 'bg-teal-600' : 'bg-rose-600'}`}
                  style={{
                    left: isPos ? '50%' : `${50 - pct}%`,
                    width: `${pct}%`,
                  }}
                />
              </div>
              <div className="col-span-2 text-right font-mono tabular-nums text-slate-700">
                {val >= 0 ? '+' : ''}
                {val.toFixed(3)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export const ModelComparisonChart: React.FC<{ models: TrainedModelResult[] }> = ({ models }) => {
  if (models.length === 0) return null;
  const maxRmse = Math.max(1e-6, ...models.map((m) => m.metrics.rmseVal));

  return (
    <div className="space-y-3">
      {models.map((m) => {
        const adjPct = Math.max(0, Math.min(100, m.metrics.adjR2Train * 100));
        const rmsePct = Math.max(5, Math.min(100, (m.metrics.rmseVal / maxRmse) * 100));
        return (
          <div key={m.id} className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className={`font-medium ${m.isRecommended ? 'text-teal-800' : 'text-slate-800'}`}>
                {m.name} {m.isRecommended ? '· Recomendado' : ''}
              </span>
              <span className="font-mono tabular-nums text-slate-600">
                CR² {adjPct.toFixed(1)}% · RMSE Val {m.metrics.rmseVal.toFixed(2)}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="h-2 bg-slate-100 rounded overflow-hidden">
                <div className="h-full bg-teal-600" style={{ width: `${adjPct}%` }} />
              </div>
              <div className="h-2 bg-slate-100 rounded overflow-hidden">
                <div className="h-full bg-indigo-500" style={{ width: `${rmsePct}%` }} />
              </div>
            </div>
          </div>
        );
      })}
      <div className="flex items-center gap-6 text-[11px] text-slate-500 pt-1">
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-2 bg-teal-600 rounded-sm" /> R² Ajustado (CR², mayor es mejor ajuste)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-2 bg-indigo-500 rounded-sm" /> RMSE Validación (menor es mayor precisión)
        </span>
      </div>
    </div>
  );
};

export const ScenarioComparisonChart: React.FC<{ scenarios: ScenarioResult[]; targetLabel: string }> = ({
  scenarios,
  targetLabel,
}) => {
  if (scenarios.length === 0) return null;
  const allVals = scenarios.flatMap((s) => [s.predictionInterval95[0], s.predictionInterval95[1], s.predictedY]);
  const minV = Math.min(...allVals);
  const maxV = Math.max(...allVals);
  const span = maxV - minV || 1;
  const padMin = minV - span * 0.08;
  const padMax = maxV + span * 0.08;
  const fullSpan = padMax - padMin || 1;

  return (
    <div className="space-y-3">
      <div className="flex justify-between text-xs text-slate-500">
        <span>Comparación de {targetLabel} estimado con Intervalo de Predicción 95%</span>
        <span className="font-mono tabular-nums">
          Rango [{padMin.toFixed(1)}, {padMax.toFixed(1)}]
        </span>
      </div>
      <div className="space-y-2.5">
        {scenarios.map((s) => {
          const posPoint = ((s.predictedY - padMin) / fullSpan) * 100;
          const posLow = ((s.predictionInterval95[0] - padMin) / fullSpan) * 100;
          const posHigh = ((s.predictionInterval95[1] - padMin) / fullSpan) * 100;
          return (
            <div key={s.id} className="grid grid-cols-12 items-center gap-3 text-xs">
              <div className="col-span-3 truncate font-medium text-slate-800" title={s.name}>
                {s.name}
              </div>
              <div className="col-span-6 relative h-6 bg-slate-100 rounded">
                <div
                  className="absolute top-2.5 h-1 bg-indigo-300 rounded"
                  style={{ left: `${Math.max(0, posLow)}%`, width: `${Math.max(1, posHigh - posLow)}%` }}
                />
                <div
                  className="absolute top-1.5 w-3 h-3 rounded-full bg-teal-700 border border-white -translate-x-1/2"
                  style={{ left: `${Math.max(2, Math.min(98, posPoint))}%` }}
                />
              </div>
              <div className="col-span-3 text-right font-mono tabular-nums text-slate-800">
                {s.predictedY.toFixed(2)}{' '}
                <span className={s.deltaVsBaseAbs >= 0 ? 'text-teal-700' : 'text-rose-700'}>
                  ({s.deltaVsBaseAbs >= 0 ? '+' : ''}
                  {s.deltaVsBasePct.toFixed(1)}%)
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
