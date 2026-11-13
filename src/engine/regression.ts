import {
  BusinessContext,
  CleanedDatasetResult,
  CoefficientDetail,
  DiagnosticSummary,
  ModelingSuiteResult,
  RegressionModelFamily,
  ResidualPoint,
  TrainedModelResult,
} from '../types/analytics';
import {
  chiSquarePValue,
  dot,
  excessKurtosis,
  fDistPValue,
  invertMatrix,
  matMul,
  matVecMul,
  mean,
  normalQuantile,
  skewness,
  solveLinearSystem,
  std,
  studentTPValue,
  studentTQuantile,
  transpose,
} from './mathUtils';

function rmse(yTrue: number[], yPred: number[]): number {
  if (yTrue.length === 0) return 0;
  let ss = 0;
  for (let i = 0; i < yTrue.length; i++) ss += (yTrue[i] - yPred[i]) ** 2;
  return Math.sqrt(ss / yTrue.length);
}

function mae(yTrue: number[], yPred: number[]): number {
  if (yTrue.length === 0) return 0;
  let sa = 0;
  for (let i = 0; i < yTrue.length; i++) sa += Math.abs(yTrue[i] - yPred[i]);
  return sa / yTrue.length;
}

function r2Score(yTrue: number[], yPred: number[]): number {
  if (yTrue.length < 2) return 0;
  const m = mean(yTrue);
  let ssTot = 0;
  let ssRes = 0;
  for (let i = 0; i < yTrue.length; i++) {
    ssTot += (yTrue[i] - m) ** 2;
    ssRes += (yTrue[i] - yPred[i]) ** 2;
  }
  return ssTot === 0 ? 0 : 1 - ssRes / ssTot;
}

function buildDesignMatrix(rows: Array<Record<string, number>>, features: string[]): number[][] {
  return rows.map((r) => [1, ...features.map((f) => r[f] ?? 0)]);
}

