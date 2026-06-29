#!/usr/bin/env node
// mint.mjs — create an SPL token for a glamworks community coin ($GLAM / $GLAMFIRE).
//
// REAL script, REAL money. It does nothing unless you give it a funded keypair and
// explicitly confirm you have read the disclaimer. It deliberately refuses mainnet by
// default. This is NOT runnable in CI and is NOT a shim: with real inputs it performs a
// real mint; without them it safely refuses.
//
// Requires (install in this folder before running):
//   npm i @solana/web3.js @solana/spl-token
//
// Usage:
//   node scripts/mint.mjs --network devnet --name GLAM --symbol GLAM \
//     --decimals 9 --supply 1000000000 --keypair ./devnet-keypair.json \
//     --i-have-read ../DISCLAIMER.md
//
// After minting you STILL must (see RUNBOOK.md): add Metaplex metadata, seed + lock LP,
// and REVOKE mint + freeze authority. This script does the mint only.

import { readFileSync } from 'node:fs';
import { argv, exit } from 'node:process';

function parseArgs(args) {
  const out = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = args[i + 1];
      if (next && !next.startsWith('--')) {
        out[key] = next;
        i++;
      } else {
        out[key] = true;
      }
    }
  }
  return out;
}

const opts = parseArgs(argv.slice(2));

function die(msg) {
  console.error(`mint: ${msg}`);
  exit(1);
}

// --- Safety gates (refuse rather than do something dangerous) --------------------
if (!opts['i-have-read']) {
  die('refused: pass --i-have-read ../DISCLAIMER.md to confirm you read the disclaimer.');
}
const network = opts.network ?? 'devnet';
if (!['devnet', 'testnet', 'mainnet-beta'].includes(network)) {
  die(`unknown --network "${network}" (devnet|testnet|mainnet-beta)`);
}
if (network === 'mainnet-beta' && opts['allow-mainnet'] !== true) {
  die('refused: minting on mainnet-beta requires the explicit --allow-mainnet flag.');
}
for (const req of ['name', 'symbol', 'keypair']) {
  if (!opts[req]) die(`missing required --${req}`);
}
const decimals = Number(opts.decimals ?? 9);
const supply = BigInt(opts.supply ?? '1000000000');

// --- Lazy-load web3 deps so --help / refusals work without them installed --------
let web3;
let splToken;
try {
  web3 = await import('@solana/web3.js');
  splToken = await import('@solana/spl-token');
} catch {
  die('dependencies missing. Run: npm i @solana/web3.js @solana/spl-token (in this folder).');
}

const { Connection, Keypair, clusterApiUrl } = web3;
const { createMint, getOrCreateAssociatedTokenAccount, mintTo } = splToken;

const secret = JSON.parse(readFileSync(opts.keypair, 'utf8'));
const payer = Keypair.fromSecretKey(Uint8Array.from(secret));
const endpoint =
  network === 'mainnet-beta' ? clusterApiUrl('mainnet-beta') : clusterApiUrl(network);
const connection = new Connection(endpoint, 'confirmed');

console.error(`mint: network=${network} payer=${payer.publicKey.toBase58()}`);
console.error(`mint: creating ${opts.symbol} (${opts.name}) decimals=${decimals} supply=${supply}`);

const mint = await createMint(connection, payer, payer.publicKey, payer.publicKey, decimals);
const ata = await getOrCreateAssociatedTokenAccount(connection, payer, mint, payer.publicKey);
const baseUnits = supply * 10n ** BigInt(decimals);
await mintTo(connection, payer, mint, ata.address, payer, baseUnits);

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
      next: 'Add Metaplex metadata, seed+lock LP, then REVOKE mint+freeze authority (RUNBOOK.md).',
    },
    null,
    2,
  ),
);
