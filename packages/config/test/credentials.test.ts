// Real tests for credential resolution + the redaction-safe Secret wrapper
// (SPEC §8). The env path is exercised end-to-end; the keychain path's
// reference plumbing is covered without requiring a stored OS secret.

import {
  Secret,
  builtinDefaults,
  describeCredentialRef,
  isSecret,
  resolveCredential,
  resolveProviderCredential,
} from '@glamfire/config';
import { describe, expect, it } from 'vitest';

describe('Secret — never leaks', () => {
  it('redacts toString / toJSON / template interpolation but reveals on demand', () => {
    const s = new Secret('hunter2', 'env:TEST');
    expect(String(s)).toBe('[REDACTED]');
    expect(`${s}`).toBe('[REDACTED]');
    expect(JSON.stringify({ key: s })).toBe('{"key":"[REDACTED]"}');
    expect(JSON.stringify([s])).toBe('["[REDACTED]"]');
    expect(s.reveal()).toBe('hunter2');
    expect(s.source).toBe('env:TEST');
    expect(isSecret(s)).toBe(true);
    expect(isSecret('hunter2')).toBe(false);
  });
});

describe('resolveCredential', () => {
  it('resolves an env-var reference into a Secret', () => {
    const secret = resolveCredential({ env: 'MY_KEY' }, { MY_KEY: 'abc123' });
    expect(secret?.reveal()).toBe('abc123');
    expect(secret?.source).toBe('env:MY_KEY');
  });

  it('returns undefined when the env var is unset or empty', () => {
    expect(resolveCredential({ env: 'MY_KEY' }, {})).toBeUndefined();
    expect(resolveCredential({ env: 'MY_KEY' }, { MY_KEY: '' })).toBeUndefined();
  });

  it('returns undefined for an absent reference', () => {
    expect(resolveCredential(undefined, {})).toBeUndefined();
  });
});

describe('describeCredentialRef — safe source labels', () => {
  it('describes env and keychain references without revealing anything', () => {
    expect(describeCredentialRef({ env: 'FIREWORKS_API_KEY' })).toBe('env:FIREWORKS_API_KEY');
    expect(
      describeCredentialRef({ keychain: { service: 'glamfire', account: 'anthropic' } }),
    ).toBe('keychain:glamfire/anthropic');
    expect(describeCredentialRef(undefined)).toBe('none');
  });
});

describe('resolveProviderCredential — default provider wiring', () => {
  it('resolves the fireworks key from FIREWORKS_API_KEY via the default credential ref', () => {
    const config = builtinDefaults();
    const secret = resolveProviderCredential(config, 'fireworks', { FIREWORKS_API_KEY: 'fw-key' });
    expect(secret?.reveal()).toBe('fw-key');
    expect(secret?.source).toBe('env:FIREWORKS_API_KEY');
  });

  it('returns undefined for the local provider (no credential by default)', () => {
    const config = builtinDefaults();
    expect(resolveProviderCredential(config, 'local', {})).toBeUndefined();
  });
});
