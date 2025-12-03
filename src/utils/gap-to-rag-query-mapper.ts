/**
 * Gap-to-RAG Query Mapper
 * Converts identified metric gaps into targeted RAG queries for semantic search
 *
 * This enables agents to ask specific questions based on what information they're missing
 * rather than using generic pre-defined queries.
 */

import { getMetricDefinition } from '../constants/metric-definitions.constants';

export interface RAGQuery {
  q: string; // Query text for semantic search
  topK: number; // Number of results to retrieve
  store: 'diff' | 'docs'; // Which vector store to query
  purpose: string; // Why this query is being made (for debugging/logging)
}

export type GapType = 'missing' | 'null' | 'reasoning';

/**
 * Extract pillar name and gap type from a gap string
 * Examples:
 *   "CRITICAL: Missing PRIMARY metric functionalImpact" → { pillar: 'functionalImpact', type: 'missing' }
 *   "PRIMARY metric testCoverage null but not justified" → { pillar: 'testCoverage', type: 'null' }
 *   "PRIMARY metric codeQuality score needs justification" → { pillar: 'codeQuality', type: 'reasoning' }
 */
function parseGap(gap: string): { pillar: string; type: GapType } | null {
  // Match pillar names from known metrics
  const pillars = [
    'functionalImpact',
    'idealTimeHours',
    'testCoverage',
    'codeQuality',
    'codeComplexity',
    'actualTimeHours',
    'technicalDebtHours',
  ];

  for (const pillar of pillars) {
    if (gap.includes(pillar)) {
      if (gap.includes('Missing')) return { pillar, type: 'missing' };
      if (gap.includes('null but not justified')) return { pillar, type: 'null' };
      if (gap.includes('needs justification') || gap.includes('should be explained')) {
        return { pillar, type: 'reasoning' };
      }
    }
  }

  return null;
}

/**
 * Map a specific metric gap to targeted RAG queries
 */
function mapGapToQueries(pillar: string, type: GapType): RAGQuery[] {
  const definition = getMetricDefinition(pillar);
  if (!definition) return [];

  const queries: RAGQuery[] = [];

  // Pillar-specific query strategies
  switch (pillar) {
    case 'functionalImpact':
      if (type === 'missing' || type === 'null') {
        queries.push(
          {
            q: 'What user-facing features, UI changes, or business logic were modified?',
            topK: 5,
            store: 'diff',
            purpose: `assess-functional-impact-${type}`,
          },
          {
            q: 'Show API endpoints, public interfaces, or user workflows affected',
            topK: 3,
            store: 'diff',
            purpose: `find-user-facing-changes-${type}`,
          }
        );
      } else if (type === 'reasoning') {
        queries.push({
          q: 'What are the business requirements or user stories for these changes?',
          topK: 3,
          store: 'diff',
          purpose: 'justify-functional-impact',
        });
      }
      break;

    case 'idealTimeHours':
      if (type === 'missing' || type === 'null') {
        queries.push(
          {
            q: 'What is the scope of implementation? How many components were changed?',
            topK: 4,
            store: 'diff',
            purpose: `estimate-scope-${type}`,
          },
          {
            q: 'Are there architectural changes, database migrations, or complex refactoring?',
            topK: 3,
            store: 'diff',
            purpose: `assess-complexity-for-estimation-${type}`,
          }
        );
      } else if (type === 'reasoning') {
        queries.push({
          q: 'What design decisions or implementation challenges justify the estimated time?',
          topK: 3,
          store: 'diff',
          purpose: 'justify-ideal-time',
        });
      }
      break;

    case 'testCoverage':
      if (type === 'missing' || type === 'null') {
        queries.push(
          {
            q: 'Show test files, test utilities, or testing framework changes',
            topK: 5,
            store: 'diff',
            purpose: `find-tests-${type}`,
          },
          {
            q: 'Are there unit tests, integration tests, or end-to-end tests added?',
            topK: 3,
            store: 'diff',
            purpose: `assess-test-types-${type}`,
          },
          {
            q: 'What edge cases, error handling, or validation tests were added?',
            topK: 3,
            store: 'diff',
            purpose: `find-edge-case-tests-${type}`,
          }
        );
      } else if (type === 'reasoning') {
        queries.push({
          q: 'What test coverage metrics, testing patterns, or quality measures justify the score?',
          topK: 3,
          store: 'diff',
          purpose: 'justify-test-coverage',
        });
      }
      break;

    case 'codeQuality':
      if (type === 'missing' || type === 'null') {
        queries.push(
          {
            q: 'Show code structure, design patterns, and adherence to SOLID principles',
            topK: 4,
            store: 'diff',
            purpose: `assess-code-design-${type}`,
          },
          {
            q: 'Are there code smells, duplication, or maintainability issues?',
            topK: 3,
            store: 'diff',
            purpose: `find-quality-issues-${type}`,
          },
          {
            q: 'What documentation, comments, or type safety measures were added?',
            topK: 3,
            store: 'diff',
            purpose: `find-quality-improvements-${type}`,
          }
        );
      } else if (type === 'reasoning') {
        queries.push({
          q: 'What specific quality metrics, design principles, or best practices justify the score?',
          topK: 3,
          store: 'diff',
          purpose: 'justify-code-quality',
        });
      }
      break;

    case 'codeComplexity':
      if (type === 'missing' || type === 'null') {
        queries.push(
          {
            q: 'Show nested loops, conditional branches, and control flow complexity',
            topK: 5,
            store: 'diff',
            purpose: `assess-cognitive-complexity-${type}`,
          },
          {
            q: 'What are the module dependencies, coupling, and architectural complexity?',
            topK: 3,
            store: 'diff',
            purpose: `assess-architectural-complexity-${type}`,
          }
        );
      } else if (type === 'reasoning') {
        queries.push({
          q: 'What complexity metrics, cyclomatic complexity, or nesting depth justify the score?',
          topK: 3,
          store: 'diff',
          purpose: 'justify-code-complexity',
        });
      }
      break;

    case 'actualTimeHours':
      if (type === 'missing' || type === 'null') {
        queries.push(
          {
            q: 'What is the total scope: files changed, lines added/removed, components affected?',
            topK: 4,
            store: 'diff',
            purpose: `estimate-actual-time-${type}`,
          },
          {
            q: 'Are there signs of extensive refactoring, debugging, or iteration?',
            topK: 3,
            store: 'diff',
            purpose: `find-time-indicators-${type}`,
          }
        );
      } else if (type === 'reasoning') {
        queries.push({
          q: 'What commit patterns, implementation scope, or complexity indicators justify the time spent?',
          topK: 3,
          store: 'diff',
          purpose: 'justify-actual-time',
        });
      }
      break;

    case 'technicalDebtHours':
      if (type === 'missing' || type === 'null') {
        queries.push(
          {
            q: 'Show TODOs, FIXMEs, quick fixes, or technical shortcuts introduced',
            topK: 5,
            store: 'diff',
            purpose: `find-debt-introduced-${type}`,
          },
          {
            q: 'What legacy code, deprecated patterns, or refactoring opportunities were addressed?',
            topK: 4,
            store: 'diff',
            purpose: `find-debt-paid-${type}`,
          },
          {
            q: 'Are there maintainability improvements, code cleanup, or architecture refactoring?',
            topK: 3,
            store: 'diff',
            purpose: `assess-debt-reduction-${type}`,
          }
        );
      } else if (type === 'reasoning') {
        queries.push({
          q: 'What technical debt indicators, maintenance burden, or future costs justify the score?',
          topK: 3,
          store: 'diff',
          purpose: 'justify-technical-debt',
        });
      }
      break;
  }

  return queries;
}

