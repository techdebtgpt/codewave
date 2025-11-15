import { DiffVectorStoreService } from '../services/diff-vector-store.service';
import { DocumentationVectorStoreService } from '../services/documentation-vector-store.service';
import { ragTracker } from '../services/agent-rag-tracker.service';

/**
 * Combined RAG Helper for Agents
 *
 * Queries both diff-specific and global documentation vector stores
 * Returns aggregated, ranked results for better context
 */
export class CombinedRAGHelper {
  constructor(
    private readonly diffStore?: DiffVectorStoreService,
    private readonly docStore?: DocumentationVectorStoreService
  ) {}

  /**
   * Query both stores and return formatted results
   * @param query Natural language question about the commit
   * @param topK Number of results to return (default: 3)
   * @param storePreference Which store to prioritize: 'all' | 'diff' | 'docs'
   * @returns Formatted context string with relevant chunks from both stores
   */
  async query(
    query: string,
    topK: number = 3,
    storePreference: 'all' | 'diff' | 'docs' = 'all'
  ): Promise<string> {
    const results: Array<{
      source: 'diff' | 'documentation';
      content: string;
      metadata: Record<string, unknown>;
      score: number;
    }> = [];

    // Query diff store
    if ((storePreference === 'all' || storePreference === 'diff') && this.diffStore) {
      try {
        const { chunks } = await this.diffStore.query(query, { topK });
        results.push(
          ...chunks.map((chunk) => ({
            source: 'diff' as const,
            content: chunk.content,
            metadata: chunk.metadata,
            score: chunk.score,
          }))
        );
      } catch (error) {
        console.warn('Failed to query diff store:', error);
      }
    }

    // Query documentation store
    if ((storePreference === 'all' || storePreference === 'docs') && this.docStore) {
      try {
        const { chunks } = await this.docStore.query(query, { topK });
        results.push(
          ...chunks.map((chunk) => ({
            source: 'documentation' as const,
            content: chunk.content,
            metadata: chunk.metadata,
            score: chunk.score,
          }))
        );
      } catch (error) {
        console.warn('Failed to query documentation store:', error);
      }
    }

    if (results.length === 0) {
      return `No relevant content found for query: "${query}"`;
    }

    // Sort by score and take top K
    const sortedResults = results.sort((a, b) => b.score - a.score).slice(0, topK);

    // Format results as markdown with minimal metadata and maximum code
    const formattedChunks = sortedResults.map((result, idx) => {
      const relevancePercent = (result.score * 100).toFixed(1);

      if (result.source === 'diff') {
        const { file, startLine, changeType } = result.metadata;
        const contentLines = result.content.split('\n');
        const maxLines = 30; // Show up to 30 lines of code
        const truncated = contentLines.length > maxLines;

        return [
          `**[${idx + 1}] ${file}** (${changeType || 'code'}, line ${startLine || 'unknown'}, ${relevancePercent}% match)`,
          '```diff',
          contentLines.slice(0, maxLines).join('\n'),
          truncated ? '... (truncated)' : '',
          '```',
        ].join('\n');
      } else {
        // Documentation result
        const { file } = result.metadata;
        const contentLines = result.content.split('\n');
        const maxLines = 20;
        const truncated = contentLines.length > maxLines;

        return [
          `**[${idx + 1}] 📚 ${file}** (${relevancePercent}% match)`,
          '```',
          contentLines.slice(0, maxLines).join('\n'),
          truncated ? '... (truncated)' : '',
          '```',
        ].join('\n');
      }
    });

    return formattedChunks.join('\n\n');
  }

