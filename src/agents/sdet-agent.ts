// src/agents/sdet-agent.ts
// SDET (Software Development Engineer in Test) Agent - Evaluates test automation, testing frameworks, and code quality of tests

import { AppConfig } from '../config/config.interface';
import { BaseAgentWorkflow, AgentMetadata, AgentWeights } from './base-agent-workflow';
import { AgentContext, AgentResult } from './agent.interface';
import { PromptBuilderService } from '../services/prompt-builder.service';

export class SDETAgent extends BaseAgentWorkflow {
  private config: AppConfig;

  // Self-contained agent configuration
  readonly metadata: AgentMetadata = {
    name: 'sdet',
    description: 'Evaluates test automation quality, testing frameworks, and automated test infrastructure',
    role: 'SDET (Test Automation Engineer)',
    roleDescription: 'test automation quality and testing frameworks perspective',
  };

  readonly expertiseWeights: AgentWeights = {
    functionalImpact: 0.13, // TERTIARY (13%) - Limited business impact focus
    idealTimeHours: 0.083, // TERTIARY (8.3%) - Limited estimation focus
    testCoverage: 0.4, // PRIMARY (40%) - Test automation expert
    codeQuality: 0.167, // SECONDARY (16.7%) - Test code quality focus
    codeComplexity: 0.125, // TERTIARY (12.5%) - Test complexity assessment
    actualTimeHours: 0.091, // TERTIARY (9.1%) - Limited time tracking
    technicalDebtHours: 0.13, // TERTIARY (13%) - Test automation debt
  };

  readonly rolePromptTemplate = `You are an SDET (Software Development Engineer in Test) participating in a code review discussion. Your role is to evaluate the commit across ALL 7 pillars, with special focus on test automation quality and testing infrastructure. You assess the maturity of the testing framework, the quality and maintainability of test code, and identify test automation debt. Your PRIMARY expertise is in evaluating test coverage and automation framework quality, not just testing numbers.`;

  readonly systemInstructions = `Focus on test automation quality and infrastructure. Your PRIMARY expertise is in evaluating test coverage and automation framework quality. Provide detailed assessment of testing infrastructure, test maintainability, and automation debt.`;

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
