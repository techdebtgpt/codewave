/**
 * Developer Overview Generator Service
 * Generates a structured overview of changes from the commit diff
 * This context is shared with all agents for consistent evaluation
 */

import { DeveloperOverview } from '../agents/agent.interface';
import { AppConfig } from '../config/config.interface';
import { LLMService } from '../llm/llm-service';

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
        commitMessage?: string,
    ): Promise<DeveloperOverview> {
        // Build the prompt
        const prompt = this.buildPrompt(commitDiff, filesChanged, commitMessage);

        // Get the configured LLM model (reuses same provider/config as agents)
        const model = LLMService.getChatModel(this.config);

        // Invoke the model using LangChain's standardized interface
        const result = await model.invoke([
            {
                role: 'user',
                content: prompt,
            },
        ]);

        const responseText = typeof result.content === 'string'
            ? result.content
            : '';

        // Parse the structured response
        return this.parseResponse(responseText);
    }

    /**
     * Build prompt for Claude to generate overview
     */
    private buildPrompt(
        commitDiff: string,
        filesChanged: string[],
        commitMessage?: string,
    ): string {
        return `You are analyzing a commit to generate a structured overview for a code review team.

${commitMessage ? `Commit Message: ${commitMessage}\n\n` : ''}Files Changed: ${filesChanged.join(', ')}

Commit Diff:
\`\`\`
${commitDiff}
\`\`\`

Please analyze this commit and provide a structured overview in JSON format. Keep responses concise:
{
  "summary": "One-line summary, max 100 chars (e.g., 'Added caching layer to improve API response times')",
  "description": "2-3 sentences max, ~150 chars. What changed and why.",
  "keyPoints": ["Change 1 (brief)", "Change 2 (brief)", "Change 3 (brief)"],
  "testingApproach": "Brief testing note, max 100 chars"
}

CRITICAL: Return ONLY the JSON object. No markdown headers, no extra text, no code fences.

Focus on WHAT, WHY, and IMPACT. Be concise.`;
    }

    /**
     * Parse Claude's response into DeveloperOverview
     */
    private parseResponse(responseText: string): DeveloperOverview {
        try {
            let cleanOutput = responseText.trim();

            // Try to extract JSON from the response
            const jsonMatch = cleanOutput.match(/\{[\s\S]*\}/);
            if (!jsonMatch) {
                throw new Error('No JSON found in response');
            }

            cleanOutput = jsonMatch[0];

            // Try to close incomplete JSON if needed (handles truncated responses)
            let braceCount = (cleanOutput.match(/\{/g) || []).length;
            let closingBraces = (cleanOutput.match(/\}/g) || []).length;
            if (braceCount > closingBraces) {
                cleanOutput += '}'.repeat(braceCount - closingBraces);
            }

            const parsed = JSON.parse(cleanOutput);

            return {
                summary: parsed.summary || 'Changes to the codebase',
                description:
                    parsed.description ||
                    'No detailed description available',
                keyPoints: Array.isArray(parsed.keyPoints) ? parsed.keyPoints : [],
                testingApproach:
                    parsed.testingApproach || 'Not specified',
                generatedAt: new Date().toISOString(),
            };
        } catch (error) {
            console.warn(
                `Failed to parse developer overview response: ${error instanceof Error ? error.message : String(error)}`,
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
${overview.keyPoints.map(p => `- ${p}`).join('\n')}

**Testing Approach:**
${overview.testingApproach}`;
    }
}
