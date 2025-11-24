/**
 * Developer Overview Generator Service
 * Generates a structured overview of changes from the commit diff
 * This context is shared with all agents for consistent evaluation
 */

import { DeveloperOverview } from '../agents/agent.interface';
import { AppConfig } from '../config/config.interface';
import { LLMService } from '../llm/llm-service';
import { estimateTokens, truncateToTokenLimit } from '../utils/token-counter';

export class DeveloperOverviewGenerator {
  private config: AppConfig;

  constructor(config: AppConfig) {
    this.config = config;
  }

  /**
   * Generate developer overview from commit diff
   * Returns a structured summary of what changed and why
   */
  async generateOverview(
    commitDiff: string,
    filesChanged: string[],
    commitMessage?: string
  ): Promise<DeveloperOverview> {
    // Build the prompt
    let prompt = this.buildPrompt(commitDiff, filesChanged, commitMessage);

    // Check if prompt will exceed token limit (Claude 3.5 has 128k limit)
    const promptTokens = estimateTokens(prompt);
    const maxAllowedTokens = 120000; // Leave 8k buffer for safety

    if (promptTokens > maxAllowedTokens) {
      console.warn(
        `⚠️  Developer overview prompt too large (${promptTokens} tokens, max ${maxAllowedTokens}). Truncating diff.`
      );

      // Truncate the diff to reduce token count
      const maxDiffTokens = Math.max(
        5000,
        maxAllowedTokens - estimateTokens(commitMessage || '') - 3000
      );
      const truncatedDiff = truncateToTokenLimit(commitDiff, maxDiffTokens);
      prompt = this.buildPrompt(truncatedDiff, filesChanged, commitMessage);

      const newTokens = estimateTokens(prompt);
      if (newTokens > maxAllowedTokens) {
        console.warn(
          `⚠️  Truncated prompt still large (${newTokens} tokens). Reducing files list.`
        );
        // If still too large, reduce files list too
        const truncatedFiles = filesChanged.slice(
          0,
          Math.max(1, Math.floor(filesChanged.length / 2))
        );
        prompt = this.buildPrompt(truncatedDiff, truncatedFiles, commitMessage);
      }
    }

    // Get the configured LLM model (reuses same provider/config as agents)
    // Override maxTokens to 500 for concise developer overview
    const config = { ...this.config };
    config.llm = { ...config.llm, maxTokens: 500 };
    const model = LLMService.getChatModel(config);

    try {
      // Invoke the model using LangChain's standardized interface
      const result = await model.invoke([
        {
          role: 'user',
          content: prompt,
        },
      ]);

      const responseText = typeof result.content === 'string' ? result.content : '';

      // Parse the structured response
      return this.parseResponse(responseText);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);

      // Check if it's a token limit error
      if (errorMsg.includes('128000 tokens') || errorMsg.includes('maximum context length')) {
        console.warn(
          `⚠️  Failed to generate developer overview: Token limit exceeded. Using fallback overview.`
        );
        // Return a minimal overview instead of crashing
        return {
          summary: filesChanged.slice(0, 3).join(', '),
          description: `Changes in ${filesChanged.length} file(s)`,
          keyPoints: filesChanged.slice(0, 5),
          testingApproach: 'Review changes carefully',
          generatedAt: new Date().toISOString(),
        };
      }

      // For other errors, re-throw
      throw error;
    }
  }

  /**
   * Build prompt for Claude to generate overview
   */
  private buildPrompt(commitDiff: string, filesChanged: string[], commitMessage?: string): string {
    return `You are analyzing a commit to generate a structured overview for a code review team.
Your response MUST be valid JSON with NO additional text.
Keep your response under 400 tokens.

${commitMessage ? `Commit Message: ${commitMessage}\n\n` : ''}Files Changed: ${filesChanged.join(', ')}

Commit Diff:
\`\`\`
${commitDiff}
\`\`\`

Analyze this commit and respond with ONLY this JSON structure (no markdown, no code fences, no extra text):
{
  "summary": "One-line summary, max 100 chars. What is the main change?",
  "description": "2-3 sentences max (~150 chars). What changed and why?",
  "keyPoints": ["Change 1 (brief)", "Change 2 (brief)", "Change 3 (brief max)"],
  "testingApproach": "Brief testing note, max 100 chars"
}

CRITICAL INSTRUCTIONS:
1. Return ONLY valid JSON - no markdown, headers, or code fences
2. Keep all string values under 150 chars
3. Return the complete JSON object with all 4 fields
4. If parsing would exceed token limit, truncate descriptions
5. Do not include newlines in string values (use spaces instead)`;
  }

  /**
   * Parse Claude's response into DeveloperOverview
   * Uses robust brace-counting to handle truncation and markdown-wrapped JSON
   */
  private parseResponse(responseText: string): DeveloperOverview {
    try {
      let cleaned = responseText.trim();

      // Remove markdown code fences if present
      cleaned = cleaned.replace(/^```(?:json|javascript)?\s*\n?/i, '');
      cleaned = cleaned.replace(/\n?```\s*$/i, '');
      cleaned = cleaned.trim();

      // Find JSON start
      const jsonStart = cleaned.indexOf('{');
      if (jsonStart === -1) {
        throw new Error('No JSON object found in output');
      }

      // Count braces to find balanced JSON object
      let braceCount = 0;
      let jsonEnd = -1;

      for (let i = jsonStart; i < cleaned.length; i++) {
        if (cleaned[i] === '{') {
          braceCount++;
        } else if (cleaned[i] === '}') {
          braceCount--;
          if (braceCount === 0) {
            jsonEnd = i;
            break;
          }
        }
      }

      if (jsonEnd === -1) {
        throw new Error('Incomplete JSON object - unmatched braces');
      }

      // Extract balanced JSON portion only
      const jsonStr = cleaned.substring(jsonStart, jsonEnd + 1);
      const parsed = JSON.parse(jsonStr);

      return {
        summary: parsed.summary || 'Changes to the codebase',
        description: parsed.description || 'No detailed description available',
        keyPoints: Array.isArray(parsed.keyPoints) ? parsed.keyPoints : [],
        testingApproach: parsed.testingApproach || 'Not specified',
        generatedAt: new Date().toISOString(),
      };
    } catch (error) {
      console.warn(
        `Failed to parse developer overview response: ${error instanceof Error ? error.message : String(error)}`
      );
      console.warn(`Raw response (first 300 chars): ${responseText.substring(0, 300)}`);

      // Return a basic overview as fallback
      return {
        summary: 'Code changes',
        description: responseText.substring(0, 500),
        keyPoints: [],
        testingApproach: 'Not specified',
        generatedAt: new Date().toISOString(),
      };
    }
  }

  /**
   * Format overview as a readable string for agent prompts
   */
  static formatForPrompt(overview: DeveloperOverview): string {
    return `## Developer Overview

**Summary:** ${overview.summary}

**Details:**
${overview.description}

**Key Changes:**
${overview.keyPoints.map((p) => `- ${p}`).join('\n')}

**Testing Approach:**
${overview.testingApproach}`;
  }
}
