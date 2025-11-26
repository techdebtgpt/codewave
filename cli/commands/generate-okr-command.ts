import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';
import { loadConfig } from '../../src/config/config-loader';
import { updateEvaluationIndex, getEvaluationRoot } from '../utils/shared.utils';
import {
  AuthorStatsAggregatorService,
  AggregationOptions,
} from '../../src/services/author-stats-aggregator.service';
import { OkrOrchestrator } from '../../src/services/okr-orchestrator.service';

/**
 * CLI command for generating OKRs
 * Refactored to use OkrOrchestrator service (DRY principle)
 */
export async function runGenerateOkrCommand(args: string[]) {
  console.log(chalk.cyan('\n🎯 CodeWave: Generating OKRs & Action Points...\n'));

  // 1. Parse Arguments
  const options = parseCommandArgs(args);

  // 2. Load Config
  const config = loadConfig();
  if (!config) {
    console.error(chalk.red('❌ Config not found. Run `codewave config --init`'));
    process.exit(1);
  }

  console.log(chalk.gray(`🤖 Using ${config.llm.provider} (${config.llm.model}) for insights`));

  // 3. Get evaluation root
  const evalRoot = getEvaluationRoot();

  // 4. Aggregate author stats to find authors
  console.log(chalk.gray('📂 Scanning evaluation history...'));

  let authorData: Map<string, any[]>;
  try {
    authorData = await AuthorStatsAggregatorService.aggregateAuthorStats(evalRoot, options);
  } catch (error) {
    console.error(chalk.red(`❌ ${error instanceof Error ? error.message : String(error)}`));
    process.exit(1);
  }

  if (authorData.size === 0) {
    console.log(chalk.yellow('⚠️  No matching evaluations found.'));
    process.exit(0);
  }

  const authors = Array.from(authorData.keys());
  console.log(chalk.white(`\n👥 Found ${authors.length} author(s): ${authors.join(', ')}`));

  // 5. Generate OKRs using Orchestrator (DRY - reusable service)
  const orchestrator = new OkrOrchestrator(config);
  const okrMap = await orchestrator.generateOkrsWithProgress(authors, evalRoot, options, 2);

  // 6. Save OKRs
  await orchestrator.saveOkrs(evalRoot, okrMap);

  // 7. Regenerate HTML reports
  await regenerateHtmlReports(evalRoot, authorData);

  // 8. Print completion
  console.log(chalk.green('\n✅ OKR Generation Complete!'));
  console.log(chalk.white('📁 OKR files saved to .evaluated-commits/.okrs/'));
  console.log(chalk.white('🌐 Open .evaluated-commits/index.html to view the updated dashboards.'));
}

/**
 * Parse command line arguments
 */
function parseCommandArgs(args: string[]): AggregationOptions {
  const options: AggregationOptions = {};

  if (args.includes('--author')) {
    const idx = args.indexOf('--author');
    options.targetAuthor = args[idx + 1];
  }

  if (args.includes('--since')) {
    const idx = args.indexOf('--since');
    options.sinceDate = new Date(args[idx + 1]);
  }

  if (args.includes('--count')) {
    const idx = args.indexOf('--count');
    options.countLimit = parseInt(args[idx + 1], 10);
  }

  return options;
}

/**
 * Regenerate HTML reports with OKRs
 */
async function regenerateHtmlReports(
  evalRoot: string,
  authorData: Map<string, any[]>
): Promise<void> {
  console.log(chalk.gray('🔄 Updating HTML reports...'));

  if (authorData.size > 0) {
    const dirs = await fs.promises.readdir(evalRoot);

    // Trigger HTML regeneration by updating index for one commit
    for (const dir of dirs) {
      const resultsPath = path.join(evalRoot, dir, 'results.json');
      if (fs.existsSync(resultsPath)) {
        const content = await fs.promises.readFile(resultsPath, 'utf-8');
        const data = JSON.parse(content);

        // updateEvaluationIndex regenerates all author pages
        await updateEvaluationIndex(path.join(evalRoot, dir), data.metadata);
        break;
      }
    }
  }
}
