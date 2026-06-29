<!-- MACHINE-READABLE MARKER — do not remove. Site/marketing/CI parse this line.
     Allowed values: NOT_LIVE | LIVE. While NOT_LIVE, NO coin may be advertised
     anywhere (CLAUDE.md §11, ../../research/14-crypto-legal-risk.md §4). -->
token-status: NOT_LIVE

# Token status — SINGLE SOURCE OF TRUTH

> Marketing must read this file before referencing the tokens anywhere.
> If status is **NOT LIVE**, the tokens **do not exist** for marketing purposes.
> **No coin may be advertised, teased, pre-sold, or hyped while status is NOT LIVE.**
> The machine-readable marker above (`token-status: NOT_LIVE`) is the gate any
> automated surface (website, social bots, CI) must check before rendering token copy.

## $GLAM
- **Status:** NOT LIVE
- **Mint address:** — (none; any address claiming to be $GLAM is a scam)
- **Liquidity / LP lock:** —
- **Authorities revoked:** —
- **Explorer:** —

## $GLAMFIRE
- **Status:** NOT LIVE
- **Mint address:** — (none; any address claiming to be $GLAMFIRE is a scam)
- **Liquidity / LP lock:** —
- **Authorities revoked:** —
- **Explorer:** —

---

When (and only when) a token is genuinely minted, liquidity locked, and authorities
revoked: flip the machine marker to `token-status: LIVE`, replace `NOT LIVE` with
`LIVE` for that coin, fill in the verified addresses and explorer links, commit + push
+ tag, then unlock the gated marketing section. Never before.

## Flip-to-LIVE checklist (all must be true and verifiable on-chain)

- [ ] Mint created on **mainnet-beta** with the finalized supply/decimals (README.md).
- [ ] Metaplex Token Metadata attached (name/symbol/URI), artwork final.
- [ ] **Mint authority revoked** (null) — verified on the explorer.
- [ ] **Freeze authority revoked** (null) — verified on the explorer.
- [ ] Liquidity seeded and **LP burned or locked** — lock link recorded below.
- [ ] Metaplex metadata made **immutable** (`isMutable:false`).
- [ ] Verified mint address + tx links pasted above; marker flipped to `LIVE`.

Until every box is checked for a coin, its status stays **NOT LIVE** and it is not
advertised anywhere.
