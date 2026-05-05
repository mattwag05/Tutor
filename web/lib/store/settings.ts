/**
 * Stub — browser-only settings store (Phase B.1).
 * getCurrentTTSConfig() in tts-providers.ts lazy-imports this; it only runs
 * in browser context so this file is never executed in server routes.
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { TTSProviderId } from '@/lib/audio/types';

interface SettingsState {
  ttsProviderId: TTSProviderId;
  ttsVoice: string;
  ttsSpeed: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ttsProvidersConfig: Record<string, any>;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    () => ({
      ttsProviderId: 'openai-tts' as TTSProviderId,
      ttsVoice: 'alloy',
      ttsSpeed: 1.0,
      ttsProvidersConfig: {},
    }),
    { name: 'settings-storage' },
  ),
);
