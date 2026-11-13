import {
  ColumnProfile,
  DataRow,
  DatasetSummary,
  QualityAlert,
  VariableNature,
} from '../types/analytics';
import { mean, median, quantile, skewness, excessKurtosis, std } from './mathUtils';

const GEO_HINTS = /^(country|pais|país|city|ciudad|region|región|departamento|estado|state|provincia|territorio|zone|zona|lat|lon|latitude|longitude|municipio|ubicacion|ubicación)$/i;
const ID_HINTS = /(^id$|_id$|^id_|codigo|código|sku|folio|registro|cedula|cédula|nit|lote_id|clave)/i;
const ORDINAL_SETS = [
  ['baja', 'media', 'alta'],
  ['bajo', 'medio', 'alto'],
  ['low', 'medium', 'high'],
  ['pequeño', 'mediano', 'grande'],
  ['malo', 'regular', 'bueno', 'excelente'],
  ['basico', 'intermedio', 'avanzado'],
  ['primaria', 'secundaria', 'universitaria', 'posgrado'],
];

function isDateString(val: unknown): boolean {
  if (typeof val !== 'string') return false;
  const s = val.trim();
  if (s.length < 6 || s.length > 30) return false;
  if (/^\d{4}[-/]\d{1,2}([-/]\d{1,2})?/.test(s)) {
    const t = Date.parse(s);
    return !Number.isNaN(t);
  }
  if (/^\d{1,2}[-/]\d{1,2}[-/]\d{2,4}$/.test(s)) {
    return true;
  }
  return false;
}

function inferUnit(colName: string): string {
  const lower = colName.toLowerCase();
  if (lower.includes('usd') || lower.includes('precio') || lower.includes('venta') || lower.includes('costo') || lower.includes('gnp') || lower.includes('mrr') || lower.includes('arpu') || lower.includes('gasto') || lower.includes('inversion') || lower.includes('pauta')) {
    return 'USD / Moneda';
  }
  if (lower.includes('pct') || lower.includes('rate') || lower.includes('tasa') || lower.includes('churn') || lower.includes('descuento') || lower.includes('merma') || lower.includes('age_spend')) {
    return '%';
  }
  if (lower.includes('hora') || lower.includes('hrs')) return 'Horas';
  if (lower.includes('kwh') || lower.includes('energia')) return 'kWh';
  if (lower.includes('millions') || lower.includes('millones')) return 'Millones';
  if (lower.includes('fecha') || lower.includes('date')) return 'Fecha';
  return 'Unidades';
}

