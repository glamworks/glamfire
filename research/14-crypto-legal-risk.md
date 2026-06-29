# Legal, Regulatory, and Reputational Risk of an OSS Project Launching Meme Coins

**Scope:** US-centric analysis, current as of June 2026, for the glamworks open-source organization and its glamfire product, which are considering launching two meme coins: `$GLAM` and `$GLAMFIRE`.

> **This is research, not legal advice.** It is a synthesis of public sources and is not a substitute for advice from qualified securities, tax, and regulatory counsel. The law here is moving fast (multiple 2025–2026 changes are noted below). Before launching anything, retain crypto-literate counsel licensed in the relevant US jurisdictions.

---

## 1. Executive summary

- As of 2026, the US federal posture toward *bona fide* meme coins is far friendlier than it was in 2023–2024. SEC staff said in February 2025 that the offer and sale of typical meme coins is **not** the offer and sale of securities, and a March 2026 joint SEC–CFTC interpretation folded meme coins into a "digital collectibles" category outside the securities definition.
- **"Not a security" is not "not regulated" and is emphatically not "not illegal."** Anti-fraud, wire-fraud, market-manipulation, and pump-and-dump exposure remains fully intact under federal and state law, enforced by the DOJ, FTC, CFTC, and state AGs/securities regulators. The biggest 2025 meme-coin blowups (LIBRA, HAWK) were fraud/manipulation problems, not registration problems.
- The single most important structural decision for glamworks is to keep the **token completely separate from the software and the OSS funding model**, and to avoid any language that implies investment value, profit, governance rights, or a funded roadmap.
- Marketing discipline matters as much as legal structure: **do not hype or "advertise" before the token is actually live and tradable**, avoid pre-sale promises, and never tout price.

---

## 2. US securities considerations

### 2.1 The Howey test (the core question)

Whether a crypto asset is a "security" turns on the **investment contract** test from *SEC v. W.J. Howey Co.* (1946). An investment contract exists where there is (1) an investment of money, (2) in a common enterprise, (3) with a reasonable expectation of profits, (4) derived from the entrepreneurial or managerial efforts of others. Courts look at the **economic realities** of the transaction, not labels.

The two prongs that most often decide meme-coin cases are the **"common enterprise"** prong and the **"profits from the efforts of others"** prong. A token whose value depends purely on speculative trading and community/cultural sentiment — rather than on a company's ongoing managerial efforts to build a business and generate returns for holders — tends to fall outside Howey.

### 2.2 The SEC staff statement on meme coins (Feb 27, 2025)

On **February 27, 2025**, the SEC's **Division of Corporation Finance** published a *Staff Statement on Meme Coins*. Key points:

- **Definition:** a meme coin is "a type of crypto asset inspired by internet memes, characters, current events, or trends" that purchasers buy "for entertainment, social interaction, and cultural purposes," with value "driven primarily by market demand and speculation." Staff analogized them to **collectibles**.
- **Conclusion:** "the offer and sale of meme coins does not involve an investment in an enterprise nor is it undertaken with a reasonable expectation of profits to be derived from the entrepreneurial or managerial efforts of others." Therefore typical meme coins are **not securities** under the Securities Act, and their offer/sale does not require registration.
- **Promotion ≠ securities status:** staff noted that where promoters' efforts are "limited primarily to hyping the meme coin on social media" and getting it listed on trading platforms, that is *not* enough to create a reasonable expectation of profits from the efforts of others.
- **Two crucial caveats:**
  1. **Labeling doesn't save you.** "If the facts and circumstances related to the offer and sale of 'meme coins' indicated that the assets were securities, the Securities Act registration and exemption framework would apply." Calling something a meme coin is not a magic exemption.
  2. **Other regulators remain in play.** The statement expressly notes that conduct may still be reached by the **CFTC, state regulators, and other authorities**, and that **fraud** in connection with meme coins can be prosecuted under other federal and state laws.
