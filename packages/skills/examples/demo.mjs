#!/usr/bin/env node
// Real demo of @glamfire/skills (SPEC §5.5). No mocks, no provider key needed.
//
//   node packages/skills/examples/demo.mjs
//
// It loads the shipped example skill from disk, installs it into the engine
// contract (system + tools), runs the skill's real tool on a sample, prints the
// resolved system+tools a model would receive, and runs the skill's verifier on
// a sample output. Build first: `pnpm --filter @glamfire/skills build`.

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { installSkills, loadSkill } from '@glamfire/skills';

const here = dirname(fileURLToPath(import.meta.url));
const skillDir = join(here, 'code-explainer');

const SAMPLE = ['export function add(a, b) { return a + b; }', 'export class Calculator {}'].join(
  '\n',
);

const skill = await loadSkill(skillDir);
const install = installSkills([skill]);

console.log('=== Loaded skill ===');
console.log(`name:        ${skill.name}`);
console.log(`version:     ${skill.version}`);
console.log(`description: ${skill.description}`);
console.log(`portable dir:${skill.dir}`);
console.log(`tools:       ${skill.tools.map((t) => `${t.name} [${t.permission}]`).join(', ')}`);
console.log(`verifier:    ${skill.verifier ? 'present' : 'none'}`);

console.log('\n=== Resolved system contribution (model-neutral) ===');
console.log(install.system);

console.log('\n=== Resolved tools (engine-native ToolSpecs) ===');
for (const t of install.tools) {
  console.log(`- ${t.name} [${t.permission}]: ${t.description}`);
  console.log(`  parameters: ${JSON.stringify(t.parameters)}`);
}

console.log('\n=== Running the skill tool for real ===');
const outline = await install.tools[0].handler(
  { code: SAMPLE, language: 'javascript' },
  {
    cwd: process.cwd(),
  },
);
console.log(JSON.stringify(outline, null, 2));

console.log('\n=== Running the verifier on a sample output ===');
const task = { goal: 'Explain the code', inputs: { source: SAMPLE }, budget: {} };
const good =
  'Summary: add returns the sum of two numbers; Calculator is a placeholder class.\n' +
  '- add(a, b): returns a + b. Inputs: two numbers. Output: their sum.\n' +
  '- Calculator: an empty class, no behavior yet.';
const bad = 'It does some math, looks fine to me.';
const goodVerdict = await skill.verifier(good, task ? { task } : undefined);
const badVerdict = await skill.verifier(bad, { task });
console.log(`grounded explanation -> passed=${goodVerdict.passed} score=${goodVerdict.score}`);
console.log(`  ${goodVerdict.detail}`);
console.log(`hand-wavy explanation -> passed=${badVerdict.passed} score=${badVerdict.score}`);
console.log(`  ${badVerdict.detail}`);

console.log('\nOK: skill loaded, installed, tool ran, verifier ran.');
