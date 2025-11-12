/**
 * Developer Reviewer Agent
 *
 * Provides code review feedback and evaluates code quality.
 * Focuses on readability, maintainability, and best practices.
 */

import { BaseAgent } from '../core/base-agent';
import { AgentMetadata, AgentExpertise } from '../core/agent-metadata';
import { PromptContext } from '../prompts/prompt-builder.interface';

export class DeveloperReviewerAgent extends BaseAgent {
  // ============================================================================
  // AGENT IDENTITY & EXPERTISE
  // ============================================================================

  protected readonly metadata: AgentMetadata = {
    name: 'developer-reviewer',
    role: 'Developer Reviewer',
    description: 'Reviews code quality, suggests improvements, and evaluates implementation details',
    roleDescription: 'code quality, readability, and best practices perspective',
  };

  protected readonly expertise: AgentExpertise = {
    functionalImpact: 0.13, // TERTIARY (13%) - Limited business impact focus
    idealTimeHours: 0.125, // TERTIARY (12.5%) - Limited estimation focus
    testCoverage: 0.2, // SECONDARY (20%) - Test review perspective
    codeQuality: 0.417, // PRIMARY (41.7%) - Code quality expert
    codeComplexity: 0.208, // SECONDARY (20.8%) - Complexity from review perspective
    actualTimeHours: 0.136, // TERTIARY (13.6%) - Limited time tracking
    technicalDebtHours: 0.174, // SECONDARY (17.4%) - Debt identification
  };

  protected readonly systemInstructions = `You are a Developer Reviewer participating in a code review discussion.

Your role is to evaluate commits across ALL 7 pillars, with special focus on code quality.

## Your Expertise
- **Code Quality** (PRIMARY): Expert in evaluating readability, maintainability, and adherence to best practices
- **Code Complexity** (SECONDARY): Assess complexity from a reviewability perspective
- **Test Coverage** (SECONDARY): Review test quality and coverage
- **Technical Debt Hours** (SECONDARY): Identify debt and estimate remediation effort
- **Other Metrics**: Provide insights from code review perspective

## Your Approach
- Assess code readability and maintainability
- Identify adherence to best practices and coding standards
- Provide constructive, actionable feedback
- Consider long-term maintainability implications

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
- Key metrics: codeQuality=${myPreviousResult.metrics?.codeQuality}, codeComplexity=${myPreviousResult.metrics?.codeComplexity}, testCoverage=${myPreviousResult.metrics?.testCoverage}

`;
      }

      const prevMetrics = myPreviousResult
        ? `codeQuality=${myPreviousResult.metrics?.codeQuality}, codeComplexity=${myPreviousResult.metrics?.codeComplexity}, testCoverage=${myPreviousResult.metrics?.testCoverage}`
        : 'no previous scores available';

      previousRoundContext = `
---

## Team Discussion from Previous Round

${myPreviousAnalysis}**Concerns raised by the team:**
${context.teamConcerns.map((c: any, i: number) => `${i + 1}. [${c.agentName}] ${c.concern}`).join('\n')}

**Your task in this round:**
- REFINE (don't repeat) your previous analysis based on team concerns
- Address concerns relevant to your expertise (codeQuality, codeComplexity, testCoverage, technicalDebtHours)
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
Review this code from a ${this.metadata.roleDescription} and score ALL 7 metrics:

1. **codeQuality** - YOUR PRIMARY EXPERTISE
2. **codeComplexity** - YOUR SECONDARY EXPERTISE
3. **testCoverage** - YOUR SECONDARY EXPERTISE
4. **technicalDebtHours** - YOUR SECONDARY EXPERTISE
5. **functionalImpact** - your tertiary opinion
6. **idealTimeHours** - your tertiary opinion
7. **actualTimeHours** - your tertiary opinion

Focus on your expertise (codeQuality, codeComplexity, testCoverage, technicalDebtHours) but provide scores for all pillars.

**Response Format:**
Return ONLY valid JSON with this structure:
\`\`\`json
{
  "summary": "High-level code review summary",
  "details": "Detailed feedback on code quality and improvements",
  "metrics": {
    "functionalImpact": <score 0-10>,
    "idealTimeHours": <hours estimate>,
    "testCoverage": <score 0-10>,
    "codeQuality": <score 0-10>,
    "codeComplexity": <score 0-10>,
    "actualTimeHours": <hours estimate>,
    "technicalDebtHours": <hours estimate>
  },
  "concerns": ["List quality concerns"],
  "shouldParticipateInNextRound": <true if you need another round to refine, false if confident in current analysis>,
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
