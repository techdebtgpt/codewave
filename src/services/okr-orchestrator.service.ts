import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';
import { AppConfig } from '../config/config.interface';
import {
  AuthorStatsAggregatorService,
  AggregationOptions,
  AuthorStats,
} from './author-stats-aggregator.service';
import { OkrAgentService } from './okr-agent.service';
import { formatOKRToMarkdown } from '../formatters/okr-formatter';

/**
 * Progress information for a single author's OKR generation
 */
interface OkrProgress {
  author: string;
  status: 'pending' | 'running' | 'done' | 'failed';
  strongPoints: number;
  weakPoints: number;
  knowledgeGaps: number;
  okrSummary: string;
  cost: number;
  error?: string;
}

/**
 * Result of OKR generation for a single author
 */
interface OkrGenerationResult {
  author: string;
  okrData: any;
  cost: number;
}

/**
 * Service responsible for orchestrating parallel OKR generation
 * Follows Single Responsibility Principle - handles only OKR generation orchestration
 */
export class OkrOrchestrator {
  private agentService: OkrAgentService;
  private progressMap: Map<string, OkrProgress> = new Map();

  constructor(private config: AppConfig) {
    this.agentService = new OkrAgentService(config);
  }

  /**
   * Generate OKRs for multiple authors in parallel with progress tracking
   * @param authors List of author names
   * @param evalRoot Evaluation root directory
   * @param options Aggregation options
   * @param concurrency Maximum concurrent OKR generations (default: 2)
   */
  async generateOkrsWithProgress(
    authors: string[],
    evalRoot: string,
    options: AggregationOptions = {},
    concurrency: number = 2
  ): Promise<Map<string, any>> {
    const pLimit = (await import('p-limit')).default;
    const limit = pLimit(concurrency);

    // Initialize progress tracking
    this.initializeProgress(authors);

    // Display initial progress
    this.displayProgress();

    // Create tasks for parallel execution
    const tasks = authors.map((author) =>
      limit(async () => this.generateSingleAuthorOkr(author, evalRoot, options))
    );

    // Execute all tasks
    const results = await Promise.allSettled(tasks);

    // Collect successful results
    const okrMap = new Map<string, any>();
    results.forEach((result, index) => {
      if (result.status === 'fulfilled' && result.value) {
        okrMap.set(result.value.author, result.value.okrData);
      }
    });

    // Final progress display
    this.displayProgress(true);

    return okrMap;
  }

  /**
   * Generate OKR for a single author
   * DRY: Extracted from generate-okr-command to be reusable
   */
  private async generateSingleAuthorOkr(
    author: string,
    evalRoot: string,
    options: AggregationOptions
  ): Promise<OkrGenerationResult | null> {
    try {
      // Update status to running
      this.updateProgress(author, { status: 'running' });
      this.displayProgress();

      // Aggregate author data
      const authorData = await AuthorStatsAggregatorService.aggregateAuthorStats(evalRoot, {
        ...options,
        targetAuthor: author,
      });

      const evaluations = authorData.get(author);
      if (!evaluations || evaluations.length === 0) {
        throw new Error('No evaluations found');
      }

      // Analyze author
      const analysis = AuthorStatsAggregatorService.analyzeAuthor(evaluations);

      // Generate OKR
      const okrData = await this.agentService.generateOkrsForAuthor(
        author,
        analysis.stats,
        analysis.strengths,
        analysis.weaknesses,
        evaluations
      );

      // Calculate cost (approximate based on token usage)
      const cost = this.estimateCost(okrData);

      // Update progress with results
      this.updateProgress(author, {
        status: 'done',
        strongPoints: okrData.strongPoints?.length || 0,
        weakPoints: okrData.weakPoints?.length || 0,
        knowledgeGaps: okrData.knowledgeGaps?.length || 0,
        okrSummary: this.buildOkrSummary(okrData),
        cost,
      });
      this.displayProgress();

      return { author, okrData, cost };
    } catch (error) {
      this.updateProgress(author, {
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
      });
      this.displayProgress();
      return null;
    }
  }

  /**
   * Save generated OKRs to disk
   * DRY: Extracted and simplified from generate-okr-command
   */
  async saveOkrs(evalRoot: string, okrMap: Map<string, any>): Promise<void> {
    const okrsDir = path.join(evalRoot, '.okrs');
    if (!fs.existsSync(okrsDir)) {
      await fs.promises.mkdir(okrsDir, { recursive: true });
    }

    // Save JSON
    await this.saveOkrsJson(okrsDir, okrMap);

    // Save Markdown files
    await this.saveOkrsMarkdown(okrsDir, okrMap);
  }

  /**
   * Save OKRs as JSON (for programmatic access)
   */
  private async saveOkrsJson(okrsDir: string, okrMap: Map<string, any>): Promise<void> {
    const jsonPath = path.join(okrsDir, 'author-okrs.json');

    // Merge with existing
    let existingOkrs: Record<string, any> = {};
    if (fs.existsSync(jsonPath)) {
      try {
        existingOkrs = JSON.parse(await fs.promises.readFile(jsonPath, 'utf-8'));
      } catch (e) {
        // Ignore parse errors
      }
    }

    const allOkrs = { ...existingOkrs, ...Object.fromEntries(okrMap) };
    await fs.promises.writeFile(jsonPath, JSON.stringify(allOkrs, null, 2));
    console.log(chalk.cyan(`\n💾 Saved OKRs (JSON) to ${jsonPath}`));
  }

