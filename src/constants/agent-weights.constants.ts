// src/constants/agent-weights.constants.ts
// Agent Expertise Weights for Weighted Scoring
//
// Each agent provides scores for all 7 pillars, but with different confidence levels.
// Weights are NORMALIZED per pillar (sum to 1.0 across all agents).
//
// Primary expertise (~40-45%): Agent's specialized area
// Secondary expertise (~15-20%): Related areas where agent has insight
// Tertiary expertise (~8-13%): Areas where agent has limited but valuable perspective

/**
 * The 7 conceptual evaluation pillars
 *
 * Note: We collect 8 raw metrics from agents (including both technicalDebtHours
 * and debtReductionHours separately), but present 7 pillars to users where the
 * 7th pillar is netDebt (calculated as technicalDebtHours - debtReductionHours).
 *
 * All agents MUST return scores for all 8 raw metrics.
 */
export const SEVEN_PILLARS = [
  'functionalImpact',
  'idealTimeHours',
  'testCoverage',
  'codeQuality',
  'codeComplexity',
  'actualTimeHours',
  'technicalDebtHours',
  'debtReductionHours',
] as const;

export type PillarName = (typeof SEVEN_PILLARS)[number];

export interface AgentWeights {
  functionalImpact: number;
  idealTimeHours: number;
  testCoverage: number;
  codeQuality: number;
  codeComplexity: number;
  actualTimeHours: number;
  technicalDebtHours: number;
  debtReductionHours: number;
}

export const AGENT_EXPERTISE_WEIGHTS: Record<string, AgentWeights> = {
  'business-analyst': {
    functionalImpact: 0.435, // PRIMARY (43.5%) - Business impact expert
    idealTimeHours: 0.417, // PRIMARY (41.7%) - Requirements estimation expert
    testCoverage: 0.12, // TERTIARY (12%) - Limited testing perspective
    codeQuality: 0.083, // TERTIARY (8.3%) - Limited code perspective
    codeComplexity: 0.083, // TERTIARY (8.3%) - Limited complexity insight
    actualTimeHours: 0.136, // TERTIARY (13.6%) - Observes implementation time
    technicalDebtHours: 0.13, // TERTIARY (13%) - Limited debt assessment
    debtReductionHours: 0.13, // TERTIARY (13%) - Limited debt reduction insight
  },
  sdet: {
    functionalImpact: 0.13, // TERTIARY (13%) - Validates test automation strategy
    idealTimeHours: 0.083, // TERTIARY (8.3%) - Limited estimation insight
    testCoverage: 0.4, // PRIMARY (40%) - Test automation & framework expert
    codeQuality: 0.167, // SECONDARY (16.7%) - Reviews test code quality
    codeComplexity: 0.125, // TERTIARY (12.5%) - Understands test framework complexity
    actualTimeHours: 0.091, // TERTIARY (9.1%) - Limited implementation insight
    technicalDebtHours: 0.13, // TERTIARY (13%) - Identifies test automation debt
    debtReductionHours: 0.13, // TERTIARY (13%) - Limited test debt reduction insight
  },
  'developer-author': {
    functionalImpact: 0.13, // TERTIARY (13%) - Implements features
    idealTimeHours: 0.167, // SECONDARY (16.7%) - Estimates effort
    testCoverage: 0.12, // TERTIARY (12%) - Writes tests
    codeQuality: 0.125, // TERTIARY (12.5%) - Authors code
    codeComplexity: 0.167, // SECONDARY (16.7%) - Implements complexity
    actualTimeHours: 0.455, // PRIMARY (45.5%) - Knows actual time spent
    technicalDebtHours: 0.13, // TERTIARY (13%) - May introduce debt
    debtReductionHours: 0.13, // TERTIARY (13%) - Limited debt reduction perspective
  },
  'senior-architect': {
    functionalImpact: 0.174, // SECONDARY (17.4%) - Designs architecture
    idealTimeHours: 0.208, // SECONDARY (20.8%) - Architectural estimation
    testCoverage: 0.16, // SECONDARY (16%) - Designs testable systems
    codeQuality: 0.208, // SECONDARY (20.8%) - Sets quality standards
    codeComplexity: 0.417, // PRIMARY (41.7%) - Complexity expert
    actualTimeHours: 0.182, // SECONDARY (18.2%) - Tracks team velocity
    technicalDebtHours: 0.435, // PRIMARY (43.5%) - Technical debt expert
    debtReductionHours: 0.435, // PRIMARY (43.5%) - Debt reduction & refactoring expert
  },
  'developer-reviewer': {
    functionalImpact: 0.13, // TERTIARY (13%) - Reviews functionality
    idealTimeHours: 0.125, // TERTIARY (12.5%) - Limited estimation insight
    testCoverage: 0.2, // SECONDARY (20%) - Reviews test quality
    codeQuality: 0.417, // PRIMARY (41.7%) - Code quality expert
    codeComplexity: 0.208, // SECONDARY (20.8%) - Reviews complexity
    actualTimeHours: 0.136, // TERTIARY (13.6%) - Observes PR scope
    technicalDebtHours: 0.174, // SECONDARY (17.4%) - Identifies code debt
    debtReductionHours: 0.174, // SECONDARY (17.4%) - Identifies debt reduction quality
  },
};

