import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { GoogleGenAI, Type } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json({ limit: '2mb' }));

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') return null;
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

app.get('/api/health', (_req, res) => {
  const hasKey = Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY');
  res.json({
    ok: true,
    service: 'Regression Intelligence API',
    aiEnabled: hasKey,
    timestamp: new Date().toISOString(),
  });
});

// 1. Interpret business context against real dataset column metadata (never raw sensitive rows)
app.post('/api/ai/interpret-business', async (req, res) => {
  try {
    const ai = getGeminiClient();
    const { businessContext, columnsMeta } = req.body as {
      businessContext: Record<string, unknown>;
      columnsMeta: Array<Record<string, unknown>>;
    };

    if (!ai) {
      return res.status(200).json({
        fallback: true,
        reason: 'GEMINI_API_KEY no configurada en el entorno del servidor; se aplicó interpretación determinística local.',
      });
    }

    const prompt = `Eres un economista sénior y científico de datos. Analiza el contexto de negocio y los metadatos reales de la base de datos (SIN inventar columnas inexistentes).

Contexto del usuario:
${JSON.stringify(businessContext, null, 2)}

Columnas reales disponibles en la base (nombre, tipo, unidad, min, max, media, completitud):
${JSON.stringify(columnsMeta, null, 2)}

Instrucciones estrictas:
1. Relaciona la pregunta de negocio únicamente con los nombres exactos de las columnas reales listadas arriba.
2. Si sugieres variables externas que ayudarían al modelo, identifícalas explícitamente en "suggestedExternalVariables" aclarando que requieren recolección adicional.
3. No inventes cifras estadísticas ni atribuyas causalidad directa.
4. Responde en español ejecutivo claro y conciso.`;

    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            summary: { type: Type.STRING },
            alignedColumns: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  column: { type: Type.STRING },
                  role: { type: Type.STRING },
                  rationale: { type: Type.STRING },
                },
              },
            },
            suggestedExternalVariables: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING },
                  rationale: { type: Type.STRING },
                },
              },
            },
            warnings: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
          },
        },
      },
    });

    const parsed = JSON.parse((response.text ?? '{}').trim());
    return res.json({ fallback: false, data: parsed });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error llamando a Gemini API';
    return res.status(200).json({ fallback: true, reason: msg });
  }
});

// 2. Generate 5-part executive consulting recommendation strictly grounded in computed scenario & model metrics
app.post('/api/ai/recommend-scenario', async (req, res) => {
  try {
    const ai = getGeminiClient();
    const { businessContext, modelSummary, scenarioSummary } = req.body as {
      businessContext: Record<string, unknown>;
      modelSummary: Record<string, unknown>;
      scenarioSummary: Record<string, unknown>;
    };

    if (!ai) {
      return res.status(200).json({
        fallback: true,
        reason: 'GEMINI_API_KEY no configurada; utilizando motor econométrico determinístico.',
      });
    }

    const prompt = `Actúa como consultor de inteligencia de negocios y economista analítico.
Redacta una recomendación empresarial en 5 apartados basada EXCLUSIVAMENTE en los resultados estadísticos calculados que se proporcionan abajo.

Contexto de negocio:
${JSON.stringify(businessContext, null, 2)}

Resumen del modelo ajustado (verificado):
${JSON.stringify(modelSummary, null, 2)}

Resultados del escenario simulado:
${JSON.stringify(scenarioSummary, null, 2)}

Reglas estrictas:
- No inventes cifras ni porcentajes que no aparezcan en el JSON anterior.
- Distingue claramente entre asociación/predicción estadística y demostración causal.
- Si existe advertencia de extrapolación, muestra pequeña o colinealidad (VIF alto), menciónala explícitamente en riesgosYLimitaciones.
- Responde en español profesional y accionable.`;

    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            hallazgoPrincipal: { type: Type.STRING },
            interpretacionEmpresarial: { type: Type.STRING },
            accionRecomendada: { type: Type.STRING },
            impactoEsperado: { type: Type.STRING },
            riesgosYLimitaciones: { type: Type.STRING },
          },
        },
      },
    });

    const parsed = JSON.parse((response.text ?? '{}').trim());
    return res.json({ fallback: false, data: parsed });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error en motor Gemini';
    return res.status(200).json({ fallback: true, reason: msg });
  }
});

// 3. Structure unstructured text/notes into tabular JSON rows if user uploads non-tabular logs
app.post('/api/ai/structure-unstructured', async (req, res) => {
  try {
    const ai = getGeminiClient();
    const { rawText } = req.body as { rawText: string };
    if (!rawText || typeof rawText !== 'string') {
      return res.status(400).json({ error: 'Texto vacío.' });
    }
    if (!ai) {
      return res.status(200).json({
        fallback: true,
        reason:
          'Para estructurar texto libre automáticamente mediante IA se requiere configurar GEMINI_API_KEY en el servidor. Alternativamente, organice sus datos en formato CSV o Excel con encabezados por columna.',
      });
    }

    const sampleSnippet = rawText.slice(0, 6000);
    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: `Extrae registros tabulares estructurados de este texto no estructurado sin inventar valores no presentes. Devuelve un arreglo JSON de objetos con las mismas claves.\n\nTexto:\n${sampleSnippet}`,
      config: {
        responseMimeType: 'application/json',
      },
    });

    const rows = JSON.parse((response.text ?? '[]').trim());
    return res.json({ fallback: false, rows: Array.isArray(rows) ? rows : [] });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'No fue posible estructurar el texto.';
    return res.status(200).json({ fallback: true, reason: msg });
  }
});

async function startServer() {
  const PORT = Number(process.env.PORT || 3000);

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Regression Intelligence server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
