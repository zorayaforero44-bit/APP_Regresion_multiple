import React, { useMemo, useState } from 'react';
import { Sliders, AlertCircle, Plus } from 'lucide-react';
import {
  BusinessContext,
  CleanedDatasetResult,
  DatasetSummary,
  OptimizationConfig,
  OptimizationResult,
  ScenarioResult,
  TrainedModelResult,
  VariableSimulationProfile,
} from '../../types/analytics';
import { optimizeDecisions } from '../../engine/optimizer';
import { getBaseReferenceInputs, runScenarioSimulation } from '../../engine/scenarioSimulator';

interface Module11Props {
  dataset: DatasetSummary;
  cleaned: CleanedDatasetResult;
  model: TrainedModelResult;
  profiles: VariableSimulationProfile[];
  context: BusinessContext;
  targetColumn: string;
  optimizationResult: OptimizationResult | null;
  onSetOptimizationResult: (res: OptimizationResult) => void;
  onSaveOptimalAsScenario: (sc: ScenarioResult) => void;
  onProceedNext: () => void;
}

export const Module11Optimization: React.FC<Module11Props> = ({
  dataset,
  cleaned,
  model,
  profiles,
  targetColumn,
  optimizationResult,
  onSetOptimizationResult,
  onSaveOptimalAsScenario,
  onProceedNext,
}) => {
  const numericProfiles = profiles.filter((p) => !p.categories);
  const baseInputs = useMemo(
    () => getBaseReferenceInputs(dataset, cleaned, profiles),
    [dataset, cleaned, profiles]
  );

  const [objective, setObjective] = useState<OptimizationConfig['objective']>('maximize');
  const [targetGoalValue, setTargetGoalValue] = useState<number>(
    Number((numericProfiles[0]?.historicalStats.mean ?? 100).toFixed(2))
  );
  const [hasBudget, setHasBudget] = useState(false);
  const [maxBudget, setMaxBudget] = useState(10000);
  const [varSettings, setVarSettings] = useState<OptimizationConfig['controllableVars']>(() =>
    numericProfiles.map((p) => ({
      column: p.column,
      enabled: p.isControllable,
      currentValue: Number(baseInputs[p.column] ?? p.historicalStats.median),
      minBound: p.historicalStats.min,
      maxBound: p.historicalStats.max,
      unitCost: 1,
    }))
  );

  const handleRunOptimization = () => {
    const cfg: OptimizationConfig = {
      objective,
      targetGoalValue: objective === 'target' ? targetGoalValue : undefined,
      controllableVars: varSettings,
      hasBudgetConstraint: hasBudget,
      maxBudget,
    };
    const res = optimizeDecisions(cfg, baseInputs, model, cleaned);
    onSetOptimizationResult(res);
  };

  const handleSaveAsScenario = () => {
    if (!optimizationResult) return;
    const simInputs: Record<string, number | string> = { ...baseInputs };
    for (const v of optimizationResult.optimalVariables) {
      simInputs[v.column] = v.optimalValue;
    }
    const sc = runScenarioSimulation({
      name: `Escenario Óptimo (${objective === 'maximize' ? 'Máx' : objective === 'minimize' ? 'Mín' : 'Meta'} ${targetColumn})`,
      type: 'personalizado',
      baseInputs,
      simulatedInputs: simInputs,
      basePredictedY: optimizationResult.basePrediction,
      profiles,
      model,
      cleaned,
      horizonSteps: 1,
      nSimulations: 1,
      seed: 42,
    });
    onSaveOptimalAsScenario(sc);
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <p className="text-xs font-medium text-teal-700 mb-1">Módulo 11 · Analítica Prescriptiva</p>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">
            Optimización Matemática de Decisiones
          </h2>
          <p className="text-sm text-slate-600 mt-1 max-w-3xl">
            Encuentre la combinación factible de variables controlables que optimiza "{targetColumn}" respetando límites operativos y restricciones presupuestarias.
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={handleRunOptimization}
            className="px-4 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap"
          >
            <Sliders className="w-3.5 h-3.5" />
            Ejecutar Optimizador
          </button>
          <button
            type="button"
            onClick={onProceedNext}
            className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap"
          >
            Ver Dashboard Ejecutivo
          </button>
        </div>
      </div>

      {/* Config */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
          <div>
            <label className="block font-medium text-slate-700 mb-1">Función objetivo sobre {targetColumn}</label>
            <select
              value={objective}
              onChange={(e) => setObjective(e.target.value as OptimizationConfig['objective'])}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
            >
              <option value="maximize">Maximizar {targetColumn}</option>
              <option value="minimize">Minimizar {targetColumn}</option>
              <option value="target">Alcanzar meta específica</option>
            </select>
          </div>
          {objective === 'target' && (
            <div>
              <label className="block font-medium text-slate-700 mb-1">Valor meta para {targetColumn}</label>
              <input
                type="number"
                value={targetGoalValue}
                onChange={(e) => setTargetGoalValue(Number(e.target.value))}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
              />
            </div>
          )}
          <div>
            <label className="flex items-center gap-2 font-medium text-slate-700 mb-1 cursor-pointer">
              <input
                type="checkbox"
                checked={hasBudget}
                onChange={(e) => setHasBudget(e.target.checked)}
                className="rounded border-slate-300 text-teal-700"
              />
              Aplicar restricción presupuestaria lineal
            </label>
            {hasBudget && (
              <input
                type="number"
                value={maxBudget}
                onChange={(e) => setMaxBudget(Number(e.target.value))}
                placeholder="Presupuesto máximo"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
              />
            )}
          </div>
        </div>

        {/* Variable bounds table */}
        <div className="overflow-x-auto border border-slate-200 rounded-lg">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600">
                <th className="px-3 py-2.5 text-left font-semibold">Modificar</th>
                <th className="px-3 py-2.5 text-left font-semibold">Variable</th>
                <th className="px-3 py-2.5 text-right font-semibold">Valor Base</th>
                <th className="px-3 py-2.5 text-right font-semibold">Límite Mínimo</th>
                <th className="px-3 py-2.5 text-right font-semibold">Límite Máximo</th>
                <th className="px-3 py-2.5 text-right font-semibold">Costo Unitario</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {varSettings.map((vs, idx) => (
                <tr key={vs.column}>
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={vs.enabled}
                      onChange={(e) => {
                        const next = [...varSettings];
                        next[idx] = { ...vs, enabled: e.target.checked };
                        setVarSettings(next);
                      }}
                      className="rounded border-slate-300 text-teal-700"
                    />
                  </td>
                  <td className="px-3 py-2 font-medium text-slate-900">{vs.column}</td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums">{vs.currentValue.toFixed(2)}</td>
                  <td className="px-3 py-2 text-right">
                    <input
                      type="number"
                      value={vs.minBound}
                      onChange={(e) => {
                        const next = [...varSettings];
                        next[idx] = { ...vs, minBound: Number(e.target.value) };
                        setVarSettings(next);
                      }}
                      className="w-24 px-2 py-1 border border-slate-300 rounded font-mono text-right"
                    />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <input
                      type="number"
                      value={vs.maxBound}
                      onChange={(e) => {
                        const next = [...varSettings];
                        next[idx] = { ...vs, maxBound: Number(e.target.value) };
                        setVarSettings(next);
                      }}
                      className="w-24 px-2 py-1 border border-slate-300 rounded font-mono text-right"
                    />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <input
                      type="number"
                      min={0}
                      step={0.1}
                      value={vs.unitCost}
                      onChange={(e) => {
                        const next = [...varSettings];
                        next[idx] = { ...vs, unitCost: Math.max(0, Number(e.target.value)) };
                        setVarSettings(next);
                      }}
                      className="w-20 px-2 py-1 border border-slate-300 rounded font-mono text-right"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Results */}
      {optimizationResult && (
        <div className="space-y-5">
          <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-950 flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
            <div>{optimizationResult.causalDisclaimer}</div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-slate-900">Solución Óptima Factible</h3>
                <p className="text-xs text-slate-500">
                  Convergencia en {optimizationResult.iterations} iteraciones · IP 95%: [
                  {optimizationResult.predictionInterval95[0].toFixed(2)},{' '}
                  {optimizationResult.predictionInterval95[1].toFixed(2)}]
                </p>
              </div>
              <button
                type="button"
                onClick={handleSaveAsScenario}
                className="px-3.5 py-2 text-xs font-semibold text-teal-800 bg-teal-50 border border-teal-200 hover:bg-teal-100 rounded-lg flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                Agregar como Escenario
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg">
                <div className="text-xs text-slate-500">Base actual ({targetColumn})</div>
                <div className="text-xl font-bold font-mono tabular-nums text-slate-900 mt-1">
                  {optimizationResult.basePrediction.toFixed(2)}
                </div>
              </div>
              <div className="p-4 bg-teal-50/70 border border-teal-200 rounded-lg">
                <div className="text-xs text-teal-800">Predicción Óptima</div>
                <div className="text-xl font-bold font-mono tabular-nums text-teal-900 mt-1">
                  {optimizationResult.optimalPrediction.toFixed(2)}
                </div>
              </div>
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg">
                <div className="text-xs text-slate-500">Impacto estimado</div>
                <div className="text-xl font-bold font-mono tabular-nums text-slate-900 mt-1">
                  {optimizationResult.improvementAbs >= 0 ? '+' : ''}
                  {optimizationResult.improvementAbs.toFixed(2)} ({optimizationResult.improvementPct.toFixed(1)}%)
                </div>
              </div>
            </div>

            <div className="overflow-x-auto border border-slate-200 rounded-lg">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600">
                    <th className="px-3 py-2 text-left font-semibold">Variable Controlable</th>
                    <th className="px-3 py-2 text-right font-semibold">Valor Base</th>
                    <th className="px-3 py-2 text-right font-semibold">Nivel Recomendado</th>
                    <th className="px-3 py-2 text-right font-semibold">Cambio</th>
                    <th className="px-3 py-2 text-left font-semibold">Estado de Cota</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {optimizationResult.optimalVariables.map((ov) => (
                    <tr key={ov.column}>
                      <td className="px-3 py-2 font-medium text-slate-900">{ov.column}</td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums">{ov.baseValue.toFixed(2)}</td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums font-bold text-teal-800">
                        {ov.optimalValue.toFixed(2)}
                      </td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums">
                        {ov.absDelta >= 0 ? '+' : ''}
                        {ov.absDelta.toFixed(2)} ({ov.pctDelta.toFixed(1)}%)
                      </td>
                      <td className="px-3 py-2 text-slate-600">
                        {ov.atUpperBound ? 'Cota superior activa' : ov.atLowerBound ? 'Cota inferior activa' : 'Óptimo interior'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {optimizationResult.activeConstraints.length > 0 && (
              <div className="text-xs text-slate-600 space-y-1">
                <div className="font-semibold text-slate-900">Restricciones activas detectadas:</div>
                {optimizationResult.activeConstraints.map((c, i) => (
                  <div key={i}>· {c}</div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
