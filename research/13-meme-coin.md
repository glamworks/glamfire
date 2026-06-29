# Launching a Meme Coin in 2026 — Research for glamworks / glamfire

> Scope: how to launch the `$GLAM` and `$GLAMFIRE` meme coins on Solana in 2026. Covers SPL token standards, launchpads (pump.fun and alternatives), Metaplex metadata, liquidity/bonding curves, tokenomics for OSS/community projects, fair-launch vs presale, rug-pull avoidance + trust signals, and the exact CLI/code steps to mint a token and set metadata.
>
> Research date: **June 2026**. This is engineering/research notes, **not financial or legal advice**. Meme coins are high-risk; regulatory treatment of tokens varies by jurisdiction and is still evolving in 2026.

---

## 1. The big picture: two ways to launch

There are essentially two paths in 2026:

1. **Launchpad / "fair-launch button"** — pump.fun, LetsBonk, Believe, Raydium LaunchLab, Moonshot. You click "create coin," upload a name/symbol/image, and the platform handles the SPL mint, metadata, a **bonding curve**, and automatic **migration to a DEX** when the curve completes ("graduation"). Fastest, cheapest, most trust-by-default for traders, but least control over tokenomics.
2. **DIY mint + manual liquidity** — you create the SPL token yourself (`spl-token` CLI / `@solana/spl-token` / Metaplex Umi), set metadata, then create a liquidity pool on a DEX (Raydium / Orca / Meteora) and lock or burn the LP. Maximum control over supply, allocations, treasury and vesting — required if you want anything beyond a vanilla 1B fair-launch.

For a community/OSS brand like glamworks, the realistic choice is **either** a pump.fun-style fair launch (for the meme/virality play) **or** a DIY mint with a transparent treasury + LP lock (for a project that wants a treasury, contributor allocations, and vesting). You can also do a hybrid: DIY mint, then seed a Raydium pool yourself.

---

## 2. Solana token standards: Token Program vs Token-2022 (Token Extensions)

Solana has **two** token programs, both maintained and both live on mainnet in 2026:

### Original SPL Token Program (`spl-token`)
- The classic, battle-tested standard. **Maximum wallet, DEX, and indexer compatibility.**
- A mint account stores: supply, decimals, **mint authority**, **freeze authority**. It does *not* store name/symbol/image — those come from a separate **Metaplex Token Metadata** account (see §4).
- This is what almost every meme coin and what pump.fun/LetsBonk use under the hood. **Recommended default for a meme coin** unless you specifically need an extension.

### Token-2022 / Token Extensions Program
- A superset program that **extends** (does not replace) the original via opt-in **extensions** configured at mint creation. Key mint extensions:
  - **Transfer Fees** — a built-in tax on every transfer (the "tax token" pattern).
  - **Interest-bearing** — balance accrues a displayed rate over time.
  - **Transfer Hook** — call a custom program on every transfer (e.g., allow/deny lists).
  - **Non-transferable** — soulbound.
  - **Permanent Delegate** — an authority that can move/burn anyone's tokens (powerful, and a *red flag* for traders if present).
  - **Metadata Pointer + Metadata extension** — store name/symbol/URI **directly on the mint**, no separate Metaplex account needed.
  - **Confidential Transfer**, **Default Account State**, **Close Mint**, **CPI Guard**, **Immutable Owner**, **Memo-required**.
- Trade-offs in 2026:
  - **Pro:** advanced tokenomics (auto transfer-fee/"tax", on-chain metadata) without extra programs.
  - **Con:** narrower support. Some wallets, DEX pool creators, and indexers (e.g., historically Solscan, Raydium/Orca pool creation) handle Token-2022 — especially exotic extensions like transfer hooks — inconsistently. A `permanent delegate` or `transfer hook` will scare rug-checkers and may block listing on some venues.

**Recommendation for $GLAM / $GLAMFIRE:** use the **original SPL Token Program** for maximum compatibility and trust. Only reach for Token-2022 if you specifically want an automatic transfer-fee (e.g., a 1% buy/sell "tax" routed to the glamworks treasury) — and if you do, keep it to the **transfer-fee + metadata** extensions only and document it loudly, because tax tokens are scrutinized.

