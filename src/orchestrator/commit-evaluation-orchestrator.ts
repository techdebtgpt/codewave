import { AgentRegistry } from '../agents/agent-registry';
import { AgentContext, AgentResult } from '../agents/agent.interface';
import { AppConfig } from '../config/config.interface';
import { createCommitEvaluationGraph } from './commit-evaluation-graph';
import { formatTokenUsage, formatCost } from '../utils/token-tracker';
import { DocumentationVectorStoreService } from '../services/documentation-vector-store.service';

/**
 * Commit Evaluation Orchestrator using LangGraph
 *
 * This orchestrator uses a state-based graph workflow to:
 * 1. Run multiple discussion rounds with agents
 * 2. Pass agent results between rounds for refinement
 * 3. Run metrics aggregation at the end
 * 4. Provide conditional logic for when to stop discussions
 */
export class CommitEvaluationOrchestrator {
  private config: AppConfig;
  private graph: ReturnType<typeof createCommitEvaluationGraph>;
  private lastDeveloperOverview?: string; // Store for external access
  private documentationStore?: DocumentationVectorStoreService; // Global documentation store (shared across commits)

  constructor(
    private readonly agentRegistry: AgentRegistry,
    config: AppConfig
  ) {
    this.config = config;

    // Configure LangSmith tracing if enabled (same as architecture-doc-generator)
    if (config.tracing.enabled && config.tracing.apiKey) {
      process.env.LANGCHAIN_TRACING_V2 = 'true';
      process.env.LANGCHAIN_API_KEY = config.tracing.apiKey;
      process.env.LANGCHAIN_PROJECT = config.tracing.project;
      process.env.LANGCHAIN_ENDPOINT = config.tracing.endpoint;

      console.log(`🔍 LangSmith tracing enabled: ${config.tracing.project}`);
    }

    // Compile the LangGraph workflow
    this.graph = createCommitEvaluationGraph(agentRegistry, config);

    // Initialize global documentation vector store if enabled (fire and forget - happens in background)
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    this.initializeDocumentationStore();
  }

  /**
   * Initialize documentation vector store (called once at orchestrator startup)
   * Loads markdown files from repository and builds embeddings
   * This runs asynchronously in the background and is not awaited in constructor
   */
  private async initializeDocumentationStore(): Promise<void> {
    if (!this.config.documentation?.enabled) {
      return;
    }

    try {
      const docConfig = this.config.documentation;
      this.documentationStore = new DocumentationVectorStoreService();

      // Get repository path from process.cwd() or config
      const repoPath = process.cwd();

      // Initialize with default patterns if not specified
      const patterns = docConfig.patterns || ['README.md', 'docs/**/*.md'];
      const excludePatterns = docConfig.excludePatterns || ['node_modules/**', 'dist/**'];
      const chunkSize = docConfig.chunkSize || 1000;

      await this.documentationStore.initialize(
        repoPath,
        patterns,
        excludePatterns,
        chunkSize,
        (progress, current, total) => {
          // Silent progress - don't spam console during initialization
          if (progress === 100) {
            const stats = this.documentationStore!.getStats();
            console.log(
              `📚 Documentation indexed: ${stats.chunksCreated} chunks from ${stats.filesLoaded} files`
            );
          }
        }
      );
    } catch (error) {
      console.warn('⚠️  Failed to initialize documentation store:', error);
      this.documentationStore = undefined;
    }
  }

  /**
   * Get the last generated developer overview
   */
  getDeveloperOverview(): string | undefined {
    return this.lastDeveloperOverview;
  }

