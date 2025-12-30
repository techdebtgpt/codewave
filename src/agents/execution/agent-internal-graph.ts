import { StateGraph, START, END, Annotation } from '@langchain/langgraph';
import { BaseMessage } from '@langchain/core/messages';
import { LLMService } from '../../llm/llm-service';
import { DepthModeConfig } from '../../config/depth-modes.constants';
import { evaluateClarity as evaluateClarityFn } from './clarity-evaluator';

/**
 * Internal Agent State for iterative information gathering
 * Each agent iterates through this graph until it has sufficient information
 */
export const AgentInternalState = Annotation.Root({
  // Input context
  commitDiff: Annotation<string>,
  filesChanged: Annotation<string[]>,
  developerOverview: Annotation<string | undefined>,
  vectorStore: Annotation<any>,
  documentationStore: Annotation<any>,
  agentResults: Annotation<any[]>,
  conversationHistory: Annotation<any[]>,
  teamConcerns: Annotation<any[]>,
  currentRound: Annotation<number>,
  isFinalRound: Annotation<boolean>,
  depthMode: Annotation<'fast' | 'normal' | 'deep'>,

  // Agent identity
  agentName: Annotation<string>,
  agentRole: Annotation<string>,
  systemPrompt: Annotation<string>,

  // Iteration state
  iterationCount: Annotation<number>,
  maxIterations: Annotation<number>,
  clarityThreshold: Annotation<number>,

  // Analysis state
  currentAnalysis: Annotation<any | undefined>,
  selfQuestions: Annotation<string[]>({
    reducer: (state: string[], update: string[]) => [...state, ...update],
    default: () => [],
  }),
  clarityScore: Annotation<number | undefined>,
  hasEnoughInfo: Annotation<boolean>,

  // Messages for LLM conversation
  messages: Annotation<BaseMessage[]>({
    reducer: (state: BaseMessage[], update: BaseMessage[]) => (update.length > 0 ? update : state),
    default: () => [],
  }),

  // Token tracking
  tokenUsage: Annotation<{
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  }>({
    reducer: (
      state: { inputTokens: number; outputTokens: number; totalTokens: number },
      update: { inputTokens: number; outputTokens: number; totalTokens: number }
    ) => ({
      inputTokens: state.inputTokens + update.inputTokens,
      outputTokens: state.outputTokens + update.outputTokens,
      totalTokens: state.totalTokens + update.totalTokens,
    }),
    default: () => ({ inputTokens: 0, outputTokens: 0, totalTokens: 0 }),
  }),
});

/**
 * Node: Generate initial analysis
 */
async function generateInitialAnalysis(
  state: typeof AgentInternalState.State,
  config: any,
  promptBuilder: (context: any) => Promise<string>,
  depthConfig: DepthModeConfig
) {
  console.log(
    `  🔄 ${state.agentRole} [Round ${state.currentRound + 1}]: Starting initial analysis (iteration 1/${state.maxIterations})...`
  );

  // Use tokenBudgetPerAgent from depth config as maxTokens override
  const model = LLMService.getChatModel(config, depthConfig.tokenBudgetPerAgent);

  const humanPrompt = await promptBuilder({
    commitDiff: state.commitDiff,
    filesChanged: state.filesChanged,
    developerOverview: state.developerOverview,
    vectorStore: state.vectorStore,
    documentationStore: state.documentationStore,
    agentResults: state.agentResults,
    conversationHistory: state.conversationHistory,
    currentRound: state.currentRound,
    isFinalRound: state.isFinalRound,
    depthMode: state.depthMode,
  });

  const messages = [
    { role: 'system', content: state.systemPrompt },
    { role: 'user', content: humanPrompt },
  ];

  // Call model without timeout - let it complete naturally
  const response = (await model.invoke(messages as any)) as any;
  const tokenUsage = extractTokenUsage(response);

  return {
    currentAnalysis: response,
    messages: [
      { role: 'system', content: state.systemPrompt },
      { role: 'user', content: humanPrompt },
      { role: 'assistant', content: response.content },
    ] as any,
    iterationCount: 1,
    tokenUsage,
  };
}

/**
 * Node: Evaluate clarity and identify gaps
 * Uses the extracted clarity evaluator
 */
async function evaluateClarity(state: typeof AgentInternalState.State, _config: any) {
  // Parse the current analysis
  const analysisContent =
    typeof state.currentAnalysis?.content === 'string'
      ? state.currentAnalysis.content
      : JSON.stringify(state.currentAnalysis);

  // Use the clarity evaluator
  const evaluation = evaluateClarityFn(analysisContent, state.clarityThreshold);

  console.log(
    `  📊 ${state.agentRole} [Round ${state.currentRound + 1}]: Clarity ${(evaluation.score * 100).toFixed(1)}% (threshold: ${(state.clarityThreshold * 100).toFixed(0)}%) - ${evaluation.hasEnoughInfo ? 'PASS' : 'needs refinement'}`
  );

  return {
    clarityScore: evaluation.score,
    hasEnoughInfo: evaluation.hasEnoughInfo,
    selfQuestions: evaluation.selfQuestions,
  };
}

/**
 * Node: Refine analysis based on self-questions
 */
