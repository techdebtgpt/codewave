// Global documentation vector store for repository
// Loads .md files and builds embeddings for architecture-aware evaluation
// Persists across batch runs - initialized once per batch

import * as fs from 'fs';
import * as path from 'path';

interface VectorDocument {
  content: string;
  embedding: number[];
  metadata: Record<string, unknown>;
}

/**
 * Calculate cosine similarity between two vectors
 */
function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (vecA.length !== vecB.length) {
    throw new Error('Vectors must have the same dimension');
  }

  let dotProduct = 0;
  let magA = 0;
  let magB = 0;

  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    magA += vecA[i] * vecA[i];
    magB += vecB[i] * vecB[i];
  }

  magA = Math.sqrt(magA);
  magB = Math.sqrt(magB);

  if (magA === 0 || magB === 0) {
    return 0;
  }

  return dotProduct / (magA * magB);
}

/**
 * Simple TF-IDF embeddings (reused from diff vector store)
 */
class SimpleEmbeddings {
  private vocabulary: Map<string, number> = new Map();
  private idf: Map<string, number> = new Map();
  private dimensions: number;

  constructor(dimensions = 128) {
    this.dimensions = dimensions;
  }

  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter((word) => word.length > 2);
  }

  buildVocabulary(documents: string[]): void {
    const allWords = new Set<string>();
    documents.forEach((doc) => {
      this.tokenize(doc).forEach((word) => allWords.add(word));
    });

    Array.from(allWords).forEach((word, index) => {
      this.vocabulary.set(word, index % this.dimensions);
    });

    const docFrequency = new Map<string, number>();
    documents.forEach((doc) => {
      const words = new Set(this.tokenize(doc));
      words.forEach((word) => {
        docFrequency.set(word, (docFrequency.get(word) || 0) + 1);
      });
    });

    docFrequency.forEach((freq, word) => {
      this.idf.set(word, Math.log(documents.length / freq));
    });
  }

  embed(text: string): number[] {
    const vector = new Array(this.dimensions).fill(0);
    const words = this.tokenize(text);
    const termFreq = new Map<string, number>();

    words.forEach((word) => {
      termFreq.set(word, (termFreq.get(word) || 0) + 1);
    });

    termFreq.forEach((tf, word) => {
      const index = this.vocabulary.get(word);
      const idf = this.idf.get(word) || 0;
      if (index !== undefined) {
        vector[index] += tf * idf;
      }
    });

    const magnitude = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
    if (magnitude > 0) {
      for (let i = 0; i < vector.length; i++) {
        vector[i] /= magnitude;
      }
    }

    return vector;
  }
}

/**
 * Global documentation vector store for repository
 * Loads markdown files once and reuses across batch evaluations
 */
export class DocumentationVectorStoreService {
  private documents: VectorDocument[] = [];
  private embeddings: SimpleEmbeddings;
  private isInitialized = false;
  private docsMetadata: {
    filesLoaded: number;
    totalSize: number;
    chunksCreated: number;
  } = { filesLoaded: 0, totalSize: 0, chunksCreated: 0 };

  constructor() {
    this.embeddings = new SimpleEmbeddings(128);
  }

  /**
   * Initialize documentation vector store from repository
   * Scans for markdown files and builds embeddings
   */
  async initialize(
    repoPath: string,
    patterns: string[] = ['README.md', 'docs/**/*.md', '**/*.md'],
    excludePatterns: string[] = ['node_modules/**', 'dist/**', '.git/**'],
    chunkSize: number = 1000,
    onProgress?: (progress: number, filesProcessed: number, totalFiles: number) => void
  ): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    console.log('📚 Building documentation vector store...');

