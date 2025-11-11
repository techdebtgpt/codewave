// src/agents/developer-reviewer-agent.ts
// Developer Reviewer Agent - Provides code review feedback and evaluates code quality

import { AppConfig } from '../config/config.interface';
import { BaseAgentWorkflow } from './base-agent-workflow';
import { AgentContext, AgentResult } from './agent.interface';

import { PromptBuilderService } from '../services/prompt-builder.service';
export class DeveloperReviewerAgent extends BaseAgentWorkflow {
  private config: AppConfig;

  constructor(config: AppConfig) {
    super();
    this.config = config;
  }

  getMetadata() {
    return {
      name: 'developer-reviewer',
      description:
        'Reviews code quality, suggests improvements, and evaluates implementation details',
      role: 'Developer Reviewer',
      roleDescription: 'code quality, readability, and best practices perspective',
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
        role: 'Developer Reviewer',
        description:
          'Reviews code quality, suggests improvements, and evaluates implementation details',
        roleDetailedDescription: `You are a Developer Reviewer participating in a code review discussion. Your role is to evaluate the commit across ALL 7 pillars, with special focus on code quality. You assess code readability, maintainability, adherence to best practices, and provide constructive feedback. Your PRIMARY expertise is in evaluating code quality and identifying code debt, but you also consider test coverage and code complexity from a reviewability perspective.`,
        agentKey: 'developer-reviewer',
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
   * Self-evaluate analysis completeness from Developer Reviewer perspective
   * Focus: Code quality assessment and actionable review feedback
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

    // Check if code quality is well-justified with examples
    if (typeof metrics.codeQuality === 'number') {
      const hasQualityFeedback =
        summary.includes('code') ||
        details.includes('readability') ||
        details.includes('maintainability') ||
        details.includes('pattern');
      if (!hasQualityFeedback) {
        gaps.push(
          'Code quality assessment should include specific examples or feedback on readability/maintainability'
        );
      } else {
        clarityScore += 12;
      }
    } else {
      gaps.push('Code quality score is missing');
    }

    // Check if complexity assessment is clear
    if (typeof metrics.codeComplexity === 'number') {
      const hasComplexityAnalysis =
        details.includes('complex') ||
        details.includes('simple') ||
        details.includes('understandable');
      if (details.length > 150 && !hasComplexityAnalysis) {
        gaps.push('Complexity analysis should explain difficulty of understanding the code');
      } else {
        clarityScore += 10;
      }
    }

    // Check if specific improvement suggestions are provided
    if (summary.length > 100 && details.length > 250) {
      const hasSuggestions =
        details.includes('suggest') ||
        details.includes('improve') ||
        details.includes('consider') ||
        details.includes('could');
      if (!hasSuggestions) {
        gaps.push(
          'Review should include specific suggestions for improvement or praise for good patterns'
        );
      } else {
        clarityScore += 12;
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
   * Generate self-questions for refinement from Developer Reviewer perspective
   */
  protected generateSelfQuestions(result: AgentResult, gaps: string[]): string[] {
    const questions: string[] = [];

    // Ask about code quality details
    if (gaps.some((g) => g.includes('quality') || g.includes('readability'))) {
      questions.push(
        'Can I provide more specific feedback on code patterns, naming conventions, or architectural decisions?'
      );
    }

    // Ask about complexity analysis
    if (gaps.some((g) => g.includes('complexity') || g.includes('understandable'))) {
      questions.push(
        'Are there particularly complex sections that would benefit from additional explanation or refactoring?'
      );
    }

    // Ask about improvement suggestions
    if (gaps.some((g) => g.includes('suggest') || g.includes('improvement'))) {
      questions.push(
        'What specific improvements would enhance code quality, maintainability, or performance?'
      );
    }

    // Generic refinement question
    if (questions.length === 0 && gaps.length > 0) {
      questions.push(
        'How can I provide more actionable code review feedback to improve quality assessment?'
      );
    }

    return questions;
  }
}
