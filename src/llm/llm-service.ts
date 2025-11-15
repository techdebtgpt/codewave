import { ChatOpenAI } from '@langchain/openai';
import { ChatAnthropic } from '@langchain/anthropic';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { ChatOllama } from '@langchain/ollama';
import { AppConfig } from '../config/config.interface';

export class LLMService {
  /**
   * Returns a chat model instance based on AppConfig
   * Extracts provider, model, API key (if needed) from config object
   */
  static getChatModel(config: AppConfig) {
    const provider = config.llm.provider;
    const model = config.llm.model;
    const temperature = config.llm.temperature ?? 0.2;
    const maxTokens = config.llm.maxTokens ?? 4096;
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
