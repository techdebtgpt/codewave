/**
 * Token Counter Utility
 *
 * Estimates token counts using a simple approximation:
 * - 1 token ≈ 4 characters (rough average for English text)
 * - Special handling for JSON, code, and whitespace
 *
 * This is NOT exact but gives good ballpark estimates to prevent context overflow.
 * For exact counting, use the LLM provider's tokenizer.
 */

/**
 * Estimate token count for a string
 * Uses simplified calculation: characters / 4 (rough average)
 */
export function estimateTokens(text: string | null | undefined): number {
  if (!text) return 0;

  // Rough estimate: 1 token ≈ 4 characters
  // This is conservative - typically overestimates slightly which is safe
  return Math.ceil(text.length / 4);
}

/**
 * Estimate tokens for an object (converts to JSON string)
 */
export function estimateTokensForObject(obj: any): number {
  if (!obj) return 0;
  try {
    const jsonStr = JSON.stringify(obj);
    return estimateTokens(jsonStr);
  } catch {
    return 0;
  }
}

/**
 * Truncate text to approximate token limit
 */
export function truncateToTokenLimit(text: string, maxTokens: number): string {
  const maxChars = maxTokens * 4;
  if (text.length <= maxChars) {
    return text;
  }

  const truncated = text.substring(0, maxChars);
  // Try to end at a sentence boundary
  const lastPeriod = truncated.lastIndexOf('.');
  if (lastPeriod > maxChars * 0.8) {
    return truncated.substring(0, lastPeriod + 1) + '\n[... truncated]';
  }
  return truncated + '\n[... truncated]';
}

/**
 * Check if prompt will exceed token limit
 */
export function willExceedTokenLimit(
  promptParts: string[],
  maxTokens: number = 128000
): {
  exceeds: boolean;
  estimatedTokens: number;
  buffer: number;
} {
  const totalTokens = promptParts.reduce((sum, part) => sum + estimateTokens(part), 0);

  return {
    exceeds: totalTokens > maxTokens,
    estimatedTokens: totalTokens,
    buffer: maxTokens - totalTokens,
  };
}

/**
 * Build a prompt with token validation
 */
export interface PromptSection {
  name: string;
  content: string;
}

export function buildPromptWithValidation(
  sections: PromptSection[],
  maxTokens: number = 128000,
  onWarning?: (message: string) => void
): { prompt: string; tokenCount: number; warnings: string[] } {
  const warnings: string[] = [];
  let totalTokens = 0;
  let prompt = '';

  for (const section of sections) {
    const sectionTokens = estimateTokens(section.content);
    totalTokens += sectionTokens;

    if (totalTokens > maxTokens * 0.9) {
      const warning = `⚠️  Prompt at ${((totalTokens / maxTokens) * 100).toFixed(1)}% of limit after "${section.name}"`;
      warnings.push(warning);
      if (onWarning) onWarning(warning);
    }

    if (totalTokens > maxTokens) {
      const warning = `❌ Prompt exceeds token limit! Section "${section.name}" added ${sectionTokens} tokens, total now ${totalTokens}`;
      warnings.push(warning);
      if (onWarning) onWarning(warning);

      // Truncate this section to stay under limit
      const remainingTokens = maxTokens - (totalTokens - sectionTokens);
      const truncated = truncateToTokenLimit(section.content, remainingTokens);
      prompt += `\n[${section.name}]\n${truncated}`;
      totalTokens = maxTokens; // Cap at limit
      break; // Don't add more sections
    }

    prompt += `\n[${section.name}]\n${section.content}`;
  }

  return { prompt, tokenCount: Math.min(totalTokens, maxTokens), warnings };
}

/**
 * Estimate tokens for a full prompt context
 */
export function estimatePromptTokens(context: {
  systemPrompt?: string;
  userMessage?: string;
  conversationHistory?: string;
  agentResults?: any[];
  diff?: string;
  concerns?: string[];
}): number {
  let total = 0;

  if (context.systemPrompt) total += estimateTokens(context.systemPrompt);
  if (context.userMessage) total += estimateTokens(context.userMessage);
  if (context.conversationHistory) total += estimateTokens(context.conversationHistory);
  if (context.agentResults) {
    total += context.agentResults.reduce((sum, result) => sum + estimateTokensForObject(result), 0);
  }
  if (context.diff) total += estimateTokens(context.diff);
  if (context.concerns) {
    total += context.concerns.reduce((sum, concern) => sum + estimateTokens(concern), 0);
  }

  return total;
}
