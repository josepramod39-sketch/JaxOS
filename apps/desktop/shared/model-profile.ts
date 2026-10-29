import type { InferenceProfile, Settings } from './types';
import { providerAddress,providerKind,llamaConfig } from './provider-settings';

export const DEFAULT_PROFILE: InferenceProfile = { contextTokens: 8192, outputTokens: 2048, thinking: 'off', temperature: .6, keepAliveSeconds: 300, gpu: 'auto' };
export const profileKey = (url: string, model: string) => `${url}|${model}`;
export const settingsProfileKey=(settings:Settings,model=settings.model)=>providerKind(settings)==='ollama'?profileKey(settings.ollamaUrl,model):`llamacpp:${JSON.stringify([llamaConfig(settings).mode,llamaConfig(settings).mode==='managed'?llamaConfig(settings).modelPath??'':providerAddress(settings),model])}`;
export function getModelProfile(settings: Settings, model = settings.model): InferenceProfile {
  const key = settingsProfileKey(settings, model);
  return { ...DEFAULT_PROFILE, ...(settings.modelProfiles && Object.hasOwn(settings.modelProfiles, key) ? settings.modelProfiles[key] : {}) };
}
export function validateProfile(value: unknown): InferenceProfile {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid model profile.');
  const profile = value as Record<string, unknown>;
  if (Object.keys(profile).some(key => !Object.hasOwn(DEFAULT_PROFILE, key))) throw new Error('Unknown model profile option.');
  const integer = (key: string, min: number, max: number) => {
    const item = profile[key];
    if (typeof item !== 'number' || !Number.isSafeInteger(item) || item < min || item > max) throw new Error(`${key} must be an integer between ${min} and ${max}.`);
    return item;
  };
  const contextTokens = integer('contextTokens', 512, 131072);
  const outputTokens = integer('outputTokens', 128, 16384);
  if (outputTokens > contextTokens - 256) throw new Error('Leave at least 256 context tokens for the input.');
  const keepAliveSeconds = integer('keepAliveSeconds', -1, 86400);
  if (!['auto', 'off', 'on'].includes(profile.thinking as string)) throw new Error('Invalid thinking mode.');
  if (!['auto', 'cpu'].includes(profile.gpu as string)) throw new Error('Invalid processor policy.');
  if (typeof profile.temperature !== 'number' || !Number.isFinite(profile.temperature) || profile.temperature < 0 || profile.temperature > 2) throw new Error('Temperature must be between 0 and 2.');
  return { contextTokens, outputTokens, keepAliveSeconds, thinking: profile.thinking as InferenceProfile['thinking'], gpu: profile.gpu as InferenceProfile['gpu'], temperature: profile.temperature };
}
