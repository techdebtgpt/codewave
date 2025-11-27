import chalk from 'chalk';
import { AppConfig } from '../../src/config/config.interface';
import { OkrOrchestrator } from '../../src/orchestrator/okr-orchestrator';
import { AggregationOptions } from '../../src/services/author-stats-aggregator.service';
import { OkrProgressTracker } from './okr-progress-tracker';

/**
 * Prompt user and generate OKRs for authors
 * DRY: Shared helper for both batch and single evaluation commands
 */
export async function promptAndGenerateOkrs(
  config: AppConfig,
  authors: string[],
  evalRoot: string,
  options: AggregationOptions & { silent?: boolean; concurrency?: number } = {}
): Promise<void> {
  if (authors.length === 0) {
    return;
  }

  // Estimate cost
  const estimatedCost = OkrOrchestrator.estimateTotalCost(authors.length);

  // Prompt user
  console.log(chalk.cyan('\n\n📊 OKR Generation Available'));
  console.log(
    chalk.white(
      `Generate comprehensive OKR profiles for ${authors.length} author${authors.length > 1 ? 's' : ''}?`
    )
  );
  console.log(chalk.gray(`Estimated cost: $${estimatedCost.toFixed(4)}`));
  console.log(chalk.gray(`Authors: ${authors.join(', ')}`));

  const { default: inquirer } = await import('inquirer');
  const { proceed } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'proceed',
      message: 'Generate OKRs now?',
      default: true,
    },
  ]);

  if (!proceed) {
    console.log(chalk.yellow('\n⏭️  Skipping OKR generation'));
    console.log(
      chalk.gray('You can generate OKRs later with: node dist/cli/index.js generate-okr\n')
    );
    return;
  }

  // Generate OKRs
  console.log(chalk.cyan('\n🎯 Starting OKR generation...\n'));
  const orchestrator = new OkrOrchestrator(config);
  const { silent: _silent, concurrency, ...aggregationOptions } = options;

  // Initialize progress tracker
  const tracker = new OkrProgressTracker();
  tracker.initialize(authors);

  // Suppress logs that interfere with progress bar
  const { consoleManager } = await import('../../src/common/utils/console-manager.js');
  const originalStdoutWrite = process.stdout.write.bind(process.stdout);

  (process.stdout.write as any) = function (str: string, ...args: any[]): boolean {
    // Block OKR generation progress lines
    if (/^\s+[📝🧐✨]/u.test(str)) {
      return true; // Suppress
    }
    return originalStdoutWrite(str, ...args);
  };

  const okrMap = await orchestrator.generateOkrsWithProgress(
    authors,
    evalRoot,
    aggregationOptions,
    concurrency || 2,
    true, // silent=true because we use tracker
    (author, progress) => tracker.update(author, progress)
  );

  tracker.stop();

  // Restore console methods and process stdout
  consoleManager.stopSuppressing();
  process.stdout.write = originalStdoutWrite as any;

  // Save OKRs
  await orchestrator.saveOkrs(evalRoot, okrMap);

  console.log(chalk.green('\n✅ OKR Generation Complete!'));
  console.log(chalk.white('📁 OKR files saved to .evaluated-commits/.okrs/'));
  console.log(chalk.gray('   Structure: .okrs/{author}/okr_{date}.{ext}'));
  console.log(chalk.gray('   • JSON (.json) for programmatic access and history'));
  console.log(chalk.gray('   • Markdown (.md) for version control and editing'));
  console.log(chalk.gray('   • HTML (.html) for viewing in browser\n'));
}
