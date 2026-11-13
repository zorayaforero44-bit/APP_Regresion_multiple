import {
  BusinessContext,
  DatasetSummary,
  EDAResult,
  PredictorCandidate,
  PredictorTier,
  TargetCandidate,
  VariableSelectionPlan,
} from '../types/analytics';

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3);
}

function tokenOverlapScore(colName: string, queryTokens: string[]): number {
  const colTokens = tokenize(colName.replace(/_/g, ' '));
  let hits = 0;
  for (const ct of colTokens) {
    if (queryTokens.some((qt) => qt.includes(ct) || ct.includes(qt))) hits++;
  }
  return hits;
}

const TARGET_KEYWORDS = [
  'venta', 'sales', 'ingreso', 'revenue', 'mrr', 'recaudo', 'costo', 'cost',
  'rentabilidad', 'profit', 'margen', 'margin', 'demanda', 'demand', 'productividad',
  'precio', 'capita', 'retorno', 'roi', 'conversion', 'produccion',
];

const LEAKAGE_HINTS = /(post|futuro|future|target|resultado_final|cierre|liquidado|total_factura_final)/i;

export function buildVariableSelectionPlan(
  dataset: DatasetSummary,
  context: BusinessContext,
  eda: EDAResult,
  preferredTarget?: string
): VariableSelectionPlan {
  const queryTokens = tokenize(
    `${context.businessQuestion} ${context.datasetDescription} ${context.activity} ${context.sector}`
  );

  // 1. Rank Target Candidates (Y)
  const targetCandidates: TargetCandidate[] = dataset.columns
    .filter((c) => !c.isConstant && !c.isPotentialIdentifier)
    .map((c) => {
      const isNum = c.selectedType === 'continuous' || c.selectedType === 'discrete';
      const overlap = tokenOverlapScore(c.name, queryTokens);
      const hasTargetKw = TARGET_KEYWORDS.some((kw) => c.name.toLowerCase().includes(kw));
      let score = isNum ? 50 : 10;
      score += overlap * 18;
      if (hasTargetKw) score += 20;
      if (c.missingPct > 20) score -= 25;
      if (c.selectedType === 'continuous') score += 10;

      const warnings: string[] = [];
      if (!isNum) warnings.push('Variable no cuantitativa: no es apta para regresión lineal OLS estándar.');
      if (c.missingPct > 0) warnings.push(`Presenta ${c.missingCount} valores ausentes (${c.missingPct.toFixed(1)}%).`);
      if (c.isControllable) warnings.push('Marcada como variable controlable: usualmente las palancas operativas son X y no Y.');

      const statisticalViability: TargetCandidate['statisticalViability'] =
        isNum && c.missingPct <= 10 ? 'Alta' : isNum ? 'Media' : 'Baja';

      const businessJustification =
        overlap > 0 || hasTargetKw
          ? `Alineada con la pregunta de negocio ("${context.businessQuestion.slice(0, 80)}...") y con variabilidad cuantitativa adecuada.`
          : isNum
            ? 'Variable numérica continua/discreta viable como métrica resultado para modelado lineal.'
            : 'Tipo no numérico; requiere transformación o enfoque de clasificación en lugar de regresión lineal.';

      return {
        column: c.name,
        type: c.selectedType,
        relevanceScore: Math.max(0, Math.min(100, score)),
        businessJustification,
        statisticalViability,
        warnings,
      };
    })
    .sort((a, b) => b.relevanceScore - a.relevanceScore);

  const selectedTarget =
    preferredTarget && dataset.columns.some((c) => c.name === preferredTarget)
      ? preferredTarget
      : targetCandidates[0]?.column ?? dataset.columns[0]?.name ?? '';

  // 2. Evaluate Predictor Candidates (X)
  const vifMap = new Map(eda.vifEntries.map((v) => [v.feature, v.vif]));
  const corrWithYMap = new Map<string, { val: number; method: string }>();
  for (const p of eda.pairs) {
    if (p.varA === selectedTarget) corrWithYMap.set(p.varB, { val: p.value, method: p.method });
    else if (p.varB === selectedTarget) corrWithYMap.set(p.varA, { val: p.value, method: p.method });
  }

  // Detect derived-from-target leakage (e.g., Computer_Sales vs Sales_Capita when Sales_Capita = Computer_Sales / Pop)
  const targetLower = selectedTarget.toLowerCase();

  const predictorCandidates: PredictorCandidate[] = dataset.columns
    .filter((c) => c.name !== selectedTarget)
    .map((c) => {
      const corrInfo = corrWithYMap.get(c.name);
      const corrVal = corrInfo?.val ?? null;
      const absCorr = corrVal !== null ? Math.abs(corrVal) : 0;
      const vif = vifMap.get(c.name) ?? null;
      const isControllable =
        context.controllableColumns.includes(c.name) || c.isControllable;

      const warnings: string[] = [];
      let leakageRisk = false;

      if (LEAKAGE_HINTS.test(c.name)) {
        leakageRisk = true;
        warnings.push('Posible variable con información posterior al momento de predicción.');
      }
      if (absCorr > 0.97 && (c.selectedType === 'continuous' || c.selectedType === 'discrete')) {
        leakageRisk = true;
        warnings.push(`Correlación extremadamente alta (${corrVal?.toFixed(3)}) con Y: verifique posible fuga o identidad contable.`);
      }
      if (
        (targetLower.includes('sales_capita') && c.name.toLowerCase().includes('computer_sales')) ||
        (targetLower.includes('computer_sales') && c.name.toLowerCase().includes('sales_capita'))
      ) {
        leakageRisk = true;
        warnings.push(
          'Relación algebraica directa con la variable objetivo (Sales/Capita = Computer_Sales / Población). Su inclusión causaría fuga de información.'
        );
      }

      if (c.isConstant) warnings.push('Variable constante sin varianza.');
      if (c.isPotentialIdentifier) warnings.push('Identificador único: generaría sobreajuste puro sin capacidad de generalización.');
      if (c.selectedType === 'text') warnings.push('Texto libre de alta cardinalidad: requiere procesamiento NLP previo.');
      if (c.selectedType === 'datetime') warnings.push('Columna de fecha: utilícela para orden cronológico y partición temporal, no directamente como X cruda.');
      if (c.selectedType === 'geographic' && c.uniqueCount > 12) {
        warnings.push(`Alta cardinalidad geográfica (${c.uniqueCount} territorios) frente al tamaño muestral.`);
      }
      if (vif !== null && vif >= 10) {
        warnings.push(`Multicolinealidad severa detectada (VIF = ${vif.toFixed(2)}).`);
      } else if (vif !== null && vif >= 5) {
        warnings.push(`Multicolinealidad moderada (VIF = ${vif.toFixed(2)}).`);
      }

      let tier: PredictorTier = 'Opcional';
      let rationale = '';

      if (c.isConstant || c.isPotentialIdentifier || c.selectedType === 'text' || c.selectedType === 'datetime' || leakageRisk) {
        tier = 'No recomendada';
        rationale = leakageRisk
          ? 'Excluida por riesgo de fuga de información o relación contable tautológica con Y.'
          : c.isPotentialIdentifier
            ? 'Identificador único de registro sin valor explicativo generalizable.'
            : 'Naturaleza de dato no apta directamente como predictor lineal.';
      } else if (c.selectedType === 'geographic' && c.uniqueCount > 12) {
        tier = 'No recomendada';
        rationale = 'Demasiadas categorías geográficas únicas respecto al número de observaciones.';
      } else if (vif !== null && vif >= 10) {
        tier = 'Requiere revisión';
        rationale = `Muestra relación con "${selectedTarget}" (${corrInfo?.method ?? 'asociación'} = ${corrVal?.toFixed(2) ?? 'N/D'}), pero presenta VIF elevado (${vif.toFixed(1)}). Evalúe redundancia económica o use regularización Ridge/Lasso.`;
      } else if (
        absCorr >= 0.25 ||
        isControllable ||
        tokenOverlapScore(c.name, queryTokens) > 0
      ) {
        tier = 'Recomendada';
        rationale = isControllable
          ? `Palanca de decisión controlable por el negocio con asociación ${corrVal !== null ? `${corrVal.toFixed(2)} (${corrInfo?.method})` : 'relevante'} respecto a ${selectedTarget}.`
          : `Aporta capacidad explicativa sobre ${selectedTarget} (${corrInfo?.method ?? 'asociación'} = ${corrVal?.toFixed(2) ?? 'N/D'}) y baja redundancia (VIF ${vif ? vif.toFixed(2) : '< 5'}).`;
      } else if (c.missingPct > 25) {
        tier = 'Requiere revisión';
        rationale = `Alto porcentaje de datos faltantes (${c.missingPct.toFixed(1)}%); revise calidad antes de incluir.`;
      } else {
        tier = 'Opcional';
        rationale = `Asociación estadística baja-moderada (${corrVal?.toFixed(2) ?? 'N/D'}); útil para contrastar subconjuntos o interacciones.`;
      }

      return {
        column: c.name,
        type: c.selectedType,
        tier,
        correlationWithY: corrVal,
        correlationMethod: corrInfo?.method ?? 'N/A',
        vif,
        isControllable,
        leakageRisk,
        rationale,
        warnings,
      };
    })
    .sort((a, b) => {
      const order: Record<PredictorTier, number> = {
        Recomendada: 0,
        Opcional: 1,
        'Requiere revisión': 2,
        'No recomendada': 3,
      };
      if (order[a.tier] !== order[b.tier]) return order[a.tier] - order[b.tier];
      return Math.abs(b.correlationWithY ?? 0) - Math.abs(a.correlationWithY ?? 0);
    });

  let selectedPredictors = predictorCandidates
    .filter((p) => p.tier === 'Recomendada')
    .map((p) => p.column);

  if (selectedPredictors.length === 0) {
    selectedPredictors = predictorCandidates
      .filter((p) => p.tier === 'Opcional' || p.tier === 'Requiere revisión')
      .slice(0, 3)
      .map((p) => p.column);
  }

  const executiveExplanation = `Para responder la pregunta "${context.businessQuestion || 'análisis de factores explicativos'}", se identificó "${selectedTarget}" como variable dependiente (Y) y se evaluaron ${predictorCandidates.length} candidatas. Se recomiendan ${selectedPredictors.length} variables predictoras (${selectedPredictors.join(', ') || 'ninguna automática'}), excluyendo identificadores, constantes y columnas con posible fuga de información posterior al evento.`;

  return {
    targetCandidates,
    selectedTarget,
    predictorCandidates,
    selectedPredictors,
    executiveExplanation,
  };
}
