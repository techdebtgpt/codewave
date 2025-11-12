// src/agents/developer-author-agent.ts
// Developer (Commit Author) Agent - Explains implementation decisions and actual time spent

import { AppConfig } from '../config/config.interface';
import { BaseAgentWorkflow, AgentMetadata, AgentWeights } from './base-agent-workflow';
import { AgentContext, AgentResult } from './agent.interface';
import { PromptBuilderService } from '../services/prompt-builder.service';

export class DeveloperAuthorAgent extends BaseAgentWorkflow {
  private config: AppConfig;

  // Self-contained agent configuration
  readonly metadata: AgentMetadata = {
    name: 'developer-author',
    description: 'Explains implementation decisions, trade-offs, and estimates actual time spent',
    role: 'Developer (Author)',
    roleDescription: 'implementation decisions, time spent, and developer perspective',
  };

  readonly expertiseWeights: AgentWeights = {
    functionalImpact: 0.13, // TERTIARY (13%) - Limited business impact focus
    idealTimeHours: 0.167, // SECONDARY (16.7%) - Good estimation perspective
    testCoverage: 0.12, // TERTIARY (12%) - Limited testing expertise
    codeQuality: 0.125, // TERTIARY (12.5%) - Basic quality awareness
    codeComplexity: 0.167, // SECONDARY (16.7%) - Implementation complexity insight
    actualTimeHours: 0.455, // PRIMARY (45.5%) - Implementation time expert
    technicalDebtHours: 0.13, // TERTIARY (13%) - Limited debt assessment
  };

  readonly rolePromptTemplate = `You are the Developer Author who implemented this code. Your role is to explain implementation decisions, trade-offs, and actual time spent. You evaluate the commit across ALL 7 pillars, with special focus on actual implementation time and effort. You provide insight into why certain approaches were chosen, what challenges were encountered, and how long different parts of the implementation took.`;

  readonly systemInstructions = `Explain implementation details and decisions. Your PRIMARY expertise is in actual time spent and implementation effort. Provide clear breakdown of development time and explain implementation choices and challenges encountered.`;

  constructor(config: AppConfig) {
    super();
    this.config = config;
  }

  protected buildSystemPrompt(context: AgentContext): string {
    const currentRound = context.currentRound !== undefined ? context.currentRound : 0;
    const isFinalRound = context.isFinalRound || false;
    const previousContext =
      context.agentResults && context.agentResults.length > 0
        ? context.agentResults
            .map((r: AgentResult) => `**${r.agentName}**: ${r.summary}`)
            .join('\n\n')
        : '';
    const depthMode = (context.depthMode || 'normal') as 'fast' | 'normal' | 'deep';

    return PromptBuilderService.buildCompleteSystemPrompt(
      {
        role: this.metadata.role,
        description: this.metadata.description,
        roleDetailedDescription: this.rolePromptTemplate,
        agentKey: this.metadata.name,
      },
      currentRound,
      isFinalRound,
      previousContext,
      depthMode
    );
  }

  protected async buildHumanPrompt(context: AgentContext): Promise<string> {
    return this.buildMultiRoundPrompt(context);
  }

}
