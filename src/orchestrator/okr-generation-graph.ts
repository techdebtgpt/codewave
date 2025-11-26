import { StateGraph, END, START, Annotation } from '@langchain/langgraph';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { LLMService } from '../llm/llm-service';
import { AppConfig } from '../config/config.interface';
import { AuthorStats } from '../services/author-stats-aggregator.service';
import { CommentVectorStoreService } from '../services/comment-vector-store.service';

/**
 * State for the OKR Generation Graph
 */
export const OkrGenerationState = Annotation.Root({
  // Input
  authorStats: Annotation<AuthorStats>,
  strengths: Annotation<string[]>,
  weaknesses: Annotation<string[]>,
  vectorStore: Annotation<CommentVectorStoreService | undefined>,

  // Comprehensive OKR Output
  strongPoints: Annotation<string[]>,
  weakPoints: Annotation<string[]>,
  knowledgeGaps: Annotation<string[]>,

  // Cascading OKRs
  okr3Month: Annotation<{
    objective: string;
    keyResults: Array<{ kr: string; why: string }>;
  }>,
  okr6Month: Annotation<
    | {
        objective: string;
        keyResults: Array<{ kr: string; why: string }>;
      }
    | undefined
  >,
  okr12Month: Annotation<
    | {
        objective: string;
        keyResults: Array<{ kr: string; why: string }>;
      }
    | undefined
  >,

  // Action Plan
  actionPlan: Annotation<
    | Array<{
        area: string;
        action: string;
        timeline: string;
        success: string;
        support: string;
      }>
    | undefined
  >,

  // Working State
  currentOkrs: Annotation<string[]>, // Temporary for refinement
  feedback: Annotation<string>,
  rounds: Annotation<number>,
  maxRounds: Annotation<number>,
});

/**
 * Create the OKR Generation Graph
 */
