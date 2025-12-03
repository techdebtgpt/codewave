/**
 * Agent Executor
 *
 * Orchestrates agent execution using the internal iteration graph.
 * This separates execution logic from agent implementation, making agents
 * simpler and more focused on domain logic.
 */

import { AgentResult, AgentExecutionOptions } from '../agent.interface';
import { AgentMetadata, AgentExpertise } from '../core/agent-metadata';
import { PromptContext } from '../prompts/prompt-builder.interface';
import { createAgentInternalGraph } from './agent-internal-graph';
import { DEPTH_MODE_CONFIGS } from '../../config/depth-modes.constants';
import { MetricGuidelinesSet } from '../../constants/agent-metric-definitions.constants';
import { SEVEN_PILLARS } from '../../constants/agent-weights.constants';

/**
 * Agent Executor - handles graph-based execution for agents
 */
export class AgentExecutor {
  constructor(
    private readonly config: any,
    private readonly metadata: AgentMetadata,
    private readonly systemInstructions: string
  ) {}

  /**
   * Execute the agent using the internal iteration graph
   *
   * @param context Prompt context with agent info
   * @param buildInitialPrompt Function to build initial analysis prompt
   * @param buildRefinementPrompt Function to build refinement prompt
   * @param options Execution options
   * @returns Agent analysis result
   */
  async execute(
    context: PromptContext,
    buildInitialPrompt: (ctx: PromptContext) => Promise<string> | string,
    buildRefinementPrompt: (
      ctx: PromptContext,
      previousAnalysis: string,
      selfQuestions: string[],
      clarityScore: number
    ) => string
  ): Promise<AgentResult> {
    // Get depth configuration
    const depthMode = (context.depthMode || 'normal') as 'fast' | 'normal' | 'deep';
    const depthConfig = DEPTH_MODE_CONFIGS[depthMode];

    // Determine max iterations and clarity threshold
    // Priority: context > config > depthConfig defaults
    const maxIterations =
      context.maxInternalIterations ||
      this.config.agents?.maxInternalIterations ||
      depthConfig.maxInternalIterations;

    const clarityThreshold =
      context.internalClarityThreshold ||
      this.config.agents?.internalClarityThreshold ||
      depthConfig.internalClarityThreshold / 100; // Convert from 0-100 to 0-1

    // Create the graph with prompt builders
    const graph = createAgentInternalGraph(
      this.config,
      async (ctx: any) => {
        const prompt = await buildInitialPrompt(context);
        return typeof prompt === 'string' ? prompt : String(prompt);
      },
      (ctx: any, prev: string, questions: string[], clarity: number) => {
        return buildRefinementPrompt(context, prev, questions, clarity);
      },
      depthConfig
    );

    // Execute the graph
    const finalState = await graph.invoke({
      commitDiff: context.commitDiff,
      filesChanged: context.filesChanged || [],
      developerOverview: context.developerOverview,
      vectorStore: context.vectorStore,
      documentationStore: context.documentationStore,
      agentResults: context.agentResults || [],
      conversationHistory: context.conversationHistory || [],
      teamConcerns: context.teamConcerns || [],
      currentRound: context.currentRound || 0,
      isFinalRound: context.isFinalRound || false,
      depthMode,
      agentName: this.metadata.name,
      agentRole: this.metadata.role,
      systemPrompt: this.systemInstructions,
      iterationCount: 0,
      maxIterations,
      clarityThreshold,
      currentAnalysis: undefined,
      selfQuestions: [],
      clarityScore: undefined,
      hasEnoughInfo: false,
      messages: [],
      tokenUsage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
    });

    // Parse the final analysis
    const analysisContent =
      typeof finalState.currentAnalysis?.content === 'string'
        ? finalState.currentAnalysis.content
        : JSON.stringify(finalState.currentAnalysis);

    const result = this.parseLLMResult(analysisContent);
    result.tokenUsage = finalState.tokenUsage;

    // Add internal iteration metrics for progress tracking
    result.internalIterations = finalState.iterationCount;
    result.clarityScore =
      finalState.clarityScore !== undefined ? Math.round(finalState.clarityScore * 100) : undefined;

    return result;
  }

  /**
   * Parse LLM result into AgentResult
   */
  private parseLLMResult(output: any): AgentResult {
    // Try to parse JSON output from LLM
    if (typeof output === 'string') {
      try {
        const parsed = this.parseJSONSafely(output);

        // Validate required fields
        if (!parsed.summary || typeof parsed.summary !== 'string') {
          console.warn(`${this.metadata.name}: Invalid summary in LLM response`);
          throw new Error('Missing or invalid summary field');
        }

        // Handle metrics: ensure it's an object with 7 pillars, filter out extras
        let metrics = parsed.metrics || {};

        // If metrics is an array, convert to object
        if (Array.isArray(metrics)) {
          console.warn(`${this.metadata.name}: Metrics returned as array, converting to object`);
          metrics = {};
        }

        // Filter metrics to ONLY the 7 pillars, allow null values
        const filteredMetrics: Record<string, number | null> = {};
        for (const pillar of SEVEN_PILLARS) {
          if (pillar in metrics) {
            const value = metrics[pillar];
            // Allow number or null, skip if neither
            if (typeof value === 'number' || value === null) {
              filteredMetrics[pillar] = value;
            } else {
              console.warn(`${this.metadata.name}: Invalid type for ${pillar}, setting to null`);
              filteredMetrics[pillar] = null;
            }
          } else {
            // Missing metric - set to null
            console.warn(`${this.metadata.name}: Missing metric ${pillar}, setting to null`);
            filteredMetrics[pillar] = null;
          }
        }

        // Extract LLM-generated concerns
        const concerns = Array.isArray(parsed.concerns)
          ? parsed.concerns.filter((c: any) => typeof c === 'string').slice(0, 5)
          : [];

        const addressedConcerns = Array.isArray(parsed.addressedConcerns)
          ? parsed.addressedConcerns
              .filter(
                (ac: any) =>
                  ac && typeof ac.concern === 'string' && typeof ac.addressed === 'boolean'
              )
              .slice(0, 5)
          : [];

        return {
          summary: parsed.summary.trim(),
          details: (parsed.details || '').trim(),
          metrics: filteredMetrics,
          concerns: concerns.length > 0 ? concerns : undefined,
          addressedConcerns: addressedConcerns.length > 0 ? addressedConcerns : undefined,
        };
      } catch (error) {
        console.warn(
          `${this.metadata.name}: Failed to parse LLM output: ${error instanceof Error ? error.message : String(error)}`
        );
        console.warn(
          `${this.metadata.name}: Raw output (first 500 chars): ${output.substring(0, 500)}`
        );

        return {
          summary: output.substring(0, 500) || 'Failed to parse LLM response',
          details: '',
          metrics: this.getNullMetricsFallback(),
        };
      }
    }

    // Fallback for non-string output
    return {
      summary: typeof output === 'string' ? output : JSON.stringify(output),
      details: '',
      metrics: this.getNullMetricsFallback(),
    };
  }

  /**
   * Safely parse JSON from LLM output
   */
  private parseJSONSafely(output: string): any {
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
   * Get null metrics fallback
   */
  private getNullMetricsFallback(): Record<string, null> {
    return {
      functionalImpact: null,
      idealTimeHours: null,
      testCoverage: null,
      codeQuality: null,
      codeComplexity: null,
      actualTimeHours: null,
      technicalDebtHours: null,
      debtReductionHours: null,
    };
  }
}
