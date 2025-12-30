import { StateGraph, START, END, Annotation, MemorySaver } from '@langchain/langgraph';
import { AgentRegistry } from '../agents/agent-registry';
import { AgentResult } from '../agents/agent.interface';
import { ConversationMessage, PillarScores } from '../types/agent.types';
import { AppConfig } from '../config/config.interface';
import { calculateCost } from '../utils/token-tracker';
import {
  SEVEN_PILLARS,
  PillarName,
  calculateWeightedAverage,
  getAgentWeight,
} from '../constants/agent-weights.constants';
import { DeveloperOverviewGenerator } from '../services/developer-overview-generator';
import { LLMService } from '../llm/llm-service';

/**
 * LangGraph State Definition for Commit Evaluation
 * This state flows through the graph and accumulates results
 */
export const CommitEvaluationState = Annotation.Root({
  // Input data
  commitDiff: Annotation<string>,
  filesChanged: Annotation<string[]>,
  developerOverview: Annotation<string | undefined>, // Developer's description of changes
  vectorStore: Annotation<any>, // RAG vector store for large diffs
  documentationStore: Annotation<any>, // Documentation vector store

  // Commit metadata for logging
  commitHash: Annotation<string | undefined>,
  commitIndex: Annotation<number | undefined>,
  totalCommits: Annotation<number | undefined>,

  // Agent execution state
  currentRound: Annotation<number>,
  maxRounds: Annotation<number>,
  minRounds: Annotation<number>, // Minimum rounds before allowing early convergence

  // Agent results (current round only) - REPLACE each round to keep context lean
  // This prevents token accumulation while allowing agents to see current round context
  agentResults: Annotation<AgentResult[]>({
    reducer: (state: AgentResult[], update: AgentResult[]) => {
      // REPLACE, don't append - keeps only current round's results
      // Previous rounds are tracked in evaluationHistory for transcript generation
      return update;
    },
    default: () => [],
  }),

  // Full evaluation history (accumulated) - keeps ALL results from ALL rounds for transcript generation
  // This is separate from agentResults to prevent agents from receiving bloated context
  evaluationHistory: Annotation<AgentResult[]>({
    reducer: (state: AgentResult[], update: AgentResult[]) => {
      // APPEND to track full conversation history for transcripts and reporting
      return [...state, ...update];
    },
    default: () => [],
  }),

  // Previous round results for convergence detection
  previousRoundResults: Annotation<AgentResult[]>,

  // Convergence metrics
  convergenceScore: Annotation<number | undefined>,
  converged: Annotation<boolean>,

  // Conversation tracking (NEW for multi-agent discussions)
  conversationHistory: Annotation<ConversationMessage[]>({
    reducer: (state: ConversationMessage[], update: ConversationMessage[]) => {
      return [...state, ...update];
    },
    default: () => [],
  }),

  // Team concerns from current round (to be addressed in next round)
  teamConcerns: Annotation<Array<{ agentName: string; concern: string }>>({
    reducer: (
      state: Array<{ agentName: string; concern: string }>,
      update: Array<{ agentName: string; concern: string }>
    ) => {
      return update; // Replace concerns each round (not accumulate)
    },
    default: () => [],
  }),

  // Agents that have opted out of further rounds
  optedOutAgents: Annotation<Set<string>>({
    reducer: (state: Set<string>, update: Set<string>) => {
      return new Set([...state, ...update]); // Accumulate opted-out agents
    },
    default: () => new Set<string>(),
  }),

  // Aggregated 7-pillar scores (NEW for metrics tracking)
  pillarScores: Annotation<Partial<PillarScores>>({
    reducer: (state: Partial<PillarScores>, update: Partial<PillarScores>) => {
      return { ...state, ...update };
    },
    default: () => ({}),
  }),

  // Agent progress tracking (for real-time UI updates)
  currentAgent: Annotation<string | undefined>, // Name of currently executing agent
  completedAgents: Annotation<number>({
    reducer: (state: number, update: number) => update, // Replace with latest count
    default: () => 0,
  }),
  totalAgents: Annotation<number>({
    reducer: (state: number, update: number) => update || state, // Set once, keep
    default: () => 0,
  }),

  // Metadata
  startTime: Annotation<number>,
  endTime: Annotation<number | undefined>,

  // Token tracking
  totalInputTokens: Annotation<number>({
    reducer: (state: number, update: number) => state + update,
    default: () => 0,
  }),
  totalOutputTokens: Annotation<number>({
    reducer: (state: number, update: number) => state + update,
    default: () => 0,
  }),
  totalCost: Annotation<number>({
    reducer: (state: number, update: number) => state + update,
    default: () => 0,
  }),
});

