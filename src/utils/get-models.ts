import { AppConfig } from 'config/config.interface';

interface GenericModel {
  name: string;
  value: string;
  inputTokenLimit?: number;
  outputTokenLimit?: number;
  pricePerInputToken?: number;
  pricePerOutputToken?: number;
}

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
    case 'groq':
      models = await getGroqModels(config.apiKeys.groq);
      break;
    case 'anthropic':
      models = await getAnthropicModels(config.apiKeys.anthropic);
      break;
    case 'openai':
      models = await getOpenAIModels(config.apiKeys.openai);
      break;
    case 'google':
      models = await getGoogleModels(config.apiKeys.google);
      break;
    case 'xai':
      models = await getXAIModels(config.apiKeys.xai);
      break;
  }

  return models;
}

interface OllamaModel {
  name: string;
  model: string;
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
  }));
}

interface LMStudioModel {
  id: string;
}

async function getLMStudioModels(baseUrl: string | undefined): Promise<GenericModel[]> {
  const response = await fetch(`${baseUrl}/models`);

  if (!response.ok) {
    throw new Error(`Failed to fetch models from ${baseUrl}`);
  }
  const data = (await response.json()) as { data: LMStudioModel[] };
  console.log('data', { data });
  return data.data.map((model) => ({
    name: model.id,
    value: model.id,
  }));
}

interface GroqModel {
  id: string;
}

async function getGroqModels(apiKey: string): Promise<GenericModel[]> {
  const response = await fetch('https://api.groq.com/openai/v1/models', {
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch models from Groq`);
  }
  const data = (await response.json()) as { data: GroqModel[] };
  return data.data.map((model) => ({
    name: model.id,
    value: model.id,
  }));
}

interface AnthropicModel {
  id: string;
  display_name: string;
}

async function getAnthropicModels(apiKey: string): Promise<GenericModel[]> {
  const response = await fetch('https://api.anthropic.com/v1/models', {
    headers: {
      'X-Api-Key': apiKey,
      'anthropic-version': '2023-06-01',
    },
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch models from Anthropic`);
  }

  const data = (await response.json()) as { data: AnthropicModel[] };

  return data.data.map((model) => ({
    name: model.display_name,
    value: model.id,
  }));
}

interface OpenAIModel {
  id: string;
}

async function getOpenAIModels(apiKey: string): Promise<GenericModel[]> {
  const response = await fetch('https://api.openai.com/v1/models', {
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch models from OpenAI`);
  }
  const data = (await response.json()) as { data: OpenAIModel[] };
  return data.data.map((model) => ({
    name: model.id,
    value: model.id,
  }));
}

interface GoogleModel {
  name: string;
  displayName: string;
  baseModelId: string;
  inputTokenLimit: number;
  outputTokenLimit: number;
}
async function getGoogleModels(apiKey: string): Promise<GenericModel[]> {
  const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models', {
    headers: {
      'x-goog-api-key': apiKey,
    },
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch models from Google`);
  }
  const data = (await response.json()) as { models: GoogleModel[] };
  return data.models.map((model) => ({
    name: model.displayName,
    value: model.name,
  }));
}

interface XAIModel {
  id: string;
}
async function getXAIModels(apiKey: string): Promise<GenericModel[]> {
  const response = await fetch('https://api.x.ai/v1/models', {
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch models from XAI`);
  }
  const data = (await response.json()) as { data: XAIModel[] };
  return data.data.map((model) => ({
    name: model.id,
    value: model.id,
  }));
}
