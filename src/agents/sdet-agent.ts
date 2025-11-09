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
    };
  }

  async canExecute(context: AgentContext) {
    return !!context.commitDiff;
  }

  async estimateTokens(context: AgentContext) {
    return 2000;
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
        role: 'SDET (Test Automation Engineer)',
        description:
          'Evaluates test automation quality, testing frameworks, and automated test infrastructure',
        roleDetailedDescription: `You are an SDET (Software Development Engineer in Test) participating in a code review discussion. Your role is to evaluate the commit across ALL 7 pillars, with special focus on test automation quality and testing infrastructure. You assess the maturity of the testing framework, the quality and maintainability of test code, and identify test automation debt. Your PRIMARY expertise is in evaluating test coverage and automation framework quality, not just testing numbers.`,
        agentKey: 'sdet',
        primaryMetrics: ['testCoverage'],
        secondaryMetrics: ['codeQuality', 'codeComplexity'],
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
      rag.setAgentName('SDET (Test Automation Engineer)');

      // Ask SDET-focused questions (optimized for cost)
      const queries = [
        {
          q: 'Show me all test file changes and test automation code',
          topK: 3,
          store: 'diff' as const,
        },
        {
          q: 'What testing frameworks or automation infrastructure was modified?',
          topK: 2,
          store: 'diff' as const,
        },
        {
          q: 'What are the documented testing standards and patterns in the repository?',
          topK: 2,
          store: 'docs' as const,
        },
        {
          q: 'Show test utilities, fixtures, and testing framework changes',
          topK: 2,
          store: 'diff' as const,
        },
        {
          q: 'Are there documented CI/CD patterns or testing guidelines?',
          topK: 2,
          store: 'docs' as const,
        },
      ];

      const results = await rag.queryMultiple(queries);
      const ragContext = results.map((r) => r.results).join('\n\n');

      return [
        developerContextSection,
        '## Test Automation Review (RAG Mode - Large Diff)',
        '',
        `**Files Changed:** ${filesChanged}`,
        '',
        rag.getSummary(),
        '',
        '**Relevant Code for Test Automation Analysis:**',
        ragContext,
        '',
        'Please provide your analysis scoring ALL 7 metrics based on the relevant code shown above:',
        '1. **Test Coverage** (1-10) - YOUR PRIMARY EXPERTISE (focus on automation quality)',
        '2. **Functional Impact** (1-10) - your tertiary opinion',
        '3. **Ideal Time Hours** - your tertiary estimate',
        '4. **Code Quality** (1-10) - your secondary opinion (test framework perspective)',
        '5. **Code Complexity** (1-10, lower is better) - your tertiary opinion',
        '6. **Actual Time Hours** - your tertiary estimate',
        '7. **Technical Debt Hours** - your tertiary assessment (test automation debt)',
        '',
        'Focus on your expertise (test automation quality, testing frameworks) but provide scores for all pillars.',
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
        '## Test Automation Review - Round 2: Raise Concerns & Questions',
        '',
        `**Files Changed:** ${filesChanged}`,
        '',
        '**Team Discussion (Round 1):**',
        teamContext,
        '',
        '**Your Task:**',
        "1. Review other agents' metrics from Round 1",
        '2. Identify any scores that seem inconsistent with test automation quality',
        '3. Raise specific concerns/questions to responsible agents:',
        '   - Code Quality → Developer Reviewer (is test code quality considered?)',
        '   - Code Complexity → Senior Architect (test infrastructure complexity?)',
        '   - Functional Impact → Business Analyst (testability of functionality?)',
        '4. Defend your Test Automation Quality score if you anticipate questions',
        '',
        'Include your refined scores (can stay the same or adjust based on team context).',
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
        '## Test Automation Review - Round 3: Validation & Final Scores',
        '',
        `**Files Changed:** ${filesChanged}`,
        '',
        '**Team Discussion (Rounds 1-2):**',
        teamContext,
        '',
        '**Your Task:**',
        '1. Address any concerns raised about YOUR Test Automation Quality score',
        '2. Review responses from other agents about their metrics',
        '3. Adjust your secondary/tertiary scores if new evidence convinces you',
        '4. Provide FINAL refined scores for all 7 metrics',
        '',
        'This is the final round - be confident in your assessment.',
      ].join('\n');
    }

    // Fallback to full diff for small commits (no RAG needed)
    return [
      developerContextSection,
      '## Test Automation Review',
      '',
      `**Files Changed:** ${filesChanged}`,
      '',
      '**Commit Diff:**',
      '```',
      context.commitDiff,
      '```',
      '',
      'Please provide your analysis scoring ALL 7 metrics:',
      '1. **Test Coverage** (1-10) - YOUR PRIMARY EXPERTISE (focus on automation quality)',
      '2. **Functional Impact** (1-10) - your tertiary opinion',
      '3. **Ideal Time Hours** - your tertiary estimate',
      '4. **Code Quality** (1-10) - your secondary opinion (test framework perspective)',
      '5. **Code Complexity** (1-10, lower is better) - your tertiary opinion',
      '6. **Actual Time Hours** - your tertiary estimate',
      '7. **Technical Debt Hours** - your tertiary assessment (test automation debt)',
      '',
      'Focus on your expertise (test automation quality, testing frameworks) but provide scores for all pillars.',
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
          console.warn(`SDET: Invalid summary in LLM response`);
          throw new Error('Missing or invalid summary field');
        }

        // Handle metrics: ensure it's an object with 7 pillars, filter out extras
        let metrics = parsed.metrics || {};

        // If metrics is an array, convert to object
        if (Array.isArray(metrics)) {
          console.warn(`SDET: Metrics returned as array, converting to object`);
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
              pillar === 'testCoverage' ||
              pillar === 'functionalImpact' ||
              pillar === 'codeQuality' ||
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
          `SDET: Failed to parse LLM output: ${error instanceof Error ? error.message : String(error)}`
        );
        console.warn(`SDET: Raw output (first 500 chars): ${output.substring(0, 500)}`);

        // fallback to string summary (if output is long enough)
        if (output.length > 10) {
          return {
            summary: output.substring(0, 500),
            details: '',
            metrics: {
              testCoverage: 5,
              functionalImpact: 5,
              idealTimeHours: 0,
              codeQuality: 5,
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
            testCoverage: 5,
            functionalImpact: 5,
            idealTimeHours: 0,
            codeQuality: 5,
            codeComplexity: 5,
            actualTimeHours: 0,
            technicalDebtHours: 0,
          },
        };
      }
    }
    return super.parseLLMResult(output);
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
    const requiredMetrics = [
      'testCoverage',
      'functionalImpact',
      'idealTimeHours',
      'codeQuality',
      'codeComplexity',
      'actualTimeHours',
      'technicalDebtHours',
    ];
    const missingMetrics = requiredMetrics.filter((m) => !(m in metrics));
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

  private detectAgentRole(result: AgentResult): string {
    const combined = (result.summary || '').toLowerCase() + (result.details || '').toLowerCase();
    if (combined.includes('business') || combined.includes('functional')) return 'Business Analyst';
    if (combined.includes('architect')) return 'Senior Architect';
    if (combined.includes('author') || combined.includes('developer')) return 'Developer Author';
    if (combined.includes('reviewer') || combined.includes('code quality'))
      return 'Developer Reviewer';
    return 'Team Member';
  }
}
