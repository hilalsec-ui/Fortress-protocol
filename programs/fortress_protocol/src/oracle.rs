use anchor_lang::prelude::*;
use crate::errors::LotteryError;

// Multiplicative hash constants (Knuth / Fibonacci) for entropy mixing
pub const HASH_K1: u64 = 0x9e3779b97f4a7c15;
pub const HASH_K2: u64 = 0x517cc1b727220a95;

/// Switchboard V3 On-Demand program (verified EXE on devnet)
pub const SB_ON_DEMAND_PROGRAM: Pubkey = pubkey!("Aio4gaXjXzJNVLtzwtNVmSqGKpANtXhybbkhtAC94ji2");

/// Server-side crank wallet — auto-triggers draws silently (no user wallet popup).
/// On-chain reference used to distinguish crank from manual-fallback callers so
/// the vault only pays out the trigger bounty to real users, not to the crank.
pub const CRANK_AUTHORITY: Pubkey = pubkey!("CH5CLt2e26cho7es4oAs536AgZqSzNR29WWrQ3QR6JUz");

// ── Switchboard On-Demand Pull-Oracle price-feed constants ────────────────────

/// Ed25519 signature-verification program (Solana native).
/// The `fetchManagedUpdateIxs` function prepends an Ed25519 instruction that
/// carries oracle-signed price data; we find it by this program ID.
pub const ED25519_PROGRAM_ID: Pubkey = pubkey!("Ed25519SigVerify111111111111111111111111111");

/// FPT pool-participation ratio: 1 SOL = DEFAULT_FPT_PER_SOL FPT.
/// Must match the constant used in switchboardPriceService.ts.
pub const DEFAULT_FPT_PER_SOL: u64 = 1_000;

/// Minimum USD entry fee (base tier).
pub const ENTRY_FEE_USD_BASE: u64 = 5;

/// Maximum oracle quote age in slots before it is considered stale (~12 s on Solana).
pub const MAX_FEED_STALENESS_SLOTS: u64 = 30;

/// Minimum number of distinct oracle signatures required in a valid price update.
pub const MIN_ORACLE_SAMPLES: u8 = 3;

/// Parse a Switchboard oracle SOL/USD price from the Ed25519 instruction that
/// `queue.fetchManagedUpdateIxs` (SDK v3) prepends to the transaction.
///
/// Ed25519 instruction data layout ("SBOD" format):
/// ```
/// [0]       count: u8                  — number of oracle signatures
/// [1]       padding: u8
/// [2..16]   SignatureOffsets[0] (14 B):
///              bytes [8..10] (abs: [10..12]) = messageDataOffset  LE-u16
///              bytes [10..12] (abs: [12..14]) = messageDataSize    LE-u16
/// …
/// [msgOff..msgOff+msgSize]  message:
///   [0..32]  signed_slothash
///   [32..64] feed_hash (32 B)
///   [64..80] value: i128 LE  — SOL/USD price × 10^18
///   [80]     min_oracle_samples: u8
/// [msgOff+msgSize .. +count]  oracle_indexes: [u8; count]
/// [+count .. +count+8]        recent_slot: u64 LE
/// [+1]                        version: u8
/// [+4]                        "SBOD" discriminator
/// ```
///
/// Returns `(sol_price_18dec, min_samples, recent_slot)`.
pub fn parse_sb_oracle_price_from_ed25519(ix_data: &[u8]) -> Result<(i128, u8, u64)> {
    if ix_data.len() < 14 {
        return err!(LotteryError::InvalidPriceFeed);
    }
    let count = ix_data[0] as usize;
    if count == 0 {
        return err!(LotteryError::InvalidPriceFeed);
    }

    // messageDataOffset / messageDataSize live at absolute bytes 10–13
    let msg_offset = u16::from_le_bytes([ix_data[10], ix_data[11]]) as usize;
    let msg_size   = u16::from_le_bytes([ix_data[12], ix_data[13]]) as usize;
    if ix_data.len() < msg_offset.saturating_add(msg_size) || msg_size < 81 {
        return err!(LotteryError::InvalidPriceFeed);
    }
    let msg = &ix_data[msg_offset..msg_offset + msg_size];

    // SOL/USD price × 10^18 lives at message bytes 64..80
    let value = i128::from_le_bytes(
        msg[64..80].try_into().map_err(|_| error!(LotteryError::InvalidPriceFeed))?
    );
    let min_samples = msg[80];

    // recent_slot: u64 immediately after (message + oracle_indexes)
    let slot_start = msg_offset.saturating_add(msg_size).saturating_add(count);
    if ix_data.len() < slot_start.saturating_add(8) {
        return err!(LotteryError::InvalidPriceFeed);
    }
    let slot = u64::from_le_bytes(
        ix_data[slot_start..slot_start + 8]
            .try_into()
            .map_err(|_| error!(LotteryError::InvalidPriceFeed))?,
    );

    // Optional: verify "SBOD" discriminator (slot+8 + version+1)
    let disc_start = slot_start + 9;
    if ix_data.len() >= disc_start + 4 && &ix_data[disc_start..disc_start + 4] != b"SBOD" {
        return err!(LotteryError::InvalidPriceFeed);
    }

    Ok((value, min_samples, slot))
}

