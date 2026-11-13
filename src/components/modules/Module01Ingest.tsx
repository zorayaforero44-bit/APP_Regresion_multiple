import React, { useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Database,
  FileSpreadsheet,
  FolderOpen,
  Sparkles,
  Upload,
} from 'lucide-react';
import {
  AppMode,
  DataRow,
  DatasetSummary,
  VariableNature,
} from '../../types/analytics';
import { parseRawTextInput, parseUploadedFile, ParseOptions } from '../../engine/dataParser';
import { SAMPLE_DATASETS, SampleDatasetSpec } from '../../engine/sampleDatasets';
import { formatNum } from '../../engine/mathUtils';

const VARIABLE_NATURE_OPTIONS: Array<{ value: VariableNature; label: string }> = [
  { value: 'continuous', label: 'Numérica continua' },
  { value: 'discrete', label: 'Numérica discreta' },
  { value: 'categorical_nominal', label: 'Categórica nominal' },
  { value: 'categorical_ordinal', label: 'Categórica ordinal' },
  { value: 'binary', label: 'Binaria' },
  { value: 'datetime', label: 'Fecha / Temporal' },
  { value: 'geographic', label: 'Geográfica' },
  { value: 'text', label: 'Textual libre' },
  { value: 'identifier', label: 'Identificador único' },
  { value: 'constant', label: 'Constante' },
];

interface Module01Props {
  mode: AppMode;
  dataset: DatasetSummary | null;
  onLoadRows: (
    rows: DataRow[],
    meta: {
      fileName: string;
      fileFormat: string;
      isSampleDataset?: boolean;
      sampleNote?: string;
      controllableHint?: string[];
    },
    sampleSpec?: SampleDatasetSpec
  ) => void;
  onUpdateColumnMeta: (
    colName: string,
    patch: Partial<{ selectedType: VariableNature; unit: string; description: string; isControllable: boolean }>
  ) => void;
  onImportProjectJSON: (file: File) => void;
  onProceedNext: () => void;
}

