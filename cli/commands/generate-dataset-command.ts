// cli/commands/generate-dataset-command.ts
// CLI command for generating benchmark datasets from commits

import chalk from 'chalk';
import * as fs from 'fs';
import * as path from 'path';
import { generateDataset } from '../../src/benchmark/benchmark-runner';
import { printDatasetComplete } from '../../src/benchmark/benchmark-reporter';
import { GenerateDatasetOptions } from '../../src/benchmark/types';

/**
 * Parse CLI arguments for generate-dataset command
 */
function parseArgs(args: string[]): GenerateDatasetOptions & { commitsFile?: string } {
  const options: GenerateDatasetOptions & { commitsFile?: string } = {
    commits: [],
    repoPath: '.',
    outputPath: './benchmark-dataset.csv',
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--commits' || arg === '-c') {
      options.commits = args[++i].split(',').map((s) => s.trim());
    } else if (arg === '--commits-file' || arg === '-f') {
      options.commitsFile = args[++i];
    } else if (arg === '--repo' || arg === '-r') {
      options.repoPath = args[++i];
    } else if (arg === '--output' || arg === '-o') {
      options.outputPath = args[++i];
    } else if (arg === '--concurrency') {
      const raw = args[++i];
      const parsed = Number.parseInt(raw, 10);
      if (Number.isFinite(parsed) && parsed >= 1) {
        options.concurrency = parsed;
      }
    } else if (arg === '--depth') {
      const depth = args[++i];
      if (['fast', 'normal', 'deep'].includes(depth)) {
        options.depthMode = depth as 'fast' | 'normal' | 'deep';
      }
    }
  }

  return options;
}

/**
 * Load commits from a file (one commit hash per line)
 */
function loadCommitsFromFile(filePath: string): string[] {
  const absolutePath = path.resolve(filePath);

  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Commits file not found: ${absolutePath}`);
  }

  const content = fs.readFileSync(absolutePath, 'utf-8');
  const commits = content
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#')); // Ignore empty lines and comments

  return commits;
}

/**
 * Print usage help
 */
function printUsage(): void {
  console.log(chalk.cyan('\n📝 Generate Benchmark Dataset\n'));
  console.log(chalk.white('Description:'));
  console.log(chalk.gray('  Evaluate commits and generate a CSV file with model predictions.'));
  console.log(chalk.gray('  Review and adjust values to create ground truth for benchmarking.\n'));
  console.log(chalk.white('Usage:'));
  console.log(
    chalk.gray('  codewave generate-dataset --commits <hash1,hash2,...> --output <path>')
  );
  console.log(chalk.gray('  codewave generate-dataset --commits-file <path> --output <path>'));
  console.log('');
  console.log(chalk.white('Options:'));
  console.log(chalk.gray('  --commits, -c <hashes>   Comma-separated commit hashes to evaluate'));
  console.log(chalk.gray('  --commits-file, -f <path>  File with commit hashes (one per line)'));
  console.log(
    chalk.gray('  --repo, -r <path>        Repository path (default: current directory)')
  );
  console.log(
    chalk.gray('  --output, -o <path>      Output CSV path (default: ./benchmark-dataset.csv)')
  );
  console.log(
    chalk.gray('  --concurrency <n>        Number of commits to evaluate in parallel (default: 1)')
  );
  console.log(chalk.gray('  --depth <mode>           Analysis depth: fast, normal, deep'));
  console.log('');
  console.log(chalk.white('Examples:'));
  console.log(
    chalk.gray('  codewave generate-dataset --commits abc1234,def5678 --output ./data.csv')
  );
  console.log(
    chalk.gray('  codewave generate-dataset --commits-file ./commits.txt --repo /path/to/repo')
  );
  console.log(
    chalk.gray('  codewave generate-dataset --commits-file ./commits.txt --concurrency 4')
  );
  console.log('');
  console.log(chalk.white('Workflow:'));
  console.log(chalk.gray('  1. Run generate-dataset to create CSV with model predictions'));
  console.log(chalk.gray('  2. Open CSV in spreadsheet, review and adjust values'));
  console.log(chalk.gray('  3. Save as ground truth dataset'));
  console.log(chalk.gray('  4. Run: codewave benchmark --dataset <ground-truth.csv>'));
  console.log('');
}

/**
 * Main entry point for generate-dataset command
 */
export async function runGenerateDatasetCommand(args: string[]): Promise<void> {
  // Handle help
  if (args.includes('--help') || args.includes('-h') || args.length === 0) {
    printUsage();
    return;
  }

  const options = parseArgs(args);

  // Load commits from file if specified
  if (options.commitsFile) {
    try {
      const fileCommits = loadCommitsFromFile(options.commitsFile);
      options.commits = [...options.commits, ...fileCommits];
    } catch (error) {
      console.log(
        chalk.red(
          `\n❌ Error loading commits file: ${error instanceof Error ? error.message : String(error)}\n`
        )
      );
      process.exit(1);
    }
  }

  // Validate commits
  if (options.commits.length === 0) {
    console.log(chalk.red('\n❌ Error: No commits specified\n'));
    console.log(chalk.gray('  Use --commits or --commits-file to specify commits to evaluate.\n'));
    printUsage();
    process.exit(1);
  }

  // Resolve paths
  options.repoPath = path.resolve(options.repoPath);
  options.outputPath = path.resolve(options.outputPath);

  // Validate repo path
  if (!fs.existsSync(options.repoPath)) {
    console.log(chalk.red(`\n❌ Error: Repository path not found: ${options.repoPath}\n`));
    process.exit(1);
  }

  // Check if .git exists
  const gitPath = path.join(options.repoPath, '.git');
  if (!fs.existsSync(gitPath)) {
    console.log(chalk.red(`\n❌ Error: Not a git repository: ${options.repoPath}\n`));
    process.exit(1);
  }

  console.log(chalk.cyan('\n🚀 Starting dataset generation...\n'));
  console.log(chalk.white(`  📁 Repository: ${options.repoPath}`));
  console.log(chalk.white(`  📊 Commits: ${options.commits.length}`));
  console.log(chalk.white(`  📄 Output: ${options.outputPath}`));
  if (options.depthMode) {
    console.log(chalk.white(`  🎯 Depth: ${options.depthMode}`));
  }
  console.log('');

  try {
    await generateDataset(
      {
        commits: options.commits,
        repoPath: options.repoPath,
        outputPath: options.outputPath,
        depthMode: options.depthMode,
        concurrency: options.concurrency,
      },
      (message) => {
        console.log(message);
      }
    );

    printDatasetComplete(options.outputPath, options.commits.length);
  } catch (error) {
    console.log(
      chalk.red(
        `\n❌ Dataset generation failed: ${error instanceof Error ? error.message : String(error)}\n`
      )
    );
    process.exit(1);
  }
}
