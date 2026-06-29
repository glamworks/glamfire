#!/usr/bin/env node
// mint.mjs — create + lock down an SPL token for a glamworks community coin
// ($GLAM / $GLAMFIRE). REAL script, REAL money on mainnet.
//
// What it does, in order (the full DIY flow from ../../../research/13-meme-coin.md §9):
//   1. create the SPL mint   (decimals, mint+freeze authority = payer)
//   2. create the treasury ATA and mint the full fixed supply to it
//   3. attach Metaplex Token Metadata (name / symbol / off-chain JSON URI)
//   4. REVOKE mint authority   (supply can never grow — the #1 rug-check signal)
//   5. REVOKE freeze authority  (can't freeze holders; required before a Raydium pool)
// It then prints the manual, off-script steps (seed liquidity, BURN/LOCK LP, make
// metadata immutable) that an operator must still do — see ../RUNBOOK.md.
//
// SAFETY MODEL — this is not a shim, it is a guarded real tool:
//   * Default network is devnet (free, throwaway). Rehearse there first.
//   * mainnet-beta is REFUSED unless BOTH:
//       --i-understand-this-is-irreversible  AND  an interactive typed confirmation.
//     Non-interactive (CI, piped) mainnet runs are impossible by construction.
//   * --dry-run prints every transaction it WOULD send and sends NOTHING. It needs no
//     network and (gracefully) no installed deps, so it is safe to run anywhere.
//   * No secrets live in the repo. You pass a funded keypair file at runtime.
//
// Toolchain (install in THIS folder only — kept out of the product workspace):
//   cd marketing/meme-coin/scripts && npm install
//
// Usage:
//   node mint.mjs --help
//   node mint.mjs --dry-run --name GLAMFIRE --symbol GLAMFIRE --supply 1000000000
//   node mint.mjs --network devnet --name GLAMFIRE --symbol GLAMFIRE --decimals 9 \
//     --supply 1000000000 --uri https://glamworks.dev/glamfire.token.json \
//     --keypair ./devnet-keypair.json --i-have-read ../DISCLAIMER.md
//   # mainnet (interactive, irreversible — see ../RUNBOOK.md):
//   node mint.mjs --network mainnet-beta ...everything above... \
//     --keypair ./mainnet-keypair.json --i-understand-this-is-irreversible

import { existsSync, readFileSync } from 'node:fs';
import { argv, exit, stdin, stdout } from 'node:process';
import { createInterface } from 'node:readline/promises';

// ---------------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------------
const FLAGS = new Set(['dry-run', 'i-understand-this-is-irreversible', 'help', 'h']);

function parseArgs(args) {
  const out = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (!a.startsWith('--') && a !== '-h') continue;
    const key = a === '-h' ? 'h' : a.slice(2);
    if (FLAGS.has(key)) {
      out[key] = true;
      continue;
    }
    const next = args[i + 1];
    if (next !== undefined && !next.startsWith('--')) {
      out[key] = next;
      i++;
    } else {
      out[key] = true;
    }
  }
  return out;
}

const opts = parseArgs(argv.slice(2));

function die(msg) {
  console.error(`mint: ${msg}`);
  exit(1);
}

const HELP = `mint.mjs — create + lock down an SPL community token ($GLAM / $GLAMFIRE)

USAGE
  node mint.mjs [options]

REQUIRED (for a real mint)
  --name <str>          token name   (Metaplex, <=32 bytes)   e.g. GLAMFIRE
  --symbol <str>        token symbol (Metaplex, <=10 bytes)   e.g. GLAMFIRE
  --keypair <path>      funded payer keypair JSON (Solana CLI format)
  --uri <url>           off-chain metadata JSON URL (Arweave/IPFS/HTTPS)
  --i-have-read <path>  path to the disclaimer you have read (../DISCLAIMER.md)

OPTIONS
  --network <net>       devnet | testnet | mainnet-beta       (default: devnet)
  --decimals <n>        token decimals                        (default: 9)
  --supply <n>          whole-token fixed supply              (default: 1000000000)
  --rpc <url>           custom RPC endpoint (overrides the cluster default)
  --dry-run             print every transaction that WOULD be sent; send nothing
  --i-understand-this-is-irreversible   REQUIRED for --network mainnet-beta
  -h, --help            show this help

SAFETY
  * Default network is devnet. Always rehearse on devnet first (free airdrops).
  * mainnet-beta requires --i-understand-this-is-irreversible AND an interactive
    typed confirmation; it cannot be run non-interactively (no CI mainnet mints).
  * Authority revocations and metadata immutability are PERMANENT.
  * After this script: seed liquidity, BURN or LOCK the LP, then make metadata
    immutable. See ../RUNBOOK.md. This script does NOT touch liquidity.

STATUS: the tokens are NOT LIVE. See ../STATUS.md. Do not advertise until live.`;

