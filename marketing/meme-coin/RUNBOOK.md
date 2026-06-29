# Mint runbook (operator-only)

Minting on mainnet touches **real money** and is **irreversible**. It **cannot run in
CI** — it needs a funded wallet, a human, and an interactive confirmation by design.
**Rehearse the entire flow on devnet first.** STATUS stays **NOT LIVE** until every box
below is checked and verified on-chain.

> The single source of truth for live/not-live is [`STATUS.md`](STATUS.md)
> (`token-status:` marker). No coin is advertised anywhere while it says `NOT_LIVE`.

## 0. Prerequisites

- [ ] Node ≥22.
- [ ] Tooling installed **in this folder only** (kept out of the product workspace):
  ```bash
  cd marketing/meme-coin/scripts
  npm install        # @solana/web3.js, @solana/spl-token, Metaplex Umi + Token Metadata
  ```
- [ ] Token parameters finalized in [`README.md`](README.md) (supply 1,000,000,000;
      decimals 9; 90% LP / 10% disclosed-vested treasury; no tax).
- [ ] Off-chain metadata **image + JSON** hosted (Arweave/IPFS/HTTPS); you have its URL.
- [ ] Treasury **Squads multisig** address published in `README.md`.
- [ ] You have read [`DISCLAIMER.md`](DISCLAIMER.md).

## 1. Dry run (free, no network, do this first)

Prints every transaction the tool would send and sends nothing:

```bash
node mint.mjs --dry-run \
  --name GLAMFIRE --symbol GLAMFIRE --decimals 9 --supply 1000000000 \
  --uri https://<your-host>/glamfire.token.json
```

Read the 6-transaction plan (CreateMint → ATA → MintTo → Metaplex metadata →
revoke mint authority → revoke freeze authority) and the manual LP/immutability steps.

## 2. Devnet rehearsal (free SOL, full real run)

```bash
# Throwaway devnet keypair (gitignored; never reuse for mainnet):
node -e 'import("@solana/web3.js").then(({Keypair})=>{const k=Keypair.generate();require("fs").writeFileSync("./devnet-keypair.json",JSON.stringify(Array.from(k.secretKey)));console.log(k.publicKey.toBase58());})'

# Fund it: try the script's built-in airdrop, or if the public faucet is rate-limited,
# use the web faucet at https://faucet.solana.com (paste the pubkey above).

node mint.mjs --network devnet \
  --name "GLAMFIRE" --symbol GLAMFIRE --decimals 9 --supply 1000000000 \
  --uri https://<your-host>/glamfire.token.json \
  --keypair ./devnet-keypair.json --i-have-read ../DISCLAIMER.md
```

- [ ] Open the printed **explorer** URL; confirm name/symbol/supply render.
- [ ] Confirm **mint authority = null** and **freeze authority = null** on the explorer.
- [ ] Practice seeding a test pool and **burning/locking** the LP.
- [ ] Repeat for **GLAM**. Delete `devnet-keypair.json` when done.

## 3. Mainnet launch (irreversible — measure twice, cut once)

> The script **refuses** mainnet unless you pass
> `--i-understand-this-is-irreversible` **and** type the confirmation phrase at an
> interactive prompt. A piped/CI run is rejected. There is no `--yes` bypass.

```bash
node mint.mjs --network mainnet-beta \
  --name "GLAMFIRE" --symbol GLAMFIRE --decimals 9 --supply 1000000000 \
  --uri https://<your-host>/glamfire.token.json \
  --keypair /secure/path/mainnet-keypair.json --i-have-read ../DISCLAIMER.md \
  --i-understand-this-is-irreversible
# then type:  MINT GLAMFIRE ON MAINNET
```

The script will, in one run: create the mint, mint the full supply to the treasury ATA,
attach Metaplex metadata, then **revoke mint authority** and **revoke freeze authority**.

Then, manually (the script does NOT touch liquidity):

- [ ] Seed liquidity on a reputable venue (Raydium CPMM, or pump.fun/LetsBonk).
- [ ] **Burn or lock the LP**; record the burn/lock link.
- [ ] Make Metaplex metadata **immutable** (`updateV1 isMutable:false`) once artwork final.
- [ ] Verify on a block explorer + RugCheck: authorities null, LP locked, low concentration.
- [ ] Record verified mint addresses + tx links in [`STATUS.md`](STATUS.md); flip the
      marker to `token-status: LIVE`; commit + push + tag.
- [ ] Announce from official channels only. **Now — and only now —** marketing may
      reference the tokens.

## Hard stops

- Never run the mainnet mint from CI or a hot key, or with a piped/non-interactive stdin.
- Never expose any keypair in logs or the repo (keypairs are gitignored here).
- Never flip `STATUS.md` to LIVE until authorities are revoked **and** LP is locked/burned.
- Never promise utility, returns, governance-over-software, or fund the software with
  proceeds (research/14 §5). The token grants nothing and funds nothing.
- Never advertise, tease, or pre-sell while `token-status: NOT_LIVE` (research/14 §4).
