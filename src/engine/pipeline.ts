import {
  CleanedDatasetResult,
  CleaningPipelineConfig,
  ColumnCleaningConfig,
  DataProvenanceRow,
  DataRow,
  DatasetSummary,
  PipelineAuditEntry,
} from '../types/analytics';
import {
  createSeededRng,
  matMul,
  mean,
  median,
  quantile,
  solveLinearSystem,
  std,
  transpose,
} from './mathUtils';

function toNum(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'boolean') return v ? 1 : 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function buildDefaultCleaningConfig(
  dataset: DatasetSummary,
  targetColumn: string
): CleaningPipelineConfig {
  const columnConfigs: Record<string, ColumnCleaningConfig> = {};
  const catCol = dataset.columns.find(
    (c) =>
      (c.selectedType === 'categorical_nominal' || c.selectedType === 'categorical_ordinal') &&
      c.missingCount === 0
  )?.name;

  for (const col of dataset.columns) {
    const isTarget = col.name === targetColumn;
    const isNum = col.selectedType === 'continuous' || col.selectedType === 'discrete';
    const isCat =
      col.selectedType === 'categorical_nominal' ||
      col.selectedType === 'categorical_ordinal' ||
      col.selectedType === 'binary' ||
      col.selectedType === 'geographic';

    let imputationMethod: ColumnCleaningConfig['imputationMethod'] = 'none';
    if (!isTarget && !col.isPotentialIdentifier && !col.isConstant && col.missingCount > 0) {
      if (isNum) {
        if (dataset.hasTemporalColumn) imputationMethod = 'temporal_interpolation';
        else if (Math.abs(col.skewness ?? 0) > 1.0) imputationMethod = 'median';
        else if (dataset.rowCount >= 25) imputationMethod = 'knn';
        else imputationMethod = 'median';
      } else if (isCat) {
        imputationMethod = col.missingPct > 10 ? 'explicit_missing' : 'mode';
      }
    }

    let transform: ColumnCleaningConfig['transform'] = 'none';
    if (!isTarget && !col.isPotentialIdentifier && !col.isConstant) {
      if (col.selectedType === 'categorical_nominal' || col.selectedType === 'geographic') {
        transform = 'onehot';
      } else if (col.selectedType === 'categorical_ordinal') {
        transform = 'ordinal';
      }
    }

    columnConfigs[col.name] = {
      column: col.name,
      imputationMethod,
      groupByColumn: catCol,
      outlierStrategy: 'keep_flag',
      transform,
      excludeFromPipeline: col.isConstant || col.isPotentialIdentifier || col.selectedType === 'text',
    };
  }

  return {
    removeDuplicates: dataset.duplicateCount > 0,
    excludeMissingTarget: true,
    targetColumn,
    validationSplitPct: dataset.rowCount < 25 ? 20 : 30,
    chronologicalSplit: dataset.hasTemporalColumn,
    randomSeed: 42,
    interactions: [],
    polynomialColumns: [],
    columnConfigs,
  };
}

