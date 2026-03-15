use crate::errors::LotteryError;
use crate::state::*;
use anchor_lang::prelude::*;
use anchor_lang::solana_program::system_instruction;

// ==================== INITIALIZE GLOBAL REGISTRY ====================

#[derive(Accounts)]
pub struct InitializeGlobalRegistry<'info> {
    #[account(mut, address = pubkey!("EANi5dM5CUbtoiJAN72JgKMSNM6bMWsSWMX1w1t2yWcv"))]
    pub admin: Signer<'info>,
    #[account(init, payer = admin, space = GlobalRegistry::LEN, seeds = [b"global_registry"], bump)]
    pub registry: Account<'info, GlobalRegistry>,
    pub system_program: Program<'info, System>,
}

pub fn initialize_global_registry(ctx: Context<InitializeGlobalRegistry>) -> Result<()> {
    let registry = &mut ctx.accounts.registry;
    registry.authority = ctx.accounts.admin.key();
    registry.bump = ctx.bumps.registry;
    Ok(())
}

// ==================== INITIALIZE TREASURY ====================

#[derive(Accounts)]
pub struct InitializeTreasury<'info> {
    #[account(mut, address = pubkey!("EANi5dM5CUbtoiJAN72JgKMSNM6bMWsSWMX1w1t2yWcv"))]
    pub admin: Signer<'info>,
    #[account(init, payer = admin, space = Treasury::LEN, seeds = [Treasury::SEED_PREFIX], bump)]
    pub treasury: Account<'info, Treasury>,
    pub system_program: Program<'info, System>,
}

pub fn initialize_treasury(ctx: Context<InitializeTreasury>) -> Result<()> {
    let treasury = &mut ctx.accounts.treasury;
    treasury.authority = ctx.accounts.admin.key();
    treasury.bump = ctx.bumps.treasury;
    Ok(())
}

// ==================== INITIALIZE VAULT + WINNER HISTORY (per type+tier) ====================

#[derive(Accounts)]
#[instruction(lottery_type_id: u8, tier: u8)]
pub struct InitializeVault<'info> {
    #[account(mut, address = pubkey!("EANi5dM5CUbtoiJAN72JgKMSNM6bMWsSWMX1w1t2yWcv"))]
    pub admin: Signer<'info>,
    #[account(
        init, payer = admin, space = LotteryVault::LEN,
        seeds = [
            match lottery_type_id {
                0 => b"vault_lpm".as_ref(),
                1 => b"vault_dpl".as_ref(),
                2 => b"vault_wpl".as_ref(),
                3 => b"vault_mpl".as_ref(),
                _ => panic!("invalid lottery type"),
            },
            &[tier]
        ],
        bump
    )]
    pub lottery_vault: Account<'info, LotteryVault>,
    #[account(
        init, payer = admin, space = WinnerHistory::LEN,
        seeds = [WinnerHistory::SEED_PREFIX, &[lottery_type_id], &[tier]],
        bump
    )]
    pub winner_history: Account<'info, WinnerHistory>,
    pub system_program: Program<'info, System>,
}

pub fn initialize_vault(ctx: Context<InitializeVault>, lottery_type_id: u8, tier: u8) -> Result<()> {
    let lottery_type = match lottery_type_id {
        0 => LotteryType::LPM,
        1 => LotteryType::DPL,
        2 => LotteryType::WPL,
        3 => LotteryType::MPL,
        _ => return Err(LotteryError::InvalidLotteryType.into()),
    };
    let vault = &mut ctx.accounts.lottery_vault;
    vault.lottery_type = lottery_type;
    vault.tier = tier;
    vault.bump = ctx.bumps.lottery_vault;
    vault.state = VaultState::Active;
    let wh = &mut ctx.accounts.winner_history;
    wh.bump = ctx.bumps.winner_history;
    Ok(())
}

// ==================== TOP UP SOL VAULT ====================

#[derive(Accounts)]
pub struct TopUpTreasuryVault<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    /// CHECK: Raw PDA that holds SOL
    #[account(mut, seeds = [TreasuryVault::SEED_PREFIX], bump)]
    pub treasury_vault: UncheckedAccount<'info>,
    #[account(mut, seeds = [Treasury::SEED_PREFIX], bump = treasury.bump)]
    pub treasury: Account<'info, Treasury>,
    pub system_program: Program<'info, System>,
}

pub fn top_up_treasury_vault(ctx: Context<TopUpTreasuryVault>, amount: u64) -> Result<()> {
    require!(amount > 0, LotteryError::InvalidAmount);
    let transfer_ix = system_instruction::transfer(
        &ctx.accounts.payer.key(),
        &ctx.accounts.treasury_vault.key(),
        amount,
    );
    anchor_lang::solana_program::program::invoke(
        &transfer_ix,
        &[
            ctx.accounts.payer.to_account_info(),
            ctx.accounts.treasury_vault.to_account_info(),
            ctx.accounts.system_program.to_account_info(),
        ],
    )?;
    let treasury = &mut ctx.accounts.treasury;
    treasury.total_deposited = treasury.total_deposited.saturating_add(amount);
    Ok(())
}
