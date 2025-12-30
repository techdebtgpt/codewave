// src/benchmark/metrics-calculator.ts
// Statistical metrics computation for benchmark evaluation

import {
  DatasetEntry,
  PredictionEntry,
  PillarMetrics,
  CommitError,
  BenchmarkMetricName,
  BENCHMARK_METRICS,
} from './types';

/**
 * Metrics that can have positive or negative values (for direction accuracy)
 */
const SIGNED_METRICS: BenchmarkMetricName[] = ['technicalDebtHours', 'debtReductionHours'];

/**
 * Calculate Mean Absolute Error
 * Lower is better
 */
function calculateMAE(actual: number[], predicted: number[]): number {
  if (actual.length === 0) return 0;
  const sum = actual.reduce((acc, val, idx) => acc + Math.abs(val - predicted[idx]), 0);
  return sum / actual.length;
}

/**
 * Calculate Root Mean Squared Error
 * Lower is better - penalizes large errors more than MAE
 */
function calculateRMSE(actual: number[], predicted: number[]): number {
  if (actual.length === 0) return 0;
  const sumSquares = actual.reduce((acc, val, idx) => acc + Math.pow(val - predicted[idx], 2), 0);
  return Math.sqrt(sumSquares / actual.length);
}

/**
 * Calculate Normalized Mean Absolute Error
 * Lower is better - expressed as percentage of the data range
 */
function calculateNMAE(actual: number[], predicted: number[]): number {
  if (actual.length === 0) return 0;
  const mae = calculateMAE(actual, predicted);
  const range = Math.max(...actual) - Math.min(...actual);
  if (range === 0) return 0; // All values are the same
  return (mae / range) * 100;
}

/**
 * Calculate R-squared (coefficient of determination)
 * Higher is better - 1.0 means perfect prediction
 */
function calculateR2(actual: number[], predicted: number[]): number {
  if (actual.length === 0) return 0;

  const mean = actual.reduce((a, b) => a + b, 0) / actual.length;

  // Total sum of squares
  const ssTot = actual.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0);

  // Residual sum of squares
  const ssRes = actual.reduce((acc, val, idx) => acc + Math.pow(val - predicted[idx], 2), 0);

  if (ssTot === 0) return 1; // Perfect prediction when all values are the same
  return 1 - ssRes / ssTot;
}

/**
 * Calculate Maximum Absolute Error
 * Lower is better - worst-case deviation
 */
function calculateMaxError(actual: number[], predicted: number[]): number {
  if (actual.length === 0) return 0;
  let maxError = 0;
  for (let i = 0; i < actual.length; i++) {
    const error = Math.abs(actual[i] - predicted[i]);
    if (error > maxError) maxError = error;
  }
  return maxError;
}

/**
 * Calculate Direction Accuracy
 * Higher is better - percentage of predictions with correct sign
 * Only applicable for metrics that can be positive or negative
 */
function calculateDirectionAccuracy(actual: number[], predicted: number[]): number {
  if (actual.length === 0) return 0;

  let correct = 0;
  for (let i = 0; i < actual.length; i++) {
    // Check if signs match (or both are zero)
    const actualSign = Math.sign(actual[i]);
    const predictedSign = Math.sign(predicted[i]);
    if (actualSign === predictedSign) {
      correct++;
    }
  }

  return (correct / actual.length) * 100;
}

/**
 * Calculate all metrics for a single pillar
 */
export function calculatePillarMetrics(
  actual: (number | null)[],
  predicted: (number | null)[],
  metricName: BenchmarkMetricName
): PillarMetrics {
  // Filter out pairs where either value is null
  const validPairs: { actual: number; predicted: number }[] = [];
  for (let i = 0; i < actual.length; i++) {
    if (actual[i] !== null && predicted[i] !== null) {
      validPairs.push({ actual: actual[i]!, predicted: predicted[i]! });
    }
  }

  const actualValues = validPairs.map((p) => p.actual);
  const predictedValues = validPairs.map((p) => p.predicted);

  const metrics: PillarMetrics = {
    mae: calculateMAE(actualValues, predictedValues),
    rmse: calculateRMSE(actualValues, predictedValues),
    nmae: calculateNMAE(actualValues, predictedValues),
    r2: calculateR2(actualValues, predictedValues),
    maxError: calculateMaxError(actualValues, predictedValues),
    sampleCount: validPairs.length,
  };

  // Add direction accuracy for signed metrics
  if (SIGNED_METRICS.includes(metricName)) {
    metrics.directionAccuracy = calculateDirectionAccuracy(actualValues, predictedValues);
  }

  return metrics;
}

/**
 * Calculate per-commit errors
 */
