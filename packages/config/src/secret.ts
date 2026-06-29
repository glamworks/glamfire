// A resolved credential value that refuses to leak (SPEC §8, research/12 §5).
//
// `Secret` wraps a string but its `toString`/`toJSON`/inspect representations
// are all `[REDACTED]`, so it can never be accidentally serialized into a log
// line, an error message, a "show config" dump, or the brain store. The plaintext
// is only reachable through the explicit `.reveal()` accessor at the exact moment
// it is handed to the provider transport.

const REDACTED = '[REDACTED]';

export class Secret {
  readonly #value: string;
  /** Where this secret came from, e.g. `env:FIREWORKS_API_KEY` (safe to display). */
  readonly source: string;

  constructor(value: string, source: string) {
    this.#value = value;
    this.source = source;
  }

  /** Reveal the plaintext. Call this only at the provider boundary. */
  reveal(): string {
    return this.#value;
  }

  toString(): string {
    return REDACTED;
  }

  toJSON(): string {
    return REDACTED;
  }

  // Node's util.inspect / console.log hook — keeps secrets out of debug dumps.
  [Symbol.for('nodejs.util.inspect.custom')](): string {
    return REDACTED;
  }
}

export function isSecret(value: unknown): value is Secret {
  return value instanceof Secret;
}