function fitOLS(
  rows: Array<Record<string, number>>,
  target: string,
  features: string[]
): {
  intercept: number;
  betas: number[];
  xtxInv: number[][];
  se: number;
  betaSE: number[];
  hc3SE: number[];
  fStat: number | null;
  fPVal: number | null;
  diagnostics: DiagnosticSummary;
  residuals: ResidualPoint[];
  vifs: number[];
} | null {
  const n = rows.length;
  const p = features.length;
  if (n <= p + 2 || p === 0) return null;

  const X = buildDesignMatrix(rows, features);
  const y = rows.map((r) => r[target]);
  const Xt = transpose(X);
  const XtX = matMul(Xt, X);
  let xtxInv = invertMatrix(XtX, 0);
  if (!xtxInv) {
    // Fallback tiny numerical jitter only if exact collinearity prevents inversion
    xtxInv = invertMatrix(XtX, 1e-8);
  }
  if (!xtxInv) return null;

  const Xty = matVecMul(Xt, y);
  const params = matVecMul(xtxInv, Xty);
  const intercept = params[0];
  const betas = params.slice(1);
  const yHat = matVecMul(X, params);
  const e = y.map((yi, i) => yi - yHat[i]);

  const df = n - p - 1;
  const sse = e.reduce((acc, ei) => acc + ei * ei, 0);
  const yMean = mean(y);
  const sst = y.reduce((acc, yi) => acc + (yi - yMean) ** 2, 0);
  const ssr = Math.max(0, sst - sse);
  const mse = sse / df;
  const se = Math.sqrt(Math.max(0, mse));

  const betaSE = params.map((_, j) => Math.sqrt(Math.max(0, mse * xtxInv![j][j])));

  // Hat matrix diagonal h_ii = x_i^T (X^T X)^-1 x_i
  const leverages = X.map((xi) => {
    const tmp = matVecMul(xtxInv!, xi);
    return Math.max(0, Math.min(0.999, dot(xi, tmp)));
  });

  // HC3 Heteroskedasticity-Consistent Robust Covariance Matrix: (X^T X)^-1 * meat * (X^T X)^-1
  const k = p + 1;
  const meat = Array.from({ length: k }, () => new Array<number>(k).fill(0));
  for (let i = 0; i < n; i++) {
    const scale = (e[i] / Math.max(0.05, 1 - leverages[i])) ** 2;
    const xi = X[i];
    for (let a = 0; a < k; a++) {
      for (let b = 0; b < k; b++) {
        meat[a][b] += scale * xi[a] * xi[b];
      }
    }
  }
  const hc3Cov = matMul(matMul(xtxInv, meat), xtxInv);
  const hc3SE = params.map((_, j) => Math.sqrt(Math.max(0, hc3Cov[j][j])));

  // F-test
  const fStat = mse > 0 ? (ssr / p) / mse : null;
  const fPVal = fStat !== null ? fDistPValue(fStat, p, df) : null;

  // Breusch-Pagan test: regress e^2 / (sse/n) on X
  const sigma2 = sse / n;
  let bpStat: number | null = null;
  let bpPVal: number | null = null;
  if (sigma2 > 0) {
    const g = e.map((ei) => (ei * ei) / sigma2);
    const Xtg = matVecMul(Xt, g);
    const bpBeta = matVecMul(xtxInv, Xtg);
    const gHat = matVecMul(X, bpBeta);
    const gMean = mean(g);
    const ssRegBP = gHat.reduce((acc, gh) => acc + (gh - gMean) ** 2, 0);
    bpStat = Math.max(0, 0.5 * ssRegBP);
    bpPVal = chiSquarePValue(bpStat, p);
  }
  const hasHeteroskedasticity = bpPVal !== null && bpPVal < 0.05;

  // Durbin-Watson
  let dwNum = 0;
  for (let i = 1; i < n; i++) dwNum += (e[i] - e[i - 1]) ** 2;
  const durbinWatson = sse > 0 ? dwNum / sse : 2;
  const autocorrelationNote =
    durbinWatson < 1.5
      ? 'Posible autocorrelación positiva en residuos (DW < 1.5).'
      : durbinWatson > 2.5
        ? 'Posible autocorrelación negativa en residuos (DW > 2.5).'
        : 'Sin evidencia fuerte de autocorrelación serial (DW ≈ 2.0).';

  // Jarque-Bera Normality
  const skew = skewness(e);
  const kurt = excessKurtosis(e);
  const jbStat = (n / 6) * (skew * skew + (kurt * kurt) / 4);
  const jbPVal = chiSquarePValue(jbStat, 2);
  const residualsNormal = jbPVal >= 0.05;

  // VIF per feature
  const vifs: number[] = features.map((_, j) => {
    if (features.length === 1) return 1;
    const yj = rows.map((r) => r[features[j]]);
    const Xothers = rows.map((r) => [1, ...features.filter((__, idx) => idx !== j).map((f) => r[f])]);
    const XtO = transpose(Xothers);
    const b = solveLinearSystem(matMul(XtO, Xothers), matVecMul(XtO, yj), 1e-8);
    if (!b) return 10;
    const pred = matVecMul(Xothers, b);
    const r2 = Math.max(0, Math.min(0.999, r2Score(yj, pred)));
    return 1 / (1 - r2);
  });
  const maxVif = vifs.length > 0 ? Math.max(...vifs) : 1;

  // Residual points + Cook's Distance
  const sortedStdResIndices = e
    .map((ei, i) => ({ ei: se > 0 ? ei / (se * Math.sqrt(Math.max(0.05, 1 - leverages[i]))) : 0, i }))
    .sort((a, b) => a.ei - b.ei);
  const qTheoByIdx = new Map<number, number>();
  sortedStdResIndices.forEach((item, rank) => {
    const prob = (rank + 0.5) / n;
    qTheoByIdx.set(item.i, normalQuantile(prob));
  });

  const cooksList: number[] = [];
  const influentialIndices: number[] = [];
  const residuals: ResidualPoint[] = rows.map((_, i) => {
    const h = leverages[i];
    const stdR = se > 0 ? e[i] / (se * Math.sqrt(Math.max(0.05, 1 - h))) : 0;
    const cooksD =
      mse > 0 ? ((e[i] * e[i]) / ((p + 1) * mse)) * (h / Math.max(1e-6, (1 - h) ** 2)) : 0;
    cooksList.push(cooksD);
    if (cooksD > 4 / n) influentialIndices.push(i);
    return {
      index: i,
      split: 'train',
      actual: y[i],
      predicted: yHat[i],
      residual: e[i],
      standardizedResidual: stdR,
      leverage: h,
      cooksD,
      theoreticalQuantile: qTheoByIdx.get(i) ?? 0,
    };
  });

  const maxCooksD = cooksList.length > 0 ? Math.max(...cooksList) : 0;

  return {
    intercept,
    betas,
    xtxInv,
    se,
    betaSE,
    hc3SE,
    fStat,
    fPVal,
    diagnostics: {
      breuschPaganStat: bpStat,
      breuschPaganPValue: bpPVal,
      hasHeteroskedasticity,
      usedRobustSE: hasHeteroskedasticity,
      durbinWatson,
      autocorrelationNote,
      jarqueBeraStat: jbStat,
      jarqueBeraPValue: jbPVal,
      residualsNormal,
      maxCooksD,
      influentialCount: influentialIndices.length,
      influentialIndices,
      maxVif,
      multicollinearityNote:
        maxVif >= 10
          ? `Multicolinealidad severa (VIF máx = ${maxVif.toFixed(2)}). Los coeficientes OLS pueden ser inestables; compare con Ridge/Elastic Net.`
          : maxVif >= 5
            ? `Multicolinealidad moderada (VIF máx = ${maxVif.toFixed(2)}).`
            : `Multicolinealidad controlada (VIF máx = ${maxVif.toFixed(2)} < 5).`,
    },
    residuals,
    vifs,
  };
}

