import { PROVIDER_MODELS } from '../constants/provider-models';

export interface GenericModel {
  name: string;
  value: string;
  pricing: {
    input: string;
    output: string;
  };
}

export type LLMProvider = keyof typeof PROVIDER_MODELS;
export type LLMProviderModels = (typeof PROVIDER_MODELS)[LLMProvider][number]['value'];
export type Models = { [key in LLMProvider]: GenericModel[] };

export interface OllamaModel {
  name: string;
  model: string;
}

export interface LMStudioModel {
  id: string;
}

export interface GroqModel {
  id: string;
}

export interface AnthropicModel {
  id: string;
  display_name: string;
}

export interface OpenAIModel {
  id: string;
}

export interface GoogleModel {
  name: string;
  displayName: string;
  baseModelId: string;
  inputTokenLimit: number;
  outputTokenLimit: number;
}

export interface XAIModel {
  id: string;
}
