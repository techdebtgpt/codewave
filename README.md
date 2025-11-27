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
- [Quick Start](#quick-start)
- [Installation](#installation)
- [CLI Commands](#cli-commands)
- [Output Structure](#output-structure)
- [Configuration](#configuration)
- [The 7-Pillar Evaluation Methodology](#the-7-pillar-evaluation-methodology)
- [The 5 AI Agents](#the-5-ai-agents)
- [Multi-Round Conversation Framework](#multi-round-conversation-framework)
- [Developer Overview](#developer-overview)
- [Developer Growth Profiles & OKRs](#developer-growth-profiles--okrs)
- [Advanced Features](#advanced-features)
  - [Analysis Depth Modes](#analysis-depth-modes)
  - [RAG for Large Diffs](#retrieval-augmented-generation-rag-for-large-diffs)
  - [Multi-LLM Support](#multi-llm-support)
  - [Batch Processing](#batch-evaluation-with-progress-tracking)
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
- **🚀 Developer Growth Profiles & OKRs**: Generate comprehensive OKRs and growth profiles based on historical commit data
- **📊 7-Pillar Methodology**: Comprehensive evaluation across Code Quality, Complexity, Timing, Technical Debt, Functional Impact, and Test Coverage
- **🎨 Interactive HTML Reports**: Beautiful, timeline-based reports with conversation history and metric visualization
- **📈 Batch Processing**: Evaluate multiple commits with real-time progress tracking
- **🧠 RAG (Retrieval-Augmented Generation)**: Automatic handling of large diffs (>100KB) using vector storage and semantic search
- **🔌 Multi-LLM Support**: Works with Anthropic Claude, OpenAI GPT, and Google Gemini
- **⚡ Production-Ready**: LangGraph-based state machines with comprehensive error handling
- **💾 JSON Output**: Structured results for programmatic access and CI/CD integration
- **🎯 Zero Configuration**: Interactive setup wizard with sensible defaults

---

## Quick Start

Get up and running in 3 simple steps:

### 1. Install CodeWave

#### From npm (Recommended)

```bash
npm install -g @techdebtgpt/codewave
codewave --help
```

#### Local Development

```bash
git clone <repo-url>
cd codewave
npm install
npm run build
```

### 2. Configure Your LLM Provider

```bash
codewave config --init
```

This launches an interactive wizard to configure:

- **LLM Provider**: Choose Anthropic Claude, OpenAI, or Google Gemini
- **API Keys**: Set your LLM provider credentials
- **Model Selection**: Pick your preferred model (defaults recommended)
- **Default Settings**: Configure batch size, output directory, and reporting preferences

Configuration is stored securely and only needs to be done once.

**Verify Setup:**

```bash
codewave config --list
```

### 3. Evaluate Your First Commit

```bash
codewave evaluate --commit HEAD
```

Or use the shorthand:

```bash
codewave evaluate HEAD
```

The system will:

1. Fetch the commit details from your Git repository
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

Then verify installation:

```bash
codewave --help
codewave --version
```

### Local Development

```bash
git clone <repo-url>
cd codewave
npm install
npm run build
```

---

## CLI Commands

### Overview

```bash
codewave [options] <command> [command-options]
```

### Global Options

```bash
codewave --help, -h          Show help message
codewave --version, -v       Show version number
```

### evaluate - Analyze a Single Commit

```bash
codewave evaluate --commit <commit-hash>

# Alternative (shorthand):
codewave evaluate <commit-hash>
```

**Examples:**

```bash
# Evaluate a specific commit (recommended)
codewave evaluate --commit HEAD
codewave evaluate --commit a1b2c3d
codewave evaluate --commit HEAD~5

# Alternative shorthand syntax
codewave evaluate HEAD
codewave evaluate a1b2c3d

# Evaluate staged changes
codewave evaluate --staged

# Evaluate all current changes (staged + unstaged)
codewave evaluate --current

# Evaluate from diff file
codewave evaluate --file my-changes.diff
```

### batch - Evaluate Multiple Commits

```bash
codewave batch [options]
```

**Examples:**

```bash
# Evaluate last 10 commits on current branch
codewave batch --count 10

# Evaluate with progress tracking
codewave batch --count 20 --verbose

# Evaluate commits in date range
codewave batch --since "2024-01-01" --until "2024-01-31"

# Evaluate with custom output and parallelization
codewave batch --count 50 --output "./reports" --parallel 3
```

**Verify Batch Results:**

```bash
# Count evaluations
ls -1 .evaluated-commits/ | wc -l

# Calculate total cost
jq -s '[.[].totalCost] | add' .evaluated-commits/*/results.json
```

### generate-okr - Generate Developer OKRs

```bash
codewave generate-okr [options]
```

**Examples:**

```bash
# Generate OKRs for all authors based on last 3 months
codewave generate-okr

# Generate for specific authors
codewave generate-okr --authors "John Doe" --months 6
```

### config - Manage Configuration

```bash
codewave config --init             # Interactive setup wizard
codewave config --list             # Display current configuration
codewave config --reset            # Reset to defaults
```

---

## Common Issues & Solutions

**Issue**: "API Key not found"

```bash
# Solution: Run interactive setup to configure your API key
codewave config --init

# Then verify configuration is correct
codewave config --list
```

**Issue**: "codewave: command not found" (after npm install -g)

```bash
# Solution: Restart your terminal
# The terminal needs to reload PATH after global npm install
codewave --version
```

**Issue**: Evaluation is slow for large commits

```bash
# Solution: RAG is always enabled and will automatically handle large diffs
# For extremely large diffs (>1MB), consider splitting into smaller commits
codewave evaluate --commit HEAD
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

Use `--commit` flag for single evaluation:

```bash
# Single evaluation (recommended)
codewave evaluate --commit HEAD

# Alternative shorthand syntax
codewave evaluate HEAD

# Batch evaluation
codewave batch --count 10
```

#### 2. Configuration File

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

#### 3. Default

If not configured, defaults to `.evaluated-commits/` in current directory.

### Configuring Output Format

Control which file formats to generate:

#### Via CLI Flag

```bash
# Evaluate specific commit (recommended)
codewave evaluate --commit HEAD

# Evaluate staged changes
codewave evaluate --staged
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

## Configuration

CodeWave uses a 3-tier configuration system with priority order:

1. **Environment Variables** (highest priority)
2. **CLI Arguments**
3. **Project Configuration** (`.codewave.config.json`)
4. **User Configuration** (user home directory)
5. **Defaults** (lowest priority)

### Quick Setup

On first run, use `codewave config --init` to set up your LLM provider:

```bash
codewave config --init
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

### Configuration Priority

CodeWave uses a priority-based configuration system:

```
CLI Arguments > Project Config > User Config > Defaults
```

**How it works**:

1. **Defaults** - Built-in sensible defaults
2. **User Config** - Global settings from `~/.codewave/config.json` (or `%APPDATA%\codewave\config.json` on Windows)
3. **Project Config** - Local settings from `.codewave.config.json` in project root
4. **CLI Arguments** - Runtime flags like `--depth`, `--count`, `--parallel` (highest priority)

**Note**: Environment variables are NOT currently supported for configuration. Use config files or CLI arguments instead.

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
**Output**: Initial scores, concerns, and observations.

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

## Developer Growth Profiles & OKRs

CodeWave goes beyond single-commit analysis by aggregating historical data to generate comprehensive **Developer Growth Profiles** and **Objectives and Key Results (OKRs)**.

### What It Does

- **Analyzes History**: Scans a developer's commit history (e.g., last 3-6 months)
- **Identifies Patterns**: Detects strengths, weaknesses, and recurring themes in code quality, complexity handling, and testing
- **Generates OKRs**: Creates tailored Objectives and Key Results to help the developer improve
- **Creates Growth Profile**: Summarizes the developer's current standing and growth trajectory

### How to Use

```bash
# Generate for all authors
codewave generate-okr

# Generate for a specific author with custom timeframe
codewave generate-okr --authors "Jane Doe" --months 6
```

### Output

The generated OKRs and profiles are integrated into the **Author Dashboard** in the HTML report, providing a holistic view of developer performance.

---

## Advanced Features

### Analysis Depth Modes

CodeWave provides three configurable depth modes that control the thoroughness of agent analysis. Each mode balances speed, cost, and analysis quality differently:

#### Fast Mode (`--depth fast`)

**Best for**: CI/CD pipelines, quick code reviews, pre-commit checks

- **Token Budget**: 1,500 tokens per agent response
- **Internal Iterations**: 1 (single pass, no refinement)
- **Clarity Threshold**: 65% (agent stops when fairly confident)
- **Self-Questions**: 1 question max per iteration
- **RAG**: Disabled (uses full diff)
- **Self-Refinement**: Skipped for speed

**Usage**:

```bash
# Single evaluation
codewave evaluate HEAD --depth fast

# Batch evaluation
codewave batch --count 50 --depth fast
```

**Typical Evaluation Time**: 1-2 seconds per commit

#### Normal Mode (`--depth normal`) - Default

**Best for**: Standard commit analysis, balanced quality/cost ratio

- **Token Budget**: 3,500 tokens per agent response
- **Internal Iterations**: 3 (with self-refinement)
- **Clarity Threshold**: 80% (good confidence level)
- **Self-Questions**: 3 questions per iteration
- **RAG**: Enabled for large diffs
- **Self-Refinement**: Active (agents refine their analysis)

**Usage**:

```bash
# Single evaluation (default)
codewave evaluate HEAD
codewave evaluate HEAD --depth normal

# Batch evaluation
codewave batch --count 20 --depth normal
```

**Typical Evaluation Time**: 2-4 seconds per commit

#### Deep Mode (`--depth deep`)

**Best for**: Architectural decisions, tech debt analysis, critical changes

- **Token Budget**: 6,000 tokens per agent response
- **Internal Iterations**: 8 (extensive self-refinement)
- **Clarity Threshold**: 88% (high confidence required)
- **Self-Questions**: 5 questions per iteration
- **RAG**: Enabled with expanded context
- **Self-Refinement**: Full multi-pass refinement

**Usage**:

```bash
# Single evaluation
codewave evaluate HEAD --depth deep

# Batch evaluation (more expensive)
codewave batch --count 10 --depth deep
```

**Typical Evaluation Time**: 4-8 seconds per commit

#### How Depth Modes Work

Each depth mode controls several internal parameters:

1. **Token Budget**: Maximum tokens each agent can use in their response
2. **Internal Iterations**: How many times agents refine their analysis
3. **Clarity Threshold**: Minimum confidence score before stopping refinement
4. **Self-Questions**: Questions agents ask themselves to improve analysis
5. **RAG Settings**: Whether to use semantic search for large diffs

**Self-Refinement Process**:

In normal and deep modes, agents go through iterative refinement:

```
Initial Analysis → Self-Evaluation → Generate Questions →
Refined Analysis → Check Clarity → Continue or Stop
```

This creates more thoughtful, comprehensive evaluations but takes longer.

#### Choosing the Right Depth Mode

| Scenario                | Recommended Mode | Reasoning                               |
| ----------------------- | ---------------- | --------------------------------------- |
| Pre-commit validation   | Fast             | Speed matters, basic quality checks     |
| CI/CD pipeline          | Fast             | Quick feedback, cost-effective          |
| Code review preparation | Normal           | Balanced analysis, good quality         |
| Team retrospectives     | Normal           | Standard depth sufficient               |
| Architecture review     | Deep             | Maximum insight needed                  |
| Tech debt assessment    | Deep             | Comprehensive analysis required         |
| Production incident     | Deep             | Critical decisions require thoroughness |
| Large refactoring       | Deep             | Need to understand all implications     |

#### Cost Comparison (using Claude 3.5 Sonnet)

| Depth Mode | Tokens/Commit | Cost/Commit  | Cost/100 Commits |
| ---------- | ------------- | ------------ | ---------------- |
| Fast       | ~2,000-3,000  | $0.01-0.015  | $1.00-1.50       |
| Normal     | ~3,000-5,000  | $0.015-0.025 | $1.50-2.50       |
| Deep       | ~5,000-8,000  | $0.025-0.040 | $2.50-4.00       |

#### Setting Default Depth Mode

You can configure a default depth mode in your configuration:

```bash
# Via config command
codewave config --init
# Select your preferred default depth mode during setup
```

Or in your `.codewave.config.json`:

```json
{
  "agents": {
    "depthMode": "deep"
  }
}
```

### Retrieval-Augmented Generation (RAG) for All Commits

CodeWave **always initializes RAG** for every commit, regardless of size:

1. Diff is chunked into semantic segments
2. Vector embeddings generated for each chunk
3. Agents can query most relevant chunks for context
4. Improves evaluation quality and provides semantic search capabilities

**How It Works**:

- RAG automatically initializes during evaluation
- Progress shown in the "Chunks" column (e.g., `45/8` = 45 chunks from 8 files)
- No configuration required - works out of the box
- Especially beneficial for large commits (>100KB) where semantic search reduces token usage

**Configuration** (optional):

```bash
# Customize chunk size (default: 2000 characters)
codewave config set rag-chunk-size 2000
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

Monitor evaluations in real-time with a comprehensive progress table:

```bash
codewave batch --count 100 --verbose
```

**Progress Table Columns**:

| Column       | Description                  | Example                         |
| ------------ | ---------------------------- | ------------------------------- |
| **Commit**   | Short SHA (7 chars)          | `e48066e`                       |
| **User**     | Author username              | `john-doe`                      |
| **Diff**     | Size and line changes        | `125.3KB +234/-89`              |
| **Chunks**   | RAG indexing stats           | `45/8` (45 chunks from 8 files) |
| **Analysis** | Progress bar + current agent | `████████░░░░ [architect...]`   |
| **State**    | Current evaluation status    | `analyzing`, `done`, `failed`   |
| **Tokens**   | Input/output token usage     | `85,011/10,500`                 |
| **Cost**     | Estimated cost in USD        | `$0.0191`                       |
| **Round**    | Current discussion round     | `3/3`                           |

**Example Output**:

```
Commit   User        Diff               Chunks  Analysis           State      Tokens         Cost      Round
e48066e  rqirici     125.3KB +234/-89   45/8    ████████████       done       85,011/10,500  $0.0191   3/3
a1b2c3d  john-doe    45.2KB +120/-55    23/5    ██████░░░░░░       analyzing  42,300/8,200   $0.0098   2/3
```

**Additional Statistics**:

- Overall completion percentage
- Elapsed time and ETA
- Success/error count
- Average evaluation time per commit
- Total token usage and cost

**Clean Output**:

Diagnostic logs (agent iterations, vectorization details, round summaries) are automatically filtered in batch mode for cleaner output. Only essential progress information and errors are displayed.

### Programmatic Access to Results

All results are saved as JSON files in the evaluation output directory for programmatic access:

```bash
codewave evaluate --commit HEAD
# Results are in: .evaluated-commits/{commit-hash}_{date}_{time}/
# Access results.json for structured data
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
codewave batch --count 5 --verbose
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

### Example 2: Focused Analysis

```bash
codewave evaluate feature/auth
```

### Example 3: Batch Evaluation - Last N Commits

```bash
# Evaluate last 20 commits with progress display
codewave batch --count 20 --verbose

# Output will show:
# - Current progress (20/20)
# - Elapsed time and ETA
# - Average quality score
# - Token usage and costs
```

### Example 4: Batch Evaluation - Date Range

```bash
# Evaluate all commits from January 2024
codewave batch --since "2024-01-01" --until "2024-01-31"

# Evaluate commits from past week
codewave batch --since "7 days ago" --until "today"

# Evaluate commits in past month with custom output
codewave batch --since "30 days ago" --output "./monthly-analysis"
```

### Example 5: Batch with Cost Optimization

```bash
# Use cheapest model (Gemini) with max parallelization
codewave config set llm-provider google
codewave config set model gemini-2.5-flash-lite
codewave batch --count 500 --parallel 5

# Expected cost: ~$10 for 500 commits
```

### Example 6: Batch with Quality Focus

```bash
# Use best model with sequential processing (better reasoning)
codewave config set model claude-opus-4-1-20250805
codewave batch --count 10 --parallel 1 --verbose

# Better quality, slower, higher cost per commit
```

### Example 7: Batch Processing with Error Handling

```bash
# Continue on errors, save to specific directory
codewave batch \
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
codewave batch --branch develop --count 30

# Evaluate last 50 commits on feature branch
codewave batch --branch feature/new-auth --count 50

# Compare two branches
codewave batch --branch main --count 20 -o "./main-analysis"
codewave batch --branch develop --count 20 -o "./develop-analysis"
```

### Example 9: CI/CD Integration (JSON Output)

```bash
# Evaluate and output only JSON (for programmatic access)
codewave batch \
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
│   │   ├── batch-evaluate-command.ts   # Multiple commits with progress tracking
│   │   └── config.command.ts      # Configuration management
│   └── utils/
│       ├── progress-tracker.ts    # Multi-column progress bar with diff/chunks tracking
│       └── shared.utils.ts        # CLI utilities
├── src/
│   ├── agents/                    # AI agent system (NEW: refactored architecture)
│   │   ├── core/                  # Base classes and metadata
│   │   │   ├── base-agent.ts      # Public base class for custom agents
│   │   │   ├── agent-metadata.ts  # Agent identity and expertise definitions
│   │   │   └── index.ts
│   │   ├── implementations/       # Concrete agent implementations
│   │   │   ├── business-analyst-agent.ts
│   │   │   ├── developer-author-agent.ts
│   │   │   ├── developer-reviewer-agent.ts
│   │   │   ├── sdet-agent.ts
│   │   │   ├── senior-architect-agent.ts
│   │   │   └── index.ts
│   │   ├── execution/             # Agent execution layer
│   │   │   ├── agent-executor.ts  # Executes agent internal graph
│   │   │   ├── agent-internal-graph.ts  # Multi-iteration refinement workflow
│   │   │   └── clarity-evaluator.ts  # Evaluates analysis quality
│   │   ├── prompts/               # Prompt building interfaces
│   │   │   ├── prompt-builder.interface.ts
│   │   │   └── index.ts
│   │   ├── agent.interface.ts     # Agent contract
│   │   └── index.ts
│   ├── config/                    # Configuration management
│   │   ├── config-loader.ts       # Config file loader
│   │   ├── config.interface.ts    # Config type definitions
│   │   └── default-config.ts      # Default configuration values
│   ├── constants/                 # Constants and weights
│   │   ├── agent-weights.constants.ts  # Agent expertise weights & consensus
│   │   ├── agent-metric-definitions.constants.ts  # Metric guidelines per agent
│   │   └── metric-definitions.constants.ts  # 7-pillar metric definitions
│   ├── formatters/                # Output formatting
│   │   ├── html-report-formatter-enhanced.ts  # Interactive HTML reports
│   │   ├── conversation-transcript-formatter.ts  # Conversation formatting
│   │   ├── json-formatter.ts
│   │   └── markdown-formatter.ts
│   ├── orchestrator/              # LangGraph workflow orchestration
│   │   ├── commit-evaluation-orchestrator.ts  # Main evaluation workflow
│   │   └── commit-evaluation-graph.ts  # Multi-round discussion graph
│   ├── services/                  # Business logic services
│   │   ├── commit-service.ts      # Git operations
│   │   ├── diff-vector-store.service.ts  # RAG vector store (always-on)
│   │   ├── developer-overview-service.ts  # AI-generated commit summaries
│   │   └── llm-service.ts         # Multi-provider LLM integration
│   ├── types/                     # Type definitions
│   │   ├── agent.types.ts
│   │   ├── commit.types.ts
│   │   └── output.types.ts
│   └── utils/                     # Shared utilities
│       ├── gap-to-rag-query-mapper.ts  # Maps clarity gaps to RAG queries
│       ├── token-utils.ts
│       └── file-utils.ts
├── docs/                          # Documentation
│   ├── AGENT_EXTENSION_GUIDE.md   # Guide for creating custom agents
│   ├── CONFIGURATION.md
│   └── API.md
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
A: Run 'codewave config --init' to set up your LLM provider credentials.
   Configuration is stored in .codewave.config.json in your project root.
```

**Q: Evaluation times out for very large commits**

```
A: RAG is always enabled to handle large diffs automatically.
   For extremely large commits (>1MB), consider splitting into smaller commits.
   You can also adjust chunk size in .codewave.config.json if needed.
```

**Q: "Too many requests" error from LLM provider**

```
A: Reduce parallel evaluations:
   codewave batch --parallel 2
   Or use a different LLM provider with higher rate limits.
```

**Q: Results directory growing too large**

```
A: Archive old evaluations:
   find .evaluated-commits -type f -mtime +30 -delete
```

**Q: Memory issues during batch processing**

```
A: Reduce batch size and parallel count:
   codewave batch --count 10 --parallel 1
```

**Q: How to find evaluations in LangSmith dashboard**

```
A: All evaluations are traced with descriptive run names:
   Format: "CommitEvaluation-{shortSHA}" (e.g., "CommitEvaluation-e48066e")

   This makes it easy to search for specific commits in LangSmith:
   1. Open your LangSmith project dashboard
   2. Search for "CommitEvaluation-" + your commit SHA
   3. View detailed trace including all agent LLM calls
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

We welcome contributions from the community! Please see [.github/CONTRIBUTING.md](./.github/CONTRIBUTING.md) for guidelines on how to contribute to CodeWave.

### Code of Conduct

This project adheres to the [Contributor Covenant Code of Conduct](./.github/CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code.

### Security

Please report security vulnerabilities to [.github/SECURITY.md](./.github/SECURITY.md) or email security@techdebtgpt.com.

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
