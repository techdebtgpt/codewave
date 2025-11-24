import * as fs from 'fs';
import chalk from 'chalk';
import { spawnSync } from 'child_process';
import { CommitEvaluationOrchestrator } from '../../src/orchestrator/commit-evaluation-orchestrator';
import { loadConfig, configExists } from '../../src/config/config-loader';
import * as path from 'path';
import {
  createAgentRegistry,
  saveEvaluationReports,
  createEvaluationDirectory,
  EvaluationMetadata,
  printEvaluateCompletionMessage,
} from '../utils/shared.utils';
import { parseCommitStats } from '../../src/common/utils/commit-utils';
import {
  getCommitDiff,
  getDiffFromStaged,
  getDiffFromCurrent,
  extractCommitHash,
  generateDiffHash,
} from '../utils/git-utils';

export async function runEvaluateCommand(args: string[]) {
  // Parse arguments
  let diff: string | null = null;
  let source = 'commit';
  let sourceDescription = '';
  let repoPath = '.';
  let depthMode: 'fast' | 'normal' | 'deep' = 'normal';

  // Handle repo path first (it can appear with any other flag)
  if (args.includes('--repo')) {
    const repoIdx = args.indexOf('--repo');
    repoPath = args[repoIdx + 1];
    if (!repoPath) {
      console.error(chalk.red('Error: --repo requires a path'));
      process.exit(1);
    }
  }

  // Handle depth mode flag
  if (args.includes('--depth')) {
    const depthIdx = args.indexOf('--depth');
    const depthValue = args[depthIdx + 1];
    if (!depthValue || !['fast', 'normal', 'deep'].includes(depthValue)) {
      console.error(chalk.red('Error: --depth must be one of: fast, normal, deep'));
      process.exit(1);
    }
    depthMode = depthValue as 'fast' | 'normal' | 'deep';
  }

  // Check for flags or positional arguments
  if (args.includes('--staged')) {
    console.log(chalk.cyan('\n📝 Evaluating staged changes...\n'));
    diff = getDiffFromStaged(repoPath);
    source = 'staged';
    sourceDescription = 'staged changes';
  } else if (args.includes('--current')) {
    console.log(chalk.cyan('\n📝 Evaluating current changes...\n'));
    diff = getDiffFromCurrent(repoPath);
    source = 'current';
    sourceDescription = 'current changes';
  } else if (args.includes('--file')) {
    const fileIdx = args.indexOf('--file');
    const diffFile = args[fileIdx + 1];
    if (!diffFile) {
      console.error(chalk.red('Error: --file requires a file path'));
      console.log('\nUsage: codewave evaluate --file <path>');
      process.exit(1);
    }

    if (!fs.existsSync(diffFile)) {
      console.error(chalk.red(`Error: Diff file not found: ${diffFile}`));
      process.exit(1);
    }
    diff = fs.readFileSync(diffFile, 'utf-8');
    source = 'file';
    sourceDescription = path.basename(diffFile);
  } else if (args.includes('--commit')) {
    // Support legacy --commit flag (backward compatibility)
    const commitIdx = args.indexOf('--commit');
    const commitHash = args[commitIdx + 1];
    if (!commitHash) {
      console.error(chalk.red('Error: --commit requires a commit hash'));
      console.log('\nUsage: codewave evaluate --commit <hash> [--repo <path>]');
      process.exit(1);
    }

    console.log(chalk.cyan(`\n📦 Fetching diff for commit: ${commitHash}\n`));
    diff = getCommitDiff(commitHash, repoPath);
    source = 'commit';
    sourceDescription = commitHash;
  } else if (args[0] && !args[0].startsWith('--')) {
    // Positional argument: treat as commit hash (default behavior)
    const commitHash = args[0];
    console.log(chalk.cyan(`\n📦 Fetching diff for commit: ${commitHash}\n`));
    diff = getCommitDiff(commitHash, repoPath);
    source = 'commit';
    sourceDescription = commitHash;
  } else {
    // No input provided - show usage
    console.error(chalk.red('Error: No input provided'));
    console.log('\nUsage:');
    console.log('  codewave evaluate <commit-hash>          # Evaluate specific commit (default)');
    console.log('  codewave evaluate HEAD                   # Evaluate HEAD commit');
    console.log(
      '  codewave evaluate --commit <hash>        # Evaluate with explicit flag (legacy)'
    );
    console.log('  codewave evaluate --staged               # Evaluate staged changes');
    console.log(
      '  codewave evaluate --current              # Evaluate all current changes (staged + unstaged)'
    );
    console.log('  codewave evaluate --file <path>          # Evaluate from diff file');
    console.log('\nOptions:');
    console.log('  --repo <path>    Repository path (default: current directory)');
    console.log('  --depth <mode>   Analysis depth: fast, normal, deep (default: normal)');
    console.log('  --no-stream      Disable streaming output (silent mode)');
    process.exit(1);
  }

  if (!diff || diff.trim().length === 0) {
    console.error(chalk.red('Error: No diff content found'));
    process.exit(1);
  }

  // Check if config exists first
  if (!configExists()) {
    console.log(chalk.red('\n❌ No configuration found!\n'));
    console.log(chalk.yellow('You need to set up the configuration before evaluating commits.\n'));
    console.log(chalk.cyan('Quick setup:'));
    console.log(chalk.white('  1. Run: ') + chalk.green('codewave config --init'));
    console.log(chalk.white('  2. Follow the interactive setup'));
    console.log(chalk.white('  3. Run evaluate again\n'));
    process.exit(1);
  }

  // Load config from file
  const config = loadConfig();

  if (!config) {
    console.log(chalk.red('\n❌ Failed to load configuration file!\n'));
    console.log(chalk.yellow('Run: codewave config --init\n'));
    process.exit(1);
  }

  // Apply depth mode to config
  config.agents.depthMode = depthMode;

  // Get API key for selected provider
  const provider = config.llm.provider;
  const apiKey = config.apiKeys[provider];

  if (!apiKey) {
    console.log(chalk.red(`\n❌ No API key configured for provider: ${provider}\n`));
    console.log(chalk.yellow('Add your API key with:'));
    console.log(chalk.white(`  codewave config --set apiKeys.${provider}=<your-api-key>\n`));
    process.exit(1);
  }

  console.log(chalk.cyan(`\n🤖 Using ${provider} (${config.llm.model})`));
  console.log(chalk.gray(`📄 Source: ${sourceDescription}`));
  console.log(chalk.gray(`🎯 Depth: ${depthMode}\n`));

  // Extract commit hash before evaluation for logging
  let commitHash = extractCommitHash(diff);
  if (source === 'commit' && sourceDescription) {
    commitHash = sourceDescription.substring(0, 8); // Ensure 8 chars for consistency
  } else if (!commitHash) {
    commitHash = generateDiffHash(diff);
  }

  // Create agent registry with all agents
  const agentRegistry = createAgentRegistry(config);

  const orchestrator = new CommitEvaluationOrchestrator(agentRegistry, config);
  const context = {
    commitDiff: diff,
    filesChanged: [],
    commitHash, // Add commit hash to context for logging
    config,
  };

  // Check for --no-stream flag (streaming enabled by default)
  const streamingEnabled = !args.includes('--no-stream');

  // Save original console methods before suppressing
  const originalConsoleLog = console.log;
  const originalConsoleWarn = console.warn;
  const originalConsoleError = console.error;

  // Helper to check if a message is a diagnostic log (should be filtered)
  const isDiagnosticLog = (args: any[]): boolean => {
    const message = String(args[0] || '');

    // IMPORTANT: Explicitly allow round summaries and important progress messages through
    // These should NOT be filtered even if they match other patterns
    if (message.includes('📋 Round') && message.includes('Summary:')) return false;
    if (message.includes('💰 Tokens:') && message.includes('Cost:')) return false;
    if (message.includes('🎯 Team Convergence:') || message.includes('🔄 Team Convergence:'))
      return false;
    if (message.includes('💭 Team raised') && message.includes('concern')) return false;
    if (message.includes('✅') && message.includes('% clarity (') && message.includes('iteration'))
      return false;
    if (message.includes('✅ Completed:') && message.includes('agent')) return false;
    if (message.includes('🚀 Starting') && message.includes('agent')) return false;
    // Allow round start headers
    if (message.match(/🔄.*Round \d+\/\d+ \((Initial Analysis|Team Discussion|Final Review)\)/))
      return false;
    // Allow final evaluation summary
    if (message.includes('✅ Evaluation complete in')) return false;
    if (message.includes('Total agents:')) return false;
    if (message.includes('Discussion rounds:')) return false;
    if (message.includes('🎯 Converged early')) return false;
    // Allow developer overview generation progress
    if (message.includes('📝 Generating developer overview')) return false;
    if (message.includes('✅ Developer overview generated')) return false;
    // Allow vector store initialization (always enabled now)
    if (message.includes('📦 Large diff detected')) return false;
    if (message.includes('📦 Initializing RAG vector store')) return false;
    if (message.includes('✅ Indexed') && message.includes('chunks from')) return false;

    // Filter out vector store diagnostic logs
    if (message.includes('Found file via diff')) return true;
    if (message.includes('Line ') && message.includes(':')) return true;
    if (message.includes('Confirmed file via')) return true;
    if (message.includes('Building in-memory vector store')) return true;
    if (message.includes('Vector store ready')) return true;
    if (message.includes('Parsing ') && message.includes('lines')) return true;
    if (message.includes('Detecting agent')) return true;
    if (message.includes('Developer overview generated')) return true;
    if (message.includes('State update from')) return true;
    if (message.includes('Streaming enabled')) return true;
    if (message.includes('Indexing:')) return true;
    if (message.includes('Cleaning up vector store')) return true;
    if (message.includes('Detected') && message.includes('unique agents')) return true;
    if (message.includes('responses (rounds:')) return true;
    // Filter out orchestrator status messages
    if (message.includes('🚀 Starting commit evaluation')) return true;
    if (message.includes('First 3 lines:')) return true;
    if (message.includes('files | +') && message.includes('-')) return true;
    if (message.includes('Round ') && message.includes('Analysis')) return true;
    // Filter out round information logs (e.g., "[3/4] 🔄 6b66968 - Round 2/3")
    if (/\[\d+\/\d+\]\s*🔄/.test(message)) return true;
    if (message.includes('Round ') && message.includes('Raising Concerns')) return true;
    if (message.includes('Round ') && message.includes('Validation & Final')) return true;
    // Filter out agent iteration logs (verbose internal refinement)
    if (message.includes('Starting initial analysis (iteration')) return true;
    if (message.includes('Refining analysis (iteration')) return true;
    if (message.includes('Clarity ') && message.includes('% (threshold:')) return true;
    if (message.includes('🔄') && message.includes('[Round ') && message.includes(']: '))
      return true;
    if (message.includes('📊') && message.includes('[Round ') && message.includes(']: '))
      return true;
    if (message.includes('🔍 [Round ') && message.includes('] Executing ')) return true;
    // Filter HTML formatter diagnostic logs
    if (message.includes('Detected') && message.includes('unique agents:')) return true;
    if (message.includes('responses (rounds:') && /\d+, \d+/.test(message)) return true;
    // Filter LangSmith warnings
    if (message.includes('[LANGSMITH]:') && message.includes('Failed to fetch info')) return true;

    return false;
  };

  // Track suppression state
  let suppressOutput = false;

  // Override console methods to suppress diagnostic output during evaluation
  console.log = (...args: any[]) => {
    if (!suppressOutput) {
      originalConsoleLog(...args);
    } else {
      // If it's a diagnostic log, suppress it (don't print or buffer)
      // If it's NOT a diagnostic log (important message), print immediately
      if (isDiagnosticLog(args)) {
        // Suppress diagnostic logs completely
        return;
      } else {
        // Print important messages immediately in real-time
        originalConsoleLog(...args);
      }
    }
  };

  console.warn = (...args: any[]) => {
    if (!suppressOutput) {
      originalConsoleWarn(...args);
    } else {
      if (isDiagnosticLog(args)) {
        return; // Suppress diagnostic warnings
      } else {
        originalConsoleWarn(...args); // Print important warnings immediately
      }
    }
  };

  console.error = (...args: any[]) => {
    if (!suppressOutput) {
      originalConsoleError(...args);
    } else {
      // Always print errors immediately
      originalConsoleError(...args);
    }
  };

  // Print evaluation start message
  originalConsoleLog('\n🚀 Starting commit evaluation...\n');

  // Start suppressing output during evaluation
  suppressOutput = true;

  const evaluationResult = await orchestrator.evaluateCommit(context, {
    streaming: streamingEnabled,
    threadId: `eval-${Date.now()}`,
    onProgress: (state: any) => {
      // For single evaluate with LangSmith (no streaming), onProgress is called once at end
      // Just track final state for summary
    },
  });

  // Restore original console methods
  console.log = originalConsoleLog;
  console.warn = originalConsoleWarn;
  console.error = originalConsoleError;

  // No need to print buffered output since we're now printing important messages immediately
  const results = evaluationResult.agentResults || [];

  // Determine metadata for directory naming (commitHash already extracted before evaluation)
  let commitAuthor: string | undefined;
  let commitMessage: string | undefined;
  let commitDate: string | undefined;
  let fullCommitHash: string | undefined; // Store full hash for metadata

  if (source === 'commit' && sourceDescription) {
    // Use sourceDescription for fetching metadata
    fullCommitHash = sourceDescription;

    // Get commit metadata
    const showResult = spawnSync(
      'git',
      ['show', '--no-patch', '--format=%an|||%s|||%aI', sourceDescription],
      {
        cwd: repoPath,
        encoding: 'utf-8',
      }
    );
    if (showResult.status === 0 && showResult.stdout) {
      const [author, message, date] = showResult.stdout.trim().split('|||');
      commitAuthor = author;
      commitMessage = message;
      commitDate = date;
    }
  }

  // Create evaluation directory
  const outputDir = await createEvaluationDirectory(commitHash);

  // Calculate commit statistics from diff
  const commitStats = parseCommitStats(diff);

  // Prepare metadata
  const metadata: EvaluationMetadata = {
    timestamp: new Date().toISOString(),
    commitHash: fullCommitHash || commitHash, // Use full hash if available, otherwise short hash
    commitAuthor,
    commitMessage,
    commitDate,
    source,
    developerOverview: evaluationResult.developerOverview,
    commitStats,
  };

  // Save all reports using shared utility
  await saveEvaluationReports({
    agentResults: results,
    outputDir,
    metadata,
    diff,
    developerOverview: evaluationResult.developerOverview,
  });

  // Print completion message using shared function
  printEvaluateCompletionMessage(outputDir);
}
