// src/formatters/html-report-formatter-enhanced.ts
// Enhanced HTML report with conversation timeline, concern tracking, and metric evolution
import fs from 'fs';
import path from 'path';
import { AgentResult } from '../agents/agent.interface';
import { EvaluationHistoryEntry } from '../types/output.types';

interface AgentEvaluation {
  agentName: string;
  agentRole?: string; // Technical key for weight lookup (e.g., "business-analyst")
  icon: string;
  color: string;
  round: number;
  summary: string;
  details: string;
  metrics?: Record<string, number>;
  concernsRaised: string[];
  referencesTo: string[];
}

interface MetricEvolution {
  metric: string;
  rounds: Map<number, number>; // Dynamic map of round number to value
  changed: boolean;
}

/**
 * Map agent role descriptions to short display names
 */
const AGENT_NAME_MAP: Record<string, string> = {
  'Evaluates business value, functional impact, and estimates ideal implementation time':
    'Business Analyst',
  'Evaluates test automation quality, testing frameworks, and automated test infrastructure':
    'SDET',
  'Explains implementation decisions, trade-offs, and estimates actual time spent':
    'Developer Author',
  'Evaluates architecture, design patterns, code complexity, and technical debt':
    'Senior Architect',
  'Reviews code quality, suggests improvements, and evaluates implementation details':
    'Developer Reviewer',
};

/**
 * Short descriptions for agent cards (displayed below agent names)
 */
const AGENT_DESCRIPTIONS: Record<string, string> = {
  'Business Analyst': 'Evaluates business value, functional impact, and ideal time estimates',
  SDET: 'Evaluates test automation quality, testing frameworks, and infrastructure maturity',
  'Developer Author':
    'Evaluates actual time spent, implementation approach, and development effort',
  'Senior Architect': 'Evaluates code complexity, architecture design, and technical debt',
  'Developer Reviewer': 'Evaluates code quality, best practices, and maintainability',
};

/**
 * Metric metadata with reference values and formatting information
 */
const METRIC_METADATA: Record<
  string,
  {
    unit: string;
    scale: string;
    description: string;
    tooltip: string;
    format: (value: number) => string;
  }
> = {
  functionalImpact: {
    unit: '/ 10',
    scale: 'Higher is better',
    description: 'Functional Impact',
    tooltip: 'How much value does this change add? (1-10 scale)',
    format: (v: number) => `${(Math.round(v * 10) / 10).toFixed(1)} / 10`,
  },
  idealTimeHours: {
    unit: 'hours',
    scale: 'Ideal estimate',
    description: 'Ideal Time Estimate',
    tooltip: 'How many hours should this task ideally take?',
    format: (v: number) => `${(Math.round(v * 10) / 10).toFixed(1)}h`,
  },
  testCoverage: {
    unit: '/ 10',
    scale: 'Higher is better',
    description: 'Test Coverage',
    tooltip: 'How well is the code covered by tests? (1-10 scale)',
    format: (v: number) => `${(Math.round(v * 10) / 10).toFixed(1)} / 10`,
  },
  codeQuality: {
    unit: '/ 10',
    scale: 'Higher is better',
    description: 'Code Quality',
    tooltip: 'How well-written and maintainable is the code? (1-10 scale)',
    format: (v: number) => `${(Math.round(v * 10) / 10).toFixed(1)} / 10`,
  },
  codeComplexity: {
    unit: '/ 10',
    scale: 'Lower is better',
    description: 'Code Complexity',
    tooltip: 'How complex is the implementation? (1-10, lower is simpler)',
    format: (v: number) => `${(Math.round(v * 10) / 10).toFixed(1)} / 10`,
  },
  actualTimeHours: {
    unit: 'hours',
    scale: 'Actual effort',
    description: 'Actual Time Spent',
    tooltip: 'How many hours were actually spent on this task?',
    format: (v: number) => `${(Math.round(v * 10) / 10).toFixed(1)}h`,
  },
  technicalDebtHours: {
    unit: 'hours',
    scale: 'Lower is better',
    description: 'Technical Debt',
    tooltip: 'How many hours of future work does this introduce? (lower is better)',
    format: (v: number) => `${(Math.round(v * 10) / 10).toFixed(1)}h`,
  },
};

/**
 * Detect agent name from result metadata or content
 */
function detectAgentName(result: AgentResult, idx: number): string {
  // Prefer agent name from orchestrator if available
  if (result.agentName) {
    // Map long descriptions to short names
    return AGENT_NAME_MAP[result.agentName] || result.agentName;
  }

  // Fallback to content-based detection (less reliable)
  const summary = result.summary?.toLowerCase() || '';
  const details = result.details?.toLowerCase() || '';
  const combined = summary + ' ' + details;

  if (
    combined.includes('business analyst') ||
    combined.includes('functional impact') ||
    combined.includes('ideal time')
  ) {
    return 'Business Analyst';
  }
  if (
    combined.includes('sdet') ||
    combined.includes('test automation') ||
    combined.includes('testing framework') ||
    combined.includes('test infrastructure')
  ) {
    return 'SDET';
  }
  if (
    combined.includes('developer author') ||
    combined.includes('actual time') ||
    combined.includes('spent about')
  ) {
    return 'Developer Author';
  }
  if (
    combined.includes('senior architect') ||
    combined.includes('code complexity') ||
    combined.includes('technical debt')
  ) {
    return 'Senior Architect';
  }
  if (
    combined.includes('developer reviewer') ||
    combined.includes('code quality') ||
    combined.includes('refactoring')
  ) {
    return 'Developer Reviewer';
  }
  return `Agent ${idx + 1}`;
}

/**
 * Extract concerns raised from agent details
 */
function extractConcerns(details: string): string[] {
  const concerns: string[] = [];
  const concernPatterns = [
    /(?:concern|worried|issue|problem|risk)[^.!?]*[.!?]/gi,
    /(?:missing|lacking|no)[^.!?]*(?:test|coverage|validation)[^.!?]*[.!?]/gi,
  ];

  concernPatterns.forEach((pattern) => {
    const matches = details.match(pattern);
    if (matches) {
      concerns.push(...matches.map((m) => m.trim()));
    }
  });

  return concerns.slice(0, 3); // Limit to top 3 concerns
}

/**
 * Extract references to other agents
 */
function extractReferences(summary: string, details: string): string[] {
  const combined = summary + ' ' + details;
  const references: string[] = [];

  const agentNames = [
    'Business Analyst',
    'SDET',
    'Developer Author',
    'Senior Architect',
    'Developer Reviewer',
  ];
  agentNames.forEach((name) => {
    if (combined.toLowerCase().includes(name.toLowerCase())) {
      references.push(name);
    }
  });

  return [...new Set(references)]; // Deduplicate
}

/**
 * Group results by agent and round (handles sequential round-robin ordering)
 */
function groupResultsByAgent(results: AgentResult[]): Map<string, AgentEvaluation[]> {
  const grouped = new Map<string, AgentEvaluation[]>();
  const agentSeenInRound = new Map<string, Set<number>>();

  const iconMap: Record<string, string> = {
    'Business Analyst': '👔',
    SDET: '🤖',
    'Developer Author': '👨‍💻',
    'Senior Architect': '🏛️',
    'Developer Reviewer': '💻',
  };

  const colorMap: Record<string, string> = {
    'Business Analyst': 'info',
    SDET: 'warning',
    'Developer Author': 'success',
    'Senior Architect': 'primary',
    'Developer Reviewer': 'secondary',
  };

  // First pass: detect unique agents
  const uniqueAgents = new Set<string>();
  results.forEach((result, idx) => {
    const agentName = detectAgentName(result, idx);
    uniqueAgents.add(agentName);
  });

  const agentCount = uniqueAgents.size;
  console.log(`Detected ${agentCount} unique agents:`, Array.from(uniqueAgents));

  // Second pass: assign rounds based on agent repetition
  // Track which agents we've seen to determine round transitions
  const agentOccurrences = new Map<string, number>();
  results.forEach((result, idx) => {
    const agentName = detectAgentName(result, idx);

    // Increment occurrence count for this agent
    const occurrences = (agentOccurrences.get(agentName) || 0) + 1;
    agentOccurrences.set(agentName, occurrences);

    // Round is determined by how many times we've seen this agent
    const round = occurrences;

    // Use structured concerns from agent if available, fallback to regex extraction
    const concerns =
      result.concerns && result.concerns.length > 0
        ? result.concerns
        : extractConcerns(result.details || '');

    const references = extractReferences(result.summary || '', result.details || '');

    const evaluation: AgentEvaluation = {
      agentName,
      agentRole: result.agentRole, // Preserve technical key for weight lookup
      icon: iconMap[agentName] || '🤖',
      color: colorMap[agentName] || 'secondary',
      round,
      summary: result.summary || 'No summary provided',
      details: result.details || 'No details provided',
      metrics: result.metrics,
      concernsRaised: concerns,
      referencesTo: references.filter((ref) => ref !== agentName),
    };

    const existing = grouped.get(agentName) || [];
    grouped.set(agentName, [...existing, evaluation]);

    // Track which rounds we've seen this agent in
    if (!agentSeenInRound.has(agentName)) {
      agentSeenInRound.set(agentName, new Set());
    }
    agentSeenInRound.get(agentName)!.add(round);
  });

  // Log summary
  grouped.forEach((evals, agent) => {
    console.log(
      `${agent}: ${evals.length} responses (rounds: ${evals.map((e) => e.round).join(', ')})`
    );
  });

  return grouped;
}

