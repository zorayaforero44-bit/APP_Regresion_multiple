export type VariableNature =
  | 'continuous'
  | 'discrete'
  | 'categorical_nominal'
  | 'categorical_ordinal'
  | 'binary'
  | 'datetime'
  | 'geographic'
  | 'text'
  | 'identifier'
  | 'constant';

export type AppMode = 'guided' | 'advanced';

export type DataRow = Record<string, string | number | boolean | null>;

export interface QualityAlert {
  id: string;
  severity: 'info' | 'warning' | 'critical';
  column?: string;
  category:
    | 'missing'
    | 'duplicates'
    | 'constant'
    | 'identifier'
    | 'outliers'
    | 'skewness'
    | 'format'
    | 'inconsistent_categories'
    | 'impossible_values'
    | 'small_sample'
    | 'unstructured';
  title: string;
  description: string;
  recommendation: string;
}

export interface ColumnProfile {
  name: string;
  detectedType: VariableNature;
  selectedType: VariableNature;
  unit: string;
  description: string;
  totalCount: number;
  missingCount: number;
  missingPct: number;
  uniqueCount: number;
  completenessPct: number;
  isConstant: boolean;
  isPotentialIdentifier: boolean;
  isPotentialTarget: boolean;
  isPotentialPredictor: boolean;
  isControllable: boolean;
  min?: number;
  max?: number;
  mean?: number;
  median?: number;
  std?: number;
  q1?: number;
  q3?: number;
  iqr?: number;
  skewness?: number;
  kurtosis?: number;
  iqrOutlierCount?: number;
  zOutlierCount?: number;
  negativeCount?: number;
  topCategories?: Array<{ value: string; count: number; pct: number }>;
  sampleValues: Array<string | number | boolean | null>;
  dateRange?: { min: string; max: string; isChronological: boolean };
}

export interface DatasetSummary {
  fileName: string;
  fileFormat: string;
  loadedAt: string;
  isSampleDataset: boolean;
  sampleNote?: string;
  rowCount: number;
  columnCount: number;
  duplicateCount: number;
  totalMissingCells: number;
  completenessPct: number;
  hasTemporalColumn: boolean;
  temporalColumn?: string;
  suitabilityStatus: 'apt' | 'apt_with_warnings' | 'unsuitable';
  suitabilityMessage: string;
  columns: ColumnProfile[];
  rawRows: DataRow[];
  alerts: QualityAlert[];
}

export interface BusinessContext {
  sector: string;
  activity: string;
  datasetDescription: string;
  businessQuestion: string;
  objective: 'explicar' | 'predecir' | 'optimizar' | 'simular';
  analysisUnit: string;
  predictionHorizon: string;
  constraints: string;
  controllableColumns: string[];
  nonControllableColumns: string[];
  aiInterpretation?: {
    summary: string;
    alignedColumns: Array<{ column: string; role: string; rationale: string }>;
    suggestedExternalVariables: Array<{ name: string; rationale: string }>;
    warnings: string[];
    source: 'gemini' | 'deterministic';
  };
}

export type NumericImputationMethod =
  | 'none'
  | 'median'
  | 'mean'
  | 'group_median'
  | 'knn'
  | 'multivariate_ols'
  | 'temporal_interpolation';

export type CategoricalImputationMethod =
  | 'none'
  | 'mode'
  | 'explicit_missing'
  | 'group_mode'
  | 'probabilistic';

export type OutlierStrategy = 'keep_flag' | 'winsorize_iqr' | 'exclude_extreme_z';

export type TransformMethod =
  | 'none'
  | 'standardize'
  | 'minmax'
  | 'log1p'
  | 'onehot'
  | 'ordinal';

export interface ColumnCleaningConfig {
  column: string;
  imputationMethod: NumericImputationMethod | CategoricalImputationMethod;
  groupByColumn?: string;
  outlierStrategy: OutlierStrategy;
  transform: TransformMethod;
  ordinalOrder?: string[];
  excludeFromPipeline?: boolean;
}

