import React from 'react';
import { AnalyticsProject } from '../../types/analytics';
import {
  CoefficientForestPlot,
  ModelComparisonChart,
  ScenarioComparisonChart,
} from '../charts/SvgCharts';

interface Module12Props {
  project: AnalyticsProject;
  onNavigateModule: (idx: number) => void;
}

export const Module12ExecutiveDashboard: React.FC<Module12Props> = ({
  project,
  onNavigateModule,
}) => {
  const recModel = project.modelingSuite?.models.find(
    (m) => m.id === project.modelingSuite?.recommendedModelId
  );

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <p className="text-xs font-medium text-teal-700 mb-1">Módulo 12 · Síntesis Ejecutiva</p>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">
            Dashboard Ejecutivo de Inteligencia Analítica
          </h2>
          <p className="text-sm text-slate-600 mt-1">
            {project.businessContext.businessQuestion || 'Visión consolidada de calidad, modelado, simulación y recomendaciones.'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => onNavigateModule(13)}
          className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap shrink-0"
        >
          Exportar Informe Ejecutivo
        </button>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="text-xs text-slate-500">Base y Completitud</div>
          <div className="text-2xl font-bold font-mono tabular-nums text-slate-900 mt-1">
            {project.dataset?.rowCount ?? 0} reg.
          </div>
          <div className="text-xs text-slate-600 mt-1">
            {project.dataset?.completenessPct.toFixed(1) ?? 0}% completitud · {project.dataset?.columnCount ?? 0} cols
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="text-xs text-slate-500">Modelo Recomendado</div>
          <div className="text-base font-bold text-slate-900 mt-1 truncate" title={recModel?.name}>
            {recModel?.name ?? 'Pendiente'}
          </div>
          <div className="text-xs text-teal-700 font-mono tabular-nums mt-1">
            CR² {recModel ? `${(recModel.metrics.adjR2Train * 100).toFixed(1)}%` : '—'} · RMSE Val{' '}
            {recModel ? recModel.metrics.rmseVal.toFixed(2) : '—'}
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="text-xs text-slate-500">Escenarios Evaluados</div>
          <div className="text-2xl font-bold font-mono tabular-nums text-slate-900 mt-1">
            {project.scenarios.length}
          </div>
          <div className="text-xs text-slate-600 mt-1">
            {project.variableSimModels.length} variables caracterizadas
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="text-xs text-slate-500">Potencial de Optimización</div>
          <div className="text-2xl font-bold font-mono tabular-nums text-teal-800 mt-1">
            {project.optimizationResult
              ? `${project.optimizationResult.improvementPct >= 0 ? '+' : ''}${project.optimizationResult.improvementPct.toFixed(1)}%`
              : 'Sin ejecutar'}
          </div>
          <div className="text-xs text-slate-600 mt-1">
            {project.optimizationResult
              ? `Meta: ${project.optimizationResult.optimalPrediction.toFixed(2)}`
              : 'Configure restricciones en Módulo 11'}
          </div>
        </div>
      </div>

      {/* Main Executive Panels */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {project.modelingSuite && (
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-900">Desempeño Comparado de Modelos</h3>
              <button
                type="button"
                onClick={() => onNavigateModule(6)}
                className="text-xs text-teal-700 hover:underline"
              >
                Ver diagnósticos
              </button>
            </div>
            <ModelComparisonChart models={project.modelingSuite.models} />
          </div>
        )}

        {recModel && (
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-900">Principales Impulsores de {project.selectionPlan?.selectedTarget}</h3>
              <button
                type="button"
                onClick={() => onNavigateModule(7)}
                className="text-xs text-teal-700 hover:underline"
              >
                Ver coeficientes
              </button>
            </div>
            <CoefficientForestPlot coefficients={recModel.coefficients} />
          </div>
        )}
      </div>

      {project.scenarios.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-slate-900">Escenarios y Bandas de Predicción (IP 95%)</h3>
            <button
              type="button"
              onClick={() => onNavigateModule(10)}
              className="text-xs text-teal-700 hover:underline"
            >
              Ver recomendaciones
            </button>
          </div>
          <ScenarioComparisonChart
            scenarios={project.scenarios}
            targetLabel={project.selectionPlan?.selectedTarget ?? 'Y'}
          />
        </div>
      )}

      {/* Academic Attribution Required Section */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-2 text-xs text-slate-700">
        <h3 className="text-sm font-semibold text-slate-900">Fundamentos académicos y metodología</h3>
        <p className="leading-relaxed">
          Aplicación desarrollada tomando como referencia académica los conceptos de regresión múltiple y pronósticos empresariales
          abordados por el profesor Hugo Alexander Martínez Gallego, complementados con metodologías estadísticas y herramientas de analítica de datos
          (NIST Engineering Statistics Handbook, Penn State STAT 501, documentación técnica de statsmodels, scikit-learn y SciPy).
        </p>
        <p className="text-slate-500 pt-1">
          Autoría y marca personal: <strong className="text-slate-800">Zoraya Forero</strong> — Economista | Análisis de datos y automatización de procesos | Análisis financiero | Reportes para la toma de decisiones.
        </p>
      </div>
    </div>
  );
};
