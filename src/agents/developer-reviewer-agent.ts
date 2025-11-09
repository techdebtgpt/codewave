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
    };
  }

  async canExecute(context: AgentContext) {
    return !!context.commitDiff;
  }

  async estimateTokens(context: AgentContext) {
    return 2500;
  }

  protected buildSystemPrompt(context: AgentContext): string {
    const roundPurpose = (context.roundPurpose || 'initial') as
      | 'initial'
      | 'concerns'
      | 'validation';
    const previousContext =
      context.agentResults && context.agentResults.length > 0
        ? context.agentResults
            .map((r: AgentResult) => `**${r.agentName}**: ${r.summary}`)
            .join('\n\n')
        : '';

    return PromptBuilderService.buildCompleteSystemPrompt(
      {
        role: 'Developer Reviewer',
        description:
          'Reviews code quality, suggests improvements, and evaluates implementation details',
        roleDetailedDescription: `You are a Developer Reviewer participating in a code review discussion. Your role is to evaluate the commit across ALL 7 pillars, with special focus on code quality. You assess code readability, maintainability, adherence to best practices, and provide constructive feedback. Your PRIMARY expertise is in evaluating code quality and identifying code debt, but you also consider test coverage and code complexity from a reviewability perspective.`,
        agentKey: 'developer-reviewer',
        primaryMetrics: ['codeQuality'],
        secondaryMetrics: ['testCoverage', 'codeComplexity', 'technicalDebtHours'],
      },
      roundPurpose,
      previousContext
    );
  }

  protected async buildHumanPrompt(context: AgentContext): Promise<string> {
    const filesChanged = context.filesChanged?.join(', ') || 'unknown files';

    // Prepare developer overview section if available
    const developerContextSection = context.developerOverview
      ? `${context.developerOverview}\n\n---\n\n`
      : '';

    // Use RAG if available for large diffs (skip in subsequent rounds to save tokens)
    const isFirstRound = !context.agentResults || context.agentResults.length === 0;
    if ((context.vectorStore || context.documentationStore) && isFirstRound) {
      const { CombinedRAGHelper } = await import('../utils/combined-rag-helper.js');
      const rag = new CombinedRAGHelper(context.vectorStore, context.documentationStore);
      rag.setAgentName('Developer Reviewer');

      // Ask code quality-focused questions (optimized for cost)
      const queries = [
        { q: 'Show code style and formatting changes', topK: 3, store: 'diff' as const },
        { q: 'What code quality improvements or issues exist?', topK: 2, store: 'diff' as const },
        {
          q: 'What code review standards are documented in the repository?',
          topK: 2,
          store: 'docs' as const,
        },
        { q: 'Show complex logic or algorithms that need review', topK: 2, store: 'diff' as const },
        {
          q: 'Are there documented security guidelines or best practices?',
          topK: 2,
          store: 'docs' as const,
        },
      ];

      const results = await rag.queryMultiple(queries);
      const ragContext = results.map((r) => r.results).join('\n\n');

      return [
        developerContextSection,
        '## Code Review Request (RAG Mode - Large Diff)',
        '',
        `**Files Changed:** ${filesChanged}`,
        '',
        rag.getSummary(),
        '',
        '**Relevant Code for Quality Review:**',
        ragContext,
        '',
        'Please provide your code review scoring ALL 7 metrics based on the relevant code shown above:',
        '1. **Code Quality** (1-10) - YOUR PRIMARY EXPERTISE',
        '2. **Functional Impact** (1-10) - your tertiary opinion',
        '3. **Ideal Time Hours** - your tertiary estimate',
        '4. **Test Coverage** (1-10) - your secondary opinion',
        '5. **Code Complexity** (1-10, lower is better) - your secondary opinion',
        '6. **Actual Time Hours** - your tertiary estimate',
        '7. **Technical Debt Hours** - your secondary assessment (quality debt)',
        '',
        'Focus on your expertise (code quality, readability) but provide scores for all pillars.',
        "Respond conversationally and reference other team members' points when relevant.",
      ].join('\n');
    }

    // Round 2 (Concerns): Ask questions about other agents' scores
    const roundPurpose = context.roundPurpose || 'initial';
    if (roundPurpose === 'concerns' && context.agentResults && context.agentResults.length > 0) {
      const teamContext = context.agentResults
        .map(
          (r) =>
            `**${r.agentName}:**\n${r.summary}\n\nMetrics: ${JSON.stringify(r.metrics, null, 2)}`
        )
        .join('\n\n---\n\n');

      return [
        developerContextSection,
        '## Code Review - Round 2: Raise Concerns & Questions',
        '',
        `**Files Changed:** ${filesChanged}`,
        '',
        '**Team Discussion (Round 1):**',
        teamContext,
        '',
        '**Your Task:**',
        "1. Review other agents' metrics - do they align with the code quality you observed?",
        '2. Raise concerns about quality implications:',
        '   - Test Coverage → QA Engineer (are tests actually adequate for this code?)',
        '   - Complexity → Senior Architect (is complexity assessment realistic?)',
        '   - Implementation Time → Developer Author (does time match quality?)',
        '3. Defend your Code Quality score if you anticipate questions',
        '',
        'Include your refined scores based on team discussion.',
      ].join('\n');
    }

    // Round 3 (Validation): Respond to concerns and finalize
    if (roundPurpose === 'validation' && context.agentResults && context.agentResults.length > 0) {
      const teamContext = context.agentResults
        .map(
          (r) =>
            `**${r.agentName}:**\n${r.summary}\n\nMetrics: ${JSON.stringify(r.metrics, null, 2)}`
        )
        .join('\n\n---\n\n');

      return [
        developerContextSection,
        '## Code Review - Round 3: Validation & Final Scores',
        '',
        `**Files Changed:** ${filesChanged}`,
        '',
        '**Team Discussion (Rounds 1-2):**',
        teamContext,
        '',
        '**Your Task:**',
        '1. Address concerns about YOUR Code Quality score',
        '2. Review agent responses about complexity, tests, debt',
        '3. Adjust scores if convinced by new evidence',
        '4. Provide FINAL refined scores for all 7 metrics',
        '',
        'This is the final round - be confident in your assessment.',
      ].join('\n');
    }

    // Fallback to full diff for small commits (no RAG needed)
    return [
      developerContextSection,
      '## Code Review Request',
      '',
      `**Files Changed:** ${filesChanged}`,
      '',
      '**Code to Review:**',
      '```',
      context.commitDiff,
      '```',
      '',
      'Please provide your code review scoring ALL 7 metrics:',
      '1. **Code Quality** (1-10) - YOUR PRIMARY EXPERTISE',
      '2. **Functional Impact** (1-10) - your tertiary opinion',
      '3. **Ideal Time Hours** - your tertiary estimate',
      '4. **Test Coverage** (1-10) - your secondary opinion',
      '5. **Code Complexity** (1-10, lower is better) - your secondary opinion',
      '6. **Actual Time Hours** - your tertiary estimate',
      '7. **Technical Debt Hours** - your secondary assessment (quality debt)',
      '',
      'Focus on your expertise (code quality, readability) but provide scores for all pillars.',
      "Respond conversationally and reference other team members' points when relevant.",
    ].join('\n');
  }

  protected parseLLMResult(output: any): AgentResult {
    // Import centralized pillar constants
    const { SEVEN_PILLARS } = require('../constants/agent-weights.constants');

    // Try to parse JSON output from LLM
    if (typeof output === 'string') {
      try {
        // Use robust JSON parsing that handles markdown fences and truncation
        const parsed = this.parseJSONSafely(output);

        // Validate required fields
        if (!parsed.summary || typeof parsed.summary !== 'string') {
          console.warn(`Developer Reviewer: Invalid summary in LLM response`);
          throw new Error('Missing or invalid summary field');
        }

        // Handle metrics: ensure it's an object with 7 pillars, filter out extras
        let metrics = parsed.metrics || {};

        // If metrics is an array, convert to object
        if (Array.isArray(metrics)) {
          console.warn(`Developer Reviewer: Metrics returned as array, converting to object`);
          metrics = {};
        }

        // Filter metrics to ONLY the 7 pillars
        const filteredMetrics: Record<string, number> = {};
        for (const pillar of SEVEN_PILLARS) {
          if (pillar in metrics && typeof metrics[pillar] === 'number') {
            filteredMetrics[pillar] = metrics[pillar];
          } else {
            // Use default value if missing
            filteredMetrics[pillar] =
              pillar === 'codeQuality' ||
              pillar === 'functionalImpact' ||
              pillar === 'testCoverage' ||
              pillar === 'codeComplexity'
                ? 5
                : 0;
          }
        }

        return {
          summary: parsed.summary.trim(),
          details: (parsed.details || '').trim(),
          metrics: filteredMetrics,
        };
      } catch (error) {
        console.warn(
          `Developer Reviewer: Failed to parse LLM output: ${error instanceof Error ? error.message : String(error)}`
        );
        console.warn(
          `Developer Reviewer: Raw output (first 500 chars): ${output.substring(0, 500)}`
        );

        // fallback to string summary (if output is long enough)
        if (output.length > 10) {
          return {
            summary: output.substring(0, 500),
            details: '',
            metrics: {
              codeQuality: 5,
              functionalImpact: 5,
              idealTimeHours: 0,
              testCoverage: 5,
              codeComplexity: 5,
              actualTimeHours: 0,
              technicalDebtHours: 0,
            },
          };
        }

        return {
          summary: '',
          details: 'Failed to parse LLM response',
          metrics: {
            codeQuality: 5,
            functionalImpact: 5,
            idealTimeHours: 0,
            testCoverage: 5,
            codeComplexity: 5,
            actualTimeHours: 0,
            technicalDebtHours: 0,
          },
        };
      }
    }
    return super.parseLLMResult(output);
  }

  private detectAgentRole(result: AgentResult): string {
    const combined = (result.summary || '').toLowerCase() + (result.details || '').toLowerCase();
    if (combined.includes('business') || combined.includes('functional')) return 'Business Analyst';
    if (combined.includes('qa') || combined.includes('test')) return 'QA Engineer';
    if (combined.includes('author') || combined.includes('developer')) return 'Developer';
    if (combined.includes('architect')) return 'Senior Architect';
    return 'Team Member';
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
    const requiredMetrics = [
      'codeQuality',
      'functionalImpact',
      'idealTimeHours',
      'testCoverage',
      'codeComplexity',
      'actualTimeHours',
      'technicalDebtHours',
    ];
    const missingMetrics = requiredMetrics.filter((m) => !(m in metrics));
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