export function profileDataset(
  rows: DataRow[],
  meta: {
    fileName: string;
    fileFormat: string;
    isSampleDataset?: boolean;
    sampleNote?: string;
    controllableHint?: string[];
    previousProfiles?: ColumnProfile[];
  }
): DatasetSummary {
  const rowCount = rows.length;
  const colNames = rowCount > 0 ? Object.keys(rows[0]) : [];
  const columnCount = colNames.length;

  // Duplicate row detection
  const seen = new Set<string>();
  let duplicateCount = 0;
  for (const r of rows) {
    const key = JSON.stringify(colNames.map((c) => r[c] ?? null));
    if (seen.has(key)) duplicateCount++;
    else seen.add(key);
  }

  let totalMissingCells = 0;
  const alerts: QualityAlert[] = [];
  const columns: ColumnProfile[] = [];
  const prevMap = new Map((meta.previousProfiles ?? []).map((p) => [p.name, p]));

  if (duplicateCount > 0) {
    alerts.push({
      id: 'dup-rows',
      severity: 'warning',
      category: 'duplicates',
      title: `${duplicateCount} registros duplicados exactos`,
      description: `Se detectaron ${duplicateCount} filas completamente idénticas en la base cargada.`,
      recommendation: 'Evalúe eliminar duplicados exactos en el Módulo 3 antes del entrenamiento.',
    });
  }

  if (rowCount > 0 && rowCount < 30) {
    alerts.push({
      id: 'small-n',
      severity: 'warning',
      category: 'small_sample',
      title: `Muestra pequeña (n = ${rowCount} registros)`,
      description:
        'Las muestras reducidas incrementan el error estándar, amplían los intervalos de confianza y reducen la potencia estadística de las pruebas t y F.',
      recommendation:
        'Priorice modelos parsimoniosos (pocos predictores) y validación cruzada (K-Fold) en lugar de dividir en particiones grandes.',
    });
  }

  let hasTemporalColumn = false;
  let temporalColumn: string | undefined;

  for (const colName of colNames) {
    const rawVals = rows.map((r) => (r[colName] === undefined || r[colName] === '' ? null : r[colName]));
    const nonNull = rawVals.filter((v) => v !== null) as Array<string | number | boolean>;
    const missingCount = rowCount - nonNull.length;
    totalMissingCells += missingCount;
    const missingPct = rowCount > 0 ? (missingCount / rowCount) * 100 : 0;
    const completenessPct = 100 - missingPct;

    const uniqueSet = new Set(nonNull.map((v) => String(v)));
    const uniqueCount = uniqueSet.size;
    const isConstant = uniqueCount <= 1 && nonNull.length > 0;

    // Classify type
    const numericVals = nonNull
      .map((v) => (typeof v === 'number' ? v : typeof v === 'boolean' ? (v ? 1 : 0) : Number(v)))
      .filter((v) => Number.isFinite(v));
    const isAllNumeric = nonNull.length > 0 && numericVals.length === nonNull.length;
    const isAllDates = nonNull.length > 0 && !isAllNumeric && nonNull.every((v) => isDateString(v));

    let detectedType: VariableNature = 'text';
    if (isConstant) {
      detectedType = 'constant';
    } else if (isAllDates || (/fecha|date|mes|periodo|timestamp/i.test(colName) && !isAllNumeric)) {
      detectedType = 'datetime';
      hasTemporalColumn = true;
      if (!temporalColumn) temporalColumn = colName;
    } else if (uniqueCount === 2 && (isAllNumeric || nonNull.every((v) => typeof v === 'boolean' || /^(si|sí|no|true|false|0|1|yes)$/i.test(String(v))))) {
      detectedType = 'binary';
    } else if (isAllNumeric) {
      const allIntegers = numericVals.every((v) => Number.isInteger(v));
      if (ID_HINTS.test(colName) && uniqueCount >= rowCount * 0.9) {
        detectedType = 'identifier';
      } else if (allIntegers && uniqueCount <= 15 && rowCount >= 20) {
        detectedType = 'discrete';
      } else if (allIntegers && Math.max(...numericVals) - Math.min(...numericVals) <= 50 && uniqueCount <= 25) {
        detectedType = 'discrete';
      } else {
        detectedType = 'continuous';
      }
    } else {
      const lowerCats = Array.from(uniqueSet).map((s) => s.toLowerCase().trim());
      const matchesOrdinal = ORDINAL_SETS.some((ord) => lowerCats.every((c) => ord.includes(c)));
      const avgLen = nonNull.length > 0 ? mean(nonNull.map((v) => String(v).length)) : 0;

      if (GEO_HINTS.test(colName.trim())) {
        detectedType = 'geographic';
      } else if ((ID_HINTS.test(colName) || uniqueCount === rowCount) && uniqueCount >= Math.max(8, rowCount * 0.85) && avgLen < 35) {
        detectedType = 'identifier';
      } else if (matchesOrdinal) {
        detectedType = 'categorical_ordinal';
      } else if (uniqueCount <= Math.max(20, rowCount * 0.45) && avgLen < 40) {
        detectedType = 'categorical_nominal';
      } else {
        detectedType = 'text';
      }
    }

    const prev = prevMap.get(colName);
    const selectedType = prev?.selectedType ?? detectedType;
    const isPotentialIdentifier = selectedType === 'identifier';
    const isPotentialTarget = selectedType === 'continuous' || selectedType === 'discrete';
    const isPotentialPredictor =
      !isConstant &&
      !isPotentialIdentifier &&
      selectedType !== 'text' &&
      selectedType !== 'datetime';

    // Numeric summary
    let numStats: Partial<ColumnProfile> = {};
    if (isAllNumeric && numericVals.length > 0) {
      const sorted = [...numericVals].sort((a, b) => a - b);
      const q1 = quantile(sorted, 0.25, true);
      const q3 = quantile(sorted, 0.75, true);
      const iqr = q3 - q1;
      const m = mean(numericVals);
      const s = std(numericVals, 1);
      const iqrOutlierCount = numericVals.filter((v) => v < q1 - 1.5 * iqr || v > q3 + 1.5 * iqr).length;
      const zOutlierCount = s > 0 ? numericVals.filter((v) => Math.abs((v - m) / s) > 3).length : 0;
      const negativeCount = numericVals.filter((v) => v < 0).length;
      const skew = skewness(numericVals);
      const kurt = excessKurtosis(numericVals);

      numStats = {
        min: sorted[0],
        max: sorted[sorted.length - 1],
        mean: m,
        median: median(sorted),
        std: s,
        q1,
        q3,
        iqr,
        skewness: skew,
        kurtosis: kurt,
        iqrOutlierCount,
        zOutlierCount,
        negativeCount,
      };

      if (iqrOutlierCount > 0) {
        alerts.push({
          id: `outlier-${colName}`,
          severity: zOutlierCount > 0 ? 'warning' : 'info',
          column: colName,
          category: 'outliers',
          title: `${iqrOutlierCount} valores atípicos (IQR) en "${colName}"`,
          description: `Detectados ${iqrOutlierCount} puntos fuera de [Q1-1.5·IQR, Q3+1.5·IQR] (${zOutlierCount} con |Z|>3).`,
          recommendation:
            'No elimine automáticamente valores extremos; revise su influencia mediante Distancia de Cook en el modelado.',
        });
      }

      if (Math.abs(skew) > 1.5) {
        alerts.push({
          id: `skew-${colName}`,
          severity: 'info',
          column: colName,
          category: 'skewness',
          title: `Asimetría pronunciada en "${colName}" (γ₁ = ${skew.toFixed(2)})`,
          description: `La distribución presenta sesgo ${skew > 0 ? 'positivo (cola derecha)' : 'negativo (cola izquierda)'}.`,
          recommendation:
            skew > 0 && sorted[0] >= 0
              ? 'Considere transformación logarítmica log(1+x) o imputación por mediana.'
              : 'Prefiera la mediana frente a la media en caso de imputación.',
        });
      }
    }

    // Top categories & inconsistent casing detection
    let topCategories: ColumnProfile['topCategories'];
    if (!isAllNumeric && nonNull.length > 0 && selectedType !== 'datetime') {
      const freq = new Map<string, number>();
      const lowerMap = new Map<string, Set<string>>();
      for (const v of nonNull) {
        const s = String(v);
        freq.set(s, (freq.get(s) ?? 0) + 1);
        const norm = s.trim().toLowerCase();
        const set = lowerMap.get(norm) ?? new Set<string>();
        set.add(s);
        lowerMap.set(norm, set);
      }
      const inconsistent = Array.from(lowerMap.values()).filter((s) => s.size > 1);
      if (inconsistent.length > 0) {
        alerts.push({
          id: `case-${colName}`,
          severity: 'warning',
          column: colName,
          category: 'inconsistent_categories',
          title: `Categorías con formato inconsistente en "${colName}"`,
          description: `Se encontraron variantes por mayúsculas/espacios (ej. ${Array.from(inconsistent[0]).join(' / ')}).`,
          recommendation: 'Normalice etiquetas en la etapa de limpieza.',
        });
      }
      topCategories = Array.from(freq.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([value, count]) => ({
          value,
          count,
          pct: (count / nonNull.length) * 100,
        }));
    }

    let dateRange: ColumnProfile['dateRange'];
    if (selectedType === 'datetime' && nonNull.length > 0) {
      const timestamps = nonNull.map((v) => ({ raw: String(v), ts: Date.parse(String(v)) })).filter((d) => !Number.isNaN(d.ts));
      if (timestamps.length > 1) {
        let isChrono = true;
        for (let i = 1; i < timestamps.length; i++) {
          if (timestamps[i].ts < timestamps[i - 1].ts) {
            isChrono = false;
            break;
          }
        }
        const sortedTs = [...timestamps].sort((a, b) => a.ts - b.ts);
        dateRange = {
          min: sortedTs[0].raw,
          max: sortedTs[sortedTs.length - 1].raw,
          isChronological: isChrono,
        };
      }
    }

    if (missingCount > 0) {
      alerts.push({
        id: `missing-${colName}`,
        severity: missingPct > 25 ? 'critical' : 'warning',
        column: colName,
        category: 'missing',
        title: `${missingCount} valores ausentes (${missingPct.toFixed(1)}%) en "${colName}"`,
        description: `Completitud de ${completenessPct.toFixed(1)}% sobre ${rowCount} registros.`,
        recommendation:
          selectedType === 'continuous' || selectedType === 'discrete'
            ? 'Aplique imputación por mediana, KNN o método multivariado (si no es variable objetivo).'
            : 'Impute por moda o cree categoría explícita "Ausente".',
      });
    }

    if (isConstant) {
      alerts.push({
        id: `const-${colName}`,
        severity: 'warning',
        column: colName,
        category: 'constant',
        title: `Variable constante "${colName}"`,
        description: 'Presenta un único valor válido en toda la muestra; no aporta varianza explicativa.',
        recommendation: 'Excluya esta variable del modelado de regresión.',
      });
    }

    if (isPotentialIdentifier) {
      alerts.push({
        id: `id-${colName}`,
        severity: 'info',
        column: colName,
        category: 'identifier',
        title: `Posible identificador único "${colName}"`,
        description: `${uniqueCount} valores únicos en ${rowCount} filas.`,
        recommendation: 'Mantener como etiqueta de referencia; no utilizar como predictor ni imputar.',
      });
    }

    columns.push({
      name: colName,
      detectedType,
      selectedType,
      unit: prev?.unit ?? inferUnit(colName),
      description: prev?.description ?? `Variable ${selectedType.replace('_', ' ')} de la base analizada.`,
      totalCount: rowCount,
      missingCount,
      missingPct,
      uniqueCount,
      completenessPct,
      isConstant,
      isPotentialIdentifier,
      isPotentialTarget,
      isPotentialPredictor,
      isControllable: prev?.isControllable ?? Boolean(meta.controllableHint?.includes(colName)),
      ...numStats,
      topCategories,
      sampleValues: rawVals.slice(0, 5),
      dateRange,
    });
  }

  const totalCells = rowCount * columnCount;
  const completenessPct = totalCells > 0 ? ((totalCells - totalMissingCells) / totalCells) * 100 : 0;

  const numericPredictorsCount = columns.filter(
    (c) => (c.selectedType === 'continuous' || c.selectedType === 'discrete') && !c.isConstant && !c.isPotentialIdentifier
  ).length;

  let suitabilityStatus: DatasetSummary['suitabilityStatus'] = 'apt';
  let suitabilityMessage =
    'La base cumple condiciones estructurales adecuadas para análisis exploratorio y regresión lineal múltiple.';

  if (rowCount < 8 || numericPredictorsCount < 2) {
    suitabilityStatus = 'unsuitable';
    suitabilityMessage =
      rowCount < 8
        ? `Muestra insuficiente (${rowCount} registros). Se requieren al menos 8–10 observaciones por cada predictor o al menos 10 filas para estimar grados de libertad en OLS.`
        : 'No hay suficientes variables cuantitativas (al menos 1 dependiente Y y 1 o más predictoras X) para construir una regresión múltiple.';
  } else if (rowCount < 30 || completenessPct < 85 || alerts.some((a) => a.severity === 'critical')) {
    suitabilityStatus = 'apt_with_warnings';
    suitabilityMessage =
      'Apta con advertencias metodológicas: revise valores ausentes, tamaño muestral o posibles variables no estructuradas antes de modelar.';
  }

  return {
    fileName: meta.fileName,
    fileFormat: meta.fileFormat,
    loadedAt: new Date().toISOString(),
    isSampleDataset: Boolean(meta.isSampleDataset),
    sampleNote: meta.sampleNote,
    rowCount,
    columnCount,
    duplicateCount,
    totalMissingCells,
    completenessPct,
    hasTemporalColumn,
    temporalColumn,
    suitabilityStatus,
    suitabilityMessage,
    columns,
    rawRows: rows,
    alerts,
  };
}
