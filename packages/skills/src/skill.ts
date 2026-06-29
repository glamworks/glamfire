// The in-memory shape of a loaded, resolved skill: manifest metadata plus the
// engine-native `ToolSpec`s (handlers resolved from the module) and a callable
// verifier. This is what `installSkills` composes onto a `RunState`.

import type { ToolSpec } from '@glamfire/engine';
import type { EpisodeManifest } from './manifest.js';
import type { VerifierFn } from './verifier.js';

/** A fully loaded, ready-to-install skill. */
export interface LoadedSkill {
  name: string;
  version: string;
  description: string;
  /** Resolved model-neutral instruction text (inline or read from a file). */
  instruction: string;
  /** Engine-native tools — handlers already resolved from the skill module. */
  tools: ToolSpec[];
  /** Few-shot example episodes rendered into the system contribution. */
  episodes: EpisodeManifest[];
  /** Callable verifier (function or rubric-wrapped), if the skill declares one. */
  verifier?: VerifierFn;
  /** Absolute path to the skill's source directory (it is self-contained). */
  dir: string;
}
