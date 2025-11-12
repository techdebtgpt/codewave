/**
 * Progress Tracker using cli-progress
 * Safe multi-bar progress tracking without manual ANSI control
 * No console.log, console.error, or process.stderr/stdout interference
 */

import cliProgress from 'cli-progress';
import { table } from 'table';

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  white: '\x1b[37m',
  red: '\x1b[31m',
};

/**
 * Calculate visible length of a string (excluding ANSI codes)
 */
function getVisibleLength(str: string): number {
  // Remove ANSI escape sequences: ESC [ ... m
  const ansiRegex = new RegExp(String.fromCharCode(27) + '\\[[0-9;]*m', 'g');
  return str.replace(ansiRegex, '').length;
}

/**
 * Generate aligned header using table library
 * Returns both the header line and format string with proper spacing
 */
function generateHeaderAndFormat(): { header: string; format: string } {
  // Define column headers
  const headers = ['Commit', 'User', 'Vector', 'Analysis', 'State', 'Tokens', 'Cost', 'Round'];

  // Create sample data row to determine column widths (with extra space for readability)
  const sampleData = [
    headers,
    [
      '6b66968',
      'john-doe-long',
      '100%',
      '███░░░░░░░░░░░░░░',
      'running',
      '1250000/284000',
      '$1.2345',
      '3/3',
    ],
  ];

  // Generate table to get proper widths
  const tableOutput = table(sampleData, {
    border: {
      topBody: '',
      topJoin: '',
      topLeft: '',
      topRight: '',
      bottomBody: '',
      bottomRight: '',
      bodyLeft: '',
      bodyRight: '',
      bodyJoin: '',
      joinBody: '',
      joinLeft: '',
      joinRight: '',
      joinJoin: '',
    },
    drawHorizontalLine: () => false,
  });

  // Extract widths from the table output
  const lines = tableOutput.split('\n');
  const dataLine = lines[1];

  // Parse column widths from the data line
  const dataColumns = dataLine.split(/  +/);
  const widths = dataColumns.map((col) => col.length);

  // Generate colored header
  const coloredHeaders = [
    `${colors.bright}${colors.cyan}${headers[0]}${colors.reset}`,
    `${colors.bright}${colors.cyan}${headers[1]}${colors.reset}`,
    `${colors.bright}${colors.cyan}${headers[2]}${colors.reset}`,
    `${colors.bright}${colors.cyan}${headers[3]}${colors.reset}`,
    `${colors.bright}${colors.cyan}${headers[4]}${colors.reset}`,
    `${colors.bright}${colors.cyan}${headers[5]}${colors.reset}`,
    `${colors.bright}${colors.cyan}${headers[6]}${colors.reset}`,
    `${colors.bright}${colors.cyan}${headers[7]}${colors.reset}`,
  ];

  // Pad columns to match widths, accounting for ANSI code lengths
  const paddedHeaders = coloredHeaders.map((h, i) => {
    const visibleLen = getVisibleLength(h);
    const padLength = widths[i] - visibleLen;
    return h + ' '.repeat(Math.max(0, padLength));
  });
  const header = `\n${paddedHeaders.join('  ')}\n`;

  // Generate format string for cli-progress with proper spacing
  const coloredFormats = [
    `${colors.green}{commit}${colors.reset}`,
    `${colors.white}{user}${colors.reset}`,
    `${colors.yellow}{vector}${colors.reset}`,
    `${colors.blue}{bar}${colors.reset} ${colors.dim}{agent}${colors.reset}`,
    `${colors.magenta}{state}${colors.reset}`,
    `${colors.bright}{tokens}${colors.reset}`,
    `${colors.cyan}{cost}${colors.reset}`,
    `${colors.green}{round}${colors.reset}`,
  ];

  // Build format string with placeholders for dynamic values
  // Use the same sample data values to calculate expected lengths
  const sampleValues = [
    '6b66968',
    'john-doe-long',
    '100%',
    '███░░░░░░░░░░░░░░',
    'running',
    '1250000/284000',
    '$1.2345',
    '3/3',
  ];

  const format = coloredFormats
    .map((fmt, i) => {
      // Use actual sample data length as the expected visible length
      const estimatedLen = sampleValues[i].length;
      const padLength = widths[i] - estimatedLen;
      return fmt + ' '.repeat(Math.max(0, padLength));
    })
    .join('  ');

  return { header, format };
}

interface CommitProgress {
  hash: string;
  shortHash: string;
  author: string;
  date: string;
  vectorProgress?: number;
  state?: string;
  currentRound?: number;
  maxRounds?: number;
}

