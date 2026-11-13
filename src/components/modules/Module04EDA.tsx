import React, { useMemo, useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { CleanedDatasetResult, DatasetSummary, EDAResult } from '../../types/analytics';
import {
  BoxplotStrip,
  CorrelationHeatmap,
  HistogramChart,
  ScatterRegressionPlot,
} from '../charts/SvgCharts';

interface Module04Props {
  dataset: DatasetSummary;
  cleanedResult: CleanedDatasetResult | null;
  eda: EDAResult;
  onProceedNext: () => void;
}

export const Module04EDA: React.FC<Module04Props> = ({
  dataset,
  cleanedResult,
  eda,
  onProceedNext,
}) => {
  const numCols = eda.numericStats.map((s) => s.column);
  const [selectedHistCol, setSelectedHistCol] = useState(numCols[0] ?? '');
  const [scatterX, setScatterX] = useState(numCols[1] ?? numCols[0] ?? '');
  const [scatterY, setScatterY] = useState(numCols[0] ?? '');
  const [minAbsCorr, setMinAbsCorr] = useState(0);

  const activeStat = eda.numericStats.find((s) => s.column === selectedHistCol) ?? eda.numericStats[0];
  const rows = cleanedResult?.cleanedRows ?? dataset.rawRows;

  const scatterPoints = useMemo(() => {
    if (!scatterX || !scatterY) return [];
    const labelCol = dataset.columns.find((c) => c.isPotentialIdentifier || c.selectedType === 'geographic')?.name;
    const pts: Array<{ x: number; y: number; label?: string }> = [];
    for (const r of rows) {
      const xv = Number(r[scatterX]);
      const yv = Number(r[scatterY]);
      if (Number.isFinite(xv) && Number.isFinite(yv)) {
        pts.push({
          x: xv,
          y: yv,
          label: labelCol ? String(r[labelCol] ?? '') : undefined,
        });
      }
    }
    return pts;
  }, [rows, scatterX, scatterY, dataset.columns]);

  const filteredPairs = eda.pairs.filter((p) => p.absValue >= minAbsCorr);

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <p className="text-xs font-medium text-teal-700 mb-1">Módulo 04 · Análisis Exploratorio y Multicolinealidad</p>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">
            Exploración Estadística, Correlaciones y VIF
          </h2>
          <p className="text-sm text-slate-600 mt-1 max-w-3xl">
            Inspeccione distribuciones, relaciones bivariadas adaptadas al tipo de variable (Pearson, Spearman, Kendall, Cramér V, Eta²)
            y posibles redundancias mediante VIF antes de especificar los modelos.
          </p>
        </div>
        <button
          type="button"
          onClick={onProceedNext}
          className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap shrink-0"
        >
          Continuar a Selección de Variables
        </button>
      </div>

      {/* Mandatory Causality Disclaimer */}
      <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-950 flex items-start gap-2.5">
        <AlertCircle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
        <div>
          <strong>Advertencia metodológica fundamental:</strong> Correlación no implica causalidad. Una asociación elevada
          entre dos variables puede deberse a variables confusoras, relaciones simultáneas o tendencia común.
        </div>
      </div>

      {/* Descriptive Statistics Table */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
        <h3 className="text-base font-semibold text-slate-900">Estadísticos Descriptivos (Variables Cuantitativas)</h3>
        <div className="overflow-x-auto border border-slate-200 rounded-lg">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600">
                <th className="px-3 py-2.5 text-left font-semibold">Variable</th>
                <th className="px-3 py-2.5 text-right font-semibold">n</th>
                <th className="px-3 py-2.5 text-right font-semibold">Media</th>
                <th className="px-3 py-2.5 text-right font-semibold">Mediana</th>
                <th className="px-3 py-2.5 text-right font-semibold">Desv. Est.</th>
                <th className="px-3 py-2.5 text-right font-semibold">Mín</th>
                <th className="px-3 py-2.5 text-right font-semibold">Q1 / Q3</th>
                <th className="px-3 py-2.5 text-right font-semibold">Máx</th>
                <th className="px-3 py-2.5 text-right font-semibold">Asimetría</th>
                <th className="px-3 py-2.5 text-right font-semibold">Atípicos IQR</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {eda.numericStats.map((st) => (
                <tr key={st.column} className="hover:bg-slate-50/70">
                  <td className="px-3 py-2 font-medium text-slate-900">{st.column}</td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums">{st.n}</td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums">{st.mean.toFixed(2)}</td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums">{st.median.toFixed(2)}</td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums">{st.std.toFixed(2)}</td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums">{st.min.toFixed(2)}</td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums">
                    {st.q1.toFixed(1)} / {st.q3.toFixed(1)}
                  </td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums">{st.max.toFixed(2)}</td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums">{st.skewness.toFixed(2)}</td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums">{st.iqrOutliers}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Interactive Distribution & Scatter Explorer */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-base font-semibold text-slate-900">Histograma y Boxplot</h3>
            <select
              value={activeStat?.column ?? ''}
              onChange={(e) => setSelectedHistCol(e.target.value)}
              className="px-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
            >
              {numCols.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          {activeStat && (
            <div className="space-y-4">
              <HistogramChart
                bins={activeStat.histogramBins}
                title={`Distribución de ${activeStat.column}`}
                meanVal={activeStat.mean}
                medianVal={activeStat.median}
              />
              <BoxplotStrip
                min={activeStat.min}
                q1={activeStat.q1}
                median={activeStat.median}
                q3={activeStat.q3}
                max={activeStat.max}
                label={`Resumen de cinco números: ${activeStat.column}`}
              />
            </div>
          )}
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-base font-semibold text-slate-900">Dispersión y Tendencia Lineal</h3>
            <div className="flex items-center gap-2 text-xs">
              <select
                value={scatterX}
                onChange={(e) => setScatterX(e.target.value)}
                className="px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white"
              >
                {numCols.map((c) => (
                  <option key={c} value={c}>
                    X: {c}
                  </option>
                ))}
              </select>
              <select
                value={scatterY}
                onChange={(e) => setScatterY(e.target.value)}
                className="px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white"
              >
                {numCols.map((c) => (
                  <option key={c} value={c}>
                    Y: {c}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <ScatterRegressionPlot points={scatterPoints} xLabel={scatterX} yLabel={scatterY} />
        </div>
      </div>

      {/* Correlation Heatmap + Filterable Pairs */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
        <h3 className="text-base font-semibold text-slate-900">Matriz de Correlaciones y Asociaciones</h3>
        <CorrelationHeatmap
          columns={eda.correlationMatrix.columns}
          values={eda.correlationMatrix.values}
          methods={eda.correlationMatrix.methods}
        />

        <div className="pt-4 border-t border-slate-200 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h4 className="text-sm font-semibold text-slate-900">
              Pares ordenados por intensidad ({filteredPairs.length})
            </h4>
            <div className="flex items-center gap-2 text-xs">
              <span className="text-slate-600">Filtrar |r| ≥ {minAbsCorr.toFixed(2)}</span>
              <input
                type="range"
                min={0}
                max={0.8}
                step={0.05}
                value={minAbsCorr}
                onChange={(e) => setMinAbsCorr(Number(e.target.value))}
                className="accent-teal-700"
              />
            </div>
          </div>
          <div className="overflow-x-auto max-h-72 border border-slate-200 rounded-lg">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-left text-slate-600">
                  <th className="px-3 py-2 font-semibold">Par de Variables</th>
                  <th className="px-3 py-2 font-semibold">Método</th>
                  <th className="px-3 py-2 font-semibold text-right">Valor</th>
                  <th className="px-3 py-2 font-semibold">Intensidad</th>
                  <th className="px-3 py-2 font-semibold">Significado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredPairs.slice(0, 20).map((p, i) => (
                  <tr key={i} className="hover:bg-slate-50/70">
                    <td className="px-3 py-2 font-medium text-slate-900 whitespace-nowrap">
                      {p.varA} · {p.varB}
                    </td>
                    <td className="px-3 py-2 text-slate-600 font-mono">{p.method}</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums font-semibold">
                      {p.value.toFixed(3)}
                    </td>
                    <td className="px-3 py-2 text-slate-700 whitespace-nowrap">
                      {p.strength} ({p.direction})
                    </td>
                    <td className="px-3 py-2 text-slate-600">{p.interpretation}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* VIF Multicollinearity Table */}
      {eda.vifEntries.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-3">
          <div>
            <h3 className="text-base font-semibold text-slate-900">
              Diagnóstico Preliminar de Multicolinealidad (VIF)
            </h3>
            <p className="text-xs text-slate-600 mt-0.5">
              Un VIF elevado no implica excluir automáticamente una variable; evalúe su fundamento económico y considere regularización Ridge/Lasso si es indispensable conservarla.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {eda.vifEntries.map((v) => (
              <div key={v.feature} className="p-3.5 border border-slate-200 rounded-lg">
                <div className="text-xs font-medium text-slate-900 truncate" title={v.feature}>
                  {v.feature}
                </div>
                <div className="flex items-baseline justify-between mt-1.5">
                  <span className="text-lg font-bold font-mono tabular-nums text-slate-900">
                    {v.vif.toFixed(2)}
                  </span>
                  <span
                    className={`text-[11px] font-medium ${
                      v.vif >= 10 ? 'text-rose-700' : v.vif >= 5 ? 'text-amber-700' : 'text-teal-700'
                    }`}
                  >
                    {v.severity}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
