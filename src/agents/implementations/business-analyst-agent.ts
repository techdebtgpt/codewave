/**
 * Business Analyst Agent
 *
 * Evaluates business value, functional impact, and ideal time estimation.
 * Focuses on how changes affect end users and business operations.
 */

import { BaseAgent } from '../core/base-agent';
import { AgentMetadata, AgentExpertise } from '../core/agent-metadata';
import { PromptContext } from '../prompts/prompt-builder.interface';

export class BusinessAnalystAgent extends BaseAgent {
  // ============================================================================
  // AGENT IDENTITY & EXPERTISE
  // ============================================================================

  protected readonly metadata: AgentMetadata = {
    name: 'business-analyst',
    role: 'Business Analyst',
    description: 'Evaluates business value, functional impact, and estimates ideal implementation time',
    roleDescription: 'business perspective',
  };

  protected readonly expertise: AgentExpertise = {
    functionalImpact: 0.435, // PRIMARY (43.5%) - Business impact expert
    idealTimeHours: 0.417, // PRIMARY (41.7%) - Requirements estimation expert
    testCoverage: 0.12, // TERTIARY (12%) - Limited testing perspective
    codeQuality: 0.083, // TERTIARY (8.3%) - Limited code perspective
    codeComplexity: 0.083, // TERTIARY (8.3%) - Limited complexity insight
    actualTimeHours: 0.136, // TERTIARY (13.6%) - Observes implementation time
    technicalDebtHours: 0.13, // TERTIARY (13%) - Limited debt assessment
  };

  protected readonly systemInstructions = `You are a Business Analyst participating in a code review discussion.

Your role is to evaluate commits across ALL 7 pillars, with special focus on functional impact and ideal implementation time.

## Your Expertise
- **Functional Impact** (PRIMARY): Assess how significantly changes affect end users and business operations
- **Ideal Time Hours** (PRIMARY): Estimate how long the work should optimally take from a requirements perspective
- **Other Metrics**: Provide reasonable estimates based on your business perspective

## Your Approach
- Bring the business perspective to technical decisions
- Ensure alignment with business requirements and user needs
- Focus on business value and user impact
- Provide clear justification for how changes affect business operations

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
          // Limit to top 5 most relevant concerns to avoid overwhelming RAG
          const limitedConcerns = context.teamConcerns.slice(0, 5);
          // Convert concerns to RAG query objects
          queries = limitedConcerns.map((c: any) => ({
            q: c.concern,
            topK: 2,  // Reduce topK to 2 to avoid too many results
            store: 'diff' as const,
            purpose: `Investigating concern from ${c.agentName}`
          }));
        } else {
          // Fallback to role-specific queries if no concerns
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
      // Fallback to full diff when RAG is not available
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
      // Find this agent's previous round analysis
      const myPreviousResult = context.agentResults?.find(
        (r: any) => r.agentRole === this.metadata.name || r.agentName === this.metadata.role
      );

      let myPreviousAnalysis = '';
      if (myPreviousResult) {
        myPreviousAnalysis = `
**Your Previous Round Analysis:**
- Summary: ${myPreviousResult.summary}
- Key metrics: functionalImpact=${myPreviousResult.metrics?.functionalImpact}, idealTimeHours=${myPreviousResult.metrics?.idealTimeHours}, technicalDebtHours=${myPreviousResult.metrics?.technicalDebtHours}

`;
      }

      const prevMetrics = myPreviousResult
        ? `functionalImpact=${myPreviousResult.metrics?.functionalImpact}, idealTimeHours=${myPreviousResult.metrics?.idealTimeHours}`
        : 'no previous scores available';

      previousRoundContext = `
---

## Team Discussion from Previous Round

${myPreviousAnalysis}**Concerns raised by the team:**
${context.teamConcerns.map((c: any, i: number) => `${i + 1}. [${c.agentName}] ${c.concern}`).join('\n')}

**Your task in this round:**
- REFINE (don't repeat) your previous analysis based on team concerns
- Address concerns relevant to your expertise (functionalImpact, idealTimeHours)
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
Analyze the commit from a ${this.metadata.roleDescription} and score ALL 7 metrics:

1. **functionalImpact** - YOUR PRIMARY EXPERTISE
2. **idealTimeHours** - YOUR PRIMARY EXPERTISE
3. **testCoverage** - your tertiary opinion
4. **codeQuality** - your tertiary opinion
5. **codeComplexity** - your tertiary opinion
6. **actualTimeHours** - your tertiary opinion
7. **technicalDebtHours** - your tertiary opinion

Focus on your expertise (functionalImpact, idealTimeHours) but provide scores for all pillars.
For metrics outside your expertise, provide reasonable estimates based on the code changes.

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
  "concerns": ["List any concerns you have"],
  "confidenceLevel": <0-100, your confidence in this analysis>,
  "finalSynthesis": {
    "summary": "Consolidated summary across all ${(context.currentRound || 0) + 1} rounds from your perspective",
    "details": "Full analysis incorporating insights from all rounds and team discussions - this is your complete evaluation",
    "metrics": { <same as above - your final scores> },
    "unresolvedConcerns": ["Only concerns that remain unclear/unresolved for you specifically"],
    "evolutionNotes": "How your analysis evolved across rounds (e.g., 'Round 1: scored functionalImpact as 8. Round 2: team raised concerns about X, adjusted to 7. Round 3: final score remains 7 after validation')"
  }
}
\`\`\`` : `Return ONLY valid JSON with this structure:
\`\`\`json
{
  "summary": "${isFirstRound ? 'High-level summary of your analysis' : 'UPDATED summary focusing on what changed based on team discussion'}",
  "details": "${isFirstRound ? 'Detailed explanation of your reasoning' : 'Explain how team concerns influenced your refined scores'}",
  "metrics": {
    "functionalImpact": <score 0-10>,
    "idealTimeHours": <hours estimate>,
    "testCoverage": <score 0-10>,
    "codeQuality": <score 0-10>,
    "codeComplexity": <score 0-10>,
    "actualTimeHours": <hours estimate>,
    "technicalDebtHours": <hours estimate>
  },
  "concerns": ["List any concerns you have"],
  "confidenceLevel": <0-100, your confidence in this analysis>
}
\`\`\``}

CRITICAL: Return ONLY valid JSON, no markdown fences, no extra text.`;
  }
}
