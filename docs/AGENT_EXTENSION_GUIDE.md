# Agent Extension Guide

This guide explains how to extend CodeWave with new agents or modify existing agents using the centralized prompt builder system.

## Overview

CodeWave uses a **centralized prompt builder pattern** to ensure all agents:
- Follow consistent rules and structure
- Return properly formatted metrics (the 7 pillars)
- Can be easily extended from outside the library

## The 7 Immutable Pillars

All agents must evaluate code across these 7 metrics:

1. **functionalImpact** (1-10) - User-facing business value
2. **idealTimeHours** (hours) - How long it should take ideally
3. **testCoverage** (1-10) - Quality and extent of test automation
4. **codeQuality** (1-10) - Code cleanliness and best practices
5. **codeComplexity** (1-10) - Implementation complexity (lower is better)
6. **actualTimeHours** (hours) - Time actually spent
7. **technicalDebtHours** (hours) - Debt introduced/paid down (can be negative)

See: `src/constants/agent-weights.constants.ts`

## Creating a New Agent

### Step 1: Define Agent Metadata

```typescript
import { BaseAgentWorkflow } from './base-agent-workflow';
import { PromptBuilderService } from '../services/prompt-builder.service';

export class MyNewAgent extends BaseAgentWorkflow {
    getMetadata() {
        return {
            name: 'my-agent-key', // e.g., 'security-reviewer'
            description: 'What this agent evaluates',
            role: 'Agent Display Name', // e.g., 'Security Reviewer'
        };
    }

    async canExecute(context: AgentContext) {
        return !!context.commitDiff;
    }

    async estimateTokens(context: AgentContext) {
        return 2000; // Estimated tokens for this agent
    }
```

### Step 2: Implement buildSystemPrompt()

```typescript
    protected buildSystemPrompt(context: AgentContext): string {
        const roundPurpose = (context.roundPurpose || 'initial') as 'initial' | 'concerns' | 'validation';
        const previousContext =
            context.agentResults && context.agentResults.length > 0
                ? context.agentResults
                    .map((r: AgentResult) => `**${r.agentName}**: ${r.summary}`)
                    .join('\n\n')
                : '';

        return PromptBuilderService.buildCompleteSystemPrompt(
            {
                role: 'Agent Display Name', // e.g., 'Security Reviewer'
                description: 'Brief description of the agent',
                agentKey: 'agent-key', // Technical key matching your agent's name
                primaryMetrics: ['metric1'], // Your agent's primary expertise
                secondaryMetrics: ['metric2', 'metric3'], // Secondary expertise
            },
            roundPurpose,
            previousContext
        );
    }
```

### Step 3: Define buildHumanPrompt()

This is where you provide context-specific instructions for analyzing the code:

```typescript
    protected async buildHumanPrompt(context: AgentContext): Promise<string> {
        // Your custom human-facing prompt that explains what to evaluate
        // Include context from the code diff and commit
        // Instructions on how to score the 7 pillars
    }
```

### Step 4: Implement parseLLMResult()

Ensure you parse and validate the 7 metrics:

```typescript
    protected parseLLMResult(output: any): AgentResult {
        const { SEVEN_PILLARS } = require('../constants/agent-weights.constants');

        // Parse JSON from LLM
        // Validate it contains exactly the 7 pillars
        // Filter out any extra metrics
        // Return AgentResult with sanitized metrics
    }
```

## Agent Expertise Weights

Define which metrics your agent specializes in:

```typescript
// src/constants/agent-weights.constants.ts
export const AGENT_EXPERTISE_WEIGHTS: Record<string, AgentWeights> = {
    'my-agent': {
        functionalImpact: 0.130,    // TERTIARY (13%)
        idealTimeHours: 0.083,      // TERTIARY (8.3%)
        testCoverage: 0.200,        // SECONDARY (20%)
        codeQuality: 0.333,         // PRIMARY (33.3%)
        codeComplexity: 0.125,      // TERTIARY (12.5%)
        actualTimeHours: 0.097,     // TERTIARY (9.7%)
        technicalDebtHours: 0.032,  // TERTIARY (3.2%)
    },
    // ...
};
```

**Important**: Weights must sum to 1.0 for each agent and each metric across all agents.

## Using PromptBuilderService

The `PromptBuilderService` provides static methods to build consistent prompts:

### Build Complete System Prompt

```typescript
PromptBuilderService.buildCompleteSystemPrompt(config, roundPurpose, previousContext)
```

This combines:
- Header with agent role
- Round-specific instructions
- Scoring philosophy
- Metric definitions (customized per agent)
- Output requirements
- Important notes

### Build Individual Sections

