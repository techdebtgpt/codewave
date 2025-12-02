/**
 * Console Manager
 * Handles console interception and output management
 */
export class ConsoleManager {
  private originalLog: typeof console.log;
  private originalWarn: typeof console.warn;
  private originalError: typeof console.error;
  private isSuppressing = false;
  private filterFn: ((args: any[], type: 'log' | 'warn' | 'error') => boolean) | null = null;

  constructor() {
    this.originalLog = console.log;
    this.originalWarn = console.warn;
    this.originalError = console.error;
  }

  /**
   * Start suppressing console output based on a filter function
   * @param filterFn Function that returns true if the log should be suppressed
   */
  startSuppressing(filterFn: (args: any[], type: 'log' | 'warn' | 'error') => boolean) {
    if (this.isSuppressing) return;

    this.filterFn = filterFn;
    this.isSuppressing = true;

    console.log = (...args: any[]) => {
      if (this.filterFn && this.filterFn(args, 'log')) {
        return; // Suppress
      }
      this.originalLog(...args);
    };

    console.warn = (...args: any[]) => {
      if (this.filterFn && this.filterFn(args, 'warn')) {
        return; // Suppress
      }
      this.originalWarn(...args);
    };

    console.error = (...args: any[]) => {
      if (this.filterFn && this.filterFn(args, 'error')) {
        return; // Suppress
      }
      this.originalError(...args);
    };
  }

  /**
   * Stop suppressing console output and restore original methods
   */
  stopSuppressing() {
    if (!this.isSuppressing) return;

    console.log = this.originalLog;
    console.warn = this.originalWarn;
    console.error = this.originalError;
    this.isSuppressing = false;
    this.filterFn = null;
  }

  /**
   * Log a message directly to stdout, bypassing any active suppression
   */
  logImportant(...args: any[]) {
    this.originalLog(...args);
  }

  /**
   * Log a warning directly to stderr, bypassing any active suppression
   */
  warnImportant(...args: any[]) {
    this.originalWarn(...args);
  }

  /**
   * Log an error directly to stderr, bypassing any active suppression
   */
  errorImportant(...args: any[]) {
    this.originalError(...args);
  }

  /**
   * Get the original console.log function
   */
  getOriginalLog() {
    return this.originalLog;
  }
}

export const consoleManager = new ConsoleManager();