/// Compute the required µFPT per ticket from a Switchboard oracle SOL/USD price.
///
/// Formula:
///   sol_price_6dec  = sol_price_18dec / 10^12
///   fpt_per_ticket  = tier_usd × DEFAULT_FPT_PER_SOL × 10^12 / sol_price_6dec
///
/// Example (SOL = $180, tier = $5):
///   sol_price_6dec = 180_000_000 (= $180 × 10^6)
///   fpt_per_ticket = 5 × 1 000 × 10^12 / 180_000_000 ≈ 27_777_778 µFPT
pub fn compute_fpt_from_oracle_price(sol_price_18dec: i128, tier_usd: u64) -> Result<u64> {
    // Sanity: price must be positive and below $100,000
    require!(sol_price_18dec > 0, LotteryError::InvalidPriceFeed);
    require!(
        sol_price_18dec < 100_000_000_000_000_000_000_000i128, // < $100k × 10^18
        LotteryError::InvalidPriceFeed
    );
    let sol_price_6dec = (sol_price_18dec / 1_000_000_000_000i128) as u128;
    require!(sol_price_6dec > 0, LotteryError::InvalidPriceFeed);

    let numerator: u128 = (tier_usd as u128)
        .checked_mul(DEFAULT_FPT_PER_SOL as u128)
        .and_then(|x| x.checked_mul(1_000_000_000_000u128)) // × 10^12
        .ok_or(error!(LotteryError::ArithmeticOverflow))?;
    Ok((numerator / sol_price_6dec) as u64)
}

/// Validate that the FPT to transfer doesn't exceed the user's slippage tolerance.
pub fn validate_slippage(actual_fpt: u64, max_fpt_amount: u64) -> Result<()> {
    require!(actual_fpt <= max_fpt_amount, LotteryError::SlippageExceeded);
    Ok(())
}

/// Create verifiable lottery entropy from a 32-byte seed + user commitment.
///
/// Used with Switchboard V3 VRF value (RandomnessAccountData.value @152).
///
/// Security properties:
///   • seed: produced by SB oracle at reveal time — unknowable at request time
///   • user_commitment: pre-committed by the user before seed is revealed
///   • Neither party alone can bias the combined output
pub fn create_lottery_entropy_from_slot(
    slot_hash: &[u8; 32],
    user_commitment: &[u8; 32],
    lottery_type_id: u8,
    tier: u8,
    round_number: u32,
) -> u64 {
    let s0 = u64::from_le_bytes(slot_hash[0..8].try_into().unwrap());
    let s1 = u64::from_le_bytes(slot_hash[8..16].try_into().unwrap());
    let s2 = u64::from_le_bytes(slot_hash[16..24].try_into().unwrap());
    let s3 = u64::from_le_bytes(slot_hash[24..32].try_into().unwrap());

    let c0 = u64::from_le_bytes(user_commitment[0..8].try_into().unwrap());
    let c1 = u64::from_le_bytes(user_commitment[8..16].try_into().unwrap());

    // Context tag ensures unique entropy per (type, tier, round)
    let meta = (lottery_type_id as u64) << 56
        | (tier as u64) << 48
        | (round_number as u64 & 0xFFFF);

    let mut state = s0.wrapping_mul(HASH_K1);
    state ^= s1.wrapping_mul(HASH_K2).rotate_left(27);
    state ^= s2.rotate_left(13).wrapping_mul(HASH_K1);
    state ^= s3.rotate_left(41).wrapping_mul(HASH_K2);
    state ^= c0.wrapping_mul(HASH_K1.wrapping_add(HASH_K2));
    state ^= c1.wrapping_mul(HASH_K2.wrapping_mul(HASH_K1)).rotate_left(19);
    state ^= meta.wrapping_mul(HASH_K1).rotate_left(31);
    state
}
