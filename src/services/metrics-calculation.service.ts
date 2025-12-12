// src/services/metrics-calculation.service.ts
// Centralized service for all metrics calculations
// Single source of truth for metrics logic

import * as fs from 'fs/promises';
import * as path from 'path';
import * as _ from 'lodash';
import { AgentResult } from '../agents/agent.interface';
import {
  calculateWeightedAverage,
  SEVEN_PILLARS,
  PillarName,
} from '../constants/agent-weights.constants';
import { MetricScores } from 'types/output.types';

export interface AuthorMetrics {
  commits: number;
  quality: number;
  complexity: number;
  tests: number;
  impact: number;
  time: number;
  techDebt: number;
  commitScore: number;
  baciScore?: number;
}

export interface BaciDataPoint {
  commits: number;
  baseTCS: number;
}

export interface BaciDefaults {
  qualityPrior: number;
  shrinkageStrength: number;
  volumeSensitivity: number;
  minPrVariationPct: number;
  sigmoidSteepness: number;
}

// BACI default configuration
export const BACI_DEFAULTS: BaciDefaults = {
  qualityPrior: 5.5, // Bayesian prior for quality (1-10 scale)
  shrinkageStrength: 3.0, // Shrinkage parameter for small samples
  volumeSensitivity: 0.3, // Sensitivity to commit volume variations
  minPrVariationPct: 0.2, // Minimum RSD to apply volume adjustments
  sigmoidSteepness: 0.8, // Sigmoid steepness for normalization
};

/**
 * Centralized service for all metrics calculations
 * Eliminates duplication and provides single source of truth
 */
export class MetricsCalculationService {
  /**
   * Calculate weighted average metrics from agent results
   * Used for single commit evaluation
   */
  static calculateWeightedMetrics(agentResults: AgentResult[]): Partial<MetricScores> {
    if (!agentResults || agentResults.length === 0) {
      return {};
    }

    // Get final round agents (last 5 entries) - should be 1 per agent role
    const finalAgents = agentResults.slice(-5);

    // Calculate weighted average for each metric
    const averagedMetrics: Record<string, number> = {};

    // Process each pillar metric (excluding commitScore which is calculated)
    SEVEN_PILLARS.forEach((metricName: PillarName) => {
      const contributors: Array<{ agentName: string; score: number | null }> = [];

      finalAgents.forEach((agent: any) => {
        if (agent.metrics && metricName in agent.metrics) {
          const score = agent.metrics[metricName];
          contributors.push({
            agentName: agent.agentRole || agent.agentName || 'Unknown',
            score: score !== null && score !== undefined ? score : null,
          });
        }
      });

      if (contributors.length > 0) {
        const weightedValue = calculateWeightedAverage(contributors, metricName as PillarName);
        // Determine decimal places based on metric
        if (metricName.includes('Hours') || metricName.includes('Time')) {
          averagedMetrics[metricName] = Number(weightedValue?.toFixed(2));
        } else {
          averagedMetrics[metricName] = Number(weightedValue?.toFixed(1));
        }
      }
    });

    // Calculate commitScore from the weighted metrics
    if (
      typeof averagedMetrics.codeQuality === 'number' &&
      typeof averagedMetrics.codeComplexity === 'number' &&
      typeof averagedMetrics.actualTimeHours === 'number' &&
      typeof averagedMetrics.idealTimeHours === 'number'
    ) {
      averagedMetrics.commitScore = Number(
        this.calculateCommitScoreFromMetrics(
          averagedMetrics.codeQuality,
          averagedMetrics.codeComplexity,
          averagedMetrics.actualTimeHours,
          averagedMetrics.idealTimeHours
        ).toFixed(1)
      );
    }

    return averagedMetrics as Partial<MetricScores>;
  }

