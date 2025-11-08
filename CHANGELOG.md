# CodeWave Changelog

All notable changes to CodeWave are documented here.

## [0.0.1] - 2025-11-08

### Major Improvements

#### 1. 🚀 Model Optimization & Robustness
- **Default Model Changed**: Now uses `claude-haiku-4-5-20251001` (6x cheaper than Sonnet)
- **maxTokens Increased to 16000 (All Models)**: Prevents response truncation and JSON parsing errors
  - Original: 8000 tokens (caused truncation with verbose responses)
  - Updated: 16000 tokens (ensures complete JSON output for all providers)
  - Applies to: Anthropic Claude, OpenAI GPT, Google Gemini, xAI Grok
- **Rationale**: Multi-agent discussion compensates for lower per-model capability
- **JSON Parsing Resilience**: Implemented 4-layer JSON recovery system
  - Layer 1: Markdown fence stripping
  - Layer 2: Content extraction (handles extra markdown after JSON)
  - Layer 3: Auto-repair (closes incomplete braces from truncation)
  - Layer 4: Debug logging (detailed error information)
- **Prompt Optimization**: All agent prompts now request concise output
  - Summary: max 150 chars
  - Details: max 400 chars
  - Critical instruction: "Return ONLY JSON, no markdown, no extra text"

#### 2. 🌍 Multi-Provider Support Expanded
- **New Provider**: Added xAI Grok support
  - `grok-4-fast-non-reasoning` - Cost-optimized
  - `grok-4.2` - Polished version
  - `grok-4-0709` - Advanced reasoning
- **Updated Models**: All providers now use Nov 2025 latest versions
  - **Anthropic**: Haiku 4.5, Sonnet 4.5, Opus 4.1
  - **OpenAI**: GPT-4o-mini, GPT-4o, o3-mini, o3
  - **Google**: Gemini 2.5 Flash/Flash-Lite/Pro, legacy 1.5 models
  - **xAI**: Grok 4-fast, 4.2, 4

#### 3. 📊 Enhanced Report Visualization
- **Evaluation History Tab**: Completely redesigned for clarity
  - Fixed confusing "vs Eval #X" headers → "Change from Previous"
  - Added color-coded badges for changes (red for increases, green for decreases)
  - Percentage change calculation showing relative impact
  - "Baseline" badge for first evaluation
  - Improved token usage visualization
  - Enhanced convergence score cards with quality labels
  - Added interpretation guide explaining all metrics

#### 4. 🔧 Agent Improvements
- **Replaced QA Engineer**: Now uses SDET (Software Development Engineer in Test) agent
  - Specialized in test automation quality
  - Evaluates testing frameworks and infrastructure
  - Focuses on automation code quality vs just coverage
- **Developer Overview Generator**: Enhanced with conciseness constraints
  - Auto-extraction of JSON from malformed responses
  - Auto-repair of incomplete JSON structures
  - Better error logging

#### 5. 📝 Developer Overview Integration
- **Graph-Based Architecture**: Developer overview now part of LangGraph workflow
  - Runs as first node before agents
  - Token tracking included in total cost calculation
  - All agents receive context in first round
- **Shared Output Functions**: Eliminated code duplication
  - `printBatchCompletionMessage()` - Batch output
  - `printEvaluateCompletionMessage()` - Single evaluation output
  - Consistent formatting across commands

#### 6. 🐛 Bug Fixes
- **Progress Bar Issue**: Fixed negative String.repeat() causing crashes
  - Added Math.max(0, ...) bounds checking
- **Batch Directory Naming**: Fixed inconsistency (8-char vs 40-char hashes)
  - Standardized on 8-character short hashes
- **Punycode Deprecation Warning**: Suppressed non-critical warning
  - Temporary fix until openai package updates

### Documentation Updates

- **CONFIGURATION.md**:
  - Updated default model to Haiku 4.5
  - Added all Nov 2025 model versions
  - Added model recommendations and cost comparisons
  - Added xAI provider documentation

- **TROUBLESHOOTING.md**:
  - Added new section: "LLM JSON Parsing Errors with Haiku"
  - Documented automatic JSON recovery
  - Explained why Haiku shows verbose responses
  - Added fallback options

- **CHANGELOG.md** (NEW):
  - Complete history of changes and improvements

### Performance Improvements

- **Cost Reduction**: ~6x cheaper per commit with Haiku as default
- **Faster Responses**: Haiku generates responses faster than Sonnet
- **Reliability**: More robust JSON parsing handles all edge cases
- **Better Error Messages**: Detailed logging helps with debugging

### Technical Details

#### Prompt Changes
All agents now request concise output:
- Summary: "max 150 chars"
- Details: "max 400 chars, Be concise"
- CRITICAL instruction: "Return ONLY the JSON object, no markdown, no extra text"

#### JSON Recovery Strategy
```typescript
// Layer 1: Strip markdown fences
let cleanOutput = output.trim();
if (cleanOutput.startsWith('```json') || cleanOutput.startsWith('```')) {
    cleanOutput = cleanOutput.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
}

// Layer 2: Extract JSON from mixed content
const jsonMatch = cleanOutput.match(/\{[\s\S]*\}/);
if (jsonMatch) {
    cleanOutput = jsonMatch[0];
}

// Layer 3: Close incomplete braces
let braceCount = (cleanOutput.match(/\{/g) || []).length;
let closingBraces = (cleanOutput.match(/\}/g) || []).length;
if (braceCount > closingBraces) {
    cleanOutput += '}'.repeat(braceCount - closingBraces);
}
```

### Migration Guide

If upgrading from previous version:

1. **Config Updated Automatically**
   - Default model changed to Haiku 4.5
   - No action needed

2. **If You Prefer Sonnet**
   ```bash
   codewave config set model claude-sonnet-4-5-20250929
   ```

3. **If You Prefer OpenAI**
   ```bash
   codewave config set llm-provider openai
   codewave config set model gpt-4o-mini
   ```

### Files Changed

- `src/agents/developer-reviewer-agent.ts` - Prompt optimization + JSON recovery
- `src/agents/senior-architect-agent.ts` - Prompt optimization + JSON recovery
- `src/agents/sdet-agent.ts` - Prompt optimization + JSON recovery (SDET agent)
- `src/agents/developer-author-agent.ts` - Prompt optimization + JSON recovery
- `src/agents/business-analyst-agent.ts` - Prompt optimization + JSON recovery
- `src/services/developer-overview-generator.ts` - Conciseness + JSON recovery
- `src/formatters/html-report-formatter-enhanced.ts` - Enhanced history visualization
- `src/config/default-config.ts` - Default model changed to Haiku
- `src/utils/token-tracker.ts` - Updated Nov 2025 pricing
- `docs/CONFIGURATION.md` - Updated model information
- `docs/TROUBLESHOOTING.md` - Added JSON parsing section

### Known Limitations

- Haiku may generate verbose responses that require multi-round refinement
- Complex diffs (>100KB) still benefit from RAG (Retrieval-Augmented Generation)
- Some edge cases in JSON parsing may require manual review

### Future Improvements

- [ ] Cache agent responses for identical code patterns
- [ ] Add caching for expensive LLM calls
- [ ] Stream large responses to reduce memory usage
- [ ] Add metrics export to CSV format
- [ ] Implement webhook notifications for batch completion

---

## [0.0.0] - Initial Release

Initial release of CodeWave with:
- 5-agent evaluation system
- 7-pillar methodology
- LangGraph-based orchestration
- Multi-LLM provider support
- Interactive HTML reports
- Batch processing capabilities
