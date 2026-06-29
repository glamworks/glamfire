# $GLAM & $GLAMFIRE — community token spec

> **The software never depends on these tokens.** glamfire works fully without any
> token, wallet, or chain. The tokens are a *community/culture layer* only.
>
> **STATUS: NOT LIVE.** See [`STATUS.md`](STATUS.md). **Do not advertise the tokens
> anywhere until `STATUS.md` says LIVE** and lists verified mint addresses. This is a
> hard rule (CLAUDE.md §11, [`../../research/14-crypto-legal-risk.md`](../../research/14-crypto-legal-risk.md)).

This document specifies the two community tokens. It is a spec, not a launch order.

## Identity

| | $GLAM | $GLAMFIRE |
|---|---|---|
| Belongs to | **glamworks** (the org/brand) | **glamfire** (the product) |
| Vibe | the movement: "own your last mile" | the workhorse: GLM + Fireworks |
| Chain | Solana | Solana |
| Standard | SPL Token (Token Program; Token-2022 optional for metadata) | SPL Token |
| Decimals | 9 (Solana convention) | 9 |
| Supply | 1,000,000,000 (fixed; mint authority revoked at launch) | 1,000,000,000 (fixed; mint authority revoked) |

## Principles (trust-first, rug-resistant)

Drawn from [`../../research/13-meme-coin.md`](../../research/13-meme-coin.md) and
[`../../research/14-crypto-legal-risk.md`](../../research/14-crypto-legal-risk.md):

- **Fair launch.** No team presale, no insider allocation that isn't disclosed on this
  page before launch. Prefer a bonding-curve fair launch (e.g. a reputable launchpad)
  or a transparent LP seed.
- **Authorities revoked.** Mint authority and freeze authority **revoked** at launch so
  supply can't be inflated and wallets can't be frozen. Verifiable on-chain.
- **Liquidity locked/burned.** LP tokens burned or locked; the lock is linked publicly.
- **No utility promises, no financial promises.** The token grants no rights over
  glamfire, no governance over the software, no revenue, no expectation of profit. It
  is a collectible community asset. (This separation is the legal spine — research/14.)
- **Disclosed treasury.** Any community/treasury wallet is published here with its
  purpose (e.g. contributor bounties) before launch.
- **One canonical address each, signed.** Once live, the only legitimate mint addresses
  are the ones in [`STATUS.md`](STATUS.md), announced from official channels. Everything
  else is a scam; we will say so loudly.

## Token parameters (FINALIZED defaults — operator confirms before mint)

These are the prepared, canonical parameters. They match the defaults baked into
[`scripts/mint.mjs`](scripts/mint.mjs). The only human decisions left before a mainnet
mint are: the funded keypair, the hosted metadata image+JSON URI, and explicit
authorization (see *What a launch still needs* below).

| Parameter | $GLAM | $GLAMFIRE |
|---|---|---|
| Standard | original SPL Token Program | original SPL Token Program |
| Decimals | **9** | **9** |
| Total supply | **1,000,000,000** (fixed) | **1,000,000,000** (fixed) |
| Transfer tax/fee | **none** | **none** |
| Mint authority | **revoked at launch** (null) | **revoked at launch** (null) |
| Freeze authority | **revoked at launch** (null) | **revoked at launch** (null) |
| Metadata | Metaplex Token Metadata, made **immutable** once final | same |

Decimals **9** follows the Solana/SOL convention (research/13 §6 notes 6 or 9 are both
conventional; 9 is chosen for SOL alignment). The original SPL Token Program (not
Token-2022) is chosen for maximum wallet/DEX/indexer compatibility and the cleanest
rug-checker posture — there is no custom program to audit (research/13 §2, §8).

## Distribution / treasury split (FINALIZED target)

Trust-first, fair-launch-weighted, every non-LP bucket transparent and vested
(research/13 §6, research/14 §5):

