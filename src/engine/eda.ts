import {
  CleanedDatasetResult,
  CorrelationPair,
  DatasetSummary,
  EDAResult,
  VIFEntry,
} from '../types/analytics';
import {
  cramersV,
  etaSquared,
  kendallTau,
  matMul,
  mean,
  median,
  pearsonCorr,
  quantile,
  solveLinearSystem,
  spearmanCorr,
  skewness,
  std,
  studentTPValue,
  transpose,
} from './mathUtils';

function toNum(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function interpretCorrStrength(absVal: number): CorrelationPair['strength'] {
  if (absVal >= 0.8) return 'Muy fuerte';
  if (absVal >= 0.6) return 'Fuerte';
  if (absVal >= 0.35) return 'Moderada';
  if (absVal >= 0.15) return 'Débil';
  return 'Nula';
}

export function runEDA(dataset: DatasetSummary, cleaned?: CleanedDatasetResult | null): EDAResult {
  const rows = cleaned ? cleaned.cleanedRows : dataset.rawRows;
  const numericCols = dataset.columns.filter(
    (c) => (c.selectedType === 'continuous' || c.selectedType === 'discrete') && !c.isConstant
  );
  const categoricalCols = dataset.columns.filter(
    (c) =>
      (c.selectedType === 'categorical_nominal' ||
        c.selectedType === 'categorical_ordinal' ||
        c.selectedType === 'binary' ||
        c.selectedType === 'geographic') &&
      !c.isConstant
  );

  // 1. Numeric Stats & Histogram bins
  const numericStats: EDAResult['numericStats'] = numericCols.map((col) => {
    const vals = rows.map((r) => toNum(r[col.name])).filter((v): v is number => v !== null);
    const sorted = [...vals].sort((a, b) => a - b);
    const min = sorted[0] ?? 0;
    const max = sorted[sorted.length - 1] ?? 0;
    const q1 = quantile(sorted, 0.25, true);
    const q3 = quantile(sorted, 0.75, true);
    const iqr = q3 - q1;
    const iqrOutliers = vals.filter((v) => v < q1 - 1.5 * iqr || v > q3 + 1.5 * iqr).length;
    const binCount = Math.min(12, Math.max(5, Math.ceil(Math.sqrt(vals.length))));
    const span = max - min || 1;
    const step = span / binCount;
    const bins = Array.from({ length: binCount }, (_, b) => {
      const start = min + b * step;
      const end = b === binCount - 1 ? max : min + (b + 1) * step;
      const count = vals.filter((v) =>
        b === binCount - 1 ? v >= start && v <= end : v >= start && v < end
      ).length;
      return {
        label: `${start.toFixed(1)}–${end.toFixed(1)}`,
        start,
        end,
        count,
      };
    });

    return {
      column: col.name,
      n: vals.length,
      mean: mean(vals),
      median: median(sorted),
      std: std(vals, 1),
      min,
      q1,
      q3,
      max,
      skewness: skewness(vals),
      iqrOutliers,
      histogramBins: bins,
    };
  });

  // 2. Categorical Stats
  const categoricalStats: EDAResult['categoricalStats'] = categoricalCols.map((col) => {
    const vals = rows
      .map((r) => r[col.name])
      .filter((v) => v !== null && v !== undefined && String(v).trim() !== '')
      .map((v) => String(v));
    const freq = new Map<string, number>();
    for (const v of vals) freq.set(v, (freq.get(v) ?? 0) + 1);
    const categories = Array.from(freq.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([label, count]) => ({
        label,
        count,
        pct: vals.length > 0 ? (count / vals.length) * 100 : 0,
      }));
    return {
      column: col.name,
      n: vals.length,
      uniqueCount: freq.size,
      categories,
    };
  });

  // 3. Adaptive Correlation Matrix across numeric + ordinal + categorical columns
  const analyzableCols = [...numericCols, ...categoricalCols.slice(0, 6)].filter(
    (v, i, arr) => arr.findIndex((x) => x.name === v.name) === i
  );
  const colNames = analyzableCols.map((c) => c.name);
  const m = colNames.length;
  const values: number[][] = Array.from({ length: m }, () => new Array<number>(m).fill(0));
  const methods: string[][] = Array.from({ length: m }, () => new Array<string>(m).fill(''));
  const pairs: CorrelationPair[] = [];

  for (let i = 0; i < m; i++) {
    values[i][i] = 1;
    methods[i][i] = 'Self';
    for (let j = i + 1; j < m; j++) {
      const cA = analyzableCols[i];
      const cB = analyzableCols[j];
      const isNumA = cA.selectedType === 'continuous' || cA.selectedType === 'discrete';
      const isNumB = cB.selectedType === 'continuous' || cB.selectedType === 'discrete';

      let val = 0;
      let method: CorrelationPair['method'] = 'Pearson';
      let pValue: number | undefined;
      let direction: CorrelationPair['direction'] = 'Asociación nominal';

      if (isNumA && isNumB) {
        const paired: Array<[number, number]> = [];
        for (const r of rows) {
          const a = toNum(r[cA.name]);
          const b = toNum(r[cB.name]);
          if (a !== null && b !== null) paired.push([a, b]);
        }
        const xs = paired.map((p) => p[0]);
        const ys = paired.map((p) => p[1]);
        const skewed = Math.abs(cA.skewness ?? 0) > 1.2 || Math.abs(cB.skewness ?? 0) > 1.2;
        if (paired.length < 15 && skewed) {
          method = 'Kendall';
          val = kendallTau(xs, ys);
        } else if (skewed || cA.selectedType === 'discrete' || cB.selectedType === 'discrete') {
          method = 'Spearman';
          val = spearmanCorr(xs, ys);
        } else {
          method = 'Pearson';
          val = pearsonCorr(xs, ys);
        }
        if (paired.length > 3 && Math.abs(val) < 0.999999) {
          const tStat = val * Math.sqrt((paired.length - 2) / (1 - val * val));
          pValue = studentTPValue(tStat, paired.length - 2);
        } else if (Math.abs(val) >= 0.999999) {
          pValue = 0;
        }
        direction = val >= 0 ? 'Positiva' : 'Negativa';
      } else if (!isNumA && !isNumB) {
        const pairedA: string[] = [];
        const pairedB: string[] = [];
        for (const r of rows) {
          const a = r[cA.name];
          const b = r[cB.name];
          if (a !== null && a !== undefined && b !== null && b !== undefined) {
            pairedA.push(String(a));
            pairedB.push(String(b));
          }
        }
        method = 'Cramér V';
        val = cramersV(pairedA, pairedB);
        direction = 'Asociación nominal';
      } else {
        const catCol = isNumA ? cB : cA;
        const numCol = isNumA ? cA : cB;
        const cats: string[] = [];
        const nums: number[] = [];
        for (const r of rows) {
          const cv = r[catCol.name];
          const nv = toNum(r[numCol.name]);
          if (cv !== null && cv !== undefined && nv !== null) {
            cats.push(String(cv));
            nums.push(nv);
          }
        }
        method = 'Eta²';
        val = etaSquared(cats, nums);
        direction = 'Asociación nominal';
      }

      values[i][j] = val;
      values[j][i] = val;
      methods[i][j] = method;
      methods[j][i] = method;

      const absValue = Math.abs(val);
      const strength = interpretCorrStrength(absValue);
      pairs.push({
        varA: cA.name,
        varB: cB.name,
        method,
        value: val,
        absValue,
        pValue,
        direction,
        strength,
        interpretation:
          method === 'Cramér V' || method === 'Eta²'
            ? `Asociación ${strength.toLowerCase()} (${method} = ${val.toFixed(3)}) entre ${cA.name} y ${cB.name}. No implica causalidad.`
            : `Relación ${direction.toLowerCase()} ${strength.toLowerCase()} (${method} = ${val.toFixed(3)}) entre ${cA.name} y ${cB.name}. Correlación no implica causalidad.`,
      });
    }
  }

  pairs.sort((a, b) => b.absValue - a.absValue);

  // 4. Compute VIF across numeric predictors
  const vifEntries: VIFEntry[] = [];
  const targetCol = cleaned?.config.targetColumn;
  const vifCols = numericCols
    .filter((c) => c.name !== targetCol && !c.isPotentialIdentifier)
    .map((c) => c.name);

  if (vifCols.length >= 2 && rows.length > vifCols.length + 2) {
    // Build complete numeric matrix
    const mat: number[][] = [];
    for (const r of rows) {
      const rowVals = vifCols.map((cn) => toNum(r[cn]));
      if (rowVals.every((v) => v !== null)) {
        mat.push(rowVals as number[]);
      }
    }
    if (mat.length > vifCols.length + 2) {
      for (let j = 0; j < vifCols.length; j++) {
        const y = mat.map((row) => row[j]);
        const X = mat.map((row) => [1, ...row.filter((_, idx) => idx !== j)]);
        const Xt = transpose(X);
        const XtX = matMul(Xt, X);
        const Xty = Xt.map((r) => r.reduce((acc, v, idx) => acc + v * y[idx], 0));
        const beta = solveLinearSystem(XtX, Xty, 1e-8);
        let vif = 1;
        if (beta) {
          const yMean = mean(y);
          let ssTot = 0;
          let ssRes = 0;
          for (let i = 0; i < y.length; i++) {
            let yHat = 0;
            for (let k = 0; k < beta.length; k++) yHat += X[i][k] * beta[k];
            ssRes += (y[i] - yHat) ** 2;
            ssTot += (y[i] - yMean) ** 2;
          }
          const r2 = ssTot > 0 ? Math.max(0, Math.min(0.999, 1 - ssRes / ssTot)) : 0;
          vif = 1 / (1 - r2);
        }
        vifEntries.push({
          feature: vifCols[j],
          vif,
          tolerance: 1 / vif,
          severity: vif >= 10 ? 'Severo (>10)' : vif >= 5 ? 'Moderado (5-10)' : 'Bajo (<5)',
        });
      }
    }
  } else if (vifCols.length === 1) {
    vifEntries.push({
      feature: vifCols[0],
      vif: 1,
      tolerance: 1,
      severity: 'Bajo (<5)',
    });
  }

  // 5. Temporal series if applicable
  let temporalSeries: EDAResult['temporalSeries'];
  if (dataset.hasTemporalColumn && dataset.temporalColumn) {
    const tCol = dataset.temporalColumn;
    const points = rows
      .map((r) => {
        const date = String(r[tCol] ?? '');
        const pointValues: Record<string, number> = {};
        for (const nc of numericCols.slice(0, 6)) {
          const v = toNum(r[nc.name]);
          if (v !== null) pointValues[nc.name] = v;
        }
        return { date, ts: Date.parse(date) || 0, pointValues };
      })
      .sort((a, b) => a.ts - b.ts)
      .map(({ date, pointValues }) => ({ date, values: pointValues }));
    temporalSeries = { dateColumn: tCol, points };
  }

  return {
    numericStats,
    categoricalStats,
    correlationMatrix: { columns: colNames, values, methods },
    pairs,
    vifEntries,
    temporalSeries,
  };
}
