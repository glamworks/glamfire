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

## Tokenomics (target, finalized on this page before launch)

- 100% fair-launch float, OR a published split such as: 90% fair-launch liquidity,
  10% community/contributor treasury (vested + disclosed). The exact split is fixed
  here, publicly, **before** any mint.
- No tax/fee on transfers (keep it clean and legible).
- Fixed supply; deflation only via voluntary burns announced in advance.

## Launch mechanics

1. Finalize this spec (supply, split, treasury) publicly.
2. Mint on **mainnet-beta** from a funded wallet (cannot be fully scripted in CI — needs
   real SOL). Use the runbook: [`RUNBOOK.md`](RUNBOOK.md).
3. Attach Metaplex token metadata (name, symbol, logo, this repo link).
4. Seed liquidity; **burn/lock LP**; **revoke mint + freeze authority**.
5. Verify everything on a block explorer; paste addresses + tx links into
   [`STATUS.md`](STATUS.md) and flip status to **LIVE**.
6. **Only now** does marketing reference the tokens (see
   [`../guerilla-plan.md`](../guerilla-plan.md), gated section).

## Disclaimer

Nothing here is financial, investment, legal, or tax advice. Community tokens are
high-risk and often go to zero. The glamfire software is free and open under Apache-2.0
and is entirely usable without any token. See [`DISCLAIMER.md`](DISCLAIMER.md).