| Bucket | % of supply | Handling |
|---|---|---|
| **Liquidity** | **90%** | Seeded into the DEX pool; **LP burned or locked** at launch |
| **Community treasury** | **10%** | **Squads multisig**, publicly labeled; spend tied to public proposals; any contributor/team portion **on-chain vested** (Streamflow) with a published schedule |

No presale. No insider/founder allocation outside the disclosed, vested treasury
bucket. The treasury **does not fund glamfire development** (that is sponsorships /
grants / commercial licensing — see *Separation* below); it funds community/culture
activities only. The final treasury wallet address is published here **before** the
mint, with no information asymmetry at launch (research/14 §4).

## LP (liquidity) policy

- Seed a pool on a reputable venue: **Raydium CPMM** (DIY) or a fair-launch launchpad
  (**pump.fun / LetsBonk**) where the protocol custodies the LP (research/13 §3, §5).
- **Freeze authority must be revoked before creating a Raydium pool** — the mint script
  does this automatically.
- **Burn the LP** (strongest signal) or **lock it** (e.g. Raydium *Burn & Earn* =
  burned position that still earns fees). The burn/lock link is published in
  [`STATUS.md`](STATUS.md) at launch.

## Authority-revocation policy

- **Mint authority → null** so supply can never inflate (the single biggest
  rug-check red flag if left live). **Irreversible.**
- **Freeze authority → null** so no holder can ever be frozen. **Irreversible.**
- **Metadata → immutable** once name/symbol/artwork are final (`isMutable:false`).
- All three are performed/automated by [`scripts/mint.mjs`](scripts/mint.mjs) (revokes)
  and the runbook (metadata immutability), and **verified on-chain** before
  [`STATUS.md`](STATUS.md) is flipped to LIVE.

## Separation from the software (the legal + trust spine)

This is non-negotiable (CLAUDE.md §11, research/14 §5):

- glamfire is **Apache-2.0 and fully usable with no token, wallet, or chain**. The
  software has **zero runtime dependency** on these tokens or any chain.
- Holding a token grants **no** software feature, gated access, premium tier, governance
  over the software, revenue share, dividend, staking yield, or claim on glamworks/
  glamfire assets or income.
- Token proceeds **do not fund** software development; development funding is separate
  (sponsorships, grants, commercial licenses).
- This isolation is enforced structurally: the coin tooling lives only in
  `marketing/meme-coin/` with its **own** dependency set, kept out of the product
  workspace and lockfile.

## Launch mechanics

1. Finalize the parameters above (already done) and publish the treasury wallet.
2. **Rehearse on devnet** with `--dry-run` then a real devnet mint
   (`--network devnet`). See [`RUNBOOK.md`](RUNBOOK.md).
3. Mint on **mainnet-beta** from a funded wallet — interactive, irreversible, never
   CI. The script attaches Metaplex metadata and revokes mint+freeze authority in one
   run. (Needs real SOL; cannot be fully scripted in CI by design.)
4. Seed liquidity; **burn/lock LP**; make metadata **immutable**.
5. Verify everything on a block explorer; paste addresses + tx links into
   [`STATUS.md`](STATUS.md), flip the machine marker to `token-status: LIVE`.
6. **Only now** does marketing reference the tokens (see
   [`../guerilla-plan.md`](../guerilla-plan.md), gated section).

## What a launch still needs (human decisions — not in this repo)

1. A **funded mainnet keypair** (hardware-backed), never committed.
2. The **off-chain metadata JSON + image** hosted on Arweave/IPFS/stable HTTPS, its URL
   passed via `--uri`.
3. The **published treasury (Squads) multisig** address.
4. **Explicit human authorization** to spend real SOL and run the irreversible mainnet
   mint (the script's `--i-understand-this-is-irreversible` flag + interactive confirm).
5. (Recommended) sign-off from crypto-literate counsel (research/14 §10).

## Disclaimer

Nothing here is financial, investment, legal, or tax advice. Community tokens are
high-risk and often go to zero. The glamfire software is free and open under Apache-2.0
and is entirely usable without any token. See [`DISCLAIMER.md`](DISCLAIMER.md).