if (opts.help || opts.h || argv.slice(2).length === 0) {
  stdout.write(`${HELP}\n`);
  exit(0);
}

// ---------------------------------------------------------------------------------
// Validate inputs (shared by dry-run and real runs)
// ---------------------------------------------------------------------------------
const network = opts.network ?? 'devnet';
if (!['devnet', 'testnet', 'mainnet-beta'].includes(network)) {
  die(`unknown --network "${network}" (devnet|testnet|mainnet-beta)`);
}

const dryRun = opts['dry-run'] === true;

for (const req of ['name', 'symbol']) {
  if (!opts[req] || opts[req] === true) die(`missing required --${req}`);
}

const decimals = Number(opts.decimals ?? 9);
if (!Number.isInteger(decimals) || decimals < 0 || decimals > 18) {
  die(`invalid --decimals "${opts.decimals}" (expected integer 0..18)`);
}
let supply;
try {
  supply = BigInt(opts.supply ?? '1000000000');
} catch {
  die(`invalid --supply "${opts.supply}" (expected an integer)`);
}
if (supply <= 0n) die('--supply must be positive');

if (Buffer.byteLength(opts.name) > 32) die('--name exceeds 32 bytes (Metaplex limit)');
if (Buffer.byteLength(opts.symbol) > 10) die('--symbol exceeds 10 bytes (Metaplex limit)');

// Real runs need the disclaimer ack, a keypair, and a metadata URI. Dry runs do not
// (they send nothing), so they can be rehearsed with whatever params you have.
if (!dryRun) {
  if (!opts['i-have-read'] || opts['i-have-read'] === true) {
    die('refused: pass --i-have-read ../DISCLAIMER.md to confirm you read the disclaimer.');
  }
  if (!existsSync(opts['i-have-read'])) {
    die(`--i-have-read path not found: ${opts['i-have-read']}`);
  }
  if (!opts.keypair || opts.keypair === true) die('missing required --keypair');
  if (!opts.uri || opts.uri === true) {
    die('missing required --uri (off-chain metadata JSON URL). Host it first; see RUNBOOK.md.');
  }
  if (Buffer.byteLength(opts.uri) > 200) die('--uri exceeds 200 bytes (Metaplex limit)');
}

// ---------------------------------------------------------------------------------
// HARD MAINNET GUARD — refuse irreversible mainnet action unless explicitly authorized
// AND interactively confirmed. This runs BEFORE any keypair is read or any RPC
// connection is made, so a future change can't accidentally flip to live.
// ---------------------------------------------------------------------------------
async function confirmMainnetOrDie() {
  if (network !== 'mainnet-beta' || dryRun) return;

  if (opts['i-understand-this-is-irreversible'] !== true) {
    die(
      'refused: minting on mainnet-beta is IRREVERSIBLE and spends real SOL. ' +
        'Re-run with --i-understand-this-is-irreversible to proceed.',
    );
  }
  if (!stdin.isTTY) {
    die(
      'refused: mainnet-beta requires an interactive typed confirmation and cannot be ' +
        'run non-interactively (no piped input, no CI). Run it by hand from a terminal.',
    );
  }
  const phrase = `MINT ${opts.symbol} ON MAINNET`;
  const rl = createInterface({ input: stdin, output: stdout });
  try {
    stdout.write(
      `\nYou are about to PERMANENTLY mint ${opts.symbol} on Solana MAINNET with real SOL.\nThis cannot be undone. Authority revocations are permanent.\n`,
    );
    const answer = await rl.question(`Type exactly  ${phrase}  to proceed: `);
    if (answer.trim() !== phrase) {
      die('aborted: confirmation phrase did not match. Nothing was sent.');
    }
  } finally {
    rl.close();
  }
}

