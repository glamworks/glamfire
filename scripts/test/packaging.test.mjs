// Regression tests for the cross-platform packaging tooling (issue #8).
//
// Pure Node — runs in `npm test` on every OS, no bun required. The heavy "build the
// real artifact and run it" verification lives in scripts/verify-artifacts.mjs
// (driven by the CI `package` job and runnable locally with bun); this file locks in
// the behavior of the manifest renderer, the SBOM generator, and the target matrix.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { BINARY_TARGETS } from '../packaging-common.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const VERSION = readFileSync(join(root, 'VERSION'), 'utf8').trim();

// A fixture checksum line per binary asset (40-char-ish hex stand-ins are fine here;
// the renderer only substitutes them verbatim).
const FIXTURE_SUMS = BINARY_TARGETS.map(
  (t, i) => `${String(i).repeat(64).slice(0, 64)}  ${t.outName}`,
).join('\n');

function withFixture(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'glam-pkg-test-'));
  try {
    const sums = join(dir, 'SHA256SUMS.txt');
    writeFileSync(sums, `${FIXTURE_SUMS}\n`);
    const out = join(dir, 'manifests');
    execFileSync(
      'node',
      [join(root, 'scripts', 'render-manifests.mjs'), '--checksums', sums, '--out', out],
      {
        encoding: 'utf8',
      },
    );
    return fn({ out });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('package-manager manifest rendering', () => {
  it('targets the five shipped platforms', () => {
    expect(BINARY_TARGETS.map((t) => t.id).sort()).toEqual(
      ['darwin-arm64', 'darwin-x64', 'linux-arm64', 'linux-x64', 'windows-x64'].sort(),
    );
  });

  it('renders every manifest with the version and no leftover placeholders', () => {
    withFixture(({ out }) => {
      for (const rel of [
        'homebrew/glamfire.rb',
        'scoop/glamfire.json',
        'winget/Glamworks.Glamfire.yaml',
        'winget/Glamworks.Glamfire.installer.yaml',
        'winget/Glamworks.Glamfire.locale.en-US.yaml',
      ]) {
        const text = readFileSync(join(out, rel), 'utf8');
        expect(text, `${rel} has unresolved placeholder`).not.toMatch(/__VERSION__|__SHA256_/);
        expect(text, `${rel} missing version`).toContain(VERSION);
      }
    });
  });

  it('homebrew formula carries all four desktop checksums and is valid ruby-ish', () => {
    withFixture(({ out }) => {
      const rb = readFileSync(join(out, 'homebrew/glamfire.rb'), 'utf8');
      expect(rb).toContain(`version "${VERSION}"`);
      expect((rb.match(/sha256 "[0-9a-f]{64}"/g) ?? []).length).toBe(4);
      expect(rb).toContain('glam-darwin-arm64');
      expect(rb).toContain('glam-linux-x64');
    });
  });

  it('scoop manifest is valid JSON with the windows checksum + autoupdate', () => {
    withFixture(({ out }) => {
      const j = JSON.parse(readFileSync(join(out, 'scoop/glamfire.json'), 'utf8'));
      expect(j.version).toBe(VERSION);
      expect(j.architecture['64bit'].hash).toMatch(/^[0-9a-f]{64}$/);
      expect(j.architecture['64bit'].bin).toBe('glam.exe');
      expect(j.autoupdate).toBeTruthy();
    });
  });

  it('winget installer manifest references the portable exe + checksum', () => {
    withFixture(({ out }) => {
      const y = readFileSync(join(out, 'winget/Glamworks.Glamfire.installer.yaml'), 'utf8');
      expect(y).toContain('InstallerType: portable');
      expect(y).toMatch(/InstallerSha256: [0-9a-f]{64}/);
      expect(y).toContain('glam-windows-x64.exe');
    });
  });

  it('fails loudly when a checksum is missing (never ships a blank placeholder)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'glam-pkg-bad-'));
    try {
      const sums = join(dir, 'SHA256SUMS.txt');
      writeFileSync(sums, `${'a'.repeat(64)}  glam-darwin-arm64\n`); // missing the rest
      expect(() =>
        execFileSync(
          'node',
          [
            join(root, 'scripts', 'render-manifests.mjs'),
            '--checksums',
            sums,
            '--out',
            join(dir, 'm'),
          ],
          { encoding: 'utf8', stdio: 'pipe' },
        ),
      ).toThrow();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('SBOM generation', () => {
  it('emits a CycloneDX 1.5 document listing the bundled closure', () => {
    const dir = mkdtempSync(join(tmpdir(), 'glam-sbom-'));
    try {
      const out = join(dir, 'sbom.json');
      execFileSync('node', [join(root, 'scripts', 'build-sbom.mjs'), '--out', out], {
        encoding: 'utf8',
      });
      const sbom = JSON.parse(readFileSync(out, 'utf8'));
      expect(sbom.bomFormat).toBe('CycloneDX');
      expect(sbom.specVersion).toBe('1.5');
      expect(sbom.metadata.component.name).toBe('glamfire');
      expect(sbom.metadata.component.version).toBe(VERSION);
      const names = sbom.components.map((c) => c.name);
      for (const dep of ['@glamfire/engine', '@glamfire/router', 'zod', 'smol-toml']) {
        expect(names, `SBOM missing ${dep}`).toContain(dep);
      }
      for (const c of sbom.components) expect(c.purl).toMatch(/^pkg:npm\//);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('npm package manifest shape', () => {
  it('cli package.json declares the publish name and is publish-ready', () => {
    const cli = JSON.parse(readFileSync(join(root, 'packages', 'cli', 'package.json'), 'utf8'));
    expect(cli.dist.publishName).toBe('glamfire');
    expect(cli.engines.node).toBe('>=22');
    expect(cli.publishConfig.access).toBe('public');
    expect(cli.bin.glam).toBeTruthy();
  });
});
