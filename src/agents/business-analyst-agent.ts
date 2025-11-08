// src/agents/business-analyst-agent.ts
// Business Analyst Agent - Evaluates business value, functional impact, and ideal time estimation

import { AppConfig } from '../config/config.interface';
import { BaseAgentWorkflow } from './base-agent-workflow';
import { AgentContext, AgentResult } from './agent.interface';

import { PromptBuilderService } from '../services/prompt-builder.service';
export class BusinessAnalystAgent extends BaseAgentWorkflow {
    private config: AppConfig;

    constructor(config: AppConfig) {
        super();
        this.config = config;
    }

    getMetadata() {
        return {
            name: 'business-analyst',
            description: 'Evaluates business value, functional impact, and estimates ideal implementation time',
            role: 'Business Analyst',
        };
    }

    async canExecute(context: AgentContext) {
        return !!context.commitDiff;
    }

    async estimateTokens(context: AgentContext) {
        return 2500;
    }

    protected buildSystemPrompt(context: AgentContext): string {
        const roundPurpose = (context.roundPurpose || 'initial') as 'initial' | 'concerns' | 'validation';
        const previousContext =
            context.agentResults && context.agentResults.length > 0
                ? context.agentResults
                    .map((r: AgentResult) => `**${r.agentName}**: ${r.summary}`)
                    .join('\n\n')
                : '';

        return PromptBuilderService.buildCompleteSystemPrompt(
            {
                role: 'Business Analyst',
                description: 'Evaluates business value, functional impact, and estimates ideal implementation time',
                roleDetailedDescription: `You are a Business Analyst participating in a code review discussion. Your role is to evaluate the commit across ALL 7 pillars, with special focus on functional impact and ideal implementation time. You assess how significantly the changes affect end users and business operations, and estimate how long the work should optimally take. You bring the business perspective to technical decisions and ensure alignment with business requirements and user needs.`,
                agentKey: 'business-analyst',
                primaryMetrics: ['functionalImpact', 'idealTimeHours'],
                secondaryMetrics: ['testCoverage'],
            },
            roundPurpose,
            previousContext
        );
    }

    protected async buildHumanPrompt(context: AgentContext): Promise<string> {
        const filesChanged = context.filesChanged?.join(', ') || 'unknown files';

        // Prepare developer overview section if available
        const developerContextSection = context.developerOverview
            ? `${context.developerOverview}\n\n---\n\n`
            : '';

        // Use RAG if available for large diffs (skip in subsequent rounds to save tokens)
        const isFirstRound = !context.agentResults || context.agentResults.length === 0;
        if (context.vectorStore && isFirstRound) {
            const { RAGHelper } = await import('../utils/rag-helper.js');
            const rag = new RAGHelper(context.vectorStore);

            // Ask business-focused questions (optimized for cost)
            const queries = [
                { q: 'What functional changes or user-facing features were modified?', topK: 3 },
                { q: 'Show API or interface changes', topK: 2 },
                { q: 'Show configuration or business rule changes', topK: 2 },
            ];

            const results = await rag.queryMultiple(queries);
            const ragContext = results.map(r => r.results).join('\n\n');

            return [
                developerContextSection,
                '## Commit Analysis Request (RAG Mode - Large Diff)',
                '',
                `**Files Changed:** ${filesChanged}`,
                '',
                rag.getSummary(),
                '',
                '**Relevant Code for Business Analysis:**',
                ragContext,
                '',
                'Please provide your analysis scoring ALL 7 metrics based on the relevant code shown above:',
                '1. **Functional Impact** (1-10) - YOUR PRIMARY EXPERTISE',
                '2. **Ideal Time Hours** - YOUR PRIMARY EXPERTISE',
                '3. **Test Coverage** (1-10) - your secondary opinion',
                '4. **Code Quality** (1-10) - your tertiary opinion',
                '5. **Code Complexity** (1-10, lower is better) - your tertiary opinion',
                '6. **Actual Time Hours** - your tertiary estimate',
                '7. **Technical Debt Hours** - your tertiary assessment',
                '',
                'Focus on your expertise (business value, requirements) but provide scores for all pillars.',
                'Respond conversationally and reference other team members\' points when relevant.',
            ].join('\n');
        }

        // Round 2 (Concerns): Ask questions about other agents' scores
        const roundPurpose = context.roundPurpose || 'initial';
        if (roundPurpose === 'concerns' && context.agentResults && context.agentResults.length > 0) {
            const teamContext = context.agentResults
                .map(r => `**${r.agentName}:**\n${r.summary}\n\nMetrics: ${JSON.stringify(r.metrics, null, 2)}`)
                .join('\n\n---\n\n');

            return [
                developerContextSection,
                '## Business Analysis - Round 2: Raise Concerns & Questions',
                '',
                `**Files Changed:** ${filesChanged}`,
                '',
                '**Team Discussion (Round 1):**',
                teamContext,
                '',
                '**Your Task:**',
                '1. Review other agents\' metrics from Round 1',
                '2. Identify any scores that seem inconsistent with business requirements',
                '3. Raise specific concerns/questions to responsible agents:',
                '   - Test Coverage → QA Engineer',
                '   - Code Quality → Developer Reviewer',
                '   - Code Complexity/Tech Debt → Senior Architect',
                '   - Implementation Time → Developer Author',
                '4. Defend your Functional Impact and Ideal Time estimates if you anticipate questions',
                '',
                'Include your refined scores (can stay the same or adjust based on team context).',
            ].join('\n');
        }

        // Round 3 (Validation): Respond to concerns and finalize
        if (roundPurpose === 'validation' && context.agentResults && context.agentResults.length > 0) {
            const teamContext = context.agentResults
                .map(r => `**${r.agentName}:**\n${r.summary}\n\nMetrics: ${JSON.stringify(r.metrics, null, 2)}`)
                .join('\n\n---\n\n');

            return [
                developerContextSection,
                '## Business Analysis - Round 3: Validation & Final Scores',
                '',
                `**Files Changed:** ${filesChanged}`,
                '',
                '**Team Discussion (Rounds 1-2):**',
                teamContext,
                '',
                '**Your Task:**',
                '1. Address any concerns raised about YOUR Functional Impact and Ideal Time scores',
                '2. Review responses from other agents about their metrics',
                '3. Adjust your secondary/tertiary scores if new evidence convinces you',
                '4. Provide FINAL refined scores for all 7 metrics',
                '',
                'This is the final round - be confident in your assessment.',
            ].join('\n');
        }

        // Fallback to full diff for small commits (no RAG needed)
        return [
            developerContextSection,
            '## Commit Analysis Request',
            '',
            `**Files Changed:** ${filesChanged}`,
            '',
            '**Commit Diff:**',
            '```',
            context.commitDiff,
            '```',
            '',
            'Please provide your analysis scoring ALL 7 metrics:',
            '1. **Functional Impact** (1-10) - YOUR PRIMARY EXPERTISE',
            '2. **Ideal Time Hours** - YOUR PRIMARY EXPERTISE',
            '3. **Test Coverage** (1-10) - your secondary opinion',
            '4. **Code Quality** (1-10) - your tertiary opinion',
            '5. **Code Complexity** (1-10, lower is better) - your tertiary opinion',
            '6. **Actual Time Hours** - your tertiary estimate',
            '7. **Technical Debt Hours** - your tertiary assessment',
            '',
            'Focus on your expertise (business value, requirements) but provide scores for all pillars.',
            'Respond conversationally and reference other team members\' points when relevant.',
        ].join('\n');
    }

