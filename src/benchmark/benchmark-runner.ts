// src/benchmark/benchmark-runner.ts
// Core benchmark execution logic

import * as fs from 'fs';
import * as path from 'path';
import { CommitEvaluationOrchestrator } from '../orchestrator/commit-evaluation-orchestrator';
import { loadConfig } from '../config/config-loader';
import { createAgentRegistry } from '../../cli/utils/shared.utils';
import { getCommitDiff } from '../../cli/utils/git-utils';
import { MetricsCalculationService } from '../services/metrics-calculation.service';
import { loadDataset, saveDatasetCSV } from './dataset-loader';
import { calculateAllMetrics } from './metrics-calculator';
import {
  DatasetEntry,
  PredictionEntry,
  BenchmarkResult,
  BenchmarkOptions,
  GenerateDatasetOptions,
  BenchmarkRunInfo,
} from './types';

function normalizeConcurrency(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  const n = Math.floor(value);
  return n >= 1 ? n : fallback;
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const safeConcurrency = Math.max(1, Math.floor(concurrency));
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  const runWorker = async () => {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      if (index >= items.length) {
        return;
      }
      results[index] = await worker(items[index], index);
    }
  };

  const workerCount = Math.min(safeConcurrency, items.length);
  await Promise.all(Array.from({ length: workerCount }, () => runWorker()));
  return results;
}

/**
 * Get the benchmark runs directory
 */
export function getBenchmarkRunsDir(): string {
  return path.join(process.cwd(), 'benchmarks', 'runs');
}

/**
 * Ensure benchmark directories exist
 */
function ensureBenchmarkDirs(): void {
  const runsDir = getBenchmarkRunsDir();
  if (!fs.existsSync(runsDir)) {
    fs.mkdirSync(runsDir, { recursive: true });
  }
}

/**
 * Generate a unique run name if not provided
 */
function generateRunName(config: any): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const model = config.llm.model.replace(/[^a-zA-Z0-9]/g, '-');
  return `${model}_${timestamp}`;
}

/**
 * Run a single commit evaluation and extract metrics
 */
async function evaluateCommit(
  orchestrator: CommitEvaluationOrchestrator,
  entry: DatasetEntry,
  config: any,
  onProgress?: (message: string) => void
): Promise<PredictionEntry | null> {
  const startTime = Date.now();

  try {
    // Get the diff for the commit
    const diff = getCommitDiff(entry.commitHash, entry.repoPath);

    if (!diff || diff.trim().length === 0) {
      onProgress?.(`⚠️  No diff found for commit ${entry.commitHash}`);
      return null;
    }

    const context = {
      commitDiff: diff,
      filesChanged: [],
      commitHash: entry.commitHash,
      config,
    };

    // Run evaluation with streaming disabled for benchmark
    const result = await orchestrator.evaluateCommit(context, {
      streaming: false,
      disableTracing: true,
      threadId: `benchmark-${entry.commitHash}-${Date.now()}`,
    });

    const evaluationTime = Date.now() - startTime;

    // Calculate weighted metrics from agent results
    const agentResults = result.agentResults || [];
    const metrics = MetricsCalculationService.calculateWeightedMetrics(agentResults);

    // Calculate total token usage
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    for (const agent of agentResults) {
      if (agent.tokenUsage) {
        totalInputTokens += agent.tokenUsage.inputTokens || 0;
        totalOutputTokens += agent.tokenUsage.outputTokens || 0;
      }
    }

    const prediction: PredictionEntry = {
      commitHash: entry.commitHash,
      repoPath: entry.repoPath,
      functionalImpact: metrics.functionalImpact ?? null,
      idealTimeHours: metrics.idealTimeHours ?? null,
      testCoverage: metrics.testCoverage ?? null,
      codeQuality: metrics.codeQuality ?? null,
      codeComplexity: metrics.codeComplexity ?? null,
      actualTimeHours: metrics.actualTimeHours ?? null,
      technicalDebtHours: metrics.technicalDebtHours ?? null,
      debtReductionHours: metrics.debtReductionHours ?? null,
      evaluationTime,
      tokenUsage: {
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
        totalTokens: totalInputTokens + totalOutputTokens,
      },
    };

    return prediction;
  } catch (error) {
    onProgress?.(
      `❌ Error evaluating commit ${entry.commitHash}: ${error instanceof Error ? error.message : String(error)}`
    );
    return null;
  }
}

