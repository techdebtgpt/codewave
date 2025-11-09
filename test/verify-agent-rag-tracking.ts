/**
 * Agent RAG Tracking Verification Script
 *
 * Demonstrates how to verify which agents queried the documentation vector store,
 * what queries were made, and what results were found.
 */

import { CombinedRAGHelper } from '../src/utils/combined-rag-helper';
import { DocumentationVectorStoreService } from '../src/services/documentation-vector-store.service';
import * as path from 'path';
import * as fs from 'fs';

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

async function main() {
  console.log(
    `${colors.blue}╔═══════════════════════════════════════════════════════════╗${colors.reset}`
  );
  console.log(
    `${colors.blue}║   Agent RAG Tracking Verification                       ║${colors.reset}`
  );
  console.log(
    `${colors.blue}╚═══════════════════════════════════════════════════════════╝${colors.reset}`
  );
  console.log('');

  // Initialize documentation store
  console.log(`${colors.cyan}📚 Initializing Documentation Vector Store...${colors.reset}`);
  const docStore = new DocumentationVectorStoreService();
  const tempDir = path.join(__dirname, 'temp-verify-docs');

  // Create sample markdown files
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  const readmePath = path.join(tempDir, 'README.md');
  fs.writeFileSync(
    readmePath,
    `# Architecture Documentation

## Design Patterns
- Use singleton pattern for database connections
- Implement dependency injection in services
- Apply factory pattern for object creation

## Code Organization
- Organize code by feature in separate directories
- Follow consistent naming conventions
- Maintain separation of concerns

## API Standards
- RESTful API design principles
- Consistent error handling
- Proper HTTP status codes
`
  );

  const testingPath = path.join(tempDir, 'TESTING.md');
  fs.writeFileSync(
    testingPath,
    `# Testing Standards

## Unit Tests
- All functions must have unit test coverage
- Minimum 80% code coverage required
- Use descriptive test names

## Integration Tests
- Test component interactions
- Verify database operations
- Validate API endpoints

## Test Framework
- Use Jest for unit testing
- Use Supertest for API testing
- Maintain fixtures for consistent test data
`
  );

  await docStore.initialize(tempDir, ['*.md'], ['node_modules/**'], 1000);
  console.log(`${colors.green}✓ Documentation store initialized${colors.reset}`);
  console.log('');

  // Simulate agent queries with tracking
  console.log(`${colors.cyan}🔍 Simulating Agent Queries...${colors.reset}`);
  console.log('');

  // Simulate Senior Architect queries
  console.log(`${colors.yellow}Agent 1: Senior Architect${colors.reset}`);
  const architectRag = new CombinedRAGHelper(undefined, docStore);
  architectRag.setAgentName('Senior Architect');

  const architectQueries = [
    { q: 'What design patterns are documented?', topK: 2, store: 'docs' as const },
    { q: 'What architecture standards exist?', topK: 2, store: 'docs' as const },
  ];
  await architectRag.queryMultiple(architectQueries);
  console.log(`  ✓ Executed ${architectQueries.length} queries`);

  // Simulate SDET queries
  console.log(`${colors.yellow}Agent 2: SDET (Test Automation Engineer)${colors.reset}`);
  const sdetRag = new CombinedRAGHelper(undefined, docStore);
  sdetRag.setAgentName('SDET (Test Automation Engineer)');

  const sdetQueries = [
    { q: 'What testing standards are documented?', topK: 2, store: 'docs' as const },
    { q: 'What is the test coverage requirement?', topK: 2, store: 'docs' as const },
  ];
  await sdetRag.queryMultiple(sdetQueries);
  console.log(`  ✓ Executed ${sdetQueries.length} queries`);

  // Simulate Developer Author queries
  console.log(`${colors.yellow}Agent 3: Developer (Author)${colors.reset}`);
  const authorRag = new CombinedRAGHelper(undefined, docStore);
  authorRag.setAgentName('Developer (Author)');

  const authorQueries = [
    { q: 'What code organization standards apply?', topK: 2, store: 'docs' as const },
  ];
  await authorRag.queryMultiple(authorQueries);
  console.log(`  ✓ Executed ${authorQueries.length} queries`);

  console.log('');
  console.log(
    `${colors.blue}═══════════════════════════════════════════════════════════${colors.reset}`
  );
  console.log(`${colors.cyan}📊 RAG Tracking Report${colors.reset}`);
  console.log(
    `${colors.blue}═══════════════════════════════════════════════════════════${colors.reset}`
  );
  console.log('');

  // Get and display tracking report
  const report = CombinedRAGHelper.getTrackingReport();
  console.log(report);

  // Get summary statistics
  console.log(
    `${colors.blue}═══════════════════════════════════════════════════════════${colors.reset}`
  );
  console.log(`${colors.cyan}📈 Summary Statistics${colors.reset}`);
  console.log(
    `${colors.blue}═══════════════════════════════════════════════════════════${colors.reset}`
  );
  console.log('');

  const agentsCheckedDocs = CombinedRAGHelper.getAgentsCheckedDocs();
  const coverage = CombinedRAGHelper.getDocumentationCoverage();
  const trackingData = CombinedRAGHelper.exportTrackingData();

  console.log(`${colors.green}✓ Agents That Checked Documentation:${colors.reset}`);
  agentsCheckedDocs.forEach((agent) => {
    console.log(`  - ${agent}`);
  });

  console.log('');
  console.log(`${colors.green}✓ Documentation Coverage:${colors.reset}`);
  console.log(`  ${coverage.toFixed(1)}% of queries used documentation`);

  console.log('');
  console.log(`${colors.green}✓ Total Tracking Data:${colors.reset}`);
  console.log(`  Timestamp: ${new Date(trackingData.timestamp).toISOString()}`);
  console.log(`  Total Queries: ${trackingData.totalQueries}`);
  console.log(`  Total Agents: ${trackingData.agents.length}`);

  // Export tracking data
  const exportPath = path.join(__dirname, 'rag-tracking-export.json');
  fs.writeFileSync(exportPath, JSON.stringify(trackingData, null, 2));
  console.log(`  Export saved to: ${exportPath}`);

  console.log('');
  console.log(
    `${colors.blue}═══════════════════════════════════════════════════════════${colors.reset}`
  );
  console.log(`${colors.green}✅ Tracking Verification Complete${colors.reset}`);
  console.log(
    `${colors.blue}═══════════════════════════════════════════════════════════${colors.reset}`
  );

  // Cleanup
  if (fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true });
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`${colors.red}Error: ${error.message}${colors.reset}`);
    process.exit(1);
  });
}

export { main };
