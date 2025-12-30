// cli/commands/benchmark-command.ts
// CLI command for running benchmarks and comparing model performance

import chalk from 'chalk';
import * as fs from 'fs';
import * as path from 'path';
import {
  runBenchmark,
  listBenchmarkRuns,
  loadBenchmarkRuns,
  getBenchmarkRunsDir,
} from '../../src/benchmark/benchmark-runner';
import {
  printBenchmarkResult,
  printBenchmarkList,
  printModelComparison,
  generateComparisonJSON,
} from '../../src/benchmark/benchmark-reporter';
import { BenchmarkOptions, CompareOptions } from '../../src/benchmark/types';

/**
 * Parse CLI arguments for benchmark command
 */
function parseArgs(args: string[]): {
  subcommand: 'run' | 'compare' | 'list';
  options: any;
} {
  // Check for subcommands
  if (args[0] === 'compare') {
    return {
      subcommand: 'compare',
      options: parseCompareArgs(args.slice(1)),
    };
  }

  if (args[0] === 'list') {
    return {
      subcommand: 'list',
      options: {},
    };
  }

  // Default: run benchmark
  return {
    subcommand: 'run',
    options: parseRunArgs(args),
  };
}

/**
 * Parse arguments for benchmark run
 */
function parseRunArgs(args: string[]): BenchmarkOptions {
  const options: BenchmarkOptions = {
    datasetPath: '',
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--dataset' || arg === '-d') {
      options.datasetPath = args[++i];
    } else if (arg === '--name' || arg === '-n') {
      options.name = args[++i];
    } else if (arg === '--output' || arg === '-o') {
      options.outputPath = args[++i];
    } else if (arg === '--concurrency' || arg === '-c') {
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
    } else if (arg === '--silent' || arg === '-s') {
      options.silent = true;
    }
  }

  return options;
}

/**
 * Parse arguments for benchmark compare
 */
function parseCompareArgs(args: string[]): CompareOptions {
  const options: CompareOptions = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--runs' || arg === '-r') {
      options.runNames = args[++i].split(',').map((s) => s.trim());
    } else if (arg === '--all' || arg === '-a') {
      options.all = true;
    }
  }

  return options;
}

/**
 * Print usage help
 */
function printUsage(): void {
  console.log(chalk.cyan('\n📊 Codewave Benchmark Tool\n'));
  console.log(chalk.white('Usage:'));
  console.log(
    chalk.gray('  codewave benchmark --dataset <path>          Run benchmark against dataset')
  );
  console.log(
    chalk.gray('  codewave benchmark --dataset <path> --name <name>   Run with custom name')
  );
  console.log(chalk.gray('  codewave benchmark compare --runs a,b,c      Compare specific runs'));
  console.log(chalk.gray('  codewave benchmark compare --all             Compare all saved runs'));
  console.log(chalk.gray('  codewave benchmark list                      List all saved runs'));
  console.log('');
  console.log(chalk.white('Options:'));
  console.log(chalk.gray('  --dataset, -d <path>    Path to ground truth CSV dataset'));
  console.log(chalk.gray('  --name, -n <name>       Custom name for this benchmark run'));
  console.log(chalk.gray('  --output, -o <path>     Path to save JSON results'));
  console.log(
    chalk.gray('  --concurrency, -c <n>   Number of commits to evaluate in parallel (default: 1)')
  );
  console.log(chalk.gray('  --depth <mode>          Analysis depth: fast, normal, deep'));
  console.log(chalk.gray('  --silent, -s            Suppress progress output'));
  console.log('');
  console.log(chalk.white('Compare Options:'));
  console.log(chalk.gray('  --runs, -r <names>      Comma-separated run names to compare'));
  console.log(chalk.gray('  --all, -a               Compare all saved benchmark runs'));
  console.log('');
  console.log(chalk.white('Examples:'));
  console.log(chalk.gray('  codewave benchmark --dataset ./ground-truth.csv'));
  console.log(chalk.gray('  codewave benchmark --dataset ./data.csv --name "claude-baseline"'));
  console.log(chalk.gray('  codewave benchmark --dataset ./data.csv --concurrency 4'));
  console.log(chalk.gray('  codewave benchmark compare --runs claude-baseline,gpt4-test'));
  console.log(chalk.gray('  codewave benchmark list'));
  console.log('');
}

