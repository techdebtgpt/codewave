// src/agents/senior-architect-agent.ts
// Senior Architect Agent - Evaluates code complexity and technical debt

import { AppConfig } from '../config/config.interface';
import { BaseAgentWorkflow } from './base-agent-workflow';
import { AgentContext, AgentResult } from './agent.interface';

import { PromptBuilderService } from '../services/prompt-builder.service';
export class SeniorArchitectAgent extends BaseAgentWorkflow {
    private config: AppConfig;

    constructor(config: AppConfig) {
        super();
        this.config = config;
    }

    getMetadata() {
        return {
            name: 'senior-architect',
            description: 'Evaluates architecture, design patterns, code complexity, and technical debt',
            role: 'Senior Architect',
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
                role: 'Senior Architect',
                description: 'Evaluates architecture, design patterns, code complexity, and technical debt',
                roleDetailedDescription: `You are a Senior Architect participating in a code review discussion. Your role is to evaluate the commit across ALL 7 pillars, with special focus on complexity and technical debt. You assess whether the architectural design is sound, identify technical debt introduced or eliminated, and ensure the implementation follows SOLID principles and established design patterns. Your PRIMARY expertise is in evaluating code complexity and technical debt implications.`,
                agentKey: 'senior-architect',
                primaryMetrics: ['codeComplexity', 'technicalDebtHours'],
                secondaryMetrics: ['functionalImpact', 'idealTimeHours', 'testCoverage', 'codeQuality', 'actualTimeHours'],
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

            // Ask architecture-focused questions (optimized for cost)
            const queries = [
                { q: 'What architectural or structural changes exist?', topK: 3 },
                { q: 'Show database schema or data model changes', topK: 2 },
                { q: 'Show complex algorithms or technical debt areas', topK: 2 },
            ];

            const results = await rag.queryMultiple(queries);
            const ragContext = results.map(r => r.results).join('\n\n');

            return [
                developerContextSection,
                '## Architecture Review Request (RAG Mode - Large Diff)',
                '',
                `**Files Changed:** ${filesChanged}`,
                '',
                rag.getSummary(),
                '',
                '**Relevant Code for Architecture Review:**',
                ragContext,
                '',
                'Please provide your analysis scoring ALL 7 metrics based on the relevant code shown above:',
                '1. **Code Complexity** (1-10, lower is better) - YOUR PRIMARY EXPERTISE',
                '2. **Technical Debt Hours** - YOUR PRIMARY EXPERTISE (can be negative)',
                '3. **Functional Impact** (1-10) - your secondary opinion',
                '4. **Ideal Time Hours** - your secondary opinion',
                '5. **Test Coverage** (1-10) - your secondary opinion (testability)',
                '6. **Code Quality** (1-10) - your secondary opinion (architectural quality)',
                '7. **Actual Time Hours** - your secondary estimate',
                '',
                'Focus on your expertise (complexity, debt) but provide scores for all pillars.',
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
                '## Architecture Review - Round 2: Raise Concerns & Questions',
                '',
                `**Files Changed:** ${filesChanged}`,
                '',
                '**Team Discussion (Round 1):**',
                teamContext,
                '',
                '**Your Task:**',
                '1. Review other agents\' scores through architectural lens',
                '2. Raise concerns about complexity implications:',
                '   - Implementation Time → Developer Author (does time reflect complexity?)',
                '   - Code Quality → Developer Reviewer (quality vs complexity tradeoff?)',
                '   - Test Coverage → QA Engineer (are tests adequate for this complexity?)',
                '3. Defend your Complexity and Tech Debt scores if challenged',
                '',
                'Include your refined scores based on team discussion.',
            ].join('\n');
        }

        // Round 3 (Validation): Respond to concerns and finalize
        if (roundPurpose === 'validation' && context.agentResults && context.agentResults.length > 0) {
            const teamContext = context.agentResults
                .map(r => `**${r.agentName}:**\n${r.summary}\n\nMetrics: ${JSON.stringify(r.metrics, null, 2)}`)
                .join('\n\n---\n\n');

            return [
                developerContextSection,
                '## Architecture Review - Round 3: Validation & Final Scores',
                '',
                `**Files Changed:** ${filesChanged}`,
                '',
                '**Team Discussion (Rounds 1-2):**',
                teamContext,
                '',
                '**Your Task:**',
                '1. Address concerns about YOUR Complexity and Technical Debt scores',
                '2. Review agent responses about time, quality, tests',
                '3. Adjust scores if new architectural insights emerge',
                '4. Provide FINAL refined scores for all 7 metrics',
                '',
                'This is the final round - be confident in your architectural assessment.',
            ].join('\n');
        }

        // Fallback to full diff for small commits (no RAG needed)
        return [
            developerContextSection,
            '## Architecture Review Request',
            '',
            `**Files Changed:** ${filesChanged}`,
            '',
            '**Commit Diff:**',
            '```',
            context.commitDiff,
            '```',
            '',
            'Please provide your analysis scoring ALL 7 metrics:',
            '1. **Code Complexity** (1-10, lower is better) - YOUR PRIMARY EXPERTISE',
            '2. **Technical Debt Hours** - YOUR PRIMARY EXPERTISE (can be negative)',
            '3. **Functional Impact** (1-10) - your secondary opinion',
            '4. **Ideal Time Hours** - your secondary opinion',
            '5. **Test Coverage** (1-10) - your secondary opinion (testability)',
            '6. **Code Quality** (1-10) - your secondary opinion (architectural quality)',
            '7. **Actual Time Hours** - your secondary estimate',
            '',
            'Focus on your expertise (complexity, debt) but provide scores for all pillars.',
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
                    console.warn(`Senior Architect: Invalid summary in LLM response`);
                    throw new Error('Missing or invalid summary field');
                }

                // Handle metrics: ensure it's an object with 7 pillars, filter out extras
                let metrics = parsed.metrics || {};

                // If metrics is an array, convert to object
                if (Array.isArray(metrics)) {
                    console.warn(`Senior Architect: Metrics returned as array, converting to object`);
                    metrics = {};
                }

                // Filter metrics to ONLY the 7 pillars
                const filteredMetrics: Record<string, number> = {};
                for (const pillar of SEVEN_PILLARS) {
                    if (pillar in metrics && typeof metrics[pillar] === 'number') {
                        filteredMetrics[pillar] = metrics[pillar];
                    } else {
                        // Use default value if missing
                        filteredMetrics[pillar] = pillar === 'codeComplexity' || pillar === 'functionalImpact' || pillar === 'testCoverage' || pillar === 'codeQuality' ? 5 : 0;
                    }
                }

                return {
                    summary: parsed.summary.trim(),
                    details: (parsed.details || '').trim(),
                    metrics: filteredMetrics,
                };
            } catch (error) {
                console.warn(`Senior Architect: Failed to parse LLM output: ${error instanceof Error ? error.message : String(error)}`);
                console.warn(`Senior Architect: Raw output (first 500 chars): ${output.substring(0, 500)}`);

                // fallback to string summary (if output is long enough)
                if (output.length > 10) {
                    return {
                        summary: output.substring(0, 500),
                        details: '',
                        metrics: {
                            codeComplexity: 5,
                            technicalDebtHours: 0,
                            functionalImpact: 5,
                            idealTimeHours: 0,
                            testCoverage: 5,
                            codeQuality: 5,
                            actualTimeHours: 0,
                        },
                    };
                }

                return {
                    summary: '',
                    details: 'Failed to parse LLM response',
                    metrics: {
                        codeComplexity: 5,
                        technicalDebtHours: 0,
                        functionalImpact: 5,
                        idealTimeHours: 0,
                        testCoverage: 5,
                        codeQuality: 5,
                        actualTimeHours: 0,
                    },
                };
            }
        }
        return super.parseLLMResult(output);
    }

    private detectAgentRole(result: AgentResult): string {
        const combined = (result.summary || '').toLowerCase() + (result.details || '').toLowerCase();
        if (combined.includes('business') || combined.includes('functional')) return 'Business Analyst';
        if (combined.includes('qa') || combined.includes('test')) return 'QA Engineer';
        if (combined.includes('author') || combined.includes('developer')) return 'Developer';
        if (combined.includes('reviewer')) return 'Code Reviewer';
        return 'Team Member';
    }

    /**
     * Self-evaluate analysis completeness from Senior Architect perspective
     * Focus: Complexity assessment and technical debt evaluation accuracy
     */
    protected evaluateAnalysis(result: AgentResult): { clarityScore: number; missingInformation: string[] } {
        const summary = (result.summary || '').toLowerCase();
        const details = (result.details || '').toLowerCase();
        const metrics = result.metrics || {};

        let clarityScore = 50;
        const gaps: string[] = [];

        // Check if complexity is well-justified
        if (typeof metrics.codeComplexity === 'number') {
            const hasComplexityJustification = summary.includes('complex') || details.includes('simple') || details.includes('logic') || details.includes('interdepend');
            if (!hasComplexityJustification) {
                gaps.push('Complexity score should be justified with architectural reasoning');
            } else {
                clarityScore += 12;
            }
        } else {
            gaps.push('Code complexity score is missing');
        }

        // Check if technical debt is clearly assessed
        if (typeof metrics.technicalDebtHours === 'number') {
            const hasDebtAnalysis = details.includes('debt') || details.includes('shortcut') || details.includes('technical') || details.includes('maintainability');
            if (!hasDebtAnalysis) {
                gaps.push('Technical debt assessment should explain what debt was introduced or eliminated');
            } else {
                clarityScore += 12;
            }
        } else {
            gaps.push('Technical debt hours score is missing');
        }

        // Check if architecture patterns are discussed
        if (summary.length > 100 && details.length > 250) {
            const hasPatterns = details.includes('pattern') || details.includes('design') || details.includes('architecture') || details.includes('principle');
            if (!hasPatterns) {
                gaps.push('Architectural assessment should mention design patterns or SOLID principles');
            } else {
                clarityScore += 12;
            }
        }

        // Check all required metrics are present
        const requiredMetrics = ['codeComplexity', 'technicalDebtHours', 'functionalImpact', 'idealTimeHours', 'testCoverage', 'codeQuality', 'actualTimeHours'];
        const missingMetrics = requiredMetrics.filter(m => !(m in metrics));
        if (missingMetrics.length > 0) {
            gaps.push(`Missing metric scores: ${missingMetrics.join(', ')}`);
        } else {
            clarityScore += 8;
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
     * Generate self-questions for refinement from Senior Architect perspective
     */
    protected generateSelfQuestions(result: AgentResult, gaps: string[]): string[] {
        const questions: string[] = [];

        // Ask about complexity justification
        if (gaps.some(g => g.includes('complexity'))) {
            questions.push('Can I better explain the architectural drivers of complexity and interdependencies?');
        }

        // Ask about technical debt details
        if (gaps.some(g => g.includes('debt'))) {
            questions.push('What specific technical debt was introduced, and what are the long-term maintenance implications?');
        }

        // Ask about design patterns
        if (gaps.some(g => g.includes('pattern') || g.includes('design'))) {
            questions.push('How well does this implementation align with SOLID principles and established design patterns?');
        }

        // Ask about maintainability
        if (gaps.some(g => g.includes('maintainability'))) {
            questions.push('From an architecture perspective, how maintainable and extensible is this solution?');
        }

        // Generic refinement question
        if (questions.length === 0 && gaps.length > 0) {
            questions.push('How can I provide more rigorous architectural assessment of this change?');
        }

        return questions;
    }
}
