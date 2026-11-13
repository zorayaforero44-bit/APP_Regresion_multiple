import React from 'react';
import { RefreshCw } from 'lucide-react';
import {
  AppMode,
  VariableSimulationMethod,
  VariableSimulationProfile,
} from '../../types/analytics';
import { methodLabel } from '../../engine/variableSimulator';

interface Module08Props {
  mode: AppMode;
  profiles: VariableSimulationProfile[];
  onChangeVariableMethod: (colName: string, method: VariableSimulationMethod) => void;
  onRegenerateSamples: () => void;
  onProceedNext: () => void;
}

export const Module08VarModeling: React.FC<Module08Props> = ({
  mode,
  profiles,
  onChangeVariableMethod,
  onRegenerateSamples,
  onProceedNext,
}) => {
  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <p className="text-xs font-medium text-teal-700 mb-1">
            Módulo 08 · Núcleo Metodológico de Simulación
          </p>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">
            Modelado Individual de Variables para Simulación
          </h2>
          <p className="text-sm text-slate-600 mt-1 max-w-3xl">
            Antes de simular escenarios, el sistema caracteriza cada predictor (tendencia, distribución, dependencia condicional acíclica y controlabilidad)
            para seleccionar el mecanismo estadístico más sólido sin alterar los coeficientes del modelo entrenado.
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={onRegenerateSamples}
            className="px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 flex items-center gap-1.5 whitespace-nowrap"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Regenerar muestras
          </button>
          <button
            type="button"
            onClick={onProceedNext}
            className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap"
          >
            Ir al Simulador de Escenarios
          </button>
        </div>
      </div>

      {/* Provenance Guard Banner */}
      <div className="p-3.5 bg-slate-100 border border-slate-200 rounded-lg text-xs text-slate-800">
        <strong>Integridad de datos:</strong> Los valores generados en este módulo llevan etiqueta explícita de procedencia
        (<span className="font-mono">Simulado</span> o <span className="font-mono">Definido por usuario</span>) y nunca se mezclan con los datos reales de entrenamiento ni modifican los coeficientes β del modelo predictivo.
      </div>

      {/* Per-Variable Justification Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {profiles.map((vp) => (
          <div key={vp.column} className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            {/* Header */}
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">{vp.column}</h3>
                <div className="text-xs text-slate-500 mt-0.5">
                  {vp.nature} · {vp.unit} · {vp.isControllable ? 'Palanca controlable' : 'Variable de entorno'} · Incertidumbre{' '}
                  <span
                    className={
                      vp.uncertaintyLevel === 'Alta'
                        ? 'text-rose-700 font-medium'
                        : vp.uncertaintyLevel === 'Media'
                          ? 'text-amber-700 font-medium'
                          : 'text-teal-700 font-medium'
                    }
                  >
                    {vp.uncertaintyLevel}
                  </span>
                </div>
              </div>
            </div>

            {/* Stage A: Historical Characterization */}
            <div className="text-xs space-y-1.5">
              <div className="font-semibold text-slate-800">Etapa A · Comportamiento histórico y límites</div>
              {vp.categories ? (
                <p className="text-slate-600">
                  Categorías observadas:{' '}
                  {vp.categories.map((c) => `${c.value} (${(c.probability * 100).toFixed(0)}%)`).join(', ')}
                </p>
              ) : (
                <div className="grid grid-cols-3 gap-2 font-mono tabular-nums text-[11px] text-slate-700 bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                  <div>Mín: {vp.historicalStats.min.toFixed(2)}</div>
                  <div>Mediana: {vp.historicalStats.median.toFixed(2)}</div>
                  <div>Máx: {vp.historicalStats.max.toFixed(2)}</div>
                  <div>Media: {vp.historicalStats.mean.toFixed(2)}</div>
                  <div>DE: {vp.historicalStats.std.toFixed(2)}</div>
                  <div>Asim: {vp.historicalStats.skewness.toFixed(2)}</div>
                </div>
              )}
              {vp.parentDependencies.length > 0 && (
                <p className="text-[11px] text-indigo-800">
                  Dependencias acíclicas detectadas:{' '}
                  {vp.parentDependencies.map((d) => `${d.column} (r=${d.correlation.toFixed(2)})`).join(', ')}
                </p>
              )}
            </div>

            {/* Stage B & C: Method Selection & Justification */}
            <div className="text-xs space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-slate-800">Etapa B/C · Mecanismo de simulación</span>
                <span className="text-[11px] text-teal-700 font-medium">
                  Recomendado: {methodLabel(vp.recommendedMethod)}
                </span>
              </div>

              <select
                value={vp.selectedMethod}
                onChange={(e) =>
                  onChangeVariableMethod(vp.column, e.target.value as VariableSimulationMethod)
                }
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
              >
                {vp.alternativesEvaluated.map((alt) => (
                  <option key={alt.method} value={alt.method} disabled={!alt.viable}>
                    {alt.label} (Ajuste {alt.fitScore}/100{alt.validationRmse !== null ? ` · RMSE val ${alt.validationRmse.toFixed(2)}` : ''})
                  </option>
                ))}
              </select>

              <p className="text-slate-600 leading-relaxed">{vp.justification}</p>
              <p className="text-[11px] text-slate-500">Evidencia: {vp.validationEvidence}</p>
              {!vp.categories && (
                <p className="text-[11px] text-slate-500 font-mono">
                  Límites admisibles: [{vp.constraints.minAllowed}, {vp.constraints.maxAllowed}]
                </p>
              )}
            </div>

            {/* Alternatives evaluated in Advanced or detail */}
            {mode === 'advanced' && (
              <div className="text-[11px] space-y-1 border-t border-slate-100 pt-2">
                <div className="font-semibold text-slate-700">Alternativas evaluadas:</div>
                {vp.alternativesEvaluated.slice(0, 4).map((alt) => (
                  <div key={alt.method} className="flex justify-between text-slate-600">
                    <span>{alt.label}</span>
                    <span className="font-mono tabular-nums">{alt.fitScore}/100</span>
                  </div>
                ))}
              </div>
            )}

            {/* Stage D: Simulated Values Preview */}
            <div className="border-t border-slate-100 pt-3">
              <div className="text-xs font-semibold text-slate-800 mb-2">
                Etapa D · Muestra de valores generados (trazabilidad)
              </div>
              <div className="grid grid-cols-5 gap-2 text-center">
                {vp.simulatedSamplePreview.map((item) => (
                  <div key={item.step} className="p-2 bg-slate-50 border border-slate-200 rounded text-[11px]">
                    <div className="text-slate-400">t+{item.step}</div>
                    <div className="font-mono tabular-nums font-semibold text-slate-900 mt-0.5 truncate">
                      {typeof item.value === 'number' ? item.value.toFixed(2) : item.value}
                    </div>
                    <div className="text-[10px] text-teal-700 truncate">{item.provenance}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