/**
 * Detect if an agent's metrics have remained stable (identical) compared to previous round
 * If metrics are stable, agent has confirmed their assessment and should exit
 */
function detectStableMetrics(
  currentResult: AgentResult,
  previousResult: AgentResult | null
): boolean {
  if (!previousResult) {
    return false; // First round, no previous result to compare
  }

  // Check if all 7 pillars have identical values
  const allMetricsMatch = SEVEN_PILLARS.every((metric) => {
    const currentValue = (currentResult.metrics as any)?.[metric];
    const previousValue = (previousResult.metrics as any)?.[metric];
    return currentValue === previousValue;
  });

  return allMetricsMatch;
}

/**
 * Calculate similarity between two agent results
 * Uses simple Jaccard similarity on word sets
 */
function calculateSimilarity(result1: AgentResult, result2: AgentResult): number {
  const getText = (r: AgentResult) => `${r.summary || ''} ${r.details || ''}`.toLowerCase();

  const text1 = getText(result1);
  const text2 = getText(result2);

  const words1 = new Set(text1.split(/\s+/).filter((w) => w.length > 3));
  const words2 = new Set(text2.split(/\s+/).filter((w) => w.length > 3));

  if (words1.size === 0 || words2.size === 0) return 0;

  const intersection = new Set([...words1].filter((w) => words2.has(w)));
  const union = new Set([...words1, ...words2]);

  return intersection.size / union.size;
}

/**
 * Check if agent results have converged between rounds
 * Enhanced to consider both content similarity and metric stability
 */
function checkConvergence(
  currentResults: AgentResult[],
  previousResults: AgentResult[],
  threshold: number
): { converged: boolean; score: number } {
  if (previousResults.length === 0) {
    return { converged: false, score: 0 };
  }

  // 1. Content similarity (original logic)
  let totalSimilarity = 0;
  let comparisons = 0;

  for (const currentResult of currentResults) {
    for (const previousResult of previousResults) {
      const similarity = calculateSimilarity(currentResult, previousResult);
      totalSimilarity += similarity;
      comparisons++;
    }
  }

  const avgSimilarity = comparisons > 0 ? totalSimilarity / comparisons : 0;

  // 2. Metric stability (new logic for conversation quality)
  const currentMetrics = currentResults.map((r) => r.metrics).filter(Boolean);
  const previousMetrics = previousResults.map((r) => r.metrics).filter(Boolean);

  let metricStability = 1.0; // Default to stable if no metrics
  if (currentMetrics.length > 0 && previousMetrics.length > 0) {
    // Check if metrics have stabilized (small variance between rounds)
    // Check if metrics have stabilized (small variance between rounds)
    const metricKeys = SEVEN_PILLARS;

    let totalDifference = 0;
    let metricComparisons = 0;

    for (const key of metricKeys) {
      const currentValues = currentMetrics
        .map((m) => (m as any)[key])
        .filter((v) => v !== undefined);
      const previousValues = previousMetrics
        .map((m) => (m as any)[key])
        .filter((v) => v !== undefined);

      if (currentValues.length > 0 && previousValues.length > 0) {
        const currentAvg =
          currentValues.reduce((sum, v) => sum + Math.abs(v), 0) / currentValues.length;
        const previousAvg =
          previousValues.reduce((sum, v) => sum + Math.abs(v), 0) / previousValues.length;

        // Normalize difference (assume max scale is 10 for most metrics)
        const difference = Math.abs(currentAvg - previousAvg) / 10;
        totalDifference += difference;
        metricComparisons++;
      }
    }

    // Metric stability: 1.0 = identical, 0.0 = completely different
    metricStability = metricComparisons > 0 ? 1 - totalDifference / metricComparisons : 1.0;
  }

  // Combined convergence score (70% content similarity + 30% metric stability)
  const combinedScore = avgSimilarity * 0.7 + metricStability * 0.3;

  return {
    converged: combinedScore >= threshold,
    score: combinedScore,
  };
}