export interface CleaningPipelineConfig {
  removeDuplicates: boolean;
  excludeMissingTarget: boolean;
  targetColumn: string;
  validationSplitPct: number;
  chronologicalSplit: boolean;
  randomSeed: number;
  interactions: Array<[string, string]>;
  polynomialColumns: string[];
  columnConfigs: Record<string, ColumnCleaningConfig>;
}

export interface PipelineAuditEntry {
  step: number;
  stage: 'duplicados' | 'objetivo' | 'imputacion' | 'atipicos' | 'transformacion' | 'ingenieria';
  column: string;
  action: string;
  details: string;
  affectedRows: number;
}

export interface DataProvenanceRow {
  rowIndex: number;
  split: 'train' | 'validation' | 'test';
  rawValues: DataRow;
  cleanedValues: DataRow;
  transformedValues: Record<string, number>;
  imputedColumns: string[];
  outlierFlaggedColumns: string[];
}

export interface CleanedDatasetResult {
  config: CleaningPipelineConfig;
  trainRowsCount: number;
  valRowsCount: number;
  testRowsCount: number;
  excludedTargetMissingCount: number;
  duplicatesRemovedCount: number;
  cleanedRows: DataRow[];
  transformedFeatureNames: string[];
  featureOriginMap: Record<string, { sourceColumn: string; transformType: string; unit: string }>;
  provenanceRows: DataProvenanceRow[];
  auditLog: PipelineAuditEntry[];
  imputationSummary: Array<{
    column: string;
    method: string;
    imputedCount: number;
    justification: string;
  }>;
  outlierDiagnostics: Array<{
    column: string;
    iqrCount: number;
    zCount: number;
    strategyApplied: string;
    actionNote: string;
  }>;
}

export interface CorrelationPair {
  varA: string;
  varB: string;
  method: 'Pearson' | 'Spearman' | 'Kendall' | 'Cramér V' | 'Eta²';
  value: number;
  absValue: number;
  pValue?: number;
  direction: 'Positiva' | 'Negativa' | 'Asociación nominal';
  strength: 'Muy fuerte' | 'Fuerte' | 'Moderada' | 'Débil' | 'Nula';
  interpretation: string;
}

export interface VIFEntry {
  feature: string;
  vif: number;
  tolerance: number;
  severity: 'Bajo (<5)' | 'Moderado (5-10)' | 'Severo (>10)';
}

export interface EDAResult {
  numericStats: Array<{
    column: string;
    n: number;
    mean: number;
    median: number;
    std: number;
    min: number;
    q1: number;
    q3: number;
    max: number;
    skewness: number;
    iqrOutliers: number;
    histogramBins: Array<{ label: string; start: number; end: number; count: number }>;
  }>;
  categoricalStats: Array<{
    column: string;
    n: number;
    uniqueCount: number;
    categories: Array<{ label: string; count: number; pct: number }>;
  }>;
  correlationMatrix: {
    columns: string[];
    values: number[][];
    methods: string[][];
  };
  pairs: CorrelationPair[];
  vifEntries: VIFEntry[];
  temporalSeries?: {
    dateColumn: string;
    points: Array<{ date: string; values: Record<string, number> }>;
  };
}

export interface TargetCandidate {
  column: string;
  type: VariableNature;
  relevanceScore: number;
  businessJustification: string;
  statisticalViability: 'Alta' | 'Media' | 'Baja';
  warnings: string[];
}

export type PredictorTier = 'Recomendada' | 'Opcional' | 'Requiere revisión' | 'No recomendada';

export interface PredictorCandidate {
  column: string;
  type: VariableNature;
  tier: PredictorTier;
  correlationWithY: number | null;
  correlationMethod: string;
  vif: number | null;
  isControllable: boolean;
  leakageRisk: boolean;
  rationale: string;
  warnings: string[];
}

export interface VariableSelectionPlan {
  targetCandidates: TargetCandidate[];
  selectedTarget: string;
  predictorCandidates: PredictorCandidate[];
  selectedPredictors: string[];
  executiveExplanation: string;
}

export type RegressionModelFamily =
  | 'ols_full'
  | 'ols_parsimonious'
  | 'ols_interactions'
  | 'ols_transformed'
  | 'ridge'
  | 'lasso'
  | 'elastic_net';

