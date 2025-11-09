/**
 * Documentation Vector Store - Implementation Validation Tests
 * Phase 7: Testing & Validation
 *
 * This file validates the global documentation vector store implementation
 * including initialization, querying, and integration with agents.
 */

import * as fs from 'fs';
import * as path from 'path';
import { DocumentationVectorStoreService } from '../src/services/documentation-vector-store.service';
import { CombinedRAGHelper } from '../src/utils/combined-rag-helper';
import { DiffVectorStoreService } from '../src/services/diff-vector-store.service';

// Test utilities
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
};

interface TestResult {
  name: string;
  status: 'PASS' | 'FAIL';
  message: string;
  duration?: number;
}

const results: TestResult[] = [];

function log(color: string, message: string) {
  console.log(`${color}${message}${colors.reset}`);
}

async function test(name: string, fn: () => Promise<void>) {
  const startTime = Date.now();
  try {
    await fn();
    const duration = Date.now() - startTime;
    results.push({ name, status: 'PASS', message: 'Passed', duration });
    log(colors.green, `✓ ${name}`);
  } catch (error) {
    const duration = Date.now() - startTime;
    const message = error instanceof Error ? error.message : String(error);
    results.push({ name, status: 'FAIL', message, duration });
    log(colors.red, `✗ ${name}: ${message}`);
  }
}

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

// ============================================================================
// TEST SUITE 1: DocumentationVectorStore Initialization
// ============================================================================

log(colors.blue, '\n📋 TEST SUITE 1: DocumentationVectorStore Initialization\n');

test('Should create DocumentationVectorStoreService instance', async () => {
  const store = new DocumentationVectorStoreService();
  assert(store !== null, 'Store should not be null');
  assert(typeof store.initialize === 'function', 'Store should have initialize method');
  assert(typeof store.query === 'function', 'Store should have query method');
  assert(typeof store.clear === 'function', 'Store should have clear method');
  assert(typeof store.getStats === 'function', 'Store should have getStats method');
});

test('Should handle initialization with empty repository', async () => {
  const store = new DocumentationVectorStoreService();
  const tempDir = path.join(__dirname, 'temp-empty-repo');

  // Create temp dir
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  try {
    await store.initialize(tempDir, ['*.md'], ['node_modules/**'], 1000);
    const stats = store.getStats();
    assert(stats.initialized === true, 'Store should be initialized');
    assert(stats.filesLoaded === 0, 'No files should be loaded');
    assert(stats.chunksCreated === 0, 'No chunks should be created');
  } finally {
    // Cleanup
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true });
    }
  }
});

test('Should initialize with real markdown files', async () => {
  const store = new DocumentationVectorStoreService();
  const tempDir = path.join(__dirname, 'temp-docs-repo');

  // Create temp dir with sample markdown files
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  const readmePath = path.join(tempDir, 'README.md');
  fs.writeFileSync(
    readmePath,
    `# Project Documentation

## Architecture
This is a well-designed system with clear separation of concerns.

## Design Patterns
We use the repository pattern for data access.
`
  );

  const docsDir = path.join(tempDir, 'docs');
  if (!fs.existsSync(docsDir)) {
    fs.mkdirSync(docsDir);
  }

  const archPath = path.join(docsDir, 'ARCHITECTURE.md');
  fs.writeFileSync(
    archPath,
    `# Architecture Documentation

## System Components
- API Gateway
- Service Layer
- Data Access Layer

## Scalability Patterns
We follow horizontally scalable architecture.
`
  );

  try {
    let progressCallCount = 0;
    await store.initialize(tempDir, ['*.md', 'docs/**/*.md'], ['node_modules/**'], 1000, () => {
      progressCallCount++;
    });

    const stats = store.getStats();
    assert(stats.initialized === true, 'Store should be initialized');
    assert(stats.filesLoaded === 2, 'Should load 2 files');
    assert(stats.chunksCreated > 0, 'Should create chunks');
    assert(progressCallCount > 0, 'Progress callback should be called');
  } finally {
    // Cleanup
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true });
    }
  }
});

// ============================================================================
// TEST SUITE 2: DocumentationVectorStore Querying
// ============================================================================

log(colors.blue, '\n📋 TEST SUITE 2: DocumentationVectorStore Querying\n');

