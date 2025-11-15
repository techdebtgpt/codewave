// src/constants/metric-definitions.constants.ts
// Centralized 7-Pillar Metric Definitions
// These definitions guide agents in scoring and self-evaluation

export interface MetricDefinition {
  name: string;
  description: string;
  scale: string;
  guidelines: Record<string, string>; // Flexible keys: score ranges ('9-10', '7-8', etc.) OR hour ranges ('80-160h+', '40-80h', etc.)
  canBeNull: boolean; // Can this metric be null for some agents?
  nullGuidance: string; // When should this be null?
}

export const METRIC_DEFINITIONS: Record<string, MetricDefinition> = {
  functionalImpact: {
    name: 'Functional Impact',
    description: 'User-facing impact and business value of the implementation',
    scale: '1-10 scale (higher = more impact)',
    guidelines: {
      '9-10': 'Critical/Major: Core feature affecting many users, critical business value, major revenue/retention impact',
      '7-8': 'High: Important feature with broad user base, significant business value, noticeable improvement',
      '5-6': 'Moderate: Feature or improvement affecting some users, moderate business impact, incremental value',
      '3-4': 'Low-Moderate: Minor feature or improvement, limited user reach, small business impact',
      '1-2': 'Minimal: Internal change, refactoring, infrastructure, minimal/no direct user-facing impact',
    },
    canBeNull: true,
    nullGuidance: 'Return null if the diff shows only infrastructure/tooling changes with no clear user-facing impact',
  },
  idealTimeHours: {
    name: 'Ideal Time Hours',
    description: 'How long this change SHOULD have taken ideally with perfect knowledge, no blockers, and optimal conditions',
    scale: 'Hours (0.5-160+)',
    guidelines: {
      '80-160h+': 'Very large architectural changes, complete system redesigns, major multi-component features',
      '40-80h': 'Large features requiring extensive design, significant architectural changes across multiple areas',
      '16-40h': 'Moderate features with notable complexity, multiple components/services affected, substantial testing needed',
      '5-16h': 'Medium-sized features or improvements, some complexity, a few components affected',
      '0.5-5h': 'Small changes, bug fixes, simple features with clear/straightforward implementation path',
    },
    canBeNull: true,
    nullGuidance: 'Return null if the scope is unclear or requirements are not evident from the diff',
  },
  testCoverage: {
    name: 'Test Coverage',
    description: 'Quality and extent of test automation - both quantity and quality of tests',
    scale: '1-10 scale (higher = better coverage)',
    guidelines: {
      '9-10': 'Exceptional: Comprehensive test suite (unit, integration, e2e), all edge cases, test utilities, mocks/fixtures, high maintainability',
      '7-8': 'Good: Solid test coverage with unit and integration tests, most edge cases covered, good test quality and structure',
      '5-6': 'Adequate: Basic happy-path tests, some edge cases covered, acceptable test quality, could be more comprehensive',
      '3-4': 'Limited: Minimal tests present, mostly happy-path only, missing important cases, test quality could be improved',
      '1-2': 'Poor/None: No tests or very minimal tests, brittle/low-value tests, critical gaps in coverage',
    },
    canBeNull: true,
    nullGuidance: 'Return null if no test files are visible in the diff and you cannot infer test quality',
  },
  codeQuality: {
    name: 'Code Quality',
    description: 'Code cleanliness, adherence to best practices, maintainability, and readability',
    scale: '1-10 scale (higher = better quality)',
    guidelines: {
      '9-10': 'Excellent: Extremely clean, well-structured, follows SOLID/DRY principles, excellent documentation, exemplary practices',
      '7-8': 'Good: Clean code, good structure, follows most best practices, adequate documentation, maintainable',
      '5-6': 'Acceptable: Decent quality, some minor issues or shortcuts, could be improved but functional and understandable',
      '3-4': 'Below Average: Notable quality issues, some code smells, inconsistent practices, needs refactoring',
      '1-2': 'Poor: Quick-and-dirty implementation, major code smells, hard to maintain/understand, significant quality issues',
    },
    canBeNull: false, // All agents can assess code quality from the diff
    nullGuidance: 'Should not be null - all roles can assess code quality from diff',
  },
  codeComplexity: {
    name: 'Code Complexity',
    description: 'Cognitive complexity and architectural complexity of the implementation (LOWER score is better)',
    scale: '1-10 scale (LOWER is better - 1 = simple, 10 = very complex)',
    guidelines: {
      '1-2': 'Very Simple: Straightforward logic, linear flow, minimal dependencies, easy to understand at a glance',
      '3-4': 'Simple: Clear logic with some conditionals, low coupling, understandable without much effort',
      '5-6': 'Moderate: Some branching/nesting, moderate coupling, requires focus to understand, manageable complexity',
      '7-8': 'Complex: Significant nesting/branching, multiple interdependencies, requires careful study to understand',
      '9-10': 'Very Complex: Deep nesting, many branches, intricate logic, heavy interdependencies, difficult to comprehend',
    },
    canBeNull: false, // All agents can assess complexity from the diff
    nullGuidance: 'Should not be null - all roles can assess complexity from diff structure',
  },
  actualTimeHours: {
    name: 'Actual Time Hours',
    description: 'How much time was ACTUALLY spent implementing this change based on diff scope, commit metadata, and code volume',
    scale: 'Hours (0.5-160+)',
    guidelines: {
      '80-160h+': 'Very large implementation, massive code changes, many files/services, extended development period',
      '40-80h': 'Large effort with substantial code changes across many files/components, significant time investment',
      '16-40h': 'Considerable implementation, moderate-to-large scope, multiple components modified, notable effort',
      '5-16h': 'Medium implementation, several files changed, moderate scope, reasonable time spent',
      '0.5-5h': 'Quick changes, small scope, few files touched, minimal time required',
    },
    canBeNull: true,
    nullGuidance: 'Return null if the diff scope is ambiguous or commit metadata provides no time clues',
  },
  technicalDebtHours: {
    name: 'Technical Debt Hours',
    description: 'Technical debt introduced (positive values) or paid down (negative values), measured in estimated future maintenance hours',
    scale: 'Hours (can be negative, typically -40 to +40)',
    guidelines: {
      '+30 to +40h': 'Major debt introduced - significant shortcuts, many TODOs, maintainability severely compromised, major future rework needed',
      '+15 to +30h': 'Substantial debt - notable shortcuts taken, multiple areas need future attention, maintainability impacted',
      '+5 to +15h': 'Moderate debt - some shortcuts or suboptimal patterns, minor future work needed, acceptable for now',
      '-5 to +5h': 'Near-neutral - minimal debt introduced or paid down, slight shortcuts or minor cleanup',
      '-40 to -5h': 'Major cleanup - significant refactoring, eliminated legacy code, greatly improved maintainability, debt paid down',
    },
    canBeNull: true,
    nullGuidance: 'Return null if you cannot determine whether shortcuts were taken or debt was addressed',
  },
};

