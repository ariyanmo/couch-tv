// Optional language-model wording for copilot answers. Disabled by default.
// The model only receives facts computed locally and is told not to add any.
// A local model (Ollama on this computer) costs nothing. An OpenAI-compatible
// cloud endpoint may charge per request; the settings page says so.

import type { AppSettings } from './types';
import type { CopilotAnswer } from './copilot';

export const SYSTEM_PROMPT =
  'You rephrase answers for a real estate measurement app. Use ONLY the facts given. Never add numbers, rooms, features or claims that are not in the facts. Keep every number and every caveat (measured / drawn / estimated / missing) exactly. Be concise.';

export async function aiRephrase(settings: AppSettings['ai'], question: string, answer: CopilotAnswer, signal?: AbortSignal): Promise<string> {
  const facts = [answer.text, ...answer.facts.map((f) => `${f.label}: ${f.value}${f.status ? ` (${f.status})` : ''}`)].join('\n');
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: `Question: ${question}\n\nFacts:\n${facts}\n\nWrite the answer.` },
  ];
  const base = settings.endpoint.replace(/\/+$/, '');
  if (settings.provider === 'ollama') {
    const r = await fetch(`${base}/api/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: settings.model, messages, stream: false, options: { temperature: 0.2 } }), signal });
    if (!r.ok) throw new Error(`Local model answered ${r.status}`);
    const j = await r.json();
    return String(j.message?.content ?? '').trim();
  }
  const r = await fetch(`${base}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(settings.apiKey ? { Authorization: `Bearer ${settings.apiKey}` } : {}) },
    body: JSON.stringify({ model: settings.model, messages, temperature: 0.2 }),
    signal,
  });
  if (!r.ok) throw new Error(`Endpoint answered ${r.status}`);
  const j = await r.json();
  return String(j.choices?.[0]?.message?.content ?? '').trim();
}
