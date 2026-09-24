import { describe, expect, it } from 'vitest';
import { FREE_LLM_GATEWAYS } from './free-llm-gateways';

describe('free-llm-gateways', () => {
  it('orders Kilo before LLM7 with pinned keyless models', () => {
    expect(FREE_LLM_GATEWAYS.map((g) => g.model)).toEqual([
      'kilo-auto/free',
      'liquid/lfm-2.5-2.6b:free',
      'GLM-5.3-Flash',
      'mistral-Nemo-Instruct-2407',
    ]);
    expect(FREE_LLM_GATEWAYS[0]!.baseUrl).toContain('kilo.ai');
    expect(FREE_LLM_GATEWAYS[2]!.baseUrl).toContain('llm7.io');
  });
});
