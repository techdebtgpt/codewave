// src/benchmark/benchmark-reporter.ts
// Console table and JSON report generation for benchmarks

import chalk from 'chalk';
import { table } from 'table';
import { BenchmarkResult, BenchmarkRunInfo, BENCHMARK_METRICS } from './types';
import { compareRuns } from './metrics-calculator';

/**
 * Format a number with specified decimal places
 */
function formatNum(value: number | undefined, decimals: number = 2): string {
  if (value === undefined || isNaN(value)) return 'N/A';
  return value.toFixed(decimals);
}

/**
 * Format percentage
 */
function formatPct(value: number | undefined): string {
  if (value === undefined || isNaN(value)) return 'N/A';
  return `${value.toFixed(1)}%`;
}

/**
 * Print a single benchmark result to console
 */
export function printBenchmarkResult(result: BenchmarkResult): void {
  console.log('\n');
  console.log(chalk.bold.cyan('═'.repeat(80)));
  console.log(chalk.bold.cyan('                    Codewave Benchmark Results'));
  console.log(chalk.bold.cyan('═'.repeat(80)));
  console.log('');

  // Metadata
  console.log(
    chalk.white(`  Dataset: ${chalk.bold(result.datasetPath)} (${result.commitCount} commits)`)
  );
  console.log(chalk.white(`  Model: ${chalk.bold(result.model)} | Provider: ${result.provider}`));
  console.log(chalk.white(`  Depth: ${result.depthMode} | Run: ${result.timestamp}`));
  console.log(chalk.white(`  Name: ${chalk.bold(result.name)}`));
  console.log('');

  // Header explanation
  console.log(chalk.gray('  ↓ = Lower is better (less error)'));
  console.log(chalk.gray('  ↑ = Higher is better (more accuracy)'));
  console.log(chalk.gray('  Dir% = Direction Accuracy (only for +/- debt metrics)'));
  console.log('');

  // Build metrics table
  const tableData: string[][] = [
    [
      chalk.bold('Metric'),
      chalk.bold('MAE ↓'),
      chalk.bold('RMSE ↓'),
      chalk.bold('NMAE ↓'),
      chalk.bold('R² ↑'),
      chalk.bold('Max ↓'),
      chalk.bold('Dir% ↑'),
      chalk.bold('N'),
    ],
  ];

  for (const metric of BENCHMARK_METRICS) {
    const m = result.metrics[metric];
    const row = [
      metric,
      formatNum(m.mae),
      formatNum(m.rmse),
      formatPct(m.nmae),
      formatNum(m.r2),
      formatNum(m.maxError),
      m.directionAccuracy !== undefined ? formatPct(m.directionAccuracy) : '-',
      m.sampleCount.toString(),
    ];
    tableData.push(row);
  }

  // Table config
  const tableConfig = {
    border: {
      topBody: '─',
      topJoin: '┬',
      topLeft: '┌',
      topRight: '┐',
      bottomBody: '─',
      bottomJoin: '┴',
      bottomLeft: '└',
      bottomRight: '┘',
      bodyLeft: '│',
      bodyRight: '│',
      bodyJoin: '│',
      joinBody: '─',
      joinLeft: '├',
      joinRight: '┤',
      joinJoin: '┼',
    },
    columns: {
      0: { alignment: 'left' as const, width: 20 },
      1: { alignment: 'right' as const, width: 8 },
      2: { alignment: 'right' as const, width: 8 },
      3: { alignment: 'right' as const, width: 8 },
      4: { alignment: 'right' as const, width: 8 },
      5: { alignment: 'right' as const, width: 8 },
      6: { alignment: 'right' as const, width: 8 },
      7: { alignment: 'right' as const, width: 5 },
    },
  };

  console.log(table(tableData, tableConfig));

  // Summary
  console.log(chalk.bold.cyan('─'.repeat(80)));
  console.log(
    chalk.white(
      `  Overall NMAE: ${chalk.bold(formatPct(result.overallNmae))} (↓ lower better) | ` +
        `Avg R²: ${chalk.bold(formatNum(result.overallR2))} (↑ higher better)`
    )
  );
  console.log(chalk.bold.cyan('─'.repeat(80)));

  // Performance stats
  console.log('');
  console.log(
    chalk.gray(`  ⏱️  Total time: ${(result.totalEvaluationTime / 1000 / 60).toFixed(1)} min`)
  );
  console.log(
    chalk.gray(`  ⏱️  Avg per commit: ${(result.averageEvaluationTime / 1000).toFixed(1)}s`)
  );
  if (result.totalTokens) {
    console.log(chalk.gray(`  🎟️  Total tokens: ${result.totalTokens.toLocaleString()}`));
  }
  console.log('');
}

