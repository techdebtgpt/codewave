/**
 * SDET Agent (Software Development Engineer in Test)
 *
 * Evaluates test automation quality, testing frameworks, and automated test infrastructure.
 * Focuses on test maintainability and automation framework quality.
 */

import { BaseAgent } from '../core/base-agent';
import { AgentMetadata, AgentExpertise } from '../core/agent-metadata';
import { PromptContext } from '../prompts/prompt-builder.interface';

export class SDETAgent extends BaseAgent {
  // ============================================================================
  // AGENT IDENTITY & EXPERTISE
  // ============================================================================

  protected readonly metadata: AgentMetadata = {
    name: 'sdet',
    role: 'SDET (Test Automation Engineer)',
    description: 'Evaluates test automation quality, testing frameworks, and automated test infrastructure',
    roleDescription: 'test automation quality and testing frameworks perspective',
  };

  protected readonly expertise: AgentExpertise = {
    functionalImpact: 0.13, // TERTIARY (13%) - Limited business impact focus
    idealTimeHours: 0.083, // TERTIARY (8.3%) - Limited estimation focus
    testCoverage: 0.4, // PRIMARY (40%) - Test automation expert
    codeQuality: 0.167, // SECONDARY (16.7%) - Test code quality focus
    codeComplexity: 0.125, // TERTIARY (12.5%) - Test complexity assessment
    actualTimeHours: 0.091, // TERTIARY (9.1%) - Limited time tracking
    technicalDebtHours: 0.13, // TERTIARY (13%) - Test automation debt
  };

  protected readonly systemInstructions = `You are an SDET (Software Development Engineer in Test) participating in a code review discussion.

Your role is to evaluate commits across ALL 7 pillars, with special focus on test automation quality and testing infrastructure.

## Your Expertise
- **Test Coverage** (PRIMARY): Expert in evaluating test automation quality and testing infrastructure
- **Code Quality** (SECONDARY): Assess test code quality and maintainability
- **Other Metrics**: Provide insights from testing perspective

## Your Approach
- Assess maturity of the testing framework
- Evaluate quality and maintainability of test code
- Identify test automation debt
- Focus on automation framework quality, not just testing numbers
- Consider test infrastructure and tooling

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
- Key metrics: testCoverage=${myPreviousResult.metrics?.testCoverage}, codeQuality=${myPreviousResult.metrics?.codeQuality}

`;
      }

      const prevMetrics = myPreviousResult
        ? `testCoverage=${myPreviousResult.metrics?.testCoverage}, codeQuality=${myPreviousResult.metrics?.codeQuality}`
        : 'no previous scores available';

      previousRoundContext = `
---

## Team Discussion from Previous Round

${myPreviousAnalysis}**Concerns raised by the team:**
${context.teamConcerns.map((c: any, i: number) => `${i + 1}. [${c.agentName}] ${c.concern}`).join('\n')}

**Your task in this round:**
- REFINE (don't repeat) your previous analysis based on team concerns
- Address concerns relevant to your expertise (testCoverage, test code quality)
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
Evaluate this commit from a ${this.metadata.roleDescription} and score ALL 7 metrics:

1. **testCoverage** - YOUR PRIMARY EXPERTISE
2. **codeQuality** - YOUR SECONDARY EXPERTISE (test code quality)
3. **functionalImpact** - your tertiary opinion
4. **idealTimeHours** - your tertiary opinion
5. **codeComplexity** - your tertiary opinion
6. **actualTimeHours** - your tertiary opinion
7. **technicalDebtHours** - your tertiary opinion

Focus on your expertise (testCoverage, test code quality) but provide scores for all pillars.

**Response Format:**
Return ONLY valid JSON with this structure:
\`\`\`json
{
  "summary": "High-level test automation assessment",
  "details": "Detailed analysis of test quality and infrastructure",
  "metrics": {
    "functionalImpact": <score 0-10>,
    "idealTimeHours": <hours estimate>,
    "testCoverage": <score 0-10>,
    "codeQuality": <score 0-10>,
    "codeComplexity": <score 0-10>,
    "actualTimeHours": <hours estimate>,
    "technicalDebtHours": <hours estimate>
  },
  "concerns": ["List testing concerns"],
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
