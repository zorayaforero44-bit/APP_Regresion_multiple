import React, { useState } from 'react';
import { Sparkles } from 'lucide-react';
import {
  BusinessContext,
  BusinessRecommendation,
  DatasetSummary,
  ScenarioResult,
  TrainedModelResult,
} from '../../types/analytics';

interface Module10Props {
  dataset: DatasetSummary;
  context: BusinessContext;
  model: TrainedModelResult;
  scenarios: ScenarioResult[];
  onUpdateScenarioRecommendation: (scenarioId: string, rec: BusinessRecommendation) => void;
  onProceedNext: () => void;
}

export const Module10Recommendations: React.FC<Module10Props> = ({
  dataset,
  context,
  model,
  scenarios,
  onUpdateScenarioRecommendation,
  onProceedNext,
}) => {
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const handleEnrichWithGemini = async (scenario: ScenarioResult) => {
    setLoadingId(scenario.id);
    setStatusMsg(null);
    try {
      const resp = await fetch('/api/ai/recommend-scenario', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessContext: {
            sector: context.sector,
            activity: context.activity,
            businessQuestion: context.businessQuestion,
            objective: context.objective,
            constraints: context.constraints,
          },
          modelSummary: {
            name: model.name,
            adjR2: model.metrics.adjR2Train,
            rmseVal: model.metrics.rmseVal,
            fPValue: model.metrics.fPValue,
            maxVif: model.diagnostics.maxVif,
            nObs: dataset.rowCount,
            coefficients: model.coefficients.map((c) => ({
              feature: c.feature,
              estimate: c.estimate,
              pValue: c.robustPValue ?? c.pValue,
            })),
          },
          scenarioSummary: {
            name: scenario.name,
            predictedY: scenario.predictedY,
            deltaVsBaseAbs: scenario.deltaVsBaseAbs,
            deltaVsBasePct: scenario.deltaVsBasePct,
            predictionInterval95: scenario.predictionInterval95,
            extrapolationWarnings: scenario.extrapolationWarnings,
            changedInputs: scenario.inputs.filter((i) => i.absDelta !== 0),
          },
        }),
      });
      const json = await resp.json();
      if (!json.fallback && json.data) {
        onUpdateScenarioRecommendation(scenario.id, {
          scenarioId: scenario.id,
          scenarioName: scenario.name,
          ...json.data,
          source: 'gemini',
        });
      } else {
        setStatusMsg(
          json.reason ||
            'Se mantiene la recomendación econométrica verificable generada a partir de los parámetros estimados.'
        );
      }
    } catch {
      setStatusMsg('No se pudo contactar el servicio de IA; la recomendación determinística continúa activa.');
    } finally {
      setLoadingId(null);
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <p className="text-xs font-medium text-teal-700 mb-1">Módulo 10 · Consultoría Analítica Prescriptiva</p>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">
            Motor de Recomendaciones Empresariales
          </h2>
          <p className="text-sm text-slate-600 mt-1 max-w-3xl">
            Cada escenario responde la pregunta de negocio en cinco apartados estructurados, fundamentados estrictamente en coeficientes,
            incertidumbre e intervalos calculados.
          </p>
        </div>
        <button
          type="button"
          onClick={onProceedNext}
          className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap shrink-0"
        >
          Ir a Optimización de Decisiones
        </button>
      </div>

      {statusMsg && (
        <div className="p-3 bg-slate-100 border border-slate-200 rounded-lg text-xs text-slate-700">
          {statusMsg}
        </div>
      )}

      {scenarios.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-10 text-center space-y-3">
          <p className="text-sm text-slate-700">
            Aún no hay escenarios simulados registrados. Genere al menos un escenario en el Módulo 09 para consultar las recomendaciones.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {scenarios.map((sc) => {
            const rec = sc.recommendation;
            if (!rec) return null;
            return (
              <div key={sc.id} className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
                  <div>
                    <h3 className="text-lg font-bold text-slate-900">{sc.name}</h3>
                    <div className="text-xs text-slate-500 mt-0.5 font-mono tabular-nums">
                      Predicción: {sc.predictedY.toFixed(2)} · Variación vs Base:{' '}
                      {sc.deltaVsBaseAbs >= 0 ? '+' : ''}
                      {sc.deltaVsBaseAbs.toFixed(2)} ({sc.deltaVsBasePct.toFixed(1)}%) · Fuente:{' '}
                      {rec.source === 'gemini' ? 'Gemini API + Econometría' : 'Motor Econométrico'}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleEnrichWithGemini(sc)}
                    disabled={loadingId === sc.id}
                    className="px-3.5 py-2 text-xs font-medium text-teal-800 bg-teal-50 border border-teal-200 hover:bg-teal-100 rounded-lg transition-colors flex items-center gap-1.5 shrink-0"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    {loadingId === sc.id ? 'Refinando análisis...' : 'Refinar narrativa con IA'}
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 text-xs">
                  <div className="space-y-1">
                    <div className="font-semibold text-slate-900">1. Hallazgo principal</div>
                    <p className="text-slate-600 leading-relaxed">{rec.hallazgoPrincipal}</p>
                  </div>
                  <div className="space-y-1">
                    <div className="font-semibold text-slate-900">2. Interpretación empresarial</div>
                    <p className="text-slate-600 leading-relaxed">{rec.interpretacionEmpresarial}</p>
                  </div>
                  <div className="space-y-1">
                    <div className="font-semibold text-slate-900">3. Acción recomendada</div>
                    <p className="text-slate-600 leading-relaxed">{rec.accionRecomendada}</p>
                  </div>
                  <div className="space-y-1">
                    <div className="font-semibold text-slate-900">4. Impacto esperado</div>
                    <p className="text-slate-600 leading-relaxed">{rec.impactoEsperado}</p>
                  </div>
                  <div className="space-y-1 md:col-span-2">
                    <div className="font-semibold text-slate-900">5. Riesgos, causalidad y limitaciones</div>
                    <p className="text-slate-600 leading-relaxed">{rec.riesgosYLimitaciones}</p>
                    {rec.dataSufficiencyNote && (
                      <p className="text-amber-800 mt-1">{rec.dataSufficiencyNote}</p>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
