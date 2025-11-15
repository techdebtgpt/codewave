/**
 * Centralized Metric Definitions for All Agents
 *
 * This file contains the comprehensive, score-level metric guidelines that all agents use.
 * These are the source of truth - they're shared across all 5 agent roles since the
 * evaluation criteria are consistent (only the weights/expertise differ by role).
 *
 * Each metric has:
 * - name: Display name for the metric
 * - description: What this metric measures
 * - scale: The scoring scale used
 * - guidelines: Score-level guidance (9-10, 7-8, etc.)
 * - canBeNull: Whether agents can return null for this metric
 * - nullGuidance: Explanation of when to return null
 */

export interface MetricGuidelinesSet {
  name: string;
  description: string;
  scale: string;
  guidelines: Record<string, string>;
  canBeNull: boolean;
  nullGuidance: string;
}

export const AGENT_METRIC_DEFINITIONS: Record<string, MetricGuidelinesSet> = {
  functionalImpact: {
    name: 'Functional Impact',
    description: 'User-facing impact and business value of the implementation',
    scale: '1-10 scale (higher = more impact)',
    guidelines: {
      '9-10':
        'Critical/Major: Core feature affecting many users, critical business value, major revenue/retention impact',
      '7-8':
        'High: Important feature with broad user base, significant business value, noticeable improvement',
      '5-6':
        'Moderate: Feature or improvement affecting some users, moderate business impact, incremental value',
      '3-4':
        'Low-Moderate: Minor feature or improvement, limited user reach, small business impact',
      '1-2':
        'Minimal: Internal change, refactoring, infrastructure, minimal/no direct user-facing impact',
    },
    canBeNull: true,
    nullGuidance:
      'Return null if the diff shows only infrastructure/tooling changes with no clear user-facing impact',
  },

  idealTimeHours: {
    name: 'Ideal Time Hours',
    description:
      'How long this change SHOULD have taken ideally with perfect knowledge, no blockers, and optimal conditions',
    scale: 'Hours (0.5-160+)',
    guidelines: {
      '80-160h+':
        'Very large architectural changes, complete system redesigns, major multi-component features',
      '40-80h':
        'Large features requiring extensive design, significant architectural changes across multiple areas',
      '16-40h':
        'Moderate features with notable complexity, multiple components/services affected, substantial testing needed',
      '5-16h': 'Medium-sized features or improvements, some complexity, a few components affected',
      '0.5-5h':
        'Small changes, bug fixes, simple features with clear/straightforward implementation path',
    },
    canBeNull: true,
    nullGuidance:
      'Return null if the scope is unclear or requirements are not evident from the diff',
  },

  testCoverage: {
    name: 'Test Coverage',
    description: 'Quality and extent of test automation - both quantity and quality of tests',
    scale: '1-10 scale (higher = better coverage)',
    guidelines: {
      '9-10':
        'Exceptional: Comprehensive test suite (unit, integration, e2e), all edge cases, test utilities, mocks/fixtures, high maintainability',
      '7-8':
        'Good: Solid test coverage with unit and integration tests, most edge cases covered, good test quality and structure',
      '5-6':
        'Adequate: Basic happy-path tests, some edge cases covered, acceptable test quality, could be more comprehensive',
      '3-4':
        'Limited: Minimal tests present, mostly happy-path only, missing important cases, test quality could be improved',
      '1-2':
        'Poor/None: No tests or very minimal tests, brittle/low-value tests, critical gaps in coverage',
    },
    canBeNull: true,
    nullGuidance:
      'Return null if no test files are visible in the diff and you cannot infer test quality',
  },

  codeQuality: {
    name: 'Code Quality',
    description: 'Code cleanliness, adherence to best practices, maintainability, and readability',
    scale: '1-10 scale (higher = better quality)',
    guidelines: {
      '9-10':
        'Excellent: Extremely clean, well-structured, follows SOLID/DRY principles, excellent documentation, exemplary practices',
      '7-8':
        'Good: Clean code, good structure, follows most best practices, adequate documentation, maintainable',
      '5-6':
        'Acceptable: Decent quality, some minor issues or shortcuts, could be improved but functional and understandable',
      '3-4':
        'Below Average: Notable quality issues, some code smells, inconsistent practices, needs refactoring',
      '1-2':
        'Poor: Quick-and-dirty implementation, major code smells, hard to maintain/understand, significant quality issues',
    },
    canBeNull: false,
    nullGuidance: 'Should not be null - all roles can assess code quality from diff',
  },

  codeComplexity: {
    name: 'Code Complexity',
    description:
      'Cognitive complexity and architectural complexity of the implementation (LOWER score is better)',
    scale: '1-10 scale (LOWER is better - 1 = simple, 10 = very complex)',
    guidelines: {
      '1-2':
        'Very Simple: Straightforward logic, linear flow, minimal dependencies, easy to understand at a glance',
      '3-4':
        'Simple: Clear logic with some conditionals, low coupling, understandable without much effort',
      '5-6':
        'Moderate: Some branching/nesting, moderate coupling, requires focus to understand, manageable complexity',
      '7-8':
        'Complex: Significant nesting/branching, multiple interdependencies, requires careful study to understand',
      '9-10':
        'Very Complex: Deep nesting, many branches, intricate logic, heavy interdependencies, difficult to comprehend',
    },
    canBeNull: false,
    nullGuidance: 'Should not be null - all roles can assess complexity from diff structure',
  },

  actualTimeHours: {
    name: 'Actual Time Hours',
    description:
      'How much time was ACTUALLY spent implementing this change based on diff scope, commit metadata, and code volume',
    scale: 'Hours (0.5-160+)',
    guidelines: {
      '80-160h+':
        'Very large implementation, massive code changes, many files/services, extended development period',
      '40-80h':
        'Large effort with substantial code changes across many files/components, significant time investment',
      '16-40h':
        'Considerable implementation, moderate-to-large scope, multiple components modified, notable effort',
      '5-16h':
        'Medium implementation, several files changed, moderate scope, reasonable time spent',
      '0.5-5h': 'Quick changes, small scope, few files touched, minimal time required',
    },
    canBeNull: true,
    nullGuidance:
      'Return null if the diff scope is ambiguous or commit metadata provides no time clues',
  },

  technicalDebtHours: {
    name: 'Technical Debt Hours',
    description:
      'Technical debt introduced (positive values) or paid down (negative values), measured in estimated future maintenance hours',
    scale: 'Hours (can be negative, typically -40 to +40)',
    guidelines: {
      '+30 to +40h':
        'Major debt introduced - significant shortcuts, many TODOs, maintainability severely compromised, major future rework needed',
      '+15 to +30h':
        'Substantial debt - notable shortcuts taken, multiple areas need future attention, maintainability impacted',
      '+5 to +15h':
        'Moderate debt - some shortcuts or suboptimal patterns, minor future work needed, acceptable for now',
      '-5 to +5h':
        'Near-neutral - minimal debt introduced or paid down, slight shortcuts or minor cleanup',
      '-40 to -5h':
        'Major cleanup - significant refactoring, eliminated legacy code, greatly improved maintainability, debt paid down',
    },
    canBeNull: true,
    nullGuidance:
      'Return null if you cannot determine whether shortcuts were taken or debt was addressed',
  },

  debtReductionHours: {
    name: 'Debt Reduction Hours',
    description:
      'How much existing technical debt this commit REMOVES or FIXES through refactoring, cleanup, or improvements',
    scale: 'Hours (0-40, higher = more debt removed)',
    guidelines: {
      '20-40h':
        'Major debt removal - significant refactoring, eliminates multiple legacy patterns, major cleanup, substantially improved maintainability',
      '10-20h':
        'Substantial debt removal - notable refactoring effort, removes multiple technical issues, meaningful improvement',
      '5-10h':
        'Moderate debt removal - some refactoring, addresses specific technical issues, incremental improvement',
      '1-5h':
        'Minor debt removal - small cleanup or improvement, fixes specific issues, limited scope',
      '0h': 'No debt reduction - commit focuses on new features or fixes, does not address existing technical debt',
    },
    canBeNull: true,
    nullGuidance:
      'Return null if unclear whether commit is a refactoring or debt-reduction-focused effort',
  },
};

/**
 * Helper function to get metric definition by name
 */
export function getMetricDefinition(metricName: string): MetricGuidelinesSet | undefined {
  return AGENT_METRIC_DEFINITIONS[metricName];
}

/**
 * Helper function to get all metric names
 */
export function getAllMetricNames(): string[] {
  return Object.keys(AGENT_METRIC_DEFINITIONS);
}

/**
 * Helper function to get metric names that can be null
 */
export function getNullableMetricNames(): string[] {
  return Object.entries(AGENT_METRIC_DEFINITIONS)
    .filter(([_, def]) => def.canBeNull)
    .map(([name]) => name);
}

/**
 * Helper function to get metric names that cannot be null
 */
export function getRequiredMetricNames(): string[] {
  return Object.entries(AGENT_METRIC_DEFINITIONS)
    .filter(([_, def]) => !def.canBeNull)
    .map(([name]) => name);
}
