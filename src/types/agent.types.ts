export type AgentRole =
  | 'Business Analyst'
  | 'QA Engineer'
  | 'Developer Author'
  | 'Senior Architect'
  | 'Developer Reviewer';

/**
 * Depth mode for agent analysis
 * - fast: Quick analysis, minimal refinement
 * - normal: Balanced analysis with standard refinement
 * - deep: Thorough analysis with maximum refinement and detail
 */
export type AnalysisDepthMode = 'fast' | 'normal' | 'deep';

/**
 * Agent internal state for self-iteration/refinement
 */
export interface AgentInternalState {
  iteration: number; // Current internal iteration (0-based)
  clarityScore: number; // Self-evaluation score (0-100)
  missingInformation: string[]; // Information gaps identified
  gapReductionRate: number; // Rate of gap reduction (convergence metric)
  previousGapCount: number; // Previous iteration gap count
  refinementNotes: string[]; // Notes on improvements per iteration
  allSeenGaps: Set<string>; // Deduplication of gaps across iterations
}

// Conversation tracking types
export interface ConversationMessage {
  round: number;
  agentRole: AgentRole;
  agentName: string;
  message: string;
  timestamp: Date;
  concernsRaised?: string[];
  referencesTo?: string[]; // Other agent names referenced
}

// 8-Pillar metrics structure (previously 7-pillar)
// Metrics can be null if an agent cannot assess them
export interface PillarScores {
  codeQuality: number | null; // 1-10 (Developer Reviewer)
  codeComplexity: number | null; // 10-1 inverted (Senior Architect)
  idealTimeHours: number | null; // Business Analyst
  actualTimeHours: number | null; // Developer Author
  technicalDebtHours: number | null; // +/- (Senior Architect)
  debtReductionHours: number | null; // +/- (Senior Architect) - potential debt reduction from changes
  functionalImpact: number | null; // 1-10 (Business Analyst)
  testCoverage: number | null; // 1-10 (QA Engineer)
}
