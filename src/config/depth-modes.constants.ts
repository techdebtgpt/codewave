/**
 * Analysis depth mode configurations
 * Maps depth modes (fast/normal/deep) to concrete parameters
 */

export interface DepthModeConfig {
  maxInternalIterations: number; // Maximum times an agent refines itself
  internalClarityThreshold: number; // Clarity score target (0-100) for agent to stop
  maxSelfQuestions: number; // Maximum self-questions agent can ask
  skipSelfRefinement: boolean; // Whether to skip self-refinement entirely
  ragEnabled: boolean; // Whether to use RAG for context retrieval
  tokenBudgetPerAgent: number; // Approximate token budget per agent
  // Output limits for prompts
  summaryLimit: number; // Maximum characters for summary field
  detailsLimit: number; // Maximum characters for details field
  tokenGuidance: string; // Guidance string for expected token usage
  tone: string; // Tone instruction for the agent
  approach: string; // Analysis approach description
}

/**
 * Depth mode configurations
 *
 * FAST (Quick analysis for CI/CD, code reviews):
 * - 1-2 internal iterations max
 * - No self-refinement, just one pass
 * - 70% clarity threshold (agent stops when fairly confident)
 * - No RAG (just use provided diff)
 * - ~2000 tokens per agent
 *
 * NORMAL (Balanced, default):
 * - 3-5 internal iterations
 * - Basic self-refinement
 * - 80% clarity threshold
 * - RAG enabled for context
 * - ~4500 tokens per agent
 *
 * DEEP (Thorough analysis for tech debt, architecture decisions):
 * - 5-10 internal iterations
 * - Full self-refinement with multiple refinement passes
 * - 90% clarity threshold (agent very confident)
 * - RAG enabled with expanded context
 * - ~8000 tokens per agent
 */
export const DEPTH_MODE_CONFIGS: Record<'fast' | 'normal' | 'deep', DepthModeConfig> = {
  fast: {
    maxInternalIterations: 1,
    internalClarityThreshold: 65,
    maxSelfQuestions: 1,
    skipSelfRefinement: true,
    ragEnabled: false,
    tokenBudgetPerAgent: 2000,
    summaryLimit: 150,
    detailsLimit: 400,
    tokenGuidance: '~400-800 tokens',
    tone: 'Be concise. Focus on scores with minimal explanation.',
    approach: 'Prioritize speed: focus on scores with minimal explanation',
  },
  normal: {
    maxInternalIterations: 3,
    internalClarityThreshold: 80,
    maxSelfQuestions: 3,
    skipSelfRefinement: false,
    ragEnabled: true,
    tokenBudgetPerAgent: 4500,
    summaryLimit: 250,
    detailsLimit: 800,
    tokenGuidance: '~800-1500 tokens',
    tone: 'Provide balanced explanations with moderate detail.',
    approach: 'Balanced approach: provide moderate explanations for your scores',
  },
  deep: {
    maxInternalIterations: 8,
    internalClarityThreshold: 88,
    maxSelfQuestions: 5,
    skipSelfRefinement: false,
    ragEnabled: true,
    tokenBudgetPerAgent: 8000,
    summaryLimit: 350,
    detailsLimit: 1500,
    tokenGuidance: '~2000-4000 tokens',
    tone: 'Provide thorough analysis with detailed reasoning and comprehensive justifications.',
    approach: 'Thorough analysis: provide detailed reasoning and comprehensive justifications',
  },
};

/**
 * Get depth mode config with optional overrides
 */
export function getDepthModeConfig(
  mode: 'fast' | 'normal' | 'deep' = 'normal',
  overrides?: Partial<DepthModeConfig>
): DepthModeConfig {
  const baseConfig = DEPTH_MODE_CONFIGS[mode];
  return {
    ...baseConfig,
    ...(overrides || {}),
  };
}
