# CodeWave Architecture

Complete technical architecture documentation for CodeWave system.

## Table of Contents

1. [System Overview](#system-overview)
2. [Technology Stack](#technology-stack)
3. [Core Components](#core-components)
4. [Data Flow](#data-flow)
5. [Multi-Agent Orchestration](#multi-agent-orchestration)
6. [Developer Overview Generation](#developer-overview-generation)
7. [Convergence Detection Algorithm](#convergence-detection-algorithm)
8. [LLM Integration](#llm-integration)
9. [RAG System](#rag-system)
10. [Output Generation](#output-generation)
11. [State Management](#state-management)
12. [Error Handling](#error-handling)

---

## System Overview

CodeWave is a multi-tier, event-driven system for AI-powered code review that combines:

- **CLI Layer**: Interactive command-line interface for user interaction
- **Orchestration Layer**: LangGraph-based workflow management
- **Agent Layer**: 5 specialized AI agents with distinct expertise
- **LLM Layer**: Multi-provider language model integration
- **Storage Layer**: Commit data, embeddings, and evaluation results
- **Output Layer**: Report generation in multiple formats

### Architecture Diagram

```
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚                    CLI LAYER                               â”‚
â”‚  â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”   â”‚
â”‚  â”‚  Evaluate    â”‚  Batch       â”‚  Config              â”‚   â”‚
â”‚  â”‚  Command     â”‚  Evaluate    â”‚  Management          â”‚   â”‚
â”‚  â””â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”´â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”´â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜   â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¼â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¼â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¼â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
          â”‚              â”‚                â”‚
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â–¼â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â–¼â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â–¼â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚                  ORCHESTRATION LAYER                       â”‚
â”‚              (LangGraph Workflow Engine)                  â”‚
â”‚  â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”  â”‚
â”‚  â”‚  Evaluation Orchestrator                           â”‚  â”‚
â”‚  â”‚  - Round 1: Independent Assessment                â”‚  â”‚
â”‚  â”‚  - Round 2: Concerns & Cross-examination          â”‚  â”‚
â”‚  â”‚  - Round 3: Validation & Agreement                â”‚  â”‚
â”‚  â”‚  - Consensus Calculation                          â”‚  â”‚
â”‚  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜  â”‚
â”‚  â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”  â”‚
â”‚  â”‚  State Machine                                     â”‚  â”‚
â”‚  â”‚  - Conversation History                           â”‚  â”‚
â”‚  â”‚  - Metrics Tracking                               â”‚  â”‚
â”‚  â”‚  - Error Recovery                                 â”‚  â”‚
â”‚  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜  â”‚
â””â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
     â”‚              â”‚              â”‚
â”Œâ”€â”€â”€â”€â–¼â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â–¼â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â–¼â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚                  AGENT LAYER                              â”‚
â”‚  â”Œâ”€â”€â”€â”€â”€â”€â” â”Œâ”€â”€â”€â”€â”€â”€â” â”Œâ”€â”€â”€â”€â”€â”€â” â”Œâ”€â”€â”€â”€â”€â”€â” â”Œâ”€â”€â”€â”€â”€â”€â”           â”‚
â”‚  â”‚ BA   â”‚ â”‚ DA   â”‚ â”‚ DR   â”‚ â”‚ SA   â”‚ â”‚ QA   â”‚           â”‚
â”‚  â”‚ ðŸŽ¯   â”‚ â”‚ ðŸ‘¨â€ðŸ’»   â”‚ â”‚ ðŸ”   â”‚ â”‚ ðŸ›ï¸   â”‚ â”‚ ðŸ§ª   â”‚           â”‚
â”‚  â””â”€â”€â”¬â”€â”€â”€â”˜ â””â”€â”€â”¬â”€â”€â”€â”˜ â””â”€â”€â”¬â”€â”€â”€â”˜ â””â”€â”€â”¬â”€â”€â”€â”˜ â””â”€â”€â”¬â”€â”€â”€â”˜           â”‚
â”‚     â”‚        â”‚        â”‚        â”‚        â”‚                â”‚
â”‚     â””â”€â”€â”€â”€â”€â”€â”€â”€â”¼â”€â”€â”€â”€â”€â”€â”€â”€â”¼â”€â”€â”€â”€â”€â”€â”€â”€â”¼â”€â”€â”€â”€â”€â”€â”€â”€â”˜                â”‚
â”‚              â”‚        â”‚        â”‚                         â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¼â”€â”€â”€â”€â”€â”€â”€â”€â”¼â”€â”€â”€â”€â”€â”€â”€â”€â”¼â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
               â”‚        â”‚        â”‚
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â–¼â”€â”€â”€â”€â”€â”€â”€â”€â–¼â”€â”€â”€â”€â”€â”€â”€â”€â–¼â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚                  LLM LAYER                                â”‚
â”‚  â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”   â”‚
â”‚  â”‚ Anthropic  â”‚ OpenAI     â”‚ Google Gemini          â”‚   â”‚
â”‚  â”‚ Claude     â”‚ GPT-4      â”‚ Gemini Pro             â”‚   â”‚
â”‚  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”´â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”´â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜   â”‚
â”‚  â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”     â”‚
â”‚  â”‚ Token Manager                                  â”‚     â”‚
â”‚  â”‚ - Token Counting                               â”‚     â”‚
â”‚  â”‚ - Cost Estimation                              â”‚     â”‚
â”‚  â”‚ - Rate Limiting                                â”‚     â”‚
â”‚  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜     â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
               â”‚
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â–¼â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚              STORAGE & SERVICES LAYER                     â”‚
â”‚  â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â” â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”  â”‚
â”‚  â”‚ Git Service      â”‚ â”‚ Vector Store Service (RAG)   â”‚  â”‚
â”‚  â”‚ - Commit Fetch   â”‚ â”‚ - Embeddings                 â”‚  â”‚
â”‚  â”‚ - Diff Parsing   â”‚ â”‚ - Semantic Search            â”‚  â”‚
â”‚  â”‚ - Metadata       â”‚ â”‚ - Chunking Strategy          â”‚  â”‚
â”‚  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜ â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜  â”‚
â”‚  â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”   â”‚
â”‚  â”‚ Evaluation Service                               â”‚   â”‚
â”‚  â”‚ - Result Persistence                             â”‚   â”‚
â”‚  â”‚ - Batch Management                               â”‚   â”‚
â”‚  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜   â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
               â”‚
               â–¼
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚            OUTPUT GENERATION LAYER                       â”‚
â”‚  â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”         â”‚
â”‚  â”‚ HTML Report  â”‚ JSON         â”‚ Markdown     â”‚         â”‚
â”‚  â”‚ Formatter    â”‚ Formatter    â”‚ Formatter    â”‚         â”‚
â”‚  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”´â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”´â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜         â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
```

---

## Technology Stack

### Runtime & Language

- **Node.js**: 18.0.0+
- **TypeScript**: 5.3.3+
- **Runtime**: CommonJS modules

### Core Dependencies

#### AI & LLM Integration

- **LangChain** (v0.3.36): Chain and agent orchestration
- **LangGraph** (v0.2.74): State machine and workflow management
- **@langchain/anthropic**: Claude API integration
- **@langchain/openai**: OpenAI API integration
- **@langchain/google-genai**: Google Gemini integration
- **js-tiktoken**: Token counting for OpenAI models

#### CLI & UI

- **Commander.js** (v14.0.2): Command-line framework
- **Inquirer.js** (v8.2.7): Interactive CLI prompts
- **Chalk** (v4.1.2): Terminal color output
- **Ora** (v5.4.1): Spinner/progress indicators
- **cli-progress** (v3.12.0): Progress bars

#### Utilities

- **dotenv** (v17.2.3): Environment variable management

### Development Dependencies

- **TypeScript**: Type system
- **ESLint**: Code linting
- **Prettier**: Code formatting
- **@types/node**: Node.js type definitions

---

## Core Components

### 1. CLI Layer (`cli/`)

Entry point for user interactions. Handles command routing and user-facing logic.

#### Files:

- `cli/index.ts` - Main CLI entry point (Commander setup)
- `cli/commands/evaluate-command.ts` - Single commit evaluation
- `cli/commands/batch-evaluate-command.ts` - Multiple commits
- `cli/commands/config.command.ts` - Configuration management
- `cli/utils/progress-tracker.ts` - Progress UI
- `cli/utils/git-utils.ts` - Git operations (commit diffs, file extraction)
- `cli/utils/diagnostic-filter.ts` - Log filtering for progress display
- `cli/utils/shared.utils.ts` - CLI utilities

#### Responsibilities:

- Parse command-line arguments
- Display interactive setup wizard
- Manage user configuration
- Display real-time progress
- Format and display results

### 2. Agent Layer (`src/agents/`)

Specialized AI agents with distinct expertise areas.

#### Architecture:

```
BaseAgentWorkflow (Abstract)
  â”œâ”€â”€ BusinessAnalystAgent
  â”œâ”€â”€ DeveloperAuthorAgent
  â”œâ”€â”€ DeveloperReviewerAgent
  â”œâ”€â”€ SeniorArchitectAgent
  â””â”€â”€ QAEngineerAgent
```

#### Key Classes:

**BaseAgentWorkflow**

```typescript
abstract class BaseAgentWorkflow {
  abstract name: string;
  abstract emoji: string;
  abstract role: string;
  abstract metrics: string[];

  async assessCommit(context: AgentContext): Promise<AgentResponse>;
  async raiseConcerns(context: AgentContext): Promise<AgentResponse>;
  async validateAndAgree(context: AgentContext): Promise<AgentResponse>;

  protected buildPrompt(systemRole: string, context: AgentContext): string;
  protected parseResponse(response: string): AgentResponse;
}
```

#### Workflow:

1. Receive commit context and conversation history
2. Generate specialized prompt based on agent role
3. Call LLM service with prompt
4. Parse structured response
5. Extract metrics and reasoning
6. Return structured agent response

### 3. Orchestration Layer (`src/orchestrator/`)

LangGraph-based workflow coordination for multi-round conversations.

#### Key Component: `Orchestrator`

```typescript
class Orchestrator {
  // Initialize with agents and LLM service
  constructor(agents: Agent[], llmService: LLMService);

  // Execute full evaluation workflow
  async executeEvaluation(
    commitData: CommitData,
    conversationHistory: ConversationTurn[] = [],
  ): Promise<EvaluationResult>;

  // Internal methods for each round
  private round1Independent Assessment(): Promise<AgentResponse[]>;
  private round2CrossExamination(round1Responses: AgentResponse[]): Promise<AgentResponse[]>;
  private round3FinalValidation(
    round1Responses: AgentResponse[],
    round2Responses: AgentResponse[],
  ): Promise<AgentResponse[]>;

  // Calculate consensus from all responses
  private calculateConsensus(allResponses: AgentResponse[][]): ConsensusData;
}
```

#### Workflow State Machine:

```
START
  â”‚
  â”œâ”€â–º ROUND_1_ASSESSMENT
  â”‚   â””â”€â–º All agents assess independently
  â”‚       State: { round: 1, responses: AgentResponse[] }
  â”‚
  â”œâ”€â–º ROUND_2_CROSS_EXAMINATION
  â”‚   â””â”€â–º Agents respond to each other's concerns
  â”‚       State: { round: 2, responses: AgentResponse[] }
  â”‚
  â”œâ”€â–º ROUND_3_FINAL_VALIDATION
  â”‚   â””â”€â–º Agents finalize positions
  â”‚       State: { round: 3, responses: AgentResponse[] }
  â”‚
  â”œâ”€â–º CONSENSUS_CALCULATION
  â”‚   â””â”€â–º Calculate final metrics and consensus
  â”‚       State: { consensus: ConsensusData, metrics: EvaluationMetrics }
  â”‚
  â””â”€â–º COMPLETE
      Result: EvaluationResult
```

### 4. LLM Service Layer (`src/llm/`)

Multi-provider LLM abstraction.

#### Key Classes:

**LLMService (Interface)**

```typescript
interface LLMService {
  generateMessage(
    systemPrompt: string,
    userMessage: string,
    options?: GenerateOptions
  ): Promise<string>;

  countTokens(text: string): Promise<number>;
  estimateCost(tokensUsed: number): Promise<number>;
}
```

**Provider Implementations**:

- `AnthropicLLMService` - Claude API
- `OpenAILLMService` - GPT-4, GPT-4 Turbo
- `GoogleLLMService` - Gemini

#### Token Management (`TokenManager`):

```typescript
class TokenManager {
  countTokens(text: string, model: string): number;
  estimateCost(tokensUsed: number, model: string): number;
  trackUsage(request: string, response: string): void;
  getSummary(): TokenUsageSummary;
}
```

### 5. Storage & Services Layer

#### Git Service

```typescript
class CommitService {
  getCommit(hash: string): Promise<CommitData>;
  getCommitRange(since: string, until: string): Promise<CommitData[]>;
  getDiff(hash: string): Promise<string>;
}
```

#### Vector Store Service (RAG)

```typescript
class VectorStoreService {
  addDocuments(texts: string[], metadata: Record<string, any>): Promise<void>;
  similaritySearch(query: string, k?: number): Promise<string[]>;
  clear(): Promise<void>;
}
```

#### Evaluation Service

```typescript
class EvaluationService {
  saveEvaluation(result: EvaluationResult): Promise<string>;
  loadEvaluation(id: string): Promise<EvaluationResult>;
  listEvaluations(): Promise<EvaluationResult[]>;
}
```

### 6. Output Generation Layer (`src/formatters/`)

#### Formatters:

**HTMLReportFormatterEnhanced**

- Generates interactive HTML reports
- Timeline visualization
- Agent role identification
- Metric evolution display
- Bootstrap-based responsive design

**JSONFormatter**

- Structured data export
- Schema-validated output
- Complete conversation history

**MarkdownFormatter**

- Human-readable transcripts
- Suitable for documentation
- Git-compatible format

---

## Data Flow

### Evaluation Flow (High-Level)

```
User Input
  â”‚
  â–¼
Parse Arguments & Config
  â”‚
  â–¼
Fetch Commit from Git
  â”‚
  â”œâ”€â–º Determine if Large Diff
  â”‚   â”œâ”€â–º If < 100KB: Process normally
  â”‚   â””â”€â–º If > 100KB: Initialize RAG
  â”‚
  â–¼
Orchestrator.executeEvaluation()
  â”‚
  â”œâ”€â–º Round 1: All agents assess independently
  â”‚   â”œâ”€â–º Business Analyst â†’ Functional Impact, Ideal Time
  â”‚   â”œâ”€â–º Developer Author â†’ Actual Time
  â”‚   â”œâ”€â–º Developer Reviewer â†’ Code Quality
  â”‚   â”œâ”€â–º Senior Architect â†’ Complexity, Technical Debt
  â”‚   â””â”€â–º QA Engineer â†’ Test Coverage
  â”‚
  â”œâ”€â–º Round 2: Cross-examination with concerns
  â”‚   â””â”€â–º All agents respond to concerns from Round 1
  â”‚
  â”œâ”€â–º Round 3: Final consensus positions
  â”‚   â””â”€â–º All agents finalize scores and recommendations
  â”‚
  â”œâ”€â–º Calculate Consensus
  â”‚   â”œâ”€â–º Weighted averaging of metrics
  â”‚   â”œâ”€â–º Confidence level calculation
  â”‚   â”œâ”€â–º Top concerns extraction
  â”‚   â””â”€â–º Recommendations synthesis
  â”‚
  â–¼
Generate Output
  â”œâ”€â–º HTML Report (interactive)
  â”œâ”€â–º JSON Results (structured data)
  â”œâ”€â–º Markdown Transcript (documentation)
  â”œâ”€â–º Text Summary (quick reference)
  â””â”€â–º Archive Original Diff
  â”‚
  â–¼
Save to Output Directory
  â”‚
  â–¼
Display Results to User
```

### Batch Evaluation Flow

```
User Input (count, date range, branch)
  â”‚
  â–¼
Fetch Commit List from Git
  â”‚
  â–¼
Initialize Progress Tracker
  â”‚
  â”œâ”€â–º Split into parallel queues (default: 3)
  â”‚
  â”œâ”€â–º For Each Queue:
  â”‚   â””â”€â–º While Commits Remaining:
  â”‚       â”œâ”€â–º Evaluate commit (same as single flow)
  â”‚       â”œâ”€â–º Update progress bar
  â”‚       â”œâ”€â–º Handle errors (skip or halt)
  â”‚       â””â”€â–º Track metrics (quality, coverage, cost)
  â”‚
  â–¼
Generate Summary Report
  â”œâ”€â–º Statistics (avg quality, coverage, time)
  â”œâ”€â–º Cost analysis
  â”œâ”€â–º Error log
  â””â”€â–º Individual results list
  â”‚
  â–¼
Display Summary to User
```

---

## Multi-Agent Orchestration

### Execution Model

CodeWave uses a **round-robin discussion model** with shared context:

#### State Representation

```typescript
interface ConversationState {
  round: 1 | 2 | 3;
  commit: CommitData;
  agentResponses: Map<AgentName, AgentResponse[]>; // Round history
  sharedContext: {
    conversationHistory: ConversationTurn[];
    previousConcerns: string[];
    emergingConsensus: Partial<EvaluationMetrics>;
  };
}
```

#### Round Execution

```typescript
async function executeRound(
  round: 1 | 2 | 3,
  state: ConversationState
): Promise<ConversationState> {
  const roundPromises = agents.map((agent) => {
    const prompt = buildPrompt(agent, round, state);
    return agent.respond(prompt, state);
  });

  const responses = await Promise.all(roundPromises);

  return {
    ...state,
    round: round + 1,
    agentResponses: updateResponses(state.agentResponses, responses),
  };
}
```

### Agent Context Management

Each agent receives context including:

1. **Commit Data**: Files, changes, metadata
2. **Previous Responses**: What other agents said
3. **Conversation History**: Full transcript
4. **Shared Metrics**: Emerging consensus
5. **Agent Role**: Their specific responsibility

---

## Developer Overview Generation

### Architecture

Developer Overview runs as the **first node** in the LangGraph workflow, before any agent evaluation:

```
Commit Input
  â”‚
  â–¼
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚ Developer Overview Generator â”‚ â—„â”€â”€â”€ First Node
â”‚  â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â” â”‚
â”‚  â”‚ - Extract key changes   â”‚ â”‚
â”‚  â”‚ - Identify file purposesâ”‚ â”‚
â”‚  â”‚ - Generate summary      â”‚ â”‚
â”‚  â”‚ - Format for readabilityâ”‚ â”‚
â”‚  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜ â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
  â”‚
  â”œâ”€â–º Stored in State (all agents access)
  â”‚
  â–¼
Agents Begin Evaluation (Round 1)
```

### Implementation

**Location**: `src/orchestrator/commit-evaluation-graph.ts`

```typescript
// First node in graph
const generateDeveloperOverview = async (state: GraphState) => {
  console.log('ðŸ“ Generating developer overview from commit diff...');

  const overview = await developerOverviewGenerator.generate(
    state.commitDiff,
    state.commitMetadata
  );

  console.log(`âœ… Developer overview generated (${overview.length} chars)`);

  return {
    ...state,
    developerOverview: overview,
  };
};

// Add to graph
graph.addNode('generateDeveloperOverview', generateDeveloperOverview);
graph.setEntryPoint('generateDeveloperOverview');
graph.addEdge('generateDeveloperOverview', 'round1Agents');
```

### Benefits

1. **Shared Context**: All agents see same overview
2. **Consistency**: Same summary regardless of agent disagreement
3. **Token Efficiency**: Overview reduces needed context
4. **Debugging**: Clear record of what was analyzed
5. **Documentation**: Auto-generated change summary

### Error Handling

If generation fails:

- Empty overview provided to agents
- Agents evaluate using raw diff
- Report shows placeholder message
- Evaluation continues without blocking

---

## Convergence Detection Algorithm

### Purpose

Measure how much agents agree and optimize evaluation rounds.

### Implementation

**Location**: `src/orchestrator/convergence-calculator.ts`

```typescript
interface ConvergenceMetrics {
  perMetric: {
    [metric: string]: number; // 0-1, lower variance = higher consensus
  };
  weighted: number; // Final convergence score
  targetMet: boolean; // Did we reach target?
  shouldContinue: boolean; // Continue to next round?
}

class ConvergenceCalculator {
  calculate(
    round1Responses: AgentResponse[],
    round2Responses: AgentResponse[],
    round3Responses?: AgentResponse[]
  ): ConvergenceMetrics {
    // 1. Calculate metric variance for each pillar
    // 2. Apply weights (quality and coverage are 2x weight)
    // 3. Compare to target threshold (0.75)
    // 4. Determine if consensus reached or should continue
  }
}
```

### Algorithm Steps

**Step 1: Extract Final Scores for Each Metric**

```
Code Quality scores: [7, 7, 8, 6, 7]
Test Coverage scores: [6, 5, 7, 5, 6]
... (for all 7 pillars)
```

**Step 2: Calculate Variance per Metric**

```
StdDev(Code Quality) = 0.6 â†’ Normalized = 0.15 (low variance = high agreement)
StdDev(Test Coverage) = 0.8 â†’ Normalized = 0.20
... (aggregate remaining metrics)
```

**Step 3: Apply Weights**

```
Weighted Convergence = 1.0 - (
  0.15 * 2.0 (quality weight) +
  0.20 * 2.0 (coverage weight) +
  ... (other metrics with 1x weight)
) / total_weight
```

**Step 4: Compare to Target & Decide**

```
if (convergenceScore >= 0.75) {
  return { shouldContinue: false, targetMet: true };
} else if (currentRound < 3) {
  return { shouldContinue: true, targetMet: false };
} else {
  return { shouldContinue: false, targetMet: false };
}
```

### Convergence Thresholds

```
0.9+:  Excellent consensus, very reliable evaluation
0.7-0.8: Good consensus, minor disagreements acceptable
0.5-0.6: Moderate agreement, review disagreements
<0.5:   Low consensus, significant debate ongoing
```

### Round Continuation Logic

```
Round 1 Output â†’ Calculate Convergence
  â”‚
  â”œâ”€ If >= 0.75: STOP âœ“ (High confidence)
  â””â”€ If < 0.75:  Continue to Round 2

Round 2 Output â†’ Calculate Convergence
  â”‚
  â”œâ”€ If >= 0.75: STOP âœ“ (Good agreement reached)
  â”œâ”€ If improved but < 0.75: Continue to Round 3
  â””â”€ If no improvement: STOP (Max rounds reached)

Round 3 Output â†’ Final Convergence
  â”‚
  â””â”€â–º STOP (Always stop after Round 3)
```

### Storage in History

Each evaluation stores convergence:

```json
{
  "evaluationNumber": 7,
  "timestamp": "2025-11-08T22:58:27.689Z",
  "convergenceScore": 0.51,
  "metrics": { ... },
  "rounds": {
    "round1": {
      "convergence": 0.45,
      "shouldContinue": true
    },
    "round2": {
      "convergence": 0.62,
      "shouldContinue": true
    },
    "round3": {
      "convergence": 0.51,
      "shouldContinue": false
    }
  }
}
```

---

## LLM Integration

### Multi-Provider Pattern

```typescript
interface LLMProvider {
  name: string;
  models: ModelConfig[];
  generateMessage(prompt: string): Promise<string>;
  countTokens(text: string): Promise<number>;
}

class LLMFactory {
  static createProvider(config: LLMConfig): LLMProvider {
    switch (config.provider) {
      case 'anthropic':
        return new AnthropicProvider(config);
      case 'openai':
        return new OpenAIProvider(config);
      case 'google':
        return new GoogleProvider(config);
    }
  }
}
```

### Token Counting Strategy

Different models have different token counting:

- **Claude**: Uses js-tiktoken or Claude API token count
- **GPT-4**: Uses js-tiktoken
- **Gemini**: Uses Gemini API token count

Each call is tracked:

```typescript
interface TokenTrack {
  requestTokens: number;
  responseTokens: number;
  totalTokens: number;
  model: string;
  timestamp: Date;
}
```

### Cost Estimation

```typescript
const costModel = {
  'claude-3-5-sonnet-20241022': {
    input: 0.003 / 1000, // $0.003 per 1K tokens
    output: 0.015 / 1000, // $0.015 per 1K tokens
  },
  'gpt-4o': {
    input: 0.015 / 1000,
    output: 0.03 / 1000,
  },
  'gemini-2.0-flash': {
    input: 0.075 / 1000,
    output: 0.3 / 1000,
  },
};

cost = inputTokens * costModel.input + outputTokens * costModel.output;
```

---

## RAG System

### Activation Strategy

```typescript
if (diffSize > ragThreshold) {
  // Use RAG for large diffs
  initialize RagEvaluationWorkflow;
} else {
  // Use standard evaluation
  initialize StandardEvaluationWorkflow;
}
```

### RAG Process

1. **Chunking**
   - Split large diff into semantic chunks
   - Default chunk size: 2000 characters
   - Preserve file and hunk boundaries

2. **Embedding**
   - Generate vector embeddings using local model
   - Store in memory vector store

3. **Retrieval**
   - Agents query most relevant chunks
   - Retrieves top-k chunks per query
   - Provides context window of relevant changes

4. **Processing**
   - Agents work with subset of diff
   - Reduced token count
   - Faster evaluation

---

## Output Generation

### HTML Report Structure

```html
<!DOCTYPE html>
<html>
  <head>
    <!-- Bootstrap CSS -->
    <!-- Custom styles -->
  </head>
  <body>
    <header>
      <!-- Commit metadata -->
      <!-- Overall quality score -->
    </header>

    <main>
      <!-- Metrics cards -->
      <!-- Agent profiles -->
      <!-- Round-by-round timeline -->
      <!-- Concerns and recommendations -->
    </main>

    <aside>
      <!-- Conversation transcript -->
      <!-- Full metrics table -->
    </aside>
  </body>
</html>
```

### JSON Structure

```typescript
interface EvaluationResultJSON {
  metadata: {
    evaluationId: string;
    timestamp: string;
    version: string;
  };
  commit: CommitMetadata;
  metrics: EvaluationMetrics;
  rounds: EvaluationRound[];
  consensus: ConsensusData;
  conversation: ConversationTurn[];
}
```

---

## State Management

### Orchestrator State Machine (LangGraph)

```
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚    START        â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”˜
         â”‚
         â–¼
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚  INITIALIZE_STATE                   â”‚
â”‚  - Load commit data                 â”‚
â”‚  - Setup RAG if needed              â”‚
â”‚  - Initialize conversation history  â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
         â”‚
         â–¼
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚  ROUND_1_INDEPENDENT_ASSESSMENT     â”‚
â”‚  - Run all agents in parallel       â”‚
â”‚  - Collect initial responses        â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
         â”‚
         â–¼
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚  ROUND_2_CONCERNS                   â”‚
â”‚  - Pass Round 1 to all agents       â”‚
â”‚  - Collect concerns and updates     â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
         â”‚
         â–¼
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚  ROUND_3_FINAL_VALIDATION           â”‚
â”‚  - Pass all history to agents       â”‚
â”‚  - Collect final positions          â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
         â”‚
         â–¼
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚  CALCULATE_CONSENSUS                â”‚
â”‚  - Weight all responses             â”‚
â”‚  - Calculate final metrics          â”‚
â”‚  - Extract themes and concerns      â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
         â”‚
         â–¼
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚  GENERATE_OUTPUT                    â”‚
â”‚  - Format all output types          â”‚
â”‚  - Save to filesystem               â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
         â”‚
         â–¼
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚     COMPLETE    â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
```

### Error Recovery

```typescript
try {
  result = await evaluateCommit(commit);
} catch (error) {
  if (isRetryable(error)) {
    if (retryCount < maxRetries) {
      retryCount++;
      await delay(exponentialBackoff(retryCount));
      return evaluateCommit(commit); // Retry
    }
  }

  if (skipErrors) {
    return { error: error.message, commit };
  } else {
    throw error; // Halt execution
  }
}
```

---

## Error Handling

### Error Categories

**Recoverable Errors** (retry or skip):

- Network timeouts
- Rate limiting (retry with backoff)
- Temporary API failures

**Non-Recoverable Errors** (halt or skip):

- Invalid commit hash
- Authentication failures
- Corrupted diff data

**Warnings** (continue with caution):

- Large diffs requiring RAG
- Unusual complexity patterns
- High divergence between agents

### Error Workflow

```
Error Occurs
  â”‚
  â”œâ”€â–º Classify error type
  â”‚   â”œâ”€â–º Recoverable
  â”‚   â”œâ”€â–º Non-recoverable
  â”‚   â””â”€â–º Warning
  â”‚
  â”œâ”€â–º If Recoverable:
  â”‚   â”œâ”€â–º Retry with backoff
  â”‚   â””â”€â–º Increment retry counter
  â”‚
  â”œâ”€â–º If Non-Recoverable:
  â”‚   â”œâ”€â–º Log error
  â”‚   â”œâ”€â–º If batch: skip commit (if skipErrors=true)
  â”‚   â””â”€â–º If single: throw error
  â”‚
  â”œâ”€â–º If Warning:
  â”‚   â”œâ”€â–º Log warning
  â”‚   â”œâ”€â–º Continue evaluation
  â”‚   â””â”€â–º Flag in results
  â”‚
  â–¼
Continue Processing
```

---

## Performance Considerations

### Optimization Strategies

1. **Parallel Agent Execution**
   - Round 1: All agents assess simultaneously
   - Reduces total evaluation time

2. **Token Optimization**
   - RAG reduces tokens for large commits
   - Summarization of agent responses

3. **Caching**
   - Cache agent responses for identical commits
   - Reuse embeddings for similar diffs

4. **Batch Efficiency**
   - Process multiple commits in parallel (default: 3)
   - Configurable parallelization

### Performance Metrics

- **Single Commit**: 2-5 seconds average
- **100 Commits**: 3-8 minutes (with parallelization)
- **Token Usage**: 3,000-5,000 per commit
- **Cost**: ~$0.015-0.030 per commit

---

For more information:

- [README.md](../README.md) - Main documentation
- [AGENTS.md](./AGENTS.md) - Agent specifications
- [API.md](./API.md) - Programmatic API
