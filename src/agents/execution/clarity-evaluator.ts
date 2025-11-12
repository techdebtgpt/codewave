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
 */
interface ClarityCriteria {
  hasSummary: boolean;
  hasDetails: boolean;
  hasMetrics: boolean;
  metricsNotNull: boolean;
  hasReasonableScores: boolean;
  hasConfidence: boolean;
}

/**
 * Weights for each clarity criterion
 */
const CLARITY_WEIGHTS: Record<keyof ClarityCriteria, number> = {
  hasSummary: 0.15,
  hasDetails: 0.2,
  hasMetrics: 0.25,
  metricsNotNull: 0.2,
  hasReasonableScores: 0.15,
  hasConfidence: 0.05,
};

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
  const criteria: ClarityCriteria = {
    hasSummary: !!(parsed.summary && parsed.summary.trim().length > 20),
    hasDetails: !!(parsed.details && parsed.details.trim().length > 50),
    hasMetrics: !!(parsed.metrics && Object.keys(parsed.metrics).length === 7),
    metricsNotNull:
      parsed.metrics &&
      Object.values(parsed.metrics).filter((v) => v !== null).length >= 5,
    hasReasonableScores:
      parsed.metrics &&
      Object.values(parsed.metrics).every(
        (v: any) => v === null || (typeof v === 'number' && v >= 0 && v <= 10)
      ),
    hasConfidence: parsed.confidence !== undefined,
  };

  // Calculate weighted clarity score
  let score = 0;
  for (const [key, value] of Object.entries(criteria)) {
    if (value) {
      score += CLARITY_WEIGHTS[key as keyof ClarityCriteria];
    }
  }

  // Generate self-questions for missing information
  const questions: string[] = [];

  if (!criteria.hasSummary) {
    questions.push('What is the high-level summary of this commit from my perspective?');
  }

  if (!criteria.hasDetails) {
    questions.push('What specific details support my analysis?');
  }

  if (!criteria.hasMetrics) {
    questions.push('Have I provided all 7 required metrics?');
  }

  if (!criteria.metricsNotNull && parsed.metrics) {
    const nullMetrics = Object.entries(parsed.metrics)
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