async function refineAnalysis(
  state: typeof AgentInternalState.State,
  config: any,
  refinementPromptBuilder: (ctx: any, prev: string, questions: string[], clarity: number) => string,
  depthConfig: DepthModeConfig
) {
  const nextIteration = state.iterationCount + 1;
  console.log(
    `  🔄 ${state.agentRole} [Round ${state.currentRound + 1}]: Refining analysis (iteration ${nextIteration}/${state.maxIterations})...`
  );

  // Use tokenBudgetPerAgent from depth config as maxTokens override
  const model = LLMService.getChatModel(config, depthConfig.tokenBudgetPerAgent);

  // Get previous analysis content
  const previousAnalysis =
    typeof state.currentAnalysis?.content === 'string'
      ? state.currentAnalysis.content
      : JSON.stringify(state.currentAnalysis, null, 2);

  // Build refinement prompt using the provided builder
  const refinementPrompt = refinementPromptBuilder(
    state,
    previousAnalysis,
    state.selfQuestions,
    state.clarityScore || 0
  );

  const messages = [...state.messages, { role: 'user', content: refinementPrompt }] as any;

  // Call model without timeout - let it complete naturally
  const response = (await model.invoke(messages)) as any;
  const tokenUsage = extractTokenUsage(response);

  return {
    currentAnalysis: response,
    messages: [
      ...state.messages,
      { role: 'user', content: refinementPrompt },
      { role: 'assistant', content: response.content },
    ] as any,
    iterationCount: state.iterationCount + 1,
    tokenUsage,
  };
}

/**
 * Conditional edge: Should the agent continue iterating?
 * Closure to access depthConfig
 */
function createShouldContinueIterating(depthConfig: DepthModeConfig) {
  return function shouldContinueIterating(
    state: typeof AgentInternalState.State
  ): 'refineAnalysis' | 'evaluateClarity' | typeof END {
    // SAFETY: Hard stop at 2x maxIterations to prevent infinite loops
    if (state.iterationCount >= state.maxIterations * 2) {
      console.warn(
        `⚠️  ${state.agentRole}: Force-stopping at iteration ${state.iterationCount} (2x maxIterations=${state.maxIterations})`
      );
      return END;
    }

    // If skipSelfRefinement is enabled (fast mode), stop after initial analysis
    if (depthConfig.skipSelfRefinement && state.iterationCount >= 1) {
      return END;
    }

    // Stop if max iterations reached
    if (state.iterationCount >= state.maxIterations) {
      return END;
    }

    // Stop if clarity threshold met
    if (state.hasEnoughInfo) {
      return END;
    }

    // If we just generated initial analysis, evaluate it
    if (state.iterationCount === 1 && state.clarityScore === undefined) {
      return 'evaluateClarity';
    }

    // If we just evaluated clarity and need to refine
    if (state.clarityScore !== undefined && !state.hasEnoughInfo) {
      return 'refineAnalysis';
    }

    // After refinement, evaluate clarity again
    return 'evaluateClarity';
  };
}

/**
 * Create the agent's internal iteration graph
 *
 * @param config Application configuration
 * @param promptBuilder Function to build initial analysis prompt
 * @param refinementPromptBuilder Function to build refinement prompts
 * @param depthConfig Depth mode configuration
 */
export function createAgentInternalGraph(
  config: any,
  promptBuilder: (context: any) => Promise<string>,
  refinementPromptBuilder: (ctx: any, prev: string, questions: string[], clarity: number) => string,
  depthConfig: DepthModeConfig
) {
  // Create the conditional edge function with depthConfig in closure
  const shouldContinueIterating = createShouldContinueIterating(depthConfig);

  const graph = new StateGraph(AgentInternalState)
    .addNode('generateInitialAnalysis', (state) =>
      generateInitialAnalysis(state, config, promptBuilder, depthConfig)
    )
    .addNode('evaluateClarity', (state) => evaluateClarity(state, config))
    .addNode('refineAnalysis', (state) =>
      refineAnalysis(state, config, refinementPromptBuilder, depthConfig)
    )
    .addEdge(START, 'generateInitialAnalysis')
    .addConditionalEdges('generateInitialAnalysis', shouldContinueIterating)
    .addConditionalEdges('evaluateClarity', shouldContinueIterating)
    .addConditionalEdges('refineAnalysis', shouldContinueIterating);

  return graph.compile();
}

/**
 * Helper: Extract token usage from LLM response
 */
function extractTokenUsage(output: any): {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
} {
  if (output?.response_metadata?.usage) {
    const usage = output.response_metadata.usage;
    return {
      inputTokens: usage.input_tokens || usage.prompt_tokens || 0,
      outputTokens: usage.output_tokens || usage.completion_tokens || 0,
      totalTokens:
        usage.total_tokens ||
        (usage.input_tokens || usage.prompt_tokens || 0) +
          (usage.output_tokens || usage.completion_tokens || 0),
    };
  } else if (output?.usage) {
    const usage = output.usage;
    return {
      inputTokens: usage.input_tokens || usage.prompt_tokens || 0,
      outputTokens: usage.output_tokens || usage.completion_tokens || 0,
      totalTokens:
        usage.total_tokens ||
        (usage.input_tokens || usage.prompt_tokens || 0) +
          (usage.output_tokens || usage.completion_tokens || 0),
    };
  }
  return { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
}
