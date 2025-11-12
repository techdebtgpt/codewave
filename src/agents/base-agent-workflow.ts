import { Agent, AgentContext, AgentExecutionOptions, AgentResult } from './agent.interface';
import { RunnableSequence, RunnableLambda } from '@langchain/core/runnables';
import { LLMService } from '../llm/llm-service';
import { DEPTH_MODE_CONFIGS } from '../config/depth-modes.constants';
import {
  AGENT_METRIC_DEFINITIONS,
  MetricGuidelinesSet,
} from '../constants/agent-metric-definitions.constants';

export interface AgentMetadata {
  name: string;
  description: string;
  role: string;
  roleDescription: string;
}

// Re-export for backward compatibility
export type MetricDefinition = MetricGuidelinesSet;

export type AgentWeights = Record<string, number>;

export abstract class BaseAgentWorkflow implements Agent {
  // Abstract properties - each agent must define these
  abstract readonly metadata: AgentMetadata;
  abstract readonly expertiseWeights: AgentWeights;
  abstract readonly rolePromptTemplate: string;
  abstract readonly systemInstructions: string;

  // Centralized metric definitions - same for all agents
  readonly metricDefinitions: Record<string, MetricDefinition> = AGENT_METRIC_DEFINITIONS;

  getMetadata(): AgentMetadata {
    return this.metadata;
  }

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

    // Run initial analysis - the modern multi-round discussion happens at the orchestrator level
    // (see commit-evaluation-graph.ts for the full refinement workflow)
    const result = await this.runInitialAnalysis(context, config);
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
    const isFinalRound = context.isFinalRound || false;

    const concernsToAddress = (context.teamConcerns || [])
      .map((c: any) => `- "${c.concern}" (raised by ${c.agentName})`)
      .join('\n');

