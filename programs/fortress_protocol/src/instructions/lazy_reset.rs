use anchor_lang::prelude::*;
use anchor_lang::system_program::{transfer, Transfer};
use crate::state::{LotteryVault, LotteryType, VaultState};
use crate::errors::LotteryError;
use crate::draw_helpers::{DPL_DURATION, WPL_DURATION, MPL_DURATION};

/// Lazy reset for dead pools (no participants, timer expired)
/// Any community member can trigger this to reset an empty pool
/// and immediately buy a ticket in the same transaction.
/// Treasury covers the rent/gas for the reset.
#[derive(Accounts)]
#[instruction(lottery_type: u8, tier: u8)]
pub struct LazyResetVault<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    /// Treasury account that pays for reset gas
    #[account(
        mut,
        seeds = [b"sol_vault"],
        bump
    )]
    pub treasury: SystemAccount<'info>,

    /// The vault to reset
    #[account(
        mut,
        constraint = lottery_vault.lottery_type == match lottery_type {
            0 => LotteryType::LPM,
            1 => LotteryType::DPL,
            2 => LotteryType::WPL,
            3 => LotteryType::MPL,
            _ => return Err(LotteryError::InvalidLotteryType.into()),
        } @ LotteryError::InvalidLotteryType,
        constraint = lottery_vault.tier == tier @ LotteryError::InvalidTier
    )]
    pub lottery_vault: Account<'info, LotteryVault>,

    pub system_program: Program<'info, System>,
}

/// Reset a dead pool (expired with 0 participants) to prepare for new round
/// Requires:
/// - current_time >= end_time
/// - participant_count == 0
/// - balance == 0 (no unclaimed prize)
pub fn lazy_reset_vault(
    ctx: Context<LazyResetVault>,
    lottery_type: u8,
    tier: u8,
) -> Result<()> {
    let vault = &mut ctx.accounts.lottery_vault;
    let current_time = Clock::get()?.unix_timestamp;

    // ── Validate vault is dead (expired with 0 participants) ──
    // Guard against spurious calls on vaults whose timer has never been started
    // (end_time==0 means no buy has occurred yet — nothing to reset)
    require!(vault.end_time > 0, LotteryError::LotteryNotEnded);
    require!(current_time >= vault.end_time, LotteryError::LotteryNotEnded);
    require!(vault.participant_count == 0, LotteryError::InvalidOperation);
    require!(
        vault.balance == 0,
        LotteryError::InsufficientBalance
    );

    msg!(
        "[LAZY_RESET] Resetting dead pool: type={}, tier={}, round={}->{}",
        lottery_type,
        tier,
        vault.round_number,
        vault.round_number + 1
    );

    // ── Reset vault state ──
    vault.participant_count = 0;
    vault.balance = 0;
    vault.current_page = 0;
    vault.is_drawn = false;
    vault.state = VaultState::Active;
    vault.round_number = vault
        .round_number
        .checked_add(1)
        .ok_or(LotteryError::ArithmeticOverflow)?;

    // ── Set new end_time based on lottery type ──
    let duration = match lottery_type {
        0 => 0, // LPM (no timer)
        1 => DPL_DURATION,
        2 => WPL_DURATION,
        3 => MPL_DURATION,
        _ => return Err(LotteryError::InvalidLotteryType.into()),
    };

    if duration > 0 {
        vault.end_time = current_time
            .checked_add(duration)
            .ok_or(LotteryError::ArithmeticOverflow)?;
        msg!(
            "[LAZY_RESET] Round {} starts at {}, ends at {}",
            vault.round_number,
            current_time,
            vault.end_time
        );
    }

    // ── Transfer reset gas/rent cost from treasury to user ──
    // This compensates the user for the rent/gas they paid to reset the pool.
    // MUST use new_with_signer so the sol_vault PDA can sign the system transfer.
    let rent_cost = 5000; // ~5000 lamports for account mutation + instruction
    let treasury_bump = ctx.bumps.treasury;

    if ctx.accounts.treasury.lamports() > rent_cost {
        transfer(
            CpiContext::new_with_signer(
                ctx.accounts.system_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.treasury.to_account_info(),
                    to:   ctx.accounts.user.to_account_info(),
                },
                &[&[b"sol_vault", &[treasury_bump]]],
            ),
            rent_cost,
        )?;
        msg!("[LAZY_RESET] Treasury reimbursed {} lamports for reset gas", rent_cost);
    }

    Ok(())
}
