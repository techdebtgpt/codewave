/**
 * Senior Architect Agent
 *
 * Evaluates architecture, design patterns, code complexity, and technical debt.
 * Focuses on long-term maintainability and architectural soundness.
 */

import { BaseAgent } from '../core/base-agent';
import { AgentMetadata, AgentExpertise } from '../core/agent-metadata';
import { PromptContext } from '../prompts/prompt-builder.interface';

export class SeniorArchitectAgent extends BaseAgent {
  // ============================================================================
  // AGENT IDENTITY & EXPERTISE
  // ============================================================================

  protected readonly metadata: AgentMetadata = {
    name: 'senior-architect',
    role: 'Senior Architect',
    description: 'Evaluates architecture, design patterns, code complexity, and technical debt',
    roleDescription: 'architecture, complexity, and technical debt perspective',
  };

  protected readonly expertise: AgentExpertise = {
    functionalImpact: 0.174, // SECONDARY (17.4%) - Architectural impact awareness
    idealTimeHours: 0.208, // SECONDARY (20.8%) - Complexity estimation
    testCoverage: 0.16, // SECONDARY (16%) - Architecture testability
    codeQuality: 0.208, // SECONDARY (20.8%) - Design quality expert
    codeComplexity: 0.417, // PRIMARY (41.7%) - Complexity expert
    actualTimeHours: 0.182, // SECONDARY (18.2%) - Implementation effort insight
    technicalDebtHours: 0.435, // PRIMARY (43.5%) - Technical debt expert
  };

  protected readonly systemInstructions = `You are a Senior Architect participating in a code review discussion.

Your role is to evaluate commits across ALL 7 pillars, with special focus on complexity and technical debt.

## Your Expertise
- **Technical Debt Hours** (PRIMARY): Expert in identifying and quantifying technical debt
- **Code Complexity** (PRIMARY): Expert in evaluating code and architectural complexity
- **Code Quality** (SECONDARY): Assess design quality and adherence to patterns
- **Ideal Time Hours** (SECONDARY): Estimate effort based on complexity
- **Actual Time Hours** (SECONDARY): Understand implementation effort from complexity angle
- **Test Coverage** (SECONDARY): Evaluate architecture testability
- **Functional Impact** (SECONDARY): Understand architectural impact on features

## Your Approach
- Assess whether architectural design is sound
- Identify technical debt introduced or eliminated
- Ensure implementation follows SOLID principles
- Evaluate adherence to established design patterns
- Consider long-term maintainability implications
- Provide rigorous architectural analysis

Return your analysis as JSON with all 7 metrics, even if some are outside your primary expertise.`;

  // ============================================================================
  // PROMPT BUILDING
  // ============================================================================

