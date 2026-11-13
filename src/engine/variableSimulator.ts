import {
  BusinessContext,
  CleanedDatasetResult,
  DatasetSummary,
  EDAResult,
  TrainedModelResult,
  VariableSimulationMethod,
  VariableSimulationProfile,
} from '../types/analytics';
import {
  createSeededRng,
  matMul,
  matVecMul,
  mean,
  median,
  pearsonCorr,
  quantile,
  sampleNormal,
  skewness,
  solveLinearSystem,
  std,
  transpose,
} from './mathUtils';

function toNum(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function methodLabel(method: VariableSimulationMethod): string {
  const labels: Record<VariableSimulationMethod, string> = {
    direct_user_control: 'Control directo del usuario (palanca)',
    conditional_auxiliary_regression: 'Regresión múltiple auxiliar condicional',
    temporal_trend_linear: 'Tendencia temporal lineal (OLS)',
    temporal_trend_poly: 'Tendencia temporal polinomial (grado 2)',
    autoregressive_ar1: 'Modelo autorregresivo AR(1)',
    parametric_normal: 'Distribución paramétrica Normal',
    parametric_lognormal: 'Distribución paramétrica Log-Normal',
    empirical_bootstrap: 'Bootstrap empírico no paramétrico',
    monte_carlo_bounded: 'Simulación Monte Carlo acotada',
    categorical_probability: 'Muestreo categórico por probabilidad empírica',
  };
  return labels[method];
}

export function buildVariableSimulationProfiles(
  dataset: DatasetSummary,
  cleaned: CleanedDatasetResult,
  eda: EDAResult,
  model: TrainedModelResult,
  context: BusinessContext,
  seed = 42
): VariableSimulationProfile[] {
  // Identify unique source columns used by the selected model
  const sourceCols = Array.from(
    new Set(
      model.coefficients
        .map((c) => cleaned.featureOriginMap[c.feature]?.sourceColumn ?? c.sourceColumn)
        .filter((s) => s && !s.includes('×') && dataset.columns.some((col) => col.name === s))
    )
  );

  const rows = cleaned.cleanedRows;
  const hasTemporal = dataset.hasTemporalColumn;
  const profiles: VariableSimulationProfile[] = [];

  // Precompute numeric series for each sourceCol to check acyclic correlations
  const numSeriesMap = new Map<string, number[]>();
  for (const colName of sourceCols) {
    const colProf = dataset.columns.find((c) => c.name === colName);
    if (!colProf) continue;
    if (colProf.selectedType === 'continuous' || colProf.selectedType === 'discrete') {
      const arr = rows.map((r) => toNum(r[colName]) ?? (colProf.median ?? 0));
      numSeriesMap.set(colName, arr);
    }
  }

  // Order columns by variance/controllability to ensure strictly ACYCLIC DAG dependencies (never circular!)
  const orderedCols = [...sourceCols].sort((a, b) => {
    const ctrlA = context.controllableColumns.includes(a) ? 0 : 1;
    const ctrlB = context.controllableColumns.includes(b) ? 0 : 1;
    return ctrlA - ctrlB;
  });

  for (let idx = 0; idx < orderedCols.length; idx++) {
    const colName = orderedCols[idx];
    const colProf = dataset.columns.find((c) => c.name === colName)!;
    const isControllable = context.controllableColumns.includes(colName) || colProf.isControllable;

    const isCategorical =
      colProf.selectedType === 'categorical_nominal' ||
      colProf.selectedType === 'categorical_ordinal' ||
      colProf.selectedType === 'geographic' ||
      colProf.selectedType === 'binary';

    if (isCategorical) {
      const vals = rows.map((r) => String(r[colName] ?? 'N/A'));
      const freq = new Map<string, number>();
      for (const v of vals) freq.set(v, (freq.get(v) ?? 0) + 1);
      const categories = Array.from(freq.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([value, cnt]) => ({ value, probability: cnt / Math.max(1, vals.length) }));

      const recommendedMethod: VariableSimulationMethod = isControllable
        ? 'direct_user_control'
        : 'categorical_probability';

      const rng = createSeededRng(seed + idx * 17);
      const preview = Array.from({ length: 5 }, (_, s) => {
        let r = rng();
        let chosen = categories[0]?.value ?? '';
        for (const cat of categories) {
          r -= cat.probability;
          if (r <= 0) {
            chosen = cat.value;
            break;
          }
        }
        return {
          step: s + 1,
          value: isControllable ? (categories[0]?.value ?? '') : chosen,
          provenance: isControllable ? ('Definido por usuario' as const) : ('Simulado' as const),
        };
      });

      profiles.push({
        column: colName,
        nature: colProf.selectedType,
        isControllable,
        unit: colProf.unit,
        historicalStats: {
          min: 0,
          max: categories.length,
          mean: 0,
          median: 0,
          std: 0,
          q1: 0,
          q3: 0,
          trendSlope: null,
          trendR2: null,
          ar1Phi: null,
          seasonalityStrength: null,
          skewness: 0,
        },
        categories,
        parentDependencies: [],
        recommendedMethod,
        selectedMethod: recommendedMethod,
        alternativesEvaluated: [
          {
            method: 'categorical_probability',
            label: methodLabel('categorical_probability'),
            validationRmse: null,
            fitScore: 90,
            viable: true,
            note: `Muestreo multinomial acorde a ${categories.length} categorías reales observadas.`,
          },
          {
            method: 'direct_user_control',
            label: methodLabel('direct_user_control'),
            validationRmse: null,
            fitScore: isControllable ? 95 : 70,
            viable: true,
            note: 'Selección manual de categoría para escenarios puntuales.',
          },
        ],
        validationEvidence: `Distribución empírica verificada sobre ${vals.length} registros en ${categories.length} categorías.`,
        justification: isControllable
          ? 'Variable categórica definida como controlable; permite fijar escenarios discretos y mantiene frecuencias históricas como respaldo probabilístico.'
          : 'Variable categórica no controlable; se simula respetando las probabilidades empíricas observadas en los datos históricos.',
        constraints: { minAllowed: 0, maxAllowed: 1, integerOnly: false },
        uncertaintyLevel: categories.length > 4 ? 'Media' : 'Baja',
        simulatedSamplePreview: preview,
      });
      continue;
    }

    // Numeric variable characterization (Stage A)
    const series = numSeriesMap.get(colName) ?? rows.map((r) => toNum(r[colName]) ?? 0);
    const n = series.length;
    const sorted = [...series].sort((a, b) => a - b);
    const minVal = sorted[0] ?? 0;
    const maxVal = sorted[sorted.length - 1] ?? 0;
    const m = mean(series);
    const med = median(sorted);
    const s = std(series, 1) || 1e-6;
    const q1 = quantile(sorted, 0.25, true);
    const q3 = quantile(sorted, 0.75, true);
    const skew = skewness(series);

    // Trend OLS on time index t = 0..n-1
    let trendSlope: number | null = null;
    let trendR2: number | null = null;
    let trendValRmse: number | null = null;
    let polyValRmse: number | null = null;
    let ar1Phi: number | null = null;
    let ar1ValRmse: number | null = null;
    let seasonalityStrength: number | null = null;

    if (n >= 8) {
      const splitIdx = Math.max(4, Math.floor(n * 0.75));
      const tTrain = Array.from({ length: splitIdx }, (_, t) => [1, t]);
      const yTrain = series.slice(0, splitIdx);
      const Xt = transpose(tTrain);
      const bLin = solveLinearSystem(matMul(Xt, tTrain), matVecMul(Xt, yTrain), 1e-8);
      if (bLin) {
        trendSlope = bLin[1];
        const preds = series.map((_, t) => bLin[0] + bLin[1] * t);
        const ssTot = series.reduce((a, v) => a + (v - m) ** 2, 0);
        const ssRes = series.reduce((a, v, t) => a + (v - preds[t]) ** 2, 0);
        trendR2 = ssTot > 0 ? Math.max(0, 1 - ssRes / ssTot) : 0;
        const valErrs = series.slice(splitIdx).map((v, k) => v - preds[splitIdx + k]);
        trendValRmse = Math.sqrt(mean(valErrs.map((e) => e * e)));
      }

      // Polynomial degree 2
      const tPoly = Array.from({ length: splitIdx }, (_, t) => [1, t, t * t]);
      const XtP = transpose(tPoly);
      const bPoly = solveLinearSystem(matMul(XtP, tPoly), matVecMul(XtP, yTrain), 1e-6);
      if (bPoly) {
        const valErrs = series.slice(splitIdx).map((v, k) => {
          const t = splitIdx + k;
          return v - (bPoly[0] + bPoly[1] * t + bPoly[2] * t * t);
        });
        polyValRmse = Math.sqrt(mean(valErrs.map((e) => e * e)));
      }

      // AR(1)
      const Xar = Array.from({ length: splitIdx - 1 }, (_, t) => [1, series[t]]);
      const yar = series.slice(1, splitIdx);
      const XtA = transpose(Xar);
      const bAr = solveLinearSystem(matMul(XtA, Xar), matVecMul(XtA, yar), 1e-6);
      if (bAr) {
        ar1Phi = bAr[1];
        const valErrs = series.slice(splitIdx).map((v, k) => {
          const prev = series[splitIdx + k - 1];
          return v - (bAr[0] + bAr[1] * prev);
        });
        ar1ValRmse = Math.sqrt(mean(valErrs.map((e) => e * e)));
      }

      if (hasTemporal && n >= 24) {
        // Lag-12 autocorrelation after detrending
        const detrended = series.map((v, t) => v - (m + (trendSlope ?? 0) * (t - n / 2)));
        seasonalityStrength = Math.abs(pearsonCorr(detrended.slice(0, n - 12), detrended.slice(12)));
      }
    }

    // Check acyclic parent dependencies (strictly earlier columns in orderedCols!)
    const candidateParents = orderedCols.slice(0, idx).filter((pc) => numSeriesMap.has(pc));
    const parentDependencies = candidateParents
      .map((pc) => ({
        column: pc,
        correlation: pearsonCorr(numSeriesMap.get(pc)!, series),
      }))
      .filter((d) => Math.abs(d.correlation) >= 0.45)
      .sort((a, b) => Math.abs(b.correlation) - Math.abs(a.correlation))
      .slice(0, 3);

    // Auxiliary conditional regression if strong parent dependencies exist
    let auxModel: VariableSimulationProfile['auxiliaryModel'];
    let auxValRmse: number | null = null;
    if (parentDependencies.length > 0 && n >= 10) {
      const pCols = parentDependencies.map((d) => d.column);
      const splitIdx = Math.max(pCols.length + 3, Math.floor(n * 0.75));
      const Xtr = Array.from({ length: splitIdx }, (_, i) => [
        1,
        ...pCols.map((pc) => numSeriesMap.get(pc)![i]),
      ]);
      const ytr = series.slice(0, splitIdx);
      const Xt = transpose(Xtr);
      const beta = solveLinearSystem(matMul(Xt, Xtr), matVecMul(Xt, ytr), 1e-6);
      if (beta) {
        const predAll = series.map((_, i) => {
          let y = beta[0];
          pCols.forEach((pc, j) => {
            y += beta[j + 1] * numSeriesMap.get(pc)![i];
          });
          return y;
        });
        const trRes = ytr.map((v, i) => v - predAll[i]);
        const valErrs = series.slice(splitIdx).map((v, i) => v - predAll[splitIdx + i]);
        auxValRmse = valErrs.length > 0 ? Math.sqrt(mean(valErrs.map((e) => e * e))) : std(trRes, 1);
        const ssTot = series.reduce((a, v) => a + (v - m) ** 2, 0);
        const ssRes = series.reduce((a, v, i) => a + (v - predAll[i]) ** 2, 0);
        const auxR2 = ssTot > 0 ? Math.max(0, 1 - ssRes / ssTot) : 0;
        const betasMap: Record<string, number> = {};
        pCols.forEach((pc, j) => (betasMap[pc] = beta[j + 1]));
        auxModel = {
          predictors: pCols,
          intercept: beta[0],
          betas: betasMap,
          residualStd: std(trRes, 1),
          r2: auxR2,
        };
      }
    }

    // Evaluate alternatives (Stage B)
    const alternatives: VariableSimulationProfile['alternativesEvaluated'] = [
      {
        method: 'direct_user_control',
        label: methodLabel('direct_user_control'),
        validationRmse: null,
        fitScore: isControllable ? 96 : 45,
        viable: true,
        note: isControllable
          ? 'Variable definida como palanca directa de decisión empresarial.'
          : 'No controlable directamente; disponible solo para análisis manual hipotético.',
      },
      {
        method: 'conditional_auxiliary_regression',
        label: methodLabel('conditional_auxiliary_regression'),
        validationRmse: auxValRmse,
        fitScore: auxModel ? Math.round(50 + auxModel.r2 * 45) : 20,
        viable: Boolean(auxModel && auxModel.r2 >= 0.25),
        note: auxModel
          ? `Depende acíclicamente de ${auxModel.predictors.join(', ')} (R² aux = ${auxModel.r2.toFixed(2)}).`
          : 'Sin dependencias lineales fuertes respecto a predictores previos.',
      },
      {
        method: 'temporal_trend_linear',
        label: methodLabel('temporal_trend_linear'),
        validationRmse: trendValRmse,
        fitScore: hasTemporal && trendR2 !== null ? Math.round(40 + trendR2 * 55) : 25,
        viable: Boolean(hasTemporal && trendR2 !== null && trendR2 >= 0.3),
        note: hasTemporal
          ? `Tendencia temporal lineal (R² = ${(trendR2 ?? 0).toFixed(2)}).`
          : 'No hay eje temporal declarado en la base.',
      },
      {
        method: 'autoregressive_ar1',
        label: methodLabel('autoregressive_ar1'),
        validationRmse: ar1ValRmse,
        fitScore: hasTemporal && ar1Phi !== null ? Math.round(45 + Math.min(0.95, Math.abs(ar1Phi)) * 45) : 20,
        viable: Boolean(hasTemporal && ar1Phi !== null && Math.abs(ar1Phi) >= 0.35),
        note: hasTemporal
          ? `Inercia temporal AR(1) (φ = ${(ar1Phi ?? 0).toFixed(2)}).`
          : 'Requiere estructura de serie temporal.',
      },
      {
        method: 'parametric_lognormal',
        label: methodLabel('parametric_lognormal'),
        validationRmse: null,
        fitScore: minVal > 0 && skew > 0.75 ? 84 : 40,
        viable: minVal > 0,
        note: minVal > 0 ? `Adecuada para valores positivos sesgados (γ₁ = ${skew.toFixed(2)}).` : 'No aplicable (existen valores ≤ 0).',
      },
      {
        method: 'parametric_normal',
        label: methodLabel('parametric_normal'),
        validationRmse: null,
        fitScore: Math.abs(skew) <= 0.75 ? 82 : 50,
        viable: true,
        note: `Media ${m.toFixed(2)}, Desv. Est. ${s.toFixed(2)}, Asimetría ${skew.toFixed(2)}.`,
      },
      {
        method: 'empirical_bootstrap',
        label: methodLabel('empirical_bootstrap'),
        validationRmse: null,
        fitScore: 78,
        viable: true,
        note: 'Remuestreo directo sin supuestos paramétricos; preserva forma empírica exacta.',
      },
    ];

    if (polyValRmse !== null && hasTemporal) {
      alternatives.push({
        method: 'temporal_trend_poly',
        label: methodLabel('temporal_trend_poly'),
        validationRmse: polyValRmse,
        fitScore: polyValRmse < (trendValRmse ?? Infinity) ? 86 : 60,
        viable: true,
        note: 'Captura curvatura temporal (aceleración o desaceleración).',
      });
    }

    // Choose best method automatically
    let recommendedMethod: VariableSimulationMethod = 'empirical_bootstrap';
    let justification = '';
    if (isControllable) {
      recommendedMethod = 'direct_user_control';
      justification = `Identificada como variable controlable por la empresa. El usuario fija su nivel dentro de los límites plausibles [${minVal.toFixed(2)}, ${maxVal.toFixed(2)}], con soporte de Monte Carlo acotado para análisis probabilístico.`;
    } else if (auxModel && auxModel.r2 >= 0.45 && (!hasTemporal || (auxValRmse ?? Infinity) <= (trendValRmse ?? Infinity))) {
      recommendedMethod = 'conditional_auxiliary_regression';
      justification = `Presenta dependencia estadística sólida con ${auxModel.predictors.join(' y ')} (R² auxiliar = ${auxModel.r2.toFixed(2)}). La simulación condicional acíclica evita combinaciones irreales entre predictores.`;
    } else if (hasTemporal && ar1Phi !== null && Math.abs(ar1Phi) >= 0.6 && (ar1ValRmse ?? Infinity) <= (trendValRmse ?? Infinity)) {
      recommendedMethod = 'autoregressive_ar1';
      justification = `Serie temporal con persistencia autorregresiva significativa (φ₁ = ${ar1Phi.toFixed(2)}, RMSE validación = ${(ar1ValRmse ?? 0).toFixed(2)}).`;
    } else if (hasTemporal && trendR2 !== null && trendR2 >= 0.45) {
      recommendedMethod =
        polyValRmse !== null && trendValRmse !== null && polyValRmse < trendValRmse * 0.9
          ? 'temporal_trend_poly'
          : 'temporal_trend_linear';
      justification = `Muestra tendencia temporal consistente (R² = ${trendR2.toFixed(2)}, pendiente = ${(trendSlope ?? 0).toFixed(2)}/periodo).`;
    } else if (minVal > 0 && skew > 0.85) {
      recommendedMethod = 'parametric_lognormal';
      justification = `Distribución positiva con asimetría derecha (γ₁ = ${skew.toFixed(2)}). El muestreo Log-Normal evita generar valores negativos imposibles.`;
    } else if (Math.abs(skew) <= 0.75 && n >= 20) {
      recommendedMethod = 'parametric_normal';
      justification = `Distribución aproximadamente simétrica (γ₁ = ${skew.toFixed(2)}) en torno a μ = ${m.toFixed(2)} y σ = ${s.toFixed(2)}.`;
    } else {
      recommendedMethod = 'empirical_bootstrap';
      justification = `Sin tendencia temporal fuerte ni simetría paramétrica clara; el bootstrap empírico respeta los cuantiles observados [${minVal.toFixed(2)}, ${maxVal.toFixed(2)}].`;
    }

    const cvRatio = m !== 0 ? Math.abs(s / m) : 1;
    const uncertaintyLevel: VariableSimulationProfile['uncertaintyLevel'] =
      isControllable ? 'Baja' : cvRatio < 0.2 ? 'Baja' : cvRatio < 0.5 ? 'Media' : 'Alta';

    const validationEvidence = auxValRmse !== null && recommendedMethod === 'conditional_auxiliary_regression'
      ? `Validación auxiliar fuera de muestra: RMSE = ${auxValRmse.toFixed(2)} (R² = ${auxModel?.r2.toFixed(2)}).`
      : hasTemporal && trendValRmse !== null
        ? `Validación temporal (último 25%): RMSE tendencia = ${trendValRmse.toFixed(2)}${ar1ValRmse !== null ? `, RMSE AR(1) = ${ar1ValRmse.toFixed(2)}` : ''}.`
        : `Rango empírico observado [${minVal.toFixed(2)}, ${maxVal.toFixed(2)}] · Mediana = ${med.toFixed(2)} · IQR = [${q1.toFixed(2)}, ${q3.toFixed(2)}].`;

    const span = maxVal - minVal || Math.abs(m) * 0.2 || 10;
    const minAllowed = minVal >= 0 ? Math.max(0, minVal - 0.15 * span) : minVal - 0.15 * span;
    const maxAllowed = maxVal + 0.2 * span;

    const preview = generateSimulatedSeries(
      {
        method: recommendedMethod,
        series,
        mean: m,
        std: s,
        minVal,
        maxVal,
        minAllowed,
        maxAllowed,
        trendSlope: trendSlope ?? 0,
        ar1Phi: ar1Phi ?? 0.5,
        integerOnly: colProf.selectedType === 'discrete',
        auxModel,
        parentSeriesMap: numSeriesMap,
      },
      5,
      seed + idx * 31
    ).map((val, stepIdx) => ({
      step: stepIdx + 1,
      value: val,
      provenance: isControllable ? ('Definido por usuario' as const) : ('Simulado' as const),
    }));

    profiles.push({
      column: colName,
      nature: colProf.selectedType,
      isControllable,
      unit: colProf.unit,
      historicalStats: {
        min: minVal,
        max: maxVal,
        mean: m,
        median: med,
        std: s,
        q1,
        q3,
        trendSlope,
        trendR2,
        ar1Phi,
        seasonalityStrength,
        skewness: skew,
      },
      parentDependencies,
      recommendedMethod,
      selectedMethod: recommendedMethod,
      alternativesEvaluated: alternatives.sort((a, b) => b.fitScore - a.fitScore),
      validationEvidence,
      justification,
      constraints: {
        minAllowed: Number(minAllowed.toFixed(2)),
        maxAllowed: Number(maxAllowed.toFixed(2)),
        integerOnly: colProf.selectedType === 'discrete',
      },
      uncertaintyLevel,
      auxiliaryModel: auxModel,
      simulatedSamplePreview: preview,
    });
  }

  return profiles;
}

export function generateSimulatedSeries(
  params: {
    method: VariableSimulationMethod;
    series: number[];
    mean: number;
    std: number;
    minVal: number;
    maxVal: number;
    minAllowed: number;
    maxAllowed: number;
    trendSlope: number;
    ar1Phi: number;
    integerOnly: boolean;
    auxModel?: VariableSimulationProfile['auxiliaryModel'];
    parentSeriesMap?: Map<string, number[]>;
  },
  steps: number,
  seed: number
): number[] {
  const rng = createSeededRng(seed);
  const out: number[] = [];
  const n = params.series.length;
  let lastVal = params.series[n - 1] ?? params.mean;

  for (let s = 1; s <= steps; s++) {
    let val = params.mean;
    if (params.method === 'direct_user_control') {
      val = params.mean;
    } else if (params.method === 'temporal_trend_linear' || params.method === 'temporal_trend_poly') {
      val = lastVal + params.trendSlope + sampleNormal(rng, 0, params.std * 0.15);
    } else if (params.method === 'autoregressive_ar1') {
      const next = params.mean + params.ar1Phi * (lastVal - params.mean) + sampleNormal(rng, 0, params.std * Math.sqrt(Math.max(0.05, 1 - params.ar1Phi * params.ar1Phi)));
      val = next;
      lastVal = next;
    } else if (params.method === 'parametric_lognormal' && params.minVal > 0) {
      const logs = params.series.filter((v) => v > 0).map((v) => Math.log(v));
      const lm = mean(logs);
      const ls = std(logs, 1) || 0.2;
      val = Math.exp(sampleNormal(rng, lm, ls));
    } else if (params.method === 'parametric_normal' || params.method === 'monte_carlo_bounded') {
      val = sampleNormal(rng, params.mean, params.std);
    } else if (params.method === 'conditional_auxiliary_regression' && params.auxModel && params.parentSeriesMap) {
      let pred = params.auxModel.intercept;
      for (const pCol of params.auxModel.predictors) {
        const pArr = params.parentSeriesMap.get(pCol);
        const pVal = pArr ? mean(pArr) : 0;
        pred += (params.auxModel.betas[pCol] ?? 0) * pVal;
      }
      val = pred + sampleNormal(rng, 0, params.auxModel.residualStd * 0.5);
    } else {
      // Empirical bootstrap
      const idx = Math.floor(rng() * Math.max(1, n));
      val = params.series[idx] ?? params.mean;
    }

    val = Math.max(params.minAllowed, Math.min(params.maxAllowed, val));
    if (params.integerOnly) val = Math.round(val);
    else val = Number(val.toFixed(3));
    out.push(val);
  }
  return out;
}
