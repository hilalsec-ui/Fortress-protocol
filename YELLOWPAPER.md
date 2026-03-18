# 🏰 FORTRESS PROTOCOL
## Yellowpaper — Autonomous Lottery Engine

**Version:** 1.0  
**Date:** March 2026  
**Network:** Solana Mainnet  
**Token Standard:** SPL Token-2022  

---

> *"No house. No operator. No trust required."*

---

## Official Token

| Field | Value |
|---|---|
| **Token Name** | Fortress Protocol Token |
| **Symbol** | $FPT |
| **Mint Address** | `3YTnzmFTECtyKDxaghWPQcjzX7g1Cj3NxMq41JdWk2rj` |
| **Standard** | SPL Token-2022 (Token Extensions) |
| **Decimals** | 6 |
| **Total Supply** | 1,000,000,000 FPT |
| **Blockchain** | Solana |

> ⚠️ **The mint address above is the one and only official $FPT token. Any other token claiming to be FPT is fraudulent.**

---

---

# PAGE 1 — INTRODUCTION & VISION

## What Is Fortress Protocol?

Fortress Protocol is a fully autonomous, decentralised lottery engine deployed on the Solana blockchain. Every rule, every payout, and every draw is executed exclusively by on-chain smart contracts. There is no central operator who can pause a draw, redirect a prize, or change the odds. Once a ticket is purchased and the vault reaches its threshold, the outcome is determined entirely by verifiable randomness provided by **Switchboard Oracles** — and the prize is transferred automatically, in the same transaction, to the winner's wallet.

This is not a raffle website. It is a permissionless financial protocol.

## Why Solana?

Solana processes thousands of transactions per second with sub-second finality and transaction costs below $0.001. This makes it the only chain where a lottery with 100 participants can resolve, select a winner, and pay out in a single atomic transaction without prohibitive gas costs. Fortress Protocol is built with the **Anchor framework**, the industry standard for auditable Solana programs, ensuring the contract logic is readable, verifiable, and open.

## The Problem With Traditional Lotteries

Traditional and even many "blockchain" lotteries suffer from one or more of these flaws:

- **Operator risk** — A central party controls the random seed or the payout
- **Predictable randomness** — Using block hash or timestamp is gameable by validators
- **Opaque accounting** — Players cannot verify how the prize pool is calculated
- **Custody risk** — Funds held in a hot wallet controlled by a company

Fortress Protocol eliminates all four. Funds are held in **Program-Derived Addresses (PDAs)** — accounts that only the on-chain program can sign for. No human holds the keys.

---

---

# PAGE 2 — LOTTERY MECHANICS

## The Four Lottery Types

Fortress Protocol runs **20 simultaneous lottery pools** across four formats and four price tiers. Every pool is independent, self-resetting, and fully autonomous.

### Format Overview

| Format | Name | Draw Trigger | Reset |
|---|---|---|---|
| **LPM** | Limited Participant Mode | Exactly 100 tickets sold | Automatic |
| **DPL** | Daily Pool Lottery | 24-hour timer expires | Automatic |
| **WPL** | Weekly Pool Lottery | 7-day timer expires | Automatic |
| **MPL** | Monthly Pool Lottery | 30-day timer expires | Automatic |

### Ticket Tiers

Every format runs four price tiers simultaneously. Tickets are purchased in $USD-equivalent $FPT, priced in real-time against the live Raydium DEX market rate.

| Tier | Ticket Price | Pool Size (100 tickets) | Winner Receives (95%) |
|---|---|---|---|
| **Tier $5** | $5 in FPT | $500 | $475 |
| **Tier $10** | $10 in FPT | $1,000 | $950 |
| **Tier $15 / $20** | $15–$20 in FPT | $1,500–$2,000 | $1,425–$1,900 |
| **Tier $50** | $50 in FPT | $5,000 | $4,750 |

> **Payout split: 95% to winner · 5% to protocol treasury.** This 5% funds oracle fees, on-chain infrastructure costs, and ongoing protocol development. It is enforced in code — the contract cannot pay out any other ratio.

### How a Draw Works (Step by Step)

```
1. User connects wallet → selects lottery type + tier → approves FPT payment

2. Smart contract:
   a. Converts $USD tier price → exact µFPT amount using live oracle rate
   b. Validates slippage tolerance (10% max deviation)
   c. Transfers FPT from buyer wallet → LotteryVault PDA
   d. Records buyer's public key in ParticipantPage account (max 50 per page)

3. When the draw condition is met (100 participants OR timer expiry):
   a. Crank bot (permissionless keeper) calls draw_<type>_winner
   b. Contract requests a fresh random value from Switchboard Oracle
   c. Random index (0–99) is derived from oracle output
   d. find_winner_in_chain() traverses ParticipantPage linked list
   e. Winner's public key is resolved

4. Atomic settlement (same transaction):
   a. 95% of vault → winner's FPT Associated Token Account
   b.  5% of vault → protocol treasury PDA
   c. Vault resets: balance = 0, participant_count = 0
   d. Pool is immediately open for the next round
```

### Participant Page Architecture

To scale to 100 participants without hitting Solana's account size limits, Fortress Protocol uses a **linked-list of ParticipantPage accounts**. Each page holds up to 50 participants. Two pages cover a full 100-person draw.

```
Page 0  [participants 1–50]  → points to →  Page 1  [participants 51–100]
```

Each page is a PDA derived from `[b"page", lottery_type, tier, page_number]`. The winner traversal algorithm walks the chain deterministically based on the oracle-provided random index.

---

---

# PAGE 3 — SWITCHBOARD ORACLE & RANDOMNESS

## Why Randomness Is The Hardest Problem

