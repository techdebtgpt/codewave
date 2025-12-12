#!/usr/bin/env node

import { AppConfig } from '../../src/config/config.interface';
import { loadConfig } from '../../src/config/config-loader';
import { CommitEvaluationOrchestrator } from '../../src/orchestrator/commit-evaluation-orchestrator';
import {
  createAgentRegistry,
  saveEvaluationReports,
  createEvaluationDirectory,
  EvaluationMetadata,
  printBatchCompletionMessage,
  getEvaluationRoot,
} from '../utils/shared.utils';
import { ProgressTracker } from '../utils/progress-tracker';
import { CostEstimatorService } from '../../src/services/cost-estimator.service';
import { parseCommitStats } from '../../src/common/utils/commit-utils';
import { consoleManager } from '../../src/common/utils/console-manager';
import { getCommitDiff, extractFilesFromDiff } from '../utils/git-utils';
import { isDiagnosticLog } from '../utils/diagnostic-filter';
import { spawnSync } from 'child_process';
import {
  calculateWeightedAverage,
  PillarName,
  SEVEN_PILLARS,
} from '../../src/constants/agent-weights.constants';
import { promptAndGenerateOkrs } from '../utils/okr-prompt.utils';
import inquirer from 'inquirer';
import pLimit from 'p-limit';

interface CommitInfo {
  hash: string;
  author: string;
  email: string;
  date: string;
  message: string;
}

interface CommitEvaluationResult {
  commit: CommitInfo;
  agentResults: any[];
  outputDir: string;
  metrics: {
    functionalImpact: number;
    idealTimeHours: number;
    testCoverage: number;
    codeQuality: number;
    codeComplexity: number;
    actualTimeHours: number;
    technicalDebtHours: number;
    debtReductionHours: number;
  };
}

