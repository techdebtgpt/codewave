// src/agents/sdet-agent.ts
// SDET (Software Development Engineer in Test) Agent - Evaluates test automation, testing frameworks, and code quality of tests

import { AppConfig } from '../config/config.interface';
import { BaseAgentWorkflow } from './base-agent-workflow';
import { AgentContext, AgentResult } from './agent.interface';

import { PromptBuilderService } from '../services/prompt-builder.service';
export class SDETAgent extends BaseAgentWorkflow {
  private config: AppConfig;

  constructor(config: AppConfig) {
    super();
    this.config = config;
  }

  getMetadata() {
    return {
      name: 'sdet',
      description:
        'Evaluates test automation quality, testing frameworks, and automated test infrastructure',
      role: 'SDET (Test Automation Engineer)',
      roleDescription: 'test automation quality and testing frameworks perspective',
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
        role: 'SDET (Test Automation Engineer)',
        description:
          'Evaluates test automation quality, testing frameworks, and automated test infrastructure',
        roleDetailedDescription: `You are an SDET (Software Development Engineer in Test) participating in a code review discussion. Your role is to evaluate the commit across ALL 7 pillars, with special focus on test automation quality and testing infrastructure. You assess the maturity of the testing framework, the quality and maintainability of test code, and identify test automation debt. Your PRIMARY expertise is in evaluating test coverage and automation framework quality, not just testing numbers.`,
        agentKey: 'sdet',
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
   * Self-evaluate analysis completeness from SDET perspective
   * Focus: Test automation quality and testing infrastructure
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

    // Check if test automation quality is well-justified
    if (typeof metrics.testCoverage === 'number') {
      const hasAutomationExplanation =
        summary.includes('automat') ||
        details.includes('framework') ||
        details.includes('test') ||
        details.includes('infrastructure');
      if (!hasAutomationExplanation) {
        gaps.push(
          'Test automation quality score lacks detailed explanation - what is the testing framework maturity?'
        );
      } else {
        clarityScore += 10;
      }
    } else {
      gaps.push('Test automation/coverage score is missing');
    }

    // Check if testing framework quality is clear
    if (summary.length > 100 && details.length > 200) {
      const hasFrameworkAnalysis =
        details.includes('framework') ||
        details.includes('utilities') ||
        details.includes('fixtures') ||
        details.includes('infrastructure');
      if (!hasFrameworkAnalysis) {
        gaps.push(
          'Testing framework quality should be more specific - test utilities, fixtures, maintainability?'
        );
      } else {
        clarityScore += 10;
      }
    }

    // Check if test code quality is addressed
    if (typeof metrics.codeQuality === 'number') {
      const hasTestCodeQuality =
        details.includes('test code') ||
        details.includes('test quality') ||
        details.includes('maintainability');
      if (details.length > 150 && !hasTestCodeQuality) {
        gaps.push('Test code quality analysis should address test maintainability and reusability');
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
      clarityScore += 10;
    }

    // Bonus for comprehensive analysis
    if (details.length > 350) {
      clarityScore += 15;
    }

    return {
      clarityScore: Math.min(100, clarityScore),
      missingInformation: gaps,
    };
  }

  /**
   * Generate self-questions for refinement from SDET perspective
   */
  protected generateSelfQuestions(result: AgentResult, gaps: string[]): string[] {
    const questions: string[] = [];

    // Ask about test automation details
    if (gaps.some((g) => g.includes('automation') || g.includes('framework'))) {
      questions.push(
        'Can I be more specific about test automation framework maturity and infrastructure quality?'
      );
    }

    // Ask about testing strategy
    if (gaps.some((g) => g.includes('strategy') || g.includes('utilities'))) {
      questions.push(
        'What testing infrastructure improvements or new utilities were introduced in this change?'
      );
    }

    // Ask about test code quality
    if (gaps.some((g) => g.includes('code quality') || g.includes('maintainability'))) {
      questions.push(
        'How maintainable and reusable is the test automation code? Are there better abstraction patterns?'
      );
    }

    // Generic refinement question
    if (questions.length === 0 && gaps.length > 0) {
      questions.push(
        'How can I provide more comprehensive analysis of test automation quality and testing infrastructure?'
      );
    }

    return questions;
  }
}
