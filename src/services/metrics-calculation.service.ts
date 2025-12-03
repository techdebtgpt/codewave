// src/services/metrics-calculation.service.ts
// Centralized service for all metrics calculations
// Single source of truth for metrics logic

import * as fs from 'fs/promises';
import * as path from 'path';
import { AgentResult } from '../agents/agent.interface';

export interface MetricScores {
  functionalImpact: number;
  idealTimeHours: number;
  testCoverage: number;
  codeQuality: number;
  codeComplexity: number;
  actualTimeHours: number;
  technicalDebtHours: number;
  debtReductionHours: number;
}

export interface AuthorMetrics {
  commits: number;
  quality: number;
  complexity: number;
  tests: number;
  impact: number;
  time: number;
  techDebt: number;
}

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

    // Import weight calculation function and constants
    const {
      calculateWeightedAverage,
      SEVEN_PILLARS,
    } = require('../constants/agent-weights.constants');

    // Get final round agents (last 5 entries) - should be 1 per agent role
    const finalAgents = agentResults.slice(-5);

    // Metric names for weighted calculation
    const metricNames = SEVEN_PILLARS as unknown as (keyof MetricScores)[];

    // Calculate weighted average for each metric
    const averagedMetrics: Partial<MetricScores> = {};

    metricNames.forEach((metricName: keyof MetricScores) => {
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
        const weightedValue = calculateWeightedAverage(contributors, metricName);
        // Determine decimal places based on metric
        if (metricName.includes('Hours') || metricName.includes('Time')) {
          averagedMetrics[metricName] = Number(weightedValue.toFixed(2)) as any;
        } else {
          averagedMetrics[metricName] = Number(weightedValue.toFixed(1)) as any;
        }
      }
    });

    return averagedMetrics;
  }

  /**
   * Calculate simple average metrics from multiple evaluations
   * Used for author statistics aggregation
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
    };

    let validMetrics = 0;
    for (const evalData of evaluations) {
      // Extract metrics from the last agent result (consensus)
      const lastAgent = evalData.agents[evalData.agents.length - 1];
      if (lastAgent && lastAgent.metrics) {
        stats.quality += lastAgent.metrics.codeQuality || 0;
        stats.complexity += lastAgent.metrics.codeComplexity || 0;
        stats.tests += lastAgent.metrics.testCoverage || 0;
        stats.impact += lastAgent.metrics.functionalImpact || 0;
        stats.time += lastAgent.metrics.actualTimeHours || 0;
        stats.techDebt += lastAgent.metrics.technicalDebtHours || 0;
        validMetrics++;
      }
    }

    if (validMetrics === 0) {
      throw new Error('No valid metrics found in evaluations');
    }

    // Calculate averages
    stats.quality /= validMetrics;
    stats.complexity /= validMetrics;
    stats.tests /= validMetrics;
    stats.impact /= validMetrics;
    stats.time /= validMetrics;
    // Tech debt is total, not average

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
}
