import React, { useMemo, useState } from 'react';
import { DiagnosticSummary, ResidualPoint } from '../../types/analytics';

type PlotMode = 'raw' | 'standardized' | 'scale_location';

interface HomoscedasticityPlotProps {
  residuals: ResidualPoint[];
  diagnostics: DiagnosticSummary;
  standardError: number;
  supportsInference: boolean;
  modelName: string;
  targetColumn: string;
  targetUnit: string;
}

interface TercileBand {
  label: string;
  count: number;
  xMin: number;
  xMax: number;
  xMid: number;
  meanResidual: number;
  stdResidual: number;
  stdZ: number;
  meanSqrtAbsZ: number;
}

function calcMean(vals: number[]): number {
  if (vals.length === 0) return 0;
  return vals.reduce((acc, v) => acc + v, 0) / vals.length;
}

function calcSampleStd(vals: number[]): number {
  if (vals.length < 2) return 0;
  const m = calcMean(vals);
  const ss = vals.reduce((acc, v) => acc + (v - m) ** 2, 0);
  return Math.sqrt(ss / (vals.length - 1));
}

function formatAxisNum(value: number): string {
  const abs = Math.abs(value);
  if (abs === 0) return '0';
  if (abs >= 10000 || (abs > 0 && abs < 0.01)) return value.toExponential(1);
  if (abs >= 100) return value.toFixed(0);
  if (abs >= 10) return value.toFixed(1);
  return value.toFixed(2);
}

const SPLIT_LABELS: Record<ResidualPoint['split'], string> = {
  train: 'Entrenamiento',
  validation: 'Validación',
  test: 'Prueba',
};

