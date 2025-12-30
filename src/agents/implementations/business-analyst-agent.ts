/**
 * Business Analyst Agent
 *
 * Evaluates business value, functional impact, and ideal time estimation.
 * Focuses on how changes affect end users and business operations.
 */

import { BaseAgent } from '../core/base-agent';
import { AgentMetadata, AgentExpertise } from '../core/agent-metadata';
import { PromptContext } from '../prompts/prompt-builder.interface';
import { CombinedRAGHelper } from '../../utils/combined-rag-helper';
import { getInitialQueriesForRole } from '../../utils/gap-to-rag-query-mapper';

export class BusinessAnalystAgent extends BaseAgent {
  // ============================================================================
  // AGENT IDENTITY & EXPERTISE
  // ============================================================================

  protected readonly metadata: AgentMetadata = {
    name: 'business-analyst',
    role: 'Business Analyst',
    description:
      'Evaluates business value, functional impact, and estimates ideal implementation time',
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
    debtReductionHours: 0.13, // TERTIARY (13%) - Limited debt reduction insight
  };

  protected readonly systemInstructions = `You are a Business Analyst participating in a code review discussion.

Your role is to CRITICALLY evaluate commits across ALL 8 pillars with evidence-based business analysis, maintaining a balanced perspective.

## Your Expertise
- **Functional Impact** (PRIMARY): Assess how significantly changes affect end users and business operations
- **Ideal Time Hours** (PRIMARY): Estimate how long the work should optimally take from a requirements perspective
- **Other Metrics**: Provide reasonable estimates based on your business perspective

## Your Approach - CRITICAL & BALANCED
- **Weigh pros AND cons from business perspective**: Consider both value delivered and opportunity cost
- **Challenge technical claims with business impact**: If engineers claim high complexity, question if it delivers proportional value
- **Ground assessments in user/business evidence**: Reference user stories, business requirements, or operational impact
- **Question time estimates**: If actualTimeHours significantly exceeds idealTimeHours, probe why
- **Engage in evidence-based debate**: Present business counter-arguments when technical decisions seem misaligned with value
- **Balance technical constraints with business needs**: Acknowledge technical realities while advocating for users
- Provide balanced scores based on objective business criteria, not bias toward efficiency or innovation

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
          // Limit to top 5 most relevant concerns to avoid overwhelming RAG
          const limitedConcerns = context.teamConcerns.slice(0, 5);
          // Convert concerns to RAG query objects
          queries = limitedConcerns.map((c: any) => ({
            q: c.concern,
            topK: 2, // Reduce topK to 2 to avoid too many results
            store: 'diff' as const,
            purpose: `Investigating concern from ${c.agentName}`,
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
    const developerSection =
      isFirstRound && context.developerOverview ? `${context.developerOverview}\n\n---\n\n` : '';

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
- **CRITICALLY ANALYZE team concerns from a business value perspective**
- For concerns related to your expertise (functionalImpact, idealTimeHours):
  1. **Verify with business evidence**: Check if functional impact claims align with user/business requirements
  2. **Weigh value vs cost**: Consider both benefits delivered and resources consumed
  3. **Challenge misalignments**: If technical complexity seems disproportionate to business value, question it
- **Engage in evidence-based debate**:
  - If the author claims high functional impact, verify against actual user-facing changes
  - If engineers claim unavoidable complexity, question if simpler alternatives were considered
  - If time estimates seem off (actual >> ideal), probe for root causes
- START from your previous scores (${prevMetrics})
- Adjust scores based on business evidence and logical reasoning, not deference to technical authority
- Your summary should present balanced business perspective (value + cost) then justify your position

---
`;
    }

    return `${developerSection}## ${this.metadata.role} - Round ${(context.currentRound || 0) + 1}: ${isFirstRound ? 'Initial Analysis' : 'Team Discussion'}

**Files Changed:** ${filesChanged}

${contentSection}
${previousRoundContext}

**Your Task:**
Analyze the commit from a ${this.metadata.roleDescription} and score ALL 8 metrics:

1. **functionalImpact** - YOUR PRIMARY EXPERTISE
2. **idealTimeHours** - YOUR PRIMARY EXPERTISE
3. **testCoverage** - your tertiary opinion
4. **codeQuality** - your tertiary opinion
5. **codeComplexity** - your tertiary opinion
6. **actualTimeHours** - your tertiary opinion
7. **technicalDebtHours** - your tertiary opinion
8. **debtReductionHours** - your tertiary opinion

Focus on your expertise (functionalImpact, idealTimeHours) but provide scores for all pillars.
For metrics outside your expertise, provide reasonable estimates based on the code changes.

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
\`\`\``
    : `Return ONLY valid JSON with this structure:
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
    "technicalDebtHours": <hours estimate>,
    "debtReductionHours": <hours estimate, 0-40>
  },
  "concerns": ["List any concerns you have"],
  "confidenceLevel": <0-100, your confidence in this analysis>
}
\`\`\``
}

CRITICAL: Return ONLY valid JSON, no markdown fences, no extra text.`;
  }
}
