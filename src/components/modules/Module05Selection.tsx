import React from 'react';
import { ShieldAlert, Check } from 'lucide-react';
import { PredictorTier, VariableSelectionPlan } from '../../types/analytics';

interface Module05Props {
  plan: VariableSelectionPlan;
  onSelectTarget: (targetCol: string) => void;
  onTogglePredictor: (colName: string) => void;
  onTrainModels: () => void;
}

export const Module05Selection: React.FC<Module05Props> = ({
  plan,
  onSelectTarget,
  onTogglePredictor,
  onTrainModels,
}) => {
  const tierColor = (tier: PredictorTier) => {
    if (tier === 'Recomendada') return 'text-teal-800';
    if (tier === 'Opcional') return 'text-indigo-700';
    if (tier === 'Requiere revisión') return 'text-amber-700';
    return 'text-rose-700';
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <p className="text-xs font-medium text-teal-700 mb-1">Módulo 05 · Especificación Econométrica</p>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">
            Selección Inteligente de Variables (Y y X)
          </h2>
          <p className="text-sm text-slate-600 mt-1 max-w-3xl">
            Seleccione la variable dependiente (Y) y las independientes (X) combinando la pregunta de negocio,
            viabilidad estadística y protección frente a fuga de información o identificadores únicos.
          </p>
        </div>
        <button
          type="button"
          onClick={onTrainModels}
          disabled={plan.selectedPredictors.length === 0}
          className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 rounded-lg transition-colors whitespace-nowrap shrink-0"
        >
          Entrenar y Comparar Modelos ({plan.selectedPredictors.length} X)
        </button>
      </div>

      {/* Executive Explanation */}
      <div className="p-4 bg-white border border-slate-200 rounded-xl text-xs text-slate-700 leading-relaxed">
        <div className="font-semibold text-slate-900 mb-1">Explicación ejecutiva de la especificación</div>
        <p>{plan.executiveExplanation}</p>
      </div>

      {/* Target Selection (Y) */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
        <div>
          <h3 className="text-base font-semibold text-slate-900">1. Selección de la Variable Dependiente (Y)</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Variables ordenadas por relevancia frente a su pregunta de negocio y aptitud cuantitativa.
          </p>
        </div>
        <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg">
          {plan.targetCandidates.map((tc) => {
            const active = tc.column === plan.selectedTarget;
            return (
              <button
                key={tc.column}
                type="button"
                onClick={() => onSelectTarget(tc.column)}
                className={`w-full text-left p-3.5 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                  active ? 'bg-teal-50/60' : 'hover:bg-slate-50'
                }`}
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-xs">
                    <span className="font-semibold text-slate-900">{tc.column}</span>
                    <span className="text-slate-400">·</span>
                    <span className="text-slate-600">{tc.type}</span>
                    <span className="text-slate-400">·</span>
                    <span
                      className={
                        tc.statisticalViability === 'Alta'
                          ? 'text-teal-700 font-medium'
                          : tc.statisticalViability === 'Media'
                            ? 'text-amber-700 font-medium'
                            : 'text-rose-700 font-medium'
                      }
                    >
                      Viabilidad {tc.statisticalViability}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600">{tc.businessJustification}</p>
                  {tc.warnings.length > 0 && (
                    <p className="text-[11px] text-amber-800">{tc.warnings.join(' ')}</p>
                  )}
                </div>
                <div className="flex items-center gap-3 shrink-0 text-xs">
                  <span className="font-mono tabular-nums text-slate-500">Relevancia {tc.relevanceScore}%</span>
                  <span
                    className={`px-3 py-1 rounded-md font-medium ${
                      active ? 'bg-teal-700 text-white' : 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    {active ? 'Seleccionada (Y)' : 'Elegir como Y'}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Predictor Selection (X) */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-base font-semibold text-slate-900">
              2. Selección de Variables Independientes (X) para explicar "{plan.selectedTarget}"
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Agregue o retire variables manualmente. Identificadores únicos y columnas con fuga de información se bloquean por defecto.
            </p>
          </div>
          <span className="text-xs font-mono tabular-nums text-slate-700">
            {plan.selectedPredictors.length} predictoras activas
          </span>
        </div>

        <div className="overflow-x-auto border border-slate-200 rounded-lg">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-left text-slate-600">
                <th className="px-3 py-2.5 font-semibold">Incluir</th>
                <th className="px-3 py-2.5 font-semibold">Variable</th>
                <th className="px-3 py-2.5 font-semibold">Clasificación</th>
                <th className="px-3 py-2.5 font-semibold text-right">Asoc. con Y</th>
                <th className="px-3 py-2.5 font-semibold text-right">VIF</th>
                <th className="px-3 py-2.5 font-semibold">Justificación y Advertencias</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {plan.predictorCandidates.map((pc) => {
                const selected = plan.selectedPredictors.includes(pc.column);
                return (
                  <tr
                    key={pc.column}
                    className={`hover:bg-slate-50/70 ${pc.leakageRisk ? 'bg-rose-50/30' : ''}`}
                  >
                    <td className="px-3 py-2.5">
                      <button
                        type="button"
                        onClick={() => onTogglePredictor(pc.column)}
                        className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${
                          selected
                            ? 'bg-teal-700 border-teal-700 text-white'
                            : 'bg-white border-slate-300 text-transparent hover:border-slate-500'
                        }`}
                        aria-label={`Alternar ${pc.column}`}
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <div className="font-semibold text-slate-900">{pc.column}</div>
                      <div className="text-[11px] text-slate-500">
                        {pc.type} {pc.isControllable ? '· Controlable' : ''}
                      </div>
                    </td>
                    <td className={`px-3 py-2.5 font-semibold whitespace-nowrap ${tierColor(pc.tier)}`}>
                      {pc.tier}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums whitespace-nowrap">
                      {pc.correlationWithY !== null
                        ? `${pc.correlationWithY.toFixed(3)} (${pc.correlationMethod})`
                        : '—'}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                      {pc.vif !== null ? pc.vif.toFixed(2) : '—'}
                    </td>
                    <td className="px-3 py-2.5 text-slate-700 space-y-1">
                      <p>{pc.rationale}</p>
                      {pc.warnings.length > 0 && (
                        <p className="text-[11px] text-rose-700 flex items-center gap-1">
                          <ShieldAlert className="w-3 h-3 shrink-0" />
                          {pc.warnings.join(' ')}
                        </p>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
