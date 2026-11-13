import React, { useState } from 'react';
import { HelpCircle, ChevronDown, ChevronUp } from 'lucide-react';

const METRIC_GLOSSARY = [
  {
    term: 'R² ajustado (CR²)',
    desc: 'Proporción de la variación de Y explicada por el modelo, penalizada por el número de variables. Evita inflar artificialmente el ajuste al agregar predictores irrelevantes.',
  },
  {
    term: 'RMSE (Error Cuadrático Medio)',
    desc: 'Desviación promedio entre las predicciones del modelo y los valores reales en las mismas unidades de Y. Evalúelo prioritariamente en validación/prueba.',
  },
  {
    term: 'Prueba F y p-valor',
    desc: 'Evalúa significancia conjunta (Prueba F) e individual (prueba t). Un p-valor < 0,05 aporta evidencia contra la hipótesis nula de coeficiente cero, pero no garantiza capacidad predictiva fuera de muestra ni causalidad.',
  },
  {
    term: 'VIF (Factor de Inflación de Varianza)',
    desc: 'Mide multicolinealidad entre predictores. VIF < 5 indica estabilidad; VIF > 10 señala redundancia severa que vuelve inestables los coeficientes OLS.',
  },
  {
    term: 'IC 95% vs IP 95%',
    desc: 'El Intervalo de Confianza (IC) acota la media esperada de Y; el Intervalo de Predicción (IP) acota una observación futura individual e incluye el error residual del modelo.',
  },
];

export const MetricHelpBar: React.FC<{ compact?: boolean }> = ({ compact }) => {
  const [open, setOpen] = useState(!compact);

  return (
    <div className="bg-slate-50 border border-slate-200 rounded-lg p-3.5 text-xs">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between text-left font-medium text-slate-800"
      >
        <span className="flex items-center gap-2">
          <HelpCircle className="w-4 h-4 text-teal-700" />
          Guía rápida de rigor estadístico (Modo Guiado)
        </span>
        {open ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
      </button>
      {open && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 mt-3 pt-3 border-t border-slate-200">
          {METRIC_GLOSSARY.map((item) => (
            <div key={item.term} className="space-y-0.5">
              <div className="font-semibold text-slate-900">{item.term}</div>
              <p className="text-slate-600 leading-relaxed">{item.desc}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
