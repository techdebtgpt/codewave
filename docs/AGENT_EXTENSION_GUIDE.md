# Agent Extension Guide

This guide explains how to extend CodeWave with new custom agents using the clean, extensible agent architecture.

## Overview

CodeWave provides a **BaseAgent** class that you can extend to create custom agents. The architecture is designed for:

- **Extensibility** - Easy to extend from outside the library
- **Clean prompts** - No string concatenation, use template literals
- **Separation of concerns** - Agents focus on domain logic, execution is handled separately
- **Type safety** - Full TypeScript support

## The 7 Immutable Pillars

All agents must evaluate code across these 7 metrics:

1. **functionalImpact** (0-10) - User-facing business value
2. **idealTimeHours** (hours) - How long it should take ideally
3. **testCoverage** (0-10) - Quality and extent of test automation
4. **codeQuality** (0-10) - Code cleanliness and best practices
5. **codeComplexity** (0-10) - Implementation complexity (lower is better)
6. **actualTimeHours** (hours) - Time actually spent
7. **technicalDebtHours** (hours) - Debt introduced/paid down (can be negative)

See: `src/constants/agent-weights.constants.ts`

## Creating a Custom Agent

### Step 1: Import the Base Classes

```typescript
import { BaseAgent } from '@techdebtgpt/codewave/agents/core';
import { AgentMetadata, AgentExpertise } from '@techdebtgpt/codewave/agents/core/agent-metadata';
import { PromptContext } from '@techdebtgpt/codewave/agents/prompts/prompt-builder.interface';
```

### Step 2: Define Your Agent

```typescript
export class SecurityReviewerAgent extends BaseAgent {
  // Define agent identity
  protected readonly metadata: AgentMetadata = {
    name: 'security-reviewer',
    role: 'Security Reviewer',
    description: 'Evaluates security implications and vulnerabilities',
    roleDescription: 'security and vulnerability perspective',
  };

  // Define expertise weights (must sum to ~1.0 across all 7 pillars)
  protected readonly expertise: AgentExpertise = {
    functionalImpact: 0.15,      // Security affects functionality
    idealTimeHours: 0.1,          // Limited time estimation
    testCoverage: 0.2,            // Security testing important
    codeQuality: 0.3,             // PRIMARY: Security code quality
    codeComplexity: 0.15,         // Security complexity
    actualTimeHours: 0.05,        // Limited time tracking
    technicalDebtHours: 0.05,     // Security debt
  };

  // Define system instructions (clear, complete prompt)
  protected readonly systemInstructions = `You are a Security Reviewer evaluating code commits.

Your role is to evaluate commits across ALL 7 pillars, with special focus on security implications.

## Your Expertise
- **Code Quality** (PRIMARY): Security code quality and best practices
- **Test Coverage** (SECONDARY): Security testing coverage
- **Other Metrics**: Provide security-informed opinions

## Your Approach
- Identify potential security vulnerabilities
- Assess adherence to security best practices
- Evaluate input validation and sanitization
- Consider authentication and authorization implications

Return your analysis as JSON with all 7 metrics.`;

  // Build the initial analysis prompt
  protected async buildInitialPrompt(context: PromptContext): Promise<string> {
    const filesChanged = context.filesChanged?.join(', ') || 'unknown files';

    return `## ${this.metadata.role} - Round ${(context.currentRound || 0) + 1}: Initial Analysis

**Files Changed:** ${filesChanged}

