import assert from 'node:assert/strict';
import { SAMPLE_DATASETS } from '../sampleDatasets';
import { profileDataset } from '../profiler';
import { buildDefaultCleaningConfig, runCleaningPipeline } from '../pipeline';
import { runEDA } from '../eda';
import { buildVariableSelectionPlan } from '../variableSelector';
import { trainAndCompareModels } from '../regression';
import { buildVariableSimulationProfiles } from '../variableSimulator';
import {
  generatePresetInputs,
  getBaseReferenceInputs,
  predictSingleObservation,
  runScenarioSimulation,
} from '../scenarioSimulator';
import { buildDeterministicRecommendation } from '../recommendations';
import { optimizeDecisions } from '../optimizer';
import { BusinessContext } from '../../types/analytics';

function verifyEndToEnd() {
  console.log('=== Verificación Integral Obligatoria (20 pasos) ===');

  // Test 1: HAL Computer (Academic Reference PDF - Hugo A. Martínez Gallego)
  const hal = SAMPLE_DATASETS.find((d) => d.id === 'hal_europe')!;
  const halProfile = profileDataset(hal.rows, {
    fileName: 'Europe.xlsx',
    fileFormat: 'PRUEBA ACADÉMICA',
    isSampleDataset: true,
    controllableHint: hal.controllableHint,
  });

  assert.equal(halProfile.rowCount, 20, 'HAL debe tener 20 observaciones reales');
  assert.equal(halProfile.rawRows.slice(0, 5).length, 5, 'Debe exponer las primeras 5 filas');
  assert.equal(halProfile.columns[0].selectedType, 'geographic', 'Country debe detectarse como geográfica');

  const halCtx: BusinessContext = {
    sector: hal.sector,
    activity: hal.title,
    datasetDescription: hal.description,
    businessQuestion: hal.businessQuestion,
    objective: 'explicar',
    analysisUnit: 'País',
    predictionHorizon: '1 periodo',
    constraints: 'Cuotas territoriales realistas',
    controllableColumns: hal.controllableHint,
    nonControllableColumns: ['GNP_per_head', 'Unemployment_rate'],
  };

  const halCleanCfg = buildDefaultCleaningConfig(halProfile, 'Sales_Capita');
  const halCleaned = runCleaningPipeline(halProfile, halCleanCfg);
  const halEda = runEDA(halProfile, halCleaned);
  const halPlan = buildVariableSelectionPlan(halProfile, halCtx, halEda, 'Sales_Capita');

  // Verify leakage protection: Computer_Sales must NOT be auto-selected for Sales_Capita!
  assert.ok(
    !halPlan.selectedPredictors.includes('Computer_Sales'),
    'Computer_Sales debe ser detectada como fuga/identidad respecto a Sales_Capita'
  );

  // Train models on exact PDF predictors (GNP_per_head, Unemployment_rate, age_spend_on_education)
  const pdfPredictors = ['GNP_per_head', 'Unemployment_rate', 'age_spend_on_education'];
  const halSuite = trainAndCompareModels(halCleaned, pdfPredictors, halCtx, 'USD', false);
  assert.ok(halSuite.models.length >= 4, 'Deben entrenarse múltiples modelos OLS y regularizados');
  const olsFull = halSuite.models.find((m) => m.family === 'ols_full')!;
  assert.ok(olsFull.metrics.adjR2Train > 0.3 && olsFull.metrics.adjR2Train <= 1, 'CR2 válido en HAL');
  assert.ok(olsFull.metrics.fPValue !== null && olsFull.metrics.fPValue < 0.05, 'Prueba F significativa en HAL');

  // Test 2: Marketing Mix with missing values, categoricals & optimization
  const mkt = SAMPLE_DATASETS.find((d) => d.id === 'marketing_retail')!;
  const mktProfile = profileDataset(mkt.rows, {
    fileName: 'marketing_retail.csv',
    fileFormat: 'CSV',
    isSampleDataset: true,
    controllableHint: mkt.controllableHint,
  });
  assert.ok(mktProfile.totalMissingCells > 0, 'Marketing debe detectar valores faltantes reales');

  const mktCtx: BusinessContext = {
    sector: mkt.sector,
    activity: mkt.title,
    datasetDescription: mkt.description,
    businessQuestion: mkt.businessQuestion,
    objective: 'optimizar',
    analysisUnit: 'Campaña',
    predictionHorizon: 'Próximo mes',
    constraints: 'Presupuesto <= 8000',
    controllableColumns: mkt.controllableHint,
    nonControllableColumns: ['Canal', 'Temporada', 'Trafico_Web'],
  };

  const mktCleanCfg = buildDefaultCleaningConfig(mktProfile, 'Ventas_Netas_USD');
  const mktCleaned = runCleaningPipeline(mktProfile, mktCleanCfg);
  assert.ok(mktCleaned.imputationSummary.length > 0, 'Debe imputar valores faltantes en train');
  assert.ok(
    mktCleaned.cleanedRows.every((r) => r['Pauta_Digital_USD'] !== null),
    'Pauta_Digital_USD no debe tener nulos tras imputación'
  );

  const mktEda = runEDA(mktProfile, mktCleaned);
  const mktPlan = buildVariableSelectionPlan(mktProfile, mktCtx, mktEda, 'Ventas_Netas_USD');
  const mktSuite = trainAndCompareModels(
    mktCleaned,
    mktPlan.selectedPredictors,
    mktCtx,
    'USD',
    false
  );
  const recModel = mktSuite.models.find((m) => m.id === mktSuite.recommendedModelId)!;
  assert.ok(recModel.metrics.r2Val > 0.6, `Modelo Marketing debe generalizar bien (R2 val = ${recModel.metrics.r2Val})`);

  // Module 8: Individual variable simulation modeling
  const varModels = buildVariableSimulationProfiles(mktProfile, mktCleaned, mktEda, recModel, mktCtx, 42);
  assert.ok(varModels.length > 0, 'Deben caracterizarse las variables independientes para simulación');

  // Module 9: Scenario Simulator & Monte Carlo
  const baseInputs = getBaseReferenceInputs(mktProfile, mktCleaned, varModels);
  const basePred = predictSingleObservation(baseInputs, recModel, mktCleaned);
  const optInputs = generatePresetInputs('optimista', baseInputs, varModels, recModel, mktCtx, 1);
  const optScenario = runScenarioSimulation({
    name: 'Escenario Optimista',
    type: 'optimista',
    baseInputs,
    simulatedInputs: optInputs,
    basePredictedY: basePred.predictedY,
    profiles: varModels,
    model: recModel,
    cleaned: mktCleaned,
    horizonSteps: 1,
    nSimulations: 200,
    seed: 42,
  });
  assert.ok(optScenario.predictionInterval95[1] > optScenario.predictionInterval95[0], 'IP 95% válido');

  // Module 10: Recommendation
  const rec = buildDeterministicRecommendation(optScenario, recModel, mktCtx, mktProfile);
  assert.ok(rec.hallazgoPrincipal.length > 20 && rec.riesgosYLimitaciones.length > 20, 'Recomendación completa');

  // Module 11: Optimizer
  const optRes = optimizeDecisions(
    {
      objective: 'maximize',
      controllableVars: varModels
        .filter((v) => !v.categories && v.isControllable)
        .map((v) => ({
          column: v.column,
          enabled: true,
          currentValue: Number(baseInputs[v.column]),
          minBound: v.historicalStats.min,
          maxBound: v.historicalStats.max,
          unitCost: 1,
        })),
      hasBudgetConstraint: true,
      maxBudget: 7000,
    },
    baseInputs,
    recModel,
    mktCleaned
  );
  assert.ok(optRes.optimalPrediction >= optRes.basePrediction, 'Optimizador debe mejorar o igualar base');

  // Test 3: SaaS Time Series chronological validation
  const saas = SAMPLE_DATASETS.find((d) => d.id === 'saas_mrr')!;
  const saasProfile = profileDataset(saas.rows, {
    fileName: 'saas_mrr.csv',
    fileFormat: 'CSV',
    isSampleDataset: true,
    controllableHint: saas.controllableHint,
  });
  assert.equal(saasProfile.hasTemporalColumn, true, 'SaaS debe detectar columna temporal Fecha');
  const saasCleanCfg = buildDefaultCleaningConfig(saasProfile, 'MRR_USD');
  assert.equal(saasCleanCfg.chronologicalSplit, true, 'Serie temporal debe activar partición cronológica');

  console.log('TODAS LAS PRUEBAS PASARON EXITOSAMENTE:');
  console.log(`- HAL Computer OLS Adj R2: ${(olsFull.metrics.adjR2Train * 100).toFixed(2)}% | F p-val: ${olsFull.metrics.fPValue?.toFixed(4)}`);
  console.log(`- Marketing Modelo Recomendado: ${recModel.name} | R2 Val: ${(recModel.metrics.r2Val * 100).toFixed(2)}% | RMSE Val: ${recModel.metrics.rmseVal.toFixed(2)}`);
  console.log(`- Optimización Marketing: Base ${optRes.basePrediction.toFixed(2)} -> Óptimo ${optRes.optimalPrediction.toFixed(2)}`);
}

verifyEndToEnd();