/**
 * Calculate metric evolution across rounds (dynamic for ANY number of rounds)
 */
function calculateMetricEvolution(
  groupedResults: Map<string, AgentEvaluation[]>
): MetricEvolution[] {
  // Import centralized pillar constants and weight functions
  const {
    SEVEN_PILLARS,
    getAgentWeight,
    calculateWeightedAverage,
  } = require('../constants/agent-weights.constants');

  const metricMap = new Map<string, MetricEvolution>();

  // Group all evaluations by round
  const roundMap = new Map<number, AgentEvaluation[]>();
  groupedResults.forEach((evaluations) => {
    evaluations.forEach((evaluation) => {
      if (!roundMap.has(evaluation.round)) {
        roundMap.set(evaluation.round, []);
      }
      roundMap.get(evaluation.round)!.push(evaluation);
    });
  });

  // For each metric, calculate consensus score per round
  SEVEN_PILLARS.forEach((metric: string) => {
    const metricEvolution: MetricEvolution = {
      metric,
      rounds: new Map<number, number>(),
      changed: false,
    };

    // Process each round in order
    Array.from(roundMap.keys())
      .sort((a, b) => a - b)
      .forEach((round) => {
        const evaluationsInRound = roundMap.get(round)!;

        // Build contributor list for this round and metric
        const contributors: Array<{ agentName: string; score: number | null; weight: number }> = [];
        evaluationsInRound.forEach((evaluation) => {
          if (evaluation.metrics && metric in evaluation.metrics) {
            const score = evaluation.metrics[metric];
            const agentKey = evaluation.agentRole || evaluation.agentName;
            const weight = getAgentWeight(agentKey, metric);
            contributors.push({ agentName: evaluation.agentName, score, weight });
          }
        });

        // Calculate weighted consensus for this round
        if (contributors.length > 0) {
          const consensusScore = calculateWeightedAverage(
            contributors.map((c) => ({ agentName: c.agentName, score: c.score })),
            metric
          );
          metricEvolution.rounds.set(round, consensusScore);

          // Check if value changed from first round
          const firstRound = Math.min(...Array.from(metricEvolution.rounds.keys()));
          const firstValue = metricEvolution.rounds.get(firstRound);
          if (round > firstRound && firstValue !== undefined) {
            metricEvolution.changed =
              metricEvolution.changed || Math.abs(firstValue - consensusScore) > 0.01;
          }
        }
      });

    metricMap.set(metric, metricEvolution);
  });

  return Array.from(metricMap.values());
}

/**
 * Calculate consensus values with contributor tracking
 */
function calculateConsensusValues(groupedResults: Map<string, AgentEvaluation[]>): Map<
  string,
  {
    value: number | null;
    contributors: Array<{ name: string; score: number | null; weight: number }>;
  }
> {
  const {
    getAgentWeight,
    calculateWeightedAverage,
    SEVEN_PILLARS,
  } = require('../constants/agent-weights.constants');

  // Collect metrics
  const allMetrics = new Set<string>();
  groupedResults.forEach((evaluations) => {
    evaluations.forEach((evaluation) => {
      if (evaluation.metrics) {
        Object.keys(evaluation.metrics)
          .filter((metric) => SEVEN_PILLARS.includes(metric))
          .forEach((metric) => allMetrics.add(metric));
      }
    });
  });

  // Build agent-metric matrix and agentName -> agentRole mapping
  const agentMetrics = new Map<string, Map<string, number | null>>();
  const agentRoleMap = new Map<string, string>();
  groupedResults.forEach((evaluations, agentName) => {
    const latestEval = evaluations[evaluations.length - 1];
    if (latestEval.metrics) {
      const filteredMetrics = Object.fromEntries(
        Object.entries(latestEval.metrics).filter(
          ([metric, value]) =>
            SEVEN_PILLARS.includes(metric) && (typeof value === 'number' || value === null)
        )
      );
      agentMetrics.set(agentName, new Map(Object.entries(filteredMetrics)));
    }
    if (latestEval.agentRole) {
      agentRoleMap.set(agentName, latestEval.agentRole);
    }
  });

  // Calculate weighted averages for final values
  const finalValues = new Map<
    string,
    {
      value: number | null;
      contributors: Array<{ name: string; score: number | null; weight: number }>;
    }
  >();
  allMetrics.forEach((metric) => {
    const contributors: Array<{ name: string; score: number | null; weight: number }> = [];
    agentMetrics.forEach((metrics, agentName) => {
      if (metrics.has(metric)) {
        const score = metrics.get(metric)!; // Can be number or null
        const agentKey = agentRoleMap.get(agentName) || agentName;
        const weight = getAgentWeight(agentKey, metric);
        contributors.push({ name: agentName, score, weight });
      }
    });
    if (contributors.length > 0) {
      const weightedAvg = calculateWeightedAverage(
        contributors.map((c) => ({
          agentName: agentRoleMap.get(c.name) || c.name,
          score: c.score,
        })),
        metric
      );
      finalValues.set(metric, { value: weightedAvg, contributors });
    }
  });

  return finalValues;
}

/**
 * Build comprehensive metrics table showing all agent contributions
 */
