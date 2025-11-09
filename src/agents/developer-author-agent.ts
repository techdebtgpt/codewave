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
        role: 'Developer (Author)',
        description:
          'Explains implementation decisions, trade-offs, and estimates actual time spent',
        agentKey: 'developer-author',
        primaryMetrics: ['actualTimeHours'],
        secondaryMetrics: ['idealTimeHours', 'codeComplexity'],
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
      rag.setAgentName('Developer (Author)');

      // Ask implementation-focused questions (optimized for cost)
      const queries = [
        {
          q: 'Show all source code changes excluding tests and documentation',
          topK: 3,
          store: 'diff' as const,
        },
        {
          q: 'What refactoring or code organization changes occurred?',
          topK: 2,
          store: 'diff' as const,
        },
        {
          q: 'What coding standards are documented in the repository?',
          topK: 2,
          store: 'docs' as const,
        },
        { q: 'Show new features or functionality added', topK: 2, store: 'diff' as const },
        {
          q: 'Are there documented patterns for this type of code implementation?',
          topK: 2,
          store: 'docs' as const,
        },
      ];

      const results = await rag.queryMultiple(queries);
      const ragContext = results.map((r) => r.results).join('\n\n');

      return [
        developerContextSection,
        '## Implementation Review (RAG Mode - Large Diff)',
        '',
        `**Files Changed:** ${filesChanged}`,
        '',
        rag.getSummary(),
        '',
        '**Your Implementation - Relevant Code:**',
        ragContext,
        '',
        'As the developer who wrote this code, please score ALL 7 metrics based on the relevant code shown above:',
        '1. **Actual Time Hours** - YOUR PRIMARY EXPERTISE (how long you actually spent)',
        '2. **Functional Impact** (1-10) - your tertiary opinion',
        '3. **Ideal Time Hours** - your secondary opinion (should it have been faster?)',
        '4. **Test Coverage** (1-10) - your tertiary opinion (tests you wrote)',
        '5. **Code Quality** (1-10) - your tertiary assessment',
        '6. **Code Complexity** (1-10, lower is better) - your secondary opinion',
        '7. **Technical Debt Hours** - your tertiary assessment (shortcuts taken?)',
        '',
        'Explain your implementation decisions, time breakdown, and respond to other team members.',
        '',
        'Respond conversationally, as if defending/explaining your work in a code review.',
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
        '## Implementation Review - Round 2: Raise Concerns & Questions',
        '',
        `**Files Changed:** ${filesChanged}`,
        '',
        '**Team Discussion (Round 1):**',
        teamContext,
        '',
        '**Your Task:**',
        "1. Review other agents' scores - do they reflect the work you did?",
        '2. Raise concerns about implementation-related scores:',
        '   - Complexity → Senior Architect (was it really that complex?)',
        '   - Code Quality → Developer Reviewer (did they miss context?)',
        '   - Ideal Time → Business Analyst (did they account for challenges?)',
        '   - Test Coverage → QA Engineer (did they notice your test approach?)',
        '3. Defend your Actual Time score - explain what took time',
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
        '## Implementation Review - Round 3: Validation & Final Scores',
        '',
        `**Files Changed:** ${filesChanged}`,
        '',
        '**Team Discussion (Rounds 1-2):**',
        teamContext,
        '',
        '**Your Task:**',
        '1. Address concerns about YOUR Actual Time score',
        '2. Review responses from Architect, Reviewer, QA, BA',
        '3. Adjust scores if their feedback changes your assessment',
        '4. Provide FINAL refined scores for all 7 metrics',
        '',
        'This is the final round - clarify your implementation decisions.',
      ].join('\n');
    }

    // Fallback to full diff for small commits (no RAG needed)
    return [
      developerContextSection,
      '## Implementation Review',
      '',
      `**Files Changed:** ${filesChanged}`,
      '',
      '**Your Implementation:**',
      '```',
      context.commitDiff,
      '```',
      '',
      'As the developer who wrote this code, please score ALL 7 metrics:',
      '1. **Actual Time Hours** - YOUR PRIMARY EXPERTISE (how long you actually spent)',
      '2. **Functional Impact** (1-10) - your tertiary opinion',
      '3. **Ideal Time Hours** - your secondary opinion (should it have been faster?)',
      '4. **Test Coverage** (1-10) - your tertiary opinion (tests you wrote)',
      '5. **Code Quality** (1-10) - your tertiary assessment',
      '6. **Code Complexity** (1-10, lower is better) - your secondary opinion',
      '7. **Technical Debt Hours** - your tertiary assessment (shortcuts taken?)',
      '',
      'Explain your implementation decisions, time breakdown, and respond to other team members.',
      '',
      'Respond conversationally, as if defending/explaining your work in a code review.',
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
          console.warn(`Developer Author: Invalid summary in LLM response`);
          throw new Error('Missing or invalid summary field');
        }

        // Handle metrics: ensure it's an object with 7 pillars, filter out extras
        let metrics = parsed.metrics || {};

        // If metrics is an array, convert to object (this handles the Round 2 issue)
        if (Array.isArray(metrics)) {
          console.warn(`Developer Author: Metrics returned as array, converting to object`);
          metrics = {};
        }

        // Filter metrics to ONLY the 7 pillars
        const filteredMetrics: Record<string, number> = {};
        for (const pillar of SEVEN_PILLARS) {
          if (pillar in metrics && typeof metrics[pillar] === 'number') {
            filteredMetrics[pillar] = metrics[pillar];
          } else {
            // Use default value if missing
            filteredMetrics[pillar] = pillar === 'actualTimeHours' ? 0 : 5;
          }
        }

        return {
          summary: parsed.summary.trim(),
          details: (parsed.details || '').trim(),
          metrics: filteredMetrics,
        };
      } catch (error) {
        console.warn(
          `Developer Author: Failed to parse LLM output: ${error instanceof Error ? error.message : String(error)}`
        );
        console.warn(`Developer Author: Raw output (first 500 chars): ${output.substring(0, 500)}`);

        // fallback to string summary (if output is long enough)
        if (output.length > 10) {
          return {
            summary: output.substring(0, 500),
            details: '',
            metrics: {
              actualTimeHours: 0,
              functionalImpact: 5,
              idealTimeHours: 0,
              testCoverage: 5,
              codeQuality: 5,
              codeComplexity: 5,
              technicalDebtHours: 0,
            },
          };
        }

        return {
          summary: '',
          details: 'Failed to parse LLM response',
          metrics: {
            actualTimeHours: 0,
            functionalImpact: 5,
            idealTimeHours: 0,
            testCoverage: 5,
            codeQuality: 5,
            codeComplexity: 5,
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
    if (combined.includes('architect')) return 'Senior Architect';
    if (combined.includes('reviewer')) return 'Code Reviewer';
    return 'Team Member';
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
    const requiredMetrics = [
      'actualTimeHours',
      'functionalImpact',
      'idealTimeHours',
      'testCoverage',
      'codeQuality',
      'codeComplexity',
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
