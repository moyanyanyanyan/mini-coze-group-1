import type { ChatMessage } from '@minicoze/shared';
import type { Agent } from '../agent-builder/agent.api';

/** Runtime currently enforces this default when no model-specific limit is configured. */
export const DEFAULT_CONTEXT_TOKEN_LIMIT = 32_768;

/**
 * A small local registry keeps the UI extensible until model configuration exposes
 * a contextWindowTokens field. `Agent.contextWindowTokens` takes precedence when it
 * becomes available from the API.
 */
export const MODEL_CONTEXT_TOKEN_LIMITS: Readonly<Record<string, number>> = {
  'deepseek-chat': 32_768,
  // Add verified model context windows here when corresponding Runtime budgets
  // are configured. The default remains aligned with Runtime's current budget.
};

export function getContextTokenLimit(agent?: Pick<Agent, 'model'> & { contextWindowTokens?: number | null }): number {
  const configured = agent?.contextWindowTokens;
  if (typeof configured === 'number' && Number.isFinite(configured) && configured > 0) {
    return Math.round(configured);
  }
  const model = agent?.model.trim().toLowerCase();
  if (model && MODEL_CONTEXT_TOKEN_LIMITS[model]) return MODEL_CONTEXT_TOKEN_LIMITS[model];
  return DEFAULT_CONTEXT_TOKEN_LIMIT;
}

function estimateTextTokens(text: string): number {
  let estimate = 0;
  for (const character of text) {
    const code = character.codePointAt(0) ?? 0;
    // CJK characters generally map to one or more tokens; ASCII text averages
    // around four characters per token. This is intentionally labeled as an estimate.
    estimate += code >= 0x2e80 && code <= 0x9fff ? 1.5 : 0.25;
  }
  return text ? Math.max(1, Math.ceil(estimate)) : 0;
}

export function estimateConversationTokens(messages: ChatMessage[], systemPrompt = '', contextTurns = 10): number {
  const history = contextTurns <= 0 ? messages.slice(-1) : messages.slice(-(contextTurns * 2 + 2));
  const messageTokens = history.reduce((total, message) => {
    if (message.status === 'failed' || message.status === 'cancelled' || !message.content) return total;
    return total + estimateTextTokens(message.content) + 4;
  }, 0);
  return Math.max(0, estimateTextTokens(systemPrompt) + messageTokens);
}
