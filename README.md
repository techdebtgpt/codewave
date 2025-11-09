# CodeWave: AI-Powered Commit Intelligence

[![npm](https://img.shields.io/npm/v/@techdebtgpt/codewave.svg?style=flat-square)](https://www.npmjs.com/package/@techdebtgpt/codewave)
[![license](https://img.shields.io/badge/license-Apache%202.0-blue.svg?style=flat-square)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg?style=flat-square)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9+-blue.svg?style=flat-square)](https://www.typescriptlang.org/)
[![GitHub issues](https://img.shields.io/github/issues/techdebtgpt/codewave.svg?style=flat-square)](https://github.com/techdebtgpt/codewave/issues)
[![GitHub stars](https://img.shields.io/github/stars/techdebtgpt/codewave.svg?style=flat-square)](https://github.com/techdebtgpt/codewave)
[![GitHub watchers](https://img.shields.io/github/watchers/techdebtgpt/codewave.svg?style=flat-square)](https://github.com/techdebtgpt/codewave)

**Multi-agent conversational system for comprehensive code quality evaluation using a 7-pillar methodology.**

CodeWave is a sophisticated Node.js CLI tool that leverages multiple AI agents in a coordinated discussion framework to perform in-depth analysis of Git commits. Using LangChain, LangGraph, and multiple LLM providers, CodeWave generates beautiful interactive HTML reports with conversation timelines, detailed metrics, and actionable insights.

---

## Table of Contents

- [Key Features](#key-features)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Output Structure](#output-structure)
- [CLI Commands](#cli-commands)
- [Configuration](#configuration)
- [The 7-Pillar Evaluation Methodology](#the-7-pillar-evaluation-methodology)
- [The 5 AI Agents](#the-5-ai-agents)
- [Multi-Round Conversation Framework](#multi-round-conversation-framework)
- [Developer Overview](#developer-overview)
- [Advanced Features](#advanced-features)
- [Examples](#examples)
- [Project Structure](#project-structure)
- [Contributing](#contributing)
- [Troubleshooting](#troubleshooting)
- [Performance Considerations](#performance-considerations)
- [API Reference](#api-reference)
- [License](#license)
- [Support & Community](#support--community)

---

## Key Features

- **🤖 Multi-Agent Conversations**: 5 specialized AI agents discuss commits across 3 rounds (Initial Assessment → Concerns → Validation & Agreement)
- **📊 7-Pillar Methodology**: Comprehensive evaluation across Code Quality, Complexity, Timing, Technical Debt, Functional Impact, and Test Coverage
- **🎨 Interactive HTML Reports**: Beautiful, timeline-based reports with conversation history and metric visualization
- **📈 Batch Processing**: Evaluate multiple commits with real-time progress tracking
- **🧠 RAG (Retrieval-Augmented Generation)**: Automatic handling of large diffs (>100KB) using vector storage and semantic search
- **🔌 Multi-LLM Support**: Works with Anthropic Claude, OpenAI GPT, and Google Gemini
- **⚡ Production-Ready**: LangGraph-based state machines with comprehensive error handling
- **💾 JSON Output**: Structured results for programmatic access and CI/CD integration
- **🎯 Zero Configuration**: Interactive setup wizard with sensible defaults

---

## Installation

### Prerequisites

- **Node.js**: 18.0.0 or later
- **npm**: 9.0.0 or later
- **Git**: 2.0.0 or later
- **LLM API Key**: Claude, OpenAI, or Google Gemini

### Install from npm

```bash
npm install -g @techdebtgpt/codewave
```

Then use the command:

```bash
codewave --help
```

### Local Development

```bash
git clone <repo-url>
cd codewave
npm install
npm run build
```

---

## Quick Start

### 1. First-Time Setup (2 minutes)

```bash
codewave config
```

This launches an interactive wizard where you'll configure:

- **LLM Provider**: Choose Anthropic Claude, OpenAI, or Google Gemini
- **API Keys**: Set your LLM provider credentials
- **Model Selection**: Pick your preferred model (defaults recommended)
- **Default Settings**: Configure batch size, output directory, and reporting preferences

Configuration is stored securely and requires only one-time setup.

**Verify Setup:**

```bash
# Check configuration
codewave config show

# Expected output should show your LLM provider and model
```

### 2. Evaluate a Single Commit (30-60 seconds)

```bash
codewave evaluate --commit <commit-hash>
```

**Example:**

```bash
codewave evaluate HEAD
codewave evaluate a1b2c3d
```

The system will:

1. Fetch the commit details from the Git repository
2. Extract the diff and metadata
3. Run multi-agent conversation workflow (3 rounds)
4. Generate interactive HTML report and JSON results

**Find Your Results:**

```bash
# Results are in: .evaluated-commits/{commit-hash}_{date}_{time}/
open .evaluated-commits/*/report.html                    # macOS
xdg-open .evaluated-commits/*/report.html              # Linux
start .evaluated-commits\*\report.html                 # Windows
```

### 3. Evaluate Multiple Commits (Batch Mode)

```bash
codewave batch-evaluate [options]
```

**Examples:**

```bash
# Evaluate last 10 commits on current branch
codewave batch-evaluate --count 10

# Evaluate with progress tracking
codewave batch-evaluate --count 20 --verbose

# Evaluate commits in date range
codewave batch-evaluate --since "2024-01-01" --until "2024-01-31"

# Evaluate with custom output and parallelization
codewave batch-evaluate --count 50 --output "./reports" --parallel 3
```

**Verify Batch Results:**

```bash
# Count evaluations
ls -1 .evaluated-commits/ | wc -l

# Calculate total cost
jq -s '[.[].totalCost] | add' .evaluated-commits/*/results.json
```

### Common First-Time Issues

**Issue**: "API Key not found"

```bash
# Solution: Run setup again or set environment variable
codewave config
# OR
export CODEWAVE_API_KEY=sk-ant-...
codewave evaluate HEAD
```

**Issue**: "codewave: command not found" (on Windows)

```bash
# Solution: Ensure npm was restarted after installation
npm install -g @techdebtgpt/codewave
# Restart your terminal
codewave --version
```

**Issue**: Evaluation times out

```bash
# Solution: Enable RAG for large commits
codewave config set enable-rag true
codewave evaluate HEAD
```

See [TROUBLESHOOTING.md](./docs/TROUBLESHOOTING.md) for more help.

---

## Output Structure

Evaluation results are organized in `.evaluated-commits/` directory:

```
.evaluated-commits/
├── a1b2c3d_2024-01-15_10-30-45/
│   ├── report.html              # Interactive HTML report with conversation timeline
│   ├── results.json             # Full evaluation data with all metrics
│   ├── commit.diff              # Original commit diff
│   └── summary.txt              # Quick text summary
├── x9y8z7w_2024-01-15_11-15-20/
│   ├── report.html
│   ├── results.json
│   ├── commit.diff
│   └── summary.txt
```

### Output Files Explained

#### `report.html`

Interactive report featuring:

- Commit metadata (hash, author, date, message)
- Agent roles and responsibilities
- Round-by-round conversation timeline
- Evolution of metrics across discussion rounds
- Final consensus scores and insights
- Key concerns and recommendations
- Beautiful responsive design

#### `results.json`

Structured data including:

- Commit information and diff
- Full conversation transcript
- All agent responses and reasoning
- Evolution of metrics (Initial → Final)
- Consensus scores and weights
- Processing metadata (tokens used, cost, duration)

#### `commit.diff`

Original unified diff format for reference and archival.

#### `summary.txt`

Quick text summary with key metrics and top 3 recommendations.

### Configuring Output Location

You can customize where evaluation results are saved using any of these methods (in priority order):

#### 1. CLI Flag (Highest Priority)

Use `-o` or `--output` flag for single command:

```bash
# Single evaluation
codewave evaluate HEAD -o ./my-reports

# Batch evaluation
codewave batch-evaluate --count 10 -o ./analysis
```

#### 2. Environment Variable

Set for current session or script:

```bash
export CODEWAVE_OUTPUT_DIR=./reports
codewave evaluate HEAD
codewave batch-evaluate --count 10
```

#### 3. Configuration File

Set as default for all evaluations:

**User config** (`~/.codewave/config.json` or `%APPDATA%\codewave\config.json`):

```json
{
  "outputDirectory": "./my-evaluations"
}
```

**Project config** (`.codewave.config.json` in project root):

```json
{
  "output": {
    "directory": "./commit-analysis"
  }
}
```

#### 4. Default

If not configured, defaults to `.evaluated-commits/` in current directory.

### Configuring Output Format

Control which file formats to generate:

#### Via CLI Flag

```bash
# HTML only
codewave evaluate HEAD --format html

# JSON only (for CI/CD)
codewave evaluate HEAD --format json

# All formats (default)
codewave evaluate HEAD --format all
```

#### Via Configuration

```bash
# Set default format
codewave config set report-format json
```

Or in config file:

```json
{
  "reportFormat": "json"
}
```

**Available formats**:

- `html` - Interactive HTML report (default)
- `json` - Structured JSON for programmatic access
- `markdown` - Markdown format
- `all` - Generate all three formats

---

## CLI Commands

### `codewave evaluate`

Evaluate a single commit with detailed multi-agent analysis.

```bash
codewave evaluate <commit-hash> [options]
```

**Arguments:**

- `<commit-hash>` - Git commit hash or reference (HEAD, branch name, etc.)

**Options:**

- `-o, --output <dir>` - Output directory (default: `.evaluated-commits`)
- `--repo <path>` - Git repository path (default: current directory)
- `--format <format>` - Output format: `json`, `html`, `markdown` (default: all)
- `--verbose` - Enable verbose logging
- `--no-report` - Skip HTML report generation
- `--model <model>` - Override configured LLM model

**Example:**

```bash
codewave evaluate HEAD -o ./reports --verbose
codewave evaluate abc1234 --format json --output ./data
```

### `codewave batch-evaluate`

Evaluate multiple commits with progress tracking.

```bash
codewave batch-evaluate [options]
```

**Options:**

- `--count <number>` - Number of commits to evaluate (default: 10)
- `--since <date>` - Start date (ISO format or natural language)
- `--until <date>` - End date (ISO format or natural language)
- `--branch <branch>` - Branch to evaluate (default: current branch)
- `-o, --output <dir>` - Output directory (default: `.evaluated-commits`)
- `--parallel <number>` - Parallel evaluations (default: 3, max: 5)
- `--skip-errors` - Continue on evaluation errors
- `--verbose` - Enable verbose logging

**Examples:**

```bash
codewave batch-evaluate --count 20
codewave batch-evaluate --since "2024-01-01" --until "2024-01-31"
codewave batch-evaluate --branch develop --count 50 --parallel 5
```

### `codewave config`

Manage configuration settings.

```bash
codewave config [command]
```

**Commands:**

- `codewave config` - Interactive setup wizard
- `codewave config show` - Display current configuration
- `codewave config set <key> <value>` - Set specific configuration value
- `codewave config reset` - Reset to defaults

**Examples:**

```bash
codewave config
codewave config show
codewave config set model claude-3-5-sonnet-20241022
codewave config set batch-size 20
```

---

## Configuration

CodeWave uses a 3-tier configuration system with priority order:

1. **Environment Variables** (highest priority)
2. **CLI Arguments**
3. **Project Configuration** (`.codewave.config.json`)
4. **User Configuration** (user home directory)
5. **Defaults** (lowest priority)

### Quick Setup

On first run, use `codewave config` to set up your LLM provider:

```bash
codewave config
```

This creates a user-level configuration file.

### Configuration File Locations

#### User-Level Configuration (Global)

Applied to all projects in your user account:

- **macOS/Linux**: `~/.codewave/config.json`
- **Windows**: `%APPDATA%\codewave\config.json`

**Example**: Set once, used everywhere

```json
{
  "llmProvider": "anthropic",
  "model": "claude-haiku-4-5-20251001",
  "apiKey": "sk-ant-...",
  "apiBaseUrl": null,
  "outputDirectory": ".evaluated-commits",
  "defaultBatchSize": 10,
  "parallelEvaluations": 3,
  "maxTokensPerRequest": 4000,
  "enableRag": true,
  "ragChunkSize": 2000,
  "vectorStoreType": "memory",
  "reportFormat": "all",
  "verbose": false
}
```

#### Project-Level Configuration (Local)

Applied only to a specific project, overrides user-level settings:

**Location**: `.codewave.config.json` in your project root

**Example with Real-World Setup**:

```json
{
  "apiKeys": {
    "anthropic": "sk-ant-...",
    "openai": "sk-proj-...",
    "google": "",
    "xai": ""
  },
  "llm": {
    "provider": "openai",
    "model": "gpt-4o-mini",
    "temperature": 0.2,
    "maxTokens": 16000
  },
  "agents": {
    "enabled": [
      "business-analyst",
      "sdet",
      "developer-author",
      "senior-architect",
      "developer-reviewer"
    ],
    "retries": 3,
    "timeout": 300000,
    "minRounds": 2,
    "maxRounds": 3,
    "clarityThreshold": 0.85
  },
  "output": {
    "directory": "./commit-analysis",
    "format": "json",
    "generateHtml": true
  },
  "tracing": {
    "enabled": true,
    "apiKey": "lsv2_pt_...",
    "project": "codewave-evaluations",
    "endpoint": "https://api.smith.langchain.com"
  }
}
```

**When to use project config**:

- Different API keys per project
- Team-specific settings
- CI/CD pipeline customization
- Integration with LangSmith tracing

### Environment Variables

Override any configuration setting using environment variables (highest priority):

```bash
# LLM Settings
export CODEWAVE_LLM_PROVIDER=anthropic
export CODEWAVE_API_KEY=sk-ant-...
export CODEWAVE_MODEL=claude-haiku-4-5-20251001

# Output Settings
export CODEWAVE_OUTPUT_DIR=./reports
export CODEWAVE_REPORT_FORMAT=json

# Token & Cost Management
export CODEWAVE_MAX_TOKENS=4000
export CODEWAVE_BATCH_SIZE=10
export CODEWAVE_PARALLEL=3

# RAG Settings
export CODEWAVE_ENABLE_RAG=true
export CODEWAVE_RAG_CHUNK_SIZE=2000
export CODEWAVE_RAG_THRESHOLD=102400

# Logging
export CODEWAVE_VERBOSE=true

# Run evaluation
codewave evaluate HEAD
```

**Priority order** (environment variables override all):

```
Environment Variables > CLI Arguments > Project Config > User Config > Defaults
```

---

## The 7-Pillar Evaluation Methodology

CodeWave evaluates commits across 7 carefully chosen dimensions, with each pillar assigned to a specialized AI agent:

### Pillar 1: Code Quality (1-10)

**Agent**: Developer Reviewer
**Description**: Evaluates code correctness, design patterns, adherence to best practices, readability, and potential bugs.
**Weights**: Critical for production quality and maintainability.

### Pillar 2: Code Complexity (10-1, Inverted)

**Agent**: Senior Architect
**Description**: Measures cyclomatic complexity, cognitive complexity, maintainability. Higher score = Lower complexity.
**Scale**: 10 (simple) to 1 (very complex)
**Weights**: Critical for long-term maintenance and team velocity.

### Pillar 3: Ideal Time Hours (Estimate)

**Agent**: Business Analyst
**Description**: Estimates ideal development time under optimal conditions (clear requirements, no interruptions).
**Scale**: Hours (0.5 to 80)
**Weights**: Baseline for productivity metrics.

### Pillar 4: Actual Time Hours (Estimate)

**Agent**: Developer Author
**Description**: Actual time taken to implement (including research, debugging, iterations).
**Scale**: Hours (0.5 to 160)
**Weights**: Identifies scope creep and process inefficiencies.

### Pillar 5: Technical Debt Hours (+/-)

**Agent**: Senior Architect
**Description**: Positive = Additional debt introduced; Negative = Debt reduced/eliminated.
**Scale**: Hours (+/- 0 to 40)
**Weights**: Critical for assessing long-term codebase health.

### Pillar 6: Functional Impact (1-10)

**Agent**: Business Analyst
**Description**: User-facing impact, business value, feature completeness, and alignment with requirements.
**Scale**: 1 (no impact) to 10 (transformative)
**Weights**: Aligns engineering efforts with business goals.

### Pillar 7: Test Coverage (1-10)

**Agent**: QA Engineer
**Description**: Comprehensiveness of tests: unit, integration, edge cases, error scenarios.
**Scale**: 1 (no tests) to 10 (comprehensive coverage)
**Weights**: Critical for reliability and preventing regressions.

---

## The 5 AI Agents

### 1. Business Analyst (🎯)

**Role**: Strategic stakeholder representing business value and user impact.
**Metrics**: Ideal Time Hours, Functional Impact
**Responsibilities**:

- Assess business value and feature completeness
- Estimate ideal development time
- Evaluate functional impact on users
- Consider market alignment and competitive advantage

### 2. Developer Author (👨‍💻)

**Role**: Original implementation owner providing implementation insights.
**Metrics**: Actual Time Hours
**Responsibilities**:

- Report actual development time
- Explain implementation decisions
- Discuss challenges and blockers encountered
- Provide context for complexity and time variance

### 3. Developer Reviewer (🔍)

**Role**: Code quality auditor ensuring production readiness.
**Metrics**: Code Quality
**Responsibilities**:

- Evaluate code correctness and design patterns
- Identify potential bugs and security issues
- Assess readability and maintainability
- Recommend refactoring opportunities

### 4. Senior Architect (🏛️)

**Role**: Technical leader focused on scalability, design, and debt.
**Metrics**: Code Complexity, Technical Debt Hours
**Responsibilities**:

- Assess architectural decisions and scalability
- Measure code complexity and maintainability
- Estimate technical debt introduced or reduced
- Recommend long-term improvements

### 5. QA Engineer (🧪)

**Role**: Quality assurance specialist ensuring reliability.
**Metrics**: Test Coverage
**Responsibilities**:

- Evaluate test coverage and comprehensiveness
- Identify untested edge cases and error scenarios
- Assess reliability and resilience
- Recommend testing improvements

---

## Multi-Round Conversation Framework

CodeWave's evaluation happens across 3 structured rounds:

### Round 1: Initial Assessment

Each agent independently evaluates the commit against their pillar metrics, providing initial scores and reasoning.

**Duration**: ~30-60 seconds
**Output**: Initial scores, concerns, and observations

### Round 2: Concerns & Cross-Examination

Agents present their concerns and challenge each other's assumptions. This creates a realistic discussion where different perspectives can influence thinking.

**Duration**: ~30-90 seconds
**Output**: Refined perspectives, acknowledged concerns, potential consensus areas

### Round 3: Validation & Agreement

Agents finalize their positions, considering all previous inputs. Final scores are calculated with a weighted consensus algorithm.

**Duration**: ~20-60 seconds
**Output**: Final scores, consensus reasoning, and agreed-upon recommendations

---

## Developer Overview

Every evaluation begins with an **AI-generated Developer Overview** - a concise, intelligent summary of what changed in the commit, automatically extracted and formatted before agents evaluate.

### What's Included

The Developer Overview contains:

- **Summary**: One-line executive summary of the change (max 150 chars)
- **Details**: Paragraph explaining key changes and context (max 400 chars)
- **Key Changes**: Bullet list of implementation details

### Example

```
Summary: Added actual estimation as a separate step

Details:
Introduced actual time estimation alongside ideal time in PR analysis
for better accuracy.

Key Changes:
- Implemented IActualTimeEstimator interface
- Created ActualTimeRunnable for estimation
- Merged actual time with PR lifecycle data
```

### Where It Appears

- **HTML Report**: Top card in the report
- **results.json**: `developerOverview` field
- **Agent Context**: All agents receive this as context for their evaluation

### Why It Matters

The Developer Overview provides:

- **Quick Context**: Understand the change without reading the full diff
- **Consistency**: Same summary regardless of agent disagreement
- **CI/CD Integration**: Programmatic access to change summary
- **Documentation**: Auto-generated change documentation

For detailed information about Developer Overview generation, convergence detection, and multi-round discussion, see [ADVANCED_FEATURES.md](./docs/ADVANCED_FEATURES.md).

---

## Advanced Features

### Retrieval-Augmented Generation (RAG) for Large Diffs

When commits exceed 100KB (configurable):

1. Diff is chunked into semantic segments
2. Vector embeddings generated for each chunk
3. Agents query most relevant chunks instead of processing entire diff
4. Reduces tokens used and speeds up evaluation

**Configuration**:

```bash
codewave config set enable-rag true
codewave config set rag-chunk-size 2000
codewave config set rag-threshold 102400
```

### Multi-LLM Support

Choose your LLM provider and model based on your needs and budget:

**Anthropic Claude** (Recommended)

- Best for code analysis and reasoning
- **Default Model**: claude-haiku-4-5-20251001 (6x cheaper, recommended for most use cases)
- **Alternatives**:
  - claude-sonnet-4-5-20250929 (best balance of quality and cost)
  - claude-opus-4-1-20250805 (maximum quality, highest cost)

**OpenAI GPT**

- Excellent multi-agent reasoning
- **Cost-optimized**: gpt-4o-mini (recommended)
- **Balanced**: gpt-4o
- **Advanced reasoning**: o3-mini-2025-01-31, o3

**Google Gemini**

- Most cost-effective option
- **Recommended**: gemini-2.5-flash-lite (most efficient)
- **Alternatives**: gemini-2.5-flash, gemini-2.5-pro

**xAI Grok**

- Specialized use cases
- **Recommended**: grok-4-fast-non-reasoning
- **Alternatives**: grok-4.2, grok-4-0709

**Example**: Switch to OpenAI

```bash
codewave config set llm-provider openai
codewave config set model gpt-4o-mini
codewave config set api-key sk-...
```

**Example**: Switch to Google Gemini (most cost-effective)

```bash
codewave config set llm-provider google
codewave config set model gemini-2.5-flash-lite
codewave config set api-key YOUR_GEMINI_API_KEY
```

See [CONFIGURATION.md](./docs/CONFIGURATION.md) for complete model comparison and cost analysis.

### Batch Evaluation with Progress Tracking

Monitor evaluations in real-time:

```bash
codewave batch-evaluate --count 100 --verbose
```

**Progress Display**:

- Overall completion percentage
- Current commit being evaluated
- Elapsed time and ETA
- Tokens used and estimated cost
- Success/error count
- Average evaluation time per commit

### JSON Output for CI/CD Integration

All results are available as structured JSON for programmatic access:

```bash
codewave evaluate HEAD --format json
```

**Use cases**:

- Integrate with CI/CD pipelines
- Custom reporting and dashboards
- Machine learning on evaluation metrics
- Automated quality gates

---

## Examples

### Example 1: Evaluate Latest 5 Commits

```bash
codewave batch-evaluate --count 5 --verbose
```

**Output**:

```
CodeWave - Commit Intelligence Engine
================================

Evaluating 5 commits...
[████████████████████████████████] 100% (5/5)

Evaluation Summary:
├── Total evaluated: 5
├── Successful: 5
├── Failed: 0
├── Average time: 2.3s per commit
├── Total tokens: 18,450
└── Output: .evaluated-commits/

Reports generated:
  ✓ a1b2c3d - "feat: add user authentication" (Quality: 8.5/10)
  ✓ x9y8z7w - "fix: resolve memory leak" (Quality: 9.0/10)
  ✓ m5n4o3p - "docs: update README" (Quality: 7.0/10)
  ✓ k1l2m3n - "refactor: simplify payment module" (Quality: 8.5/10)
  ✓ j0i9h8g - "test: add integration tests" (Quality: 8.0/10)
```

### Example 2: Focused Analysis with Custom Output

```bash
codewave evaluate feature/auth --output ./analysis --format json --verbose
```

### Example 3: Batch Evaluation - Last N Commits

```bash
# Evaluate last 20 commits with progress display
codewave batch-evaluate --count 20 --verbose

# Output will show:
# - Current progress (20/20)
# - Elapsed time and ETA
# - Average quality score
# - Token usage and costs
```

### Example 4: Batch Evaluation - Date Range

```bash
# Evaluate all commits from January 2024
codewave batch-evaluate --since "2024-01-01" --until "2024-01-31"

# Evaluate commits from past week
codewave batch-evaluate --since "7 days ago" --until "today"

# Evaluate commits in past month with custom output
codewave batch-evaluate --since "30 days ago" --output "./monthly-analysis"
```

### Example 5: Batch with Cost Optimization

```bash
# Use cheapest model (Gemini) with max parallelization
codewave config set llm-provider google
codewave config set model gemini-2.5-flash-lite
codewave batch-evaluate --count 500 --parallel 5

# Expected cost: ~$10 for 500 commits
```

### Example 6: Batch with Quality Focus

```bash
# Use best model with sequential processing (better reasoning)
codewave config set model claude-opus-4-1-20250805
codewave batch-evaluate --count 10 --parallel 1 --verbose

# Better quality, slower, higher cost per commit
```

### Example 7: Batch Processing with Error Handling

```bash
# Continue on errors, save to specific directory
codewave batch-evaluate \
  --since "2024-01-01" \
  --until "2024-01-31" \
  --skip-errors \
  --parallel 5 \
  --output "./january-analysis" \
  --verbose

# Generates batch-summary.json with success/failure stats
```

### Example 8: Branch-Specific Batch Evaluation

```bash
# Evaluate commits only on develop branch
codewave batch-evaluate --branch develop --count 30

# Evaluate last 50 commits on feature branch
codewave batch-evaluate --branch feature/new-auth --count 50

# Compare two branches
codewave batch-evaluate --branch main --count 20 -o "./main-analysis"
codewave batch-evaluate --branch develop --count 20 -o "./develop-analysis"
```

### Example 9: CI/CD Integration (JSON Output)

```bash
# Evaluate and output only JSON (for programmatic access)
codewave batch-evaluate \
  --count 10 \
  --format json \
  --output "./ci-results" \
  --skip-errors

# Access results programmatically
jq '.metrics | {quality: .codeQuality, coverage: .testCoverage}' \
  ./ci-results/*/results.json
```

### Example 10: Analyzing Batch Results

```bash
# Count total evaluations
ls -1 .evaluated-commits/ | wc -l

# Calculate average quality score
jq -s 'map(.metrics.codeQuality) | add/length' \
  .evaluated-commits/*/results.json

# Find low-quality commits
jq 'select(.metrics.codeQuality < 5)' \
  .evaluated-commits/*/results.json

# Calculate total cost
jq -s 'map(.totalCost) | add' \
  .evaluated-commits/*/results.json

# Get average evaluation time
jq -s 'map(.metadata.evaluationTime) | add/length' \
  .evaluated-commits/*/results.json
```

---

## Project Structure

```
codewave/
├── cli/                           # CLI entry points and commands
│   ├── index.ts                   # Main CLI entry point (Commander setup)
│   ├── commands/
│   │   ├── evaluate-command.ts    # Single commit evaluation
│   │   ├── batch-evaluate-command.ts   # Multiple commits
│   │   └── config.command.ts      # Configuration management
│   └── utils/
│       ├── progress-tracker.ts    # Progress bar UI
│       └── shared.utils.ts        # CLI utilities
├── src/
│   ├── agents/                    # AI agent implementations
│   │   ├── base-agent-workflow.ts # Base agent class
│   │   ├── business-analyst-agent.ts
│   │   ├── developer-author-agent.ts
│   │   ├── developer-reviewer-agent.ts
│   │   ├── qa-engineer-agent.ts
│   │   └── senior-architect-agent.ts
│   ├── config/                    # Configuration management
│   │   ├── config.loader.ts       # Interactive config loader
│   │   └── types.ts               # Config type definitions
│   ├── llm/                       # LLM provider integration
│   │   ├── llm.service.ts         # Multi-provider service
│   │   └── token-manager.ts       # Token tracking
│   ├── formatters/                # Output formatting
│   │   ├── html-report-formatter-enhanced.ts
│   │   ├── json-formatter.ts
│   │   └── markdown-formatter.ts
│   ├── orchestrator/              # LangGraph workflow
│   │   └── orchestrator.ts        # Multi-round conversation
│   ├── services/                  # Business logic
│   │   ├── commit.service.ts      # Git operations
│   │   ├── vector-store.service.ts # RAG support
│   │   └── evaluation.service.ts
│   ├── types/                     # Type definitions
│   │   ├── agent.types.ts
│   │   ├── commit.types.ts
│   │   └── output.types.ts
│   ├── constants/                 # Constants and weights
│   │   └── agent-weights.ts
│   └── utils/                     # Shared utilities
│       ├── token-utils.ts
│       └── file-utils.ts
├── package.json                   # npm configuration
├── tsconfig.json                  # TypeScript config
└── README.md                      # This file
```

---

## Contributing

We welcome contributions! Please follow these guidelines:

1. **Fork and Clone**

   ```bash
   git clone <your-fork>
   cd codewave
   ```

2. **Create Feature Branch**

   ```bash
   git checkout -b feature/your-feature
   ```

3. **Make Changes and Test**

   ```bash
   npm run build
   npm test
   ```

4. **Ensure Code Quality**

   ```bash
   npm run lint
   npm run prettier
   ```

5. **Submit Pull Request**
   - Include clear description of changes
   - Reference related issues
   - Include test cases for new features

---

## Troubleshooting

### Common Issues

**Q: "API Key not found" error**

```
A: Run 'codewave config' to set up your LLM provider credentials.
   Alternatively, set CODEWAVE_API_KEY environment variable.
```

**Q: Evaluation times out**

```
A: For large commits (>100KB), enable RAG:
   codewave config set enable-rag true
   RAG automatically handles large diffs by chunking and semantic search.
```

**Q: "Too many requests" error from LLM provider**

```
A: Reduce parallel evaluations:
   codewave batch-evaluate --parallel 2
   Or use a different LLM provider with higher rate limits.
```

**Q: Results directory growing too large**

```
A: Archive old evaluations:
   find .evaluated-commits -type f -mtime +30 -delete
   Or specify custom output directory:
   codewave evaluate HEAD -o ./archive
```

**Q: Memory issues during batch processing**

```
A: Reduce batch size and parallel count:
   codewave batch-evaluate --count 10 --parallel 1
```

See [TROUBLESHOOTING.md](./docs/TROUBLESHOOTING.md) for more detailed solutions.

---

## Performance Considerations

### Evaluation Time

- **Average**: 2-4 seconds per commit
- **Small commits** (<1KB): 1-2 seconds
- **Medium commits** (1-100KB): 2-5 seconds
- **Large commits** (>100KB with RAG): 3-8 seconds

### Token Usage

- **Average**: 3,000-5,000 tokens per evaluation
- **Small commits**: 2,000-3,000 tokens
- **Complex commits**: 4,000-6,000 tokens
- **RAG-assisted**: 2,500-4,000 tokens (saved via chunking)

### Cost Estimates (using Claude 3.5 Sonnet)

- **Single evaluation**: ~$0.015-0.030
- **100 commits**: ~$1.50-3.00
- **1,000 commits**: ~$15-30

---

## API Reference

For programmatic usage, see [API.md](./docs/API.md).

### Basic Usage

```typescript
import { CodeWaveEvaluator } from 'codewave';

const evaluator = new CodeWaveEvaluator({
  llmProvider: 'anthropic',
  model: 'claude-3-5-sonnet-20241022',
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const result = await evaluator.evaluate('HEAD');
console.log('Code Quality:', result.metrics.codeQuality);
console.log('Consensus:', result.consensus);
```

---

## License

MIT License - see [LICENSE](./LICENSE) file for details.

---

## Contributing

We welcome contributions from the community! Please see [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines on how to contribute to CodeWave.

### Code of Conduct

This project adheres to the [Contributor Covenant Code of Conduct](./CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code.

---

## Support & Community

- **Issues**: [GitHub Issues](https://github.com/techdebtgpt/codewave/issues)
- **Discussions**: [GitHub Discussions](https://github.com/techdebtgpt/codewave/discussions)
- **Twitter**: [@TechDebtGPT](https://twitter.com/techdebtgpt)
- **Email**: support@techdebtgpt.com

---

## Acknowledgments

Built with ❤️ by the TechDebtGPT team using:

- [LangChain](https://www.langchain.com/) - AI/LLM orchestration
- [LangGraph](https://www.langchain.com/langgraph) - Workflow state machines
- [Commander.js](https://github.com/tj/commander.js) - CLI framework
- [Chalk](https://github.com/chalk/chalk) - Terminal styling

---

**CodeWave** - Making commit intelligence accessible to every team.
