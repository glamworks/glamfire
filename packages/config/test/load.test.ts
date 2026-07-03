// Real, hermetic tests for the layered config loader. Each test writes actual
// TOML files into a temp HOME / project tree and asserts precedence, provenance,
// upward project-config discovery, env overrides, and actionable failures.
// No mocks: real files, real TOML parsing, real zod validation.

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ConfigError, describeConfig, findProjectConfig, loadConfig } from '@glamfire/config';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

let root: string;
let home: string;
let project: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'glam-config-'));
  home = join(root, 'home');
  project = join(root, 'project');
  mkdirSync(join(home, '.glam'), { recursive: true });
  mkdirSync(join(project, 'nested', 'deep'), { recursive: true });
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

const writeUser = (toml: string) => writeFileSync(join(home, '.glam', 'config.toml'), toml);
const writeProject = (toml: string) => writeFileSync(join(project, 'glam.toml'), toml);

describe('built-in defaults (zero config files)', () => {
  it('returns a complete, valid config with no files present', () => {
    const loaded = loadConfig({ cwd: project, home, env: {} });
    expect(loaded.config.model).toBe('accounts/fireworks/models/glm-5p2');
    expect(loaded.config.run.effort).toBe('high');
    expect(loaded.config.run.tier).toBe('standard');
    expect(loaded.config.permissions.read).toBe('allow');
    expect(loaded.config.permissions.exec).toBe('deny');
    expect(loaded.provenance.model).toBe('default');
    expect(loaded.sources).toEqual({ user: null, project: null });
  });
});

describe('providers: second inference provider (Together AI, research/23)', () => {
  it('ships a wired-but-unlisted together provider by default', () => {
    const loaded = loadConfig({ cwd: project, home, env: {} });
    const together = loaded.config.providers.together;
    expect(together.baseUrl).toBe('https://api.together.xyz/v1');
    // Unlisted by default (like anthropic): nothing is registered unasked.
    expect(together.models).toEqual([]);
    expect(together.credential).toEqual({ env: 'TOGETHER_API_KEY' });
  });

  it('lets a project list GLM-5.2 + Qwen3-Coder-Next on Together', () => {
    writeProject('[providers.together]\nmodels = ["zai-org/GLM-5.2", "Qwen/Qwen3-Coder-Next"]\n');
    const loaded = loadConfig({ cwd: project, home, env: {} });
    expect(loaded.config.providers.together.models).toEqual([
      'zai-org/GLM-5.2',
      'Qwen/Qwen3-Coder-Next',
    ]);
    expect(loaded.provenance['providers.together.models']).toBe('project');
  });
});

describe('layer precedence: default < user < project < env < override', () => {
  it('user config overrides defaults', () => {
    writeUser('model = "user-model"\n[run]\neffort = "max"\n');
    const loaded = loadConfig({ cwd: project, home, env: {} });
    expect(loaded.config.model).toBe('user-model');
    expect(loaded.provenance.model).toBe('user');
    expect(loaded.config.run.effort).toBe('max');
    expect(loaded.provenance['run.effort']).toBe('user');
    // untouched leaves keep default provenance
    expect(loaded.provenance['run.tier']).toBe('default');
  });

  it('project config overrides user config', () => {
    writeUser('model = "user-model"\n');
    writeProject('model = "project-model"\n');
    const loaded = loadConfig({ cwd: project, home, env: {} });
    expect(loaded.config.model).toBe('project-model');
    expect(loaded.provenance.model).toBe('project');
  });

  it('environment variables override project config', () => {
    writeProject('model = "project-model"\n');
    const loaded = loadConfig({ cwd: project, home, env: { GLAM_MODEL: 'env-model' } });
    expect(loaded.config.model).toBe('env-model');
    expect(loaded.provenance.model).toBe('env');
  });

  it('explicit overrides (CLI flags) beat everything', () => {
    writeProject('model = "project-model"\n');
    const loaded = loadConfig({
      cwd: project,
      home,
      env: { GLAM_MODEL: 'env-model' },
      overrides: { model: 'flag-model' },
    });
    expect(loaded.config.model).toBe('flag-model');
    expect(loaded.provenance.model).toBe('override');
  });

  it('merges leaves from different layers without clobbering siblings', () => {
    writeUser('[run]\neffort = "max"\n');
    writeProject('[run]\ntemperature = 0.9\n');
    const loaded = loadConfig({
      cwd: project,
      home,
      env: { GLAM_TIER: 'priority' },
    });
    expect(loaded.config.run.effort).toBe('max'); // user
    expect(loaded.provenance['run.effort']).toBe('user');
    expect(loaded.config.run.temperature).toBe(0.9); // project
    expect(loaded.provenance['run.temperature']).toBe('project');
    expect(loaded.config.run.tier).toBe('priority'); // env
    expect(loaded.provenance['run.tier']).toBe('env');
  });
});

