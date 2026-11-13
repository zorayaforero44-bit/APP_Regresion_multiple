import {
  CleanedDatasetResult,
  OptimizationConfig,
  OptimizationResult,
  TrainedModelResult,
} from '../types/analytics';
import { predictSingleObservation } from './scenarioSimulator';

export function optimizeDecisions(
  config: OptimizationConfig,
  baseInputs: Record<string, number | string>,
  model: TrainedModelResult,
  cleaned: CleanedDatasetResult
): OptimizationResult {
  const activeVars = config.controllableVars.filter((v) => v.enabled);
  const currentInputs: Record<string, number | string> = { ...baseInputs };

  for (const v of activeVars) {
    currentInputs[v.column] = Math.max(v.minBound, Math.min(v.maxBound, v.currentValue));
  }

  const basePredObj = predictSingleObservation(baseInputs, model, cleaned);
  const basePrediction = basePredObj.predictedY;

  if (activeVars.length === 0) {
    return {
      converged: false,
      iterations: 0,
      basePrediction,
      optimalPrediction: basePrediction,
      improvementAbs: 0,
      improvementPct: 0,
      predictionInterval95: basePredObj.pi95,
      optimalVariables: [],
      totalBudgetUsed: 0,
      budgetLimit: config.hasBudgetConstraint ? config.maxBudget : null,
      activeConstraints: ['No hay variables controlables habilitadas para optimización.'],
      extrapolationWarnings: [],
      causalDisclaimer:
        'Optimizar una predicción estadística identifica combinaciones favorables dentro del modelo ajustado, pero no demuestra por sí sola que una intervención producirá causalmente el resultado estimado.',
    };
  }

  const budgetCost = (vals: Record<string, number | string>) =>
    activeVars.reduce((acc, v) => acc + Number(vals[v.column] ?? 0) * v.unitCost, 0);

  // Project onto feasible box + linear budget half-space (if enabled)
  const projectFeasible = (vals: Record<string, number | string>) => {
    for (const v of activeVars) {
      const clamped = Math.max(v.minBound, Math.min(v.maxBound, Number(vals[v.column] ?? v.currentValue)));
      vals[v.column] = clamped;
    }
    if (config.hasBudgetConstraint) {
      for (let pass = 0; pass < 8; pass++) {
        const spent = budgetCost(vals);
        if (spent <= config.maxBudget + 1e-6) break;
        const minPossible = activeVars.reduce((acc, v) => acc + v.minBound * v.unitCost, 0);
        if (minPossible >= config.maxBudget) {
          for (const v of activeVars) vals[v.column] = v.minBound;
          break;
        }
        const excess = spent - config.maxBudget;
        const reducibleCapacity = activeVars.reduce(
          (acc, v) => acc + Math.max(0, (Number(vals[v.column]) - v.minBound) * v.unitCost),
          0
        );
        if (reducibleCapacity <= 1e-9) break;
        const ratio = Math.min(1, excess / reducibleCapacity);
        for (const v of activeVars) {
          if (v.unitCost > 0) {
            const curr = Number(vals[v.column]);
            vals[v.column] = Math.max(v.minBound, curr - ratio * (curr - v.minBound));
          }
        }
      }
    }
  };

  projectFeasible(currentInputs);

  const lossFn = (vals: Record<string, number | string>): number => {
    const y = predictSingleObservation(vals, model, cleaned).predictedY;
    let penalty = 0;
    if (config.minExpectedY !== undefined && y < config.minExpectedY) {
      penalty += 1e4 * (config.minExpectedY - y) ** 2;
    }
    if (config.objective === 'maximize') return -y + penalty;
    if (config.objective === 'minimize') return y + penalty;
    const goal = config.targetGoalValue ?? basePrediction;
    return (y - goal) ** 2 + penalty;
  };

  // Projected Coordinate & Golden-Section / Grid Descent (works for linear, log, and interaction terms!)
  let iterations = 0;
  let converged = false;
  for (let iter = 0; iter < 60; iter++) {
    iterations++;
    let maxMove = 0;

    for (const v of activeVars) {
      const prev = Number(currentInputs[v.column]);
      const span = v.maxBound - v.minBound;
      if (span <= 1e-9) continue;

      let bestVal = prev;
      let bestLoss = lossFn(currentInputs);

      // Coarse + fine 1D search along coordinate with feasibility projection
      const gridPoints = 20;
      for (let g = 0; g <= gridPoints; g++) {
        const cand = v.minBound + (span * g) / gridPoints;
        const probe = { ...currentInputs, [v.column]: cand };
        projectFeasible(probe);
        const l = lossFn(probe);
        if (l < bestLoss - 1e-9) {
          bestLoss = l;
          bestVal = Number(probe[v.column]);
        }
      }

      // Local refinement around bestVal
      const stepLocal = span / 25;
      for (let g = -10; g <= 10; g++) {
        const cand = Math.max(v.minBound, Math.min(v.maxBound, bestVal + (stepLocal * g) / 10));
        const probe = { ...currentInputs, [v.column]: cand };
        projectFeasible(probe);
        const l = lossFn(probe);
        if (l < bestLoss - 1e-9) {
          bestLoss = l;
          bestVal = Number(probe[v.column]);
        }
      }

      currentInputs[v.column] = bestVal;
      projectFeasible(currentInputs);
      maxMove = Math.max(maxMove, Math.abs(Number(currentInputs[v.column]) - prev) / Math.max(1, span));
    }

    if (maxMove < 1e-4) {
      converged = true;
      break;
    }
  }

  const finalPred = predictSingleObservation(currentInputs, model, cleaned);
  const optimalPrediction = finalPred.predictedY;
  const improvementAbs = optimalPrediction - basePrediction;
  const improvementPct = basePrediction !== 0 ? (improvementAbs / Math.abs(basePrediction)) * 100 : 0;

  const totalBudgetUsed = budgetCost(currentInputs);
  const activeConstraints: string[] = [];

  if (config.hasBudgetConstraint) {
    if (Math.abs(totalBudgetUsed - config.maxBudget) <= Math.max(1, config.maxBudget * 0.015)) {
      activeConstraints.push(`Restricción presupuestaria activa (uso: ${totalBudgetUsed.toFixed(2)} / máx: ${config.maxBudget.toFixed(2)}).`);
    } else {
      activeConstraints.push(`Presupuesto con holgura (${totalBudgetUsed.toFixed(2)} de ${config.maxBudget.toFixed(2)}).`);
    }
  }

  const optimalVariables = activeVars.map((v) => {
    const optVal = Number(Number(currentInputs[v.column]).toFixed(3));
    const baseV = Number(baseInputs[v.column] ?? v.currentValue);
    const absDelta = optVal - baseV;
    const pctDelta = baseV !== 0 ? (absDelta / Math.abs(baseV)) * 100 : 0;
    const atLowerBound = Math.abs(optVal - v.minBound) <= Math.max(1e-3, (v.maxBound - v.minBound) * 0.01);
    const atUpperBound = Math.abs(optVal - v.maxBound) <= Math.max(1e-3, (v.maxBound - v.minBound) * 0.01);
    if (atUpperBound) activeConstraints.push(`"${v.column}" alcanzó su límite superior (${v.maxBound}).`);
    if (atLowerBound) activeConstraints.push(`"${v.column}" alcanzó su límite inferior (${v.minBound}).`);

    return {
      column: v.column,
      baseValue: baseV,
      optimalValue: optVal,
      absDelta,
      pctDelta,
      atLowerBound,
      atUpperBound,
    };
  });

  return {
    converged,
    iterations,
    basePrediction,
    optimalPrediction,
    improvementAbs,
    improvementPct,
    predictionInterval95: finalPred.pi95,
    optimalVariables,
    totalBudgetUsed,
    budgetLimit: config.hasBudgetConstraint ? config.maxBudget : null,
    activeConstraints,
    extrapolationWarnings: finalPred.extrapolationWarnings,
    causalDisclaimer:
      'Advertencia metodológica: la optimización matemática encuentra el punto extremo de la superficie de predicción del modelo bajo las restricciones definidas, pero no constituye demostración causal ni garantiza el mismo efecto ante cambios estructurales del mercado.',
  };
}
