/**
 * Clarity Evaluator
 *
 * Evaluates the quality and completeness of agent analysis
 * Generates self-questions for gaps in the analysis
 */

/**
 * Clarity evaluation result
 */
export interface ClarityEvaluation {
  /** Clarity score (0-1), where 1 = perfect clarity */
  score: number;
  /** Whether the analysis has sufficient information */
  hasEnoughInfo: boolean;
  /** Self-questions for missing or unclear information */
  selfQuestions: string[];
}

/**
 * Criteria for evaluating analysis clarity
 *
 * Two-layer evaluation:
 * - Layer 1 (Structural): Basic completeness checks
 * - Layer 2 (Quality): Actual reasoning and justification
 */
interface ClarityCriteria {
  // Layer 1: Structural completeness (easy baseline)
  hasSummary: boolean;
  hasDetails: boolean;
  hasMetrics: boolean;
  metricsNotNull: boolean;
  hasReasonableScores: boolean;
  hasConfidence: boolean;

  // Layer 2: Quality & reasoning (forces refinement)
  summaryQuality: boolean; // Summary mentions specific metrics or concerns
  detailsQuality: boolean; // Details show substantive analysis
  metricsJustified: boolean; // Scores are explained/justified in details
}

/**
 * Weights for each clarity criterion
 * Reduced structural weights, increased quality weights to force refinement
 * Total: 1.0
 */
const CLARITY_WEIGHTS: Record<keyof ClarityCriteria, number> = {
  // Layer 1: Structural (40% total)
  hasSummary: 0.1,
  hasDetails: 0.1,
  hasMetrics: 0.1,
  metricsNotNull: 0.05,
  hasReasonableScores: 0.05,
  hasConfidence: 0.0, // Removed from scoring (always present)

  // Layer 2: Quality (60% total)
  summaryQuality: 0.2,
  detailsQuality: 0.25,
  metricsJustified: 0.15,
};

/**
 * Check if summary contains specific metrics values or detailed concerns
 * (not just generic statements like "good code review needed")
 */
function evaluateSummaryQuality(summary: string, _metrics: any): boolean {
  if (!summary || summary.length < 30) {
    return false;
  }

  const lowerSummary = summary.toLowerCase();

  // Check for generic phrases that indicate lack of specificity
  const genericPhrases = [
    'needs review',
    'further analysis',
    'requires improvement',
    'should be evaluated',
  ];
  const isGeneric = genericPhrases.some(
    (phrase) => lowerSummary.includes(phrase) && summary.length < 80
  );

  if (isGeneric) {
    return false; // Too generic
  }

  // Check for specific indicators:
  // 1. Mentions specific metric values (e.g., "8/10", "complexity is", "scores 7")
  const hasMetricValues =
    /\d+[\s]*\/[\s]*10|complexity[\s]*(?:is|of|:)[\s]*\d+|impact[\s]*(?:is|of|:)[\s]*\d+|score[\s]*\d+/i.test(
      summary
    );

  // 2. Mentions specific concerns (refactoring, debt, architecture, performance, etc.)
  const hasSpecificConcerns =
    /refactor|debt|architecture|performance|complexity|maintainability|risk/i.test(summary);

  // 3. References multiple areas (multiple commas, semicolons suggest broader analysis)
  const hasMultiplePoints = (summary.match(/[,;]/g) || []).length >= 2;

  return hasMetricValues || hasSpecificConcerns || hasMultiplePoints;
}

/**
 * Check if details contain substantive analysis
 * (specific file references, complexity patterns, architectural insights)
 */
function evaluateDetailsQuality(details: string, _summary: string): boolean {
  if (!details || details.length < 100) {
    return false; // Too short for substantive analysis
  }

  // Check for substantive indicators:
  // 1. References specific technical concepts
  const hasSubstantiveContent =
    /(?:function|class|method|loop|branch|conditional|exception|error handling|test|mock|interface|abstract|inheritance|encapsulation|cohesion|coupling)/i.test(
      details
    );

  // 2. Contains detailed reasoning (words like "because", "since", "due to")
  const hasReasoning =
    /because|since|due to|therefore|however|moreover|moreover|specifically|notably/i.test(details);

  // 3. Makes specific observations (numbers, file types, patterns)
  const hasSpecificObservations =
    /\d+\s*(?:files?|functions?|classes?|lines?|changes?)|\.(?:ts|js|py|go|java|rs)|nested|cyclomatic|depth|circular/i.test(
      details
    );

  return hasSubstantiveContent && (hasReasoning || hasSpecificObservations);
}

/**
 * Check if metrics are justified in the details
 * For non-null metrics, details should contain reasoning for the scores
 */
function evaluateMetricsJustification(metrics: any, details: string): boolean {
  if (!metrics || !details) {
    return false;
  }

  // Count non-null metrics
  const nonNullMetrics = Object.values(metrics).filter((v) => v !== null && v !== undefined).length;

  if (nonNullMetrics === 0) {
    return false; // No metrics to justify
  }

  // Details should be substantial enough to justify metrics
  const minDetailsLength = Math.min(150, 50 * nonNullMetrics);

  if (details.length < minDetailsLength) {
    return false; // Insufficient detail for justification
  }

  // Check for scoring indicators (e.g., "why complexity is X", "justifies score")
  const hasScoringLogic =
    /(?:complexity|quality|impact|coverage|debt)[\s]*(?:is|=|:|of)[\s]*\d+|score|rated|assessed|evaluated|given|warrant/i.test(
      details
    );

  // Details should demonstrate scoring logic or be substantial enough
  return hasScoringLogic || details.length > minDetailsLength * 1.5;
}

