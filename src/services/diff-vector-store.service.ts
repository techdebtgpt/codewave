// Simple in-memory vector store for commit diff RAG
// No external dependencies - uses TF-IDF embeddings and cosine similarity

interface VectorDocument {
  content: string;
  embedding: number[];
  metadata: Record<string, unknown>;
  commitTag?: string; // NEW: Isolate documents by commit
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
 * Simple TF-IDF embeddings (no external dependencies)
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
 * In-memory RAG service for commit diff analysis
 * Allows agents to ask targeted questions instead of processing entire diff
 */
export class DiffVectorStoreService {
  private documents: VectorDocument[] = [];
  private embeddings: SimpleEmbeddings;
  private isInitialized = false;
  private commitTag: string; // NEW: Unique tag for this commit
  private diffMetadata: {
    totalLines: number;
    filesChanged: number;
    additions: number;
    deletions: number;
  } = { totalLines: 0, filesChanged: 0, additions: 0, deletions: 0 };

  constructor(commitHash?: string) {
    this.embeddings = new SimpleEmbeddings(128);
    this.commitTag = commitHash || `commit-${Date.now()}`; // Unique tag per commit
  }

  /**
   * Initialize vector store from commit diff
   * Chunks diff by file and by hunk for granular retrieval
   */
  async initialize(
    commitDiff: string,
    onProgress?: (progress: number, current: number, total: number) => void
  ): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    console.log('📦 Building in-memory vector store from diff...');

    const docData = this.parseDiffIntoDocuments(commitDiff);

    if (docData.length === 0) {
      console.log('⚠️  No documents extracted from diff - likely empty or metadata-only commit');
      //TODO: check if this is correct
      // Create a minimal document to avoid breaking the system
      docData.push({
        content: 'Empty or metadata-only commit',
        metadata: {
          type: 'empty-commit',
          file: 'N/A',
          commitTag: this.commitTag,
        },
      });
    }

    // Build vocabulary from all content
    const allContent = docData.map((d) => d.content);
    this.embeddings.buildVocabulary(allContent);

    // Create embeddings for each document with commit tag and progress tracking
    const totalDocs = docData.length;
    this.documents = docData.map((d, index) => {
      const doc = {
        content: d.content,
        embedding: this.embeddings.embed(d.content),
        metadata: d.metadata,
        commitTag: this.commitTag,
      };

      // Report progress every 10% or on last document
      if (onProgress) {
        const current = index + 1;
        const progress = Math.floor((current / totalDocs) * 100);
        if (progress % 10 === 0 || current === totalDocs) {
          onProgress(progress, current, totalDocs);
        }
      }

      return doc;
    });

    this.isInitialized = true;
    console.log(`✅ Vector store ready: ${this.documents.length} chunks indexed`);
    console.log(
      `   📊 ${this.diffMetadata.filesChanged} files | +${this.diffMetadata.additions} -${this.diffMetadata.deletions} lines`
    );
  }

  /**
   * Parse diff into structured documents
   */
  private parseDiffIntoDocuments(
    diff: string
  ): Array<{ content: string; metadata: Record<string, unknown> }> {
    const documents: Array<{ content: string; metadata: Record<string, unknown> }> = [];
    const lines = diff.split('\n');

    let currentFile: string | null = null;
    let currentHunk: string[] = [];
    let hunkStartLine = 0;
    let additions = 0;
    let deletions = 0;
    const filesChanged = new Set<string>();

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Skip commit header lines
      if (
        line.startsWith('commit ') ||
        line.startsWith('Author: ') ||
        line.startsWith('Date: ') ||
        line.startsWith('Merge: ')
      ) {
        continue;
      }

      // Skip empty lines and commit message (4-space indented lines before any diff content)
      if (currentFile === null) {
        if (line.trim().length === 0) {
          continue;
        }
        // Commit message lines are indented with 4 spaces
        if (line.startsWith('    ') && !line.startsWith('diff')) {
          continue;
        }
      }

      // Detect file headers (also skip index and --- lines)
      if (
        line.startsWith('diff --git') ||
        line.startsWith('---') ||
        line.startsWith('+++') ||
        line.startsWith('index ')
      ) {
        if (currentFile && currentHunk.length > 0) {
          documents.push(this.createHunkDocument(currentFile, currentHunk, hunkStartLine));
          currentHunk = [];
        }

        if (line.startsWith('diff --git')) {
          const match = line.match(/diff --git a\/(.*?) b\//);
          currentFile = match ? match[1] : null;
        } else if (line.startsWith('+++')) {
          const match = line.match(/\+\+\+ b\/(.*?)$/);
          if (match) {
            currentFile = match[1];
            if (currentFile) {
              filesChanged.add(currentFile);
            }
          }
        }
        // Skip --- and index lines (metadata)
        continue;
      }

      // Detect hunk headers
      if (line.startsWith('@@')) {
        if (currentFile && currentHunk.length > 0) {
          documents.push(this.createHunkDocument(currentFile, currentHunk, hunkStartLine));
        }

        currentHunk = [line];
        const match = line.match(/@@ -(\d+),?\d* \+(\d+),?\d* @@/);
        hunkStartLine = match ? parseInt(match[2], 10) : 0;
        continue;
      }

      // Accumulate hunk content
      if (currentFile && currentHunk.length > 0) {
        currentHunk.push(line);

        if (line.startsWith('+') && !line.startsWith('+++')) additions++;
        if (line.startsWith('-') && !line.startsWith('---')) deletions++;
      }
    }

    // Save final hunk
    if (currentFile && currentHunk.length > 0) {
      documents.push(this.createHunkDocument(currentFile, currentHunk, hunkStartLine));
    }

    // Create file-level summary documents
    for (const file of filesChanged) {
      const fileHunks = documents.filter((d) => d.metadata.file === file);
      documents.push(this.createFileSummaryDocument(file, fileHunks));
    }

    this.diffMetadata = {
      totalLines: lines.length,
      filesChanged: filesChanged.size,
      additions,
      deletions,
    };

    return documents;
  }

