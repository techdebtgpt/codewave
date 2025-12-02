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
  previousOkr: Annotation<any | undefined>, // Input: Previous OKR for progress tracking

  // Comprehensive OKR Output
  strongPoints: Annotation<string[]>,
  weakPoints: Annotation<string[]>,
  knowledgeGaps: Annotation<string[]>,
  progressReport: Annotation<
    | {
        status: 'On Track' | 'At Risk' | 'Off Track' | 'Completed';
        summary: string;
        achieved: string[];
        missed: string[];
      }
    | undefined
  >,

  // Cascading OKRs

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
  // Ensure maxTokens is at least 8000 for comprehensive OKR generation
  const okrConfig = {
    ...config,
    llm: {
      ...config.llm,
      maxTokens: Math.max(config.llm.maxTokens || 0, 16000),
    },
  };
  const llm = LLMService.getChatModel(okrConfig);

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

    // Previous OKR context for progress tracking
    let previousOkrContext = '';
    let progressReportPrompt = '';
    if (state.previousOkr) {
      console.log('   📊 Analyzing progress from previous OKR...');
      previousOkrContext = `\n\nPREVIOUS OKR (Generated: ${state.previousOkr.generatedAt || 'Unknown'}):\n${JSON.stringify(state.previousOkr, null, 2)}`;
      progressReportPrompt = `,
  "progressReport": {
    "status": "On Track | At Risk | Off Track | Completed",
    "summary": "Brief assessment of progress on previous objectives",
    "achieved": ["Key results that were achieved or on track"],
    "missed": ["Key results that were not achieved or are at risk"]
  }`;
    }

    const prompt = `
You are an Engineering Manager creating a HIGHLY DETAILED developer growth profile. Based on the metrics below, generate a comprehensive assessment with ACTIONABLE and SPECIFIC objectives.

DEVELOPER METRICS:
${formatStats(state.authorStats)}

IDENTIFIED STRENGTHS: ${state.strengths.join(', ')}
IDENTIFIED WEAKNESSES: ${state.weaknesses.join(', ')}
${context}${previousOkrContext}

${state.previousOkr ? 'IMPORTANT: Compare current metrics with the Previous OKR. Assess if they achieved their objectives and key results. Generate a detailed progress report.' : ''}

CRITICAL REQUIREMENTS FOR OKRs:
1. Objectives must be CONCRETE and ACHIEVABLE within 3 months
2. Key Results must be MEASURABLE with specific numbers or clear completion criteria
3. Include 3-5 ACTIONABLE STEPS per Key Result - what the developer should actually DO
4. Use REAL EXAMPLES from their codebase/tech stack when possible
5. Make it DEVELOPER-FRIENDLY - avoid management jargon
6. BE VERBOSE: Provide detailed explanations and context for every point. Short, one-line answers are UNACCEPTABLE.

Generate the following in JSON format:

{
  "strongPoints": [
    "First observable strength with quantified impact - be specific about behaviors and measurable outcomes",
    "Second observable strength with quantified impact - include context and team/product benefits",
    "Third observable strength with quantified impact - reference real technologies and metrics from their work",
    "Fourth observable strength (optional) - demonstrate consistent patterns with concrete evidence",
    "Fifth observable strength (optional) - show growth trajectory and tangible improvements"
  ],
  "weakPoints": [
    "First constructive growth area - frame as opportunity with specific improvement path",
    "Second constructive growth area - be direct but supportive, include actionable suggestions",
    "Third constructive growth area - reference patterns observed in their commits with examples"
  ],
  "knowledgeGaps": [
    "First specific skill or concept to develop - explain how it would unlock higher impact",
    "Second specific skill or concept - include concrete technologies or methodologies",
    "Third specific skill or concept - show connection to their current work and growth path",
    "Fourth specific skill or concept - identify missing knowledge that limits effectiveness"
  ]${progressReportPrompt},
  "okr3Month": {
    "objective": "SPECIFIC, ACTIONABLE outcome (e.g., 'Reduce API response time by 40% and eliminate all P0 bugs to improve user retention')",
    "keyResults": [
      {
        "kr": "MEASURABLE result with NUMBER (e.g., 'Reduce average API response time from 800ms to 480ms by implementing caching and query optimization')",
        "why": "Impact explanation (e.g., 'Improves user experience and reduces server costs by ~$200/month. Faster load times directly correlate with higher conversion rates.')",
        "actionSteps": [
          "Concrete action 1 (e.g., 'Profile top 10 slowest endpoints using New Relic to identify bottlenecks')",
          "Concrete action 2 (e.g., 'Implement Redis caching for frequently accessed data with a 5-minute TTL')",
          "Concrete action 3 (e.g., 'Add database indexes on user_id and created_at columns to speed up dashboard queries')",
          "Concrete action 4 (e.g., 'Refactor N+1 query issues in the user-feed service')"
        ]
      },
      {
        "kr": "LEARNING outcome with clear deliverable (e.g., 'Complete advanced TypeScript course and refactor 3 legacy modules to use generics and utility types')",
        "why": "Growth rationale (e.g., 'Improves code maintainability and reduces type-related bugs by 60%. Stronger typing prevents runtime errors.')",
        "actionSteps": [
          "Specific learning task (e.g., 'Complete TypeScript Deep Dive course on Udemy (12 hours) focusing on advanced types')",
          "Application task (e.g., 'Refactor user-service.ts to use strict typing and generics instead of any')",
          "Knowledge sharing (e.g., 'Present 30-min team workshop on advanced TypeScript patterns and best practices')",
          "Code review (e.g., 'Review 5 PRs specifically looking for type safety improvements')"
        ]
      },
      {
        "kr": "QUALITY metric with target (e.g., 'Increase test coverage from 65% to 85% and achieve 0 critical security vulnerabilities')",
        "why": "Quality impact (e.g., 'Reduces production bugs and ensures compliance with security standards. Higher confidence in deployments.')",
        "actionSteps": [
          "Audit task (e.g., 'Identify 20 untested critical paths using coverage report and prioritize them')",
          "Implementation (e.g., 'Write integration tests for authentication and payment flows using Jest and Supertest')",
          "Tooling (e.g., 'Set up SonarQube to block PRs with coverage < 80% and fix reported hotspots')",
          "Security (e.g., 'Run npm audit and fix all high-severity vulnerabilities')"
        ]
      }
    ]
  }
}

Focus on:
- Strong points: Observable behaviors with QUANTIFIED team/product impact. Provide context.
- Weak points: Frame as opportunities with SPECIFIC improvement areas. Be constructive but direct.
- Knowledge gaps: Skills that would unlock higher impact with CONCRETE examples.
- 3-month OKRs: DIRECTLY address weak points with MEASURABLE targets and ACTIONABLE steps.
- Action Steps: Break down each KR into 3-5 CONCRETE tasks the developer can start TODAY.
${state.previousOkr ? '- Progress report: Compare current metrics with previous OKR to assess achievement in detail.' : ''}
`;

    const response = await llm.invoke([
      new SystemMessage(
        'You are an experienced Engineering Manager focused on developer growth. Output valid JSON only.'
      ),
      new HumanMessage(prompt),
    ]);

    const content = getContent(response);

    try {
      // Parse JSON response (strip markdown code blocks if present)
      const jsonContent = extractJSON(content);
      const parsed = JSON.parse(jsonContent);

      return {
        strongPoints: parsed.strongPoints || [],
        weakPoints: parsed.weakPoints || [],
        knowledgeGaps: parsed.knowledgeGaps || [],
        progressReport: parsed.progressReport || undefined,
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
      // Parse JSON response (strip markdown code blocks if present)
      const jsonContent = extractJSON(content);
      const parsed = JSON.parse(jsonContent);

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

// Helper: Extract JSON from markdown code blocks
function extractJSON(content: string): string {
  // Remove markdown code blocks if present (```json ... ``` or ``` ... ```)
  const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) {
    return jsonMatch[1].trim();
  }
  return content.trim();
}