/**
 * Parse JSON safely from LLM output
 */
function parseJSONSafely(output: string): any {
  let cleaned = output.trim();

  // Remove markdown fences
  cleaned = cleaned.replace(/^```(?:json|javascript)?\s*\n?/i, '');
  cleaned = cleaned.replace(/\n?```\s*$/i, '');
  cleaned = cleaned.trim();

  // Find the start of the JSON object
  const jsonStart = cleaned.indexOf('{');
  if (jsonStart === -1) {
    throw new Error('No JSON object found in output');
  }

  // Count braces to find complete JSON
  let braceCount = 0;
  let jsonEnd = -1;

  for (let i = jsonStart; i < cleaned.length; i++) {
    const char = cleaned[i];
    if (char === '{') {
      braceCount++;
    } else if (char === '}') {
      braceCount--;
      if (braceCount === 0) {
        jsonEnd = i;
        break;
      }
    }
  }

  if (jsonEnd === -1) {
    throw new Error('Incomplete JSON object - unmatched braces');
  }

  const jsonStr = cleaned.substring(jsonStart, jsonEnd + 1);
  return JSON.parse(jsonStr);
}

/**
 * Evaluate the clarity of an analysis
 *
 * @param analysisContent The analysis to evaluate (JSON string)
 * @param clarityThreshold Threshold for "enough info" (0-1)
 * @returns Clarity evaluation with score and self-questions
 */
export function evaluateClarity(
  analysisContent: string,
  clarityThreshold: number
): ClarityEvaluation {
  let parsed: any;

  try {
    parsed = parseJSONSafely(analysisContent);
  } catch (error) {
    // If parsing fails, assume very low clarity
    return {
      score: 0.3,
      hasEnoughInfo: false,
      selfQuestions: ['Failed to parse analysis - need to restructure response as valid JSON'],
    };
  }

  // Evaluate criteria
  const summary = parsed.summary ? parsed.summary.trim() : '';
  const details = parsed.details ? parsed.details.trim() : '';
  const metrics = parsed.metrics || {};

  const criteria: ClarityCriteria = {
    // Layer 1: Structural completeness
    hasSummary: !!summary && summary.length > 20,
    hasDetails: !!details && details.length > 50,
    hasMetrics: !!metrics && Object.keys(metrics).length === 7,
    metricsNotNull: metrics && Object.values(metrics).filter((v) => v !== null).length >= 5,
    hasReasonableScores:
      metrics &&
      Object.values(metrics).every(
        (v: any) => v === null || (typeof v === 'number' && v >= 0 && v <= 10)
      ),
    hasConfidence: parsed.confidence !== undefined,

    // Layer 2: Quality & reasoning (NEW - forces refinement)
    summaryQuality: evaluateSummaryQuality(summary, metrics),
    detailsQuality: evaluateDetailsQuality(details, summary),
    metricsJustified: evaluateMetricsJustification(metrics, details),
  };

  // Calculate weighted clarity score
  let score = 0;
  for (const [key, value] of Object.entries(criteria)) {
    if (value) {
      score += CLARITY_WEIGHTS[key as keyof ClarityCriteria];
    }
  }

  // Generate self-questions for missing information
  // Prioritize quality issues (Layer 2) over structural issues (Layer 1)
  const questions: string[] = [];

  // Layer 2 Quality Issues (HIGH PRIORITY - forces refinement)
  if (!criteria.summaryQuality && criteria.hasSummary) {
    questions.push(
      'Is my summary specific enough? Can I mention key metrics, concerns, or specific areas affected?'
    );
  }

  if (!criteria.detailsQuality && criteria.hasDetails) {
    questions.push(
      'Are my details substantive? Should I explain specific technical impacts, file changes, or complexity patterns?'
    );
  }

  if (!criteria.metricsJustified && criteria.metricsNotNull) {
    questions.push(
      'Have I justified my metric scores in the details? Why is complexity X and not Y? What warrants each score?'
    );
  }

  // Layer 1 Structural Issues (fallback)
  if (!criteria.hasSummary) {
    questions.push('What is the high-level summary of this commit from my perspective?');
  }

  if (!criteria.hasDetails) {
    questions.push('What specific details support my analysis?');
  }

  if (!criteria.hasMetrics) {
    questions.push('Have I provided all 7 required metrics?');
  }

  if (!criteria.metricsNotNull && metrics) {
    const nullMetrics = Object.entries(metrics)
      .filter(([_, v]) => v === null)
      .map(([k, _]) => k);

    if (nullMetrics.length > 0 && nullMetrics.length <= 2) {
      questions.push(
        `I marked ${nullMetrics.join(', ')} as null - do I have enough context to estimate these?`
      );
    }
  }

  if (!criteria.hasReasonableScores) {
    questions.push('Are my metric scores reasonable and within valid ranges (0-10)?');
  }

  // Check if clarity threshold is met
  const hasEnoughInfo = score >= clarityThreshold;

  return {
    score,
    hasEnoughInfo,
    selfQuestions: questions,
  };
}