Sources: [smithii.io SPL vs Token-2022](https://smithii.io/en/difference-between-spl-token-and-token-2022/), [QuickNode Token-2022 overview](https://www.quicknode.com/guides/solana-development/spl-tokens/token-2022/overview), [team.finance SPL vs Token-2022](https://blog.team.finance/spl-vs-token-2022-understanding-solanas-token-standards/), [Solana Token Extensions](https://solana.com/solutions/token-extensions).

---

## 3. Launchpads: pump.fun and the alternatives

By mid-2026 the launchpad market has **fragmented**. pump.fun's share of Solana meme launches fell from **>98%** to roughly **57.5%**, with LetsBonk (~17.9%), Believe (~12.9%), and Raydium LaunchLab (~5%) taking the rest. ([Cryptopolitan](https://www.cryptopolitan.com/pump-fun-losing-monopoly-of-solana-memes/))

### pump.fun (+ PumpSwap)
- **Token creation is free**; you pay tiny network fees only. Fixed supply **1,000,000,000 (1B)**, ~**800M** sold on the bonding curve.
- **Bonding curve**: price rises along a curve as people buy. The curve **completes ("graduates") at ~$69,000 market cap (~85 SOL)**.
- On graduation the token **auto-migrates to PumpSwap** (pump.fun's own AMM/DEX). PumpSwap charges **0.25% per swap** (0.20% to LPs, 0.05% protocol). Bonding-curve trades carry a **1% fee**.
- **Creator revenue sharing**: graduated-token creators earn **0.05%** of PumpSwap volume on their token (program since May 2025).
- As of **May 21, 2026**, creators can choose **USDC** as the paired/quote token instead of SOL.
- LP at graduation is handled by the protocol (creators don't hold a ruggable LP position), which is the main trust advantage of the launchpad model.

Sources: [pump.fun fees](https://pump.fun/docs/fees), [moby.win 2026 guide](https://moby.win/learn/pumpfun/), [flashift bonding-curve math](https://flashift.app/blog/bonding-curves-pump-fun-meme-coin-launches/), [blocmates PumpSwap](https://www.blocmates.com/news-posts/pump-fun-introduces-pumpswap-a-new-dex-for-graduated-token-listings).

### LetsBonk (letsbonk.fun)
- Built on **Raydium LaunchLab** infrastructure, backed by the $BONK community. Overtook pump.fun on several days in 2025–2026.
- **Higher creator fee share — 1% of trading fees** (vs pump.fun's 0.05%), a strong creator incentive. ([blockchainappfactory](https://www.blockchainappfactory.com/blog/how-letsbonk-beat-pump-fun-tips-to-create-meme-coin-launchpad/), [solanaleveling](https://solanaleveling.com/bonk-fun-vs-pump-fun/))

### Raydium LaunchLab
- Raydium's **official launchpad**, baked into the largest AMM on Solana. **Most customizable**: configurable tokenomics, migration options, direct Raydium pool integration.
- Developers earn **10% of LP transaction fees** on graduation — best fit if you want a higher-quality, configurable launch rather than a pure meme. ([raydium.io/launchpad](https://raydium.io/launchpad/), [BitPinas](https://bitpinas.com/business/raydium-launchlab-vs-pump-fun-solana-meme-coin-launchpad/))

### Believe
- "**Tweet-to-token**" social launches; strong social-media-native community angle. Good if the launch is driven by an X/Twitter presence. ([TokenInsight](https://tokeninsight.com/en/research/analysts-pick/behind-the-meme-hype-which-launchpad-is-better))

### Moonshot
- Higher **graduation threshold (~500 SOL)** and **burns a portion of fees on graduation** (deflationary). Higher bar means graduated tokens have shown more sustained demand. ([StakePoint alternatives](https://stakepoint.app/blog/best-pump-fun-alternatives-solana-2026))

### Quick comparison

| Launchpad | Default supply | Graduation | Creator fee share | Notes |
|---|---|---|---|---|
| pump.fun | 1B | ~$69k mcap (~85 SOL) | 0.05% of DEX vol | Free, migrates to PumpSwap, USDC pairing (2026) |
| LetsBonk | LaunchLab config | LaunchLab | **1%** of fees | Built on LaunchLab, BONK community |
| Raydium LaunchLab | configurable | configurable | **10% of LP fees** | Most customizable, native Raydium pools |
| Believe | social-launch | — | — | Tweet-to-token, social-first |
| Moonshot | — | **~500 SOL** | — | Higher bar, burns fees on graduation |

---

## 4. Metaplex Token Metadata (name / symbol / image / URI)

An SPL mint stores only supply/decimals/authorities — **not** name, symbol, or image. Those live in a **metadata account** derived (PDA) from the mint, written by the **Metaplex Token Metadata** program. This is the standard wallets/DEXs/explorers read.

### Two ways to attach metadata in 2026
1. **Metaplex Token Metadata (separate account)** — works with both the original Token Program **and** Token-2022; the most widely supported, the default for fungible meme tokens.
2. **Token-2022 Metadata extension (on-mint)** — stores metadata directly inside the mint via the **metadata pointer + metadata** extensions. No separate Metaplex account, but only on Token-2022 and with the support caveats from §2.

> Note on "newer standards": Metaplex **Core** and **Candy Machine** exist in 2026, but they target **NFTs / NFT collections**, not fungible meme coins. For a fungible token you want **Token Metadata** with `TokenStandard.Fungible` (or `FungibleAsset` if it has an image and 0 decimals). Sugar/Candy Machine is the wrong tool for a fungible meme coin.

### On-chain fields (Token Metadata account)
- `name` (max 32 bytes), `symbol` (max 10 bytes), `uri` (max 200 bytes — points to the off-chain JSON), `sellerFeeBasisPoints`, `updateAuthority`, `isMutable`, `creators`.

### Off-chain JSON (what `uri` points to)
Host this JSON on Arweave/IPFS or a stable HTTPS URL. The image is referenced from inside it:

```json
{
  "name": "GLAMFIRE",
  "symbol": "GLAMFIRE",
  "description": "The community fire of glamworks. Open-source, transparent, fair-launched.",
  "image": "https://arweave.net/<IMAGE_TX_ID>",
  "external_url": "https://glamworks.dev",
  "attributes": [],
  "properties": {
    "files": [{ "uri": "https://arweave.net/<IMAGE_TX_ID>", "type": "image/png" }],
    "category": "image"
  }
}
```

### Mutable vs immutable metadata (a trust decision)
- `isMutable: true` lets the **update authority** change name/symbol/URI/image later. Convenient, but it's a rug vector — a scammer can swap the image/name post-listing.
- `isMutable: false` (or **revoking the update authority**) makes metadata permanent. This is a **trust signal** (rug-checkers flag mutable metadata + live update authority).
- General advice mirrors the NFT guidance: keep it mutable until you're sure the artwork/name are final, then **make it immutable** — you can go mutable→immutable but **never** immutable→mutable.

Sources: [Metaplex: add metadata to SPL tokens](https://metaplex.com/docs/smart-contracts/token-metadata/guides/how-to-add-metadata-to-spl-tokens), [Token Metadata overview](https://developers.metaplex.com/token-metadata), [Updating Assets](https://developers.metaplex.com/token-metadata/update), [Metaplex protocol updates](https://www.metaplex.com/blog/articles/important-updates-to-the-metaplex-protocol).

---

## 5. Liquidity: bonding curves, DEX migration, LP burn/lock

### Bonding curve (launchpad model)
A bonding curve is a smart contract that **prices the token as a function of how much is bought** — early buyers get a lower price, price rises as the curve fills. No traditional order book or LP needed at first. When the curve "completes/graduates" (e.g., $69k mcap on pump.fun), the accumulated SOL + remaining tokens are deposited into a real DEX pool automatically. This is why launchpad tokens feel "safer" — the creator never custodies a ruggable LP.

### Manual liquidity (DIY model)
If you mint yourself, *you* create the market:
1. Decide the initial price = ratio of (tokens deposited) : (SOL or USDC deposited).
2. Create a **Raydium** (CPMM/standard AMM), **Orca Whirlpool**, or **Meteora** pool, depositing tokens + quote.
3. You receive **LP tokens** representing that liquidity. **Whoever holds the LP tokens can withdraw the liquidity** — this is the classic rug vector.

### LP burn vs LP lock (critical for trust)
- **Burn LP** — send LP tokens to a burn/incinerator address. Liquidity is **permanently** un-withdrawable. Strongest trust signal; you also give up the ability to ever reclaim/manage it.
- **Lock LP** — deposit LP into a time-locked vault (e.g., team.finance, third-party lockers, or Raydium's **Burn & Earn** which burns the LP position while still paying you the trading fees). Lets you prove liquidity is safe for a period (or forever) while optionally still earning fees.
- **Freeze authority must be revoked before you can create a Raydium pool** — Raydium refuses tokens with a live freeze authority.

Sources: [pump.fun/PumpSwap](https://www.blocmates.com/news-posts/pump-fun-introduces-pumpswap-a-new-dex-for-graduated-token-listings), [MintCraft revoke/LP](https://mintcraft.io/blog/what-is-revoke-mint-authority-solana), [createmycoin rug checker](https://createmycoin.app/articles/solana-rug-checker-guide).

---

## 6. Tokenomics patterns for community / OSS projects

Standard meme default = **1B supply, 100% to the bonding curve, no team allocation** (pump.fun style). That's maximally fair and minimally controllable. For an OSS org that wants a **treasury** and **contributor incentives**, a *structured* allocation is more appropriate — but every non-community allocation **must be transparent and vested**, or rug-checkers and the community will punish it.

### Supply
- Common meme supplies: **1,000,000,000 (1B)** or **1,000,000,000,000 (1T)**. Decimals usually **6** (matches USDC/most SPL) or **9** (matches SOL). 1B @ 6 decimals is a sane, conventional choice.

### Example community/OSS-friendly allocation
Illustrative split for `$GLAMFIRE` (DIY mint, *not* pump.fun):

| Bucket | % | Purpose | Handling |
|---|---|---|---|
| Liquidity | 40–60% | Seed the Raydium pool | LP **burned or locked** at launch |
| Community / airdrop | 10–20% | Reward contributors, early users | Distributed transparently |
| Treasury (glamworks) | 10–20% | Fund OSS development, grants | Multisig (Squads), publicly labeled |
| Core contributors | 5–15% | Team/devs | **Vested** (e.g., 6–24 mo, cliff) |
| Marketing / partnerships | 5–10% | Listings, CEX, KOLs | Vested or milestone-gated |

2026 norms emphasize **low concentration** (no single non-LP wallet holding a big %), **published vesting schedules**, and sometimes **deflationary mechanics** (burns). Concentrated holdings are the #1 tokenomics red flag traders check. ([cryptonews presales](https://cryptonews.com/cryptocurrency/best-crypto-presales/), [coinspeaker](https://www.coinspeaker.com/guides/best-crypto-presales/))

### Treasury & vesting tooling
- **Multisig:** hold the treasury in a **Squads** multisig, not a single key. Label it publicly.
- **Vesting/streaming:** use **Streamflow** or **Bonfida/Jupiter Lock** style token-vesting contracts so team/treasury unlocks are **on-chain and verifiable** rather than "trust us."
- **For OSS specifically:** tie treasury spend to public proposals (a lightweight on-chain or off-chain governance/transparency log) to keep credibility.

---

## 7. Fair launch vs presale — tradeoffs

| | Fair launch | Presale |
|---|---|---|
| **What** | Everyone buys at the same starting point (bonding curve / open pool), no pre-sold insider allocation | Sell tokens to early backers before public trading, often at a discount |
| **Pros** | Max trust, no "insider dump" optics, simplest, best for memes, no securities-sale optics | Raises capital up front (fund dev/marketing/liquidity), rewards early believers |
| **Cons** | No upfront capital; you must self-fund liquidity/marketing | **Insider-dump risk** (cited: ~99% of meme launches insider-dumped within 72h), concentration, vesting must be airtight, higher regulatory/securities scrutiny |
| **Best for** | Meme-first, community virality, OSS credibility | Projects needing a war chest and willing to publish strict vesting |

**Recommendation for glamworks:** a **fair launch** (pump.fun/LetsBonk style, or a DIY mint with a self-seeded, LP-burned pool) is the higher-trust, lower-legal-risk path and fits the OSS ethos. If you need a treasury, prefer a **small, fully-vested, publicly-labeled treasury allocation on top of a fair launch** over a presale.

Sources: [99bitcoins meme ICOs](https://99bitcoins.com/cryptocurrency/best-meme-coin-icos/), [ventureburn presales](https://ventureburn.com/best-crypto-presales/).

---

## 8. Rug-pull avoidance & trust signals (the checklist)

Tools like **RugCheck**, **Birdeye**, and **DEXScreener** auto-scan tokens; traders see red flags within seconds. Hit all of these:

- [ ] **Revoke mint authority** — set to null so supply can never increase. *The single biggest rug-check red flag if left on.* Irreversible.
- [ ] **Revoke freeze authority** — so you can never freeze holders' tokens (and it's **required before creating a Raydium pool**).
- [ ] **Burn or lock LP** — prove liquidity can't be pulled (burn = strongest; lock/Burn-&-Earn = lock + earn fees).
- [ ] **Make metadata immutable / revoke update authority** — once name/symbol/image are final, so they can't be swapped post-listing.
- [ ] **Low holder concentration** — no whale/insider wallet with a large %. Publish the allocation.
- [ ] **Vest team/treasury on-chain** (Streamflow/Squads) and label wallets publicly.
- [ ] **Avoid scary Token-2022 extensions** — no `permanent delegate`, no opaque `transfer hook`. If you use a transfer fee, disclose it.
- [ ] **Transparency** — public repo, doc site, known team or doxxed-enough multisig, and ideally a **code/contract review or audit** for any custom program. For a plain SPL mint there's no custom code to audit, which is itself a trust point ("it's just a standard SPL token").

Note: `setting an authority to null is permanent` — no wallet or future Solana upgrade restores it; that irreversibility is exactly what makes it a credible signal.

Sources: [MintCraft](https://mintcraft.io/blog/what-is-revoke-mint-authority-solana), [createmycoin revoke guide](https://createmycoin.app/articles/how-to-revoke-mint-authority-solana), [Helius authorities](https://www.helius.dev/docs/orb/explore-authorities), [createmycoin rug checker](https://createmycoin.app/articles/solana-rug-checker-guide).

---

## 9. EXACT technical steps — DIY mint + metadata + lockdown

This is the hands-on, scriptable path. Two equivalent routes are shown: **(A) CLI** and **(B) JS/TypeScript**. Do everything on **devnet first**, then repeat on **mainnet-beta** with a funded wallet.

### 9.0 Install toolchain
```bash
# Solana CLI (Agave) + SPL Token CLI
sh -c "$(curl -sSfL https://release.anza.xyz/stable/install)"
cargo install spl-token-cli        # or: brew install spl-token-cli

solana --version
spl-token --version
```

### 9.1 Wallet + network (devnet)
```bash
solana-keygen new --outfile ~/glam-keypair.json   # creates a fresh wallet
solana config set --keypair ~/glam-keypair.json
solana config set --url https://api.devnet.solana.com

solana airdrop 2                                    # devnet SOL for rent/fees (free)
solana balance
```
> **What needs a funded wallet:** every on-chain step (create mint, create ATA, mint, metadata, revoke authorities, create pool) costs **rent + ~0.000005 SOL/tx**. On **devnet** you airdrop free SOL. On **mainnet** you must fund the wallet with real SOL (budget a few tenths of a SOL for all the steps + meaningfully more for seeding liquidity).

### 9.2 (A) Create + mint with the SPL Token CLI

**Original Token Program (recommended for a meme coin):**
```bash
# 1) Create the mint (fungible -> use decimals; 6 is conventional)
spl-token create-token --decimals 6
#   -> Creating token <MINT_ADDRESS>

# 2) Create your associated token account (ATA) to hold the supply
spl-token create-account <MINT_ADDRESS>

# 3) Mint the full supply to yourself (e.g., 1,000,000,000)
spl-token mint <MINT_ADDRESS> 1000000000

# 4) Verify
spl-token supply <MINT_ADDRESS>
spl-token accounts
```

**Token-2022 variant with on-mint metadata (only if you want extensions):**
```bash
spl-token create-token \
  --program-2022 \
  --enable-metadata \
  --decimals 6
#   -> Creating token <MINT_ADDRESS> under program TokenzQd...

# Initialize on-mint metadata (Token-2022 metadata extension)
spl-token initialize-metadata <MINT_ADDRESS> "GLAMFIRE" "GLAMFIRE" "https://glamworks.dev/glamfire.json"

# (optional) add a custom field, then create ATA + mint as above
spl-token update-metadata <MINT_ADDRESS> external_url "https://glamworks.dev"
```

### 9.3 (B) Create + mint with `@solana/web3.js` + `@solana/spl-token`
```bash
npm i @solana/web3.js @solana/spl-token
```
```js
import { Connection, Keypair, clusterApiUrl } from "@solana/web3.js";
import {
  createMint, getOrCreateAssociatedTokenAccount, mintTo,
} from "@solana/spl-token";

const connection = new Connection(clusterApiUrl("devnet"), "confirmed");
const payer = Keypair.fromSecretKey(/* load ~/glam-keypair.json bytes */);

// 1) Create mint: decimals=6, mintAuthority=payer, freezeAuthority=payer (revoked later)
const mint = await createMint(connection, payer, payer.publicKey, payer.publicKey, 6);

// 2) ATA for the payer
const ata = await getOrCreateAssociatedTokenAccount(connection, payer, mint, payer.publicKey);

// 3) Mint 1,000,000,000 tokens (raw = amount * 10^decimals)
await mintTo(connection, payer, mint, ata.address, payer, 1_000_000_000n * 10n ** 6n);

console.log("Mint:", mint.toBase58());
```

### 9.4 Set Metaplex Token Metadata (Umi) — the wallet-visible name/symbol/image
```bash
npm i @metaplex-foundation/umi @metaplex-foundation/umi-bundle-defaults \
      @metaplex-foundation/mpl-token-metadata @solana/web3.js
```
```js
import {
  createV1, mplTokenMetadata, TokenStandard,
} from "@metaplex-foundation/mpl-token-metadata";
import { percentAmount, publicKey, signerIdentity, createSignerFromKeypair } from "@metaplex-foundation/umi";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";

const umi = createUmi("https://api.devnet.solana.com").use(mplTokenMetadata());
// load your wallet into umi.identity (createSignerFromKeypair + signerIdentity) ...

await createV1(umi, {
  mint: publicKey("<MINT_ADDRESS>"),     // the mint you created in 9.2/9.3
  authority: umi.identity,
  updateAuthority: umi.identity,
  name: "GLAMFIRE",
  symbol: "GLAMFIRE",
  uri: "https://glamworks.dev/glamfire.json",   // the off-chain JSON from §4
  sellerFeeBasisPoints: percentAmount(0),        // fungible: no royalty
  decimals: 6,
  tokenStandard: TokenStandard.Fungible,
}).sendAndConfirm(umi);
```
- Host the **off-chain JSON** (and the image it references) on Arweave/IPFS/stable HTTPS first; put that URL in `uri`.
- For the **original Token Program** mint, `createV1` writes a *separate* Metaplex metadata account. (For Token-2022 you can instead use the on-mint metadata from 9.2.)

### 9.5 Lock it down (trust signals) — CLI
```bash
# Revoke MINT authority (fix supply forever)
spl-token authorize <MINT_ADDRESS> mint --disable

# Revoke FREEZE authority (required before a Raydium pool; can't freeze holders)
spl-token authorize <MINT_ADDRESS> freeze --disable

# For Token-2022 mints, add: --program-id TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb
```
> Make Metaplex metadata immutable when the name/image are final by updating with `isMutable: false` (Umi `updateV1`) or revoking the update authority. Do this **after** you've confirmed the artwork is correct — it's irreversible.

### 9.6 Seed liquidity + lock LP
1. Go to **Raydium → Create Pool** (CPMM/standard AMM) with `<MINT_ADDRESS>` + SOL/USDC at your chosen ratio (freeze authority must already be revoked).
2. Receive **LP tokens**.
3. **Burn** them (send to incinerator) or **lock** them (locker / Raydium **Burn & Earn**).

### 9.7 What's scriptable vs what isn't
- **Fully scriptable / automatable:** mint creation, ATA, minting supply, metadata (createV1), revoking mint & freeze authority, even pool creation (Raydium SDK). You can wrap the whole 9.2–9.5 flow in one Node script.
- **Needs a funded wallet (SOL):** *all* on-chain txs. Devnet = free airdrops; mainnet = real SOL for rent + fees + liquidity.
- **Devnet vs mainnet:** identical commands; only the `--url` / RPC endpoint and the fact that **mainnet costs real money and is irreversible** differ. **Always rehearse on devnet**, confirm the token shows correct name/symbol/image in a wallet, then run mainnet.
- **Launchpad route instead:** if you use pump.fun/LetsBonk, steps 9.2–9.6 are done *for you* — you only supply name/symbol/image and (optionally) a small initial buy; the platform mints, sets metadata, runs the curve, and migrates + handles LP.

Sources: [Solana Tokens docs](https://solana.com/docs/tokens), [Helius minting SPL tokens](https://www.helius.dev/blog/working-with-solana-tokens), [spl-token-cli walkthrough](https://tienshaoku.medium.com/solana-token-creation-with-spl-token-cli-a-quick-dive-into-solanas-account-model-and-gotchas-68e4888aabe5), [Metaplex add-metadata guide](https://metaplex.com/docs/smart-contracts/token-metadata/guides/how-to-add-metadata-to-spl-tokens), [Metaplex JS SDK](https://developers.metaplex.com/token-metadata/getting-started/js).

---

## Key takeaways for glamfire / glamworks

- **Use the original SPL Token Program**, not Token-2022, unless you specifically want an on-chain transfer-fee/"tax" to the treasury. Token-2022 buys advanced features at the cost of wallet/DEX/indexer compatibility and rug-checker suspicion.
- **Two viable launch routes:** (1) **launchpad fair-launch** (pump.fun, or **LetsBonk**/Raydium LaunchLab for higher creator-fee share and more control) — fastest, highest default trust, LP handled for you; (2) **DIY mint + self-seeded Raydium pool** — full control over supply/treasury/vesting, but you must lock down everything yourself.
- **pump.fun is no longer a monopoly (~57% share).** LetsBonk (1% creator fees) and Raydium LaunchLab (10% LP fees, most configurable) are credible alternatives worth a look for a project that wants creator revenue and customization.
- **For an OSS brand, fair-launch beats presale** on trust and legal optics. If you need a treasury/contributor allocation, layer a **small, on-chain-vested, publicly-labeled** allocation (Squads multisig + Streamflow) on top — never an opaque presale.
- **Hit the full trust checklist before announcing:** revoke **mint** authority, revoke **freeze** authority, **burn or lock LP**, make **metadata immutable** once final, keep **holder concentration low**, and avoid scary Token-2022 extensions. RugCheck/Birdeye/DEXScreener will surface any miss instantly.
- **Metadata = Metaplex Token Metadata** (`createV1`, `TokenStandard.Fungible`) pointing to an Arweave/IPFS-hosted JSON that references the image. Candy Machine/Sugar is for NFTs, not your fungible meme coin.
- **Everything DIY is scriptable**, but **every step costs SOL**. Rehearse the whole flow on **devnet** (free airdrops), verify the token renders correctly in a wallet, then run it once on **mainnet** with a funded wallet — the authority revocations are **irreversible**.
- **Practical sequence for a DIY $GLAM/$GLAMFIRE:** fund wallet → create mint (decimals 6) → mint 1B to treasury ATA → set Metaplex metadata (host JSON+image first) → distribute per allocation with on-chain vesting → revoke mint+freeze → seed Raydium pool → burn/lock LP → make metadata immutable → publish allocation + wallet labels.

---

## Sources

- [pump.fun — Fees](https://pump.fun/docs/fees)
- [moby.win — What Is Pump.fun? Complete 2026 Guide](https://moby.win/learn/pumpfun/)
- [flashift — Pump.fun Bonding Curve Math 2026](https://flashift.app/blog/bonding-curves-pump-fun-meme-coin-launches/)
- [blocmates — Pump.fun Introduces PumpSwap](https://www.blocmates.com/news-posts/pump-fun-introduces-pumpswap-a-new-dex-for-graduated-token-listings)
- [Phemex Academy — What Is Pump.fun](https://phemex.com/academy/what-is-pump-fun-solana-meme-coin-launchpad-pump-token)
- [Cryptopolitan — Pump.fun losing its monopoly](https://www.cryptopolitan.com/pump-fun-losing-monopoly-of-solana-memes/)
- [TokenInsight — Which Launchpad Is Better?](https://tokeninsight.com/en/research/analysts-pick/behind-the-meme-hype-which-launchpad-is-better)
- [StakePoint — Best Pump.fun Alternatives 2026](https://stakepoint.app/blog/best-pump-fun-alternatives-solana-2026)
- [Raydium LaunchLab](https://raydium.io/launchpad/)
- [BitPinas — Raydium LaunchLab vs Pump.fun](https://bitpinas.com/business/raydium-launchlab-vs-pump-fun-solana-meme-coin-launchpad/)
- [Blockchain App Factory — How LetsBONK Beat Pump.fun](https://www.blockchainappfactory.com/blog/how-letsbonk-beat-pump-fun-tips-to-create-meme-coin-launchpad/)
- [Solana Leveling — Bonk.fun vs Pump.fun](https://solanaleveling.com/bonk-fun-vs-pump-fun/)
- [smithii.io — 5 Differences SPL Token vs Token-2022](https://smithii.io/en/difference-between-spl-token-and-token-2022/)
- [QuickNode — Solana SPL Token Extensions (Token-2022) overview](https://www.quicknode.com/guides/solana-development/spl-tokens/token-2022/overview)
- [team.finance — SPL vs Token-2022](https://blog.team.finance/spl-vs-token-2022-understanding-solanas-token-standards/)
- [Solana — Token Extensions](https://solana.com/solutions/token-extensions)
- [QuillAudits — Solana Token-2022 Guide](https://www.quillaudits.com/research/rwa-development/non-evm-standards/solana-token-2022)
- [Metaplex — How to Add Metadata to SPL Tokens](https://metaplex.com/docs/smart-contracts/token-metadata/guides/how-to-add-metadata-to-spl-tokens)
- [Metaplex — Token Metadata Overview](https://developers.metaplex.com/token-metadata)
- [Metaplex — Updating Assets](https://developers.metaplex.com/token-metadata/update)
- [Metaplex — JavaScript SDK (Token Metadata)](https://developers.metaplex.com/token-metadata/getting-started/js)
- [Metaplex — Important Protocol Updates](https://www.metaplex.com/blog/articles/important-updates-to-the-metaplex-protocol)
- [Solana — Tokens docs](https://solana.com/docs/tokens)
- [Helius — Working with Solana Tokens (Mint SPL)](https://www.helius.dev/blog/working-with-solana-tokens)
- [Shao (Medium) — Solana Token Creation with spl-token-cli](https://tienshaoku.medium.com/solana-token-creation-with-spl-token-cli-a-quick-dive-into-solanas-account-model-and-gotchas-68e4888aabe5)
- [MintCraft — What is Revoke Mint Authority](https://mintcraft.io/blog/what-is-revoke-mint-authority-solana)
- [CreateMyCoin — How to Revoke Mint Authority (2026)](https://createmycoin.app/articles/how-to-revoke-mint-authority-solana)
- [CreateMyCoin — Solana Rug Checker Guide](https://createmycoin.app/articles/solana-rug-checker-guide)
- [Helius — Find Mint/Freeze/Update Authority](https://www.helius.dev/docs/orb/explore-authorities)
- [Dexlab — Manage Token (Burn/Mint/Revoke)](https://docs.dexlab.space/products/minting-lab/manage-token-burn-mint-revoke-freeze-revoke-mint)
- [cryptonews — Best Crypto Presales (June 2026)](https://cryptonews.com/cryptocurrency/best-crypto-presales/)
- [Coinspeaker — Best Crypto Presales 2026](https://www.coinspeaker.com/guides/best-crypto-presales/)
- [99bitcoins — Best Meme Coin ICOs & Presales 2026](https://99bitcoins.com/cryptocurrency/best-meme-coin-icos/)
- [ventureburn — Best Crypto Presales](https://ventureburn.com/best-crypto-presales/)