  /**
   * Calculate simple average metrics from multiple evaluations
   * Used for author statistics aggregation - uses weighted consensus values
   */
  static calculateSimpleAverageMetrics(evaluations: any[]): AuthorMetrics {
    const stats: AuthorMetrics = {
      commits: evaluations.length,
      quality: 0,
      complexity: 0,
      tests: 0,
      impact: 0,
      time: 0,
      techDebt: 0,
      commitScore: 0,
    };

    let validMetrics = 0;
    let commitScoreSum = 0;

    for (const evalData of evaluations) {
      // Use weighted consensus metrics for consistency
      const metrics = this.calculateWeightedMetrics(evalData.agents);

      if (metrics && Object.keys(metrics).length > 0) {
        const quality = metrics.codeQuality || 0;
        const complexity = metrics.codeComplexity || 0;
        const actualTime = metrics.actualTimeHours || 0;
        const commitScore = metrics.commitScore || 0; // Should be calculated by calculateWeightedMetrics

        stats.quality += quality;
        stats.complexity += complexity;
        stats.tests += metrics.testCoverage || 0;
        stats.impact += metrics.functionalImpact || 0;
        stats.time += actualTime;
        const netDebt = (metrics.technicalDebtHours || 0) - (metrics.debtReductionHours || 0);
        stats.techDebt += netDebt;
        commitScoreSum += commitScore;
        validMetrics++;
      }
    }

    if (validMetrics === 0) {
      throw new Error('No valid metrics found in evaluations');
    }

    // Calculate averages
    stats.quality = Number((stats.quality / validMetrics).toFixed(1));
    stats.complexity = Number((stats.complexity / validMetrics).toFixed(1));
    stats.tests = Number((stats.tests / validMetrics).toFixed(1));
    stats.impact = Number((stats.impact / validMetrics).toFixed(1));
    stats.time = Number((stats.time / validMetrics).toFixed(2));
    stats.commitScore = Number((commitScoreSum / validMetrics).toFixed(1));
    // Tech debt is total, not average
    stats.techDebt = Number(stats.techDebt.toFixed(2));

    return stats;
  }

  /**
   * Load and calculate metrics from results.json file
   * Used by shared.utils for index generation
   */
  static async loadMetricsFromFile(resultsPath: string): Promise<Partial<MetricScores> | null> {
    try {
      const content = await fs.readFile(resultsPath, 'utf-8');
      const results = JSON.parse(content);

      if (!results.agents || results.agents.length === 0) {
        return null;
      }

      return this.calculateWeightedMetrics(results.agents);
    } catch {
      return null;
    }
  }

  /**
   * Load metrics from evaluation directory
   * Convenience method that constructs the path
   */
  static async loadMetricsFromDirectory(
    evaluationDir: string
  ): Promise<Partial<MetricScores> | null> {
    const resultsPath = path.join(evaluationDir, 'results.json');
    return this.loadMetricsFromFile(resultsPath);
  }

  /**
   * Calculate BACI (Bayesian Author Code Intelligence) scores
   * Uses Bayesian inference with volume sensitivity for normalized developer scoring
   */
  static computeBaciBoundedInteractive(
    data: BaciDataPoint[],
    options?: Partial<BaciDefaults>
  ): number[] {
    if (!data || data.length === 0) {
      return [];
    }

    // Merge defaults with provided options
    const config = { ...BACI_DEFAULTS, ...options };
    const {
      qualityPrior,
      shrinkageStrength,
      volumeSensitivity,
      minPrVariationPct,
      sigmoidSteepness,
    } = config;
    const muQ = qualityPrior;
    const kappa = shrinkageStrength;

    // Calculate base quality with Bayesian shrinkage
    const baseQuality = data.map((point) => {
      const n = point.commits;
      const alpha = n / (n + kappa);
      return alpha * point.baseTCS + (1 - alpha) * muQ;
    });

    // Calculate effort statistics
    const commitCounts = data.map((point) => point.commits);
    const muEffort = this.mean(commitCounts);
    const sigmaEffort = this.std(commitCounts);

    // Calculate relative standard deviation (RSD)
    const rsd = muEffort <= 0 ? Number.POSITIVE_INFINITY : sigmaEffort / muEffort;

    // Calculate volume multiplier
    let volumeMult: number[];
    if (rsd < minPrVariationPct) {
      volumeMult = data.map(() => 1.0);
    } else {
      volumeMult = data.map((point) => {
        const effortZ = sigmaEffort === 0 ? 0 : (point.commits - muEffort) / sigmaEffort;
        const clippedEffortZ = this.clip(effortZ, -2.0, 2.0);
        return 1.0 + volumeSensitivity * Math.tanh(clippedEffortZ);
      });
    }

    // Calculate raw BACI scores
    const baciRaw = baseQuality.map((base, index) => base * volumeMult[index]);

    // Calculate team median
    const teamMedian = this.median(baciRaw);

    // Apply sigmoid normalization
    const beta = sigmoidSteepness;
    const sigmoidNorm = baciRaw.map((raw) => 1 / (1 + Math.exp(-beta * (raw - teamMedian))));

    // Final BACI scores bounded between 1-10
    const baciFinal = sigmoidNorm.map((norm) => 1.0 + 8.99 * norm);

    return baciFinal;
  }

  /**
   * Calculate user BACI scores from aggregated metrics
   * Integrates with existing user metrics calculation pipeline
   */
  static calculateUserBaciScores(
    userBaseTCSMap: Record<string, number>,
    userCommitCounts: Record<string, number>,
    options?: Partial<BaciDefaults>
  ): Record<string, number> {
    // Convert data to BACI data points format
    const dataPoints: BaciDataPoint[] = Object.keys(userBaseTCSMap).map((user) => ({
      commits: userCommitCounts[user] || 0,
      baseTCS: userBaseTCSMap[user] || 0,
    }));

    if (dataPoints.length === 0) {
      return {};
    }

    // Calculate BACI scores
    const baciScores = this.computeBaciBoundedInteractive(dataPoints, options);

    // Map scores back to users
    const result: Record<string, number> = {};
    const users = Object.keys(userBaseTCSMap);
    users.forEach((user, index) => {
      if (index < baciScores.length) {
        result[user] = Math.round(baciScores[index] * 10) / 10; // Round to 1 decimal place
      }
    });

    return result;
  }

