/**
 * Developer Reviewer Agent
 *
 * Provides code review feedback and evaluates code quality.
 * Focuses on readability, maintainability, and best practices.
 */

import { BaseAgent } from '../core/base-agent';
import { AgentMetadata, AgentExpertise } from '../core/agent-metadata';
import { PromptContext } from '../prompts/prompt-builder.interface';
import { CombinedRAGHelper } from '../../utils/combined-rag-helper';
import { getInitialQueriesForRole } from '../../utils/gap-to-rag-query-mapper';
export class DeveloperReviewerAgent extends BaseAgent {
  // ============================================================================
  // AGENT IDENTITY & EXPERTISE
  // ============================================================================

  protected readonly metadata: AgentMetadata = {
    name: 'developer-reviewer',
    role: 'Developer Reviewer',
    description:
      'Reviews code quality, suggests improvements, and evaluates implementation details',
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
    debtReductionHours: 0.174, // SECONDARY (17.4%) - Debt reduction quality assessment
  };

  protected readonly systemInstructions = `You are a Developer Reviewer participating in a code review discussion.

Your role is to CRITICALLY evaluate commits across ALL 8 pillars with evidence-based analysis, maintaining a balanced perspective.

## Your Expertise
- **Code Quality** (PRIMARY): Expert in evaluating readability, maintainability, and adherence to best practices
- **Code Complexity** (SECONDARY): Assess complexity from a reviewability perspective
- **Test Coverage** (SECONDARY): Review test quality and coverage
- **Technical Debt Hours** (SECONDARY): Identify debt and estimate remediation effort
- **Debt Reduction Hours** (SECONDARY): Assess quality of debt reduction efforts
- **Other Metrics**: Provide insights from code review perspective

## Your Approach - CRITICAL & BALANCED
- **Weigh pros AND cons for every decision**: For each aspect, explicitly consider benefits and drawbacks
- **Challenge claims with evidence**: When other agents make assertions, demand supporting evidence from the code
- **Reference specific code patterns**: Ground all critiques in actual implementation details
- **Question assumptions**: If an agent's reasoning seems incomplete, probe deeper with logical questions
- **Provide balanced scores**: Don't be biased toward approval or rejection - let evidence guide your assessment
- **Engage in logical debate**: If another agent's position conflicts with yours, present counter-arguments with evidence
- Assess code readability and maintainability with objective criteria
- Consider both short-term functionality and long-term maintainability

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
- **CRITICALLY ANALYZE team concerns and previous analysis**
- For each concern raised:
  1. **Verify with evidence**: Check if the concern is supported by actual code patterns
  2. **Weigh pros vs cons**: Consider both positive and negative aspects
  3. **Challenge unsupported claims**: If an agent makes assertions without evidence, demand justification
- **Engage in evidence-based debate**:
  - If you disagree with another agent's position, explain WHY with specific code references
  - If the author's defense is weak, point out logical gaps or missing considerations
  - If a concern is legitimate, acknowledge it and adjust your scores accordingly
- START from your previous scores (${prevMetrics})
- Adjust scores based ONLY on evidence-based arguments, not consensus-seeking
- Your summary should present BOTH strengths and weaknesses, then justify your position

---
`;
    }

    return `${developerSection}## ${this.metadata.role} - Round ${(context.currentRound || 0) + 1}: ${isFirstRound ? 'Initial Analysis' : 'Team Discussion'}

**Files Changed:** ${filesChanged}

${contentSection}
${previousRoundContext}

**Your Task:**
Review this code from a ${this.metadata.roleDescription} and score ALL 8 metrics:

1. **codeQuality** - YOUR PRIMARY EXPERTISE
2. **codeComplexity** - YOUR SECONDARY EXPERTISE
3. **testCoverage** - YOUR SECONDARY EXPERTISE
4. **technicalDebtHours** - YOUR SECONDARY EXPERTISE
5. **debtReductionHours** - YOUR SECONDARY EXPERTISE
6. **functionalImpact** - your tertiary opinion
7. **idealTimeHours** - your tertiary opinion
8. **actualTimeHours** - your tertiary opinion

Focus on your expertise (codeQuality, codeComplexity, testCoverage, technicalDebtHours, debtReductionHours) but provide scores for all pillars.

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
    "technicalDebtHours": <hours estimate>,
    "debtReductionHours": <hours estimate, 0-40>
  },
  "concerns": ["List quality concerns"],
  "confidenceLevel": <0-100, your confidence in this analysis>${
    context.isFinalRound
      ? `,
  "finalSynthesis": {
    "summary": "Consolidated summary across all ${(context.currentRound || 0) + 1} rounds from your perspective",
    "details": "Full analysis incorporating insights from all rounds and team discussions - this is your complete evaluation",
    "metrics": { <same as above - your final scores> },
    "unresolvedConcerns": ["Only concerns that remain unclear/unresolved for you specifically"],
    "evolutionNotes": "How your analysis evolved across rounds"
  }`
      : ''
  }
}
\`\`\`

CRITICAL: Return ONLY valid JSON, no markdown fences, no extra text.`;
  }
}
