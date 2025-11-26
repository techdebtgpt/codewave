import { MemoryVectorStore } from 'langchain/vectorstores/memory';
import { OpenAIEmbeddings } from '@langchain/openai';
import { Document } from '@langchain/core/documents';
import { AppConfig } from '../config/config.interface';

/**
 * Service for in-memory RAG of comments/feedback from past evaluations.
 * Allows the OKR agent to query for specific recurring issues.
 */
export class CommentVectorStoreService {
  private vectorStore: MemoryVectorStore | null = null;

  constructor(private config: AppConfig) {}

  /**
   * Initialize the vector store with a list of comments.
   * Each comment is treated as a separate document.
   */
  async initialize(comments: string[]): Promise<void> {
    if (!comments || comments.length === 0) {
      console.warn('⚠️  No comments provided for vector store initialization.');
      return;
    }

    const embeddings = new OpenAIEmbeddings({
      openAIApiKey: this.config.apiKeys.openai,
      modelName: 'text-embedding-3-small', // Efficient embedding model
    });

    const documents = comments.map(
      (comment) =>
        new Document({
          pageContent: comment,
          metadata: { source: 'evaluation-history' },
        })
    );

    this.vectorStore = await MemoryVectorStore.fromDocuments(documents, embeddings);
  }

  /**
   * Query the vector store for relevant comments.
   */
  async query(query: string, k: number = 5): Promise<string[]> {
    if (!this.vectorStore) {
      return [];
    }

    const results = await this.vectorStore.similaritySearch(query, k);
    return results.map((doc) => doc.pageContent);
  }
}