  /**
   * Complete BACI calculation pipeline from raw metrics
   * This is the main entry point for BACI scoring
   */
  static calculateTeamBaciScores(
    metrics: any[], // AggregatedPrMetricsViewEntity[]
    options?: Partial<BaciDefaults>
  ): Record<string, number> {
    // Step 1: Calculate base TCS scores from metrics
    const userBaseTCSMap = this.calculateUserBaseTCS(metrics);

    // Step 2: Calculate commit counts per user
    const userCommitCounts: Record<string, number> = {};
    metrics.forEach((metric) => {
      const user = metric.createdBy;
      if (user) {
        userCommitCounts[user] = (userCommitCounts[user] || 0) + 1;
      }
    });

    // Step 3: Calculate BACI scores
    return this.calculateUserBaciScores(userBaseTCSMap, userCommitCounts, options);
  }

  /**
   * Calculate enhanced author statistics with commit scores
   * This method integrates commit score calculations into comprehensive stats
   */
  static calculateEnhancedAuthorStats(
    metrics: any[] // Raw metrics data
  ): Record<string, AuthorMetrics> {
    const groupedByUser = _.groupBy(metrics, 'createdBy');

    return _.mapValues(groupedByUser, (userMetrics: any[], user: string) => {
      const avgMetrics = this.calculateAverageMetrics(userMetrics);

      // Calculate base stats
      const stats: AuthorMetrics = {
        commits: userMetrics.length,
        quality: avgMetrics.avgTestingQuality || 0, // Using testing quality as a proxy
        complexity:
          userMetrics.reduce((sum, m) => sum + (m.codeComplexity || m.complexityScore || 0), 0) /
          userMetrics.length,
        tests: avgMetrics.avgTestingQuality || 0,
        impact: avgMetrics.avgFunctionalImpact || 0,
        time:
          userMetrics.reduce((sum, m) => sum + (m.actualTimeHours || m.timeHours || 0), 0) /
          userMetrics.length,
        techDebt: userMetrics.reduce(
          (sum, m) => sum + (m.technicalDebtHours || m.techDebtHours || 0),
          0
        ),
        commitScore: avgMetrics.avgCommitScore || 0,
      };

      // Calculate BACI score if we have enough data
      let baciScore: number | undefined;
      try {
        const userBaseTCSMap = { [user]: this.calculateUserBaseTCS(userMetrics)[user] || 0 };
        const userCommitCounts = { [user]: userMetrics.length };
        const baciResult = this.calculateUserBaciScores(userBaseTCSMap, userCommitCounts);
        baciScore = baciResult[user];
      } catch (error) {
        // BACI calculation failed, that's okay
        baciScore = undefined;
      }

      return { ...stats, baciScore };
    });
  }

  /**
   * Calculate team summary with commit scores and BACI scores
   */
  static calculateTeamSummary(metrics: any[]): {
    teamStats: Record<string, AuthorMetrics>;
    teamBaci: Record<string, number>;
  } {
    const teamStats = this.calculateEnhancedAuthorStats(metrics);
    const teamBaci = this.calculateTeamBaciScores(metrics);

    Object.keys(teamStats).forEach((user) => {
      if (teamBaci[user] !== undefined) {
        teamStats[user].baciScore = teamBaci[user];
      }
    });

    return {
      teamStats,
      teamBaci,
    };
  }

  /**
   * Calculate user base TCS (Technical Contribution Score) from aggregated metrics
   * This is the base quality score used in BACI calculation
   */
  private static calculateUserBaseTCS(metrics: any[]): Record<string, number> {
    const groupedByUser = _.groupBy(metrics, 'createdBy');
    return _.mapValues(groupedByUser, (userMetrics: any[]) => {
      const metricsValues = this.calculateAverageMetrics(userMetrics);
      // Calculate base TCS as weighted average of key metrics
      const scores = [
        metricsValues.avgCommitScore || 0,
        metricsValues.avgTestingQuality || 0,
        metricsValues.avgTechnicalDebtRate || 0,
        metricsValues.avgDeliveryRate || 0,
        metricsValues.avgFunctionalImpact || 0,
      ].filter((score) => score > 0); // Only include non-zero scores

      return scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
    });
  }

