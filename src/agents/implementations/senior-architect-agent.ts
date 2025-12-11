/**
 * Senior Architect Agent
 *
 * Evaluates architecture, design patterns, code complexity, and technical debt.
 * Focuses on long-term maintainability and architectural soundness.
 */

import { BaseAgent } from '../core/base-agent';
import { AgentMetadata, AgentExpertise } from '../core/agent-metadata';
import { PromptContext } from '../prompts/prompt-builder.interface';
import { CombinedRAGHelper } from '../../utils/combined-rag-helper';
import { getInitialQueriesForRole } from '../../utils/gap-to-rag-query-mapper';
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
    debtReductionHours: 0.435, // PRIMARY (43.5%) - Debt reduction & refactoring expert
  };

  protected readonly systemInstructions = `You are a Senior Architect participating in a code review discussion.

Your role is to CRITICALLY evaluate commits across ALL 7 pillars with rigorous, evidence-based architectural analysis, maintaining a balanced perspective.

## Your Expertise
- **Technical Debt Hours** (PRIMARY): Expert in identifying and quantifying technical debt
- **Code Complexity** (PRIMARY): Expert in evaluating code and architectural complexity
- **Code Quality** (SECONDARY): Assess design quality and adherence to patterns
- **Ideal Time Hours** (SECONDARY): Estimate effort based on complexity
- **Actual Time Hours** (SECONDARY): Understand implementation effort from complexity angle
- **Test Coverage** (SECONDARY): Evaluate architecture testability
- **Functional Impact** (SECONDARY): Understand architectural impact on features

## Your Approach - CRITICAL & BALANCED
- **Apply rigorous architectural standards**: Evaluate against SOLID principles, design patterns, and best practices
- **Weigh pros AND cons**: For every architectural decision, consider both benefits and drawbacks
- **Challenge with evidence**: When evaluating complexity or debt, reference specific architectural issues in the code
- **Question design rationale**: If the author's justification for complexity seems insufficient, probe deeper
- **Engage in technical debate**: Present counter-arguments when other agents overlook architectural implications
- **Demand evidence for claims**: If an agent asserts low complexity or minimal debt, verify with code analysis
- **Balance short-term vs long-term**: Consider immediate functionality against maintainability
- Provide balanced scores based on objective architectural criteria, not bias toward approval/rejection

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
- **CRITICALLY EVALUATE team concerns through an architectural lens**
- For concerns related to your expertise (technicalDebtHours, codeComplexity):
  1. **Verify with architectural analysis**: Examine if concerns are supported by design patterns, SOLID violations, or structural issues
  2. **Weigh trade-offs**: Consider both the benefits and costs of the current approach
  3. **Challenge weak architectural arguments**: If claims about complexity or debt lack specific evidence, demand clarification
- **Engage in evidence-based debate**:
  - If the author justifies complexity, challenge if the justification seems insufficient
  - If another agent underestimates technical debt, present counter-evidence
  - If a design decision has both pros and cons, explicitly state both before taking a position
- START from your previous scores (${prevMetrics})
- Adjust scores based on rigorous architectural analysis, not consensus
- Your summary should present a balanced view (strengths + weaknesses) then justify your final position with evidence

---
`;
    }

    return `${developerSection}## ${this.metadata.role} - Round ${(context.currentRound || 0) + 1}: ${isFirstRound ? 'Initial Analysis' : 'Team Discussion'}

**Files Changed:** ${filesChanged}

${contentSection}
${previousRoundContext}

**Your Task:**
Evaluate this commit from an ${this.metadata.roleDescription} and score ALL 8 metrics:

1. **technicalDebtHours** - YOUR PRIMARY EXPERTISE (debt introduced)
2. **debtReductionHours** - YOUR PRIMARY EXPERTISE (debt removed/fixed)
3. **codeComplexity** - YOUR PRIMARY EXPERTISE
4. **codeQuality** - YOUR SECONDARY EXPERTISE
5. **idealTimeHours** - YOUR SECONDARY EXPERTISE
6. **actualTimeHours** - YOUR SECONDARY EXPERTISE
7. **testCoverage** - YOUR SECONDARY EXPERTISE
8. **functionalImpact** - YOUR SECONDARY EXPERTISE

Focus on your expertise (technicalDebtHours, debtReductionHours, codeComplexity) but provide scores for all pillars.

**Response Format:**
Return ONLY valid JSON with this structure:
\`\`\`json
{
  "summary": "High-level architectural assessment",
  "details": "Detailed analysis of complexity, debt reduction, and design",
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
  "concerns": ["List architectural concerns"],
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