    try {
      // Find all markdown files
      const mdFiles = this.findMarkdownFiles(repoPath, patterns, excludePatterns);

      if (mdFiles.length === 0) {
        console.log('⚠️  No markdown files found');
        this.isInitialized = true;
        return;
      }

      // Load and parse markdown files
      const docData = await this.loadMarkdownFiles(mdFiles, chunkSize, (progress) => {
        if (onProgress) {
          onProgress(progress, Math.ceil((progress / 100) * mdFiles.length), mdFiles.length);
        }
      });

      if (docData.length === 0) {
        console.log('⚠️  No content extracted from markdown files');
        this.isInitialized = true;
        return;
      }

      // Build vocabulary and create embeddings
      const allContent = docData.map((d) => d.content);
      this.embeddings.buildVocabulary(allContent);

      // Create embeddings for each document
      const totalDocs = docData.length;
      this.documents = docData.map((d, index) => {
        const doc = {
          content: d.content,
          embedding: this.embeddings.embed(d.content),
          metadata: d.metadata,
        };

        // Report progress every 10%
        if (onProgress && index % Math.ceil(totalDocs / 10) === 0) {
          const progress = Math.floor(((index + 1) / totalDocs) * 100);
          onProgress(progress, mdFiles.length, mdFiles.length);
        }

        return doc;
      });

      this.docsMetadata.chunksCreated = this.documents.length;
      this.isInitialized = true;

      console.log(
        `✅ Documentation store ready: ${this.documents.length} chunks from ${mdFiles.length} files`
      );
    } catch (error) {
      console.error('❌ Failed to initialize documentation store:', error);
      this.isInitialized = false;
      throw error;
    }
  }

  /**
   * Find markdown files in repository
   */
  private findMarkdownFiles(
    repoPath: string,
    _patterns: string[],
    excludePatterns: string[]
  ): string[] {
    const files: string[] = [];
    const visited = new Set<string>();

    const isExcluded = (filePath: string): boolean => {
      for (const excludePattern of excludePatterns) {
        // Simple pattern matching (e.g., "node_modules/**" matches any path containing "node_modules")
        const normalizedExclude = excludePattern.replace('/**', '').replace(/\*/g, '');
        if (filePath.includes(normalizedExclude)) {
          return true;
        }
      }
      return false;
    };

    const walkDir = (dir: string): void => {
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          const relativePath = path.relative(repoPath, fullPath);

          if (isExcluded(relativePath)) {
            continue;
          }

          if (visited.has(fullPath)) {
            continue;
          }
          visited.add(fullPath);

          if (entry.isDirectory()) {
            walkDir(fullPath);
          } else if (entry.name.endsWith('.md')) {
            files.push(relativePath);
          }
        }
      } catch (error) {
        console.warn(`Failed to read directory ${dir}:`, error);
      }
    };

    walkDir(repoPath);
    return files.sort();
  }

  /**
   * Load markdown files and chunk them
   */
  private async loadMarkdownFiles(
    files: string[],
    chunkSize: number,
    onProgress?: (progress: number) => void
  ): Promise<Array<{ content: string; metadata: Record<string, unknown> }>> {
    const documents: Array<{ content: string; metadata: Record<string, unknown> }> = [];
    let totalSize = 0;

    for (let fileIdx = 0; fileIdx < files.length; fileIdx++) {
      const file = files[fileIdx];

      try {
        const fullPath = file;
        const content = fs.readFileSync(fullPath, 'utf-8');
        totalSize += content.length;

        // Split into sections and chunks
        const sections = this.splitMarkdownIntoSections(content);

        sections.forEach((section, sectionIdx) => {
          // Chunk large sections
          const chunks = this.chunkText(section.content, chunkSize);

          chunks.forEach((chunk, chunkIdx) => {
            documents.push({
              content: chunk,
              metadata: {
                file,
                section: section.title || `Section ${sectionIdx + 1}`,
                chunkIndex: chunkIdx,
                type: 'documentation',
              },
            });
          });
        });

        this.docsMetadata.filesLoaded++;

        if (onProgress) {
          const progress = Math.floor(((fileIdx + 1) / files.length) * 100);
          onProgress(progress);
        }
      } catch (error) {
        console.warn(`Failed to read file ${file}:`, error);
      }
    }

    this.docsMetadata.totalSize = totalSize;
    return documents;
  }

  /**
   * Split markdown into sections based on headings
   */
  private splitMarkdownIntoSections(content: string): Array<{ title: string; content: string }> {
    const sections: Array<{ title: string; content: string }> = [];
    const lines = content.split('\n');

    let currentSection = '';
    let currentTitle = 'Introduction';

    for (const line of lines) {
      if (line.startsWith('# ') || line.startsWith('## ') || line.startsWith('### ')) {
        // New section detected
        if (currentSection.trim()) {
          sections.push({
            title: currentTitle,
            content: currentSection.trim(),
          });
        }

        // Extract title from heading
        const match = line.match(/^#+\s+(.+)$/);
        currentTitle = match ? match[1] : 'Untitled';
        currentSection = line + '\n';
      } else {
        currentSection += line + '\n';
      }
    }

    // Don't forget last section
    if (currentSection.trim()) {
      sections.push({
        title: currentTitle,
        content: currentSection.trim(),
      });
    }

    return sections.length > 0 ? sections : [{ title: 'Content', content }];
  }

  /**
   * Chunk text into smaller pieces
   */
  private chunkText(text: string, chunkSize: number): string[] {
    if (text.length <= chunkSize) {
      return [text];
    }

    const chunks: string[] = [];
    let currentChunk = '';

    const lines = text.split('\n');

    for (const line of lines) {
      if ((currentChunk + line).length > chunkSize && currentChunk.length > 0) {
        chunks.push(currentChunk.trim());
        currentChunk = '';
      }
      currentChunk += (currentChunk ? '\n' : '') + line;
    }

    if (currentChunk.trim()) {
      chunks.push(currentChunk.trim());
    }

    return chunks;
  }

  /**
   * Query documentation store
   */
  async query(
    question: string,
    options: { topK?: number } = {}
  ): Promise<{
    chunks: Array<{ content: string; metadata: Record<string, unknown>; score: number }>;
    summary: string;
  }> {
    if (!this.isInitialized) {
      return {
        chunks: [],
        summary: 'Documentation store not initialized',
      };
    }

    if (this.documents.length === 0) {
      return {
        chunks: [],
        summary: 'No documentation available',
      };
    }

    const topK = options.topK || 5;
    const queryEmbedding = this.embeddings.embed(question);

    // Calculate similarity scores
    const results = this.documents
      .map((doc) => ({
        content: doc.content,
        metadata: doc.metadata,
        score: cosineSimilarity(queryEmbedding, doc.embedding),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);

    // Filter out results with very low scores
    const relevantResults = results.filter((r) => r.score > 0.1);

    // Generate summary
    const fileCount = new Set(
      relevantResults.map((r) => r.metadata.file).filter((f): f is string => typeof f === 'string')
    ).size;
    const sectionTitles = [
      ...new Set(
        relevantResults
          .map((r) => r.metadata.section)
          .filter((s): s is string => typeof s === 'string')
      ),
    ];

    const summary =
      relevantResults.length > 0
        ? `Found ${relevantResults.length} relevant documentation chunks across ${fileCount} file(s). Sections: ${sectionTitles.join(', ')}.`
        : 'No relevant documentation found for this question.';

    return { chunks: relevantResults, summary };
  }

  getStats() {
    return {
      initialized: this.isInitialized,
      ...this.docsMetadata,
      documentCount: this.documents.length,
    };
  }

  /**
   * Clear vector store
   */
  clear() {
    console.log('🧹 Clearing documentation vector store...');
    this.documents = [];
    this.isInitialized = false;
    this.docsMetadata = { filesLoaded: 0, totalSize: 0, chunksCreated: 0 };
  }
}
