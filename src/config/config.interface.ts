// src/config/config.interface.ts
// Commit Evaluator AppConfig interface (matches architecture-doc-generator pattern)

import { AnalysisDepthMode } from '../types/agent.types';

export interface AppConfig {
  apiKeys: {
    anthropic: string;
    openai: string;
    google: string;
    xai: string;
    ollama: string;
    'lm-studio': string;
    groq: string;
  };
  llm: {
    provider: 'anthropic' | 'openai' | 'google' | 'xai' | 'ollama' | 'lm-studio' | 'groq';
    model: string;
    temperature: number;
    maxTokens: number;
    baseUrl?: string;
  };
  agents: {
    enabled: string[];
    retries: number; // Max discussion rounds between agents (for backwards compatibility)
    timeout: number;
    clarityThreshold?: number; // Stop early if team convergence detected (0-1)

    // Discussion rounds configuration (more explicit control)
    minRounds?: number; // Minimum rounds before allowing early convergence stop (default: 2)
    maxRounds?: number; // Maximum discussion rounds (default: 3, overrides retries if set)

    // Agent self-iteration depth configuration
    depthMode?: AnalysisDepthMode; // 'fast' | 'normal' | 'deep'
    maxInternalIterations?: number; // Max self-refinement loops per agent
    internalClarityThreshold?: number; // Clarity target for agent to stop iterating (0-100)
  };
  output: {
    directory: string;
    format: 'json' | 'markdown' | 'html';
    generateHtml: boolean;
  };
  tracing: {
    enabled: boolean;
    apiKey: string;
    project: string;
    endpoint: string;
  };
  documentation?: {
    enabled: boolean;
    patterns: string[]; // ['README.md', 'docs/**/*.md']
    excludePatterns?: string[]; // ['node_modules/**', 'dist/**']
    chunkSize?: number; // Max chars per chunk (default: 1000)
  };
}
