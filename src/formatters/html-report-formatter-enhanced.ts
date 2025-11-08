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
  'Evaluates business value, functional impact, and estimates ideal implementation time': 'Business Analyst',
  'Evaluates test coverage, identifies testing gaps, and assesses quality assurance': 'QA Engineer',
  'Explains implementation decisions, trade-offs, and estimates actual time spent': 'Developer Author',
  'Evaluates architecture, design patterns, code complexity, and technical debt': 'Senior Architect',
  'Reviews code quality, suggests improvements, and evaluates implementation details': 'Developer Reviewer',
};

/**
 * Short descriptions for agent cards (displayed below agent names)
 */
const AGENT_DESCRIPTIONS: Record<string, string> = {
  'Business Analyst': 'Evaluates business value, functional impact, and ideal time estimates',
  'QA Engineer': 'Evaluates test coverage, quality assurance, and testing completeness',
  'Developer Author': 'Evaluates actual time spent, implementation approach, and development effort',
  'Senior Architect': 'Evaluates code complexity, architecture design, and technical debt',
  'Developer Reviewer': 'Evaluates code quality, best practices, and maintainability',
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

  if (combined.includes('business analyst') || combined.includes('functional impact') || combined.includes('ideal time')) {
    return 'Business Analyst';
  }
  if (combined.includes('qa engineer') || combined.includes('test coverage') || combined.includes('testing')) {
    return 'QA Engineer';
  }
  if (combined.includes('developer author') || combined.includes('actual time') || combined.includes('spent about')) {
    return 'Developer Author';
  }
  if (combined.includes('senior architect') || combined.includes('code complexity') || combined.includes('technical debt')) {
    return 'Senior Architect';
  }
  if (combined.includes('developer reviewer') || combined.includes('code quality') || combined.includes('refactoring')) {
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

  concernPatterns.forEach(pattern => {
    const matches = details.match(pattern);
    if (matches) {
      concerns.push(...matches.map(m => m.trim()));
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

  const agentNames = ['Business Analyst', 'QA Engineer', 'Developer Author', 'Senior Architect', 'Developer Reviewer'];
  agentNames.forEach(name => {
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
    'QA Engineer': '🧪',
    'Developer Author': '👨‍💻',
    'Senior Architect': '🏛️',
    'Developer Reviewer': '💻',
  };

  const colorMap: Record<string, string> = {
    'Business Analyst': 'info',
    'QA Engineer': 'warning',
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

    const concerns = extractConcerns(result.details || '');
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
      referencesTo: references.filter(ref => ref !== agentName),
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
    console.log(`${agent}: ${evals.length} responses (rounds: ${evals.map(e => e.round).join(', ')})`);
  });

  return grouped;
}

/**
 * Calculate metric evolution across rounds (dynamic for ANY number of rounds)
 */
function calculateMetricEvolution(groupedResults: Map<string, AgentEvaluation[]>): MetricEvolution[] {
  const metricMap = new Map<string, MetricEvolution>();

  groupedResults.forEach(evaluations => {
    evaluations.forEach(evaluation => {
      if (evaluation.metrics) {
        Object.entries(evaluation.metrics).forEach(([metric, value]) => {
          if (!metricMap.has(metric)) {
            metricMap.set(metric, {
              metric,
              rounds: new Map<number, number>(),
              changed: false
            });
          }
          const evolution = metricMap.get(metric)!;

          // Store value for this round
          evolution.rounds.set(evaluation.round, value);

          // Check if value changed from first round
          const firstRound = Math.min(...Array.from(evolution.rounds.keys()));
          const firstValue = evolution.rounds.get(firstRound);
          if (evaluation.round > firstRound && firstValue !== undefined) {
            evolution.changed = evolution.changed || firstValue !== value;
          }
        });
      }
    });
  });

  return Array.from(metricMap.values());
}

/**
 * Build comprehensive metrics table showing all agent contributions
 */
function buildMetricsTable(groupedResults: Map<string, AgentEvaluation[]>): string {
  // Import agent weights for display
  const { getAgentWeight, calculateWeightedAverage, AGENT_EXPERTISE_WEIGHTS } = require('../constants/agent-weights.constants');

  // Collect all unique metrics
  const allMetrics = new Set<string>();
  groupedResults.forEach(evaluations => {
    evaluations.forEach(evaluation => {
      if (evaluation.metrics) {
        Object.keys(evaluation.metrics).forEach(metric => allMetrics.add(metric));
      }
    });
  });

  // Build agent-metric matrix and agentName -> agentRole mapping
  const agentMetrics = new Map<string, Map<string, number>>();
  const agentRoleMap = new Map<string, string>(); // Maps display name to technical key
  groupedResults.forEach((evaluations, agentName) => {
    const latestEval = evaluations[evaluations.length - 1]; // Use latest response
    if (latestEval.metrics) {
      agentMetrics.set(agentName, new Map(Object.entries(latestEval.metrics)));
    }
    // Store agentRole for weight lookup
    if (latestEval.agentRole) {
      agentRoleMap.set(agentName, latestEval.agentRole);
    }
  });

  // Calculate weighted averages for final values (using weights from constants)
  const finalValues = new Map<string, { value: number; contributors: Array<{ name: string, score: number, weight: number }> }>();
  allMetrics.forEach(metric => {
    const contributors: Array<{ name: string, score: number, weight: number }> = [];
    agentMetrics.forEach((metrics, agentName) => {
      if (metrics.has(metric)) {
        const score = metrics.get(metric)!;
        // Use agentRole (technical key) for weight lookup, fallback to agentName
        const agentKey = agentRoleMap.get(agentName) || agentName;
        const weight = getAgentWeight(agentKey, metric);
        contributors.push({ name: agentName, score, weight });
      }
    });
    if (contributors.length > 0) {
      // Calculate weighted average using agentRole (technical keys)
      const weightedAvg = calculateWeightedAverage(
        contributors.map(c => ({
          agentName: agentRoleMap.get(c.name) || c.name, // Use agentRole for weight lookup
          score: c.score
        })),
        metric
      );
      finalValues.set(metric, { value: weightedAvg, contributors });
    }
  });

  // Build HTML table
  const metricLabels = Array.from(allMetrics).map(m =>
    m.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase()).trim()
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
              ${Array.from(agentMetrics.keys()).map(agent =>
    `<th class="text-center">${agent}</th>`
  ).join('')}
              <th class="text-center bg-success text-white">Final Agreed</th>
            </tr>
          </thead>
          <tbody>
            ${Array.from(allMetrics).map((metric, idx) => {
    const final = finalValues.get(metric)!;
    return `
                <tr>
                  <td><strong>${metricLabels[idx]}</strong></td>
                  ${Array.from(agentMetrics.keys()).map(agent => {
      const value = agentMetrics.get(agent)?.get(metric);
      // Use agentRole for weight lookup
      const agentKey = agentRoleMap.get(agent) || agent;
      const weight = getAgentWeight(agentKey, metric);
      const weightPercent = (weight * 100).toFixed(1);
      const isPrimary = weight >= 0.40; // Primary expertise threshold
      const badgeClass = isPrimary ? 'badge bg-warning text-dark' : 'badge bg-secondary';

      if (value !== undefined) {
        return `<td class="text-center">
                          <div>${value.toFixed(2)}</div>
                          <small class="${badgeClass}">${weightPercent}%</small>
                        </td>`;
      }
      return `<td class="text-center text-muted">-</td>`;
    }).join('')}
                  <td class="text-center bg-success bg-opacity-10">
                    <strong>${final.value.toFixed(2)}</strong>
                    <br><small class="text-muted">(weighted avg from ${final.contributors.length} agent${final.contributors.length > 1 ? 's' : ''})</small>
                  </td>
                </tr>
                `;
  }).join('')}
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
    const content = fs.readFileSync(historyPath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return [];
  }
}

/**
 * Generate history comparison HTML
 */
function generateHistoryHtml(history: EvaluationHistoryEntry[]): string {
  if (history.length === 0) {
    return '<p class="text-muted">No re-evaluation history available yet. This is the first evaluation.</p>';
  }

  if (history.length === 1) {
    return '<p class="text-muted">Only one evaluation recorded. History comparison will appear after re-evaluations.</p>';
  }

  // Build comparison table
  const metrics = ['functionalImpact', 'testCoverage', 'codeQuality', 'codeComplexity', 'technicalDebtHours'];
  const tokens = ['inputTokens', 'outputTokens', 'totalCost'];

  const metricRows = metrics
    .map((metric) => {
      const label = metric.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase()).trim();
      const values = history.map((h) => {
        const val = (h.metrics as any)[metric];
        return typeof val === 'number' ? val.toFixed(metric === 'technicalDebtHours' ? 2 : 1) : 'N/A';
      });

      const changes = values.map((val, idx) => {
        if (idx === 0) return '—';
        const curr = parseFloat(val);
        const prev = parseFloat(values[idx - 1]);
        if (isNaN(curr) || isNaN(prev)) return '—';
        const diff = curr - prev;
        const direction = diff > 0 ? '📈' : diff < 0 ? '📉' : '→';
        return `${direction} ${Math.abs(diff).toFixed(1)}`;
      });

      return `
        <tr>
          <td><strong>${label}</strong></td>
          ${values.map((v) => `<td class="text-center">${v}</td>`).join('')}
          ${changes.map((c) => `<td class="text-center small">${c}</td>`).join('')}
        </tr>
      `;
    })
    .join('');

  const tokenRows = tokens
    .map((token) => {
      const label = token === 'totalCost' ? 'Total Cost ($)' : token === 'inputTokens' ? 'Input Tokens' : 'Output Tokens';
      const values = history.map((h) => {
        const val = (h.tokens as any)[token];
        if (token === 'totalCost') {
          return typeof val === 'number' ? `$${val.toFixed(4)}` : 'N/A';
        }
        return typeof val === 'number' ? val.toLocaleString() : 'N/A';
      });

      const changes = values.map((val, idx) => {
        if (idx === 0) return '—';
        const currStr = val.replace(/[^0-9.]/g, '');
        const prevStr = values[idx - 1].replace(/[^0-9.]/g, '');
        const curr = parseFloat(currStr);
        const prev = parseFloat(prevStr);
        if (isNaN(curr) || isNaN(prev)) return '—';
        const diff = curr - prev;
        const direction = diff > 0 ? '📈' : diff < 0 ? '📉' : '→';
        return `${direction} ${Math.abs(diff).toFixed(0)}`;
      });

      return `
        <tr>
          <td><strong>${label}</strong></td>
          ${values.map((v) => `<td class="text-center">${v}</td>`).join('')}
          ${changes.map((c) => `<td class="text-center small">${c}</td>`).join('')}
        </tr>
      `;
    })
    .join('');

  const headers = history.map((h, idx) => `<th class="text-center">Eval #${h.evaluationNumber}</th>`).join('');
  const changeHeaders = history
    .slice(1)
    .map((h, idx) => `<th class="text-center text-muted small">vs Eval #${idx + 1}</th>`)
    .join('');

  return `
    <div class="card mb-4">
      <div class="card-header bg-info text-white">
        <h5 class="mb-0">📊 Evaluation History (${history.length} evaluations)</h5>
      </div>
      <div class="card-body">
        <h6 class="mb-3">Metrics Evolution</h6>
        <div class="table-responsive">
          <table class="table table-sm table-hover">
            <thead class="table-light">
              <tr>
                <th>Metric</th>
                ${headers}
                ${changeHeaders}
              </tr>
            </thead>
            <tbody>
              ${metricRows}
            </tbody>
          </table>
        </div>

        <h6 class="mb-3 mt-4">Token Usage & Cost Evolution</h6>
        <div class="table-responsive">
          <table class="table table-sm table-hover">
            <thead class="table-light">
              <tr>
                <th>Metric</th>
                ${headers}
                ${changeHeaders}
              </tr>
            </thead>
            <tbody>
              ${tokenRows}
            </tbody>
          </table>
        </div>

        <h6 class="mb-3 mt-4">Convergence Scores</h6>
        <div class="row">
          ${history
            .map(
              (h, idx) => `
            <div class="col-md-3 mb-2">
              <div class="p-2 bg-light rounded text-center">
                <small class="text-muted d-block">Eval #${h.evaluationNumber}</small>
                <strong class="text-primary">${(h.convergenceScore * 100).toFixed(0)}%</strong>
              </div>
            </div>
          `
            )
            .join('')}
        </div>
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
  metadata?: { commitHash?: string; timestamp?: string; commitAuthor?: string; commitMessage?: string; commitDate?: string }
) {
  const groupedResults = groupResultsByAgent(results);
  const metricEvolution = calculateMetricEvolution(groupedResults);
  const comprehensiveMetricsHtml = buildMetricsTable(groupedResults);

  // Load and generate evaluation history
  const outputDir = path.dirname(outputPath);
  const evaluationHistory = loadEvaluationHistory(outputDir);
  const historyHtml = generateHistoryHtml(evaluationHistory);

  // Aggregate final pillar scores
  const finalPillarScores: Record<string, { value: number; agent: string }> = {};
  groupedResults.forEach((evaluations, agentName) => {
    const latestEval = evaluations[evaluations.length - 1];
    if (latestEval.metrics) {
      Object.entries(latestEval.metrics).forEach(([metric, value]) => {
        finalPillarScores[metric] = { value, agent: agentName };
      });
    }
  });

  // Generate 7-Pillar Summary Card
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
          ${Object.entries(finalPillarScores).map(([metric, data]) => {
    const label = metric.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase()).trim();
    let badgeColor = 'secondary';
    let icon = '📊';

    // Determine color and icon based on metric type
    if (metric.includes('Quality') || metric.includes('Coverage') || metric.includes('Impact')) {
      badgeColor = data.value >= 7 ? 'success' : data.value >= 4 ? 'warning' : 'danger';
      icon = data.value >= 7 ? '✅' : data.value >= 4 ? '⚠️' : '❌';
    } else if (metric.includes('Complexity')) {
      badgeColor = data.value <= 3 ? 'success' : data.value <= 6 ? 'warning' : 'danger';
      icon = data.value <= 3 ? '✅' : data.value <= 6 ? '⚠️' : '❌';
    } else if (metric.includes('Debt')) {
      badgeColor = data.value <= 0 ? 'success' : data.value <= 4 ? 'warning' : 'danger';
      icon = data.value <= 0 ? '✅' : data.value <= 4 ? '⚠️' : '❌';
    }

    return `
              <div class="col-md-6 mb-3">
                <div class="d-flex justify-content-between align-items-center p-3 bg-light rounded">
                  <div>
                    <strong>${icon} ${label}</strong>
                    <br>
                    <small class="text-muted">by ${data.agent}</small>
                  </div>
                  <h3 class="mb-0">
                    <span class="badge bg-${badgeColor}">${data.value}</span>
                  </h3>
                </div>
              </div>
            `;
  }).join('')}
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
              ${latestEval.metrics ? Object.entries(latestEval.metrics).map(([key, value]) => {
      const label = key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase()).trim();
      return `<span class="badge bg-${latestEval.color} me-2">${label}: ${value}</span>`;
    }).join('') : '<em class="text-muted">No metrics</em>'}
            </div>
            
            <h6 class="text-${latestEval.color} mb-2">💭 Final Assessment</h6>
            <p class="small">${latestEval.summary.substring(0, 200)}${latestEval.summary.length > 200 ? '...' : ''}</p>
            
            ${latestEval.concernsRaised.length > 0 ? `
              <h6 class="text-danger mb-2">⚠️ Concerns</h6>
              <ul class="small">
                ${latestEval.concernsRaised.map(concern => `<li>${concern}</li>`).join('')}
              </ul>
            ` : ''}
            
            <button class="btn btn-sm btn-outline-${latestEval.color}" onclick="showAgentDetails('${agentName}')">
              View Full Analysis →
            </button>
          </div>
        </div>
      </div>
    `;
  });
  agentCardsHtml += '</div>';

  // Generate Conversation Timeline
  let timelineHtml = '<div class="timeline">';
  const allEvaluations: AgentEvaluation[] = [];
  groupedResults.forEach(evals => allEvaluations.push(...evals));

  // Sort by round first, then by agent
  allEvaluations.sort((a, b) => {
    if (a.round !== b.round) return a.round - b.round;
    return a.agentName.localeCompare(b.agentName);
  });

  let currentRound = 0;
  allEvaluations.forEach(evaluation => {
    if (evaluation.round !== currentRound) {
      currentRound = evaluation.round;
      timelineHtml += `
        <div class="timeline-round">
          <h4 class="text-center mb-4">
            <span class="badge bg-dark">Round ${currentRound}</span>
          </h4>
        </div>
      `;
    }

    timelineHtml += `
      <div class="timeline-item border-${evaluation.color}" data-agent="${evaluation.agentName}">
        <div class="timeline-marker bg-${evaluation.color}">
          <span style="font-size: 1.5rem;">${evaluation.icon}</span>
        </div>
        <div class="timeline-content card border-${evaluation.color}">
          <div class="card-header bg-${evaluation.color} bg-opacity-10">
            <strong>${evaluation.agentName}</strong>
            ${evaluation.referencesTo.length > 0 ? `
              <span class="ms-2 small text-muted">
                💬 References: ${evaluation.referencesTo.join(', ')}
              </span>
            ` : ''}
          </div>
          <div class="card-body">
            <p class="mb-2">${evaluation.summary}</p>
            ${evaluation.metrics ? `
              <div class="mt-2">
                ${Object.entries(evaluation.metrics).map(([key, value]) => {
      const label = key.replace(/([A-Z])/g, ' $1').trim();
      return `<span class="badge bg-${evaluation.color} bg-opacity-75 me-1">${label}: ${value}</span>`;
    }).join('')}
              </div>
            ` : ''}
          </div>
        </div>
      </div>
    `;
  });
  timelineHtml += '</div>';

  // Determine max rounds from evaluations
  const maxRound = Math.max(...Array.from(groupedResults.values()).flatMap(evals => evals.map(e => e.round)));

  // Generate dynamic round headers
  const roundHeaders = Array.from({ length: maxRound }, (_, i) => `<th>Round ${i + 1}</th>`).join('\n              ');

  // Generate Metric Evolution Table
  const evolutionHtml = `
    <div class="card mb-4 shadow-sm">
      <div class="card-header bg-dark text-white">
        <h5 class="mb-0">📈 Metric Evolution Across Rounds</h5>
      </div>
      <div class="card-body">
        <table class="table table-hover">
          <thead>
            <tr>
              <th>Metric</th>
              ${roundHeaders}
              <th>Change</th>
            </tr>
          </thead>
          <tbody>
            ${metricEvolution.map(evolution => {
    // Get values for all rounds dynamically
    const roundValues = Array.from({ length: maxRound }, (_, i) =>
      evolution.rounds.get(i + 1)
    );
    const roundCells = roundValues.map(val => `<td>${val !== undefined ? val : '-'}</td>`).join('\n                ');

    // Calculate change between first and last round
    const firstValue = roundValues.find(v => v !== undefined);
    const lastValue = [...roundValues].reverse().find(v => v !== undefined);
    let changeCell = '<span class="text-muted">No change</span>';

    if (firstValue !== undefined && lastValue !== undefined && firstValue !== lastValue) {
      const diff = lastValue - firstValue;
      const arrow = diff > 0 ? '↑' : '↓';
      const badgeClass = diff > 0 ? 'bg-success' : 'bg-info';
      changeCell = `<span class="badge ${badgeClass}">${arrow} ${Math.abs(diff).toFixed(2)}</span>`;
    }

    return `
              <tr class="${evolution.changed ? 'table-warning' : ''}">
                <td><strong>${evolution.metric.replace(/([A-Z])/g, ' $1').trim()}</strong></td>
                ${roundCells}
                <td>${changeCell}</td>
              </tr>`;
  }).join('')}
          </tbody>
        </table>
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
      margin: 40px 0 20px 0;
    }
    .timeline-item {
      position: relative;
      margin-bottom: 30px;
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
    }
    .timeline-content {
      animation: slideIn 0.3s ease-out;
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
    ${metadata?.commitHash || metadata?.commitAuthor ? `
    <div class="card mb-4 shadow-sm border-primary">
      <div class="card-header bg-primary text-white">
        <h5 class="mb-0">
          <span class="me-2">📝</span>
          Commit Overview
        </h5>
      </div>
      <div class="card-body">
        <div class="row">
          ${metadata?.commitHash ? `
          <div class="col-md-6 mb-3">
            <strong>📌 Commit Hash:</strong><br>
            <code class="d-inline-block mt-1 px-2 py-1 bg-light rounded">${metadata.commitHash}</code>
          </div>
          ` : ''}
          ${metadata?.commitAuthor ? `
          <div class="col-md-6 mb-3">
            <strong>👤 Author:</strong><br>
            <span class="d-inline-block mt-1">${metadata.commitAuthor}</span>
          </div>
          ` : ''}
          ${metadata?.commitDate ? `
          <div class="col-md-6 mb-3">
            <strong>📅 Date:</strong><br>
            <span class="d-inline-block mt-1">${new Date(metadata.commitDate).toLocaleString()}</span>
          </div>
          ` : ''}
          ${metadata?.commitMessage ? `
          <div class="col-12 mb-3">
            <strong>💬 Commit Message:</strong><br>
            <div class="mt-2 p-3 bg-light rounded" style="white-space: pre-wrap; font-family: 'Courier New', monospace; font-size: 0.9rem;">${metadata.commitMessage}</div>
          </div>
          ` : ''}
        </div>
      </div>
    </div>
    ` : ''}

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
      ${evaluationHistory.length > 0 ? `
      <li class="nav-item">
        <button class="nav-link" data-bs-toggle="tab" data-bs-target="#history">
          📈 Evaluation History
        </button>
      </li>
      ` : ''}
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
          Follow the discussion between agents across ${Math.max(...allEvaluations.map(e => e.round))} rounds. 
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

      ${evaluationHistory.length > 0 ? `
      <!-- Evaluation History Tab -->
      <div class="tab-pane fade" id="history">
        <h2 class="mb-4">📈 Evaluation History & Comparisons</h2>
        <p class="text-muted mb-4">
          Track how metrics and costs have changed across multiple evaluations of this commit.
          This helps identify consistency, model drift, and cost optimization opportunities.
        </p>
        ${historyHtml}
      </div>
      ` : ''}
    </div>

    <div class="text-center mt-5 pt-4 border-top">
      <small class="text-muted">
        Generated by <strong>Commit Evaluator</strong> with LangGraph Multi-Agent System
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
