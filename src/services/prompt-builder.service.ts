// src/services/prompt-builder.service.ts
// Centralized prompt building for consistent agent communication

import {
  SEVEN_PILLARS,
  AgentWeights,
  AGENT_EXPERTISE_WEIGHTS,
} from '../constants/agent-weights.constants';
import { DEPTH_MODE_CONFIGS } from '../config/depth-modes.constants';
import {
  AGENT_METRIC_DEFINITIONS,
  MetricGuidelinesSet,
} from '../constants/agent-metric-definitions.constants';

export interface AgentPromptConfig {
  role: string; // e.g., "Developer Author", "Senior Architect"
  description: string; // DETAILED role description explaining context, responsibilities, and expertise
  roleDetailedDescription?: string; // Optional detailed description (overrides default if provided)
  agentKey: string; // Technical key (e.g., 'developer-author', 'senior-architect') - used to derive metrics from AGENT_EXPERTISE_WEIGHTS
}

export interface MetricDefinition {
  name: string;
  displayName: string;
  definition: string;
  examples: string;
  weight?: string; // e.g., "PRIMARY (45.5%)", "SECONDARY (16.7%)"
}

/**
 * Centralized service for building consistent agent prompts
 * Ensures all agents follow the same rules and structure
 * Makes it easy to extend with new agents
 *
 * NOTE: Metric definitions now derive from the centralized AGENT_METRIC_DEFINITIONS
 * which is the single source of truth. This service transforms them for display purposes.
 */
export class PromptBuilderService {
  /**
   * Get the metric definitions for an agent based on their expertise
   * Transforms centralized agent metrics into display format with weights
   */
  static getMetricDefinitions(agentKey: string): Record<string, MetricDefinition> {
    const weights = AGENT_EXPERTISE_WEIGHTS[agentKey];
    if (!weights) {
      throw new Error(`Unknown agent: ${agentKey}`);
    }

    // Transform centralized agent metrics into display format
    const definitions: Record<string, MetricDefinition> = {};

    for (const pillar of SEVEN_PILLARS) {
      const agentMetric = AGENT_METRIC_DEFINITIONS[pillar];
      if (!agentMetric) {
        throw new Error(`Metric definition not found for pillar: ${pillar}`);
      }

      definitions[pillar] = {
        name: pillar,
        displayName: agentMetric.name,
        definition: agentMetric.description,
        examples: this.extractExamples(agentMetric),
        weight: this.getWeightLabel(weights[pillar as keyof AgentWeights] || 0),
      };
    }

    return definitions;
  }

  /**
   * Extract simplified examples from detailed score-level guidelines
   * Converts detailed guidelines into readable one-liner examples
   */
  private static extractExamples(metric: MetricGuidelinesSet): string {
    const guidelines = metric.guidelines;
    const examples: string[] = [];

    // Extract high, medium, and low examples
    const scores = Object.keys(guidelines).sort().reverse();
    if (scores.length >= 3) {
      // High score
      examples.push(guidelines[scores[0]].split(':')[1]?.trim() || 'High quality');
      // Medium score
      examples.push(guidelines[scores[Math.floor(scores.length / 2)]].split(':')[1]?.trim() || 'Moderate');
      // Low score
      examples.push(guidelines[scores[scores.length - 1]].split(':')[1]?.trim() || 'Low quality');
    } else {
      // Fallback: show first description line only
      examples.push(metric.description);
    }

    return examples.filter(Boolean).join('\n');
  }

  /**
   * Get weight label for a metric (e.g., "PRIMARY (45.5%)")
   */
  private static getWeightLabel(weight: number): string {
    const percent = (weight * 100).toFixed(1);
    if (weight >= 0.4) {
      return `PRIMARY (${percent}%)`;
    } else if (weight >= 0.15) {
      return `SECONDARY (${percent}%)`;
    } else {
      return `TERTIARY (${percent}%)`;
    }
  }

  /**
   * Build system prompt header with detailed role context
   */
  static buildSystemPromptHeader(config: AgentPromptConfig): string {
    // Use roleDetailedDescription if provided, otherwise use the description field
    const roleDescription = config.roleDetailedDescription || config.description;
    return [
      `# Role: ${config.role}`,
      '',
      roleDescription,
      '',
      `Your task in this code review discussion is to evaluate the commit across ALL 7 pillars, with special focus on your PRIMARY expertise: ${this.getPrimaryMetricsText(config.agentKey)}.`,
      '',
    ].join('\n');
  }

  /**
   * Build round-specific instructions
   */
  static buildRoundInstructions(
    currentRound: number = 0,
    isFinalRound: boolean = false
  ): string {
    if (currentRound === 0) {
      return '## Round 1: Initial Analysis\nProvide your independent assessment based on the code changes.';
    } else if (isFinalRound) {
      return `## Round ${currentRound + 1}: Final Review\nProvide your final refined scores with high confidence.`;
    } else {
      return `## Round ${currentRound + 1}: Team Discussion\nReview other agents' scores. Raise questions if there are inconsistencies or concerns.`;
    }
  }

  /**
   * Build scoring philosophy section
   */
  static buildScoringPhilosophy(agentKey: string): string {
    const weights = AGENT_EXPERTISE_WEIGHTS[agentKey];
    if (!weights) {
      throw new Error(`Unknown agent: ${agentKey}`);
    }

    return [
      '## Scoring Philosophy',
      'You will score ALL 7 metrics below. Your expertise determines the weight of your opinion.',
      `Your PRIMARY expertise (⭐) on ${this.getPrimaryMetricsText(agentKey)} carries highest weight in final calculation.`,
      'Your secondary and tertiary opinions provide valuable perspectives.',
      '',
    ].join('\n');
  }

