import React, { useEffect, useState } from 'react';
import {
  Menu,
  X,
  Save,
  Zap,
  Check,
} from 'lucide-react';
import {
  AnalyticsProject,
  AppMode,
  BusinessContext,
  BusinessRecommendation,
  CleaningPipelineConfig,
  DataRow,
  OptimizationResult,
  ScenarioResult,
  VariableNature,
  VariableSimulationMethod,
} from './types/analytics';
import { profileDataset } from './engine/profiler';
import { buildDefaultCleaningConfig, runCleaningPipeline } from './engine/pipeline';
import { runEDA } from './engine/eda';
import { buildVariableSelectionPlan } from './engine/variableSelector';
import { trainAndCompareModels } from './engine/regression';
import { buildVariableSimulationProfiles, generateSimulatedSeries } from './engine/variableSimulator';
import {
  generatePresetInputs,
  getBaseReferenceInputs,
  predictSingleObservation,
  runScenarioSimulation,
} from './engine/scenarioSimulator';
import { buildDeterministicRecommendation } from './engine/recommendations';
import { exportProjectJSON } from './engine/exporter';
import { SampleDatasetSpec } from './engine/sampleDatasets';
import { Module01Ingest } from './components/modules/Module01Ingest';
import { Module02Context } from './components/modules/Module02Context';
import { Module03Cleaning } from './components/modules/Module03Cleaning';
import { Module04EDA } from './components/modules/Module04EDA';
import { Module05Selection } from './components/modules/Module05Selection';
import { Module06Modeling } from './components/modules/Module06Modeling';
import { Module07Interpretation } from './components/modules/Module07Interpretation';
import { Module08VarModeling } from './components/modules/Module08VarModeling';
import { Module09Simulator } from './components/modules/Module09Simulator';
import { Module10Recommendations } from './components/modules/Module10Recommendations';
import { Module11Optimization } from './components/modules/Module11Optimization';
import { Module12ExecutiveDashboard } from './components/modules/Module12ExecutiveDashboard';
import { Module13Export } from './components/modules/Module13Export';

const STORAGE_KEY = 'ri_zoraya_forero_project_v1';

const MODULES = [
  { id: 1, title: '01. Carga de Datos' },
  { id: 2, title: '02. Contexto de Negocio' },
  { id: 3, title: '03. Limpieza y Pipeline' },
  { id: 4, title: '04. EDA y Correlaciones' },
  { id: 5, title: '05. Selección de Variables' },
  { id: 6, title: '06. Modelos de Regresión' },
  { id: 7, title: '07. Coeficientes' },
  { id: 8, title: '08. Modelos por Variable' },
  { id: 9, title: '09. Simulador Escenarios' },
  { id: 10, title: '10. Recomendaciones' },
  { id: 11, title: '11. Optimización' },
  { id: 12, title: '12. Dashboard Ejecutivo' },
  { id: 13, title: '13. Exportación e Informe' },
];

