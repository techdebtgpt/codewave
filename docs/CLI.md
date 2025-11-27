# CodeWave CLI Documentation

Complete command-line interface reference with examples for every command and option.

## Table of Contents

1. [Global Options](#global-options)
2. [evaluate Command](#evaluate-command)
3. [batch-evaluate Command](#batch-evaluate-command)
4. [generate-okr Command](#generate-okr-command)
5. [config Command](#config-command)
6. [Exit Codes](#exit-codes)
7. [Examples](#examples)

---

## Global Options

These options work with all commands:

```bash
codewave [command] [options]
```

### `--help` / `-h`

Display help information.

```bash
codewave --help              # General help
codewave evaluate --help     # Command-specific help
```

### `--version` / `-V`

Display CodeWave version.

```bash
codewave --version
# Output: 1.0.0
```

---

## evaluate Command

Evaluate a single commit with comprehensive multi-agent analysis.

### Syntax

```bash
codewave evaluate <commit-hash> [options]
```

### Arguments

#### `<commit-hash>` (Required)

Git commit reference to evaluate. Can be:

- **Commit hash**: `abc1234`, `abc1234567890`
- **Reference**: `HEAD`, `main`, `develop`
- **Branch name**: `feature/auth-system`
- **Tag**: `v1.2.3`
- **Relative**: `HEAD~1`, `HEAD~5`

**Examples**:

```bash
codewave evaluate HEAD                    # Latest commit
codewave evaluate abc1234                 # Specific commit
codewave evaluate feature/new-feature     # Latest on branch
codewave evaluate HEAD~1                  # Previous commit
```

### Options

#### `-o, --output <directory>`

Output directory for evaluation results.

**Type**: String (file path)
**Default**: `.evaluated-commits`

```bash
codewave evaluate HEAD -o ./reports
codewave evaluate HEAD --output ./my-analysis
```

#### `--repo <path>`

Path to Git repository.

**Type**: String (file path)
**Default**: Current directory

```bash
codewave evaluate HEAD --repo /path/to/repo
```

#### `-f, --format <format>`

Output format(s).

**Type**: `json`, `html`, `markdown`, `all`
**Default**: `all`

```bash
codewave evaluate HEAD --format json        # JSON only
codewave evaluate HEAD -f html              # HTML only
codewave evaluate HEAD --format markdown    # Markdown only
codewave evaluate HEAD -f all               # All formats
```

#### `--verbose`

Enable verbose logging.

**Type**: Boolean flag
**Default**: false

```bash
codewave evaluate HEAD --verbose
```

**Verbose Output Includes**:

- Agent prompts and reasoning
- Token counts per API call
- Timing for each stage
- Full LLM responses
- Error details

#### `--no-report`

Skip HTML report generation.

**Type**: Boolean flag
**Default**: false

```bash
codewave evaluate HEAD --no-report      # Generate only JSON/text
```

Useful when:

- Running in headless environments
- Generating only for CI/CD
- Large batch processing (faster)

#### `--model <model>`

Override configured LLM model.

**Type**: String (model ID)
**Default**: Configured value

```bash
codewave evaluate HEAD --model claude-3-opus-20250219
codewave evaluate HEAD --model gpt-4o
```

**Common Models**:

- `claude-3-5-sonnet-20241022` (Anthropic, recommended)
- `claude-3-opus-20250219` (Anthropic, best quality)
- `claude-3-haiku-20240307` (Anthropic, fastest)
- `gpt-4o` (OpenAI)
- `gpt-4-turbo` (OpenAI)
- `gemini-2.0-flash` (Google)

### Output Format

```
✓ Evaluation completed in 2.3s

Results saved to: .evaluated-commits/abc1234_2024-01-15_10-30-45/

Files:
  • report.html      - Interactive HTML report
  • results.json     - Structured results
  • commit.diff      - Original diff
  • summary.txt      - Text summary

Metrics:
  Code Quality:      8.5 / 10
  Complexity:        7.0 / 10
  Test Coverage:     8.0 / 10
  Overall Score:     8.1 / 10

Next: Open report.html in your browser to view conversation timeline
```

### Exit Code

- **0**: Success
- **1**: Evaluation failed
- **2**: Invalid arguments
- **3**: Commit not found
- **4**: Configuration error

---

## batch-evaluate Command

Evaluate multiple commits with progress tracking.

### Syntax

```bash
codewave batch-evaluate [options]
```

### Options

#### `--count <number>`

Number of commits to evaluate.

**Type**: Positive integer
**Default**: `10`
**Max**: `1000`

```bash
codewave batch-evaluate --count 5        # Last 5 commits
codewave batch-evaluate --count 100      # Last 100 commits
```

#### `--since <date>`

Start date for commit range.

**Type**: ISO date string or natural language
**Default**: `null` (no start limit)

**Formats**:

```bash
# ISO format
codewave batch-evaluate --since 2024-01-01

# Natural language
codewave batch-evaluate --since "2 weeks ago"
codewave batch-evaluate --since "January 1, 2024"

# With end date
codewave batch-evaluate --since 2024-01-01 --until 2024-01-31
```

#### `--until <date>`

End date for commit range.

**Type**: ISO date string or natural language
**Default**: `null` (current date)

```bash
codewave batch-evaluate --until 2024-12-31
codewave batch-evaluate --until "today"
```

#### `--branch <branch-name>`

Branch to evaluate commits from.

**Type**: String (branch name)
**Default**: Current branch

```bash
codewave batch-evaluate --branch main      # Commits on main
codewave batch-evaluate --branch develop   # Commits on develop
```

#### `-o, --output <directory>`

Output directory for results.

**Type**: String (file path)
**Default**: `.evaluated-commits`

```bash
codewave batch-evaluate -o ./batch-reports
```

#### `--parallel <number>`

Number of parallel evaluations.

**Type**: Integer (1-5)
**Default**: `3`

```bash
codewave batch-evaluate --parallel 1      # Sequential (slow, low cost)
codewave batch-evaluate --parallel 3      # Balanced (default)
codewave batch-evaluate --parallel 5      # Maximum (fast, high cost)
```

**Considerations**:

- **1**: Slow but reliable, minimal rate-limit issues
- **3**: Good balance (default)
- **5**: Fast but may hit rate limits

#### `--skip-errors`

Continue processing on errors instead of halting.

**Type**: Boolean flag
**Default**: false

```bash
codewave batch-evaluate --skip-errors --count 100
```

If a commit evaluation fails:

- **Without flag**: Batch stops immediately
- **With flag**: Logs error and continues

#### `--verbose`

Enable verbose logging.

**Type**: Boolean flag
**Default**: false

```bash
codewave batch-evaluate --count 50 --verbose
```

Displays detailed information about:

- Each commit being evaluated
- Token usage per commit
- Estimated costs
- Processing times

### Progress Display

During batch evaluation, real-time progress is displayed:

```
CodeWave - Batch Evaluation
============================

Evaluating commits...
[████████████████████░░░░░░░░░░░] 65% (65/100)

Current: abc1234 - "feat: add user auth"
Elapsed: 2m 34s | ETA: 1m 20s

Metrics:
  ✓ Successful: 65
  ✗ Failed: 0
  ⊘ Skipped: 0
  Avg Quality: 7.8 / 10
  Avg Coverage: 7.5 / 10

Performance:
  Avg Time: 2.3s / commit
  Tokens: 18,450 / 100,000
  Cost: $0.45 / 5.00
```

### Output Structure

```
.evaluated-commits/
├── abc1234_2024-01-15_10-30-45/
│   ├── report.html
│   ├── results.json
│   ├── commit.diff
│   └── summary.txt
├── def5678_2024-01-15_10-33-12/
│   ├── report.html
│   ├── results.json
│   ├── commit.diff
│   └── summary.txt
└── batch-summary.json
```

### Batch Summary

After completion, a summary is displayed:

```
✓ Batch evaluation completed!

Summary:
  • Total:      100 commits
  • Successful: 100
  • Failed:     0
  • Duration:   3m 52s
  • Avg Time:   2.3s per commit

Quality:
  • Avg Quality Score:  7.8 / 10
  • Avg Complexity:     7.0 / 10
  • Avg Test Coverage:  7.5 / 10

Cost:
  • Total Tokens: 456,000
  • Estimated Cost: $2.30

Results:
  • Output Directory: .evaluated-commits/
  • Summary Report:   batch-summary.json
```

---

---

## generate-okr Command

Generate Objectives and Key Results (OKRs) for developers based on their commit history.

### Syntax

```bash
codewave generate-okr [options]
```

### Options

#### `--authors <names>`

Comma-separated list of author names to generate OKRs for.

**Type**: String
**Default**: All authors found in evaluation data

```bash
codewave generate-okr --authors "John Doe,Jane Smith"
```

#### `--months <number>`

Number of months of history to analyze.

**Type**: Integer
**Default**: `3`

```bash
codewave generate-okr --months 6
```

#### `--concurrency <number>`

Number of parallel generations.

**Type**: Integer
**Default**: `2`

```bash
codewave generate-okr --concurrency 4
```

#### `--model <model>`

Override the LLM model used for generation.

**Type**: String

```bash
codewave generate-okr --model gpt-4o
```

---

## config Command

Manage CodeWave configuration.

### Syntax

```bash
codewave config [subcommand] [options]
```

### Subcommands

#### Interactive Setup (Default)

```bash
codewave config
```

Launches interactive wizard for configuration:

1. Choose LLM provider
2. Enter API key
3. Select model
4. Configure output directory
5. Set batch size
6. Enable/disable RAG

#### `show`

Display current configuration.

```bash
codewave config show
```

**Output**:

```
CodeWave Configuration
=====================

LLM Provider:        anthropic
Model:               claude-3-5-sonnet-20241022
API Key:             sk-ant-... (masked)
Output Directory:    .evaluated-commits
Batch Size:          10
Parallel:            3
Max Tokens:          4000
Enable RAG:          true
RAG Chunk Size:      2000
Verbose:             false
```

#### `set <key> <value>`

Set a specific configuration value.

```bash
codewave config set <key> <value>
```

**Common Keys**:

```bash
codewave config set llm-provider anthropic
codewave config set model claude-3-5-sonnet-20241022
codewave config set api-key sk-ant-...
codewave config set output-directory ./reports
codewave config set batch-size 20
codewave config set parallel-evaluations 5
codewave config set max-tokens 6000
codewave config set enable-rag true
codewave config set verbose false
```

#### `reset`

Reset configuration to defaults.

```bash
codewave config reset
```

**Warning**: Removes API keys. You'll need to reconfigure.

---

## Exit Codes

| Code | Meaning                   | Solution                                   |
| ---- | ------------------------- | ------------------------------------------ |
| `0`  | Success                   | No action needed                           |
| `1`  | General failure           | Check error message                        |
| `2`  | Invalid arguments         | Verify syntax with `--help`                |
| `3`  | Commit not found          | Check commit hash/reference                |
| `4`  | Configuration error       | Run `codewave config`                      |
| `5`  | API authentication failed | Verify API key with `codewave config show` |
| `6`  | Rate limit exceeded       | Reduce parallelization                     |
| `7`  | Network error             | Check internet connection                  |
| `8`  | File system error         | Check permissions on output directory      |

---

## Examples

### Example 1: Quick Evaluation

```bash
# Evaluate current commit
codewave evaluate HEAD

# Output appears in .evaluated-commits/
# Open report.html in browser
```

### Example 2: Evaluate Specific Branch

```bash
# Evaluate commit on develop branch
codewave evaluate develop

# With verbose output
codewave evaluate develop --verbose
```

### Example 3: Custom Output Location

```bash
# Save to custom directory
codewave evaluate HEAD -o ./my-reports

# Save with specific format
codewave evaluate HEAD -f json -o ./ci-reports
```

### Example 4: Batch Evaluation - Last Week

```bash
# Commits from last 7 days
codewave batch-evaluate --since "7 days ago"

# With verbose progress
codewave batch-evaluate --since "7 days ago" --verbose
```

### Example 5: Batch Evaluation - Date Range

```bash
# January 2024
codewave batch-evaluate \
  --since 2024-01-01 \
  --until 2024-01-31 \
  --parallel 5

# With custom output
codewave batch-evaluate \
  --since 2024-01-01 \
  --until 2024-01-31 \
  -o ./january-analysis
```

### Example 6: Specific Branch with Limit

```bash
# Last 20 commits on develop branch
codewave batch-evaluate \
  --branch develop \
  --count 20

# With maximum parallelization
codewave batch-evaluate \
  --branch main \
  --count 100 \
  --parallel 5
```

### Example 7: CI/CD Integration

```bash
# JSON output for programmatic access
codewave evaluate $CI_COMMIT_SHA \
  --format json \
  -o ./ci-results \
  --no-report  # Skip HTML

# Check results
cat ./ci-results/*/results.json | jq '.metrics.codeQuality'
```

### Example 8: Error Handling in Batch

```bash
# Continue on errors
codewave batch-evaluate \
  --count 100 \
  --skip-errors \
  --verbose

# Check what failed
grep "✗" batch-summary.json
```

### Example 9: Using Different Model

```bash
# Use cheaper model for speed
codewave evaluate HEAD --model claude-3-haiku-20240307

# Use best quality model
codewave evaluate HEAD --model claude-3-opus-20250219

# Use Google Gemini
codewave config set llm-provider google
codewave config set model gemini-2.0-flash
codewave evaluate HEAD
```

### Example 10: Verbose Debugging

```bash
# Enable verbose mode for debugging
codewave evaluate HEAD --verbose

# See detailed output including:
# - Agent prompts
# - Token usage
# - Timing
# - Full LLM responses
```

---

## Shell Completion

### Bash Completion

Add to `.bashrc`:

```bash
complete -W "evaluate batch-evaluate config" codewave
```

### Zsh Completion

Add to `.zshrc`:

```bash
compdef _gnu_generic codewave
```

---

## Tips

### Faster Evaluation

```bash
# Use fast model
codewave evaluate HEAD --model claude-3-haiku-20240307

# Skip HTML report generation
codewave evaluate HEAD --no-report

# Use JSON format only
codewave evaluate HEAD --format json
```

### Better Quality

```bash
# Use best model
codewave evaluate HEAD --model claude-3-opus-20250219

# Enable verbose for debugging
codewave evaluate HEAD --verbose
```

### Cheaper Batch Processing

```bash
# Use Google Gemini (10x cheaper)
codewave config set llm-provider google
codewave config set model gemini-2.0-flash

# Process in parallel
codewave batch-evaluate --count 1000 --parallel 5
```

### Debugging Issues

```bash
# Show configuration
codewave config show

# Run with verbose output
codewave evaluate HEAD --verbose

# Check specific commit
codewave evaluate abc1234 --verbose
```

---

For more information:

- [README.md](../README.md) - Main documentation
- [QUICK_REFERENCE.md](./QUICK_REFERENCE.md) - Quick lookup
- [CONFIGURATION.md](./CONFIGURATION.md) - Detailed configuration
- [EXAMPLES.md](./EXAMPLES.md) - Detailed examples