  private createHunkDocument(
    file: string,
    hunkLines: string[],
    startLine: number
  ): { content: string; metadata: Record<string, unknown> } {
    const addedLines = hunkLines.filter((l) => l.startsWith('+')).length;
    const deletedLines = hunkLines.filter((l) => l.startsWith('-')).length;
    const changeType = this.detectChangeType(hunkLines);

    return {
      content: hunkLines.join('\n'),
      metadata: {
        file,
        type: 'hunk',
        startLine,
        addedLines,
        deletedLines,
        changeType,
        extension: this.getFileExtension(file),
      },
    };
  }

  private createFileSummaryDocument(
    file: string,
    hunks: Array<{ metadata: Record<string, unknown> }>
  ): { content: string; metadata: Record<string, unknown> } {
    const totalAdded = hunks.reduce((sum, h) => sum + (Number(h.metadata.addedLines) || 0), 0);
    const totalDeleted = hunks.reduce((sum, h) => sum + (Number(h.metadata.deletedLines) || 0), 0);

    const summary = `File: ${file}
Changes: +${totalAdded} -${totalDeleted} (${hunks.length} hunks)
File type: ${this.getFileType(file)}
Change types: ${[...new Set(hunks.map((h) => h.metadata.changeType))].join(', ')}`;

    return {
      content: summary,
      metadata: {
        file,
        type: 'file-summary',
        totalAdded,
        totalDeleted,
        hunkCount: hunks.length,
        extension: this.getFileExtension(file),
        fileType: this.getFileType(file),
      },
    };
  }

  private detectChangeType(hunkLines: string[]): string {
    const content = hunkLines.join('\n').toLowerCase();

    if (
      content.includes('test') ||
      content.includes('spec') ||
      content.includes('describe(') ||
      content.includes('it(')
    ) {
      return 'test';
    }
    if (content.includes('import') || content.includes('require(')) {
      return 'dependency';
    }
    if (content.includes('config') || content.includes('.json') || content.includes('.yaml')) {
      return 'config';
    }
    if (content.includes('readme') || content.includes('doc')) {
      return 'documentation';
    }
    if (content.includes('api') || content.includes('endpoint') || content.includes('route')) {
      return 'api';
    }
    if (
      content.includes('database') ||
      content.includes('migration') ||
      content.includes('schema')
    ) {
      return 'database';
    }

    return 'business-logic';
  }

  private getFileExtension(file: string): string {
    const parts = file.split('.');
    return parts.length > 1 ? parts[parts.length - 1] : '';
  }

  private getFileType(file: string): string {
    const filename = file.toLowerCase();

    if (filename.includes('test') || filename.includes('spec')) return 'test';
    if (filename.endsWith('.md') || filename.includes('readme')) return 'documentation';
    if (filename.endsWith('.json') || filename.endsWith('.yaml') || filename.endsWith('.yml'))
      return 'config';
    if (filename.includes('migration') || filename.includes('schema')) return 'database';

    const ext = this.getFileExtension(file);
    if (['ts', 'js', 'tsx', 'jsx', 'py', 'java', 'go', 'rb'].includes(ext)) return 'source-code';

    return 'other';
  }

  /**
   * Search diff chunks by semantic query
   * Core RAG functionality for agents to ask questions
   * NOW: Only searches within this commit's documents
   */
  async query(
    question: string,
    options: { topK?: number } = {}
  ): Promise<{
    chunks: Array<{ content: string; metadata: Record<string, unknown>; score: number }>;
    summary: string;
  }> {
    if (!this.isInitialized) {
      throw new Error('Vector store not initialized. Call initialize() first.');
    }

    const topK = options.topK || 5;
    const queryEmbedding = this.embeddings.embed(question);

    // Calculate similarity scores - ONLY for documents with matching commit tag
    const results = this.documents
      .filter((doc) => doc.commitTag === this.commitTag) // NEW: Isolate by commit
      .map((doc) => ({
        content: doc.content,
        metadata: doc.metadata,
        score: cosineSimilarity(queryEmbedding, doc.embedding),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);

    // Generate summary
    const fileCount = new Set(
      results.map((r) => r.metadata.file).filter((f): f is string => typeof f === 'string')
    ).size;
    const changeTypes = [
      ...new Set(
        results.map((r) => r.metadata.changeType).filter((t): t is string => typeof t === 'string')
      ),
    ];

    const summary = `Found ${results.length} relevant chunks across ${fileCount} file(s). Change types: ${changeTypes.join(', ') || 'various'}.`;

    return { chunks: results, summary };
  }

  getStats() {
    return {
      initialized: this.isInitialized,
      ...this.diffMetadata,
      documentCount: this.documents.length,
      commitTag: this.commitTag, // NEW: Show which commit this store belongs to
    };
  }

  /**
   * Clear vector store after commit evaluation completes
   * Frees memory for next commit
   */
  clear() {
    console.log(`🧹 Cleaning up vector store for commit ${this.commitTag}...`);
    this.documents = [];
    this.isInitialized = false;
    this.diffMetadata = { totalLines: 0, filesChanged: 0, additions: 0, deletions: 0 };
  }
}
