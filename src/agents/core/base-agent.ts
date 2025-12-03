/**
 * Base Agent Class
 *
 * This is the PUBLIC base class that external users can extend to create custom agents.
 * It provides the core agent interface and delegates execution to the AgentExecutor.
 *
 * To create a custom agent, extend this class and provide:
 * - metadata: Agent identity
 * - expertise: Expertise weights
 * - systemInstructions: Core behavior definition
 * - buildInitialPrompt: How to analyze commits initially
 * - buildRefinementPrompt (optional): How to refine analysis
 */

import { Agent, AgentContext, AgentResult, AgentExecutionOptions } from '../agent.interface';
import { AgentMetadata, AgentExpertise, categorizeExpertise } from './agent-metadata';
import { PromptContext } from '../prompts/prompt-builder.interface';
import {
  AGENT_METRIC_DEFINITIONS,
  MetricGuidelinesSet,
} from '../../constants/agent-metric-definitions.constants';

/**
 * Base Agent - extend this to create custom agents
 *
 * Example:
 * ```ts
 * export class MyCustomAgent extends BaseAgent {
 *   protected readonly metadata: AgentMetadata = {
 *     name: 'my-custom-agent',
 *     role: 'My Custom Agent',
 *     description: 'Does custom analysis',
 *     roleDescription: 'custom perspective'
 *   };
 *
 *   protected readonly expertise: AgentExpertise = {
 *     functionalImpact: 0.6,
 *     testCoverage: 0.5,
 *     // ... other pillars
 *   };
 *
 *   protected readonly systemInstructions = `
 *     You are My Custom Agent analyzing code commits.
 *     Your focus is on functional impact and testing.
 *   `;
 *
 *   protected async buildInitialPrompt(context: PromptContext): Promise<string> {
 *     return `Analyze this commit:\n${context.commitDiff}`;
 *   }
 * }
 * ```
 */
export abstract class BaseAgent implements Agent {
  // ============================================================================
  // ABSTRACT PROPERTIES - Must be defined by subclasses
  // ============================================================================

  /** Agent identity and role information */
  protected abstract readonly metadata: AgentMetadata;

  /** Expertise weights for the 7 pillars (0-1 for each) */
  protected abstract readonly expertise: AgentExpertise;

  /** System instructions defining agent's core behavior (clear, no concatenation) */
  protected abstract readonly systemInstructions: string;

  // ============================================================================
  // SHARED CONSTANTS - Same for all agents
  // ============================================================================

  /** Centralized metric definitions (7 pillars) */
  protected readonly metricDefinitions: Record<string, MetricGuidelinesSet> =
    AGENT_METRIC_DEFINITIONS;

  /** Application configuration (injected via constructor) */
  protected config: any;

  // ============================================================================
  // CONSTRUCTOR
  // ============================================================================

  constructor(config: any) {
    this.config = config;
  }

  // ============================================================================
  // PUBLIC INTERFACE METHODS
  // ============================================================================

  /**
   * Get agent metadata
   */
  getMetadata(): AgentMetadata {
    return this.metadata;
  }

  /**
   * Get agent expertise weights
   */
  getExpertise(): AgentExpertise {
    return this.expertise;
  }

  /**
   * Check if agent can execute given the context
   * Default: requires commitDiff
   * Override if agent has specific requirements
   */
  async canExecute(context: AgentContext): Promise<boolean> {
    return !!context.commitDiff;
  }

  /**
   * Execute the agent - runs the internal iteration graph
   * This delegates to AgentExecutor for actual execution
   */
  async execute(context: AgentContext, options?: AgentExecutionOptions): Promise<AgentResult> {
    // Lazy-load the executor to avoid circular dependencies
    const { AgentExecutor } = await import('../execution/agent-executor.js');

    const executor = new AgentExecutor(this.config, this.metadata, this.systemInstructions);

    // Build prompt context with categorized expertise
    const { primary, secondary, tertiary } = categorizeExpertise(this.expertise);

    const promptContext: PromptContext = {
      ...context,
      agentName: this.metadata.name,
      agentRole: this.metadata.role,
      primaryMetrics: primary,
      secondaryMetrics: secondary,
      tertiaryMetrics: tertiary,
    };

    // Execute using the agent executor with custom prompts
    return executor.execute(
      promptContext,
      (ctx) => this.buildInitialPrompt(ctx),
      (ctx, prev, questions, clarity) => this.buildRefinementPrompt(ctx, prev, questions, clarity)
    );
  }

  // ============================================================================
  // PROTECTED METHODS - Override these to customize prompts
  // ============================================================================

  /**
   * Build the initial analysis prompt
   * This is called when the agent first analyzes the commit
   *
   * IMPORTANT: Return a COMPLETE prompt string, do NOT concatenate in callers
   *
   * @param context Full prompt context with agent info and commit data
   * @returns Complete prompt string
   */
  protected abstract buildInitialPrompt(context: PromptContext): Promise<string> | string;

  /**
   * Build the refinement prompt for iterative improvement
   * Override this to customize how the agent refines its analysis
   *
   * Default: Generic refinement prompt based on self-questions
   *
   * @param context Full prompt context
   * @param previousAnalysis The agent's previous analysis (JSON string)
   * @param selfQuestions Questions to address
   * @param clarityScore Current clarity score (0-1)
   * @returns Complete refinement prompt
   */
  protected buildRefinementPrompt(
    context: PromptContext,
    previousAnalysis: string,
    selfQuestions: string[],
    clarityScore: number
  ): string {
    const clarityThreshold =
      context.internalClarityThreshold || this.config.agents?.internalClarityThreshold || 0.75;

    // Default refinement prompt - agents can override
    return `## Self-Review and Refinement

Your previous analysis had a clarity score of ${(clarityScore * 100).toFixed(1)}% (threshold: ${(clarityThreshold * 100).toFixed(1)}%).

Please address these questions to improve your analysis:

${selfQuestions.map((q, i) => `${i + 1}. ${q}`).join('\n')}

## Instructions
- Review your previous response
- Address each question above
- Provide a COMPLETE refined response with all 7 metrics
- Return ONLY valid JSON, no markdown, no extra text

## Previous Response
\`\`\`json
${previousAnalysis}
\`\`\``;
  }
}