// ---------------------------------------------------------------------------------
// Build the transaction plan (used by both dry-run output and the real run summary)
// ---------------------------------------------------------------------------------
function buildPlan({ mintAddr, payerAddr, ataAddr }) {
  const baseUnits = supply * 10n ** BigInt(decimals);
  return [
    {
      step: 1,
      tx: 'CreateMint',
      detail: `mint=${mintAddr} decimals=${decimals} mintAuthority=${payerAddr} freezeAuthority=${payerAddr}`,
    },
    {
      step: 2,
      tx: 'CreateAssociatedTokenAccount',
      detail: `owner=${payerAddr} mint=${mintAddr} ata=${ataAddr}`,
    },
    {
      step: 3,
      tx: 'MintTo',
      detail: `ata=${ataAddr} amount=${supply.toString()} whole tokens (${baseUnits.toString()} base units)`,
    },
    {
      step: 4,
      tx: 'Metaplex createV1 (Token Metadata)',
      detail: `name="${opts.name}" symbol="${opts.symbol}" uri="${opts.uri ?? '<--uri required at real run>'}" standard=Fungible`,
    },
    {
      step: 5,
      tx: 'setAuthority MintTokens -> null',
      detail: `REVOKE mint authority on ${mintAddr} (supply fixed forever; irreversible)`,
    },
    {
      step: 6,
      tx: 'setAuthority FreezeAccount -> null',
      detail: `REVOKE freeze authority on ${mintAddr} (can't freeze holders; irreversible)`,
    },
  ];
}

const MANUAL_NEXT = [
  'Seed liquidity on a reputable DEX/launchpad (Raydium CPMM, or pump.fun/LetsBonk).',
  'BURN or LOCK the LP tokens (burn = strongest signal; Raydium Burn & Earn = lock + earn).',
  'Once artwork/name are final, make Metaplex metadata immutable (updateV1 isMutable:false).',
  'Verify mint+freeze authority = null and LP locked on a block explorer / RugCheck.',
  'Record verified mint address + tx links in ../STATUS.md and flip status to LIVE.',
  'Only AFTER all the above may marketing reference the token (CLAUDE.md §11, research/14).',
];

function printPlan(plan, { mode }) {
  stdout.write(`\n=== ${mode} — transaction plan (network=${network}) ===\n`);
  for (const p of plan) {
    stdout.write(`  [tx ${p.step}] ${p.tx}\n          ${p.detail}\n`);
  }
  stdout.write('\n  Manual steps this script does NOT perform (see ../RUNBOOK.md):\n');
  for (const m of MANUAL_NEXT) stdout.write(`    - ${m}\n`);
  stdout.write('\n');
}

// ---------------------------------------------------------------------------------
// Lazy-load Solana/Metaplex deps. Required for real runs; OPTIONAL for --dry-run so
// the dry run (and the guard test) work on a clean checkout with no node_modules.
// ---------------------------------------------------------------------------------
async function loadDeps() {
  const web3 = await import('@solana/web3.js');
  const splToken = await import('@solana/spl-token');
  const umiBundle = await import('@metaplex-foundation/umi-bundle-defaults');
  const umi = await import('@metaplex-foundation/umi');
  const mpl = await import('@metaplex-foundation/mpl-token-metadata');
  return { web3, splToken, umiBundle, umi, mpl };
}

function endpointFor(deps) {
  if (opts.rpc && opts.rpc !== true) return opts.rpc;
  return deps.web3.clusterApiUrl(network);
}

// ---------------------------------------------------------------------------------
// DRY RUN
// ---------------------------------------------------------------------------------
if (dryRun) {
  let mintAddr = '<mint pubkey — generated at real run>';
  let payerAddr = '<payer pubkey — from --keypair at real run>';
  let ataAddr = '<treasury ATA — derived at real run>';
  let depsNote = '';

  try {
    const deps = await loadDeps();
    const { Keypair } = deps.web3;
    const { getAssociatedTokenAddressSync } = deps.splToken;
    // Real, deterministic preview when deps are installed: show the actual addresses
    // that WOULD be created. Payer comes from --keypair if given, else an ephemeral
    // key (dry run only — never written, never funded).
    const mintKp = Keypair.generate();
    let payerKp;
    if (opts.keypair && opts.keypair !== true && existsSync(opts.keypair)) {
      payerKp = Keypair.fromSecretKey(
        Uint8Array.from(JSON.parse(readFileSync(opts.keypair, 'utf8'))),
      );
    } else {
      payerKp = Keypair.generate();
    }
    mintAddr = mintKp.publicKey.toBase58();
    payerAddr = payerKp.publicKey.toBase58();
    ataAddr = getAssociatedTokenAddressSync(mintKp.publicKey, payerKp.publicKey).toBase58();
  } catch {
    depsNote =
      '  (note: Solana deps not installed — addresses shown symbolically. ' +
      'Run `npm install` in this folder to preview real generated addresses.)\n';
  }

  if (depsNote) stdout.write(`\n${depsNote}`);
  printPlan(buildPlan({ mintAddr, payerAddr, ataAddr }), { mode: 'DRY RUN' });
  stdout.write('DRY RUN complete. No transactions were sent. No SOL was spent.\n');
  exit(0);
}

