// src/services/author-stats-aggregator.service.ts
// Service for aggregating commit evaluation metrics by author

import * as fs from 'fs';
import * as path from 'path';

export interface AuthorStats {
    commits: number;
    quality: number;
    complexity: number;
    tests: number;
    impact: number;
    time: number;
    techDebt: number;
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

        // Apply count limit and sort by recency
        for (const [author, evaluations] of authorData.entries()) {
            evaluations.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
            if (countLimit) {
                authorData.set(author, evaluations.slice(0, countLimit));
            }
        }

        return authorData;
    }

    /**
     * Calculate average metrics from evaluations
     * Delegates to centralized MetricsCalculationService
     */
    static calculateAverageMetrics(evaluations: any[]): AuthorStats {
        const { MetricsCalculationService } = require('./metrics-calculation.service');
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
}
