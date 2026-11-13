import React, { useState } from 'react';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { AppMode, ModelingSuiteResult } from '../../types/analytics';
import { ModelComparisonChart, ResidualDiagnosticsCharts } from '../charts/SvgCharts';
import { MetricHelpBar } from '../MetricHelpBar';

interface Module06Props {
  mode: AppMode;
  suite: ModelingSuiteResult;
  onSelectActiveModel: (modelId: string) => void;
  onProceedNext: () => void;
}

export const Module06Modeling: React.FC<Module06Props> = ({
  mode,
  suite,
  onSelectActiveModel,
  onProceedNext,
}) => {
  const [inspectedId, setInspectedId] = useState(suite.recommendedModelId);
  const inspected =
    suite.models.find((m) => m.id === inspectedId) ??
    suite.models.find((m) => m.id === suite.recommendedModelId) ??
    suite.models[0];

  const activeRec = suite.models.find((m) => m.id === suite.recommendedModelId) ?? suite.models[0];

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <p className="text-xs font-medium text-teal-700 mb-1">Módulo 06 · Inferencia, Regularización y Validación</p>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">
            Construcción y Comparación de Modelos de Regresión
          </h2>
          <p className="text-sm text-slate-600 mt-1 max-w-3xl">
            Ranking multicriterio entre modelos paramétricos OLS (inferencia estadística) y modelos regularizados Ridge, Lasso y Elastic Net (predicción fuera de muestra).
          </p>
        </div>
        <button
          type="button"
          onClick={onProceedNext}
          className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap shrink-0"
        >
          Interpretar Coeficientes del Modelo
        </button>
      </div>

      {mode === 'guided' && <MetricHelpBar compact />}

      {suite.smallSampleWarning && (
        <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-950 flex items-start gap-2.5">
          <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
          <div>{suite.smallSampleWarning}</div>
        </div>
      )}

      {/* Recommended Model Summary */}
      {activeRec && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="text-xs font-semibold text-teal-700 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4" />
                Modelo Recomendado ({activeRec.purpose})
              </div>
              <h3 className="text-lg font-bold text-slate-900 mt-0.5">{activeRec.name}</h3>
            </div>
            <div className="text-xs text-slate-500 font-mono tabular-nums">
              Estrategia: {suite.validationStrategy} · Score multicriterio: {activeRec.multiCriteriaScore}/100
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 pt-1">
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
              <div className="text-[11px] text-slate-500">R² Ajustado (CR²)</div>
              <div className="text-base font-bold font-mono tabular-nums text-slate-900 mt-0.5">
                {(activeRec.metrics.adjR2Train * 100).toFixed(2)}%
              </div>
            </div>
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
              <div className="text-[11px] text-slate-500">R² Entrenamiento</div>
              <div className="text-base font-bold font-mono tabular-nums text-slate-900 mt-0.5">
                {(activeRec.metrics.r2Train * 100).toFixed(2)}%
              </div>
            </div>
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
              <div className="text-[11px] text-slate-500">RMSE Validación</div>
              <div className="text-base font-bold font-mono tabular-nums text-slate-900 mt-0.5">
                {activeRec.metrics.rmseVal.toFixed(3)}
              </div>
            </div>
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
              <div className="text-[11px] text-slate-500">MAE Validación</div>
              <div className="text-base font-bold font-mono tabular-nums text-slate-900 mt-0.5">
                {activeRec.metrics.maeVal.toFixed(3)}
              </div>
            </div>
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
              <div className="text-[11px] text-slate-500">Prueba F Global</div>
              <div className="text-base font-bold font-mono tabular-nums text-slate-900 mt-0.5">
                {activeRec.metrics.fStatistic !== null
                  ? `${activeRec.metrics.fStatistic.toFixed(2)} (p=${activeRec.metrics.fPValue?.toFixed(4)})`
                  : 'Regularizado'}
              </div>
            </div>
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
              <div className="text-[11px] text-slate-500">Error Estándar (sₑ)</div>
              <div className="text-base font-bold font-mono tabular-nums text-slate-900 mt-0.5">
                {activeRec.metrics.standardError.toFixed(3)}
              </div>
            </div>
          </div>

          <p className="text-xs text-slate-700 leading-relaxed">{suite.conflictExplanation}</p>
        </div>
      )}

      {/* Comparative Ranking Table & Chart */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
        <h3 className="text-base font-semibold text-slate-900">Ranking Comparativo de Modelos</h3>
        <ModelComparisonChart models={suite.models} />

        <div className="overflow-x-auto border border-slate-200 rounded-lg mt-4">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600">
                <th className="px-3 py-2.5 text-left font-semibold">Modelo</th>
                <th className="px-3 py-2.5 text-left font-semibold">Enfoque</th>
                <th className="px-3 py-2.5 text-right font-semibold">Vars</th>
                <th className="px-3 py-2.5 text-right font-semibold">CR² (Adj)</th>
                <th className="px-3 py-2.5 text-right font-semibold">RMSE Val</th>
                <th className="px-3 py-2.5 text-right font-semibold">MAE Val</th>
                <th className="px-3 py-2.5 text-right font-semibold">RMSE CV</th>
                <th className="px-3 py-2.5 text-right font-semibold">Sig. F</th>
                <th className="px-3 py-2.5 text-right font-semibold">VIF máx</th>
                <th className="px-3 py-2.5 text-right font-semibold">Score</th>
                <th className="px-3 py-2.5 text-right font-semibold">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {suite.models.map((m) => {
                const isActive = m.id === suite.recommendedModelId;
                return (
                  <tr
                    key={m.id}
                    onClick={() => setInspectedId(m.id)}
                    className={`cursor-pointer transition-colors ${
                      inspected?.id === m.id ? 'bg-slate-100/80' : 'hover:bg-slate-50'
                    }`}
                  >
                    <td className="px-3 py-2.5 font-medium text-slate-900 whitespace-nowrap">
                      {m.name}
                    </td>
                    <td className="px-3 py-2.5 text-slate-600 whitespace-nowrap">{m.purpose}</td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums">{m.metrics.pFeatures}</td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                      {(m.metrics.adjR2Train * 100).toFixed(1)}%
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums font-semibold">
                      {m.metrics.rmseVal.toFixed(3)}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                      {m.metrics.maeVal.toFixed(3)}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                      {m.metrics.cvRmse.toFixed(3)}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                      {m.metrics.fPValue !== null ? m.metrics.fPValue.toFixed(4) : 'No aplica'}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                      {m.diagnostics.maxVif.toFixed(2)}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums font-bold text-teal-800">
                      {m.multiCriteriaScore.toFixed(1)}
                    </td>
                    <td className="px-3 py-2.5 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectActiveModel(m.id);
                          setInspectedId(m.id);
                        }}
                        className={`px-2.5 py-1 rounded text-[11px] font-medium ${
                          isActive
                            ? 'bg-teal-700 text-white'
                            : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        {isActive ? 'Activo' : 'Usar modelo'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Assumption Diagnostics & Residual Plots for Inspected Model */}
      {inspected && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h3 className="text-base font-semibold text-slate-900">
                Diagnóstico de Supuestos y Residuos: {inspected.name}
              </h3>
              <p className="text-xs text-slate-600 mt-0.5">{inspected.tradeoffExplanation}</p>
            </div>
            <span className="text-xs font-mono text-slate-500">
              AIC {inspected.metrics.aic.toFixed(1)} · BIC {inspected.metrics.bic.toFixed(1)}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
            <div className="p-3.5 border border-slate-200 rounded-lg">
              <div className="text-slate-500">Homocedasticidad (Breusch-Pagan)</div>
              <div className="font-semibold text-slate-900 mt-1">
                {inspected.diagnostics.breuschPaganPValue !== null
                  ? `p = ${inspected.diagnostics.breuschPaganPValue.toFixed(4)} (${inspected.diagnostics.hasHeteroskedasticity ? 'Heterocedástico -> HC3 activo' : 'Homocedástico'})`
                  : 'No aplica a regularización'}
              </div>
            </div>
            <div className="p-3.5 border border-slate-200 rounded-lg">
              <div className="text-slate-500">Independencia (Durbin-Watson)</div>
              <div className="font-semibold text-slate-900 mt-1">
                DW = {inspected.diagnostics.durbinWatson?.toFixed(2) ?? 'N/D'}
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">{inspected.diagnostics.autocorrelationNote}</div>
            </div>
            <div className="p-3.5 border border-slate-200 rounded-lg">
              <div className="text-slate-500">Normalidad de residuos (Jarque-Bera)</div>
              <div className="font-semibold text-slate-900 mt-1">
                p = {inspected.diagnostics.jarqueBeraPValue?.toFixed(4) ?? 'N/D'} (
                {inspected.diagnostics.residualsNormal ? 'Normal' : 'Desviación de normalidad'})
              </div>
            </div>
            <div className="p-3.5 border border-slate-200 rounded-lg">
              <div className="text-slate-500">Observaciones influyentes (Cook D &gt; 4/n)</div>
              <div className="font-semibold text-slate-900 mt-1">
                {inspected.diagnostics.influentialCount} obs. (Cook máx = {inspected.diagnostics.maxCooksD.toFixed(3)})
              </div>
            </div>
          </div>

          <ResidualDiagnosticsCharts residuals={inspected.residuals} />
        </div>
      )}
    </div>
  );
};