    return [
      `You are the ${this.getMetadata().role} agent in ${depthMode.toUpperCase()} analysis mode. ${isFinalRound ? 'Finalize your analysis with high confidence.' : 'Refine your previous analysis based on team discussion.'}`,
      '',
      '## Critical Requirements for Refinement',
      '- CRITICAL: You MUST return ONLY valid JSON, no markdown, no extra text',
      `- Keep summary under ${config.summaryLimit} characters`,
      `- Keep details under ${config.detailsLimit} characters`,
      `- ${config.approach}`,
      '- Maintain all 7 metrics in your refined response',
      '',
      '## What to Include in Your Response',
      '1. **Metrics**: Provide all 7 scores with confidence levels',
      `2. **Concerns**: List specific concerns about metrics (e.g., "Need more test coverage details from SDET agent")`,
      `3. **Questions for Team**: Ask other agents specific questions about inconsistencies you noticed`,
      `4. **Addressed Concerns**: Acknowledge which team concerns you addressed in your revision`,
      '',
      concernsToAddress ? `## Team Concerns to Address:\n${concernsToAddress}` : '',
    ].filter(s => s).join('\n');
  }

  /**
   * Helper method for building multi-round prompts
   * Child agents can use this to build consistent round-based prompts
   * All agent identity information is derived from agent's own properties
   */
  protected async buildMultiRoundPrompt(context: AgentContext): Promise<string> {
    // Get agent identity from metadata
    const metadata = this.metadata;
    const agentKey = metadata.name; // Technical key (e.g., 'business-analyst', 'sdet')
    const agentName = metadata.role; // Display name (e.g., 'Business Analyst', 'SDET')
    const roleDescription = metadata.roleDescription; // e.g., 'business perspective'

    // Get agent's own weights and metric definitions
    const weights = this.expertiseWeights;
    const metricDefs = this.metricDefinitions;

    // Categorize metrics by weight (same logic as evaluateAnalysis)
    const primaryMetrics: string[] = [];
    const secondaryMetrics: string[] = [];
    const tertiaryMetrics: string[] = [];

    for (const pillar of Object.keys(weights)) {
      const weight = weights[pillar] || 0;
      const def = metricDefs[pillar];
      const displayName = def.name;

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
    const isFinalRound = context.isFinalRound || false;

    // Get team concerns for this agent (concerns raised by others or about this agent's metrics)
    const teamConcerns = (context.teamConcerns || [])
      .filter((c: any) => c.agentName !== this.metadata.name) // Don't show own concerns
      .map((c: any, i: number) => `${i + 1}. **${c.concern}** (from ${c.agentName})`)
      .join('\n');

    // Build team context section
    let teamContextSection = '';
    if (context.agentResults && context.agentResults.length > 0) {
      const teamContext = context.agentResults
        .map((r: AgentResult) => {
          let result = `**${r.agentName}** (Round ${r.round || '?'}):\n${r.summary}`;
          if (r.concerns && r.concerns.length > 0) {
            result += `\nConcerns: ${r.concerns.join('; ')}`;
          }
          return result;
        })
        .join('\n\n---\n\n');

      teamContextSection = [
        '## Team Discussion Context',
        '',
        'Here is what other agents have said so far:',
        '',
        teamContext,
        '',
      ].join('\n');
    }

    // Generate RAG queries from team concerns if available
    let ragContextSection = '';
    if (teamConcerns && (context.vectorStore || context.documentationStore)) {
      const { generateRAGQueriesFromGaps } = await import('../utils/gap-to-rag-query-mapper.js');
      const { CombinedRAGHelper } = await import('../utils/combined-rag-helper.js');

      // Use team concerns as input for RAG queries
      const concernsList = (context.teamConcerns || [])
        .map((c: any) => c.concern)
        .slice(0, 3); // Limit to first 3 concerns

      if (concernsList.length > 0) {
        const ragQueries = generateRAGQueriesFromGaps(concernsList);

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
              '## Additional Code Context for Your Refinement',
              '',
              'Based on team concerns, here is relevant code to help refine your analysis:',
              '',
              ragContext,
              '',
              '---',
              '',
            ].join('\n');
          }
        }
      }
    }

    // Build refinement instructions
    const refinementInstructions = isFinalRound
      ? [
          '## Final Review Task',
          '',
          'This is the final round. Carefully address remaining concerns and provide your definitive scores with high confidence.',
        ].join('\n')
      : [
          '## Your Refinement Task',
          '',
          '1. **Review** the team discussion and concerns above',
          '2. **Address** specific questions or concerns raised about YOUR metrics (${primaryMetrics})',
          '3. **Validate** your scores against team feedback',
          '4. **Raise concerns** of your own about other agents\' inconsistent scores',
          '5. **Ask questions** to clarify any ambiguities',
        ].join('\n');

    return [
      teamContextSection,
      '',
      teamConcerns ? `## Specific Concerns to Address:\n\n${teamConcerns}` : '',
      '',
      ragContextSection,
      refinementInstructions,
      '',
      '## Response Format',
      'Return ONLY a valid JSON object with:',
      '- summary: Your refined analysis summary',
      '- details: Detailed explanation of your reasoning',
      '- metrics: All 7 metric scores (same structure as initial round)',
      '- concerns: NEW concerns you identified in this round (list of strings)',
      '- questionsForTeam: NEW questions you have for other agents (list of strings)',
      '- addressedConcerns: Which team concerns you addressed (array of objects with: fromAgentName, concern, addressed, explanation)',
      '',
      'CRITICAL: Return ONLY valid JSON, no markdown, no extra text.',
    ].filter(s => s).join('\n');
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

        // Extract LLM-generated concerns and questions
        const concerns = Array.isArray(parsed.concerns)
          ? parsed.concerns.filter((c: any) => typeof c === 'string').slice(0, 5)
          : [];

        const questionsForTeam = Array.isArray(parsed.questionsForTeam)
          ? parsed.questionsForTeam.filter((q: any) => typeof q === 'string').slice(0, 5)
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
          questionsForTeam: questionsForTeam.length > 0 ? questionsForTeam : undefined,
          addressedConcerns: addressedConcerns.length > 0 ? addressedConcerns : undefined,
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
