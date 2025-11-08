
import * as fs from 'fs';
import chalk from 'chalk';
import crypto from 'crypto';
import { spawnSync } from 'child_process';
import { CommitEvaluationOrchestrator } from '../../src/orchestrator/commit-evaluation-orchestrator';
import { loadConfig, configExists } from '../../src/config/config-loader';
import { generateHtmlReport } from '../../src/formatters/html-report-formatter';
import path from 'path';
import {
    createAgentRegistry,
    generateTimestamp,
    saveEvaluationReports,
    createEvaluationDirectory,
    EvaluationMetadata,
    printEvaluateCompletionMessage,
} from '../utils/shared.utils';

/**
 * Extract commit hash from diff content
 */
function extractCommitHash(diff: string): string | null {
    // Try to find commit hash in diff header (git diff output)
    const commitMatch = diff.match(/^commit ([a-f0-9]{40})/m);
    if (commitMatch) {
        return commitMatch[1].substring(0, 8); // Use short hash
    }

    // Try to find in "From" line (git format-patch)
    const fromMatch = diff.match(/^From ([a-f0-9]{40})/m);
    if (fromMatch) {
        return fromMatch[1].substring(0, 8);
    }

    return null;
}

/**
 * Generate commit hash from diff content if not found
 */
function generateDiffHash(diff: string): string {
    return crypto.createHash('sha256').update(diff).digest('hex').substring(0, 8);
}

/**
 * Create structured output directory for commit evaluation
 */
function createOutputDirectory(diff: string, baseDir: string = '.'): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    const timestamp = `${year}${month}${day}${hours}${minutes}${seconds}`;

    // Try to extract commit hash, fallback to generated hash
    const commitHash = extractCommitHash(diff) || generateDiffHash(diff);

    // Create directory: .evaluated-commits/commit-hash_yyyyMMddHHmmss
    const evaluationsRoot = path.join(baseDir, '.evaluated-commits');
    const commitDir = path.join(evaluationsRoot, `${commitHash}_${timestamp}`);

    // Create directories recursively
    if (!fs.existsSync(evaluationsRoot)) {
        fs.mkdirSync(evaluationsRoot, { recursive: true });
    }

    if (!fs.existsSync(commitDir)) {
        fs.mkdirSync(commitDir, { recursive: true });
    }

    return commitDir;
}

/**
 * Get diff from git for a specific commit hash
 */
function getDiffFromCommit(commitHash: string, repoPath: string = '.'): string {
    const result = spawnSync('git', ['show', commitHash], {
        cwd: repoPath,
        encoding: 'utf-8',
        maxBuffer: 10 * 1024 * 1024,
    });

    if (result.error) {
        throw result.error;
    }
    if (result.status !== 0) {
        throw new Error(`Git command failed: ${result.stderr}`);
    }

    return result.stdout;
}

/**
 * Get diff from current staged changes
 */
function getDiffFromStaged(repoPath: string = '.'): string {
    const result = spawnSync('git', ['diff', '--cached'], {
        cwd: repoPath,
        encoding: 'utf-8',
        maxBuffer: 10 * 1024 * 1024,
    });

    if (result.error) {
        throw result.error;
    }
    if (result.status !== 0) {
        throw new Error(`Git command failed: ${result.stderr}`);
    }

    if (!result.stdout || result.stdout.trim().length === 0) {
        throw new Error('No staged changes found. Use "git add" to stage your changes first.');
    }

    return result.stdout;
}

/**
 * Get diff from current working directory changes (staged + unstaged)
 */
function getDiffFromCurrent(repoPath: string = '.'): string {
    const result = spawnSync('git', ['diff', 'HEAD'], {
        cwd: repoPath,
        encoding: 'utf-8',
        maxBuffer: 10 * 1024 * 1024,
    });

    if (result.error) {
        throw result.error;
    }
    if (result.status !== 0) {
        throw new Error(`Git command failed: ${result.stderr}`);
    }

    if (!result.stdout || result.stdout.trim().length === 0) {
        throw new Error('No changes found in working directory.');
    }

    return result.stdout;
}