  /**
   * Evaluate a commit using LangGraph workflow with streaming support
   * @param context Input context with commitDiff and filesChanged
   * @param options Optional configuration (streaming, thread_id)
   * @returns Object containing agent results and evaluation metadata
   */
  async evaluateCommit(
    context: AgentContext,
    options?: {
      streaming?: boolean;
      threadId?: string;
      onProgress?: (state: any) => void;
      disableTracing?: boolean; // Disable LangSmith tracing (useful for batch runs to enable streaming)
    }
  ): Promise<{ agentResults: AgentResult[]; developerOverview?: string; [key: string]: any }> {
    console.log('\n🚀 Starting commit evaluation with LangGraph workflow...');

    const startTime = Date.now();
    const threadId = options?.threadId || `eval-${Date.now()}`;

    // Initialize RAG vector store for all diffs (always enabled)
    const diffSize = context.commitDiff?.length || 0;
    console.log(
      `📦 Initializing RAG vector store (${(diffSize / 1024).toFixed(1)}KB diff)...`
    );

    const { DiffVectorStoreService } = await import('../services/diff-vector-store.service.js');
    const vectorStore = new DiffVectorStoreService(context.commitHash);

    // Initialize with progress callback
    await vectorStore.initialize(context.commitDiff, (progress, current, total) => {
      if (options?.onProgress) {
        options.onProgress({
          type: 'vectorizing',
          progress,
          current,
          total,
          commitHash: context.commitHash,
        });
      }
    });

    const stats = vectorStore.getStats();
    console.log(
      `   ✅ Indexed ${stats.documentCount} chunks from ${stats.filesChanged} files (+${stats.additions}/-${stats.deletions})`
    );

    // Add vector store to context (agents can use it for RAG queries)
    context.vectorStore = vectorStore;

    // Add global documentation store to context (if initialized)
    if (this.documentationStore) {
      context.documentationStore = this.documentationStore;
    }

    // Initialize graph state
    const initialState = {
      commitDiff: context.commitDiff,
      filesChanged: context.filesChanged || [],
      developerOverview: context.developerOverview, // Include developer overview
      vectorStore: context.vectorStore, // Pass vector store through graph state
      documentationStore: context.documentationStore, // Pass documentation store through graph state
      commitHash: context.commitHash, // NEW: For progress logging
      commitIndex: context.commitIndex, // NEW: For batch progress
      totalCommits: context.totalCommits, // NEW: For batch progress
      currentRound: 0,
      maxRounds: this.config.agents.maxRounds || this.config.agents.retries || 3, // Use maxRounds if set, fallback to retries for backwards compatibility
      minRounds: this.config.agents.minRounds || 2, // Minimum rounds before allowing early convergence (default: 2)
      agentResults: [],
      previousRoundResults: [],
      convergenceScore: undefined,
      converged: false,
      startTime,
      endTime: undefined,
    };

    // Configure for LangSmith tracing
    const commitShortSha = context.commitHash ? context.commitHash.substring(0, 7) : 'unknown';
    const graphConfig = {
      configurable: { thread_id: threadId },
      runName: `CommitEvaluation-${commitShortSha}`,
      metadata: {
        commitHash: context.commitHash,
        commitSize: context.commitDiff?.length || 0,
        filesChanged: context.filesChanged?.length || 0,
      },
    };

    let finalState: any;

    // Check if LangSmith tracing is enabled - if so, disable streaming due to known hanging issue with 1 agent
    // However, if disableTracing is explicitly set, honor that to enable streaming for batch runs
    const langsmithEnabled =
      this.config.tracing.enabled && this.config.tracing.apiKey && !options?.disableTracing;
    const shouldStream = options?.streaming && !langsmithEnabled;

    // Use streaming if enabled AND LangSmith is not tracing (streaming + LangSmith can hang with single agent)
    if (shouldStream) {
      console.log('📡 Streaming enabled - real-time updates');

      try {
        // Stream with values mode to get full state snapshots
        // Note: Adding timeout protection against hanging when only 1 agent is running with LangSmith
        const streamTimeout = setTimeout(() => {
          console.warn('⚠️  Stream timeout detected - falling back to standard invoke');
          throw new Error('Stream iteration timeout');
        }, 120000); // 2 minute timeout for entire stream

        for await (const event of await this.graph.stream(initialState, {
          ...graphConfig,
          streamMode: 'values', // Get full state at each step
        })) {
          clearTimeout(streamTimeout);

          // In 'values' mode, event is the full state
          finalState = event;

          // Emit progress callback if provided
          if (options.onProgress) {
            options.onProgress(event);
          }

          // Log intermediate state updates
          if (event?.currentRound !== undefined) {
            const nodeName = event.currentRound === 0 ? 'START' : 'runAgents';
            console.log(
              `  📊 State update from ${nodeName}: Round ${event.currentRound}/${event.maxRounds}`
            );
          }

          // Reset timeout for next iteration
          streamTimeout.refresh();
        }

        clearTimeout(streamTimeout);
      } catch (streamError) {
        console.warn(`⚠️  Streaming failed: ${streamError instanceof Error ? streamError.message : String(streamError)}`);
        console.log('📡 Streaming disabled - using standard invoke instead');
        // Fall back to standard invoke on any stream error
        finalState = await this.graph.invoke(initialState, graphConfig);
      }
    } else {
      // Only log streaming message if user explicitly requested streaming (not just default)
      // Silent for single evaluate mode where streaming is enabled by default
      // if (langsmithEnabled && options?.streaming) {
      //   console.log('📡 Streaming disabled due to LangSmith integration - using standard invoke');
      // }
      // Standard invoke (non-streaming)
      finalState = await this.graph.invoke(initialState, graphConfig);

      // Call onProgress with final state (since we're not streaming)
      if (options?.onProgress && finalState) {
        options.onProgress(finalState);
      }
    }

    const duration = ((finalState?.endTime || Date.now()) - startTime) / 1000;
    console.log(`\n✅ Evaluation complete in ${duration.toFixed(2)}s`);
    console.log(`   Total agents: ${finalState?.agentResults?.length || 0}`);
    console.log(
      `   Discussion rounds: ${finalState?.currentRound || 0}/${finalState?.maxRounds || 0}`
    );

    if (finalState?.converged) {
      console.log(
        `   🎯 Converged early with ${((finalState.convergenceScore || 0) * 100).toFixed(1)}% similarity`
      );
    }

    // Display token usage and cost
    if (finalState?.totalInputTokens !== undefined && finalState?.totalOutputTokens !== undefined) {
      const totalTokens = finalState.totalInputTokens + finalState.totalOutputTokens;
      const tokenUsage = {
        inputTokens: finalState.totalInputTokens,
        outputTokens: finalState.totalOutputTokens,
        totalTokens,
      };
      console.log(
        `   💰 ${formatTokenUsage(tokenUsage)} | ${formatCost(finalState.totalCost || 0)}`
      );
    }

    // Store developer overview from graph execution for later retrieval
    this.lastDeveloperOverview = finalState?.developerOverview;

    // Clean up vector store if it was used
    if (context.vectorStore) {
      context.vectorStore.clear();
    }

    // Return full state including agent results and developer overview
    return {
      agentResults: finalState?.agentResults || [],
      developerOverview: finalState?.developerOverview,
      currentRound: finalState?.currentRound,
      maxRounds: finalState?.maxRounds,
      converged: finalState?.converged,
      convergenceScore: finalState?.convergenceScore,
      pillarScores: finalState?.pillarScores,
      totalInputTokens: finalState?.totalInputTokens,
      totalOutputTokens: finalState?.totalOutputTokens,
      totalCost: finalState?.totalCost,
    };
  }

  /**
   * Resume evaluation from a checkpoint
   * @param threadId Thread ID of the checkpoint to resume
   * @returns Array of agent results
   */
  async resumeEvaluation(threadId: string): Promise<AgentResult[]> {
    console.log(`\n🔄 Resuming evaluation from checkpoint: ${threadId}`);

    const graphConfig = {
      configurable: { thread_id: threadId },
      runName: 'CommitEvaluation-Resume',
    };

    // Resume from checkpoint (null state means resume from last checkpoint)
    const finalState = await this.graph.invoke(null as any, graphConfig);

    console.log(`\n✅ Evaluation resumed and completed`);
    console.log(`   Total agents: ${finalState.agentResults.length}`);

    return finalState.agentResults;
  }
}
