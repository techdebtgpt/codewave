export const PROVIDER_MODELS = {
  groq: [
    {
      name: 'Qwen 3 32B - [High Intelligence, Low Cost, Super Fast Speed]',
      value: 'qwen/qwen3-32b',
      pricing: {
        input: '0.00000029',
        output: '0.00000059',
      },
    },
    {
      name: 'meta-llama/llama-4-scout-17b-16e-instruct - [Medium Intelligence, Low Cost, Super Fast Speed]',
      value: 'meta-llama/llama-4-scout-17b-16e-instruct',
      pricing: {
        input: '0.00000011',
        output: '0.00000034',
      },
    },
    {
      name: 'llama-3.3-70b-versatile - [High Intelligence, Low Cost, Super Fast Speed]',
      value: 'llama-3.3-70b-versatile',
      pricing: {
        input: '0.00000059',
        output: '0.00000079',
      },
    },
    {
      name: 'moonshotai/kimi-k2-instruct - [Medium Intelligence, Low Cost, Super Fast Speed]',
      value: 'moonshotai/kimi-k2-instruct',
      pricing: {
        input: '0.000001',
        output: '0.000003',
      },
    },
    {
      name: 'moonshotai/kimi-k2-instruct-0905 - [Medium Intelligence, Low Cost, Super Fast Speed]',
      value: 'moonshotai/kimi-k2-instruct-0905',
      pricing: {
        input: '0.000001',
        output: '0.000003',
      },
    },
    {
      name: 'meta-llama/llama-4-maverick-17b-128e-instruct - [Medium Intelligence, Low Cost, Super Fast Speed]',
      value: 'meta-llama/llama-4-maverick-17b-128e-instruct',
      pricing: {
        input: '0.0000002',
        output: '0.0000006',
      },
    },
    {
      name: 'GPT-OSS 120B - [Medium-High Intelligence, Low Cost, Super Fast Speed]',
      value: 'openai/gpt-oss-120b',
      pricing: {
        input: '0.00000015',
        output: '0.0000006',
      },
    },
    {
      name: 'GPT-OSS 20B - [Medium Intelligence, Low Cost, Super Fast Speed]',
      value: 'openai/gpt-oss-20b',
      pricing: {
        input: '0.000000075',
        output: '0.0000003',
      },
    },
    {
      name: 'llama-3.1-8b-instant - [Medium Intelligence, Low Cost, Super Fast Speed]',
      value: 'llama-3.1-8b-instant',
      pricing: {
        input: '0.00000005',
        output: '0.00000008',
      },
    },
  ],
  anthropic: [
    {
      name: 'Claude Opus 4.5 - [High Intelligence, High Cost, Slow Speed]',
      value: 'claude-opus-4-5-20251101',
      pricing: {
        input: '0.000005',
        output: '0.000025',
      },
    },
    {
      name: 'Claude Haiku 4.5 - [Medium Intelligence, Low Cost, Fast Speed]',
      value: 'claude-haiku-4-5-20251001',
      pricing: {
        input: '0.000001',
        output: '0.000005',
      },
    },
    {
      name: 'Claude Sonnet 4.5 - [High Intelligence, Medium Cost, Standard Speed]',
      value: 'claude-sonnet-4-5-20250929',
      pricing: {
        input: '0.000003',
        output: '0.000015',
      },
    },
    {
      name: 'Claude Opus 4.1 - [High Intelligence, High Cost, Slow Speed]',
      value: 'claude-opus-4-1-20250805',
      pricing: {
        input: '0.000015',
        output: '0.000075',
      },
    },
    {
      name: 'Claude Opus 4 - [High Intelligence, High Cost, Slow Speed]',
      value: 'claude-opus-4-20250514',
      pricing: {
        input: '0.000015',
        output: '0.000075',
      },
    },
    {
      name: 'Claude Sonnet 4 - [High Intelligence, Medium Cost, Standard Speed]',
      value: 'claude-sonnet-4-20250514',
      pricing: {
        input: '0.000003',
        output: '0.000015',
      },
    },
    {
      name: 'Claude Sonnet 3.7 - [Medium Intelligence, Medium Cost, Standard Speed]',
      value: 'claude-3-7-sonnet-20250219',
      pricing: {
        input: '0.000003',
        output: '0.000015',
      },
    },
    {
      name: 'Claude Haiku 3.5 - [Medium Intelligence, Low Cost, Fast Speed]',
      value: 'claude-3-5-haiku-20241022',
      pricing: {
        input: '0.0000008',
        output: '0.000004',
      },
    },
    {
      name: 'Claude Haiku 3 - [Medium Intelligence, Low Cost, Fast Speed]',
      value: 'claude-3-haiku-20240307',
      pricing: {
        input: '0.00000025',
        output: '0.00000125',
      },
    },
    {
      name: 'Claude Opus 3 - [Medium Intelligence, High Cost, Slow Speed]',
      value: 'claude-3-opus-20240229',
      pricing: {
        input: '0.000015',
        output: '0.000075',
      },
    },
  ],
  openai: [
    {
      name: 'gpt-5.2 - [High Intelligence, High Cost, Standard Speed, Reasoning]',
      value: 'gpt-5.2',
      pricing: {
        input: '0.00000175',
        output: '0.000014',
      },
    },
    {
      name: 'gpt-5.2-chat-latest - [Medium-High Intelligence, High Cost, Fast Speed, No Reasoning]',
      value: 'gpt-5.2-chat-latest',
      pricing: {
        input: '0.00000175',
        output: '0.000014',
      },
    },
    {
      name: 'gpt-4 - [Medium Intelligence, High Cost, Standard Speed]',
      value: 'gpt-4',
      pricing: {
        input: '0.00003',
        output: '0.00006',
      },
    },
    {
      name: 'gpt-3.5-turbo - [Medium Intelligence, Low Cost, Fast Speed]',
      value: 'gpt-3.5-turbo',
      pricing: {
        input: '0.0000005',
        output: '0.0000015',
      },
    },
    {
      name: 'gpt-5.1 - [High Intelligence, High Cost, Standard Speed]',
      value: 'gpt-5.1',
      pricing: {
        input: '0.00000125',
        output: '0.00001',
      },
    },
    {
      name: 'gpt-5.1-codex - [High Intelligence, High Cost, Standard Speed]',
      value: 'gpt-5.1-codex',
      pricing: {
        input: '0.00000125',
        output: '0.00001',
      },
    },
    {
      name: 'gpt-3.5-turbo-instruct - [Medium Intelligence, Low Cost, Fast Speed]',
      value: 'gpt-3.5-turbo-instruct',
      pricing: {
        input: '0.0000015',
        output: '0.000002',
      },
    },
    {
      name: 'gpt-4-1106-preview - [Medium-High Intelligence, Medium Cost, Standard Speed]',
      value: 'gpt-4-1106-preview',
      pricing: {
        input: '0.00001',
        output: '0.00003',
      },
    },
    {
      name: 'gpt-3.5-turbo-1106 - [Medium Intelligence, Low Cost, Fast Speed]',
      value: 'gpt-3.5-turbo-1106',
      pricing: {
        input: '0.000003',
        output: '0.000004',
      },
    },
    {
      name: 'gpt-4-0125-preview - [Medium-High Intelligence, Medium Cost, Standard Speed]',
      value: 'gpt-4-0125-preview',
      pricing: {
        input: '0.00001',
        output: '0.00003',
      },
    },
    {
      name: 'gpt-4-turbo-preview - [Medium-High Intelligence, Medium Cost, Fast Speed]',
      value: 'gpt-4-turbo-preview',
      pricing: {
        input: '0.00001',
        output: '0.00003',
      },
    },
    {
      name: 'gpt-3.5-turbo-0125 - [Medium Intelligence, Low Cost, Fast Speed]',
      value: 'gpt-3.5-turbo-0125',
      pricing: {
        input: '0.000003',
        output: '0.000004',
      },
    },
    {
      name: 'gpt-4-turbo - [Medium-High Intelligence, Medium Cost, Fast Speed]',
      value: 'gpt-4-turbo',
      pricing: {
        input: '0.00001',
        output: '0.00003',
      },
    },
    {
      name: 'gpt-4-turbo-2024-04-09 - [Medium-High Intelligence, Medium Cost, Fast Speed]',
      value: 'gpt-4-turbo-2024-04-09',
      pricing: {
        input: '0.00001',
        output: '0.00003',
      },
    },
    {
      name: 'gpt-4o - [High Intelligence, Medium Cost, Standard Speed]',
      value: 'gpt-4o',
      pricing: {
        input: '0.0000025',
        output: '0.00001',
      },
    },
    {
      name: 'gpt-4o-mini - [Medium-High Intelligence, Low Cost, Fast Speed]',
      value: 'gpt-4o-mini',
      pricing: {
        input: '0.00000015',
        output: '0.0000006',
      },
    },
    {
      name: 'o1 - [High Intelligence, High Cost, Standard Speed, Reasoning]',
      value: 'o1',
      pricing: {
        input: '0.00015',
        output: '0.0006',
      },
    },
    {
      name: 'o3-mini - [Medium-High Intelligence, Medium Cost, Fast Speed, Reasoning]',
      value: 'o3-mini',
      pricing: {
        input: '0.0000011',
        output: '0.0000044',
      },
    },
    {
      name: 'o1-pro - [High Intelligence, High Cost, Standard Speed, Reasoning]',
      value: 'o1-pro',
      pricing: {
        input: '0.00015',
        output: '0.0006',
      },
    },
    {
      name: 'o3 - [High Intelligence, High Cost, Standard Speed, Reasoning]',
      value: 'o3',
      pricing: {
        input: '0.00001',
        output: '0.00004',
      },
    },
    {
      name: 'o4-mini - [Medium-High Intelligence, Medium Cost, Fast Speed, Reasoning]',
      value: 'o4-mini',
      pricing: {
        input: '0.000002',
        output: '0.000008',
      },
    },
    {
      name: 'gpt-4.1 - [Medium Intelligence, High Cost, Standard Speed]',
      value: 'gpt-4.1',
      pricing: {
        input: '0.000002',
        output: '0.000008',
      },
    },
    {
      name: 'gpt-4.1-mini - [Medium Intelligence, Low Cost, Fast Speed]',
      value: 'gpt-4.1-mini',
      pricing: {
        input: '0.0000004',
        output: '0.0000016',
      },
    },
    {
      name: 'gpt-4.1-nano - [Low Intelligence, Low Cost, Fast Speed]',
      value: 'gpt-4.1-nano',
      pricing: {
        input: '0.0000001',
        output: '0.0000004',
      },
    },
    {
      name: 'o3-pro - [High Intelligence, High Cost, Standard Speed, Reasoning]',
      value: 'o3-pro',
      pricing: {
        input: '0.00002',
        output: '0.00008',
      },
    },
    {
      name: 'gpt-5 - [High Intelligence, High Cost, Standard Speed]',
      value: 'gpt-5',
      pricing: {
        input: '0.00000025',
        output: '0.000002',
      },
    },
    {
      name: 'gpt-5-mini - [Medium-High Intelligence, Medium Cost, Fast Speed]',
      value: 'gpt-5-mini',
      pricing: {
        input: '0.00000025',
        output: '0.000002',
      },
    },
    {
      name: 'gpt-5-nano - [Medium-High Intelligence, High Cost, Fast Speed]',
      value: 'gpt-5-nano',
      pricing: {
        input: '0.00000005',
        output: '0.0000004',
      },
    },
    {
      name: 'gpt-5-codex - [High Intelligence, High Cost, Standard Speed]',
      value: 'gpt-5-codex',
      pricing: {
        input: '0.00000125',
        output: '0.00001',
      },
    },
    {
      name: 'gpt-5-pro - [High Intelligence, High Cost, Standard Speed]',
      value: 'gpt-5-pro',
      pricing: {
        input: '0.000015',
        output: '0.00012',
      },
    },
  ],
  google: [
    {
      name: 'Gemini 2.5 Flash - [Medium Intelligence, Low Cost, Fast Speed]',
      value: 'models/gemini-2.5-flash',
      pricing: {
        input: '0.0000003',
        output: '0.0000025',
      },
    },
    {
      name: 'Gemini 2.5 Pro - [Medium-High Intelligence, Medium Cost, Fast Speed]',
      value: 'models/gemini-2.5-pro',
      pricing: {
        input: '0.00000125',
        output: '0.00001',
      },
    },
    {
      name: 'Gemini 2.5 Flash-Lite - [Medium Intelligence, Low Cost, Fast Speed]',
      value: 'models/gemini-2.5-flash-lite',
      pricing: {
        input: '0.0000001',
        output: '0.0000004',
      },
    },
    {
      name: 'Gemini 3 Pro Preview - [Medium-High Intelligence, Medium Cost, Fast Speed]',
      value: 'models/gemini-3-pro-preview',
      pricing: {
        input: '0.000002',
        output: '0.000012',
      },
    },
  ],
  xai: [
    {
      name: 'grok-2-1212 - [Medium Intelligence, Medium Cost, Standard Speed]',
      value: 'grok-2-1212',
      pricing: {
        input: '0',
        output: '0',
      },
    },
    {
      name: 'grok-3 - [High Intelligence, Medium Cost, Standard Speed]',
      value: 'grok-3',
      pricing: {
        input: '0.000003',
        output: '0.000015',
      },
    },
    {
      name: 'grok-3-mini - [Medium-High Intelligence, Low Cost, Fast Speed]',
      value: 'grok-3-mini',
      pricing: {
        input: '0.0000003',
        output: '0.0000005',
      },
    },
    {
      name: 'Grok 4 (July 2025) - [High Intelligence, Medium Cost, Standard Speed]',
      value: 'grok-4-0709',
      pricing: {
        input: '0.000003',
        output: '0.000015',
      },
    },
    {
      name: 'Grok 4.1 Fast - [High Intelligence, Medium Cost, Fast Speed, Reasoning]',
      value: 'grok-4-1-fast-non-reasoning',
      pricing: {
        input: '0.0000002',
        output: '0.0000005',
      },
    },
    {
      name: 'Grok 4.1 Fast Reasoning - [High Intelligence, Medium Cost, Fast Speed, Reasoning]',
      value: 'grok-4-1-fast-reasoning',
      pricing: {
        input: '0.0000002',
        output: '0.0000005',
      },
    },
    {
      name: 'Grok 4 Fast - [High Intelligence, Medium Cost, Fast Speed, Reasoning]',
      value: 'grok-4-fast-non-reasoning',
      pricing: {
        input: '0.0000002',
        output: '0.0000005',
      },
    },
    {
      name: 'Grok 4 Fast Reasoning - [High Intelligence, Medium Cost, Fast Speed, Reasoning]',
      value: 'grok-4-fast-reasoning',
      pricing: {
        input: '0.0000002',
        output: '0.0000005',
      },
    },
    {
      name: 'Grok Code Fast 1 - [Medium Intelligence, Medium Cost, Fast Speed]',
      value: 'grok-code-fast-1',
      pricing: {
        input: '0.0000002',
        output: '0.0000015',
      },
    },
  ],
} as const;
