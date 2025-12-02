// src/formatters/conversation-transcript-formatter.ts
// Generates a markdown transcript of the multi-agent conversation
import fs from 'fs';
import { AgentResult } from '../agents/agent.interface';

interface ConversationTurn {
  round: number;
  agentName: string;
  icon: string;
  summary: string;
  details: string;
  metrics?: Record<string, number>;
  referencesTo: string[];
}

/**
 * Map agent role descriptions to short display names
 */
const AGENT_NAME_MAP: Record<string, string> = {
  'Evaluates business value, functional impact, and estimates ideal implementation time':
    'Business Analyst',
  'Evaluates test coverage, identifies testing gaps, and assesses quality assurance': 'QA Engineer',
  'Explains implementation decisions, trade-offs, and estimates actual time spent':
    'Developer Author',
  'Evaluates architecture, design patterns, code complexity, and technical debt':
    'Senior Architect',
  'Reviews code quality, suggests improvements, and evaluates implementation details':
    'Developer Reviewer',
};

/**
 * Detect agent name from result metadata or content
 */
function detectAgentName(result: AgentResult): string {
  // Prefer agent name from orchestrator if available
  if (result.agentName) {
    // Map long descriptions to short names
    return AGENT_NAME_MAP[result.agentName] || result.agentName;
  }

  // Fallback to content-based detection
  const summary = result.summary?.toLowerCase() || '';
  const details = result.details?.toLowerCase() || '';
  const combined = summary + ' ' + details;

  if (combined.includes('business analyst') || combined.includes('functional impact')) {
    return 'Business Analyst';
  }
  if (combined.includes('qa engineer') || combined.includes('test coverage')) {
    return 'QA Engineer';
  }
  if (combined.includes('developer author') || combined.includes('actual time')) {
    return 'Developer Author';
  }
  if (combined.includes('senior architect') || combined.includes('code complexity')) {
    return 'Senior Architect';
  }
  if (combined.includes('developer reviewer') || combined.includes('code quality')) {
    return 'Developer Reviewer';
  }
  return 'Unknown Agent';
}

/**
 * Extract references to other agents
 */
function extractReferences(text: string): string[] {
  const agentNames = [
    'Business Analyst',
    'QA Engineer',
    'Developer Author',
    'Senior Architect',
    'Developer Reviewer',
  ];
  const references: string[] = [];

  agentNames.forEach((name) => {
    if (text.toLowerCase().includes(name.toLowerCase())) {
      references.push(name);
    }
  });

  return [...new Set(references)];
}

/**
 * Group results by round and detect agent names
 */
function groupByRound(results: AgentResult[]): Map<number, ConversationTurn[]> {
  const agentOccurrences = new Map<string, number>();
  const rounds = new Map<number, ConversationTurn[]>();

  const iconMap: Record<string, string> = {
    'Business Analyst': '👔',
    'QA Engineer': '🧪',
    'Developer Author': '👨‍💻',
    'Senior Architect': '🏛️',
    'Developer Reviewer': '💻',
  };

  results.forEach((result) => {
    const agentName = detectAgentName(result);
    const occurrenceCount = (agentOccurrences.get(agentName) || 0) + 1;
    agentOccurrences.set(agentName, occurrenceCount);

    const round = occurrenceCount;
    const text = (result.summary || '') + ' ' + (result.details || '');
    const references = extractReferences(text).filter((ref) => ref !== agentName);

    const turn: ConversationTurn = {
      round,
      agentName,
      icon: iconMap[agentName] || '🤖',
      summary: result.summary || '',
      details: result.details || '',
      metrics: result.metrics,
      referencesTo: references,
    };

    if (!rounds.has(round)) {
      rounds.set(round, []);
    }
    rounds.get(round)!.push(turn);
  });

  return rounds;
}

/**
 * Generate a markdown conversation transcript
 */
