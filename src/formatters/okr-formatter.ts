import { AuthorStats } from '../services/author-stats-aggregator.service';

interface OKRData {
  authorName: string;
  role?: string;
  reviewPeriod?: string;
  strongPoints: string[];
  weakPoints: string[];
  knowledgeGaps: string[];
  okr3Month: {
    objective: string;
    keyResults: Array<{ kr: string; why: string }>;
  };
  okr6Month?: {
    objective: string;
    keyResults: Array<{ kr: string; why: string }>;
  };
  okr12Month?: {
    objective: string;
    keyResults: Array<{ kr: string; why: string }>;
  };
  actionPlan?: Array<{
    area: string;
    action: string;
    timeline: string;
    success: string;
    support: string;
  }>;
  authorStats: AuthorStats;
}

/**
 * Format comprehensive OKR data into markdown
 */
export function formatOKRToMarkdown(data: OKRData): string {
  const {
    authorName,
    role,
    reviewPeriod,
    strongPoints,
    weakPoints,
    knowledgeGaps,
    okr3Month,
    okr6Month,
    okr12Month,
    actionPlan,
    authorStats,
  } = data;

  let markdown = `# 🧑‍💻 Developer Growth & OKR Profile

**Name:** ${authorName}
${role ? `**Role:** ${role}` : ''}
${reviewPeriod ? `**Review Period:** ${reviewPeriod}` : ''}

---

## ✅ Strong Points
*What this person consistently does well—backed by observable impact.*

`;

  strongPoints.forEach((point) => {
    markdown += `- ${point}\n`;
  });

  markdown += `\n💡 *Focus on behaviors, outcomes, or strengths that benefit the team or product.*

---

## ⚠️ Weak Points (Growth Areas)
*Constructive, specific areas for development—not personality traits.*

`;

  weakPoints.forEach((point) => {
    markdown += `- ${point}\n`;
  });

  markdown += `\n💬 *Frame as opportunities: "Could grow by…" instead of "Fails to…"*

---

## 🧩 Knowledge Gaps
*Specific skills, concepts, or tools that would unlock higher impact.*

`;

  knowledgeGaps.forEach((gap) => {
    markdown += `- ${gap}\n`;
  });

  markdown += `\n🔍 *These should directly inform OKRs and the Action Plan.*

---

## 🎯 OKRs (Aligned Across Time Horizons)

`;

  // 12-Month OKR (if exists)
  if (okr12Month) {
    markdown += `### 📅 12-Month (Annual) Objective

**Objective:** ${okr12Month.objective}

`;
    okr12Month.keyResults.forEach((kr, i) => {
      markdown += `**KR${i + 1}:** ${kr.kr}  \n→ *Why it matters:* ${kr.why}\n\n`;
    });
  }

  // 6-Month OKR (if exists)
  if (okr6Month) {
    markdown += `### 📆 6-Month Objective

**Objective:** ${okr6Month.objective}

`;
    okr6Month.keyResults.forEach((kr, i) => {
      markdown += `**KR${i + 1}:** ${kr.kr}  \n→ *Why it matters:* ${kr.why}\n\n`;
    });
  }

  // 3-Month OKR (always exists)
  markdown += `### 🗓️ 3-Month (Quarterly) Objective

**Owner:** ${authorName}  
**Objective:** ${okr3Month.objective}

`;
  okr3Month.keyResults.forEach((kr, i) => {
    markdown += `**KR${i + 1}:** ${kr.kr}  \n→ *Why it matters:* ${kr.why}\n\n`;
  });

  markdown += `🔗 *Each shorter-term OKR explicitly supports the one above it.*

---

`;

  // Action Plan (if exists)
  if (actionPlan && actionPlan.length > 0) {
    markdown += `## 🚀 Action Plan
*Concrete, time-bound steps to address weak points, close knowledge gaps, and achieve OKRs.*

| Area | Action | Timeline | Success Criteria | Support Needed |
|------|--------|----------|------------------|----------------|
`;
    actionPlan.forEach((item) => {
      markdown += `| ${item.area} | ${item.action} | ${item.timeline} | ${item.success} | ${item.support} |\n`;
    });

    markdown += `\n---\n\n`;
  }

  // Developer Metrics Summary
  markdown += `## 📊 Current Metrics

| Metric | Score | Notes |
|--------|-------|-------|
| Code Quality | ${authorStats.quality.toFixed(1)}/10 | ${getQualityNote(authorStats.quality)} |
| Complexity | ${authorStats.complexity.toFixed(1)}/10 | ${getComplexityNote(authorStats.complexity)} |
| Test Coverage | ${authorStats.tests.toFixed(1)}/10 | ${getTestNote(authorStats.tests)} |
| Impact | ${authorStats.impact.toFixed(1)}/10 | ${getImpactNote(authorStats.impact)} |
| Tech Debt | ${authorStats.techDebt.toFixed(1)}h | Accumulated technical debt |

---

*Generated on ${new Date().toLocaleDateString()} by CodeWave OKR Agent*
`;

  return markdown;
}

// Helper functions for metric notes
function getQualityNote(score: number): string {
  if (score >= 8) return 'Excellent code quality';
  if (score >= 6) return 'Good quality, room for improvement';
  return 'Focus area for improvement';
}

function getComplexityNote(score: number): string {
  if (score <= 3) return 'Simple, maintainable code';
  if (score <= 6) return 'Moderate complexity';
  return 'High complexity, consider simplification';
}

function getTestNote(score: number): string {
  if (score >= 8) return 'Excellent test coverage';
  if (score >= 6) return 'Good coverage, could be improved';
  return 'Needs more test coverage';
}

function getImpactNote(score: number): string {
  if (score >= 8) return 'High business impact';
  if (score >= 6) return 'Moderate impact';
  return 'Growing impact potential';
}