/**
 * Run benchmark command
 */
async function runBenchmarkCommand(options: BenchmarkOptions): Promise<void> {
  if (!options.datasetPath) {
    console.log(chalk.red('\n❌ Error: --dataset is required\n'));
    printUsage();
    process.exit(1);
  }

  // Resolve dataset path
  const datasetPath = path.resolve(options.datasetPath);
  if (!fs.existsSync(datasetPath)) {
    console.log(chalk.red(`\n❌ Error: Dataset file not found: ${datasetPath}\n`));
    process.exit(1);
  }

  options.datasetPath = datasetPath;

  console.log(chalk.cyan('\n🚀 Starting benchmark run...\n'));

  try {
    const result = await runBenchmark(options, (message) => {
      if (!options.silent) {
        console.log(message);
      }
    });

    // Print results
    printBenchmarkResult(result);

    // Save JSON output if requested
    if (options.outputPath) {
      const outputPath = path.resolve(options.outputPath);
      fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));
      console.log(chalk.green(`\n💾 Results saved to: ${outputPath}\n`));
    }
  } catch (error) {
    console.log(
      chalk.red(
        `\n❌ Benchmark failed: ${error instanceof Error ? error.message : String(error)}\n`
      )
    );
    process.exit(1);
  }
}

/**
 * Run compare command
 */
async function runCompareCommand(options: CompareOptions): Promise<void> {
  let runNames: string[];

  if (options.all) {
    // Load all runs
    const runs = listBenchmarkRuns();
    if (runs.length < 2) {
      console.log(chalk.yellow('\n⚠️  Need at least 2 benchmark runs to compare.\n'));
      console.log(
        chalk.gray('  Run: codewave benchmark --dataset <path> to create benchmark runs.\n')
      );
      process.exit(1);
    }
    runNames = runs.map((r) => r.name);
  } else if (options.runNames && options.runNames.length > 0) {
    runNames = options.runNames;
  } else {
    console.log(chalk.red('\n❌ Error: Specify --runs or --all for comparison\n'));
    printUsage();
    process.exit(1);
  }

  console.log(chalk.cyan(`\n🔍 Loading ${runNames.length} benchmark runs for comparison...\n`));

  const results = loadBenchmarkRuns(runNames);

  if (results.length < 2) {
    console.log(chalk.red('\n❌ Error: Could not load enough benchmark runs\n'));
    console.log(
      chalk.gray(
        '  Make sure the run names are correct. Use "codewave benchmark list" to see available runs.\n'
      )
    );
    process.exit(1);
  }

  // Print comparison
  printModelComparison(results);

  // Also output JSON comparison to file
  const comparison = generateComparisonJSON(results);
  const comparisonPath = path.join(getBenchmarkRunsDir(), `comparison-${Date.now()}.json`);
  fs.writeFileSync(comparisonPath, JSON.stringify(comparison, null, 2));
  console.log(chalk.gray(`  📄 Comparison JSON saved to: ${comparisonPath}\n`));
}

/**
 * Run list command
 */
async function runListCommand(): Promise<void> {
  const runs = listBenchmarkRuns();
  printBenchmarkList(runs);
}

/**
 * Main entry point for benchmark command
 */
export async function runBenchmarkCommandHandler(args: string[]): Promise<void> {
  // Handle help
  if (args.includes('--help') || args.includes('-h') || args.length === 0) {
    printUsage();
    return;
  }

  const { subcommand, options } = parseArgs(args);

  switch (subcommand) {
    case 'run':
      await runBenchmarkCommand(options);
      break;
    case 'compare':
      await runCompareCommand(options);
      break;
    case 'list':
      await runListCommand();
      break;
  }
}
