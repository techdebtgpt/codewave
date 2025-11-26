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
 * Format comprehensive OKR data into HTML
 */
export function formatOKRToHTML(data: OKRData): string {
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

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>OKR Profile - ${authorName}</title>
  <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
  <style>
    body {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      padding: 40px 0;
    }
    .okr-container {
      max-width: 1200px;
      margin: 0 auto;
      background: #fff;
      border-radius: 20px;
      box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
      padding: 40px;
    }
    .okr-header {
      text-align: center;
      margin-bottom: 40px;
      padding-bottom: 30px;
      border-bottom: 3px solid #667eea;
    }
    .okr-header h1 {
      margin-bottom: 10px;
      font-size: 2.5rem;
    }
    .section-header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 15px 20px;
      border-radius: 10px;
      margin: 30px 0 20px 0;
      font-size: 1.4rem;
      font-weight: 600;
    }
    .card {
      border: none;
      box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
      margin-bottom: 20px;
    }
    .strong-point {
      background: #d4edda;
      border-left: 4px solid #28a745;
      padding: 15px;
      margin-bottom: 15px;
      border-radius: 5px;
    }
    .weak-point {
      background: #fff3cd;
      border-left: 4px solid #ffc107;
      padding: 15px;
      margin-bottom: 15px;
      border-radius: 5px;
    }
    .knowledge-gap {
      background: #cfe2ff;
      border-left: 4px solid #0d6efd;
      padding: 15px;
      margin-bottom: 15px;
      border-radius: 5px;
    }
    .okr-timeline {
      position: relative;
      padding-left: 30px;
    }
    .okr-timeline::before {
      content: '';
      position: absolute;
      left: 10px;
      top: 0;
      bottom: 0;
      width: 3px;
      background: linear-gradient(180deg, #667eea 0%, #764ba2 100%);
    }
    .okr-timeline-item {
      position: relative;
      margin-bottom: 30px;
      padding: 20px;
      background: #f8f9fa;
      border-radius: 10px;
      border-left: 4px solid #667eea;
    }
    .okr-timeline-marker {
      position: absolute;
      left: -23px;
      top: 20px;
      width: 20px;
      height: 20px;
      border-radius: 50%;
      background: #667eea;
      border: 3px solid white;
      box-shadow: 0 2px 5px rgba(0,0,0,0.2);
    }
    .key-result {
      background: white;
      padding: 15px;
      margin: 10px 0;
      border-radius: 8px;
      border: 1px solid #dee2e6;
    }
    .key-result-title {
      font-weight: 600;
      color: #667eea;
      margin-bottom: 8px;
    }
    .key-result-why {
      color: #666;
      font-size: 0.9rem;
      font-style: italic;
    }
    .metric-card {
      text-align: center;
      padding: 20px;
      border-radius: 10px;
      background: linear-gradient(135deg, rgba(102, 126, 234, 0.1) 0%, rgba(118, 75, 162, 0.1) 100%);
    }
    .metric-value {
      font-size: 2rem;
      font-weight: bold;
      color: #667eea;
    }
    .metric-label {
      font-size: 0.9rem;
      color: #666;
      margin-top: 5px;
    }
    .action-plan-table {
      background: white;
      border-radius: 10px;
      overflow: hidden;
    }
  </style>
</head>
<body>
  <div class="okr-container">
    <!-- Header -->
    <div class="okr-header">
      <h1>🧑‍💻 Developer Growth & OKR Profile</h1>
      <h2 class="text-primary">${authorName}</h2>
      ${role ? `<p class="text-muted mb-1"><strong>Role:</strong> ${role}</p>` : ''}
      ${reviewPeriod ? `<p class="text-muted"><strong>Review Period:</strong> ${reviewPeriod}</p>` : ''}
      <small class="text-muted">Generated on ${new Date().toLocaleDateString()}</small>
    </div>

    <!-- Strong Points -->
    <div class="section-header">
      ✅ Strong Points
    </div>
    <p class="text-muted mb-3">What this person consistently does well—backed by observable impact.</p>
    ${strongPoints.map((point) => `<div class="strong-point">${point}</div>`).join('')}
    <p class="text-muted fst-italic mt-3">💡 Focus on behaviors, outcomes, or strengths that benefit the team or product.</p>

    <!-- Weak Points -->
    <div class="section-header">
      ⚠️ Weak Points (Growth Areas)
    </div>
    <p class="text-muted mb-3">Constructive, specific areas for development—not personality traits.</p>
    ${weakPoints.map((point) => `<div class="weak-point">${point}</div>`).join('')}
    <p class="text-muted fst-italic mt-3">💬 Frame as opportunities: "Could grow by…" instead of "Fails to…"</p>

    <!-- Knowledge Gaps -->
    <div class="section-header">
      🧩 Knowledge Gaps
    </div>
    <p class="text-muted mb-3">Specific skills, concepts, or tools that would unlock higher impact.</p>
    ${knowledgeGaps.map((gap) => `<div class="knowledge-gap">${gap}</div>`).join('')}
    <p class="text-muted fst-italic mt-3">🔍 These should directly inform OKRs and the Action Plan.</p>

    <!-- OKRs Timeline -->
    <div class="section-header">
      🎯 OKRs (Aligned Across Time Horizons)
    </div>
    <p class="text-muted mb-4">Each shorter-term OKR explicitly supports the one above it.</p>

    <div class="okr-timeline">
      ${
        okr12Month
          ? `
      <!-- 12-Month OKR -->
      <div class="okr-timeline-item">
        <div class="okr-timeline-marker"></div>
        <h4 class="text-primary mb-3">📅 12-Month (Annual) Objective</h4>
        <div class="alert alert-primary mb-3">
          <strong>Objective:</strong> ${okr12Month.objective}
        </div>
        ${okr12Month.keyResults
          .map(
            (kr, i) => `
          <div class="key-result">
            <div class="key-result-title">KR${i + 1}: ${kr.kr}</div>
            <div class="key-result-why">→ Why it matters: ${kr.why}</div>
          </div>
        `
          )
          .join('')}
      </div>
      `
          : ''
      }

      ${
        okr6Month
          ? `
      <!-- 6-Month OKR -->
      <div class="okr-timeline-item">
        <div class="okr-timeline-marker"></div>
        <h4 class="text-primary mb-3">📆 6-Month Objective</h4>
        <div class="alert alert-info mb-3">
          <strong>Objective:</strong> ${okr6Month.objective}
        </div>
        ${okr6Month.keyResults
          .map(
            (kr, i) => `
          <div class="key-result">
            <div class="key-result-title">KR${i + 1}: ${kr.kr}</div>
            <div class="key-result-why">→ Why it matters: ${kr.why}</div>
          </div>
        `
          )
          .join('')}
      </div>
      `
          : ''
      }

      <!-- 3-Month OKR -->
      <div class="okr-timeline-item">
        <div class="okr-timeline-marker"></div>
        <h4 class="text-primary mb-3">🗓️ 3-Month (Quarterly) Objective</h4>
        <div class="alert alert-success mb-3">
          <strong>Owner:</strong> ${authorName}<br>
          <strong>Objective:</strong> ${okr3Month.objective}
        </div>
        ${okr3Month.keyResults
          .map(
            (kr, i) => `
          <div class="key-result">
            <div class="key-result-title">KR${i + 1}: ${kr.kr}</div>
            <div class="key-result-why">→ Why it matters: ${kr.why}</div>
          </div>
        `
          )
          .join('')}
      </div>
    </div>

    ${
      actionPlan && actionPlan.length > 0
        ? `
    <!-- Action Plan -->
    <div class="section-header">
      🚀 Action Plan
    </div>
    <p class="text-muted mb-3">Concrete, time-bound steps to address weak points, close knowledge gaps, and achieve OKRs.</p>
    <div class="action-plan-table">
      <table class="table table-hover">
        <thead class="table-dark">
          <tr>
            <th>Area</th>
            <th>Action</th>
            <th>Timeline</th>
            <th>Success Criteria</th>
            <th>Support Needed</th>
          </tr>
        </thead>
        <tbody>
          ${actionPlan
            .map(
              (item) => `
            <tr>
              <td><strong>${item.area}</strong></td>
              <td>${item.action}</td>
              <td><span class="badge bg-secondary">${item.timeline}</span></td>
              <td>${item.success}</td>
              <td>${item.support}</td>
            </tr>
          `
            )
            .join('')}
        </tbody>
      </table>
    </div>
    `
        : ''
    }

    <!-- Current Metrics -->
    <div class="section-header">
      📊 Current Metrics
    </div>
    <div class="row mt-4">
      <div class="col-md-3 mb-3">
        <div class="metric-card">
          <div class="metric-value">${authorStats.quality.toFixed(1)}/10</div>
          <div class="metric-label">Code Quality</div>
          <small class="text-muted">${getQualityNote(authorStats.quality)}</small>
        </div>
      </div>
      <div class="col-md-3 mb-3">
        <div class="metric-card">
          <div class="metric-value">${authorStats.complexity.toFixed(1)}/10</div>
          <div class="metric-label">Complexity</div>
          <small class="text-muted">${getComplexityNote(authorStats.complexity)}</small>
        </div>
      </div>
      <div class="col-md-3 mb-3">
        <div class="metric-card">
          <div class="metric-value">${authorStats.tests.toFixed(1)}/10</div>
          <div class="metric-label">Test Coverage</div>
          <small class="text-muted">${getTestNote(authorStats.tests)}</small>
        </div>
      </div>
      <div class="col-md-3 mb-3">
        <div class="metric-card">
          <div class="metric-value">${authorStats.impact.toFixed(1)}/10</div>
          <div class="metric-label">Impact</div>
          <small class="text-muted">${getImpactNote(authorStats.impact)}</small>
        </div>
      </div>
    </div>
    <div class="row mt-3">
      <div class="col-md-12">
        <div class="alert alert-secondary text-center">
          <strong>Tech Debt:</strong> ${authorStats.techDebt.toFixed(1)}h accumulated
        </div>
      </div>
    </div>

    <!-- Footer -->
    <div class="text-center mt-5 pt-4 border-top">
      <small class="text-muted">
        Generated by <strong>CodeWave OKR Agent</strong> on ${new Date().toLocaleDateString()}
      </small>
    </div>
  </div>

  <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>
</body>
</html>`;
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