export function generateConversationTranscript(
  results: AgentResult[],
  outputPath: string,
  metadata?: { commitHash?: string; timestamp?: string }
): void {
  const roundsMap = groupByRound(results);
  const maxRound = Math.max(...Array.from(roundsMap.keys()));

  let markdown = `# Commit Evaluation Conversation Transcript\n\n`;

  if (metadata?.commitHash) {
    markdown += `**Commit**: \`${metadata.commitHash}\`\n\n`;
  }
  if (metadata?.timestamp) {
    markdown += `**Generated**: ${metadata.timestamp}\n\n`;
  }

  markdown += `---\n\n`;
  markdown += `## Summary\n\n`;
  markdown += `This transcript shows the conversation between ${new Set(results.map(detectAgentName)).size} AI agents `;
  markdown += `across ${maxRound} rounds of discussion about the commit.\n\n`;

  // Generate transcript by round
  for (let round = 1; round <= maxRound; round++) {
    const turns = roundsMap.get(round) || [];
    if (turns.length === 0) continue;

    markdown += `---\n\n`;
    markdown += `## 🔄 Round ${round}\n\n`;

    if (round === 1) {
      markdown += `*Initial analysis: Each agent independently reviews the commit.*\n\n`;
    } else {
      markdown += `*Refinement: Agents respond to each other's concerns and build consensus.*\n\n`;
    }

    turns.forEach((turn) => {
      markdown += `### ${turn.icon} ${turn.agentName}\n\n`;

      if (turn.referencesTo.length > 0) {
        markdown += `> 💬 *References: ${turn.referencesTo.join(', ')}*\n\n`;
      }

      markdown += `**Summary:**\n\n`;
      markdown += `${turn.summary}\n\n`;

      if (turn.details && turn.details !== turn.summary) {
        markdown += `<details>\n`;
        markdown += `<summary><strong>Detailed Analysis</strong> (click to expand)</summary>\n\n`;
        markdown += `${turn.details}\n\n`;
        markdown += `</details>\n\n`;
      }

      if (turn.metrics && Object.keys(turn.metrics).length > 0) {
        markdown += `**Metrics:**\n\n`;
        Object.entries(turn.metrics).forEach(([key, value]) => {
          const label = key
            .replace(/([A-Z])/g, ' $1')
            .replace(/^./, (str) => str.toUpperCase())
            .trim();
          markdown += `- **${label}**: ${value}\n`;
        });
        markdown += `\n`;
      }
    });
  }

  // Generate metrics evolution section
  markdown += `---\n\n`;
  markdown += `## 📊 Metric Evolution\n\n`;

  // Use dynamic round tracking - group by AGENT + METRIC
  const allMetrics = new Map<string, Record<string, any>>();

  for (let round = 1; round <= maxRound; round++) {
    const turns = roundsMap.get(round) || [];
    turns.forEach((turn) => {
      if (turn.metrics) {
        Object.entries(turn.metrics).forEach(([metric, value]) => {
          // Create unique key per agent+metric combination
          const key = `${turn.agentName}::${metric}`;
          if (!allMetrics.has(key)) {
            allMetrics.set(key, { agent: turn.agentName, metric });
          }
          const metricData = allMetrics.get(key)!;
          metricData[`round${round}`] = value;
        });
      }
    });
  }

  if (allMetrics.size > 0) {
    // Determine max rounds dynamically
    const maxRound = Math.max(...Array.from(roundsMap.keys()));

    // Build dynamic header
    const roundHeaders = Array.from({ length: maxRound }, (_, i) => `Round ${i + 1}`);
    markdown += `| Metric | Agent | ${roundHeaders.join(' | ')} | Change |\n`;
    markdown += `|--------|-------|${roundHeaders.map(() => '---------').join('|')}|--------|\n`;

    allMetrics.forEach((data) => {
      const metricName = data.metric;
      const label = metricName
        .replace(/([A-Z])/g, ' $1')
        .replace(/^./, (str: string) => str.toUpperCase())
        .trim();

      // Build round values dynamically
      const roundValues: (number | null | undefined)[] = [];
      for (let round = 1; round <= maxRound; round++) {
        const roundKey = `round${round}` as keyof typeof data;
        roundValues.push(data[roundKey] as number | null | undefined);
      }

      const roundCells = roundValues.map((val) =>
        val !== undefined && val !== null ? val.toString() : '-'
      );

      // Calculate change between first and last round
      const firstValue = roundValues.find((v) => v !== undefined && v !== null);
      const lastValue = [...roundValues].reverse().find((v) => v !== undefined && v !== null);

      let change = '-';
      if (
        firstValue !== undefined &&
        firstValue !== null &&
        lastValue !== undefined &&
        lastValue !== null
      ) {
        const diff = lastValue - firstValue;
        if (diff > 0) {
          change = `↑ ${diff.toFixed(2)}`;
        } else if (diff < 0) {
          change = `↓ ${Math.abs(diff).toFixed(2)}`;
        } else {
          change = 'No change';
        }
      }

      markdown += `| ${label} | ${data.agent} | ${roundCells.join(' | ')} | ${change} |\n`;
    });

    markdown += `\n`;
  } else {
    markdown += `*No metrics tracked across rounds.*\n\n`;
  }

  // Generate final synthesis section (if available from last round)
  markdown += `---\n\n`;
  markdown += `## 🎯 Final Synthesis\n\n`;
  markdown += `*Each agent's comprehensive evaluation incorporating all rounds of discussion.*\n\n`;

  let hasFinalSynthesis = false;
  roundsMap.forEach((turns) => {
    turns.forEach((turn) => {
      // Look for finalSynthesis in the original results
      const originalResult = results.find(
        (r) => detectAgentName(r) === turn.agentName && r.finalSynthesis
      );

      if (originalResult?.finalSynthesis) {
        hasFinalSynthesis = true;
        const fs = originalResult.finalSynthesis;

        markdown += `### ${turn.icon} ${turn.agentName} - Consolidated Assessment\n\n`;
        markdown += `**Summary:**\n\n`;
        markdown += `${fs.summary}\n\n`;

        if (fs.details && fs.details !== fs.summary) {
          markdown += `<details>\n`;
          markdown += `<summary><strong>Complete Analysis</strong> (click to expand)</summary>\n\n`;
          markdown += `${fs.details}\n\n`;
          markdown += `</details>\n\n`;
        }

        if (fs.metrics && Object.keys(fs.metrics).length > 0) {
          markdown += `**Final Metric Scores:**\n\n`;
          Object.entries(fs.metrics).forEach(([key, value]) => {
            const label = key
              .replace(/([A-Z])/g, ' $1')
              .replace(/^./, (str) => str.toUpperCase())
              .trim();
            markdown += `- **${label}**: ${value}\n`;
          });
          markdown += `\n`;
        }

        if (fs.unresolvedConcerns && fs.unresolvedConcerns.length > 0) {
          markdown += `**Unresolved Concerns:**\n\n`;
          fs.unresolvedConcerns.forEach((concern) => {
            markdown += `- ⚠️ ${concern}\n`;
          });
          markdown += `\n`;
        }

        if (fs.evolutionNotes) {
          markdown += `**Evolution Notes:**\n\n`;
          markdown += `> ${fs.evolutionNotes}\n\n`;
        }

        markdown += `---\n\n`;
      }
    });
  });

  if (!hasFinalSynthesis) {
    markdown += `*No final synthesis available. This section appears when agents complete their final round with comprehensive evaluations.*\n\n`;
  }

  // Generate conversation insights
  markdown += `---\n\n`;
  markdown += `## 💡 Conversation Insights\n\n`;

  // Count references
  const referenceCounts = new Map<string, number>();
  roundsMap.forEach((turns) => {
    turns.forEach((turn) => {
      turn.referencesTo.forEach((ref) => {
        referenceCounts.set(ref, (referenceCounts.get(ref) || 0) + 1);
      });
    });
  });

  if (referenceCounts.size > 0) {
    markdown += `### Most Referenced Agents\n\n`;
    const sortedRefs = Array.from(referenceCounts.entries()).sort((a, b) => b[1] - a[1]);

    sortedRefs.forEach(([agent, count]) => {
      markdown += `- **${agent}**: Referenced ${count} time${count > 1 ? 's' : ''}\n`;
    });
    markdown += `\n`;
  }

  // Count metric changes
  const changedMetrics = Array.from(allMetrics.entries()).filter(
    ([_, data]) =>
      data.round1 !== undefined && data.round2 !== undefined && data.round1 !== data.round2
  );

  if (changedMetrics.length > 0) {
    markdown += `### Metrics That Changed\n\n`;
    markdown += `${changedMetrics.length} metric${changedMetrics.length > 1 ? 's' : ''} changed between rounds:\n\n`;
    changedMetrics.forEach(([, data]) => {
      // Format: "Agent Name - Metric Name"
      const metricLabel = data.metric
        .replace(/([A-Z])/g, ' $1')
        .replace(/^./, (str: string) => str.toUpperCase())
        .trim();
      markdown += `- **${data.agent} - ${metricLabel}**: ${data.round1} → ${data.round2}\n`;
    });
    markdown += `\n`;
  }

  markdown += `---\n\n`;
  markdown += `*Generated by Commit Evaluator with LangGraph Multi-Agent System*\n`;

  fs.writeFileSync(outputPath, markdown, 'utf-8');
}
