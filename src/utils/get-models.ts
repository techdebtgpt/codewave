import { AppConfig } from 'config/config.interface';
import { GenericModel, LLMProvider, LMStudioModel, OllamaModel } from 'types/model.types';
import { PROVIDER_MODELS } from '../constants/provider-models';

export async function getModels(config: AppConfig): Promise<GenericModel[]> {
  const provider = config.llm.provider;
  const baseUrl = config.llm.baseUrl;

  if (!provider) {
    throw new Error('Provider is required');
  }

  let models: GenericModel[] = [];

  switch (provider) {
    case 'ollama':
      models = await getOllamaModels(baseUrl);
      break;
    case 'lm-studio':
      models = await getLMStudioModels(baseUrl);
      break;
    default: {
      models = (await getProviderModels(provider)) as GenericModel[];
      break;
    }
  }
  return models;
}

async function getOllamaModels(baseUrl: string | undefined): Promise<GenericModel[]> {
  const response = await fetch(`${baseUrl}/api/tags`);

  if (!response.ok) {
    throw new Error(`Failed to fetch models from ${baseUrl}`);
  }

  const data = (await response.json()) as { models: OllamaModel[] };
  return data.models.map((model) => ({
    name: model.name,
    value: model.model,
    pricing: {
      input: '0',
      output: '0',
    },
  }));
}

async function getLMStudioModels(baseUrl: string | undefined): Promise<GenericModel[]> {
  const response = await fetch(`${baseUrl}/models`);

  if (!response.ok) {
    throw new Error(`Failed to fetch models from ${baseUrl}`);
  }
  const data = (await response.json()) as { data: LMStudioModel[] };
  return data.data.map((model) => ({
    name: model.id,
    value: model.id,
    pricing: {
      input: '0',
      output: '0',
    },
  }));
}

async function getProviderModels(provider: LLMProvider): Promise<readonly GenericModel[]> {
  return PROVIDER_MODELS[provider];
}