function createEmptyProject(): AnalyticsProject {
  const now = new Date().toISOString();
  return {
    projectId: `RI-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
    projectName: 'Análisis Empresarial',
    createdAt: now,
    updatedAt: now,
    mode: 'guided',
    dataset: null,
    businessContext: {
      sector: '',
      activity: '',
      datasetDescription: '',
      businessQuestion: '',
      objective: 'explicar',
      analysisUnit: '',
      predictionHorizon: 'Próximo trimestre',
      constraints: '',
      controllableColumns: [],
      nonControllableColumns: [],
    },
    cleaningConfig: null,
    cleanedResult: null,
    edaResult: null,
    selectionPlan: null,
    modelingSuite: null,
    variableSimModels: [],
    scenarios: [],
    optimizationResult: null,
  };
}

export default function App() {
  const [project, setProject] = useState<AnalyticsProject>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) return JSON.parse(saved) as AnalyticsProject;
    } catch {
      // ignore storage errors
    }
    return createEmptyProject();
  });

  const [activeModule, setActiveModule] = useState<number>(1);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(project));
    } catch {
      // ignore quota errors
    }
  }, [project]);

  const showNotice = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  };

  const activeModel =
    project.modelingSuite?.models.find(
      (m) => m.id === project.modelingSuite?.recommendedModelId
    ) ?? project.modelingSuite?.models[0] ?? null;

  // Step 1: Load dataset and automatically profile, initialize context, default cleaning & EDA
  const handleLoadRows = (
    rows: DataRow[],
    meta: {
      fileName: string;
      fileFormat: string;
      isSampleDataset?: boolean;
      sampleNote?: string;
      controllableHint?: string[];
    },
    sampleSpec?: SampleDatasetSpec
  ) => {
    const profiled = profileDataset(rows, meta);
    const defaultTarget =
      sampleSpec?.recommendedTarget ??
      profiled.columns.find((c) => c.selectedType === 'continuous' || c.selectedType === 'discrete')
        ?.name ??
      profiled.columns[0]?.name ??
      '';

    const controllableCols = profiled.columns
      .filter((c) => c.isControllable || meta.controllableHint?.includes(c.name))
      .map((c) => c.name);
    const nonControllableCols = profiled.columns
      .filter((c) => !controllableCols.includes(c.name) && !c.isPotentialIdentifier)
      .map((c) => c.name);

    const nextContext: BusinessContext = {
      sector: sampleSpec?.sector ?? '',
      activity: sampleSpec?.title ?? '',
      datasetDescription: sampleSpec?.description ?? `Base cargada desde ${meta.fileName} con ${profiled.rowCount} registros.`,
      businessQuestion: sampleSpec?.businessQuestion ?? '',
      objective: 'explicar',
      analysisUnit: 'Observación',
      predictionHorizon: profiled.hasTemporalColumn ? '6 periodos' : 'Escenario táctico',
      constraints: '',
      controllableColumns: controllableCols,
      nonControllableColumns: nonControllableCols,
    };

    const cleanCfg = buildDefaultCleaningConfig(profiled, defaultTarget);
    const cleaned = runCleaningPipeline(profiled, cleanCfg);
    const eda = runEDA(profiled, cleaned);
    const selPlan = buildVariableSelectionPlan(profiled, nextContext, eda, defaultTarget);

    setProject({
      ...createEmptyProject(),
      projectName: meta.fileName.replace(/\.[^.]+$/, ''),
      mode: project.mode,
      dataset: profiled,
      businessContext: nextContext,
      cleaningConfig: cleanCfg,
      cleanedResult: cleaned,
      edaResult: eda,
      selectionPlan: selPlan,
    });
    showNotice(`Base "${meta.fileName}" cargada (${profiled.rowCount} filas reales).`);
  };

  const handleUpdateColumnMeta = (
    colName: string,
    patch: Partial<{ selectedType: VariableNature; unit: string; description: string; isControllable: boolean }>
  ) => {
    if (!project.dataset) return;
    const updatedCols = project.dataset.columns.map((c) =>
      c.name === colName ? { ...c, ...patch } : c
    );
    const reprofiled = profileDataset(project.dataset.rawRows, {
      fileName: project.dataset.fileName,
      fileFormat: project.dataset.fileFormat,
      isSampleDataset: project.dataset.isSampleDataset,
      sampleNote: project.dataset.sampleNote,
      previousProfiles: updatedCols,
    });
    const ctrl = new Set(project.businessContext.controllableColumns);
    if (patch.isControllable === true) ctrl.add(colName);
    if (patch.isControllable === false) ctrl.delete(colName);

    setProject((prev) => ({
      ...prev,
      updatedAt: new Date().toISOString(),
      dataset: reprofiled,
      businessContext: {
        ...prev.businessContext,
        controllableColumns: Array.from(ctrl),
      },
    }));
  };

  const handleExecutePipeline = (overrideCfg?: CleaningPipelineConfig) => {
    if (!project.dataset) return;
    const cfg = overrideCfg ?? project.cleaningConfig;
    if (!cfg) return;
    const cleaned = runCleaningPipeline(project.dataset, cfg);
    const eda = runEDA(project.dataset, cleaned);
    const selPlan = buildVariableSelectionPlan(
      project.dataset,
      project.businessContext,
      eda,
      cfg.targetColumn
    );
    setProject((prev) => ({
      ...prev,
      updatedAt: new Date().toISOString(),
      cleaningConfig: cfg,
      cleanedResult: cleaned,
      edaResult: eda,
      selectionPlan: selPlan,
    }));
    showNotice('Pipeline de limpieza, imputación y EDA ejecutado sin fuga de información.');
  };

  const handleRunModelingSuite = () => {
    if (!project.dataset || !project.cleaningConfig || !project.selectionPlan) return;
    // Re-run cleaning ensuring targetColumn matches selectionPlan.selectedTarget
    const syncedCfg: CleaningPipelineConfig = {
      ...project.cleaningConfig,
      targetColumn: project.selectionPlan.selectedTarget,
    };
    const cleaned = runCleaningPipeline(project.dataset, syncedCfg);
    const eda = runEDA(project.dataset, cleaned);
    const targetColProf = project.dataset.columns.find(
      (c) => c.name === project.selectionPlan!.selectedTarget
    );
    const targetUnit = targetColProf?.unit ?? 'Unidades';

    const suite = trainAndCompareModels(
      cleaned,
      project.selectionPlan.selectedPredictors,
      project.businessContext,
      targetUnit,
      syncedCfg.chronologicalSplit
    );

    const recModel =
      suite.models.find((m) => m.id === suite.recommendedModelId) ?? suite.models[0];

    let varSimModels = project.variableSimModels;
    let initialScenarios: ScenarioResult[] = [];
    if (recModel) {
      varSimModels = buildVariableSimulationProfiles(
        project.dataset,
        cleaned,
        eda,
        recModel,
        project.businessContext,
        syncedCfg.randomSeed
      );

      // Automatically build Base + Optimistic + Conservative scenarios with deterministic recommendations
      const baseInputs = getBaseReferenceInputs(project.dataset, cleaned, varSimModels);
      const basePred = predictSingleObservation(baseInputs, recModel, cleaned);

      const baseSc = runScenarioSimulation({
        name: 'Escenario Base (Referencia)',
        type: 'base',
        baseInputs,
        simulatedInputs: baseInputs,
        basePredictedY: basePred.predictedY,
        profiles: varSimModels,
        model: recModel,
        cleaned,
        horizonSteps: 1,
        nSimulations: 1,
        seed: syncedCfg.randomSeed,
      });
      baseSc.recommendation = buildDeterministicRecommendation(
        baseSc,
        recModel,
        project.businessContext,
        project.dataset
      );

      const optInputs = generatePresetInputs(
        'optimista',
        baseInputs,
        varSimModels,
        recModel,
        project.businessContext,
        1
      );
      const optSc = runScenarioSimulation({
        name: 'Escenario Optimista',
        type: 'optimista',
        baseInputs,
        simulatedInputs: optInputs,
        basePredictedY: basePred.predictedY,
        profiles: varSimModels,
        model: recModel,
        cleaned,
        horizonSteps: 1,
        nSimulations: 1,
        seed: syncedCfg.randomSeed,
      });
      optSc.recommendation = buildDeterministicRecommendation(
        optSc,
        recModel,
        project.businessContext,
        project.dataset
      );
      initialScenarios = [baseSc, optSc];
    }

    setProject((prev) => ({
      ...prev,
      updatedAt: new Date().toISOString(),
      cleaningConfig: syncedCfg,
      cleanedResult: cleaned,
      edaResult: eda,
      modelingSuite: suite,
      variableSimModels: varSimModels,
      scenarios: initialScenarios,
      optimizationResult: null,
    }));
    setActiveModule(6);
    showNotice(`${suite.models.length} modelos entrenados y evaluados.`);
  };

  const handleSelectActiveModel = (modelId: string) => {
    if (!project.modelingSuite || !project.dataset || !project.cleanedResult || !project.edaResult) return;
    const updatedModels = project.modelingSuite.models.map((m) => ({
      ...m,
      isRecommended: m.id === modelId,
    }));
    const chosen = updatedModels.find((m) => m.id === modelId)!;
    const varProfiles = buildVariableSimulationProfiles(
      project.dataset,
      project.cleanedResult,
      project.edaResult,
      chosen,
      project.businessContext,
      project.cleaningConfig?.randomSeed ?? 42
    );
    setProject((prev) => ({
      ...prev,
      modelingSuite: {
        ...prev.modelingSuite!,
        recommendedModelId: modelId,
        models: updatedModels,
      },
      variableSimModels: varProfiles,
    }));
    showNotice(`Modelo activo cambiado a "${chosen.name}".`);
  };

  const handleChangeVariableMethod = (colName: string, method: VariableSimulationMethod) => {
    if (!project.cleanedResult) return;
    const rows = project.cleanedResult.cleanedRows;
    const updated = project.variableSimModels.map((vp) => {
      if (vp.column !== colName) return vp;
      if (vp.categories) return { ...vp, selectedMethod: method };
      const series = rows.map((r) => Number(r[colName]) || vp.historicalStats.median);
      const nextPreview = generateSimulatedSeries(
        {
          method,
          series,
          mean: vp.historicalStats.mean,
          std: vp.historicalStats.std,
          minVal: vp.historicalStats.min,
          maxVal: vp.historicalStats.max,
          minAllowed: vp.constraints.minAllowed,
          maxAllowed: vp.constraints.maxAllowed,
          trendSlope: vp.historicalStats.trendSlope ?? 0,
          ar1Phi: vp.historicalStats.ar1Phi ?? 0.5,
          integerOnly: vp.constraints.integerOnly,
          auxModel: vp.auxiliaryModel,
        },
        5,
        (project.cleaningConfig?.randomSeed ?? 42) + 7
      ).map((val, idx) => ({
        step: idx + 1,
        value: val,
        provenance:
          method === 'direct_user_control'
            ? ('Definido por usuario' as const)
            : ('Simulado' as const),
      }));
      return { ...vp, selectedMethod: method, simulatedSamplePreview: nextPreview };
    });
    setProject((prev) => ({ ...prev, variableSimModels: updated }));
  };

  const handleAddScenario = (sc: ScenarioResult) => {
    if (!activeModel || !project.dataset) return;
    const withRec: ScenarioResult = {
      ...sc,
      recommendation: buildDeterministicRecommendation(
        sc,
        activeModel,
        project.businessContext,
        project.dataset
      ),
    };
    setProject((prev) => ({
      ...prev,
      updatedAt: new Date().toISOString(),
      scenarios: [...prev.scenarios, withRec],
    }));
    showNotice(`Escenario "${sc.name}" registrado con recomendación.`);
  };

  const handleImportProjectJSON = async (file: File) => {
    try {
      const txt = await file.text();
      const parsed = JSON.parse(txt);
      const imported: AnalyticsProject = parsed.project ?? parsed;
      if (!imported.projectId) throw new Error('Archivo de proyecto inválido.');
      setProject(imported);
      showNotice(`Proyecto "${imported.projectName}" restaurado.`);
    } catch (err) {
      showNotice(err instanceof Error ? err.message : 'No se pudo importar el proyecto.');
    }
  };

  const isModuleAvailable = (id: number): boolean => {
    if (id === 1) return true;
    if (!project.dataset) return false;
    if (id <= 5) return true;
    if (id >= 6 && !project.modelingSuite) return false;
    return true;
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      {/* Top Bar Contract: 3 zones separated by gap-8 */}
      <header className="sticky top-0 z-30 bg-white border-b border-slate-200 px-4 lg:px-6 h-14 flex items-center justify-between gap-8">
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => setMobileNavOpen(!mobileNavOpen)}
            className="lg:hidden p-1.5 text-slate-700 hover:bg-slate-100 rounded-md"
            aria-label="Abrir navegación"
          >
            {mobileNavOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
          <a
            href="#top"
            onClick={(e) => {
              e.preventDefault();
              setActiveModule(1);
            }}
            className="text-base font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
          >
            Regression Intelligence
          </a>
        </div>

        <nav className="hidden md:flex items-center gap-6 text-xs font-medium text-slate-600 overflow-hidden">
          <button
            type="button"
            onClick={() => setActiveModule(1)}
            className={`hover:text-slate-900 whitespace-nowrap shrink-0 ${activeModule <= 4 ? 'text-teal-700 font-semibold' : ''}`}
          >
            Datos y EDA
          </button>
          <button
            type="button"
            disabled={!project.dataset}
            onClick={() => setActiveModule(5)}
            className={`hover:text-slate-900 disabled:opacity-40 whitespace-nowrap shrink-0 ${activeModule >= 5 && activeModule <= 7 ? 'text-teal-700 font-semibold' : ''}`}
          >
            Modelado OLS / ML
          </button>
          <button
            type="button"
            disabled={!project.modelingSuite}
            onClick={() => setActiveModule(8)}
            className={`hover:text-slate-900 disabled:opacity-40 whitespace-nowrap shrink-0 ${activeModule >= 8 && activeModule <= 11 ? 'text-teal-700 font-semibold' : ''}`}
          >
            Simulación y Decisión
          </button>
          <button
            type="button"
            disabled={!project.modelingSuite}
            onClick={() => setActiveModule(12)}
            className={`hover:text-slate-900 disabled:opacity-40 whitespace-nowrap shrink-0 ${activeModule === 12 ? 'text-teal-700 font-semibold' : ''}`}
          >
            Dashboard Ejecutivo
          </button>
          <button
            type="button"
            disabled={!project.dataset}
            onClick={() => setActiveModule(13)}
            className={`hover:text-slate-900 disabled:opacity-40 whitespace-nowrap shrink-0 ${activeModule === 13 ? 'text-teal-700 font-semibold' : ''}`}
          >
            Exportar
          </button>
        </nav>

        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => exportProjectJSON(project)}
            className="px-3.5 py-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0"
          >
            <Save className="w-3.5 h-3.5" />
            Guardar Proyecto
          </button>
        </div>
      </header>

      <div className="flex flex-1">
        {/* Sidebar Navigation (260px) */}
        <aside
          className={`${
            mobileNavOpen ? 'fixed inset-y-0 left-0 top-14 z-40 block w-64 shadow-lg' : 'hidden'
          } lg:block lg:w-64 shrink-0 bg-white border-r border-slate-200 flex flex-col justify-between`}
        >
          <div className="p-4 space-y-5">
            {/* Personal Brand Identity */}
            <div className="pb-4 border-b border-slate-100 space-y-1">
              <div className="text-xs font-semibold text-teal-800">
                Business Analytics & Decision Intelligence
              </div>
              <div className="text-sm font-bold text-slate-900">By Zoraya Forero</div>
              <p className="text-[11px] text-slate-500 leading-snug">
                Economista | Análisis de datos y automatización de procesos | Análisis financiero | Reportes para la toma de decisiones.
              </p>
            </div>

            {/* Workflow List */}
            <div className="space-y-1">
              <div className="text-[11px] font-semibold text-slate-400 px-2 pb-1">
                Flujo Analítico Integral
              </div>
              {MODULES.map((m) => {
                const enabled = isModuleAvailable(m.id);
                const active = activeModule === m.id;
                const completed =
                  (m.id === 1 && Boolean(project.dataset)) ||
                  (m.id === 3 && Boolean(project.cleanedResult)) ||
                  (m.id === 4 && Boolean(project.edaResult)) ||
                  (m.id === 6 && Boolean(project.modelingSuite)) ||
                  (m.id === 8 && project.variableSimModels.length > 0) ||
                  (m.id === 9 && project.scenarios.length > 0);
                return (
                  <button
                    key={m.id}
                    type="button"
                    disabled={!enabled}
                    onClick={() => {
                      setActiveModule(m.id);
                      setMobileNavOpen(false);
                    }}
                    className={`w-full text-left px-2.5 py-2 rounded-lg text-xs font-medium flex items-center justify-between transition-colors ${
                      active
                        ? 'bg-slate-900 text-white'
                        : enabled
                          ? 'text-slate-700 hover:bg-slate-100'
                          : 'text-slate-400 cursor-not-allowed'
                    }`}
                  >
                    <span className="truncate">{m.title}</span>
                    {completed && !active && <Check className="w-3.5 h-3.5 text-teal-600 shrink-0" />}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="p-4 border-t border-slate-100 text-[11px] text-slate-500 space-y-1">
            <div>Proyecto: <span className="font-mono text-slate-700">{project.projectId}</span></div>
            <div>© {new Date().getFullYear()} Zoraya Forero</div>
          </div>
        </aside>

        {/* Main Viewport */}
        <main className="flex-1 min-w-0 flex flex-col">
          {/* Workspace Sub-Toolbar (Mode Switch + Quick Pipeline Run) */}
          <div className="bg-white border-b border-slate-200 px-4 lg:px-8 py-2.5 flex flex-wrap items-center justify-between gap-4">
            <div className="text-xs text-slate-600 flex items-center gap-2 truncate">
              <span className="font-medium text-slate-900">
                {project.dataset ? project.dataset.fileName : 'Sin base cargada'}
              </span>
              {project.dataset && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono tabular-nums">
                    {project.dataset.rowCount} reg × {project.dataset.columnCount} vars
                  </span>
                </>
              )}
              {project.selectionPlan && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>
                    Y: <strong className="text-teal-800">{project.selectionPlan.selectedTarget}</strong>
                  </span>
                </>
              )}
            </div>

            <div className="flex items-center gap-3 shrink-0">
              {/* Guided vs Advanced Switch */}
              <div className="flex items-center gap-1 p-0.5 bg-slate-100 rounded-lg text-xs">
                <button
                  type="button"
                  onClick={() => setProject((p) => ({ ...p, mode: 'guided' as AppMode }))}
                  className={`px-2.5 py-1 rounded-md font-medium transition-colors whitespace-nowrap ${
                    project.mode === 'guided'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Modo guiado
                </button>
                <button
                  type="button"
                  onClick={() => setProject((p) => ({ ...p, mode: 'advanced' as AppMode }))}
                  className={`px-2.5 py-1 rounded-md font-medium transition-colors whitespace-nowrap ${
                    project.mode === 'advanced'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Modo avanzado
                </button>
              </div>

              {project.dataset && !project.modelingSuite && (
                <button
                  type="button"
                  onClick={handleRunModelingSuite}
                  className="px-3 py-1.5 text-xs font-semibold text-teal-800 bg-teal-50 border border-teal-200 hover:bg-teal-100 rounded-lg flex items-center gap-1.5 whitespace-nowrap"
                >
                  <Zap className="w-3.5 h-3.5" />
                  Entrenar Modelos Ahora
                </button>
              )}
            </div>
          </div>

          {/* Toast */}
          {toast && (
            <div className="mx-4 lg:mx-8 mt-4 p-3 bg-slate-900 text-white text-xs rounded-lg flex items-center justify-between">
              <span>{toast}</span>
              <button type="button" onClick={() => setToast(null)} className="text-slate-400 hover:text-white">
                Cerrar
              </button>
            </div>
          )}

          {/* Active Module Content */}
          <div className="p-4 lg:p-8 max-w-7xl w-full mx-auto flex-1 space-y-8">
            {/* Initial Screen Executive Hero when on Module 1 */}
            {activeModule === 1 && (
              <div className="bg-slate-900 text-white rounded-xl p-6 lg:p-8 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                <div className="space-y-2 max-w-2xl">
                  <div className="text-xs font-medium text-teal-300">
                    Business Analytics & Decision Intelligence · By Zoraya Forero
                  </div>
                  <h1 className="text-2xl lg:text-3xl font-bold tracking-tight">
                    Regression Intelligence
                  </h1>
                  <p className="text-sm text-slate-300 leading-relaxed">
                    Transforme bases de datos en conocimiento estadístico riguroso, modelos comparados de regresión múltiple,
                    simulaciones fundamentadas por variable, optimización con restricciones y recomendaciones ejecutivas.
                  </p>
                </div>
                <div className="border-t lg:border-t-0 lg:border-l border-slate-700 pt-4 lg:pt-0 lg:pl-6 text-xs text-slate-300 space-y-1 shrink-0 max-w-xs">
                  <div className="font-semibold text-white">Zoraya Forero</div>
                  <p>
                    Economista | Análisis de datos y automatización de procesos | Análisis financiero | Reportes para la toma de decisiones.
                  </p>
                </div>
              </div>
            )}

            {activeModule === 1 && (
              <Module01Ingest
                mode={project.mode}
                dataset={project.dataset}
                onLoadRows={handleLoadRows}
                onUpdateColumnMeta={handleUpdateColumnMeta}
                onImportProjectJSON={handleImportProjectJSON}
                onProceedNext={() => setActiveModule(2)}
              />
            )}

            {activeModule === 2 && project.dataset && (
              <Module02Context
                dataset={project.dataset}
                context={project.businessContext}
                onChangeContext={(nextCtx) => {
                  const selPlan = project.edaResult
                    ? buildVariableSelectionPlan(
                        project.dataset!,
                        nextCtx,
                        project.edaResult,
                        project.selectionPlan?.selectedTarget
                      )
                    : project.selectionPlan;
                  setProject((prev) => ({
                    ...prev,
                    updatedAt: new Date().toISOString(),
                    businessContext: nextCtx,
                    selectionPlan: selPlan,
                  }));
                }}
                onProceedNext={() => setActiveModule(3)}
              />
            )}

            {activeModule === 3 && project.dataset && project.cleaningConfig && (
              <Module03Cleaning
                mode={project.mode}
                dataset={project.dataset}
                config={project.cleaningConfig}
                cleanedResult={project.cleanedResult}
                onUpdateConfig={(nextCfg) =>
                  setProject((prev) => ({ ...prev, cleaningConfig: nextCfg }))
                }
                onExecutePipeline={() => handleExecutePipeline()}
                onProceedNext={() => setActiveModule(4)}
              />
            )}

            {activeModule === 4 && project.dataset && project.edaResult && (
              <Module04EDA
                dataset={project.dataset}
                cleanedResult={project.cleanedResult}
                eda={project.edaResult}
                onProceedNext={() => setActiveModule(5)}
              />
            )}

            {activeModule === 5 && project.dataset && project.selectionPlan && project.edaResult && (
              <Module05Selection
                plan={project.selectionPlan}
                onSelectTarget={(targetCol) => {
                  const nextPlan = buildVariableSelectionPlan(
                    project.dataset!,
                    project.businessContext,
                    project.edaResult!,
                    targetCol
                  );
                  setProject((prev) => ({
                    ...prev,
                    selectionPlan: nextPlan,
                    cleaningConfig: prev.cleaningConfig
                      ? { ...prev.cleaningConfig, targetColumn: targetCol }
                      : prev.cleaningConfig,
                  }));
                }}
                onTogglePredictor={(colName) => {
                  const curr = new Set(project.selectionPlan!.selectedPredictors);
                  if (curr.has(colName)) curr.delete(colName);
                  else curr.add(colName);
                  setProject((prev) => ({
                    ...prev,
                    selectionPlan: prev.selectionPlan
                      ? { ...prev.selectionPlan, selectedPredictors: Array.from(curr) }
                      : null,
                  }));
                }}
                onTrainModels={handleRunModelingSuite}
              />
            )}

            {activeModule === 6 && project.modelingSuite && (
              <Module06Modeling
                mode={project.mode}
                suite={project.modelingSuite}
                onSelectActiveModel={handleSelectActiveModel}
                onProceedNext={() => setActiveModule(7)}
              />
            )}

            {activeModule === 7 && activeModel && project.modelingSuite && (
              <Module07Interpretation
                model={activeModel}
                targetColumn={project.modelingSuite.targetColumn}
                targetUnit={project.modelingSuite.targetUnit}
                onProceedNext={() => setActiveModule(8)}
              />
            )}

            {activeModule === 8 && (
              <Module08VarModeling
                mode={project.mode}
                profiles={project.variableSimModels}
                onChangeVariableMethod={handleChangeVariableMethod}
                onRegenerateSamples={() => {
                  if (!project.dataset || !project.cleanedResult || !project.edaResult || !activeModel) return;
                  const nextSeed = (project.cleaningConfig?.randomSeed ?? 42) + Math.floor(Math.random() * 500 + 1);
                  const refreshed = buildVariableSimulationProfiles(
                    project.dataset,
                    project.cleanedResult,
                    project.edaResult,
                    activeModel,
                    project.businessContext,
                    nextSeed
                  );
                  setProject((prev) => ({ ...prev, variableSimModels: refreshed }));
                  showNotice('Muestras simuladas regeneradas con nueva semilla.');
                }}
                onProceedNext={() => setActiveModule(9)}
              />
            )}

            {activeModule === 9 &&
              project.dataset &&
              project.cleanedResult &&
              activeModel &&
              project.modelingSuite && (
                <Module09Simulator
                  dataset={project.dataset}
                  cleaned={project.cleanedResult}
                  model={activeModel}
                  profiles={project.variableSimModels}
                  context={project.businessContext}
                  targetColumn={project.modelingSuite.targetColumn}
                  targetUnit={project.modelingSuite.targetUnit}
                  scenarios={project.scenarios}
                  onAddScenario={handleAddScenario}
                  onRemoveScenario={(id) =>
                    setProject((prev) => ({
                      ...prev,
                      scenarios: prev.scenarios.filter((s) => s.id !== id),
                    }))
                  }
                  onProceedNext={() => setActiveModule(10)}
                />
              )}

            {activeModule === 10 && project.dataset && activeModel && (
              <Module10Recommendations
                dataset={project.dataset}
                context={project.businessContext}
                model={activeModel}
                scenarios={project.scenarios}
                onUpdateScenarioRecommendation={(scenarioId: string, rec: BusinessRecommendation) => {
                  setProject((prev) => ({
                    ...prev,
                    scenarios: prev.scenarios.map((s) =>
                      s.id === scenarioId ? { ...s, recommendation: rec } : s
                    ),
                  }));
                  showNotice('Recomendación actualizada con narrativa analítica.');
                }}
                onProceedNext={() => setActiveModule(11)}
              />
            )}

            {activeModule === 11 &&
              project.dataset &&
              project.cleanedResult &&
              activeModel &&
              project.modelingSuite && (
                <Module11Optimization
                  dataset={project.dataset}
                  cleaned={project.cleanedResult}
                  model={activeModel}
                  profiles={project.variableSimModels}
                  context={project.businessContext}
                  targetColumn={project.modelingSuite.targetColumn}
                  optimizationResult={project.optimizationResult}
                  onSetOptimizationResult={(res: OptimizationResult) => {
                    setProject((prev) => ({ ...prev, optimizationResult: res }));
                    showNotice('Optimización matemática completada.');
                  }}
                  onSaveOptimalAsScenario={(sc) => {
                    handleAddScenario(sc);
                    setActiveModule(9);
                  }}
                  onProceedNext={() => setActiveModule(12)}
                />
              )}

            {activeModule === 12 && (
              <Module12ExecutiveDashboard
                project={project}
                onNavigateModule={(id) => setActiveModule(id)}
              />
            )}

            {activeModule === 13 && <Module13Export project={project} />}
          </div>

          {/* Quiet Academic & Brand Footer */}
          <footer className="border-t border-slate-200 bg-white px-4 lg:px-8 py-4 text-[11px] text-slate-500 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <strong className="text-slate-800">Regression Intelligence | Business Analytics</strong> — By Zoraya Forero
            </div>
            <div>
              Referencia académica: conceptos de regresión múltiple y pronósticos del profesor Hugo Alexander Martínez Gallego.
            </div>
          </footer>
        </main>
      </div>
    </div>
  );
}
