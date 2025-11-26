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
    evaluations: any[] = [] // Pass full evaluations to extract comments
  ): Promise<any> {
    // 1. Initialize Vector Store with comments
    const comments = AuthorStatsAggregatorService.extractAuthorComments(evaluations);
    if (comments.length > 0) {
      console.log(`   📚 Indexing ${comments.length} past feedback items for RAG...`);
      await this.vectorStoreService.initialize(comments);
    }

    // 2. Run the Graph
    const initialState = {
      authorStats: stats,
      strengths,
      weaknesses,
      vectorStore: comments.length > 0 ? this.vectorStoreService : undefined,
      currentOkrs: [],
      feedback: '',
      rounds: 0,
      maxRounds: this.config.agents?.maxRounds || 2, // Use config setting, default to 2
    };

    const result = await this.graph.invoke(initialState);

    // Return comprehensive OKR structure
    return {
      strongPoints: result.strongPoints || [],
      weakPoints: result.weakPoints || [],
      knowledgeGaps: result.knowledgeGaps || [],
      okr3Month: result.okr3Month,
      okr6Month: result.okr6Month,
      okr12Month: result.okr12Month,
      actionPlan: result.actionPlan,
      authorStats: stats,
    };
  }
}
