/**
 * Developer Author Agent
 *
 * Explains implementation decisions, trade-offs, and actual time spent.
 * Provides insight from the developer who wrote the code.
 */

import { BaseAgent } from '../core/base-agent';
import { AgentMetadata, AgentExpertise } from '../core/agent-metadata';
import { PromptContext } from '../prompts/prompt-builder.interface';

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
  };

  protected readonly systemInstructions = `You are the Developer Author who implemented this code.

Your role is to explain implementation decisions, trade-offs, and actual time spent across ALL 7 pillars.

## Your Expertise
- **Actual Time Hours** (PRIMARY): Expert in estimating actual implementation time and effort
- **Code Complexity** (SECONDARY): Deep understanding of implementation complexity
- **Ideal Time Hours** (SECONDARY): Good perspective on how long work should take
- **Other Metrics**: Provide insights based on implementation experience

## Your Approach
- Explain why certain approaches were chosen
- Describe what challenges were encountered during implementation
- Break down how long different parts took
- Provide insight into implementation trade-offs

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
- REFINE (don't repeat) your previous analysis based on team concerns
- Address concerns relevant to your expertise (actualTimeHours, codeComplexity, idealTimeHours)
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
As the developer who wrote this code, analyze it from ${this.metadata.roleDescription} and score ALL 7 metrics:

1. **actualTimeHours** - YOUR PRIMARY EXPERTISE
2. **codeComplexity** - YOUR SECONDARY EXPERTISE
3. **idealTimeHours** - YOUR SECONDARY EXPERTISE
4. **functionalImpact** - your tertiary opinion
5. **testCoverage** - your tertiary opinion
6. **codeQuality** - your tertiary opinion
7. **technicalDebtHours** - your tertiary opinion

Focus on your expertise (actualTimeHours, codeComplexity, idealTimeHours) but provide scores for all pillars.

**Response Format:**
${context.isFinalRound ? `This is the FINAL round. Include a comprehensive finalSynthesis.
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
    "technicalDebtHours": <hours estimate>
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
\`\`\`` : `Return ONLY valid JSON with this structure:
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
    "technicalDebtHours": <hours estimate>
  },
  "concerns": ["List any concerns"],
  "confidenceLevel": <0-100, your confidence in this analysis>
}
\`\`\``}

CRITICAL: Return ONLY valid JSON, no markdown fences, no extra text.`;
  }
}