export class ProgressTracker {
  private multibar: cliProgress.MultiBar | null = null;
  private bars: Map<string, cliProgress.SingleBar> = new Map();
  private commits: Map<string, CommitProgress> = new Map();
  private commitProgress: Map<string, number> = new Map();
  private commitVectorProgress: Map<string, number> = new Map();
  private commitState: Map<string, string> = new Map();
  private commitRound: Map<string, { current: number; max: number }> = new Map();
  private commitTokens: Map<string, { input: number; output: number; cost: number }> = new Map();
  private commitErrors: Map<string, string> = new Map(); // Track errors per commit
  private commitCurrentAgent: Map<string, string> = new Map(); // Track current agent
  private totalInputTokens = 0;
  private totalOutputTokens = 0;
  private totalCost = 0;
  private completedCommits = 0;
  private failedCommits = 0;
  private originalLog?: typeof console.log;

  constructor(originalLog?: typeof console.log) {
    this.originalLog = originalLog;
  }

  /**
   * Initialize tracker with commits using cli-progress
   */
  initialize(
    commitHashes: Array<{ hash: string; shortHash: string; author: string; date: string }>
  ) {
    // Generate aligned header and format string with proper column widths
    const { header, format } = generateHeaderAndFormat();

    // Print aligned header with column labels (using original console.log to avoid suppression)
    const logFn = this.originalLog || console.log;
    logFn(header);

    // Initialize multibar container with color formatting
    this.multibar = new cliProgress.MultiBar(
      {
        clearOnComplete: false,
        hideCursor: true,
        format: format,
        barCompleteChar: '█',
        barIncompleteChar: '░',
        barsize: 12,
        fps: 10,
      },
      cliProgress.Presets.shades_grey
    );

    // Create a progress bar for each commit
    commitHashes.forEach((c) => {
      this.commits.set(c.hash, {
        hash: c.hash,
        shortHash: c.shortHash,
        author: c.author,
        date: c.date,
        vectorProgress: 0,
        state: 'pending',
        currentRound: 0,
        maxRounds: 0,
      });

      this.commitProgress.set(c.hash, 0);
      this.commitVectorProgress.set(c.hash, 0);
      this.commitState.set(c.hash, 'pending');
      this.commitRound.set(c.hash, { current: 0, max: 0 });
      this.commitTokens.set(c.hash, { input: 0, output: 0, cost: 0 });

      const shortCommit = c.shortHash.substring(0, 7);
      const user = c.author.substring(0, 12).padEnd(12);

      const bar = this.multibar!.create(100, 0, {
        commit: shortCommit,
        user: user,
        vector: `${colors.dim}0%${colors.reset}`,
        percentage: 0,
        value: 0,
        total: 100,
        state: `${colors.dim}pending${colors.reset}`,
        tokens: `${colors.dim}0/0${colors.reset}`,
        cost: `${colors.dim}$0.00${colors.reset}`,
        round: `${colors.dim}0/0${colors.reset}`,
        agent: '', // Initialize agent field (empty initially)
      });

      this.bars.set(c.hash, bar);
    });
  }

