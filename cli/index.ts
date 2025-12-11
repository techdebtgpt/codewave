#!/usr/bin/env node

// Suppress the punycode deprecation warning from node-fetch@2/whatwg-url
// This is a known issue with the openai package's dependency on old node-fetch
// See: https://github.com/openai/node-sdk/issues
// TODO: Remove this when openai package updates to node-fetch@3
if (process.env.NODE_NO_DEPRECATION === undefined) {
  const originalEmitWarning = process.emitWarning;
  process.emitWarning = function (warning: string | Error, ...args: any[]) {
    if (
      (typeof warning === 'string' && warning.includes('punycode')) ||
      (warning instanceof Error && warning.message.includes('punycode'))
    ) {
      return;
    }
    return originalEmitWarning.call(process, warning, ...(args || []));
  } as any;
}

import { runEvaluateCommand } from './commands/evaluate-command';
import { runConfigCommand } from './commands/config.command';
import { runBatchEvaluateCommand } from './commands/batch-evaluate-command';
import { runGenerateOkrCommand } from './commands/generate-okr-command';
import * as path from 'path';
import * as fs from 'fs';

async function main() {
  const [, , command, ...args] = process.argv;

  // Handle global flags
  if (!command || command === '--help' || command === '-h') {
    printUsage();
    process.exit(0);
  }

  if (command === '--version' || command === '-v') {
    try {
      // Try to load package.json from the project root
      // __dirname is dist/cli, so go up 2 levels to reach root
      const packagePath = path.resolve(__dirname, '../../package.json');
      const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf-8'));
      console.log(`codewave version ${packageJson.version}`);
    } catch (error) {
      console.log('codewave version unknown');
    }
    process.exit(0);
  }

  try {
    switch (command) {
      case 'evaluate':
        await runEvaluateCommand(args);
        break;
      case 'batch':
        await runBatchEvaluateCommand(args);
        break;
      case 'generate-okr':
        await runGenerateOkrCommand(args);
        break;
      case 'config':
        await runConfigCommand(args);
        break;
      default:
        printUsage();
        process.exit(1);
    }
  } catch (err) {
    console.error('Error:', err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

function printUsage() {
  console.log('╔═══════════════════════════════════════════════════════════════╗');
  console.log('║                   🌊 CodeWave CLI                           ║');
  console.log('║          AI-Powered Commit Intelligence Platform             ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log('Usage: codewave [options] <command> [options]');
  console.log('');
  console.log('Global Options:');
  console.log('  -h, --help              Show this help message');
  console.log('  -v, --version           Show version number');
  console.log('');
  console.log('Commands:');
  console.log('  config <--init|--list|--get|--set|--reset>  Manage configuration');
  console.log('  evaluate [options]                           Evaluate a single commit or changes');
  console.log(
    '  batch [options]                              Evaluate multiple commits in parallel'
  );
  console.log(
    '  generate-okr [options]                       Generate OKRs and action points from history'
  );
  console.log('');
  console.log('Evaluate Options:');
  console.log('  <commit-hash>           Evaluate a specific commit (default)');
  console.log('  --commit <hash>         Evaluate a specific commit (explicit flag)');
  console.log('  --file <path>           Evaluate from a diff file');
  console.log('  --staged                Evaluate staged changes (git diff --cached)');
  console.log('  --current               Evaluate all current changes (staged + unstaged)');
  console.log('  --repo <path>           Repository path (default: current directory)');
  console.log('  --depth <mode>          Analysis depth: fast, normal, deep (default: normal)');
  console.log('  --no-stream             Disable streaming output (silent mode)');
  console.log('');
  console.log('Batch Options:');
  console.log('  --repo <path>           Repository path (default: current directory)');
  console.log('  --since <date>          Only commits after this date (e.g., "2024-01-01")');
  console.log('  --until <date>          Only commits before this date');
  console.log('  --count <number>        Number of recent commits to evaluate');
  console.log('  --branch <name>         Git branch to analyze (default: current branch)');
  console.log('  --depth <mode>          Analysis depth: fast, normal, deep (default: normal)');
  console.log('  --no-stream             Disable streaming output (silent mode)');
  console.log('');
  console.log('Examples:');
  console.log('  # Setup configuration');
  console.log('  codewave config --init');
  console.log('');
  console.log('  # Evaluate from file');
  console.log('  codewave evaluate my-changes.diff');
  console.log('');
  console.log('  # Evaluate specific commit');
  console.log('  codewave evaluate --commit abc123');
  console.log('');
  console.log('  # Evaluate staged changes');
  console.log('  codewave evaluate --staged');
  console.log('');
  console.log('  # Evaluate with deep analysis');
  console.log('  codewave evaluate HEAD --depth deep');
  console.log('');
  console.log('  # Batch evaluate last 10 commits');
  console.log('  codewave batch --repo /path/to/repo --count 10');
  console.log('');
  console.log('  # Batch evaluate date range with fast mode');
  console.log('  codewave batch --since "2024-01-01" --until "2024-01-31" --depth fast');
  console.log('');
  console.log('📖 Docs: https://github.com/techdebtgpt/codewave');
}

main().catch((error) => {
  console.error('❌ Fatal error:', error instanceof Error ? error.message : String(error));
  process.exit(1);
});
