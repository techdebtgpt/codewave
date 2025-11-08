# CodeWave Troubleshooting Guide

Comprehensive troubleshooting for common issues and how to resolve them.

## Table of Contents

1. [Installation Issues](#installation-issues)
2. [Configuration Issues](#configuration-issues)
3. [API & Authentication](#api--authentication)
4. [Evaluation Issues](#evaluation-issues)
5. [Performance Issues](#performance-issues)
6. [Output Issues](#output-issues)
7. [Advanced Debugging](#advanced-debugging)

---

## Installation Issues

### Problem: Command Not Found

```
command not found: codewave
```

#### Cause
CodeWave is not installed or not in PATH.

#### Solution

**Option 1: Install Globally**
```bash
npm install -g codewave
```

**Option 2: Install Locally**
```bash
npm install codewave
# Run with npx
npx codewave evaluate HEAD
```

**Option 3: Check Installation**
```bash
# Check if installed
which codewave
npm list -g codewave

# Reinstall if needed
npm uninstall -g codewave
npm install -g codewave

# Verify
codewave --version
```

### Problem: Permission Denied

```
Error: EACCES: permission denied
```

#### Cause
Insufficient permissions for npm global installation.

#### Solution

**Option 1: Fix npm Permissions**
```bash
mkdir ~/.npm-global
npm config set prefix '~/.npm-global'
export PATH=~/.npm-global/bin:$PATH

# Add to ~/.bashrc or ~/.zshrc
echo 'export PATH=~/.npm-global/bin:$PATH' >> ~/.bashrc
source ~/.bashrc
```

**Option 2: Use sudo (Not Recommended)**
```bash
sudo npm install -g codewave
```

### Problem: Old Version Installed

```
codewave --version
# Output: 0.9.0 (outdated)
```

#### Solution

```bash
# Update to latest
npm install -g codewave@latest

# Or reinstall
npm uninstall -g codewave
npm install -g codewave

# Verify
codewave --version
```

---

## Configuration Issues

### Problem: Configuration File Not Found

```
Error: Configuration file not found
Please run: codewave config
```

#### Cause
First-time setup not completed.

#### Solution

```bash
# Run interactive configuration
codewave config

# Or set via environment variables
export CODEWAVE_LLM_PROVIDER=anthropic
export CODEWAVE_API_KEY=sk-ant-...
export CODEWAVE_MODEL=claude-3-5-sonnet-20241022

# Verify
codewave config show
```

### Problem: Invalid Configuration

```
Error: Invalid configuration format
```

#### Cause
Configuration file is corrupted or invalid JSON.

#### Solution

**Option 1: Backup and Reset**
```bash
# Backup current config
cp ~/.codewave/config.json ~/.codewave/config.json.backup

# Reset to defaults
codewave config reset

# Reconfigure
codewave config
```

**Option 2: Manual Fix**
```bash
# Edit configuration file directly
cat ~/.codewave/config.json  # View contents
nano ~/.codewave/config.json # Edit

# Validate JSON online or with jq
jq . ~/.codewave/config.json
```

### Problem: Configuration Not Being Applied

```
Expected: model X
Actual: model Y
```

#### Cause
Environment variables or CLI arguments overriding configuration file.

#### Resolution Order (highest priority first):
1. CLI arguments (`--model`, `--format`)
2. Environment variables (`CODEWAVE_MODEL`)
3. Configuration file (`~/.codewave/config.json`)
4. Defaults

#### Solution

```bash
# Check current config
codewave config show

# Check environment variables
env | grep CODEWAVE

# Remove conflicting variables
unset CODEWAVE_MODEL

# Set via config
codewave config set model claude-3-5-sonnet-20241022
```

---

## API & Authentication

### Problem: "API Key Not Found"

```
Error: API key not found
Please configure with: codewave config set api-key <key>
```

#### Solution

**Option 1: Set via Config**
```bash
codewave config set api-key sk-ant-...
codewave config show  # Verify
```

**Option 2: Set via Environment Variable**
```bash
export CODEWAVE_API_KEY=sk-ant-...
codewave evaluate HEAD
```

**Option 3: Interactive Config**
```bash
codewave config  # Will prompt for API key
```

### Problem: "Invalid API Key"

```
Error: 401 Unauthorized - Invalid API key
```

#### Cause
API key is incorrect, expired, or revoked.

#### Solution

**Step 1: Verify Key Format**
```bash
# Key should start with provider prefix
# Anthropic: sk-ant-...
# OpenAI: sk-...
# Google: AIza... or api-key-...

codewave config show | grep api-key
```

**Step 2: Check Key Validity**
- Visit provider's API key management page
- Verify key hasn't been revoked
- Check expiration date if applicable

**Step 3: Regenerate and Update**
```bash
# 1. Generate new key from provider
# 2. Update CodeWave
codewave config set api-key <new-key>

# 3. Verify
codewave evaluate HEAD --verbose
```

### Problem: "Provider Not Found"

```
Error: LLM provider 'anthropic' not found
```

#### Cause
Invalid provider name or provider not installed.

#### Solution

```bash
# Check current configuration
codewave config show

# Set to valid provider
codewave config set llm-provider anthropic  # Anthropic
codewave config set llm-provider openai     # OpenAI
codewave config set llm-provider google     # Google Gemini
```

### Problem: "Model Not Available"

```
Error: Model 'claude-99' is not available
```

#### Cause
Model doesn't exist for selected provider.

#### Solution

```bash
# Anthropic models
codewave config set model claude-3-5-sonnet-20241022
codewave config set model claude-3-opus-20250219
codewave config set model claude-3-haiku-20240307

# OpenAI models
codewave config set model gpt-4o
codewave config set model gpt-4-turbo
codewave config set model gpt-4

# Google models
codewave config set model gemini-2.0-flash
codewave config set model gemini-1.5-pro
```

---

## Evaluation Issues

### Problem: "Commit Not Found"

```
Error: Commit 'abc1234' not found in repository
```

#### Cause
Invalid commit hash or reference.

#### Solution

```bash
# Verify you're in a Git repository
pwd
git status

# List available commits
git log --oneline -10

# Use valid reference
codewave evaluate HEAD           # Latest
codewave evaluate HEAD~1         # Previous
codewave evaluate abc1234        # Specific hash
codewave evaluate develop        # Branch name
```

### Problem: "Repository Not Found"

```
Error: Not a git repository
fatal: not a git repository (or any of the parent directories)
```

#### Cause
Not in a Git repository directory.

#### Solution

```bash
# Check if in Git repo
ls -la | grep ".git"

# Navigate to repository root
cd ~/my-project

# Or specify repository path
codewave evaluate HEAD --repo /path/to/repo
```

### Problem: "No Commits to Evaluate"

```
Error: No commits found in range
```

#### Cause
Commit range is empty or invalid date filters.

#### Solution

```bash
# Check available commits
git log --oneline --since="2024-01-01" --until="2024-01-31"

# Adjust date range
codewave batch-evaluate --since "2024-01-01" --until "2024-02-01"

# Or use count instead
codewave batch-evaluate --count 10
```

### Problem: "Evaluation Timeout"

```
Error: Evaluation timed out after 120 seconds
```

#### Cause
Large diff or slow LLM API.

#### Solution

**For Large Diffs**:
```bash
# Enable RAG for automatic chunking
codewave config set enable-rag true
codewave config set rag-chunk-size 2000

# Re-evaluate
codewave evaluate HEAD --verbose
```

**For Slow API**:
```bash
# Use faster model
codewave config set model claude-3-haiku-20240307

# Or different provider
codewave config set llm-provider google
codewave config set model gemini-2.0-flash

# Increase timeout if available
codewave evaluate HEAD --timeout 300
```

### Problem: "Diff Too Large"

```
Error: Diff exceeds maximum size (100KB)
Warning: Consider enabling RAG
```

#### Cause
Commit diff is too large for efficient processing.

#### Solution

**Option 1: Enable RAG**
```bash
codewave config set enable-rag true
codewave config set rag-chunk-size 2000
codewave evaluate HEAD
```

**Option 2: Increase Threshold**
```bash
# Set threshold to 200KB
codewave config set rag-threshold 204800
```

**Option 3: Process Smaller Commits**
```bash
# Evaluate individual files instead
git diff HEAD~1 -- src/auth.ts | codewave evaluate --stdin
```

---

## Performance Issues

### Problem: Slow Evaluations

Evaluation takes 10+ seconds per commit.

#### Cause
Using high-quality but slow model, or network latency.

#### Solution

**Option 1: Use Faster Model**
```bash
codewave config set model claude-3-haiku-20240307
codewave evaluate HEAD --verbose
```

**Option 2: Reduce Token Limit**
```bash
codewave config set max-tokens 2000
codewave evaluate HEAD --verbose
```

**Option 3: Skip Report Generation**
```bash
codewave evaluate HEAD --no-report --format json
```

### Problem: High Memory Usage

```
Error: JavaScript heap out of memory
```

#### Cause
Processing too many commits in parallel or very large diffs.

#### Solution

**Option 1: Reduce Parallelization**
```bash
codewave config set parallel-evaluations 1
codewave batch-evaluate --count 100
```

**Option 2: Process Smaller Batches**
```bash
codewave batch-evaluate --count 10  # Instead of 100

# Then process next batch
codewave batch-evaluate --count 10 --since "2024-01-15"
```

**Option 3: Enable Vector Store Optimization**
```bash
# Use disk-based vector store for large commits
codewave config set vector-store-type disk
```

### Problem: High Cost

Costs are unexpectedly high.

#### Solution

**Option 1: Use Cheaper Model**
```bash
# Google Gemini (10x cheaper)
codewave config set llm-provider google
codewave config set model gemini-2.0-flash

# Or Anthropic Haiku
codewave config set model claude-3-haiku-20240307
```

**Option 2: Reduce Token Usage**
```bash
# Smaller token limit
codewave config set max-tokens 2000

# Smaller RAG chunks
codewave config set rag-chunk-size 1000
```

**Option 3: Batch Efficiently**
```bash
# Process in parallel to reduce overhead
codewave batch-evaluate --count 100 --parallel 5
```

---

## Output Issues

### Problem: "Output Directory Permission Denied"

```
Error: EACCES: permission denied, open '.evaluated-commits'
```

#### Cause
No write permission to output directory.

#### Solution

```bash
# Check permissions
ls -la .evaluated-commits

# Fix permissions
chmod 755 .evaluated-commits

# Or use different directory
codewave evaluate HEAD -o ~/codewave-results

# Or check disk space
df -h
```

### Problem: "HTML Report Not Opening"

```
Report saved, but can't open report.html
```

#### Solution

```bash
# Find the report
find .evaluated-commits -name "report.html" | head -1

# Open manually
open .evaluated-commits/*/report.html

# Or in specific browser
google-chrome .evaluated-commits/*/report.html

# Or serve with HTTP server
python3 -m http.server 8000
# Then visit http://localhost:8000/.evaluated-commits/*/report.html
```

### Problem: "JSON Results Invalid"

```
Error: JSON parse error
```

#### Solution

```bash
# Validate JSON
jq . .evaluated-commits/*/results.json

# Check for corruption
file .evaluated-commits/*/results.json

# Re-evaluate if corrupted
rm .evaluated-commits/*/results.json
codewave evaluate HEAD --format json
```

---

## Advanced Debugging

### Enable Verbose Logging

```bash
# Run with verbose output
codewave evaluate HEAD --verbose

# Enable for all operations
codewave config set verbose true
codewave evaluate HEAD
```

**Verbose Output Shows**:
- Agent prompts and responses
- Token counts and costs
- Timing for each stage
- Full LLM API interactions
- Error stack traces

### Check System Information

```bash
# Node.js version
node --version

# npm version
npm --version

# CodeWave version
codewave --version

# Git version
git --version

# OS information
uname -a

# Disk space
df -h

# Memory usage
free -h  # Linux
vm_stat  # macOS
```

### Verify Network Connectivity

```bash
# Test API connectivity
curl -I https://api.anthropic.com

# Test DNS
nslookup api.anthropic.com

# Check proxy settings
env | grep -i proxy
```

### Enable Core Dumps (Advanced)

```bash
# Linux: Enable core dumps for crash analysis
ulimit -c unlimited

# macOS: Similar approach
defaults write com.apple.CrashReporter CrashReportingEnabled 1
```

### Collect Debug Information

```bash
#!/bin/bash

echo "=== System Information ===" > debug-info.txt
uname -a >> debug-info.txt
node --version >> debug-info.txt
npm --version >> debug-info.txt
codewave --version >> debug-info.txt

echo "=== CodeWave Configuration ===" >> debug-info.txt
codewave config show >> debug-info.txt

echo "=== Environment Variables ===" >> debug-info.txt
env | grep -i codewave >> debug-info.txt

echo "=== Git Information ===" >> debug-info.txt
git log --oneline -5 >> debug-info.txt

echo "Debug info collected in: debug-info.txt"
```

### Enable Stack Traces

```bash
# Run with Node.js debugging
node --inspect-brk `which codewave` evaluate HEAD

# Or with more verbose Node output
NODE_DEBUG=* codewave evaluate HEAD 2>&1 | head -100
```

---

## Getting Help

### Before Asking for Help

1. **Check This Guide**: Search for your error message above
2. **Enable Verbose**: Run with `--verbose` flag for more info
3. **Check Version**: Ensure you're running latest version
4. **Collect Info**: Run the debug information script above
5. **Try Different Model**: Test with different LLM provider
6. **Check Documentation**: See [README.md](../README.md)

### Where to Get Help

**GitHub Issues**:
```
https://github.com/techdebtgpt/codewave/issues
```

**Email Support**:
```
support@techdebtgpt.com
```

**Discussions**:
```
https://github.com/techdebtgpt/codewave/discussions
```

### Reporting Issues

When reporting, include:

1. **Error Message**: Exact error text
2. **Reproduction Steps**: How to reproduce
3. **System Info**: OS, Node version, CodeWave version
4. **Configuration**: Your config (mask API keys)
5. **Logs**: Output from `--verbose` flag
6. **Expected Behavior**: What should happen
7. **Actual Behavior**: What actually happens

Example issue:

```markdown
## Bug: Evaluation Timeout on Large Commits

### Error Message
```
Error: Evaluation timed out after 120 seconds
```

### Reproduction
1. Create commit with 150KB diff
2. Run: `codewave evaluate HEAD`
3. Wait 120 seconds...

### Environment
- OS: macOS 14.1
- Node: 18.18.0
- CodeWave: 1.0.0
- Model: claude-3-5-sonnet-20241022

### Configuration
```json
{
  "llmProvider": "anthropic",
  "model": "claude-3-5-sonnet-20241022",
  "enableRag": false
}
```

### Expected
Should complete evaluation in 5-10 seconds

### Actual
Times out after 120 seconds

### Solution Attempted
- Tried different model (same issue)
- Tried smaller commits (works fine)
```

### Problem: LLM JSON Parsing Errors

```
Failed to parse LLM output: Unexpected non-whitespace character after JSON
Unexpected token '#'
```

#### Cause
Any model (Haiku, Sonnet, GPT, Gemini, Grok) can generate responses that are truncated or include extra content after JSON when approaching token limits.

#### Solution

**Option 1: Already Fixed (v0.0.1+)**
Automatic JSON recovery is built in for all models:
- Extracts JSON even if extra markdown content follows
- Auto-closes incomplete JSON structures
- Provides detailed error logging for debugging

The system gracefully handles truncated responses by:
1. Extracting the JSON object using regex
2. Closing incomplete braces
3. Falling back to text summary if JSON parsing completely fails

No action needed - evaluation continues with best-effort parsing.

**Option 2: Default Configuration (Recommended)**
- **maxTokens**: Now set to 16000 for all models
  - Increased from 8000 to prevent truncation
  - Applies to all LLM providers (Anthropic, OpenAI, Google, xAI)
  - Should eliminate most JSON parsing errors

**Option 3: Use Better Model (if issues persist)**
```bash
# Try a more capable model with better JSON output
codewave config set model claude-sonnet-4-5-20250929  # Sonnet (~4x cost)
codewave config set model gpt-4o                       # OpenAI GPT-4o
codewave config set model gemini-2.5-pro               # Google Gemini
```

**Option 4: Manually Increase maxTokens Further**
```bash
# View current settings
codewave config show

# If issues still persist, increase maxTokens further
# (This may increase API costs depending on provider)
```

#### Why This Happens with Any Model
- Models can generate verbose responses that approach token limits
- Default maxTokens increased to 16000 to prevent truncation across all providers
- JSON recovery system handles any remaining edge cases
- Multi-agent discussion provides additional refinement opportunities

---

## Quick Fix Checklist

- [ ] Reinstall CodeWave: `npm install -g codewave`
- [ ] Check version: `codewave --version`
- [ ] Reset config: `codewave config reset`
- [ ] Reconfigure: `codewave config`
- [ ] Verify API key: `codewave config show`
- [ ] Try verbose: `codewave evaluate HEAD --verbose`
- [ ] Check permissions: `ls -la ~/.codewave`
- [ ] Check disk space: `df -h`
- [ ] Verify Git repo: `git status`
- [ ] Try different model: `codewave config set model claude-sonnet-4-5-20250929`

---

For more information:
- [README.md](../README.md) - Main documentation
- [CONFIGURATION.md](./CONFIGURATION.md) - Configuration guide
- [CLI.md](./CLI.md) - CLI reference
- [EXAMPLES.md](./EXAMPLES.md) - Usage examples