/**
 * Get the purpose/phase of the current discussion round
 */
// Removed getRoundPurpose - now using currentRound and isFinalRound flags

/**
 * Create LangGraph-based Commit Evaluation Workflow
 *
 * Graph structure:
 *   START → generateDeveloperOverview → runAgents → shouldContinue? → [YES: runAgents | NO: END]
 *
 * Multi-Round Discussion (configurable via maxRounds):
 *   Round 1: Initial analysis (agents analyze independently from developer overview)
 *   Round 2+: Team discussion (agents review each other's scores, raise concerns, refine)
 *   Final Round: Convergence (agents finalize scores with confidence)
 *
 * The number of rounds is configurable. Each round after the first allows agents to
 * review team context and refine their assessments collaboratively.
 */
export function createCommitEvaluationGraph(agentRegistry: AgentRegistry, config: AppConfig) {
  const agents = agentRegistry.getAgents();

  // Node: Generate developer overview if not provided
  async function generateDeveloperOverview(state: typeof CommitEvaluationState.State) {
    try {
      // Only generate if not already provided
      if (state.developerOverview && state.developerOverview.trim().length > 0) {
        // Already have an overview, preserve it through the state
        return { developerOverview: state.developerOverview };
      }

      if (!state.commitDiff) {
        // No diff available, skip overview generation
        return { developerOverview: undefined };
      }

      console.log('📝 Generating developer overview from commit diff...');

      const generator = new DeveloperOverviewGenerator(config);

      const overview = await generator.generateOverview(
        state.commitDiff,
        state.filesChanged || [],
        undefined // commitMessage will be extracted from diff if available
      );

      // Format for prompt
      const formattedOverview = DeveloperOverviewGenerator.formatForPrompt(overview);

      // Track token usage from the developer overview generation
      // Get the model instance to access usage information
      const model = LLMService.getChatModel(config);
      let devOverviewInputTokens = 0;
      let devOverviewOutputTokens = 0;
      let devOverviewCost = 0;

      // If model has token tracking capability, capture it
      if ((model as any).tokenTracker) {
        const tracker = (model as any).tokenTracker;
        devOverviewInputTokens = tracker.totalInputTokens || 0;
        devOverviewOutputTokens = tracker.totalOutputTokens || 0;
        devOverviewCost = tracker.totalCost || 0;
      }

      // If tokens are tracked in response metadata, use that instead
      if ((model as any).lastTokenUsage) {
        const usage = (model as any).lastTokenUsage;
        devOverviewInputTokens = usage.inputTokens || 0;
        devOverviewOutputTokens = usage.outputTokens || 0;
        const totalTokens = devOverviewInputTokens + devOverviewOutputTokens;
        devOverviewCost = calculateCost(config.llm.provider, config.llm.model, {
          inputTokens: devOverviewInputTokens,
          outputTokens: devOverviewOutputTokens,
          totalTokens,
        }).totalCost;
      }

      console.log(
        `✅ Developer overview generated successfully (${formattedOverview.length} chars)`
      );

      return {
        developerOverview: formattedOverview,
        totalInputTokens: devOverviewInputTokens,
        totalOutputTokens: devOverviewOutputTokens,
        totalCost: devOverviewCost,
      };
    } catch (error) {
      console.warn(
        `⚠️  Failed to generate developer overview: ${error instanceof Error ? error.message : String(error)}`
      );
      if (error instanceof Error && error.stack) {
        console.warn(`   Stack: ${error.stack.split('\n').slice(0, 3).join(' -> ')}`);
      }
      // Return undefined overview but continue execution
      return { developerOverview: undefined };
    }
  }

  // Node: Run all agents in parallel (enabling conversation)
  async function runAgents(state: typeof CommitEvaluationState.State) {
    const isFirstRound = state.currentRound === 0;
    const isFinalRound = state.currentRound === state.maxRounds - 1;
    const roundLabel = isFirstRound
      ? 'Initial Analysis'
      : isFinalRound
        ? 'Final Review'
        : 'Team Discussion';

    // Build commit identifier for logging
    const commitId = state.commitHash ? state.commitHash.substring(0, 7) : 'unknown';
    const commitPrefix =
      state.commitIndex !== undefined && state.totalCommits !== undefined
        ? `[${state.commitIndex}/${state.totalCommits}]`
        : '';

    // Track agent execution for inline status updates
    const agentNames = agents
      .filter((agent) => {
        const agentKey = agent.getMetadata().name;
        // Filter out agents who have opted out
        if (state.optedOutAgents.has(agentKey)) {
          return false;
        }
        return agent.canExecute({
          commitDiff: state.commitDiff,
          filesChanged: state.filesChanged,
        });
      })
      .map((agent) => agent.getMetadata().name);

    console.log(
      `\n${commitPrefix}🔄 ${commitId} - Round ${state.currentRound + 1}/${state.maxRounds} (${roundLabel})`
    );
    console.log(`   🚀 Starting ${agentNames.length} agent${agentNames.length > 1 ? 's' : ''}...`);

    // Track completed agents for inline progress
    let completedCount = 0;
    const totalAgents = agentNames.length;

    const agentExecutionPromises = agents
      .filter((agent) => {
        const agentKey = agent.getMetadata().name;
        // Filter out agents who have opted out
        if (state.optedOutAgents.has(agentKey)) {
          return false;
        }
        return agent.canExecute({
          commitDiff: state.commitDiff,
          filesChanged: state.filesChanged,
        });
      })
      .map(async (agent) => {
        const agentName = agent.getMetadata().name; // Technical key (e.g., 'business-analyst')
        const agentRole = agent.getMetadata().role; // Display name (e.g., 'Business Analyst')

        if (state.currentRound > 0 && (agentName === 'business-analyst' || agentName === 'sdet')) {
          console.log(`🔍 [Round ${state.currentRound + 1}] Executing ${agentRole}...`);
        }

        try {
          // Pass previous agent results for conversation context
          const result = (await agent.execute({
            commitDiff: state.commitDiff,
            filesChanged: state.filesChanged,
            developerOverview: state.developerOverview, // Developer's description of changes for context
            agentResults: state.agentResults, // Agents can reference each other's responses
            conversationHistory: state.conversationHistory, // Pass full conversation
            vectorStore: state.vectorStore, // RAG support for large diffs
            documentationStore: state.documentationStore, // Documentation vector store
            currentRound: state.currentRound, // Current round number (0-indexed)
            isFinalRound, // Flag indicating if this is the final round
            teamConcerns: state.teamConcerns, // Concerns raised by team in previous round

            // Pass depth configuration for agent self-iteration
            depthMode: config.agents.depthMode || 'normal',
            maxInternalIterations: config.agents.maxInternalIterations,
            internalClarityThreshold: config.agents.internalClarityThreshold,

            // Batch evaluation metadata
            commitHash: state.commitHash,
            commitIndex: state.commitIndex,
            totalCommits: state.totalCommits,
          })) as AgentResult;

          // Track agent completion
          completedCount++;

          // Attach agent metadata to result for formatters
          result.agentName = agentRole; // Use role as display name
          result.agentRole = agentName; // Use name as technical identifier
          result.round = state.currentRound; // Attach round number for context

          // Create conversation message for this agent's response
          const conversationMessage: ConversationMessage = {
            round: state.currentRound,
            agentRole: agentRole as any, // Type will be validated by agent
            agentName,
            message: result.summary || '',
            timestamp: new Date(),
            concernsRaised: result.details ? [result.details] : undefined,
          };

          return { result, conversationMessage };
        } catch (error) {
          console.error(
            `  ❌ ${agentName} failed: ${error instanceof Error ? error.message : String(error)}`
          );

          // Return a placeholder result to maintain agent count
          const errorResult: AgentResult = {
            summary: '', // Empty summary will be filtered out
            details: `Agent execution failed: ${error instanceof Error ? error.message : String(error)}`,
            metrics: {},
            agentName: agentRole,
            agentRole: agentName,
            round: state.currentRound,
          };

          const conversationMessage: ConversationMessage = {
            round: state.currentRound,
            agentRole: agentRole as any,
            agentName,
            message: '',
            timestamp: new Date(),
          };

          return { result: errorResult, conversationMessage };
        }
      });

    const agentResponses = await Promise.all(agentExecutionPromises);

    // Filter out invalid results and log warnings
    const validResponses = agentResponses.filter((response) => {
      const isValid =
        response.result && response.result.summary && response.result.summary.trim().length > 0;

      if (!isValid) {
        console.warn(
          `  ⚠️  ${response.conversationMessage.agentName} returned invalid/empty result in Round ${state.currentRound + 1}`
        );
        if (response.result) {
          console.warn(`     Summary: "${response.result.summary}"`);
          console.warn(`     Summary length: ${response.result.summary?.length || 0}`);
        }
      }

      return isValid;
    });

    // Log if any agents failed
    if (validResponses.length < agentResponses.length) {
      const failedCount = agentResponses.length - validResponses.length;
      console.warn(
        `\n⚠️  Warning: ${failedCount} agent(s) failed to return valid results in round ${state.currentRound + 1}`
      );
    }

    // Sanitize results: filter metrics to ONLY the 7 pillars
    const results = validResponses.map((r) => {
      const sanitizedResult = { ...r.result };
      if (
        sanitizedResult.metrics &&
        typeof sanitizedResult.metrics === 'object' &&
        !Array.isArray(sanitizedResult.metrics)
      ) {
        // Filter metrics to only include the 7 pillars
        const filteredMetrics: Record<string, any> = {};
        for (const pillar of SEVEN_PILLARS) {
          if (pillar in sanitizedResult.metrics) {
            filteredMetrics[pillar] = sanitizedResult.metrics[pillar];
          }
        }
        sanitizedResult.metrics = filteredMetrics;
      }
      return sanitizedResult;
    });
    const conversationMessages = validResponses.map((r) => r.conversationMessage);

    // Collect all agent scores for each pillar (for weighted averaging)
    const pillarScoresCollected = {} as Record<
      PillarName,
      Array<{ agentName: string; score: number | null }>
    >;

    // Initialize arrays for each pillar
    for (const pillar of SEVEN_PILLARS as unknown as PillarName[]) {
      pillarScoresCollected[pillar] = [];
    }

    // Collect scores from all agents (including null values)
    for (const result of results) {
      const agentName = result.agentRole || result.agentName || 'unknown'; // Use agentRole (short key) for weight lookup
      if (result.metrics) {
        // Always push scores, including null values
        // undefined means agent didn't return the metric at all (shouldn't happen after prompt updates)
        for (const pillar of SEVEN_PILLARS as unknown as PillarName[]) {
          if (result.metrics[pillar] !== undefined) {
            pillarScoresCollected[pillar].push({
              agentName,
              score: result.metrics[pillar],
            });
          }
        }
      }
    }

    // Validate: Warn if agents return null for their PRIMARY metrics (weight >= 0.4)
    for (const result of results) {
      const agentName = result.agentRole || result.agentName || 'unknown';
      if (result.metrics) {
        for (const pillar of SEVEN_PILLARS as unknown as PillarName[]) {
          const value = result.metrics[pillar];
          const weight = getAgentWeight(agentName, pillar);

          // Warn if PRIMARY metric (weight >= 0.4) is null
          if (value === null && weight >= 0.4) {
            console.warn(
              `  ⚠️  ${result.agentName || agentName} returned null for PRIMARY metric: ${pillar} (${(weight * 100).toFixed(1)}% weight)`
            );
          }
        }
      }
    }

    // Calculate weighted averages for each pillar
    const newPillarScores: Partial<PillarScores> = {};
    for (const pillar of SEVEN_PILLARS as unknown as PillarName[]) {
      if (pillarScoresCollected[pillar].length > 0) {
        newPillarScores[pillar] = calculateWeightedAverage(pillarScoresCollected[pillar], pillar);
      }
    }

    // Check for convergence if this isn't the first round
    const clarityThreshold = config.agents.clarityThreshold || 0.85;
    const { converged, score } = checkConvergence(
      results,
      state.previousRoundResults || [],
      clarityThreshold
    );

    if (converged && state.currentRound > 0) {
      console.log(`  🎯 Convergence detected! Similarity: ${(score * 100).toFixed(1)}%`);
    }

    // Aggregate token usage from all agents
    let roundInputTokens = 0;
    let roundOutputTokens = 0;
    let roundCost = 0;

    for (const result of results) {
      if (result.tokenUsage) {
        roundInputTokens += result.tokenUsage.inputTokens;
        roundOutputTokens += result.tokenUsage.outputTokens;

        const costCalc = calculateCost(config.llm.provider, config.llm.model, result.tokenUsage);
        roundCost += costCalc.totalCost;
      }
    }

    // Collect concerns raised by agents in this round (to pass to next round)
    // Each concern is attributed to the agent that raised it
    const nextRoundConcerns: Array<{ agentName: string; concern: string }> = [];
    for (const result of results) {
      if (result.concerns && Array.isArray(result.concerns)) {
        for (const concern of result.concerns) {
          if (typeof concern === 'string' && concern.trim().length > 0) {
            nextRoundConcerns.push({
              agentName: result.agentName || 'Unknown Agent',
              concern: concern.trim(),
            });
          }
        }
      }
    }

    // Print round summary with agent results
    console.log(`\n📋 Round ${state.currentRound + 1}/${state.maxRounds} Summary:`);
    console.log(`   ✅ Completed: ${results.length} agent${results.length > 1 ? 's' : ''}`);

    // Show each agent's final clarity and metrics
    results.forEach((result) => {
      const clarityScore = result.clarityScore || 0;
      const clarityEmoji = clarityScore >= 0.8 ? '✅' : '🔄';
      // Check if clarity is already a percentage (>1) or a decimal (0-1)
      const clarityPct =
        clarityScore > 1 ? clarityScore.toFixed(0) : (clarityScore * 100).toFixed(0);
      const iterations = result.internalIterations || 1;
      console.log(
        `   ${clarityEmoji} ${result.agentName}: ${clarityPct}% clarity (${iterations} iteration${iterations > 1 ? 's' : ''})`
      );
    });

    // Show token usage and cost for this round
    console.log(
      `   💰 Tokens: ${roundInputTokens.toLocaleString()} in / ${roundOutputTokens.toLocaleString()} out | Cost: $${roundCost.toFixed(4)}`
    );

    // Show convergence info
    if (score !== undefined) {
      const convergenceEmoji = converged ? '🎯' : '🔄';
      console.log(
        `   ${convergenceEmoji} Team Convergence: ${(score * 100).toFixed(1)}%${converged ? ' (CONVERGED)' : ''}`
      );
    }

    // Show concerns raised
    if (nextRoundConcerns.length > 0 && state.currentRound < state.maxRounds - 1) {
      console.log(
        `   💭 Team raised ${nextRoundConcerns.length} concern(s) for next round discussion`
      );
    }

    // Track agents that opted out for next round
    // An agent opts out if their metrics are stable (identical to previous round) = confirmed agreement
    const newlyOptedOutAgents = new Set<string>();
    for (const result of results) {
      const agentKey = result.agentRole; // Technical identifier (e.g., 'business-analyst')

      if (!agentKey) {
        continue; // Skip if no agent key
      }

      // Find this agent's previous round result for comparison
      const previousResult = state.previousRoundResults?.find((r) => r.agentRole === agentKey);

      // Check if metrics have stabilized (identical to previous round)
      const metricsAreStable = detectStableMetrics(result, previousResult || null);

      if (metricsAreStable) {
        newlyOptedOutAgents.add(agentKey);
        console.log(
          `  ✅ ${result.agentName} confirmed assessment (stable metrics). Will not participate in next round.`
        );
      }
    }

    return {
      developerOverview: state.developerOverview, // Preserve developer overview through all rounds
      agentResults: results, // Current round only - keeps context lean for agents
      // IMPORTANT: Don't pre-accumulate here! The reducer will handle it.
      // Just return current round's results - the reducer will append to evaluationHistory
      evaluationHistory: results, // Reducer will do: [...state.evaluationHistory, ...results]
      previousRoundResults: results,
      currentRound: state.currentRound + 1,
      convergenceScore: score,
      converged,
      conversationHistory: conversationMessages, // Add to conversation
      teamConcerns: nextRoundConcerns, // Pass concerns to next round for validation
      pillarScores: newPillarScores, // Update aggregated scores
      optedOutAgents: newlyOptedOutAgents, // Track agents that don't want to participate in next round
      totalInputTokens: roundInputTokens,
      totalOutputTokens: roundOutputTokens,
      totalCost: roundCost,
      // Agent progress for UI updates
      totalAgents,
      completedAgents: totalAgents, // All agents completed this round
      currentAgent: undefined, // Clear current agent after round completes
    };
  }

  // Conditional edge: Decide whether to continue discussion rounds or end
  function shouldContinue(state: typeof CommitEvaluationState.State): typeof END | 'runAgents' {
    // Use configurable minRounds from state (set from config)
    // Note: currentRound is 0-indexed, so when displayed as "Round N", currentRound is N-1
    // minRounds=2 means allow early stopping after currentRound >= 1 (which displays as Round 2)
    const minRoundIndexForEarlyStopping = state.minRounds - 1;

    // Check if converged (early stopping allowed only after minimum rounds)
    if (state.converged && state.currentRound >= minRoundIndexForEarlyStopping) {
      console.log(
        `  ⏭️  Stopping at round ${state.currentRound + 1}/${state.maxRounds} due to convergence (teams agreed, minRounds=${state.minRounds})`
      );
      return END; // End - agents will have generated their finalSynthesis
    }

    // Check if reached max rounds
    if (state.currentRound < state.maxRounds) {
      return 'runAgents'; // Continue discussion
    }

    return END; // End - agents will have generated their finalSynthesis
  }

  // Build the graph with checkpointing support
  const graph = new StateGraph(CommitEvaluationState)
    .addNode('generateDeveloperOverview', generateDeveloperOverview)
    .addNode('runAgents', runAgents)
    .addEdge(START, 'generateDeveloperOverview')
    .addEdge('generateDeveloperOverview', 'runAgents')
    .addConditionalEdges('runAgents', shouldContinue);

  // Compile with checkpointing (enables state persistence and resume)
  const checkpointer = new MemorySaver();

  return graph
    .compile({
      checkpointer,
      // Add run name for LangSmith tracing
    })
    .withConfig({
      runName: 'CommitEvaluationWorkflow',
    });
}
