import * as fs from 'fs';
import * as path from 'path';
import inquirer from 'inquirer';
import chalk from 'chalk';

const CONFIG_FILE = '.codewave.config.json';

const DEFAULT_CONFIG = {
  apiKeys: {
    anthropic: '',
    openai: '',
    google: '',
    xai: '',
  },
  llm: {
    provider: 'anthropic',
    model: 'claude-haiku-4-5-20251001', // Cost-optimized for multi-agent discussion (6x cheaper than Sonnet)
    temperature: 0.2,
    maxTokens: 16000, // Increased to 16000 for all models - prevents truncation and JSON parsing errors
  },
  agents: {
    // Enabled agents: business-analyst, sdet, developer-author, senior-architect, developer-reviewer
    // Remove agents from this list to disable them (e.g., for faster evaluation)
    enabled: [
      'business-analyst',
      'sdet',
      'developer-author',
      'senior-architect',
      'developer-reviewer',
    ],
    retries: 3, // Max discussion rounds (for backwards compatibility, overridden by maxRounds if set)
    timeout: 300000, // 5 minutes per agent
    minRounds: 2, // Minimum 2 rounds before allowing early convergence stop
    maxRounds: 3, // Maximum 3 rounds: Initial → Concerns → Validation
    clarityThreshold: 0.85, // Stop early if 85% similarity between rounds (only after minRounds)
  },
  output: {
    directory: '.',
    format: 'json',
    generateHtml: true, // Also generate report.html and index.html
  },
  tracing: {
    enabled: false,
    apiKey: '',
    project: 'codewave',
    endpoint: 'https://api.smith.langchain.com',
  },
};

/**
 * Find existing config file in root directory only
 */
function findConfigPath(): string | null {
  const rootConfig = path.join(process.cwd(), CONFIG_FILE);

  if (fs.existsSync(rootConfig)) {
    return rootConfig;
  }
  return null;
}

/**
 * Initialize config with interactive prompts
 */
