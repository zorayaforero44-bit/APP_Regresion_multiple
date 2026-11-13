import React from 'react';
import { ShieldAlert, Play } from 'lucide-react';
import {
  AppMode,
  CategoricalImputationMethod,
  CleanedDatasetResult,
  CleaningPipelineConfig,
  DatasetSummary,
  NumericImputationMethod,
  OutlierStrategy,
  TransformMethod,
} from '../../types/analytics';

interface Module03Props {
  mode: AppMode;
  dataset: DatasetSummary;
  config: CleaningPipelineConfig;
  cleanedResult: CleanedDatasetResult | null;
  onUpdateConfig: (next: CleaningPipelineConfig) => void;
  onExecutePipeline: () => void;
  onProceedNext: () => void;
}

export const Module03Cleaning: React.FC<Module03Props> = ({
  mode,
  dataset,
  config,
  cleanedResult,
  onUpdateConfig,
  onExecutePipeline,
  onProceedNext,
}) => {
  const updateColConfig = (colName: string, patch: Record<string, unknown>) => {
    onUpdateConfig({
      ...config,
      columnConfigs: {
        ...config.columnConfigs,
        [colName]: {
          ...config.columnConfigs[colName],
          ...patch,
        },
      },
    });
  };

  const firstFiveProv = cleanedResult?.provenanceRows.slice(0, 5) ?? [];
  const rawCols = dataset.columns.map((c) => c.name);
  const transCols = cleanedResult?.transformedFeatureNames ?? [];

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <p className="text-xs font-medium text-teal-700 mb-1">Módulo 03 · Pipeline Reproducible Sin Fuga</p>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">
            Limpieza, Imputación y Transformaciones
          </h2>
          <p className="text-sm text-slate-600 mt-1 max-w-3xl">
            Todos los imputadores, límites de atípicos y codificadores se ajustan exclusivamente sobre la partición de entrenamiento
            y luego se aplican a validación y prueba.
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={onExecutePipeline}
            className="px-4 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap"
          >
            <Play className="w-3.5 h-3.5" />
            Ejecutar Pipeline
          </button>
          {cleanedResult && (
            <button
              type="button"
              onClick={onProceedNext}
              className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap"
            >
              Continuar a EDA
            </button>
          )}
        </div>
      </div>

      {/* Leakage Prevention Notice */}
      <div className="p-3.5 bg-slate-100 border border-slate-200 rounded-lg text-xs text-slate-800 flex items-start gap-2.5">
        <ShieldAlert className="w-4 h-4 text-teal-700 shrink-0 mt-0.5" />
        <div>
          <strong>Prevención estricta de fuga de información:</strong> Las filas con variable objetivo ({config.targetColumn || 'Y'})
          ausente nunca se completan con predicciones; se excluyen del entrenamiento supervisado. La división train/validación/prueba
          se ejecuta antes de estimar medianas, KNN, escaladores o codificación One-Hot.
        </div>
      </div>

      {/* Global Pipeline Parameters */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
        <h3 className="text-base font-semibold text-slate-900">Parámetros Globales del Pipeline</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 text-xs">
          <div>
            <label className="block font-medium text-slate-700 mb-1">Variable Objetivo (Y) preliminar</label>
            <select
              value={config.targetColumn}
              onChange={(e) => onUpdateConfig({ ...config, targetColumn: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
            >
              {dataset.columns
                .filter((c) => c.selectedType === 'continuous' || c.selectedType === 'discrete')
                .map((c) => (
                  <option key={c.name} value={c.name}>
                    {c.name}
                  </option>
                ))}
            </select>
          </div>
          <div>
            <label className="block font-medium text-slate-700 mb-1">Porcentaje Holdout (% Val + Test)</label>
            <input
              type="number"
              min={10}
              max={40}
              value={config.validationSplitPct}
              onChange={(e) =>
                onUpdateConfig({ ...config, validationSplitPct: Math.max(10, Math.min(40, Number(e.target.value))) })
              }
              className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
            />
          </div>
          <div>
            <label className="block font-medium text-slate-700 mb-1">Semilla aleatoria</label>
            <input
              type="number"
              value={config.randomSeed}
              onChange={(e) => onUpdateConfig({ ...config, randomSeed: Number(e.target.value) || 42 })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
            />
          </div>
          <label className="flex items-center gap-2 pt-5 cursor-pointer">
            <input
              type="checkbox"
              checked={config.removeDuplicates}
              onChange={(e) => onUpdateConfig({ ...config, removeDuplicates: e.target.checked })}
              className="rounded border-slate-300 text-teal-700"
            />
            <span>Eliminar duplicados exactos ({dataset.duplicateCount})</span>
          </label>
          <label className="flex items-center gap-2 pt-5 cursor-pointer">
            <input
              type="checkbox"
              checked={config.chronologicalSplit}
              disabled={!dataset.hasTemporalColumn}
              onChange={(e) => onUpdateConfig({ ...config, chronologicalSplit: e.target.checked })}
              className="rounded border-slate-300 text-teal-700"
            />
            <span>Partición cronológica ({dataset.hasTemporalColumn ? dataset.temporalColumn : 'Sin fecha'})</span>
          </label>
        </div>
      </div>

      {/* Per-column Imputation, Outliers & Transformations */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-slate-900">Tratamiento por Variable</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {mode === 'guided'
                ? 'Métodos recomendados automáticamente según distribución, asimetría y estructura temporal. Puede aprobarlos o ajustarlos.'
                : 'Configuración avanzada de imputación, atípicos y transformación.'}
            </p>
          </div>
        </div>

        <div className="overflow-x-auto border border-slate-200 rounded-lg">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-left text-slate-600">
                <th className="px-3 py-2.5 font-semibold">Variable</th>
                <th className="px-3 py-2.5 font-semibold">Tipo</th>
                <th className="px-3 py-2.5 font-semibold text-right">Ausentes</th>
                <th className="px-3 py-2.5 font-semibold">Imputación</th>
                <th className="px-3 py-2.5 font-semibold">Valores Atípicos</th>
                <th className="px-3 py-2.5 font-semibold">Transformación</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {dataset.columns.map((col) => {
                const cfg = config.columnConfigs[col.name];
                if (!cfg) return null;
                const isTarget = col.name === config.targetColumn;
                const isNum = col.selectedType === 'continuous' || col.selectedType === 'discrete';
                const disabledImpute = isTarget || col.isPotentialIdentifier || col.isConstant;

                return (
                  <tr key={col.name} className="hover:bg-slate-50/70">
                    <td className="px-3 py-2 font-medium text-slate-900 whitespace-nowrap">
                      {col.name}{' '}
                      {isTarget && <span className="text-teal-700 font-semibold">(Objetivo Y)</span>}
                    </td>
                    <td className="px-3 py-2 text-slate-500 whitespace-nowrap">{col.selectedType}</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums">
                      {col.missingCount} ({col.missingPct.toFixed(1)}%)
                    </td>
                    <td className="px-3 py-2">
                      {disabledImpute ? (
                        <span className="text-slate-400">
                          {isTarget ? 'Nunca imputar objetivo' : 'No aplica'}
                        </span>
                      ) : isNum ? (
                        <select
                          value={cfg.imputationMethod}
                          onChange={(e) =>
                            updateColConfig(col.name, {
                              imputationMethod: e.target.value as NumericImputationMethod,
                            })
                          }
                          className="px-2 py-1 border border-slate-300 rounded bg-white"
                        >
                          <option value="none">Sin imputación</option>
                          <option value="median">Mediana (train)</option>
                          <option value="mean">Media (train)</option>
                          <option value="group_median">Mediana por grupo</option>
                          <option value="knn">KNN Imputer (k=5)</option>
                          <option value="multivariate_ols">Multivariado OLS</option>
                          <option value="temporal_interpolation">Temporal causal</option>
                        </select>
                      ) : (
                        <select
                          value={cfg.imputationMethod}
                          onChange={(e) =>
                            updateColConfig(col.name, {
                              imputationMethod: e.target.value as CategoricalImputationMethod,
                            })
                          }
                          className="px-2 py-1 border border-slate-300 rounded bg-white"
                        >
                          <option value="none">Sin imputación</option>
                          <option value="mode">Moda (train)</option>
                          <option value="explicit_missing">Categoría "Ausente"</option>
                          <option value="probabilistic">Probabilístico empírico</option>
                        </select>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {isNum && !isTarget ? (
                        <select
                          value={cfg.outlierStrategy}
                          onChange={(e) =>
                            updateColConfig(col.name, { outlierStrategy: e.target.value as OutlierStrategy })
                          }
                          className="px-2 py-1 border border-slate-300 rounded bg-white"
                        >
                          <option value="keep_flag">Conservar y diagnosticar (Cook)</option>
                          <option value="winsorize_iqr">Winsorizar límites IQR (train)</option>
                        </select>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {isTarget || col.isPotentialIdentifier || col.isConstant || col.selectedType === 'datetime' ? (
                        <span className="text-slate-400">—</span>
                      ) : isNum ? (
                        <select
                          value={cfg.transform}
                          onChange={(e) =>
                            updateColConfig(col.name, { transform: e.target.value as TransformMethod })
                          }
                          className="px-2 py-1 border border-slate-300 rounded bg-white"
                        >
                          <option value="none">Escala original</option>
                          <option value="standardize">Estandarización Z</option>
                          <option value="minmax">Min-Max [0, 1]</option>
                          <option value="log1p">Logaritmo ln(1+x)</option>
                        </select>
                      ) : (
                        <select
                          value={cfg.transform}
                          onChange={(e) =>
                            updateColConfig(col.name, { transform: e.target.value as TransformMethod })
                          }
                          className="px-2 py-1 border border-slate-300 rounded bg-white"
                        >
                          <option value="onehot">One-Hot (k-1 niveles)</option>
                          <option value="ordinal">Codificación Ordinal</option>
                        </select>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Results: 5 Initial vs 5 Transformed Rows + Audit Log */}
      {cleanedResult && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="text-xs text-slate-500">Entrenamiento / Val / Test</div>
              <div className="text-lg font-bold font-mono tabular-nums text-slate-900 mt-1">
                {cleanedResult.trainRowsCount} / {cleanedResult.valRowsCount} / {cleanedResult.testRowsCount}
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="text-xs text-slate-500">Variables de diseño generadas</div>
              <div className="text-lg font-bold font-mono tabular-nums text-slate-900 mt-1">
                {cleanedResult.transformedFeatureNames.length}
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="text-xs text-slate-500">Duplicados eliminados</div>
              <div className="text-lg font-bold font-mono tabular-nums text-slate-900 mt-1">
                {cleanedResult.duplicatesRemovedCount}
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="text-xs text-slate-500">Filas sin Y excluidas</div>
              <div className="text-lg font-bold font-mono tabular-nums text-slate-900 mt-1">
                {cleanedResult.excludedTargetMissingCount}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
              <h3 className="text-sm font-semibold text-slate-900">Versión A: 5 Filas Iniciales (Originales)</h3>
              <div className="overflow-x-auto border border-slate-200 rounded-lg">
                <table className="w-full text-[11px] border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      {rawCols.slice(0, 6).map((c) => (
                        <th key={c} className="px-2.5 py-2 text-left font-semibold text-slate-700 whitespace-nowrap">
                          {c}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {firstFiveProv.map((pr) => (
                      <tr key={pr.rowIndex}>
                        {rawCols.slice(0, 6).map((c) => (
                          <td key={c} className="px-2.5 py-1.5 font-mono tabular-nums whitespace-nowrap">
                            {pr.rawValues[c] === null || pr.rawValues[c] === undefined ? (
                              <span className="text-amber-700">Ausente</span>
                            ) : (
                              String(pr.rawValues[c])
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
              <h3 className="text-sm font-semibold text-slate-900">
                Versión B: 5 Filas Transformadas (Matriz de Diseño)
              </h3>
              <div className="overflow-x-auto border border-slate-200 rounded-lg">
                <table className="w-full text-[11px] border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <th className="px-2.5 py-2 text-left font-semibold text-slate-500">Partición</th>
                      {transCols.slice(0, 6).map((c) => (
                        <th key={c} className="px-2.5 py-2 text-right font-semibold text-slate-700 whitespace-nowrap">
                          {c}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {firstFiveProv.map((pr) => (
                      <tr key={pr.rowIndex}>
                        <td className="px-2.5 py-1.5 text-teal-800 font-medium">{pr.split}</td>
                        {transCols.slice(0, 6).map((c) => (
                          <td key={c} className="px-2.5 py-1.5 text-right font-mono tabular-nums whitespace-nowrap">
                            {(pr.transformedValues[c] ?? 0).toFixed(3)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Audit Log */}
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-3">
            <h3 className="text-base font-semibold text-slate-900">
              Registro Trazable de Operaciones ({cleanedResult.auditLog.length})
            </h3>
            <div className="divide-y divide-slate-100 text-xs">
              {cleanedResult.auditLog.length === 0 ? (
                <p className="text-slate-500 py-2">
                  No se requirieron imputaciones ni eliminaciones; la matriz de diseño conserva los valores observados.
                </p>
              ) : (
                cleanedResult.auditLog.map((entry) => (
                  <div key={entry.step} className="py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <span className="font-mono text-slate-400 mr-2">#{entry.step}</span>
                      <span className="font-semibold text-slate-900">{entry.action}</span>
                      <span className="text-slate-500 ml-2">· Columna: {entry.column}</span>
                      <p className="text-slate-600 mt-0.5">{entry.details}</p>
                    </div>
                    <span className="font-mono tabular-nums text-slate-500 shrink-0">
                      {entry.affectedRows} filas afectadas
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