export async function runBatchEvaluateCommand(args: string[]) {
  console.log('🌊 CodeWave: Starting batch commit analysis...\n');

  // Parse arguments
  const options = parseArguments(args);

  // Default to current directory if --repo not provided
  if (!options.repository) {
    options.repository = '.';
  }

  // Load configuration
  const config = loadConfig();
  if (!config) {
    console.error('❌ Config file not found. Run `codewave config --init` to create one.');
    process.exit(1);
  }
  validateConfig(config);

  // Apply depth mode from CLI to config
  config.agents.depthMode = (options.depth || 'normal') as 'fast' | 'normal' | 'deep';

  // Get commits to evaluate
  const commits = await getCommitsToEvaluate(options);

  if (commits.length === 0) {
    console.log('ℹ️  No commits found matching the criteria');
    process.exit(0);
  }

  console.log(`📋 Found ${commits.length} commit${commits.length > 1 ? 's' : ''} to evaluate\n`);

  const depthModeLabel = {
    fast: '⚡ Fast (minimal refinement)',
    normal: '⚙️  Normal (balanced)',
    deep: '🔍 Deep (thorough analysis)',
  };
  console.log(`📊 Analysis depth: ${depthModeLabel[config.agents.depthMode]}\n`);

  console.log(`📁 Evaluating commits into: .evaluated-commits/\n`);

  // Estimate cost before proceeding
  const estimator = new CostEstimatorService(config);
  const costEstimate = estimator.estimateForCommits(commits.length);
  if (costEstimate !== null) {
    estimator.printEstimate(costEstimate, commits.length);

    const { proceed } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'proceed',
        message: `Continue with evaluation? (estimated cost: ${estimator.formatAverageCost(costEstimate)})`,
        default: true,
      },
    ]);

    if (!proceed) {
      console.log('\n❌ Batch evaluation cancelled.\n');
      process.exit(0);
    }
  }

  console.log();

  // Initialize orchestrator with all agents
  const agentRegistry = createAgentRegistry(config);
  const orchestrator = new CommitEvaluationOrchestrator(agentRegistry, config);

  // Configure concurrency limit (10 concurrent evaluations)
  const limit = pLimit(10);

  // Buffer for storing suppressed output (warnings, errors)
  const suppressedOutput: Array<{ type: string; args: any[] }> = [];

  // Initialize progress tracker
  // Note: ProgressTracker now uses consoleManager internally for headers
  const progressTracker = new ProgressTracker();
  progressTracker.initialize(
    commits.map((c) => ({
      hash: c.hash,
      shortHash: c.hash.substring(0, 7),
      author: c.author,
      date: new Date(c.date).toISOString().split('T')[0], // YYYY-MM-DD format
    }))
  );

  // Start suppressing output using ConsoleManager
  consoleManager.startSuppressing((args, type) => {
    // Check if it's a diagnostic log that should be completely ignored
    if (isDiagnosticLog(args)) {
      return true; // Suppress and ignore
    }

    // If it's NOT a diagnostic log, it's an important message/error
    // Buffer it to show after progress bars complete
    suppressedOutput.push({ type, args });

    return true; // Suppress printing NOW
  });

  // Override process.stdout.write to suppress orchestrator progress lines
  // Note: We keep this manual override as ConsoleManager doesn't handle process.stdout.write
  const originalStdoutWrite = process.stdout.write.bind(process.stdout);
  (process.stdout.write as any) = function (str: string, ...args: any[]): boolean {
    // Block orchestrator progress lines like "  [1/2] ✅ 33% [5/15] business-analyst"
    if (/^\s+\[[\d]+\/[\d]+\]/.test(str)) {
      return true; // Suppress
    }
    // Block OKR generation progress lines (e.g., "   📝 Generating comprehensive OKR draft...")
    if (/^\s+[📝🧐✨]/u.test(str)) {
      return true; // Suppress
    }
    // Block explicit newlines from progress tracking
    if (str === '\n' || str === '\r\n') {
      return true; // Suppress
    }
    // Block carriage return progress updates
    if (str.startsWith('\r')) {
      return true; // Suppress
    }
    return originalStdoutWrite(str, ...args);
  };

  // Evaluate commits with concurrency control
  const results: CommitEvaluationResult[] = [];

  // Create evaluation tasks
  const evaluationTasks = commits.map((commit, i) =>
    limit(() => evaluateCommit(commit, i, options, config, orchestrator, progressTracker))
  );

  // Execute all tasks with concurrency limit
  // Use Promise.allSettled to capture all results (fulfilled or rejected)
  // This prevents race conditions and ensures we process all completed work
  let evaluationResults: any[];
  try {
    // Use Promise.allSettled to:
    // 1. Capture all results (fulfilled or rejected) without early termination
    // 2. Process whatever completed, even if some failed
    const settledResults = await Promise.allSettled(evaluationTasks);

    // Filter to only include fulfilled results
    evaluationResults = settledResults
      .filter((result) => result.status === 'fulfilled')
      .map((result) => (result as PromiseFulfilledResult<any>).value);
  } catch (error) {
    // Stop suppressing before printing error
    consoleManager.stopSuppressing();
    process.stdout.write = originalStdoutWrite as any;

    console.log(
      `\n❌ Batch evaluation error: ${error instanceof Error ? error.message : String(error)}`
    );

    progressTracker.finalize();
    throw error;
  }

  // Restore console methods and process stdout
  consoleManager.stopSuppressing();
  process.stdout.write = originalStdoutWrite as any;

  // Wait a moment to ensure all progress updates are rendered before finalizing
  await new Promise((resolve) => setTimeout(resolve, 100));

  // Finalize progress tracker
  progressTracker.finalize();

  // Display any buffered warnings/errors after progress is complete
  if (suppressedOutput.length > 0) {
    console.log('\n📋 Notices from evaluation phase:');
    suppressedOutput.forEach((output) => {
      if (output.type === 'warn') {
        consoleManager.warnImportant('  ⚠️ ', ...output.args);
      } else if (output.type === 'error') {
        consoleManager.errorImportant('  ❌ ', ...output.args);
      } else if (output.type === 'log') {
        consoleManager.logImportant('  ℹ️ ', ...output.args);
      }
    });
    console.log();
  }

  // Filter out null results (failed or skipped commits)
  results.push(...evaluationResults.filter((r): r is CommitEvaluationResult => r !== null));

  // Get summary from tracker
  const summary = progressTracker.getSummary();

  // Print final summary using shared output function
  printBatchCompletionMessage(summary);

  // Prompt for OKR generation (DRY - using shared helper)
  if (summary.complete > 0) {
    // Extract unique authors from successful evaluations
    const uniqueAuthors = new Set<string>();
    results.forEach((result) => {
      if (result.commit.author) {
        uniqueAuthors.add(result.commit.author);
      }
    });

    const authors = Array.from(uniqueAuthors);
    if (authors.length > 0) {
      const evalRoot = getEvaluationRoot();
      await promptAndGenerateOkrs(config, authors, evalRoot, {
        sinceDate: options.since ? new Date(options.since) : undefined,
        silent: true, // Suppress OKR progress display during batch evaluation
        concurrency: 10, // Match batch evaluation concurrency
      });
    }
  }
}

