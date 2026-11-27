import { isStaleChunkError } from './error-handler';

describe('isStaleChunkError', () => {
  it('spots a missing lazy chunk', () => {
    expect(isStaleChunkError(new TypeError('Failed to fetch dynamically imported module: https://x/chunk-A.js'))).toBe(true);
    expect(isStaleChunkError(new Error('Loading chunk 12 failed'))).toBe(true);
  });
  it('ignores ordinary errors', () => {
    expect(isStaleChunkError(new Error('boom'))).toBe(false);
  });
});
