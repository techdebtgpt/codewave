/**
 * Core metadata and configuration for agents
 * This module provides base types for agent identity and expertise
 */

/**
 * Agent identity and role information
 */
export interface AgentMetadata {
  /** Technical identifier (e.g., 'business-analyst', 'sdet') */
  name: string;
  /** Display name (e.g., 'Business Analyst', 'SDET') */
  role: string;
  /** Short description of agent's purpose */
  description: string;
  /** Longer description of agent's role and perspective */
  roleDescription: string;
}

/**
 * Agent expertise weights for the 7 pillars + debt reduction
 * Each weight is 0-1, indicating how much the agent specializes in that pillar
 */
export interface AgentExpertise {
  functionalImpact: number;
  idealTimeHours: number;
  testCoverage: number;
  codeQuality: number;
  codeComplexity: number;
  actualTimeHours: number;
  technicalDebtHours: number;
  debtReductionHours: number; // NEW: How much debt is this commit FIXING/REMOVING?
}

/**
 * Base configuration for all agents
 * This is the minimal interface that external agents must implement
 */
export interface AgentConfiguration {
  /** Agent identity information */
  metadata: AgentMetadata;

  /** Expertise weights (0-1) for each of the 7 pillars */
  expertise: AgentExpertise;

  /**
   * System instructions that define the agent's core behavior
   * This should be a complete, clear prompt - NOT concatenated strings
   */
  systemInstructions: string;
}

/**
 * Helper to categorize agent expertise by weight
 */
export function categorizeExpertise(expertise: AgentExpertise): {
  primary: string[]; // weight >= 0.4
  secondary: string[]; // weight >= 0.15
  tertiary: string[]; // weight < 0.15
} {
  const primary: string[] = [];
  const secondary: string[] = [];
  const tertiary: string[] = [];

  for (const [pillar, weight] of Object.entries(expertise)) {
    if (weight >= 0.4) {
      primary.push(pillar);
    } else if (weight >= 0.15) {
      secondary.push(pillar);
    } else {
      tertiary.push(pillar);
    }
  }

  return { primary, secondary, tertiary };
}
