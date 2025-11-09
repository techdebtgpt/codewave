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

    // Format results as markdown
    const formattedChunks = sortedResults.map((result, idx) => {
      const relevancePercent = (result.score * 100).toFixed(1);
      const source = result.source === 'diff' ? '📝 Diff' : '📚 Documentation';

      if (result.source === 'diff') {
        const { file, hunkStartLine, addedLines, deletedLines, changeType } = result.metadata;
        return [
          `### Result ${idx + 1}: ${source} - ${file} (${relevancePercent}% relevance)`,
          `- **Location**: Lines starting at ${hunkStartLine}`,
          `- **Changes**: +${addedLines}/-${deletedLines} lines`,
          `- **Type**: ${changeType}`,
          '',
          '```diff',
          result.content.split('\n').slice(0, 5).join('\n'),
          result.content.split('\n').length > 5 ? '... (truncated)' : '',
          '```',
          '',
        ].join('\n');
      } else {
        // Documentation result
        const { file, section } = result.metadata;
        return [
          `### Result ${idx + 1}: ${source} - ${file} (${relevancePercent}% relevance)`,
          `- **Section**: ${section}`,
          '',
          '```markdown',
          result.content.split('\n').slice(0, 10).join('\n'),
          result.content.split('\n').length > 10 ? '... (truncated)' : '',
          '```',
          '',
        ].join('\n');
      }
    });

    return [
      `## Combined Search Results (${sortedResults.length} relevant chunks)`,
      '',
      ...formattedChunks,
    ].join('\n');
  }

  /**
   * Run multiple queries and aggregate results from both stores
   * Useful for comprehensive context gathering
   */
  async queryMultiple(
    queries: Array<{ q: string; topK?: number; store?: 'all' | 'diff' | 'docs' }>
  ): Promise<
    Array<{
      query: string;
      results: string;
      diffResults: number;
      docResults: number;
      relevantFiles: Set<string>;
    }>
  > {
    const queryResults = await Promise.all(
      queries.map(async ({ q, topK = 3, store = 'all' }) => {
        let diffResults = 0;
        let docResults = 0;
        const relevantFiles = new Set<string>();
        const scores: number[] = [];

        // Count diff results
        if ((store === 'all' || store === 'diff') && this.diffStore) {
          try {
            const { chunks } = await this.diffStore.query(q, { topK });
            diffResults = chunks.length;
            chunks.forEach((c) => {
              if (typeof c.metadata.file === 'string') {
                relevantFiles.add(c.metadata.file);
              }
              scores.push(c.score);
            });
          } catch (error) {
            // Silently ignore
          }
        }

        // Count doc results
        if ((store === 'all' || store === 'docs') && this.docStore) {
          try {
            const { chunks } = await this.docStore.query(q, { topK });
            docResults = chunks.length;
            chunks.forEach((c) => {
              if (typeof c.metadata.file === 'string') {
                relevantFiles.add(c.metadata.file);
              }
              scores.push(c.score);
            });
          } catch (error) {
            // Silently ignore
          }
        }

        // Track this query
        const storeQueried: 'diff' | 'docs' | 'both' =
          store === 'all' ? 'both' : (store as 'diff' | 'docs');
        this.trackQuery(
          q,
          storeQueried,
          diffResults + docResults,
          docResults,
          relevantFiles,
          scores
        );

        const formattedResults = await this.query(q, topK, store);

        return {
          query: q,
          results: formattedResults,
          diffResults,
          docResults,
          relevantFiles,
        };
      })
    );

    return queryResults;
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