export function calculateCommitErrors(
  groundTruth: DatasetEntry[],
  predictions: PredictionEntry[]
): CommitError[] {
  const errors: CommitError[] = [];

  // Create a map of predictions by commit hash
  const predictionMap = new Map<string, PredictionEntry>();
  for (const pred of predictions) {
    predictionMap.set(pred.commitHash, pred);
  }

  for (const truth of groundTruth) {
    const prediction = predictionMap.get(truth.commitHash);
    if (!prediction) continue;

    const commitError: CommitError = {
      commitHash: truth.commitHash,
      errors: {} as Record<BenchmarkMetricName, number | null>,
      absoluteErrors: {} as Record<BenchmarkMetricName, number | null>,
    };

    for (const metric of BENCHMARK_METRICS) {
      const actual = truth[metric];
      const predicted = prediction[metric];

      if (actual !== null && predicted !== null) {
        commitError.errors[metric] = predicted - actual;
        commitError.absoluteErrors[metric] = Math.abs(predicted - actual);
      } else {
        commitError.errors[metric] = null;
        commitError.absoluteErrors[metric] = null;
      }
    }

    errors.push(commitError);
  }

  return errors;
}

/**
 * Calculate all benchmark metrics across all pillars
 */
export function calculateAllMetrics(
  groundTruth: DatasetEntry[],
  predictions: PredictionEntry[]
): {
  metrics: Record<BenchmarkMetricName, PillarMetrics>;
  overallNmae: number;
  overallR2: number;
  commitErrors: CommitError[];
} {
  // Create a map of predictions by commit hash for matching
  const predictionMap = new Map<string, PredictionEntry>();
  for (const pred of predictions) {
    predictionMap.set(pred.commitHash, pred);
  }

  // Extract paired values for each metric
  const metrics: Record<string, PillarMetrics> = {};
  let totalNmae = 0;
  let totalR2 = 0;
  let validMetricCount = 0;

  for (const metric of BENCHMARK_METRICS) {
    const actual: (number | null)[] = [];
    const predicted: (number | null)[] = [];

    for (const truth of groundTruth) {
      const prediction = predictionMap.get(truth.commitHash);
      if (prediction) {
        actual.push(truth[metric]);
        predicted.push(prediction[metric]);
      }
    }

    const pillarMetrics = calculatePillarMetrics(actual, predicted, metric);
    metrics[metric] = pillarMetrics;

    if (pillarMetrics.sampleCount > 0) {
      totalNmae += pillarMetrics.nmae;
      totalR2 += pillarMetrics.r2;
      validMetricCount++;
    }
  }

  const commitErrors = calculateCommitErrors(groundTruth, predictions);

  return {
    metrics: metrics as Record<BenchmarkMetricName, PillarMetrics>,
    overallNmae: validMetricCount > 0 ? totalNmae / validMetricCount : 0,
    overallR2: validMetricCount > 0 ? totalR2 / validMetricCount : 0,
    commitErrors,
  };
}

/**
 * Compare multiple benchmark runs and rank them
 */
export function compareRuns(
  runs: { name: string; metrics: Record<BenchmarkMetricName, PillarMetrics> }[]
): {
  comparisons: {
    metric: BenchmarkMetricName;
    runs: {
      name: string;
      mae: number;
      rmse: number;
      nmae: number;
      r2: number;
      maxError: number;
      directionAccuracy?: number;
    }[];
    bestRun: string;
  }[];
  rankings: { name: string; avgNmae: number; avgR2: number; rank: number }[];
  overallBest: string;
} {
  const comparisons: {
    metric: BenchmarkMetricName;
    runs: {
      name: string;
      mae: number;
      rmse: number;
      nmae: number;
      r2: number;
      maxError: number;
      directionAccuracy?: number;
    }[];
    bestRun: string;
  }[] = [];

  // Compare each metric
  for (const metric of BENCHMARK_METRICS) {
    const metricRuns = runs.map((run) => ({
      name: run.name,
      mae: run.metrics[metric].mae,
      rmse: run.metrics[metric].rmse,
      nmae: run.metrics[metric].nmae,
      r2: run.metrics[metric].r2,
      maxError: run.metrics[metric].maxError,
      directionAccuracy: run.metrics[metric].directionAccuracy,
    }));

    // Best run is the one with lowest NMAE (normalized error)
    const bestRun = metricRuns.reduce((best, current) =>
      current.nmae < best.nmae ? current : best
    ).name;

    comparisons.push({
      metric,
      runs: metricRuns,
      bestRun,
    });
  }

  // Calculate overall rankings
  const rankings = runs
    .map((run) => {
      let totalNmae = 0;
      let totalR2 = 0;
      let count = 0;

      for (const metric of BENCHMARK_METRICS) {
        if (run.metrics[metric].sampleCount > 0) {
          totalNmae += run.metrics[metric].nmae;
          totalR2 += run.metrics[metric].r2;
          count++;
        }
      }

      return {
        name: run.name,
        avgNmae: count > 0 ? totalNmae / count : Infinity,
        avgR2: count > 0 ? totalR2 / count : 0,
        rank: 0,
      };
    })
    .sort((a, b) => a.avgNmae - b.avgNmae)
    .map((r, idx) => ({ ...r, rank: idx + 1 }));

  const overallBest = rankings.length > 0 ? rankings[0].name : '';

  return { comparisons, rankings, overallBest };
}

