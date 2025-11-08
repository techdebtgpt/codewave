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
        'claude-haiku-4-5-20251001': {
            input: 0.80,
            output: 4.00,
        },
        // Sonnet 4.5 - Latest, best balance of quality and cost
        'claude-sonnet-4-5-20250929': {
            input: 3.00,
            output: 15.00,
        },
        'claude-sonnet-4-20250514': {
            input: 3.00,
            output: 15.00,
        },
        'claude-3-5-sonnet-20241022': {
            input: 3.00,
            output: 15.00,
        },
        // Opus 4.1 - Maximum quality
        'claude-opus-4-1-20250805': {
            input: 15.00,
            output: 75.00,
        },
    },
    openai: {
        // GPT-4o Mini - Cost-effective for multi-agent discussion
        'gpt-4o-mini': {
            input: 0.15,
            output: 0.60,
        },
        // GPT-4o - Latest multimodal model
        'gpt-4o': {
            input: 2.50,
            output: 10.00,
        },
        // o3-mini - Advanced reasoning, cost-efficient
        'o3-mini-2025-01-31': {
            input: 2.00,
            output: 8.00,
        },
        // o3 - Most powerful reasoning
        'o3': {
            input: 20.00,
            output: 80.00,
        },
        // Legacy o1-mini
        'o1-mini': {
            input: 3.00,
            output: 12.00,
        },
    },
    google: {
        // Gemini 2.5 Flash - Best cost-performance ratio
        'gemini-2.5-flash': {
            input: 0.075,
            output: 0.30,
        },
        // Gemini 2.5 Flash-Lite - Fastest and most efficient
        'gemini-2.5-flash-lite': {
            input: 0.0375,
            output: 0.15,
        },
        // Gemini 2.5 Pro - Best reasoning
        'gemini-2.5-pro': {
            input: 1.50,
            output: 6.00,
        },
        // Legacy models
        'gemini-2.0-flash-exp': {
            input: 0.00,
            output: 0.00,
        },
        'gemini-1.5-flash': {
            input: 0.075,
            output: 0.30,
        },
        'gemini-1.5-pro': {
            input: 1.25,
            output: 5.00,
        },
        'gemini-2.0-pro': {
            input: 2.50,
            output: 10.00,
        },
    },
    xai: {
        // Grok 4 Fast (non-reasoning) - Latest, 40% fewer tokens than Grok 4
        'grok-4-fast-non-reasoning': {
            input: 5.00,
            output: 15.00,
        },
        // Grok 4.2 - Polished version
        'grok-4.2': {
            input: 5.00,
            output: 15.00,
        },
        // Grok 4 - Advanced reasoning model
        'grok-4-0709': {
            input: 5.00,
            output: 15.00,
        },
    },
};

/**
 * Calculate cost for token usage
 * @param provider LLM provider (anthropic, openai, google, xai)
 * @param model Model name
 * @param tokenUsage Token usage statistics
 * @returns Cost calculation
 */
export function calculateCost(
    provider: string,
    model: string,
    tokenUsage: TokenUsage,
): CostCalculation {
    const providerPricing = TOKEN_PRICING[provider as keyof typeof TOKEN_PRICING];
    if (!providerPricing) {
        console.warn(`Unknown provider: ${provider}, using zero cost`);
        return { inputCost: 0, outputCost: 0, totalCost: 0 };
    }

    const pricing = providerPricing[model as keyof typeof providerPricing] as { input: number; output: number } | undefined;

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
