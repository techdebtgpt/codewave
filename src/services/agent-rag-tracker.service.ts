/**
 * Agent RAG Query Tracker
 *
 * Tracks and reports which agents queried the documentation vector store,
 * what queries were made, and what results were found.
 */

export interface RAGQuery {
  agentName: string;
  query: string;
  timestamp: number;
  storeQueried: 'diff' | 'docs' | 'both';
  resultCount: number;
  docResultCount: number;
  relevantFiles: string[];
  averageRelevanceScore: number;
  foundResults: boolean;
}

export interface AgentRAGStats {
  agentName: string;
  queriesExecuted: number;
  totalDocResults: number;
  queriesWithDocResults: number;
  relevantDocFiles: Set<string>;
  queriesList: RAGQuery[];
}

export class AgentRAGTracker {
  private queries: RAGQuery[] = [];
  private agentStats: Map<string, AgentRAGStats> = new Map();

  /**
   * Record a RAG query executed by an agent
   */
  trackQuery(
    agentName: string,
    query: string,
    storeQueried: 'diff' | 'docs' | 'both',
    resultCount: number,
    docResultCount: number,
    relevantFiles: string[] | Set<string>,
    averageRelevanceScore: number
  ): void {
    const ragQuery: RAGQuery = {
      agentName,
      query,
      timestamp: Date.now(),
      storeQueried,
      resultCount,
      docResultCount,
      relevantFiles: Array.from(relevantFiles),
      averageRelevanceScore,
      foundResults: resultCount > 0,
    };

    this.queries.push(ragQuery);

    // Update agent stats
    if (!this.agentStats.has(agentName)) {
      this.agentStats.set(agentName, {
        agentName,
        queriesExecuted: 0,
        totalDocResults: 0,
        queriesWithDocResults: 0,
        relevantDocFiles: new Set(),
        queriesList: [],
      });
    }

    const stats = this.agentStats.get(agentName)!;
    stats.queriesExecuted++;
    stats.totalDocResults += docResultCount;
    if (docResultCount > 0) {
      stats.queriesWithDocResults++;
    }
    relevantFiles.forEach((file) => stats.relevantDocFiles.add(file));
    stats.queriesList.push(ragQuery);
  }

  /**
   * Get query history for a specific agent
   */
  getAgentQueries(agentName: string): RAGQuery[] {
    return this.queries.filter((q) => q.agentName === agentName);
  }

  /**
   * Get statistics for a specific agent
   */
  getAgentStats(agentName: string): AgentRAGStats | undefined {
    return this.agentStats.get(agentName);
  }

  /**
   * Get statistics for all agents
   */
  getAllAgentStats(): AgentRAGStats[] {
    return Array.from(this.agentStats.values());
  }

  /**
   * Get all queries across all agents
   */
  getAllQueries(): RAGQuery[] {
    return [...this.queries];
  }

