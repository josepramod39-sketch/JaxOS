import type { Message, InferenceProfile } from '../shared/types';

// Deliberately conservative byte-based estimate. No exact tokenizer is claimed.
const cost = (text: string) => Buffer.byteLength(text, 'utf8') + 32;
export function assembleContext(system: string, history: Message[], profile: InferenceProfile, overhead = 0) {
  const budget = profile.contextTokens - profile.outputTokens - 128 - overhead;
  if (cost(system) >= budget) throw new Error('Project instructions exceed this context budget. Reduce project notes or increase context length.');
  const complete = history.filter(item => item.status === 'complete');
  const exchanges: typeof complete[] = [];
  for (const message of complete) {
    if (message.role === 'user') exchanges.push([message]);
    else if (exchanges.length) exchanges[exchanges.length - 1].push(message);
  }
  const selected: typeof complete = [];
  let used = cost(system);
  for (const exchange of [...exchanges].reverse()) {
    const tokens = exchange.reduce((total, item) => total + cost(item.content), 0);
    if (used + tokens > budget) {
      if (!selected.length) throw new Error('Your latest message exceeds this context budget. Shorten it, lower the output limit, or increase context length.');
      break;
    }
    used += tokens; selected.unshift(...exchange);
  }
  return { messages: [{ role: 'system' as const, content: system }, ...selected.map(({ role, content }) => ({ role, content }))], omitted: complete.length - selected.length };
}
