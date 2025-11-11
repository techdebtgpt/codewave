import { Agent, AgentContext, AgentExecutionOptions, AgentResult } from './agent.interface';
import { RunnableSequence, RunnableLambda } from '@langchain/core/runnables';
import { LLMService } from '../llm/llm-service';
import { DEPTH_MODE_CONFIGS } from '../config/depth-modes.constants';

export abstract class BaseAgentWorkflow implements Agent {
  abstract getMetadata(): any;
  abstract canExecute(context: AgentContext): Promise<boolean>;
  abstract estimateTokens(context: AgentContext): Promise<number>;

  async execute(context: AgentContext, options?: AgentExecutionOptions): Promise<AgentResult> {
    // Example LCEL workflow: system prompt -> LLM -> parse -> return
    // Expect config to be present in this.config (injected via constructor)
    const config = (this as any).config;
    if (!config) {
      throw new Error('Missing config in agent. Ensure config is passed to agent constructor.');
    }

    // Get depth config
    const depthMode = context.depthMode || 'normal';
    const depthConfig = DEPTH_MODE_CONFIGS[depthMode];

    // Run initial analysis with optional self-refinement iterations
    let result = await this.runInitialAnalysis(context, config);
    let totalTokens = result.tokenUsage?.totalTokens || 0;
    let iteration = 0;
    let clarityScore = 50; // Default initial clarity
    const refinementNotes: string[] = [];
    const allSeenGaps = new Set<string>();

    // Self-refinement iterations (if not skipping and depth mode allows)
    if (!depthConfig.skipSelfRefinement && depthMode !== 'fast') {
      for (
        iteration = 1;
        iteration < (context.maxInternalIterations || depthConfig.maxInternalIterations);
        iteration++
      ) {
        // Self-evaluate the current analysis
        const evaluation = this.evaluateAnalysis(result);
        clarityScore = evaluation.clarityScore;
        const gaps = evaluation.missingInformation;

        // Deduplicate gaps
        const newGaps = gaps.filter((g) => !allSeenGaps.has(g));
        gaps.forEach((g) => allSeenGaps.add(g));

        // Check if we should continue
        if (
          clarityScore >= (context.internalClarityThreshold || depthConfig.internalClarityThreshold)
        ) {
          const note = `Stopped at iteration ${iteration}: Clarity target ${clarityScore}% >= ${context.internalClarityThreshold || depthConfig.internalClarityThreshold}% threshold`;
          refinementNotes.push(note);
          break;
        }

        if (newGaps.length === 0) {
          const note = `Stopped at iteration ${iteration}: No new gaps identified`;
          refinementNotes.push(note);
          break;
        }

        // Generate self-questions for refinement
        const questions = this.generateSelfQuestions(result, newGaps).slice(
          0,
          depthConfig.maxSelfQuestions
        );

        if (questions.length === 0) {
          const note = `Stopped at iteration ${iteration}: Cannot generate new questions`;
          refinementNotes.push(note);
          break;
        }

        // Refine analysis based on self-questions
        const refinementContext = {
          ...context,
          selfQuestions: questions,
          previousAnalysis: result,
        };
        const refinedResult = await this.runRefinementPass(refinementContext, config);
        totalTokens += refinedResult.tokenUsage?.totalTokens || 0;

        // Merge results (keep better analysis)
        result = this.mergeAnalysisResults(result, refinedResult);

        const note = `Iteration ${iteration}: Clarity ${clarityScore}%, identified ${newGaps.length} gaps, asked ${questions.length} questions`;
        refinementNotes.push(note);
      }
    }

    // Set internal iteration metrics
    result.internalIterations = iteration;
    result.clarityScore = clarityScore;
    result.refinementNotes = refinementNotes;
    result.missingInformation = Array.from(allSeenGaps);

    // Update total token usage
    if (result.tokenUsage) {
      result.tokenUsage.totalTokens = totalTokens;
    }

    return result;
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
    const depthMode = context.depthMode || 'normal';
    const depthConfig = DEPTH_MODE_CONFIGS[depthMode];

    const model = LLMService.getChatModel(config, depthConfig.tokenBudgetPerAgent);

    const workflow = RunnableSequence.from([
      RunnableLambda.from(async (input: any) => {
        const systemPrompt = this.buildRefinementSystemPrompt(input);
        const humanPrompt = this.buildRefinementHumanPrompt(input);
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
   * Default implementation can be overridden by subclasses
   */
  protected evaluateAnalysis(result: AgentResult): {
    clarityScore: number;
    missingInformation: string[];
  } {
    // Simple heuristic: longer details = more complete
    const detailLength = (result.details || '').length;
    const clarityScore = Math.min(100, 30 + Math.floor(detailLength / 50));

    // Default: no gaps identified (subclasses can override)
    const missingInformation: string[] = [];

    return { clarityScore, missingInformation };
  }

  /**
   * Generate self-questions for refinement
   * Default: no questions (subclasses should override for domain-specific refinement)
   */
  protected generateSelfQuestions(result: AgentResult, gaps: string[]): string[] {
    // Default implementation can be overridden by specific agents
    return gaps.slice(0, 3).map((gap) => `How can I better analyze: ${gap}?`);
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
    return [
      `You are the ${this.getMetadata().role} agent. Refine your previous analysis based on identified gaps.`,
      '',
      '## Critical Requirements for Refinement',
      '- CRITICAL: You MUST return ONLY valid JSON, no markdown, no extra text',
      '- Keep summary under 150 characters',
      '- Keep details under 400 characters',
      '- Be concise: prioritize metrics over lengthy explanations',
      '- Maintain all 7 metrics in your refined response',
      '- Address the specific gaps and questions raised',
    ].join('\n');
  }

  protected buildHumanPrompt(context: AgentContext): string | Promise<string> {
    return context.commitDiff;
  }

  protected buildRefinementHumanPrompt(context: any): string {
    const questions = (context.selfQuestions || [])
      .map((q: string, i: number) => `${i + 1}. ${q}`)
      .join('\n');
    const prevAnalysis = context.previousAnalysis?.details || 'No previous analysis';
    return [
      'Previous analysis:',
      prevAnalysis,
      '',
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
    // Default: return as summary
    return {
      summary: typeof output === 'string' ? output : JSON.stringify(output),
      details: '',
      metrics: {},
    };
  }
}