test('Should query documentation and return results', async () => {
  const store = new DocumentationVectorStoreService();
  const tempDir = path.join(__dirname, 'temp-query-repo');

  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  const readmePath = path.join(tempDir, 'README.md');
  fs.writeFileSync(
    readmePath,
    `# Architecture Standards

## Design Patterns Used
We implement the singleton pattern for database connections and use dependency injection
for service layer. The factory pattern is used for object creation.

## Naming Conventions
- Classes use PascalCase
- Functions use camelCase
- Constants use UPPER_SNAKE_CASE

## Code Organization
All code is organized by feature in separate directories.
`
  );

  try {
    await store.initialize(tempDir, ['*.md'], ['node_modules/**'], 1000);

    // Query for design patterns
    const result = await store.query('What design patterns should we use?', { topK: 3 });

    assert(result !== null, 'Query should return results');
    assert(result.chunks !== undefined, 'Result should have chunks');
    assert(result.summary !== undefined, 'Result should have summary');
    assert(
      result.summary.includes('Found') || result.summary.includes('relevant'),
      'Summary should mention results'
    );
  } finally {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true });
    }
  }
});

test('Should handle query on uninitialized store', async () => {
  const store = new DocumentationVectorStoreService();
  const result = await store.query('test question', { topK: 3 });

  assert(result !== null, 'Should return result even if uninitialized');
  assert(result.chunks.length === 0, 'Should return empty chunks');
  assert(result.summary.includes('not initialized'), 'Summary should indicate uninitialized state');
});

test('Should return empty results for no matches', async () => {
  const store = new DocumentationVectorStoreService();
  const tempDir = path.join(__dirname, 'temp-nomatch-repo');

  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  const readmePath = path.join(tempDir, 'README.md');
  fs.writeFileSync(readmePath, '# Some Documentation\n\nThis is test content.');

  try {
    await store.initialize(tempDir, ['*.md'], ['node_modules/**'], 1000);

    // Query for something completely unrelated with very low score threshold
    const result = await store.query('xyzabc quantum chromodynamics', { topK: 3 });

    // Result may be empty or have low-relevance items
    assert(result !== null, 'Should return result object');
    assert(
      result.summary.includes('No relevant') || result.summary.includes('not initialized'),
      'Summary should indicate no relevant results'
    );
  } finally {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true });
    }
  }
});

// ============================================================================
// TEST SUITE 3: CombinedRAGHelper Integration
// ============================================================================

log(colors.blue, '\n📋 TEST SUITE 3: CombinedRAGHelper Integration\n');

test('Should create CombinedRAGHelper with both stores', async () => {
  const docStore = new DocumentationVectorStoreService();
  const diffStore = new DiffVectorStoreService('test-commit');

  // Initialize both stores with minimal data
  const tempDir = path.join(__dirname, 'temp-combined-repo');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  const readmePath = path.join(tempDir, 'README.md');
  fs.writeFileSync(readmePath, '# Documentation\n\nThis is documentation.');

  try {
    await docStore.initialize(tempDir, ['*.md'], ['node_modules/**'], 1000);

    const rag = new CombinedRAGHelper(diffStore, docStore);
    assert(rag !== null, 'CombinedRAGHelper should be created');
    assert(typeof rag.query === 'function', 'Should have query method');
    assert(typeof rag.queryMultiple === 'function', 'Should have queryMultiple method');
    assert(typeof rag.getSummary === 'function', 'Should have getSummary method');
  } finally {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true });
    }
  }
});

test('Should check if RAG is available', async () => {
  const docStore = new DocumentationVectorStoreService();

  // Test with both stores
  let context1 = { vectorStore: undefined, documentationStore: docStore };
  assert(CombinedRAGHelper.isAvailable(context1), 'Should be available with documentation store');

  // Test with neither store
  let context2 = { vectorStore: undefined, documentationStore: undefined };
  assert(!CombinedRAGHelper.isAvailable(context2), 'Should not be available without stores');
});

test('Should query CombinedRAGHelper with documentation preference', async () => {
  const docStore = new DocumentationVectorStoreService();
  const tempDir = path.join(__dirname, 'temp-pref-repo');

  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  const readmePath = path.join(tempDir, 'README.md');
  fs.writeFileSync(
    readmePath,
    '# Architecture Patterns\n\nWe use the service pattern for all business logic.'
  );

  try {
    await docStore.initialize(tempDir, ['*.md'], ['node_modules/**'], 1000);

    const rag = new CombinedRAGHelper(undefined, docStore);
    const result = await rag.query('What patterns do we use?', 3, 'docs');

    assert(result !== null, 'Should return result');
    assert(typeof result === 'string', 'Result should be a string');
  } finally {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true });
    }
  }
});

