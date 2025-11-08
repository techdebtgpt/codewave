// cli/utils/shared.utils.ts
// Shared utilities for CLI commands to eliminate duplication

import { AgentRegistry } from '../../src/agents/agent-registry';
import { BusinessAnalystAgent } from '../../src/agents/business-analyst-agent';
import { SDETAgent } from '../../src/agents/sdet-agent';
import { DeveloperAuthorAgent } from '../../src/agents/developer-author-agent';
import { SeniorArchitectAgent } from '../../src/agents/senior-architect-agent';
import { DeveloperReviewerAgent } from '../../src/agents/developer-reviewer-agent';
import { AppConfig } from '../../src/config/config.interface';
import { generateEnhancedHtmlReport } from '../../src/formatters/html-report-formatter-enhanced';
import { generateConversationTranscript } from '../../src/formatters/conversation-transcript-formatter';
import { AgentResult } from '../../src/agents/agent.interface';
import { TokenSnapshot, MetricsSnapshot, EvaluationHistoryEntry } from '../../src/types/output.types';
import fs from 'fs/promises';
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
 * Create and register all agents
 */
export function createAgentRegistry(config: AppConfig): AgentRegistry {
    const agentRegistry = new AgentRegistry();
    agentRegistry.register(new BusinessAnalystAgent(config));
    agentRegistry.register(new SDETAgent(config));
    agentRegistry.register(new DeveloperAuthorAgent(config));
    agentRegistry.register(new SeniorArchitectAgent(config));
    agentRegistry.register(new DeveloperReviewerAgent(config));
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
    await fs.writeFile(
        path.join(outputDir, 'results.json'),
        JSON.stringify(resultsJson, null, 2),
    );

    // 2. Generate HTML report
    generateEnhancedHtmlReport(
        agentResults,
        path.join(outputDir, 'report-enhanced.html'),
        {
            commitHash: metadata.commitHash,
            commitAuthor: metadata.commitAuthor,
            commitMessage: metadata.commitMessage,
            commitDate: metadata.commitDate,
            timestamp: metadata.timestamp || new Date().toISOString(),
            developerOverview,
        }
    );

    // 3. Generate conversation transcript
    generateConversationTranscript(
        agentResults,
        path.join(outputDir, 'conversation.md'),
        {
            commitHash: metadata.commitHash,
            timestamp: metadata.timestamp || new Date().toISOString(),
        }
    );

    // 4. Save commit diff
    await fs.writeFile(path.join(outputDir, 'commit.diff'), diff);

    // 5. Generate summary text
    const summary = generateSummaryText(agentResults, metadata);
    await fs.writeFile(path.join(outputDir, 'summary.txt'), summary);

    // 6. Update evaluation index
    try {
        await updateEvaluationIndex(outputDir, metadata);
    } catch (indexError) {
        console.error('Failed to update evaluation index:', indexError instanceof Error ? indexError.message : String(indexError));
        throw indexError; // Re-throw to propagate the error
    }
}

/**
 * Extract metrics from final round agent results (last 5 agents)
 */
