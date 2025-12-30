// src/benchmark/dataset-loader.ts
// CSV dataset parsing and validation for benchmark ground truth

import * as fs from 'fs';
import * as path from 'path';
import { DatasetEntry, BenchmarkMetricName } from './types';

/**
 * CSV column names mapping to DatasetEntry fields
 */
const CSV_COLUMNS = [
  'commit_hash',
  'repo_path',
  'functionalImpact',
  'idealTimeHours',
  'testCoverage',
  'codeQuality',
  'codeComplexity',
  'actualTimeHours',
  'technicalDebtHours',
  'debtReductionHours',
  'notes',
] as const;

const REQUIRED_COLUMNS = [
  'commit_hash',
  'repo_path',
  'functionalImpact',
  'idealTimeHours',
  'testCoverage',
  'codeQuality',
  'codeComplexity',
  'actualTimeHours',
  'technicalDebtHours',
  'debtReductionHours',
];

/**
 * Parse a CSV value, handling nulls and empty strings
 */
function parseNumericValue(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === '' || trimmed.toLowerCase() === 'null' || trimmed === '-') {
    return null;
  }
  const num = parseFloat(trimmed);
  if (isNaN(num)) {
    return null;
  }
  return num;
}

/**
 * Parse a single CSV line, handling quoted values
 */
function parseCSVLine(line: string): string[] {
  const values: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        // Escaped quote
        current += '"';
        i++;
      } else {
        // Toggle quote mode
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      values.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  values.push(current.trim());

  return values;
}

/**
 * Validate a dataset entry
 */
function validateEntry(entry: DatasetEntry, lineNumber: number): string[] {
  const errors: string[] = [];

  if (!entry.commitHash || entry.commitHash.trim() === '') {
    errors.push(`Line ${lineNumber}: commit_hash is required`);
  }

  if (!entry.repoPath || entry.repoPath.trim() === '') {
    errors.push(`Line ${lineNumber}: repo_path is required`);
  }

  // Validate numeric ranges for score-based metrics (1-10)
  const scoreMetrics: BenchmarkMetricName[] = [
    'functionalImpact',
    'testCoverage',
    'codeQuality',
    'codeComplexity',
  ];

  for (const metric of scoreMetrics) {
    const value = entry[metric];
    if (value !== null && (value < 1 || value > 10)) {
      errors.push(`Line ${lineNumber}: ${metric} must be between 1 and 10 (got ${value})`);
    }
  }

  // Validate time-based metrics (must be non-negative for most)
  const timeMetrics: BenchmarkMetricName[] = ['idealTimeHours', 'actualTimeHours'];
  for (const metric of timeMetrics) {
    const value = entry[metric];
    if (value !== null && value < 0) {
      errors.push(`Line ${lineNumber}: ${metric} must be non-negative (got ${value})`);
    }
  }

  return errors;
}

/**
 * Load and parse a CSV dataset file
 */
export function loadDataset(filePath: string): {
  entries: DatasetEntry[];
  errors: string[];
  warnings: string[];
} {
  const absolutePath = path.resolve(filePath);
  const errors: string[] = [];
  const warnings: string[] = [];
  const entries: DatasetEntry[] = [];

  // Check file exists
  if (!fs.existsSync(absolutePath)) {
    errors.push(`Dataset file not found: ${absolutePath}`);
    return { entries, errors, warnings };
  }

  // Read and parse file
  const content = fs.readFileSync(absolutePath, 'utf-8');
  const lines = content.split('\n').filter((line) => line.trim() !== '');

  if (lines.length < 2) {
    errors.push('Dataset file must have at least a header row and one data row');
    return { entries, errors, warnings };
  }

  // Parse header
  const header = parseCSVLine(lines[0]).map((h) => h.toLowerCase().replace(/\s+/g, '_'));

  // Validate required columns
  for (const required of REQUIRED_COLUMNS) {
    const normalizedRequired = required.toLowerCase();
    if (!header.some((h) => h === normalizedRequired)) {
      errors.push(`Missing required column: ${required}`);
    }
  }

  if (errors.length > 0) {
    return { entries, errors, warnings };
  }

  // Create column index map
  const columnIndex: Record<string, number> = {};
  header.forEach((col, idx) => {
    columnIndex[col] = idx;
  });

  // Parse data rows
  for (let i = 1; i < lines.length; i++) {
    const lineNumber = i + 1;
    const values = parseCSVLine(lines[i]);

    if (values.length < REQUIRED_COLUMNS.length) {
      warnings.push(`Line ${lineNumber}: Incomplete row, skipping`);
      continue;
    }

    const entry: DatasetEntry = {
      commitHash: values[columnIndex['commit_hash']] || '',
      repoPath: values[columnIndex['repo_path']] || '',
      functionalImpact: parseNumericValue(values[columnIndex['functionalimpact']] || ''),
      idealTimeHours: parseNumericValue(values[columnIndex['idealtimehours']] || ''),
      testCoverage: parseNumericValue(values[columnIndex['testcoverage']] || ''),
      codeQuality: parseNumericValue(values[columnIndex['codequality']] || ''),
      codeComplexity: parseNumericValue(values[columnIndex['codecomplexity']] || ''),
      actualTimeHours: parseNumericValue(values[columnIndex['actualtimehours']] || ''),
      technicalDebtHours: parseNumericValue(values[columnIndex['technicaldebthours']] || ''),
      debtReductionHours: parseNumericValue(values[columnIndex['debtreductionhours']] || ''),
      notes: values[columnIndex['notes']] || undefined,
    };

    // Validate entry
    const entryErrors = validateEntry(entry, lineNumber);
    if (entryErrors.length > 0) {
      errors.push(...entryErrors);
    } else {
      entries.push(entry);
    }
  }

  if (entries.length === 0 && errors.length === 0) {
    errors.push('No valid entries found in dataset');
  }

  return { entries, errors, warnings };
}

/**
 * Save predictions to CSV format (for generate-dataset command)
 */
export function saveDatasetCSV(entries: DatasetEntry[], outputPath: string): void {
  const header = CSV_COLUMNS.join(',');

  const rows = entries.map((entry) => {
    const values = [
      entry.commitHash,
      entry.repoPath,
      entry.functionalImpact?.toString() ?? '',
      entry.idealTimeHours?.toString() ?? '',
      entry.testCoverage?.toString() ?? '',
      entry.codeQuality?.toString() ?? '',
      entry.codeComplexity?.toString() ?? '',
      entry.actualTimeHours?.toString() ?? '',
      entry.technicalDebtHours?.toString() ?? '',
      entry.debtReductionHours?.toString() ?? '',
      entry.notes ? `"${entry.notes.replace(/"/g, '""')}"` : '',
    ];
    return values.join(',');
  });

  const content = [header, ...rows].join('\n');
  fs.writeFileSync(outputPath, content, 'utf-8');
}
