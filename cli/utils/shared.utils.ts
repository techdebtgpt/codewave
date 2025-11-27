// cli/utils/shared.utils.ts
// Shared utilities for CLI commands to eliminate duplication

import { AgentRegistry } from '../../src/agents/agent-registry';
import { BusinessAnalystAgent } from '../../src/agents/implementations/business-analyst-agent';
import { SDETAgent } from '../../src/agents/implementations/sdet-agent';
import { DeveloperAuthorAgent } from '../../src/agents/implementations/developer-author-agent';
import { SeniorArchitectAgent } from '../../src/agents/implementations/senior-architect-agent';
import { DeveloperReviewerAgent } from '../../src/agents/implementations/developer-reviewer-agent';
import { AppConfig } from '../../src/config/config.interface';
import { generateEnhancedHtmlReport } from '../../src/formatters/html-report-formatter-enhanced';
import { generateConversationTranscript } from '../../src/formatters/conversation-transcript-formatter';
import { AgentResult } from '../../src/agents/agent.interface';
import {
  TokenSnapshot,
  MetricsSnapshot,
  EvaluationHistoryEntry,
} from '../../src/types/output.types';
import fs from 'fs/promises';
import * as fsSync from 'fs';
import path from 'path';

/**
 * Generate timestamp in yyyyMMddHHmmss format
 */
export function generateTimestamp(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  return `${year}${month}${day}${hours}${minutes}${seconds}`;
}

/**
 * Create and register agents based on config.agents.enabled list
 * Agent IDs: 'business-analyst', 'sdet', 'developer-author', 'senior-architect', 'developer-reviewer'
 */
export function createAgentRegistry(config: AppConfig): AgentRegistry {
  const agentRegistry = new AgentRegistry();
  const enabledAgents = config.agents.enabled || [
    'business-analyst',
    'sdet',
    'developer-author',
    'senior-architect',
    'developer-reviewer',
  ];

  // Validate that at least one agent is enabled
  if (!enabledAgents || enabledAgents.length === 0) {
    console.warn('⚠️  No agents enabled in config. Enabling all agents by default.');
    enabledAgents.push(
      'business-analyst',
      'sdet',
      'developer-author',
      'senior-architect',
      'developer-reviewer'
    );
  }

  // Register agents based on enabled list
  const agentMap: Record<string, () => any> = {
    'business-analyst': () => new BusinessAnalystAgent(config),
    sdet: () => new SDETAgent(config),
    'developer-author': () => new DeveloperAuthorAgent(config),
    'senior-architect': () => new SeniorArchitectAgent(config),
    'developer-reviewer': () => new DeveloperReviewerAgent(config),
  };

  for (const agentId of enabledAgents) {
    if (agentMap[agentId]) {
      agentRegistry.register(agentMap[agentId]());
    } else {
      console.warn(`⚠️  Unknown agent: ${agentId}. Skipping.`);
    }
  }

  return agentRegistry;
}

/**
 * Metadata for a commit evaluation
 */
export interface EvaluationMetadata {
  commitHash?: string;
  commitAuthor?: string;
  commitDate?: string;
  commitMessage?: string;
  timestamp?: string;
  source?: string; // 'commit', 'staged', 'current', 'file'
  developerOverview?: string;
  commitStats?: {
    filesChanged: number;
    insertions: number;
    deletions: number;
  };
}

/**
 * Options for saving evaluation reports
 */
export interface SaveReportsOptions {
  outputDir: string;
  diff: string;
  agentResults: AgentResult[];
  metadata?: EvaluationMetadata;
  developerOverview?: string;
}

/**
 * Save all evaluation reports to a directory
 * Creates a consistent structure:
 * - report-enhanced.html
 * - conversation.md
 * - results.json
 * - summary.txt
 * - commit.diff
 * - history.json (tracks re-evaluations)
 */
export async function saveEvaluationReports(options: SaveReportsOptions): Promise<void> {
  const { outputDir, diff, agentResults, metadata = {}, developerOverview } = options;

  // Ensure output directory exists
  await fs.mkdir(outputDir, { recursive: true });

  // Track evaluation history with metrics and tokens
  await trackEvaluationHistory(outputDir, metadata, agentResults);

  // 1. Save results.json
  const resultsJson = {
    timestamp: metadata.timestamp || new Date().toISOString(),
    metadata: {
      commitHash: metadata.commitHash,
      commitAuthor: metadata.commitAuthor,
      commitDate: metadata.commitDate,
      commitMessage: metadata.commitMessage,
      source: metadata.source,
    },
    developerOverview: developerOverview || null,
    agents: agentResults,
  };
  await fs.writeFile(path.join(outputDir, 'results.json'), JSON.stringify(resultsJson, null, 2));

  // 2. Generate HTML report
  generateEnhancedHtmlReport(agentResults, path.join(outputDir, 'report-enhanced.html'), {
    commitHash: metadata.commitHash,
    commitAuthor: metadata.commitAuthor,
    commitMessage: metadata.commitMessage,
    commitDate: metadata.commitDate,
    timestamp: metadata.timestamp || new Date().toISOString(),
    developerOverview,
    filesChanged: metadata.commitStats?.filesChanged,
    insertions: metadata.commitStats?.insertions,
    deletions: metadata.commitStats?.deletions,
  });

  // 3. Generate conversation transcript
  generateConversationTranscript(agentResults, path.join(outputDir, 'conversation.md'), {
    commitHash: metadata.commitHash,
    timestamp: metadata.timestamp || new Date().toISOString(),
  });

  // 4. Save commit diff
  await fs.writeFile(path.join(outputDir, 'commit.diff'), diff);

  // 5. Generate summary text
  const summary = generateSummaryText(agentResults, metadata);
  await fs.writeFile(path.join(outputDir, 'summary.txt'), summary);

  // 6. Update evaluation index
  try {
    await updateEvaluationIndex(outputDir, metadata);
  } catch (indexError) {
    console.error(
      'Failed to update evaluation index:',
      indexError instanceof Error ? indexError.message : String(indexError)
    );
    throw indexError; // Re-throw to propagate the error
  }
}

/**
 * Extract metrics from final round agent results (last 5 agents)
 */
function extractMetricsSnapshot(agentResults: AgentResult[]): MetricsSnapshot {
  // Get final round agents (last 5)
  const finalAgents = agentResults.slice(-5);

  // Import weight functions for weighted averaging
  const {
    calculateWeightedAverage,
    SEVEN_PILLARS,
  } = require('../../src/constants/agent-weights.constants');

  const metrics = SEVEN_PILLARS;

  const result: any = {};

  // Calculate weighted average for each metric
  metrics.forEach((metricName: string) => {
    const contributors: Array<{ agentName: string; score: number | null }> = [];
    finalAgents.forEach((agent) => {
      if (agent.metrics && metricName in agent.metrics) {
        const score = agent.metrics[metricName];
        contributors.push({
          agentName: agent.agentName || agent.agentRole || 'Unknown',
          score: score !== null && score !== undefined ? score : null,
        });
      }
    });

    if (contributors.length > 0) {
      const weightedValue = calculateWeightedAverage(contributors, metricName);
      // Determine decimal places based on metric
      if (metricName.includes('Hours') || metricName.includes('Time')) {
        result[metricName] = Number(weightedValue.toFixed(2));
      } else {
        result[metricName] = Number(weightedValue.toFixed(1));
      }
    } else {
      result[metricName] = 0;
    }
  });

  return {
    functionalImpact: result.functionalImpact,
    idealTimeHours: result.idealTimeHours,
    testCoverage: result.testCoverage,
    codeQuality: result.codeQuality,
    codeComplexity: result.codeComplexity,
    actualTimeHours: result.actualTimeHours,
    technicalDebtHours: result.technicalDebtHours,
    debtReductionHours: result.debtReductionHours,
  };
}

