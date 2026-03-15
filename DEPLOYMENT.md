# 🚀 Fortress Protocol — Mainnet Deployment

**Last Updated**: March 16, 2026

---

## ✅ Status: LIVE ON MAINNET

### Active Program Details

| Field | Value | Status |
|-------|-------|--------|
| **Program ID** | `EB6kkg2sW5rnukjRH7Ljhz78gbfc36XZAuiFn5jdefF3` | ✅ Live |
| **Network** | Solana Mainnet-Beta | ✅ Active |
| **Authority Wallet** | `EANi5dM5CUbtoiJAN72JgKMSNM6bMWsSWMX1w1t2yWcv` | ✅ Active |
| **IDL Account** | `BDNQMd2XwvAhmMB8wCzxzajQEF3Ky5h5krpWg1dZ17iG` | ✅ On-chain |
| **Deploy TX** | `3yrt41a5PsNC3q2V2xiLeD6r7BNQz1TvQV9RkSeWnymsTRfGjbCBA1kvKz1Jq99ThRLT4LkKujowi1ed5woNGgWN` | ✅ Confirmed |
| **Binary size** | 422 KB | — |
| **Deployment cost** | 2.9446716 SOL | — |

### Deprecated Program IDs

| Field | Value | Status |
|-------|-------|--------|
| **Program ID (v0.1-devnet)** | `6ZHKxpH1fhhv7ACzLTwHfV8AZmJB9oW4UfwdTCf1sryd` | ❌ Deprecated |
| **Program ID (v0.2-dev)** | `2JHDbUz11kLe7q44nneougHcJCQqD6t26XeEFFNQJpHY` | ❌ Keypair lost |

---

## 🎯 Key Program Constants

```typescript
// Fortress Lottery Program
export const PROGRAM_ID = "EB6kkg2sW5rnukjRH7Ljhz78gbfc36XZAuiFn5jdefF3";
export const FPT_MINT = "3YTnzmFTECtyKDxaghWPQcjzX7g1Cj3NxMq41JdWk2rj";
export const RPC_ENDPOINT = "https://api.devnet.solana.com";
export const AUTHORITY = "EANi5dM5CUbtoiJAN72JgKMSNM6bMWsSWMX1w1t2yWcv";
```

---

## 📝 Global State Accounts (PENDING INITIALIZATION)

All state accounts must be re-initialized after deployment since the Program ID changed.

### Registry
- **PDA**: `[b"registry"]` seeded with new Program ID
- **Status**: ⏳ PENDING INITIALIZATION
- **Action**: Run `anchor run init-devnet`

### Lottery Vaults (20 Total)
All PDAs are keyed with the new Program ID.

#### LPM (Lightning Pool Monthly)
| Tier | Vault PDA | Status |
|------|-----------|--------|
| $5   | Derives from `[b"vault_lpm", tier]` | ⏳ Pending |
| $10  | Derives from `[b"vault_lpm", tier]` | ⏳ Pending |
| $20  | Derives from `[b"vault_lpm", tier]` | ⏳ Pending |
| $50  | Derives from `[b"vault_lpm", tier]` | ⏳ Pending |

#### DPL (Daily Pool)
| Tier | Vault PDA | Status |
|------|-----------|--------|
| $5   | Derives from `[b"vault_dpl", tier]` | ⏳ Pending |
| $10  | Derives from `[b"vault_dpl", tier]` | ⏳ Pending |
| $15  | Derives from `[b"vault_dpl", tier]` | ⏳ Pending |
| $20  | Derives from `[b"vault_dpl", tier]` | ⏳ Pending |

#### WPL (Weekly Pool) - 4 tiers ($5, $10, $15, $20)
#### MPL (Monthly Pool) - 4 tiers ($5, $10, $15, $20)
#### YPL (Yearly Pool) - 4 tiers ($5, $10, $15, $20)

---

## 🔧 Deployment Instructions

### Step 1: Verify Wallet Balance
```bash
solana balance EANi5dM5CUbtoiJAN72JgKMSNM6bMWsSWMX1w1t2yWcv --url devnet
```

**Required**: At least 5 SOL (for deployment + state initialization)

