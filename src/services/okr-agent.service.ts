import * as fs from 'fs';
import * as path from 'path';
import { AppConfig } from '../config/config.interface';
import { AuthorStats, AuthorStatsAggregatorService } from './author-stats-aggregator.service';
import { createOkrGenerationGraph } from '../orchestrator/okr-generation-graph';
import { CommentVectorStoreService } from './comment-vector-store.service';

/**
 * Service for generating OKRs using an Agentic approach (LangGraph).
 * Replaces the simple OkrGeneratorService.
 */
export class OkrAgentService {
  private graph: any;
  private vectorStoreService: CommentVectorStoreService;

  constructor(private config: AppConfig) {
    // Configure LangSmith tracing if enabled
    if (config.tracing.enabled && config.tracing.apiKey) {
      process.env.LANGCHAIN_TRACING_V2 = 'true';
      process.env.LANGCHAIN_API_KEY = config.tracing.apiKey;
      process.env.LANGCHAIN_PROJECT = config.tracing.project;
      process.env.LANGCHAIN_ENDPOINT = config.tracing.endpoint;
      console.log(`   🔍 LangSmith tracing enabled: ${config.tracing.project}`);
    }

    this.graph = createOkrGenerationGraph(config);
    this.vectorStoreService = new CommentVectorStoreService(config);
  }

  /**
   * Generate OKRs for a single author using the agentic workflow.
   */
  async generateOkrsForAuthor(
    author: string,
    stats: AuthorStats,
    strengths: string[],
    weaknesses: string[],
    evaluations: any[] = [], // Pass full evaluations to extract comments
    evalRoot?: string // Optional: evaluation root to load previous OKR
  ): Promise<any> {
    // 1. Initialize Vector Store with comments
    const comments = AuthorStatsAggregatorService.extractAuthorComments(evaluations);
    if (comments.length > 0) {
      console.log(`   📚 Indexing ${comments.length} past feedback items for RAG...`);
      await this.vectorStoreService.initialize(comments);
    }

    // 2. Load previous OKR for progress tracking (time-based)
    let previousOkr: any = undefined;

    if (evalRoot) {
      const loadedOkr = await this.loadPreviousOkr(evalRoot, author);
      if (loadedOkr && loadedOkr.generatedAt) {
        const okrDate = new Date(loadedOkr.generatedAt);
        const now = new Date();
        const monthsElapsed = (now.getTime() - okrDate.getTime()) / (1000 * 60 * 60 * 24 * 30.44); // Average month length

        // Determine which timeframe to track based on elapsed time
        if (monthsElapsed >= 12 && loadedOkr.okr12Month) {
          previousOkr = {
            ...loadedOkr,
            targetTimeframe: '12-month',
            monthsElapsed: Math.floor(monthsElapsed),
          };
        } else if (monthsElapsed >= 6 && loadedOkr.okr6Month) {
          previousOkr = {
            ...loadedOkr,
            targetTimeframe: '6-month',
            monthsElapsed: Math.floor(monthsElapsed),
          };
        } else if (monthsElapsed >= 3) {
          previousOkr = {
            ...loadedOkr,
            targetTimeframe: '3-month',
            monthsElapsed: Math.floor(monthsElapsed),
          };
        }
      }
    }

    // 3. Run the Graph
    const initialState = {
      authorStats: stats,
      strengths,
      weaknesses,
      vectorStore: comments.length > 0 ? this.vectorStoreService : undefined,
      previousOkr,
      currentOkrs: [],
      feedback: '',
      rounds: 0,
      maxRounds: this.config.agents?.maxRounds || 3,
    };

    const result = await this.graph.invoke(initialState);

    // Return comprehensive OKR structure
    return {
      strongPoints: result.strongPoints || [],
      weakPoints: result.weakPoints || [],
      knowledgeGaps: result.knowledgeGaps || [],
      progressReport: result.progressReport || undefined,
      okr3Month: result.okr3Month,
      okr6Month: result.okr6Month,
      okr12Month: result.okr12Month,
      actionPlan: result.actionPlan,
      authorStats: stats,
    };
  }

  /**
   * Load the most recent previous OKR for an author
   */
  private async loadPreviousOkr(evalRoot: string, author: string): Promise<any | undefined> {
    try {
      const sanitizedAuthor = author.replace(/[^a-z0-9]/gi, '_').toLowerCase();
      const authorDir = path.join(evalRoot, '.okrs', sanitizedAuthor);

      if (!fs.existsSync(authorDir)) {
        return undefined;
      }

      // Get all OKR JSON files
      const files = fs.readdirSync(authorDir);
      const okrJsonFiles = files
        .filter((f: string) => f.startsWith('okr_') && f.endsWith('.json'))
        .sort()
        .reverse(); // Newest first

      if (okrJsonFiles.length === 0) {
        return undefined;
      }

      // Load the most recent one
      const latestJsonPath = path.join(authorDir, okrJsonFiles[0]);
      const okrData = JSON.parse(fs.readFileSync(latestJsonPath, 'utf-8'));
      // Loaded previous OKR
      return okrData;
    } catch (error) {
      console.warn(`   ⚠️  Failed to load previous OKR: ${error}`);
      return undefined;
    }
  }
}
