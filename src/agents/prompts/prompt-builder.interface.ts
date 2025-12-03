/**
 * Prompt builder interfaces
 * Defines how agents construct their prompts for LLM interaction
 */

import { AgentContext } from '../agent.interface';

/**
 * Context for building prompts
 * Contains all information needed to generate a prompt
 */
export interface PromptContext extends AgentContext {
  /** Agent's technical name */
  agentName: string;
  /** Agent's display role */
  agentRole: string;
  /** Categorized expertise levels */
  primaryMetrics: string[];
  secondaryMetrics: string[];
  tertiaryMetrics: string[];
}

/**
 * Base interface for prompt builders
 * All prompt builders must implement this interface
 */
export interface PromptBuilder {
  /**
   * Build a prompt from context
   * @returns A complete, well-formatted prompt string (NO concatenation in caller)
   */
  build(context: PromptContext): Promise<string> | string;
}

/**
 * System prompt builder - defines agent's core identity and instructions
 */
export interface SystemPromptBuilder extends PromptBuilder {
  /**
   * Build the system prompt that defines the agent's role
   * This is sent once at the start of the conversation
   */
  build(context: PromptContext): string;
}

/**
 * Initial analysis prompt builder - for first-round analysis
 */
export interface InitialPromptBuilder extends PromptBuilder {
  /**
   * Build the initial analysis prompt
   * This prompts the agent to analyze the commit for the first time
   */
  build(context: PromptContext): Promise<string>;
}

/**
 * Refinement prompt builder - for iterative improvement
 * Note: Does NOT extend PromptBuilder because it has a different signature
 */
export interface RefinementPromptBuilder {
  /**
   * Build a refinement prompt based on previous analysis
   * @param context Prompt context
   * @param previousAnalysis The agent's previous analysis
   * @param selfQuestions Questions the agent needs to address
   * @param clarityScore Current clarity score (0-1)
   * @returns Complete refinement prompt string
   */
  build(
    context: PromptContext,
    previousAnalysis: string,
    selfQuestions: string[],
    clarityScore: number
  ): string;
}
