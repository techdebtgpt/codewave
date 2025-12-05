import * as fs from 'fs';
import * as path from 'path';
import inquirer from 'inquirer';
import chalk from 'chalk';
import { getModels } from '../../src/utils/get-models';

const CONFIG_FILE = '.codewave.config.json';

const DEFAULT_CONFIG = {
  apiKeys: {
    anthropic: '',
    openai: '',
    google: '',
    xai: '',
    ollama: '',
    'lm-studio': '',
    groq: '',
  },
  llm: {
    provider: 'anthropic',
    model: 'claude-haiku-4-5-20251001', // Cost-optimized for multi-agent discussion (6x cheaper than Sonnet)
    temperature: 0.2,
    maxTokens: 16000, // Safety ceiling for all depth modes - depth modes control actual usage (2000/4500/8000)
    baseUrl: '', // optional for local models like Ollama
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
        {
          name: 'Ollama (local, free) - Run models like Llama3 and Mistral on your machine',
          value: 'ollama',
          short: 'Ollama',
        },
        {
          name: 'LM Studio (local, free) - OpenAI-compatible local server',
          value: 'lm-studio',
          short: 'LM Studio',
        },
        { name: 'Groq', value: 'groq', short: 'Groq' },
      ],
      default: defaultProvider,
    },
  ]);

  config.llm.provider = provider;

  let apiKey = null;
  if (provider !== 'ollama' && provider !== 'lm-studio') {
    const existingApiKey = config.apiKeys[provider];
    const apiKeyPromptMessage = existingApiKey
      ? `Enter ${provider} API key [press Enter to keep existing]:`
      : `Enter ${provider} API key:`;

    const response = await inquirer.prompt([
      {
        type: 'password',
        name: 'apiKey',
        message: apiKeyPromptMessage,
        validate: (input: string) => {
          if (!input && existingApiKey) return true;
          if (!input && !existingApiKey) return 'API key is required';
          return true;
        },
        mask: '*',
      },
    ]);

    apiKey = response.apiKey;
  } else {
    console.log(chalk.gray('\n(Local models do not require an API key.)\n'));
  }

  // Configure provider - use new key if provided, otherwise keep existing
  if (apiKey && apiKey.trim().length > 0) {
    config.apiKeys[provider] = apiKey.trim();
  }

  if (provider === 'ollama' || provider === 'lm-studio') {
    let existingBaseUrl = config.llm.baseUrl;
    const baseUrlPromptMessage = existingBaseUrl
      ? `Enter ${provider} base URL [press Enter to keep existing] (${existingBaseUrl}):`
      : `Enter ${provider} base URL:`;

    if (!existingBaseUrl) {
      existingBaseUrl =
        provider === 'ollama' ? 'http://localhost:11434' : 'http://localhost:1234/v1';
    }
    const { baseUrl } = await inquirer.prompt([
      {
        type: 'input',
        name: 'baseUrl',
        message: baseUrlPromptMessage,
        default: existingBaseUrl,
      },
    ]);
    config.llm.baseUrl = baseUrl;
  }

  const models = await getModels(config);

  // Select model for the chosen provider
  console.log(chalk.cyan(`\n🎯 Available ${provider} models:\n`));
  console.log(
    chalk.gray('💡 CodeWave uses multi-agent discussion (3 rounds) to refine evaluations.')
  );
  console.log(
    chalk.gray('   Cheaper models like Haiku achieve 95%+ quality through discussion refinement.\n')
  );

  const { selectedModel } = await inquirer.prompt([
    {
      type: 'list',
      name: 'selectedModel',
      message: `Choose ${provider} model:`,
      choices: models,
      default: models[0].value,
      loop: false,
    },
  ]);
  config.llm.model = selectedModel;
  const metadata = models.find((model) => model.value === selectedModel);

  if (metadata) {
    const inputPricePerToken = parseFloat(metadata.pricing.input);
    const outputPricePerToken = parseFloat(metadata.pricing.output);
    const cost = (inputPricePerToken + outputPricePerToken) * DEFAULT_CONFIG.llm.maxTokens * 3;
    if (cost) {
      console.log(chalk.gray(`\n✓ Selected: ${chalk.cyanBright(selectedModel)}`));
      console.log(
        chalk.gray(
          `   Cost: ${chalk.green(`$${cost.toFixed(2)} USD`)} per 3-round multi-agent discussion (estimated)`
        )
      );
    }
  }

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
