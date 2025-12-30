/**
 * Developer Author Agent
 *
 * Explains implementation decisions, trade-offs, and actual time spent.
 * Provides insight from the developer who wrote the code.
 */

import { BaseAgent } from '../core/base-agent';
import { AgentMetadata, AgentExpertise } from '../core/agent-metadata';
import { PromptContext } from '../prompts/prompt-builder.interface';
import { CombinedRAGHelper } from '../../utils/combined-rag-helper';
import { getInitialQueriesForRole } from '../../utils/gap-to-rag-query-mapper';
export class DeveloperAuthorAgent extends BaseAgent {
  // ============================================================================
  // AGENT IDENTITY & EXPERTISE
  // ============================================================================

  protected readonly metadata: AgentMetadata = {
    name: 'developer-author',
    role: 'Developer (Author)',
    description: 'Explains implementation decisions, trade-offs, and estimates actual time spent',
    roleDescription: 'implementation decisions, time spent, and developer perspective',
  };

  protected readonly expertise: AgentExpertise = {
    functionalImpact: 0.13, // TERTIARY (13%) - Limited business impact focus
    idealTimeHours: 0.167, // SECONDARY (16.7%) - Good estimation perspective
    testCoverage: 0.12, // TERTIARY (12%) - Limited testing expertise
    codeQuality: 0.125, // TERTIARY (12.5%) - Basic quality awareness
    codeComplexity: 0.167, // SECONDARY (16.7%) - Implementation complexity insight
    actualTimeHours: 0.455, // PRIMARY (45.5%) - Implementation time expert
    technicalDebtHours: 0.13, // TERTIARY (13%) - Limited debt assessment
    debtReductionHours: 0.13, // TERTIARY (13%) - Limited debt reduction perspective
  };

  protected readonly systemInstructions = `You are the Developer Author who implemented this code.

Your role is to DEFEND your implementation decisions, trade-offs, and time estimates across ALL 8 pillars.

## Your Expertise
- **Actual Time Hours** (PRIMARY): Expert in estimating actual implementation time and effort
- **Code Complexity** (SECONDARY): Deep understanding of implementation complexity
- **Ideal Time Hours** (SECONDARY): Good perspective on how long work should take
- **Other Metrics**: Provide insights based on implementation experience

## Your Approach - DEFENSIVE STANCE
- **Protect your implementation choices with logical arguments and evidence**
- When team members raise concerns, respond with:
  1. **Evidence from the code**: Point to specific implementation details that justify your approach
  2. **Trade-off analysis**: Explain why alternative approaches were rejected
  3. **Context**: Provide constraints, requirements, or factors others may not be aware of
- **Challenge critiques that lack evidence or miss implementation context**
- Focus on WHY your chosen approach was the best option given the constraints
- Only concede a point when genuinely convinced by evidence, not to avoid conflict
- Break down how long different parts took and defend time estimates
- Provide strong justification for complexity assessments

Return your analysis as JSON with all 8 metrics, even if some are outside your primary expertise.`;

  // ============================================================================
  // PROMPT BUILDING
  // ============================================================================

