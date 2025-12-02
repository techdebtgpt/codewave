/**
 * Progress Tracker using cli-progress
 * Safe multi-bar progress tracking without manual ANSI control
 * No console.log, console.error, or process.stderr/stdout interference
 */

import cliProgress from 'cli-progress';
import { ProgressRenderer } from './progress-renderer.interface';
import { consoleManager } from '../../src/common/utils/console-manager';

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
 * Pad a cell value to match the expected column width
 * Accounts for ANSI color codes in the length calculation
 * Pads on the RIGHT for text columns, LEFT for numeric columns
 */
function padCellToWidth(value: string, targetWidth: number, rightAlign: boolean = false): string {
  const visibleLen = getVisibleLength(value);
  const padLength = Math.max(0, targetWidth - visibleLen);

  if (rightAlign) {
    // Right-align: pad on the left
    return ' '.repeat(padLength) + value;
  } else {
    // Left-align: pad on the right
    return value + ' '.repeat(padLength);
  }
}

/**
 * Generate aligned header and column widths
 * Uses fixed, sensible widths that accommodate typical data
 */
function generateHeaderAndFormat(): { header: string; format: string; columnWidths: number[] } {
  // Define headers and fixed column widths
  // These widths are chosen to accommodate typical values while maintaining readability
  const headers = [
    'Commit',
    'User',
    'Diff',
    'Chunks',
    'Analysis',
    'State',
    'Tokens',
    'Cost',
    'Round',
  ];

  // Fixed column widths that work well with typical data
  // Commit: 7 chars for hash + 2 padding = 9
  // User: 12 chars for author + 2 padding = 14
  // Diff: 18 chars for "1000KB +12000/-5000" + 2 padding = 20
  // Chunks: 5 chars for "100/50" + 2 padding = 7
  // Analysis (bar): 13 chars (progress bar width)
  // State: 14 chars for "complete/failed" + 2 padding = 16
  // Tokens: 15 chars for "9999999/9999999" + 2 padding = 17
  // Cost: 8 chars for "$99.9999" + 2 padding = 10
  // Round: 5 chars for "10/10" + 2 padding = 7
  const columnWidths = [9, 14, 20, 7, 13, 16, 17, 10, 7];

  // Generate colored header with proper padding
  // Note: Analysis column (index 4) is NOT padded because it contains dynamic bar + agent
  const paddedHeaders = headers.map((h, i) => {
    const colored = `${colors.bright}${colors.cyan}${h}${colors.reset}`;
    return padCellToWidth(colored, columnWidths[i]);
  });
  const header = `\n${paddedHeaders.join('  ')}\n`;

  // Generate format string for cli-progress with double-space separation
  const coloredFormats = [
    `${colors.green}{commit}${colors.reset}`,
    `${colors.white}{user}${colors.reset}`,
    `${colors.dim}{diff}${colors.reset}`,
    `${colors.yellow}{chunks}${colors.reset}`,
    `${colors.blue}{bar}${colors.reset} ${colors.dim}{agent}${colors.reset}`,
    `${colors.magenta}{state}${colors.reset}`,
    `${colors.bright}{tokens}${colors.reset}`,
    `${colors.cyan}{cost}${colors.reset}`,
    `${colors.green}{round}${colors.reset}`,
  ];

  const format = coloredFormats.join('  ');

  return { header, format, columnWidths };
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
  diffSizeKB?: string;
  additions?: number;
  deletions?: number;
  chunks?: number;
  files?: number;
}

export class ProgressTracker implements ProgressRenderer {
  private multibar: cliProgress.MultiBar | null = null;
  private bars: Map<string, cliProgress.SingleBar> = new Map();
  private commits: Map<string, CommitProgress> = new Map();
  private commitProgress: Map<string, number> = new Map();
  private commitVectorProgress: Map<string, number> = new Map();
  private commitDiffStats: Map<string, { sizeKB: string; additions: number; deletions: number }> =
    new Map(); // NEW: Track diff stats
  private commitChunks: Map<string, { chunks: number; files: number }> = new Map(); // NEW: Track chunks/files
  private commitState: Map<string, string> = new Map();
  private commitRound: Map<string, { current: number; max: number }> = new Map();
  private commitTokens: Map<string, { input: number; output: number; cost: number }> = new Map();
  private commitErrors: Map<string, string> = new Map(); // Track errors per commit
  private commitCurrentAgent: Map<string, string> = new Map(); // Track current agent
  private columnWidths: number[] = []; // Store column widths for consistent padding
  private totalInputTokens = 0;
  private totalOutputTokens = 0;
  private totalCost = 0;
  private completedCommits = 0;
  private failedCommits = 0;

