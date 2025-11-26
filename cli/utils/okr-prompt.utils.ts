import chalk from 'chalk';
import { AppConfig } from '../../src/config/config.interface';
import { OkrOrchestrator } from '../../src/services/okr-orchestrator.service';
import { AggregationOptions } from '../../src/services/author-stats-aggregator.service';

/**
 * Prompt user and generate OKRs for authors
 * DRY: Shared helper for both batch and single evaluation commands
 */
export async function promptAndGenerateOkrs(
  config: AppConfig,
  authors: string[],
  evalRoot: string,
  options: AggregationOptions & { silent?: boolean } = {}
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
  const { silent, ...aggregationOptions } = options;
  const okrMap = await orchestrator.generateOkrsWithProgress(
    authors,
    evalRoot,
    aggregationOptions,
    2,
    silent || false
  );

  // Save OKRs
  await orchestrator.saveOkrs(evalRoot, okrMap);

  console.log(chalk.green('\n✅ OKR Generation Complete!'));
  console.log(chalk.white('📁 OKR files saved to .evaluated-commits/.okrs/'));
  console.log(chalk.gray('   Structure: .okrs/{author}/okr_{date}.{ext}'));
  console.log(chalk.gray('   • JSON (.json) for programmatic access and history'));
  console.log(chalk.gray('   • Markdown (.md) for version control and editing'));
  console.log(chalk.gray('   • HTML (.html) for viewing in browser\n'));
}
