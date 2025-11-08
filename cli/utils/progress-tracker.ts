/**
 * ANSI Progress Tracker for Parallel Commit Evaluation
 * Each commit on its own line with direct stderr output
 * Similar to Docker pull - each item updates independently on separate lines
 */

interface CommitProgress {
    hash: string;
    shortHash: string;
    author: string;
    date: string;
    status: 'pending' | 'vectorizing' | 'analyzing' | 'complete' | 'failed';
    progress: number; // 0-100
    currentStep: string;
    totalSteps?: number;
    currentStepIndex?: number;
    inputTokens?: number;
    outputTokens?: number;
    totalCost?: number;
    lastDisplayLine?: string; // Track last displayed line to detect changes
    internalIterations?: number; // Agent self-refinement iterations
    clarityScore?: number; // Final clarity score (0-100)
}

export class ProgressTracker {
    private commits: Map<string, CommitProgress> = new Map();
    private isActive = false;
    private displayOrder: string[] = [];
    public originalConsoleLog?: (...args: any[]) => void;
    private lastUpdateTime: Map<string, number> = new Map();
    private UPDATE_THROTTLE_MS = 200;

    // Totals across all commits
    private totalInputTokens = 0;
    private totalOutputTokens = 0;
    private totalCost = 0;

    constructor() {
        // Initialize
    }

    /**
     * Helper to use original or current console.log
     */
    private log(...args: any[]) {
        if (this.originalConsoleLog) {
            this.originalConsoleLog(...args);
        } else {
            console.log(...args);
        }
    }

    /**
     * Helper to write directly to stderr
     */
    private writeProgress(text: string) {
        process.stderr.write(text + '\n');
    }

    /**
     * Initialize tracker with commits
     */
    initialize(commitHashes: Array<{ hash: string; shortHash: string; author: string; date: string }>) {
        this.displayOrder = commitHashes.map((c) => c.hash);

        // Print header to console (not stderr, so it's visible)
        this.log('\n\x1B[1m\x1B[36mParallel Commit Evaluation Progress:\x1B[0m\n');

        // Initialize all commits with pending status
        commitHashes.forEach((c) => {
            this.commits.set(c.hash, {
                hash: c.hash,
                shortHash: c.shortHash,
                author: c.author,
                date: c.date,
                status: 'pending',
                progress: 0,
                currentStep: 'Waiting...',
            });

            // Print initial line for this commit to stderr
            const initialLine = this.formatProgressLine(c.hash);
            this.writeProgress(initialLine);
        });

        this.isActive = true;
    }

    /**
     * Format progress line for display
     */
    private formatProgressLine(commitHash: string): string {
        const commit = this.commits.get(commitHash);
        if (!commit) return '';

        const shortHash = commit.shortHash.padEnd(9);
        const author = commit.author.substring(0, 16).padEnd(16);
        const tokens = commit.inputTokens || commit.outputTokens
            ? `${(commit.inputTokens || 0).toLocaleString()}/${(commit.outputTokens || 0).toLocaleString()}`.padEnd(18)
            : '─/─'.padEnd(18);
        const cost = commit.totalCost
            ? `$${(commit.totalCost).toFixed(4)}`.padEnd(10)
            : '─'.padEnd(10);
        const barLength = 20;
        const filledBars = Math.max(0, Math.round((commit.progress / 100) * barLength));
        const emptyBars = Math.max(0, barLength - filledBars);
        const bar = '█'.repeat(filledBars) + '░'.repeat(emptyBars);
        const percentage = `${commit.progress}%`.padStart(3);
        const status = this.getStatusText(commit.status).padEnd(12);

        // Add internal iterations display if available
        let iterationInfo = '';
        if (commit.internalIterations !== undefined && commit.internalIterations > 0) {
            const clarity = commit.clarityScore !== undefined ? ` clarity:${commit.clarityScore}%` : '';
            iterationInfo = ` | 🔄 ${commit.internalIterations} iter${clarity}`;
        }

        return `${shortHash} | ${author} | ${tokens} | ${cost} | ${bar} ${percentage} | ${status}${iterationInfo}`;
    }