describe('upward project-config discovery', () => {
  it('finds ./glam.toml by searching upward from a nested cwd', () => {
    writeProject('model = "found-by-search"\n');
    const deep = join(project, 'nested', 'deep');
    expect(findProjectConfig(deep)).toBe(join(project, 'glam.toml'));
    const loaded = loadConfig({ cwd: deep, home, env: {} });
    expect(loaded.config.model).toBe('found-by-search');
    expect(loaded.sources.project).toBe(join(project, 'glam.toml'));
  });

  it('returns null when no project config exists in any ancestor', () => {
    expect(findProjectConfig(join(project, 'nested', 'deep'))).toBeNull();
  });
});

describe('actionable failures (never a silent fallback)', () => {
  it('reports an invalid enum value with the field and the source file', () => {
    writeProject('[run]\neffort = "turbo"\n');
    let err: unknown;
    try {
      loadConfig({ cwd: project, home, env: {} });
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(ConfigError);
    const ce = err as ConfigError;
    expect(ce.code).toBe('CONFIG_INVALID');
    expect(ce.message).toContain('run.effort');
    expect(ce.message).toContain('glam.toml');
    expect(ce.file).toBe(join(project, 'glam.toml'));
  });

  it('reports a TOML parse error with the offending file', () => {
    writeProject('model = \n');
    let err: unknown;
    try {
      loadConfig({ cwd: project, home, env: {} });
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(ConfigError);
    expect((err as ConfigError).code).toBe('CONFIG_TOML_PARSE');
    expect((err as ConfigError).file).toBe(join(project, 'glam.toml'));
  });

  it('rejects an unrecognized key (typo) with a strict-schema error', () => {
    writeProject('modle = "typo"\n');
    expect(() => loadConfig({ cwd: project, home, env: {} })).toThrow(ConfigError);
  });

  it('rejects an unparseable numeric env var with an actionable message', () => {
    let err: unknown;
    try {
      loadConfig({ cwd: project, home, env: { GLAM_MAX_USD: 'lots' } });
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(ConfigError);
    expect((err as ConfigError).message).toContain('run.budget.maxUsd');
    expect((err as ConfigError).message).toContain('[from env]');
  });
});

describe('display view (glam config) — redaction-safe', () => {
  it('flattens leaves with provenance and never includes a secret value', () => {
    writeProject('[providers.fireworks]\ncredential = { env = "FIREWORKS_API_KEY" }\n');
    const loaded = loadConfig({
      cwd: project,
      home,
      env: { FIREWORKS_API_KEY: 'sk-super-secret-xyz' },
    });
    const view = describeConfig(loaded, { FIREWORKS_API_KEY: 'sk-super-secret-xyz' });

    // The secret value never appears anywhere in the display payload.
    const serialized = JSON.stringify(view);
    expect(serialized).not.toContain('sk-super-secret-xyz');

    // Credential availability is reported as a boolean, with a safe source label.
    const fw = view.credentials.find((c) => c.provider === 'fireworks');
    expect(fw).toBeDefined();
    expect(fw?.source).toBe('env:FIREWORKS_API_KEY');
    expect(fw?.resolved).toBe(true);

    // The credential reference (env var NAME, not value) is shown as one atomic
    // leaf row — never the secret value.
    const refRow = view.rows.find((r) => r.path === 'providers.fireworks.credential');
    expect(refRow?.value).toBe('{"env":"FIREWORKS_API_KEY"}');
  });

  it('replaces a credential reference wholesale across layers (env -> keychain)', () => {
    // defaults set fireworks.credential = { env: ... }; a project switch to a
    // keychain ref must REPLACE it, not deep-merge into an invalid {env,keychain}.
    writeProject(
      '[providers.fireworks]\ncredential = { keychain = { service = "glamfire", account = "fw" } }\n',
    );
    const loaded = loadConfig({ cwd: project, home, env: {} });
    expect(loaded.config.providers.fireworks.credential).toEqual({
      keychain: { service: 'glamfire', account: 'fw' },
    });
    expect(loaded.provenance['providers.fireworks.credential']).toBe('project');
  });

  it('reports a missing credential as unresolved (no value leak)', () => {
    const loaded = loadConfig({ cwd: project, home, env: {} });
    const view = describeConfig(loaded, {});
    const fw = view.credentials.find((c) => c.provider === 'fireworks');
    expect(fw?.resolved).toBe(false);
  });
});

describe('usage & billing config ([usage] — the ledger budget keys)', () => {
  it('defaults: no monthly budget (opt-in alerting), warnAtPct 80', () => {
    const loaded = loadConfig({ cwd: project, home, env: {} });
    expect(loaded.config.usage.monthlyBudgetUsd).toBeUndefined();
    expect(loaded.config.usage.warnAtPct).toBe(80);
  });

  it('a project can set the monthly budget and warn threshold', () => {
    writeProject('[usage]\nmonthlyBudgetUsd = 25.0\nwarnAtPct = 50\n');
    const loaded = loadConfig({ cwd: project, home, env: {} });
    expect(loaded.config.usage.monthlyBudgetUsd).toBe(25);
    expect(loaded.config.usage.warnAtPct).toBe(50);
    expect(loaded.provenance['usage.monthlyBudgetUsd']).toBe('project');
  });

  it('env vars GLAM_MONTHLY_BUDGET_USD / GLAM_WARN_AT_PCT bind to [usage]', () => {
    const loaded = loadConfig({
      cwd: project,
      home,
      env: { GLAM_MONTHLY_BUDGET_USD: '12.5', GLAM_WARN_AT_PCT: '90' },
    });
    expect(loaded.config.usage.monthlyBudgetUsd).toBe(12.5);
    expect(loaded.config.usage.warnAtPct).toBe(90);
    expect(loaded.provenance['usage.monthlyBudgetUsd']).toBe('env');
  });

  it('fails loud on an out-of-range warnAtPct, naming the field and file', () => {
    writeProject('[usage]\nwarnAtPct = 150\n');
    try {
      loadConfig({ cwd: project, home, env: {} });
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ConfigError);
      const message = (err as ConfigError).message;
      expect(message).toContain('usage.warnAtPct');
      expect((err as ConfigError).file).toContain('glam.toml');
    }
  });

  it('fails loud on a non-positive monthly budget', () => {
    writeProject('[usage]\nmonthlyBudgetUsd = -5\n');
    expect(() => loadConfig({ cwd: project, home, env: {} })).toThrow(/usage.monthlyBudgetUsd/);
  });
});

describe('memory config ([memory] — the brain in the run loop, issue #27)', () => {
  it('defaults: memory on, project store implied, sane recall caps', () => {
    const loaded = loadConfig({ cwd: project, home, env: {} });
    expect(loaded.config.memory.enabled).toBe(true);
    expect(loaded.config.memory.store).toBeUndefined();
    expect(loaded.config.memory.recallLimit).toBe(6);
    expect(loaded.config.memory.recallTokenBudget).toBe(1200);
    expect(loaded.provenance['memory.enabled']).toBe('default');
  });

  it('a project can disable memory and tune the recall caps + store path', () => {
    writeProject(
      '[memory]\nenabled = false\nstore = "shared/brain.db"\nrecallLimit = 12\nrecallTokenBudget = 2048\n',
    );
    const loaded = loadConfig({ cwd: project, home, env: {} });
    expect(loaded.config.memory.enabled).toBe(false);
    expect(loaded.config.memory.store).toBe('shared/brain.db');
    expect(loaded.config.memory.recallLimit).toBe(12);
    expect(loaded.config.memory.recallTokenBudget).toBe(2048);
    expect(loaded.provenance['memory.enabled']).toBe('project');
  });

  it('GLAM_MEMORY=false binds to memory.enabled (boolean env kind)', () => {
    const loaded = loadConfig({ cwd: project, home, env: { GLAM_MEMORY: 'false' } });
    expect(loaded.config.memory.enabled).toBe(false);
    expect(loaded.provenance['memory.enabled']).toBe('env');
    const on = loadConfig({ cwd: project, home, env: { GLAM_MEMORY: '1' } });
    expect(on.config.memory.enabled).toBe(true);
  });

  it('rejects an unparseable GLAM_MEMORY value loudly (never a silent drop)', () => {
    expect(() => loadConfig({ cwd: project, home, env: { GLAM_MEMORY: 'maybe' } })).toThrow(
      /memory.enabled/,
    );
  });

  it('fails loud on an out-of-range recallLimit, naming the field and file', () => {
    writeProject('[memory]\nrecallLimit = 0\n');
    expect(() => loadConfig({ cwd: project, home, env: {} })).toThrow(/memory.recallLimit/);
  });
});
