/**
 * Agents Module - Public API
 *
 * This is the main entry point for the agents module.
 * External users can extend agents by importing from this module.
 */

// Core types and base classes (for extension)
export * from './core';
export * from './prompts';

// Agent interface and registry
export { Agent, AgentContext, AgentResult, AgentExecutionOptions } from './agent.interface';
export { AgentRegistry } from './agent-registry';

// Built-in agent implementations
export * from './implementations';
