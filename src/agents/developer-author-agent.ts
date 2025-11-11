// src/agents/developer-author-agent.ts
// Developer (Commit Author) Agent - Explains implementation decisions and actual time spent

import { AppConfig } from '../config/config.interface';
import { BaseAgentWorkflow } from './base-agent-workflow';
import { AgentContext, AgentResult } from './agent.interface';
import { PromptBuilderService } from '../services/prompt-builder.service';

export class DeveloperAuthorAgent extends BaseAgentWorkflow {
  private config: AppConfig;

  constructor(config: AppConfig) {
    super();
    this.config = config;
  }

  getMetadata() {
    return {
      name: 'developer-author',
      description: 'Explains implementation decisions, trade-offs, and estimates actual time spent',
      role: 'Developer (Author)',
      roleDescription: 'implementation decisions, time spent, and developer perspective',
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
        role: 'Developer (Author)',
        description:
          'Explains implementation decisions, trade-offs, and estimates actual time spent',
        agentKey: 'developer-author',
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
   * Self-evaluate analysis completeness from Developer Author perspective
   * Focus: Actual time estimates and implementation decisions clarity
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

    // Check if actual time is well-justified
    if (typeof metrics.actualTimeHours === 'number' && metrics.actualTimeHours >= 0) {
      const hasTimeJustification =
        summary.includes('spent') ||
        summary.includes('hour') ||
        details.includes('implement') ||
        details.includes('debug');
      if (!hasTimeJustification) {
        gaps.push('Actual time estimate needs clearer justification - what took the most time?');
      } else {
        clarityScore += 12;
      }
    } else {
      gaps.push('Actual time hours is missing or invalid');
    }

    // Check if implementation decisions are explained
    if (summary.length > 100 && details.length > 250) {
      const hasDecisions =
        details.includes('decision') ||
        details.includes('approach') ||
        details.includes('why') ||
        details.includes('chose');
      if (!hasDecisions) {
        gaps.push('Implementation decisions and tradeoffs should be more explicit');
      } else {
        clarityScore += 12;
      }
    }

    // Check if challenges/roadblocks are mentioned
    if (details.length > 200) {
      const hasChallenges =
        details.includes('challenge') ||
        details.includes('issue') ||
        details.includes('problem') ||
        details.includes('blocking');
      if (!hasChallenges) {
        gaps.push('What challenges or obstacles were encountered during implementation?');
      } else {
        clarityScore += 8;
      }
    }

    // Check all required metrics are present
    const { SEVEN_PILLARS } = require('../constants/agent-weights.constants');
    const missingMetrics = SEVEN_PILLARS.filter((m: string) => !(m in metrics));
    if (missingMetrics.length > 0) {
      gaps.push(`Missing metric scores: ${missingMetrics.join(', ')}`);
    } else {
      clarityScore += 8;
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
   * Generate self-questions for refinement from Developer Author perspective
   */
  protected generateSelfQuestions(result: AgentResult, gaps: string[]): string[] {
    const questions: string[] = [];

    // Ask about time breakdown
    if (gaps.some((g) => g.includes('time'))) {
      questions.push(
        'Should I provide a clearer breakdown of how time was spent (coding, testing, debugging, deployment)?'
      );
    }

    // Ask about implementation approach
    if (gaps.some((g) => g.includes('decision'))) {
      questions.push(
        'What were the key implementation decisions and why were alternative approaches rejected?'
      );
    }

    // Ask about challenges
    if (gaps.some((g) => g.includes('challenge'))) {
      questions.push(
        'What unexpected challenges or technical difficulties did I encounter during implementation?'
      );
    }

    // Generic refinement question
    if (questions.length === 0 && gaps.length > 0) {
      questions.push('How can I better explain the implementation details and decisions I made?');
    }

    return questions;
  }
}