```typescript
// Get metric definitions for your agent
const definitions = PromptBuilderService.getMetricDefinitions('my-agent');

// Build specific sections
PromptBuilderService.buildSystemPromptHeader(config);
PromptBuilderService.buildRoundInstructions('initial');
PromptBuilderService.buildScoringPhilosophy('my-agent');
PromptBuilderService.buildMetricsSection('my-agent');
PromptBuilderService.buildOutputRequirements();
PromptBuilderService.buildImportantNotes();
```

## JSON Output Format

All agents MUST return metrics in this exact format:

```json
{
  "summary": "2-3 sentence overview (max 150 chars)",
  "details": "Detailed analysis (max 400 chars)",
  "metrics": {
    "functionalImpact": <1-10>,
    "idealTimeHours": <hours>,
    "testCoverage": <1-10>,
    "codeQuality": <1-10>,
    "codeComplexity": <1-10>,
    "actualTimeHours": <hours>,
    "technicalDebtHours": <hours>
  }
}
```

**CRITICAL RULES**:
- ONLY these 7 metrics, NO additional fields
- All metrics required
- metrics field must be an object (not array)
- Return ONLY JSON, no markdown

## Example: Adding a Security Reviewer Agent

```typescript
// src/agents/security-reviewer-agent.ts
import { PromptBuilderService, AgentPromptConfig } from '../services/prompt-builder.service';

export class SecurityReviewerAgent extends BaseAgentWorkflow {
    protected buildSystemPrompt(context: AgentContext): string {
        const roundPurpose = (context.roundPurpose || 'initial') as 'initial' | 'concerns' | 'validation';
        const previousContext = context.agentResults?.length > 0
            ? context.agentResults
                .map((r: AgentResult) => `**${r.agentName}**: ${r.summary}`)
                .join('\n\n')
            : '';

        return PromptBuilderService.buildCompleteSystemPrompt(
            {
                role: 'Security Reviewer',
                description: 'Evaluates security implications, vulnerabilities, and compliance',
                agentKey: 'security-reviewer',
                primaryMetrics: ['codeQuality'], // Security aspects of code quality
                secondaryMetrics: ['technicalDebtHours'], // Security debt
            },
            roundPurpose,
            previousContext
        );
    }

    protected async buildHumanPrompt(context: AgentContext): Promise<string> {
        return `
        Please analyze this code for security issues:
        - Vulnerabilities (CWE, OWASP Top 10)
        - Data protection and privacy
        - Input validation
        - Authentication/Authorization

        Score the 7 pillars with focus on security aspects.
        `;
    }
}
```

## Benefits of Centralized Prompts

✅ **Consistency**: All agents use the same rules and structure
✅ **Maintenance**: Update rules once, applies everywhere
✅ **Extensibility**: Add new agents without duplicating logic
✅ **Type Safety**: TypeScript types prevent errors
✅ **Testability**: Easy to test prompt building logic
✅ **Documentation**: Self-documenting prompt structure

## Registering New Agents

1. Create agent class extending `BaseAgentWorkflow`
2. Implement required methods (buildSystemPrompt, buildHumanPrompt, etc.)
3. Add to `AGENT_EXPERTISE_WEIGHTS` in `agent-weights.constants.ts`
4. Register in orchestrator where agents are instantiated

## Common Pitfalls

❌ **Don't**: Hardcode metric names or rules in each agent
✅ **Do**: Use `SEVEN_PILLARS` constant from centralized location

❌ **Don't**: Return extra metrics beyond the 7 pillars
✅ **Do**: Filter metrics using centralized validation

❌ **Don't**: Use different prompt structures for different agents
✅ **Do**: Use `PromptBuilderService` for consistent structure

❌ **Don't**: Return metrics as array
✅ **Do**: Return metrics as object with 7 named keys

## Testing Your Agent

```typescript
const agent = new MyNewAgent(config);

// Test buildSystemPrompt
const systemPrompt = agent['buildSystemPrompt']({ roundPurpose: 'initial', agentResults: [] });
console.log(systemPrompt); // Should include all sections

// Test that output validates 7 metrics
const testOutput = `{"summary": "test", "details": "test", "metrics": {...}}`;
const result = agent['parseLLMResult'](testOutput);
console.log(result.metrics); // Should have exactly 7 keys
```

## Updating Existing Agents

To update existing agents to use centralized prompts:

1. Add import: `import { PromptBuilderService } from '../services/prompt-builder.service';`
2. Replace entire `buildSystemPrompt()` method with centralized version (see example above)
3. Keep `buildHumanPrompt()` custom to each agent
4. Keep `parseLLMResult()` but ensure it filters to 7 pillars
5. Test thoroughly

## Questions?

Refer to:
- `src/constants/agent-weights.constants.ts` - Pillar definitions and weights
- `src/services/prompt-builder.service.ts` - Prompt builder API
- `src/agents/developer-author-agent.ts` - Reference implementation

