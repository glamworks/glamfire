# Mint runbook (operator-only)

Minting touches **real money** and **cannot be fully automated in CI** — it needs a
funded mainnet wallet and human judgement. Do a full dry run on **devnet** first.

## Prerequisites

- A dedicated Solana keypair (hardware-backed if possible), funded with SOL.
- Tooling: Node ≥22 and either the Solana CLI + `spl-token` CLI, or the scripted path
  below (`@solana/web3.js`, `@solana/spl-token`, Metaplex Umi for metadata).
- The token spec on [`README.md`](README.md) finalized publicly (supply, split,
  treasury) **before** you start.

## Devnet dry run (free, do this first)

```bash
solana config set --url devnet
solana-keygen new --outfile ./devnet-keypair.json     # throwaway
solana airdrop 2
node scripts/mint.mjs --network devnet --name "GLAM" --symbol GLAM \
  --decimals 9 --supply 1000000000 --keypair ./devnet-keypair.json
```

Verify on the devnet explorer. Repeat for GLAMFIRE. Practice: add Metaplex metadata,
seed a test pool, **revoke mint + freeze authority**, **burn/lock LP**.

## Mainnet launch (irreversible — measure twice)

1. `solana config set --url mainnet-beta`; fund the real keypair.
2. Run `scripts/mint.mjs` for each token with the finalized params and the **real**
   keypair. The script refuses to run without `--i-have-read ../DISCLAIMER.md`.
3. Attach Metaplex metadata (name, symbol, logo `glamworks-logo.png`, link to repo).
4. Seed liquidity on a reputable launchpad/DEX; **burn or lock the LP**; link the lock.
5. **Revoke mint authority and freeze authority.** Verify on-chain.
6. Record verified mint addresses + tx links in [`STATUS.md`](STATUS.md); flip to LIVE;
   commit + push + tag.
7. Announce from official channels only. Now — and only now — marketing may reference
   the tokens.

## Hard stops

- Never mint mainnet from a hot CI key. Never expose the keypair in logs/repo.
- Never flip `STATUS.md` to LIVE until authorities are revoked and LP is locked/burned.
- Never promise utility, returns, or governance-over-software. (research/14)