test('Should handle queryMultiple with store preferences', async () => {
  const docStore = new DocumentationVectorStoreService();
  const tempDir = path.join(__dirname, 'temp-multi-repo');

  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  const readmePath = path.join(tempDir, 'README.md');
  fs.writeFileSync(
    readmePath,
    `# Standards

## Code Review Standards
Code reviews must check for performance, security, and maintainability.

## Testing Standards
All new features must have tests with 80% minimum coverage.
`
  );

  try {
    await docStore.initialize(tempDir, ['*.md'], ['node_modules/**'], 1000);

    const rag = new CombinedRAGHelper(undefined, docStore);
    const queries = [
      { q: 'What are code review standards?', topK: 2, store: 'docs' as const },
      { q: 'What testing standards exist?', topK: 2, store: 'docs' as const },
    ];

    const results = await rag.queryMultiple(queries);

    assert(Array.isArray(results), 'Should return array of results');
    assert(results.length === 2, 'Should return 2 results');
    assert(results[0].query !== undefined, 'Each result should have query');
    assert(results[0].results !== undefined, 'Each result should have results');
  } finally {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true });
    }
  }
});

test('Should get combined summary', async () => {
  const docStore = new DocumentationVectorStoreService();
  const tempDir = path.join(__dirname, 'temp-summary-repo');

  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  const readmePath = path.join(tempDir, 'README.md');
  fs.writeFileSync(readmePath, '# Docs\n\nTest documentation content here.');

  try {
    await docStore.initialize(tempDir, ['*.md'], ['node_modules/**'], 1000);

    const rag = new CombinedRAGHelper(undefined, docStore);
    const summary = rag.getSummary();

    assert(summary !== null, 'Summary should not be null');
    assert(typeof summary === 'string', 'Summary should be string');
    assert(summary.includes('Documentation'), 'Summary should mention documentation');
  } finally {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true });
    }
  }
});

// ============================================================================
// TEST SUITE 4: Memory Management & Cleanup
// ============================================================================

log(colors.blue, '\n📋 TEST SUITE 4: Memory Management & Cleanup\n');

test('Should clear documentation store', async () => {
  const store = new DocumentationVectorStoreService();
  const tempDir = path.join(__dirname, 'temp-clear-repo');

  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  const readmePath = path.join(tempDir, 'README.md');
  fs.writeFileSync(readmePath, '# Test\n\nContent');

  try {
    await store.initialize(tempDir, ['*.md'], ['node_modules/**'], 1000);

    let stats = store.getStats();
    assert(stats.chunksCreated > 0, 'Should have chunks after initialization');

    store.clear();

    stats = store.getStats();
    assert(stats.chunksCreated === 0, 'Chunks should be 0 after clear');
  } finally {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true });
    }
  }
});

// ============================================================================
// FINAL REPORT
// ============================================================================

async function runAllTests() {
  log(colors.blue, '\n' + '='.repeat(70));
  log(colors.blue, '  Global Documentation Vector Store - Validation Tests');
  log(colors.blue, '='.repeat(70));

  // Run all tests
  // Tests are executed as they are defined above

  // Generate final report
  log(colors.blue, '\n' + '='.repeat(70));
  log(colors.blue, '  Test Results Summary');
  log(colors.blue, '='.repeat(70) + '\n');

  const passed = results.filter((r) => r.status === 'PASS').length;
  const failed = results.filter((r) => r.status === 'FAIL').length;
  const total = results.length;
  const totalDuration = results.reduce((sum, r) => sum + (r.duration || 0), 0);

  log(colors.green, `✓ Passed: ${passed}/${total}`);
  if (failed > 0) {
    log(colors.red, `✗ Failed: ${failed}/${total}`);
  }
  log(colors.yellow, `⏱  Total Duration: ${totalDuration}ms\n`);

  // Details
  results.forEach((r) => {
    const status = r.status === 'PASS' ? colors.green + '✓' : colors.red + '✗';
    const duration = r.duration ? ` (${r.duration}ms)` : '';
    log(colors.reset, `  ${status}${colors.reset} ${r.name}${duration}`);
    if (r.status === 'FAIL') {
      log(colors.red, `    → ${r.message}`);
    }
  });

  log(colors.blue, '\n' + '='.repeat(70) + '\n');

  if (failed === 0) {
    log(colors.green, '✅ All tests passed! Implementation is valid.\n');
    process.exit(0);
  } else {
    log(colors.red, `❌ ${failed} test(s) failed.\n`);
    process.exit(1);
  }
}

// Export for testing
export { test, assert, runAllTests, results };

// Run if executed directly
if (require.main === module) {
  runAllTests().catch((error) => {
    log(colors.red, `Fatal error: ${error.message}`);
    process.exit(1);
  });
}