    /**
     * Update progress for a specific commit
     */
    updateProgress(
        commitHash: string,
        update: {
            status?: CommitProgress['status'];
            progress?: number;
            currentStep?: string;
            totalSteps?: number;
            currentStepIndex?: number;
            inputTokens?: number;
            outputTokens?: number;
            totalCost?: number;
            internalIterations?: number;
            clarityScore?: number;
        },
    ) {
        const commit = this.commits.get(commitHash);
        if (!commit) return;

        // Throttle rapid updates (except for completion)
        const now = Date.now();
        const lastUpdate = this.lastUpdateTime.get(commitHash) || 0;
        const isComplete = update.status === 'complete' || update.progress === 100;

        if (!isComplete && now - lastUpdate < this.UPDATE_THROTTLE_MS) {
            return;
        }
        this.lastUpdateTime.set(commitHash, now);

        if (update.status !== undefined) commit.status = update.status;
        if (update.progress !== undefined) commit.progress = update.progress;
        if (update.currentStep !== undefined) commit.currentStep = update.currentStep;
        if (update.totalSteps !== undefined) commit.totalSteps = update.totalSteps;
        if (update.currentStepIndex !== undefined) commit.currentStepIndex = update.currentStepIndex;
        if (update.internalIterations !== undefined) commit.internalIterations = update.internalIterations;
        if (update.clarityScore !== undefined) commit.clarityScore = update.clarityScore;

        // Update token and cost tracking
        if (update.inputTokens !== undefined) {
            const delta = update.inputTokens - (commit.inputTokens || 0);
            commit.inputTokens = update.inputTokens;
            this.totalInputTokens += delta;
        }
        if (update.outputTokens !== undefined) {
            const delta = update.outputTokens - (commit.outputTokens || 0);
            commit.outputTokens = update.outputTokens;
            this.totalOutputTokens += delta;
        }
        if (update.totalCost !== undefined) {
            const delta = update.totalCost - (commit.totalCost || 0);
            commit.totalCost = update.totalCost;
            this.totalCost += delta;
        }

        // Format new line and only write if it has changed
        const newLine = this.formatProgressLine(commitHash);

        if (commit.lastDisplayLine !== newLine) {
            commit.lastDisplayLine = newLine;
            this.writeProgress(newLine);
        }
    }

    /**
     * Get status text for display
     */
    private getStatusText(status: CommitProgress['status']): string {
        switch (status) {
            case 'pending':
                return 'Pending';
            case 'vectorizing':
                return 'Indexing...';
            case 'analyzing':
                return 'Analyzing...';
            case 'complete':
                return '✅ Complete';
            case 'failed':
                return '❌ Failed';
            default:
                return 'Unknown';
        }
    }

    /**
     * Finalize progress tracking
     */
    finalize() {
        this.isActive = false;

        // Print summary totals
        const inputTokensFormatted = this.totalInputTokens.toLocaleString();
        const outputTokensFormatted = this.totalOutputTokens.toLocaleString();
        const costFormatted = `$${this.totalCost.toFixed(4)}`;

        this.log(
            `\n\x1B[1m\x1B[36mTotal:\x1B[0m ${inputTokensFormatted} input | ${outputTokensFormatted} output | ${costFormatted}`
        );

        // Add spacing
        this.log('');
    }

    /**
     * Get summary of results
     */
    getSummary(): { total: number; complete: number; failed: number; pending: number } {
        let complete = 0;
        let failed = 0;
        let pending = 0;

        this.commits.forEach((commit) => {
            if (commit.status === 'complete') complete++;
            else if (commit.status === 'failed') failed++;
            else pending++;
        });

        return { total: this.commits.size, complete, failed, pending };
    }
}