/**
 * Print benchmark runs list to console
 */
export function printBenchmarkList(runs: BenchmarkRunInfo[]): void {
  if (runs.length === 0) {
    console.log(chalk.yellow('\n  No benchmark runs found.'));
    console.log(chalk.gray('  Run: codewave benchmark --dataset <path> to create one.\n'));
    return;
  }

  console.log('\n');
  console.log(chalk.bold.cyan('═'.repeat(100)));
  console.log(chalk.bold.cyan('                              Saved Benchmark Runs'));
  console.log(chalk.bold.cyan('═'.repeat(100)));
  console.log('');

  const tableData: string[][] = [
    [
      chalk.bold('Name'),
      chalk.bold('Model'),
      chalk.bold('Commits'),
      chalk.bold('NMAE ↓'),
      chalk.bold('R² ↑'),
      chalk.bold('Timestamp'),
    ],
  ];

  for (const run of runs) {
    tableData.push([
      run.name.length > 35 ? run.name.substring(0, 32) + '...' : run.name,
      run.model.length > 25 ? run.model.substring(0, 22) + '...' : run.model,
      run.commitCount.toString(),
      formatPct(run.overallNmae),
      formatNum(run.overallR2),
      new Date(run.timestamp).toLocaleString(),
    ]);
  }

  const tableConfig = {
    border: {
      topBody: '─',
      topJoin: '┬',
      topLeft: '┌',
      topRight: '┐',
      bottomBody: '─',
      bottomJoin: '┴',
      bottomLeft: '└',
      bottomRight: '┘',
      bodyLeft: '│',
      bodyRight: '│',
      bodyJoin: '│',
      joinBody: '─',
      joinLeft: '├',
      joinRight: '┤',
      joinJoin: '┼',
    },
    columns: {
      0: { alignment: 'left' as const, width: 35 },
      1: { alignment: 'left' as const, width: 25 },
      2: { alignment: 'right' as const, width: 8 },
      3: { alignment: 'right' as const, width: 8 },
      4: { alignment: 'right' as const, width: 8 },
      5: { alignment: 'left' as const, width: 20 },
    },
  };

  console.log(table(tableData, tableConfig));
  console.log(chalk.gray(`  Total: ${runs.length} benchmark runs\n`));
}

/**
 * Print model comparison to console
 */
