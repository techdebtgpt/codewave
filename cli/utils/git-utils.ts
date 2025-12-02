import { spawnSync } from 'child_process';
import { createHash } from 'crypto';

/**
 * Get diff from git for a specific commit hash
 */
export function getCommitDiff(commitHash: string, repoPath: string = '.'): string {
  try {
    const result = spawnSync('git', ['show', commitHash], {
      cwd: repoPath,
      encoding: 'utf-8',
      maxBuffer: 10 * 1024 * 1024, // 10MB buffer
    });

    if (result.error) {
      throw result.error;
    }
    if (result.status !== 0) {
      console.error(`Failed to get diff for commit ${commitHash}: ${result.stderr}`);
      return '';
    }

    return result.stdout;
  } catch (error) {
    console.error(`Failed to get diff for commit ${commitHash}:`, error);
    return '';
  }
}

/**
 * Get diff from current staged changes
 */
export function getDiffFromStaged(repoPath: string = '.'): string {
  const result = spawnSync('git', ['diff', '--cached'], {
    cwd: repoPath,
    encoding: 'utf-8',
    maxBuffer: 10 * 1024 * 1024,
  });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`Git command failed: ${result.stderr}`);
  }

  if (!result.stdout || result.stdout.trim().length === 0) {
    throw new Error('No staged changes found. Use "git add" to stage your changes first.');
  }

  return result.stdout;
}

/**
 * Get diff from current working directory changes (staged + unstaged)
 */
export function getDiffFromCurrent(repoPath: string = '.'): string {
  const result = spawnSync('git', ['diff', 'HEAD'], {
    cwd: repoPath,
    encoding: 'utf-8',
    maxBuffer: 10 * 1024 * 1024,
  });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`Git command failed: ${result.stderr}`);
  }

  if (!result.stdout || result.stdout.trim().length === 0) {
    throw new Error('No changes found in working directory.');
  }

  return result.stdout;
}

/**
 * Extract files changed from diff content
 */
export function extractFilesFromDiff(diff: string): string[] {
  const files: string[] = [];
  const lines = diff.split('\n');

  for (const line of lines) {
    if (line.startsWith('diff --git')) {
      const match = line.match(/diff --git a\/(.+?) b\//);
      if (match) {
        files.push(match[1]);
      }
    }
  }

  return files;
}

/**
 * Extract commit hash from diff content
 */
export function extractCommitHash(diff: string): string | null {
  // Try to find commit hash in diff header (git diff output)
  const commitMatch = diff.match(/^commit ([a-f0-9]{40})/m);
  if (commitMatch) {
    return commitMatch[1].substring(0, 8); // Use short hash
  }

  // Try to find in "From" line (git format-patch)
  const fromMatch = diff.match(/^From ([a-f0-9]{40})/m);
  if (fromMatch) {
    return fromMatch[1].substring(0, 8);
  }

  return null;
}

/**
 * Generate commit hash from diff content if not found
 */
export function generateDiffHash(diff: string): string {
  return createHash('sha256').update(diff).digest('hex').substring(0, 8);
}
