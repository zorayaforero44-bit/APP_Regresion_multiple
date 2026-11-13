import React from 'react';
import { AlertCircle } from 'lucide-react';
import { TrainedModelResult } from '../../types/analytics';
import { CoefficientForestPlot } from '../charts/SvgCharts';
import { HomoscedasticityPlot } from '../charts/HomoscedasticityPlot';

interface Module07Props {
  model: TrainedModelResult;
  targetColumn: string;
  targetUnit: string;
  onProceedNext: () => void;
}

export const Module07Interpretation: React.FC<Module07Props> = ({
  model,
  targetColumn,
  targetUnit,
  onProceedNext,
}) => {
  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <p className="text-xs font-medium text-teal-700 mb-1">Módulo 07 · Interpretación Econométrica</p>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">
            Ecuación Estimada e Interpretación de Coeficientes
          </h2>
          <p className="text-sm text-slate-600 mt-1 max-w-3xl">
            Lectura ceteris paribus de cada parámetro del modelo "{model.name}", sus intervalos de confianza,
            elasticidades medias y distinción estricta frente a causalidad.
          </p>
        </div>
        <button
          type="button"
          onClick={onProceedNext}
          className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap shrink-0"
        >
          Modelar Variables para Simulación
        </button>
      </div>

      {/* Estimated Equation Box */}
      <div className="bg-slate-900 text-white rounded-xl p-6 space-y-2">
        <div className="text-xs text-teal-300 font-medium">Ecuación estimada del modelo activo</div>
        <div className="font-mono text-sm sm:text-base leading-relaxed break-words">
          {model.equationString}
        </div>
        <div className="text-xs text-slate-300 pt-2 border-t border-slate-800 flex flex-wrap gap-x-6 gap-y-1">
          <span>
            Intercepto (β₀): <strong className="font-mono text-white">{model.intercept.toFixed(4)}</strong> ({targetUnit})
          </span>
          <span>
            Variable dependiente: <strong className="text-white">{targetColumn}</strong>
          </span>
          <span>
            Inferencia paramétrica:{' '}
            <strong className="text-white">
              {model.supportsInference ? 'Válida (OLS)' : 'Regularizada (L1/L2 — sin p-valores OLS)'}
            </strong>
          </span>
        </div>
      </div>

      {/* Causality vs Association Reminder */}
      <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-950 flex items-start gap-2.5">
        <AlertCircle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
        <div>
          <strong>Asociación estadística vs efecto causal:</strong> Un coeficiente β significativo indica cómo varía en promedio{' '}
          {targetColumn} por cada cambio unitario en X manteniendo constantes las demás variables incluidas en la ecuación (ceteris paribus); no demuestra causalidad en ausencia de experimento o identificación causal.
        </div>
      </div>

      {/* Contribution Forest Plot */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
        <h3 className="text-base font-semibold text-slate-900">
          Contribución Relativa de Predictores (Coeficientes Estandarizados)
        </h3>
        <CoefficientForestPlot coefficients={model.coefficients} />
      </div>

      {/* Homoscedasticity: Residuals vs Predicted Values */}
      <HomoscedasticityPlot
        residuals={model.residuals}
        diagnostics={model.diagnostics}
        standardError={model.metrics.standardError}
        supportsInference={model.supportsInference}
        modelName={model.name}
        targetColumn={targetColumn}
        targetUnit={targetUnit}
      />

      {/* Detailed Coefficients Table */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <h3 className="text-base font-semibold text-slate-900">Tabla Detallada de Coeficientes</h3>
          <span className="text-xs text-slate-500">
            {model.supportsInference
              ? model.diagnostics.usedRobustSE
                ? 'Errores estándar y p-valores con corrección robusta HC3 (heterocedasticidad)'
                : 'Errores estándar clásicos OLS bajo supuesto de homocedasticidad'
              : 'Modelo regularizado · inferencia paramétrica no aplicable'}
          </span>
        </div>
        <div className="overflow-x-auto border border-slate-200 rounded-lg">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600">
                <th className="px-3 py-2.5 text-left font-semibold">Variable (Unidad)</th>
                <th className="px-3 py-2.5 text-right font-semibold">Coef. (β)</th>
                <th className="px-3 py-2.5 text-right font-semibold">Error Est.</th>
                <th className="px-3 py-2.5 text-right font-semibold">Estadístico t</th>
                <th className="px-3 py-2.5 text-right font-semibold">P-valor</th>
                <th className="px-3 py-2.5 text-right font-semibold">IC 95%</th>
                <th className="px-3 py-2.5 text-right font-semibold">Elasticidad media</th>
                <th className="px-3 py-2.5 text-right font-semibold">VIF</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              <tr>
                <td className="px-3 py-2.5 font-medium text-slate-900">Intercepto (β₀)</td>
                <td className="px-3 py-2.5 text-right font-mono tabular-nums font-semibold">
                  {model.intercept.toFixed(4)}
                </td>
                <td className="px-3 py-2.5 text-right font-mono text-slate-400">—</td>
                <td className="px-3 py-2.5 text-right font-mono text-slate-400">—</td>
                <td className="px-3 py-2.5 text-right font-mono text-slate-400">—</td>
                <td className="px-3 py-2.5 text-right font-mono text-slate-400">—</td>
                <td className="px-3 py-2.5 text-right font-mono text-slate-400">—</td>
                <td className="px-3 py-2.5 text-right font-mono text-slate-400">—</td>
              </tr>
              {model.coefficients.map((c) => {
                const usedSe = model.diagnostics.usedRobustSE ? c.robustStdError : c.stdError;
                const usedP = model.diagnostics.usedRobustSE ? c.robustPValue : c.pValue;
                return (
                  <tr key={c.feature} className="hover:bg-slate-50/70">
                    <td className="px-3 py-2.5 font-medium text-slate-900">
                      {c.feature}
                      <div className="text-[11px] text-slate-400 font-normal">{c.unit}</div>
                    </td>
                    <td
                      className={`px-3 py-2.5 text-right font-mono tabular-nums font-semibold ${
                        c.estimate >= 0 ? 'text-teal-800' : 'text-rose-700'
                      }`}
                    >
                      {c.estimate.toFixed(4)}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                      {c.inferenceValid && usedSe !== null && usedSe !== undefined ? usedSe.toFixed(4) : 'N/A (Reg.)'}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                      {c.inferenceValid && c.tStat !== null ? c.tStat.toFixed(3) : 'N/A'}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                      {c.inferenceValid && usedP !== null && usedP !== undefined ? (
                        <span className={usedP < 0.05 ? 'font-bold text-teal-700' : 'text-slate-600'}>
                          {usedP.toFixed(4)}
                        </span>
                      ) : (
                        'N/A'
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums whitespace-nowrap">
                      {c.inferenceValid && c.ciLower95 !== null && c.ciUpper95 !== null
                        ? `[${c.ciLower95.toFixed(3)}, ${c.ciUpper95.toFixed(3)}]`
                        : 'N/A'}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                      {c.elasticityAtMean !== null && c.elasticityAtMean !== undefined
                        ? `${c.elasticityAtMean.toFixed(3)}`
                        : '—'}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                      {c.vif !== null ? c.vif.toFixed(2) : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Ceteris Paribus Narrative Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {model.coefficients.map((c) => (
          <div key={c.feature} className="bg-white border border-slate-200 rounded-xl p-5 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-slate-900">{c.feature}</span>
              <span className="text-xs font-mono tabular-nums text-slate-600">
                Signo: {c.estimate >= 0 ? 'Positivo (+)' : 'Negativo (-)'} ·{' '}
                {c.inferenceValid
                  ? c.isSignificant05
                    ? 'Significativa (p < 0,05)'
                    : 'No significativa al 5%'
                  : 'Regularizada'}
              </span>
            </div>
            <p className="text-xs text-slate-700 leading-relaxed">{c.ceterisParibusText}</p>
            {c.elasticityAtMean !== null && c.elasticityAtMean !== undefined && (
              <p className="text-[11px] text-slate-500">
                Elasticidad estimada en la media: un cambio del 1% en {c.feature} se asocia con un cambio de{' '}
                <strong className="font-mono">{c.elasticityAtMean.toFixed(2)}%</strong> en {targetColumn}.
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