function extractMetricsSnapshot(agentResults: AgentResult[]): MetricsSnapshot {
    // Get final round agents (last 5)
    const finalAgents = agentResults.slice(-5);

    const metricSums = {
        functionalImpact: 0,
        idealTimeHours: 0,
        testCoverage: 0,
        codeQuality: 0,
        codeComplexity: 0,
        actualTimeHours: 0,
        technicalDebtHours: 0,
    };

    let count = 0;
    finalAgents.forEach((agent) => {
        if (agent.metrics) {
            metricSums.functionalImpact += agent.metrics.functionalImpact || 0;
            metricSums.idealTimeHours += agent.metrics.idealTimeHours || 0;
            metricSums.testCoverage += agent.metrics.testCoverage || 0;
            metricSums.codeQuality += agent.metrics.codeQuality || 0;
            metricSums.codeComplexity += agent.metrics.codeComplexity || 0;
            metricSums.actualTimeHours += agent.metrics.actualTimeHours || 0;
            metricSums.technicalDebtHours += agent.metrics.technicalDebtHours || 0;
            count++;
        }
    });

    if (count === 0) {
        return {
            functionalImpact: 0,
            idealTimeHours: 0,
            testCoverage: 0,
            codeQuality: 0,
            codeComplexity: 0,
            actualTimeHours: 0,
            technicalDebtHours: 0,
        };
    }

    return {
        functionalImpact: Number((metricSums.functionalImpact / count).toFixed(1)),
        idealTimeHours: Number((metricSums.idealTimeHours / count).toFixed(2)),
        testCoverage: Number((metricSums.testCoverage / count).toFixed(1)),
        codeQuality: Number((metricSums.codeQuality / count).toFixed(1)),
        codeComplexity: Number((metricSums.codeComplexity / count).toFixed(1)),
        actualTimeHours: Number((metricSums.actualTimeHours / count).toFixed(2)),
        technicalDebtHours: Number((metricSums.technicalDebtHours / count).toFixed(2)),
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
        (totalInputTokens / 1000000) * inputPrice +
        (totalOutputTokens / 1000000) * outputPrice;

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
        qualityScores.reduce((sum, score) => sum + Math.pow(score - mean, 2), 0) /
        qualityScores.length;
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
 * Create batch evaluation directory
 * No longer needed - batches just process multiple commits into .evaluated-commits/{hash}/
 * This function now just returns the evaluation root
 */
export async function createBatchDirectory(
    identifier: string,
    baseDir: string = '.'
): Promise<string> {
    const evaluationsRoot = getEvaluationRoot(baseDir);
    await fs.mkdir(evaluationsRoot, { recursive: true });
    return evaluationsRoot;
}

/**
 * Calculate averaged metrics from agent results
 */
async function calculateAveragedMetrics(evaluationDir: string): Promise<any> {
    try {
        const resultsPath = path.join(evaluationDir, 'results.json');
        const content = await fs.readFile(resultsPath, 'utf-8');
        const results = JSON.parse(content);

        if (!results.agents || results.agents.length === 0) {
            return null;
        }

        // Get final round agents (last 5 entries)
        const finalAgents = results.agents.slice(-5);

        // Aggregate metrics from all final agents
        const metricSums = {
            functionalImpact: 0,
            idealTimeHours: 0,
            testCoverage: 0,
            codeQuality: 0,
            codeComplexity: 0,
            actualTimeHours: 0,
            technicalDebtHours: 0,
        };

        let count = 0;
        finalAgents.forEach((agent: any) => {
            if (agent.metrics) {
                metricSums.functionalImpact += agent.metrics.functionalImpact || 0;
                metricSums.idealTimeHours += agent.metrics.idealTimeHours || 0;
                metricSums.testCoverage += agent.metrics.testCoverage || 0;
                metricSums.codeQuality += agent.metrics.codeQuality || 0;
                metricSums.codeComplexity += agent.metrics.codeComplexity || 0;
                metricSums.actualTimeHours += agent.metrics.actualTimeHours || 0;
                metricSums.technicalDebtHours += agent.metrics.technicalDebtHours || 0;
                count++;
            }
        });

        if (count === 0) return null;

        // Calculate averages
        return {
            functionalImpact: Number((metricSums.functionalImpact / count).toFixed(1)),
            idealTimeHours: Number((metricSums.idealTimeHours / count).toFixed(2)),
            testCoverage: Number((metricSums.testCoverage / count).toFixed(1)),
            codeQuality: Number((metricSums.codeQuality / count).toFixed(1)),
            codeComplexity: Number((metricSums.codeComplexity / count).toFixed(1)),
            actualTimeHours: Number((metricSums.actualTimeHours / count).toFixed(2)),
            technicalDebtHours: Number((metricSums.technicalDebtHours / count).toFixed(2)),
        };
    } catch {
        return null;
    }
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
    const existingIndex = index.findIndex(item => item.directory === dirName);

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

    // Sort by last evaluated (most recent first)
    index.sort((a, b) => new Date(b.lastEvaluated).getTime() - new Date(a.lastEvaluated).getTime());

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
    index.forEach(item => {
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

    // Calculate overall metrics averages
    const overallMetrics = {
        avgQuality: 0,
        avgComplexity: 0,
        avgFunctionalImpact: 0,
        avgTestCoverage: 0,
        avgActualTime: 0,
        totalTechDebt: 0,
        count: 0,
    };

    index.forEach(item => {
        if (item.metrics) {
            overallMetrics.avgQuality += item.metrics.codeQuality || 0;
            overallMetrics.avgComplexity += item.metrics.codeComplexity || 0;
            overallMetrics.avgFunctionalImpact += item.metrics.functionalImpact || 0;
            overallMetrics.avgTestCoverage += item.metrics.testCoverage || 0;
            overallMetrics.avgActualTime += item.metrics.actualTimeHours || 0;
            overallMetrics.totalTechDebt += item.metrics.technicalDebtHours || 0;
            overallMetrics.count++;
        }
    });

    if (overallMetrics.count > 0) {
        overallMetrics.avgQuality = Number((overallMetrics.avgQuality / overallMetrics.count).toFixed(1));
        overallMetrics.avgComplexity = Number((overallMetrics.avgComplexity / overallMetrics.count).toFixed(1));
        overallMetrics.avgFunctionalImpact = Number((overallMetrics.avgFunctionalImpact / overallMetrics.count).toFixed(1));
        overallMetrics.avgTestCoverage = Number((overallMetrics.avgTestCoverage / overallMetrics.count).toFixed(1));
        overallMetrics.avgActualTime = Number((overallMetrics.avgActualTime / overallMetrics.count).toFixed(2));
        overallMetrics.totalTechDebt = Number(overallMetrics.totalTechDebt.toFixed(2));
    }

    // Generate author stats section with metrics
    const authorStatsHtml = Array.from(byAuthor.entries())
        .sort((a, b) => b[1].length - a[1].length) // Sort by commit count
        .map(([author, commits]) => {
            // Calculate author's average metrics
            const authorMetrics = {
                quality: 0,
                complexity: 0,
                testCoverage: 0,
                functionalImpact: 0,
                actualTime: 0,
                techDebt: 0,
                count: 0,
            };
            commits.forEach(c => {
                if (c.metrics) {
                    authorMetrics.quality += c.metrics.codeQuality || 0;
                    authorMetrics.complexity += c.metrics.codeComplexity || 0;
                    authorMetrics.testCoverage += c.metrics.testCoverage || 0;
                    authorMetrics.functionalImpact += c.metrics.functionalImpact || 0;
                    authorMetrics.actualTime += c.metrics.actualTimeHours || 0;
                    authorMetrics.techDebt += c.metrics.technicalDebtHours || 0;
                    authorMetrics.count++;
                }
            });

            const avgQuality = authorMetrics.count > 0 ? (authorMetrics.quality / authorMetrics.count).toFixed(1) : 'N/A';
            const avgComplexity = authorMetrics.count > 0 ? (authorMetrics.complexity / authorMetrics.count).toFixed(1) : 'N/A';
            const avgTestCoverage = authorMetrics.count > 0 ? (authorMetrics.testCoverage / authorMetrics.count).toFixed(1) : 'N/A';
            const avgFunctionalImpact = authorMetrics.count > 0 ? (authorMetrics.functionalImpact / authorMetrics.count).toFixed(1) : 'N/A';
            const avgActualTime = authorMetrics.count > 0 ? (authorMetrics.actualTime / authorMetrics.count).toFixed(2) : 'N/A';
            const totalTechDebt = authorMetrics.count > 0 ? authorMetrics.techDebt.toFixed(2) : 'N/A';

            return `
            <div class="author-card">
                <div class="d-flex justify-content-between align-items-start">
                    <div>
                        <h6 class="mb-1">👤 ${author}</h6>
                        <div class="text-muted small mb-2">${commits.length} commit${commits.length > 1 ? 's' : ''}</div>
                        ${authorMetrics.count > 0 ? `
                        <div class="metrics-mini">
                            <span class="badge bg-primary">Quality: ${avgQuality}/10</span>
                            <span class="badge bg-info">Complexity: ${avgComplexity}/10</span>
                            <span class="badge bg-success">Tests: ${avgTestCoverage}/10</span>
                        </div>
                        ` : ''}
                    </div>
                    <div>
                        <button class="btn btn-sm btn-outline-primary" onclick="filterByAuthor('${author.replace(/'/g, "\\'")}')">
                            View
                        </button>
                    </div>
                </div>
            </div>
        `}).join('');

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
            ${overallMetrics.count > 0 ? `
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
            ` : ''}
        </div>

        <div class="search-filter-bar">
            <div class="row">
                <div class="col-md-6 mb-3 mb-md-0">
                    <input type="text" class="form-control" id="searchInput" placeholder="🔍 Search by hash, author, or message...">
                </div>
                <div class="col-md-6">
                    <div class="filter-buttons">
                        <button class="btn btn-sm btn-outline-primary active" onclick="filterBySource('all')">All</button>
                        <button class="btn btn-sm btn-outline-primary" onclick="filterBySource('commit')">Commit</button>
                        <button class="btn btn-sm btn-outline-primary" onclick="filterBySource('staged')">Staged</button>
                        <button class="btn btn-sm btn-outline-primary" onclick="filterBySource('current')">Current</button>
                        <button class="btn btn-sm btn-outline-primary" onclick="filterBySource('file')">File</button>
                    </div>
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
                const authorMetrics = {
                    quality: 0,
                    complexity: 0,
                    testCoverage: 0,
                    functionalImpact: 0,
                    actualTime: 0,
                    techDebt: 0,
                    count: 0,
                };
                commits.forEach(c => {
                    if (c.metrics) {
                        authorMetrics.quality += c.metrics.codeQuality || 0;
                        authorMetrics.complexity += c.metrics.codeComplexity || 0;
                        authorMetrics.testCoverage += c.metrics.testCoverage || 0;
                        authorMetrics.functionalImpact += c.metrics.functionalImpact || 0;
                        authorMetrics.actualTime += c.metrics.actualTimeHours || 0;
                        authorMetrics.techDebt += c.metrics.technicalDebtHours || 0;
                        authorMetrics.count++;
                    }
                });

                const avgQuality = authorMetrics.count > 0 ? (authorMetrics.quality / authorMetrics.count).toFixed(1) : 'N/A';
                const avgComplexity = authorMetrics.count > 0 ? (authorMetrics.complexity / authorMetrics.count).toFixed(1) : 'N/A';
                const avgTestCoverage = authorMetrics.count > 0 ? (authorMetrics.testCoverage / authorMetrics.count).toFixed(1) : 'N/A';
                const avgFunctionalImpact = authorMetrics.count > 0 ? (authorMetrics.functionalImpact / authorMetrics.count).toFixed(1) : 'N/A';
                const avgActualTime = authorMetrics.count > 0 ? (authorMetrics.actualTime / authorMetrics.count).toFixed(2) : 'N/A';
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
            }).join('')}
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
${index.map(item => {
                const metrics = item.metrics || {};
                const qualityColor = metrics.codeQuality >= 7 ? 'good' : metrics.codeQuality >= 4 ? 'medium' : 'bad';
                const complexityColor = metrics.codeComplexity <= 3 ? 'good' : metrics.codeComplexity <= 6 ? 'medium' : 'bad';
                const testsColor = metrics.testCoverage >= 7 ? 'good' : metrics.testCoverage >= 4 ? 'medium' : 'bad';
                const impactColor = metrics.functionalImpact >= 7 ? 'bad' : metrics.functionalImpact >= 4 ? 'medium' : 'good';
                const debtColor = metrics.technicalDebtHours > 0 ? 'bad' : metrics.technicalDebtHours < 0 ? 'good' : 'medium';

                return `
                        <tr data-source="${item.source || 'unknown'}" data-author="${item.commitAuthor || ''}" data-message="${(item.commitMessage || '').toLowerCase()}" data-hash="${item.commitHash}">
                            <td>
                                <span class="commit-hash">${item.commitHash?.substring(0, 8) || item.directory}</span>
                                ${item.evaluationCount > 1 ? `<br><span class="badge badge-info">${item.evaluationCount}x</span>` : ''}
                            </td>
                            <td>👤 ${item.commitAuthor || 'Unknown'}</td>
                            <td style="max-width: 300px;">${item.commitMessage ? item.commitMessage.split('\\n')[0] : ''}</td>
                            <td style="white-space: nowrap;">${item.commitDate ? new Date(item.commitDate).toLocaleDateString() : ''}</td>
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
            }).join('')}
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

        // Filter by source
        let currentFilter = 'all';
        function filterBySource(source) {
            currentFilter = source;
            const rows = document.querySelectorAll('#commitList tr');
            
            rows.forEach(row => {
                if (source === 'all' || row.dataset.source === source) {
                    row.style.display = '';
                } else {
                    row.style.display = 'none';
                }
            });

            // Update button states
            document.querySelectorAll('.filter-buttons button').forEach(btn => {
                btn.classList.remove('active');
            });
            event.target.classList.add('active');
        }

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

            // Reset source filter to 'all'
            document.querySelectorAll('.filter-buttons button').forEach(btn => {
                btn.classList.remove('active');
                if (btn.textContent === 'All') {
                    btn.classList.add('active');
                }
            });
            currentFilter = 'all';

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

    // Calculate author metrics
    const authorMetrics = {
        quality: 0,
        complexity: 0,
        testCoverage: 0,
        functionalImpact: 0,
        actualTime: 0,
        techDebt: 0,
        count: 0,
    };

    commits.forEach(c => {
        if (c.metrics) {
            authorMetrics.quality += c.metrics.codeQuality || 0;
            authorMetrics.complexity += c.metrics.codeComplexity || 0;
            authorMetrics.testCoverage += c.metrics.testCoverage || 0;
            authorMetrics.functionalImpact += c.metrics.functionalImpact || 0;
            authorMetrics.actualTime += c.metrics.actualTimeHours || 0;
            authorMetrics.techDebt += c.metrics.technicalDebtHours || 0;
            authorMetrics.count++;
        }
    });

    const avgQuality = authorMetrics.count > 0 ? (authorMetrics.quality / authorMetrics.count).toFixed(1) : 'N/A';
    const avgComplexity = authorMetrics.count > 0 ? (authorMetrics.complexity / authorMetrics.count).toFixed(1) : 'N/A';
    const avgTestCoverage = authorMetrics.count > 0 ? (authorMetrics.testCoverage / authorMetrics.count).toFixed(1) : 'N/A';
    const avgFunctionalImpact = authorMetrics.count > 0 ? (authorMetrics.functionalImpact / authorMetrics.count).toFixed(1) : 'N/A';
    const avgActualTime = authorMetrics.count > 0 ? (authorMetrics.actualTime / authorMetrics.count).toFixed(2) : 'N/A';
    const totalTechDebt = authorMetrics.count > 0 ? authorMetrics.techDebt.toFixed(2) : 'N/A';

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

        <div class="table-container">
            <h3 class="section-title">📝 Commits by ${author}</h3>
            <div style="overflow-x: auto;">
                <table>
                    <thead>
                        <tr>
                            <th>Hash</th>
                            <th>Message</th>
                            <th>Date</th>
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
${commits.map(item => {
        const metrics = item.metrics || {};
        const qualityColor = metrics.codeQuality >= 7 ? 'good' : metrics.codeQuality >= 4 ? 'medium' : 'bad';
        const complexityColor = metrics.codeComplexity <= 3 ? 'good' : metrics.codeComplexity <= 6 ? 'medium' : 'bad';
        const testsColor = metrics.testCoverage >= 7 ? 'good' : metrics.testCoverage >= 4 ? 'medium' : 'bad';
        const impactColor = metrics.functionalImpact >= 7 ? 'bad' : metrics.functionalImpact >= 4 ? 'medium' : 'good';
        const debtColor = metrics.technicalDebtHours > 0 ? 'bad' : metrics.technicalDebtHours < 0 ? 'good' : 'medium';

        return `
                        <tr>
                            <td>
                                <span class="commit-hash">${item.commitHash?.substring(0, 8) || item.directory}</span>
                                ${item.evaluationCount > 1 ? `<br><span class="badge badge-info">${item.evaluationCount}x</span>` : ''}
                            </td>
                            <td style="max-width: 400px;">${item.commitMessage ? item.commitMessage.split('\\n')[0] : ''}</td>
                            <td style="white-space: nowrap;">${item.commitDate ? new Date(item.commitDate).toLocaleDateString() : ''}</td>
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
    }).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    </div>

    <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>
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
    return process.platform === 'win32'
        ? `file:///${normalizedPath}`
        : `file://${normalizedPath}`;
}

/**
 * Print completion message for evaluate command (single commit)
 */
export function printEvaluateCompletionMessage(outputDir: string): void {
    const chalk = require('chalk').default;

    console.log(chalk.green(`\n✅ Evaluation complete!`));
    console.log(chalk.cyan(`📁 Output directory: ${chalk.bold(outputDir)}`));
    console.log(chalk.white(`   📄 report-enhanced.html  - 🌟 Conversation Timeline (Interactive)`));
    console.log(chalk.white(`   📝 conversation.md       - 🌟 Markdown Transcript`));
    console.log(chalk.gray(`   📄 report.html           - Standard HTML report`));
    console.log(chalk.gray(`   📋 results.json          - Full JSON results`));
    console.log(chalk.gray(`   📝 commit.diff           - Original diff`));
    console.log(chalk.gray(`   📊 summary.txt           - Quick summary`));
    console.log(chalk.yellow(`\n💡 Open ${chalk.bold('report-enhanced.html')} for interactive view or ${chalk.bold('conversation.md')} for transcript!\n`));

    const indexUrl = buildIndexUrl();
    console.log(chalk.cyan(`\n🌐 View all evaluations: ${indexUrl}\n`));
}

/**
 * Print completion message for batch command (multiple commits)
 */
export function printBatchCompletionMessage(summary: { total: number; complete: number; failed: number }): void {
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