async function initializeConfig(): Promise<void> {
  console.log(chalk.cyan('\n🚀 Welcome to Commit Evaluator Setup!\n'));

  // Always create config in root directory
  const configPath = path.join(process.cwd(), CONFIG_FILE);
  console.log(chalk.gray(`Creating configuration in: ${CONFIG_FILE}\n`));

  // Check if config already exists and preserve existing values
  let existingConfig: any = null;
  if (fs.existsSync(configPath)) {
    const { shouldOverwrite } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'shouldOverwrite',
        message: 'Config already exists. Overwrite?',
        default: false,
      },
    ]);

    if (!shouldOverwrite) {
      console.log(chalk.yellow('Setup cancelled.'));
      return;
    }

    // Read and preserve existing configuration
    try {
      existingConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      console.log(chalk.gray('ℹ️  Loading existing configuration as defaults...\n'));
    } catch (error) {
      console.log(chalk.yellow('⚠️  Could not read existing config, starting with defaults.\n'));
    }
  }

  // Start with default config and merge with existing values
  const config = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
  if (existingConfig) {
    // Merge existing values to use as defaults
    if (existingConfig.apiKeys) {
      config.apiKeys = { ...config.apiKeys, ...existingConfig.apiKeys };
    }
    if (existingConfig.llm) {
      config.llm = { ...config.llm, ...existingConfig.llm };
    }
    if (existingConfig.agents) {
      config.agents = { ...config.agents, ...existingConfig.agents };
    }
    if (existingConfig.output) {
      config.output = { ...config.output, ...existingConfig.output };
    }
    if (existingConfig.tracing) {
      config.tracing = { ...config.tracing, ...existingConfig.tracing };
    }
  }

  // Interactive API key setup - MANDATORY
  console.log(chalk.cyan('📋 LLM Provider Selection (REQUIRED)\n'));

  // Use existing provider as default, or first choice if none exists
  const defaultProvider = config.llm.provider || 'anthropic';
  const { provider } = await inquirer.prompt([
    {
      type: 'list',
      name: 'provider',
      message: 'Choose your LLM provider:',
      choices: [
        {
          name: 'Anthropic Claude (recommended) - Best quality and accuracy',
          value: 'anthropic',
          short: 'Anthropic',
        },
        {
          name: 'OpenAI GPT - Latest and most powerful',
          value: 'openai',
          short: 'OpenAI',
        },
        {
          name: 'Google Gemini - Strong reasoning and large context',
          value: 'google',
          short: 'Google',
        },
        {
          name: 'xAI Grok - Real-time insights and unique perspective',
          value: 'xai',
          short: 'xAI',
        },
      ],
      default: defaultProvider,
    },
  ]);

  // Provider-specific configuration with available models
  const providerInfo = {
    anthropic: {
      defaultModel: 'claude-haiku-4-5-20251001',
      models: [
        {
          name: 'claude-haiku-4-5-20251001 (recommended) - Cost-optimized for multi-agent discussion (ultra-fast)',
          value: 'claude-haiku-4-5-20251001',
        },
        {
          name: 'claude-sonnet-4-5-20250929 - Latest generation (best quality)',
          value: 'claude-sonnet-4-5-20250929',
        },
        {
          name: 'claude-opus-4-1-20250805 - Most powerful (maximum accuracy)',
          value: 'claude-opus-4-1-20250805',
        },
      ],
      keyFormat: 'sk-ant-...',
      url: 'https://console.anthropic.com/',
    },
    openai: {
      defaultModel: 'gpt-4o-mini',
      models: [
        { name: 'gpt-4o-mini (recommended) - Fast and cost-effective', value: 'gpt-4o-mini' },
        { name: 'gpt-4o - Latest multimodal model', value: 'gpt-4o' },
        { name: 'o3-mini - Advanced reasoning (cost-efficient)', value: 'o3-mini-2025-01-31' },
        { name: 'o3 - Most powerful reasoning model', value: 'o3' },
      ],
      keyFormat: 'sk-...',
      url: 'https://platform.openai.com/',
    },
    google: {
      defaultModel: 'gemini-2.5-flash',
      models: [
        {
          name: 'gemini-2.5-flash (recommended) - Best cost-performance ratio',
          value: 'gemini-2.5-flash',
        },
        {
          name: 'gemini-2.5-flash-lite - Fastest and most efficient',
          value: 'gemini-2.5-flash-lite',
        },
        { name: 'gemini-2.5-pro - Best reasoning capabilities', value: 'gemini-2.5-pro' },
      ],
      keyFormat: 'AIza...',
      url: 'https://ai.google.dev/',
    },
    xai: {
      defaultModel: 'grok-4-fast-non-reasoning',
      models: [
        {
          name: 'grok-4-fast-non-reasoning (recommended) - Latest with 40% fewer tokens',
          value: 'grok-4-fast-non-reasoning',
        },
        { name: 'grok-4.2 - Polished and refined', value: 'grok-4.2' },
        { name: 'grok-4 - Advanced reasoning model', value: 'grok-4-0709' },
      ],
      keyFormat: 'xai-...',
      url: 'https://console.x.ai/',
    },
  };

  const info = providerInfo[provider as keyof typeof providerInfo];

  // Select model for the chosen provider
  console.log(chalk.cyan(`\n🎯 Available ${provider} models:\n`));
  console.log(
    chalk.gray('💡 CodeWave uses multi-agent discussion (3 rounds) to refine evaluations.')
  );
  console.log(
    chalk.gray('   Cheaper models like Haiku achieve 95%+ quality through discussion refinement.\n')
  );

  // Use existing model as default if it's valid for this provider, otherwise use provider default
  let defaultModel = info.defaultModel;
  if (config.llm.model && info.models.some((m) => m.value === config.llm.model)) {
    defaultModel = config.llm.model;
  }

  const { selectedModel } = await inquirer.prompt([
    {
      type: 'list',
      name: 'selectedModel',
      message: `Choose ${provider} model:`,
      choices: info.models,
      default: defaultModel,
    },
  ]);

  // Show cost comparison for selected provider
  const costByProvider = {
    anthropic: {
      'claude-haiku-4-5-20251001': '$0.025/commit',
      'claude-sonnet-4-5-20250929': '$0.15/commit',
      'claude-opus-4-1-20250805': '$0.40/commit',
    },
    openai: {
      'gpt-4o-mini': '$0.008/commit',
      'gpt-4o': '$0.10/commit',
      'o3-mini-2025-01-31': '$0.20/commit',
      o3: '$0.40/commit',
    },
    google: {
      'gemini-2.5-flash': '$0.010/commit',
      'gemini-2.5-flash-lite': '$0.006/commit',
      'gemini-2.5-pro': '$0.06/commit',
    },
    xai: {
      'grok-4-fast-non-reasoning': '$0.08/commit',
      'grok-4.2': '$0.08/commit',
      'grok-4-0709': '$0.08/commit',
    },
  };

  const providerCosts = costByProvider[provider as keyof typeof costByProvider];
  if (providerCosts) {
    const cost = providerCosts[selectedModel as keyof typeof providerCosts];
    if (cost) {
      console.log(chalk.gray(`\n✓ Selected: ${selectedModel}`));
      console.log(chalk.gray(`   Cost: ${cost} (estimated for 3-round multi-agent discussion)`));
    }
  }

  // Prompt for API key with validation
  console.log(chalk.gray(`\nGet your API key at: ${info.url}\n`));

  const existingApiKey = config.apiKeys[provider];
  const apiKeyPromptMessage = existingApiKey
    ? `Enter ${provider} API key (${info.keyFormat}) [press Enter to keep existing]:`
    : `Enter ${provider} API key (${info.keyFormat}):`;

  const { apiKey } = await inquirer.prompt([
    {
      type: 'password',
      name: 'apiKey',
      message: apiKeyPromptMessage,
      validate: (input: string) => {
        // If user pressed Enter and there's an existing key, that's valid
        if (!input || input.trim().length === 0) {
          if (existingApiKey) {
            return true;
          }
          return 'API key is required';
        }
        return true;
      },
      mask: '*',
    },
  ]);

  // Configure provider - use new key if provided, otherwise keep existing
  if (apiKey && apiKey.trim().length > 0) {
    config.apiKeys[provider] = apiKey.trim();
  }
  config.llm.provider = provider;
  config.llm.model = selectedModel;

  console.log(chalk.green(`\n✅ Configured to use: ${provider} (${selectedModel})`));

  // LangSmith tracing setup (optional)
  console.log(chalk.cyan('\n\n🔍 LangSmith Tracing Configuration (OPTIONAL)\n'));

  const defaultTracingEnabled = config.tracing.enabled || false;
  const { enableTracing } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'enableTracing',
      message: 'Enable LangSmith tracing for debugging?',
      default: defaultTracingEnabled,
    },
  ]);

  if (enableTracing) {
    const tracingAnswers = await inquirer.prompt([
      {
        type: 'password',
        name: 'langchainKey',
        message: 'Enter LangSmith API key (lsv2_pt_...) [press Enter to keep existing]:',
        mask: '*',
      },
      {
        type: 'input',
        name: 'projectName',
        message: 'Enter LangSmith project name:',
        default: config.tracing.project || 'codewave',
      },
    ]);

    config.tracing.enabled = true;
    if (tracingAnswers.langchainKey.trim()) {
      config.tracing.apiKey = tracingAnswers.langchainKey.trim();
    }
    if (tracingAnswers.projectName.trim()) {
      config.tracing.project = tracingAnswers.projectName.trim();
    }

    console.log(chalk.green(`✅ LangSmith tracing enabled for project: ${config.tracing.project}`));
  } else {
    console.log(
      chalk.gray(
        '   Skipped - you can enable it later with: codewave config --set tracing.enabled=true'
      )
    );
  }

  // Save configuration
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  console.log(chalk.green(`\n✅ Created ${path.relative(process.cwd(), configPath)}`));

  // Suggest adding config and evaluation results to .gitignore
  const gitignorePath = path.join(process.cwd(), '.gitignore');
  let shouldAddGitignore = false;
  if (fs.existsSync(gitignorePath)) {
    const gitignoreContent = fs.readFileSync(gitignorePath, 'utf-8');
    const needsConfigEntry = !gitignoreContent.includes('.codewave.config.json');
    const needsEvaluationEntry = !gitignoreContent.includes('.evaluated-commits');

    if (needsConfigEntry || needsEvaluationEntry) {
      const { addToGitignore } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'addToGitignore',
          message:
            'Add CodeWave files to .gitignore? (recommended - contains API keys and evaluation results)',
          default: true,
        },
      ]);
      shouldAddGitignore = addToGitignore;
    }
  }

  if (shouldAddGitignore) {
    let entriesAdded = false;
    let gitignoreContent = fs.existsSync(gitignorePath)
      ? fs.readFileSync(gitignorePath, 'utf-8')
      : '';

    // Add .codewave.config.json if not present
    if (!gitignoreContent.includes('.codewave.config.json')) {
      fs.appendFileSync(
        gitignorePath,
        '\n# CodeWave configuration (contains API keys)\n.codewave.config.json\n'
      );
      entriesAdded = true;
    }

    // Add .evaluated-commits if not present
    if (!gitignoreContent.includes('.evaluated-commits')) {
      fs.appendFileSync(gitignorePath, '\n# CodeWave evaluation results\n.evaluated-commits/\n');
      entriesAdded = true;
    }

    if (entriesAdded) {
      console.log(chalk.green('✅ Added CodeWave files to .gitignore'));
    }
  }

  console.log(chalk.cyan('\n🎉 Setup complete!'));
  console.log(chalk.cyan('\n📝 Configuration Summary:'));
  console.log(chalk.gray(`  • Config file: ${path.relative(process.cwd(), configPath)}`));
  console.log(chalk.gray(`  • LLM Provider: ${config.llm.provider} (${config.llm.model})`));
  console.log(chalk.gray(`  • Tracing: ${config.tracing.enabled ? 'Enabled' : 'Disabled'}`));
  console.log(chalk.cyan('\n💡 Tips:'));
  console.log(chalk.gray('  • Change provider: codewave config --set llm.provider=openai'));
  console.log(chalk.gray('  • Change model: codewave config --set llm.model=gpt-4o'));
  console.log(chalk.gray('  • Update API key: codewave config --set apiKeys.anthropic=sk-ant-...'));
  console.log(chalk.gray('  • View settings: codewave config --list'));
  console.log(chalk.cyan('\nNext steps:'));
  console.log(chalk.gray('  1. Run: codewave evaluate <diff-file>'));
  console.log(chalk.gray('  2. View results in: results.json, report.html\n'));
}

