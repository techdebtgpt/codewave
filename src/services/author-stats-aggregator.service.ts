// src/services/author-stats-aggregator.service.ts
// Service for aggregating commit evaluation metrics by author

import * as fs from 'fs';
import * as path from 'path';
import { MetricsCalculationService } from './metrics-calculation.service';

export interface AuthorStats {
  commits: number;
  quality: number;
  complexity: number;
  tests: number;
  impact: number;
  time: number;
  techDebt: number;
  commitScore: number;
}

export interface AggregationOptions {
  targetAuthor?: string;
  sinceDate?: Date;
  countLimit?: number;
}

export interface AuthorAnalysis {
  stats: AuthorStats;
  strengths: string[];
  weaknesses: string[];
}

/**
 * Service for aggregating author statistics from evaluation results
 * Follows Single Responsibility Principle - only handles data aggregation
 */
export class AuthorStatsAggregatorService {
  /**
   * Get the latest evaluation for each unique commit hash
   * @private
   */
  private static getLatestEvaluationPerCommit(evaluations: any[]): any[] {
    const uniqueEvaluations = new Map<string, any>();
    let duplicatesSkipped = 0;

    for (const evaluation of evaluations) {
      const hash = evaluation.metadata?.commitHash;
      if (!hash) continue;

      if (!uniqueEvaluations.has(hash)) {
        uniqueEvaluations.set(hash, evaluation);
      } else {
        // Keep the one with the later timestamp
        const existing = uniqueEvaluations.get(hash);
        const evalDate = new Date(evaluation.timestamp);
        const existingDate = new Date(existing.timestamp);

        if (evalDate > existingDate) {
          console.log(
            `   🔄 Replacing evaluation for ${hash.substring(0, 7)} (${existingDate.toISOString()} → ${evalDate.toISOString()})`
          );
          uniqueEvaluations.set(hash, evaluation);
          duplicatesSkipped++;
        } else {
          console.log(
            `   ⏭️  Skipping older evaluation for ${hash.substring(0, 7)} (${evalDate.toISOString()} < ${existingDate.toISOString()})`
          );
          duplicatesSkipped++;
        }
      }
    }

    if (duplicatesSkipped > 0) {
      console.log(
        `   📊 Deduplication: ${duplicatesSkipped} duplicate evaluations skipped, ${uniqueEvaluations.size} unique commits kept`
      );
    }

    return Array.from(uniqueEvaluations.values());
  }

  /**
   * Aggregate commit metrics by author from evaluation results
   */
  static async aggregateAuthorStats(
    evalRoot: string,
    options: AggregationOptions = {}
  ): Promise<Map<string, any[]>> {
    const { targetAuthor, sinceDate, countLimit } = options;

    if (!fs.existsSync(evalRoot)) {
      throw new Error(`Evaluation directory not found: ${evalRoot}`);
    }

    const dirs = await fs.promises.readdir(evalRoot);
    const authorData = new Map<string, any[]>();

    for (const dir of dirs) {
      const resultsPath = path.join(evalRoot, dir, 'results.json');
      if (!fs.existsSync(resultsPath)) continue;

      try {
        const content = await fs.promises.readFile(resultsPath, 'utf-8');
        const data = JSON.parse(content);

        // Filter by date
        if (sinceDate && new Date(data.timestamp) < sinceDate) continue;

        const author = data.metadata.commitAuthor || 'Unknown';

        // Filter by author if specified
        if (targetAuthor && !author.toLowerCase().includes(targetAuthor.toLowerCase())) continue;

        if (!authorData.has(author)) {
          authorData.set(author, []);
        }
        authorData.get(author)!.push(data);
      } catch (e) {
        // Ignore malformed files
      }
    }

    // Deduplicate, sort, and apply count limit in a single pass
    for (const [author, evaluations] of authorData.entries()) {
      // Deduplicate by commit hash (keep latest)
      let uniqueArray = this.getLatestEvaluationPerCommit(evaluations);

      // Sort by recency and apply count limit
      uniqueArray.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

      if (countLimit) {
        uniqueArray = uniqueArray.slice(0, countLimit);
      }

      authorData.set(author, uniqueArray);
    }

    return authorData;
  }

  /**
   * Calculate average metrics from evaluations
   * Delegates to centralized MetricsCalculationService
   */
  static calculateAverageMetrics(evaluations: any[]): AuthorStats {
    return MetricsCalculationService.calculateSimpleAverageMetrics(evaluations);
  }

  /**
   * Identify strengths and weaknesses based on metrics
   * Note: For complexity, LOWER is better (1 = simple, 10 = complex)
   */
  static identifyStrengthsWeaknesses(stats: AuthorStats): {
    strengths: string[];
    weaknesses: string[];
  } {
    const metrics = [
      { name: 'Code Quality', val: stats.quality, good: stats.quality >= 7 },
      { name: 'Code Simplicity', val: 10 - stats.complexity, good: stats.complexity <= 4 },
      { name: 'Test Coverage', val: stats.tests, good: stats.tests >= 7 },
      { name: 'Business Impact', val: stats.impact, good: stats.impact >= 7 },
    ];

    // Sort by value
    metrics.sort((a, b) => b.val - a.val);

    const strengths = metrics
      .filter((m) => m.good)
      .map((m) => m.name)
      .slice(0, 2);

    const weaknesses = metrics
      .filter((m) => !m.good)
      .map((m) => m.name)
      .slice(0, 2);

    return { strengths, weaknesses };
  }

  /**
   * Perform complete analysis for an author
   */
  static analyzeAuthor(evaluations: any[]): AuthorAnalysis {
    const stats = this.calculateAverageMetrics(evaluations);
    const { strengths, weaknesses } = this.identifyStrengthsWeaknesses(stats);

    return { stats, strengths, weaknesses };
  }

  /**
   * Extract all comments (summaries and details) from author evaluations
   * Only uses the latest evaluation per commit hash
   */
  static extractAuthorComments(evaluations: any[]): string[] {
    // Deduplicate by commit hash (keep latest)
    const uniqueEvaluations = this.getLatestEvaluationPerCommit(evaluations);

    // Extract comments from unique evaluations
    const comments: string[] = [];

    for (const evaluation of uniqueEvaluations) {
      if (evaluation.agentResults && Array.isArray(evaluation.agentResults)) {
        for (const result of evaluation.agentResults) {
          if (result.summary) {
            comments.push(result.summary);
          }
          if (result.details) {
            comments.push(result.details);
          }
          // Also capture concerns if available
          if (result.concerns && Array.isArray(result.concerns)) {
            comments.push(...result.concerns);
          }
        }
      }
    }

    // Deduplicate comments
    return [...new Set(comments)];
  }
}