export function runCleaningPipeline(
  dataset: DatasetSummary,
  config: CleaningPipelineConfig
): CleanedDatasetResult {
  const auditLog: PipelineAuditEntry[] = [];
  let stepCounter = 1;
  const colProfiles = new Map(dataset.columns.map((c) => [c.name, c]));

  // 1. Optional exact deduplication
  let workingRows = dataset.rawRows.map((r) => ({ ...r }));
  let duplicatesRemovedCount = 0;
  if (config.removeDuplicates) {
    const seen = new Set<string>();
    const deduped: DataRow[] = [];
    const keys = dataset.columns.map((c) => c.name);
    for (const row of workingRows) {
      const sig = JSON.stringify(keys.map((k) => row[k] ?? null));
      if (seen.has(sig)) duplicatesRemovedCount++;
      else {
        seen.add(sig);
        deduped.push(row);
      }
    }
    workingRows = deduped;
    if (duplicatesRemovedCount > 0) {
      auditLog.push({
        step: stepCounter++,
        stage: 'duplicados',
        column: 'Base completa',
        action: 'Eliminación de registros duplicados exactos',
        details: `Se removieron ${duplicatesRemovedCount} filas idénticas para evitar sesgo de ponderación.`,
        affectedRows: duplicatesRemovedCount,
      });
    }
  }

  // 2. Target missingness rule: NEVER impute Y with predictions; exclude missing Y rows
  let excludedTargetMissingCount = 0;
  if (config.excludeMissingTarget && config.targetColumn) {
    const filtered: DataRow[] = [];
    for (const r of workingRows) {
      const yVal = toNum(r[config.targetColumn]);
      if (yVal === null) excludedTargetMissingCount++;
      else filtered.push(r);
    }
    workingRows = filtered;
    if (excludedTargetMissingCount > 0) {
      auditLog.push({
        step: stepCounter++,
        stage: 'objetivo',
        column: config.targetColumn,
        action: 'Exclusión de observaciones sin variable objetivo (Y)',
        details: `Se excluyeron ${excludedTargetMissingCount} registros con Y ausente. Regla metodológica: nunca imputar Y con predicciones.`,
        affectedRows: excludedTargetMissingCount,
      });
    }
  }

  // 3. Split BEFORE fitting imputers / scalers / encoders (strict leakage prevention!)
  const n = workingRows.length;
  const indices = Array.from({ length: n }, (_, i) => i);
  if (config.chronologicalSplit && dataset.temporalColumn) {
    const tCol = dataset.temporalColumn;
    indices.sort((a, b) => {
      const ta = Date.parse(String(workingRows[a][tCol] ?? '')) || a;
      const tb = Date.parse(String(workingRows[b][tCol] ?? '')) || b;
      return ta - tb;
    });
  } else {
    const rng = createSeededRng(config.randomSeed);
    for (let i = indices.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [indices[i], indices[j]] = [indices[j], indices[i]];
    }
  }

  const holdoutTotal = Math.max(2, Math.round((n * config.validationSplitPct) / 100));
  const valCount = n >= 16 ? Math.max(1, Math.floor(holdoutTotal / 2)) : holdoutTotal;
  const testCount = n >= 16 ? Math.max(1, holdoutTotal - valCount) : 0;
  const trainCount = Math.max(1, n - valCount - testCount);

  const splitByRowIdx = new Map<number, 'train' | 'validation' | 'test'>();
  indices.forEach((origIdx, pos) => {
    if (pos < trainCount) splitByRowIdx.set(origIdx, 'train');
    else if (pos < trainCount + valCount) splitByRowIdx.set(origIdx, 'validation');
    else splitByRowIdx.set(origIdx, 'test');
  });

  const trainIndices = indices.slice(0, trainCount);
  const cleanedRows = workingRows.map((r) => ({ ...r }));
  const imputedColsPerRow = workingRows.map(() => new Set<string>());
  const outlierColsPerRow = workingRows.map(() => new Set<string>());

  const imputationSummary: CleanedDatasetResult['imputationSummary'] = [];
  const outlierDiagnostics: CleanedDatasetResult['outlierDiagnostics'] = [];
  const rngImp = createSeededRng(config.randomSeed + 99);

  // Helper numeric columns for KNN / multivariate imputation (fit strictly on train!)
  const numericColsAll = dataset.columns
    .filter((c) => (c.selectedType === 'continuous' || c.selectedType === 'discrete') && c.name !== config.targetColumn && !c.isPotentialIdentifier && !c.isConstant)
    .map((c) => c.name);

  // Precompute train medians & stds for KNN distance normalization
  const trainColStats = new Map<string, { mean: number; median: number; std: number; q1: number; q3: number; iqr: number }>();
  for (const col of dataset.columns) {
    const vals = trainIndices
      .map((idx) => toNum(workingRows[idx][col.name]))
      .filter((v): v is number => v !== null);
    if (vals.length > 0) {
      const sorted = [...vals].sort((a, b) => a - b);
      const q1 = quantile(sorted, 0.25, true);
      const q3 = quantile(sorted, 0.75, true);
      trainColStats.set(col.name, {
        mean: mean(vals),
        median: median(sorted),
        std: std(vals, 1) || 1,
        q1,
        q3,
        iqr: q3 - q1,
      });
    }
  }

  // 4. Imputation (fit strictly on train!)
  for (const col of dataset.columns) {
    const cfg = config.columnConfigs[col.name];
    if (!cfg || col.name === config.targetColumn || col.isPotentialIdentifier || col.isConstant) continue;

    // Normalize inconsistent category whitespace/case first if categorical
    const isCat =
      col.selectedType === 'categorical_nominal' ||
      col.selectedType === 'categorical_ordinal' ||
      col.selectedType === 'geographic';
    if (isCat) {
      const canonicalMap = new Map<string, string>();
      for (const idx of trainIndices) {
        const val = cleanedRows[idx][col.name];
        if (val !== null && val !== undefined && String(val).trim() !== '') {
          const norm = String(val).trim().toLowerCase();
          if (!canonicalMap.has(norm)) canonicalMap.set(norm, String(val).trim());
        }
      }
      for (let r = 0; r < cleanedRows.length; r++) {
        const val = cleanedRows[r][col.name];
        if (val !== null && val !== undefined && String(val).trim() !== '') {
          const norm = String(val).trim().toLowerCase();
          if (canonicalMap.has(norm)) cleanedRows[r][col.name] = canonicalMap.get(norm)!;
          else cleanedRows[r][col.name] = String(val).trim();
        }
      }
    }

    const missingRowIndices = cleanedRows
      .map((r, i) => ({ val: r[col.name], i }))
      .filter((item) => item.val === null || item.val === undefined || item.val === '')
      .map((item) => item.i);

    if (missingRowIndices.length === 0 || cfg.imputationMethod === 'none') continue;

    let imputedCount = 0;
    const method = cfg.imputationMethod;
    const stats = trainColStats.get(col.name);

    if (method === 'median' || method === 'mean') {
      const fillVal = stats ? (method === 'median' ? stats.median : stats.mean) : 0;
      for (const rIdx of missingRowIndices) {
        cleanedRows[rIdx][col.name] = Number(fillVal.toFixed(4));
        imputedColsPerRow[rIdx].add(col.name);
        imputedCount++;
      }
      imputationSummary.push({
        column: col.name,
        method: method === 'median' ? 'Mediana (ajustada en entrenamiento)' : 'Media (ajustada en entrenamiento)',
        imputedCount,
        justification:
          method === 'median'
            ? 'Robusta frente a asimetría y valores atípicos; estimada exclusivamente sobre partición de entrenamiento.'
            : 'Apropiada para distribución aproximadamente simétrica sin valores extremos influyentes.',
      });
    } else if (method === 'group_median' && cfg.groupByColumn) {
      const grpMap = new Map<string, number[]>();
      for (const tIdx of trainIndices) {
        const g = String(workingRows[tIdx][cfg.groupByColumn] ?? 'Otros');
        const v = toNum(workingRows[tIdx][col.name]);
        if (v !== null) {
          const arr = grpMap.get(g) ?? [];
          arr.push(v);
          grpMap.set(g, arr);
        }
      }
      const globalMed = stats?.median ?? 0;
      for (const rIdx of missingRowIndices) {
        const g = String(cleanedRows[rIdx][cfg.groupByColumn] ?? 'Otros');
        const arr = grpMap.get(g);
        const fillVal = arr && arr.length > 0 ? median(arr) : globalMed;
        cleanedRows[rIdx][col.name] = Number(fillVal.toFixed(4));
        imputedColsPerRow[rIdx].add(col.name);
        imputedCount++;
      }
      imputationSummary.push({
        column: col.name,
        method: `Mediana por grupo (${cfg.groupByColumn})`,
        imputedCount,
        justification: `Preserva heterogeneidad estructural entre segmentos de "${cfg.groupByColumn}".`,
      });
    } else if (method === 'knn') {
      const otherNums = numericColsAll.filter((c) => c !== col.name);
      const trainValid = trainIndices.filter((tIdx) => toNum(workingRows[tIdx][col.name]) !== null);
      const k = Math.min(5, Math.max(1, trainValid.length));
      for (const rIdx of missingRowIndices) {
        if (trainValid.length === 0) break;
        const dists = trainValid.map((tIdx) => {
          let d2 = 0;
          let count = 0;
          for (const oc of otherNums) {
            const v1 = toNum(cleanedRows[rIdx][oc]);
            const v2 = toNum(workingRows[tIdx][oc]);
            const st = trainColStats.get(oc);
            if (v1 !== null && v2 !== null && st) {
              const diff = (v1 - v2) / st.std;
              d2 += diff * diff;
              count++;
            }
          }
          return {
            dist: count > 0 ? Math.sqrt(d2 / count) : 1e6,
            y: toNum(workingRows[tIdx][col.name])!,
          };
        });
        dists.sort((a, b) => a.dist - b.dist);
        const neighbors = dists.slice(0, k);
        const fillVal = mean(neighbors.map((nb) => nb.y));
        cleanedRows[rIdx][col.name] = Number(fillVal.toFixed(4));
        imputedColsPerRow[rIdx].add(col.name);
        imputedCount++;
      }
      imputationSummary.push({
        column: col.name,
        method: `KNN Imputer (k=${k}, distancia estandarizada en train)`,
        imputedCount,
        justification: 'Captura patrones multivariados locales entre observaciones similares sin fuga de información.',
      });
    } else if (method === 'multivariate_ols') {
      const otherNums = numericColsAll.filter((c) => c !== col.name).slice(0, 5);
      const trainValid = trainIndices.filter((tIdx) => toNum(workingRows[tIdx][col.name]) !== null);
      const X: number[][] = [];
      const y: number[] = [];
      for (const tIdx of trainValid) {
        const rowVec = [1];
        for (const oc of otherNums) {
          const val = toNum(workingRows[tIdx][oc]);
          rowVec.push(val ?? (trainColStats.get(oc)?.median ?? 0));
        }
        X.push(rowVec);
        y.push(toNum(workingRows[tIdx][col.name])!);
      }
      let beta: number[] | null = null;
      if (X.length > otherNums.length + 2) {
        const Xt = transpose(X);
        const XtX = matMul(Xt, X);
        const Xty = Xt.map((r) => r.reduce((acc, v, idx) => acc + v * y[idx], 0));
        beta = solveLinearSystem(XtX, Xty, 1e-4);
      }
      for (const rIdx of missingRowIndices) {
        let fillVal = stats?.median ?? 0;
        if (beta) {
          fillVal = beta[0];
          otherNums.forEach((oc, j) => {
            const v = toNum(cleanedRows[rIdx][oc]) ?? (trainColStats.get(oc)?.median ?? 0);
            fillVal += beta![j + 1] * v;
          });
        }
        cleanedRows[rIdx][col.name] = Number(fillVal.toFixed(4));
        imputedColsPerRow[rIdx].add(col.name);
        imputedCount++;
      }
      imputationSummary.push({
        column: col.name,
        method: 'Imputación multivariada OLS auxiliar (train)',
        imputedCount,
        justification: 'Estima valores ausentes en X a partir de covariables disponibles en la partición de entrenamiento.',
      });
    } else if (method === 'temporal_interpolation') {
      // Strictly causal forward-fill / linear interpolation using only prior/known train bounds
      let lastValid = stats?.median ?? 0;
      for (let i = 0; i < cleanedRows.length; i++) {
        const v = toNum(cleanedRows[i][col.name]);
        if (v !== null) {
          lastValid = v;
        } else {
          cleanedRows[i][col.name] = Number(lastValid.toFixed(4));
          imputedColsPerRow[i].add(col.name);
          imputedCount++;
        }
      }
      imputationSummary.push({
        column: col.name,
        method: 'Imputación temporal causal (arrastre histórico)',
        imputedCount,
        justification: 'Respeta el orden cronológico utilizando únicamente observaciones pasadas disponibles.',
      });
    } else if (method === 'mode' || method === 'explicit_missing' || method === 'group_mode' || method === 'probabilistic') {
      const freq = new Map<string, number>();
      for (const tIdx of trainIndices) {
        const val = cleanedRows[tIdx][col.name];
        if (val !== null && val !== undefined && String(val).trim() !== '') {
          const s = String(val);
          freq.set(s, (freq.get(s) ?? 0) + 1);
        }
      }
      const sortedCats = Array.from(freq.entries()).sort((a, b) => b[1] - a[1]);
      const modeVal = sortedCats[0]?.[0] ?? 'Ausente';
      const totalFreq = sortedCats.reduce((acc, e) => acc + e[1], 0);

      for (const rIdx of missingRowIndices) {
        let fillCat = modeVal;
        if (method === 'explicit_missing') {
          fillCat = 'Ausente';
        } else if (method === 'probabilistic' && totalFreq > 0) {
          let r = rngImp() * totalFreq;
          for (const [cat, cnt] of sortedCats) {
            r -= cnt;
            if (r <= 0) {
              fillCat = cat;
              break;
            }
          }
        }
        cleanedRows[rIdx][col.name] = fillCat;
        imputedColsPerRow[rIdx].add(col.name);
        imputedCount++;
      }
      imputationSummary.push({
        column: col.name,
        method:
          method === 'explicit_missing'
            ? 'Categoría explícita "Ausente"'
            : method === 'probabilistic'
              ? 'Muestreo probabilístico empírico (train)'
              : 'Moda (ajustada en train)',
        imputedCount,
        justification:
          method === 'explicit_missing'
            ? 'Preserva la señal informativa de ausencia sin distorsionar categorías existentes.'
            : 'Mantiene la distribución categórica observada en el conjunto de entrenamiento.',
      });
    }

    if (imputedCount > 0) {
      auditLog.push({
        step: stepCounter++,
        stage: 'imputacion',
        column: col.name,
        action: `Imputación (${method})`,
        details: `Se imputaron ${imputedCount} registros con parámetros ajustados exclusivamente en train.`,
        affectedRows: imputedCount,
      });
    }
  }

  // 5. Outlier Diagnostics & Optional Winsorization (thresholds fit strictly on train)
  for (const col of dataset.columns) {
    const cfg = config.columnConfigs[col.name];
    const isNum = col.selectedType === 'continuous' || col.selectedType === 'discrete';
    if (!cfg || !isNum || col.name === config.targetColumn || col.isConstant) continue;
    const st = trainColStats.get(col.name);
    if (!st) continue;

    const lowerFence = st.q1 - 1.5 * st.iqr;
    const upperFence = st.q3 + 1.5 * st.iqr;
    let iqrCount = 0;
    let zCount = 0;

    for (let rIdx = 0; rIdx < cleanedRows.length; rIdx++) {
      const val = toNum(cleanedRows[rIdx][col.name]);
      if (val === null) continue;
      const isIqrOut = val < lowerFence || val > upperFence;
      const isZOut = st.std > 0 && Math.abs((val - st.mean) / st.std) > 3;
      if (isIqrOut) iqrCount++;
      if (isZOut) zCount++;

      if (isIqrOut || isZOut) {
        outlierColsPerRow[rIdx].add(col.name);
        if (cfg.outlierStrategy === 'winsorize_iqr' && isIqrOut) {
          cleanedRows[rIdx][col.name] = Number(Math.max(lowerFence, Math.min(upperFence, val)).toFixed(4));
        }
      }
    }

    if (iqrCount > 0 || zCount > 0) {
      outlierDiagnostics.push({
        column: col.name,
        iqrCount,
        zCount,
        strategyApplied:
          cfg.outlierStrategy === 'winsorize_iqr'
            ? 'Winsorización por límites IQR (train)'
            : 'Conservado y marcado para diagnóstico de Cook',
        actionNote:
          cfg.outlierStrategy === 'winsorize_iqr'
            ? `Valores acotados al rango [${lowerFence.toFixed(2)}, ${upperFence.toFixed(2)}].`
            : 'Se conservan las observaciones reales; se evaluará su influencia en el modelo OLS.',
      });
    }
  }

  // 6. Feature Engineering & Encoding (fit strictly on train!)
  const transformedFeatureNames: string[] = [];
  const featureOriginMap: CleanedDatasetResult['featureOriginMap'] = {};
  const encoders: Array<{
    outputNames: string[];
    sourceCol: string;
    transformType: string;
    compute: (row: DataRow) => Record<string, number>;
  }> = [];

  for (const col of dataset.columns) {
    const cfg = config.columnConfigs[col.name];
    if (!cfg || cfg.excludeFromPipeline || col.name === config.targetColumn || col.selectedType === 'datetime') continue;
    const profile = colProfiles.get(col.name)!;

    if (
      col.selectedType === 'categorical_nominal' ||
      col.selectedType === 'geographic' ||
      col.selectedType === 'binary'
    ) {
      const cats = Array.from(
        new Set(
          trainIndices
            .map((i) => cleanedRows[i][col.name])
            .filter((v) => v !== null && v !== undefined && String(v).trim() !== '')
            .map((v) => String(v))
        )
      ).sort();

      if (cats.length <= 1) continue;
      if (col.selectedType === 'binary' && cats.every((c) => c === '0' || c === '1' || c === 'true' || c === 'false')) {
        const featName = col.name;
        transformedFeatureNames.push(featName);
        featureOriginMap[featName] = { sourceColumn: col.name, transformType: 'Binaria (0/1)', unit: 'Indicador' };
        encoders.push({
          outputNames: [featName],
          sourceCol: col.name,
          transformType: 'binary',
          compute: (row) => {
            const v = String(row[col.name] ?? '').toLowerCase();
            return { [featName]: v === '1' || v === 'true' || v === 'si' || v === 'sí' ? 1 : 0 };
          },
        });
      } else {
        // Drop first category as reference level to avoid multicollinearity (dummy variable trap)
        const refCat = cats[0];
        const dummyCats = cats.slice(1, 12);
        const outNames = dummyCats.map((c) => `${col.name}_${c.replace(/\s+/g, '_')}`);
        outNames.forEach((fn) => {
          transformedFeatureNames.push(fn);
          featureOriginMap[fn] = {
            sourceColumn: col.name,
            transformType: `One-Hot (Ref: ${refCat})`,
            unit: 'Dummy (0/1)',
          };
        });
        encoders.push({
          outputNames: outNames,
          sourceCol: col.name,
          transformType: 'onehot',
          compute: (row) => {
            const res: Record<string, number> = {};
            const val = String(row[col.name] ?? '');
            dummyCats.forEach((c, idx) => {
              res[outNames[idx]] = val === c ? 1 : 0;
            });
            return res;
          },
        });
      }
    } else if (col.selectedType === 'categorical_ordinal') {
      const cats = Array.from(
        new Set(
          trainIndices
            .map((i) => String(cleanedRows[i][col.name] ?? ''))
            .filter((s) => s.length > 0)
        )
      );
      const ordMap = new Map<string, number>();
      const knownOrder = ['baja', 'bajo', 'low', 'media', 'medio', 'medium', 'alta', 'alto', 'high'];
      const ordered = [...cats].sort((a, b) => {
        const ia = knownOrder.indexOf(a.toLowerCase());
        const ib = knownOrder.indexOf(b.toLowerCase());
        if (ia !== -1 && ib !== -1) return ia - ib;
        return a.localeCompare(b);
      });
      ordered.forEach((c, i) => ordMap.set(c, i + 1));
      const featName = `${col.name}_ord`;
      transformedFeatureNames.push(featName);
      featureOriginMap[featName] = { sourceColumn: col.name, transformType: 'Ordinal', unit: 'Nivel ordinal' };
      encoders.push({
        outputNames: [featName],
        sourceCol: col.name,
        transformType: 'ordinal',
        compute: (row) => ({ [featName]: ordMap.get(String(row[col.name] ?? '')) ?? 1 }),
      });
    } else if (col.selectedType === 'continuous' || col.selectedType === 'discrete') {
      const trainVals = trainIndices
        .map((i) => toNum(cleanedRows[i][col.name]))
        .filter((v): v is number => v !== null);
      const m = mean(trainVals);
      const s = std(trainVals, 1) || 1;
      const mn = Math.min(...trainVals);
      const mx = Math.max(...trainVals);

      let featName = col.name;
      if (cfg.transform === 'log1p' && mn >= 0) featName = `ln_${col.name}`;
      else if (cfg.transform === 'standardize') featName = `z_${col.name}`;
      else if (cfg.transform === 'minmax') featName = `mm_${col.name}`;

      transformedFeatureNames.push(featName);
      featureOriginMap[featName] = {
        sourceColumn: col.name,
        transformType:
          cfg.transform === 'none'
            ? 'Escala original'
            : cfg.transform === 'log1p'
              ? 'Logarítmica ln(1+x)'
              : cfg.transform === 'standardize'
                ? 'Estandarización Z'
                : 'Min-Max [0,1]',
        unit: profile.unit,
      };

      encoders.push({
        outputNames: [featName],
        sourceCol: col.name,
        transformType: cfg.transform,
        compute: (row) => {
          const raw = toNum(row[col.name]) ?? m;
          let out = raw;
          if (cfg.transform === 'log1p' && mn >= 0) out = Math.log1p(Math.max(0, raw));
          else if (cfg.transform === 'standardize') out = (raw - m) / s;
          else if (cfg.transform === 'minmax') out = mx > mn ? (raw - mn) / (mx - mn) : 0;
          return { [featName]: Number(out.toFixed(6)) };
        },
      });
    }
  }

  // Interaction terms
  for (const [colA, colB] of config.interactions) {
    const featName = `${colA}_x_${colB}`;
    transformedFeatureNames.push(featName);
    featureOriginMap[featName] = {
      sourceColumn: `${colA} × ${colB}`,
      transformType: 'Interacción multiplicativa',
      unit: 'Producto',
    };
  }

  // Polynomial squared terms
  for (const pCol of config.polynomialColumns) {
    const featName = `${pCol}_sq`;
    transformedFeatureNames.push(featName);
    featureOriginMap[featName] = {
      sourceColumn: pCol,
      transformType: 'Término cuadrático (x²)',
      unit: 'Cuadrático',
    };
  }

  if (encoders.length > 0) {
    auditLog.push({
      step: stepCounter++,
      stage: 'transformacion',
      column: 'Predictores',
      action: `Codificación y escalamiento (${transformedFeatureNames.length} variables de diseño)`,
      details: 'Codificadores one-hot (k-1 niveles), ordinales y escaladores ajustados únicamente sobre entrenamiento.',
      affectedRows: cleanedRows.length,
    });
  }

  // Build provenance rows
  const provenanceRows: DataProvenanceRow[] = cleanedRows.map((cRow, idx) => {
    const transformedValues: Record<string, number> = {};
    for (const enc of encoders) {
      Object.assign(transformedValues, enc.compute(cRow));
    }
    for (const [colA, colB] of config.interactions) {
      const a = toNum(cRow[colA]) ?? 0;
      const b = toNum(cRow[colB]) ?? 0;
      transformedValues[`${colA}_x_${colB}`] = Number((a * b).toFixed(4));
    }
    for (const pCol of config.polynomialColumns) {
      const v = toNum(cRow[pCol]) ?? 0;
      transformedValues[`${pCol}_sq`] = Number((v * v).toFixed(4));
    }
    // Keep target Y in transformedValues for easy modeling lookup
    const yVal = toNum(cRow[config.targetColumn]);
    if (yVal !== null) transformedValues[config.targetColumn] = yVal;

    return {
      rowIndex: idx,
      split: splitByRowIdx.get(idx) ?? 'train',
      rawValues: workingRows[idx],
      cleanedValues: cRow,
      transformedValues,
      imputedColumns: Array.from(imputedColsPerRow[idx]),
      outlierFlaggedColumns: Array.from(outlierColsPerRow[idx]),
    };
  });

  return {
    config,
    trainRowsCount: trainCount,
    valRowsCount: valCount,
    testRowsCount: testCount,
    excludedTargetMissingCount,
    duplicatesRemovedCount,
    cleanedRows,
    transformedFeatureNames,
    featureOriginMap,
    provenanceRows,
    auditLog,
    imputationSummary,
    outlierDiagnostics,
  };
}