/**
 * Extract token usage from all agent results
 */
function extractTokenSnapshot(agentResults: AgentResult[]): TokenSnapshot {
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalCost = 0;

  agentResults.forEach((agent) => {
    if (agent.tokenUsage) {
      totalInputTokens += agent.tokenUsage.inputTokens || 0;
      totalOutputTokens += agent.tokenUsage.outputTokens || 0;
    }
  });

  // Calculate cost based on provider and model
  const inputPrice = 3.0; // Anthropic Claude 3.5 Sonnet: $3/1M
  const outputPrice = 15.0; // $15/1M
  totalCost =
    (totalInputTokens / 1000000) * inputPrice + (totalOutputTokens / 1000000) * outputPrice;

  return {
    inputTokens: totalInputTokens,
    outputTokens: totalOutputTokens,
    totalTokens: totalInputTokens + totalOutputTokens,
    totalCost: Number(totalCost.toFixed(4)),
  };
}

/**
 * Calculate convergence score from agent results
 */
function calculateConvergenceScore(agentResults: AgentResult[]): number {
  if (agentResults.length < 5) return 0;

  // Get final round agents
  const finalAgents = agentResults.slice(-5);

  // Simple convergence check: measure variance in code quality scores
  const qualityScores = finalAgents
    .filter((a) => a.metrics && a.metrics.codeQuality)
    .map((a) => a.metrics!.codeQuality);

  if (qualityScores.length < 2) return 0;

  const mean = qualityScores.reduce((a, b) => a + b, 0) / qualityScores.length;
  const variance =
    qualityScores.reduce((sum, score) => sum + Math.pow(score - mean, 2), 0) / qualityScores.length;
  const stdDev = Math.sqrt(variance);

  // Convergence score: 0 if stdDev > 2, 1 if stdDev == 0, linear in between
  const convergence = Math.max(0, 1 - stdDev / 2);
  return Number(convergence.toFixed(2));
}

/**
 * Track evaluation history for re-evaluations
 * Maintains a history.json file with full metrics snapshots for each evaluation
 */
async function trackEvaluationHistory(
  outputDir: string,
  metadata: EvaluationMetadata,
  agentResults?: AgentResult[]
): Promise<void> {
  const historyPath = path.join(outputDir, 'history.json');

  let history: EvaluationHistoryEntry[] = [];

  // Read existing history
  try {
    const content = await fs.readFile(historyPath, 'utf-8');
    history = JSON.parse(content);
  } catch {
    // No history yet
    history = [];
  }

  // Extract metrics and tokens if agent results provided
  const newEntry: EvaluationHistoryEntry = {
    timestamp: metadata.timestamp || new Date().toISOString(),
    source: metadata.source || 'unknown',
    evaluationNumber: history.length + 1,
    metrics: agentResults
      ? extractMetricsSnapshot(agentResults)
      : {
          functionalImpact: 0,
          idealTimeHours: 0,
          testCoverage: 0,
          codeQuality: 0,
          codeComplexity: 0,
          actualTimeHours: 0,
          technicalDebtHours: 0,
          debtReductionHours: 0,
        },
    tokens: agentResults
      ? extractTokenSnapshot(agentResults)
      : {
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
          totalCost: 0,
        },
    convergenceScore: agentResults ? calculateConvergenceScore(agentResults) : 0,
  };

  history.push(newEntry);

  // Write back
  await fs.writeFile(historyPath, JSON.stringify(history, null, 2));
}

/**
 * Generate summary text from agent results
 */
