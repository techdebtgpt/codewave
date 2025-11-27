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
    keyResults: Array<{ kr: string; why: string; actionSteps?: string[] }>;
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
  historicalOkrs?: any[]; // Historical OKR data
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
    historicalOkrs = [],
  } = data;

  // Extract author slug for back button
  const authorSlug = authorName.toLowerCase().replace(/[^a-z0-9]/g, '-');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>OKR Profile - ${authorName}</title>
  <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
  <style>
    body { padding: 20px; background: #f5f5f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 40px; border-radius: 10px; margin-bottom: 30px; }
    .table-container { background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); margin-bottom: 30px; }
    .section-title { margin-bottom: 20px; color: #333; font-weight: 600; font-size: 1.3rem; }
  </style>
</head>
<body>
  <div class="container-fluid">
    <!-- Header matching author page -->
    <div class="header">
      <div class="position-relative">
        <a href="../../author-${authorSlug}.html" class="btn btn-sm" style="position: absolute; top: 0; right: 0; background: rgba(255,255,255,0.2); color: white; border: 1px solid rgba(255,255,255,0.3); backdrop-filter: blur(10px);">
          ← Back to Dashboard
        </a>
        <div class="text-center">
          <h1>🎯 Complete OKR Profile</h1>
          <h3>${authorName}</h3>
          <p class="mb-0">Generated on ${new Date().toLocaleDateString()}</p>
        </div>
      </div>
    </div>

    <!-- Assessment Cards (matching user page) -->
    <div class="table-container">
      <h3 class="section-title">📊 Developer Assessment</h3>
      <div class="row">
        <!-- Strong Points -->
        <div class="col-md-4 mb-3">
          <div class="card h-100 border-success shadow-sm">
            <div class="card-header bg-success text-white py-2">
              <strong>💪 Strong Points</strong>
            </div>
            <div class="card-body">
              <ul class="mb-0 ps-3 small">
                ${strongPoints.map((point: string) => `<li class="mb-1">${point}</li>`).join('')}
              </ul>
            </div>
          </div>
        </div>

        <!-- Weak Points -->
        <div class="col-md-4 mb-3">
          <div class="card h-100 border-warning shadow-sm">
            <div class="card-header bg-warning text-dark py-2">
              <strong>⚠️ Growth Areas</strong>
            </div>
            <div class="card-body">
              <ul class="mb-0 ps-3 small">
                ${weakPoints.map((point: string) => `<li class="mb-1">${point}</li>`).join('')}
              </ul>
            </div>
          </div>
        </div>

        <!-- Knowledge Gaps -->
        <div class="col-md-4 mb-3">
          <div class="card h-100 border-info shadow-sm">
            <div class="card-header bg-info text-white py-2">
              <strong>🧩 Knowledge Gaps</strong>
            </div>
            <div class="card-body">
              <ul class="mb-0 ps-3 small">
                ${knowledgeGaps.map((gap: string) => `<li class="mb-1">${gap}</li>`).join('')}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 3-Month OKR (matching user page) -->
    <div class="table-container">
      <h3 class="section-title">🎯 3-Month Objective</h3>
      <div class="card border-primary shadow-sm">
        <div class="card-body">
          <h5 class="text-primary mb-3">${okr3Month.objective}</h5>
          <div class="row">
            ${okr3Month.keyResults
              .map(
                (kr: any, i: number) => `
              <div class="col-md-4 mb-3">
                <div class="p-3 bg-light rounded h-100 border">
                  <div class="fw-bold mb-2 text-primary">KR ${i + 1}</div>
                  <div class="mb-2">${kr.kr}</div>
                  <div class="text-muted small border-top pt-2 mt-2 mb-2"><em>Why:</em> ${kr.why}</div>
                  ${
                    kr.actionSteps && kr.actionSteps.length > 0
                      ? `
                    <div class="border-top pt-2 mt-2">
                      <strong class="small text-success">✓ Action Steps:</strong>
                      <ol class="small mb-0 mt-1 ps-3">
                        ${kr.actionSteps.map((step: string) => `<li class="mb-1">${step}</li>`).join('')}
                      </ol>
                    </div>
                  `
                      : ''
                  }
                </div>
              </div>
            `
              )
              .join('')}
          </div>
        </div>
      </div>
    </div>

    ${
      okr6Month || okr12Month
        ? `
    <!-- Long-term OKRs -->
    <div class="table-container">
      <h3 class="section-title">📅 Long-Term Objectives</h3>
      ${
        okr6Month
          ? `
      <div class="card border-primary shadow-sm mb-3">
        <div class="card-header bg-primary text-white">
          <strong>📆 6-Month Objective</strong>
        </div>
        <div class="card-body">
          <h6 class="text-primary mb-3">${okr6Month.objective}</h6>
          ${okr6Month.keyResults
            .map(
              (kr: any, i: number) => `
            <div class="p-2 mb-2 bg-light rounded border">
              <strong>KR ${i + 1}:</strong> ${kr.kr}
              <div class="text-muted small mt-1"><em>Why:</em> ${kr.why}</div>
            </div>
          `
            )
            .join('')}
        </div>
      </div>
      `
          : ''
      }
      ${
        okr12Month
          ? `
      <div class="card border-primary shadow-sm">
        <div class="card-header bg-primary text-white" style="opacity: 0.9;">
          <strong>📅 12-Month Objective</strong>
        </div>
        <div class="card-body">
          <h6 class="text-primary mb-3">${okr12Month.objective}</h6>
          ${okr12Month.keyResults
            .map(
              (kr: any, i: number) => `
            <div class="p-2 mb-2 bg-light rounded border">
              <strong>KR ${i + 1}:</strong> ${kr.kr}
              <div class="text-muted small mt-1"><em>Why:</em> ${kr.why}</div>
            </div>
          `
            )
            .join('')}
        </div>
      </div>
      `
          : ''
      }
    </div>
    `
        : ''
    }

    ${
      actionPlan && actionPlan.length > 0
        ? `
    <!-- Action Plan -->
    <div class="table-container">
      <h3 class="section-title">🚀 Action Plan</h3>
      <div class="table-responsive">
        <table class="table table-striped">
          <thead class="table-light">
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
                (item: any) => `
              <tr>
                <td class="fw-bold text-secondary">${item.area}</td>
                <td>${item.action}</td>
                <td><span class="badge bg-secondary">${item.timeline}</span></td>
                <td class="small text-muted">${item.success}</td>
                <td class="small text-muted">${item.support}</td>
              </tr>
            `
              )
              .join('')}
          </tbody>
        </table>
      </div>
    </div>
    `
        : ''
    }

    <!-- Current Metrics -->
    <div class="table-container">
      <h3 class="section-title">📊 Current Metrics</h3>
      <div class="row">
        <div class="col-md-3 mb-3">
          <div class="card text-center">
            <div class="card-body">
              <h4 class="text-primary">${authorStats.quality.toFixed(1)}/10</h4>
              <p class="mb-0 small">Code Quality</p>
              <small class="text-muted">${getQualityNote(authorStats.quality)}</small>
            </div>
          </div>
        </div>
        <div class="col-md-3 mb-3">
          <div class="card text-center">
            <div class="card-body">
              <h4 class="text-primary">${authorStats.complexity.toFixed(1)}/10</h4>
              <p class="mb-0 small">Complexity</p>
              <small class="text-muted">${getComplexityNote(authorStats.complexity)}</small>
            </div>
          </div>
        </div>
        <div class="col-md-3 mb-3">
          <div class="card text-center">
            <div class="card-body">
              <h4 class="text-primary">${authorStats.tests.toFixed(1)}/10</h4>
              <p class="mb-0 small">Test Coverage</p>
              <small class="text-muted">${getTestNote(authorStats.tests)}</small>
            </div>
          </div>
        </div>
        <div class="col-md-3 mb-3">
          <div class="card text-center">
            <div class="card-body">
              <h4 class="text-primary">${authorStats.impact.toFixed(1)}/10</h4>
              <p class="mb-0 small">Impact</p>
              <small class="text-muted">${getImpactNote(authorStats.impact)}</small>
            </div>
          </div>
        </div>
      </div>
      <div class="alert alert-secondary text-center mt-3">
        <strong>Tech Debt:</strong> ${authorStats.techDebt.toFixed(1)}h accumulated
      </div>
    </div>

    ${
      historicalOkrs && historicalOkrs.length > 1
        ? `
    <!-- Historical OKRs -->
    <div class="table-container">
      <h3 class="section-title">📜 OKR History</h3>
      <p class="text-muted mb-3">Track progress and evolution over time (${historicalOkrs.length} total records)</p>
      <div class="accordion" id="historicalOkrsAccordion">
        ${historicalOkrs
          .slice(1)
          .map((okr: any, index: number) => {
            const date = new Date(okr.generatedAt).toLocaleDateString();
            const isFirst = index === 0;
            return `
        <div class="accordion-item">
          <h2 class="accordion-header">
            <button class="accordion-button ${isFirst ? '' : 'collapsed'}" type="button" data-bs-toggle="collapse" data-bs-target="#collapse${index}">
              <strong>📅 ${date}</strong> &nbsp;— &nbsp; ${okr.okr3Month?.objective || 'No objective'}
            </button>
          </h2>
          <div id="collapse${index}" class="accordion-collapse collapse ${isFirst ? 'show' : ''}" data-bs-parent="#historicalOkrsAccordion">
            <div class="accordion-body">
              <div class="row mb-3">
                <div class="col-md-4">
                  <h6 class="text-success">💪 Strong Points</h6>
                  <ul class="small">
                    ${okr.strongPoints?.map((p: string) => `<li>${p}</li>`).join('') || '<li>No data</li>'}
                  </ul>
                </div>
                <div class="col-md-4">
                  <h6 class="text-warning">⚠️ Growth Areas</h6>
                  <ul class="small">
                    ${okr.weakPoints?.map((p: string) => `<li>${p}</li>`).join('') || '<li>No data</li>'}
                  </ul>
                </div>
                <div class="col-md-4">
                  <h6 class="text-info">🧩 Knowledge Gaps</h6>
                  <ul class="small">
                    ${okr.knowledgeGaps?.map((g: string) => `<li>${g}</li>`).join('') || '<li>No data</li>'}
                  </ul>
                </div>
              </div>
              ${
                okr.okr3Month
                  ? `
              <div class="border-top pt-3">
                <h6 class="text-primary">🎯 3-Month Objective</h6>
                <p class="mb-2"><strong>${okr.okr3Month.objective}</strong></p>
                ${
                  okr.okr3Month.keyResults
                    ?.map(
                      (kr: any, i: number) => `
                  <div class="p-2 mb-2 bg-light rounded">
                    <strong>KR ${i + 1}:</strong> ${kr.kr}
                  </div>
                `
                    )
                    .join('') || ''
                }
              </div>
              `
                  : ''
              }
            </div>
          </div>
        </div>
        `;
          })
          .join('')}
      </div>
    </div>
    `
        : ''
    }

    <!-- Footer -->
    <div class="text-center mt-4 mb-4">
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