  /**
   * Generate a summary report of documentation store usage
   */
  generateReport(): string {
    const sections: string[] = [
      '# Agent Documentation Store Usage Report',
      '',
      `**Total Queries Executed**: ${this.queries.length}`,
      `**Total Agents Using Docs**: ${this.agentStats.size}`,
      '',
    ];

    // Per-agent breakdown
    sections.push('## Per-Agent Breakdown');
    sections.push('');

    const sortedAgents = Array.from(this.agentStats.values()).sort(
      (a, b) => b.queriesExecuted - a.queriesExecuted
    );

    sortedAgents.forEach((stats) => {
      const docUsagePercent = ((stats.queriesWithDocResults / stats.queriesExecuted) * 100).toFixed(
        1
      );
      const avgDocResults = (stats.totalDocResults / stats.queriesExecuted).toFixed(1);

      sections.push(`### ${stats.agentName}`);
      sections.push(`- **Queries Executed**: ${stats.queriesExecuted}`);
      sections.push(
        `- **Queries Using Docs**: ${stats.queriesWithDocResults} (${docUsagePercent}%)`
      );
      sections.push(`- **Total Doc Results**: ${stats.totalDocResults}`);
      sections.push(`- **Avg Doc Results Per Query**: ${avgDocResults}`);
      sections.push(`- **Relevant Doc Files**: ${stats.relevantDocFiles.size}`);

      if (stats.relevantDocFiles.size > 0) {
        sections.push(`  - Files: ${Array.from(stats.relevantDocFiles).join(', ')}`);
      }

      sections.push('');

      // Query details for this agent
      if (stats.queriesList.length > 0) {
        sections.push(`#### Queries Detail`);
        stats.queriesList.forEach((q, idx) => {
          const relevancePercent = (q.averageRelevanceScore * 100).toFixed(1);
          sections.push(`${idx + 1}. **Query**: "${q.query}"`);
          sections.push(`   - Stores Queried: ${q.storeQueried}`);
          sections.push(`   - Results Found: ${q.resultCount}`);
          sections.push(`   - Doc Results: ${q.docResultCount}`);
          sections.push(`   - Avg Relevance: ${relevancePercent}%`);
        });
        sections.push('');
      }
    });

    // Documentation coverage analysis
    sections.push('## Documentation Coverage Analysis');
    sections.push('');

    const uniqueFiles = new Set<string>();
    this.agentStats.forEach((stats) => {
      stats.relevantDocFiles.forEach((file) => uniqueFiles.add(file));
    });

    sections.push(`- **Unique Doc Files Referenced**: ${uniqueFiles.size}`);
    sections.push(`- **Agents Using Documentation**: ${this.agentStats.size}`);

    const agentsUsingDocs = Array.from(this.agentStats.values()).filter(
      (s) => s.queriesWithDocResults > 0
    );

    sections.push(
      `- **Agents With Doc Results**: ${agentsUsingDocs.length}/${this.agentStats.size}`
    );

    if (uniqueFiles.size > 0) {
      sections.push('');
      sections.push('**Files Referenced**:');
      Array.from(uniqueFiles)
        .sort()
        .forEach((file) => {
          const count = Array.from(this.agentStats.values()).filter((s) =>
            s.relevantDocFiles.has(file)
          ).length;
          sections.push(`- ${file} (referenced by ${count} agent(s))`);
        });
    }

    sections.push('');

    // Summary statistics
    sections.push('## Query Success Metrics');
    sections.push('');

    const successfulQueries = this.queries.filter((q) => q.foundResults);
    const successRate = ((successfulQueries.length / this.queries.length) * 100).toFixed(1);
    const avgRelevance = (
      this.queries.reduce((sum, q) => sum + q.averageRelevanceScore, 0) / this.queries.length
    ).toFixed(3);

    sections.push(
      `- **Successful Queries**: ${successfulQueries.length}/${this.queries.length} (${successRate}%)`
    );
    sections.push(`- **Average Relevance Score**: ${avgRelevance}`);

    const queriesWithDocs = this.queries.filter((q) => q.docResultCount > 0);
    sections.push(
      `- **Queries With Doc Results**: ${queriesWithDocs.length}/${this.queries.length}`
    );
    sections.push(
      `- **Avg Doc Results Per Query**: ${(
        queriesWithDocs.reduce((sum, q) => sum + q.docResultCount, 0) / queriesWithDocs.length
      ).toFixed(1)}`
    );

    return sections.join('\n');
  }

  /**
   * Export tracker data as JSON
   */
  exportJSON(): {
    timestamp: number;
    totalQueries: number;
    agents: AgentRAGStats[];
    allQueries: RAGQuery[];
  } {
    return {
      timestamp: Date.now(),
      totalQueries: this.queries.length,
      agents: this.getAllAgentStats(),
      allQueries: this.getAllQueries(),
    };
  }

  /**
   * Clear all tracked data
   */
  clear(): void {
    this.queries = [];
    this.agentStats.clear();
  }

  /**
   * Get documentation coverage percentage
   */
  getDocumentationCoveragePercent(): number {
    if (this.queries.length === 0) return 0;
    const queriesWithDocs = this.queries.filter((q) => q.docResultCount > 0).length;
    return (queriesWithDocs / this.queries.length) * 100;
  }

  /**
   * Get which agents checked documentation
   */
  getAgentsCheckedDocs(): string[] {
    const agents = Array.from(this.agentStats.values())
      .filter((s) => s.queriesWithDocResults > 0)
      .map((s) => s.agentName)
      .sort();
    return agents;
  }
}

// Global singleton instance
export const ragTracker = new AgentRAGTracker();
