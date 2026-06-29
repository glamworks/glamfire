// Credential resolution (SPEC §8). A provider's API key is resolved, on demand,
// from its declared reference — an env var or an OS keychain entry — into a
// redaction-safe `Secret`. The resolution order is explicit and the plaintext is
// never returned bare, logged, or written into the config object.

import { readKeychain } from './keychain.js';
import type { CredentialRef, GlamConfig, ProviderName } from './schema.js';
import { Secret } from './secret.js';

/** A human-readable, secret-free description of where a credential comes from. */
export function describeCredentialRef(ref: CredentialRef | undefined): string {
  if (ref === undefined) return 'none';
  if ('env' in ref) return `env:${ref.env}`;
  return `keychain:${ref.keychain.service}/${ref.keychain.account}`;
}

/**
 * Resolve a credential reference into a `Secret`, or `undefined` if it is not
 * set. Resolution order: the reference picks exactly one source (env var OR
 * keychain entry); we read it and wrap the plaintext so it cannot leak.
 */
export function resolveCredential(
  ref: CredentialRef | undefined,
  env: Record<string, string | undefined> = process.env,
): Secret | undefined {
  if (ref === undefined) return undefined;
  if ('env' in ref) {
    const value = env[ref.env];
    if (value === undefined || value === '') return undefined;
    return new Secret(value, `env:${ref.env}`);
  }
  const value = readKeychain(ref.keychain);
  if (value === undefined || value === '') return undefined;
  return new Secret(value, `keychain:${ref.keychain.service}/${ref.keychain.account}`);
}

/** Resolve a named provider's credential from the loaded config. */
export function resolveProviderCredential(
  config: GlamConfig,
  provider: ProviderName,
  env: Record<string, string | undefined> = process.env,
): Secret | undefined {
  return resolveCredential(config.providers[provider].credential, env);
}

export interface CredentialStatus {
  provider: ProviderName;
  /** Secret-free description of the credential source (e.g. `env:FIREWORKS_API_KEY`). */
  source: string;
  /** Whether the credential currently resolves to a value (never the value itself). */
  resolved: boolean;
}

/**
 * Report, per provider, whether its credential resolves — without ever revealing
 * the secret. Used by `glam config` / `glam doctor`. Keychain reads are skipped
 * here (they can prompt / be slow); their presence is reported as "unknown" by
 * returning resolved=false unless the entry reads cleanly.
 */
export function credentialStatuses(
  config: GlamConfig,
  env: Record<string, string | undefined> = process.env,
): CredentialStatus[] {
  const providers = Object.keys(config.providers) as ProviderName[];
  return providers.map((provider) => {
    const ref = config.providers[provider].credential;
    let resolved = false;
    try {
      resolved = resolveCredential(ref, env) !== undefined;
    } catch {
      // A keychain tool error must not crash `glam config`; report not-resolved.
      resolved = false;
    }
    return { provider, source: describeCredentialRef(ref), resolved };
  });
}
