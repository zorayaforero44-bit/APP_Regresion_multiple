# Despliegue en GitHub y Vercel — Regression Intelligence | Business Analytics

**Autora:** Zoraya Forero — Economista | Análisis de datos y automatización de procesos | Análisis financiero | Reportes para la toma de decisiones.

## 1. Arquitectura de ejecución
- **Motor estadístico y econométrico (`src/engine/*`):** Ejecuta 100% en TypeScript determinístico (álgebra lineal OLS, pruebas t, F, Breusch-Pagan, Durbin-Watson, Jarque-Bera, HC3, Ridge, Lasso, Elastic Net, simulación individual de variables, Monte Carlo y optimización con restricciones), por lo que funciona directamente en navegador y Vercel sin depender de binarios Python externos.
- **Integración con IA (`server.ts` / `api/`):** Las rutas `/api/ai/*` llaman a `@google/genai` exclusivamente desde el servidor usando `process.env.GEMINI_API_KEY`. Nunca se expone la clave al navegador.

## 2. Publicación mediante GitHub y Vercel
1. Cree un repositorio en GitHub y suba el código fuente:
   ```bash
   git init
   git add .
   git commit -m "Initial release: Regression Intelligence by Zoraya Forero"
   git branch -M main
   git remote add origin https://github.com/<usuario>/regression-intelligence.git
   git push -u origin main
   ```
2. En [Vercel](https://vercel.com), importe el repositorio de GitHub:
   - **Framework Preset:** Vite
   - **Build Command:** `npm run build`
   - **Output Directory:** `dist`
3. En **Project Settings → Environment Variables**, agregue:
   - `GEMINI_API_KEY`: Su clave de Google AI Studio (opcional; si no se configura, el motor econométrico determinístico opera al 100%).
4. Despliegue con **Deploy**. Vercel servirá el frontend compilado en `dist/` y las funciones serverless bajo `/api/*`.

## 3. Verificación local y pruebas
- Desarrollo full-stack: `npm run dev` (puerto 3000).
- Compilación de producción: `npm run build`.
- Validación de tipos TypeScript: `npm run lint`.
- Pruebas reproducibles del motor estadístico: `npx tsx src/engine/__tests__/verifyPipeline.ts`.