// Validation: Each pillar's weights should sum to 1.0 (allow 0.001 tolerance for rounding)
export function validateWeights(): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const pillars: (keyof AgentWeights)[] = [
    'functionalImpact',
    'idealTimeHours',
    'testCoverage',
    'codeQuality',
    'codeComplexity',
    'actualTimeHours',
    'technicalDebtHours',
    'debtReductionHours',
  ];

  for (const pillar of pillars) {
    const sum = Object.values(AGENT_EXPERTISE_WEIGHTS).reduce(
      (total, weights) => total + weights[pillar],
      0
    );

    if (Math.abs(sum - 1.0) > 0.001) {
      errors.push(`${pillar}: weights sum to ${sum.toFixed(3)} (expected 1.0)`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Map display names to technical role keys
 * This handles variations in agent naming across the system
 */
export function normalizeAgentName(agentName: string): string {
  const normalized = agentName.toLowerCase().trim();

  // Map display names to technical keys
  const nameMap: Record<string, string> = {
    'business analyst': 'business-analyst',
    sdet: 'sdet',
    'sdet (test automation engineer)': 'sdet',
    'test automation engineer': 'sdet',
    'developer (author)': 'developer-author',
    'developer author': 'developer-author',
    'senior architect': 'senior-architect',
    'developer reviewer': 'developer-reviewer',
    'developer (reviewer)': 'developer-reviewer',
  };

  // Check if we have a mapping
  if (nameMap[normalized]) {
    return nameMap[normalized];
  }

  // Try to match technical keys directly
  if (AGENT_EXPERTISE_WEIGHTS[normalized]) {
    return normalized;
  }

  // If agentName is already a technical key, return as-is
  if (AGENT_EXPERTISE_WEIGHTS[agentName]) {
    return agentName;
  }

  return agentName; // Return original if no mapping found
}

// Helper: Get agent's weight for a specific pillar
export function getAgentWeight(agentName: string, pillar: PillarName): number {
  // Normalize agent name before lookup
  const normalizedName = normalizeAgentName(agentName);
  const weights = AGENT_EXPERTISE_WEIGHTS[normalizedName];

  if (!weights) {
    console.warn(`Unknown agent: ${agentName} (normalized: ${normalizedName}), using equal weight`);
    return 0.2; // Fallback: equal weight across 5 agents
  }
  return weights[pillar];
}

// Helper: Get all agents' weights for a specific pillar
export function getPillarWeights(pillar: PillarName): Record<string, number> {
  const result: Record<string, number> = {};
  for (const [agentName, weights] of Object.entries(AGENT_EXPERTISE_WEIGHTS)) {
    result[agentName] = weights[pillar];
  }
  return result;
}

// Weighted average calculation
export function calculateWeightedAverage(
  scores: Array<{ agentName: string; score: number | null }>,
  pillar: PillarName
): number | null {
  // Filter out null values before calculating average
  const validScores = scores.filter(
    (s): s is { agentName: string; score: number } => s.score !== null
  );

  // If all agents returned null, return null
  if (validScores.length === 0) {
    console.warn(`All agents returned null for pillar ${pillar}, cannot calculate average`);
    return null;
  }

  let weightedSum = 0;
  let totalWeight = 0;

  for (const { agentName, score } of validScores) {
    // Normalize agent name before getting weight
    const normalizedName = normalizeAgentName(agentName);
    const weight = getAgentWeight(normalizedName, pillar);
    weightedSum += score * weight;
    totalWeight += weight;
  }

  // Avoid division by zero
  if (totalWeight === 0) {
    console.warn(`Total weight is 0 for pillar ${pillar}, returning simple average`);
    return validScores.reduce((sum, s) => sum + s.score, 0) / validScores.length;
  }

  return weightedSum / totalWeight;
}