/**
 * Get metric definition for validation and question generation
 */
export function getMetricDefinition(pillar: string): MetricDefinition | undefined {
  return METRIC_DEFINITIONS[pillar];
}

/**
 * Get all required (non-nullable) metrics that must always have a score
 */
export function getRequiredMetrics(): string[] {
  return Object.entries(METRIC_DEFINITIONS)
    .filter(([_, def]) => !def.canBeNull)
    .map(([pillar, _]) => pillar);
}

/**
 * Get guidance text for a specific score value
 * For time-based metrics (idealTimeHours, actualTimeHours, technicalDebtHours),
 * returns all guidelines as they use hour ranges, not score mappings
 */
export function getScoreGuidance(pillar: string, score: number): string {
  const def = METRIC_DEFINITIONS[pillar];
  if (!def) return '';

  // Time-based metrics: return all guidelines (they use hour ranges as keys)
  if (pillar === 'idealTimeHours' || pillar === 'actualTimeHours' || pillar === 'technicalDebtHours') {
    return Object.values(def.guidelines).join('\n');
  }

  // Score-based metrics: map score to appropriate guideline
  if (pillar === 'codeComplexity') {
    // Inverted scale for complexity (lower is better)
    if (score <= 2) return def.guidelines['1-2'];
    if (score <= 4) return def.guidelines['3-4'];
    if (score <= 6) return def.guidelines['5-6'];
    if (score <= 8) return def.guidelines['7-8'];
    return def.guidelines['9-10'];
  } else {
    // Normal scale (higher is better)
    if (score >= 9) return def.guidelines['9-10'];
    if (score >= 7) return def.guidelines['7-8'];
    if (score >= 5) return def.guidelines['5-6'];
    if (score >= 3) return def.guidelines['3-4'];
    return def.guidelines['1-2'];
  }
}