function buildMetricsTable(groupedResults: Map<string, AgentEvaluation[]>): string {
  // Import agent weights and centralized pillar constants
  const {
    getAgentWeight,
    calculateWeightedAverage,
    SEVEN_PILLARS,
  } = require('../constants/agent-weights.constants');

  // Collect metrics, filtering to ONLY the 7 pillars
  const allMetrics = new Set<string>();
  groupedResults.forEach((evaluations) => {
    evaluations.forEach((evaluation) => {
      if (evaluation.metrics) {
        Object.keys(evaluation.metrics)
          .filter((metric) => SEVEN_PILLARS.includes(metric))
          .forEach((metric) => allMetrics.add(metric));
      }
    });
  });

  // Build agent-metric matrix and agentName -> agentRole mapping
  const agentMetrics = new Map<string, Map<string, number | null>>();
  const agentRoleMap = new Map<string, string>(); // Maps display name to technical key
  groupedResults.forEach((evaluations, agentName) => {
    const latestEval = evaluations[evaluations.length - 1]; // Use latest response
    if (latestEval.metrics) {
      // Filter metrics to ONLY the 7 pillars, allow both numbers and null
      const filteredMetrics = Object.fromEntries(
        Object.entries(latestEval.metrics).filter(
          ([metric, value]) =>
            SEVEN_PILLARS.includes(metric) && (typeof value === 'number' || value === null)
        )
      );
      agentMetrics.set(agentName, new Map(Object.entries(filteredMetrics)));
    }
    // Store agentRole for weight lookup
    if (latestEval.agentRole) {
      agentRoleMap.set(agentName, latestEval.agentRole);
    }
  });

  // Calculate weighted averages for final values (using weights from constants)
  const finalValues = new Map<
    string,
    {
      value: number | null;
      contributors: Array<{ name: string; score: number | null; weight: number }>;
    }
  >();
  allMetrics.forEach((metric) => {
    const contributors: Array<{ name: string; score: number | null; weight: number }> = [];
    agentMetrics.forEach((metrics, agentName) => {
      if (metrics.has(metric)) {
        const score = metrics.get(metric)!; // Can be number or null
        // Use agentRole (technical key) for weight lookup, fallback to agentName
        const agentKey = agentRoleMap.get(agentName) || agentName;
        const weight = getAgentWeight(agentKey, metric);
        contributors.push({ name: agentName, score, weight });
      }
    });
    if (contributors.length > 0) {
      // Calculate weighted average using agentRole (technical keys)
      const weightedAvg = calculateWeightedAverage(
        contributors.map((c) => ({
          agentName: agentRoleMap.get(c.name) || c.name, // Use agentRole for weight lookup
          score: c.score,
        })),
        metric
      );
      finalValues.set(metric, { value: weightedAvg, contributors });
    }
  });

  // Build HTML table
  const metricLabels = Array.from(allMetrics).map((m) =>
    m
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, (str) => str.toUpperCase())
      .trim()
  );

  return `
    <div class="card mb-4 shadow-sm">
      <div class="card-header bg-dark text-white">
        <h5 class="mb-0">📊 Comprehensive Metrics Analysis</h5>
      </div>
      <div class="card-body">
        <table class="table table-striped table-hover">
          <thead class="table-dark">
            <tr>
              <th>Metric / Pillar</th>
              ${Array.from(agentMetrics.keys())
                .map((agent) => `<th class="text-center">${agent}</th>`)
                .join('')}
              <th class="text-center bg-success text-white">Final Agreed</th>
            </tr>
          </thead>
          <tbody>
            ${Array.from(allMetrics)
              .map((metric, idx) => {
                const final = finalValues.get(metric);
                return `
                <tr>
                  <td><strong>${metricLabels[idx]}</strong></td>
                  ${Array.from(agentMetrics.keys())
                    .map((agent) => {
                      const value = agentMetrics.get(agent)?.get(metric);
                      // Use agentRole for weight lookup
                      const agentKey = agentRoleMap.get(agent) || agent;
                      const weight = getAgentWeight(agentKey, metric);

                      // Ensure weight is a number before calling toFixed
                      if (typeof weight !== 'number') {
                        return `<td class="text-center text-muted">-</td>`;
                      }

                      const weightPercent = (weight * 100).toFixed(1);
                      const isPrimary = weight >= 0.4; // Primary expertise threshold
                      const badgeClass = isPrimary
                        ? 'badge bg-warning text-dark'
                        : 'badge bg-secondary';

                      // Ensure value is a valid number
                      if (value !== undefined && typeof value === 'number' && isFinite(value)) {
                        return `<td class="text-center">
                          <div>${(Number(value) || 0).toFixed(2)}</div>
                          <small class="${badgeClass}">${weightPercent}%</small>
                        </td>`;
                      }
                      return `<td class="text-center text-muted">-</td>`;
                    })
                    .join('')}
                  <td class="text-center bg-success bg-opacity-10">
                    ${final && typeof final.value === 'number' && isFinite(final.value) ? `<strong>${(Number(final.value) || 0).toFixed(2)}</strong><br><small class="text-muted">(weighted avg from ${final.contributors.length} agent${final.contributors.length > 1 ? 's' : ''})</small>` : '<strong>-</strong><br><small class="text-muted">(no data)</small>'}
                </tr>
                `;
              })
              .join('')}
          </tbody>
        </table>
        <div class="mt-3">
          <div class="alert alert-info mb-2">
            <strong>📊 Weighted Scoring System:</strong><br>
            Each agent evaluates all 7 pillars, but their expertise determines the weight of their opinion:
            <ul class="mb-0 mt-2">
              <li><span class="badge bg-warning text-dark">40-45%</span> = <strong>PRIMARY expertise</strong> (agent's specialization)</li>
              <li><span class="badge bg-secondary">15-21%</span> = Secondary opinion (related expertise)</li>
              <li><span class="badge bg-secondary">8-14%</span> = Tertiary opinion (general perspective)</li>
            </ul>
          </div>
          <small class="text-muted">
            <strong>Final Agreed:</strong> Calculated using weighted average where expert opinions carry more weight.
            Formula: <code>Σ(agent_score × agent_weight) / Σ(agent_weight)</code>
          </small>
        </div>
      </div>
    </div>
    `;
}

/**
 * Load evaluation history from disk
 */