### Step 2: Deploy Program
```bash
cd /home/dev/fortress
anchor deploy --provider.cluster devnet
```

**Expected Output**:
```
Deploying cluster: https://api.devnet.solana.com
Upgrade authority: EANi5dM5CUbtoiJAN72JgKMSNM6bMWsSWMX1w1t2yWcv
Deploying program "fortress_lottery"...
Program deployed to: EB6kkg2sW5rnukjRH7Ljhz78gbfc36XZAuiFn5jdefF3
```

### Step 3: Initialize Global State
After deployment, initialize the registry and vaults:
```bash
anchor run init-devnet
```

This will:
1. ✅ Create Global Registry PDA
2. ✅ Initialize 20 Lottery Vaults
3. ✅ Export PDA manifest to `PDA_MANIFEST_DEVNET.json`

### Step 4: Verify on Devnet
```bash
# Check program exists
solana program show EB6kkg2sW5rnukjRH7Ljhz78gbfc36XZAuiFn5jdefF3 --url devnet

# Check wallet balance
solana balance EANi5dM5CUbtoiJAN72JgKMSNM6bMWsSWMX1w1t2yWcv --url devnet
```

---

## 🔄 Project Synchronization Status

| Component | Status | Details |
|-----------|--------|---------|
| **Anchor.toml** | ✅ Synced | Both devnet and localnet use new ID |
| **lib.rs** | ✅ Synced | `declare_id!` macro updated |
| **app/src/utils/constants.ts** | ✅ Synced | PROGRAM_ID updated |
| **app/src/idl/** | ✅ Refreshed | IDL and Types copied from target/ |
| **No old references** | ✅ Verified | Old 6ZHK... ID removed from code |
| **Keypair** | ✅ Present | `target/deploy/fortress_lottery-keypair.json` |

---

## 📋 Configuration Files

### Anchor.toml
```toml
[programs.devnet]
fortress_lottery = "EB6kkg2sW5rnukjRH7Ljhz78gbfc36XZAuiFn5jdefF3"

[programs.localnet]
fortress_lottery = "EB6kkg2sW5rnukjRH7Ljhz78gbfc36XZAuiFn5jdefF3"
```

### app/src/utils/constants.ts
```typescript
export const PROGRAM_ID = "EB6kkg2sW5rnukjRH7Ljhz78gbfc36XZAuiFn5jdefF3";
export const RPC_ENDPOINT = "https://api.devnet.solana.com";
export const FPT_MINT = "3YTnzmFTECtyKDxaghWPQcjzX7g1Cj3NxMq41JdWk2rj";
```

---

## 🎛️ Smart Contract Features

- ✅ 5 Lottery Types: LPM, DPL, WPL, MPL, YPL
- ✅ 4 Tiers per lottery
- ✅ 20 Independent vaults with separate PDAs
- ✅ Token-2022 FPT integration (6 decimals)
- ✅ Blockhash-based randomness
- ✅ 95/5 prize distribution
- ✅ Linked-list participant pagination
- ✅ Time-based lottery scheduling

---

## ✅ Pre-Deployment Checklist

- [x] New Program ID generated: `EB6kkg2sW5rnukjRH7Ljhz78gbfc36XZAuiFn5jdefF3`
- [x] Keypair present: `target/deploy/fortress_lottery-keypair.json`
- [x] All configuration files synced
- [x] Frontend constants updated
- [x] IDL and Types refreshed
- [x] Old Program ID deprecated
- [x] Authority wallet: `EANi5dM5CUbtoiJAN72JgKMSNM6bMWsSWMX1w1t2yWcv`
- [ ] Wallet has sufficient SOL (verify with step 1 above)
- [ ] Program deployed (run: `anchor deploy --provider.cluster devnet`)
- [ ] Registry initialized (run: `anchor run init-devnet`)

---

## 🚀 Next Actions

1. **Verify wallet balance** has minimum 5 SOL
2. **Deploy program** using command in Step 2 above
3. **Initialize state** using command in Step 3 above
4. **Test frontend** Buy Ticket flow
5. **Run lottery** Draw Winner transactions

---

**Status**: Ready to Deploy ✅