  constructor() {}

  /**
   * Initialize tracker with commits using cli-progress
   */
  initialize(
    commitHashes: Array<{ hash: string; shortHash: string; author: string; date: string }>
  ) {
    // Generate aligned header and format string with proper column widths
    const { header, format, columnWidths } = generateHeaderAndFormat();
    this.columnWidths = columnWidths; // Store for use in updateProgress

    // Print aligned header with column labels (using consoleManager to ensure it prints)
    consoleManager.logImportant(header);

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
      this.commitDiffStats.set(c.hash, { sizeKB: '0KB', additions: 0, deletions: 0 }); // Initialize diff stats
      this.commitChunks.set(c.hash, { chunks: 0, files: 0 }); // Initialize chunks/files
      this.commitState.set(c.hash, 'pending');
      this.commitRound.set(c.hash, { current: 0, max: 0 });
      this.commitTokens.set(c.hash, { input: 0, output: 0, cost: 0 });

      const shortCommit = c.shortHash.substring(0, 7);
      const user = c.author.substring(0, 12).padEnd(12);

      // Pre-pad all initial values to match column widths
      const initialDiff = `${colors.dim}0KB +0/-0${colors.reset}`;
      const initialChunks = `${colors.dim}0/0${colors.reset}`;
      const initialState = `${colors.dim}pending${colors.reset}`;
      const initialTokens = `${colors.dim}0/0${colors.reset}`;
      const initialCost = `${colors.dim}$0.00${colors.reset}`;
      const initialRound = `${colors.dim}0/0${colors.reset}`;

      const bar = this.multibar!.create(100, 0, {
        commit: padCellToWidth(shortCommit, this.columnWidths[0]),
        user: padCellToWidth(user, this.columnWidths[1]),
        diff: padCellToWidth(initialDiff, this.columnWidths[2]),
        chunks: padCellToWidth(initialChunks, this.columnWidths[3]),
        percentage: 0,
        value: 0,
        total: 100,
        state: padCellToWidth(initialState, this.columnWidths[5]),
        tokens: padCellToWidth(initialTokens, this.columnWidths[6]),
        cost: padCellToWidth(initialCost, this.columnWidths[7]),
        round: padCellToWidth(initialRound, this.columnWidths[8]),
        agent: '', // Initialize agent field (empty initially)
      });

      this.bars.set(c.hash, bar);
    });
  }

  /**
   * Update progress for a specific commit
   */
  update(commitHash: string, update: any) {
    this.updateProgress(commitHash, update);
  }

  /**
   * Stop the renderer and clean up
   */
  stop() {
    this.finalize();
  }

  /**
   * Update progress for a specific commit (Legacy method kept for compatibility)
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
      diffSizeKB?: string; // NEW: Diff size in KB
      additions?: number; // NEW: Lines added
      deletions?: number; // NEW: Lines deleted
      chunks?: number; // NEW: Number of chunks indexed
      files?: number; // NEW: Number of files indexed
    }
  ) {
    const bar = this.bars.get(commitHash);
    if (!bar) return;

    // Track diff stats (store once when provided)
    if (
      update.diffSizeKB !== undefined &&
      update.additions !== undefined &&
      update.deletions !== undefined
    ) {
      this.commitDiffStats.set(commitHash, {
        sizeKB: update.diffSizeKB,
        additions: update.additions,
        deletions: update.deletions,
      });
    }

    // Track chunks/files (store once when provided)
    if (update.chunks !== undefined && update.files !== undefined) {
      this.commitChunks.set(commitHash, {
        chunks: update.chunks,
        files: update.files,
      });
    }

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

    // Format token info with colors (consolidated to reduce ANSI code overhead)
    const costColor = totalCost > 0 ? colors.magenta : colors.dim;
    const tokenStr = `${colors.bright}${inputTokens.toLocaleString()}/${outputTokens.toLocaleString()}${colors.reset}`;
    const costStr = `${costColor}$${totalCost.toFixed(4)}${colors.reset}`;

    // Format round info (display is 1-indexed, storage is 0-indexed)
    const roundInfo = this.commitRound.get(commitHash);
    const roundStr = roundInfo
      ? `${colors.bright}${Math.min(roundInfo.current + 1, roundInfo.max)}/${roundInfo.max}${colors.reset}`
      : `${colors.dim}0/0${colors.reset}`;

    // Get current state
    const currentState = this.commitState.get(commitHash) || `${colors.dim}pending${colors.reset}`;

    // Format diff stats
    const diffStats = this.commitDiffStats.get(commitHash) || {
      sizeKB: '0KB',
      additions: 0,
      deletions: 0,
    };
    const diffColor = diffStats.sizeKB !== '0KB' ? colors.white : colors.dim;
    const diffStr = `${diffColor}${diffStats.sizeKB} +${diffStats.additions}/-${diffStats.deletions}${colors.reset}`;

    // Format chunks/files stats
    const chunksData = this.commitChunks.get(commitHash) || { chunks: 0, files: 0 };
    const chunksColor = chunksData.chunks > 0 ? colors.yellow : colors.dim;
    const chunksStr = `${chunksColor}${chunksData.chunks}/${chunksData.files}${colors.reset}`;

    // Get current agent (show abbreviated name after bar)
    const currentAgent = this.commitCurrentAgent.get(commitHash);
    const agentStr = currentAgent ? `[${currentAgent.substring(0, 8)}...]` : '';

    // Get commit and user data for padding
    const commit = this.commits.get(commitHash);
    const shortCommit = commit?.shortHash.substring(0, 7) || commitHash.substring(0, 7);
    const user = commit?.author.substring(0, 12) || 'unknown'; // Let padCellToWidth handle all padding

    // Pad each cell to match column widths for consistent alignment
    // Column indices: 0=commit, 1=user, 2=diff, 3=chunks, 4=bar, 5=state, 6=tokens, 7=cost, 8=round
    const paddedValues = {
      commit: padCellToWidth(shortCommit, this.columnWidths[0]),
      user: padCellToWidth(user, this.columnWidths[1]),
      diff: padCellToWidth(diffStr, this.columnWidths[2]),
      chunks: padCellToWidth(chunksStr, this.columnWidths[3]),
      state: padCellToWidth(currentState, this.columnWidths[5]),
      tokens: padCellToWidth(tokenStr, this.columnWidths[6]),
      cost: padCellToWidth(costStr, this.columnWidths[7]),
      round: padCellToWidth(roundStr, this.columnWidths[8]),
      agent: agentStr,
    };

    bar.update(currentProgress, paddedValues);
  }

  /**
   * Finalize progress tracking
   */
  finalize() {
    if (this.multibar) {
      this.multibar.stop();
      this.multibar = null;
    }

    // Print summary using consoleManager.logImportant (safe after multibar is stopped) with colors
    const inputTokensFormatted = this.totalInputTokens.toLocaleString();
    const outputTokensFormatted = this.totalOutputTokens.toLocaleString();
    const costFormatted = `$${this.totalCost.toFixed(4)}`;

    consoleManager.logImportant(
      `\n📊 ${colors.bright}Total:${colors.reset} ${colors.green}${inputTokensFormatted}${colors.reset} input | ${colors.yellow}${outputTokensFormatted}${colors.reset} output | ${colors.magenta}${costFormatted}${colors.reset}\n`
    );

    // Print error summary if there were any failures
    if (this.failedCommits > 0 && this.commitErrors.size > 0) {
      consoleManager.logImportant(
        `${colors.red}${colors.bright}❌ Failed Commits:${colors.reset}\n`
      );
      for (const [commitHash, errorMessage] of this.commitErrors.entries()) {
        const commit = this.commits.get(commitHash);
        const shortHash = commit?.shortHash || commitHash.substring(0, 7);
        const author = commit?.author || 'unknown';
        consoleManager.logImportant(
          `  ${colors.red}●${colors.reset} ${colors.bright}${shortHash}${colors.reset} (${author})`
        );
        consoleManager.logImportant(`    ${colors.dim}Error: ${errorMessage}${colors.reset}\n`);
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