  /**
   * Update progress for a specific commit
   */
  updateProgress(
    commitHash: string,
    update: {
      status?: 'pending' | 'vectorizing' | 'analyzing' | 'complete' | 'failed';
      progress?: number;
      currentStep?: string;
      totalSteps?: number;
      currentStepIndex?: number;
      inputTokens?: number;
      outputTokens?: number;
      totalCost?: number;
      internalIterations?: number;
      clarityScore?: number;
      currentRound?: number;
      maxRounds?: number;
      currentAgent?: string; // Name of currently executing agent
      errorMessage?: string; // Error message if failed
    }
  ) {
    const bar = this.bars.get(commitHash);
    if (!bar) return;

    // Track round information
    if (update.currentRound !== undefined && update.maxRounds !== undefined) {
      this.commitRound.set(commitHash, { current: update.currentRound, max: update.maxRounds });
    }

    // Track current agent
    if (update.currentAgent) {
      this.commitCurrentAgent.set(commitHash, update.currentAgent);
    }

    // Track error message
    if (update.errorMessage) {
      this.commitErrors.set(commitHash, update.errorMessage);
    }

    // Update status/state
    if (update.status) {
      const stateMap: Record<string, string> = {
        pending: `${colors.dim}pending${colors.reset}`,
        vectorizing: `${colors.yellow}loading${colors.reset}`,
        analyzing: `${colors.cyan}running${colors.reset}`,
        complete: `${colors.green}done${colors.reset}`,
        failed: `${colors.red}error${colors.reset}`,
      };
      this.commitState.set(commitHash, stateMap[update.status] || update.status);

      // Track completion and failure states
      if (update.status === 'complete') {
        this.completedCommits++;
      } else if (update.status === 'failed') {
        this.failedCommits++;
      }
    }

    // Track vector store progress (0-100%) - gradual progress not instant
    if (update.status === 'vectorizing' && update.progress !== undefined) {
      this.commitVectorProgress.set(commitHash, update.progress);
    } else if (update.status === 'analyzing') {
      this.commitVectorProgress.set(commitHash, 100); // Mark vectorizing complete
    }

    // Track analysis progress (0-100%)
    let currentProgress = this.commitProgress.get(commitHash) || 0;
    if (update.status === 'analyzing' && update.progress !== undefined) {
      currentProgress = update.progress;
      this.commitProgress.set(commitHash, currentProgress);
    }

    // Get token and cost data
    const inputTokens = update.inputTokens || 0;
    const outputTokens = update.outputTokens || 0;
    const totalCost = update.totalCost || 0;

    // Track tokens per commit to avoid duplication
    // Only update totals when tokens change for this commit
    const commitTokens = this.commitTokens.get(commitHash) || { input: 0, output: 0, cost: 0 };
    const prevInput = commitTokens.input;
    const prevOutput = commitTokens.output;
    const prevCost = commitTokens.cost;

    if (update.inputTokens !== undefined && update.inputTokens !== prevInput) {
      this.totalInputTokens += update.inputTokens - prevInput;
      commitTokens.input = update.inputTokens;
    }
    if (update.outputTokens !== undefined && update.outputTokens !== prevOutput) {
      this.totalOutputTokens += update.outputTokens - prevOutput;
      commitTokens.output = update.outputTokens;
    }
    if (update.totalCost !== undefined && update.totalCost !== prevCost) {
      this.totalCost += update.totalCost - prevCost;
      commitTokens.cost = update.totalCost;
    }

    this.commitTokens.set(commitHash, commitTokens);

    // Format vector progress
    const vectorPct = this.commitVectorProgress.get(commitHash) || 0;
    const vectorColor =
      vectorPct === 100 ? colors.green : vectorPct > 0 ? colors.yellow : colors.dim;
    const vectorStr = `${vectorColor}${vectorPct}%${colors.reset}`;

    // Format token info with colors
    const inputColor = inputTokens > 0 ? colors.green : colors.dim;
    const outputColor = outputTokens > 0 ? colors.yellow : colors.dim;
    const costColor = totalCost > 0 ? colors.magenta : colors.dim;

    const tokenStr = `${inputColor}${inputTokens.toLocaleString()}${colors.reset}/${outputColor}${outputTokens.toLocaleString()}${colors.reset}`;
    const costStr = `${costColor}$${totalCost.toFixed(4)}${colors.reset}`;

    // Format round info (display is 1-indexed, storage is 0-indexed)
    const roundInfo = this.commitRound.get(commitHash);
    const roundStr = roundInfo
      ? `${colors.cyan}${Math.min(roundInfo.current + 1, roundInfo.max)}/${roundInfo.max}${colors.reset}`
      : `${colors.dim}0/0${colors.reset}`;

    // Get current state
    const currentState = this.commitState.get(commitHash) || `${colors.dim}pending${colors.reset}`;

    // Get current agent (show abbreviated name after bar)
    const currentAgent = this.commitCurrentAgent.get(commitHash);
    const agentStr = currentAgent ? `[${currentAgent.substring(0, 8)}...]` : '';

    bar.update(currentProgress, {
      vector: vectorStr,
      state: currentState,
      tokens: tokenStr,
      cost: costStr,
      round: roundStr,
      agent: agentStr,
    });
  }

  /**
   * Finalize progress tracking
   */
  finalize() {
    if (this.multibar) {
      this.multibar.stop();
      this.multibar = null;
    }

    // Print summary using console.log (safe after multibar is stopped) with colors
    const inputTokensFormatted = this.totalInputTokens.toLocaleString();
    const outputTokensFormatted = this.totalOutputTokens.toLocaleString();
    const costFormatted = `$${this.totalCost.toFixed(4)}`;

    console.log(
      `\n📊 ${colors.bright}Total:${colors.reset} ${colors.green}${inputTokensFormatted}${colors.reset} input | ${colors.yellow}${outputTokensFormatted}${colors.reset} output | ${colors.magenta}${costFormatted}${colors.reset}\n`
    );

    // Print error summary if there were any failures
    if (this.failedCommits > 0 && this.commitErrors.size > 0) {
      console.log(`${colors.red}${colors.bright}❌ Failed Commits:${colors.reset}\n`);
      for (const [commitHash, errorMessage] of this.commitErrors.entries()) {
        const commit = this.commits.get(commitHash);
        const shortHash = commit?.shortHash || commitHash.substring(0, 7);
        const author = commit?.author || 'unknown';
        console.log(`  ${colors.red}●${colors.reset} ${colors.bright}${shortHash}${colors.reset} (${author})`);
        console.log(`    ${colors.dim}Error: ${errorMessage}${colors.reset}\n`);
      }
    }
  }

  /**
   * Get summary of results
   */
  getSummary(): { total: number; complete: number; failed: number; pending: number } {
    const pending = this.commits.size - this.completedCommits - this.failedCommits;
    return {
      total: this.commits.size,
      complete: this.completedCommits,
      failed: this.failedCommits,
      pending: pending,
    };
  }
}
