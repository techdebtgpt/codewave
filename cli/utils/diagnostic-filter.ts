/**
 * Diagnostic Log Filter
 * Filters out verbose diagnostic logs during evaluation
 */

const DIAGNOSTIC_PATTERNS = [
  'Found file via diff',
  'Confirmed file via',
  'Building in-memory vector store',
  'Vector store ready',
  'Detecting agent',
  'Developer overview generated',
  'State update from',
  'Streaming enabled',
  'Indexing:',
  'Cleaning up vector store',
  'responses (rounds:',
  '🚀 Starting commit evaluation',
  'Large diff detected',
  '📦 Initializing RAG vector store',
  'First 3 lines:',
  '📝 Generating developer overview',
  'Evaluation complete in',
  'Total agents:',
  'Discussion rounds:',
  '💰',
  'Round .*Raising Concerns',
  'Round .*Validation & Final',
  'Missing metric.*setting to null',
  'returned null for PRIMARY metric',
  'All agents returned null for pillar',
  'Total weight is 0 for pillar',
  'Invalid type for.*setting to null',
  '🚀 Starting.*agents...',
  'Starting initial analysis \\(iteration',
  'Refining analysis \\(iteration',
  'Clarity .*% \\(threshold:',
  '🔄.*\\[Round .*\\]: Starting',
  '🔄.*\\[Round .*\\]: Refining',
  '📊.*\\[Round .*\\]: Clarity',
  '🔍 \\[Round .*\\] Executing ',
  '📋 Round.*Summary:',
  '✅ Completed:.*agents',
  '✅.*clarity \\(.*iteration',
  '🔄 Team Convergence:',
  '💭 Team raised.*concern',
];

/**
 * Check if a log message is a diagnostic log that should be filtered
 */
export function isDiagnosticLog(args: any[]): boolean {
  const message = String(args[0] || '');

  // Check for patterns that include specific combinations
  if (message.includes('Line ') && message.includes(':')) return true;
  if (message.includes('Parsing ') && message.includes('lines')) return true;
  if (message.includes('Detected') && message.includes('unique agents')) return true;
  if (message.includes('files | +') && message.includes('-')) return true;
  if (message.includes('Round ') && message.includes('Analysis')) return true;
  if (message.includes('Indexed') && message.includes('chunks')) return true;

  // Check regex patterns
  if (/\[\d+\/\d+\]\s*🔄/.test(message)) return true;

  // Check simple string includes and regex patterns
  return DIAGNOSTIC_PATTERNS.some((pattern) => {
    if (pattern.includes('.*') || pattern.includes('\\(') || pattern.includes('\\[')) {
      return new RegExp(pattern).test(message);
    }
    return message.includes(pattern);
  });
}