export function createOkrGenerationGraph(config: AppConfig) {
  const llm = LLMService.getChatModel(config);

  // Node: Generate Initial Draft
  async function generateDraft(state: typeof OkrGenerationState.State) {
    console.log('   📝 Generating comprehensive OKR draft...');

    // RAG: Query for relevant past issues
    let context = '';
    if (state.vectorStore) {
      const qualityIssues = await state.vectorStore.query('code quality issues', 3);
      const testingIssues = await state.vectorStore.query('testing gaps', 3);
      const complexityIssues = await state.vectorStore.query('complexity concerns', 3);

      const allIssues = [...qualityIssues, ...testingIssues, ...complexityIssues];
      if (allIssues.length > 0) {
        context = `\n\nRECURRING ISSUES FROM PAST EVALUATIONS:\n${allIssues.map((i) => `- ${i}`).join('\n')}`;
      }
    }

    const prompt = `
You are an Engineering Manager creating a developer growth profile. Based on the metrics below, generate a structured assessment.

DEVELOPER METRICS:
${formatStats(state.authorStats)}

IDENTIFIED STRENGTHS: ${state.strengths.join(', ')}
IDENTIFIED WEAKNESSES: ${state.weaknesses.join(', ')}
${context}

Generate the following in JSON format:

{
  "strongPoints": [
    "Observable strength with impact (3-5 points)",
    "Example: 'Writes exceptionally clean React code—PRs often used as examples'"
  ],
  "weakPoints": [
    "Constructive growth area (2-4 points)",
    "Example: 'Tends to underestimate task complexity, leading to sprint overruns'"
  ],
  "knowledgeGaps": [
    "Specific skill or concept to develop (3-5 items)",
    "Example: 'Advanced performance profiling (React.memo, bundle analysis)'"
  ],
  "okr3Month": {
    "objective": "Tactical, achievable outcome this quarter",
    "keyResults": [
      {
        "kr": "Specific, time-bound result",
        "why": "Why it matters for growth"
      },
      {
        "kr": "Learning or collaboration outcome",
        "why": "Why it matters"
      },
      {
        "kr": "Quality or reliability metric",
        "why": "Why it matters"
      }
    ]
  }
}

Focus on:
- Strong points: Observable behaviors with team/product impact
- Weak points: Frame as opportunities ("Could grow by..." not "Fails to...")
- Knowledge gaps: Skills that would unlock higher impact
- 3-month OKRs: Directly address weak points and close knowledge gaps
`;

    const response = await llm.invoke([
      new SystemMessage(
        'You are an experienced Engineering Manager focused on developer growth. Output valid JSON only.'
      ),
      new HumanMessage(prompt),
    ]);

    const content = getContent(response);

    try {
      // Parse JSON response
      const parsed = JSON.parse(content);

      return {
        strongPoints: parsed.strongPoints || [],
        weakPoints: parsed.weakPoints || [],
        knowledgeGaps: parsed.knowledgeGaps || [],
        okr3Month: parsed.okr3Month || { objective: '', keyResults: [] },
        currentOkrs: parsed.okr3Month?.keyResults?.map((kr: any) => kr.kr) || [],
        rounds: 0,
      };
    } catch (error) {
      console.error('Failed to parse OKR JSON:', error);
      // Fallback to simple parsing
      const okrs = parseOkrs(content);
      return {
        strongPoints: state.strengths,
        weakPoints: state.weaknesses,
        knowledgeGaps: [],
        okr3Month: {
          objective: 'Improve development practices',
          keyResults: okrs.map((kr) => ({ kr, why: '' })),
        },
        currentOkrs: okrs,
        rounds: 0,
      };
    }
  }

  // Node: Review OKR (Simulated Manager Feedback)
  async function reviewOkr(state: typeof OkrGenerationState.State) {
    console.log(`   🧐 Reviewing comprehensive OKR draft (Round ${state.rounds + 1})...`);

    const prompt = `
Review this developer growth profile:

STRONG POINTS:
${state.strongPoints.join('\n')}

WEAK POINTS:
${state.weakPoints.join('\n')}

KNOWLEDGE GAPS:
${state.knowledgeGaps.join('\n')}

3-MONTH OKR:
Objective: ${state.okr3Month.objective}
Key Results:
${state.okr3Month.keyResults.map((kr, i) => `${i + 1}. ${kr.kr}\n   Why: ${kr.why}`).join('\n')}

Developer Metrics:
${formatStats(state.authorStats)}

Provide constructive feedback to improve this profile. Focus on:
1. Are strong/weak points specific and observable?
2. Do knowledge gaps directly relate to weak points?
3. Do 3-month OKRs address the weak points and knowledge gaps?
4. Are key results measurable and realistic?
5. Is the "why" for each KR clear and compelling?

Keep feedback concise (bullet points).
`;

    const response = await llm.invoke([
      new SystemMessage(
        'You are a Senior Technical Program Manager reviewing OKRs. Be critical but constructive.'
      ),
      new HumanMessage(prompt),
    ]);

    return { feedback: getContent(response) };
  }

  // Node: Refine OKR based on Feedback
  async function refineOkr(state: typeof OkrGenerationState.State) {
    const isFinalRound = state.rounds + 1 >= state.maxRounds;

    if (isFinalRound) {
      console.log('   ✨ Final refinement: Expanding to cascading OKRs and action plan...');
    } else {
      console.log('   ✨ Refining OKRs based on feedback...');
    }

    const prompt = isFinalRound
      ? `
Current developer profile:

STRONG POINTS: ${state.strongPoints.join(', ')}
WEAK POINTS: ${state.weakPoints.join(', ')}
KNOWLEDGE GAPS: ${state.knowledgeGaps.join(', ')}

3-MONTH OKR:
Objective: ${state.okr3Month.objective}
Key Results: ${state.okr3Month.keyResults.map((kr) => kr.kr).join(', ')}

Feedback: ${state.feedback}

Now expand this into a complete cascading OKR structure with action plan. Return JSON:

{
  "okr12Month": {
    "objective": "Strategic, inspirational goal for the year",
    "keyResults": [
      {"kr": "Measurable outcome with baseline → target", "why": "Why it matters"}
    ]
  },
  "okr6Month": {
    "objective": "Mid-term milestone enabling the annual goal",
    "keyResults": [
      {"kr": "Deliverable or capability with deadline", "why": "Why it matters"}
    ]
  },
  "okr3Month": {
    "objective": "Refined quarterly objective",
    "keyResults": [
      {"kr": "Specific, time-bound result", "why": "Why it matters"},
      {"kr": "Learning outcome", "why": "Why it matters"},
      {"kr": "Quality metric", "why": "Why it matters"}
    ]
  },
  "actionPlan": [
    {
      "area": "e.g., Estimation",
      "action": "Break tasks into sub-tasks before sprint planning",
      "timeline": "Ongoing",
      "success": "90% of tasks completed within estimate",
      "support": "EM feedback in 1:1s"
    }
  ]
}

Ensure 3-month OKRs support 6-month, which support 12-month.
`
      : `
Current profile feedback: ${state.feedback}

Refine the 3-month OKR to address the feedback. Return JSON:

{
  "okr3Month": {
    "objective": "Improved objective",
    "keyResults": [
      {"kr": "Refined KR 1", "why": "Why it matters"},
      {"kr": "Refined KR 2", "why": "Why it matters"},
      {"kr": "Refined KR 3", "why": "Why it matters"}
    ]
  }
}
`;

    const response = await llm.invoke([
      new SystemMessage('You are an Engineering Manager refining OKRs. Output valid JSON only.'),
      new HumanMessage(prompt),
    ]);

    const content = getContent(response);

    try {
      const parsed = JSON.parse(content);

      if (isFinalRound) {
        return {
          okr12Month: parsed.okr12Month,
          okr6Month: parsed.okr6Month,
          okr3Month: parsed.okr3Month || state.okr3Month,
          actionPlan: parsed.actionPlan,
          rounds: state.rounds + 1,
        };
      } else {
        return {
          okr3Month: parsed.okr3Month || state.okr3Month,
          currentOkrs: parsed.okr3Month?.keyResults?.map((kr: any) => kr.kr) || state.currentOkrs,
          rounds: state.rounds + 1,
        };
      }
    } catch (error) {
      console.error('Failed to parse refinement JSON:', error);
      return { rounds: state.rounds + 1 };
    }
  }

  // Edge: Check Convergence
  function shouldContinue(state: typeof OkrGenerationState.State) {
    if (state.rounds >= state.maxRounds) {
      return END;
    }
    return 'reviewOkr';
  }

  // Build Graph
  const workflow = new StateGraph(OkrGenerationState)
    .addNode('generateDraft', generateDraft)
    .addNode('reviewOkr', reviewOkr)
    .addNode('refineOkr', refineOkr)
    .addEdge('generateDraft', 'reviewOkr')
    .addEdge('reviewOkr', 'refineOkr')
    .addConditionalEdges('refineOkr', shouldContinue, {
      [END]: END,
      reviewOkr: 'reviewOkr',
    });

  workflow.addEdge(START, 'generateDraft');

  return workflow.compile();
}

// Helper: Format Stats
function formatStats(stats: AuthorStats): string {
  return `
• Code Quality: ${stats.quality.toFixed(1)}/10
• Complexity: ${stats.complexity.toFixed(1)}/10 (Lower is better)
• Test Coverage: ${stats.tests.toFixed(1)}/10
• Impact: ${stats.impact.toFixed(1)}/10
• Tech Debt: ${stats.techDebt.toFixed(1)}h
    `.trim();
}

// Helper: Parse OKRs
function parseOkrs(text: string): string[] {
  return text
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => line.replace(/^[\d-]+\.\s*/, '').trim())
    .slice(0, 3);
}

// Helper: Get Content safely
function getContent(response: any): string {
  return typeof response.content === 'string' ? response.content : JSON.stringify(response.content);
}
