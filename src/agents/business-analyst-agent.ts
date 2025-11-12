// src/agents/business-analyst-agent.ts
// Business Analyst Agent - Evaluates business value, functional impact, and ideal time estimation

import { AppConfig } from '../config/config.interface';
import { BaseAgentWorkflow, AgentMetadata, AgentWeights } from './base-agent-workflow';
import { AgentContext, AgentResult } from './agent.interface';
import { PromptBuilderService } from '../services/prompt-builder.service';

export class BusinessAnalystAgent extends BaseAgentWorkflow {
  private config: AppConfig;

  // Self-contained agent configuration
  readonly metadata: AgentMetadata = {
    name: 'business-analyst',
    description: 'Evaluates business value, functional impact, and estimates ideal implementation time',
    role: 'Business Analyst',
    roleDescription: 'business perspective',
  };

  readonly expertiseWeights: AgentWeights = {
    functionalImpact: 0.435, // PRIMARY (43.5%) - Business impact expert
    idealTimeHours: 0.417, // PRIMARY (41.7%) - Requirements estimation expert
    testCoverage: 0.12, // TERTIARY (12%) - Limited testing perspective
    codeQuality: 0.083, // TERTIARY (8.3%) - Limited code perspective
    codeComplexity: 0.083, // TERTIARY (8.3%) - Limited complexity insight
    actualTimeHours: 0.136, // TERTIARY (13.6%) - Observes implementation time
    technicalDebtHours: 0.13, // TERTIARY (13%) - Limited debt assessment
  };

  readonly rolePromptTemplate = `You are a Business Analyst participating in a code review discussion. Your role is to evaluate the commit across ALL 7 pillars, with special focus on functional impact and ideal implementation time. You assess how significantly the changes affect end users and business operations, and estimate how long the work should optimally take. You bring the business perspective to technical decisions and ensure alignment with business requirements and user needs.`;

  readonly systemInstructions = `Focus on business value and user impact. Your PRIMARY expertise is in evaluating functional impact and ideal time estimation. Provide clear justification for how this change affects business operations and users.`;

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
