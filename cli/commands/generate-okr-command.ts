import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';
import { loadConfig } from '../../src/config/config-loader';
import { updateEvaluationIndex, getEvaluationRoot } from '../utils/shared.utils';
import {
    AuthorStatsAggregatorService,
    AggregationOptions,
} from '../../src/services/author-stats-aggregator.service';
import { OkrGeneratorService } from '../../src/services/okr-generator.service';

/**
 * CLI command for generating OKRs
 * Thin orchestrator that delegates to services
 * Follows pattern from evaluate-command.ts
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

    // 4. Aggregate author stats
    console.log(chalk.gray('📂 Scanning evaluation history...'));

    let authorData: Map<string, any[]>;
    try {
        authorData = await AuthorStatsAggregatorService.aggregateAuthorStats(evalRoot, options);
    } catch (error) {
        console.error(
            chalk.red(`❌ ${error instanceof Error ? error.message : String(error)}`)
        );
        process.exit(1);
    }

    if (authorData.size === 0) {
        console.log(chalk.yellow('⚠️  No matching evaluations found.'));
        process.exit(0);
    }

    // 5. Analyze each author
    const authorAnalyses = new Map<
        string,
        { stats: any; strengths: string[]; weaknesses: string[] }
    >();

    for (const [author, evaluations] of authorData.entries()) {
        console.log(
            chalk.white(`\n👤 Analyzing ${evaluations.length} commits for ${chalk.bold(author)}...`)
        );

        try {
            const analysis = AuthorStatsAggregatorService.analyzeAuthor(evaluations);
            authorAnalyses.set(author, analysis);
        } catch (error) {
            console.log(
                chalk.yellow(
                    `   Skipping ${author}: ${error instanceof Error ? error.message : String(error)}`
                )
            );
        }
    }

    // 6. Generate OKRs using LLM service
    const generator = new OkrGeneratorService(config);
    const allOkrs: Record<string, string[]> = {};

    for (const [author, analysis] of authorAnalyses.entries()) {
        try {
            const okrs = await generator.generateOkrsForAuthor(
                author,
                analysis.stats,
                analysis.strengths,
                analysis.weaknesses
            );

            allOkrs[author] = okrs;

            console.log(chalk.green(`   ✅ Generated 3 OKRs`));
            okrs.forEach((okr) => console.log(chalk.gray(`      - ${okr}`)));
        } catch (error) {
            console.error(
                chalk.red(
                    `   ❌ Failed to generate OKRs: ${error instanceof Error ? error.message : String(error)}`
                )
            );
        }
    }

    // 7. Save OKRs
    await saveOkrs(evalRoot, allOkrs);

    // 8. Regenerate HTML reports
    await regenerateHtmlReports(evalRoot, authorData);

    // 9. Print completion
    console.log(chalk.green('\n✅ OKR Generation Complete!'));
    console.log(chalk.white('Open .evaluated-commits/index.html to view the updated dashboards.'));
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
 * Save OKRs to file
 */
async function saveOkrs(evalRoot: string, allOkrs: Record<string, string[]>): Promise<void> {
    const okrsPath = path.join(evalRoot, 'author-okrs.json');

    // Merge with existing OKRs
    let existingOkrs = {};
    if (fs.existsSync(okrsPath)) {
        try {
            existingOkrs = JSON.parse(await fs.promises.readFile(okrsPath, 'utf-8'));
        } catch (e) {
            // Ignore parse errors
        }
    }

    const finalOkrs = { ...existingOkrs, ...allOkrs };
    await fs.promises.writeFile(okrsPath, JSON.stringify(finalOkrs, null, 2));
    console.log(chalk.cyan(`\n💾 Saved OKRs to ${okrsPath}`));
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
