import React from 'react';
import { Download, FileSpreadsheet, FileText, FileJson, Table } from 'lucide-react';
import { AnalyticsProject } from '../../types/analytics';
import {
  exportCleanedCSV,
  exportExcelWorkbook,
  exportExecutivePDF,
  exportProjectJSON,
} from '../../engine/exporter';

interface Module13Props {
  project: AnalyticsProject;
}

export const Module13Export: React.FC<Module13Props> = ({ project }) => {
  const recModel = project.modelingSuite?.models.find(
    (m) => m.id === project.modelingSuite?.recommendedModelId
  );

  return (
    <div className="space-y-8">
      <div className="border-b border-slate-200 pb-5">
        <p className="text-xs font-medium text-teal-700 mb-1">Módulo 13 · Reportería y Reproducibilidad</p>
        <h2 className="text-2xl font-bold text-slate-900 tracking-tight">
          Exportación de Resultados e Informe Ejecutivo
        </h2>
        <p className="text-sm text-slate-600 mt-1 max-w-3xl">
          Descargue datos depurados, diccionario de variables, comparación de modelos, escenarios, recomendaciones y el informe ejecutivo completo en Excel, PDF, CSV y JSON.
        </p>
      </div>

      {/* Export Action Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <button
          type="button"
          onClick={() => exportExecutivePDF(project)}
          className="text-left p-5 bg-white border border-slate-200 hover:border-teal-600 rounded-xl transition-colors space-y-2"
        >
          <FileText className="w-6 h-6 text-teal-700" />
          <div className="text-sm font-bold text-slate-900">Informe Ejecutivo (.PDF)</div>
          <p className="text-xs text-slate-600">
            Documento multipágina con pregunta de negocio, ecuación, pruebas estadísticas, escenarios, recomendaciones y marca Zoraya Forero.
          </p>
        </button>

        <button
          type="button"
          onClick={() => exportExcelWorkbook(project)}
          className="text-left p-5 bg-white border border-slate-200 hover:border-teal-600 rounded-xl transition-colors space-y-2"
        >
          <FileSpreadsheet className="w-6 h-6 text-teal-700" />
          <div className="text-sm font-bold text-slate-900">Libro Analítico (.XLSX)</div>
          <p className="text-xs text-slate-600">
            7 hojas reales: Resumen, Datos Depurados, Diccionario, Trazabilidad, Modelos, Coeficientes y Escenarios.
          </p>
        </button>

        <button
          type="button"
          onClick={() => exportCleanedCSV(project)}
          className="text-left p-5 bg-white border border-slate-200 hover:border-teal-600 rounded-xl transition-colors space-y-2"
        >
          <Table className="w-6 h-6 text-teal-700" />
          <div className="text-sm font-bold text-slate-900">Datos Depurados (.CSV)</div>
          <p className="text-xs text-slate-600">
            Base limpia resultante del pipeline reproducible listo para consumo en BI o auditoría externa.
          </p>
        </button>

        <button
          type="button"
          onClick={() => exportProjectJSON(project)}
          className="text-left p-5 bg-white border border-slate-200 hover:border-teal-600 rounded-xl transition-colors space-y-2"
        >
          <FileJson className="w-6 h-6 text-teal-700" />
          <div className="text-sm font-bold text-slate-900">Proyecto Completo (.JSON)</div>
          <p className="text-xs text-slate-600">
            Respaldo integral con ID de proyecto, configuraciones, selección de variables y escenarios para reabrir luego.
          </p>
        </button>
      </div>

      {/* Live Preview of Executive Report Content */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-4">
          <div>
            <h3 className="text-base font-bold text-slate-900">
              Vista Previa del Informe Ejecutivo
            </h3>
            <p className="text-xs text-slate-500">
              Proyecto {project.projectId} · Fecha: {new Date().toLocaleString('es-CO')} · Registros: {project.dataset?.rowCount ?? 0}
            </p>
          </div>
          <button
            type="button"
            onClick={() => exportExecutivePDF(project)}
            className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5" />
            Descargar PDF
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs text-slate-700">
          <div className="space-y-3">
            <div>
              <div className="font-semibold text-slate-900">Pregunta de negocio y objetivo</div>
              <p className="mt-0.5">{project.businessContext.businessQuestion || 'No definida'}</p>
            </div>
            <div>
              <div className="font-semibold text-slate-900">Caracterización y trazabilidad</div>
              <p className="mt-0.5">
                Archivo {project.dataset?.fileName} ({project.dataset?.rowCount} filas, {project.dataset?.columnCount} columnas, completitud {project.dataset?.completenessPct.toFixed(1)}%).
                Pipeline con {project.cleanedResult?.auditLog.length ?? 0} pasos registrados (Train={project.cleanedResult?.trainRowsCount ?? 0}, Val={project.cleanedResult?.valRowsCount ?? 0}, Test={project.cleanedResult?.testRowsCount ?? 0}).
              </p>
            </div>
            <div>
              <div className="font-semibold text-slate-900">Modelo recomendado y justificación</div>
              <p className="mt-0.5">
                {recModel
                  ? `${recModel.name} — CR² ${(recModel.metrics.adjR2Train * 100).toFixed(1)}%, RMSE Validación ${recModel.metrics.rmseVal.toFixed(3)}. ${recModel.tradeoffExplanation}`
                  : 'Pendiente de entrenamiento.'}
              </p>
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <div className="font-semibold text-slate-900">Conclusiones y escenarios</div>
              <p className="mt-0.5">
                {project.scenarios.length > 0
                  ? project.scenarios
                      .map((s) => `${s.name}: ${s.predictedY.toFixed(2)} (${s.deltaVsBasePct >= 0 ? '+' : ''}${s.deltaVsBasePct.toFixed(1)}%)`)
                      .join(' · ')
                  : 'Sin escenarios registrados.'}
              </p>
            </div>
            <div>
              <div className="font-semibold text-slate-900">Fuentes metodológicas y reconocimiento académico</div>
              <p className="mt-0.5">
                Aplicación desarrollada tomando como referencia académica los conceptos de regresión múltiple y pronósticos empresariales abordados por el profesor Hugo Alexander Martínez Gallego, complementados con metodologías estadísticas (NIST, Penn State STAT 501, statsmodels, scikit-learn, SciPy) y herramientas de analítica de datos.
              </p>
            </div>
            <div className="pt-2 border-t border-slate-100">
              <div className="font-semibold text-slate-900">Autoría</div>
              <p>Zoraya Forero — Economista | Análisis de datos y automatización de procesos | Análisis financiero | Reportes para la toma de decisiones.</p>
            </div>
          </div>
        </div>
      </div>

      {/* Vercel & Architecture Guide */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-3 text-xs text-slate-700">
        <h3 className="text-sm font-semibold text-slate-900">Despliegue en GitHub y Vercel · Arquitectura de Producción</h3>
        <p>
          El motor estadístico, de simulación Monte Carlo y de optimización está implementado íntegramente en TypeScript determinístico dentro del proyecto, por lo que ejecuta sin dependencias externas en Vercel. Las rutas <span className="font-mono">/api/ai/*</span> utilizan <span className="font-mono">@google/genai</span> exclusivamente en servidor con <span className="font-mono">GEMINI_API_KEY</span> configurada en las variables de entorno de Vercel o AI Studio.
        </p>
      </div>
    </div>
  );
};
