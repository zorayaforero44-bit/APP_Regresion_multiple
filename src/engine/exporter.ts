import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { AnalyticsProject } from '../types/analytics';

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function exportCleanedCSV(project: AnalyticsProject) {
  const rows = project.cleanedResult?.cleanedRows ?? project.dataset?.rawRows ?? [];
  if (rows.length === 0) return;
  const headers = Object.keys(rows[0]);
  const csvLines = [
    headers.join(','),
    ...rows.map((r) =>
      headers
        .map((h) => {
          const val = r[h] ?? '';
          const str = String(val).replace(/"/g, '""');
          return /[",\n]/.test(str) ? `"${str}"` : str;
        })
        .join(',')
    ),
  ];
  const blob = new Blob(['\uFEFF' + csvLines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  triggerDownload(blob, `${project.projectName.replace(/\s+/g, '_')}_datos_depurados.csv`);
}

export function exportProjectJSON(project: AnalyticsProject) {
  const payload = {
    exportedAt: new Date().toISOString(),
    author: 'Zoraya Forero — Regression Intelligence | Business Analytics',
    project,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  triggerDownload(blob, `${project.projectName.replace(/\s+/g, '_')}_proyecto.json`);
}

export function exportExcelWorkbook(project: AnalyticsProject) {
  const wb = XLSX.utils.book_new();
  const recModel = project.modelingSuite?.models.find(
    (m) => m.id === project.modelingSuite?.recommendedModelId
  );

  // 1. Resumen Ejecutivo
  const summaryRows = [
    ['Regression Intelligence | Business Analytics — By Zoraya Forero'],
    ['Identidad', 'Economista | Análisis de datos y automatización de procesos | Análisis financiero | Reportes para la toma de decisiones'],
    ['Fecha de análisis', new Date().toLocaleString('es-CO')],
    ['Proyecto ID', project.projectId],
    ['Base de datos', project.dataset?.fileName ?? 'N/D'],
    ['Registros originales', project.dataset?.rowCount ?? 0],
    ['Sector económico', project.businessContext.sector],
    ['Pregunta de negocio', project.businessContext.businessQuestion],
    ['Variable dependiente (Y)', project.selectionPlan?.selectedTarget ?? 'N/D'],
    ['Modelo recomendado', recModel?.name ?? 'N/D'],
    ['Ecuación estimada', recModel?.equationString ?? 'N/D'],
    ['R² ajustado (CR²)', recModel ? Number(recModel.metrics.adjR2Train.toFixed(4)) : 'N/D'],
    ['RMSE Validación', recModel ? Number(recModel.metrics.rmseVal.toFixed(4)) : 'N/D'],
    ['Reconocimiento académico', 'Aplicación desarrollada tomando como referencia académica los conceptos de regresión múltiple y pronósticos empresariales abordados por el profesor Hugo Alexander Martínez Gallego, complementados con metodologías estadísticas y herramientas de analítica de datos.'],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summaryRows), 'Resumen_Ejecutivo');

  // 2. Datos Depurados
  const cleaned = project.cleanedResult?.cleanedRows ?? project.dataset?.rawRows ?? [];
  if (cleaned.length > 0) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(cleaned), 'Datos_Depurados');
  }

  // 3. Diccionario de Variables
  if (project.dataset) {
    const dict = project.dataset.columns.map((c) => ({
      Variable: c.name,
      Tipo_Detectado: c.detectedType,
      Tipo_Final: c.selectedType,
      Unidad: c.unit,
      Controlable: c.isControllable ? 'Sí' : 'No',
      Completitud_Pct: Number(c.completenessPct.toFixed(1)),
      Ausentes: c.missingCount,
      Media: c.mean !== undefined ? Number(c.mean.toFixed(3)) : '',
      Mediana: c.median !== undefined ? Number(c.median.toFixed(3)) : '',
      Descripcion: c.description,
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(dict), 'Diccionario_Variables');
  }

  // 4. Trazabilidad Limpieza
  if (project.cleanedResult?.auditLog.length) {
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(project.cleanedResult.auditLog),
      'Trazabilidad_Pipeline'
    );
  }

  // 5. Comparación de Modelos
  if (project.modelingSuite?.models.length) {
    const comp = project.modelingSuite.models.map((m) => ({
      Modelo: m.name,
      Recomendado: m.isRecommended ? 'SÍ' : 'No',
      Enfoque: m.purpose,
      Score_Multicriterio: m.multiCriteriaScore,
      R2_Train: Number(m.metrics.r2Train.toFixed(4)),
      R2_Ajustado: Number(m.metrics.adjR2Train.toFixed(4)),
      RMSE_Val: Number(m.metrics.rmseVal.toFixed(4)),
      MAE_Val: Number(m.metrics.maeVal.toFixed(4)),
      RMSE_CV: Number(m.metrics.cvRmse.toFixed(4)),
      Prueba_F: m.metrics.fStatistic !== null ? Number(m.metrics.fStatistic.toFixed(3)) : 'N/A',
      Sig_F: m.metrics.fPValue !== null ? Number(m.metrics.fPValue.toFixed(5)) : 'N/A',
      VIF_Max: Number(m.diagnostics.maxVif.toFixed(2)),
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(comp), 'Comparacion_Modelos');
  }

  // 6. Coeficientes del Modelo Recomendado
  if (recModel) {
    const coefs = [
      {
        Termino: 'Intercepto (B0)',
        Estimacion: Number(recModel.intercept.toFixed(5)),
        Error_Est: '—',
        t_Stat: '—',
        P_Valor: '—',
        VIF: '—',
        Interpretacion: 'Valor esperado base cuando las predictoras valen 0.',
      },
      ...recModel.coefficients.map((c) => ({
        Termino: c.feature,
        Estimacion: Number(c.estimate.toFixed(5)),
        Error_Est: c.stdError !== null ? Number(c.stdError.toFixed(5)) : 'No aplica (Regularizado)',
        t_Stat: c.tStat !== null ? Number(c.tStat.toFixed(3)) : 'No aplica',
        P_Valor: c.pValue !== null ? Number((c.robustPValue ?? c.pValue).toFixed(5)) : 'No aplica',
        VIF: c.vif !== null ? Number(c.vif.toFixed(2)) : '—',
        Interpretacion: c.ceterisParibusText,
      })),
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(coefs), 'Coeficientes_Modelo');
  }

  // 7. Escenarios y Recomendaciones
  if (project.scenarios.length > 0) {
    const scenRows = project.scenarios.map((s) => ({
      Escenario: s.name,
      Tipo: s.type,
      Prediccion_Y: Number(s.predictedY.toFixed(3)),
      Delta_Abs: Number(s.deltaVsBaseAbs.toFixed(3)),
      Delta_Pct: Number(s.deltaVsBasePct.toFixed(2)),
      IC95_Inf: Number(s.confidenceInterval95[0].toFixed(2)),
      IC95_Sup: Number(s.confidenceInterval95[1].toFixed(2)),
      IP95_Inf: Number(s.predictionInterval95[0].toFixed(2)),
      IP95_Sup: Number(s.predictionInterval95[1].toFixed(2)),
      Hallazgo: s.recommendation?.hallazgoPrincipal ?? '',
      Accion_Recomendada: s.recommendation?.accionRecomendada ?? '',
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(scenRows), 'Escenarios_Decisiones');
  }

  XLSX.writeFile(wb, `${project.projectName.replace(/\s+/g, '_')}_Regression_Intelligence.xlsx`);
}

export function exportExecutivePDF(project: AnalyticsProject) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const recModel = project.modelingSuite?.models.find(
    (m) => m.id === project.modelingSuite?.recommendedModelId
  );

  // Header band
  doc.setFillColor(11, 21, 40); // Deep Navy
  doc.rect(0, 0, 595, 88, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18);
  doc.text('Regression Intelligence | Business Analytics', 40, 36);
  doc.setFontSize(10);
  doc.setTextColor(148, 210, 200);
  doc.text('Informe Ejecutivo de Analítica Predictiva y Simulación de Escenarios', 40, 54);
  doc.setTextColor(203, 213, 225);
  doc.text(
    `By Zoraya Forero — Economista | Análisis de Datos y Decisiones   ·   ${new Date().toLocaleDateString('es-CO')}`,
    40,
    72
  );

  let y = 112;
  doc.setTextColor(15, 23, 42);
  doc.setFontSize(12);
  doc.text('1. Contexto Empresarial y Caracterización de la Base', 40, y);
  y += 16;
  doc.setFontSize(9.5);
  doc.setTextColor(51, 65, 85);

  const metaLines = [
    `Base analizada: ${project.dataset?.fileName ?? 'N/D'} (${project.dataset?.rowCount ?? 0} registros · ${project.dataset?.columnCount ?? 0} variables · Completitud ${project.dataset?.completenessPct.toFixed(1) ?? 0}%)`,
    `Sector y actividad: ${project.businessContext.sector || 'General'} — ${project.businessContext.activity || 'N/D'}`,
    `Pregunta de negocio: ${project.businessContext.businessQuestion || 'No especificada'}`,
    `Variable dependiente (Y): ${project.selectionPlan?.selectedTarget ?? 'N/D'}   |   Horizonte: ${project.businessContext.predictionHorizon || 'Inmediato'}`,
  ];
  for (const line of metaLines) {
    const wrapped = doc.splitTextToSize(line, 515);
    doc.text(wrapped, 40, y);
    y += wrapped.length * 13;
  }

  // Model Recommendation & Equation
  if (recModel) {
    y += 10;
    doc.setFontSize(12);
    doc.setTextColor(15, 23, 42);
    doc.text('2. Modelo Seleccionado y Evidencia Estadística', 40, y);
    y += 15;
    doc.setFontSize(9.5);
    doc.setTextColor(51, 65, 85);
    const eqWrapped = doc.splitTextToSize(`Modelo: ${recModel.name} | Ecuación: ${recModel.equationString}`, 515);
    doc.text(eqWrapped, 40, y);
    y += eqWrapped.length * 13 + 4;

    autoTable(doc, {
      startY: y,
      head: [['Métrica', 'Valor', 'Criterio Metodológico']],
      body: [
        ['R² / R² Ajustado (CR²)', `${(recModel.metrics.r2Train * 100).toFixed(1)}% / ${(recModel.metrics.adjR2Train * 100).toFixed(1)}%`, 'Varianza explicada penalizada por grados de libertad'],
        ['RMSE / MAE Validación', `${recModel.metrics.rmseVal.toFixed(3)} / ${recModel.metrics.maeVal.toFixed(3)}`, 'Error predictivo fuera de muestra'],
        ['Prueba F Global', recModel.metrics.fStatistic !== null ? `F = ${recModel.metrics.fStatistic.toFixed(2)} (p = ${recModel.metrics.fPValue?.toFixed(4)})` : 'No aplica (Regularizado)', 'Significancia conjunta del modelo'],
        ['VIF Máximo / Durbin-Watson', `${recModel.diagnostics.maxVif.toFixed(2)} / ${recModel.diagnostics.durbinWatson?.toFixed(2) ?? 'N/D'}`, recModel.diagnostics.multicollinearityNote],
      ],
      styles: { fontSize: 8.5, cellPadding: 5 },
      headStyles: { fillColor: [15, 32, 58] },
    });

    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 18;

    doc.setFontSize(12);
    doc.setTextColor(15, 23, 42);
    doc.text('3. Coeficientes e Interpretación Ceteris Paribus', 40, y);
    y += 8;

    autoTable(doc, {
      startY: y,
      head: [['Variable', 'Coeficiente', 't / p-valor', 'Interpretación Ceteris Paribus']],
      body: recModel.coefficients.map((c) => [
        c.feature,
        c.estimate.toFixed(4),
        !c.inferenceValid
          ? 'Regularizado'
          : `${c.tStat?.toFixed(2) ?? '—'} (p=${(c.robustPValue ?? c.pValue)?.toFixed(4) ?? '—'})`,
        c.ceterisParibusText,
      ]),
      styles: { fontSize: 8, cellPadding: 4 },
      headStyles: { fillColor: [13, 148, 136] },
      columnStyles: { 3: { cellWidth: 230 } },
    });

    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 18;
  }

  // Scenarios & Recommendations
  if (project.scenarios.length > 0) {
    if (y > 680) {
      doc.addPage();
      y = 44;
    }
    doc.setFontSize(12);
    doc.setTextColor(15, 23, 42);
    doc.text('4. Escenarios Simulados y Recomendaciones Empresariales', 40, y);
    y += 8;

    autoTable(doc, {
      startY: y,
      head: [['Escenario', 'Predicción Y', 'Var. vs Base', 'IP 95%', 'Acción Recomendada']],
      body: project.scenarios.map((s) => [
        s.name,
        s.predictedY.toFixed(2),
        `${s.deltaVsBaseAbs >= 0 ? '+' : ''}${s.deltaVsBaseAbs.toFixed(2)} (${s.deltaVsBasePct.toFixed(1)}%)`,
        `[${s.predictionInterval95[0].toFixed(1)}, ${s.predictionInterval95[1].toFixed(1)}]`,
        s.recommendation?.accionRecomendada ?? s.economicSummary,
      ]),
      styles: { fontSize: 8, cellPadding: 4 },
      headStyles: { fillColor: [15, 32, 58] },
      columnStyles: { 4: { cellWidth: 210 } },
    });

    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 18;
  }

  // Traceability & Academic Attribution
  if (y > 700) {
    doc.addPage();
    y = 44;
  }
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text('5. Trazabilidad, Limitaciones y Fundamentos Académicos', 40, y);
  y += 14;
  doc.setFontSize(8.5);
  doc.setTextColor(71, 85, 105);
  const footText = [
    `Trazabilidad del pipeline: ${project.cleanedResult?.auditLog.length ?? 0} operaciones registradas; partición train=${project.cleanedResult?.trainRowsCount ?? 0}, val=${project.cleanedResult?.valRowsCount ?? 0}, test=${project.cleanedResult?.testRowsCount ?? 0}.`,
    'Limitación metodológica: Los modelos de regresión múltiple estiman asociaciones estadísticas condicionales; no implican causalidad directa sin validación experimental.',
    'Fundamentos académicos y metodología: Aplicación desarrollada tomando como referencia académica los conceptos de regresión múltiple y pronósticos empresariales abordados por el profesor Hugo Alexander Martínez Gallego, complementados con metodologías estadísticas (NIST, Penn State STAT 501, statsmodels, scikit-learn, SciPy) y herramientas de analítica de datos.',
    'Autoría y marca personal: Zoraya Forero — Economista | Análisis de datos y automatización de procesos | Análisis financiero | Reportes para la toma de decisiones.',
  ];
  for (const ft of footText) {
    const w = doc.splitTextToSize(ft, 515);
    doc.text(w, 40, y);
    y += w.length * 12 + 4;
  }

  doc.save(`${project.projectName.replace(/\s+/g, '_')}_Informe_Ejecutivo.pdf`);
}
