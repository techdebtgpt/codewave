import { Agent, AgentContext, AgentExecutionOptions, AgentResult } from './agent.interface';
import { RunnableSequence, RunnableLambda } from '@langchain/core/runnables';
import { LLMService } from '../llm/llm-service';
import { DEPTH_MODE_CONFIGS } from '../config/depth-modes.constants';
import { StateGraph, START, END, Annotation } from '@langchain/langgraph';

/**
 * LangGraph State Definition for Agent Self-Refinement
 * Manages iterative refinement of agent analysis
 */
export const AgentRefinementState = Annotation.Root({
  // Input context
  context: Annotation<AgentContext>,
  config: Annotation<any>,

  // Current analysis result
  result: Annotation<AgentResult>,

  // Refinement tracking
  iteration: Annotation<number>,
  maxIterations: Annotation<number>,
  clarityThreshold: Annotation<number>,
  clarityScore: Annotation<number>,

  // Gap tracking
  gaps: Annotation<string[]>,
  allSeenGaps: Annotation<Set<string>>({
    reducer: (state: Set<string>, update: Set<string>) => {
      return new Set([...state, ...update]);
    },
    default: () => new Set<string>(),
  }),

  // Refinement notes
  refinementNotes: Annotation<string[]>({
    reducer: (state: string[], update: string[]) => {
      return [...state, ...update];
    },
    default: () => [],
  }),

  // Token usage tracking
  totalInputTokens: Annotation<number>({
    reducer: (state: number, update: number) => state + update,
    default: () => 0,
  }),
  totalOutputTokens: Annotation<number>({
    reducer: (state: number, update: number) => state + update,
    default: () => 0,
  }),
  totalTokens: Annotation<number>({
    reducer: (state: number, update: number) => state + update,
    default: () => 0,
  }),

  // Completion flag
  completed: Annotation<boolean>,
});

export abstract class BaseAgentWorkflow implements Agent {
  abstract getMetadata(): any;

  /**
   * Check if agent can execute given the context
   * Default implementation checks for commitDiff presence
   * Override if agent has specific requirements
   */
  async canExecute(context: AgentContext): Promise<boolean> {
    return !!context.commitDiff;
  }

  /**
   * Estimate tokens for this agent's execution
   * Default implementation returns 2500
   * Override if agent needs custom estimation logic
   */
  async estimateTokens(context: AgentContext): Promise<number> {
    return 2500;
  }

  async execute(context: AgentContext, options?: AgentExecutionOptions): Promise<AgentResult> {
    // Expect config to be present in this.config (injected via constructor)
    const config = (this as any).config;
    if (!config) {
      throw new Error('Missing config in agent. Ensure config is passed to agent constructor.');
    }

    // Get depth config
    const depthMode = context.depthMode || 'normal';
    const depthConfig = DEPTH_MODE_CONFIGS[depthMode];

    // Build the LangGraph refinement workflow
    const graph = this.buildRefinementGraph(depthConfig);

    // Initialize state
    const initialState = {
      context,
      config,
      result: {} as AgentResult, // Will be set in initial analysis
      iteration: 0,
      maxIterations: context.maxInternalIterations || depthConfig.maxInternalIterations,
      clarityThreshold: context.internalClarityThreshold || depthConfig.internalClarityThreshold,
      clarityScore: 0,
      gaps: [],
      allSeenGaps: new Set<string>(),
      refinementNotes: [],
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalTokens: 0,
      completed: false,
    };

    // Execute the graph
    const finalState = await graph.invoke(initialState);

    // Extract final result with accumulated metrics
    const result = finalState.result;
    result.internalIterations = finalState.iteration;
    result.clarityScore = finalState.clarityScore;
    result.refinementNotes = finalState.refinementNotes;
    result.missingInformation = Array.from(finalState.allSeenGaps);

    // Update token usage
    if (!result.tokenUsage) {
      result.tokenUsage = {
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
      };
    }
    result.tokenUsage.inputTokens = finalState.totalInputTokens;
    result.tokenUsage.outputTokens = finalState.totalOutputTokens;
    result.tokenUsage.totalTokens = finalState.totalTokens;

    return result;
  }

