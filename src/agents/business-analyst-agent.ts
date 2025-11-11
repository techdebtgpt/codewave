// src/agents/business-analyst-agent.ts
// Business Analyst Agent - Evaluates business value, functional impact, and ideal time estimation

import { AppConfig } from '../config/config.interface';
import { BaseAgentWorkflow } from './base-agent-workflow';
import { AgentContext, AgentResult } from './agent.interface';

import { PromptBuilderService } from '../services/prompt-builder.service';
export class BusinessAnalystAgent extends BaseAgentWorkflow {
  private config: AppConfig;

  constructor(config: AppConfig) {
    super();
    this.config = config;
  }

  getMetadata() {
    return {
      name: 'business-analyst',
      description:
        'Evaluates business value, functional impact, and estimates ideal implementation time',
      role: 'Business Analyst',
      roleDescription: 'business perspective',
    };
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
        role: 'Business Analyst',
        description:
          'Evaluates business value, functional impact, and estimates ideal implementation time',
        roleDetailedDescription: `You are a Business Analyst participating in a code review discussion. Your role is to evaluate the commit across ALL 7 pillars, with special focus on functional impact and ideal implementation time. You assess how significantly the changes affect end users and business operations, and estimate how long the work should optimally take. You bring the business perspective to technical decisions and ensure alignment with business requirements and user needs.`,
        agentKey: 'business-analyst',
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

  /**
   * Self-evaluate analysis completeness from Business Analyst perspective
   * Focus: Functional impact clarity and ideal time estimates
   */
  protected evaluateAnalysis(result: AgentResult): {
    clarityScore: number;
    missingInformation: string[];
  } {
    const summary = (result.summary || '').toLowerCase();
    const details = (result.details || '').toLowerCase();
    const metrics = result.metrics || {};

    let clarityScore = 50;
    const gaps: string[] = [];

    // Check if functional impact is well-justified
    if (typeof metrics.functionalImpact === 'number') {
      const hasImpactExplanation =
        summary.includes('impact') || details.includes('user') || details.includes('functionality');
      if (!hasImpactExplanation) {
        gaps.push('Functional impact justification is unclear - which users are affected?');
      } else {
        clarityScore += 10;
      }
    } else {
      gaps.push('Functional impact score is missing');
    }

    // Check if ideal time is justified with complexity context
    if (typeof metrics.idealTimeHours === 'number' && metrics.idealTimeHours > 0) {
      const hasTimeJustification =
        details.includes('hour') || details.includes('time') || details.includes('complexity');
      if (!hasTimeJustification) {
        gaps.push('Ideal time estimate lacks clear reasoning or complexity context');
      } else {
        clarityScore += 10;
      }
    } else {
      gaps.push('Ideal time hours is missing or zero - clarify effort expectations');
    }

    // Check if business value is articulated
    if (summary.length > 100 && details.length > 200) {
      const hasBizValue =
        details.includes('business') ||
        details.includes('value') ||
        details.includes('benefit') ||
        details.includes('requirements');
      if (!hasBizValue) {
        gaps.push('Business value and requirements impact should be more explicit');
      } else {
        clarityScore += 15;
      }
    }

    // Check all required metrics are present
    const { SEVEN_PILLARS } = require('../constants/agent-weights.constants');
    const missingMetrics = SEVEN_PILLARS.filter((m: string) => !(m in metrics));
    if (missingMetrics.length > 0) {
      gaps.push(`Missing metric scores: ${missingMetrics.join(', ')}`);
    } else {
      clarityScore += 10;
    }

    // Bonus for comprehensive analysis
    if (details.length > 400) {
      clarityScore += 15;
    }

    return {
      clarityScore: Math.min(100, clarityScore),
      missingInformation: gaps,
    };
  }

  /**
   * Generate self-questions for refinement from Business Analyst perspective
   */
  protected generateSelfQuestions(result: AgentResult, gaps: string[]): string[] {
    const questions: string[] = [];

    // Always ask about functional impact details
    if (gaps.some((g) => g.includes('impact'))) {
      questions.push(
        'Can I better explain which specific user workflows or business processes this change affects?'
      );
    }

    // Ask about time estimation rationale
    if (gaps.some((g) => g.includes('time'))) {
      questions.push(
        'Should I provide more detailed time breakdown (requirements gathering, design, testing, deployment)?'
      );
    }

    // Ask about business value
    if (gaps.some((g) => g.includes('value'))) {
      questions.push(
        'What is the specific business value or ROI of this change for the organization?'
      );
    }

    // Generic refinement question
    if (questions.length === 0 && gaps.length > 0) {
      questions.push(
        'How can I provide more context on the business and functional impact of this change?'
      );
    }

    return questions;
  }
}