// ---------------------------------------------------------------------------------
// REAL RUN (devnet by default; mainnet only past the guard above)
// ---------------------------------------------------------------------------------
await confirmMainnetOrDie();

let deps;
try {
  deps = await loadDeps();
} catch (err) {
  die(
    `dependencies missing. Run \`npm install\` in marketing/meme-coin/scripts first.\n       (${err.message})`,
  );
}

const { Connection, Keypair, LAMPORTS_PER_SOL } = deps.web3;
const { createMint, getOrCreateAssociatedTokenAccount, mintTo, setAuthority, AuthorityType } =
  deps.splToken;
const { createUmi } = deps.umiBundle;
const { createSignerFromKeypair, signerIdentity, percentAmount, publicKey } = deps.umi;
const { createV1, mplTokenMetadata, TokenStandard } = deps.mpl;

if (!existsSync(opts.keypair)) die(`--keypair file not found: ${opts.keypair}`);
let payer;
try {
  payer = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(opts.keypair, 'utf8'))));
} catch (err) {
  die(`could not load --keypair: ${err.message}`);
}

const connection = new Connection(endpointFor(deps), 'confirmed');

console.error(`mint: network=${network} endpoint=${endpointFor(deps)}`);
console.error(`mint: payer=${payer.publicKey.toBase58()}`);

const balance = await connection.getBalance(payer.publicKey);
console.error(`mint: payer balance=${(balance / LAMPORTS_PER_SOL).toFixed(6)} SOL`);
if (balance === 0) {
  if (network === 'devnet') {
    console.error('mint: balance is 0 — requesting a devnet airdrop (2 SOL)...');
    try {
      const sig = await connection.requestAirdrop(payer.publicKey, 2 * LAMPORTS_PER_SOL);
      await connection.confirmTransaction(sig, 'confirmed');
      console.error('mint: airdrop confirmed.');
    } catch (err) {
      die(`devnet airdrop failed (faucet may be rate-limited): ${err.message}`);
    }
  } else {
    die('payer balance is 0 — fund the keypair before minting.');
  }
}

console.error(`mint: creating ${opts.symbol} (${opts.name}) decimals=${decimals} supply=${supply}`);

// 1) create mint, 2) ATA, 3) mint full supply
const mint = await createMint(connection, payer, payer.publicKey, payer.publicKey, decimals);
const ata = await getOrCreateAssociatedTokenAccount(connection, payer, mint, payer.publicKey);
const baseUnits = supply * 10n ** BigInt(decimals);
await mintTo(connection, payer, mint, ata.address, payer, baseUnits);
console.error(`mint: minted supply to treasury ATA ${ata.address.toBase58()}`);

// 4) Metaplex Token Metadata
const umi = createUmi(endpointFor(deps)).use(mplTokenMetadata());
const umiKeypair = umi.eddsa.createKeypairFromSecretKey(payer.secretKey);
umi.use(signerIdentity(createSignerFromKeypair(umi, umiKeypair)));
await createV1(umi, {
  mint: publicKey(mint.toBase58()),
  authority: umi.identity,
  name: opts.name,
  symbol: opts.symbol,
  uri: opts.uri,
  sellerFeeBasisPoints: percentAmount(0),
  decimals,
  tokenStandard: TokenStandard.Fungible,
}).sendAndConfirm(umi);
console.error('mint: attached Metaplex Token Metadata');

// 5) revoke mint authority, 6) revoke freeze authority (irreversible trust signals)
await setAuthority(connection, payer, mint, payer, AuthorityType.MintTokens, null);
console.error('mint: REVOKED mint authority (supply fixed forever)');
await setAuthority(connection, payer, mint, payer, AuthorityType.FreezeAccount, null);
console.error('mint: REVOKED freeze authority (holders can never be frozen)');

const explorerBase = 'https://explorer.solana.com/address/';
const cluster = network === 'mainnet-beta' ? '' : `?cluster=${network}`;

console.log(
  JSON.stringify(
    {
      network,
      name: opts.name,
      symbol: opts.symbol,
      mint: mint.toBase58(),
      treasuryTokenAccount: ata.address.toBase58(),
      decimals,
      supply: supply.toString(),
      mintAuthority: 'revoked (null)',
      freezeAuthority: 'revoked (null)',
      metadataUri: opts.uri,
      explorer: `${explorerBase}${mint.toBase58()}${cluster}`,
      next: MANUAL_NEXT,
    },
    null,
    2,
  ),
);