/**
 * Generate RAG queries from a list of identified gaps
 *
 * This is the main entry point used by agents during refinement.
 *
 * @param gaps - List of gap strings from evaluateAnalysis()
 * @returns Array of targeted RAG queries to help fill information gaps
 */
export function generateRAGQueriesFromGaps(gaps: string[]): RAGQuery[] {
  const queries: RAGQuery[] = [];
  const seenPurposes = new Set<string>(); // Deduplicate queries with same purpose

  for (const gap of gaps) {
    const parsed = parseGap(gap);
    if (!parsed) continue;

    const gapQueries = mapGapToQueries(parsed.pillar, parsed.type);

    // Add queries, deduplicating by purpose
    for (const query of gapQueries) {
      if (!seenPurposes.has(query.purpose)) {
        seenPurposes.add(query.purpose);
        queries.push(query);
      }
    }
  }

  // If no gaps or no queries generated, return empty array
  // Agents should fall back to their default initial queries
  return queries;
}

/**
 * Helper: Get initial queries for an agent's first analysis pass
 * These are broad exploratory queries used before any gaps are identified
 *
 * @param agentRole - The role of the agent (e.g., 'business-analyst', 'sdet')
 * @returns Initial broad RAG queries appropriate for the agent's expertise
 */
export function getInitialQueriesForRole(agentRole: string): RAGQuery[] {
  const roleQueries: Record<string, RAGQuery[]> = {
    'business-analyst': [
      {
        q: 'What user-facing features, business logic, or functional changes were made?',
        topK: 5,
        store: 'diff',
        purpose: 'initial-functional-scan',
      },
      {
        q: 'Show requirements, user stories, or business value indicators',
        topK: 3,
        store: 'diff',
        purpose: 'initial-business-context',
      },
      {
        q: 'What is the scope and complexity of implementation?',
        topK: 3,
        store: 'diff',
        purpose: 'initial-scope-assessment',
      },
    ],
    sdet: [
      {
        q: 'Show all test files, test utilities, and testing framework changes',
        topK: 6,
        store: 'diff',
        purpose: 'initial-test-scan',
      },
      {
        q: 'What test coverage, edge cases, and quality assurance measures exist?',
        topK: 4,
        store: 'diff',
        purpose: 'initial-quality-scan',
      },
    ],
    'developer-author': [
      {
        q: 'What is the full implementation scope: files changed, components affected?',
        topK: 5,
        store: 'diff',
        purpose: 'initial-implementation-scan',
      },
      {
        q: 'Show complexity indicators, refactoring, and debugging patterns',
        topK: 3,
        store: 'diff',
        purpose: 'initial-effort-scan',
      },
    ],
    'senior-architect': [
      {
        q: 'Show architectural changes, design patterns, and system structure',
        topK: 5,
        store: 'diff',
        purpose: 'initial-architecture-scan',
      },
      {
        q: 'What complexity, coupling, and technical debt indicators exist?',
        topK: 4,
        store: 'diff',
        purpose: 'initial-complexity-scan',
      },
      {
        q: 'Are there TODOs, FIXMEs, or maintainability concerns introduced or resolved?',
        topK: 3,
        store: 'diff',
        purpose: 'initial-debt-scan',
      },
    ],
    'developer-reviewer': [
      {
        q: 'Show code quality, design patterns, and adherence to best practices',
        topK: 5,
        store: 'diff',
        purpose: 'initial-quality-review',
      },
      {
        q: 'What code smells, duplication, or maintainability issues exist?',
        topK: 4,
        store: 'diff',
        purpose: 'initial-issues-scan',
      },
      {
        q: 'Show test coverage and quality of test implementations',
        topK: 3,
        store: 'diff',
        purpose: 'initial-test-review',
      },
    ],
  };

  return roleQueries[agentRole] || [];
}
