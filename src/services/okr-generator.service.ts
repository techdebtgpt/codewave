// src/services/okr-generator.service.ts
// Service for generating OKRs using LLM
// Follows existing patterns from DeveloperOverviewGenerator and PromptBuilderService

import { AppConfig } from '../config/config.interface';
import { LLMService } from '../llm/llm-service';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { AuthorStats } from './author-stats-aggregator.service';

/**
 * Service for generating Objectives and Key Results (OKRs) using LLM
 * Follows existing LLM service patterns in the codebase
 */
export class OkrGeneratorService {
  private llm: any;

  constructor(private config: AppConfig) {
    this.llm = LLMService.getChatModel(config);
  }

  /**
   * Generate OKRs for a single author
   */
  async generateOkrsForAuthor(
    author: string,
    stats: AuthorStats,
    strengths: string[],
    weaknesses: string[]
  ): Promise<string[]> {
    const prompt = this.buildOkrPrompt(stats, strengths, weaknesses);

    try {
      const response = await this.llm.invoke([
        new SystemMessage(this.buildSystemMessage()),
        new HumanMessage(prompt),
      ]);

      const okrText =
        typeof response.content === 'string' ? response.content : JSON.stringify(response.content);

      // Parse and clean OKRs
      const okrs = okrText
        .split('\n')
        .filter((line: string) => line.trim().length > 0)
        .map((line: string) => line.replace(/^[\d-]+\.\s*/, '').trim()) // Remove numbering
        .slice(0, 3); // Take first 3

      return okrs;
    } catch (error) {
      throw new Error(
        `Failed to generate OKRs for ${author}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Generate OKRs for multiple authors
   */
  async generateOkrsForAll(
    authorAnalyses: Map<string, { stats: AuthorStats; strengths: string[]; weaknesses: string[] }>
  ): Promise<Record<string, string[]>> {
    const allOkrs: Record<string, string[]> = {};

    for (const [author, analysis] of authorAnalyses.entries()) {
      const okrs = await this.generateOkrsForAuthor(
        author,
        analysis.stats,
        analysis.strengths,
        analysis.weaknesses
      );
      allOkrs[author] = okrs;
    }

    return allOkrs;
  }

  /**
   * Build system message for LLM
   * Similar to how PromptBuilderService structures prompts
   */
  private buildSystemMessage(): string {
    return 'You are an Engineering Manager creating OKRs. You MUST use exact metric values from the prompt when referencing current performance. Never round, estimate, or invent numbers.';
  }

  /**
   * Build OKR generation prompt
   * Follows structured prompting pattern from PromptBuilderService
   */
  private buildOkrPrompt(stats: AuthorStats, strengths: string[], weaknesses: string[]): string {
    return `Generate 3 OKRs for a developer with these EXACT metrics from ${stats.commits} commits:

CURRENT STATE:
• Code Quality Score: ${stats.quality.toFixed(1)} out of 10 (higher is better)
• Code Complexity Score: ${stats.complexity.toFixed(1)} out of 10 (LOWER is better: 1 = very simple, 10 = very complex)
• Test Coverage Score: ${stats.tests.toFixed(1)} out of 10 (higher is better)
• Business Impact Score: ${stats.impact.toFixed(1)} out of 10 (higher is better)
• Tech Debt Accumulated: ${stats.techDebt.toFixed(1)} hours

ANALYSIS:
• Strong areas: ${strengths.join(', ') || 'Balanced performance across all metrics'}
• Areas needing improvement: ${weaknesses.join(', ') || 'Maintain current performance levels'}

YOUR TASK:
Create 3 specific, measurable OKRs that:
1. Address the weakest areas (lowest scores above)
2. Set realistic improvement targets (typically +2 to +3 points for scores below 7)
3. For complexity: lower scores are better, so suggest reducing from current value
4. Are 1-2 sentences each
5. Use ONLY the exact metric values shown above if you reference current state

IMPORTANT: When stating current values, copy them EXACTLY from the "CURRENT STATE" section above.

Return only the 3 OKR texts, one per line, no numbering or formatting.`;
  }
}
