import {
  BusinessContext,
  BusinessRecommendation,
  DatasetSummary,
  ScenarioResult,
  TrainedModelResult,
} from '../types/analytics';

export function buildDeterministicRecommendation(
  scenario: ScenarioResult,
  model: TrainedModelResult,
  context: BusinessContext,
  dataset: DatasetSummary
): BusinessRecommendation {
  const targetCol = dataset.rawRows.length > 0 ? model.equationString.split(' = ')[0] : 'Y';
  const sortedInputs = [...scenario.inputs]
    .filter((inp) => inp.absDelta !== null && Math.abs(inp.absDelta) > 1e-6)
    .sort((a, b) => Math.abs(b.pctDelta ?? 0) - Math.abs(a.pctDelta ?? 0));

  const topDriver = sortedInputs[0];
  const topCoef = [...model.coefficients].sort(
    (a, b) => Math.abs(b.standardizedBeta ?? b.estimate) - Math.abs(a.standardizedBeta ?? a.estimate)
  )[0];

  const piWidth = scenario.predictionInterval95[1] - scenario.predictionInterval95[0];
  const uncertaintyRatio =
    scenario.predictedY !== 0 ? Math.abs(piWidth / (2 * scenario.predictedY)) * 100 : 0;

  const hallazgoPrincipal =
    scenario.type === 'base'
      ? `El modelo "${model.name}" (R² ajustado = ${(model.metrics.adjR2Train * 100).toFixed(1)}%, RMSE validación = ${model.metrics.rmseVal.toFixed(2)}) estima un valor base de ${scenario.predictedY.toFixed(2)} para "${targetCol}", siendo "${topCoef?.sourceColumn ?? 'N/D'}" la variable con mayor contribución relativa (β estandarizado = ${topCoef?.standardizedBeta?.toFixed(3) ?? 'N/D'}).`
      : `Bajo el escenario "${scenario.name}", la predicción esperada para "${targetCol}" alcanza ${scenario.predictedY.toFixed(2)}, lo que representa una variación de ${scenario.deltaVsBaseAbs >= 0 ? '+' : ''}${scenario.deltaVsBaseAbs.toFixed(2)} (${scenario.deltaVsBasePct >= 0 ? '+' : ''}${scenario.deltaVsBasePct.toFixed(1)}%) respecto al escenario base.`;

  const interpretacionEmpresarial = topDriver
    ? `Para la pregunta "${context.businessQuestion || 'análisis de negocio'}", el cambio simulado principalmente en "${topDriver.column}" (${topDriver.pctDelta !== null ? `${topDriver.pctDelta >= 0 ? '+' : ''}${topDriver.pctDelta.toFixed(1)}%` : ''}) se asocia con un desplazamiento significativo de ${targetCol}. Este resultado refleja asociación estadística condicional observada en los ${dataset.rowCount} registros históricos.`
    : `Este escenario actúa como línea base operativa del sector ${context.sector || 'analizado'}, estableciendo el punto de referencia frente al cual contrastar decisiones controlables.`;

  const controllableChanges = scenario.inputs.filter(
    (inp) => context.controllableColumns.includes(inp.column) && inp.absDelta !== null && Math.abs(inp.absDelta) > 1e-6
  );

  const accionRecomendada =
    controllableChanges.length > 0
      ? `Evaluar un piloto controlado ajustando ${controllableChanges.map((c) => `"${c.column}" hacia ${typeof c.simulatedValue === 'number' ? c.simulatedValue.toFixed(2) : c.simulatedValue}`).join(' y ')}, validando primero las restricciones operativas (${context.constraints || 'presupuesto y capacidad'}) mediante pruebas A/B o seguimiento de cohortes antes del despliegue total.`
      : `Priorizar el monitoreo de "${topCoef?.sourceColumn ?? 'las variables líderes'}" y definir metas tácticas sobre las variables controlables identificadas en el módulo de optimización.`;

  const impactoEsperado = `Cambio puntual estimado en ${targetCol}: ${scenario.deltaVsBaseAbs >= 0 ? '+' : ''}${scenario.deltaVsBaseAbs.toFixed(2)} (${scenario.deltaVsBasePct >= 0 ? '+' : ''}${scenario.deltaVsBasePct.toFixed(1)}%), con un intervalo de predicción al 95% de [${scenario.predictionInterval95[0].toFixed(2)}, ${scenario.predictionInterval95[1].toFixed(2)}] (incertidumbre ±${uncertaintyRatio.toFixed(1)}%) bajo el supuesto de estabilidad estructural del modelo.`;

  const risks: string[] = [];
  if (dataset.rowCount < 30) {
    risks.push(`Tamaño muestral acotado (n=${dataset.rowCount}), lo que amplía el error de predicción.`);
  }
  if (scenario.extrapolationWarnings.length > 0) {
    risks.push(`Extrapolación detectada: ${scenario.extrapolationWarnings[0]}`);
  }
  if (model.diagnostics.maxVif >= 5) {
    risks.push(`Multicolinealidad entre predictores (VIF máx = ${model.diagnostics.maxVif.toFixed(2)}) puede dificultar aislar efectos individuales.`);
  }
  risks.push('Correlación y regresión observacional no demuestran causalidad directa sin diseño experimental.');

  return {
    scenarioId: scenario.id,
    scenarioName: scenario.name,
    hallazgoPrincipal,
    interpretacionEmpresarial,
    accionRecomendada,
    impactoEsperado,
    riesgosYLimitaciones: risks.join(' '),
    dataSufficiencyNote:
      dataset.rowCount < 20
        ? 'Se sugiere recopilar al menos 30–50 observaciones adicionales o incorporar variables externas de control para reducir la amplitud del intervalo de predicción.'
        : undefined,
    source: 'deterministic',
  };
}
