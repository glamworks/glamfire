// @glamfire/skills — open skills, portable model-agnostic capability packs
// (SPEC §5.5). Public surface: the manifest format + validation, the on-disk
// loader, the verifier model, and the engine installer.

export {
  type SkillManifest,
  type SkillToolManifest,
  type EpisodeManifest,
  type RubricManifest,
  skillManifestSchema,
  skillToolSchema,
  episodeSchema,
  rubricSchema,
  parseManifest,
  SkillManifestError,
} from './manifest.js';
export type { LoadedSkill } from './skill.js';
export {
  type VerifierFn,
  type VerifierResult,
  type VerifierContext,
  runRubric,
  rubricVerifier,
} from './verifier.js';
export {
  MANIFEST_FILENAME,
  loadSkill,
  discoverSkills,
  skillDirName,
} from './loader.js';
export {
  type SkillInstallation,
  type InstallOptions,
  installSkills,
  renderSkillSystem,
  SkillConflictError,
} from './install.js';
