// src/benchmark/types.ts
// Type definitions for the benchmark system

/**
 * The 8 pillar metrics that are benchmarked
 */
export const BENCHMARK_METRICS = [
  'functionalImpact',
  'idealTimeHours',
  'testCoverage',
  'codeQuality',
  'codeComplexity',
  'actualTimeHours',
  'technicalDebtHours',
  'debtReductionHours',
] as const;

export type BenchmarkMetricName = (typeof BENCHMARK_METRICS)[number];

/**
 * A single row in the ground truth dataset
 */
export interface DatasetEntry {
  commitHash: string;
  repoPath: string;
  functionalImpact: number | null;
  idealTimeHours: number | null;
  testCoverage: number | null;
  codeQuality: number | null;
  codeComplexity: number | null;
  actualTimeHours: number | null;
  technicalDebtHours: number | null;
  debtReductionHours: number | null;
  notes?: string;
}

/**
 * Prediction result for a single commit
 */
export interface PredictionEntry {
  commitHash: string;
  repoPath: string;
  functionalImpact: number | null;
  idealTimeHours: number | null;
  testCoverage: number | null;
  codeQuality: number | null;
  codeComplexity: number | null;
  actualTimeHours: number | null;
  technicalDebtHours: number | null;
  debtReductionHours: number | null;
  evaluationTime: number; // Time taken to evaluate in ms
  tokenUsage?: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
}

/**
 * Error metrics for a single pillar
 */
export interface PillarMetrics {
  mae: number; // Mean Absolute Error (lower is better)
  rmse: number; // Root Mean Squared Error (lower is better)
  nmae: number; // Normalized MAE as percentage (lower is better)
  r2: number; // R-squared / coefficient of determination (higher is better)
  maxError: number; // Maximum absolute error (lower is better)
  directionAccuracy?: number; // % correct direction for +/- metrics (higher is better)
  sampleCount: number; // Number of non-null comparisons
}

/**
 * Per-commit error details
 */
export interface CommitError {
  commitHash: string;
  errors: Record<BenchmarkMetricName, number | null>; // Prediction - Actual
  absoluteErrors: Record<BenchmarkMetricName, number | null>;
}

/**
 * Complete benchmark results for a single run
 */
export interface BenchmarkResult {
  name: string; // Run name (e.g., "claude-sonnet-baseline")
  timestamp: string; // ISO timestamp
  datasetPath: string; // Path to ground truth CSV
  commitCount: number; // Number of commits evaluated
  model: string; // Model used (e.g., "claude-sonnet-4-20250514")
  provider: string; // Provider (e.g., "anthropic")
  depthMode: 'fast' | 'normal' | 'deep';

  // Aggregate metrics per pillar
  metrics: Record<BenchmarkMetricName, PillarMetrics>;

  // Overall summary metrics
  overallNmae: number; // Average NMAE across all pillars
  overallR2: number; // Average R² across all pillars

  // Per-commit details
  predictions: PredictionEntry[];
  commitErrors: CommitError[];

  // Performance stats
  totalEvaluationTime: number; // Total time in ms
  averageEvaluationTime: number; // Average time per commit in ms
  totalTokens?: number;
}

/**
 * Options for running a benchmark
 */
export interface BenchmarkOptions {
  datasetPath: string;
  name?: string; // Optional run name
  outputPath?: string; // Optional JSON output path
  depthMode?: 'fast' | 'normal' | 'deep';
  silent?: boolean; // Suppress progress output
  concurrency?: number; // Number of commits to evaluate in parallel (default: 1)
}

/**
 * Options for comparing benchmark runs
 */
export interface CompareOptions {
  runNames?: string[]; // Specific runs to compare
  all?: boolean; // Compare all runs in benchmarks/runs/
}

/**
 * Options for generating a dataset
 */
export interface GenerateDatasetOptions {
  commits: string[]; // Commit hashes to evaluate
  repoPath: string;
  outputPath: string;
  depthMode?: 'fast' | 'normal' | 'deep';
  concurrency?: number; // Number of commits to evaluate in parallel (default: 1)
}

/**
 * Saved benchmark run metadata (for listing)
 */
export interface BenchmarkRunInfo {
  name: string;
  timestamp: string;
  model: string;
  provider: string;
  commitCount: number;
  overallNmae: number;
  overallR2: number;
  filePath: string;
}
