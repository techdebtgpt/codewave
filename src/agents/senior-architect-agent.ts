// src/agents/senior-architect-agent.ts
// Senior Architect Agent - Evaluates code complexity and technical debt

import { AppConfig } from '../config/config.interface';
import { BaseAgentWorkflow } from './base-agent-workflow';
import { AgentContext, AgentResult } from './agent.interface';

import { PromptBuilderService } from '../services/prompt-builder.service';
export class SeniorArchitectAgent extends BaseAgentWorkflow {
  private config: AppConfig;

  constructor(config: AppConfig) {
    super();
    this.config = config;
  }

  getMetadata() {
    return {
      name: 'senior-architect',
      description: 'Evaluates architecture, design patterns, code complexity, and technical debt',
      role: 'Senior Architect',
      roleDescription: 'architecture, complexity, and technical debt perspective',
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
        role: 'Senior Architect',
        description: 'Evaluates architecture, design patterns, code complexity, and technical debt',
        roleDetailedDescription: `You are a Senior Architect participating in a code review discussion. Your role is to evaluate the commit across ALL 7 pillars, with special focus on complexity and technical debt. You assess whether the architectural design is sound, identify technical debt introduced or eliminated, and ensure the implementation follows SOLID principles and established design patterns. Your PRIMARY expertise is in evaluating code complexity and technical debt implications.`,
        agentKey: 'senior-architect',
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
   * Self-evaluate analysis completeness from Senior Architect perspective
   * Focus: Complexity assessment and technical debt evaluation accuracy
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

    // Check if complexity is well-justified
    if (typeof metrics.codeComplexity === 'number') {
      const hasComplexityJustification =
        summary.includes('complex') ||
        details.includes('simple') ||
        details.includes('logic') ||
        details.includes('interdepend');
      if (!hasComplexityJustification) {
        gaps.push('Complexity score should be justified with architectural reasoning');
      } else {
        clarityScore += 12;
      }
    } else {
      gaps.push('Code complexity score is missing');
    }

    // Check if technical debt is clearly assessed
    if (typeof metrics.technicalDebtHours === 'number') {
      const hasDebtAnalysis =
        details.includes('debt') ||
        details.includes('shortcut') ||
        details.includes('technical') ||
        details.includes('maintainability');
      if (!hasDebtAnalysis) {
        gaps.push(
          'Technical debt assessment should explain what debt was introduced or eliminated'
        );
      } else {
        clarityScore += 12;
      }
    } else {
      gaps.push('Technical debt hours score is missing');
    }

    // Check if architecture patterns are discussed
    if (summary.length > 100 && details.length > 250) {
      const hasPatterns =
        details.includes('pattern') ||
        details.includes('design') ||
        details.includes('architecture') ||
        details.includes('principle');
      if (!hasPatterns) {
        gaps.push('Architectural assessment should mention design patterns or SOLID principles');
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
   * Generate self-questions for refinement from Senior Architect perspective
   */
  protected generateSelfQuestions(result: AgentResult, gaps: string[]): string[] {
    const questions: string[] = [];

    // Ask about complexity justification
    if (gaps.some((g) => g.includes('complexity'))) {
      questions.push(
        'Can I better explain the architectural drivers of complexity and interdependencies?'
      );
    }

    // Ask about technical debt details
    if (gaps.some((g) => g.includes('debt'))) {
      questions.push(
        'What specific technical debt was introduced, and what are the long-term maintenance implications?'
      );
    }

    // Ask about design patterns
    if (gaps.some((g) => g.includes('pattern') || g.includes('design'))) {
      questions.push(
        'How well does this implementation align with SOLID principles and established design patterns?'
      );
    }

    // Ask about maintainability
    if (gaps.some((g) => g.includes('maintainability'))) {
      questions.push(
        'From an architecture perspective, how maintainable and extensible is this solution?'
      );
    }

    // Generic refinement question
    if (questions.length === 0 && gaps.length > 0) {
      questions.push('How can I provide more rigorous architectural assessment of this change?');
    }

    return questions;
  }
}