async function evaluateCommit(
  commit: CommitInfo,
  index: number,
  options: any,
  config: AppConfig,
  orchestrator: CommitEvaluationOrchestrator,
  progressTracker: ProgressTracker
): Promise<CommitEvaluationResult | null> {
  try {
    // Get commit diff
    const diff = await getCommitDiff(commit.hash, options.repository);

    // Calculate diff size and stats for progress display
    const diffSizeKB = (diff.length / 1024).toFixed(1);
    const additions = (diff.match(/^\+[^+]/gm) || []).length;
    const deletions = (diff.match(/^-[^-]/gm) || []).length;

    // Mark as started with diff stats
    progressTracker.updateProgress(commit.hash, {
      status: 'analyzing',
      progress: 0,
      currentStep: 'Starting evaluation...',
      diffSizeKB: `${diffSizeKB}KB`,
      additions,
      deletions,
    });

    if (!diff || diff.trim().length === 0) {
      progressTracker.updateProgress(commit.hash, {
        status: 'failed',
        progress: 0,
        currentStep: 'Empty diff - skipped',
      });
      return null;
    }

    // Extract files changed from diff
    const filesChanged = extractFilesFromDiff(diff);

    // Track agent progress
    let maxRounds = config.agents.maxRounds || config.agents.retries || 3;
    let commitTokensInput = 0;
    let commitTokensOutput = 0;
    let commitCost = 0;
    let vectorChunks = 0;
    let vectorFiles = filesChanged.length;

    // Evaluate commit
    const evaluationResult = await orchestrator.evaluateCommit(
      {
        commitDiff: diff,
        filesChanged,
        commitHash: commit.hash,
        commitIndex: index + 1,
        totalCommits: 1, // Not used in batch context
      },
      {
        streaming: options.streaming,
        disableTracing: true,
        onProgress: (state: any) => {
          if (state.type === 'vectorizing') {
            vectorChunks = state.total;
            progressTracker.updateProgress(commit.hash, {
              status: 'vectorizing',
              progress: state.progress,
              currentStep: `${diffSizeKB}KB | ${state.current}/${state.total} chunks | +${additions}/-${deletions}`,
              chunks: state.total,
              files: vectorFiles,
            });
          } else if (state.agentResults !== undefined) {
            const currentRound = state.currentRound || 0;
            maxRounds = state.maxRounds || 3;

            if (state.totalInputTokens !== undefined) commitTokensInput = state.totalInputTokens;
            if (state.totalOutputTokens !== undefined) commitTokensOutput = state.totalOutputTokens;
            if (state.totalCost !== undefined) commitCost = state.totalCost;

            const totalAgents = state.totalAgents || 5;
            const completedAgents = state.completedAgents || 0;
            const roundProgress = currentRound / maxRounds;
            const agentProgressInRound = completedAgents / totalAgents / maxRounds;
            const totalProgress = Math.floor((roundProgress + agentProgressInRound) * 100);

            progressTracker.updateProgress(commit.hash, {
              status: 'analyzing',
              progress: totalProgress,
              inputTokens: commitTokensInput,
              outputTokens: commitTokensOutput,
              totalCost: commitCost,
              currentRound,
              maxRounds,
              currentAgent: state.currentAgent,
              chunks: vectorChunks,
              files: vectorFiles,
            });
          }
        },
      }
    );

    const agentResults = evaluationResult.agentResults || [];
    const shortHash = commit.hash.substring(0, 8);
    const commitOutputDir = await createEvaluationDirectory(shortHash);
    const commitStats = parseCommitStats(diff);

    const metadata: EvaluationMetadata = {
      timestamp: new Date().toISOString(),
      commitHash: commit.hash,
      commitAuthor: commit.author,
      commitMessage: commit.message,
      commitDate: commit.date,
      source: 'batch',
      commitStats,
    };

    await saveEvaluationReports({
      agentResults,
      outputDir: commitOutputDir,
      metadata,
      diff,
      developerOverview: evaluationResult.developerOverview,
    });

    const metrics = calculateAggregateMetrics(agentResults);

    // Extract internal iteration metrics
    let totalInternalIterations = 0;
    let avgClarityScore = 0;
    let agentCount = 0;

    agentResults.forEach((result: any) => {
      if (result.internalIterations !== undefined) {
        totalInternalIterations += result.internalIterations;
        agentCount++;
      }
      if (result.clarityScore !== undefined) {
        avgClarityScore += result.clarityScore;
      }
    });

    if (agentCount > 0) {
      avgClarityScore = Math.round(avgClarityScore / agentCount);
    }

    progressTracker.updateProgress(commit.hash, {
      status: 'complete',
      progress: 100,
      currentStep: '✅ Complete',
      inputTokens: commitTokensInput,
      outputTokens: commitTokensOutput,
      totalCost: commitCost,
      internalIterations: agentCount > 0 ? totalInternalIterations : undefined,
      clarityScore: agentCount > 0 ? avgClarityScore : undefined,
      currentRound: maxRounds - 1,
      maxRounds,
      chunks: vectorChunks,
      files: vectorFiles,
    });

    return {
      commit,
      agentResults,
      outputDir: commitOutputDir,
      metrics,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : '';
    console.log(`❌ Error evaluating ${commit.hash}: ${errorMsg}`);
    if (errorStack) {
      console.log(`Stack: ${errorStack.substring(0, 300)}`);
    }

    progressTracker.updateProgress(commit.hash, {
      status: 'failed',
      progress: 0,
      currentStep: `Error: ${errorMsg.substring(0, 30)}`,
      errorMessage: errorMsg,
    });

    return null;
  }
}

function parseArguments(args: string[]): any {
  const options: any = {
    repository: null,
    since: null,
    until: null,
    count: null,
    branch: 'HEAD',
    depth: 'normal', // Default depth mode
    streaming: true, // Streaming enabled by default
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case '--repo':
      case '-r':
        options.repository = args[++i];
        break;
      case '--since':
        options.since = args[++i];
        break;
      case '--until':
        options.until = args[++i];
        break;
      case '--count':
      case '-n':
        options.count = parseInt(args[++i], 10);
        break;
      case '--branch':
      case '-b':
        options.branch = args[++i];
        break;
      case '--depth':
      case '-d': {
        const depthValue = args[++i]?.toLowerCase();
        if (['fast', 'normal', 'deep'].includes(depthValue)) {
          options.depth = depthValue;
        } else {
          console.warn(
            `⚠️  Invalid depth mode: ${depthValue}. Use 'fast', 'normal', or 'deep'. Defaulting to 'normal'.`
          );
        }
        break;
      }
      case '--no-stream':
        options.streaming = false;
        break;
      default:
        console.warn(`⚠️  Unknown option: ${arg}`);
    }
  }

  return options;
}