  /**
   * Calculate commit score from individual metrics
   * Public method for use by external modules
   */
  static calculateCommitScoreFromMetrics(
    codeQuality: number,
    codeComplexity: number,
    actualTimeHours: number,
    idealTimeHours: number
  ): number {
    // Calculate normalized estimation
    const normalizedEstimation =
      idealTimeHours > 0
        ? Math.max(0, 10 - (Math.abs(actualTimeHours - idealTimeHours) / idealTimeHours) * 10)
        : 5;

    // Calculate penalty
    const actualTimeMinutes = actualTimeHours * 60;
    const penalty = this.calculatePenalty(actualTimeMinutes, codeComplexity, codeQuality);

    // Calculate commit score
    return this.calculateCommitScore(codeQuality, codeComplexity, normalizedEstimation, penalty);
  }

  /**
   * Calculate commit score using quality, complexity, estimation, and penalty factors
   */
  private static calculateCommitScore(
    qualityScore: number,
    complexityScore: number,
    normalizedEstimation: number,
    penalty: number
  ): number {
    let score =
      qualityScore * 0.4 - complexityScore * 0.3 + normalizedEstimation * 0.3 + 3 - penalty;
    score = Math.max(1, Math.min(10, score));
    return score;
  }

  /**
   * Calculate penalty based on actual time, complexity, and quality
   */
  private static calculatePenalty(
    actualTimeMinutes: number,
    complexityScore: number,
    qualityScore: number
  ): number {
    const timeFactor = 1 / (1 + (actualTimeMinutes / 60) ** 2);
    const complexityPenalty = (complexityScore / 10) ** 2 * timeFactor * 4;
    const qualityPenalty = ((10 - qualityScore) / 10) ** 2 * timeFactor * 4;
    const totalPenalty = Math.min(4, Math.max(complexityPenalty, qualityPenalty));
    return totalPenalty;
  }

  /**
   * Helper method to calculate average metrics from user's metric array
   * Dynamically calculates commit scores if not provided in raw data
   */
  private static calculateAverageMetrics(userMetrics: any[]): {
    avgCommitScore?: number;
    avgTestingQuality?: number;
    avgTechnicalDebtRate?: number;
    avgDeliveryRate?: number;
    avgFunctionalImpact?: number;
  } {
    if (userMetrics.length === 0) {
      return {};
    }

    const sums = {
      commitScore: 0,
      testingQuality: 0,
      technicalDebtRate: 0,
      deliveryRate: 0,
      functionalImpact: 0,
    };

    let validCount = 0;
    userMetrics.forEach((metric) => {
      // Calculate or use existing commit score
      let commitScore = metric.commitScore;
      if (commitScore === undefined) {
        // Dynamic calculation if commit score not provided
        const quality = metric.codeQuality || metric.qualityScore || 5;
        const complexity = metric.codeComplexity || metric.complexityScore || 5;
        const actualTime = metric.actualTimeHours || metric.timeHours || 1;
        const idealTime = metric.idealTimeHours || actualTime;

        commitScore = this.calculateCommitScoreFromMetrics(
          quality,
          complexity,
          actualTime,
          idealTime
        );
      }

      // Adapt these field names based on your actual metric structure
      sums.commitScore += commitScore;
      if (metric.testingQuality !== undefined) sums.testingQuality += metric.testingQuality;
      if (metric.technicalDebtRate !== undefined)
        sums.technicalDebtRate += metric.technicalDebtRate;
      if (metric.deliveryRate !== undefined) sums.deliveryRate += metric.deliveryRate;
      if (metric.functionalImpact !== undefined) sums.functionalImpact += metric.functionalImpact;
      validCount++;
    });

    if (validCount === 0) {
      return {};
    }

    return {
      avgCommitScore: sums.commitScore / validCount,
      avgTestingQuality: sums.testingQuality / validCount,
      avgTechnicalDebtRate: sums.technicalDebtRate / validCount,
      avgDeliveryRate: sums.deliveryRate / validCount,
      avgFunctionalImpact: sums.functionalImpact / validCount,
    };
  }

  /**
   * Calculate mean of an array
   */
  private static mean(arr: number[]): number {
    if (arr.length === 0) return 0;
    return arr.reduce((a, b) => a + b, 0) / arr.length;
  }

  /**
   * Calculate standard deviation of an array
   */
  private static std(arr: number[]): number {
    if (arr.length === 0) return 0;
    const m = this.mean(arr);
    const variance = arr.reduce((s, x) => s + (x - m) ** 2, 0) / arr.length;
    return Math.sqrt(variance);
  }

  /**
   * Calculate median of an array
   */
  private static median(arr: number[]): number {
    if (arr.length === 0) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  }

  /**
   * Clip a value between min and max bounds
   */
  private static clip(x: number, minVal: number, maxVal: number): number {
    return Math.max(minVal, Math.min(maxVal, x));
  }
}