export function printModelComparison(results: BenchmarkResult[]): void {
  if (results.length < 2) {
    console.log(chalk.yellow('\n  Need at least 2 benchmark runs to compare.\n'));
    return;
  }

  console.log('\n');
  console.log(chalk.bold.cyan('═'.repeat(100)));
  console.log(chalk.bold.cyan('                           Model Comparison Results'));
  console.log(chalk.bold.cyan('═'.repeat(100)));
  console.log('');

  // Runs being compared
  console.log(chalk.white('  Comparing:'));
  for (const r of results) {
    console.log(chalk.gray(`    • ${r.name} (${r.model})`));
  }
  console.log('');

  // Calculate comparison
  const runsData = results.map((r) => ({ name: r.name, metrics: r.metrics }));
  const { comparisons, rankings, overallBest } = compareRuns(runsData);

  // Header explanation
  console.log(chalk.gray('  ↓ = Lower is better | ↑ = Higher is better'));
  console.log(chalk.gray('  🏆 = Best performer for that metric'));
  console.log('');

  // Per-metric comparison
  console.log(chalk.bold.white('  Per-Metric Comparison (NMAE - lower is better):'));
  console.log('');

  for (const comp of comparisons) {
    const metricLabel = comp.metric.padEnd(20);
    const runValues = comp.runs
      .map((r) => {
        const isBest = r.name === comp.bestRun;
        const value = formatPct(r.nmae);
        return isBest ? chalk.green(`${r.name}: ${value} 🏆`) : chalk.white(`${r.name}: ${value}`);
      })
      .join('  |  ');

    console.log(`    ${chalk.cyan(metricLabel)} ${runValues}`);
  }

  console.log('');
  console.log(chalk.bold.cyan('─'.repeat(100)));
  console.log('');

  // Overall rankings
  console.log(chalk.bold.white('  Overall Rankings (by average NMAE):'));
  console.log('');

  const rankTableData: string[][] = [
    [chalk.bold('Rank'), chalk.bold('Run Name'), chalk.bold('Avg NMAE ↓'), chalk.bold('Avg R² ↑')],
  ];

  for (const r of rankings) {
    const rankEmoji =
      r.rank === 1 ? '🥇' : r.rank === 2 ? '🥈' : r.rank === 3 ? '🥉' : `#${r.rank}`;
    const isWinner = r.rank === 1;

    rankTableData.push([
      rankEmoji,
      isWinner ? chalk.green.bold(r.name) : r.name,
      isWinner ? chalk.green.bold(formatPct(r.avgNmae)) : formatPct(r.avgNmae),
      isWinner ? chalk.green.bold(formatNum(r.avgR2)) : formatNum(r.avgR2),
    ]);
  }

  const rankTableConfig = {
    border: {
      topBody: '─',
      topJoin: '┬',
      topLeft: '┌',
      topRight: '┐',
      bottomBody: '─',
      bottomJoin: '┴',
      bottomLeft: '└',
      bottomRight: '┘',
      bodyLeft: '│',
      bodyRight: '│',
      bodyJoin: '│',
      joinBody: '─',
      joinLeft: '├',
      joinRight: '┤',
      joinJoin: '┼',
    },
    columns: {
      0: { alignment: 'center' as const, width: 6 },
      1: { alignment: 'left' as const, width: 40 },
      2: { alignment: 'right' as const, width: 12 },
      3: { alignment: 'right' as const, width: 12 },
    },
  };

  console.log(table(rankTableData, rankTableConfig));

  console.log(chalk.bold.green(`  🏆 Overall Best: ${overallBest}`));
  console.log('');
}

/**
 * Generate JSON comparison report
 */
export function generateComparisonJSON(results: BenchmarkResult[]): object {
  const runsData = results.map((r) => ({ name: r.name, metrics: r.metrics }));
  const { comparisons, rankings, overallBest } = compareRuns(runsData);

  return {
    timestamp: new Date().toISOString(),
    runs: results.map((r) => ({
      name: r.name,
      model: r.model,
      provider: r.provider,
      depthMode: r.depthMode,
      commitCount: r.commitCount,
      overallNmae: r.overallNmae,
      overallR2: r.overallR2,
    })),
    comparisons: comparisons.map((c) => ({
      metric: c.metric,
      bestRun: c.bestRun,
      runs: c.runs,
    })),
    rankings,
    overallBest,
  };
}

/**
 * Print dataset generation completion
 */
export function printDatasetComplete(outputPath: string, count: number): void {
  console.log('');
  console.log(chalk.bold.green('═'.repeat(60)));
  console.log(chalk.bold.green('         Dataset Generation Complete'));
  console.log(chalk.bold.green('═'.repeat(60)));
  console.log('');
  console.log(chalk.white(`  📄 Output: ${chalk.bold(outputPath)}`));
  console.log(chalk.white(`  📊 Commits: ${count}`));
  console.log('');
  console.log(chalk.yellow('  Next steps:'));
  console.log(chalk.gray('    1. Open the CSV in a spreadsheet'));
  console.log(chalk.gray('    2. Review and adjust the values based on your judgment'));
  console.log(chalk.gray('    3. Save as your ground truth dataset'));
  console.log(chalk.gray('    4. Run: codewave benchmark --dataset <your-file.csv>'));
  console.log('');
}