/**
 * Run benchmark against a dataset
 */
export async function runBenchmark(
  options: BenchmarkOptions,
  onProgress?: (message: string) => void
): Promise<BenchmarkResult> {
  ensureBenchmarkDirs();

  // Load config
  const config = loadConfig();
  if (!config) {
    throw new Error('No configuration found. Run: codewave config --init');
  }

  // Apply depth mode
  if (options.depthMode) {
    config.agents.depthMode = options.depthMode;
  }

  // Load dataset
  onProgress?.(`📂 Loading dataset: ${options.datasetPath}`);
  const { entries, errors, warnings } = loadDataset(options.datasetPath);

  if (errors.length > 0) {
    throw new Error(`Dataset errors:\n${errors.join('\n')}`);
  }

  if (warnings.length > 0) {
    warnings.forEach((w) => onProgress?.(`⚠️  ${w}`));
  }

  onProgress?.(`✅ Loaded ${entries.length} commits from dataset`);

  // Create orchestrator
  const agentRegistry = createAgentRegistry(config);
  const orchestrator = new CommitEvaluationOrchestrator(agentRegistry, config);

  // Run evaluations
  const concurrency = normalizeConcurrency(options.concurrency, 1);
  if (concurrency > 1) {
    onProgress?.(`⚡ Running commit evaluations in parallel (concurrency=${concurrency})`);
  }
  const startTime = Date.now();

  const predictionResults = await mapWithConcurrency(entries, concurrency, async (entry, i) => {
    onProgress?.(`\n[${i + 1}/${entries.length}] Evaluating commit ${entry.commitHash}...`);
    const prediction = await evaluateCommit(orchestrator, entry, config, onProgress);
    if (prediction) {
      onProgress?.(
        `✅ [${i + 1}/${entries.length}] Completed in ${(prediction.evaluationTime / 1000).toFixed(1)}s`
      );
    } else {
      onProgress?.(`⚠️  [${i + 1}/${entries.length}] Failed`);
    }
    return prediction;
  });

  const predictions = predictionResults.filter((p): p is PredictionEntry => p !== null);

  const totalEvaluationTime = Date.now() - startTime;

  // Calculate metrics
  onProgress?.(`\n📊 Calculating benchmark metrics...`);
  const { metrics, overallNmae, overallR2, commitErrors } = calculateAllMetrics(
    entries,
    predictions
  );

  // Calculate total tokens
  const totalTokens = predictions.reduce((sum, p) => sum + (p.tokenUsage?.totalTokens || 0), 0);

  // Build result
  const runName = options.name || generateRunName(config);
  const result: BenchmarkResult = {
    name: runName,
    timestamp: new Date().toISOString(),
    datasetPath: options.datasetPath,
    commitCount: entries.length,
    model: config.llm.model,
    provider: config.llm.provider,
    depthMode: config.agents.depthMode || 'normal',
    metrics,
    overallNmae,
    overallR2,
    predictions,
    commitErrors,
    totalEvaluationTime,
    averageEvaluationTime: predictions.length > 0 ? totalEvaluationTime / predictions.length : 0,
    totalTokens,
  };

  // Save result
  const resultPath = path.join(getBenchmarkRunsDir(), `${runName}.json`);
  fs.writeFileSync(resultPath, JSON.stringify(result, null, 2));
  onProgress?.(`\n💾 Saved benchmark result to: ${resultPath}`);

  return result;
}

/**
 * Generate a dataset by evaluating commits
 */
