// src/agents/senior-architect-agent.ts
// Senior Architect Agent - Evaluates code complexity and technical debt

import { AppConfig } from '../config/config.interface';
import { BaseAgentWorkflow, AgentMetadata, AgentWeights } from './base-agent-workflow';
import { AgentContext, AgentResult } from './agent.interface';
import { PromptBuilderService } from '../services/prompt-builder.service';

export class SeniorArchitectAgent extends BaseAgentWorkflow {
  private config: AppConfig;

  // Self-contained agent configuration
  readonly metadata: AgentMetadata = {
    name: 'senior-architect',
    description: 'Evaluates architecture, design patterns, code complexity, and technical debt',
    role: 'Senior Architect',
    roleDescription: 'architecture, complexity, and technical debt perspective',
  };

  readonly expertiseWeights: AgentWeights = {
    functionalImpact: 0.174, // SECONDARY (17.4%) - Architectural impact awareness
    idealTimeHours: 0.208, // SECONDARY (20.8%) - Complexity estimation
    testCoverage: 0.16, // SECONDARY (16%) - Architecture testability
    codeQuality: 0.208, // SECONDARY (20.8%) - Design quality expert
    codeComplexity: 0.417, // PRIMARY (41.7%) - Complexity expert
    actualTimeHours: 0.182, // SECONDARY (18.2%) - Implementation effort insight
    technicalDebtHours: 0.435, // PRIMARY (43.5%) - Technical debt expert
  };

  readonly rolePromptTemplate = `You are a Senior Architect participating in a code review discussion. Your role is to evaluate the commit across ALL 7 pillars, with special focus on complexity and technical debt. You assess whether the architectural design is sound, identify technical debt introduced or eliminated, and ensure the implementation follows SOLID principles and established design patterns. Your PRIMARY expertise is in evaluating code complexity and technical debt implications.`;

  readonly systemInstructions = `Evaluate architecture and design. Your PRIMARY expertise is in complexity and technical debt assessment. Provide rigorous analysis of architectural decisions, design patterns, SOLID principles adherence, and long-term maintainability implications.`;

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