/**
 * List all config values (mask API keys)
 */
function listConfig(): void {
  const configPath = findConfigPath();

  if (!configPath) {
    console.log(chalk.red(`\n❌ ${CONFIG_FILE} not found. Run: codewave config --init\n`));
    process.exit(1);
  }

  let config;
  try {
    config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  } catch (error) {
    console.log(
      chalk.red(
        `\n❌ Failed to parse config file: ${error instanceof Error ? error.message : String(error)}\n`
      )
    );
    process.exit(1);
  }

  // Mask API keys for security
  const maskedConfig = JSON.parse(JSON.stringify(config));
  if (maskedConfig.apiKeys) {
    Object.keys(maskedConfig.apiKeys).forEach((key) => {
      if (maskedConfig.apiKeys[key]) {
        maskedConfig.apiKeys[key] = '***' + maskedConfig.apiKeys[key].slice(-4);
      }
    });
  }
  if (maskedConfig.tracing?.apiKey) {
    maskedConfig.tracing.apiKey = '***' + maskedConfig.tracing.apiKey.slice(-4);
  }

  console.log(chalk.cyan(`\n📋 Configuration (${path.relative(process.cwd(), configPath)}):\n`));
  console.log(JSON.stringify(maskedConfig, null, 2));
  console.log();
}

