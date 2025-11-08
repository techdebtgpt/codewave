#!/usr/bin/env node
import { execSync, spawnSync } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import pLimit from 'p-limit';
import { AppConfig } from '../../src/config/config.interface';
import { loadConfig } from '../../src/config/config-loader';
import { CommitEvaluationOrchestrator } from '../../src/orchestrator/commit-evaluation-orchestrator';
import {
    createAgentRegistry,
    generateTimestamp,
    saveEvaluationReports,
    createEvaluationDirectory,
    generateBatchIdentifier,
    EvaluationMetadata,
    printBatchCompletionMessage,
} from '../utils/shared.utils';
import { ProgressTracker } from '../utils/progress-tracker';

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
    };
}

export async function runBatchEvaluateCommand(args: string[]) {
    console.log('🌊 CodeWave: Starting batch commit analysis...\n');

    // Parse arguments
    const options = parseArguments(args);

    if (!options.repository) {
        console.error('❌ Error: --repo <path> is required');
        printBatchUsage();
        process.exit(1);
    }

    // Load configuration
    const config = loadConfig();
    if (!config) {
        console.error('❌ Config file not found. Run `npm run config` to create one.');
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
        'fast': '⚡ Fast (minimal refinement)',
        'normal': '⚙️  Normal (balanced)',
        'deep': '🔍 Deep (thorough analysis)'
    };
    console.log(`📊 Analysis depth: ${depthModeLabel[config.agents.depthMode]}\n`);

    console.log(`📁 Evaluating commits into: .evaluated-commits/\n`);

    // Initialize orchestrator with all agents
    const agentRegistry = createAgentRegistry(config);
    const orchestrator = new CommitEvaluationOrchestrator(agentRegistry, config);

    // Configure concurrency limit (10 concurrent evaluations)
    const limit = pLimit(10);

    // Save original console.log before suppressing
    const originalConsoleLog = console.log;

    // Initialize ANSI progress tracker with original console.log
    const progressTracker = new ProgressTracker();
    (progressTracker as any).originalConsoleLog = originalConsoleLog; // Pass original logger
    progressTracker.initialize(
        commits.map((c) => ({
            hash: c.hash,
            shortHash: c.hash.substring(0, 7),
            author: c.author,
            date: new Date(c.date).toISOString().split('T')[0], // YYYY-MM-DD format
        })),
    );

    // Suppress console output during parallel execution to keep progress display clean
    const originalStdoutWrite = process.stdout.write.bind(process.stdout);
    let suppressOutput = false;

    // Override console.log to suppress orchestrator output (but not progress tracker)
    console.log = (...args: any[]) => {
        if (!suppressOutput) {
            originalConsoleLog(...args);
        }
    };

    // Override process.stdout.write to suppress orchestrator progress messages
    (process.stdout.write as any) = function (str: string, ...args: any[]): boolean {
        if (suppressOutput) {
            // Block orchestrator progress lines like "  [1/2] ✅ 33% [5/15] business-analyst"
            // These start with whitespace and contain the [X/Y] pattern
            if (/^\s+\[[\d]+\/[\d]+\]/.test(str)) {
                return true; // Suppress
            }
        }
        return originalStdoutWrite(str, ...args);
    };

    // Start suppressing output AFTER initial render
    suppressOutput = true;

    // Evaluate commits with concurrency control
    const results: CommitEvaluationResult[] = [];
    let successCount = 0;
    let failureCount = 0;

    // Create evaluation tasks
    const evaluationTasks = commits.map((commit, i) =>
        limit(async () => {
            try {
                // Mark as started
                progressTracker.updateProgress(commit.hash, {
                    status: 'analyzing',
                    progress: 0,
                    currentStep: 'Starting evaluation...',
                });

                // Get commit diff
                const diff = await getCommitDiff(options.repository, commit.hash);

                if (!diff || diff.trim().length === 0) {
                    progressTracker.updateProgress(commit.hash, {
                        status: 'failed',
                        progress: 0,
                        currentStep: 'Empty diff - skipped',
                    });
                    failureCount++;
                    return null;
                }

                // Extract files changed from diff
                const filesChanged = extractFilesFromDiff(diff);

                // Track agent progress
                let totalSteps = 0;
                let maxRounds = 3; // Default
                let commitTokensInput = 0;
                let commitTokensOutput = 0;
                let commitCost = 0;
                let lastRoundReported = -1; // Track last round to avoid duplicate updates

                // Evaluate commit with metadata for better logging and progress tracking
                const evaluationResult = await orchestrator.evaluateCommit(
                    {
                        commitDiff: diff,
                        filesChanged,
                        commitHash: commit.hash,
                        commitIndex: i + 1,
                        totalCommits: commits.length,
                    },
                    {
                        streaming: true, // Enable streaming to get token/cost updates
                        onProgress: (state: any) => {
                            // Track vector store indexing progress
                            if (state.type === 'vectorizing') {
                                progressTracker.updateProgress(commit.hash, {
                                    status: 'vectorizing',
                                    progress: state.progress,
                                    currentStep: `Indexing: ${state.current}/${state.total} chunks`,
                                });
                            }
                            // Track agent execution progress (from LangGraph workflow)
                            else if (state.agentResults !== undefined) {
                                const currentRound = state.currentRound || 0;
                                maxRounds = state.maxRounds || 3;

                                // Track tokens and cost from state (don't update progress bar yet)
                                if (state.totalInputTokens !== undefined) commitTokensInput = state.totalInputTokens;
                                if (state.totalOutputTokens !== undefined) commitTokensOutput = state.totalOutputTokens;
                                if (state.totalCost !== undefined) commitCost = state.totalCost;

                                // Only update progress bar when round changes
                                if (currentRound !== lastRoundReported) {
                                    lastRoundReported = currentRound;

                                    // Calculate progress based on rounds completed
                                    const progress = Math.floor(((currentRound + 1) / maxRounds) * 100);

                                    progressTracker.updateProgress(commit.hash, {
                                        status: 'analyzing',
                                        progress,
                                        inputTokens: commitTokensInput,
                                        outputTokens: commitTokensOutput,
                                        totalCost: commitCost,
                                    });
                                }
                            }
                        },
                    },
                );

                // Extract agent results and metadata from evaluation result
                const agentResults = evaluationResult.agentResults || [];

                // Create evaluation directory using short commit hash (first 8 chars)
                const shortHash = commit.hash.substring(0, 8);
                const commitOutputDir = await createEvaluationDirectory(shortHash);

                // Prepare metadata with developer overview
                const metadata: EvaluationMetadata = {
                    timestamp: new Date().toISOString(),
                    commitHash: commit.hash,
                    commitAuthor: commit.author,
                    commitMessage: commit.message,
                    commitDate: commit.date,
                    source: 'batch',
                    developerOverview: evaluationResult.developerOverview, // Include developer overview
                };

                // Save all reports using shared utility
                await saveEvaluationReports({
                    agentResults,
                    outputDir: commitOutputDir,
                    metadata,
                    diff,
                });

                // Calculate aggregate metrics
                const metrics = calculateAggregateMetrics(agentResults);

                // Extract internal iteration metrics from agent results
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

                // Mark as complete with final token/cost info and internal iteration metrics
                progressTracker.updateProgress(commit.hash, {
                    status: 'complete',
                    progress: 100,
                    currentStep: '✅ Complete',
                    inputTokens: commitTokensInput,
                    outputTokens: commitTokensOutput,
                    totalCost: commitCost,
                    internalIterations: agentCount > 0 ? totalInternalIterations : undefined,
                    clarityScore: agentCount > 0 ? avgClarityScore : undefined,
                });

                successCount++;

                return {
                    commit,
                    agentResults,
                    outputDir: commitOutputDir,
                    metrics,
                };

            } catch (error) {
                const errorMsg = error instanceof Error ? error.message : String(error);
                const errorStack = error instanceof Error ? error.stack : '';
                // Log error to console even when suppressed
                originalConsoleLog(`❌ Error evaluating ${commit.hash}: ${errorMsg}`);
                if (errorStack) {
                    originalConsoleLog(`Stack: ${errorStack.substring(0, 300)}`);
                }

                // Mark as failed
                progressTracker.updateProgress(commit.hash, {
                    status: 'failed',
                    progress: 0,
                    currentStep: `Error: ${errorMsg.substring(0, 30)}`,
                });

                failureCount++;
                return null;
            }
        })
    );

    // Execute all tasks with concurrency limit
    const evaluationResults = await Promise.all(evaluationTasks);

    // Restore console.log and process.stdout.write
    suppressOutput = false;
    console.log = originalConsoleLog;
    process.stdout.write = originalStdoutWrite as any;

    // Finalize progress tracker
    progressTracker.finalize();

    // Filter out null results (failed or skipped commits)
    results.push(...evaluationResults.filter((r): r is CommitEvaluationResult => r !== null));

    // Get summary from tracker
    const summary = progressTracker.getSummary();

    // Print final summary using shared output function
    printBatchCompletionMessage(summary);
}