  /**
   * Run multiple queries and aggregate results from both stores
   * Returns DEDUPLICATED and CONSOLIDATED results to avoid repetition
   */
  async queryMultiple(
    queries: Array<{ q: string; topK?: number; store?: 'all' | 'diff' | 'docs'; purpose?: string }>
  ): Promise<
    Array<{
      query: string;
      results: string;
      diffResults: number;
      docResults: number;
      relevantFiles: Set<string>;
    }>
  > {
    // Collect all results across all queries
    const allResults: Array<{
      source: 'diff' | 'documentation';
      content: string;
      metadata: Record<string, unknown>;
      score: number;
      queryPurpose?: string;
    }> = [];

    const seenContent = new Set<string>(); // For deduplication
    let totalDiffResults = 0;
    let totalDocResults = 0;
    const allRelevantFiles = new Set<string>();

    // Execute all queries and collect unique results
    for (const { q, topK = 2, store = 'diff', purpose } of queries) {
      const scores: number[] = [];

      // Query diff store
      if ((store === 'all' || store === 'diff') && this.diffStore) {
        try {
          const { chunks } = await this.diffStore.query(q, { topK });

          for (const chunk of chunks) {
            // Deduplicate by content
            const contentKey = `${chunk.metadata.file}:${chunk.metadata.startLine}`;
            if (!seenContent.has(contentKey)) {
              seenContent.add(contentKey);
              allResults.push({
                source: 'diff',
                content: chunk.content,
                metadata: chunk.metadata,
                score: chunk.score,
                queryPurpose: purpose,
              });
              totalDiffResults++;

              if (typeof chunk.metadata.file === 'string') {
                allRelevantFiles.add(chunk.metadata.file);
              }
              scores.push(chunk.score);
            }
          }
        } catch (error) {
          // Silently ignore
        }
      }

      // Track this query
      const storeQueried: 'diff' | 'docs' | 'both' =
        store === 'all' ? 'both' : (store as 'diff' | 'docs');
      this.trackQuery(q, storeQueried, scores.length, 0, allRelevantFiles, scores);
    }

    // Sort all results by score and take top results (limit to avoid overwhelming context)
    const maxResults = 10; // Maximum 10 code snippets total
    const topResults = allResults.sort((a, b) => b.score - a.score).slice(0, maxResults);

    // Format consolidated results
    const formattedChunks = topResults
      .map((result, idx) => {
        const relevancePercent = (result.score * 100).toFixed(1);

        if (result.source === 'diff') {
          const { file, hunkStartLine, changeType } = result.metadata;
          const contentLines = result.content.split('\n');
          const maxLines = 30;
          const truncated = contentLines.length > maxLines;

          return [
            `**[${idx + 1}] ${file}** (${changeType}, line ${hunkStartLine}, ${relevancePercent}% match)`,
            '```diff',
            contentLines.slice(0, maxLines).join('\n'),
            truncated ? '... (truncated)' : '',
            '```',
          ].join('\n');
        }

        return ''; // No doc results in current implementation
      })
      .filter(Boolean);

    const consolidatedResults = formattedChunks.join('\n\n');

    // Return single consolidated response
    return [
      {
        query: `${queries.length} concern(s)`,
        results: consolidatedResults,
        diffResults: totalDiffResults,
        docResults: totalDocResults,
        relevantFiles: allRelevantFiles,
      },
    ];
  }

  /**
   * Get combined summary from both stores
   */
  getSummary(): string {
    const sections: string[] = [];

    if (this.diffStore) {
      const diffStats = this.diffStore.getStats();
      sections.push(
        [
          `**Diff Summary**:`,
          `- Files changed: ${diffStats.filesChanged}`,
          `- Additions: +${diffStats.additions}`,
          `- Deletions: -${diffStats.deletions}`,
          `- Total chunks indexed: ${diffStats.documentCount}`,
        ].join('\n')
      );
    }

    if (this.docStore) {
      const docStats = this.docStore.getStats();
      sections.push(
        [
          `**Documentation Summary**:`,
          `- Files loaded: ${docStats.filesLoaded}`,
          `- Total size: ${(docStats.totalSize / 1024).toFixed(1)} KB`,
          `- Chunks created: ${docStats.chunksCreated}`,
        ].join('\n')
      );
    }

    return sections.join('\n\n') || 'No vector stores available';
  }

  /**
   * Check if RAG is available (at least one store initialized)
   */
  static isAvailable(context: {
    vectorStore?: DiffVectorStoreService;
    documentationStore?: DocumentationVectorStoreService;
  }): boolean {
    return context.vectorStore !== undefined || context.documentationStore !== undefined;
  }

  /**
   * Set the agent name for tracking queries
   * Call this at the beginning of agent processing
   */
  private agentName: string = 'Unknown Agent';

  setAgentName(name: string): void {
    this.agentName = name;
  }

  /**
   * Track a query to the global tracker
   */
  private trackQuery(
    query: string,
    storeQueried: 'diff' | 'docs' | 'both',
    resultCount: number,
    docResultCount: number,
    relevantFiles: Set<string>,
    scores: number[]
  ): void {
    const avgScore = scores.length > 0 ? scores.reduce((a, b) => a + b) / scores.length : 0;
    ragTracker.trackQuery(
      this.agentName,
      query,
      storeQueried,
      resultCount,
      docResultCount,
      Array.from(relevantFiles),
      avgScore
    );
  }

  /**
   * Get tracking report
   */
  static getTrackingReport(): string {
    return ragTracker.generateReport();
  }

  /**
   * Get agents that checked documentation
   */
  static getAgentsCheckedDocs(): string[] {
    return ragTracker.getAgentsCheckedDocs();
  }

  /**
   * Get documentation coverage percentage
   */
  static getDocumentationCoverage(): number {
    return ragTracker.getDocumentationCoveragePercent();
  }

  /**
   * Export tracking data
   */
  static exportTrackingData() {
    return ragTracker.exportJSON();
  }

  /**
   * Clear tracking data
   */
  static clearTracking(): void {
    ragTracker.clear();
  }
}
