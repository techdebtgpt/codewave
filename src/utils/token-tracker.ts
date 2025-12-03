// src/utils/token-tracker.ts
// Token usage tracking and cost calculation for LLM calls

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface CostCalculation {
  inputCost: number;
  outputCost: number;
  totalCost: number;
}

/**
 * Token pricing per million tokens (as of Nov 2025)
 */
export const TOKEN_PRICING = {
  anthropic: {
    // Haiku 4.5 - Most cost-effective, ideal for multi-agent discussion
    'claude-haiku-4-5-20251001': { input: 0.8, output: 4.0 },
    'claude-sonnet-4-5-20250929': { input: 3.0, output: 15.0 },
    'claude-sonnet-4-20250514': { input: 3.0, output: 15.0 },
    'claude-3-5-sonnet-20241022': { input: 3.0, output: 15.0 },
    'claude-opus-4-1-20250805': { input: 15.0, output: 75.0 },
  },
  openai: {
    'gpt-4o-mini': { input: 0.15, output: 0.6 },
    'gpt-4o': { input: 2.5, output: 10.0 },
    'o3-mini-2025-01-31': { input: 2.0, output: 8.0 },
    o3: { input: 20.0, output: 80.0 },
    'o1-mini': { input: 3.0, output: 12.0 },
  },
  google: {
    'gemini-2.5-flash': { input: 0.075, output: 0.3 },
    'gemini-2.5-flash-lite': { input: 0.0375, output: 0.15 },
    'gemini-2.5-pro': { input: 1.5, output: 6.0 },
    'gemini-2.0-flash-exp': { input: 0.0, output: 0.0 },
    'gemini-1.5-flash': { input: 0.075, output: 0.3 },
    'gemini-1.5-pro': { input: 1.25, output: 5.0 },
    'gemini-2.0-pro': { input: 2.5, output: 10.0 },
  },
  xai: {
    'grok-4-fast-non-reasoning': { input: 5.0, output: 15.0 },
    'grok-4.2': { input: 5.0, output: 15.0 },
    'grok-4-0709': { input: 5.0, output: 15.0 },
  },
  ollama: {
    // ✅ Local models are free; values are zero
    // Added so cost calculation doesn't log warnings
    llama3: { input: 0, output: 0 },
    mistral: { input: 0, output: 0 },
  },
  groq: {
    'openai/gpt-oss-120b': { input: 0.075, output: 0.3 },
  },
  'lm-studio': {
    'openai/gpt-oss-20b': { input: 0, output: 0 },
  },
};

/**
 * Calculate cost for token usage
 * @param provider LLM provider (anthropic, openai, google, xai, ollama)
 * @param model Model name
 * @param tokenUsage Token usage statistics
 * @returns Cost calculation
 */
export function calculateCost(
  provider: string,
  model: string,
  tokenUsage: TokenUsage
): CostCalculation {
  const providerPricing = TOKEN_PRICING[provider as keyof typeof TOKEN_PRICING];
  if (!providerPricing) {
    console.warn(`Unknown provider: ${provider}, using zero cost`);
    return { inputCost: 0, outputCost: 0, totalCost: 0 };
  }

  const pricing = providerPricing[model as keyof typeof providerPricing] as
    | { input: number; output: number }
    | undefined;

  if (!pricing) {
    console.warn(`Unknown pricing for ${provider}/${model}, using zero cost`);
    return {
      inputCost: 0,
      outputCost: 0,
      totalCost: 0,
    };
  }

  const inputCost = (tokenUsage.inputTokens / 1_000_000) * pricing.input;
  const outputCost = (tokenUsage.outputTokens / 1_000_000) * pricing.output;

  return {
    inputCost,
    outputCost,
    totalCost: inputCost + outputCost,
  };
}

/**
 * Format token usage for logging
 */
export function formatTokenUsage(tokenUsage: TokenUsage): string {
  return `${tokenUsage.totalTokens.toLocaleString()} (in: ${tokenUsage.inputTokens.toLocaleString()}, out: ${tokenUsage.outputTokens.toLocaleString()})`;
}

/**
 * Format cost for logging
 */
export function formatCost(cost: number): string {
  return `$${cost.toFixed(4)}`;
}