function parseArguments(args: string[]): any {
    const options: any = {
        repository: null,
        since: null,
        until: null,
        count: null,
        branch: 'HEAD',
        depth: 'normal', // Default depth mode
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
            case '-d':
                const depthValue = args[++i]?.toLowerCase();
                if (['fast', 'normal', 'deep'].includes(depthValue)) {
                    options.depth = depthValue;
                } else {
                    console.warn(`⚠️  Invalid depth mode: ${depthValue}. Use 'fast', 'normal', or 'deep'. Defaulting to 'normal'.`);
                }
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

async function getCommitDiff(repoPath: string, commitHash: string): Promise<string> {
    try {
        const result = spawnSync('git', ['show', commitHash], {
            cwd: repoPath,
            encoding: 'utf-8',
            maxBuffer: 10 * 1024 * 1024, // 10MB buffer
        });

        if (result.error) {
            throw result.error;
        }
        if (result.status !== 0) {
            console.error(`Failed to get diff for commit ${commitHash}: ${result.stderr}`);
            return '';
        }

        return result.stdout;
    } catch (error) {
        console.error(`Failed to get diff for commit ${commitHash}:`, error);
        return '';
    }
}

function extractFilesFromDiff(diff: string): string[] {
    const files: string[] = [];
    const lines = diff.split('\n');

    for (const line of lines) {
        if (line.startsWith('diff --git')) {
            const match = line.match(/diff --git a\/(.+?) b\//);
            if (match) {
                files.push(match[1]);
            }
        }
    }

    return files;
}

function calculateAggregateMetrics(agentResults: any[]): any {
    const metrics: any = {
        functionalImpact: 0,
        idealTimeHours: 0,
        testCoverage: 0,
        codeQuality: 0,
        codeComplexity: 0,
        actualTimeHours: 0,
        technicalDebtHours: 0,
    };

    // Import weighted aggregation
    const { calculateWeightedAverage } = require('../../src/constants/agent-weights.constants');

    // Get latest metrics from each agent
    const agentMetricsMap = new Map<string, any>();
    agentResults.forEach(result => {
        if (result.metrics && result.agentRole) {
            agentMetricsMap.set(result.agentRole, result.metrics);
        }
    });

    // Calculate weighted average for each metric
    const metricNames = Object.keys(metrics);
    metricNames.forEach(metricName => {
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
            metrics[metricName] = calculateWeightedAverage(contributors, metricName);
        }
    });

    return metrics;
}

function generateCommitSummary(commit: CommitInfo, agentResults: any[]): string {
    const metrics = calculateAggregateMetrics(agentResults);

    let summary = `Commit Evaluation Summary\n`;
    summary += `${'='.repeat(80)}\n\n`;
    summary += `Commit: ${commit.hash}\n`;
    summary += `Author: ${commit.author} <${commit.email}>\n`;
    summary += `Date: ${commit.date}\n`;
    summary += `Message: ${commit.message}\n\n`;
    summary += `${'='.repeat(80)}\n\n`;
    summary += `Aggregate Metrics (Weighted Average):\n`;
    summary += `  - Functional Impact: ${metrics.functionalImpact.toFixed(2)}/10\n`;
    summary += `  - Ideal Time: ${metrics.idealTimeHours.toFixed(2)} hours\n`;
    summary += `  - Test Coverage: ${metrics.testCoverage.toFixed(2)}/10\n`;
    summary += `  - Code Quality: ${metrics.codeQuality.toFixed(2)}/10\n`;
    summary += `  - Code Complexity: ${metrics.codeComplexity.toFixed(2)}/10\n`;
    summary += `  - Actual Time: ${metrics.actualTimeHours.toFixed(2)} hours\n`;
    summary += `  - Technical Debt: ${metrics.technicalDebtHours.toFixed(2)} hours\n\n`;
    summary += `${'='.repeat(80)}\n\n`;
    summary += `Agent Responses: ${agentResults.length}\n`;

    return summary;
}

async function generateBatchSummaryReport(
    batchDir: string,
    results: CommitEvaluationResult[],
    options: any,
) {
    // Generate HTML summary
    const htmlSummary = generateBatchHtmlSummary(results, options);
    await fs.writeFile(path.join(batchDir, 'batch-summary.html'), htmlSummary);

    // Generate Markdown summary
    const mdSummary = generateBatchMarkdownSummary(results, options);
    await fs.writeFile(path.join(batchDir, 'batch-summary.md'), mdSummary);

    // Save JSON results
    await fs.writeFile(
        path.join(batchDir, 'batch-results.json'),
        JSON.stringify(results, null, 2),
    );
}

function generateBatchHtmlSummary(results: CommitEvaluationResult[], options: any): string {
    const now = new Date().toLocaleString();

    // Group by author
    const byAuthor = new Map<string, CommitEvaluationResult[]>();
    results.forEach(result => {
        const author = result.commit.author;
        if (!byAuthor.has(author)) {
            byAuthor.set(author, []);
        }
        byAuthor.get(author)!.push(result);
    });

    const tableRows = results.map(result => `
        <tr>
            <td><code>${result.commit.hash.substring(0, 8)}</code></td>
            <td>${result.commit.author}</td>
            <td>${new Date(result.commit.date).toLocaleDateString()}</td>
            <td>${escapeHtml(result.commit.message.split('\n')[0].substring(0, 60))}...</td>
            <td class="text-center">${result.metrics.functionalImpact.toFixed(1)}</td>
            <td class="text-center">${result.metrics.testCoverage.toFixed(1)}</td>
            <td class="text-center">${result.metrics.codeQuality.toFixed(1)}</td>
            <td class="text-center">${result.metrics.codeComplexity.toFixed(1)}</td>
            <td class="text-center">${result.metrics.technicalDebtHours.toFixed(1)}h</td>
            <td><a href="${path.relative(path.dirname(result.outputDir), result.outputDir)}/report-enhanced.html" class="btn btn-sm btn-primary">View</a></td>
        </tr>
    `).join('');

    const authorSummaries = Array.from(byAuthor.entries()).map(([author, commits]) => {
        const avgMetrics = {
            functionalImpact: commits.reduce((sum, c) => sum + c.metrics.functionalImpact, 0) / commits.length,
            testCoverage: commits.reduce((sum, c) => sum + c.metrics.testCoverage, 0) / commits.length,
            codeQuality: commits.reduce((sum, c) => sum + c.metrics.codeQuality, 0) / commits.length,
            codeComplexity: commits.reduce((sum, c) => sum + c.metrics.codeComplexity, 0) / commits.length,
            technicalDebtHours: commits.reduce((sum, c) => sum + c.metrics.technicalDebtHours, 0),
        };

        return `
            <tr>
                <td><strong>${author}</strong></td>
                <td class="text-center">${commits.length}</td>
                <td class="text-center">${avgMetrics.functionalImpact.toFixed(1)}</td>
                <td class="text-center">${avgMetrics.testCoverage.toFixed(1)}</td>
                <td class="text-center">${avgMetrics.codeQuality.toFixed(1)}</td>
                <td class="text-center">${avgMetrics.codeComplexity.toFixed(1)}</td>
                <td class="text-center">${avgMetrics.technicalDebtHours.toFixed(1)}h</td>
            </tr>
        `;
    }).join('');

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>CodeWave - Batch Analysis Summary</title>
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
    <style>
        body { padding: 20px; }
        .metric-card { margin-bottom: 20px; }
        table { font-size: 0.9rem; }
    </style>
</head>
<body>
    <div class="container-fluid">
        <h1 class="mb-4">🌊 CodeWave Batch Analysis</h1>
        
        <div class="alert alert-info">
            <strong>Generated:</strong> ${now}<br>
            <strong>Repository:</strong> ${options.repository}<br>
            <strong>Total Commits:</strong> ${results.length}
        </div>

        <h2 class="mt-5 mb-3">👥 Summary by Author</h2>
        <table class="table table-striped table-hover">
            <thead class="table-dark">
                <tr>
                    <th>Author</th>
                    <th class="text-center">Commits</th>
                    <th class="text-center">Avg Functional Impact</th>
                    <th class="text-center">Avg Test Coverage</th>
                    <th class="text-center">Avg Code Quality</th>
                    <th class="text-center">Avg Complexity</th>
                    <th class="text-center">Total Tech Debt</th>
                </tr>
            </thead>
            <tbody>
                ${authorSummaries}
            </tbody>
        </table>

        <h2 class="mt-5 mb-3">📋 All Commits</h2>
        <table class="table table-striped table-hover">
            <thead class="table-dark">
                <tr>
                    <th>Commit</th>
                    <th>Author</th>
                    <th>Date</th>
                    <th>Message</th>
                    <th class="text-center">Impact</th>
                    <th class="text-center">Tests</th>
                    <th class="text-center">Quality</th>
                    <th class="text-center">Complexity</th>
                    <th class="text-center">Tech Debt</th>
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody>
                ${tableRows}
            </tbody>
        </table>
    </div>

    <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>
</body>
</html>`;
}

function generateBatchMarkdownSummary(results: CommitEvaluationResult[], options: any): string {
    const now = new Date().toLocaleString();

    // Group by author
    const byAuthor = new Map<string, CommitEvaluationResult[]>();
    results.forEach(result => {
        const author = result.commit.author;
        if (!byAuthor.has(author)) {
            byAuthor.set(author, []);
        }
        byAuthor.get(author)!.push(result);
    });

    let md = `# CodeWave Batch Analysis Summary\n\n`;
    md += `**Generated**: ${now}  \n`;
    md += `**Repository**: ${options.repository}  \n`;
    md += `**Total Commits**: ${results.length}\n\n`;
    md += `---\n\n`;

    md += `## 👥 Summary by Author\n\n`;
    md += `| Author | Commits | Avg Impact | Avg Tests | Avg Quality | Avg Complexity | Total Debt |\n`;
    md += `|--------|---------|------------|-----------|-------------|----------------|------------|\n`;

    byAuthor.forEach((commits, author) => {
        const avgMetrics = {
            functionalImpact: commits.reduce((sum, c) => sum + c.metrics.functionalImpact, 0) / commits.length,
            testCoverage: commits.reduce((sum, c) => sum + c.metrics.testCoverage, 0) / commits.length,
            codeQuality: commits.reduce((sum, c) => sum + c.metrics.codeQuality, 0) / commits.length,
            codeComplexity: commits.reduce((sum, c) => sum + c.metrics.codeComplexity, 0) / commits.length,
            technicalDebtHours: commits.reduce((sum, c) => sum + c.metrics.technicalDebtHours, 0),
        };

        md += `| ${author} | ${commits.length} | ${avgMetrics.functionalImpact.toFixed(1)} | ${avgMetrics.testCoverage.toFixed(1)} | ${avgMetrics.codeQuality.toFixed(1)} | ${avgMetrics.codeComplexity.toFixed(1)} | ${avgMetrics.technicalDebtHours.toFixed(1)}h |\n`;
    });

    md += `\n---\n\n`;
    md += `## 📋 All Commits\n\n`;
    md += `| Commit | Author | Date | Message | Impact | Tests | Quality | Complexity | Debt |\n`;
    md += `|--------|--------|------|---------|--------|-------|---------|------------|------|\n`;

    results.forEach(result => {
        const shortHash = result.commit.hash.substring(0, 8);
        const date = new Date(result.commit.date).toLocaleDateString();
        const message = result.commit.message.split('\n')[0].substring(0, 40);
        md += `| \`${shortHash}\` | ${result.commit.author} | ${date} | ${message}... | ${result.metrics.functionalImpact.toFixed(1)} | ${result.metrics.testCoverage.toFixed(1)} | ${result.metrics.codeQuality.toFixed(1)} | ${result.metrics.codeComplexity.toFixed(1)} | ${result.metrics.technicalDebtHours.toFixed(1)}h |\n`;
    });

    return md;
}

function escapeHtml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function validateConfig(config: AppConfig) {
    if (!config.apiKeys.anthropic && !config.apiKeys.openai && !config.apiKeys.google) {
        console.error('❌ Error: No API keys configured. Run `codewave config --init` first.');
        process.exit(1);
    }
}

function printBatchUsage() {
    console.log('Usage: codewave batch --repo <path> [options]');
    console.log('\nOptions:');
    console.log('  --repo, -r <path>      Path to git repository (required)');
    console.log('  --since <date>         Evaluate commits since this date (e.g., "2025-01-01")');
    console.log('  --until <date>         Evaluate commits until this date');
    console.log('  --count, -n <number>   Evaluate last N commits');
    console.log('  --branch, -b <name>    Branch to evaluate (default: HEAD)');
    console.log('\nExamples:');
    console.log('  codewave batch --repo /path/to/repo --count 10');
    console.log('  codewave batch --repo /path/to/repo --since "2025-01-01"');
    console.log('  codewave batch --repo /path/to/repo --since "2025-01-01" --until "2025-01-31"');
}

