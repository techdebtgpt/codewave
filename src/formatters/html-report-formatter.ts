// src/formatters/html-report-formatter.ts
// Generates a comprehensive Bootstrap-based HTML report showing multi-round discussions
import fs from 'fs';
import { AgentResult } from '../agents/agent.interface';

/**
 * Generate comprehensive HTML report with Bootstrap showing full multi-round discussion
 */
export function generateHtmlReport(
  results: AgentResult[],
  outputPath: string,
  metadata?: { commitHash?: string; timestamp?: string }
) {
  // All results are discussion agents now (no separate metrics agent)
  const discussionAgents = results;

  // Detect agent names from content patterns
  const detectAgentName = (result: AgentResult, idx: number): string => {
    const summary = result.summary?.toLowerCase() || '';
    const details = result.details?.toLowerCase() || '';
    const combined = summary + ' ' + details;

    // Business Analyst patterns
    if (
      combined.includes('business analyst') ||
      combined.includes('functional impact') ||
      combined.includes('business value') ||
      combined.includes('ideal time')
    ) {
      return 'Business Analyst';
    }

    // QA Engineer patterns
    if (
      combined.includes('qa engineer') ||
      combined.includes('test coverage') ||
      combined.includes('quality assurance') ||
      combined.includes('testing')
    ) {
      return 'QA Engineer';
    }

    // Developer (Author) patterns
    if (
      combined.includes('developer (author)') ||
      combined.includes('actual time') ||
      combined.includes('implementation approach') ||
      combined.includes('spent about')
    ) {
      return 'Developer (Author)';
    }

    // Senior Architect patterns
    if (
      combined.includes('senior architect') ||
      combined.includes('architect') ||
      combined.includes('code complexity') ||
      combined.includes('technical debt') ||
      combined.includes('architectural')
    ) {
      return 'Senior Architect';
    }

    // Developer Reviewer patterns
    if (
      combined.includes('developer reviewer') ||
      combined.includes('code reviewer') ||
      combined.includes('code quality') ||
      combined.includes('refactoring') ||
      combined.includes('looking at the code')
    ) {
      return 'Developer Reviewer';
    }

    return `Agent ${idx + 1}`;
  };

  // Generate agent discussion cards
  const agentCardsHtml = discussionAgents
    .map((agent, idx) => {
      const agentName = detectAgentName(agent, idx);
      const iconMap: Record<string, string> = {
        'Business Analyst': '👔',
        'QA Engineer': '🧪',
        'Developer (Author)': '',
        'Senior Architect': '🏛️',
        'Developer Reviewer': '👨‍💻',
      };
      const icon = iconMap[agentName] || '🤖';
      const colorMap: Record<string, string> = {
        'Business Analyst': 'info',
        'QA Engineer': 'warning',
        'Developer (Author)': 'success',
        'Senior Architect': 'primary',
        'Developer Reviewer': 'secondary',
      };
      const color = colorMap[agentName] || 'secondary';

      const summary = agent.summary || 'No summary provided';
      const details = agent.details || 'No details provided';

      // Format details with proper line breaks and markdown-like formatting
      const formattedDetails = details
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') // Bold
        .replace(/\*(.*?)\*/g, '<em>$1</em>') // Italic
        .replace(/\n/g, '<br>') // Line breaks
        .replace(/^(\d+\.\s)/gm, '<br>$1'); // Numbered lists

      return `
      <div class="card mb-4 shadow-sm border-${color}">
        <div class="card-header bg-${color} text-white">
          <h5 class="mb-0">
            <span class="me-2" style="font-size: 1.5rem;">${icon}</span>
            ${agentName}
          </h5>
        </div>
        <div class="card-body">
          <h6 class="text-${color} mb-3">📋 Summary</h6>
          <p class="lead">${summary}</p>
          
          <h6 class="text-${color} mb-3 mt-4">📝 Detailed Analysis</h6>
          <div class="details-content">${formattedDetails}</div>
        </div>
      </div>
    `;
    })
    .join('\n');

  // Aggregate all metrics from all agents
  const allMetrics: Record<string, number> = {};
  discussionAgents.forEach((agent) => {
    if (agent.metrics) {
      Object.assign(allMetrics, agent.metrics);
    }
  });

  // Generate metrics summary table
  let metricsHtml = '';
  if (Object.keys(allMetrics).length > 0) {
    const metricsRows = Object.entries(allMetrics)
      .map(([key, value]) => {
        const label = key
          .replace(/([A-Z])/g, ' $1')
          .replace(/^./, (str) => str.toUpperCase())
          .trim();

        // Color code metrics based on value
        let badge = 'secondary';
        if (typeof value === 'number') {
          // Standard scales (higher is better)
          if (
            key.toLowerCase().includes('quality') ||
            key.toLowerCase().includes('coverage') ||
            key.toLowerCase().includes('impact')
          ) {
            badge = value >= 7 ? 'success' : value >= 4 ? 'warning' : 'danger';
          }
          // Inverted scale (lower is better) - Code Complexity
          else if (key.toLowerCase().includes('complexity')) {
            badge = value <= 3 ? 'success' : value <= 6 ? 'warning' : 'danger';
          }
          // Technical debt (negative is good, positive is bad)
          else if (key.toLowerCase().includes('debt')) {
            badge = value <= 0 ? 'success' : value <= 4 ? 'warning' : 'danger';
          }
        }

        return `
          <tr>
            <td><strong>${label}</strong></td>
            <td><span class="badge bg-${badge} rounded-pill">${value}</span></td>
          </tr>
        `;
      })
      .join('');

    metricsHtml = `
      <div class="card mb-4 shadow-sm border-info">
        <div class="card-header bg-info text-white">
          <h5 class="mb-0">
            <span class="me-2" style="font-size: 1.5rem;">📊</span>
            Evaluation Metrics (7 Pillars)
          </h5>
        </div>
        <div class="card-body">
          <table class="table table-hover">
            <thead>
              <tr>
                <th>Metric</th>
                <th>Score</th>
              </tr>
            </thead>
            <tbody>
              ${metricsRows}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Commit Evaluation Report</title>
  <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
  <style>
    body {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      padding: 40px 0;
    }
    .report-container {
      max-width: 1200px;
      margin: 0 auto;
      background: #fff;
      border-radius: 20px;
      box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
      padding: 40px;
    }
    .report-header {
      text-align: center;
      margin-bottom: 40px;
      padding-bottom: 30px;
      border-bottom: 3px solid #667eea;
    }
    .report-header h1 {
      color: #2c3e50;
      font-weight: 700;
      margin-bottom: 10px;
    }
    .report-header .subtitle {
      color: #6c757d;
      font-size: 1.1rem;
    }
    .details-content {
      line-height: 1.8;
      color: #444;
    }
    .card {
      border-radius: 12px;
      transition: transform 0.2s;
    }
    .card:hover {
      transform: translateY(-5px);
    }
    .card-header {
      border-radius: 12px 12px 0 0 !important;
      padding: 20px;
    }
    .table {
      margin-bottom: 0;
    }
    .badge {
      font-size: 1rem;
      padding: 8px 16px;
    }
    @media print {
      body {
        background: white;
        padding: 0;
      }
      .report-container {
        box-shadow: none;
        padding: 20px;
      }
      .card {
        page-break-inside: avoid;
      }
    }
  </style>
</head>
<body>
  <div class="report-container">
    <div class="report-header">
      <h1>🔍 Commit Evaluation Report</h1>
      <p class="subtitle">AI-Powered Multi-Agent Code Review</p>
      ${metadata?.commitHash ? `<div class="badge bg-secondary mb-2">Commit: ${metadata.commitHash}</div>` : ''}
      <small class="text-muted">Generated on ${metadata?.timestamp || new Date().toLocaleString()}</small>
    </div>

    <div class="alert alert-info mb-4" role="alert">
      <h5 class="alert-heading">📢 Discussion Summary</h5>
      <p class="mb-0">
        This report shows insights from ${discussionAgents.length} specialized AI agents who reviewed your commit.
        Each agent provides a unique perspective on code quality, implementation, and testing.
      </p>
    </div>

    <h2 class="mb-4 text-primary">💬 Agent Discussions</h2>
    ${agentCardsHtml}

    ${metricsHtml}

    <div class="text-center mt-5 pt-4 border-top">
      <small class="text-muted">
        Generated by <strong>Commit Evaluator</strong> using LangGraph workflows
      </small>
    </div>
  </div>

  <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>
</body>
</html>`;

  fs.writeFileSync(outputPath, html, 'utf-8');
}