  /**
   * Build the LangGraph StateGraph for agent self-refinement
   * Graph structure:
   *   START → runInitialAnalysis → evaluateAndRefine → shouldContinue? → [YES: evaluateAndRefine | NO: END]
   */
  private buildRefinementGraph(depthConfig: any) {
    // Node 1: Run initial analysis
    const runInitialAnalysis = async (state: typeof AgentRefinementState.State) => {
      const result = await this.runInitialAnalysis(state.context, state.config);

      return {
        result,
        iteration: 0,
        totalInputTokens: result.tokenUsage?.inputTokens || 0,
        totalOutputTokens: result.tokenUsage?.outputTokens || 0,
        totalTokens: result.tokenUsage?.totalTokens || 0,
      };
    };

    // Node 2: Evaluate current analysis and refine if needed
    const evaluateAndRefine = async (state: typeof AgentRefinementState.State) => {
      // Self-evaluate the current analysis
      const evaluation = this.evaluateAnalysis(state.result);
      const clarityScore = evaluation.clarityScore;
      const gaps = evaluation.missingInformation;

      // Deduplicate gaps
      const newGaps = gaps.filter((g) => !state.allSeenGaps.has(g));
      const updatedGaps = new Set([...state.allSeenGaps, ...gaps]);

      // Check if we should stop
      if (clarityScore >= state.clarityThreshold) {
        const note = `Stopped at iteration ${state.iteration + 1}: Clarity target ${clarityScore}% >= ${state.clarityThreshold}% threshold`;
        return {
          clarityScore,
          gaps: newGaps,
          allSeenGaps: updatedGaps,
          refinementNotes: [note],
          completed: true,
        };
      }

      if (newGaps.length === 0) {
        const note = `Stopped at iteration ${state.iteration + 1}: No new gaps identified`;
        return {
          clarityScore,
          gaps: newGaps,
          allSeenGaps: updatedGaps,
          refinementNotes: [note],
          completed: true,
        };
      }

      // Generate self-questions for refinement
      const questions = this.generateSelfQuestions(state.result, newGaps).slice(
        0,
        depthConfig.maxSelfQuestions
      );

      if (questions.length === 0) {
        const note = `Stopped at iteration ${state.iteration + 1}: Cannot generate new questions`;
        return {
          clarityScore,
          gaps: newGaps,
          allSeenGaps: updatedGaps,
          refinementNotes: [note],
          completed: true,
        };
      }

      // Refine analysis based on self-questions
      const refinementContext = {
        ...state.context,
        selfQuestions: questions,
        previousAnalysis: state.result,
        gaps: newGaps, // Pass gaps for RAG query generation
      };
      const refinedResult = await this.runRefinementPass(refinementContext, state.config);

      // Merge results (keep better analysis)
      const mergedResult = this.mergeAnalysisResults(state.result, refinedResult);

      const note = `Iteration ${state.iteration + 1}: Clarity ${clarityScore}%, identified ${newGaps.length} gaps, asked ${questions.length} questions`;

      return {
        result: mergedResult,
        iteration: state.iteration + 1,
        clarityScore,
        gaps: newGaps,
        allSeenGaps: updatedGaps,
        refinementNotes: [note],
        totalInputTokens: refinedResult.tokenUsage?.inputTokens || 0,
        totalOutputTokens: refinedResult.tokenUsage?.outputTokens || 0,
        totalTokens: refinedResult.tokenUsage?.totalTokens || 0,
      };
    };

    // Conditional edge: Should continue refinement?
    const shouldContinue = (state: typeof AgentRefinementState.State): typeof END | 'evaluateAndRefine' => {
      // Stop if completed flag is set
      if (state.completed) {
        return END;
      }

      // Stop if max iterations reached
      if (state.iteration >= state.maxIterations) {
        return END;
      }

      // Stop if skipSelfRefinement is enabled
      if (depthConfig.skipSelfRefinement) {
        return END;
      }

      // Continue refinement
      return 'evaluateAndRefine';
    };

    // Build the graph
    const graph = new StateGraph(AgentRefinementState)
      .addNode('runInitialAnalysis', runInitialAnalysis)
      .addNode('evaluateAndRefine', evaluateAndRefine)
      .addEdge(START, 'runInitialAnalysis')
      .addConditionalEdges('runInitialAnalysis', shouldContinue, {
        [END]: END,
        evaluateAndRefine: 'evaluateAndRefine',
      })
      .addConditionalEdges('evaluateAndRefine', shouldContinue, {
        [END]: END,
        evaluateAndRefine: 'evaluateAndRefine',
      })
      .compile();

    return graph;
  }