/**
 * Get specific config value
 */
function getConfigValue(key: string): void {
  const configPath = findConfigPath();

  if (!configPath) {
    console.log(chalk.red(`\n❌ ${CONFIG_FILE} not found. Run: codewave config --init\n`));
    process.exit(1);
  }

  let config;
  try {
    config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  } catch (error) {
    console.log(
      chalk.red(
        `\n❌ Failed to parse config file: ${error instanceof Error ? error.message : String(error)}\n`
      )
    );
    process.exit(1);
  }
  const keys = key.split('.');
  let value: Record<string, unknown> | string = config;

  for (const k of keys) {
    if (value && typeof value === 'object' && k in value) {
      value = value[k] as Record<string, unknown> | string;
    } else {
      console.log(chalk.red(`\n❌ Key not found: ${key}\n`));
      process.exit(1);
    }
  }

  console.log(JSON.stringify(value, null, 2));
}

/**
 * Set config value
 */
function setConfigValue(keyValue: string): void {
  const configPath = findConfigPath();

  if (!configPath) {
    console.log(chalk.red(`\n❌ ${CONFIG_FILE} not found. Run: codewave config --init\n`));
    process.exit(1);
  }

  const [key, ...valueParts] = keyValue.split('=');
  const valueStr = valueParts.join('=');

  if (!key || !valueStr) {
    console.log(chalk.red('\n❌ Invalid format. Use: key=value (e.g., llm.temperature=0.5)\n'));
    process.exit(1);
  }

  let config;
  try {
    config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  } catch (error) {
    console.log(
      chalk.red(
        `\n❌ Failed to parse config file: ${error instanceof Error ? error.message : String(error)}\n`
      )
    );
    process.exit(1);
  }
  const keys = key.split('.');
  let current: Record<string, unknown> = config;

  // Navigate to parent object
  for (let i = 0; i < keys.length - 1; i++) {
    const k = keys[i];
    if (!current[k] || typeof current[k] !== 'object') {
      current[k] = {};
    }
    current = current[k] as Record<string, unknown>;
  }

  // Parse value
  let value: unknown;
  try {
    value = JSON.parse(valueStr);
  } catch {
    value = valueStr;
  }

  // Set value
  current[keys[keys.length - 1]] = value;

  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  console.log(chalk.green(`\n✅ Set ${key} = ${JSON.stringify(value)}`));
  console.log(chalk.gray(`   in ${path.relative(process.cwd(), configPath)}\n`));
}

