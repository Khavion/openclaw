import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';

const KEY = 'a'.repeat(64);

describe('loadConfig', () => {
  it('parses a minimal valid environment', () => {
    const cfg = loadConfig({ KHAVION_MASTER_KEY: KEY });
    expect(cfg.APP_MODE).toBe('mock');
    expect(cfg.PORT).toBe(3000);
    expect(cfg.HEALTHCHECKS_PING_URL).toBeUndefined();
  });

  it('rejects a malformed master key', () => {
    expect(() => loadConfig({ KHAVION_MASTER_KEY: 'short' })).toThrow(/64 hex/);
  });

  it('treats empty strings as unset', () => {
    const cfg = loadConfig({ KHAVION_MASTER_KEY: KEY, HEALTHCHECKS_PING_URL: '' });
    expect(cfg.HEALTHCHECKS_PING_URL).toBeUndefined();
  });
});