export async function generateDataset(
  options: GenerateDatasetOptions,
  onProgress?: (message: string) => void
): Promise<void> {
  // Load config
  const config = loadConfig();
  if (!config) {
    throw new Error('No configuration found. Run: codewave config --init');
  }

  // Apply depth mode
  if (options.depthMode) {
    config.agents.depthMode = options.depthMode;
  }

  onProgress?.(`🚀 Generating dataset for ${options.commits.length} commits...`);
  onProgress?.(`📁 Repository: ${options.repoPath}`);
  onProgress?.(`🎯 Output: ${options.outputPath}`);

  // Create orchestrator
  const agentRegistry = createAgentRegistry(config);
  const orchestrator = new CommitEvaluationOrchestrator(agentRegistry, config);

  // Evaluate each commit
  const concurrency = normalizeConcurrency(options.concurrency, 1);
  if (concurrency > 1) {
    onProgress?.(`⚡ Running commit evaluations in parallel (concurrency=${concurrency})`);
  }

  const entries = new Array<DatasetEntry>(options.commits.length);
  await mapWithConcurrency(options.commits, concurrency, async (commitHash, i) => {
    onProgress?.(`\n[${i + 1}/${options.commits.length}] Evaluating commit ${commitHash}...`);

    const baseEntry: DatasetEntry = {
      commitHash,
      repoPath: options.repoPath,
      functionalImpact: null,
      idealTimeHours: null,
      testCoverage: null,
      codeQuality: null,
      codeComplexity: null,
      actualTimeHours: null,
      technicalDebtHours: null,
      debtReductionHours: null,
      notes: '',
    };

    const prediction = await evaluateCommit(orchestrator, baseEntry, config, onProgress);

    if (prediction) {
      entries[i] = {
        commitHash,
        repoPath: options.repoPath,
        functionalImpact: prediction.functionalImpact,
        idealTimeHours: prediction.idealTimeHours,
        testCoverage: prediction.testCoverage,
        codeQuality: prediction.codeQuality,
        codeComplexity: prediction.codeComplexity,
        actualTimeHours: prediction.actualTimeHours,
        technicalDebtHours: prediction.technicalDebtHours,
        debtReductionHours: prediction.debtReductionHours,
        notes: `Generated by ${config.llm.model}`,
      };
      onProgress?.(`✅ [${i + 1}/${options.commits.length}] Completed`);
    } else {
      entries[i] = {
        ...baseEntry,
        notes: 'EVALUATION_FAILED - please fill manually',
      };
      onProgress?.(`⚠️  [${i + 1}/${options.commits.length}] Failed - added placeholder entry`);
    }
  });

  // Save to CSV
  saveDatasetCSV(entries, options.outputPath);
  onProgress?.(`\n✅ Dataset saved to: ${options.outputPath}`);
  onProgress?.(`📝 Review and adjust values, then use as ground truth for benchmarking.`);
}

/**
 * List all benchmark runs
 */
export function listBenchmarkRuns(): BenchmarkRunInfo[] {
  const runsDir = getBenchmarkRunsDir();

  if (!fs.existsSync(runsDir)) {
    return [];
  }

  const files = fs.readdirSync(runsDir).filter((f) => f.endsWith('.json'));
  const runs: BenchmarkRunInfo[] = [];

  for (const file of files) {
    try {
      const content = fs.readFileSync(path.join(runsDir, file), 'utf-8');
      const result: BenchmarkResult = JSON.parse(content);

      runs.push({
        name: result.name,
        timestamp: result.timestamp,
        model: result.model,
        provider: result.provider,
        commitCount: result.commitCount,
        overallNmae: result.overallNmae,
        overallR2: result.overallR2,
        filePath: path.join(runsDir, file),
      });
    } catch {
      // Skip invalid files
    }
  }

  // Sort by timestamp (newest first)
  runs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  return runs;
}

/**
 * Load a benchmark result by name
 */
export function loadBenchmarkRun(name: string): BenchmarkResult | null {
  const runsDir = getBenchmarkRunsDir();
  const filePath = path.join(runsDir, `${name}.json`);

  if (!fs.existsSync(filePath)) {
    return null;
  }

  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

/**
 * Load multiple benchmark runs for comparison
 */
export function loadBenchmarkRuns(names: string[]): BenchmarkResult[] {
  const results: BenchmarkResult[] = [];

  for (const name of names) {
    const result = loadBenchmarkRun(name);
    if (result) {
      results.push(result);
    }
  }

  return results;
}
