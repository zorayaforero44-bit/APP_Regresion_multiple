import React, { useMemo, useState } from 'react';
import { Play, Plus, Trash2, AlertTriangle } from 'lucide-react';
import {
  BusinessContext,
  CleanedDatasetResult,
  DatasetSummary,
  ScenarioPresetType,
  ScenarioResult,
  TrainedModelResult,
  VariableSimulationProfile,
} from '../../types/analytics';
import {
  generatePresetInputs,
  getBaseReferenceInputs,
  predictSingleObservation,
  runScenarioSimulation,
} from '../../engine/scenarioSimulator';
import { HistogramChart, ScenarioComparisonChart } from '../charts/SvgCharts';

interface Module09Props {
  dataset: DatasetSummary;
  cleaned: CleanedDatasetResult;
  model: TrainedModelResult;
  profiles: VariableSimulationProfile[];
  context: BusinessContext;
  targetColumn: string;
  targetUnit: string;
  scenarios: ScenarioResult[];
  onAddScenario: (s: ScenarioResult) => void;
  onRemoveScenario: (id: string) => void;
  onProceedNext: () => void;
}

export const Module09Simulator: React.FC<Module09Props> = ({
  dataset,
  cleaned,
  model,
  profiles,
  context,
  targetColumn,
  targetUnit,
  scenarios,
  onAddScenario,
  onRemoveScenario,
  onProceedNext,
}) => {
  const [refRowIdx, setRefRowIdx] = useState<string>('median');
  const [scenarioName, setScenarioName] = useState('Escenario Personalizado');
  const [presetType, setPresetType] = useState<ScenarioPresetType>('personalizado');
  const [horizonSteps, setHorizonSteps] = useState(1);
  const [nSimulations, setNSimulations] = useState(500);
  const [seed, setSeed] = useState(42);

  const baseInputs = useMemo(
    () =>
      getBaseReferenceInputs(
        dataset,
        cleaned,
        profiles,
        refRowIdx === 'median' ? undefined : Number(refRowIdx)
      ),
    [dataset, cleaned, profiles, refRowIdx]
  );

  const [draftInputs, setDraftInputs] = useState<Record<string, number | string>>(baseInputs);

  // Sync draft when refRow changes
  const handleSelectReference = (val: string) => {
    setRefRowIdx(val);
    const nextBase = getBaseReferenceInputs(
      dataset,
      cleaned,
      profiles,
      val === 'median' ? undefined : Number(val)
    );
    setDraftInputs(nextBase);
  };

  const basePred = useMemo(
    () => predictSingleObservation(baseInputs, model, cleaned),
    [baseInputs, model, cleaned]
  );

  const livePred = useMemo(
    () => predictSingleObservation(draftInputs, model, cleaned),
    [draftInputs, model, cleaned]
  );

  const liveDeltaAbs = livePred.predictedY - basePred.predictedY;
  const liveDeltaPct =
    basePred.predictedY !== 0 ? (liveDeltaAbs / Math.abs(basePred.predictedY)) * 100 : 0;

  const applyPreset = (type: ScenarioPresetType) => {
    setPresetType(type);
    const presetLabels: Record<ScenarioPresetType, string> = {
      base: 'Escenario Base (Referencia)',
      optimista: 'Escenario Optimista',
      conservador: 'Escenario Conservador',
      adverso: 'Escenario Adverso',
      personalizado: 'Escenario Personalizado',
      probabilistico: 'Simulación Probabilística Monte Carlo',
    };
    setScenarioName(presetLabels[type]);
    const generated = generatePresetInputs(type, baseInputs, profiles, model, context, horizonSteps);
    setDraftInputs(generated);
  };

  const handleSaveScenario = (customType?: ScenarioPresetType) => {
    const t = customType ?? presetType;
    const result = runScenarioSimulation({
      name: scenarioName.trim() || `Escenario ${scenarios.length + 1}`,
      type: t,
      baseInputs,
      simulatedInputs: draftInputs,
      basePredictedY: basePred.predictedY,
      profiles,
      model,
      cleaned,
      horizonSteps,
      nSimulations: t === 'probabilistico' ? nSimulations : 1,
      seed,
    });
    onAddScenario(result);
  };

  const handleGenerateStandardSuite = () => {
    const types: Array<{ type: ScenarioPresetType; label: string }> = [
      { type: 'base', label: 'Escenario Base' },
      { type: 'optimista', label: 'Escenario Optimista' },
      { type: 'conservador', label: 'Escenario Conservador' },
      { type: 'adverso', label: 'Escenario Adverso' },
      { type: 'probabilistico', label: 'Escenario Probabilístico (Monte Carlo)' },
    ];
    for (const item of types) {
      const inputs = generatePresetInputs(item.type, baseInputs, profiles, model, context, horizonSteps);
      const res = runScenarioSimulation({
        name: item.label,
        type: item.type,
        baseInputs,
        simulatedInputs: inputs,
        basePredictedY: basePred.predictedY,
        profiles,
        model,
        cleaned,
        horizonSteps,
        nSimulations: item.type === 'probabilistico' ? nSimulations : 1,
        seed,
      });
      onAddScenario(res);
    }
  };

  const labelCol = dataset.columns.find((c) => c.isPotentialIdentifier || c.selectedType === 'geographic' || c.selectedType === 'datetime')?.name;
  const lastProbabilistic = [...scenarios].reverse().find((s) => s.monteCarloDistribution);

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <p className="text-xs font-medium text-teal-700 mb-1">Módulo 09 · Laboratorio Interactivo de Simulación</p>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">
            Simulador Inteligente de Escenarios Empresariales
          </h2>
          <p className="text-sm text-slate-600 mt-1 max-w-3xl">
            Modifique variables controlables o simule condiciones de entorno preservando dependencias y rangos plausibles.
            Distingue intervalo de confianza de la media (IC 95%) e intervalo de predicción individual (IP 95%).
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={handleGenerateStandardSuite}
            className="px-3.5 py-2 text-xs font-semibold text-teal-800 bg-teal-50 border border-teal-300 hover:bg-teal-100 rounded-lg transition-colors whitespace-nowrap"
          >
            Generar Suite (Base, Opt, Cons, Adv, MC)
          </button>
          <button
            type="button"
            onClick={onProceedNext}
            className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap"
          >
            Ver Recomendaciones
          </button>
        </div>
      </div>

      {/* Reference & Presets */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-xs">
          <div>
            <label className="block font-medium text-slate-700 mb-1">Observación de referencia (Base)</label>
            <select
              value={refRowIdx}
              onChange={(e) => handleSelectReference(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
            >
              <option value="median">Mediana histórica de la muestra</option>
              {cleaned.cleanedRows.slice(0, 30).map((r, i) => (
                <option key={i} value={String(i)}>
                  Fila #{i + 1} {labelCol ? `(${String(r[labelCol])})` : ''}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block font-medium text-slate-700 mb-1">Nombre del escenario</label>
            <input
              type="text"
              value={scenarioName}
              onChange={(e) => setScenarioName(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block font-medium text-slate-700 mb-1">Horizonte (pasos) / Simulaciones MC</label>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="number"
                min={1}
                max={24}
                value={horizonSteps}
                onChange={(e) => setHorizonSteps(Math.max(1, Number(e.target.value)))}
                className="px-2.5 py-2 border border-slate-300 rounded-lg font-mono"
                title="Horizonte temporal"
              />
              <input
                type="number"
                min={100}
                max={3000}
                step={100}
                value={nSimulations}
                onChange={(e) => setNSimulations(Math.max(100, Number(e.target.value)))}
                className="px-2.5 py-2 border border-slate-300 rounded-lg font-mono"
                title="Iteraciones Monte Carlo"
              />
            </div>
          </div>
          <div>
            <label className="block font-medium text-slate-700 mb-1">Semilla aleatoria (Reproducibilidad)</label>
            <input
              type="number"
              value={seed}
              onChange={(e) => setSeed(Number(e.target.value) || 42)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
            />
          </div>
        </div>

        {/* Preset Buttons */}
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100">
          <span className="text-xs text-slate-500 mr-2">Plantillas plausibles:</span>
          {(
            [
              ['base', 'Base'],
              ['optimista', 'Optimista'],
              ['conservador', 'Conservador'],
              ['adverso', 'Adverso'],
              ['personalizado', 'Personalizado'],
              ['probabilistico', 'Probabilístico (Monte Carlo)'],
            ] as Array<[ScenarioPresetType, string]>
          ).map(([t, lbl]) => (
            <button
              key={t}
              type="button"
              onClick={() => applyPreset(t)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                presetType === t
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              {lbl}
            </button>
          ))}
        </div>
      </div>

      {/* Interactive Controls + Live Output Split */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Sliders & Inputs */}
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6 space-y-5">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-slate-900">
              Variables Independientes Simulables
            </h3>
            <span className="text-xs text-slate-500">Ajuste valores o porcentajes respecto a la base</span>
          </div>

          <div className="space-y-4">
            {profiles.map((vp) => {
              const current = draftInputs[vp.column];
              const baseVal = baseInputs[vp.column];

              if (vp.categories && vp.categories.length > 0) {
                return (
                  <div key={vp.column} className="p-3.5 border border-slate-200 rounded-lg space-y-2 text-xs">
                    <div className="flex justify-between font-medium text-slate-900">
                      <span>{vp.column}</span>
                      <span className="text-slate-500">Base: {String(baseVal)}</span>
                    </div>
                    <select
                      value={String(current ?? baseVal)}
                      onChange={(e) =>
                        setDraftInputs({ ...draftInputs, [vp.column]: e.target.value })
                      }
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                    >
                      {vp.categories.map((cat) => (
                        <option key={cat.value} value={cat.value}>
                          {cat.value} ({(cat.probability * 100).toFixed(0)}% histórico)
                        </option>
                      ))}
                    </select>
                  </div>
                );
              }

              const numVal = Number(current ?? vp.historicalStats.median);
              const numBase = Number(baseVal ?? vp.historicalStats.median);
              const pctChange = numBase !== 0 ? ((numVal - numBase) / Math.abs(numBase)) * 100 : 0;
              const isExtrap =
                numVal < vp.historicalStats.min - 1e-6 || numVal > vp.historicalStats.max + 1e-6;
              const step = vp.constraints.integerOnly
                ? 1
                : Number(((vp.constraints.maxAllowed - vp.constraints.minAllowed) / 100).toFixed(4)) || 0.1;

              return (
                <div key={vp.column} className="p-3.5 border border-slate-200 rounded-lg space-y-2 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <span className="font-semibold text-slate-900">{vp.column}</span>
                      <span className="text-slate-400 ml-2">
                        {vp.isControllable ? 'Controlable' : 'Entorno'} · {vp.unit}
                      </span>
                    </div>
                    <div className="font-mono tabular-nums text-slate-700">
                      Base: {numBase.toFixed(2)} →{' '}
                      <span className={pctChange >= 0 ? 'text-teal-700 font-semibold' : 'text-rose-700 font-semibold'}>
                        {pctChange >= 0 ? '+' : ''}
                        {pctChange.toFixed(1)}%
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-12 items-center gap-3">
                    <input
                      type="range"
                      min={vp.constraints.minAllowed}
                      max={vp.constraints.maxAllowed}
                      step={step}
                      value={numVal}
                      onChange={(e) =>
                        setDraftInputs({
                          ...draftInputs,
                          [vp.column]: Number(e.target.value),
                        })
                      }
                      className="col-span-6 accent-teal-700"
                    />
                    <input
                      type="number"
                      step={step}
                      value={numVal}
                      onChange={(e) =>
                        setDraftInputs({
                          ...draftInputs,
                          [vp.column]: Number(e.target.value),
                        })
                      }
                      className="col-span-3 px-2.5 py-1.5 border border-slate-300 rounded font-mono text-right tabular-nums"
                    />
                    <div className="col-span-3 flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() =>
                          setDraftInputs({
                            ...draftInputs,
                            [vp.column]: Number((numBase * 0.9).toFixed(2)),
                          })
                        }
                        className="px-2 py-1 bg-slate-100 hover:bg-slate-200 rounded font-mono text-[11px]"
                      >
                        -10%
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setDraftInputs({
                            ...draftInputs,
                            [vp.column]: Number((numBase * 1.1).toFixed(2)),
                          })
                        }
                        className="px-2 py-1 bg-slate-100 hover:bg-slate-200 rounded font-mono text-[11px]"
                      >
                        +10%
                      </button>
                    </div>
                  </div>

                  <div className="flex justify-between text-[11px] text-slate-500">
                    <span>
                      Rango histórico: [{vp.historicalStats.min.toFixed(2)}, {vp.historicalStats.max.toFixed(2)}]
                    </span>
                    {isExtrap && (
                      <span className="text-amber-700 font-medium">Fuera de rango observado (extrapolación)</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Live Prediction Output */}
        <div className="lg:col-span-5 space-y-5">
          <div className="bg-slate-900 text-white rounded-xl p-6 space-y-4">
            <div className="flex items-center justify-between text-xs text-teal-300">
              <span>Predicción en tiempo real ({targetColumn})</span>
              <span className="font-mono">{targetUnit}</span>
            </div>

            <div className="text-3xl font-bold font-mono tabular-nums tracking-tight">
              {livePred.predictedY.toFixed(2)}
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs border-t border-slate-800 pt-3">
              <div>
                <div className="text-slate-400">Escenario Base</div>
                <div className="font-mono tabular-nums text-white font-semibold mt-0.5">
                  {basePred.predictedY.toFixed(2)}
                </div>
              </div>
              <div>
                <div className="text-slate-400">Diferencia vs Base</div>
                <div
                  className={`font-mono tabular-nums font-semibold mt-0.5 ${
                    liveDeltaAbs >= 0 ? 'text-teal-300' : 'text-rose-300'
                  }`}
                >
                  {liveDeltaAbs >= 0 ? '+' : ''}
                  {liveDeltaAbs.toFixed(2)} ({liveDeltaPct >= 0 ? '+' : ''}
                  {liveDeltaPct.toFixed(1)}%)
                </div>
              </div>
            </div>

            <div className="space-y-2 text-xs border-t border-slate-800 pt-3">
              <div className="flex justify-between">
                <span className="text-slate-400">IC 95% (Media esperada):</span>
                <span className="font-mono tabular-nums">
                  [{livePred.ci95[0].toFixed(2)}, {livePred.ci95[1].toFixed(2)}]
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">IP 95% (Nueva observación):</span>
                <span className="font-mono tabular-nums text-teal-200">
                  [{livePred.pi95[0].toFixed(2)}, {livePred.pi95[1].toFixed(2)}]
                </span>
              </div>
            </div>

            {livePred.extrapolationWarnings.length > 0 && (
              <div className="p-3 bg-amber-950/60 border border-amber-700/60 rounded-lg text-[11px] text-amber-200 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <div>{livePred.extrapolationWarnings.join(' ')}</div>
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => handleSaveScenario()}
                className="flex-1 px-4 py-2.5 text-xs font-semibold bg-teal-600 hover:bg-teal-500 text-white rounded-lg transition-colors flex items-center justify-center gap-1.5"
              >
                <Plus className="w-4 h-4" />
                Registrar Escenario
              </button>
              <button
                type="button"
                onClick={() => handleSaveScenario('probabilistico')}
                className="px-3.5 py-2.5 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-white border border-slate-700 rounded-lg transition-colors flex items-center justify-center gap-1.5"
              >
                <Play className="w-3.5 h-3.5" />
                Correr Monte Carlo
              </button>
            </div>
          </div>

          {lastProbabilistic?.monteCarloDistribution && (
            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-900">
                  Distribución Monte Carlo ({lastProbabilistic.nSimulations} corridas)
                </span>
                <span className="font-mono text-slate-500">
                  P5: {lastProbabilistic.monteCarloDistribution.p5.toFixed(1)} · P50:{' '}
                  {lastProbabilistic.monteCarloDistribution.median.toFixed(1)} · P95:{' '}
                  {lastProbabilistic.monteCarloDistribution.p95.toFixed(1)}
                </span>
              </div>
              <HistogramChart
                bins={lastProbabilistic.monteCarloDistribution.histogram}
                title={lastProbabilistic.name}
                meanVal={lastProbabilistic.monteCarloDistribution.mean}
                medianVal={lastProbabilistic.monteCarloDistribution.median}
              />
            </div>
          )}
        </div>
      </div>

      {/* Saved Scenarios Comparison */}
      {scenarios.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
          <h3 className="text-base font-semibold text-slate-900">
            Comparación de Escenarios Registrados ({scenarios.length})
          </h3>
          <ScenarioComparisonChart scenarios={scenarios} targetLabel={targetColumn} />

          <div className="overflow-x-auto border border-slate-200 rounded-lg">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600">
                  <th className="px-3 py-2.5 text-left font-semibold">Escenario</th>
                  <th className="px-3 py-2.5 text-left font-semibold">Tipo</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Predicción {targetColumn}</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Var. vs Base</th>
                  <th className="px-3 py-2.5 text-right font-semibold">IC 95% Media</th>
                  <th className="px-3 py-2.5 text-right font-semibold">IP 95% Obs.</th>
                  <th className="px-3 py-2.5 text-left font-semibold">Alertas</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Quitar</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {scenarios.map((sc) => (
                  <tr key={sc.id} className="hover:bg-slate-50/70">
                    <td className="px-3 py-2.5 font-semibold text-slate-900">{sc.name}</td>
                    <td className="px-3 py-2.5 text-slate-600">{sc.type}</td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums font-bold">
                      {sc.predictedY.toFixed(2)}
                    </td>
                    <td
                      className={`px-3 py-2.5 text-right font-mono tabular-nums font-semibold ${
                        sc.deltaVsBaseAbs >= 0 ? 'text-teal-700' : 'text-rose-700'
                      }`}
                    >
                      {sc.deltaVsBaseAbs >= 0 ? '+' : ''}
                      {sc.deltaVsBaseAbs.toFixed(2)} ({sc.deltaVsBasePct.toFixed(1)}%)
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums whitespace-nowrap">
                      [{sc.confidenceInterval95[0].toFixed(1)}, {sc.confidenceInterval95[1].toFixed(1)}]
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums whitespace-nowrap">
                      [{sc.predictionInterval95[0].toFixed(1)}, {sc.predictionInterval95[1].toFixed(1)}]
                    </td>
                    <td className="px-3 py-2.5 text-amber-800">
                      {sc.extrapolationWarnings.length > 0 ? 'Extrapolación' : 'Dentro de rango'}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <button
                        type="button"
                        onClick={() => onRemoveScenario(sc.id)}
                        className="p-1 text-slate-400 hover:text-rose-700"
                        aria-label={`Eliminar ${sc.name}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
