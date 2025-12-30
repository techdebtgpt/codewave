export interface EvaluationOutput {
  agent: string;
  summary: string;
  details?: string;
  metrics?: Record<string, any>;
}

/**
 * Token usage snapshot for a specific evaluation
 */
export interface TokenSnapshot {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  totalCost: number;
}

/**
 * Metrics scores for a specific evaluation
 */
export interface MetricScores {
  functionalImpact: number;
  idealTimeHours: number;
  testCoverage: number;
  codeQuality: number;
  codeComplexity: number;
  actualTimeHours: number;
  technicalDebtHours: number;
  debtReductionHours: number;
  commitScore: number;
}
/**
 * Single entry in evaluation history
 * Stores all important metrics from a re-evaluation
 */
export interface EvaluationHistoryEntry {
  timestamp: string;
  source: string;
  evaluationNumber: number;
  metrics: MetricScores;
  tokens: TokenSnapshot;
  convergenceScore: number;
}

/**
 * Complete evaluation history for a commit
 */
export type EvaluationHistory = EvaluationHistoryEntry[];
