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
import { formatOKRToHTML } from '../formatters/okr-html-formatter';

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
   * @param silent If true, suppress progress display (for batch evaluation)
   */
  async generateOkrsWithProgress(
    authors: string[],
    evalRoot: string,
    options: AggregationOptions = {},
    concurrency: number = 2,
    silent: boolean = false
  ): Promise<Map<string, any>> {
    const pLimit = (await import('p-limit')).default;
    const limit = pLimit(concurrency);

    // Initialize progress tracking
    this.initializeProgress(authors);

    // Display initial progress (only if not silent)
    if (!silent) {
      this.displayProgress();
    }

    // Create tasks for parallel execution
    const tasks = authors.map((author) =>
      limit(async () => this.generateSingleAuthorOkr(author, evalRoot, options, silent))
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

    // Final progress display (only if not silent)
    if (!silent) {
      this.displayProgress(true);
    }

    return okrMap;
  }

  /**
   * Generate OKR for a single author
   * DRY: Extracted from generate-okr-command to be reusable
   */
  private async generateSingleAuthorOkr(
    author: string,
    evalRoot: string,
    options: AggregationOptions,
    silent: boolean = false
  ): Promise<OkrGenerationResult | null> {
    try {
      // Update status to running (only if not silent)
      this.updateProgress(author, { status: 'running' });
      if (!silent) {
        this.displayProgress();
      }

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

      // Update progress with results (only if not silent)
      this.updateProgress(author, {
        status: 'done',
        strongPoints: okrData.strongPoints?.length || 0,
        weakPoints: okrData.weakPoints?.length || 0,
        knowledgeGaps: okrData.knowledgeGaps?.length || 0,
        okrSummary: this.buildOkrSummary(okrData),
        cost,
      });
      if (!silent) {
        this.displayProgress();
      }

      return { author, okrData, cost };
    } catch (error) {
      this.updateProgress(author, {
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
      });
      if (!silent) {
        this.displayProgress();
      }
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

    // Save all formats per author
    for (const [author, okrData] of okrMap.entries()) {
      await this.saveAuthorOkrs(okrsDir, author, okrData);
    }
  }

  /**
   * Save all OKR formats for a single author
   * Creates author-specific folder with JSON, MD, and HTML files
   */
  private async saveAuthorOkrs(
    okrsDir: string,
    author: string,
    okrData: any
  ): Promise<void> {
    const sanitizedAuthor = author.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const authorDir = path.join(okrsDir, sanitizedAuthor);

    // Create author directory if it doesn't exist
    if (!fs.existsSync(authorDir)) {
      await fs.promises.mkdir(authorDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().split('T')[0];

    // Save JSON (historical record)
    await this.saveAuthorJson(authorDir, author, okrData, timestamp);

    // Save Markdown
    await this.saveAuthorMarkdown(authorDir, author, okrData, timestamp);

    // Save HTML
    await this.saveAuthorHtml(authorDir, author, okrData, timestamp);
  }

  /**
   * Save author OKR as JSON with historical tracking
   */
  private async saveAuthorJson(
    authorDir: string,
    author: string,
    okrData: any,
    timestamp: string
  ): Promise<void> {
    const jsonPath = path.join(authorDir, `okr_${timestamp}.json`);

    const jsonData = {
      authorName: author,
      generatedAt: new Date().toISOString(),
      ...okrData,
    };

    await fs.promises.writeFile(jsonPath, JSON.stringify(jsonData, null, 2));
    console.log(chalk.cyan(`💾 Saved OKR profile (JSON) to ${jsonPath}`));
  }

  /**
   * Save author OKR as Markdown
   */
  private async saveAuthorMarkdown(
    authorDir: string,
    author: string,
    okrData: any,
    timestamp: string
  ): Promise<void> {
    const mdPath = path.join(authorDir, `okr_${timestamp}.md`);

    const markdown = formatOKRToMarkdown({
      authorName: author,
      ...okrData,
    });

    await fs.promises.writeFile(mdPath, markdown);
    console.log(chalk.cyan(`💾 Saved OKR profile (Markdown) to ${mdPath}`));
  }

  /**
   * Save author OKR as HTML
   */
  private async saveAuthorHtml(
    authorDir: string,
    author: string,
    okrData: any,
    timestamp: string
  ): Promise<void> {
    const htmlPath = path.join(authorDir, `okr_${timestamp}.html`);

    const html = formatOKRToHTML({
      authorName: author,
      ...okrData,
    });

    await fs.promises.writeFile(htmlPath, html);
    console.log(chalk.cyan(`💾 Saved OKR profile (HTML) to ${htmlPath}`));
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
   * Display progress using simple console output
   * Note: This method is only called when silent=false
   * No progress bars to avoid conflicts with batch evaluation
   */
  private displayProgress(final: boolean = false): void {
    // Calculate stats
    const completed = Array.from(this.progressMap.values()).filter(
      (p) => p.status === 'done'
    ).length;
    const total = this.progressMap.size;
    const totalCost = Array.from(this.progressMap.values()).reduce((sum, p) => sum + p.cost, 0);

    if (final) {
      // Print final summary
      console.log(chalk.cyan('\n🎯 OKR Generation Complete!\n'));
      for (const progress of this.progressMap.values()) {
        const statusIcon = this.getStatusIcon(progress.status);
        const summary = this.getProgressSummary(progress);
        console.log(`${progress.author.padEnd(20)} ${statusIcon.padEnd(10)} ${summary}`);
      }
      console.log(
        chalk.gray(`\nTotal: ${completed}/${total} | Total cost: $${totalCost.toFixed(4)}`)
      );
    } else {
      // Show current progress inline (no progress bars)
      const currentProgress = Array.from(this.progressMap.values()).find(
        (p) => p.status === 'running'
      );

      if (currentProgress) {
        const statusIcon = this.getStatusIcon(currentProgress.status);
        console.log(
          chalk.gray(
            `  [${completed}/${total}] ${statusIcon} ${currentProgress.author.padEnd(20)}`
          )
        );
      }
    }
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
