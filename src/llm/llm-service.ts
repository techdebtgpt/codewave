import { ChatOpenAI } from '@langchain/openai';
import { ChatAnthropic } from '@langchain/anthropic';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { ChatOllama } from '@langchain/ollama';
import { AppConfig } from '../config/config.interface';

export class LLMService {
  /**
   * Returns a chat model instance based on AppConfig
   * Extracts provider, model, API key (if needed) from config object
   * @param config Full AppConfig object
   * @param maxTokensOverride Optional override for maxTokens (e.g., from depth mode tokenBudgetPerAgent)
   */
  static getChatModel(config: AppConfig, maxTokensOverride?: number) {
    const provider = config.llm.provider;
    const model = config.llm.model;
    const temperature = config.llm.temperature ?? 0.2;
    // Use the minimum of override and config ceiling to respect safety limits
    const configMaxTokens = config.llm.maxTokens ?? 16000;
    const maxTokens = maxTokensOverride
      ? Math.min(maxTokensOverride, configMaxTokens)
      : configMaxTokens;

    // Get API key for selected provider
    const apiKey = config.apiKeys?.[provider];

    switch (provider) {
      case 'anthropic':
        if (!apiKey) throw new Error('Missing Anthropic API key');
        return new ChatAnthropic({
          anthropicApiKey: apiKey,
          temperature,
          maxTokens,
          modelName: model,
        });

      case 'openai':
        if (!apiKey) throw new Error('Missing OpenAI API key');
        return new ChatOpenAI({
          openAIApiKey: apiKey,
          temperature,
          maxTokens,
          modelName: model,
        });

      case 'google':
        if (!apiKey) throw new Error('Missing Google API key');
        return new ChatGoogleGenerativeAI({
          apiKey,
          temperature,
          maxOutputTokens: maxTokens,
          model,
        });

      case 'xai':
        if (!apiKey) throw new Error('Missing xAI API key');
        return new ChatOpenAI({
          openAIApiKey: apiKey,
          temperature,
          maxTokens,
          modelName: model,
          configuration: {
            baseURL: 'https://api.x.ai/v1',
          },
        });

      case 'ollama':
        // ✅ Local Llama (or any Ollama model)
        return new ChatOllama({
          baseUrl: config.llm.baseUrl || 'http://localhost:11434',
          model: model || 'llama3',
          temperature,
        });

      default:
        throw new Error(`Unsupported LLM provider: ${provider}`);
    }
  }
}
