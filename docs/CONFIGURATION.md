# CodeWave Configuration Guide

Complete guide to configuring CodeWave for your environment and workflow.

## Table of Contents

1. [Quick Start](#quick-start)
2. [Configuration Methods](#configuration-methods)
3. [Configuration Options](#configuration-options)
4. [LLM Provider Setup](#llm-provider-setup)
5. [Advanced Configuration](#advanced-configuration)
6. [Environment Variables](#environment-variables)
7. [Troubleshooting](#troubleshooting)

---

## Quick Start

### First-Time Setup

```bash
codewave config
```

Follow the interactive wizard:

1. **Choose LLM Provider**
   ```
   ? Which LLM provider do you want to use?
   ❯ Anthropic Claude (recommended)
     OpenAI GPT-4
     Google Gemini
   ```

2. **Enter API Key**
   ```
   ? Enter your Anthropic API key: sk-ant-...
   ```

3. **Choose Model**
   ```
   ? Which Claude model do you want to use?
   ❯ claude-haiku-4-5-20251001 (recommended - cost-optimized)
     claude-sonnet-4-5-20250929 (best balance)
     claude-opus-4-1-20250805 (maximum quality)
   ```

   **Model Recommendations:**
   - **Haiku 4.5** (Default): 6x cheaper than Sonnet. Multi-agent discussion compensates for lower per-model capability.
   - **Sonnet 4.5**: Best balance of quality and cost (~4x Haiku)
   - **Opus 4.1**: Maximum quality output (~19x Haiku cost)

4. **Configure Defaults** (optional)
   ```
   ? Output directory (.evaluated-commits): .
   ? Batch size (10): 10
   ? Enable RAG for large diffs? (yes): yes
   ```

That's it! You're ready to evaluate commits.

---

## Configuration Methods

### 1. Interactive CLI Setup

```bash
codewave config
```

Interactive wizard for complete setup. Best for first-time configuration.

### 2. View Current Configuration

```bash
codewave config show
```

Displays all current settings:
```
CodeWave Configuration
=====================

LLM Provider: anthropic
Model: claude-3-5-sonnet-20241022
Output Directory: .evaluated-commits
Batch Size: 10
Enable RAG: true
RAG Chunk Size: 2000
Verbose: false
```

### 3. Set Individual Values

```bash
codewave config set <key> <value>
```

**Examples:**
```bash
# Change model
codewave config set model claude-3-opus-20250219

# Change output directory
codewave config set output-directory ./reports

# Enable verbose logging
codewave config set verbose true

# Change RAG chunk size
codewave config set rag-chunk-size 3000
```

### 4. Reset to Defaults

```bash
codewave config reset
```

Resets all configuration to factory defaults. **Warning**: You'll need to reconfigure API keys.

### 5. Environment Variables

Set environment variables to override configuration:

```bash
export CODEWAVE_LLM_PROVIDER=anthropic
export CODEWAVE_API_KEY=sk-ant-...
export CODEWAVE_MODEL=claude-3-5-sonnet-20241022
codewave evaluate HEAD
```

---

## Configuration Options

### Core LLM Settings

#### `llmProvider`
**Type**: `'anthropic' | 'openai' | 'google' | 'xai'`
**Default**: `'anthropic'`
**Env**: `CODEWAVE_LLM_PROVIDER`

LLM provider to use for agent conversations.

**Supported Providers:**
- `anthropic` - Recommended (Haiku 4.5 is most cost-effective)
- `openai` - Alternative with GPT-4o models
- `google` - Gemini models for advanced reasoning
- `xai` - Grok models for specialized use cases

```bash
codewave config set llm-provider openai
codewave config set llm-provider google
```

#### `model`
**Type**: `string`
**Default**: `'claude-haiku-4-5-20251001'`
**Env**: `CODEWAVE_MODEL`

**Available Anthropic Models:**
- `claude-haiku-4-5-20251001` - Cost-optimized (Recommended)
- `claude-sonnet-4-5-20250929` - Best balance
- `claude-opus-4-1-20250805` - Maximum quality

**Available OpenAI Models:**
- `gpt-4o-mini` - Cost-optimized (Recommended)
- `gpt-4o` - Best balance
- `o3-mini-2025-01-31` - Advanced reasoning, cost-efficient
- `o3` - Maximum reasoning capability

**Available Google Models:**
- `gemini-2.5-flash-lite` - Most efficient (Recommended)
- `gemini-2.5-flash` - Best balance
- `gemini-2.5-pro` - Best reasoning

**Available xAI Models:**
- `grok-4-fast-non-reasoning` - Cost-optimized (Recommended)
- `grok-4.2` - Polished version
- `grok-4-0709` - Advanced reasoning

Specific model to use with the chosen provider.

```bash
# Anthropic
codewave config set model claude-3-opus-20250219

# OpenAI
codewave config set model gpt-4o

# Google
codewave config set model gemini-2.0-flash
```

#### `apiKey`
**Type**: `string`
**Env**: `CODEWAVE_API_KEY`

API key for the chosen LLM provider. Never store in version control.

```bash
codewave config set api-key sk-ant-...
```

**Security Note**: Configuration is stored in:
- **macOS/Linux**: `~/.codewave/config.json`
- **Windows**: `%APPDATA%\codewave\config.json`

The configuration file is user-readable. Store sensitive keys in environment variables when possible.

#### `apiBaseUrl`
**Type**: `string | null`
**Default**: `null`
**Env**: `CODEWAVE_API_BASE_URL`

Custom API endpoint (for self-hosted LLM services or proxies).

```bash
codewave config set api-base-url https://proxy.company.com/api
```

### Output Settings

#### `outputDirectory`
**Type**: `string`
**Default**: `.evaluated-commits`
**Env**: `CODEWAVE_OUTPUT_DIR`

Directory where evaluation results are saved.

```bash
codewave config set output-directory ./reports
```

#### `reportFormat`
**Type**: `'html' | 'json' | 'markdown' | 'all'`
**Default**: `'all'`
**Env**: `CODEWAVE_REPORT_FORMAT`

Format(s) to generate for each evaluation.

```bash
# Generate only HTML reports
codewave config set report-format html

# Generate JSON for CI/CD integration
codewave config set report-format json

# Generate all formats
codewave config set report-format all
```

### Token & Cost Management

#### `maxTokensPerRequest`
**Type**: `number`
**Default**: `4000`
**Env**: `CODEWAVE_MAX_TOKENS`

Maximum tokens to request from LLM per API call.

```bash
codewave config set max-tokens 8000
```

#### `defaultBatchSize`
**Type**: `number`
**Default**: `10`
**Env**: `CODEWAVE_BATCH_SIZE`

Default number of commits to evaluate in batch mode.

```bash
codewave config set batch-size 50
```

#### `parallelEvaluations`
**Type**: `number`
**Default**: `3`
**Min**: `1`
**Max**: `5`
**Env**: `CODEWAVE_PARALLEL`

Number of commits to evaluate in parallel.

```bash
codewave config set parallel-evaluations 5
```

### RAG Settings

#### `enableRag`
**Type**: `boolean`
**Default**: `true`
**Env**: `CODEWAVE_ENABLE_RAG`

Enable Retrieval-Augmented Generation for large diffs.

```bash
codewave config set enable-rag true
```

#### `ragChunkSize`
**Type**: `number`
**Default**: `2000`
**Env**: `CODEWAVE_RAG_CHUNK_SIZE`

Characters per chunk when splitting large diffs.

```bash
codewave config set rag-chunk-size 3000
```

#### `ragThreshold`
**Type**: `number`
**Default**: `102400`
**Env**: `CODEWAVE_RAG_THRESHOLD`

Diff size (in bytes) above which RAG is activated.

```bash
# Activate RAG for diffs > 50KB
codewave config set rag-threshold 51200
```

#### `vectorStoreType`
**Type**: `'memory' | 'disk'`
**Default**: `'memory'`
**Env**: `CODEWAVE_VECTOR_STORE_TYPE`

Backend for vector storage.

```bash
codewave config set vector-store-type memory
```

### Logging & Debug

#### `verbose`
**Type**: `boolean`
**Default**: `false`
**Env**: `CODEWAVE_VERBOSE`

Enable detailed logging of evaluation process.

```bash
codewave config set verbose true
```

**Debug Output Includes**:
- Agent prompts and responses
- Token counts and costs
- LLM API interactions
- Timing information
- Error stack traces

---

## LLM Provider Setup

### Anthropic Claude (Recommended)

#### Get API Key

1. Visit [console.anthropic.com](https://console.anthropic.com)
2. Create account or log in
3. Go to **API Keys** section
4. Click **Create API Key**
5. Copy the key (starts with `sk-ant-`)

#### Configuration

```bash
codewave config set llm-provider anthropic
codewave config set api-key sk-ant-...
codewave config set model claude-3-5-sonnet-20241022
```

#### Available Models

- **claude-3-5-sonnet-20241022** ⭐ (Recommended)
  - Best balance of speed, quality, and cost
  - $3/M input, $15/M output tokens

- **claude-3-opus-20250219**
  - Most capable model
  - Slower and more expensive
  - $15/M input, $75/M output tokens

- **claude-3-haiku-20240307**
  - Fastest and cheapest
  - Lower quality for complex reasoning
  - $0.80/M input, $4/M output tokens

### OpenAI GPT-4

#### Get API Key

1. Visit [platform.openai.com](https://platform.openai.com)
2. Create account or log in
3. Go to **API Keys** section
4. Click **Create Secret Key**
5. Copy the key (starts with `sk-`)

#### Configuration

```bash
codewave config set llm-provider openai
codewave config set api-key sk-...
codewave config set model gpt-4o
```

#### Available Models

- **gpt-4o** ⭐ (Recommended)
  - Latest and most capable
  - $5/M input, $15/M output tokens

- **gpt-4-turbo**
  - Balanced speed and quality
  - $10/M input, $30/M output tokens

- **gpt-4**
  - Original GPT-4
  - Most expensive
  - $30/M input, $60/M output tokens

**Note**: Rate limits apply. Start with lower parallelization if you hit limits.

### Google Gemini

#### Get API Key

1. Visit [ai.google.dev](https://ai.google.dev)
2. Create account or log in
3. Go to **API Keys** section
4. Click **Create API Key**
5. Copy the key

#### Configuration

```bash
codewave config set llm-provider google
codewave config set api-key ...
codewave config set model gemini-2.0-flash
```

#### Available Models

- **gemini-2.0-flash** ⭐ (Recommended)
  - Very fast and cost-effective
  - $0.075/M input, $0.3/M output tokens

- **gemini-1.5-pro**
  - More capable, slower
  - $1.25/M input, $5/M output tokens

---

## Advanced Configuration

### Custom API Endpoints

For self-hosted or proxy scenarios:

```bash
codewave config set api-base-url https://custom-llm.company.com/api
```

This overrides the default provider endpoints.

### Environment-Specific Configs

#### Development

```bash
codewave config set verbose true
codewave config set model claude-3-haiku-20240307  # Cheaper
codewave config set rag-chunk-size 1000            # Smaller chunks
```

#### Production

```bash
codewave config set verbose false
codewave config set model claude-3-5-sonnet-20241022  # Balanced
codewave config set parallel-evaluations 5            # Max parallelization
```

#### CI/CD Integration

```bash
codewave config set report-format json
codewave config set output-directory ./ci-reports
codewave config set batch-size 100
codewave config set parallel-evaluations 3
```

---

## Environment Variables

Override any configuration setting using environment variables:

```bash
# LLM Settings
export CODEWAVE_LLM_PROVIDER=anthropic
export CODEWAVE_API_KEY=sk-ant-...
export CODEWAVE_MODEL=claude-3-5-sonnet-20241022
export CODEWAVE_API_BASE_URL=https://api.anthropic.com

# Output Settings
export CODEWAVE_OUTPUT_DIR=./reports
export CODEWAVE_REPORT_FORMAT=json

# Token & Cost
export CODEWAVE_MAX_TOKENS=4000
export CODEWAVE_BATCH_SIZE=10
export CODEWAVE_PARALLEL=3

# RAG Settings
export CODEWAVE_ENABLE_RAG=true
export CODEWAVE_RAG_CHUNK_SIZE=2000
export CODEWAVE_RAG_THRESHOLD=102400
export CODEWAVE_VECTOR_STORE_TYPE=memory

# Logging
export CODEWAVE_VERBOSE=false

# Run evaluation
codewave evaluate HEAD
```

**Priority Order**:
1. Environment variables (highest)
2. CLI arguments
3. Configuration file
4. Defaults (lowest)

---

## Configuration File Format

Located at:
- **macOS/Linux**: `~/.codewave/config.json`
- **Windows**: `%APPDATA%\codewave\config.json`

### Example Configuration File

```json
{
  "llmProvider": "anthropic",
  "model": "claude-3-5-sonnet-20241022",
  "apiKey": "sk-ant-...",
  "apiBaseUrl": null,
  "outputDirectory": ".evaluated-commits",
  "defaultBatchSize": 10,
  "parallelEvaluations": 3,
  "maxTokensPerRequest": 4000,
  "enableRag": true,
  "ragChunkSize": 2000,
  "ragThreshold": 102400,
  "vectorStoreType": "memory",
  "reportFormat": "all",
  "verbose": false,
  "createdAt": "2024-01-15T10:30:00Z",
  "updatedAt": "2024-01-15T14:20:00Z"
}
```

### Backup Configuration

```bash
# Backup
cp ~/.codewave/config.json ~/.codewave/config.json.backup

# Restore
cp ~/.codewave/config.json.backup ~/.codewave/config.json
```

---

## Troubleshooting

### "API Key not found"

**Solution**:
```bash
# Run config setup
codewave config

# Or set environment variable
export CODEWAVE_API_KEY=sk-ant-...
codewave evaluate HEAD
```

### "Invalid API key"

**Solution**:
1. Verify key in configuration: `codewave config show`
2. Check key is still valid on provider website
3. Regenerate key if needed
4. Update: `codewave config set api-key new-key`

### "Rate limit exceeded"

**Solution**:
```bash
# Reduce parallelization
codewave config set parallel-evaluations 1

# Increase batch size but process sequentially
codewave batch-evaluate --count 50 --parallel 1
```

### "Out of memory during batch processing"

**Solution**:
```bash
# Reduce parallelization
codewave config set parallel-evaluations 1

# Reduce batch size
codewave config set batch-size 10

# Run smaller batches
codewave batch-evaluate --count 20
```

### "Evaluations timing out"

**Solution**:
```bash
# Enable RAG for large diffs
codewave config set enable-rag true

# Reduce max tokens
codewave config set max-tokens 3000

# Use faster model
codewave config set model claude-3-haiku-20240307
```

### "Configuration file corrupted"

**Solution**:
```bash
# Reset and reconfigure
codewave config reset
codewave config
```

Or manually fix the JSON:
```bash
# Edit directly
cat ~/.codewave/config.json  # Inspect
nano ~/.codewave/config.json # Edit
```

---

## Performance Tuning

### For Speed

```bash
# Use fast model
codewave config set model claude-3-haiku-20240307

# Reduce token limit
codewave config set max-tokens 2000

# Maximize parallelization
codewave config set parallel-evaluations 5

# Smaller RAG chunks
codewave config set rag-chunk-size 1000
```

### For Quality

```bash
# Use capable model
codewave config set model claude-3-opus-20250219

# Increase token limit
codewave config set max-tokens 8000

# Reduce parallelization (less LLM confusion)
codewave config set parallel-evaluations 1

# Larger RAG chunks
codewave config set rag-chunk-size 3000
```

### For Cost

```bash
# Use cheap model
codewave config set model claude-3-haiku-20240307

# Or use Google Gemini
codewave config set llm-provider google
codewave config set model gemini-2.0-flash

# Reduce max tokens
codewave config set max-tokens 2000

# Batch process efficiently
codewave batch-evaluate --parallel 5 --count 100
```

---

For more information:
- [README.md](../README.md) - Main documentation
- [API.md](./API.md) - Programmatic API
- [ARCHITECTURE.md](./ARCHITECTURE.md) - System architecture