A lottery is only trustworthy if its random number cannot be predicted or biased. On a blockchain, every input to a transaction is public and deterministic. Using "block hash" or "clock timestamp" as a random seed is fundamentally broken — a validator or a sophisticated user can calculate or influence these values before the transaction lands. This is known as a **commit-reveal attack**.

Fortress Protocol solves this completely by delegating randomness to **Switchboard — the leading decentralised oracle network on Solana**.

## What Switchboard Provides

Switchboard is a permissionless oracle protocol where a decentralised network of independent node operators each contribute to producing a verifiable random number. The key properties are:

| Property | Description |
|---|---|
| **Verifiable** | The random value comes with a cryptographic proof. Anyone can verify it was produced honestly. |
| **Decentralised** | No single Switchboard node can bias the output. A threshold of nodes must agree. |
| **On-chain verified** | The Fortress smart contract verifies the oracle proof inside the transaction. It will reject any unverifiable or stale result. |
| **Non-predictable** | The random value is not known until it is committed on-chain, after the draw condition is met. |

## How It Integrates With Fortress Protocol

```
Draw trigger (100 participants OR timer expiry)
         │
         ▼
draw_<type>_winner instruction
         │
         ├─ Reads Switchboard RandomnessAccountData passed in accounts
         ├─ Calls switchboard_oracle.get_value() → raw 32-byte random seed
         ├─ Derives winner_index = seed mod 100  (uniform, unbiasable)
         ├─ Verifies seed Age: rejects if oracle data is stale (> 1 epoch old)
         └─ Passes index to find_winner_in_chain() → winner resolved on-chain
```

The random seed is consumed in a single instruction. There is no multi-step process that could be front-run. The draw, the winner selection, and the payout all happen atomically.

## Security Guarantees

**No single point of failure.** The Fortress contract enforces these invariants at the instruction level:

- `is_drawn` flag prevents any vault from being drawn twice
- Slippage validation rejects FPT rate manipulation at purchase time
- PDA-signed vaults ensure only the program can move funds out
- Oracle staleness check rejects recycled or replayed randomness
- All math uses checked arithmetic — no integer overflow is possible

**What an attacker would need to manipulate a draw:**

1. Compromise a supermajority of Switchboard oracle nodes *and*
2. Control a Solana validator to time the block *and*
3. Break Ed25519 signature verification

This is computationally infeasible. The protocol's security model degrades gracefully with each layer — no single vulnerability is sufficient.

---

---

# PAGE 4 — TOKEN ECONOMICS & PARTICIPATION

## $FPT — The Entry Key

`$FPT` (Fortress Protocol Token) is the **sole currency** accepted across all 20 lottery pools. There are no SOL tickets, no stablecoin tickets, no alternative paths. This creates a unified demand driver: every ticket purchased anywhere in the protocol requires $FPT.

**Official Mint Address:**
```
3YTnzmFTECtyKDxaghWPQcjzX7g1Cj3NxMq41JdWk2rj
```

## Live Market Pricing — No Fixed Rates

Ticket prices are quoted in USD ($5 / $10 / $15 / $20 / $50) but charged in $FPT at the **live Raydium DEX market price**, fetched in real-time from DexScreener and cross-referenced with GeckoTerminal. This means:

- If FPT's price rises, fewer FPT tokens are required per ticket
- If FPT's price falls, more FPT tokens are required per ticket
- The USD value of what you pay is always accurate to the market

The conversion formula is:

```
fpt_per_ticket = tier_usd × (1,000,000 / fpt_market_price_usd)
```

A 10% slippage buffer is built into every transaction at the contract level, protecting users from price movement between signing and chain confirmation.

## How To Participate

1. **Acquire $FPT** — Buy on Raydium using the official mint address above
2. **Connect your wallet** — Phantom, Solflare, and all major Solana wallets supported
3. **Choose your pool** — Select a lottery type (LPM / DPL / WPL / MPL) and a tier
4. **Buy tickets** — 1 to 50 tickets per transaction; up to 100 per pool
5. **Wait for the draw** — LPM draws the moment 100 tickets sell; timed pools draw at expiry
6. **Receive prize automatically** — No claim step. The FPT prize lands in your wallet in the draw transaction itself.

## Protocol Health & Transparency

Every account in Fortress Protocol is publicly readable on Solana Explorer:

- **LotteryVault accounts** show current balance, participant count, last winner, last prize
- **ParticipantPage accounts** show every wallet address that entered a given round
- **GlobalRegistry** shows cumulative protocol statistics: total draws, total prizes distributed

There is nothing hidden. The protocol has no admin override. The authority key can only perform initialisation operations — it cannot touch vault funds, reassign winners, or halt draws.

---

## Summary

| Feature | Fortress Protocol |
|---|---|
| Randomness | Switchboard Oracle (verifiable, decentralised) |
| Fund custody | PDA-only (no human key-holder) |
| Winner payout | Automatic, same transaction as draw |
| Prize split | 95% winner / 5% treasury — enforced in code |
| Ticket currency | $FPT only |
| Pools | 20 simultaneous (4 formats × 4 tiers) |
| Draw frequency | Every 100 tickets (LPM) or every 24h / 7d / 30d |
| Chain | Solana (sub-second finality, <$0.001 fees) |
| Smart contract | Anchor / Rust — open source |

---

*Fortress Protocol is an autonomous on-chain system. Participation involves financial risk. Past draws do not guarantee future results. Always verify the official token mint address before purchasing $FPT.*

---

**© 2026 Fortress Protocol** | Token: `3YTnzmFTECtyKDxaghWPQcjzX7g1Cj3NxMq41JdWk2rj`
