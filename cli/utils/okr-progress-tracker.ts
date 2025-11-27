/**
 * OKR Progress Tracker using cli-progress
 * Adapted from ProgressTracker for OKR generation context
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

function getVisibleLength(str: string): number {
  const ansiRegex = new RegExp(String.fromCharCode(27) + '\\[[0-9;]*m', 'g');
  return str.replace(ansiRegex, '').length;
}

function padCellToWidth(value: string, targetWidth: number, rightAlign: boolean = false): string {
  const visibleLen = getVisibleLength(value);
  const padLength = Math.max(0, targetWidth - visibleLen);

  if (rightAlign) {
    return ' '.repeat(padLength) + value;
  } else {
    return value + ' '.repeat(padLength);
  }
}

function generateHeaderAndFormat(): { header: string; format: string; columnWidths: number[] } {
  const headers = ['Author', 'Status', 'Progress', 'Tokens (In/Out)', 'Cost'];

  // Author: 20 chars
  // Status: 10 chars
  // Progress: 20 chars (bar)
  // Tokens: 20 chars (e.g. "10k/5k")
  // Cost: 10 chars
  const columnWidths = [20, 12, 20, 20, 10];

  const paddedHeaders = headers.map((h, i) => {
    const colored = `${colors.bright}${colors.cyan}${h}${colors.reset}`;
    return padCellToWidth(colored, columnWidths[i]);
  });
  const header = `\n${paddedHeaders.join('  ')}\n`;

  const coloredFormats = [
    `${colors.white}{author}${colors.reset}`,
    `${colors.magenta}{status}${colors.reset}`,
    `${colors.blue}{bar}${colors.reset}`,
    `${colors.yellow}{tokens}${colors.reset}`,
    `${colors.cyan}{cost}${colors.reset}`,
  ];

  const format = coloredFormats.join('  ');

  return { header, format, columnWidths };
}

export class OkrProgressTracker implements ProgressRenderer {
  private multibar: cliProgress.MultiBar | null = null;
  private bars: Map<string, cliProgress.SingleBar> = new Map();
  private columnWidths: number[] = [];
  private totalCost = 0;

  constructor() {}

  initialize(authors: string[]) {
    const { header, format, columnWidths } = generateHeaderAndFormat();
    this.columnWidths = columnWidths;

    consoleManager.logImportant(header);

    this.multibar = new cliProgress.MultiBar(
      {
        clearOnComplete: false,
        hideCursor: true,
        format: format,
        barCompleteChar: '█',
        barIncompleteChar: '░',
        barsize: 20,
        fps: 10,
      },
      cliProgress.Presets.shades_grey
    );

    authors.forEach((author) => {
      const initialStatus = `${colors.dim}pending${colors.reset}`;
      const initialTokens = `${colors.dim}0/0${colors.reset}`;
      const initialCost = `${colors.dim}$0${colors.reset}`;

      const bar = this.multibar!.create(100, 0, {
        author: padCellToWidth(author.substring(0, 18), this.columnWidths[0]),
        status: padCellToWidth(initialStatus, this.columnWidths[1]),
        tokens: padCellToWidth(initialTokens, this.columnWidths[3]),
        cost: padCellToWidth(initialCost, this.columnWidths[4]),
      });

      this.bars.set(author, bar);
    });
  }

  update(author: string, data: any) {
    const bar = this.bars.get(author);
    if (!bar) return;

    // Update status
    let statusStr = data.status || 'pending';
    if (data.status === 'running') statusStr = `${colors.yellow}running${colors.reset}`;
    else if (data.status === 'done') statusStr = `${colors.green}done${colors.reset}`;
    else if (data.status === 'failed') statusStr = `${colors.red}failed${colors.reset}`;
    else statusStr = `${colors.dim}${statusStr}${colors.reset}`;

    // Update tokens
    let tokensStr = `${colors.dim}0/0${colors.reset}`;
    if (data.inputTokens !== undefined && data.outputTokens !== undefined) {
      const inK = (data.inputTokens / 1000).toFixed(0);
      const outK = (data.outputTokens / 1000).toFixed(0);
      tokensStr = `${inK}k/${outK}k`;
    }

    // Update cost
    let costStr = `${colors.dim}$0${colors.reset}`;
    if (data.cost !== undefined) {
      costStr = `${colors.cyan}$${data.cost.toFixed(4)}${colors.reset}`;
    }

    // Progress - more granular updates
    let progress = 0;
    if (data.status === 'done') {
      progress = 100;
    } else if (data.status === 'running') {
      // Show progress based on which data we have
      if (data.strongPoints !== undefined) {
        progress = 75; // Have OKR items, almost done
      } else {
        progress = 33; // Still generating
      }
    } else if (data.status === 'pending') {
      progress = 0;
    }

    bar.update(progress, {
      status: padCellToWidth(statusStr, this.columnWidths[1]),
      tokens: padCellToWidth(tokensStr, this.columnWidths[3]),
      cost: padCellToWidth(costStr, this.columnWidths[4]),
    });
  }

  stop() {
    if (this.multibar) {
      this.multibar.stop();
      this.multibar = null;
    }
  }
}