async function getCommitsToEvaluate(options: any): Promise<CommitInfo[]> {
  const gitArgs: string[] = ['log', '--format=%H|%an|%ae|%ai|%s', options.branch];

  if (options.since) {
    gitArgs.push(`--since=${options.since}`);
  }
  if (options.until) {
    gitArgs.push(`--until=${options.until}`);
  }
  if (options.count) {
    gitArgs.push('-n', options.count.toString());
  }

  // Use spawnSync instead of execSync to avoid shell interpretation issues
  const result = spawnSync('git', gitArgs, {
    cwd: options.repository,
    encoding: 'utf-8',
  });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`Git command failed: ${result.stderr}`);
  }

  const output = result.stdout;

  const commits: CommitInfo[] = [];
  const lines = output.trim().split('\n');

  for (const line of lines) {
    if (!line) continue;
    const [hash, author, email, date, message] = line.split('|');
    commits.push({ hash, author, email, date, message });
  }

  return commits;
}

function calculateAggregateMetrics(agentResults: any[]): any {
  const metrics: Record<PillarName, number> = {
    functionalImpact: 0,
    idealTimeHours: 0,
    testCoverage: 0,
    codeQuality: 0,
    codeComplexity: 0,
    actualTimeHours: 0,
    technicalDebtHours: 0,
    debtReductionHours: 0,
  };

  // Import weighted aggregation

  // Get latest metrics from each agent
  const agentMetricsMap = new Map<string, any>();
  agentResults.forEach((result) => {
    if (result.metrics && result.agentRole) {
      agentMetricsMap.set(result.agentRole, result.metrics);
    }
  });

  // Calculate weighted average for each metric
  SEVEN_PILLARS.forEach((metricName: PillarName) => {
    const contributors: Array<{ agentName: string; score: number }> = [];
    agentMetricsMap.forEach((agentMetrics, agentRole) => {
      if (agentMetrics[metricName] !== undefined) {
        contributors.push({
          agentName: agentRole,
          score: agentMetrics[metricName],
        });
      }
    });

    if (contributors.length > 0) {
      const weightedValue = calculateWeightedAverage(contributors, metricName);
      if (weightedValue !== null) {
        metrics[metricName] = weightedValue;
      }
    }
  });

  return metrics;
}

function validateConfig(config: AppConfig) {
  if (!config.apiKeys || Object.keys(config.apiKeys).length === 0) {
    console.error('❌ No API keys configured. Run `npm run config` to set up.');
    process.exit(1);
  }
}