/**
 * Reset config to defaults
 */
function resetConfig(): void {
  const configPath = findConfigPath();

  if (!configPath) {
    console.log(chalk.red(`\n❌ ${CONFIG_FILE} not found. Run: codewave config --init\n`));
    process.exit(1);
  }

  fs.writeFileSync(configPath, JSON.stringify(DEFAULT_CONFIG, null, 2));
  console.log(chalk.green(`\n✅ Reset ${path.relative(process.cwd(), configPath)} to defaults\n`));
}

/**
 * Run config command
 */
export async function runConfigCommand(args: string[]): Promise<void> {
  const [flag, value] = args;

  try {
    if (flag === '--init') {
      await initializeConfig();
    } else if (flag === '--list') {
      listConfig();
    } else if (flag === '--get' && value) {
      getConfigValue(value);
    } else if (flag === '--set' && value) {
      setConfigValue(value);
    } else if (flag === '--reset') {
      resetConfig();
    } else {
      console.log(chalk.cyan('\nUsage:'));
      console.log(chalk.gray('  codewave config --init                    # Interactive setup'));
      console.log(chalk.gray('  codewave config --list                    # Show all settings'));
      console.log(chalk.gray('  codewave config --get llm.model           # Get specific value'));
      console.log(chalk.gray('  codewave config --set llm.temperature=0.5 # Set value'));
      console.log(chalk.gray('  codewave config --reset                   # Reset to defaults\n'));
    }
  } catch (error) {
    console.log(chalk.red('\n❌ Error:'), error instanceof Error ? error.message : error);
    console.log();
    process.exit(1);
  }
}
