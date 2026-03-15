# Fortress Protocol

A production-ready on-chain lottery system deployed on **Solana mainnet**. Built with Anchor 0.32.1, Token-2022, and Switchboard V3 On-Demand randomness.

## 🚀 Deployment

| | |
|---|---|
| **Network** | Solana Mainnet-Beta |
| **Program ID** | `EB6kkg2sW5rnukjRH7Ljhz78gbfc36XZAuiFn5jdefF3` |
| **IDL Account** | `BDNQMd2XwvAhmMB8wCzxzajQEF3Ky5h5krpWg1dZ17iG` |
| **Deploy TX** | `3yrt41a5PsNC3q2V2xiLeD6r7BNQz1TvQV9RkSeWnymsTRfGjbCBA1kvKz1Jq99ThRLT4LkKujowi1ed5woNGgWN` |
| **Deployed** | 2026-03-16 |
| **FPT Mint** | `3YTnzmFTECtyKDxaghWPQcjzX7g1Cj3NxMq41JdWk2rj` (Token-2022) |
| **Authority** | `EANi5dM5CUbtoiJAN72JgKMSNM6bMWsSWMX1w1t2yWcv` |

## 🎯 Lottery Types

4 lottery types × 4 tiers each = **16 independent vaults**.

| Type | Full Name | Tiers (USD) | Draw Condition |
|---|---|---|---|
| **LPM** | Lightning Pool Monthly | 5, 10, 20, 50 | 100 participants reached |
| **DPL** | Daily Pool | 5, 10, 15, 20 | 24-hour interval |
| **WPL** | Weekly Pool | 5, 10, 15, 20 | 7-day interval |
| **MPL** | Monthly Pool | 5, 10, 15, 20 | 30-day interval |

Prize split: **95% to winner, 5% to treasury** — enforced on-chain.

## 🏛️ On-Chain Accounts

### Global (3 accounts)

| Account | Address | Description |
|---|---|---|
| `GlobalRegistry` | `6qwNDYDswpsQiPbrh22mRmoVZn7NyKczHXkkwapjPgTm` | Protocol-wide registry |
| `Treasury` | `9ygCDTSwHQHXavdBPW2V6LNpUbG12czvqxZrYnqWkE9e` | Fee recipient (5%) |
| `sol_vault` | `5PjvdFbGwr1psQmL6aZun21mN6gJYBoLhH1VMRFh13si` | SOL operational wallet |

### Vault PDAs (16 accounts)

Seeds: `["vault_lpm" | "vault_dpl" | "vault_wpl" | "vault_mpl", tier_byte]`

Each vault has a paired `WinnerHistory` account (seeds: `["winner_history", type_id_byte, tier_byte]`).

| Vault | Address |
|---|---|
| LPM-5 | `AvKG8Q5S2uLkWQJu3fWGVABmC53Mb6EumXKt798wprKM` |
| LPM-10 | `CcoBjChgmxjmPYbG2X4iPLjXUsBTQDfeFkkkZMZLJJDY` |
| LPM-20 | `AJkAYJwAHaWKju8wx1QuQyUMR3wDvKeLigAJyXqkvY8F` |
| LPM-50 | `G78mH6UiNpDNAnjsQussSaaLpNer8u8vn2oc3TTiQrpG` |
| DPL-5  | `E3fJQmXSU4kEdE99XnBgkgf4KTKD3BF8nymyE3p83d1G` |
| DPL-10 | `FbL2bcGGBWD8RLRSCZve5z69g6aCQBQ2P8J8h2mexqY` |
| DPL-15 | `5H7vYJSDKf1E6bBGkjZDxKB2nbPfRG6moWNeFuQc6ShT` |
| DPL-20 | `DDp9myrfDgfTCKVFMRGmQd97JGaaddNkhPDXPVRivmwZ` |
| WPL-5  | `FC9T9yEA8LLFwtCXeg36bBWkZ3RSe2WiwDuGoxCpjuni` |
| WPL-10 | `8reAf26acLaWnVLt5ukabB18tR2zkwzLSSUwCaMC8RfQ` |
| WPL-15 | `E1HSLGT6mSNQxCZcGVRbDzZCkK5K2uRTuwbqiefkaFm8` |
| WPL-20 | `HcpPEUrJJzXyxxMXurG5jxSmVWLW8F8V3g1CzfAUxnnd` |
| MPL-5  | `HfxgvKnMUbPws3txcmfR5CLxNjhARDux8wtq7Z6YakH3` |
| MPL-10 | `5wsBcHucSZzMF5BEuJAAoEEUHgeL58pj4kQiVTputtkM` |
| MPL-15 | `9rKZyhb6KncyEgQec6bZzogeA9Tw6nD5x3WmuDwqb9uR` |
| MPL-20 | `6rEdCLeyukfegRmopbBMeFH4RfzD9XLsnJ9LxeU1R6S3` |

## ⚙️ Architecture

### Randomness

Uses **Switchboard V3 On-Demand** (SRS — Secured Randomness Service):
- Program: `Aio4gaXjXzJNVLtzwtNVmSqGKpANtXhybbkhtAC94ji2`
- Queue: `3u9PpRz7fN8Lp693zPueppQf94v7N2jKj3C18j9o7oG1`
- Each vault tier has a pre-initialized `RandomnessAccount` PDA
- Draw flow: `requestDrawEntropy` → oracle TEE commits → `fulfillDrawEntropy` reveals winner

### Token Standard

All FPT transfers use **Token-2022** (`TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb`).

### Draw Flow

1. Crank (or user) calls `requestDrawEntropy(lottery_type_id, tier)` — commits randomness
2. Switchboard oracle TEE processes the commit (~1–5 s on mainnet)
3. Crank calls `fulfillDrawEntropy(lottery_type_id, tier, bounty_fpt)` — reveals, selects winner, distributes prizes
4. `WinnerHistory` is updated; vault resets for the next round

## 🛠️ Development

### Prerequisites

- Rust (stable, `sbpf-solana-solana` target)
- Anchor CLI 0.32.1
- Node.js 18+
- Solana CLI 2.0+

### Build

```bash
anchor build
```

### Install frontend dependencies

```bash
cd app && npm install
```

### Run frontend (dev)

```bash
cd app && npm run dev
```

### Scripts (`scripts/`)

| Script | Purpose |
|---|---|
| `init-all.ts` | Initialize all 19 on-chain accounts (run once after deploy) |
| `init-sb-randomness.ts` | Initialize Switchboard randomness accounts |
| `reinit-sb-randomness-crank.ts` | Re-initialize SB randomness for crank wallet |
| `fund-crank-wallet.ts` | Fund the crank operator wallet |
| `fund-treasury-fpt.ts` | Seed the treasury ATA with FPT |
| `check-registry.ts` | Read GlobalRegistry state |
| `check-seeds.ts` | Verify PDA derivation |
| `verify-lottery-status.ts` | Check vault states |
| `withdraw-treasury-vault.ts` | Admin: withdraw treasury FPT |

## 📄 Documentation

- [Whitepaper](./docs/Fortress_Whitepaper.html)
- [PDA Manifest (Mainnet)](./PDA_MANIFEST_MAINNET.json)
- [Quick Reference](./QUICK_REFERENCE.md)

## License

MIT