  protected async buildInitialPrompt(context: PromptContext): Promise<string> {
    const isFirstRound = (context.currentRound || 0) === 0;
    const filesChanged = context.filesChanged?.join(', ') || 'unknown files';

    // Use RAG if available
    let contentSection = '';
    if (context.vectorStore || context.documentationStore) {
      const { CombinedRAGHelper } = await import('../../utils/combined-rag-helper.js');
      const { getInitialQueriesForRole } = await import('../../utils/gap-to-rag-query-mapper.js');

      const rag = new CombinedRAGHelper(context.vectorStore, context.documentationStore);
      rag.setAgentName(this.metadata.role);

      let queries: any[];

      if (isFirstRound) {
        // Round 1: Use role-specific initial queries
        queries = getInitialQueriesForRole(this.metadata.name);
      } else {
        // Round 2+: Use concerns from previous round as RAG queries
        if (context.teamConcerns && context.teamConcerns.length > 0) {
          const limitedConcerns = context.teamConcerns.slice(0, 5);
          queries = limitedConcerns.map((c: any) => ({
            q: c.concern,
            topK: 2,
            store: 'diff' as const,
            purpose: `Investigating concern from ${c.agentName}`
          }));
        } else {
          queries = getInitialQueriesForRole(this.metadata.name);
        }
      }

      const results = await rag.queryMultiple(queries);
      const ragContext = results.map((r) => r.results).join('\n\n');

      contentSection = `${rag.getSummary()}

**Relevant Code for ${this.metadata.role} Analysis:**
${ragContext}
`;
    } else {
      contentSection = `**Commit Diff:**
\`\`\`
${context.commitDiff}
\`\`\`
`;
    }

    // Developer overview section (only in Round 1)
    const developerSection = isFirstRound && context.developerOverview
      ? `${context.developerOverview}\n\n---\n\n`
      : '';

    // Build previous round context section (Round 2+)
    let previousRoundContext = '';
    if (!isFirstRound && context.teamConcerns && context.teamConcerns.length > 0) {
      const myPreviousResult = context.agentResults?.find(
        (r: any) => r.agentRole === this.metadata.name || r.agentName === this.metadata.role
      );

      let myPreviousAnalysis = '';
      if (myPreviousResult) {
        myPreviousAnalysis = `
**Your Previous Round Analysis:**
- Summary: ${myPreviousResult.summary}
- Key metrics: technicalDebtHours=${myPreviousResult.metrics?.technicalDebtHours}, codeComplexity=${myPreviousResult.metrics?.codeComplexity}, codeQuality=${myPreviousResult.metrics?.codeQuality}

`;
      }

      const prevMetrics = myPreviousResult
        ? `technicalDebtHours=${myPreviousResult.metrics?.technicalDebtHours}, codeComplexity=${myPreviousResult.metrics?.codeComplexity}, codeQuality=${myPreviousResult.metrics?.codeQuality}`
        : 'no previous scores available';

      previousRoundContext = `
---

## Team Discussion from Previous Round

${myPreviousAnalysis}**Concerns raised by the team:**
${context.teamConcerns.map((c: any, i: number) => `${i + 1}. [${c.agentName}] ${c.concern}`).join('\n')}

**Your task in this round:**
- REFINE (don't repeat) your previous analysis based on team concerns
- Address concerns relevant to your expertise (technicalDebtHours, codeComplexity)
- **IMPORTANT**: Adjust your metric scores UP or DOWN based on what the team discussion revealed
  - If concerns were raised that make you less confident → lower your scores
  - If other agents provided insights that increase confidence → raise your scores
  - START from your previous scores (${prevMetrics}) and adjust them
- Your summary should focus on WHAT CHANGED since last round and WHY you adjusted scores

---
`;
    }

    return `${developerSection}## ${this.metadata.role} - Round ${(context.currentRound || 0) + 1}: ${isFirstRound ? 'Initial Analysis' : 'Team Discussion'}

**Files Changed:** ${filesChanged}

${contentSection}
${previousRoundContext}

**Your Task:**
Evaluate this commit from an ${this.metadata.roleDescription} and score ALL 7 metrics:

1. **technicalDebtHours** - YOUR PRIMARY EXPERTISE
2. **codeComplexity** - YOUR PRIMARY EXPERTISE
3. **codeQuality** - YOUR SECONDARY EXPERTISE
4. **idealTimeHours** - YOUR SECONDARY EXPERTISE
5. **actualTimeHours** - YOUR SECONDARY EXPERTISE
6. **testCoverage** - YOUR SECONDARY EXPERTISE
7. **functionalImpact** - YOUR SECONDARY EXPERTISE

Focus on your expertise (technicalDebtHours, codeComplexity) but provide scores for all pillars.

**Response Format:**
Return ONLY valid JSON with this structure:
\`\`\`json
{
  "summary": "High-level architectural assessment",
  "details": "Detailed analysis of complexity, debt, and design",
  "metrics": {
    "functionalImpact": <score 0-10>,
    "idealTimeHours": <hours estimate>,
    "testCoverage": <score 0-10>,
    "codeQuality": <score 0-10>,
    "codeComplexity": <score 0-10>,
    "actualTimeHours": <hours estimate>,
    "technicalDebtHours": <hours estimate>
  },
  "concerns": ["List architectural concerns"],
  "confidenceLevel": <0-100, your confidence in this analysis>${context.isFinalRound ? `,
  "finalSynthesis": {
    "summary": "Consolidated summary across all ${(context.currentRound || 0) + 1} rounds from your perspective",
    "details": "Full analysis incorporating insights from all rounds and team discussions - this is your complete evaluation",
    "metrics": { <same as above - your final scores> },
    "unresolvedConcerns": ["Only concerns that remain unclear/unresolved for you specifically"],
    "evolutionNotes": "How your analysis evolved across rounds"
  }` : ''}
}
\`\`\`

CRITICAL: Return ONLY valid JSON, no markdown fences, no extra text.`;
  }
}