  protected async buildInitialPrompt(context: PromptContext): Promise<string> {
    const isFirstRound = (context.currentRound || 0) === 0;
    const filesChanged = context.filesChanged?.join(', ') || 'unknown files';

    // Use RAG if available
    let contentSection = '';
    if (context.vectorStore || context.documentationStore) {
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
            purpose: `Investigating concern from ${c.agentName}`,
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
    const developerSection =
      isFirstRound && context.developerOverview ? `${context.developerOverview}\n\n---\n\n` : '';

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
- Key metrics: actualTimeHours=${myPreviousResult.metrics?.actualTimeHours}, codeComplexity=${myPreviousResult.metrics?.codeComplexity}, idealTimeHours=${myPreviousResult.metrics?.idealTimeHours}

`;
      }

      const prevMetrics = myPreviousResult
        ? `actualTimeHours=${myPreviousResult.metrics?.actualTimeHours}, codeComplexity=${myPreviousResult.metrics?.codeComplexity}, idealTimeHours=${myPreviousResult.metrics?.idealTimeHours}`
        : 'no previous scores available';

      previousRoundContext = `
---

## Team Discussion from Previous Round

${myPreviousAnalysis}**Concerns raised by the team:**
${context.teamConcerns.map((c: any, i: number) => `${i + 1}. [${c.agentName}] ${c.concern}`).join('\n')}

**Your task in this round:**
- **DEFEND your previous analysis against team concerns**
- For concerns raised about your expertise areas (actualTimeHours, codeComplexity, idealTimeHours):
  1. **Respond with evidence**: Reference specific code patterns, implementation details, or constraints
  2. **Justify your scores**: Explain WHY your original assessment was correct
  3. **Challenge weak arguments**: If a concern lacks evidence or context, point it out
  4. **Concede only when justified**: Adjust scores ONLY if new evidence genuinely changes your assessment
- START from your previous scores (${prevMetrics})
- **Adjust UP** if team discussion reveals factors that strengthen your position
- **Adjust DOWN** only if genuinely convinced by evidence-based arguments
- Your summary should DEFEND your position while addressing legitimate concerns

---
`;
    }

    return `${developerSection}## ${this.metadata.role} - Round ${(context.currentRound || 0) + 1}: ${isFirstRound ? 'Initial Analysis' : 'Team Discussion'}

**Files Changed:** ${filesChanged}

${contentSection}
${previousRoundContext}

**Your Task:**
As the developer who wrote this code, analyze it from ${this.metadata.roleDescription} and score ALL 8 metrics:

1. **actualTimeHours** - YOUR PRIMARY EXPERTISE
2. **codeComplexity** - YOUR SECONDARY EXPERTISE
3. **idealTimeHours** - YOUR SECONDARY EXPERTISE
4. **functionalImpact** - your tertiary opinion
5. **testCoverage** - your tertiary opinion
6. **codeQuality** - your tertiary opinion
7. **technicalDebtHours** - your tertiary opinion
8. **debtReductionHours** - your tertiary opinion

Focus on your expertise (actualTimeHours, codeComplexity, idealTimeHours) but provide scores for all pillars.

**Response Format:**
${
  context.isFinalRound
    ? `This is the FINAL round. Include a comprehensive finalSynthesis.
Return ONLY valid JSON with this structure:
\`\`\`json
{
  "summary": "FINAL summary focusing on what changed in this last round",
  "details": "Final adjustments based on team discussion",
  "metrics": {
    "functionalImpact": <score 0-10>,
    "idealTimeHours": <hours estimate>,
    "testCoverage": <score 0-10>,
    "codeQuality": <score 0-10>,
    "codeComplexity": <score 0-10>,
    "actualTimeHours": <hours estimate>,
    "technicalDebtHours": <hours estimate>,
    "debtReductionHours": <hours estimate, 0-40>
  },
  "concerns": ["List any concerns"],
  "confidenceLevel": <0-100, your confidence in this analysis>,
  "finalSynthesis": {
    "summary": "Consolidated summary across all ${(context.currentRound || 0) + 1} rounds from your perspective",
    "details": "Full analysis incorporating insights from all rounds and team discussions - this is your complete evaluation",
    "metrics": { <same as above - your final scores> },
    "unresolvedConcerns": ["Only concerns that remain unclear/unresolved for you specifically"],
    "evolutionNotes": "How your analysis evolved across rounds"
  }
}
\`\`\``
    : `Return ONLY valid JSON with this structure:
\`\`\`json
{
  "summary": "${isFirstRound ? 'High-level summary of implementation decisions' : 'UPDATED summary focusing on what changed based on team discussion'}",
  "details": "${isFirstRound ? 'Detailed explanation of challenges and time breakdown' : 'Explain how team concerns influenced your refined scores'}",
  "metrics": {
    "functionalImpact": <score 0-10>,
    "idealTimeHours": <hours estimate>,
    "testCoverage": <score 0-10>,
    "codeQuality": <score 0-10>,
    "codeComplexity": <score 0-10>,
    "actualTimeHours": <hours estimate>,
    "technicalDebtHours": <hours estimate>,
    "debtReductionHours": <hours estimate, 0-40>
  },
  "concerns": ["List any concerns"],
  "confidenceLevel": <0-100, your confidence in this analysis>
}
\`\`\``
}

CRITICAL: Return ONLY valid JSON, no markdown fences, no extra text.`;
  }
}