export interface CoefficientDetail {
  feature: string;
  sourceColumn: string;
  unit: string;
  estimate: number;
  stdError: number | null;
  robustStdError?: number | null;
  tStat: number | null;
  pValue: number | null;
  robustPValue?: number | null;
  ciLower95: number | null;
  ciUpper95: number | null;
  standardizedBeta: number | null;
  vif: number | null;
  isSignificant05: boolean | null;
  inferenceValid: boolean;
  elasticityAtMean?: number | null;
  ceterisParibusText: string;
}

export interface DiagnosticSummary {
  breuschPaganStat: number | null;
  breuschPaganPValue: number | null;
  hasHeteroskedasticity: boolean;
  usedRobustSE: boolean;
  durbinWatson: number | null;
  autocorrelationNote: string;
  jarqueBeraStat: number | null;
  jarqueBeraPValue: number | null;
  residualsNormal: boolean;
  maxCooksD: number;
  influentialCount: number;
  influentialIndices: number[];
  maxVif: number;
  multicollinearityNote: string;
}

export interface ResidualPoint {
  index: number;
  split: 'train' | 'validation' | 'test';
  actual: number;
  predicted: number;
  residual: number;
  standardizedResidual: number;
  leverage: number;
  cooksD: number;
  theoreticalQuantile: number;
}

export interface TrainedModelResult {
  id: string;
  name: string;
  family: RegressionModelFamily;
  purpose: 'Inferencia y explicación' | 'Predicción regularizada';
  supportsInference: boolean;
  features: string[];
  hyperparams: { alpha?: number; l1Ratio?: number };
  intercept: number;
  coefficients: CoefficientDetail[];
  metrics: {
    nTrain: number;
    nVal: number;
    nTest: number;
    pFeatures: number;
    r2Train: number;
    adjR2Train: number;
    rmseTrain: number;
    maeTrain: number;
    standardError: number;
    fStatistic: number | null;
    fPValue: number | null;
    r2Val: number;
    rmseVal: number;
    maeVal: number;
    r2Test: number;
    rmseTest: number;
    maeTest: number;
    aic: number;
    bic: number;
    cvRmse: number;
    cvR2: number;
  };
  diagnostics: DiagnosticSummary;
  residuals: ResidualPoint[];
  multiCriteriaScore: number;
  selectionNotes: string[];
  tradeoffExplanation: string;
  isRecommended: boolean;
  // Saved matrices/stats for exact prediction & prediction intervals
  xtxInverse?: number[][];
  featureMeans?: Record<string, number>;
  featureStds?: Record<string, number>;
  trainFeatureBounds: Record<string, { min: number; max: number; mean: number; median: number; std: number }>;
  equationString: string;
}

export interface ModelingSuiteResult {
  targetColumn: string;
  targetUnit: string;
  validationStrategy: 'kfold_cv' | 'train_val_test' | 'chronological_split';
  smallSampleWarning: string | null;
  models: TrainedModelResult[];
  recommendedModelId: string;
  conflictExplanation: string;
}

export type VariableSimulationMethod =
  | 'direct_user_control'
  | 'conditional_auxiliary_regression'
  | 'temporal_trend_linear'
  | 'temporal_trend_poly'
  | 'autoregressive_ar1'
  | 'parametric_normal'
  | 'parametric_lognormal'
  | 'empirical_bootstrap'
  | 'monte_carlo_bounded'
  | 'categorical_probability';

