// Real OS keychain reads — no shim. Each platform shells out to its native
// secret store and returns the stored password, or `undefined` when the entry
// does not exist (a real, expected outcome, not an error).
//
//   macOS   → `security find-generic-password -s <service> -a <account> -w`
//   Linux   → `secret-tool lookup service <service> account <account>` (libsecret)
//   Windows → PowerShell + Win32 CredRead (Credential Manager generic credential)
//
// The secret value is read from the child's stdout and never logged. When the
// platform tool is missing we throw an actionable ConfigError telling the user
// exactly which dependency to install — we never silently fall back.

import { execFileSync } from 'node:child_process';
import { platform } from 'node:process';
import { ConfigError } from './errors.js';

export interface KeychainRef {
  /** Service / target name the credential is stored under. */
  service: string;
  /** Account / username the credential is stored under. */
  account: string;
}

function notFound(err: unknown): boolean {
  // execFileSync throws with a `.status` for non-zero exits. macOS `security`
  // returns 44 when the item is not found; libsecret/PowerShell return non-zero
  // generically. A missing entry is not an error to us — it just means "not set".
  const status = (err as { status?: number } | null)?.status;
  return typeof status === 'number' && status !== 0;
}

/**
 * Read a generic password from the OS keychain. Returns the plaintext value, or
 * `undefined` if no such entry exists. Throws ConfigError only when the platform
 * keychain tooling itself is unavailable.
 */
export function readKeychain(ref: KeychainRef): string | undefined {
  try {
    if (platform === 'darwin') {
      const out = execFileSync(
        'security',
        ['find-generic-password', '-s', ref.service, '-a', ref.account, '-w'],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
      );
      const trimmed = out.replace(/\n$/, '');
      return trimmed.length > 0 ? trimmed : undefined;
    }

    if (platform === 'linux') {
      const out = execFileSync(
        'secret-tool',
        ['lookup', 'service', ref.service, 'account', ref.account],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
      );
      const trimmed = out.replace(/\n$/, '');
      return trimmed.length > 0 ? trimmed : undefined;
    }

    if (platform === 'win32') {
      // Read the generic credential via Win32 CredRead through PowerShell. The
      // password blob is UTF-16LE; we decode and print it for capture on stdout.
      const target = `${ref.service}/${ref.account}`;
      const script = [
        '$ErrorActionPreference = "Stop"',
        'Add-Type -Namespace Glam -Name Native -MemberDefinition @"',
        '[DllImport("advapi32.dll", CharSet=CharSet.Unicode, SetLastError=true)]',
        'public static extern bool CredRead(string target, int type, int flags, out IntPtr credential);',
        '[DllImport("advapi32.dll")] public static extern void CredFree(IntPtr cred);',
        '"@',
        '$ptr = [IntPtr]::Zero',
        `if (-not [Glam.Native]::CredRead("${target}", 1, 0, [ref]$ptr)) { exit 44 }`,
        'try {',
        '  $blobSize = [Runtime.InteropServices.Marshal]::ReadInt32($ptr, 24)',
        '  $blobPtr = [Runtime.InteropServices.Marshal]::ReadIntPtr($ptr, 32)',
        '  if ($blobSize -le 0) { exit 44 }',
        '  $bytes = New-Object byte[] $blobSize',
        '  [Runtime.InteropServices.Marshal]::Copy($blobPtr, $bytes, 0, $blobSize)',
        '  [Console]::Out.Write([Text.Encoding]::Unicode.GetString($bytes))',
        '} finally { [Glam.Native]::CredFree($ptr) }',
      ].join('\n');
      const out = execFileSync(
        'powershell',
        ['-NoProfile', '-NonInteractive', '-Command', script],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
      );
      return out.length > 0 ? out : undefined;
    }

    throw new ConfigError(
      'CONFIG_CREDENTIAL',
      `OS keychain credential resolution is not supported on platform "${platform}". Use an env-var credential reference instead, e.g. credential = { env = "FIREWORKS_API_KEY" }.`,
    );
  } catch (err) {
    if (err instanceof ConfigError) throw err;
    if (notFound(err)) return undefined;
    const tool =
      platform === 'darwin'
        ? '`security` (built into macOS)'
        : platform === 'linux'
          ? '`secret-tool` from libsecret (e.g. `apt install libsecret-tools`)'
          : '`powershell`';
    throw new ConfigError(
      'CONFIG_CREDENTIAL',
      `failed to read the OS keychain (service="${ref.service}", account="${ref.account}"). ` +
        `This requires ${tool}. Install it, or use an env-var credential reference instead.`,
      { cause: err },
    );
  }
}