  /**
   * Save OKRs as Markdown files (for human reading)
   */
  private async saveOkrsMarkdown(okrsDir: string, okrMap: Map<string, any>): Promise<void> {
    for (const [author, okrData] of okrMap.entries()) {
      const sanitizedAuthor = author.replace(/[^a-z0-9]/gi, '_').toLowerCase();
      const timestamp = new Date().toISOString().split('T')[0];
      const mdPath = path.join(okrsDir, `${sanitizedAuthor}_${timestamp}.md`);

      const markdown = formatOKRToMarkdown({
        authorName: author,
        ...okrData,
      });

      await fs.promises.writeFile(mdPath, markdown);
      console.log(chalk.cyan(`💾 Saved OKR profile (Markdown) to ${mdPath}`));
    }
  }

  /**
   * Estimate cost for OKR generation
   * Based on average token usage: ~1800 tokens per author
   */
  static estimateTotalCost(authorCount: number): number {
    const avgTokensPerAuthor = 1800;
    const costPer1MTokens = 0.15; // Approximate input token cost
    return (authorCount * avgTokensPerAuthor * costPer1MTokens) / 1000000;
  }

  /**
   * Estimate cost for a single OKR generation result
   */
  private estimateCost(okrData: any): number {
    // Rough estimation based on content size
    const contentSize =
      (okrData.strongPoints?.length || 0) * 50 +
      (okrData.weakPoints?.length || 0) * 50 +
      (okrData.knowledgeGaps?.length || 0) * 30 +
      (okrData.okr3Month ? 200 : 0) +
      (okrData.okr6Month ? 200 : 0) +
      (okrData.okr12Month ? 200 : 0) +
      (okrData.actionPlan?.length || 0) * 100;

    const costPer1MTokens = 0.15;
    return (contentSize * costPer1MTokens) / 1000000;
  }

  /**
   * Initialize progress tracking for all authors
   */
  private initializeProgress(authors: string[]): void {
    this.progressMap.clear();
    authors.forEach((author) => {
      this.progressMap.set(author, {
        author,
        status: 'pending',
        strongPoints: 0,
        weakPoints: 0,
        knowledgeGaps: 0,
        okrSummary: '',
        cost: 0,
      });
    });
  }

  /**
   * Update progress for a specific author
   */
  private updateProgress(author: string, updates: Partial<OkrProgress>): void {
    const current = this.progressMap.get(author);
    if (current) {
      this.progressMap.set(author, { ...current, ...updates });
    }
  }

  /**
   * Display progress table
   * DRY: Similar pattern to batch-evaluate-command but extracted for reuse
   */
  private displayProgress(final: boolean = false): void {
    // Clear console and redraw (only if not final)
    if (!final) {
      process.stdout.write('\x1B[2J\x1B[0f'); // Clear screen
    }

    console.log(chalk.cyan('\n🎯 Generating OKRs...\n'));

    // Display each author's progress
    for (const progress of this.progressMap.values()) {
      const statusIcon = this.getStatusIcon(progress.status);
      const progressBar = this.getProgressBar(progress.status);
      const summary = this.getProgressSummary(progress);

      console.log(
        `${progress.author.padEnd(20)} ${progressBar} ${statusIcon.padEnd(10)} ${summary}`
      );
    }

    // Display totals
    const completed = Array.from(this.progressMap.values()).filter(
      (p) => p.status === 'done'
    ).length;
    const total = this.progressMap.size;
    const totalCost = Array.from(this.progressMap.values()).reduce((sum, p) => sum + p.cost, 0);

    console.log(
      chalk.gray(`\nProgress: ${completed}/${total} | Total cost: $${totalCost.toFixed(4)}`)
    );
  }

  /**
   * Get status icon for display
   */
  private getStatusIcon(status: OkrProgress['status']): string {
    switch (status) {
      case 'done':
        return chalk.green('✓ done');
      case 'running':
        return chalk.yellow('⟳ running');
      case 'failed':
        return chalk.red('✗ failed');
      default:
        return chalk.gray('○ pending');
    }
  }

  /**
   * Get progress bar for display
   */
  private getProgressBar(status: OkrProgress['status']): string {
    const barLength = 12;
    if (status === 'done') {
      return chalk.green('█'.repeat(barLength));
    } else if (status === 'running') {
      const filled = Math.floor(barLength / 2);
      return chalk.yellow('█'.repeat(filled)) + chalk.gray('░'.repeat(barLength - filled));
    } else if (status === 'failed') {
      return chalk.red('█'.repeat(barLength));
    } else {
      return chalk.gray('░'.repeat(barLength));
    }
  }

  /**
   * Get progress summary for display
   */
  private getProgressSummary(progress: OkrProgress): string {
    if (progress.status === 'failed') {
      return chalk.red(progress.error || 'Unknown error');
    } else if (progress.status === 'done') {
      return chalk.gray(
        `${progress.strongPoints}/${progress.weakPoints}/${progress.knowledgeGaps}  ${progress.okrSummary}  $${progress.cost.toFixed(4)}`
      );
    } else {
      return chalk.gray('-');
    }
  }

  /**
   * Build OKR summary string (e.g., "3M+6M+12M")
   */
  private buildOkrSummary(okrData: any): string {
    const parts: string[] = [];
    if (okrData.okr3Month) parts.push('3M');
    if (okrData.okr6Month) parts.push('6M');
    if (okrData.okr12Month) parts.push('12M');
    return parts.join('+') || '-';
  }
}
