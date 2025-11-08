export interface Agent {
    getMetadata(): AgentMetadata;
    canExecute(context: AgentContext): Promise<boolean>;
    estimateTokens(context: AgentContext): Promise<number>;
    execute(context: AgentContext, options?: AgentExecutionOptions): Promise<AgentResult>;
}

export interface AgentMetadata {
    name: string;
    description: string;
    role: string;
}

export interface AgentContext {
    commitDiff: string;
    filesChanged: string[];
    commitMessage?: string; // Original commit message
    developerOverview?: string; // Developer's description of changes (auto-generated or provided)
    agentResults?: AgentResult[]; // Previous agent responses for conversation
    conversationHistory?: import('../types/agent.types').ConversationMessage[]; // Full conversation log
    vectorStore?: import('../services/diff-vector-store.service').DiffVectorStoreService; // RAG support for large diffs
    roundPurpose?: 'initial' | 'concerns' | 'validation'; // Current discussion phase

    // Batch evaluation metadata (for progress logging)
    commitHash?: string;
    commitIndex?: number;
    totalCommits?: number;

    // Agent depth/iteration configuration (passed from orchestrator)
    depthMode?: 'fast' | 'normal' | 'deep'; // Analysis depth mode
    maxInternalIterations?: number; // Max self-refinement iterations
    internalClarityThreshold?: number; // Clarity target (0-100) for stopping

    [key: string]: any;
}

export interface AgentExecutionOptions {
    [key: string]: any;
}

export interface AgentResult {
    summary: string;
    details?: string;
    metrics?: Record<string, any>;
    agentName?: string; // Agent identifier (set by orchestrator)
    agentRole?: string; // Agent role/description (set by orchestrator)
    tokenUsage?: {
        inputTokens: number;
        outputTokens: number;
        totalTokens: number;
    };

    // Internal iteration/refinement metrics
    internalIterations?: number; // Number of self-refinement iterations performed
    clarityScore?: number; // Final self-evaluation clarity score (0-100)
    refinementNotes?: string[]; // Notes on improvements per iteration
    missingInformation?: string[]; // Information gaps identified (if any)
}

/**
 * Developer Overview: Generated or provided description of changes
 * Used to give all agents shared context about the developer's intent
 */
export interface DeveloperOverview {
    summary: string; // One-line summary of changes
    description: string; // Detailed description of what changed and why
    keyPoints: string[]; // Bullet points of important changes
    testingApproach: string; // How the changes were tested
    generatedAt: string; // ISO timestamp
}
