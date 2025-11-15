export function parseCommitMessage(commitMessage: string): {
  type: string;
  scope?: string;
  subject: string;
} {
  const commitRegex = /^(?<type>\w+)(\((?<scope>[\w\s$.\-]*)\))?: (?<subject>.*)$/;
  const match = commitMessage.match(commitRegex);

  if (!match || !match.groups) {
    throw new Error('Invalid commit message format');
  }

  return {
    type: match.groups.type,
    scope: match.groups.scope,
    subject: match.groups.subject,
  };
}

export function isCommitMessageValid(commitMessage: string): boolean {
  const validTypes = ['feat', 'fix', 'docs', 'style', 'refactor', 'perf', 'test', 'chore'];
  const { type } = parseCommitMessage(commitMessage);
  return validTypes.includes(type);
}

export function formatCommitMessage(commit: {
  type: string;
  scope?: string;
  subject: string;
}): string {
  const { type, scope, subject } = commit;
  return scope ? `${type}(${scope}): ${subject}` : `${type}: ${subject}`;
}

export interface CommitStats {
  filesChanged: number;
  insertions: number;
  deletions: number;
}

/**
 * Parse commit statistics from git diff
 * Counts files changed, lines added, and lines removed
 */
export function parseCommitStats(diff: string): CommitStats {
  let filesChanged = 0;
  let insertions = 0;
  let deletions = 0;

  const lines = diff.split('\n');

  for (const line of lines) {
    // Count file changes (lines starting with "diff --git")
    if (line.startsWith('diff --git')) {
      filesChanged++;
    }
    // Count insertions (lines starting with +, excluding +++ headers)
    else if (line.startsWith('+') && !line.startsWith('+++')) {
      insertions++;
    }
    // Count deletions (lines starting with -, excluding --- headers)
    else if (line.startsWith('-') && !line.startsWith('---')) {
      deletions++;
    }
  }

  return {
    filesChanged,
    insertions,
    deletions,
  };
}
