import {
  BusinessContext,
  CleanedDatasetResult,
  DatasetSummary,
  ScenarioInputVariable,
  ScenarioPresetType,
  ScenarioResult,
  TrainedModelResult,
  VariableSimulationProfile,
} from '../types/analytics';
import {
  createSeededRng,
  dot,
  matVecMul,
  mean,
  quantile,
  sampleNormal,
  std,
  studentTQuantile,
} from './mathUtils';

function toNum(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// Convert user-level source column values into exact design-matrix feature vector matching the trained model
export function buildFeatureVectorFromSourceInputs(
  sourceInputs: Record<string, number | string>,
  model: TrainedModelResult,
  cleaned: CleanedDatasetResult
): Record<string, number> {
  const vec: Record<string, number> = {};
  const trainRows = cleaned.provenanceRows.filter((r) => r.split === 'train');

  for (const feat of model.features) {
    const origin = cleaned.featureOriginMap[feat];
    if (!origin) {
      vec[feat] = 0;
      continue;
    }

    // Handle interaction feature A_x_B
    if (feat.includes('_x_')) {
      const [a, b] = feat.split('_x_');
      const va = Number(sourceInputs[a] ?? 0);
      const vb = Number(sourceInputs[b] ?? 0);
      vec[feat] = va * vb;
      continue;
    }

    // Handle polynomial squared
    if (feat.endsWith('_sq')) {
      const src = feat.slice(0, -3);
      const v = Number(sourceInputs[src] ?? 0);
      vec[feat] = v * v;
      continue;
    }

    // Handle semi-log ln_
    if (feat.startsWith('ln_')) {
      const src = origin.sourceColumn;
      const v = Math.max(1e-6, Number(sourceInputs[src] ?? 1));
      vec[feat] = Math.log(v);
      continue;
    }

    // Handle Z-standardized z_
    if (feat.startsWith('z_')) {
      const src = origin.sourceColumn;
      const vals = trainRows.map((r) => toNum(r.cleanedValues[src]) ?? 0);
      const m = mean(vals);
      const s = std(vals, 1) || 1;
      vec[feat] = (Number(sourceInputs[src] ?? m) - m) / s;
      continue;
    }

    // Handle MinMax mm_
    if (feat.startsWith('mm_')) {
      const src = origin.sourceColumn;
      const vals = trainRows.map((r) => toNum(r.cleanedValues[src]) ?? 0);
      const mn = Math.min(...vals);
      const mx = Math.max(...vals);
      vec[feat] = mx > mn ? (Number(sourceInputs[src] ?? mn) - mn) / (mx - mn) : 0;
      continue;
    }

    // Handle One-Hot dummy
    if (origin.transformType.startsWith('One-Hot')) {
      const src = origin.sourceColumn;
      const catSuffix = feat.slice(src.length + 1).replace(/_/g, ' ');
      const userCat = String(sourceInputs[src] ?? '').replace(/_/g, ' ');
      vec[feat] = userCat.toLowerCase() === catSuffix.toLowerCase() ? 1 : 0;
      continue;
    }

    // Direct or ordinal
    const rawVal = sourceInputs[origin.sourceColumn];
    vec[feat] = typeof rawVal === 'number' ? rawVal : Number(rawVal) || 0;
  }

  return vec;
}

export function predictSingleObservation(
  sourceInputs: Record<string, number | string>,
  model: TrainedModelResult,
  cleaned: CleanedDatasetResult
): {
  predictedY: number;
  ci95: [number, number];
  pi95: [number, number];
  sePrediction: number;
  extrapolationWarnings: string[];
} {
  const featVec = buildFeatureVectorFromSourceInputs(sourceInputs, model, cleaned);
  let yHat = model.intercept;
  const xRow = [1];
  const extrapolationWarnings: string[] = [];

  for (const coef of model.coefficients) {
    const val = featVec[coef.feature] ?? 0;
    yHat += coef.estimate * val;
    xRow.push(val);

    const bounds = model.trainFeatureBounds[coef.feature];
    if (bounds && !coef.feature.includes('_')) {
      if (val < bounds.min - 1e-6 || val > bounds.max + 1e-6) {
        extrapolationWarnings.push(
          `"${coef.sourceColumn}" (${val.toFixed(2)}) sale del rango observado en entrenamiento [${bounds.min.toFixed(2)}, ${bounds.max.toFixed(2)}]. Riesgo de extrapolación.`
        );
      }
    }
  }

  const se = model.metrics.standardError;
  const df = Math.max(2, model.metrics.nTrain - model.metrics.pFeatures - 1);
  const tCrit = studentTQuantile(0.975, df);

  let leverage0 = 1 / Math.max(1, model.metrics.nTrain);
  if (model.xtxInverse && model.xtxInverse.length === xRow.length) {
    const tmp = matVecMul(model.xtxInverse, xRow);
    leverage0 = Math.max(0, dot(xRow, tmp));
  }

  const seMean = se * Math.sqrt(leverage0);
  const sePred = se * Math.sqrt(1 + leverage0);

  return {
    predictedY: yHat,
    ci95: [yHat - tCrit * seMean, yHat + tCrit * seMean],
    pi95: [yHat - tCrit * sePred, yHat + tCrit * sePred],
    sePrediction: sePred,
    extrapolationWarnings: Array.from(new Set(extrapolationWarnings)),
  };
}

export function getBaseReferenceInputs(
  dataset: DatasetSummary,
  cleaned: CleanedDatasetResult,
  profiles: VariableSimulationProfile[],
  referenceRowIdx?: number
): Record<string, number | string> {
  const inputs: Record<string, number | string> = {};
  if (referenceRowIdx !== undefined && cleaned.cleanedRows[referenceRowIdx]) {
    const row = cleaned.cleanedRows[referenceRowIdx];
    for (const p of profiles) {
      const v = row[p.column];
      inputs[p.column] = v !== null && v !== undefined ? (typeof v === 'boolean' ? (v ? 1 : 0) : v) : p.historicalStats.median;
    }
    return inputs;
  }

  for (const p of profiles) {
    if (p.categories && p.categories.length > 0) {
      inputs[p.column] = p.categories[0].value;
    } else {
      inputs[p.column] = Number(p.historicalStats.median.toFixed(3));
    }
  }
  return inputs;
}

// Compute favorable direction per variable based on model sign AND business objective (never blindly assume higher = better!)
function getFavorableMultiplier(
  column: string,
  model: TrainedModelResult,
  context: BusinessContext
): number {
  const targetLower = model.coefficients[0] ? context.businessQuestion.toLowerCase() : '';
  const targetColLower = (context.datasetDescription + ' ' + targetLower).toLowerCase();
  const isMinimizeGoal =
    targetColLower.includes('costo') ||
    targetColLower.includes('cost') ||
    targetColLower.includes('churn') ||
    targetColLower.includes('merma') ||
    targetColLower.includes('gasto') ||
    targetColLower.includes('reducir');

  const coefs = model.coefficients.filter((c) => c.sourceColumn === column);
  const avgCoef = coefs.length > 0 ? mean(coefs.map((c) => c.estimate)) : 0;
  const desiredEffect = isMinimizeGoal ? -1 : 1;
  return avgCoef * desiredEffect >= 0 ? 1 : -1;
}

export function generatePresetInputs(
  preset: ScenarioPresetType,
  baseInputs: Record<string, number | string>,
  profiles: VariableSimulationProfile[],
  model: TrainedModelResult,
  context: BusinessContext,
  horizonSteps = 1
): Record<string, number | string> {
  if (preset === 'base') return { ...baseInputs };
  const next: Record<string, number | string> = { ...baseInputs };

  for (const p of profiles) {
    if (p.categories && p.categories.length > 0) {
      next[p.column] = baseInputs[p.column];
      continue;
    }
    const baseVal = Number(baseInputs[p.column] ?? p.historicalStats.median);
    const favDir = getFavorableMultiplier(p.column, model, context);
    const iqrHalf = (p.historicalStats.q3 - p.historicalStats.q1) * 0.5 || p.historicalStats.std * 0.5;
    const trendDelta = (p.historicalStats.trendSlope ?? 0) * horizonSteps;

    let delta = 0;
    if (preset === 'optimista') {
      delta = favDir * iqrHalf * 0.9 + trendDelta;
    } else if (preset === 'conservador') {
      delta = favDir * iqrHalf * 0.35 + trendDelta * 0.5;
    } else if (preset === 'adverso') {
      delta = -favDir * iqrHalf * 0.85;
    }

    let val = Math.max(p.constraints.minAllowed, Math.min(p.constraints.maxAllowed, baseVal + delta));
    // Clamp inside observed historical [min, max] for presets so presets remain strictly plausible without extrapolation!
    val = Math.max(p.historicalStats.min, Math.min(p.historicalStats.max, val));
    if (p.constraints.integerOnly) val = Math.round(val);
    else val = Number(val.toFixed(3));
    next[p.column] = val;
  }

  // Enforce conditional auxiliary dependencies if applicable
  for (const p of profiles) {
    if (
      p.selectedMethod === 'conditional_auxiliary_regression' &&
      p.auxiliaryModel &&
      !p.isControllable
    ) {
      let condVal = p.auxiliaryModel.intercept;
      for (const parent of p.auxiliaryModel.predictors) {
        condVal += (p.auxiliaryModel.betas[parent] ?? 0) * Number(next[parent] ?? 0);
      }
      condVal = Math.max(p.historicalStats.min, Math.min(p.historicalStats.max, condVal));
      next[p.column] = p.constraints.integerOnly ? Math.round(condVal) : Number(condVal.toFixed(3));
    }
  }

  return next;
}

export function runScenarioSimulation(params: {
  name: string;
  type: ScenarioPresetType;
  baseInputs: Record<string, number | string>;
  simulatedInputs: Record<string, number | string>;
  basePredictedY: number;
  profiles: VariableSimulationProfile[];
  model: TrainedModelResult;
  cleaned: CleanedDatasetResult;
  horizonSteps: number;
  nSimulations: number;
  seed: number;
}): ScenarioResult {
  const {
    name,
    type,
    baseInputs,
    simulatedInputs,
    basePredictedY,
    profiles,
    model,
    cleaned,
    horizonSteps,
    nSimulations,
    seed,
  } = params;

  const pred = predictSingleObservation(simulatedInputs, model, cleaned);
  const inputs: ScenarioInputVariable[] = profiles.map((p) => {
    const bv = baseInputs[p.column];
    const sv = simulatedInputs[p.column];
    const isNum = typeof bv === 'number' && typeof sv === 'number';
    const absDelta = isNum ? sv - bv : null;
    const pctDelta = isNum && bv !== 0 ? ((sv - bv) / Math.abs(bv)) * 100 : null;
    const isOutOfRange =
      isNum && (sv < p.historicalStats.min - 1e-6 || sv > p.historicalStats.max + 1e-6);
    const provenance: ScenarioInputVariable['provenance'] =
      type === 'base'
        ? 'Real (Referencia)'
        : p.isControllable || type === 'personalizado'
          ? 'Definido por usuario'
          : 'Simulado';

    return {
      column: p.column,
      baseValue: bv,
      simulatedValue: sv,
      absDelta,
      pctDelta,
      provenance,
      isOutOfRange,
      trainMin: p.historicalStats.min,
      trainMax: p.historicalStats.max,
    };
  });

  // Probabilistic Monte Carlo if requested or probabilistic preset
  let monteCarloDistribution: ScenarioResult['monteCarloDistribution'];
  if (type === 'probabilistico' || nSimulations > 1) {
    const rng = createSeededRng(seed);
    const draws: number[] = [];
    const totalDraws = Math.max(100, Math.min(3000, nSimulations));

    for (let d = 0; d < totalDraws; d++) {
      const simDrawInputs: Record<string, number | string> = { ...simulatedInputs };

      // 1. Sample non-controllable variables respecting their selected simulation model
      for (const p of profiles) {
        if (p.isControllable && type !== 'probabilistico') continue;
        if (p.categories && p.categories.length > 0) {
          let r = rng();
          let chosen = p.categories[0].value;
          for (const c of p.categories) {
            r -= c.probability;
            if (r <= 0) {
              chosen = c.value;
              break;
            }
          }
          simDrawInputs[p.column] = chosen;
          continue;
        }

        const anchor = Number(simulatedInputs[p.column] ?? p.historicalStats.median);
        let drawVal = anchor;
        if (p.selectedMethod === 'conditional_auxiliary_regression' && p.auxiliaryModel) {
          let mu = p.auxiliaryModel.intercept;
          for (const pc of p.auxiliaryModel.predictors) {
            mu += (p.auxiliaryModel.betas[pc] ?? 0) * Number(simDrawInputs[pc] ?? 0);
          }
          drawVal = mu + sampleNormal(rng, 0, p.auxiliaryModel.residualStd);
        } else if (p.selectedMethod === 'parametric_lognormal' && p.historicalStats.min > 0) {
          const sigmaLog = Math.min(0.6, p.historicalStats.std / Math.max(1e-6, p.historicalStats.mean));
          drawVal = anchor * Math.exp(sampleNormal(rng, -0.5 * sigmaLog * sigmaLog, sigmaLog * 0.5));
        } else if (p.selectedMethod === 'empirical_bootstrap') {
          const spread = (p.historicalStats.q3 - p.historicalStats.q1) * 0.4;
          drawVal = anchor + (rng() - 0.5) * 2 * spread;
        } else {
          const noiseScale = p.isControllable ? p.historicalStats.std * 0.2 : p.historicalStats.std * 0.45;
          drawVal = sampleNormal(rng, anchor, noiseScale);
        }
        drawVal = Math.max(p.constraints.minAllowed, Math.min(p.constraints.maxAllowed, drawVal));
        if (p.constraints.integerOnly) drawVal = Math.round(drawVal);
        simDrawInputs[p.column] = drawVal;
      }

      const drawPred = predictSingleObservation(simDrawInputs, model, cleaned);
      // Incorporate model predictive residual uncertainty s_e
      const yDraw = drawPred.predictedY + sampleNormal(rng, 0, model.metrics.standardError);
      draws.push(yDraw);
    }

    const sorted = [...draws].sort((a, b) => a - b);
    const minD = sorted[0];
    const maxD = sorted[sorted.length - 1];
    const binsCount = 12;
    const step = (maxD - minD || 1) / binsCount;
    const histogram = Array.from({ length: binsCount }, (_, b) => {
      const start = minD + b * step;
      const end = b === binsCount - 1 ? maxD : minD + (b + 1) * step;
      const count = draws.filter((v) =>
        b === binsCount - 1 ? v >= start && v <= end : v >= start && v < end
      ).length;
      return { label: start.toFixed(1), start, end, count };
    });

    monteCarloDistribution = {
      mean: mean(draws),
      median: quantile(sorted, 0.5, true),
      std: std(draws, 1),
      p5: quantile(sorted, 0.05, true),
      p25: quantile(sorted, 0.25, true),
      p75: quantile(sorted, 0.75, true),
      p95: quantile(sorted, 0.95, true),
      draws,
      histogram,
    };
  }

  const finalPred =
    type === 'probabilistico' && monteCarloDistribution
      ? monteCarloDistribution.mean
      : pred.predictedY;

  const deltaAbs = type === 'base' ? 0 : finalPred - basePredictedY;
  const deltaPct =
    type === 'base' || basePredictedY === 0 ? 0 : (deltaAbs / Math.abs(basePredictedY)) * 100;

  return {
    id: `${type}-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    name,
    type,
    createdAt: new Date().toISOString(),
    horizonSteps,
    nSimulations: type === 'probabilistico' ? Math.max(100, nSimulations) : 1,
    seed,
    inputs,
    predictedY: finalPred,
    deltaVsBaseAbs: deltaAbs,
    deltaVsBasePct: deltaPct,
    confidenceInterval95: pred.ci95,
    predictionInterval95: pred.pi95,
    standardErrorPrediction: pred.sePrediction,
    extrapolationWarnings: pred.extrapolationWarnings,
    economicSummary:
      type === 'base'
        ? `Referencia base estimada en ${finalPred.toFixed(2)} (IC 95% media: [${pred.ci95[0].toFixed(2)}, ${pred.ci95[1].toFixed(2)}]).`
        : `Variación estimada de ${deltaAbs >= 0 ? '+' : ''}${deltaAbs.toFixed(2)} (${deltaPct >= 0 ? '+' : ''}${deltaPct.toFixed(1)}%) frente al escenario base.`,
    monteCarloDistribution,
  };
}