export const Module01Ingest: React.FC<Module01Props> = ({
  mode,
  dataset,
  onLoadRows,
  onUpdateColumnMeta,
  onImportProjectJSON,
  onProceedNext,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const projectInputRef = useRef<HTMLInputElement>(null);

  const [parseOpts, setParseOpts] = useState<ParseOptions>({
    delimiter: 'auto',
    encoding: 'utf-8',
    decimalSeparator: '.',
  });
  const [rawPaste, setRawPaste] = useState('');
  const [showPasteBox, setShowPasteBox] = useState(false);
  const [unstructuredNotice, setUnstructuredNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setErrorMsg(null);
    setUnstructuredNotice(null);

    if (file.size > 15 * 1024 * 1024) {
      setErrorMsg('El archivo supera el límite configurable de 15 MB para procesamiento seguro en sesión.');
      return;
    }

    setLoading(true);
    try {
      const res = await parseUploadedFile(file, parseOpts);
      if (res.isUnstructured || res.rows.length === 0) {
        setUnstructuredNotice(
          res.unstructuredNotice ??
            'El archivo no presenta estructura tabular analizable directamente. Pegue el texto en el asistente de estructuración o verifique los separadores.'
        );
        setShowPasteBox(true);
      } else {
        onLoadRows(res.rows, {
          fileName: res.fileName,
          fileFormat: res.fileFormat,
          isSampleDataset: false,
        });
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Error al leer el archivo seleccionado.');
    } finally {
      setLoading(false);
      e.target.value = '';
    }
  };

  const handleParsePasted = () => {
    if (!rawPaste.trim()) return;
    setErrorMsg(null);
    setUnstructuredNotice(null);
    const res = parseRawTextInput(rawPaste, parseOpts);
    if (res.isUnstructured || res.rows.length === 0) {
      setUnstructuredNotice(
        res.unstructuredNotice ??
          'Texto detectado como no estructurado. Use "Estructurar texto con IA" o formatee con columnas separadas por coma o tabulador.'
      );
      return;
    }
    onLoadRows(res.rows, { fileName: res.fileName, fileFormat: res.fileFormat, isSampleDataset: false });
    setShowPasteBox(false);
  };

  const handleAIStructure = async () => {
    if (!rawPaste.trim()) return;
    setLoading(true);
    setErrorMsg(null);
    try {
      const resp = await fetch('/api/ai/structure-unstructured', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rawText: rawPaste }),
      });
      const json = await resp.json();
      if (json.fallback || !Array.isArray(json.rows) || json.rows.length === 0) {
        setUnstructuredNotice(
          json.reason ||
            'No se pudieron extraer filas tabulares consistentes. Verifique que el texto incluya registros homogéneos o cárguelo como CSV/Excel.'
        );
      } else {
        onLoadRows(json.rows, {
          fileName: 'datos_estructurados.json',
          fileFormat: 'ESTRUCTURADO',
          isSampleDataset: false,
        });
        setShowPasteBox(false);
        setUnstructuredNotice(null);
      }
    } catch {
      setErrorMsg('No fue posible conectar con el servicio de estructuración del servidor.');
    } finally {
      setLoading(false);
    }
  };

  const firstFiveRows = dataset?.rawRows.slice(0, 5) ?? [];
  const colNames = dataset?.columns.map((c) => c.name) ?? [];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <p className="text-xs font-medium text-teal-700 mb-1">Módulo 01 · Ingesta y Perfilado Estructural</p>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">
            Carga Inteligente de Datos y Diccionario
          </h2>
          <p className="text-sm text-slate-600 mt-1 max-w-3xl">
            Importe bases de cualquier sector económico en CSV, Excel (.xlsx/.xls), JSON, TSV o Parquet.
            El motor detecta automáticamente la naturaleza estadística de cada columna y evalúa la viabilidad para regresión múltiple.
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <input
            ref={projectInputRef}
            type="file"
            accept=".json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onImportProjectJSON(f);
              e.target.value = '';
            }}
          />
          <button
            type="button"
            onClick={() => projectInputRef.current?.click()}
            className="px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors flex items-center gap-2 whitespace-nowrap"
          >
            <FolderOpen className="w-3.5 h-3.5" />
            Abrir proyecto (.json)
          </button>
          {dataset && (
            <button
              type="button"
              onClick={onProceedNext}
              className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors whitespace-nowrap"
            >
              Continuar a Contexto de Negocio
            </button>
          )}
        </div>
      </div>

      {/* Upload & Config Area */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6 space-y-5">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-slate-900">Importar archivo de datos</h3>
            <span className="text-xs text-slate-500">Límite seguro: 15 MB · Procesamiento local</span>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.tsv,.txt,.xlsx,.xls,.json,.parquet"
            onChange={handleFileChange}
            className="hidden"
          />

          <div
            onClick={() => fileInputRef.current?.click()}
            className="border border-dashed border-slate-300 hover:border-teal-600 bg-slate-50/70 hover:bg-teal-50/30 transition-colors rounded-lg p-8 text-center cursor-pointer"
          >
            <Upload className="w-7 h-7 text-teal-700 mx-auto mb-3" />
            <p className="text-sm font-medium text-slate-900">
              {loading ? 'Procesando archivo...' : 'Haga clic para seleccionar CSV, XLSX, XLS, JSON, TSV o Parquet'}
            </p>
            <p className="text-xs text-slate-500 mt-1">
              Los datos tabulares permanecen en su sesión analítica; las variables confidenciales no se envían completas a modelos externos.
            </p>
          </div>

          {/* Import Settings */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-1">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Separador CSV/Texto</label>
              <select
                value={parseOpts.delimiter}
                onChange={(e) => setParseOpts({ ...parseOpts, delimiter: e.target.value as ParseOptions['delimiter'] })}
                className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg"
              >
                <option value="auto">Detección automática</option>
                <option value=",">Coma (,)</option>
                <option value=";">Punto y coma (;)</option>
                <option value="\t">Tabulador (TSV)</option>
                <option value="|">Barra vertical (|)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Codificación</label>
              <select
                value={parseOpts.encoding}
                onChange={(e) => setParseOpts({ ...parseOpts, encoding: e.target.value as ParseOptions['encoding'] })}
                className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg"
              >
                <option value="utf-8">UTF-8 (Estándar)</option>
                <option value="iso-8859-1">ISO-8859-1 / Latin-1 (Excel ES)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Formato numérico decimal</label>
              <select
                value={parseOpts.decimalSeparator}
                onChange={(e) => setParseOpts({ ...parseOpts, decimalSeparator: e.target.value as '.' | ',' })}
                className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg"
              >
                <option value=".">Punto decimal (1,234.56)</option>
                <option value=",">Coma decimal (1.234,56)</option>
              </select>
            </div>
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setShowPasteBox(!showPasteBox)}
              className="text-xs font-medium text-teal-700 hover:text-teal-900 underline underline-offset-4"
            >
              {showPasteBox ? 'Ocultar pegado / datos no estructurados' : 'Pegar tabla o estructurar texto libre'}
            </button>
          </div>

          {showPasteBox && (
            <div className="space-y-3 pt-2">
              <textarea
                rows={5}
                value={rawPaste}
                onChange={(e) => setRawPaste(e.target.value)}
                placeholder="Pegue aquí datos CSV/TSV, JSON o texto libre de negocio para estructuración..."
                className="w-full p-3 text-xs font-mono border border-slate-300 rounded-lg focus:outline-none focus:border-teal-600"
              />
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={handleParsePasted}
                  className="px-3.5 py-2 text-xs font-medium bg-slate-900 text-white rounded-lg hover:bg-slate-800"
                >
                  Cargar texto tabular
                </button>
                <button
                  type="button"
                  onClick={handleAIStructure}
                  disabled={loading}
                  className="px-3.5 py-2 text-xs font-medium bg-teal-700 text-white rounded-lg hover:bg-teal-800 flex items-center gap-1.5"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  Estructurar texto no tabular con IA
                </button>
              </div>
            </div>
          )}

          {errorMsg && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-800">
              {errorMsg}
            </div>
          )}
          {unstructuredNotice && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900">
              {unstructuredNotice}
            </div>
          )}
        </div>

        {/* Sample / Academic Test Datasets */}
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6 space-y-4">
          <div>
            <h3 className="text-base font-semibold text-slate-900">Bases de Prueba y Referencia Académica</h3>
            <p className="text-xs text-slate-600 mt-1">
              Conjuntos explícitamente identificados como datos de prueba para verificar cada módulo sin simular resultados.
            </p>
          </div>

          <div className="space-y-2.5">
            {SAMPLE_DATASETS.map((spec) => (
              <button
                key={spec.id}
                type="button"
                onClick={() =>
                  onLoadRows(
                    spec.rows,
                    {
                      fileName: `${spec.id}.xlsx`,
                      fileFormat: 'PRUEBA ACADÉMICA / DEMO',
                      isSampleDataset: true,
                      sampleNote: spec.description,
                      controllableHint: spec.controllableHint,
                    },
                    spec
                  )
                }
                className="w-full text-left p-3.5 border border-slate-200 hover:border-teal-600 hover:bg-slate-50 rounded-lg transition-colors"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-slate-900">{spec.title}</span>
                  <span className="text-[11px] font-mono text-teal-700 shrink-0">{spec.rows.length} filas</span>
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  {spec.sector} · {spec.subtitle}
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Dataset Overview + Mandatory 5-Row Real Preview */}
      {dataset && (
        <div className="space-y-6">
          {dataset.isSampleDataset && (
            <div className="p-3.5 bg-slate-100 border border-slate-300 rounded-lg text-xs text-slate-800 flex items-start gap-2.5">
              <Database className="w-4 h-4 text-slate-700 shrink-0 mt-0.5" />
              <div>
                <strong>Base de prueba identificada:</strong> {dataset.sampleNote}
              </div>
            </div>
          )}

          {/* Suitability Banner */}
          <div
            className={`p-4 border rounded-xl text-xs flex items-start gap-3 ${
              dataset.suitabilityStatus === 'unsuitable'
                ? 'bg-rose-50 border-rose-200 text-rose-900'
                : dataset.suitabilityStatus === 'apt_with_warnings'
                  ? 'bg-amber-50 border-amber-200 text-amber-900'
                  : 'bg-teal-50/60 border-teal-200 text-teal-950'
            }`}
          >
            {dataset.suitabilityStatus === 'apt' ? (
              <CheckCircle2 className="w-4 h-4 text-teal-700 shrink-0 mt-0.5" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
            )}
            <div>
              <div className="font-semibold">
                Evaluación de idoneidad para regresión múltiple:{' '}
                {dataset.suitabilityStatus === 'apt'
                  ? 'Apta'
                  : dataset.suitabilityStatus === 'apt_with_warnings'
                    ? 'Apta con advertencias'
                    : 'Limitaciones estructurales severas'}
              </div>
              <p className="mt-1">{dataset.suitabilityMessage}</p>
            </div>
          </div>

          {/* KPI Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
            {[
              { label: 'Total registros', value: String(dataset.rowCount) },
              { label: 'Número de variables', value: String(dataset.columnCount) },
              { label: 'Completitud global', value: `${dataset.completenessPct.toFixed(1)}%` },
              { label: 'Celdas ausentes', value: String(dataset.totalMissingCells) },
              { label: 'Filas duplicadas', value: String(dataset.duplicateCount) },
              { label: 'Variables constantes', value: String(dataset.columns.filter((c) => c.isConstant).length) },
            ].map((kpi) => (
              <div key={kpi.label} className="bg-white border border-slate-200 rounded-xl p-4">
                <div className="text-xs text-slate-500">{kpi.label}</div>
                <div className="text-xl font-bold font-mono tabular-nums text-slate-900 mt-1">{kpi.value}</div>
              </div>
            ))}
          </div>

          {/* Mandatory First 5 Real Rows Preview */}
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-base font-semibold text-slate-900 flex items-center gap-2">
                  <FileSpreadsheet className="w-4 h-4 text-teal-700" />
                  Vista Previa Obligatoria: Primeras 5 Filas Reales
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Archivo: {dataset.fileName} · Formato: {dataset.fileFormat} · Nombres originales de columnas conservados
                </p>
              </div>
            </div>

            <div className="overflow-x-auto border border-slate-200 rounded-lg">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="px-3 py-2.5 text-left font-semibold text-slate-500">#</th>
                    {colNames.map((cn) => (
                      <th key={cn} className="px-3 py-2.5 text-left font-semibold text-slate-800 whitespace-nowrap">
                        {cn}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {firstFiveRows.map((row, idx) => (
                    <tr key={idx} className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50/70">
                      <td className="px-3 py-2 font-mono text-slate-400 tabular-nums">{idx + 1}</td>
                      {colNames.map((cn) => {
                        const v = row[cn];
                        return (
                          <td
                            key={cn}
                            className={`px-3 py-2 whitespace-nowrap ${
                              typeof v === 'number' ? 'font-mono tabular-nums text-right text-slate-900' : 'text-slate-700'
                            }`}
                          >
                            {v === null || v === undefined ? (
                              <span className="text-amber-700 font-mono">Ausente</span>
                            ) : (
                              String(v)
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Quality Alerts */}
          {dataset.alerts.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-3">
              <h3 className="text-base font-semibold text-slate-900">
                Alertas de Calidad de Datos ({dataset.alerts.length})
              </h3>
              <div className="divide-y divide-slate-100">
                {dataset.alerts.map((al) => (
                  <div key={al.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                    <div>
                      <span
                        className={`font-semibold mr-2 ${
                          al.severity === 'critical'
                            ? 'text-rose-700'
                            : al.severity === 'warning'
                              ? 'text-amber-700'
                              : 'text-slate-700'
                        }`}
                      >
                        [{al.severity === 'critical' ? 'Crítica' : al.severity === 'warning' ? 'Advertencia' : 'Nota'}]
                      </span>
                      <span className="font-semibold text-slate-900">{al.title}</span>
                      <p className="text-slate-600 mt-0.5">{al.description}</p>
                    </div>
                    <div className="text-slate-500 sm:text-right max-w-sm shrink-0">{al.recommendation}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Editable Data Dictionary */}
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-semibold text-slate-900">Diccionario de Datos Editable</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Corrija manualmente la clasificación estadística, unidad de medida, descripción y si la variable es controlable.
                </p>
              </div>
              {mode === 'guided' && (
                <span className="text-xs text-teal-800">
                  Sugerencia: Marque como controlables las palancas que la gerencia puede modificar.
                </span>
              )}
            </div>

            <div className="overflow-x-auto border border-slate-200 rounded-lg">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-left text-slate-600">
                    <th className="px-3 py-2.5 font-semibold">Variable</th>
                    <th className="px-3 py-2.5 font-semibold">Tipo detectado</th>
                    <th className="px-3 py-2.5 font-semibold">Clasificación final</th>
                    <th className="px-3 py-2.5 font-semibold">Unidad</th>
                    <th className="px-3 py-2.5 font-semibold text-right">Ausentes</th>
                    <th className="px-3 py-2.5 font-semibold text-right">Únicos</th>
                    <th className="px-3 py-2.5 font-semibold text-right">Media / Mediana</th>
                    <th className="px-3 py-2.5 font-semibold">Rol / Controlable</th>
                    <th className="px-3 py-2.5 font-semibold">Descripción de negocio</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {dataset.columns.map((col) => (
                    <tr key={col.name} className="hover:bg-slate-50/70">
                      <td className="px-3 py-2 font-medium text-slate-900 whitespace-nowrap">
                        {col.name}
                        <div className="text-[11px] text-slate-400 font-normal">
                          {col.isPotentialIdentifier
                            ? 'Posible ID'
                            : col.isConstant
                              ? 'Constante'
                              : col.isPotentialTarget
                                ? 'Apta Y / Predictora'
                                : 'Predictora / Contexto'}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-slate-500 whitespace-nowrap">{col.detectedType}</td>
                      <td className="px-3 py-2">
                        <select
                          value={col.selectedType}
                          onChange={(e) =>
                            onUpdateColumnMeta(col.name, { selectedType: e.target.value as VariableNature })
                          }
                          className="px-2 py-1 text-xs border border-slate-300 rounded bg-white"
                        >
                          {VARIABLE_NATURE_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="text"
                          value={col.unit}
                          onChange={(e) => onUpdateColumnMeta(col.name, { unit: e.target.value })}
                          className="w-24 px-2 py-1 text-xs border border-slate-300 rounded"
                        />
                      </td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums">
                        {col.missingCount} ({col.missingPct.toFixed(1)}%)
                      </td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums">{col.uniqueCount}</td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums whitespace-nowrap">
                        {col.mean !== undefined ? `${formatNum(col.mean, 2)} / ${formatNum(col.median, 2)}` : '—'}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <label className="inline-flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={col.isControllable}
                            onChange={(e) =>
                              onUpdateColumnMeta(col.name, { isControllable: e.target.checked })
                            }
                            className="rounded border-slate-300 text-teal-700"
                          />
                          <span className="text-slate-700">Controlable</span>
                        </label>
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="text"
                          value={col.description}
                          onChange={(e) => onUpdateColumnMeta(col.name, { description: e.target.value })}
                          className="w-52 px-2 py-1 text-xs border border-slate-300 rounded"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