// Coordinate Descent for Ridge, Lasso, ElasticNet (fit on standardized X, centered y, then rescaled back to original X units!)
function fitRegularized(
  rows: Array<Record<string, number>>,
  target: string,
  features: string[],
  alpha: number,
  l1Ratio: number
): { intercept: number; betas: number[] } {
  const n = rows.length;
  const p = features.length;
  const y = rows.map((r) => r[target]);
  const yMean = mean(y);
  const yc = y.map((v) => v - yMean);

  const xMeans = features.map((f) => mean(rows.map((r) => r[f])));
  const xStds = features.map((f) => std(rows.map((r) => r[f]), 0) || 1);

  const Xs = rows.map((r) => features.map((f, j) => (r[f] - xMeans[j]) / xStds[j]));

  // Precompute column squared norms
  const colSq = features.map((_, j) => {
    let s = 0;
    for (let i = 0; i < n; i++) s += Xs[i][j] ** 2;
    return s;
  });

  const w = new Array<number>(p).fill(0);
  const residuals = [...yc];
  const l1Penalty = n * alpha * l1Ratio;
  const l2Penalty = n * alpha * (1 - l1Ratio);

  const maxIter = 400;
  for (let iter = 0; iter < maxIter; iter++) {
    let maxChange = 0;
    for (let j = 0; j < p; j++) {
      const oldW = w[j];
      // Add back contribution of j
      let rho = 0;
      for (let i = 0; i < n; i++) {
        const rWithoutJ = residuals[i] + Xs[i][j] * oldW;
        rho += Xs[i][j] * rWithoutJ;
      }

      let newW = 0;
      if (rho > l1Penalty) newW = (rho - l1Penalty) / (colSq[j] + l2Penalty);
      else if (rho < -l1Penalty) newW = (rho + l1Penalty) / (colSq[j] + l2Penalty);
      else newW = 0;

      if (newW !== oldW) {
        const diff = newW - oldW;
        for (let i = 0; i < n; i++) {
          residuals[i] -= Xs[i][j] * diff;
        }
        w[j] = newW;
        maxChange = Math.max(maxChange, Math.abs(diff));
      }
    }
    if (maxChange < 1e-6) break;
  }

  // Transform weights back to original scale
  const betas = w.map((wj, j) => wj / xStds[j]);
  let intercept = yMean;
  for (let j = 0; j < p; j++) {
    intercept -= betas[j] * xMeans[j];
  }
  return { intercept, betas };
}

function predictRows(
  rows: Array<Record<string, number>>,
  features: string[],
  intercept: number,
  betas: number[]
): number[] {
  return rows.map((r) => {
    let y = intercept;
    for (let j = 0; j < features.length; j++) {
      y += betas[j] * (r[features[j]] ?? 0);
    }
    return y;
  });
}

function buildCeterisParibusInterpretation(
  feat: string,
  unit: string,
  target: string,
  targetUnit: string,
  coef: number,
  isLogX: boolean
): string {
  const dir = coef >= 0 ? 'un incremento promedio' : 'una disminución promedio';
  const mag = Math.abs(coef);
  if (isLogX) {
    const pctEffect = coef * 0.01;
    return `Un aumento de 1% en ${feat} se asocia con ${dir} de ${Math.abs(pctEffect).toFixed(4)} (${targetUnit}) en ${target}, manteniendo constantes las demás variables (ceteris paribus).`;
  }
  return `Si ${feat} aumenta en 1 unidad (${unit}), el modelo estima ${dir} de ${mag.toFixed(4)} (${targetUnit}) en ${target}, manteniendo constantes las demás variables (ceteris paribus).`;
}