    protected parseLLMResult(output: any): AgentResult {
        // Import centralized pillar constants
        const { SEVEN_PILLARS } = require('../constants/agent-weights.constants');

        // Try to parse JSON output from LLM
        if (typeof output === 'string') {
            try {
                // Strip markdown code fences if present
                let cleanOutput = output.trim();
                if (cleanOutput.startsWith('```json') || cleanOutput.startsWith('```')) {
                    cleanOutput = cleanOutput.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
                }

                // Extract JSON object if there's extra content (markdown headers, etc.)
                const jsonMatch = cleanOutput.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    cleanOutput = jsonMatch[0];
                }

                // Try to close incomplete JSON if needed
                let braceCount = (cleanOutput.match(/\{/g) || []).length;
                let closingBraces = (cleanOutput.match(/\}/g) || []).length;
                if (braceCount > closingBraces) {
                    cleanOutput += '}'.repeat(braceCount - closingBraces);
                }

                const parsed = JSON.parse(cleanOutput);

                // Validate required fields
                if (!parsed.summary || typeof parsed.summary !== 'string') {
                    console.warn(`Business Analyst: Invalid summary in LLM response`);
                    throw new Error('Missing or invalid summary field');
                }

                // Handle metrics: ensure it's an object with 7 pillars, filter out extras
                let metrics = parsed.metrics || {};

                // If metrics is an array, convert to object
                if (Array.isArray(metrics)) {
                    console.warn(`Business Analyst: Metrics returned as array, converting to object`);
                    metrics = {};
                }

                // Filter metrics to ONLY the 7 pillars
                const filteredMetrics: Record<string, number> = {};
                for (const pillar of SEVEN_PILLARS) {
                    if (pillar in metrics && typeof metrics[pillar] === 'number') {
                        filteredMetrics[pillar] = metrics[pillar];
                    } else {
                        // Use default value if missing
                        filteredMetrics[pillar] = pillar === 'functionalImpact' || pillar === 'testCoverage' || pillar === 'codeQuality' || pillar === 'codeComplexity' ? 5 : 0;
                    }
                }

                return {
                    summary: parsed.summary.trim(),
                    details: (parsed.details || '').trim(),
                    metrics: filteredMetrics,
                };
            } catch (error) {
                console.warn(`Business Analyst: Failed to parse LLM output: ${error instanceof Error ? error.message : String(error)}`);
                console.warn(`Business Analyst: Raw output (first 500 chars): ${output.substring(0, 500)}`);

                // fallback to string summary (if output is long enough)
                if (output.length > 10) {
                    return {
                        summary: output.substring(0, 500),
                        details: '',
                        metrics: {
                            functionalImpact: 5,
                            idealTimeHours: 0,
                            testCoverage: 5,
                            codeQuality: 5,
                            codeComplexity: 5,
                            actualTimeHours: 0,
                            technicalDebtHours: 0,
                        },
                    };
                }

                return {
                    summary: '',
                    details: 'Failed to parse LLM response',
                    metrics: {
                        functionalImpact: 5,
                        idealTimeHours: 0,
                        testCoverage: 5,
                        codeQuality: 5,
                        codeComplexity: 5,
                        actualTimeHours: 0,
                        technicalDebtHours: 0,
                    },
                };
            }
        }
        return super.parseLLMResult(output);
    }

    private detectAgentRole(result: AgentResult): string {
        const combined = (result.summary || '').toLowerCase() + (result.details || '').toLowerCase();
        if (combined.includes('qa') || combined.includes('test')) return 'QA Engineer';
        if (combined.includes('architect')) return 'Senior Architect';
        if (combined.includes('author') || combined.includes('developer')) return 'Developer';
        if (combined.includes('reviewer')) return 'Code Reviewer';
        return 'Team Member';
    }

    /**
     * Self-evaluate analysis completeness from Business Analyst perspective
     * Focus: Functional impact clarity and ideal time estimates
     */
    protected evaluateAnalysis(result: AgentResult): { clarityScore: number; missingInformation: string[] } {
        const summary = (result.summary || '').toLowerCase();
        const details = (result.details || '').toLowerCase();
        const metrics = result.metrics || {};

        let clarityScore = 50;
        const gaps: string[] = [];

        // Check if functional impact is well-justified
        if (typeof metrics.functionalImpact === 'number') {
            const hasImpactExplanation = summary.includes('impact') || details.includes('user') || details.includes('functionality');
            if (!hasImpactExplanation) {
                gaps.push('Functional impact justification is unclear - which users are affected?');
            } else {
                clarityScore += 10;
            }
        } else {
            gaps.push('Functional impact score is missing');
        }

        // Check if ideal time is justified with complexity context
        if (typeof metrics.idealTimeHours === 'number' && metrics.idealTimeHours > 0) {
            const hasTimeJustification = details.includes('hour') || details.includes('time') || details.includes('complexity');
            if (!hasTimeJustification) {
                gaps.push('Ideal time estimate lacks clear reasoning or complexity context');
            } else {
                clarityScore += 10;
            }
        } else {
            gaps.push('Ideal time hours is missing or zero - clarify effort expectations');
        }

        // Check if business value is articulated
        if (summary.length > 100 && details.length > 200) {
            const hasBizValue = details.includes('business') || details.includes('value') || details.includes('benefit') || details.includes('requirements');
            if (!hasBizValue) {
                gaps.push('Business value and requirements impact should be more explicit');
            } else {
                clarityScore += 15;
            }
        }

        // Check all required metrics are present
        const requiredMetrics = ['functionalImpact', 'idealTimeHours', 'testCoverage', 'codeQuality', 'codeComplexity', 'actualTimeHours', 'technicalDebtHours'];
        const missingMetrics = requiredMetrics.filter(m => !(m in metrics));
        if (missingMetrics.length > 0) {
            gaps.push(`Missing metric scores: ${missingMetrics.join(', ')}`);
        } else {
            clarityScore += 10;
        }

        // Bonus for comprehensive analysis
        if (details.length > 400) {
            clarityScore += 15;
        }

        return {
            clarityScore: Math.min(100, clarityScore),
            missingInformation: gaps,
        };
    }

    /**
     * Generate self-questions for refinement from Business Analyst perspective
     */
    protected generateSelfQuestions(result: AgentResult, gaps: string[]): string[] {
        const questions: string[] = [];

        // Always ask about functional impact details
        if (gaps.some(g => g.includes('impact'))) {
            questions.push('Can I better explain which specific user workflows or business processes this change affects?');
        }

        // Ask about time estimation rationale
        if (gaps.some(g => g.includes('time'))) {
            questions.push('Should I provide more detailed time breakdown (requirements gathering, design, testing, deployment)?');
        }

        // Ask about business value
        if (gaps.some(g => g.includes('value'))) {
            questions.push('What is the specific business value or ROI of this change for the organization?');
        }

        // Generic refinement question
        if (questions.length === 0 && gaps.length > 0) {
            questions.push('How can I provide more context on the business and functional impact of this change?');
        }

        return questions;
    }
}
