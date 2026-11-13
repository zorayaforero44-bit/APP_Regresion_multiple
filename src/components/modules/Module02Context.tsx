import React, { useState } from 'react';
import { Sparkles, ShieldCheck } from 'lucide-react';
import { BusinessContext, DatasetSummary } from '../../types/analytics';

const EXAMPLE_QUESTIONS = [
  '¿Qué factores explican las ventas?',
  '¿Cómo cambiarían los ingresos si aumentamos la inversión en publicidad?',
  '¿Qué variables explican los costos operativos?',
  '¿Cómo influye el precio sobre la demanda?',
  '¿Qué factores determinan el recaudo?',
  '¿Qué variables influyen en la rentabilidad?',
  '¿Cómo cambiaría la productividad ante una modificación de recursos?',
];

interface Module02Props {
  dataset: DatasetSummary;
  context: BusinessContext;
  onChangeContext: (next: BusinessContext) => void;
  onProceedNext: () => void;
}

export const Module02Context: React.FC<Module02Props> = ({
  dataset,
  context,
  onChangeContext,
  onProceedNext,
}) => {
  const [aiLoading, setAiLoading] = useState(false);
  const [aiMessage, setAiMessage] = useState<string | null>(null);

  const toggleControllable = (colName: string, isControllable: boolean) => {
    const ctrl = new Set(context.controllableColumns);
    const nonCtrl = new Set(context.nonControllableColumns);
    if (isControllable) {
      ctrl.add(colName);
      nonCtrl.delete(colName);
    } else {
      ctrl.delete(colName);
      nonCtrl.add(colName);
    }
    onChangeContext({
      ...context,
      controllableColumns: Array.from(ctrl),
      nonControllableColumns: Array.from(nonCtrl),
    });
  };

  const handleInterpretWithAI = async () => {
    setAiLoading(true);
    setAiMessage(null);

    // Send ONLY column metadata and summary statistics, NEVER raw records!
    const columnsMeta = dataset.columns.map((c) => ({
      name: c.name,
      type: c.selectedType,
      unit: c.unit,
      completenessPct: Number(c.completenessPct.toFixed(1)),
      min: c.min,
      max: c.max,
      mean: c.mean,
      isControllable: context.controllableColumns.includes(c.name) || c.isControllable,
    }));

    try {
      const resp = await fetch('/api/ai/interpret-business', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ businessContext: context, columnsMeta }),
      });
      const json = await resp.json();
      if (!json.fallback && json.data) {
        onChangeContext({
          ...context,
          aiInterpretation: {
            ...json.data,
            source: 'gemini',
          },
        });
      } else {
        // Deterministic interpretation grounded strictly in real columns
        const aligned = dataset.columns
          .filter((c) => !c.isPotentialIdentifier && !c.isConstant)
          .map((c) => ({
            column: c.name,
            role:
              c.isPotentialTarget && (c.selectedType === 'continuous' || c.selectedType === 'discrete')
                ? context.controllableColumns.includes(c.name)
                  ? 'Predictor controlable (X)'
                  : 'Candidata a Y o Predictor (X)'
                : 'Covariable / Segmentación',
            rationale: `Tipo ${c.selectedType}, completitud ${c.completenessPct.toFixed(1)}%, unidad "${c.unit}".`,
          }));
        onChangeContext({
          ...context,
          aiInterpretation: {
            summary: `Interpretación estructural sobre ${dataset.columnCount} columnas reales de "${dataset.fileName}" para responder: "${context.businessQuestion || 'análisis explicativo y predictivo'}".`,
            alignedColumns: aligned,
            suggestedExternalVariables: [
              {
                name: 'Variables macroeconómicas externas (inflación, tasa de interés o índice sectorial)',
                rationale: 'Variable externa que requiere fuente adicional para capturar choques de entorno.',
              },
              {
                name: 'Acciones de la competencia y estacionalidad comercial',
                rationale: 'Variable externa no presente en la base; útil para reducir varianza no explicada.',
              },
            ],
            warnings: [
              'Ninguna columna fue inventada; toda recomendación se limita a las columnas verificadas en su archivo.',
            ],
            source: 'deterministic',
          },
        });
        if (json.reason) setAiMessage(json.reason);
      }
    } catch {
      setAiMessage('Error de red; se aplicó la interpretación estructural determinística.');
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <p className="text-xs font-medium text-teal-700 mb-1">Módulo 02 · Entendimiento del Negocio</p>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">
            Contexto y Pregunta de Negocio
          </h2>
          <p className="text-sm text-slate-600 mt-1 max-w-3xl">
            Defina el problema empresarial antes de estimar cualquier modelo. Esto orienta la selección de variables,
            la función objetivo y la clasificación entre palancas controlables y entorno no controlable.
          </p>
        </div>
        <button
          type="button"
          onClick={onProceedNext}
          className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
        >
          Continuar a Limpieza y Pipeline
        </button>
      </div>

      {/* Privacy Notice */}
      <div className="p-3.5 bg-slate-100 border border-slate-200 rounded-lg text-xs text-slate-700 flex items-start gap-2.5">
        <ShieldCheck className="w-4 h-4 text-teal-700 shrink-0 mt-0.5" />
        <div>
          <strong>Tratamiento de información:</strong> Al interpretar el contexto con IA solo se envían metadatos agregados
          (nombres de columnas, tipos y estadísticos resumen). Los registros individuales de su base no se transmiten al modelo de IA.
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">1. Sector económico</label>
              <input
                type="text"
                value={context.sector}
                onChange={(e) => onChangeContext({ ...context, sector: e.target.value })}
                placeholder="Ej. Comercio minorista, Manufactura, Finanzas..."
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">2. Actividad empresarial</label>
              <input
                type="text"
                value={context.activity}
                onChange={(e) => onChangeContext({ ...context, activity: e.target.value })}
                placeholder="Ej. Distribución B2B de hardware..."
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">3. Descripción de la base</label>
            <textarea
              rows={2}
              value={context.datasetDescription}
              onChange={(e) => onChangeContext({ ...context, datasetDescription: e.target.value })}
              placeholder="Describa qué representa cada fila y el período cubierto..."
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">4. Pregunta de negocio principal</label>
            <textarea
              rows={2}
              value={context.businessQuestion}
              onChange={(e) => onChangeContext({ ...context, businessQuestion: e.target.value })}
              placeholder="Ej. ¿Qué factores explican las ventas?"
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
            />
            <div className="flex flex-wrap gap-1.5 mt-2">
              {EXAMPLE_QUESTIONS.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => onChangeContext({ ...context, businessQuestion: q })}
                  className="px-2.5 py-1 text-[11px] text-slate-700 bg-slate-100 hover:bg-slate-200 rounded transition-colors"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">5. Objetivo del análisis</label>
              <select
                value={context.objective}
                onChange={(e) =>
                  onChangeContext({
                    ...context,
                    objective: e.target.value as BusinessContext['objective'],
                  })
                }
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
              >
                <option value="explicar">Explicar factores (Inferencia)</option>
                <option value="predecir">Pronosticar Y (Precisión)</option>
                <option value="simular">Simular escenarios</option>
                <option value="optimizar">Optimizar decisiones</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">6. Unidad de análisis</label>
              <input
                type="text"
                value={context.analysisUnit}
                onChange={(e) => onChangeContext({ ...context, analysisUnit: e.target.value })}
                placeholder="Ej. País, Campaña, Mes, Lote"
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">7. Horizonte de predicción</label>
              <input
                type="text"
                value={context.predictionHorizon}
                onChange={(e) => onChangeContext({ ...context, predictionHorizon: e.target.value })}
                placeholder="Ej. Próximo trimestre / 6 meses"
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">8. Restricciones empresariales</label>
            <input
              type="text"
              value={context.constraints}
              onChange={(e) => onChangeContext({ ...context, constraints: e.target.value })}
              placeholder="Ej. Presupuesto máximo de marketing, capacidad instalada, precios mínimos..."
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
            />
          </div>

          <div className="pt-2">
            <button
              type="button"
              onClick={handleInterpretWithAI}
              disabled={aiLoading}
              className="px-4 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg transition-colors flex items-center gap-2"
            >
              <Sparkles className="w-3.5 h-3.5" />
              {aiLoading ? 'Interpretando contexto...' : 'Interpretar contexto con columnas reales'}
            </button>
            {aiMessage && <p className="text-[11px] text-slate-500 mt-1.5">{aiMessage}</p>}
          </div>
        </div>

        {/* 9. Controllable vs Non-Controllable Variables */}
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6 space-y-4">
          <div>
            <h3 className="text-base font-semibold text-slate-900">9. Variables Controlables vs No Controlables</h3>
            <p className="text-xs text-slate-600 mt-1">
              Defina qué variables pueden ser modificadas directamente por la empresa y cuáles representan condiciones externas o de entorno.
            </p>
          </div>

          <div className="divide-y divide-slate-100 max-h-[380px] overflow-y-auto pr-1">
            {dataset.columns
              .filter((c) => !c.isPotentialIdentifier && !c.isConstant && c.selectedType !== 'datetime')
              .map((col) => {
                const isCtrl = context.controllableColumns.includes(col.name);
                return (
                  <div key={col.name} className="py-2.5 flex items-center justify-between gap-3 text-xs">
                    <div>
                      <div className="font-medium text-slate-900">{col.name}</div>
                      <div className="text-[11px] text-slate-500">
                        {col.selectedType} · {col.unit}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 p-0.5 bg-slate-100 rounded-md shrink-0">
                      <button
                        type="button"
                        onClick={() => toggleControllable(col.name, true)}
                        className={`px-2.5 py-1 text-[11px] font-medium rounded transition-colors ${
                          isCtrl ? 'bg-white text-teal-800 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        Controlable
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleControllable(col.name, false)}
                        className={`px-2.5 py-1 text-[11px] font-medium rounded transition-colors ${
                          !isCtrl ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        No controlable
                      </button>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      </div>

      {/* AI Interpretation Output */}
      {context.aiInterpretation && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-slate-900">
              Alineación Semántica entre Pregunta de Negocio y Columnas Reales
            </h3>
            <span className="text-xs text-slate-500">
              Motor: {context.aiInterpretation.source === 'gemini' ? 'Gemini API (Servidor)' : 'Análisis estructural local'}
            </span>
          </div>
          <p className="text-sm text-slate-700">{context.aiInterpretation.summary}</p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
            <div>
              <h4 className="text-xs font-semibold text-slate-900 mb-2">Columnas reales vinculadas</h4>
              <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg">
                {context.aiInterpretation.alignedColumns.map((ac) => (
                  <div key={ac.column} className="p-2.5 text-xs">
                    <div className="flex justify-between font-medium text-slate-900">
                      <span>{ac.column}</span>
                      <span className="text-teal-700">{ac.role}</span>
                    </div>
                    <p className="text-slate-600 mt-0.5">{ac.rationale}</p>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <h4 className="text-xs font-semibold text-slate-900 mb-2">
                Variables externas sugeridas (requieren información adicional)
              </h4>
              <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg">
                {context.aiInterpretation.suggestedExternalVariables.map((ext, i) => (
                  <div key={i} className="p-2.5 text-xs">
                    <div className="font-medium text-slate-900">{ext.name}</div>
                    <p className="text-slate-600 mt-0.5">{ext.rationale}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
