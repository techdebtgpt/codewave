// src/agents/developer-reviewer-agent.ts
// Developer Reviewer Agent - Provides code review feedback and evaluates code quality

import { AppConfig } from '../config/config.interface';
import { BaseAgentWorkflow, AgentMetadata, MetricDefinition, AgentWeights } from './base-agent-workflow';
import { AgentContext, AgentResult } from './agent.interface';
import { PromptBuilderService } from '../services/prompt-builder.service';

export class DeveloperReviewerAgent extends BaseAgentWorkflow {
  private config: AppConfig;

  // Self-contained agent configuration
  readonly metadata: AgentMetadata = {
    name: 'developer-reviewer',
    description: 'Reviews code quality, suggests improvements, and evaluates implementation details',
    role: 'Developer Reviewer',
    roleDescription: 'code quality, readability, and best practices perspective',
  };

  readonly expertiseWeights: AgentWeights = {
    functionalImpact: 0.13, // TERTIARY (13%) - Limited business impact focus
    idealTimeHours: 0.125, // TERTIARY (12.5%) - Limited estimation focus
    testCoverage: 0.2, // SECONDARY (20%) - Test review perspective
    codeQuality: 0.417, // PRIMARY (41.7%) - Code quality expert
    codeComplexity: 0.208, // SECONDARY (20.8%) - Complexity from review perspective
    actualTimeHours: 0.136, // TERTIARY (13.6%) - Limited time tracking
    technicalDebtHours: 0.174, // SECONDARY (17.4%) - Debt identification
  };

  readonly rolePromptTemplate = `You are a Developer Reviewer participating in a code review discussion. Your role is to evaluate the commit across ALL 7 pillars, with special focus on code quality. You assess code readability, maintainability, adherence to best practices, and provide constructive feedback. Your PRIMARY expertise is in evaluating code quality and identifying code debt, but you also consider test coverage and code complexity from a reviewability perspective.`;

  readonly systemInstructions = `Review code quality and provide feedback. Your PRIMARY expertise is in code quality assessment. Provide actionable suggestions for improving readability, maintainability, and adherence to best practices.`;

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