export const HomoscedasticityPlot: React.FC<HomoscedasticityPlotProps> = ({
  residuals,
  diagnostics,
  standardError,
  supportsInference,
  modelName,
  targetColumn,
  targetUnit,
}) => {
  const [mode, setMode] = useState<PlotMode>('raw');
  const [showEnvelope, setShowEnvelope] = useState<boolean>(true);
  const [hoveredPoint, setHoveredPoint] = useState<ResidualPoint | null>(null);

  const analysis = useMemo(() => {
    if (residuals.length < 3) return null;

    const sorted = [...residuals].sort((a, b) => a.predicted - b.predicted);
    const n = sorted.length;
    const cookThreshold = 4 / n;

    // Partition into 3 terciles (or 2 halves if n < 6) to measure dispersion stability across predicted values
    const groupCount = n >= 6 ? 3 : 2;
    const labels = groupCount === 3 ? ['Tercil Inferior', 'Tercil Medio', 'Tercil Superior'] : ['Mitad Inferior', 'Mitad Superior'];
    const bands: TercileBand[] = [];

    for (let g = 0; g < groupCount; g++) {
      const start = Math.floor((g * n) / groupCount);
      const end = Math.floor(((g + 1) * n) / groupCount);
      const slice = sorted.slice(start, end);
      if (slice.length === 0) continue;

      const xs = slice.map((p) => p.predicted);
      const rs = slice.map((p) => p.residual);
      const zs = slice.map((p) => p.standardizedResidual);
      const sqrtAbsZ = zs.map((z) => Math.sqrt(Math.abs(z)));

      bands.push({
        label: labels[g],
        count: slice.length,
        xMin: Math.min(...xs),
        xMax: Math.max(...xs),
        xMid: calcMean(xs),
        meanResidual: calcMean(rs),
        stdResidual: calcSampleStd(rs),
        stdZ: calcSampleStd(zs),
        meanSqrtAbsZ: calcMean(sqrtAbsZ),
      });
    }

    const stds = bands.map((b) => b.stdResidual).filter((s) => Number.isFinite(s));
    const minStd = stds.length > 0 ? Math.min(...stds) : 0;
    const maxStd = stds.length > 0 ? Math.max(...stds) : 0;
    const dispersionRatio = minStd > 1e-9 ? maxStd / minStd : maxStd > 0 ? 99 : 1;

    const globalResStd = standardError > 0 ? standardError : calcSampleStd(residuals.map((r) => r.residual));

    return {
      sorted,
      cookThreshold,
      bands,
      dispersionRatio,
      globalResStd,
    };
  }, [residuals, standardError]);

  if (!analysis || residuals.length < 3) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-6">
        <h3 className="text-base font-semibold text-slate-900">
          Evaluación de Homocedasticidad (Residuos vs. Valores Predichos)
        </h3>
        <p className="text-xs text-slate-600 mt-2">
          Se requieren al menos 3 observaciones con residuos calculados para generar el gráfico de dispersión frente a valores predichos.
        </p>
      </div>
    );
  }

  const { cookThreshold, bands, dispersionRatio, globalResStd } = analysis;

  // Compute chart geometry
  const w = 720;
  const h = 320;
  const padL = 64;
  const padR = 24;
  const padT = 22;
  const padB = 46;
  const plotW = w - padL - padR;
  const plotH = h - padT - padB;

  const preds = residuals.map((r) => r.predicted);
  const rawMinX = Math.min(...preds);
  const rawMaxX = Math.max(...preds);
  const xMargin = (rawMaxX - rawMinX || 1) * 0.04;
  const minX = rawMinX - xMargin;
  const maxX = rawMaxX + xMargin;

  const getYValue = (r: ResidualPoint): number => {
    if (mode === 'raw') return r.residual;
    if (mode === 'standardized') return r.standardizedResidual;
    return Math.sqrt(Math.abs(r.standardizedResidual));
  };

  const yValues = residuals.map(getYValue);

  let minY: number;
  let maxY: number;

  if (mode === 'scale_location') {
    const rawMax = Math.max(1.8, ...yValues);
    minY = 0;
    maxY = rawMax * 1.1;
  } else {
    const refBand = mode === 'raw' ? 2 * globalResStd : 2;
    const envelopeMax = showEnvelope
      ? Math.max(
          0,
          ...bands.map((b) => (mode === 'raw' ? Math.abs(b.meanResidual) + 1.96 * b.stdResidual : 1.96 * b.stdZ)),
        )
      : 0;
    const maxAbs = Math.max(1e-6, refBand * 1.1, envelopeMax * 1.05, ...yValues.map((v) => Math.abs(v) * 1.08));
    minY = -maxAbs;
    maxY = maxAbs;
  }

  const px = (x: number) => padL + ((x - minX) / (maxX - minX || 1)) * plotW;
  const py = (y: number) => padT + ((maxY - y) / (maxY - minY || 1)) * plotH;

  const xTicks = [0, 0.25, 0.5, 0.75, 1].map((t) => rawMinX + t * (rawMaxX - rawMinX));
  const yTicks =
    mode === 'scale_location'
      ? [0, 0.25, 0.5, 0.75, 1].map((t) => minY + t * (maxY - minY))
      : [minY, minY / 2, 0, maxY / 2, maxY];

  const refBandValue = mode === 'raw' ? 2 * globalResStd : 2;

  // Build envelope polygon points across tercile centers for raw & standardized modes
  const envelopePolygonPoints = (() => {
    if (!showEnvelope || bands.length < 2 || mode === 'scale_location') return '';
    const upperPts: string[] = [];
    const lowerPts: string[] = [];

    bands.forEach((b, idx) => {
      const xCoord = idx === 0 ? rawMinX : idx === bands.length - 1 ? rawMaxX : b.xMid;
      const halfSpread = mode === 'raw' ? 1.96 * b.stdResidual : 1.96 * b.stdZ;
      const center = mode === 'raw' ? b.meanResidual : 0;
      upperPts.push(`${px(xCoord).toFixed(1)},${py(center + halfSpread).toFixed(1)}`);
      lowerPts.unshift(`${px(xCoord).toFixed(1)},${py(center - halfSpread).toFixed(1)}`);
    });

    return [...upperPts, ...lowerPts].join(' ');
  })();

  const scaleTrendPoints = (() => {
    if (!showEnvelope || bands.length < 2 || mode !== 'scale_location') return '';
    return bands
      .map((b, idx) => {
        const xCoord = idx === 0 ? rawMinX : idx === bands.length - 1 ? rawMaxX : b.xMid;
        return `${px(xCoord).toFixed(1)},${py(b.meanSqrtAbsZ).toFixed(1)}`;
      })
      .join(' ');
  })();

  const isHeteroskedastic =
    diagnostics.hasHeteroskedasticity || (!supportsInference && dispersionRatio >= 1.8);

  const bpAvailable = supportsInference && diagnostics.breuschPaganPValue !== null;
  const influentialTotal = residuals.filter((r) => r.cooksD > cookThreshold).length;

  const yAxisTitle =
    mode === 'raw'
      ? `Residuo eᵢ (${targetUnit})`
      : mode === 'standardized'
      ? 'Residuo estandarizado (zᵢ)'
      : '√|Residuo estandarizado|';

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
      {/* Header + Controls */}
      <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="text-xs font-medium text-teal-700">
            Diagnóstico de Varianza Constante · {modelName}
          </div>
          <h3 className="text-base font-semibold text-slate-900">
            Gráfico de Dispersión: Residuos frente a Valores Predichos
          </h3>
          <p className="text-xs text-slate-600 max-w-2xl">
            Evalúa la homocedasticidad comprobando si la dispersión vertical de los errores se mantiene estable a lo
            largo del rango predicho de {targetColumn}. Un patrón en embudo o abanico indica heterocedasticidad.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
            <button
              type="button"
              onClick={() => setMode('raw')}
              className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors ${
                mode === 'raw' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Residuos (eᵢ)
            </button>
            <button
              type="button"
              onClick={() => setMode('standardized')}
              className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors ${
                mode === 'standardized' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Estandarizados (zᵢ)
            </button>
            <button
              type="button"
              onClick={() => setMode('scale_location')}
              className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors ${
                mode === 'scale_location' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Escala-Ubicación
            </button>
          </div>

          <button
            type="button"
            onClick={() => setShowEnvelope((prev) => !prev)}
            className={`px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
              showEnvelope
                ? 'border-teal-700 bg-teal-50 text-teal-900'
                : 'border-slate-200 bg-white text-slate-600 hover:text-slate-900'
            }`}
          >
            {showEnvelope ? 'Ocultar banda terciles' : 'Mostrar banda terciles'}
          </button>
        </div>
      </div>

      {/* Diagnostic KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 pt-1">
        <div className="border border-slate-200 rounded-lg p-3 bg-slate-50/50">
          <div className="text-[11px] font-medium text-slate-500">Evaluación de Homocedasticidad</div>
          <div
            className={`text-sm font-semibold mt-1 ${
              isHeteroskedastic ? 'text-amber-800' : 'text-teal-800'
            }`}
          >
            {isHeteroskedastic ? 'Heterocedasticidad detectada' : 'Homocedasticidad compatible'}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            {isHeteroskedastic
              ? 'Varianza no constante entre niveles predichos'
              : 'Dispersión estable en el rango ajustado'}
          </div>
        </div>

        <div className="border border-slate-200 rounded-lg p-3 bg-slate-50/50">
          <div className="text-[11px] font-medium text-slate-500">Prueba Breusch-Pagan</div>
          <div className="text-sm font-semibold font-mono tabular-nums text-slate-900 mt-1">
            {bpAvailable && diagnostics.breuschPaganPValue !== null
              ? `p = ${diagnostics.breuschPaganPValue.toFixed(4)}`
              : 'N/A (Regularizado)'}
          </div>
          <div className="text-[11px] text-slate-500 font-mono tabular-nums mt-0.5">
            {bpAvailable && diagnostics.breuschPaganStat !== null
              ? `LM = ${diagnostics.breuschPaganStat.toFixed(2)} · α = 0.05`
              : 'Evaluar mediante dispersión visual'}
          </div>
        </div>

        <div className="border border-slate-200 rounded-lg p-3 bg-slate-50/50">
          <div className="text-[11px] font-medium text-slate-500">Ratio de Dispersión (Terciles)</div>
          <div className="text-sm font-semibold font-mono tabular-nums text-slate-900 mt-1">
            {dispersionRatio.toFixed(2)}x
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            DE máx / DE mín entre niveles de ŷ
          </div>
        </div>

        <div className="border border-slate-200 rounded-lg p-3 bg-slate-50/50">
          <div className="text-[11px] font-medium text-slate-500">Tratamiento de Errores Estándar</div>
          <div className="text-sm font-semibold text-slate-900 mt-1">
            {diagnostics.usedRobustSE
              ? 'EE Robustos HC3 activos'
              : supportsInference
              ? 'EE Clásicos OLS válidos'
              : 'Sin inferencia OLS (L1/L2)'}
          </div>
          <div className="text-[11px] text-slate-500 font-mono tabular-nums mt-0.5">
            {influentialTotal > 0
              ? `${influentialTotal} punto(s) Cook D > 4/n`
              : `n = ${residuals.length} observaciones`}
          </div>
        </div>
      </div>

      {/* Main Interactive Scatter Plot */}
      <div className="space-y-2.5">
        <div className="border border-slate-200 rounded-lg bg-white p-3">
          <svg
            viewBox={`0 0 ${w} ${h}`}
            className="w-full h-auto select-none"
            role="img"
            aria-label={`Gráfico de dispersión de residuos frente a valores predichos para ${modelName}`}
            onMouseLeave={() => setHoveredPoint(null)}
          >
            {/* Horizontal grid lines */}
            {yTicks.map((tick, i) => {
              const yPos = py(tick);
              return (
                <g key={`y-${i}`}>
                  <line
                    x1={padL}
                    y1={yPos}
                    x2={w - padR}
                    y2={yPos}
                    stroke="#E2E8F0"
                    strokeWidth="1"
                    strokeDasharray="2 3"
                  />
                  <text
                    x={padL - 8}
                    y={yPos + 3}
                    textAnchor="end"
                    className="fill-slate-500 text-[10px] font-mono"
                  >
                    {formatAxisNum(tick)}
                  </text>
                </g>
              );
            })}

            {/* Vertical grid lines */}
            {xTicks.map((tick, i) => {
              const xPos = px(tick);
              return (
                <g key={`x-${i}`}>
                  <line
                    x1={xPos}
                    y1={padT}
                    x2={xPos}
                    y2={h - padB}
                    stroke="#F1F5F9"
                    strokeWidth="1"
                  />
                  <text
                    x={xPos}
                    y={h - padB + 15}
                    textAnchor="middle"
                    className="fill-slate-500 text-[10px] font-mono"
                  >
                    {formatAxisNum(tick)}
                  </text>
                </g>
              );
            })}

            {/* Empirical variance envelope across terciles */}
            {showEnvelope && mode !== 'scale_location' && envelopePolygonPoints && (
              <polygon
                points={envelopePolygonPoints}
                fill={isHeteroskedastic ? '#F59E0B' : '#0D9488'}
                fillOpacity={0.1}
                stroke={isHeteroskedastic ? '#D97706' : '#0D9488'}
                strokeOpacity={0.35}
                strokeWidth="1"
                strokeDasharray="3 3"
              />
            )}

            {/* +/- 2 sigma reference lines for raw / standardized */}
            {mode !== 'scale_location' && (
              <>
                <line
                  x1={padL}
                  y1={py(refBandValue)}
                  x2={w - padR}
                  y2={py(refBandValue)}
                  stroke="#94A3B8"
                  strokeWidth="1"
                  strokeDasharray="4 4"
                />
                <line
                  x1={padL}
                  y1={py(-refBandValue)}
                  x2={w - padR}
                  y2={py(-refBandValue)}
                  stroke="#94A3B8"
                  strokeWidth="1"
                  strokeDasharray="4 4"
                />
                <text
                  x={w - padR - 4}
                  y={py(refBandValue) - 4}
                  textAnchor="end"
                  className="fill-slate-400 text-[9px] font-mono"
                >
                  {mode === 'raw' ? '+2 sₑ' : '+2σ'}
                </text>
                <text
                  x={w - padR - 4}
                  y={py(-refBandValue) + 10}
                  textAnchor="end"
                  className="fill-slate-400 text-[9px] font-mono"
                >
                  {mode === 'raw' ? '-2 sₑ' : '-2σ'}
                </text>
              </>
            )}

            {/* Zero reference line */}
            {mode !== 'scale_location' && (
              <line
                x1={padL}
                y1={py(0)}
                x2={w - padR}
                y2={py(0)}
                stroke="#0D9488"
                strokeWidth="1.4"
                strokeDasharray="5 3"
              />
            )}

            {/* Scale-Location empirical trend polyline */}
            {showEnvelope && mode === 'scale_location' && scaleTrendPoints && (
              <polyline
                fill="none"
                stroke={isHeteroskedastic ? '#D97706' : '#0D9488'}
                strokeWidth="2"
                points={scaleTrendPoints}
              />
            )}

            {/* Plot Axes */}
            <line x1={padL} y1={padT} x2={padL} y2={h - padB} stroke="#CBD5E1" strokeWidth="1" />
            <line x1={padL} y1={h - padB} x2={w - padR} y2={h - padB} stroke="#CBD5E1" strokeWidth="1" />

            {/* Scatter Points */}
            {residuals.map((point) => {
              const cx = px(point.predicted);
              const cy = py(getYValue(point));
              const isInfluential = point.cooksD > cookThreshold;
              const isHovered = hoveredPoint?.index === point.index;

              return (
                <g key={point.index}>
                  {isHovered && (
                    <>
                      <line
                        x1={cx}
                        y1={padT}
                        x2={cx}
                        y2={h - padB}
                        stroke="#64748B"
                        strokeWidth="1"
                        strokeDasharray="2 2"
                      />
                      <circle
                        cx={cx}
                        cy={cy}
                        r={8}
                        fill="none"
                        stroke={isInfluential ? '#DC2626' : '#0F172A'}
                        strokeWidth="1.5"
                      />
                    </>
                  )}
                  <circle
                    cx={cx}
                    cy={cy}
                    r={isHovered ? 5.2 : isInfluential ? 4.4 : 3.4}
                    fill={isInfluential ? '#DC2626' : '#0F172A'}
                    fillOpacity={isHovered ? 1 : 0.78}
                    className="cursor-pointer transition-opacity"
                    onMouseEnter={() => setHoveredPoint(point)}
                  />
                </g>
              );
            })}

            {/* Axis Titles */}
            <text
              x={padL + plotW / 2}
              y={h - 10}
              textAnchor="middle"
              className="fill-slate-600 text-[11px] font-medium"
            >
              Valor predicho ŷ ({targetUnit})
            </text>
            <text
              x={16}
              y={padT + plotH / 2}
              textAnchor="middle"
              transform={`rotate(-90, 16, ${padT + plotH / 2})`}
              className="fill-slate-600 text-[11px] font-medium"
            >
              {yAxisTitle}
            </text>
          </svg>
        </div>

        {/* Legend & Hover Inspection Bar */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 px-1 text-xs">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-slate-600">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-slate-900 inline-block" />
              Observación nominal
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-red-600 inline-block" />
              Influyente (Cook D &gt; {(cookThreshold).toFixed(3)})
            </span>
            {mode !== 'scale_location' ? (
              <span className="inline-flex items-center gap-1.5">
                <span className="w-4 border-t-2 border-dashed border-teal-600 inline-block" />
                Referencia e = 0
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5">
                <span className="w-4 border-t-2 border-teal-600 inline-block" />
                Tendencia media por terciles
              </span>
            )}
          </div>

          <div className="font-mono tabular-nums text-[11px] text-slate-700 bg-slate-50 border border-slate-200 rounded-md px-3 py-1.5">
            {hoveredPoint ? (
              <span>
                Obs. #{hoveredPoint.index} ({SPLIT_LABELS[hoveredPoint.split]}) · ŷ ={' '}
                <strong>{hoveredPoint.predicted.toFixed(3)}</strong> · y ={' '}
                <strong>{hoveredPoint.actual.toFixed(3)}</strong> · e ={' '}
                <strong className={hoveredPoint.residual >= 0 ? 'text-teal-800' : 'text-rose-700'}>
                  {hoveredPoint.residual >= 0 ? '+' : ''}
                  {hoveredPoint.residual.toFixed(3)}
                </strong>{' '}
                · z = <strong>{hoveredPoint.standardizedResidual.toFixed(2)}</strong> · D ={' '}
                <strong>{hoveredPoint.cooksD.toFixed(4)}</strong>
              </span>
            ) : (
              <span className="text-slate-500">
                Pase el cursor sobre un punto del gráfico para inspeccionar su valor predicho y residuo exacto.
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Tercile Dispersion Breakdown Table */}
      <div className="border border-slate-200 rounded-lg overflow-hidden">
        <div className="bg-slate-50 px-3.5 py-2 border-b border-slate-200 flex items-center justify-between text-xs">
          <span className="font-semibold text-slate-800">
            Dispersión de Residuos por Tramo de Valores Predichos (ŷ)
          </span>
          <span className="text-slate-500 font-mono tabular-nums">
            Total evaluado: {residuals.length} obs.
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500 bg-white">
                <th className="px-3.5 py-2 text-left font-medium">Tramo Predicho</th>
                <th className="px-3.5 py-2 text-right font-medium">Obs. (n)</th>
                <th className="px-3.5 py-2 text-right font-medium">Rango de ŷ ({targetUnit})</th>
                <th className="px-3.5 py-2 text-right font-medium">Sesgo medio (ē)</th>
                <th className="px-3.5 py-2 text-right font-medium">Desv. Est. (DE)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {bands.map((b) => (
                <tr key={b.label} className="hover:bg-slate-50/70">
                  <td className="px-3.5 py-2 font-medium text-slate-900">{b.label}</td>
                  <td className="px-3.5 py-2 text-right font-mono tabular-nums text-slate-700">{b.count}</td>
                  <td className="px-3.5 py-2 text-right font-mono tabular-nums text-slate-600">
                    [{formatAxisNum(b.xMin)}, {formatAxisNum(b.xMax)}]
                  </td>
                  <td className="px-3.5 py-2 text-right font-mono tabular-nums text-slate-700">
                    {b.meanResidual >= 0 ? '+' : ''}
                    {b.meanResidual.toFixed(4)}
                  </td>
                  <td className="px-3.5 py-2 text-right font-mono tabular-nums font-semibold text-slate-900">
                    {b.stdResidual.toFixed(4)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Econometric Interpretation */}
      <div className="text-xs text-slate-600 leading-relaxed bg-slate-50 border border-slate-200 rounded-lg p-3.5">
        {isHeteroskedastic ? (
          <span>
            <strong className="text-slate-900">Lectura para la interpretación de coeficientes:</strong> La amplitud de
            los residuos varía según el nivel predicho (ratio entre tramos de{' '}
            <strong className="font-mono tabular-nums">{dispersionRatio.toFixed(2)}x</strong>
            {bpAvailable && diagnostics.breuschPaganPValue !== null
              ? `, Breusch-Pagan p = ${diagnostics.breuschPaganPValue.toFixed(4)}`
              : ''}
            ). Los coeficientes estimados (β) siguen siendo insesgados en media, pero{' '}
            {diagnostics.usedRobustSE
              ? 'la tabla inferior utiliza errores estándar robustos HC3 (White) para preservar la validez de los p-valores e intervalos de confianza.'
              : 'se recomienda cautela con los intervalos de confianza clásicos o aplicar errores estándar robustos.'}
          </span>
        ) : (
          <span>
            <strong className="text-slate-900">Lectura para la interpretación de coeficientes:</strong> Los residuos se
            distribuyen de forma aleatoria y con amplitud comparable alrededor de cero en todo el dominio predicho
            (ratio entre tramos de{' '}
            <strong className="font-mono tabular-nums">{dispersionRatio.toFixed(2)}x</strong>
            {bpAvailable && diagnostics.breuschPaganPValue !== null
              ? `, Breusch-Pagan p = ${diagnostics.breuschPaganPValue.toFixed(4)}`
              : ''}
            ), respaldando la validez de la varianza constante y de la inferencia de los parámetros estimados.
          </span>
        )}
      </div>
    </div>
  );
};
