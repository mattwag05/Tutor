import type {
  ProviderConfig,
  ProviderId,
  ThinkingCapability,
  ThinkingEffort,
  ThinkingLevel,
  ThinkingRequestAdapter,
} from '@/lib/types/provider';

export function getModelMetadataKey(providerId: string, modelId: string): string {
  return `${providerId}:${modelId}`;
}

function effortCapability(
  requestAdapter: ThinkingRequestAdapter,
  effortValues: ThinkingEffort[],
  defaultEffort: ThinkingEffort,
): ThinkingCapability {
  return {
    control: 'effort',
    requestAdapter,
    effortValues,
    defaultEffort,
    defaultMode: effortValues.includes('none') ? 'disabled' : 'enabled',
    toggleable: effortValues.includes('none'),
    budgetAdjustable: true,
    defaultEnabled: !effortValues.includes('none'),
  };
}

function levelCapability(
  levelValues: ThinkingLevel[],
  defaultLevel: ThinkingLevel,
): ThinkingCapability {
  return {
    control: 'level',
    requestAdapter: 'google',
    levelValues,
    defaultLevel,
    defaultMode: 'enabled',
    toggleable: false,
    budgetAdjustable: true,
    defaultEnabled: true,
  };
}

function toggleCapability(
  requestAdapter: ThinkingRequestAdapter,
  defaultEnabled = true,
): ThinkingCapability {
  return {
    control: 'toggle',
    requestAdapter,
    defaultMode: defaultEnabled ? 'enabled' : 'disabled',
    toggleable: true,
    budgetAdjustable: false,
    defaultEnabled,
  };
}

function toggleBudgetCapability(
  requestAdapter: ThinkingRequestAdapter,
  range: { min: number; max: number; step?: number; allowDynamic?: boolean; disableValue?: number },
  defaultEnabled = false,
  defaultBudgetTokens?: number,
): ThinkingCapability {
  return {
    control: 'toggle-budget',
    requestAdapter,
    budgetRange: range,
    defaultBudgetTokens,
    defaultMode: defaultEnabled ? 'enabled' : 'disabled',
    toggleable: true,
    budgetAdjustable: true,
    defaultEnabled,
  };
}

function budgetOnlyCapability(
  requestAdapter: ThinkingRequestAdapter,
  range: { min: number; max: number; step?: number; allowDynamic?: boolean },
  defaultBudgetTokens?: number,
): ThinkingCapability {
  return {
    control: 'budget-only',
    requestAdapter,
    budgetRange: range,
    defaultBudgetTokens,
    defaultMode: 'enabled',
    toggleable: false,
    budgetAdjustable: true,
    defaultEnabled: true,
  };
}

const fixedThinkingCapability: ThinkingCapability = {
  control: 'none',
  requestAdapter: 'none',
  defaultMode: 'enabled',
  toggleable: false,
  budgetAdjustable: false,
  defaultEnabled: true,
};

const anthropicManualBudgetByEffort: Partial<Record<ThinkingEffort, number>> = {
  low: 4096,
  medium: 10240,
  high: 32768,
  max: 64000,
};

const anthropicManualEffort: ThinkingCapability = {
  control: 'effort',
  requestAdapter: 'anthropic',
  effortValues: ['none', 'low', 'medium', 'high', 'max'],
  defaultEffort: 'medium',
  defaultMode: 'enabled',
  toggleable: true,
  budgetAdjustable: true,
  defaultEnabled: true,
  anthropicThinking: {
    type: 'enabled',
    budgetByEffort: anthropicManualBudgetByEffort,
  },
};

const anthropicAdaptiveEffort: ThinkingCapability = {
  ...anthropicManualEffort,
  anthropicThinking: { type: 'adaptive' },
};

const anthropicBudget: ThinkingCapability = toggleBudgetCapability(
  'anthropic',
  { min: 1024, max: 64000, step: 1024 },
  false,
  1024,
);

const anthropicOpus47Effort: ThinkingCapability = {
  ...anthropicAdaptiveEffort,
  effortValues: ['none', 'low', 'medium', 'high', 'xhigh', 'max'],
};

const deepseekEffort: ThinkingCapability = {
  control: 'effort',
  requestAdapter: 'deepseek',
  effortValues: ['none', 'high', 'max'],
  defaultEffort: 'high',
  defaultMode: 'enabled',
  toggleable: true,
  budgetAdjustable: true,
  defaultEnabled: true,
};

const hunyuanHy3Effort: ThinkingCapability = {
  control: 'effort',
  requestAdapter: 'hunyuan',
  effortValues: ['none', 'low', 'high'],
  defaultEffort: 'none',
  defaultMode: 'disabled',
  toggleable: true,
  budgetAdjustable: true,
  defaultEnabled: false,
};

const qwenBudgetEnabled = toggleBudgetCapability(
  'qwen',
  { min: 0, max: 81920, step: 1024, disableValue: 0 },
  true,
);

const qwenBudgetDisabled = toggleBudgetCapability(
  'qwen',
  { min: 0, max: 81920, step: 1024, disableValue: 0 },
  false,
);

const siliconflowBudget = budgetOnlyCapability(
  'siliconflow',
  { min: 128, max: 32768, step: 1024 },
  4096,
);

const siliconflowToggleBudget = toggleBudgetCapability(
  'siliconflow',
  { min: 128, max: 32768, step: 1024, disableValue: 0 },
  true,
  4096,
);

const doubaoMode: ThinkingCapability = {
  control: 'mode',
  requestAdapter: 'doubao',
  defaultMode: 'auto',
  toggleable: true,
  budgetAdjustable: false,
  defaultEnabled: true,
};

const doubaoSeed20Effort: ThinkingCapability = {
  control: 'effort',
  requestAdapter: 'doubao',
  effortValues: ['minimal', 'low', 'medium', 'high'],
  defaultEffort: 'medium',
  defaultMode: 'enabled',
  toggleable: true,
  budgetAdjustable: true,
  defaultEnabled: true,
};


import thinkingData from './model-metadata.json';

const THINKING_CAPABILITIES: Record<string, ThinkingCapability> = thinkingData as Record<string, ThinkingCapability>;
;

export function getCatalogThinkingCapability(
  providerId: string,
  modelId: string,
): ThinkingCapability | undefined {
  return THINKING_CAPABILITIES[getModelMetadataKey(providerId, modelId)];
}

export function applyModelMetadata(providers?: Record<ProviderId, ProviderConfig>): void {
  if (!providers) return;
  for (const provider of Object.values(providers)) {
    if (!provider || !Array.isArray(provider.models)) continue;
    for (const model of provider.models) {
      const thinking = getCatalogThinkingCapability(provider.id, model.id);
      if (thinking) {
        model.capabilities = {
          ...model.capabilities,
          thinking,
        };
      }
    }
  }
}