export async function runEvaluateCommand(args: string[]) {
    // Parse arguments
    let diff: string | null = null;
    let source = 'file';
    let sourceDescription = '';
    let repoPath = '.';

    // Check for flags
    if (args.includes('--commit')) {
        const commitIdx = args.indexOf('--commit');
        const commitHash = args[commitIdx + 1];
        if (!commitHash) {
            console.error(chalk.red('Error: --commit requires a commit hash'));
            console.log('\nUsage: codewave evaluate --commit <hash> [--repo <path>]');
            process.exit(1);
        }

        if (args.includes('--repo')) {
            const repoIdx = args.indexOf('--repo');
            repoPath = args[repoIdx + 1];
        }

        console.log(chalk.cyan(`\n📦 Fetching diff for commit: ${commitHash}\n`));
        diff = getDiffFromCommit(commitHash, repoPath);
        source = 'commit';
        sourceDescription = commitHash;
    } else if (args.includes('--staged')) {
        if (args.includes('--repo')) {
            const repoIdx = args.indexOf('--repo');
            repoPath = args[repoIdx + 1];
        }

        console.log(chalk.cyan('\n📝 Evaluating staged changes...\n'));
        diff = getDiffFromStaged(repoPath);
        source = 'staged';
        sourceDescription = 'staged changes';
    } else if (args.includes('--current')) {
        if (args.includes('--repo')) {
            const repoIdx = args.indexOf('--repo');
            repoPath = args[repoIdx + 1];
        }

        console.log(chalk.cyan('\n📝 Evaluating current changes...\n'));
        diff = getDiffFromCurrent(repoPath);
        source = 'current';
        sourceDescription = 'current changes';
    } else if (args[0]) {
        // Original behavior: diff file
        const diffFile = args[0];
        if (!fs.existsSync(diffFile)) {
            console.error(chalk.red(`Error: Diff file not found: ${diffFile}`));
            process.exit(1);
        }
        diff = fs.readFileSync(diffFile, 'utf-8');
        source = 'file';
        sourceDescription = path.basename(diffFile);
    } else {
        console.error(chalk.red('Error: No input provided'));
        console.log('\nUsage:');
        console.log('  codewave evaluate <diffFile>              # Evaluate from diff file');
        console.log('  codewave evaluate --commit <hash>         # Evaluate specific commit');
        console.log('  codewave evaluate --staged                # Evaluate staged changes');
        console.log('  codewave evaluate --current               # Evaluate all current changes');
        console.log('\nOptions:');
        console.log('  --repo <path>   Repository path (default: current directory)');
        console.log('  --stream        Enable streaming output');
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
    console.log(chalk.gray(`📄 Source: ${sourceDescription}\n`));

    // Create agent registry with all agents
    const agentRegistry = createAgentRegistry(config);

    const orchestrator = new CommitEvaluationOrchestrator(agentRegistry, config);
    const context = {
        commitDiff: diff,
        filesChanged: [],
        config,
    };

    // Check for --stream flag
    const streamingEnabled = args.includes('--stream');

    const evaluationResult = await orchestrator.evaluateCommit(context, {
        streaming: streamingEnabled,
        threadId: `eval-${Date.now()}`,
        onProgress: (state) => {
            // Optional: emit progress events for UI integration
            if (streamingEnabled && state?.agentResults?.length > 0) {
                console.log(chalk.gray(`  📦 Intermediate results: ${state.agentResults.length} agents`));
            }
        },
    });
    const results = evaluationResult.agentResults || [];

    // Determine commit hash and metadata for directory naming
    let commitHash = extractCommitHash(diff);
    let commitAuthor: string | undefined;
    let commitMessage: string | undefined;
    let commitDate: string | undefined;
    let fullCommitHash: string | undefined; // Store full hash for metadata

    if (source === 'commit' && sourceDescription) {
        // Use sourceDescription for fetching metadata, but ensure 8-char short hash for directory
        fullCommitHash = sourceDescription;
        commitHash = sourceDescription.substring(0, 8); // Ensure 8 chars for consistency

        // Get commit metadata
        const showResult = spawnSync('git', ['show', '--no-patch', '--format=%an|||%s|||%aI', sourceDescription], {
            cwd: repoPath,
            encoding: 'utf-8',
        });
        if (showResult.status === 0 && showResult.stdout) {
            const [author, message, date] = showResult.stdout.trim().split('|||');
            commitAuthor = author;
            commitMessage = message;
            commitDate = date;
        }
    } else if (!commitHash) {
        // Fallback to generated hash if no commit hash found
        commitHash = generateDiffHash(diff);
    }

    // Create evaluation directory
    const outputDir = await createEvaluationDirectory(commitHash);

    // Prepare metadata
    const metadata: EvaluationMetadata = {
        timestamp: new Date().toISOString(),
        commitHash: fullCommitHash || commitHash, // Use full hash if available, otherwise short hash
        commitAuthor,
        commitMessage,
        commitDate,
        source,
        developerOverview: evaluationResult.developerOverview,
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