export function trainAndCompareModels(
  cleaned: CleanedDatasetResult,
  selectedSourceColumns: string[],
  context: BusinessContext,
  targetUnit: string,
  chronological: boolean
): ModelingSuiteResult {
  const target = cleaned.config.targetColumn;
  const allRows = cleaned.provenanceRows;

  // Map selected source columns to transformed feature names
  const baseFeatures = cleaned.transformedFeatureNames.filter((fn) => {
    const origin = cleaned.featureOriginMap[fn];
    if (!origin) return false;
    return selectedSourceColumns.includes(origin.sourceColumn);
  });

  const trainData = allRows.filter((r) => r.split === 'train').map((r) => r.transformedValues);
  const valData = allRows.filter((r) => r.split === 'validation').map((r) => r.transformedValues);
  const testData = allRows.filter((r) => r.split === 'test').map((r) => r.transformedValues);

  const effectiveVal = valData.length > 0 ? valData : trainData;
  const effectiveTest = testData.length > 0 ? testData : effectiveVal;

  const yTrain = trainData.map((r) => r[target]);
  const yVal = effectiveVal.map((r) => r[target]);
  const yTest = effectiveTest.map((r) => r[target]);
  const yStd = std(yTrain, 1) || 1;
  const yMean = mean(yTrain);

  const validationStrategy: ModelingSuiteResult['validationStrategy'] = chronological
    ? 'chronological_split'
    : allRows.length < 30
      ? 'kfold_cv'
      : 'train_val_test';

  const smallSampleWarning =
    allRows.length < 30
      ? `Muestra pequeña (n = ${allRows.length}): se recomienda interpretar intervalos amplios y priorizar modelos con pocos parámetros frente a especificaciones complejas.`
      : null;

  // Cross-validation helper on trainData (K=5 or rolling origin if chronological)
  const crossValidate = (
    features: string[],
    fitter: (subTrain: Array<Record<string, number>>) => { intercept: number; betas: number[] } | null
  ): { cvRmse: number; cvR2: number } => {
    const nTr = trainData.length;
    const kFolds = Math.min(5, Math.max(2, Math.floor(nTr / 4)));
    const allTrue: number[] = [];
    const allPred: number[] = [];

    if (chronological && nTr >= 10) {
      // Rolling origin forward validation
      const start = Math.max(features.length + 3, Math.floor(nTr * 0.5));
      for (let split = start; split < nTr; split += Math.max(1, Math.floor((nTr - start) / 4))) {
        const subTr = trainData.slice(0, split);
        const subVa = trainData.slice(split, Math.min(nTr, split + Math.max(1, Math.floor((nTr - start) / 4))));
        if (subVa.length === 0) continue;
        const m = fitter(subTr);
        if (!m) continue;
        const preds = predictRows(subVa, features, m.intercept, m.betas);
        subVa.forEach((row, idx) => {
          allTrue.push(row[target]);
          allPred.push(preds[idx]);
        });
      }
    } else {
      const foldSize = Math.max(1, Math.floor(nTr / kFolds));
      for (let f = 0; f < kFolds; f++) {
        const start = f * foldSize;
        const end = f === kFolds - 1 ? nTr : start + foldSize;
        const subVa = trainData.slice(start, end);
        const subTr = [...trainData.slice(0, start), ...trainData.slice(end)];
        if (subTr.length <= features.length + 2 || subVa.length === 0) continue;
        const m = fitter(subTr);
        if (!m) continue;
        const preds = predictRows(subVa, features, m.intercept, m.betas);
        subVa.forEach((row, idx) => {
          allTrue.push(row[target]);
          allPred.push(preds[idx]);
        });
      }
    }

    if (allTrue.length < 2) {
      const m = fitter(trainData);
      if (!m) return { cvRmse: Infinity, cvR2: -1 };
      const preds = predictRows(effectiveVal, features, m.intercept, m.betas);
      return { cvRmse: rmse(yVal, preds), cvR2: r2Score(yVal, preds) };
    }
    return { cvRmse: rmse(allTrue, allPred), cvR2: r2Score(allTrue, allPred) };
  };

  // Compute train bounds for every possible feature
  const computeBounds = (feats: string[], rowsSrc: Array<Record<string, number>>) => {
    const bounds: TrainedModelResult['trainFeatureBounds'] = {};
    for (const f of feats) {
      const vals = rowsSrc.map((r) => r[f] ?? 0);
      const sorted = [...vals].sort((a, b) => a - b);
      bounds[f] = {
        min: sorted[0] ?? 0,
        max: sorted[sorted.length - 1] ?? 0,
        mean: mean(vals),
        median: sorted[Math.floor(sorted.length / 2)] ?? 0,
        std: std(vals, 1) || 1,
      };
    }
    return bounds;
  };

  const models: TrainedModelResult[] = [];

  const finalizeOLSModel = (
    id: string,
    name: string,
    family: RegressionModelFamily,
    features: string[],
    rowsTr: Array<Record<string, number>>,
    rowsVa: Array<Record<string, number>>,
    rowsTe: Array<Record<string, number>>,
    selectionNotes: string[]
  ): TrainedModelResult | null => {
    const ols = fitOLS(rowsTr, target, features);
    if (!ols) return null;

    const predTr = predictRows(rowsTr, features, ols.intercept, ols.betas);
    const predVa = predictRows(rowsVa, features, ols.intercept, ols.betas);
    const predTe = predictRows(rowsTe, features, ols.intercept, ols.betas);

    const nTr = rowsTr.length;
    const p = features.length;
    const df = Math.max(1, nTr - p - 1);
    const r2Tr = r2Score(rowsTr.map((r) => r[target]), predTr);
    const adjR2 = nTr > p + 1 ? 1 - ((1 - r2Tr) * (nTr - 1)) / df : r2Tr;
    const rmseTr = rmse(rowsTr.map((r) => r[target]), predTr);
    const maeTr = mae(rowsTr.map((r) => r[target]), predTr);
    const r2Va = r2Score(rowsVa.map((r) => r[target]), predVa);
    const rmseVa = rmse(rowsVa.map((r) => r[target]), predVa);
    const maeVa = mae(rowsVa.map((r) => r[target]), predVa);
    const r2Te = r2Score(rowsTe.map((r) => r[target]), predTe);
    const rmseTe = rmse(rowsTe.map((r) => r[target]), predTe);
    const maeTe = mae(rowsTe.map((r) => r[target]), predTe);

    const sse = rmseTr * rmseTr * nTr;
    const aic = nTr * Math.log(Math.max(1e-12, sse / nTr)) + 2 * (p + 1);
    const bic = nTr * Math.log(Math.max(1e-12, sse / nTr)) + Math.log(nTr) * (p + 1);

    const cv = crossValidate(features, (sub) => {
      const f = fitOLS(sub, target, features);
      return f ? { intercept: f.intercept, betas: f.betas } : null;
    });

    const tCrit = studentTQuantile(0.975, df);
    const useRobust = ols.diagnostics.hasHeteroskedasticity;

    const coefficients: CoefficientDetail[] = features.map((f, j) => {
      const origin = cleaned.featureOriginMap[f];
      const unit = origin?.unit ?? 'Unidades';
      const sourceCol = origin?.sourceColumn ?? f;
      const se = useRobust ? ols.hc3SE[j + 1] : ols.betaSE[j + 1];
      const tStat = se > 0 ? ols.betas[j] / se : 0;
      const pVal = studentTPValue(tStat, df);
      const xVals = rowsTr.map((r) => r[f]);
      const xMean = mean(xVals);
      const xStd = std(xVals, 1) || 1;
      const stdBeta = (ols.betas[j] * xStd) / yStd;
      const elasticity = yMean !== 0 ? ols.betas[j] * (xMean / yMean) : null;

      return {
        feature: f,
        sourceColumn: sourceCol,
        unit,
        estimate: ols.betas[j],
        stdError: ols.betaSE[j + 1],
        robustStdError: ols.hc3SE[j + 1],
        tStat,
        pValue: studentTPValue(ols.betaSE[j + 1] > 0 ? ols.betas[j] / ols.betaSE[j + 1] : 0, df),
        robustPValue: pVal,
        ciLower95: ols.betas[j] - tCrit * se,
        ciUpper95: ols.betas[j] + tCrit * se,
        standardizedBeta: stdBeta,
        vif: ols.vifs[j] ?? 1,
        isSignificant05: pVal < 0.05,
        inferenceValid: true,
        elasticityAtMean: elasticity,
        ceterisParibusText: buildCeterisParibusInterpretation(
          f,
          unit,
          target,
          targetUnit,
          ols.betas[j],
          f.startsWith('ln_')
        ),
      };
    });

    const eqTerms = features.map((f, j) => {
      const b = ols.betas[j];
      return `${b >= 0 ? '+' : '-'} ${Math.abs(b).toFixed(4)}·(${f})`;
    });
    const equationString = `${target} = ${ols.intercept.toFixed(4)} ${eqTerms.join(' ')}`;

    return {
      id,
      name,
      family,
      purpose: 'Inferencia y explicación',
      supportsInference: true,
      features,
      hyperparams: {},
      intercept: ols.intercept,
      coefficients,
      metrics: {
        nTrain: nTr,
        nVal: rowsVa.length,
        nTest: rowsTe.length,
        pFeatures: p,
        r2Train: r2Tr,
        adjR2Train: adjR2,
        rmseTrain: rmseTr,
        maeTrain: maeTr,
        standardError: ols.se,
        fStatistic: ols.fStat,
        fPValue: ols.fPVal,
        r2Val: r2Va,
        rmseVal: rmseVa,
        maeVal: maeVa,
        r2Test: r2Te,
        rmseTest: rmseTe,
        maeTest: maeTe,
        aic,
        bic,
        cvRmse: cv.cvRmse,
        cvR2: cv.cvR2,
      },
      diagnostics: ols.diagnostics,
      residuals: ols.residuals,
      multiCriteriaScore: 0,
      selectionNotes,
      tradeoffExplanation: useRobust
        ? 'Se detectó heterocedasticidad (Breusch-Pagan p < 0.05), por lo que se aplicaron errores estándar robustos HC3 para inferencia válida.'
        : 'Cumple inferencia paramétrica OLS clásica con errores estándar exactos, prueba F e intervalos de confianza.',
      isRecommended: false,
      xtxInverse: ols.xtxInv,
      trainFeatureBounds: computeBounds(features, rowsTr),
      equationString,
    };
  };

  // 1. OLS Full
  if (baseFeatures.length >= 1) {
    const m1 = finalizeOLSModel(
      'ols_full',
      'Regresión Múltiple OLS (Modelo Completo)',
      'ols_full',
      baseFeatures,
      trainData,
      effectiveVal,
      effectiveTest,
      ['Incluye todas las variables seleccionadas para inferencia completa (prueba t, prueba F, CR²).']
    );
    if (m1) models.push(m1);
  }

  // 2. OLS Parsimonious (Backward BIC selection on train)
  if (baseFeatures.length >= 2) {
    let currentFeats = [...baseFeatures];
    let bestFeats = [...currentFeats];
    let bestBic = Infinity;
    while (currentFeats.length >= 1) {
      const ols = fitOLS(trainData, target, currentFeats);
      if (!ols) break;
      const pred = predictRows(trainData, currentFeats, ols.intercept, ols.betas);
      const nTr = trainData.length;
      const sse = pred.reduce((acc, yp, i) => acc + (yTrain[i] - yp) ** 2, 0);
      const bic = nTr * Math.log(Math.max(1e-12, sse / nTr)) + Math.log(nTr) * (currentFeats.length + 1);
      if (bic < bestBic) {
        bestBic = bic;
        bestFeats = [...currentFeats];
      }
      if (currentFeats.length === 1) break;
      // Drop least significant (largest p-value)
      const df = Math.max(1, nTr - currentFeats.length - 1);
      let worstIdx = 0;
      let worstP = -1;
      currentFeats.forEach((_, j) => {
        const se = ols.betaSE[j + 1] || 1;
        const pVal = studentTPValue(ols.betas[j] / se, df);
        if (pVal > worstP) {
          worstP = pVal;
          worstIdx = j;
        }
      });
      currentFeats = currentFeats.filter((_, idx) => idx !== worstIdx);
    }

    if (bestFeats.length > 0 && bestFeats.length < baseFeatures.length) {
      const m2 = finalizeOLSModel(
        'ols_parsimonious',
        `OLS Parsimonioso (Subconjunto BIC · ${bestFeats.length} vars)`,
        'ols_parsimonious',
        bestFeats,
        trainData,
        effectiveVal,
        effectiveTest,
        ['Eliminación secuencial guiada por criterio BIC en entrenamiento para reducir varianza y sobreajuste.']
      );
      if (m2) models.push(m2);
    }
  }

  // 3. OLS with Interaction (top 2 continuous features)
  const continuousBase = baseFeatures.filter((f) => !f.includes('_'));
  if (continuousBase.length >= 2 && trainData.length >= baseFeatures.length + 5) {
    const fA = continuousBase[0];
    const fB = continuousBase[1];
    const interName = `${fA}_x_${fB}`;
    const addInteraction = (rowsSrc: Array<Record<string, number>>) =>
      rowsSrc.map((r) => ({ ...r, [interName]: (r[fA] ?? 0) * (r[fB] ?? 0) }));
    cleaned.featureOriginMap[interName] = {
      sourceColumn: `${fA} × ${fB}`,
      transformType: 'Interacción',
      unit: 'Producto',
    };
    const m3 = finalizeOLSModel(
      'ols_interactions',
      `OLS con Interacción (${fA} × ${fB})`,
      'ols_interactions',
      [...baseFeatures, interName],
      addInteraction(trainData),
      addInteraction(effectiveVal),
      addInteraction(effectiveTest),
      [`Evalúa efecto sinérgico o moderador entre ${fA} y ${fB}.`]
    );
    if (m3) models.push(m3);
  }

  // 4. OLS with Log Transformation on positive numeric features
  const logCandidate = baseFeatures.find((f) => trainData.every((r) => (r[f] ?? 0) > 0));
  if (logCandidate && trainData.length >= baseFeatures.length + 4) {
    const logName = `ln_${logCandidate}`;
    const logFeats = baseFeatures.map((f) => (f === logCandidate ? logName : f));
    const addLog = (rowsSrc: Array<Record<string, number>>) =>
      rowsSrc.map((r) => ({ ...r, [logName]: Math.log(Math.max(1e-6, r[logCandidate] ?? 1)) }));
    cleaned.featureOriginMap[logName] = {
      sourceColumn: logCandidate,
      transformType: 'Logaritmo natural',
      unit: 'Log(%)',
    };
    const m4 = finalizeOLSModel(
      'ols_transformed',
      `OLS Semi-Log (${logName})`,
      'ols_transformed',
      logFeats,
      addLog(trainData),
      addLog(effectiveVal),
      addLog(effectiveTest),
      [`Captura rendimientos marginales decrecientes en "${logCandidate}" mediante transformación logarítmica.`]
    );
    if (m4) models.push(m4);
  }

  // Regularized models helper (Ridge, Lasso, Elastic Net)
  const buildRegularizedModel = (
    id: string,
    name: string,
    family: RegressionModelFamily,
    l1Ratio: number
  ): TrainedModelResult | null => {
    if (baseFeatures.length < 1 || trainData.length < 6) return null;
    // Tune alpha exclusively via CV on trainData (never touch testData!)
    const candidateAlphas = [0.001, 0.01, 0.05, 0.1, 0.5, 1.0, 5.0, 15.0];
    let bestAlpha = 0.1;
    let bestCvRmse = Infinity;
    for (const a of candidateAlphas) {
      const cv = crossValidate(baseFeatures, (sub) => fitRegularized(sub, target, baseFeatures, a, l1Ratio));
      if (cv.cvRmse < bestCvRmse) {
        bestCvRmse = cv.cvRmse;
        bestAlpha = a;
      }
    }

    const fitted = fitRegularized(trainData, target, baseFeatures, bestAlpha, l1Ratio);
    const predTr = predictRows(trainData, baseFeatures, fitted.intercept, fitted.betas);
    const predVa = predictRows(effectiveVal, baseFeatures, fitted.intercept, fitted.betas);
    const predTe = predictRows(effectiveTest, baseFeatures, fitted.intercept, fitted.betas);

    const nTr = trainData.length;
    const activeP = Math.max(1, fitted.betas.filter((b) => Math.abs(b) > 1e-7).length);
    const df = Math.max(1, nTr - activeP - 1);
    const r2Tr = r2Score(yTrain, predTr);
    const adjR2 = nTr > activeP + 1 ? 1 - ((1 - r2Tr) * (nTr - 1)) / df : r2Tr;
    const rmseTr = rmse(yTrain, predTr);
    const maeTr = mae(yTrain, predTr);
    const r2Va = r2Score(yVal, predVa);
    const rmseVa = rmse(yVal, predVa);
    const maeVa = mae(yVal, predVa);
    const r2Te = r2Score(yTest, predTe);
    const rmseTe = rmse(yTest, predTe);
    const maeTe = mae(yTest, predTe);

    const sse = rmseTr * rmseTr * nTr;
    const se = Math.sqrt(sse / df);
    const aic = nTr * Math.log(Math.max(1e-12, sse / nTr)) + 2 * (activeP + 1);
    const bic = nTr * Math.log(Math.max(1e-12, sse / nTr)) + Math.log(nTr) * (activeP + 1);
    const cvFinal = crossValidate(baseFeatures, (sub) =>
      fitRegularized(sub, target, baseFeatures, bestAlpha, l1Ratio)
    );

    const e = yTrain.map((yi, i) => yi - predTr[i]);
    const skew = skewness(e);
    const kurt = excessKurtosis(e);
    const jbStat = (nTr / 6) * (skew * skew + (kurt * kurt) / 4);
    const jbPVal = chiSquarePValue(jbStat, 2);
    let dwNum = 0;
    for (let i = 1; i < nTr; i++) dwNum += (e[i] - e[i - 1]) ** 2;

    const fullOlsVifs = models[0]?.coefficients.map((c) => c.vif ?? 1) ?? baseFeatures.map(() => 1);

    const coefficients: CoefficientDetail[] = baseFeatures.map((f, j) => {
      const origin = cleaned.featureOriginMap[f];
      const unit = origin?.unit ?? 'Unidades';
      const xVals = trainData.map((r) => r[f]);
      const xMean = mean(xVals);
      const xStd = std(xVals, 1) || 1;
      return {
        feature: f,
        sourceColumn: origin?.sourceColumn ?? f,
        unit,
        estimate: fitted.betas[j],
        stdError: null,
        tStat: null,
        pValue: null, // Explicitly null: regularized models do not have valid standard OLS p-values!
        ciLower95: null,
        ciUpper95: null,
        standardizedBeta: (fitted.betas[j] * xStd) / yStd,
        vif: fullOlsVifs[j] ?? 1,
        isSignificant05: null,
        inferenceValid: false,
        elasticityAtMean: yMean !== 0 ? fitted.betas[j] * (xMean / yMean) : null,
        ceterisParibusText: buildCeterisParibusInterpretation(
          f,
          unit,
          target,
          targetUnit,
          fitted.betas[j],
          f.startsWith('ln_')
        ),
      };
    });

    const eqTerms = baseFeatures
      .map((f, j) => ({ f, b: fitted.betas[j] }))
      .filter((item) => Math.abs(item.b) > 1e-8)
      .map((item) => `${item.b >= 0 ? '+' : '-'} ${Math.abs(item.b).toFixed(4)}·(${item.f})`);

    const residuals: ResidualPoint[] = trainData.map((_, i) => ({
      index: i,
      split: 'train',
      actual: yTrain[i],
      predicted: predTr[i],
      residual: e[i],
      standardizedResidual: se > 0 ? e[i] / se : 0,
      leverage: 0,
      cooksD: 0,
      theoreticalQuantile: normalQuantile((i + 0.5) / nTr),
    }));

    return {
      id,
      name: `${name} (α=${bestAlpha})`,
      family,
      purpose: 'Predicción regularizada',
      supportsInference: false,
      features: baseFeatures,
      hyperparams: { alpha: bestAlpha, l1Ratio },
      intercept: fitted.intercept,
      coefficients,
      metrics: {
        nTrain: nTr,
        nVal: rowsVaCount(effectiveVal),
        nTest: rowsVaCount(effectiveTest),
        pFeatures: activeP,
        r2Train: r2Tr,
        adjR2Train: adjR2,
        rmseTrain: rmseTr,
        maeTrain: maeTr,
        standardError: se,
        fStatistic: null,
        fPValue: null,
        r2Val: r2Va,
        rmseVal: rmseVa,
        maeVal: maeVa,
        r2Test: r2Te,
        rmseTest: rmseTe,
        maeTest: maeTe,
        aic,
        bic,
        cvRmse: cvFinal.cvRmse,
        cvR2: cvFinal.cvR2,
      },
      diagnostics: {
        breuschPaganStat: null,
        breuschPaganPValue: null,
        hasHeteroskedasticity: false,
        usedRobustSE: false,
        durbinWatson: sse > 0 ? dwNum / sse : 2,
        autocorrelationNote: 'Evaluación centrada en error fuera de muestra.',
        jarqueBeraStat: jbStat,
        jarqueBeraPValue: jbPVal,
        residualsNormal: jbPVal >= 0.05,
        maxCooksD: 0,
        influentialCount: 0,
        influentialIndices: [],
        maxVif: Math.max(...fullOlsVifs, 1),
        multicollinearityNote:
          l1Ratio === 0
            ? 'Penalización L2 (Ridge) estabiliza varianza de coeficientes bajo multicolinealidad.'
            : 'Penalización L1/Elastic Net realiza contracción y selección automática de variables.',
      },
      residuals,
      multiCriteriaScore: 0,
      selectionNotes: [
        `Hiperparámetro α = ${bestAlpha} calibrado por validación cruzada interna (sin tocar datos de prueba).`,
        'Modelo optimizado para generalización predictiva; no reporta p-valores paramétricos OLS.',
      ],
      tradeoffExplanation:
        'Sacrifica insesgamiento e inferencia clásica de p-valores a cambio de menor varianza fuera de muestra y estabilidad frente a colinealidad.',
      isRecommended: false,
      trainFeatureBounds: computeBounds(baseFeatures, trainData),
      equationString: `${target} = ${fitted.intercept.toFixed(4)} ${eqTerms.join(' ')}`,
    };
  };

  function rowsVaCount(arr: Array<Record<string, number>>) {
    return arr.length;
  }

  const ridge = buildRegularizedModel('ridge', 'Regresión Ridge (L2)', 'ridge', 0);
  if (ridge) models.push(ridge);

  const lasso = buildRegularizedModel('lasso', 'Regresión Lasso (L1)', 'lasso', 1);
  if (lasso) models.push(lasso);

  const enet = buildRegularizedModel('elastic_net', 'Elastic Net (L1 + L2)', 'elastic_net', 0.5);
  if (enet) models.push(enet);

  // Multi-criteria scoring & ranking (NEVER blindly choosing highest R2!)
  if (models.length > 0) {
    const minValRmse = Math.min(...models.map((m) => m.metrics.rmseVal || 1e-9));
    const minCvRmse = Math.min(...models.map((m) => m.metrics.cvRmse || 1e-9));
    const isInferentialGoal = context.objective === 'explicar';

    for (const m of models) {
      const valRatio = m.metrics.rmseVal > 0 ? minValRmse / m.metrics.rmseVal : 1;
      const cvRatio = m.metrics.cvRmse > 0 ? minCvRmse / m.metrics.cvRmse : 1;
      const adjR2Norm = Math.max(0, Math.min(1, m.metrics.adjR2Train));
      const parsimonyBonus = Math.max(0, 1 - m.metrics.pFeatures / Math.max(1, baseFeatures.length + 3));
      const assumptionScore =
        (m.diagnostics.residualsNormal ? 0.5 : 0.25) +
        (!m.diagnostics.hasHeteroskedasticity || m.diagnostics.usedRobustSE ? 0.5 : 0.2);

      // Weighting adapts cleanly to business goal: inference vs prediction
      const score = isInferentialGoal
        ? 30 * (m.supportsInference ? 1 : 0.35) +
          25 * adjR2Norm +
          20 * valRatio +
          15 * assumptionScore +
          10 * parsimonyBonus
        : 35 * valRatio +
          25 * cvRatio +
          20 * adjR2Norm +
          10 * assumptionScore +
          10 * parsimonyBonus;

      m.multiCriteriaScore = Number(score.toFixed(1));
    }

    models.sort((a, b) => b.multiCriteriaScore - a.multiCriteriaScore);
    models[0].isRecommended = true;
  }

  const bestModel = models[0];
  const bestOls = models.find((m) => m.supportsInference);
  const bestPred = models.find((m) => !m.supportsInference);

  let conflictExplanation =
    'Los criterios de ajuste ajustado (CR²) y error fuera de muestra (RMSE de validación) coinciden en la especificación seleccionada.';
  if (bestOls && bestPred && bestModel) {
    if (bestModel.id === bestPred.id && bestOls.metrics.adjR2Train >= bestPred.metrics.adjR2Train) {
      conflictExplanation = `Se observa un trade-off clásico entre inferencia y predicción: "${bestPred.name}" reduce el RMSE de validación (${bestPred.metrics.rmseVal.toFixed(2)} vs ${bestOls.metrics.rmseVal.toFixed(2)}), mientras "${bestOls.name}" ofrece p-valores e intervalos de confianza exactos para explicar relaciones.`;
    } else if (bestModel.id === bestOls.id && bestPred.metrics.rmseVal < bestOls.metrics.rmseVal) {
      conflictExplanation = `Aunque la regularización obtiene un RMSE marginalmente menor en validación, se priorizó "${bestOls.name}" por su interpretabilidad directa, significancia estadística evaluable y alineación con el objetivo de negocio.`;
    }
  }

  return {
    targetColumn: target,
    targetUnit,
    validationStrategy,
    smallSampleWarning,
    models,
    recommendedModelId: bestModel?.id ?? '',
    conflictExplanation,
  };
}
