import { ChatOpenAI } from '@langchain/openai';
import { ChatAnthropic } from '@langchain/anthropic';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { ChatOllama } from '@langchain/ollama';
import { ChatGroq } from '@langchain/groq';
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

    switch (provider) {
      case 'ollama':
        return new ChatOllama({
          baseUrl: config.llm.baseUrl || 'http://localhost:11434',
          model,
          temperature,
        });
      case 'lm-studio':
        return new ChatOpenAI({
          apiKey: 'lm-studio',
          temperature,
          maxTokens,
          modelName: model,
          configuration: {
            baseURL: config.llm.baseUrl || 'http://localhost:1234/v1',
          },
        });
      default:
        break;
    }
    // Get API key for selected provider
    const apiKey = config.apiKeys?.[provider];
    if (!apiKey) {
      throw new Error(
        `Missing API key for provider: ${provider}. Run: codewave config --set apiKeys.${provider}=<your-key>`
      );
    }

    switch (provider) {
      case 'anthropic':
        return new ChatAnthropic({
          anthropicApiKey: apiKey,
          temperature,
          maxTokens,
          modelName: model,
        });

      case 'openai':
        return new ChatOpenAI({
          openAIApiKey: apiKey,
          temperature,
          maxTokens,
          modelName: model,
        });

      case 'google':
        return new ChatGoogleGenerativeAI({
          apiKey,
          temperature,
          maxOutputTokens: maxTokens,
          model,
        });

      case 'xai':
        return new ChatOpenAI({
          openAIApiKey: apiKey,
          temperature,
          maxTokens,
          modelName: model,
          configuration: {
            baseURL: 'https://api.x.ai/v1',
          },
        });
      case 'groq': {
        return new ChatGroq({
          apiKey,
          temperature,
          maxTokens,
          model,
        });
      }
      default:
        throw new Error(`Unsupported LLM provider: ${provider}`);
    }
  }
}
