// src/config/default-config.ts
// Default configuration matching architecture-doc-generator pattern

import { AppConfig } from './config.interface';

export const DEFAULT_CONFIG: AppConfig = {
  apiKeys: {
    anthropic: '',
    openai: '',
    google: '',
    xai: '',
  },
  llm: {
    provider: 'anthropic',
    model: 'claude-haiku-4-5-20251001', // Cost-optimized for multi-agent discussion (6x cheaper than Sonnet)
    temperature: 0.2,
    maxTokens: 16000, // Safety ceiling for all depth modes - depth modes control actual usage (2000/4500/8000)
  },
  agents: {
    // Enabled agents: business-analyst, sdet, developer-author, senior-architect, developer-reviewer
    // Remove agents from this list to disable them (e.g., for faster evaluation)
    enabled: [
      'business-analyst',
      'sdet',
      'developer-author',
      'senior-architect',
      'developer-reviewer',
    ],
    retries: 3, // Max discussion rounds (for backwards compatibility, overridden by maxRounds if set)
    timeout: 300000, // 5 minutes per agent
    minRounds: 2, // Minimum 2 rounds before allowing early convergence stop
    maxRounds: 3, // Maximum rounds: Round 1 (Initial) → Round 2+ (Discussion) → Final Round (Convergence)
    clarityThreshold: 0.85, // Stop early if 85% similarity between rounds (only after minRounds)
  },
  output: {
    directory: '.', // Current directory
    format: 'json',
    generateHtml: true, // Also generate report.html and index.html
  },
  tracing: {
    enabled: false,
    apiKey: '',
    project: 'codewave',
    endpoint: 'https://api.smith.langchain.com',
  },
  documentation: {
    enabled: true,
    patterns: ['README.md', 'docs/**/*.md', 'ARCHITECTURE.md', '**/*.md'],
    excludePatterns: ['node_modules/**', 'dist/**', '.git/**', 'coverage/**'],
    chunkSize: 1000,
  },
};

// For backwards compatibility
export const defaultConfig = DEFAULT_CONFIG;