export interface VariableSimulationProfile {
  column: string;
  nature: VariableNature;
  isControllable: boolean;
  unit: string;
  historicalStats: {
    min: number;
    max: number;
    mean: number;
    median: number;
    std: number;
    q1: number;
    q3: number;
    trendSlope: number | null;
    trendR2: number | null;
    ar1Phi: number | null;
    seasonalityStrength: number | null;
    skewness: number;
  };
  categories?: Array<{ value: string; probability: number }>;
  parentDependencies: Array<{ column: string; correlation: number }>;
  recommendedMethod: VariableSimulationMethod;
  selectedMethod: VariableSimulationMethod;
  alternativesEvaluated: Array<{
    method: VariableSimulationMethod;
    label: string;
    validationRmse: number | null;
    fitScore: number;
    viable: boolean;
    note: string;
  }>;
  validationEvidence: string;
  justification: string;
  constraints: {
    minAllowed: number;
    maxAllowed: number;
    integerOnly: boolean;
  };
  uncertaintyLevel: 'Baja' | 'Media' | 'Alta';
  auxiliaryModel?: {
    predictors: string[];
    intercept: number;
    betas: Record<string, number>;
    residualStd: number;
    r2: number;
  };
  simulatedSamplePreview: Array<{
    step: number;
    value: number | string;
    provenance: 'Simulado' | 'Definido por usuario';
  }>;
}

export type ScenarioPresetType =
  | 'base'
  | 'optimista'
  | 'conservador'
  | 'adverso'
  | 'personalizado'
  | 'probabilistico';

export interface ScenarioInputVariable {
  column: string;
  baseValue: number | string;
  simulatedValue: number | string;
  absDelta: number | null;
  pctDelta: number | null;
  provenance: 'Real (Referencia)' | 'Simulado' | 'Definido por usuario';
  isOutOfRange: boolean;
  trainMin?: number;
  trainMax?: number;
}

export interface ScenarioResult {
  id: string;
  name: string;
  type: ScenarioPresetType;
  createdAt: string;
  horizonSteps: number;
  nSimulations: number;
  seed: number;
  inputs: ScenarioInputVariable[];
  predictedY: number;
  deltaVsBaseAbs: number;
  deltaVsBasePct: number;
  confidenceInterval95: [number, number];
  predictionInterval95: [number, number];
  standardErrorPrediction: number;
  extrapolationWarnings: string[];
  economicSummary: string;
  monteCarloDistribution?: {
    mean: number;
    median: number;
    std: number;
    p5: number;
    p25: number;
    p75: number;
    p95: number;
    draws: number[];
    histogram: Array<{ label: string; start: number; end: number; count: number }>;
  };
  recommendation?: BusinessRecommendation;
}

export interface BusinessRecommendation {
  scenarioId: string;
  scenarioName: string;
  hallazgoPrincipal: string;
  interpretacionEmpresarial: string;
  accionRecomendada: string;
  impactoEsperado: string;
  riesgosYLimitaciones: string;
  dataSufficiencyNote?: string;
  source: 'gemini' | 'deterministic';
}

export interface OptimizationConfig {
  objective: 'maximize' | 'minimize' | 'target';
  targetGoalValue?: number;
  controllableVars: Array<{
    column: string;
    enabled: boolean;
    currentValue: number;
    minBound: number;
    maxBound: number;
    unitCost: number;
  }>;
  hasBudgetConstraint: boolean;
  maxBudget: number;
  minExpectedY?: number;
}

export interface OptimizationResult {
  converged: boolean;
  iterations: number;
  basePrediction: number;
  optimalPrediction: number;
  improvementAbs: number;
  improvementPct: number;
  predictionInterval95: [number, number];
  optimalVariables: Array<{
    column: string;
    baseValue: number;
    optimalValue: number;
    absDelta: number;
    pctDelta: number;
    atLowerBound: boolean;
    atUpperBound: boolean;
  }>;
  totalBudgetUsed: number;
  budgetLimit: number | null;
  activeConstraints: string[];
  extrapolationWarnings: string[];
  causalDisclaimer: string;
}

export interface AnalyticsProject {
  projectId: string;
  projectName: string;
  createdAt: string;
  updatedAt: string;
  mode: AppMode;
  dataset: DatasetSummary | null;
  businessContext: BusinessContext;
  cleaningConfig: CleaningPipelineConfig | null;
  cleanedResult: CleanedDatasetResult | null;
  edaResult: EDAResult | null;
  selectionPlan: VariableSelectionPlan | null;
  modelingSuite: ModelingSuiteResult | null;
  variableSimModels: VariableSimulationProfile[];
  scenarios: ScenarioResult[];
  optimizationResult: OptimizationResult | null;
}
