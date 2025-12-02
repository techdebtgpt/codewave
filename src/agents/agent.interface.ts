export interface Agent {
  getMetadata(): AgentMetadata;
  canExecute(context: AgentContext): Promise<boolean>;
  execute(context: AgentContext, options?: AgentExecutionOptions): Promise<AgentResult>;
}

export interface AgentMetadata {
  name: string; // Technical key (e.g., 'business-analyst', 'developer-reviewer')
  description: string; // Full description of what the agent evaluates
  role: string; // Display name (e.g., 'Business Analyst', 'Developer Reviewer')
  roleDescription: string; // Perspective description (e.g., 'business perspective', 'code quality perspective')
}

export interface AgentContext {
  commitDiff: string;
  filesChanged: string[];
  commitMessage?: string; // Original commit message
  developerOverview?: string; // Developer's description of changes (auto-generated or provided)
  agentResults?: AgentResult[]; // Previous agent responses for conversation
  conversationHistory?: import('../types/agent.types').ConversationMessage[]; // Full conversation log
  vectorStore?: import('../services/diff-vector-store.service').DiffVectorStoreService; // RAG support for large diffs
  documentationStore?: import('../services/documentation-vector-store.service').DocumentationVectorStoreService; // Global repository documentation RAG

  // Multi-round conversation tracking
  currentRound?: number; // Current round number (0-indexed)
  isFinalRound?: boolean; // Flag indicating if this is the final round

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
  round?: number; // Round number in which this result was produced (0-indexed)
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

  // LLM-generated concerns (replaces static gaps)
  // Agents dynamically raise concerns about metrics that need validation
  concerns?: string[]; // Concerns raised by agent in this round (e.g., "Need clarity on test coverage scope")
  addressedConcerns?: {
    // Tracks which previous concerns were addressed in this round
    fromAgentName: string; // Which agent raised the concern
    concern: string; // The original concern
    addressed: boolean; // Whether agent addressed this concern
    explanation?: string; // How the concern was addressed or why it wasn't
  }[];

  // Agent opt-out mechanism for subsequent rounds
  shouldParticipateInNextRound?: boolean; // If false, agent will not participate in future rounds (default: true)
  confidenceLevel?: number; // Agent's confidence in their current analysis (0-100, optional)

  // Final synthesis (only present in last round)
  finalSynthesis?: {
    summary: string; // Consolidated summary across all rounds
    details: string; // Full analysis incorporating insights from all rounds
    metrics: Record<string, any>; // Final metric scores from last round
    unresolvedConcerns: string[]; // Only concerns that remain unclear/unresolved for this agent
    evolutionNotes: string; // How the agent's analysis evolved across rounds
  };
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
