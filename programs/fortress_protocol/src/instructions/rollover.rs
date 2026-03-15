use anchor_lang::prelude::*;
use crate::state::*;
use crate::errors::*;
use crate::draw_helpers::{DPL_DURATION, WPL_DURATION, MPL_DURATION};

/// Single account struct shared by all rollover variants.
/// Vault PDA is validated in the instruction body using the stored bump.
#[derive(Accounts)]
pub struct RolloverTier<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    /// Vault — key validated in body via stored bump (seed differs by lottery type)
    #[account(mut)]
    pub lottery_vault: Account<'info, LotteryVault>,

    pub system_program: Program<'info, System>,
}

/// lottery_type_id: 1=DPL, 2=WPL, 3=MPL
#[inline(never)]
fn rollover_tier_impl(ctx: Context<RolloverTier>, tier: u8, lottery_type_id: u8) -> Result<()> {
    let (vault_seed, duration): (&[u8], i64) = match lottery_type_id {
        1 => (b"vault_dpl", DPL_DURATION),
        2 => (b"vault_wpl", WPL_DURATION),
        3 => (b"vault_mpl", MPL_DURATION),
        _ => return Err(LotteryError::InvalidLotteryType.into()),
    };

    // Validate vault PDA using stored bump — done before mutable borrow
    let tier_bytes = [tier];
    let bump_bytes = [ctx.accounts.lottery_vault.bump];
    let expected = Pubkey::create_program_address(
        &[vault_seed, &tier_bytes, &bump_bytes],
        &crate::ID,
    ).map_err(|_| LotteryError::InvalidLotteryType)?;
    require_keys_eq!(ctx.accounts.lottery_vault.key(), expected, LotteryError::InvalidLotteryType);

    let vault = &mut ctx.accounts.lottery_vault;
    let clock = Clock::get()?;
    let stuck_threshold = vault.end_time
        .checked_add(duration)
        .ok_or(LotteryError::ArithmeticOverflow)?;
    require!(clock.unix_timestamp >= stuck_threshold, LotteryError::TierNotStuck);
    require!(!vault.is_drawn, LotteryError::LotteryAlreadyDrawn);
    require!(vault.participant_count > 0, LotteryError::NoParticipants);

    vault.end_time = clock.unix_timestamp
        .checked_add(duration)
        .ok_or(LotteryError::ArithmeticOverflow)?;

    Ok(())
}

pub fn rollover_dpl_tier(ctx: Context<RolloverTier>, tier: u8) -> Result<()> {
    rollover_tier_impl(ctx, tier, 1)
}

pub fn rollover_wpl_tier(ctx: Context<RolloverTier>, tier: u8) -> Result<()> {
    rollover_tier_impl(ctx, tier, 2)
}

pub fn rollover_mpl_tier(ctx: Context<RolloverTier>, tier: u8) -> Result<()> {
    rollover_tier_impl(ctx, tier, 3)
}