function loadEvaluationHistory(outputDir: string): EvaluationHistoryEntry[] {
  try {
    const historyPath = path.join(outputDir, 'history.json');

    if (!fs.existsSync(historyPath)) {
      return [];
    }

    const content = fs.readFileSync(historyPath, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    return [];
  }
}

/**
 * Calculate statistics from history data
 */
function calculateHistoryStatistics(
  history: EvaluationHistoryEntry[],
  metrics: string[]
): Record<string, any> {
  const stats: Record<string, any> = {};

  metrics.forEach((metric) => {
    const values = history
      .map((h) => {
        let val = (h.metrics as any)[metric];
        // Backward compatibility: default to 0 for debtReductionHours if not present in old evaluations
        if (metric === 'debtReductionHours' && val === undefined) {
          val = 0;
        }
        return val;
      })
      .filter((v) => typeof v === 'number');

    if (values.length === 0) return;

    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    const sorted = [...values].sort((a, b) => a - b);
    const median =
      sorted.length % 2 === 0
        ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
        : sorted[Math.floor(sorted.length / 2)];
    const variance = values.reduce((sum, val) => sum + Math.pow(val - avg, 2), 0) / values.length;
    const stdDev = Math.sqrt(variance);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min;

    // Calculate trend (last value - first value)
    const firstVal = values[0];
    const lastVal = values[values.length - 1];
    const trend = lastVal - firstVal;
    const trendDir = trend > 0.1 ? '📈 Increasing' : trend < -0.1 ? '📉 Decreasing' : '→ Stable';

    stats[metric] = {
      avg: avg.toFixed(2),
      median: median.toFixed(2),
      stdDev: stdDev.toFixed(2),
      min: min.toFixed(2),
      max: max.toFixed(2),
      range: range.toFixed(2),
      trend: trendDir,
      values,
    };
  });

  return stats;
}

/**
 * Generate history comparison HTML
 */
function generateHistoryHtml(history: EvaluationHistoryEntry[], modelInfo?: string): string {
  if (history.length === 0) {
    return '<p class="text-muted">No re-evaluation history available yet. This is the first evaluation.</p>';
  }

  if (history.length === 1) {
    return '<p class="text-muted">Only one evaluation recorded. History comparison will appear after re-evaluations.</p>';
  }

  // Build comparison tables - Evaluations as ROWS, Metrics as COLUMNS
  const { SEVEN_PILLARS } = require('../constants/agent-weights.constants');
  const allMetrics = SEVEN_PILLARS;
  const stats = calculateHistoryStatistics(history, allMetrics);

  // Build evaluation rows (each row is one evaluation with all metrics as columns)
  const evaluationRows = history
    .map((h, evalIdx) => {
      const timestamp = new Date(h.timestamp).toLocaleString();
      const sourceLabel = h.source === 'batch' ? '🔄 Batch' : '📝 Manual';

      let rowHtml = `
        <tr>
          <td><strong>Evaluation #${h.evaluationNumber}</strong><br/><small class="text-muted">${timestamp}</small><br/><small>${sourceLabel}</small></td>
      `;

      allMetrics.forEach((metric: string) => {
        // Backward compatibility: default to 0 for debtReductionHours if not present in old evaluations
        let val = (h.metrics as any)[metric];
        if (metric === 'debtReductionHours' && val === undefined) {
          val = 0;
        }
        const displayVal = typeof val === 'number' ? val.toFixed(1) : 'N/A';

        // Calculate change from previous evaluation
        let changeHtml = '';
        if (evalIdx > 0) {
          let prevVal = (history[evalIdx - 1].metrics as any)[metric];
          // Backward compatibility for previous eval as well
          if (metric === 'debtReductionHours' && prevVal === undefined) {
            prevVal = 0;
          }
          if (typeof val === 'number' && typeof prevVal === 'number') {
            const diff = val - prevVal;
            const direction = diff > 0.05 ? '↑' : diff < -0.05 ? '↓' : '→';
            const colorClass =
              diff > 0.1 ? 'text-danger' : diff < -0.1 ? 'text-success' : 'text-muted';
            changeHtml = `<br/><small class="${colorClass}">${direction} ${Math.abs(diff).toFixed(2)}</small>`;
          }
        }

        rowHtml += `<td class="text-center fw-bold">${displayVal}${changeHtml}</td>`;
      });

      rowHtml += `</tr>`;
      return rowHtml;
    })
    .join('');

  // Build metric statistics rows - show final consensus values and history statistics
  const latestEntry = history[history.length - 1];
  const statsRows = allMetrics
    .map((metric: string) => {
      const stat = stats[metric];
      if (!stat) return '';

      // Get final value from latest history entry (weighted consensus)
      const finalValue = latestEntry.metrics ? (latestEntry.metrics as any)[metric] : 'N/A';
      const finalValueStr = typeof finalValue === 'number' ? finalValue.toFixed(2) : 'N/A';

      return `
        <tr class="table-light">
          <td><strong>${metric
            .replace(/([A-Z])/g, ' $1')
            .replace(/^./, (s) => s.toUpperCase())
            .trim()}</strong></td>
          <td class="text-center small"><span class="badge bg-success">final</span> ${finalValueStr}</td>
          <td class="text-center small"><span class="badge bg-info">avg</span> ${stat.avg}</td>
          <td class="text-center small"><span class="badge bg-secondary">med</span> ${stat.median}</td>
          <td class="text-center small"><span class="badge bg-warning text-dark">σ</span> ${stat.stdDev}</td>
          <td class="text-center small">${stat.min}</td>
          <td class="text-center small">${stat.max}</td>
          <td class="text-center"><strong>${stat.trend}</strong></td>
        </tr>
      `;
    })
    .join('');

  // Build convergence summary
  const convergenceScores = history.map((h) => h.convergenceScore * 100);
  const avgConvergence = convergenceScores.reduce((a, b) => a + b, 0) / convergenceScores.length;
  const maxConvergence = Math.max(...convergenceScores);
  const minConvergence = Math.min(...convergenceScores);
  const convergenceTrend = convergenceScores[convergenceScores.length - 1] - convergenceScores[0];

  const metricHeaders = allMetrics
    .map((m: string) => {
      const label = m
        .replace(/([A-Z])/g, ' $1')
        .replace(/^./, (s) => s.toUpperCase())
        .trim();
      return `<th class="text-center" style="font-size: 0.85rem;">${label}</th>`;
    })
    .join('');

  return `
    <div class="card mb-4">
      <div class="card-header bg-info text-white">
        <h5 class="mb-0">📊 Evaluation History & Statistical Analysis (${history.length} evaluations)</h5>
        <small class="text-white-50">Track metric evolution, convergence trends, and statistical insights${modelInfo ? ' • ' + modelInfo : ''}</small>
      </div>
      <div class="card-body">
        <!-- Evaluations Table (Rows = Evaluations, Columns = Metrics) -->
        <h6 class="mb-3">
          <span class="badge bg-light text-info">📈 Metrics by Evaluation</span>
          <small class="text-muted ms-2">Each row is one evaluation; arrows show change from previous</small>
        </h6>
        <div class="table-responsive">
          <table class="table table-sm table-hover" style="font-size: 0.9rem;">
            <thead class="table-light">
              <tr style="border-bottom: 2px solid #dee2e6;">
                <th style="min-width: 150px;">Evaluation</th>
                ${metricHeaders}
              </tr>
            </thead>
            <tbody>
              ${evaluationRows}
            </tbody>
          </table>
        </div>

        <!-- Statistical Analysis -->
        <h6 class="mb-3 mt-4">
          <span class="badge bg-light text-info">📊 Statistical Analysis</span>
          <small class="text-muted ms-2">Average, median, std deviation, trend across all evaluations</small>
        </h6>
        <div class="table-responsive">
          <table class="table table-sm" style="font-size: 0.85rem;">
            <thead class="table-light">
              <tr style="border-bottom: 2px solid #dee2e6;">
                <th style="min-width: 140px;">Metric</th>
                <th class="text-center"><small>Final (Weighted)</small></th>
                <th class="text-center"><small>Average</small></th>
                <th class="text-center"><small>Median</small></th>
                <th class="text-center"><small>Std Dev (σ)</small></th>
                <th class="text-center"><small>Min</small></th>
                <th class="text-center"><small>Max</small></th>
                <th class="text-center"><small>Trend</small></th>
              </tr>
            </thead>
            <tbody>
              ${statsRows}
            </tbody>
          </table>
        </div>

        <!-- Token & Cost Summary -->
        <h6 class="mb-3 mt-4">
          <span class="badge bg-light text-info">💾 Token Usage & Cost</span>
          <small class="text-muted ms-2">API resource consumption tracking</small>
        </h6>
        <div class="table-responsive">
          <table class="table table-sm" style="font-size: 0.9rem;">
            <thead class="table-light">
              <tr style="border-bottom: 2px solid #dee2e6;">
                <th style="min-width: 150px;">Evaluation</th>
                <th class="text-center">Input Tokens</th>
                <th class="text-center">Output Tokens</th>
                <th class="text-center">Total Tokens</th>
                <th class="text-center">Cost ($)</th>
              </tr>
            </thead>
            <tbody>
              ${history
                .map(
                  (h) => `
                <tr>
                  <td><strong>Eval #${h.evaluationNumber}</strong> <small class="text-muted">${new Date(h.timestamp).toLocaleString()}</small></td>
                  <td class="text-center">${(h.tokens?.inputTokens || 0).toLocaleString()}</td>
                  <td class="text-center">${(h.tokens?.outputTokens || 0).toLocaleString()}</td>
                  <td class="text-center"><strong>${(h.tokens?.totalTokens || 0).toLocaleString()}</strong></td>
                  <td class="text-center"><strong>$${((h.tokens?.totalCost as any) || 0).toFixed(4)}</strong></td>
                </tr>
              `
                )
                .join('')}
              <tr class="table-light fw-bold">
                <td>Total</td>
                <td class="text-center">${history.reduce((sum, h) => sum + (h.tokens?.inputTokens || 0), 0).toLocaleString()}</td>
                <td class="text-center">${history.reduce((sum, h) => sum + (h.tokens?.outputTokens || 0), 0).toLocaleString()}</td>
                <td class="text-center">${history.reduce((sum, h) => sum + (h.tokens?.totalTokens || 0), 0).toLocaleString()}</td>
                <td class="text-center">$${history.reduce((sum, h) => sum + ((h.tokens?.totalCost as any) || 0), 0).toFixed(4)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Convergence Summary -->
        <h6 class="mb-3 mt-4">
          <span class="badge bg-light text-info">🎯 Convergence Analysis</span>
          <small class="text-muted ms-2">Agent consensus metrics across evaluations</small>
        </h6>
        <div class="row">
          <div class="col-md-3 mb-3">
            <div class="p-3 bg-light rounded text-center border">
              <small class="d-block text-muted">Average Convergence</small>
              <strong style="font-size: 1.8rem;" class="d-block text-info">${avgConvergence.toFixed(1)}%</strong>
              <small class="text-muted">Overall agreement level</small>
            </div>
          </div>
          <div class="col-md-3 mb-3">
            <div class="p-3 bg-light rounded text-center border">
              <small class="d-block text-muted">Highest</small>
              <strong style="font-size: 1.8rem;" class="d-block text-success">${maxConvergence.toFixed(1)}%</strong>
              <small class="text-muted">Best consensus</small>
            </div>
          </div>
          <div class="col-md-3 mb-3">
            <div class="p-3 bg-light rounded text-center border">
              <small class="d-block text-muted">Lowest</small>
              <strong style="font-size: 1.8rem;" class="d-block text-warning">${minConvergence.toFixed(1)}%</strong>
              <small class="text-muted">Most discussion</small>
            </div>
          </div>
          <div class="col-md-3 mb-3">
            <div class="p-3 bg-light rounded text-center border">
              <small class="d-block text-muted">Trend</small>
              <strong style="font-size: 1.5rem;" class="d-block ${convergenceTrend > 2 ? 'text-success' : convergenceTrend < -2 ? 'text-danger' : 'text-muted'}">${convergenceTrend > 2 ? '📈' : convergenceTrend < -2 ? '📉' : '→'}</strong>
              <small class="text-muted">${Math.abs(convergenceTrend).toFixed(1)}% ${convergenceTrend > 2 ? 'improving' : convergenceTrend < -2 ? 'declining' : 'stable'}</small>
            </div>
          </div>
        </div>

        <!-- Individual Scores -->
        <div class="row mt-3">
          ${history
            .map((h) => {
              const score = h.convergenceScore * 100;
              const scoreClass =
                score >= 85 ? 'bg-success' : score >= 70 ? 'bg-info' : 'bg-warning';
              const scoreLabel = score >= 85 ? 'Excellent' : score >= 70 ? 'Good' : 'Fair';
              return `
            <div class="col-md-3 mb-2">
              <div class="p-2 ${scoreClass} text-white rounded text-center" style="font-size: 0.9rem;">
                <small class="d-block opacity-75">Eval #${h.evaluationNumber}</small>
                <strong>${score.toFixed(0)}%</strong> <small class="opacity-75">${scoreLabel}</small>
              </div>
            </div>
          `;
            })
            .join('')}
        </div>

        <p class="small text-muted mt-3">
          <strong>📊 Interpretation:</strong>
          <strong>σ (Sigma)</strong> shows metric variability across evaluations. Lower values = more stable metrics.
          <strong>Trend</strong> shows direction: ↑ Increasing | ↓ Decreasing | → Stable.
          <strong>Convergence</strong> measures agent agreement: 85%+ = Excellent | 70-84% = Good | &lt;70% = Needs more discussion
        </p>
      </div>
    </div>
  `;
}

/**
 * Generate enhanced HTML report with conversation timeline
 */
export function generateEnhancedHtmlReport(
  results: AgentResult[],
  outputPath: string,
  metadata?: {
    commitHash?: string;
    timestamp?: string;
    commitAuthor?: string;
    commitMessage?: string;
    commitDate?: string;
    developerOverview?: string;
    filesChanged?: number;
    insertions?: number;
    deletions?: number;
  }
) {
  const groupedResults = groupResultsByAgent(results);
  const metricEvolution = calculateMetricEvolution(groupedResults);
  const comprehensiveMetricsHtml = buildMetricsTable(groupedResults);

  // Load and generate evaluation history
  const outputDir = path.dirname(outputPath);
  const evaluationHistory = loadEvaluationHistory(outputDir);

  // Try to load model info from config
  let modelInfo: string | undefined;
  try {
    const configPath = path.join(process.cwd(), '.codewave.config.json');
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      if (config.llm?.provider && config.llm?.model) {
        modelInfo = `🤖 ${config.llm.provider}/${config.llm.model}`;
      }
    }
  } catch {
    // Silently fail if config can't be read
  }

  const historyHtml = generateHistoryHtml(evaluationHistory, modelInfo);

  // Calculate consensus values (for comprehensive metrics table)
  const consensusValues = calculateConsensusValues(groupedResults);

  // Extract final pillar scores using consensus-based weighted averages
  // This ensures the 7-Pillar scores match the Final Agreed consensus values
  const finalPillarScores: Record<string, { value: number | null; agent: string }> = {};

  // Use consensus values directly - these are already weighted averages
  consensusValues.forEach((data, metric) => {
    // Identify the top contributor for attribution
    const topContributor = data.contributors.reduce((max: any, current: any) =>
      current.weight > max.weight ? current : max
    );
    finalPillarScores[metric] = {
      value: data.value,
      agent: topContributor.name,
    };
  });

  // Generate 7-Pillar Summary Card
  // Calculate NET debt for display (technicalDebtHours - debtReductionHours)
  const technicalDebtValue = finalPillarScores['technicalDebtHours']?.value || 0;
  const debtReductionValue = finalPillarScores['debtReductionHours']?.value || 0;
  const netDebtValue = technicalDebtValue - debtReductionValue;

  // Filter out individual debt metrics and add NET debt instead
  const displayMetrics = Object.entries(finalPillarScores).filter(
    ([metric]) => metric !== 'technicalDebtHours' && metric !== 'debtReductionHours'
  );

  // Add NET debt as a composite metric
  displayMetrics.push([
    'netDebt',
    {
      value: netDebtValue,
      agent: finalPillarScores['technicalDebtHours']?.agent || 'Team',
    },
  ]);

  const pillarSummaryHtml = `
    <div class="card mb-4 shadow-lg border-dark">
      <div class="card-header bg-dark text-white">
        <h5 class="mb-0">
          <span class="me-2" style="font-size: 1.5rem;">🎯</span>
          7-Pillar Evaluation Summary
        </h5>
      </div>
      <div class="card-body">
        <div class="row">
          ${displayMetrics
            .map(([metric, data]) => {
              let label = metric;
              if (metric === 'netDebt') {
                label = 'Net Debt (−=improve)';
              } else {
                label = metric
                  .replace(/([A-Z])/g, ' $1')
                  .replace(/^./, (str) => str.toUpperCase())
                  .trim();
              }
              let badgeColor = 'secondary';
              let icon = '📊';

              // Handle null values
              if (data.value === null) {
                badgeColor = 'secondary';
                icon = '➖';
              } else {
                // Determine color and icon based on metric type
                if (
                  metric.includes('Quality') ||
                  metric.includes('Coverage') ||
                  metric.includes('Impact')
                ) {
                  badgeColor = data.value >= 7 ? 'success' : data.value >= 4 ? 'warning' : 'danger';
                  icon = data.value >= 7 ? '✅' : data.value >= 4 ? '⚠️' : '❌';
                } else if (metric.includes('Complexity')) {
                  badgeColor = data.value <= 3 ? 'success' : data.value <= 6 ? 'warning' : 'danger';
                  icon = data.value <= 3 ? '✅' : data.value <= 6 ? '⚠️' : '❌';
                } else if (metric === 'netDebt' || metric.includes('Debt')) {
                  // For NET debt: positive = added debt (bad), negative = debt removed (good)
                  badgeColor = data.value > 0 ? 'danger' : data.value < 0 ? 'success' : 'secondary';
                  icon = data.value > 0 ? '❌' : data.value < 0 ? '✅' : '➖';
                }
              }

              const metadata = METRIC_METADATA[metric as keyof typeof METRIC_METADATA];
              let formattedValue: string;
              if (data.value === null) {
                formattedValue = '-';
              } else if (metric === 'netDebt') {
                formattedValue = `${data.value > 0 ? '+' : ''}${data.value.toFixed(1)}h`;
              } else {
                formattedValue = metadata ? metadata.format(data.value) : data.value.toFixed(1);
              }
              const scale = metadata
                ? metadata.scale
                : metric === 'netDebt'
                  ? 'Positive = added debt, Negative = removed debt'
                  : '';
              const tooltip = metadata
                ? metadata.tooltip
                : metric === 'netDebt'
                  ? 'Net technical debt: debt introduced minus debt removed'
                  : '';

              return `
              <div class="col-md-6 mb-2">
                <div class="d-flex justify-content-between align-items-center p-2 bg-light rounded" title="${tooltip}" style="gap: 1rem;">
                  <div style="font-size: 0.85rem; min-width: 0; flex: 1;">
                    <div style="font-weight: 600; line-height: 1.2;">${icon} ${label}</div>
                    <div style="color: #666; font-size: 0.8rem; line-height: 1.2;">by ${data.agent}</div>
                    ${scale ? `<div style="color: #999; font-size: 0.75rem; line-height: 1.2;">📍 ${scale}</div>` : ''}
                  </div>
                  <div style="white-space: nowrap; flex-shrink: 0;">
                    <span class="badge bg-${badgeColor}" style="font-size: 0.95rem; padding: 0.4rem 0.6rem;">${formattedValue}</span>
                  </div>
                </div>
              </div>
            `;
            })
            .join('')}
        </div>
      </div>
    </div>
  `;

  // Generate Individual Agent Cards
  let agentCardsHtml = '<div class="row">';
  groupedResults.forEach((evaluations, agentName) => {
    const latestEval = evaluations[evaluations.length - 1];
    const numRounds = evaluations.length;
    const hasMultipleRounds = numRounds > 1;

    const agentDescription = AGENT_DESCRIPTIONS[agentName] || '';

    agentCardsHtml += `
      <div class="col-md-6 mb-4">
        <div class="card h-100 shadow-sm border-${latestEval.color}" data-agent="${agentName}">
          <div class="card-header bg-${latestEval.color} text-white">
            <h5 class="mb-0">
              <span class="me-2" style="font-size: 1.5rem;">${latestEval.icon}</span>
              ${agentName}
              ${hasMultipleRounds ? `<span class="badge bg-light text-dark ms-2">${numRounds} Rounds</span>` : ''}
            </h5>
            ${agentDescription ? `<small class="text-white-50 d-block mt-1">${agentDescription}</small>` : ''}
          </div>
          <div class="card-body">
            <h6 class="text-${latestEval.color} mb-2">📊 Metrics</h6>
            <div class="mb-3">
        ${
          latestEval.metrics
            ? Object.entries(latestEval.metrics)
                .map(([key, value]) => {
                  const label = key
                    .replace(/([A-Z])/g, ' $1')
                    .replace(/^./, (str) => str.toUpperCase())
                    .trim();
                  return `<span class="badge bg-${latestEval.color} me-2">${label}: ${value}</span>`;
                })
                .join('')
            : '<em class="text-muted">No metrics</em>'
        }
            </div>

            <h6 class="text-${latestEval.color} mb-2">💭 Final Assessment</h6>
            <p class="small">${latestEval.summary.substring(0, 200)}${latestEval.summary.length > 200 ? '...' : ''}</p>

            ${
              latestEval.concernsRaised.length > 0
                ? `
              <h6 class="text-danger mb-2">⚠️ Concerns (Round ${latestEval.round})</h6>
              <ul class="small">
                ${latestEval.concernsRaised.map((concern) => `<li>${concern}</li>`).join('')}
              </ul>
            `
                : ''
            }

            <button class="btn btn-sm btn-outline-${latestEval.color}" onclick="showAgentDetails('${agentName}')">
              View Full Analysis →
            </button>
          </div>
        </div>
      </div>
    `;
  });
  agentCardsHtml += '</div>';

  // Generate Conversation Timeline with round phases
  let timelineHtml = '';
  const allEvaluations: AgentEvaluation[] = [];
  groupedResults.forEach((evals) => allEvaluations.push(...evals));

  // Sort by round first, then by agent
  allEvaluations.sort((a, b) => {
    if (a.round !== b.round) return a.round - b.round;
    return a.agentName.localeCompare(b.agentName);
  });

  const roundPhases = [
    { title: 'Initial Analysis', description: 'Initial evaluation from all agents', emoji: '🔍' },
    {
      title: 'Concerns & Questions',
      description: 'Agents discuss findings and address concerns',
      emoji: '❓',
    },
    { title: 'Validation', description: 'Final consensus and validation', emoji: '✅' },
  ];

  let currentRound = -1;
  allEvaluations.forEach((evaluation) => {
    if (evaluation.round !== currentRound) {
      currentRound = evaluation.round;
      const roundIndex = currentRound - 1; // Convert to 0-based for phase lookup
      const phase = roundPhases[roundIndex] || {
        title: `Round ${currentRound} `,
        description: '',
        emoji: '🔄',
      };
      timelineHtml += `
        <div style="margin: 2rem 0 1.5rem 0; padding-bottom: 1rem; border-bottom: 2px solid #e9ecef;">
          <div style="display: flex; align-items: center; gap: 0.75rem; margin-bottom: 0.5rem;">
            <span style="font-size: 1.5rem;">${phase.emoji}</span>
            <h4 style="margin: 0; font-size: 1.1rem; color: #333;">Round ${currentRound}: ${phase.title}</h4>
          </div>
          <p style="margin: 0; font-size: 0.9rem; color: #666;">${phase.description}</p>
        </div>
              `;
    }

    // Simplified card with only essential information
    const concernsHtml =
      evaluation.concernsRaised.length > 0
        ? `
            <div style="margin-top: 0.75rem; padding: 0.75rem; background: #fff3cd; border-left: 3px solid #ffc107; border-radius: 4px;">
              <strong style="font-size: 0.85rem; color: #856404;">Concerns:</strong>
              <ul style="margin: 0.5rem 0 0 1rem; padding: 0; font-size: 0.85rem; color: #856404;">
                ${evaluation.concernsRaised.map((c) => `<li>${c}</li>`).join('')}
              </ul>
            </div>
    `
        : '';

    const referencesHtml =
      evaluation.referencesTo.length > 0
        ? `
            <div style="margin-top: 0.5rem; font-size: 0.85rem; color: #0d6efd;">
              💬 References: <strong>${evaluation.referencesTo.join(', ')}</strong>
            </div>
    `
        : '';

    timelineHtml += `
        <div style="margin-bottom: 1.5rem; padding: 1rem; border-radius: 8px; background: #f8f9fa; border-left: 4px solid #0d6efd;">
          <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.75rem;">
            <span style="font-size: 1.3rem;">${evaluation.icon}</span>
            <strong style="font-size: 0.95rem;">${evaluation.agentName}</strong>
            <span style="font-size: 0.8rem; color: #999; margin-left: auto;">Round ${evaluation.round}</span>
          </div>
          <p style="margin: 0 0 0.75rem 0; font-size: 0.9rem; line-height: 1.4; color: #333;">${evaluation.summary}</p>
          ${concernsHtml}
          ${referencesHtml}
        </div>
  `;
  });

  timelineHtml = `<div style="background: white; padding: 0; border-radius: 8px;">${timelineHtml}</div>`;

  // Determine min and max rounds from evaluations
  const allRounds = Array.from(groupedResults.values()).flatMap((evals) =>
    evals.map((e) => e.round)
  );
  const minRound = Math.min(...allRounds);
  const maxRound = Math.max(...allRounds);

  // Map metric keys to full names
  const metricNames: Record<string, string> = {
    functionalImpact: 'Functional Impact',
    idealTimeHours: 'Ideal Time Estimate',
    testCoverage: 'Test Coverage',
    codeQuality: 'Code Quality',
    codeComplexity: 'Code Complexity',
    actualTimeHours: 'Actual Time Spent',
    technicalDebtHours: 'Technical Debt',
    debtReductionHours: 'Debt Reduction',
    netDebt: 'NET Debt (−=improve)',
  };

  // Generate Metric Evolution Table - ROUNDS AS ROWS, METRICS AS COLUMNS
  const evolutionHtml = `
    <div class="card mb-4 shadow-sm">
      <div class="card-header bg-dark text-white">
        <h5 class="mb-0">📈 Metric Evolution Across Rounds</h5>
      </div>
      <div class="card-body">
        <div style="overflow-x: auto;">
          <table class="table table-hover table-sm">
            <thead>
              <tr>
                <th style="min-width: 120px; position: sticky; left: 0; background: #f8f9fa;">Round</th>
                ${metricEvolution
                  .map((evolution) => {
                    const fullName =
                      metricNames[evolution.metric] ||
                      evolution.metric.replace(/([A-Z])/g, ' $1').trim();
                    return `<th style="text-align: center; min-width: 140px;">${fullName}</th>`;
                  })
                  .join('')}
                <th style="text-align: center; min-width: 140px; font-weight: 700; color: #dc3545;">NET Debt (−=improve)</th>
              </tr>
            </thead>
            <tbody>
              ${Array.from({ length: maxRound - minRound + 1 }, (_, idx) => {
                const roundNum = minRound + idx;
                const roundIndex = roundNum - 1; // Convert to 0-based index for phase lookup
                const roundPhases = ['Initial Analysis', 'Concerns & Questions', 'Validation'];
                const phaseLabel = roundPhases[roundIndex] || `Round ${roundNum}`;

                return `
                <tr>
                  <td style="font-weight: 600; position: sticky; left: 0; background: #f8f9fa;">
                    <span title="Round ${roundNum}: ${phaseLabel}">
                      ${roundIndex === 0 ? '🔍' : roundIndex === 1 ? '❓' : roundIndex === 2 ? '✅' : '🔄'} Round ${roundNum}
                    </span>
                  </td>
                  ${metricEvolution
                    .map((evolution) => {
                      const value = evolution.rounds.get(roundNum);
                      const previousValue =
                        roundNum > minRound ? evolution.rounds.get(roundNum - 1) : undefined;
                      let cellContent =
                        value !== undefined && value !== null ? value.toFixed(1) : '—';
                      let cellStyle = '';

                      // Add change indicator
                      if (
                        value !== undefined &&
                        value !== null &&
                        previousValue !== undefined &&
                        previousValue !== null
                      ) {
                        const diff = value - previousValue;
                        if (Math.abs(diff) > 0.05) {
                          const arrow = diff > 0 ? '↑' : '↓';
                          const color = diff > 0 ? '#28a745' : '#dc3545';
                          cellContent =
                            '<span style="color: ' +
                            color +
                            '; font-weight: 600;">' +
                            arrow +
                            ' ' +
                            cellContent +
                            '</span>';
                          cellStyle = 'background-color: rgba(0,0,0,0.02);';
                        }
                      }

                      return (
                        '<td style="text-align: center; ' +
                        cellStyle +
                        '; padding: 0.75rem 0.5rem;">' +
                        cellContent +
                        '</td>'
                      );
                    })
                    .join('')}
                  <!-- NET Debt column -->
                  ${(() => {
                    const techDebtMetric = metricEvolution.find(
                      (e) => e.metric === 'technicalDebtHours'
                    );
                    const debtReductionMetric = metricEvolution.find(
                      (e) => e.metric === 'debtReductionHours'
                    );
                    const techDebtValue = techDebtMetric?.rounds.get(roundNum) ?? 0;
                    const debtReductionValue = debtReductionMetric?.rounds.get(roundNum) ?? 0;
                    const netDebt = techDebtValue - debtReductionValue;

                    const prevTechDebt =
                      roundNum > minRound
                        ? (techDebtMetric?.rounds.get(roundNum - 1) ?? 0)
                        : undefined;
                    const prevDebtReduction =
                      roundNum > minRound
                        ? (debtReductionMetric?.rounds.get(roundNum - 1) ?? 0)
                        : undefined;
                    const prevNetDebt =
                      prevTechDebt !== undefined && prevDebtReduction !== undefined
                        ? prevTechDebt - prevDebtReduction
                        : undefined;

                    let netDebtContent = netDebt.toFixed(1);
                    let netDebtStyle = '';
                    let netDebtColor =
                      netDebt > 0 ? '#dc3545' : netDebt < 0 ? '#28a745' : '#6c757d';

                    // Add change indicator
                    if (prevNetDebt !== undefined) {
                      const diff = netDebt - prevNetDebt;
                      if (Math.abs(diff) > 0.05) {
                        const arrow = diff > 0 ? '↑' : '↓';
                        const arrowColor = diff > 0 ? '#dc3545' : '#28a745';
                        netDebtContent =
                          '<span style="color: ' +
                          arrowColor +
                          '; font-weight: 600;">' +
                          arrow +
                          ' ' +
                          netDebtContent +
                          '</span>';
                        netDebtStyle = 'background-color: rgba(0,0,0,0.02);';
                      }
                    }

                    return (
                      '<td style="text-align: center; color: ' +
                      netDebtColor +
                      '; font-weight: 600; ' +
                      netDebtStyle +
                      '; padding: 0.75rem 0.5rem;">' +
                      netDebtContent +
                      '</td>'
                    );
                  })()}
                </tr>
              `;
              }).join('')}
            </tbody>
          </table>
        </div>
        <div style="margin-top: 1rem; font-size: 0.85rem; color: #666;">
          <div>📍 <strong>Legend:</strong> ↑ Increased | ↓ Decreased | — Not evaluated in this round</div>
        </div>
      </div>
    </div>
  `;

  // Generate full HTML
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Commit Evaluation Report - Conversation View</title>
  <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
  <style>
    body {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      padding: 40px 0;
    }
    .report-container {
      max-width: 1400px;
      margin: 0 auto;
      background: #fff;
      border-radius: 20px;
      box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
      padding: 40px;
    }
    .report-header {
      text-align: center;
      margin-bottom: 40px;
      padding-bottom: 30px;
      border-bottom: 3px solid #667eea;
      position: relative;
    }
    .report-header h1 {
      margin-bottom: 10px;
    }
    .report-header .subtitle {
      color: #666;
      margin-bottom: 15px;
    }
    .report-header .badge {
      margin: 0 5px;
    }
    
    /* Timeline Styles */
    .timeline {
      position: relative;
      padding: 20px 0;
    }
    .timeline::before {
      content: '';
      position: absolute;
      left: 30px;
      top: 0;
      bottom: 0;
      width: 4px;
      background: linear-gradient(180deg, #667eea 0%, #764ba2 100%);
    }
    .timeline-round {
      margin: 3rem 0 2rem 0;
      padding: 1.5rem;
      background: linear-gradient(135deg, rgba(102, 126, 234, 0.05) 0%, rgba(118, 75, 162, 0.05) 100%);
      border-left: 4px solid #667eea;
      border-radius: 4px;
    }
    .round-header {
      display: flex;
      align-items: center;
      gap: 1rem;
    }
    .timeline-item {
      position: relative;
      margin-bottom: 2rem;
      margin-left: 60px;
    }
    .timeline-marker {
      position: absolute;
      left: -57px;
      top: 10px;
      width: 60px;
      height: 60px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      border: 4px solid white;
      box-shadow: 0 2px 10px rgba(0,0,0,0.2);
      font-size: 1.5rem;
    }
    .timeline-content {
      animation: slideIn 0.3s ease-out;
      transition: transform 0.2s ease, box-shadow 0.2s ease;
    }
    .timeline-content:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 15px rgba(0,0,0,0.15);
    }
    @keyframes slideIn {
      from {
        opacity: 0;
        transform: translateX(-20px);
      }
      to {
        opacity: 1;
        transform: translateX(0);
      }
    }
    
    /* Tab Styles */
    .nav-tabs .nav-link {
      color: #667eea;
      font-weight: 600;
    }
    .nav-tabs .nav-link.active {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      border: none;
    }
    
    /* Modal for detailed view */
    .modal-header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
    }
  </style>
