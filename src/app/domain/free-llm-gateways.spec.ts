import { describe, expect, it } from 'vitest';
import { ASSISTANT_MAX_TOKENS, FREE_LLM_GATEWAYS } from './free-llm-gateways';

describe('free-llm-gateways', () => {
  it('tries LLM7 before Kilo and caps the reply length', () => {
    expect(FREE_LLM_GATEWAYS.map((g) => g.id)).toEqual(['llm7-glm', 'llm7-mistral', 'kilo-auto']);
    expect(FREE_LLM_GATEWAYS.map((g) => g.model)).toEqual([
      'GLM-5.3-Flash',
      'mistral-Nemo-Instruct-2407',
      'kilo-auto/free',
    ]);
    expect(FREE_LLM_GATEWAYS[0]!.baseUrl).toContain('llm7.io');
    expect(FREE_LLM_GATEWAYS[2]!.baseUrl).toContain('kilo.ai');
    expect(ASSISTANT_MAX_TOKENS).toBe(220);
  });
});
