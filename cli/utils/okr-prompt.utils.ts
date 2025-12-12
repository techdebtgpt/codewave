import chalk from 'chalk';
import { AppConfig } from '../../src/config/config.interface';
import { OkrOrchestrator } from '../../src/orchestrator/okr-orchestrator';
import {
  AggregationOptions,
  AuthorStatsAggregatorService,
} from '../../src/services/author-stats-aggregator.service';
import { MetricsCalculationService } from '../../src/services/metrics-calculation.service';
import { OkrProgressTracker } from './okr-progress-tracker';
import inquirer from 'inquirer';
import fs from 'fs';
import path from 'path';
import { generateAuthorPage } from './shared.utils';
import { consoleManager } from '../../src/common/utils/console-manager';

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

  // Regenerate author pages to include OKR data
  console.log(chalk.cyan('\n📄 Regenerating author dashboards with OKR data...'));
  await regenerateAuthorPages(evalRoot, authors);

  console.log(chalk.green('\n✅ OKR Generation Complete!'));
  console.log(chalk.white('📁 OKR files saved to .evaluated-commits/.okrs/'));
  console.log(chalk.gray('   Structure: .okrs/{author}/okr_{date}.{ext}'));
  console.log(chalk.gray('   • JSON (.json) for programmatic access and history'));
  console.log(chalk.gray('   • Markdown (.md) for version control and editing'));
  console.log(chalk.gray('   • HTML (.html) for viewing in browser'));
  console.log(chalk.cyan('📊 Author dashboards updated with new OKR sections\n'));
}

/**
 * Regenerate author pages to include latest OKR data
 * Uses consistent team summary calculation for BACI score accuracy
 */
async function regenerateAuthorPages(evalRoot: string, authors: string[]): Promise<void> {
  // Read index.json to get commit data for each author
  const indexPath = path.join(evalRoot, 'index.json');
  if (!fs.existsSync(indexPath)) {
    console.log(chalk.yellow('⚠️  No index.json found, skipping author page regeneration'));
    return;
  }

  const indexData = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));

  // Group commits by author
  const byAuthor = new Map<string, any[]>();
  indexData.forEach((item: any) => {
    const author = item.commitAuthor || 'Unknown';
    if (!byAuthor.has(author)) {
      byAuthor.set(author, []);
    }
    byAuthor.get(author)!.push(item);
  });

  // Calculate team summary for BACI score consistency
  const allAuthorData = await AuthorStatsAggregatorService.aggregateAuthorStats(evalRoot);
  const allMetrics: any[] = [];

  // Convert all authors' evaluations to metrics format
  for (const [authorName, authorEvaluations] of allAuthorData.entries()) {
    const authorMetrics = authorEvaluations.map((evaluation) => {
      // Calculate averaged metrics from agent results
      const averagedMetrics =
        evaluation.averagedMetrics ||
        MetricsCalculationService.calculateWeightedMetrics(evaluation.agents);

      return {
        createdBy: authorName,
        commitScore: averagedMetrics?.commitScore || 0,
        testingQuality: averagedMetrics?.testCoverage || 0,
        technicalDebtRate: 0,
        deliveryRate: 0,
        functionalImpact: averagedMetrics?.functionalImpact || 0,
        codeQuality: averagedMetrics?.codeQuality || 0,
        codeComplexity: averagedMetrics?.codeComplexity || 0,
        actualTimeHours: averagedMetrics?.actualTimeHours || 0,
        idealTimeHours: averagedMetrics?.idealTimeHours || 0,
        technicalDebtHours: averagedMetrics?.technicalDebtHours || 0,
        debtReductionHours: averagedMetrics?.debtReductionHours || 0,
      };
    });
    allMetrics.push(...authorMetrics);
  }

  // Get comprehensive team summary
  const teamSummary = MetricsCalculationService.calculateTeamSummary(allMetrics);

  // Regenerate pages with consistent team summary for BACI score accuracy
  for (const author of authors) {
    const commits = byAuthor.get(author);
    if (commits && commits.length > 0) {
      await generateAuthorPage(evalRoot, author, commits, teamSummary);
      console.log(chalk.gray(`   ✓ Updated dashboard for ${author}`));
    }
  }
}
