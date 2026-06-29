import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { getVersion } from '../version.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

describe('version source of truth', () => {
  it('getVersion() matches the VERSION file verbatim', () => {
    const onDisk = readFileSync(join(root, 'VERSION'), 'utf8').trim();
    expect(getVersion()).toBe(onDisk);
  });

  it('returns a valid semver including the patch number', () => {
    expect(getVersion()).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('VERSION and package.json stay in sync (SPEC §9)', () => {
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
    expect(pkg.version).toBe(getVersion());
  });

  it('the real CLI prints the version in its output', () => {
    const out = execFileSync('node', [join(root, 'packages/cli/src/index.mjs'), '--version'], {
      encoding: 'utf8',
    }).trim();
    expect(out).toBe(getVersion());
  });
});