  /**
   * Build metrics section with definitions
   */
  static buildMetricsSection(agentKey: string): string {
    const defs = this.getMetricDefinitions(agentKey);
    const metrics = SEVEN_PILLARS.map((pillar, idx) => {
      const def = defs[pillar];
      return [
        `### ${idx + 1}. ${def.displayName}${idx === 0 ? ' - YOUR PRIMARY EXPERTISE (45.5% weight)' : ''}`,
        `**Definition**: ${def.definition}`,
        `- ${def.examples.replace(/\n/g, '\n- ')}`,
        '',
      ].join('\n');
    });

    return ['## Metrics to Score', '', ...metrics].join('\n');
  }

  /**
   * Build output requirements section
   * @param depthMode Analysis depth mode (fast, normal, deep)
   */
  static buildOutputRequirements(depthMode: 'fast' | 'normal' | 'deep' = 'normal'): string {
    const config = DEPTH_MODE_CONFIGS[depthMode];

    return [
      `## Output Requirements (DEPTH MODE: ${depthMode.toUpperCase()})`,
      '',
      '**You MUST return ONLY valid JSON**:',
      '',
      '{',
      `  "summary": "A conversational 2-3 sentence overview (max ${config.summaryLimit} chars)",`,
      `  "details": "${config.tone} (max ${config.detailsLimit} chars)",`,
      '  "metrics": {',
      this.formatMetricsTemplate(),
      '  }',
      '}',
      '',
      '**CRITICAL: You MUST provide ALL 7 metrics in your response.**',
      '- If you cannot reasonably assess a metric, use `null` (the JSON value, not string)',
      '- Example: `"testCoverage": null` means you cannot assess test coverage',
      '- Do NOT guess or provide arbitrary values - use null if uncertain',
      '- You should strive to assess all metrics, but null is acceptable when truly unable',
      '',
      `TOKEN GUIDANCE: Your token budget allows for ${config.tokenGuidance}. ${depthMode === 'deep' ? 'Use most of your available budget for comprehensive analysis.' : depthMode === 'normal' ? 'Use moderate detail appropriate for balanced analysis.' : 'Keep responses focused and minimal.'}`,
      '',
    ].join('\n');
  }

  /**
   * Build important notes section
   * @param depthMode Analysis depth mode (fast, normal, deep)
   */
  static buildImportantNotes(depthMode: 'fast' | 'normal' | 'deep' = 'normal'): string {
    const config = DEPTH_MODE_CONFIGS[depthMode];

    return [
      '## Important Notes & Token Constraints',
      '- CRITICAL: Return ONLY the JSON object, no markdown, no extra text, no code fences',
      '- CRITICAL: Include ONLY these 7 metrics - no additional fields, no extra metrics',
      '- ALL 7 metrics are required and MUST be present in your response',
      '- Metric values can be:',
      '  - A number (1-10 for scales, hours for time metrics)',
      '  - `null` if you genuinely cannot assess that metric',
      '- Output constraints:',
      `  - Summary field: max ${config.summaryLimit} characters`,
      `  - Details field: max ${config.detailsLimit} characters`,
      `- Analysis approach: ${config.approach}`,
      '- Keep all string values clear and well-structured',
      '- If your response exceeds limits, prioritize keeping all 7 metrics and truncate details field',
      "- Respond to other team members' concerns appropriately for the depth mode",
      '',
    ].join('\n');
  }

  /**
   * Format metrics template for JSON output
   */
  private static formatMetricsTemplate(): string {
    return SEVEN_PILLARS.map((pillar) => {
      const type =
        pillar === 'actualTimeHours' ||
        pillar === 'idealTimeHours' ||
        pillar === 'technicalDebtHours'
          ? '<number in hours>'
          : '<number 1-10>';
      return `    "${pillar}": ${type},`;
    }).join('\n');
  }

  /**
   * Helper: Format list of items
   */
  private static formatList(items: string[]): string {
    if (items.length === 0) return '';
    if (items.length === 1) return items[0];
    return items.slice(0, -1).join(', ') + ', and ' + items[items.length - 1];
  }

  /**
   * Helper: Get primary metrics text
   */
  private static getPrimaryMetricsText(agentKey: string): string {
    const weights = AGENT_EXPERTISE_WEIGHTS[agentKey];
    const primary = SEVEN_PILLARS.filter(
      (pillar) => weights[pillar as keyof typeof weights] >= 0.4
    );
    return this.formatList(primary);
  }

  /**
   * Build complete system prompt
   * @param depthMode Analysis depth mode (fast, normal, deep)
   */
  static buildCompleteSystemPrompt(
    config: AgentPromptConfig,
    currentRound: number = 0,
    isFinalRound: boolean = false,
    previousContext?: string,
    depthMode: 'fast' | 'normal' | 'deep' = 'normal'
  ): string {
    return [
      this.buildSystemPromptHeader(config),
      this.buildRoundInstructions(currentRound, isFinalRound),
      '',
      this.buildScoringPhilosophy(config.agentKey),
      this.buildMetricsSection(config.agentKey),
      this.buildOutputRequirements(depthMode),
      this.buildImportantNotes(depthMode),
      previousContext ? `## Team Discussion So Far\n\n${previousContext}` : '',
    ]
      .filter((s) => s && s.trim())
      .join('\n');
  }
}