  /**
   * Run the initial analysis (first pass)
   */
  protected async runInitialAnalysis(context: AgentContext, config: any): Promise<AgentResult> {
    let tokenUsage = {
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
    };

    // Get depth config to use tokenBudgetPerAgent for max_tokens
    const depthMode = context.depthMode || 'normal';
    const depthConfig = DEPTH_MODE_CONFIGS[depthMode];

    const model = LLMService.getChatModel(config, depthConfig.tokenBudgetPerAgent);

    const workflow = RunnableSequence.from([
      RunnableLambda.from(async (input: AgentContext) => {
        const systemPrompt = this.buildSystemPrompt(input);
        const humanPrompt = await Promise.resolve(this.buildHumanPrompt(input));
        return [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: humanPrompt },
        ];
      }),
      (model as any).bind ? (model as any).bind({}) : model,
      RunnableLambda.from(async (output: any) => {
        tokenUsage = this.extractTokenUsage(output, tokenUsage);
        const content = output?.content || output;
        return this.parseLLMResult(content);
      }),
    ]);

    const result = await workflow.invoke(context);
    result.tokenUsage = tokenUsage;
    return result;
  }

  /**
   * Run a refinement pass based on self-questions
   */
  protected async runRefinementPass(context: any, config: any): Promise<AgentResult> {
    let tokenUsage = {
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
    };

    // Get depth config to use tokenBudgetPerAgent for max_tokens
    const depthMode = (context.depthMode || 'normal') as 'fast' | 'normal' | 'deep';
    const depthConfig = DEPTH_MODE_CONFIGS[depthMode];

    const model = LLMService.getChatModel(config, depthConfig.tokenBudgetPerAgent);

    const workflow = RunnableSequence.from([
      RunnableLambda.from(async (input: any) => {
        const systemPrompt = this.buildRefinementSystemPrompt(input);
        const humanPrompt = await this.buildRefinementHumanPrompt(input);
        return [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: humanPrompt },
        ];
      }),
      (model as any).bind ? (model as any).bind({}) : model,
      RunnableLambda.from(async (output: any) => {
        tokenUsage = this.extractTokenUsage(output, tokenUsage);
        const content = output?.content || output;
        return this.parseLLMResult(content);
      }),
    ]);

    const result = await workflow.invoke(context);
    result.tokenUsage = tokenUsage;
    return result;
  }

  /**
   * Extract token usage from LLM response
   */
  protected extractTokenUsage(output: any, currentUsage: any): any {
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
    return currentUsage;
  }

  /**
   * Self-evaluate analysis completeness and clarity
   * Validates all 7 metrics with focus on PRIMARY metrics (weight >= 0.4)
   */
  protected evaluateAnalysis(result: AgentResult): {
    clarityScore: number;
    missingInformation: string[];
  } {
    const summary = (result.summary || '').toLowerCase();
    const details = (result.details || '').toLowerCase();
    const metrics = result.metrics || {};

    const gaps: string[] = [];

    // Import constants
    const { SEVEN_PILLARS, getAgentWeight } = require('../constants/agent-weights.constants');
    const { getMetricDefinition, getRequiredMetrics } = require('../constants/metric-definitions.constants');

    // Get agent name for weight lookup
    const agentMetadata = this.getMetadata();
    const agentName = agentMetadata.name || 'unknown';

    // Separate metrics by priority
    const primaryMetrics: string[] = []; // weight >= 0.4
    const secondaryMetrics: string[] = []; // 0.15 <= weight < 0.4
    const tertiaryMetrics: string[] = []; // weight < 0.15

    for (const pillar of SEVEN_PILLARS) {
      const weight = getAgentWeight(agentName, pillar);
      if (weight >= 0.4) {
        primaryMetrics.push(pillar);
      } else if (weight >= 0.15) {
        secondaryMetrics.push(pillar);
      } else {
        tertiaryMetrics.push(pillar);
      }
    }

    // Calculate clarity based on weighted metric confidence
    let primaryConfidence = 0; // 0-100, weighted by importance
    let secondaryConfidence = 0;
    let tertiaryConfidence = 0;

    // 1. Evaluate PRIMARY metrics (most important - 60% of clarity score)
    for (const pillar of primaryMetrics) {
      const metricDef = getMetricDefinition(pillar);
      const value = metrics[pillar];

      if (value === undefined) {
        gaps.push(`CRITICAL: Missing PRIMARY metric ${pillar} - you have ${(getAgentWeight(agentName, pillar) * 100).toFixed(1)}% expertise in this`);
        primaryConfidence += 0; // No confidence
      } else if (value === null) {
        // Null is only acceptable if metric allows it and is justified
        if (metricDef && !metricDef.canBeNull) {
          gaps.push(`CRITICAL: ${pillar} cannot be null - this is a required metric`);
          primaryConfidence += 0;
        } else {
          const hasJustification = this.checkJustification(pillar, summary, details);
          if (!hasJustification) {
            gaps.push(`PRIMARY metric ${pillar} is null but not justified - explain why you cannot assess it`);
            primaryConfidence += 30; // Partial confidence
          } else {
            primaryConfidence += 70; // Good confidence if justified
          }
        }
      } else if (typeof value === 'number') {
        // Numeric score - check if reasoning exists
        const hasReasoning = this.checkJustification(pillar, summary, details);
        if (!hasReasoning) {
          gaps.push(`PRIMARY metric ${pillar} score (${value}) needs detailed justification - this is your expertise area`);
          primaryConfidence += 50; // Partial confidence
        } else {
          primaryConfidence += 100; // Full confidence
        }
      }
    }

    // 2. Evaluate SECONDARY metrics (30% of clarity score)
    for (const pillar of secondaryMetrics) {
      const metricDef = getMetricDefinition(pillar);
      const value = metrics[pillar];

      if (value === undefined) {
        gaps.push(`Missing secondary metric ${pillar} - provide your informed opinion`);
        secondaryConfidence += 0;
      } else if (value === null) {
        const hasJustification = this.checkJustification(pillar, summary, details);
        if (!hasJustification && metricDef && !metricDef.canBeNull) {
          gaps.push(`Secondary metric ${pillar} needs justification for null value`);
          secondaryConfidence += 40;
        } else {
          secondaryConfidence += 80;
        }
      } else if (typeof value === 'number') {
        const hasReasoning = this.checkJustification(pillar, summary, details);
        secondaryConfidence += hasReasoning ? 100 : 70;
      }
    }

    // 3. Evaluate TERTIARY metrics (10% of clarity score)
    for (const pillar of tertiaryMetrics) {
      const value = metrics[pillar];
      if (value !== undefined) {
        tertiaryConfidence += 100;
      } else {
        gaps.push(`Missing tertiary metric ${pillar} - provide at least a rough estimate`);
        tertiaryConfidence += 0;
      }
    }

    // Calculate weighted clarity score
    const primaryWeight = 0.6;
    const secondaryWeight = 0.3;
    const tertiaryWeight = 0.1;

    const avgPrimary = primaryMetrics.length > 0 ? primaryConfidence / primaryMetrics.length : 100;
    const avgSecondary = secondaryMetrics.length > 0 ? secondaryConfidence / secondaryMetrics.length : 100;
    const avgTertiary = tertiaryMetrics.length > 0 ? tertiaryConfidence / tertiaryMetrics.length : 100;

    let clarityScore = (avgPrimary * primaryWeight) + (avgSecondary * secondaryWeight) + (avgTertiary * tertiaryWeight);

    // Bonus for comprehensive summary and details
    if (summary.length > 50) clarityScore += 3;
    if (details.length > 200) clarityScore += 2;

    return {
      clarityScore: Math.min(100, Math.max(0, clarityScore)),
      missingInformation: gaps,
    };
  }

  /**
   * Check if a pillar score has justification in summary or details
   */
  private checkJustification(pillar: string, summary: string, details: string): boolean {
    const keywords = this.getPillarKeywords(pillar);
    return keywords.some(keyword =>
      details.includes(keyword.toLowerCase()) || summary.includes(keyword.toLowerCase())
    );
  }

  /**
   * Get relevant keywords for each pillar to detect justification
   */
  private getPillarKeywords(pillar: string): string[] {
    const keywordMap: Record<string, string[]> = {
      functionalImpact: ['impact', 'functional', 'feature', 'user', 'business', 'value'],
      idealTimeHours: ['ideal', 'time', 'estimate', 'hours', 'effort', 'should take'],
      testCoverage: ['test', 'coverage', 'testing', 'automated', 'unit', 'integration'],
      codeQuality: ['quality', 'maintainable', 'readable', 'clean', 'standards'],
      codeComplexity: ['complexity', 'complex', 'simple', 'cognitive', 'cyclomatic'],
      actualTimeHours: ['actual', 'spent', 'took', 'implemented', 'time taken'],
      technicalDebtHours: ['debt', 'technical', 'shortcut', 'refactor', 'maintenance'],
    };
    return keywordMap[pillar] || [pillar];
  }

  /**
   * Generate self-questions for refinement based on identified gaps
   * Creates specific questions to help agents refine their analysis
   */
  protected generateSelfQuestions(result: AgentResult, gaps: string[]): string[] {
    const questions: string[] = [];
    const { SEVEN_PILLARS } = require('../constants/agent-weights.constants');

    // Group gaps by type
    const missingMetrics = gaps.filter(g => g.includes('Missing metric:'));
    const nullJustifications = gaps.filter(g => g.includes('needs justification'));
    const weakReasoning = gaps.filter(g => g.includes('should be explained'));

    // Generate questions for missing metrics
    for (const gap of missingMetrics) {
      const pillar = SEVEN_PILLARS.find((p: string) => gap.includes(p));
      if (pillar) {
        questions.push(this.getMetricQuestion(pillar, 'missing'));
      }
    }

    // Generate questions for unjustified nulls
    for (const gap of nullJustifications) {
      const pillar = SEVEN_PILLARS.find((p: string) => gap.includes(p));
      if (pillar) {
        questions.push(this.getMetricQuestion(pillar, 'null'));
      }
    }

    // Generate questions for weak reasoning
    for (const gap of weakReasoning) {
      const pillar = SEVEN_PILLARS.find((p: string) => gap.includes(p));
      if (pillar) {
        questions.push(this.getMetricQuestion(pillar, 'reasoning'));
      }
    }

    // If no specific gaps, ask general improvement questions
    if (questions.length === 0 && gaps.length > 0) {
      questions.push('What additional details would make this analysis more complete and actionable?');
      questions.push('Are there any assumptions I made that should be validated or clarified?');
    }

    return questions;
  }

  /**
   * Generate metric-specific refinement questions
   */
  private getMetricQuestion(pillar: string, type: 'missing' | 'null' | 'reasoning'): string {
    const questionMap: Record<string, Record<string, string>> = {
      functionalImpact: {
        missing: 'What is the functional impact of this change on users and business value (1-10 scale)?',
        null: 'If I cannot assess functional impact, what specific information am I missing about the feature or business context?',
        reasoning: 'What specific functional changes justify my impact score? Which users or workflows are affected?',
      },
      idealTimeHours: {
        missing: 'How many hours would an ideal implementation of this change require based on the scope?',
        null: 'If I cannot estimate ideal time, what requirements or specifications am I missing?',
        reasoning: 'What factors went into my time estimate (complexity, dependencies, unknowns)?',
      },
      testCoverage: {
        missing: 'What is the test coverage quality for this change (1-10 scale)?',
        null: 'If I cannot assess test coverage, what information about tests or testing strategy am I missing?',
        reasoning: 'What specific test types, coverage, or quality factors justify my test coverage score?',
      },
      codeQuality: {
        missing: 'How would I rate the code quality of this implementation (1-10 scale)?',
        null: 'If I cannot assess code quality, what aspects of the implementation am I unable to evaluate?',
        reasoning: 'What code quality factors (readability, maintainability, standards) support my score?',
      },
      codeComplexity: {
        missing: 'What is the complexity level of this change (1-10 scale, lower is better)?',
        null: 'If I cannot assess complexity, what architectural or implementation details am I missing?',
        reasoning: 'What complexity factors (cognitive load, dependencies, logic) justify my complexity score?',
      },
      actualTimeHours: {
        missing: 'How many hours did this implementation actually take based on the scope of changes?',
        null: 'If I cannot estimate actual time, what clues about implementation effort am I missing from the diff?',
        reasoning: 'What evidence from the diff supports my actual time estimate?',
      },
      technicalDebtHours: {
        missing: 'How much technical debt (in future hours) was introduced (+) or eliminated (-)?',
        null: 'If I cannot assess technical debt, what information about shortcuts, maintainability, or future work am I missing?',
        reasoning: 'What specific debt factors (shortcuts, maintainability issues, future refactoring needs) justify my debt score?',
      },
    };

    return questionMap[pillar]?.[type] || `How can I better assess ${pillar}?`;
  }

  /**
   * Merge two analysis results, keeping the more complete one
   */
  protected mergeAnalysisResults(current: AgentResult, refined: AgentResult): AgentResult {
    // Prefer refined if it's longer/more detailed
    const currentLength = (current.details || '').length;
    const refinedLength = (refined.details || '').length;

    if (refinedLength > currentLength) {
      return {
        ...refined,
        tokenUsage: current.tokenUsage, // Keep cumulative token count
      };
    }
    return current;
  }

  protected buildSystemPrompt(context: AgentContext): string {
    return `You are the ${this.getMetadata().role} agent. Analyze the commit diff.`;
  }

  protected buildRefinementSystemPrompt(context: any): string {
    const depthMode = (context.depthMode || 'normal') as 'fast' | 'normal' | 'deep';
    const config = DEPTH_MODE_CONFIGS[depthMode];

    return [
      `You are the ${this.getMetadata().role} agent in ${depthMode.toUpperCase()} analysis mode. Refine your previous analysis based on identified gaps.`,
      '',
      '## Critical Requirements for Refinement',
      '- CRITICAL: You MUST return ONLY valid JSON, no markdown, no extra text',
      `- Keep summary under ${config.summaryLimit} characters`,
      `- Keep details under ${config.detailsLimit} characters`,
      `- ${config.approach}`,
      '- Maintain all 7 metrics in your refined response',
      '- Address the specific gaps and questions raised',
    ].join('\n');
  }

  /**
   * Helper method for building multi-round prompts
   * Child agents can use this to build consistent round-based prompts
   * All agent identity information is derived from getMetadata()
   */
  protected async buildMultiRoundPrompt(context: AgentContext): Promise<string> {
    // Import centralized constants
    const { AGENT_EXPERTISE_WEIGHTS } = require('../constants/agent-weights.constants');
    const { PromptBuilderService } = require('../services/prompt-builder.service');

    // Get agent identity from metadata
    const metadata = this.getMetadata();
    const agentKey = metadata.name; // Technical key (e.g., 'business-analyst', 'sdet')
    const agentName = metadata.role; // Display name (e.g., 'Business Analyst', 'SDET')
    const roleDescription = metadata.roleDescription; // e.g., 'business perspective'

    // Get agent weights and derive metric priorities
    const weights = AGENT_EXPERTISE_WEIGHTS[agentKey];
    if (!weights) {
      throw new Error(`Unknown agent key: ${agentKey}`);
    }

    // Get metric definitions from PromptBuilderService
    const metricDefs = PromptBuilderService.getMetricDefinitions(agentKey);

    // Categorize metrics by weight (same logic as evaluateAnalysis)
    const primaryMetrics: string[] = [];
    const secondaryMetrics: string[] = [];
    const tertiaryMetrics: string[] = [];

    const { SEVEN_PILLARS } = require('../constants/agent-weights.constants');
    for (const pillar of SEVEN_PILLARS) {
      const weight = weights[pillar] || 0;
      const def = metricDefs[pillar];
      const displayName = def.displayName;

      if (weight >= 0.4) {
        primaryMetrics.push(displayName);
      } else if (weight >= 0.15) {
        secondaryMetrics.push(displayName);
      } else {
        tertiaryMetrics.push(displayName);
      }
    }

    const filesChanged = context.filesChanged?.join(', ') || 'unknown files';
    const currentRound = context.currentRound !== undefined ? context.currentRound : 0;
    const isFirstRound = currentRound === 0;
    const isFinalRound = context.isFinalRound || false;
    const hasTeamContext = context.agentResults && context.agentResults.length > 0;

    // Prepare developer overview section if available
    const developerContextSection = context.developerOverview
      ? `${context.developerOverview}\n\n---\n\n`
      : '';

    // Build prompt sections
    const sections: string[] = [developerContextSection];

    // Round 1: Initial analysis with optional RAG
    if (isFirstRound) {
      // Use RAG if available for large diffs
      let contentSection = '';
      if (context.vectorStore || context.documentationStore) {
        const { CombinedRAGHelper } = await import('../utils/combined-rag-helper.js');
        const { getInitialQueriesForRole } = await import('../utils/gap-to-rag-query-mapper.js');
        const rag = new CombinedRAGHelper(context.vectorStore, context.documentationStore);
        rag.setAgentName(agentName);

        // Get role-specific initial queries from the centralized mapper
        const queries = getInitialQueriesForRole(agentKey);
        const results = await rag.queryMultiple(queries);
        const ragContext = results.map((r) => r.results).join('\n\n');

        contentSection = [
          rag.getSummary(),
          '',
          `**Relevant Code for ${agentName} Analysis:**`,
          ragContext,
          '',
        ].join('\n');
      } else {
        // Fallback to full diff for small commits (no RAG needed)
        contentSection = [
          '**Commit Diff:**',
          '```',
          context.commitDiff,
          '```',
          '',
        ].join('\n');
      }

      sections.push(
        `## ${agentName} - Round ${currentRound + 1}: Initial Analysis`,
        '',
        `**Files Changed:** ${filesChanged}`,
        '',
        contentSection,
        '**Your Task:**',
        `Analyze the commit from a ${roleDescription} and score ALL 7 metrics:`
      );

      // Add primary metrics
      primaryMetrics.forEach((metric, idx) => {
        sections.push(`${idx + 1}. **${metric}** - YOUR PRIMARY EXPERTISE`);
      });

      // Add secondary metrics if provided
      let metricIdx = primaryMetrics.length;
      if (secondaryMetrics.length > 0) {
        secondaryMetrics.forEach((metric) => {
          sections.push(`${++metricIdx}. **${metric}** - your secondary opinion`);
        });
      }

      // Add tertiary metrics if provided
      if (tertiaryMetrics.length > 0) {
        tertiaryMetrics.forEach((metric) => {
          sections.push(`${++metricIdx}. **${metric}** - your tertiary opinion`);
        });
      }

      sections.push(
        '',
        `Focus on your expertise (${primaryMetrics.join(', ')}) but provide scores for all pillars.`,
        'For metrics outside your expertise, provide reasonable estimates based on the code changes.'
      );
    } else if (hasTeamContext) {
      // Subsequent rounds: Review team discussion and refine
      const teamContext = context.agentResults!
        .map(
          (r) =>
            `**${r.agentName}:**\n${r.summary}\n\nMetrics: ${JSON.stringify(r.metrics, null, 2)}`
        )
        .join('\n\n---\n\n');

      sections.push(
        `## ${agentName} - Round ${currentRound + 1}: ${isFinalRound ? 'Final Review' : 'Team Discussion'}`,
        '',
        `**Files Changed:** ${filesChanged}`,
        '',
        `**Original Context (for reference):**`,
        '```',
        context.developerOverview || 'Developer overview not available',
        '```',
        '',
        `**Team Discussion (Previous Rounds):**`,
        teamContext,
        '',
        '**Your Task:**'
      );

      if (isFinalRound) {
        sections.push(
          '1. Review all previous team discussions',
          `2. Address any final concerns raised about YOUR scores (${primaryMetrics.join(', ')})`,
          "3. Validate your assessment against other agents' perspectives",
          '4. Provide FINAL scores for all 7 metrics with high confidence',
          '',
          'This is the final round - be decisive and confident in your assessment.'
        );
      } else {
        sections.push(
          "1. Review other agents' metrics from previous rounds",
          `2. Identify any scores that seem inconsistent with ${roleDescription}`,
          '3. Raise specific questions or concerns to other agents about their scores',
          `4. Defend or adjust your scores (${primaryMetrics.join(', ')}) based on team feedback`,
          '5. Provide refined scores for all 7 metrics',
          '',
          'Engage in collaborative discussion to converge toward accurate metrics.'
        );
      }
    } else {
      // Fallback: No team context available (shouldn't happen in normal flow)
      sections.push(
        `## ${agentName} - Round ${currentRound + 1}`,
        '',
        `**Files Changed:** ${filesChanged}`,
        '',
        '**Commit Diff:**',
        '```',
        context.commitDiff,
        '```',
        '',
        'Please provide your analysis scoring ALL 7 metrics.'
      );
    }

    return sections.join('\n');
  }

  /**
   * Helper: Get null metrics fallback object
   * When LLM parsing fails, we should return null for all metrics
   * rather than arbitrary default values (0 or 5).
   * This maintains the principle that unknown/unparseable = null.
   */
  protected getNullMetricsFallback(): Record<string, null> {
    return {
      functionalImpact: null,
      idealTimeHours: null,
      testCoverage: null,
      codeQuality: null,
      codeComplexity: null,
      actualTimeHours: null,
      technicalDebtHours: null,
    };
  }

  protected buildHumanPrompt(context: AgentContext): string | Promise<string> {
    return context.commitDiff;
  }

  protected async buildRefinementHumanPrompt(context: any): Promise<string> {
    const questions = (context.selfQuestions || [])
      .map((q: string, i: number) => `${i + 1}. ${q}`)
      .join('\n');
    const prevAnalysis = context.previousAnalysis?.details || 'No previous analysis';

    // Generate RAG queries from gaps if available
    let ragContextSection = '';
    if (context.gaps && context.gaps.length > 0 && (context.vectorStore || context.documentationStore)) {
      const { generateRAGQueriesFromGaps } = await import('../utils/gap-to-rag-query-mapper.js');
      const { CombinedRAGHelper } = await import('../utils/combined-rag-helper.js');

      // Generate targeted RAG queries from identified gaps
      const ragQueries = generateRAGQueriesFromGaps(context.gaps);

      if (ragQueries.length > 0) {
        const rag = new CombinedRAGHelper(context.vectorStore, context.documentationStore);
        const agentName = this.getMetadata().name || 'Agent';
        rag.setAgentName(agentName);

        // Execute RAG queries to get relevant context
        const results = await rag.queryMultiple(ragQueries);
        const ragContext = results.map((r) => r.results).join('\n\n');

        if (ragContext.trim().length > 0) {
          ragContextSection = [
            '',
            '## Additional Context from Code Search',
            '',
            'Based on your identified gaps, here is relevant code context:',
            '',
            ragContext,
            '',
            '---',
            '',
          ].join('\n');
        }
      }
    }

    return [
      'Previous analysis:',
      prevAnalysis,
      '',
      ragContextSection,
      'Refinement questions to address:',
      questions,
      '',
      'Please refine your analysis to address these gaps.',
      'IMPORTANT: Return your response ONLY as a valid JSON object with the same structure as before (summary, details, metrics).',
      'Do NOT include markdown, explanations, or extra text outside the JSON.',
    ].join('\n');
  }

  /**
   * Safely parse JSON from LLM output, handling markdown fences and truncation
   * Uses brace-counting to find the complete JSON object
   */
  protected parseJSONSafely(output: string): any {
    let cleaned = output.trim();

    // Remove markdown fences more carefully (before and after)
    cleaned = cleaned.replace(/^```(?:json|javascript)?\s*\n?/i, '');
    cleaned = cleaned.replace(/\n?```\s*$/i, '');
    cleaned = cleaned.trim();

    // Find the start of the JSON object
    const jsonStart = cleaned.indexOf('{');
    if (jsonStart === -1) {
      throw new Error('No JSON object found in output');
    }

    // Count braces from the start to find the complete JSON object
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

    // Extract exactly the balanced JSON portion
    const jsonStr = cleaned.substring(jsonStart, jsonEnd + 1);

    // Parse and return
    const parsed = JSON.parse(jsonStr);
    return parsed;
  }

  protected parseLLMResult(output: any): AgentResult {
    // Import centralized pillar constants
    const { SEVEN_PILLARS } = require('../constants/agent-weights.constants');

    // Try to parse JSON output from LLM
    if (typeof output === 'string') {
      try {
        // Use robust JSON parsing that handles markdown fences and truncation
        const parsed = this.parseJSONSafely(output);

        // Validate required fields
        if (!parsed.summary || typeof parsed.summary !== 'string') {
          const agentName = this.getMetadata().name || 'Agent';
          console.warn(`${agentName}: Invalid summary in LLM response`);
          throw new Error('Missing or invalid summary field');
        }

        // Handle metrics: ensure it's an object with 7 pillars, filter out extras
        let metrics = parsed.metrics || {};

        // If metrics is an array, convert to object
        if (Array.isArray(metrics)) {
          const agentName = this.getMetadata().name || 'Agent';
          console.warn(`${agentName}: Metrics returned as array, converting to object`);
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
              // If present but invalid type, set to null
              const agentName = this.getMetadata().name || 'Agent';
              console.warn(`${agentName}: Invalid type for ${pillar}, setting to null`);
              filteredMetrics[pillar] = null;
            }
          } else {
            // Missing metric - set to null (agent failed to provide it)
            const agentName = this.getMetadata().name || 'Agent';
            console.warn(`${agentName}: Missing metric ${pillar}, setting to null`);
            filteredMetrics[pillar] = null;
          }
        }

        return {
          summary: parsed.summary.trim(),
          details: (parsed.details || '').trim(),
          metrics: filteredMetrics,
        };
      } catch (error) {
        const agentName = this.getMetadata().name || 'Agent';
        console.warn(
          `${agentName}: Failed to parse LLM output: ${error instanceof Error ? error.message : String(error)}`
        );
        console.warn(`${agentName}: Raw output (first 500 chars): ${output.substring(0, 500)}`);

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
}