function generateSummaryText(agentResults: AgentResult[], metadata: EvaluationMetadata): string {
  const lines: string[] = [];

  lines.push('='.repeat(80));
  lines.push('COMMIT EVALUATION SUMMARY');
  lines.push('='.repeat(80));
  lines.push('');

  if (metadata.commitHash) {
    lines.push(`Commit: ${metadata.commitHash}`);
  }
  if (metadata.commitAuthor) {
    lines.push(`Author: ${metadata.commitAuthor}`);
  }
  if (metadata.commitDate) {
    lines.push(`Date: ${metadata.commitDate}`);
  }
  if (metadata.commitMessage) {
    lines.push(`Message: ${metadata.commitMessage}`);
  }
  if (metadata.source) {
    lines.push(`Source: ${metadata.source}`);
  }
  if (metadata.timestamp) {
    lines.push(`Evaluated: ${metadata.timestamp}`);
  }

  lines.push('');
  lines.push('-'.repeat(80));
  lines.push('AGENT EVALUATIONS');
  lines.push('-'.repeat(80));
  lines.push('');

  for (const result of agentResults) {
    lines.push(`Agent: ${result.agentName || 'Unknown'}`);

    if (result.metrics) {
      lines.push('Metrics:');
      for (const [key, value] of Object.entries(result.metrics)) {
        lines.push(`  ${key}: ${value}`);
      }
    }

    if (result.summary) {
      lines.push('Summary:');
      lines.push(`  ${result.summary}`);
    }

    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Get the root evaluation directory
 * Returns: .evaluated-commits/
 */
export function getEvaluationRoot(baseDir: string = '.'): string {
  return path.join(baseDir, '.evaluated-commits');
}

/**
 * Create evaluation directory for a commit
 * Format: .evaluated-commits/{commitHash}/
 * Works for both single and batch evaluations - always updates the same folder
 */
export async function createEvaluationDirectory(
  commitHash: string,
  baseDir: string = '.'
): Promise<string> {
  const evaluationsRoot = getEvaluationRoot(baseDir);
  const commitDir = path.join(evaluationsRoot, commitHash);

  await fs.mkdir(commitDir, { recursive: true });

  return commitDir;
}

/**
 * Calculate averaged metrics from agent results using weighted averaging (matching report calculations)
 */
async function calculateAveragedMetrics(evaluationDir: string): Promise<any> {
  const { MetricsCalculationService } = await import(
    '../../src/services/metrics-calculation.service.js'
  );
  return MetricsCalculationService.loadMetricsFromDirectory(evaluationDir);
}

/**
 * Get or create an evaluation index
 * Maintains index.json and generates index.html showing all evaluations
 */
export async function updateEvaluationIndex(
  evaluationDir: string,
  metadata: EvaluationMetadata
): Promise<void> {
  const evaluationsRoot = path.dirname(evaluationDir);
  const indexJsonPath = path.join(evaluationsRoot, 'index.json');
  const indexHtmlPath = path.join(evaluationsRoot, 'index.html');

  let index: any[] = [];

  // Read existing index
  try {
    const content = await fs.readFile(indexJsonPath, 'utf-8');
    index = JSON.parse(content);
  } catch {
    // Index doesn't exist yet, start fresh
    index = [];
  }

  // Calculate averaged metrics
  const metrics = await calculateAveragedMetrics(evaluationDir);

  // Find existing entry or create new one
  const dirName = path.basename(evaluationDir);
  const existingIndex = index.findIndex((item) => item.directory === dirName);

  const entry = {
    directory: dirName,
    commitHash: metadata.commitHash || dirName,
    commitAuthor: metadata.commitAuthor,
    commitMessage: metadata.commitMessage,
    commitDate: metadata.commitDate,
    source: metadata.source,
    lastEvaluated: metadata.timestamp || new Date().toISOString(),
    evaluationCount: 1,
    metrics: metrics, // Add averaged metrics
  };

  if (existingIndex >= 0) {
    // Update existing entry
    entry.evaluationCount = (index[existingIndex].evaluationCount || 0) + 1;
    index[existingIndex] = entry;
  } else {
    // Add new entry
    index.push(entry);
  }

  // Sort by commit date (newest first), then by last evaluated as tiebreaker
  index.sort(
    (a, b) =>
      new Date(b.commitDate).getTime() - new Date(a.commitDate).getTime() ||
      new Date(b.lastEvaluated).getTime() - new Date(a.lastEvaluated).getTime()
  );

  // Write JSON index
  await fs.writeFile(indexJsonPath, JSON.stringify(index, null, 2));

  // Generate HTML index
  await generateIndexHtml(indexHtmlPath, index);
}

/**
 * Generate HTML index showing all evaluations
 */
async function generateIndexHtml(indexPath: string, index: any[]): Promise<void> {
  // Group commits by author
  const byAuthor = new Map<string, any[]>();
  index.forEach((item) => {
    const author = item.commitAuthor || 'Unknown';
    if (!byAuthor.has(author)) {
      byAuthor.set(author, []);
    }
    byAuthor.get(author)!.push(item);
  });

  // Generate author pages for each author
  const evaluationsRoot = path.dirname(indexPath);
  for (const [author, commits] of byAuthor.entries()) {
    await generateAuthorPage(evaluationsRoot, author, commits);
  }

  // Calculate overall metrics for display
  // Note: item.metrics already contains weighted consensus values from MetricsCalculationService
  // This is just aggregating those pre-calculated values for the summary stats
  const overallMetrics = {
    avgQuality: 0,
    avgComplexity: 0,
    avgFunctionalImpact: 0,
    avgTestCoverage: 0,
    avgActualTime: 0,
    totalTechDebt: 0,
    count: 0,
  };

  index.forEach((item) => {
    if (item.metrics) {
      overallMetrics.avgQuality += item.metrics.codeQuality || 0;
      overallMetrics.avgComplexity += item.metrics.codeComplexity || 0;
      overallMetrics.avgFunctionalImpact += item.metrics.functionalImpact || 0;
      overallMetrics.avgTestCoverage += item.metrics.testCoverage || 0;
      overallMetrics.avgActualTime += item.metrics.actualTimeHours || 0;
      // Calculate NET debt (debt introduced - debt reduction)
      const netDebt =
        (item.metrics.technicalDebtHours || 0) - (item.metrics.debtReductionHours || 0);
      overallMetrics.totalTechDebt += netDebt;
      overallMetrics.count++;
    }
  });

  if (overallMetrics.count > 0) {
    overallMetrics.avgQuality = Number(
      (overallMetrics.avgQuality / overallMetrics.count).toFixed(1)
    );
    overallMetrics.avgComplexity = Number(
      (overallMetrics.avgComplexity / overallMetrics.count).toFixed(1)
    );
    overallMetrics.avgFunctionalImpact = Number(
      (overallMetrics.avgFunctionalImpact / overallMetrics.count).toFixed(1)
    );
    overallMetrics.avgTestCoverage = Number(
      (overallMetrics.avgTestCoverage / overallMetrics.count).toFixed(1)
    );
    overallMetrics.avgActualTime = Number(
      (overallMetrics.avgActualTime / overallMetrics.count).toFixed(2)
    );
    overallMetrics.totalTechDebt = Number(overallMetrics.totalTechDebt.toFixed(2));
  }

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Commit Evaluations Index</title>
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
    <style>
        body { padding: 20px; background: #f5f5f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 40px; border-radius: 10px; margin-bottom: 30px; }
        .stats { display: flex; gap: 20px; margin-bottom: 30px; flex-wrap: wrap; }
        .stat-card { flex: 1; min-width: 150px; background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .stat-number { font-size: 2.5rem; font-weight: bold; color: #667eea; }
        .stat-label { color: #666; margin-top: 5px; font-size: 0.9rem; }
        .stat-mini { font-size: 0.85rem; color: #999; margin-top: 8px; }
        .table-container { background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); margin-bottom: 30px; }
        .section-title { margin-bottom: 20px; color: #333; font-weight: 600; }
        .search-filter-bar { background: white; padding: 15px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); margin-bottom: 20px; }
        table { width: 100%; border-collapse: separate; border-spacing: 0; }
        thead { background: #f8f9fa; }
        th { padding: 12px; text-align: left; font-weight: 600; color: #495057; border-bottom: 2px solid #dee2e6; white-space: nowrap; }
        td { padding: 12px; border-bottom: 1px solid #dee2e6; }
        tbody tr:hover { background: #f8f9fa; }
        tbody tr:last-child td { border-bottom: none; }
        .commit-hash { font-family: 'Courier New', monospace; background: #e9ecef; padding: 4px 8px; border-radius: 4px; font-size: 0.85rem; font-weight: 600; }
        .badge { font-size: 0.75rem; padding: 4px 8px; border-radius: 4px; font-weight: 600; }
        .badge-primary { background: #667eea; color: white; }
        .badge-secondary { background: #6c757d; color: white; }
        .badge-success { background: #28a745; color: white; }
        .badge-danger { background: #dc3545; color: white; }
        .badge-warning { background: #ffc107; color: #000; }
        .badge-info { background: #17a2b8; color: white; }
        .metric-cell { text-align: center; font-weight: 600; }
        .metric-good { color: #28a745; }
        .metric-medium { color: #ffc107; }
        .metric-bad { color: #dc3545; }
        .btn-sm { font-size: 0.85rem; padding: 6px 12px; }
        .author-filter { display: inline-block; margin: 5px; }
        .filter-buttons { display: flex; gap: 10px; flex-wrap: wrap; }
        /* Table column sizing for better readability */
        #commitsTable th:nth-child(1) { min-width: 100px; } /* Hash */
        #commitsTable th:nth-child(2) { min-width: 110px; } /* Author */
        #commitsTable th:nth-child(3) { min-width: 280px; } /* Message */
        #commitsTable th:nth-child(4) { min-width: 110px; } /* Date */
        #commitsTable th:nth-child(5) { min-width: 110px; } /* Last Evaluated */
        #commitsTable th:nth-child(6) { min-width: 85px; } /* Source */
        #commitsTable th:nth-child(7) { min-width: 90px; } /* Quality */
        #commitsTable th:nth-child(8) { min-width: 95px; } /* Complexity */
        #commitsTable th:nth-child(9) { min-width: 80px; } /* Tests */
        #commitsTable th:nth-child(10) { min-width: 85px; } /* Impact */
        #commitsTable th:nth-child(11) { min-width: 80px; } /* Time */
        #commitsTable th:nth-child(12) { min-width: 90px; } /* Tech Debt */
        #commitsTable th:nth-child(13) { min-width: 75px; } /* Action */
        #commitsTable td:nth-child(3) { max-width: 280px; word-wrap: break-word; overflow-wrap: break-word; } /* Message text wrapping */
    </style>
</head>
<body>
    <div class="container-fluid">
        <div class="header">
            <div class="position-relative">
                <div class="text-center">
                    <h1>📊 Commit Evaluations</h1>
                    <p class="mb-0">All evaluated commits in one place</p>
                </div>
            </div>
        </div>

        <div class="stats">
            <div class="stat-card">
                <div class="stat-number">${index.length}</div>
                <div class="stat-label">Total Commits</div>
            </div>
            <div class="stat-card">
                <div class="stat-number">${index.reduce((sum, item) => sum + (item.evaluationCount || 1), 0)}</div>
                <div class="stat-label">Total Evaluations</div>
            </div>
            <div class="stat-card">
                <div class="stat-number">${byAuthor.size}</div>
                <div class="stat-label">Authors</div>
            </div>
            ${
              overallMetrics.count > 0
                ? `
            <div class="stat-card">
                <div class="stat-number">${overallMetrics.avgQuality}</div>
                <div class="stat-label">Avg Quality</div>
                <div class="stat-mini">out of 10</div>
            </div>
            <div class="stat-card">
                <div class="stat-number">${overallMetrics.avgComplexity}</div>
                <div class="stat-label">Avg Complexity</div>
                <div class="stat-mini">out of 10</div>
            </div>
            <div class="stat-card">
                <div class="stat-number">${overallMetrics.avgTestCoverage}</div>
                <div class="stat-label">Avg Test Coverage</div>
                <div class="stat-mini">out of 10</div>
            </div>
            <div class="stat-card">
                <div class="stat-number">${overallMetrics.avgFunctionalImpact}</div>
                <div class="stat-label">Avg Impact</div>
                <div class="stat-mini">out of 10</div>
            </div>
            <div class="stat-card">
                <div class="stat-number">${overallMetrics.avgActualTime}h</div>
                <div class="stat-label">Avg Time</div>
                <div class="stat-mini">per commit</div>
            </div>
            <div class="stat-card">
                <div class="stat-number">${overallMetrics.totalTechDebt > 0 ? '+' : ''}${overallMetrics.totalTechDebt}h</div>
                <div class="stat-label">Total Tech Debt</div>
                <div class="stat-mini">${overallMetrics.totalTechDebt > 0 ? 'added' : 'reduced'}</div>
            </div>
            `
                : ''
            }
        </div>

        <div class="search-filter-bar">
            <div class="row">
                <div class="col-md-12">
                    <input type="text" class="form-control" id="searchInput" placeholder="🔍 Search by hash, author, or message...">
                </div>
            </div>
        </div>

        <div class="table-container">
            <h3 class="section-title">👥 Authors Summary</h3>
            <table class="table-authors">
                <thead>
                    <tr>
                        <th>Author</th>
                        <th style="text-align: center;">Commits</th>
                        <th style="text-align: center;">Avg Quality</th>
                        <th style="text-align: center;">Avg Complexity</th>
                        <th style="text-align: center;">Avg Tests</th>
                        <th style="text-align: center;">Avg Impact</th>
                        <th style="text-align: center;">Avg Time</th>
                        <th style="text-align: center;">Total Tech Debt</th>
                        <th>Action</th>
                    </tr>
                </thead>
                <tbody>
${Array.from(byAuthor.entries())
  .sort((a, b) => b[1].length - a[1].length)
  .map(([author, commits]) => {
    // Sort commits by commit date (newest first)
    commits.sort((a, b) => new Date(b.commitDate).getTime() - new Date(a.commitDate).getTime());
    const authorMetrics = {
      quality: 0,
      complexity: 0,
      testCoverage: 0,
      functionalImpact: 0,
      actualTime: 0,
      techDebt: 0,
      count: 0,
    };
    commits.forEach((c) => {
      if (c.metrics) {
        authorMetrics.quality += c.metrics.codeQuality || 0;
        authorMetrics.complexity += c.metrics.codeComplexity || 0;
        authorMetrics.testCoverage += c.metrics.testCoverage || 0;
        authorMetrics.functionalImpact += c.metrics.functionalImpact || 0;
        authorMetrics.actualTime += c.metrics.actualTimeHours || 0;
        // Calculate NET debt (debt introduced - debt reduction)
        const netDebt = (c.metrics.technicalDebtHours || 0) - (c.metrics.debtReductionHours || 0);
        authorMetrics.techDebt += netDebt;
        authorMetrics.count++;
      }
    });

    const avgQuality =
      authorMetrics.count > 0 ? (authorMetrics.quality / authorMetrics.count).toFixed(1) : 'N/A';
    const avgComplexity =
      authorMetrics.count > 0 ? (authorMetrics.complexity / authorMetrics.count).toFixed(1) : 'N/A';
    const avgTestCoverage =
      authorMetrics.count > 0
        ? (authorMetrics.testCoverage / authorMetrics.count).toFixed(1)
        : 'N/A';
    const avgFunctionalImpact =
      authorMetrics.count > 0
        ? (authorMetrics.functionalImpact / authorMetrics.count).toFixed(1)
        : 'N/A';
    const avgActualTime =
      authorMetrics.count > 0 ? (authorMetrics.actualTime / authorMetrics.count).toFixed(2) : 'N/A';
    const totalTechDebt = authorMetrics.count > 0 ? authorMetrics.techDebt.toFixed(2) : 'N/A';

    const authorSlug = author.toLowerCase().replace(/[^a-z0-9]/g, '-');
    const authorPageUrl = `author-${authorSlug}.html`;

    return `
                    <tr>
                        <td>👤 ${author}</td>
                        <td class="metric-cell">${commits.length}</td>
                        <td class="metric-cell">${avgQuality !== 'N/A' ? `<span class="metric-${parseFloat(avgQuality) >= 7 ? 'good' : parseFloat(avgQuality) >= 4 ? 'medium' : 'bad'}">${avgQuality}/10</span>` : 'N/A'}</td>
                        <td class="metric-cell">${avgComplexity !== 'N/A' ? `<span class="metric-${parseFloat(avgComplexity) <= 3 ? 'good' : parseFloat(avgComplexity) <= 6 ? 'medium' : 'bad'}">${avgComplexity}/10</span>` : 'N/A'}</td>
                        <td class="metric-cell">${avgTestCoverage !== 'N/A' ? `<span class="metric-${parseFloat(avgTestCoverage) >= 7 ? 'good' : parseFloat(avgTestCoverage) >= 4 ? 'medium' : 'bad'}">${avgTestCoverage}/10</span>` : 'N/A'}</td>
                        <td class="metric-cell">${avgFunctionalImpact !== 'N/A' ? `<span class="metric-${parseFloat(avgFunctionalImpact) >= 7 ? 'bad' : parseFloat(avgFunctionalImpact) >= 4 ? 'medium' : 'good'}">${avgFunctionalImpact}/10</span>` : 'N/A'}</td>
                        <td class="metric-cell">${avgActualTime !== 'N/A' ? `${avgActualTime}h` : 'N/A'}</td>
                        <td class="metric-cell">${totalTechDebt !== 'N/A' ? `<span class="metric-${parseFloat(totalTechDebt) > 0 ? 'bad' : parseFloat(totalTechDebt) < 0 ? 'good' : 'medium'}">${parseFloat(totalTechDebt) > 0 ? '+' : ''}${totalTechDebt}h</span>` : 'N/A'}</td>
                        <td><a href="${authorPageUrl}" class="btn btn-sm btn-outline-primary">View Dashboard</a></td>
                    </tr>`;
  })
  .join('')}
                </tbody>
            </table>
        </div>

        <div class="table-container">
            <h3 class="section-title">📝 All Commits</h3>
            <div style="overflow-x: auto;">
                <table id="commitsTable">
                    <thead>
                        <tr>
                            <th>Hash</th>
                            <th>Author</th>
                            <th>Message</th>
                            <th>Date</th>
                            <th>Last Evaluated</th>
                            <th style="text-align: center;">Source</th>
                            <th style="text-align: center;">Quality</th>
                            <th style="text-align: center;">Complexity</th>
                            <th style="text-align: center;">Tests</th>
                            <th style="text-align: center;">Impact</th>
                            <th style="text-align: center;">Time</th>
                            <th style="text-align: center;">Tech Debt</th>
                            <th>Action</th>
                        </tr>
                    </thead>
                    <tbody id="commitList">
${index
  .map((item) => {
    const metrics = item.metrics || {};
    const qualityColor =
      metrics.codeQuality >= 7 ? 'good' : metrics.codeQuality >= 4 ? 'medium' : 'bad';
    const complexityColor =
      metrics.codeComplexity <= 3 ? 'good' : metrics.codeComplexity <= 6 ? 'medium' : 'bad';
    const testsColor =
      metrics.testCoverage >= 7 ? 'good' : metrics.testCoverage >= 4 ? 'medium' : 'bad';
    const impactColor =
      metrics.functionalImpact >= 7 ? 'bad' : metrics.functionalImpact >= 4 ? 'medium' : 'good';
    const netDebt = (metrics.technicalDebtHours || 0) - (metrics.debtReductionHours || 0);
    const debtColor = netDebt > 0 ? 'bad' : netDebt < 0 ? 'good' : 'medium';

    return `
                        <tr data-source="${item.source || 'unknown'}" data-author="${item.commitAuthor || ''}" data-message="${(item.commitMessage || '').toLowerCase()}" data-hash="${item.commitHash}">
                            <td>
                                <span class="commit-hash">${item.commitHash?.substring(0, 8) || item.directory}</span>
                                ${item.evaluationCount > 1 ? `<br><span class="badge badge-info">${item.evaluationCount}x</span>` : ''}
                            </td>
                            <td>👤 ${item.commitAuthor || 'Unknown'}</td>
                            <td style="max-width: 300px;">${item.commitMessage ? item.commitMessage.split('\\n')[0] : ''}</td>
                            <td style="white-space: nowrap;">${item.commitDate ? new Date(item.commitDate).toLocaleDateString() : ''}</td>
                            <td style="white-space: nowrap;">${item.lastEvaluated ? new Date(item.lastEvaluated).toLocaleDateString() : ''}</td>
                            <td class="metric-cell">
                                <span class="badge badge-secondary">${item.source || 'unknown'}</span>
                            </td>
                            <td class="metric-cell ${item.metrics ? `metric-${qualityColor}` : ''}">${item.metrics ? `${metrics.codeQuality}/10` : 'N/A'}</td>
                            <td class="metric-cell ${item.metrics ? `metric-${complexityColor}` : ''}">${item.metrics ? `${metrics.codeComplexity}/10` : 'N/A'}</td>
                            <td class="metric-cell ${item.metrics ? `metric-${testsColor}` : ''}">${item.metrics ? `${metrics.testCoverage}/10` : 'N/A'}</td>
                            <td class="metric-cell ${item.metrics ? `metric-${impactColor}` : ''}">${item.metrics ? `${metrics.functionalImpact}/10` : 'N/A'}</td>
                            <td class="metric-cell">${item.metrics ? `${metrics.actualTimeHours}h` : 'N/A'}</td>
                            <td class="metric-cell ${item.metrics ? `metric-${debtColor}` : ''}">${item.metrics ? `${netDebt > 0 ? '+' : ''}${netDebt.toFixed(1)}h` : 'N/A'}</td>
                            <td><a href="${item.directory}/report-enhanced.html" class="btn btn-primary btn-sm">View</a></td>
                        </tr>`;
  })
  .join('')}
                    </tbody>
                </table>
            </div>
        </div>
    </div>

    <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>
    <script>
        // Search functionality for table rows
        document.getElementById('searchInput').addEventListener('input', function(e) {
            const searchTerm = e.target.value.toLowerCase();
            const rows = document.querySelectorAll('#commitList tr');
            
            rows.forEach(row => {
                const hash = row.dataset.hash.toLowerCase();
                const author = row.dataset.author.toLowerCase();
                const message = row.dataset.message;
                
                if (hash.includes(searchTerm) || author.includes(searchTerm) || message.includes(searchTerm)) {
                    row.style.display = '';
                } else {
                    row.style.display = 'none';
                }
            });
        });

        // Filter by author
        function filterByAuthor(author) {
            // Clear search box
            document.getElementById('searchInput').value = '';

            const rows = document.querySelectorAll('#commitList tr');
            rows.forEach(row => {
                if (row.dataset.author === author) {
                    row.style.display = '';
                } else {
                    row.style.display = 'none';
                }
            });

            // Scroll to commits table
            document.getElementById('commitsTable').scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    </script>
</body>
</html>`;

  await fs.writeFile(indexPath, html);
}

/**
 * Generate batch identifier from options
 * Examples:
 *   --count 10 → "last-10"
 *   --since 2024-01-01 --until 2024-01-31 → "2024-01-01_to_2024-01-31"
 *   --since 2024-01-01 → "since-2024-01-01"
 *   --branch develop --count 5 → "branch-develop-last-5"
 */
export function generateBatchIdentifier(options: {
  since?: string;
  until?: string;
  count?: number;
  branch?: string;
}): string {
  const parts: string[] = [];

  if (options.branch && options.branch !== 'HEAD') {
    parts.push(`branch-${options.branch.replace(/[^a-zA-Z0-9-]/g, '_')}`);
  }

  if (options.since && options.until) {
    parts.push(`${options.since}_to_${options.until}`);
  } else if (options.since) {
    parts.push(`since-${options.since}`);
  } else if (options.until) {
    parts.push(`until-${options.until}`);
  } else if (options.count) {
    parts.push(`last-${options.count}`);
  }

  return parts.length > 0 ? parts.join('-') : 'batch';
}

/**
 * Generate author-specific page with their commits and dashboard
 */
async function generateAuthorPage(
  evaluationsRoot: string,
  author: string,
  commits: any[]
): Promise<void> {
  const authorSlug = author.toLowerCase().replace(/[^a-z0-9]/g, '-');
  const authorPagePath = path.join(evaluationsRoot, `author-${authorSlug}.html`);

  // Use centralized metrics calculation service for consistency with OKR generation
  const {
    AuthorStatsAggregatorService,
  } = require('../../src/services/author-stats-aggregator.service');
  const authorData = await AuthorStatsAggregatorService.aggregateAuthorStats(evaluationsRoot, {
    targetAuthor: author,
  });

  // Use deduplicated evaluations (latest per commit) for both metrics AND display
  const evaluations = authorData.get(author) || [];
  const analysis =
    evaluations && evaluations.length > 0
      ? AuthorStatsAggregatorService.analyzeAuthor(evaluations)
      : null;

  // Sort deduplicated commits by commit date (newest first) for display
  const deduplicatedCommits = evaluations.sort(
    (a: any, b: any) =>
      new Date(b.metadata?.commitDate || 0).getTime() -
      new Date(a.metadata?.commitDate || 0).getTime()
  );

  // Use centralized stats or fallback to empty
  const avgQuality = analysis ? analysis.stats.quality.toFixed(1) : 'N/A';
  const avgComplexity = analysis ? analysis.stats.complexity.toFixed(1) : 'N/A';
  const avgTestCoverage = analysis ? analysis.stats.tests.toFixed(1) : 'N/A';
  const avgFunctionalImpact = analysis ? analysis.stats.impact.toFixed(1) : 'N/A';
  const avgActualTime = analysis ? analysis.stats.time.toFixed(2) : 'N/A';
  const totalTechDebt = analysis ? analysis.stats.techDebt.toFixed(2) : 'N/A';
  const commitCount = deduplicatedCommits.length; // Use deduplicated count

  // Check for OKR files and load latest OKR data
  const okrsDir = path.join(evaluationsRoot, '.okrs', authorSlug);
  let okrContentHtml = '';

  if (fsSync.existsSync(okrsDir)) {
    const files = fsSync.readdirSync(okrsDir);
    const okrJsonFiles = files
      .filter((f: string) => f.startsWith('okr_') && f.endsWith('.json'))
      .sort()
      .reverse(); // Newest first

    if (okrJsonFiles.length > 0) {
      // Load the latest OKR data
      const latestJsonPath = path.join(okrsDir, okrJsonFiles[0]);
      try {
        const okrData = JSON.parse(fsSync.readFileSync(latestJsonPath, 'utf-8'));
        const generatedDate = new Date(okrData.generatedAt).toLocaleDateString();

        // Build grid-based OKR section
        okrContentHtml = `
          <div class="d-flex justify-content-between align-items-center mb-4">
            <div>
              <h4 class="mb-0">✅ Latest OKR Profile</h4>
              <span class="text-muted small">Generated: ${generatedDate}</span>
            </div>
            <a href=".okrs/${authorSlug}/${okrJsonFiles[0].replace('.json', '.html')}" 
               class="btn btn-sm btn-outline-primary" 
               target="_blank">
              📄 View Full Report
            </a>
          </div>

          ${
            okrData.progressReport
              ? `
          <!-- Progress Report -->
          <div class="alert alert-${okrData.progressReport.status === 'On Track' ? 'success' : okrData.progressReport.status === 'Completed' ? 'info' : okrData.progressReport.status === 'At Risk' ? 'warning' : 'danger'} mb-4" role="alert">
            <div class="d-flex align-items-center mb-2">
              <h5 class="mb-0 me-3">📈 Progress Report</h5>
              <span class="badge bg-${okrData.progressReport.status === 'On Track' ? 'success' : okrData.progressReport.status === 'Completed' ? 'info' : okrData.progressReport.status === 'At Risk' ? 'warning' : 'danger'}">${okrData.progressReport.status}</span>
            </div>
            <p class="mb-3">${okrData.progressReport.summary}</p>
            <div class="row">
              ${
                okrData.progressReport.achieved && okrData.progressReport.achieved.length > 0
                  ? `
              <div class="col-md-6">
                <strong class="text-success">✓ Achieved:</strong>
                <ul class="mb-0 mt-2">
                  ${okrData.progressReport.achieved.map((item: string) => `<li>${item}</li>`).join('')}
                </ul>
              </div>
              `
                  : ''
              }
              ${
                okrData.progressReport.missed && okrData.progressReport.missed.length > 0
                  ? `
              <div class="col-md-6">
                <strong class="text-danger">✗ Missed:</strong>
                <ul class="mb-0 mt-2">
                  ${okrData.progressReport.missed.map((item: string) => `<li>${item}</li>`).join('')}
                </ul>
              </div>
              `
                  : ''
              }
            </div>
          </div>
          `
              : ''
          }

          <!-- Row 1: Assessment (3 cols) -->
          <div class="row mb-4">
            <!-- Strong Points -->
            <div class="col-md-4 mb-3 mb-md-0">
              <div class="card h-100 border-success shadow-sm">
                <div class="card-header bg-success text-white py-2">
                  <strong>💪 Strong Points</strong>
                </div>
                <div class="card-body">
                  <ul class="mb-0 ps-3 small">
                    ${okrData.strongPoints.map((point: string) => `<li class="mb-1">${point}</li>`).join('')}
                  </ul>
                </div>
              </div>
            </div>

            <!-- Weak Points -->
            <div class="col-md-4 mb-3 mb-md-0">
              <div class="card h-100 border-warning shadow-sm">
                <div class="card-header bg-warning text-dark py-2">
                  <strong>⚠️ Growth Areas</strong>
                </div>
                <div class="card-body">
                  <ul class="mb-0 ps-3 small">
                    ${okrData.weakPoints.map((point: string) => `<li class="mb-1">${point}</li>`).join('')}
                  </ul>
                </div>
              </div>
            </div>

            <!-- Knowledge Gaps -->
            <div class="col-md-4">
              <div class="card h-100 border-info shadow-sm">
                <div class="card-header bg-info text-white py-2">
                  <strong>🧩 Knowledge Gaps</strong>
                </div>
                <div class="card-body">
                  <ul class="mb-0 ps-3 small">
                    ${okrData.knowledgeGaps.map((gap: string) => `<li class="mb-1">${gap}</li>`).join('')}
                  </ul>
                </div>
              </div>
            </div>
          </div>

          <!-- Row 2: Objectives -->
          <div class="card mb-4 border-primary shadow-sm">
            <div class="card-header bg-primary text-white">
              <strong>🎯 3-Month Objective</strong>
            </div>
            <div class="card-body">
              <h5 class="text-primary mb-3">${okrData.okr3Month.objective}</h5>
              <div class="row">
                ${okrData.okr3Month.keyResults
                  .map(
                    (kr: any, i: number) => `
                  <div class="col-md-4 mb-3">
                    <div class="p-3 bg-light rounded h-100 border">
                      <div class="fw-bold mb-2 text-primary">KR ${i + 1}</div>
                      <div class="mb-2">${kr.kr}</div>
                      <div class="text-muted small border-top pt-2 mt-2 mb-2"><em>Why:</em> ${kr.why}</div>
                      ${
                        kr.actionSteps && kr.actionSteps.length > 0
                          ? `
                        <div class="border-top pt-2 mt-2">
                          <strong class="small text-success">✓ Action Steps:</strong>
                          <ol class="small mb-0 mt-1 ps-3">
                            ${kr.actionSteps.map((step: string) => `<li class="mb-1">${step}</li>`).join('')}
                          </ol>
                        </div>
                      `
                          : ''
                      }
                    </div>
                  </div>
                `
                  )
                  .join('')}
              </div>
          </div>
          </div>

          ${
            okrData.okr6Month
              ? `
          <div class="accordion mb-4" id="longTermOkrs">
            <div class="accordion-item">
              <h2 class="accordion-header">
                <button class="accordion-button collapsed" type="button" data-bs-toggle="collapse" data-bs-target="#collapse6Month">
                  <strong>📆 6-Month Objective:</strong> &nbsp; ${okrData.okr6Month.objective}
                </button>
              </h2>
              <div id="collapse6Month" class="accordion-collapse collapse" data-bs-parent="#longTermOkrs">
                <div class="accordion-body bg-light">
                  <div class="row">
                    ${okrData.okr6Month.keyResults
                      .map(
                        (kr: any, i: number) => `
                      <div class="col-md-6 mb-2">
                        <div class="p-2 bg-white rounded border">
                          <strong>KR ${i + 1}:</strong> ${kr.kr}
                        </div>
                      </div>
                    `
                      )
                      .join('')}
                  </div>
                </div>
              </div>
            </div>
            ${
              okrData.okr12Month
                ? `
            <div class="accordion-item">
              <h2 class="accordion-header">
                <button class="accordion-button collapsed" type="button" data-bs-toggle="collapse" data-bs-target="#collapse12Month">
                  <strong>📅 12-Month Objective:</strong> &nbsp; ${okrData.okr12Month.objective}
                </button>
              </h2>
              <div id="collapse12Month" class="accordion-collapse collapse" data-bs-parent="#longTermOkrs">
                <div class="accordion-body bg-light">
                  <div class="row">
                    ${okrData.okr12Month.keyResults
                      .map(
                        (kr: any, i: number) => `
                      <div class="col-md-6 mb-2">
                        <div class="p-2 bg-white rounded border">
                          <strong>KR ${i + 1}:</strong> ${kr.kr}
                        </div>
                      </div>
                    `
                      )
                      .join('')}
                  </div>
                </div>
              </div>
            </div>
            `
                : ''
            }
          </div>
          `
              : ''
          }

          ${
            okrData.actionPlan && okrData.actionPlan.length > 0
              ? `
          <!-- Action Plan -->
          <div class="card mb-3 border-secondary shadow-sm">
            <div class="card-header bg-secondary text-white">
              <strong>🚀 Action Plan</strong>
            </div>
            <div class="card-body p-0">
              <div class="table-responsive">
                <table class="table table-striped mb-0">
                  <thead class="table-light">
                    <tr>
                      <th class="ps-3">Area</th>
                      <th>Action</th>
                      <th>Timeline</th>
                      <th class="pe-3">Success Criteria</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${okrData.actionPlan
                      .map(
                        (item: any) => `
                      <tr>
                        <td class="ps-3 fw-bold text-secondary">${item.area}</td>
                        <td>${item.action}</td>
                        <td><span class="badge bg-secondary">${item.timeline}</span></td>
                        <td class="pe-3 small text-muted">${item.success}</td>
                      </tr>
                    `
                      )
                      .join('')}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
          `
              : ''
          }
        `;
      } catch (e) {
        okrContentHtml = `
          <div class="alert alert-warning">
            <strong>⚠️ Error loading OKR data</strong>
            <p class="mb-0 mt-2">Unable to read OKR profile. The file may be corrupted.</p>
          </div>
        `;
      }
    } else {
      okrContentHtml = `
        <div class="alert alert-info">
          <strong>📋 No OKR profiles yet</strong>
          <p class="mb-0 mt-2">OKRs are generated periodically to track developer growth and set quarterly objectives.</p>
          <p class="mb-0 mt-1 text-muted"><small>Run: <code>npm run okr</code> to generate OKR profiles</small></p>
        </div>
      `;
    }
  } else {
    okrContentHtml = `
      <div class="alert alert-info">
        <strong>📋 No OKR profiles yet</strong>
        <p class="mb-0 mt-2">OKRs are generated periodically to track developer growth and set quarterly objectives.</p>
        <p class="mb-0 mt-1 text-muted"><small>Run: <code>npm run okr</code> to generate OKR profiles</small></p>
      </div>
    `;
  }

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${author} - Commit Evaluations</title>
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
    <style>
        body { padding: 20px; background: #f5f5f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 40px; border-radius: 10px; margin-bottom: 30px; }
        .stats { display: flex; gap: 20px; margin-bottom: 30px; flex-wrap: wrap; }
        .stat-card { flex: 1; min-width: 150px; background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .stat-number { font-size: 2.5rem; font-weight: bold; color: #667eea; }
        .stat-label { color: #666; margin-top: 5px; font-size: 0.9rem; }
        .stat-mini { font-size: 0.85rem; color: #999; margin-top: 8px; }
        .table-container { background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); margin-bottom: 30px; }
        .section-title { margin-bottom: 20px; color: #333; font-weight: 600; }
        table { width: 100%; border-collapse: separate; border-spacing: 0; }
        thead { background: #f8f9fa; }
        th { padding: 12px; text-align: left; font-weight: 600; color: #495057; border-bottom: 2px solid #dee2e6; white-space: nowrap; }
        td { padding: 12px; border-bottom: 1px solid #dee2e6; }
        tbody tr:hover { background: #f8f9fa; }
        tbody tr:last-child td { border-bottom: none; }
        .commit-hash { font-family: 'Courier New', monospace; background: #e9ecef; padding: 4px 8px; border-radius: 4px; font-size: 0.85rem; font-weight: 600; }
        .badge { font-size: 0.75rem; padding: 4px 8px; border-radius: 4px; font-weight: 600; }
        .badge-secondary { background: #6c757d; color: white; }
        .badge-info { background: #17a2b8; color: white; }
        .metric-cell { text-align: center; font-weight: 600; }
        .metric-good { color: #28a745; }
        .metric-medium { color: #ffc107; }
        .metric-bad { color: #dc3545; }
        .btn-sm { font-size: 0.85rem; padding: 6px 12px; }
        /* Table column sizing for author dashboard */
        #authorCommitsTable th:nth-child(1) { min-width: 100px; } /* Hash */
        #authorCommitsTable th:nth-child(2) { min-width: 280px; } /* Message */
        #authorCommitsTable th:nth-child(3) { min-width: 110px; } /* Date */
        #authorCommitsTable th:nth-child(4) { min-width: 110px; } /* Last Evaluated */
        #authorCommitsTable th:nth-child(5) { min-width: 85px; } /* Source */
        #authorCommitsTable th:nth-child(6) { min-width: 90px; } /* Quality */
        #authorCommitsTable th:nth-child(7) { min-width: 95px; } /* Complexity */
        #authorCommitsTable th:nth-child(8) { min-width: 80px; } /* Tests */
        #authorCommitsTable th:nth-child(9) { min-width: 85px; } /* Impact */
        #authorCommitsTable th:nth-child(10) { min-width: 80px; } /* Time */
        #authorCommitsTable th:nth-child(11) { min-width: 90px; } /* Tech Debt */
        #authorCommitsTable th:nth-child(12) { min-width: 75px; } /* Action */
        #authorCommitsTable td:nth-child(2) { max-width: 280px; word-wrap: break-word; overflow-wrap: break-word; } /* Message text wrapping */
    </style>
</head>
<body>
    <div class="container-fluid">
        <div class="header">
            <div class="position-relative">
                <a href="index.html" class="btn btn-sm" style="position: absolute; top: 0; right: 0; background: rgba(255,255,255,0.2); color: white; border: 1px solid rgba(255,255,255,0.3); backdrop-filter: blur(10px);">
                    ← Back to All Commits
                </a>
                <div class="text-center">
                    <h1>👤 ${author}</h1>
                    <p class="mb-0">Developer Dashboard</p>
                </div>
            </div>
        </div>

        <div class="stats">
            <div class="stat-card">
                <div class="stat-number">${commits.length}</div>
                <div class="stat-label">Total Commits</div>
            </div>
            <div class="stat-card">
                <div class="stat-number">${avgQuality}</div>
                <div class="stat-label">Avg Quality</div>
                <div class="stat-mini">out of 10</div>
            </div>
            <div class="stat-card">
                <div class="stat-number">${avgComplexity}</div>
                <div class="stat-label">Avg Complexity</div>
                <div class="stat-mini">out of 10</div>
            </div>
            <div class="stat-card">
                <div class="stat-number">${avgTestCoverage}</div>
                <div class="stat-label">Avg Test Coverage</div>
                <div class="stat-mini">out of 10</div>
            </div>
            <div class="stat-card">
                <div class="stat-number">${avgFunctionalImpact}</div>
                <div class="stat-label">Avg Impact</div>
                <div class="stat-mini">out of 10</div>
            </div>
            <div class="stat-card">
                <div class="stat-number">${avgActualTime}h</div>
                <div class="stat-label">Avg Time</div>
                <div class="stat-mini">per commit</div>
            </div>
            <div class="stat-card">
                <div class="stat-number">${totalTechDebt !== 'N/A' && parseFloat(totalTechDebt) > 0 ? '+' : ''}${totalTechDebt}h</div>
                <div class="stat-label">Total Tech Debt</div>
                <div class="stat-mini">${totalTechDebt !== 'N/A' && parseFloat(totalTechDebt) > 0 ? 'added' : 'reduced'}</div>
            </div>
        </div>

        <!-- OKR Section -->
        <div class="table-container" style="background: linear-gradient(135deg, rgba(102, 126, 234, 0.05) 0%, rgba(118, 75, 162, 0.05) 100%);">
            <h3 class="section-title">🎯 OKR & Growth Profile</h3>
            <div id="okrSection">
                ${okrContentHtml}
            </div>
        </div>

        <div class="table-container">
            <h3 class="section-title">📝 Commits by ${author}</h3>
            <div style="overflow-x: auto;">
                <table id="authorCommitsTable">
                    <thead>
                        <tr>
                            <th>Hash</th>
                            <th>Message</th>
                            <th>Date</th>
                            <th>Last Evaluated</th>
                            <th style="text-align: center;">Source</th>
                            <th style="text-align: center;">Quality</th>
                            <th style="text-align: center;">Complexity</th>
                            <th style="text-align: center;">Tests</th>
                            <th style="text-align: center;">Impact</th>
                            <th style="text-align: center;">Time</th>
                            <th style="text-align: center;">Tech Debt</th>
                            <th>Action</th>
                        </tr>
                    </thead>
                    <tbody>
${commits
  .map((item) => {
    const metrics = item.metrics || {};
    const qualityColor =
      metrics.codeQuality >= 7 ? 'good' : metrics.codeQuality >= 4 ? 'medium' : 'bad';
    const complexityColor =
      metrics.codeComplexity <= 3 ? 'good' : metrics.codeComplexity <= 6 ? 'medium' : 'bad';
    const testsColor =
      metrics.testCoverage >= 7 ? 'good' : metrics.testCoverage >= 4 ? 'medium' : 'bad';
    const impactColor =
      metrics.functionalImpact >= 7 ? 'bad' : metrics.functionalImpact >= 4 ? 'medium' : 'good';
    const debtColor =
      metrics.technicalDebtHours > 0 ? 'bad' : metrics.technicalDebtHours < 0 ? 'good' : 'medium';

    return `
                        <tr>
                            <td>
                                <span class="commit-hash">${item.commitHash?.substring(0, 8) || item.directory}</span>
                                ${item.evaluationCount > 1 ? `<br><span class="badge badge-info">${item.evaluationCount}x</span>` : ''}
                            </td>
                            <td style="max-width: 400px;">${item.commitMessage ? item.commitMessage.split('\\n')[0] : ''}</td>
                            <td style="white-space: nowrap;">${item.commitDate ? new Date(item.commitDate).toLocaleDateString() : ''}</td>
                            <td style="white-space: nowrap;">${item.lastEvaluated ? new Date(item.lastEvaluated).toLocaleDateString() : ''}</td>
                            <td class="metric-cell">
                                <span class="badge badge-secondary">${item.source || 'unknown'}</span>
                            </td>
                            <td class="metric-cell ${item.metrics ? `metric-${qualityColor}` : ''}">${item.metrics ? `${metrics.codeQuality}/10` : 'N/A'}</td>
                            <td class="metric-cell ${item.metrics ? `metric-${complexityColor}` : ''}">${item.metrics ? `${metrics.codeComplexity}/10` : 'N/A'}</td>
                            <td class="metric-cell ${item.metrics ? `metric-${testsColor}` : ''}">${item.metrics ? `${metrics.testCoverage}/10` : 'N/A'}</td>
                            <td class="metric-cell ${item.metrics ? `metric-${impactColor}` : ''}">${item.metrics ? `${metrics.functionalImpact}/10` : 'N/A'}</td>
                            <td class="metric-cell">${item.metrics ? `${metrics.actualTimeHours}h` : 'N/A'}</td>
                            <td class="metric-cell ${item.metrics ? `metric-${debtColor}` : ''}">${item.metrics ? `${metrics.technicalDebtHours > 0 ? '+' : ''}${metrics.technicalDebtHours}h` : 'N/A'}</td>
                            <td><a href="${item.directory}/report-enhanced.html" class="btn btn-primary btn-sm">View</a></td>
                        </tr>`;
  })
  .join('')}
                    </tbody>
                </table>
            </div>
        </div>
    </div>

    <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>
    <script>
        // Handle collapse button text toggle
        const okrDetails = document.getElementById('okrDetails');
        if (okrDetails) {
            okrDetails.addEventListener('show.bs.collapse', function () {
                const btn = document.querySelector('[data-bs-target="#okrDetails"]');
                if (btn) {
                    btn.querySelector('.collapsed-text').style.display = 'none';
                    btn.querySelector('.expanded-text').style.display = 'inline';
                }
            });
            okrDetails.addEventListener('hide.bs.collapse', function () {
                const btn = document.querySelector('[data-bs-target="#okrDetails"]');
                if (btn) {
                    btn.querySelector('.collapsed-text').style.display = 'inline';
                    btn.querySelector('.expanded-text').style.display = 'none';
                }
            });
        }
    </script>
</body>
</html>`;

  await fs.writeFile(authorPagePath, html);
}

/**
 * Build the index URL for cross-platform access
 */
export function buildIndexUrl(): string {
  const indexPath = path.join(process.cwd(), '.evaluated-commits', 'index.html');
  const normalizedPath = indexPath.replace(/\\/g, '/');
  return process.platform === 'win32' ? `file:///${normalizedPath}` : `file://${normalizedPath}`;
}

/**
 * Print completion message for evaluate command (single commit)
 */
export function printEvaluateCompletionMessage(outputDir: string): void {
  try {
    const chalk = require('chalk').default;

    console.log(chalk.green(`\n✅ Evaluation complete!`));
    console.log(chalk.cyan(`📁 Output directory: ${chalk.bold(outputDir)}`));
    console.log(
      chalk.white(`   📄 report-enhanced.html  - 🌟 Conversation Timeline (Interactive)`)
    );
    console.log(chalk.white(`   📝 conversation.md       - 🌟 Markdown Transcript`));
    console.log(chalk.gray(`   📄 report.html           - Standard HTML report`));
    console.log(chalk.gray(`   📋 results.json          - Full JSON results`));
    console.log(chalk.gray(`   📝 commit.diff           - Original diff`));
    console.log(chalk.gray(`   📊 summary.txt           - Quick summary`));
    console.log(
      chalk.yellow(
        `\n💡 Open ${chalk.bold('report-enhanced.html')} for interactive view or ${chalk.bold('conversation.md')} for transcript!\n`
      )
    );

    const indexUrl = buildIndexUrl();
    console.log(chalk.cyan(`\n🌐 View all evaluations: ${indexUrl}\n`));
  } catch (e) {
    // Fallback without chalk if it's not available
    console.log(`\n✅ Evaluation complete!`);
    console.log(`📁 Output directory: ${outputDir}`);
    console.log(`   📄 report-enhanced.html  - 🌟 Conversation Timeline (Interactive)`);
    console.log(`   📝 conversation.md       - 🌟 Markdown Transcript`);
    console.log(`   📄 report.html           - Standard HTML report`);
    console.log(`   📋 results.json          - Full JSON results`);
    console.log(`   📝 commit.diff           - Original diff`);
    console.log(`   📊 summary.txt           - Quick summary`);
    console.log(
      `\n💡 Open report-enhanced.html for interactive view or conversation.md for transcript!\n`
    );

    const indexUrl = buildIndexUrl();
    console.log(`\n🌐 View all evaluations: ${indexUrl}\n`);
  }
}

/**
 * Print completion message for batch command (multiple commits)
 */
export function printBatchCompletionMessage(summary: {
  total: number;
  complete: number;
  failed: number;
}): void {
  console.log(`${'='.repeat(80)}`);
  console.log('✅ CodeWave analysis complete!');
  console.log(`${'='.repeat(80)}\n`);
  console.log(`📊 Summary:`);
  console.log(`   Total commits: ${summary.total}`);
  console.log(`   Successful: ${summary.complete}`);
  console.log(`   Failed: ${summary.failed}`);
  console.log(`\n📁 All evaluations saved to: .evaluated-commits/`);
  console.log(`   🌐 index.html          - Master index of all evaluations`);
  console.log(`   📂 [commit-hash]/      - Individual commit evaluations`);

  const indexUrl = buildIndexUrl();
  console.log(`\n💡 Open index: ${indexUrl}\n`);
}