- **It is staff guidance, not a rule or Commission action.** It does not bind courts and can be revised. Commissioner **Caroline Crenshaw** dissented, calling it "an incomplete, unsupported view of the law" and warning it carves an entire asset class out of SEC jurisdiction without a sound legal basis. (Note the SEC's composition and posture can shift with administrations.)

Statement: https://www.sec.gov/newsroom/speeches-statements/staff-statement-meme-coins
Crenshaw dissent: https://www.sec.gov/newsroom/speeches-statements/crenshaw-response-staff-statement-meme-coins-022725

### 2.3 The SEC–CFTC joint interpretation (Mar 17, 2026) — the most current development

Following a jurisdictional **MOU signed March 11, 2026**, the SEC and CFTC issued a **joint interpretation on March 17, 2026** establishing a five-category taxonomy of crypto assets:

1. **Digital commodities** (e.g., BTC, ETH) — value from a functional network, supply/demand; CFTC-oriented.
2. **Digital collectibles** — value from "subject matter, popularity, or scarcity"; **meme coins and many NFTs fall here.**
3. **Digital tools** — functional credentials, tickets, identity markers.
4. **Payment stablecoins** — statutorily excluded from securities classification (see GENIUS Act).
5. **Digital securities** — traditional financial instruments placed on a blockchain.

Key principles: a meme coin as a **digital collectible** is generally outside the securities definition, and "a security does not shed its regulatory status by virtue of being placed on a blockchain." Important caveat for glamworks: **fractionalized collectibles may qualify as investment contracts**, and post-sale creator activity is scrutinized. This interpretation reinforces — at the full-Commission level and jointly with the CFTC — the direction of the Feb 2025 staff statement.

(Sources: Norton Rose Fulbright, Jenner & Block, Akin, Sidley, Forvis Mazars summaries in the Sources section.)

### 2.4 CFTC angle

- Non-security crypto assets can be **commodities** under the Commodity Exchange Act, putting them within CFTC jurisdiction. The CFTC's core spot-market authority is primarily **anti-fraud and anti-manipulation** (its full spot-market regulatory authority remains a subject of pending legislation).
- The CFTC has a long track record of bringing fraud and manipulation cases involving crypto "commodities," and it expressly retains that hook for meme coins.

### 2.5 Legislative backdrop (market structure)

- **CLARITY Act** (H.R. 3633): passed the **House 294–134 on July 17, 2025**, sorting digital assets into digital commodities, investment-contract assets, and permitted payment stablecoins, and shifting mature-network digital commodities to the CFTC. **As of June 2026 it is not yet law** (Senate action pending). Treat it as direction-of-travel, not binding.
- **GENIUS Act** (signed July 18, 2025): a federal/state licensing regime specifically for **payment stablecoins**. Not directly applicable to a meme coin, but relevant if glamworks ever considered a stable-value token (it should not, for this purpose).

### 2.6 State securities ("blue sky") laws

Even if a token is not a federal security, **state securities laws** can apply, and state securities regulators (NASAA members) have historically been aggressive on crypto. State definitions of "security" and "investment contract" broadly track Howey but are enforced independently. State posture varies widely.

### 2.7 State money transmission / MSB

- Merely **issuing** a token that purchasers buy on a DEX or third-party platform generally does **not**, by itself, make glamworks a money transmitter. Money-transmission risk arises from **handling other people's funds/coins**: running an exchange, custodying customer assets, facilitating peer-to-peer transfers, or operating a swap/bridge.
- If glamworks avoids touching customer money — no custody, no in-house exchange, no taking fiat for tokens directly — money-transmitter licensing exposure is **much lower**. The moment the project operates any service that moves value for users, the analysis changes: **49 states** require money-transmitter licenses for value-transfer businesses (Montana is the outlier), plus federal **FinCEN MSB** registration and AML obligations.
- **Practical rule:** keep glamworks out of the flow of funds. Let neutral, third-party DEXs/launchpads handle trading.

---

## 3. Disclaimers — why they matter and what to say

Disclaimers do two jobs: they (a) help keep the token outside Howey by negating a "reasonable expectation of profit," and (b) reduce reliance-based fraud/consumer-protection exposure. They are **not** bulletproof — a court looks at *total* facts and circumstances, and contradictory hype can override a fine-print disclaimer.

Disclaimer content that aligns with SEC staff's own examples of non-security framing:

- Purchasers **should not expect to profit** or generate a return from owning the coin.
- **No person intends to exert efforts** to bring about a profit or return for holders.
- The coin has **no use, functionality, or intrinsic value** beyond entertainment/community.
- Purchasers **may lose all** money used to buy the coin.
- The coin is **for entertainment and cultural purposes only**.
- **No roadmap, no promises:** explicitly state there is no roadmap, no committed deliverables, no team obligation to do anything, and that any future activity is discretionary and not owed to holders.
- **Not investment advice; not an offer of securities.**

Placement and consistency matter more than wording: disclaimers must appear on the website, token page, social bios, and any official channel — **and the rest of the messaging must not contradict them.** A "for entertainment only" disclaimer next to "to the moon, 100x" tweets is worse than useless; it shows you knew.

---

## 4. "Advertise only after live" discipline

A recurring fact pattern in enforcement and litigation is **pre-launch hype and pre-sale promises**. Mitigations:

- **Do not promote, tease, or take pre-orders/pre-sales before the token is actually deployed and freely tradable.** Pre-sale promises ("buy in early before it lists") look like a profit pitch and invite both securities and fraud theories.
- **Don't tout or predict price.** No price targets, no "early," no "get in before X," no "100x," no comparisons to past winners. Touting price is the single fastest way to manufacture the "expectation of profit" prong and to attract pump-and-dump allegations.
- **Announce existence, not opportunity.** Once live, describe what it *is* (a community/entertainment token) rather than what it could be worth.
- **No coordinated buy campaigns** or paid influencer pumping; undisclosed paid promotion is itself an FTC/anti-touting problem and a classic pump-and-dump ingredient.
- **Time-stamp transparency:** publish the contract address, supply, and allocations *at* launch so there is no information asymmetry (a core failure in the LIBRA scandal, where the contract was not public when it was promoted).

---

## 5. Separate the token from the software and the OSS funding model

This is the highest-leverage risk control for an open-source org. Failure here is what converts a "meme coin" into an "investment contract."

- **The token must NOT fund the software.** If purchasers reasonably believe their money funds development of glamfire and they'll profit from that work, you have re-created the **"efforts of others"** prong and look like an unregistered securities offering. Keep development funding entirely separate (sponsorships, grants, donations, commercial licenses) and **say so explicitly**.
- **The software stays free and open.** Token ownership must confer **no** advantage in the software — no gated features, no premium tier, no "holders get access." Tying utility/access to the token both undercuts the "no functionality" framing and risks turning it into something with investment characteristics.
- **No governance or profit rights** unless you genuinely intend them — and if you do, that materially raises securities risk and changes the entire analysis. Avoid implying token holders get votes over the project, revenue shares, dividends, buybacks, staking yield, or any claim on glamworks assets or income. Those are textbook securities indicia.
- **No promises of glamworks "efforts" to increase token value.** The org should not position itself as the manager working to make the token go up.
- **Watch insider allocation.** Concentrating a large share of supply in founder/team wallets makes the team look like "insiders" and the project look like a "common enterprise," undermining the meme-coin analysis and creating dump/manipulation optics. Use transparent, capped, publicly disclosed allocations with credible lockups (or fair-launch mechanics).
- **Entity separation:** consider whether the token effort should sit in a separate legal entity from the OSS project/foundation, so token risk does not contaminate the software project, contributors, or maintainers. (Counsel decision.)

---

## 6. Community trust and how legal posture affects it

For an open-source org, **reputation is the product.** A token misstep damages the very community the software depends on.

- OSS communities are unusually sensitive to perceived "cash grabs." A token that looks like it monetizes goodwill, or that enriches insiders, can fracture contributor trust and fork risk.
- **Transparency is the trust currency:** public allocations, public contract, no hidden team wallets, no undisclosed paid promotion, clear "this does not fund the software and gives you nothing" messaging.
- A clean legal posture (clear disclaimers, no pre-sale, no price touting, no insider dumping) is also the posture that **reads as honest** to the community. The legal best practices and the reputational best practices are essentially the same list.
- Conversely, association with the meme-coin sector's worst patterns (rug pulls, pump-and-dumps) is a reputational contagion risk even if glamworks does everything right — which is an argument for either very disciplined execution or not doing it at all.

---

## 7. Anti-fraud exposure even if the token is NOT a security

This is the most important section. **"Not a security" removes registration obligations; it does not remove fraud liability.** Multiple bodies of law apply regardless of securities status:

- **Wire fraud (18 U.S.C. § 1343)** and **mail fraud** — the DOJ's go-to tools. Throughout 2025 the DOJ indicted numerous defendants for **wire-fraud conspiracy** over schemes to "artificially inflate the price of a cryptocurrency token" and dump holdings (e.g., multiple Northern District of California indictments and guilty pleas in 2025). No securities charge required.
- **Market manipulation / pump-and-dump** — coordinated buying to inflate price followed by insider selling is prosecutable as fraud and (for commodities) under CFTC anti-manipulation authority. The **HAWK** coin (2025) — where a small number of wallets held ~80–90% of supply and dumped within hours for a ~90%+ crash — and the **$LIBRA** scandal (Feb 2025, ~$250M+ losses, insiders pre-positioned ~20 minutes before promotion) are the canonical cautionary tales. Both drew criminal/regulatory investigations and class actions.
- **"Insider trading"–style theories** — even outside securities law, trading on/with material non-public information about a launch, or front-running your own promotion, supports fraud and manipulation charges.
- **Rug pull / breach-of-promise fraud** — abandoning a project or pulling liquidity after taking buyers' money is straightforward fraud.
- **FTC Act § 5 (unfair/deceptive acts)** and **state UDAP / consumer-protection statutes** — reach deceptive marketing, fake endorsements, undisclosed paid promotion.
- **State AG and state securities enforcement** — independent authority to pursue fraud and unregistered-security theories.
- **Private civil litigation** — class actions for fraud, misrepresentation, and (if a court disagrees on Howey) securities claims.

**Takeaway:** the meme-coin "safe harbor" is narrow and fragile. It protects you from *registration* requirements if you stay honest; it does **nothing** if conduct is deceptive, manipulative, or insider-advantaged.

---

## 8. Tax angle (brief)

> Educational only; consult a crypto tax professional.

**Issuer (glamworks / token-issuing entity):**
- Crypto is **property** for US federal tax purposes (IRS); there is no special meme-coin regime.
- There is no clear IRS guidance for token issuances, but **proceeds an issuer receives** from selling/distributing tokens generally constitute **taxable income** (token sales typically do **not** get the tax-free treatment that equity raises can). Retaining a large founder allocation has its own basis/valuation questions.
- New **Form 1099-DA** digital-asset broker reporting phases in for 2025–2026 (gross proceeds for 2025, cost basis from 2026), increasing IRS visibility.

**Holders:**
- Buying with crypto, swapping token-for-token, and selling are **taxable events**; gain/loss is capital, **short-term (ordinary rates, ~10–37%)** if held ≤1 year, **long-term (0/15/20%)** if held >1 year.
- **Airdrops and any rewards** are generally **ordinary income at fair market value when received**, with a later sale being a second taxable event. (Free airdrops to community can create surprise tax bills and recordkeeping burdens for recipients — a reputational/UX consideration.)

---

## 9. Key takeaways for glamfire/glamworks

- The 2025–2026 federal shift (Feb 2025 SEC staff statement + March 2026 SEC–CFTC joint interpretation classifying meme coins as **digital collectibles**) means a *clean, honest* `$GLAM`/`$GLAMFIRE` meme coin is **unlikely to be treated as a federal security** — **if** it has no investment pitch, no profit/governance rights, and no funding-the-software story.
- The real, unavoidable exposure is **fraud and manipulation law** (wire fraud, pump-and-dump, FTC/UDAP, state AGs), which applies regardless of securities status. Every 2025 disaster (LIBRA, HAWK) was a fraud/insider/manipulation problem.
- **Keep the token strictly separate from the software and its funding.** The software stays free and open; the token funds nothing and grants nothing. This is both the key securities defense and the key trust safeguard.
- **Marketing discipline is a legal control:** advertise only after the token is live and tradable; never tout or predict price; no pre-sales or pre-launch promises.
- **Insider allocation transparency** (no big hidden team wallets, public allocations, fair-launch or credible lockups) is essential to avoid both manipulation allegations and community backlash.
- Because reputation *is* the asset for an OSS org, weigh seriously whether the upside of launching meme coins justifies the contagion risk from a sector defined by rug pulls — and if proceeding, execute with maximum transparency and counsel involvement.

---

## 10. Risk-mitigation checklist

**Structure & legal**
- [ ] Engage crypto-literate securities, tax, and regulatory counsel *before* any launch or announcement.
- [ ] Consider housing the token in a **separate legal entity** from the OSS project/foundation.
- [ ] Confirm the token grants **no** governance, profit, dividend, revenue-share, staking-yield, or asset claims.
- [ ] Confirm token proceeds do **not** fund software development; document an independent funding model.
- [ ] Keep glamworks **out of the flow of funds** (no custody, no in-house exchange, no fiat-for-token sales) to minimize money-transmitter/MSB exposure; if any value-transfer service is added, get FinCEN/state MTL analysis first.
- [ ] Run a documented **Howey analysis** and **state blue-sky** check with counsel.

**Disclaimers & docs**
- [ ] Publish clear disclaimers everywhere: no profit expectation, no efforts by others, no functionality, may lose all value, entertainment only, no roadmap/promises, not an offer of securities, not investment advice.
- [ ] Ensure **all** messaging is consistent with the disclaimers (no contradictory hype).
- [ ] Publish a plain-language statement that the token does not fund the software and confers no rights.

**Tokenomics & transparency**
- [ ] Use transparent, **publicly disclosed allocations**; avoid large concentrated team/insider wallets; use fair-launch or credible, disclosed lockups.
- [ ] Publish the **contract address, total supply, and allocations at launch** (no information asymmetry).
- [ ] Use a neutral third-party DEX/launchpad for trading.

**Marketing discipline ("advertise only after live")**
- [ ] **No** pre-launch hype, teasers, pre-sales, or pre-orders; announce only once the token is live and tradable.
- [ ] **Never** tout or predict price, ROI, "early," "X," or "to the moon."
- [ ] **No** undisclosed paid promotion or coordinated buy campaigns; disclose any paid promotion clearly.
- [ ] Describe the token as entertainment/community, not as an opportunity.

**Anti-fraud / conduct**
- [ ] No insider front-running of launches or promotions; no trading on non-public launch info.
- [ ] No liquidity pulls / abandonment after taking buyers' money.
- [ ] Maintain records of allocations, disclosures, and decisions to evidence good faith.

**Tax**
- [ ] Plan for **taxable income** on issuer proceeds; get a tax opinion on the issuance.
- [ ] Warn recipients that **airdrops/rewards are ordinary income** and trades are taxable; prepare for 1099-DA reporting.

**Reputation / community**
- [ ] Communicate transparently with the OSS community about intent, allocations, and the "funds nothing, grants nothing" posture.
- [ ] Have a public incident/communications plan in case of a price crash or bad-actor exploitation of the token.

---

## Sources

- [SEC, Staff Statement on Meme Coins (Feb 27, 2025)](https://www.sec.gov/newsroom/speeches-statements/staff-statement-meme-coins)
- [SEC Commissioner Crenshaw, Response to Staff Statement on Meme Coins (Feb 27, 2025)](https://www.sec.gov/newsroom/speeches-statements/crenshaw-response-staff-statement-meme-coins-022725)
- [Morrison Foerster — SEC Corp Finance staff says offer and sale of meme coins not under Securities Act](https://www.mofo.com/resources/insights/250305-sec-s-corporation-finance-staff-says-the-offer)
- [McDermott — SEC's Division of Corporation Finance Says Meme Coins Are Not Securities](https://www.mwe.com/insights/secs-division-of-corporation-finance-says-meme-coins-are-not-securities/)
- [Dechert — SEC's Division of Corporation Finance Clarifies Stance on Meme Coins](https://www.dechert.com/knowledge/onpoint/2025/3/sec-s-division-of-corporation-finance-clarifies-stance-on-meme-c.html)
- [Hunton — SEC Staff Issues Statement on Meme Coins](https://www.hunton.com/blockchain-legal-resource/sec-staff-issues-statement-on-meme-coins)
- [WilmerHale — The State of Meme Coin Regulation](https://www.wilmerhale.com/en/insights/client-alerts/20250313-the-state-of-meme-coin-regulation-sec-staffs-statement-and-other-considerations)
- [Ropes & Gray — Meme Coins: SEC Staff Says "This is fine"](https://www.ropesgray.com/en/insights/alerts/2025/02/meme-coins-sec-staff-says-this-is-fine)
- [Fenwick — Entertainment or Investment? The SEC's Stance on Meme Coins](https://www.fenwick.com/insights/publications/entertainment-or-investment-the-secs-stance-on-meme-coins-as-securities)
- [Harvard Law Forum on Corporate Governance — Implications of the SEC's Stance that Meme Coins are not Securities](https://corpgov.law.harvard.edu/2025/03/19/implications-of-the-secs-stance-that-meme-coins-are-not-securities/)
- [Greenberg Traurig — SEC Clarifies Stance: Most Meme Coins Not Subject to Securities Regulation](https://www.gtlaw-overheardontheblockchain.com/2025/03/14/sec-clarifies-stance-most-meme-coins-not-subject-to-securities-regulation/)
- [Norton Rose Fulbright — SEC and CFTC Release Joint Interpretation on Crypto Asset Regulation (Mar 2026)](https://www.nortonrosefulbright.com/en-us/knowledge/publications/a88b661b/sec-and-cftc-release-joint-interpretation-on-crypto-asset-regulation)
- [Jenner & Block — SEC and CFTC Issue Landmark Joint Interpretation on Crypto Asset Classification](https://www.jenner.com/en/news-insights/client-alerts/sec-and-cftc-issue-landmark-joint-interpretation-on-crypto-asset-classification)
- [Akin — SEC and CFTC Issue Guidance on Applicability of Federal Securities Laws to Crypto Assets](https://www.akingump.com/en/insights/alerts/sec-and-cftc-issue-guidance-on-the-applicability-of-federal-securities-laws-to-crypto-assets-and-blockchain-activities)
- [Sidley Data Matters — SEC Releases Landmark Interpretation on Application of US Securities Laws to Crypto Assets](https://datamatters.sidley.com/2026/03/24/sec-releases-landmark-interpretation-on-application-of-u-s-securities-laws-to-crypto-assets-in-coordination-with-cftc/)
- [Forvis Mazars — SEC/CFTC Issue Historic Crypto Asset Framework](https://www.forvismazars.us/forsights/2026/03/sec-cftc-issue-historic-crypto-asset-framework-what-to-know)
- [Morgan Lewis — US Regulatory 'Crypto Sprint' Continues as CFTC Overhauls Guidance on Digital Assets](https://www.morganlewis.com/pubs/2025/12/us-regulatory-crypto-sprint-continues-as-cftc-overhauls-guidance-on-digital-assets)
- [Congress.gov — Overview of H.R. 3633, the CLARITY Act](https://www.congress.gov/crs-product/IN12583)
- [Arnold & Porter — Clarifying the CLARITY Act](https://www.arnoldporter.com/en/perspectives/advisories/2025/08/clarifying-the-clarity-act)
- [BeInCrypto — What Is the CLARITY Act?](https://beincrypto.com/learn/what-is-the-clarity-act/)
- [Astraea Counsel — State-by-State Crypto Licensing Map (2025)](https://astraea.law/insights/state-by-state-crypto-licensing-map-2025)
- [Ridgeway — Money Transmitter License Requirements by State (2026)](https://www.ridgewayfs.com/money-transmitter-license-requirements-by-state/)
- [Paul Hastings — State-Level Developments: The Regulatory Landscape for Digital Assets](https://www.paulhastings.com/insights/crypto-policy-tracker/state-level-developments-the-regulatory-landscape-for-digital-assets)
- [DOJ (N.D. Cal.) — Ten Foreign Nationals Charged in International Operation Targeting Cryptocurrency Market Manipulation](https://www.justice.gov/usao-ndca/pr/ten-foreign-nationals-charged-international-operation-targeting-cryptocurrency-market)
- [DOJ (D. Mass.) — Eighteen Individuals and Entities Charged in International Operation Targeting Crypto Market Fraud and Manipulation](https://www.justice.gov/usao-ma/pr/eighteen-individuals-and-entities-charged-international-operation-targeting-widespread)
- [Faruqi & Faruqi — Meme Coin Pump and Dumps](https://faruqilaw.com/blog/1015/meme-coin-pump-and-dumps/)
- [Wikipedia — $Libra cryptocurrency scandal](https://en.wikipedia.org/wiki/$Libra_cryptocurrency_scandal)
- [Fortune — Javier Milei endorsed a memecoin that lost $4 billion](https://fortune.com/crypto/2025/02/18/javier-milei-memecoin-libra-cryptocurrency-crash-argentina-federal-judge-investigation/)
- [CoinDesk — Argentine President Milei's call logs link him to Libra rug pull (Apr 2026)](https://www.coindesk.com/business/2026/04/07/argentine-president-milei-s-call-logs-link-him-to-multimillion-dollar-libra-rug-pull-nyt)
- [LegalNodes — Meme Tokens as a GTM Strategy: Key Legal Considerations](https://www.legalnodes.com/article/meme-tokens-legal-considerations)
- [IRS — Frequently Asked Questions on Virtual Currency Transactions](https://www.irs.gov/individuals/international-taxpayers/frequently-asked-questions-on-virtual-currency-transactions)
- [IRS — Digital Assets](https://www.irs.gov/filing/digital-assets)
- [Coincub — Memecoin Taxes 2025: Rules, Rates, and Strategies](https://coincub.com/blog/memecoin-taxes-2025/)
- [CNBC — IRS crackdown and new requirements for crypto (1099-DA), 2025 filing year](https://www.cnbc.com/2025/11/22/new-irs-requirements-crypto-tax-cheat-risky-this-year-filing.html)
- [Koinly — Crypto Taxes: Expert Guide 2026](https://koinly.io/guides/crypto-taxes/)