**Commit Diff:**
\`\`\`
${context.commitDiff}
\`\`\`

**Your Task:**
Analyze this commit from a ${this.metadata.roleDescription} and score ALL 7 metrics:

1. **codeQuality** - YOUR PRIMARY EXPERTISE (security quality)
2. **testCoverage** - YOUR SECONDARY EXPERTISE (security testing)
3. **functionalImpact** - your opinion
4. **idealTimeHours** - your opinion
5. **codeComplexity** - your opinion
6. **actualTimeHours** - your opinion
7. **technicalDebtHours** - your opinion

**Response Format:**
Return ONLY valid JSON:
\`\`\`json
{
  "summary": "High-level security assessment",
  "details": "Detailed security analysis",
  "metrics": {
    "functionalImpact": <score 0-10>,
    "idealTimeHours": <hours>,
    "testCoverage": <score 0-10>,
    "codeQuality": <score 0-10>,
    "codeComplexity": <score 0-10>,
    "actualTimeHours": <hours>,
    "technicalDebtHours": <hours>
  },
  "concerns": ["Security concerns"],
  "questionsForTeam": ["Questions for other agents"]
}
\`\`\`

CRITICAL: Return ONLY valid JSON, no markdown fences, no extra text.`;
  }
}
```

### Step 3: Register Your Agent

```typescript
import { AgentRegistry } from '@techdebtgpt/codewave/agents';
import { SecurityReviewerAgent } from './my-agents/security-reviewer-agent';

const registry = new AgentRegistry();
registry.register(new SecurityReviewerAgent(config));
```

## Key Principles

### ✅ DO

- **Use complete template literals** for prompts (no string concatenation)
- **Define all 7 metrics** in your expertise weights
- **Provide clear system instructions** explaining your agent's role
- **Focus on your primary expertise** but score all metrics
- **Return valid JSON** from your prompts

### ❌ DON'T

- **Don't concatenate strings** in prompt building
- **Don't skip metrics** - all agents must score all 7 pillars
- **Don't hardcode values** - use the PromptContext
- **Don't ignore the base class methods** - they handle execution for you

## Advanced: Custom Refinement Prompts

You can override `buildRefinementPrompt` to customize how your agent refines its analysis:

```typescript
protected buildRefinementPrompt(
  context: PromptContext,
  previousAnalysis: string,
  selfQuestions: string[],
  clarityScore: number
): string {
  return `## Security Review Refinement

Your previous analysis scored ${(clarityScore * 100).toFixed(1)}% clarity.

Address these security-specific questions:
${selfQuestions.map((q, i) => `${i + 1}. ${q}`).join('\n')}

## Previous Analysis
\`\`\`json
${previousAnalysis}
\`\`\`

Provide refined analysis with all 7 metrics as valid JSON.`;
}
```

## Architecture Overview

```
Your Agent (extends BaseAgent)
├── metadata: Agent identity
├── expertise: Metric weights
├── systemInstructions: Core behavior
└── buildInitialPrompt(): Initial analysis prompt

BaseAgent (handles execution)
├── execute(): Runs agent graph
├── canExecute(): Checks if agent can run
└── estimateTokens(): Token estimation

AgentExecutor (orchestrates execution)
├── Graph creation
├── LLM invocation
└── Result parsing

AgentInternalGraph (iteration logic)
├── generateInitialAnalysis
├── evaluateClarity
└── refineAnalysis (if needed)
```

## Examples

See the built-in agents in `src/agents/implementations/` for complete examples:

- **BusinessAnalystAgent** - Business value expert
- **DeveloperAuthorAgent** - Implementation time expert
- **DeveloperReviewerAgent** - Code quality expert
- **SDETAgent** - Test automation expert
- **SeniorArchitectAgent** - Complexity & debt expert

## Testing Your Agent

```typescript
const agent = new MyCustomAgent(config);

const context = {
  commitDiff: 'your test diff',
  filesChanged: ['file.ts'],
  developerOverview: 'Test changes',
  currentRound: 0,
  depthMode: 'normal',
};

const result = await agent.execute(context);
console.log(result.metrics); // All 7 pillars should be present
```

## Next Steps

1. Create your custom agent class
2. Define metadata, expertise, and system instructions
3. Implement `buildInitialPrompt()`
4. Register and test your agent
5. (Optional) Customize refinement prompts

For questions or issues, see the main [README.md](../README.md) or open an issue on GitHub.