</head>
<body>
  <div class="report-container">
    <div class="report-header">
      <div class="position-relative">
        <a href="../index.html" class="btn btn-sm" style="position: absolute; top: 0; right: 0; background: white; color: #667eea; border: 2px solid white; font-weight: 600; padding: 8px 16px; box-shadow: 0 2px 8px rgba(0,0,0,0.15); z-index: 1000;">
          ← Back to Index
        </a>
        <div class="text-center">
          <h1>🌊 CodeWave Analysis Report</h1>
          <p class="subtitle">AI-Powered Commit Intelligence</p>
          ${metadata?.commitHash ? `<div class="badge bg-secondary mb-2">Commit: ${metadata.commitHash}</div>` : ''}
          ${metadata?.commitAuthor ? `<div class="badge bg-info mb-2">Author: ${metadata.commitAuthor}</div>` : ''}
          ${metadata?.commitMessage ? `<div class="text-muted mt-2" style="opacity: 0.9;">${metadata.commitMessage}</div>` : ''}
          <small class="text-muted d-block mt-3" style="opacity: 0.8;">Generated on ${metadata?.timestamp || new Date().toLocaleString()}</small>
        </div>
      </div>
    </div>

    <!-- Commit Overview Card -->
    ${
      metadata?.commitHash || metadata?.commitAuthor
        ? `
    <div class="card mb-4 shadow-sm border-primary">
      <div class="card-header bg-primary text-white">
        <h5 class="mb-0">
          <span class="me-2">📝</span>
          Commit Overview
        </h5>
      </div>
      <div class="card-body">
        <div class="row">
          ${
            metadata?.commitHash
              ? `
          <div class="col-md-6 mb-3">
            <strong>📌 Commit Hash:</strong><br>
            <code class="d-inline-block mt-1 px-2 py-1 bg-light rounded">${metadata.commitHash}</code>
          </div>
          `
              : ''
          }
          ${
            metadata?.commitAuthor
              ? `
          <div class="col-md-6 mb-3">
            <strong>👤 Author:</strong><br>
            <span class="d-inline-block mt-1">${metadata.commitAuthor}</span>
          </div>
          `
              : ''
          }
          ${
            metadata?.commitDate
              ? `
          <div class="col-md-6 mb-3">
            <strong>📅 Date:</strong><br>
            <span class="d-inline-block mt-1">${new Date(metadata.commitDate).toLocaleString()}</span>
          </div>
          `
              : ''
          }
          ${
            metadata?.commitMessage
              ? `
          <div class="col-12 mb-3">
            <strong>💬 Commit Message:</strong><br>
            <div class="mt-2 p-3 bg-light rounded" style="white-space: pre-wrap; font-family: 'Courier New', monospace; font-size: 0.9rem;">${metadata.commitMessage}</div>
          </div>
          `
              : ''
          }
          ${
            metadata?.filesChanged !== undefined ||
            metadata?.insertions !== undefined ||
            metadata?.deletions !== undefined
              ? `
          <div class="col-12 mb-3">
            <strong>📊 Commit Statistics:</strong><br>
            <div class="mt-2 p-3 bg-light rounded" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 15px; text-align: center;">
              ${
                metadata?.filesChanged !== undefined
                  ? `
              <div>
                <div style="font-size: 1.8rem; font-weight: bold; color: #667eea;">${metadata.filesChanged}</div>
                <div style="font-size: 0.8rem; color: #666; margin-top: 5px;">Files Changed</div>
              </div>
              `
                  : ''
              }
              ${
                metadata?.insertions !== undefined
                  ? `
              <div>
                <div style="font-size: 1.8rem; font-weight: bold; color: #28a745;">+${metadata.insertions}</div>
                <div style="font-size: 0.8rem; color: #666; margin-top: 5px;">Insertions</div>
              </div>
              `
                  : ''
              }
              ${
                metadata?.deletions !== undefined
                  ? `
              <div>
                <div style="font-size: 1.8rem; font-weight: bold; color: #dc3545;">-${metadata.deletions}</div>
                <div style="font-size: 0.8rem; color: #666; margin-top: 5px;">Deletions</div>
              </div>
              `
                  : ''
              }
            </div>
          </div>
          `
              : ''
          }
        </div>
      </div>
    </div>
    `
        : ''
    }

    <!-- Developer Overview Card -->
    <div class="card mb-4 shadow-sm border-info">
      <div class="card-header bg-info text-white">
        <h5 class="mb-0">
          <span class="me-2">👨‍💻</span>
          Developer Overview
        </h5>
      </div>
      <div class="card-body">
        <div class="alert alert-light mb-0">
          ${
            metadata?.developerOverview
              ? `
            <div style="white-space: pre-wrap; font-family: 'Courier New', monospace; font-size: 0.95rem; line-height: 1.6;">${metadata.developerOverview}</div>
          `
              : `
            <div style="color: #666; font-style: italic;">
              💡 <strong>Developer overview not yet generated.</strong> This section is populated when the Developer Author agent provides insights about implementation decisions, trade-offs, and actual time spent on the changes.
            </div>
          `
          }
        </div>
      </div>
    </div>

    <!-- Evaluation Process Explanation -->
    <div class="alert alert-info mb-4">
      <h5 class="alert-heading">
        <span class="me-2">🔄</span>
        3-Round Conversation Process
      </h5>
      <p class="mb-2">This commit was evaluated through a multi-agent conversation in 3 rounds:</p>
      <ol class="mb-0">
        <li><strong>Round 1 - Initial Assessment:</strong> Each agent independently analyzes the commit and provides their initial evaluation.</li>
        <li><strong>Round 2 - Raising Concerns:</strong> Agents review each other's assessments and raise questions or concerns to the responsible agent for specific areas.</li>
        <li><strong>Round 3 - Validation & Agreement:</strong> Agents respond to concerns, refine their scores, and reach consensus on the final evaluation.</li>
      </ol>
      <p class="mt-2 mb-0"><small class="text-muted">💡 The scores shown below represent the <strong>final agreed-upon values</strong> from Round 3, while agent results display the <strong>last refined assessment</strong> from each agent.</small></p>
    </div>

    <!-- 7-Pillar Summary (Always Visible) -->
    ${pillarSummaryHtml}

    <!-- Navigation Tabs -->
    <ul class="nav nav-tabs mb-4" role="tablist">
      <li class="nav-item">
        <button class="nav-link active" data-bs-toggle="tab" data-bs-target="#agents">
          👥 Agent Evaluations
        </button>
      </li>
      <li class="nav-item">
        <button class="nav-link" data-bs-toggle="tab" data-bs-target="#conversation">
          💬 Conversation Timeline
        </button>
      </li>
      <li class="nav-item">
        <button class="nav-link" data-bs-toggle="tab" data-bs-target="#metrics">
          📊 Metric Evolution
        </button>
      </li>
      ${
        results.some((r: AgentResult) => r.internalIterations !== undefined)
          ? `
      <li class="nav-item">
        <button class="nav-link" data-bs-toggle="tab" data-bs-target="#refinement">
          🔄 Refinement Journey
        </button>
      </li>
      `
          : ''
      }
      ${
        evaluationHistory.length > 0
          ? `
      <li class="nav-item">
        <button class="nav-link" data-bs-toggle="tab" data-bs-target="#history">
          📈 Evaluation History
        </button>
      </li>
      `
          : ''
      }
    </ul>

    <!-- Tab Content -->
    <div class="tab-content">
      <!-- Agent Evaluations Tab -->
      <div class="tab-pane fade show active" id="agents">
        <h2 class="mb-4">👥 Individual Agent Assessments</h2>
        ${agentCardsHtml}
      </div>

      <!-- Conversation Timeline Tab -->
      <div class="tab-pane fade" id="conversation">
        <h2 class="mb-4">💬 Conversation Flow</h2>
        <p class="text-muted mb-4">
          Follow the discussion between agents across ${Math.max(...allEvaluations.map((e) => e.round))} rounds. 
          Agents reference each other's concerns and build consensus.
        </p>
        ${timelineHtml}
      </div>

      <!-- Metrics Evolution Tab -->
      <div class="tab-pane fade" id="metrics">
        <h2 class="mb-4">📊 Comprehensive Metrics Analysis</h2>
        ${comprehensiveMetricsHtml}

        <h3 class="mt-5 mb-3">📈 Metric Evolution Across Rounds</h3>
        ${evolutionHtml}
      </div>

      ${
        results.some((r: AgentResult) => r.internalIterations !== undefined)
          ? `
      <!-- Refinement Journey Tab -->
      <div class="tab-pane fade" id="refinement">
        <h2 class="mb-4">🔄 Agent Refinement Journey</h2>
        <p class="text-muted mb-4">
          Each agent iteratively refines their analysis to reach confidence in their assessment.
          This tab shows the self-refinement process and clarity progression for each agent.
        </p>
        <div class="row">
          ${Array.from(groupedResults.entries())
            .map(([agentName, evals]) => {
              const latestEval = evals[evals.length - 1];
              const result = results.find((r) => {
                const rAgentName = detectAgentName(r, 0);
                return rAgentName === agentName;
              });
              const iterations = result?.internalIterations || 0;
              const clarity = result?.clarityScore || 0;

              return iterations > 0
                ? `
              <div class="col-md-6 mb-4">
                <div class="card h-100 shadow-sm border-${latestEval.color}">
                  <div class="card-header bg-${latestEval.color} text-white">
                    <h6 class="mb-0">
                      <span class="me-2" style="font-size: 1.2rem;">${latestEval.icon}</span>
                      ${agentName}
                      <span class="badge bg-light text-dark ms-2">🔄 ${iterations} iterations</span>
                    </h6>
                  </div>
                  <div class="card-body">
                    <div class="mb-3">
                      <strong>Clarity Score:</strong>
                      <div class="progress mt-2">
                        <div class="progress-bar bg-${latestEval.color}" style="width: ${clarity}%">
                          ${clarity}%
                        </div>
                      </div>
                    </div>
                    <p class="small text-muted">
                      This agent refined their analysis through <strong>${iterations}</strong> self-iteration cycles,
                      progressively improving their confidence from internal gap analysis and question generation.
                    </p>
                    ${
                      result?.refinementNotes && result.refinementNotes.length > 0
                        ? `
                      <div class="mt-3">
                        <strong class="small">Refinement Notes:</strong>
                        <ul class="small mt-2">
                          ${result.refinementNotes.map((note) => `<li>${note}</li>`).join('')}
                        </ul>
                      </div>
                    `
                        : ''
                    }
                    ${
                      result?.missingInformation && result.missingInformation.length > 0
                        ? `
                      <div class="mt-3 alert alert-warning p-2">
                        <strong class="small">Final Gaps Identified:</strong>
                        <ul class="small mt-2 mb-0">
                          ${result.missingInformation
                            .slice(0, 3)
                            .map((gap) => `<li>${gap}</li>`)
                            .join('')}
                        </ul>
                      </div>
                    `
                        : ''
                    }
                  </div>
                </div>
              </div>
            `
                : '';
            })
            .join('')}
        </div>
      </div>
      `
          : ''
      }

      ${
        evaluationHistory.length > 0
          ? `
      <!-- Evaluation History Tab -->
      <div class="tab-pane fade" id="history">
        <h2 class="mb-4">📈 Evaluation History & Comparisons</h2>
        <p class="text-muted mb-4">
          Track how metrics and costs have changed across multiple evaluations of this commit.
          This helps identify consistency, model drift, and cost optimization opportunities.
        </p>
        ${historyHtml}
      </div>
      `
          : ''
      }
    </div>

    <div class="text-center mt-5 pt-4 border-top">
      <small class="text-muted">
        Generated by <strong>CodeWave</strong> with LangGraph Multi-Agent System
      </small>
    </div>
  </div>

  <!-- Modal for Full Agent Details -->
  <div class="modal fade" id="agentModal" tabindex="-1">
    <div class="modal-dialog modal-lg">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title" id="modalTitle"></h5>
          <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
        </div>
        <div class="modal-body" id="modalBody"></div>
      </div>
    </div>
  </div>

  <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>
  <script>
    const agentData = ${JSON.stringify(Object.fromEntries(groupedResults), null, 2)};

    function showAgentDetails(agentName) {
      const evaluations = agentData[agentName];
      if (!evaluations) return;

      document.getElementById('modalTitle').innerHTML = 
        evaluations[0].icon + ' ' + agentName + ' - Full Analysis';

      let content = '';
      evaluations.forEach((evaluation, idx) => {
        content += \`
          <div class="mb-4">
            <h6 class="text-\${evaluation.color}">Round \${evaluation.round}</h6>
            <p><strong>Summary:</strong><br>\${evaluation.summary}</p>
            <div class="bg-light p-3 rounded">
              <strong>Details:</strong><br>
              \${evaluation.details.replace(/\\n/g, '<br>')}
            </div>
            \${evaluation.metrics ? \`
              <div class="mt-2">
                <strong>Metrics:</strong>
                \${Object.entries(evaluation.metrics).map(([k,v]) => 
                  \`<span class="badge bg-\${evaluation.color} me-1">\${k}: \${v}</span>\`
                ).join('')}
              </div>
            \` : ''}
          </div>
          \${idx < evaluations.length - 1 ? '<hr>' : ''}
        \`;
      });

      document.getElementById('modalBody').innerHTML = content;
      new bootstrap.Modal(document.getElementById('agentModal')).show();
    }
  </script>
</body>
</html>`;

  fs.writeFileSync(outputPath, html, 'utf-8');
}
