// Install skills into the engine (SPEC §5.5). Composing a set of loaded skills
// yields exactly the two things the neutral engine contract consumes:
//
//   - `system`: a model-NEUTRAL instruction contribution folded into
//     `RunState.system` (so any model, through its adapter, gets the "how to do
//     X" guidance — never a lab-specific prompt hack).
//   - `tools`:  the skills' `ToolSpec`s, registered so every model can call them.
//
// `installSkills` does not modify the engine; it produces values the caller
// passes straight to `runTask({ system, tools })`.

import type { ToolSpec } from '@glamfire/engine';
import type { EpisodeManifest } from './manifest.js';
import type { LoadedSkill } from './skill.js';

/** A neutral preamble framing the installed skills for any model. */
const SKILLS_PREAMBLE =
  'The following skills are installed. Each describes a capability, the tools it ' +
  'provides, and worked examples. Use a skill when the task matches it; call its ' +
  'tools only when their results help, and follow its guidance to produce a ' +
  'correct, verifiable answer.';

/** The product of installing skills: ready for `runTask({ system, tools })`. */
export interface SkillInstallation {
  /** Model-neutral system contribution composed from every skill. */
  system: string;
  /** Every skill's tools, deduplicated by name (collisions throw). */
  tools: ToolSpec[];
  /** The skills that were installed (for verifier lookup, reporting). */
  skills: LoadedSkill[];
}

/** Thrown when two installed skills declare the same tool name. */
export class SkillConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SkillConflictError';
  }
}

function renderEpisodes(episodes: EpisodeManifest[]): string {
  if (episodes.length === 0) return '';
  const lines = episodes.map((ep, i) => {
    const note = ep.note ? `\n   Note: ${ep.note}` : '';
    return `${i + 1}. Goal: ${ep.goal}\n   Response: ${ep.response}${note}`;
  });
  return `\nWorked examples:\n${lines.join('\n')}`;
}

/** Render one skill into its model-neutral system section. */
export function renderSkillSystem(skill: LoadedSkill): string {
  const toolList =
    skill.tools.length > 0 ? `\nTools: ${skill.tools.map((t) => t.name).join(', ')}` : '';
  return [
    `## Skill: ${skill.name} (v${skill.version})`,
    skill.description,
    '',
    skill.instruction.trim(),
    toolList,
    renderEpisodes(skill.episodes),
  ]
    .filter((s) => s !== '')
    .join('\n');
}

export interface InstallOptions {
  /**
   * Base system text to prepend (e.g. the engine's own system prompt). The
   * skill sections are appended after it. Omit to get just the skills block.
   */
  baseSystem?: string;
  /** Override the neutral preamble that introduces the skills block. */
  preamble?: string;
}

/**
 * Compose loaded skills into a `{ system, tools }` installation. Tool-name
 * collisions across skills throw a `SkillConflictError` (the engine's registry
 * also rejects duplicates; we fail earlier with a clearer, multi-skill message).
 */
export function installSkills(skills: LoadedSkill[], opts: InstallOptions = {}): SkillInstallation {
  const tools: ToolSpec[] = [];
  const owner = new Map<string, string>();
  for (const skill of skills) {
    for (const tool of skill.tools) {
      const existing = owner.get(tool.name);
      if (existing !== undefined) {
        throw new SkillConflictError(
          `tool "${tool.name}" is declared by both skill "${existing}" and ` +
            `skill "${skill.name}"; rename one to install them together`,
        );
      }
      owner.set(tool.name, skill.name);
      tools.push(tool);
    }
  }

  const preamble = opts.preamble ?? SKILLS_PREAMBLE;
  const sections = skills.map(renderSkillSystem);
  const skillsBlock = [preamble, '', sections.join('\n\n')].join('\n');
  const system =
    opts.baseSystem !== undefined && opts.baseSystem.trim() !== ''
      ? `${opts.baseSystem.trim()}\n\n${skillsBlock}`
      : skillsBlock;

  return { system, tools, skills };
}
