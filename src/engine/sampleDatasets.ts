import { DataRow } from '../types/analytics';

export interface SampleDatasetSpec {
  id: string;
  title: string;
  sector: string;
  subtitle: string;
  description: string;
  businessQuestion: string;
  recommendedTarget: string;
  controllableHint: string[];
  rows: DataRow[];
}

export const SAMPLE_DATASETS: SampleDatasetSpec[] = [
  {
    id: 'hal_europe',
    title: 'Caso Académico: HAL Computer (Europa)',
    sector: 'Tecnología / Ventas B2B',
    subtitle: '20 países europeos · Referencia PDF Prof. Hugo A. Martínez Gallego',
    description:
      'Datos de prueba académicos extraídos del caso HAL Computer (Europe.xlsx, The Economist Pocket World in Figures 2011) para pronóstico de ventas de computadoras por territorio.',
    businessQuestion:
      '¿Qué variables macroeconómicas explican las ventas per cápita de computadoras en los territorios europeos para asignar cuotas comerciales?',
    recommendedTarget: 'Sales_Capita',
    controllableHint: ['age_spend_on_education'],
    rows: [
      { Country: 'Austria', Pop_millions: 8.4, Computer_Sales: 941.2, Sales_Capita: 112.05, GNP_per_head: 49600, Unemployment_rate: 4.2, age_spend_on_education: 5.8 },
      { Country: 'Belgium', Pop_millions: 10.5, Computer_Sales: 1681.9, Sales_Capita: 160.18, GNP_per_head: 47090, Unemployment_rate: 8.1, age_spend_on_education: 5.9 },
      { Country: 'Bulgaria', Pop_millions: 7.6, Computer_Sales: 154, Sales_Capita: 20.26, GNP_per_head: 6550, Unemployment_rate: 13.5, age_spend_on_education: 3.5 },
      { Country: 'Czech Rep.', Pop_millions: 10.2, Computer_Sales: 1028.7, Sales_Capita: 100.85, GNP_per_head: 20670, Unemployment_rate: 6.6, age_spend_on_education: 4.4 },
      { Country: 'Denmark', Pop_millions: 5.5, Computer_Sales: 935.4, Sales_Capita: 170.07, GNP_per_head: 62120, Unemployment_rate: 5.2, age_spend_on_education: 8.4 },
      { Country: 'Finland', Pop_millions: 5.3, Computer_Sales: 1971, Sales_Capita: 371.89, GNP_per_head: 51320, Unemployment_rate: 9.9, age_spend_on_education: 6.3 },
      { Country: 'France', Pop_millions: 61.9, Computer_Sales: 5928.9, Sales_Capita: 95.78, GNP_per_head: 44510, Unemployment_rate: 10, age_spend_on_education: 5.7 },
      { Country: 'Germany', Pop_millions: 82.5, Computer_Sales: 6824.3, Sales_Capita: 82.72, GNP_per_head: 44450, Unemployment_rate: 9.1, age_spend_on_education: 4.6 },
      { Country: 'Greece', Pop_millions: 11.2, Computer_Sales: 813, Sales_Capita: 72.59, GNP_per_head: 31670, Unemployment_rate: 9.9, age_spend_on_education: 3.9 },
      { Country: 'Hungary', Pop_millions: 10, Computer_Sales: 449, Sales_Capita: 44.9, GNP_per_head: 15410, Unemployment_rate: 7.3, age_spend_on_education: 5.1 },
      { Country: 'Ireland', Pop_millions: 4.4, Computer_Sales: 576.9, Sales_Capita: 131.11, GNP_per_head: 60460, Unemployment_rate: 6.3, age_spend_on_education: 4.3 },
      { Country: 'Italy', Pop_millions: 58.9, Computer_Sales: 3858.2, Sales_Capita: 65.5, GNP_per_head: 38490, Unemployment_rate: 9.3, age_spend_on_education: 5.0 },
      { Country: 'Netherlands', Pop_millions: 16.5, Computer_Sales: 2168.5, Sales_Capita: 131.42, GNP_per_head: 52960, Unemployment_rate: 4.4, age_spend_on_education: 5.0 },
      { Country: 'Poland', Pop_millions: 38, Computer_Sales: 2847, Sales_Capita: 74.92, GNP_per_head: 13850, Unemployment_rate: 14.4, age_spend_on_education: 5.6 },
      { Country: 'Portugal', Pop_millions: 10.7, Computer_Sales: 728.6, Sales_Capita: 68.09, GNP_per_head: 22920, Unemployment_rate: 6.3, age_spend_on_education: 5.9 },
      { Country: 'Romania', Pop_millions: 21.3, Computer_Sales: 687.2, Sales_Capita: 32.26, GNP_per_head: 9300, Unemployment_rate: 7.0, age_spend_on_education: 3.3 },
      { Country: 'Spain', Pop_millions: 44.8, Computer_Sales: 4745.8, Sales_Capita: 105.93, GNP_per_head: 35220, Unemployment_rate: 14.2, age_spend_on_education: 4.4 },
      { Country: 'Switzerland', Pop_millions: 7.5, Computer_Sales: 1130.4, Sales_Capita: 150.72, GNP_per_head: 64430, Unemployment_rate: 3.6, age_spend_on_education: 5.6 },
      { Country: 'Sweden', Pop_millions: 9.2, Computer_Sales: 2113.4, Sales_Capita: 229.72, GNP_per_head: 51950, Unemployment_rate: 6.3, age_spend_on_education: 7.6 },
      { Country: 'Turkey', Pop_millions: 75.8, Computer_Sales: 2879, Sales_Capita: 37.98, GNP_per_head: 9940, Unemployment_rate: 8.6, age_spend_on_education: 3.7 },
    ],
  },
  {
    id: 'marketing_retail',
    title: 'Datos de Prueba: Marketing Mix & Retail',
    sector: 'Comercio Minorista / E-commerce',
    subtitle: '60 campañas · Incluye categóricas, faltantes y colinealidad',
    description:
      'Base de prueba con inversión en pauta digital, inversión en TV, descuentos, precio promedio, canal de venta y temporada, diseñada para validar imputación, codificación one-hot y optimización de presupuesto.',
    businessQuestion:
      '¿Cómo cambiarían las ventas netas si optimizamos la inversión en pauta digital y TV manteniendo control sobre el descuento promedio?',
    recommendedTarget: 'Ventas_Netas_USD',
    controllableHint: ['Pauta_Digital_USD', 'Inversion_TV_USD', 'Descuento_Pct', 'Precio_Promedio_USD'],
    rows: Array.from({ length: 60 }, (_, idx) => {
      const i = idx + 1;
      const canal = i % 3 === 0 ? 'Omnicanal' : i % 2 === 0 ? 'Ecommerce' : 'Tienda_Fisica';
      const temporada = i % 4 === 0 ? 'Alta' : i % 4 === 1 ? 'Media' : 'Baja';
      const digital = Math.round(1800 + ((i * 317) % 4200) + (canal === 'Ecommerce' ? 950 : 0));
      const tv = Math.round(1200 + digital * 0.48 + ((i * 193) % 1800));
      const descuento = Number((4 + ((i * 7) % 19) * 0.7).toFixed(1));
      const precio = Number((48 + ((i * 13) % 24) - descuento * 0.35).toFixed(2));
      const trafico = Math.round(900 + digital * 0.38 + tv * 0.14 + (temporada === 'Alta' ? 650 : 0));
      const canalBonus = canal === 'Omnicanal' ? 4200 : canal === 'Ecommerce' ? 2100 : 0;
      const tempBonus = temporada === 'Alta' ? 5400 : temporada === 'Media' ? 1900 : 0;
      const noise = ((i * 997) % 2600) - 1300;
      const ventas = Math.round(
        14500 + 3.15 * digital + 1.45 * tv - 210 * precio + 340 * descuento + canalBonus + tempBonus + noise
      );
      return {
        ID_Campana: `CMP-${String(i).padStart(3, '0')}`,
        Canal: i === 14 ? null : canal,
        Temporada: temporada,
        Pauta_Digital_USD: i === 7 || i === 29 ? null : digital,
        Inversion_TV_USD: i === 19 ? null : tv,
        Descuento_Pct: descuento,
        Precio_Promedio_USD: i === 42 ? null : precio,
        Trafico_Web: trafico,
        Ventas_Netas_USD: ventas,
      };
    }),
  },
  {
    id: 'saas_mrr',
    title: 'Datos de Prueba: Serie Temporal SaaS B2B',
    sector: 'Software / Suscripciones B2B',
    subtitle: '48 meses cronológicos · Validación temporal y AR(1)',
    description:
      'Base mensual sintética de desempeño financiero SaaS con tendencia temporal, usuarios activos, inversión en producto, tasa de cancelación (churn) e ingresos recurrentes mensuales (MRR).',
    businessQuestion:
      '¿Qué variables explican el crecimiento del MRR mensual y cuál es la proyección a 6 meses bajo escenarios de retención?',
    recommendedTarget: 'MRR_USD',
    controllableHint: ['Inversion_Producto_USD', 'Gasto_Adquisicion_USD'],
    rows: Array.from({ length: 48 }, (_, idx) => {
      const year = 2022 + Math.floor(idx / 12);
      const month = String((idx % 12) + 1).padStart(2, '0');
      const fecha = `${year}-${month}-01`;
      const seasonal = Math.sin((idx / 12) * 2 * Math.PI) * 1800;
      const invProd = Math.round(12000 + idx * 320 + ((idx * 173) % 2400));
      const cacSpend = Math.round(8500 + idx * 210 + ((idx * 211) % 1900));
      const churn = Number((3.8 - idx * 0.025 + ((idx % 5) - 2) * 0.18).toFixed(2));
      const usuarios = Math.round(420 + idx * 24 + (invProd - 12000) * 0.015 + seasonal * 0.02);
      const arpu = Number((82 + idx * 0.42 + ((idx % 3) - 1) * 1.1).toFixed(2));
      const mrr = Math.round(
        18000 + 78 * usuarios + 1.35 * invProd + 0.9 * cacSpend - 3200 * churn + seasonal + ((idx * 431) % 1800) - 900
      );
      return {
        Fecha: fecha,
        Usuarios_Activos: usuarios,
        Inversion_Producto_USD: invProd,
        Gasto_Adquisicion_USD: cacSpend,
        Tasa_Churn_Pct: churn,
        ARPU_USD: arpu,
        MRR_USD: mrr,
      };
    }),
  },
  {
    id: 'ops_costs',
    title: 'Datos de Prueba: Costos Operativos Planta',
    sector: 'Manufactura / Operaciones',
    subtitle: '45 lotes · Optimización de reducción de costos unitarios',
    description:
      'Base de prueba de eficiencia operativa por lote de producción con horas máquina, personal asignado, consumo energético, merma porcentual y turno.',
    businessQuestion:
      '¿Qué factores determinan el costo operativo por lote y cómo reducirlo sin exceder restricciones operativas?',
    recommendedTarget: 'Costo_Operativo_USD',
    controllableHint: ['Horas_Maquina', 'Personal_Turno', 'Mantenimiento_Preventivo_Hrs'],
    rows: Array.from({ length: 45 }, (_, idx) => {
      const i = idx + 1;
      const turno = i % 3 === 0 ? 'Nocturno' : i % 2 === 0 ? 'Tarde' : 'Manana';
      const horas = Number((42 + ((i * 5.3) % 36)).toFixed(1));
      const personal = 8 + (i % 9);
      const mant = Number((2 + ((i * 1.7) % 8)).toFixed(1));
      const merma = Number(Math.max(0.8, 5.4 - mant * 0.38 + (turno === 'Nocturno' ? 0.9 : 0) + ((i % 4) * 0.25)).toFixed(2));
      const energia = Math.round(850 + horas * 29 + personal * 14 + ((i * 89) % 140));
      const turnoExtra = turno === 'Nocturno' ? 1450 : turno === 'Tarde' ? 420 : 0;
      const costo = Math.round(
        3200 + 88 * horas + 260 * personal + 620 * merma - 140 * mant + 1.15 * energia + turnoExtra + ((i * 257) % 600) - 300
      );
      return {
        Lote_ID: `L-${100 + i}`,
        Turno: turno,
        Horas_Maquina: horas,
        Personal_Turno: personal,
        Mantenimiento_Preventivo_Hrs: mant,
        Merma_Pct: merma,
        Consumo_Energia_kWh: energia,
        Costo_Operativo_USD: costo,
      };
    }),
  },
];
