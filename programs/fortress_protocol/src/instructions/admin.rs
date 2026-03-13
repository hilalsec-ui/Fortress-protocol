use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface, TransferChecked, transfer_checked};
use anchor_spl::associated_token::AssociatedToken;
use crate::errors::LotteryError;
use crate::oracle::CRANK_AUTHORITY;
use crate::state::*;
/// Asset type for treasury withdrawal
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum WithdrawAsset {
    SOL,
    /// NOTE: Anchor lowercases enum variants in the IDL.
    /// JavaScript must send { fpt: {} } for FPT withdrawals.
    FPT,
}

#[derive(Accounts)]
pub struct UnifiedWithdrawFromTreasuryVault<'info> {
    #[account(
        mut,
        address = pubkey!("EzrUKQPTj7iEAvaJj9rnv4HKUhRGjj4bDLRsAEQfyaYg")
    )]
    pub admin: Signer<'info>,

    /// CHECK: Treasury Vault PDA — seeds=[b"sol_vault"], holds SOL and owns the FPT ATA.
    /// Must match TREASURY_VAULT_SEED used in draw_winner.rs so fees flow to the same account.
    #[account(
        mut,
        seeds = [TreasuryVault::SEED_PREFIX],
        bump
    )]
    pub treasury_vault: UncheckedAccount<'info>,

    /// FPT Mint (Token-2022)
    #[account(address = pubkey!("7vZbJ3WN4eGF6rGikB4MBLs4kiJwaRzNSX3smQRJJNw2"))]
    pub fpt_mint: Box<InterfaceAccount<'info, Mint>>,

    /// Treasury's FPT ATA — owned by treasury_vault (sol_vault PDA, seeds=[b"sol_vault"]).
    /// draw_winner sends 5% FPT fees here; withdraw pulls from here.
    /// init_if_needed ensures SOL withdrawals succeed even if ATA was never created yet.
    #[account(
        init_if_needed,
        payer = admin,
        associated_token::mint = fpt_mint,
        associated_token::authority = treasury_vault,
        associated_token::token_program = token_program,
    )]
    pub treasury_fpt_ata: Box<InterfaceAccount<'info, TokenAccount>>,

    /// Admin's FPT ATA (destination for FPT withdrawal)
    #[account(
        init_if_needed,
        payer = admin,
        associated_token::mint = fpt_mint,
        associated_token::authority = admin,
        associated_token::token_program = token_program,
    )]
    pub admin_fpt_ata: Box<InterfaceAccount<'info, TokenAccount>>,

    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

/// Minimum lamports that must remain in treasury_vault after a SOL withdrawal
/// (covers rent exemption + buffer for future operations)
const TREASURY_VAULT_MIN_LAMPORTS: u64 = 3_000_000; // 0.003 SOL

/// Unified withdrawal from Treasury Vault (SOL or FPT)
pub fn unified_withdraw_from_treasury_vault(
    ctx: Context<UnifiedWithdrawFromTreasuryVault>,
    asset: WithdrawAsset,
    amount: u64,
) -> Result<()> {
    // [DIAGNOSTIC] Log all key values so simulation logs show exactly where failure occurs
    msg!("[WITHDRAW] asset={:?}, amount={}, admin={}, vault={}",
        asset as u8, amount,
        ctx.accounts.admin.key(),
        ctx.accounts.treasury_vault.key()
    );

    // [ACCESS CONTROL] Must be the hardcoded admin pubkey
    require_keys_eq!(
        ctx.accounts.admin.key(),
        pubkey!("EzrUKQPTj7iEAvaJj9rnv4HKUhRGjj4bDLRsAEQfyaYg"),
        LotteryError::UnauthorizedDraw
    );
    msg!("[WITHDRAW] Access control: OK");

    require!(amount > 0, LotteryError::InvalidAmount);

    match asset {
        WithdrawAsset::SOL => {
            let vault_balance = ctx.accounts.treasury_vault.lamports();
            msg!("[WITHDRAW] SOL: vault_balance={}, requested={}, min_reserve={}",
                vault_balance, amount, TREASURY_VAULT_MIN_LAMPORTS);

            // [RENT PROTECTION] Must leave at least 0.003 SOL in vault
            require!(
                vault_balance >= amount.checked_add(TREASURY_VAULT_MIN_LAMPORTS)
                    .ok_or(LotteryError::ArithmeticOverflow)?,
                LotteryError::InsufficientBalance
            );

            // sol_vault is System-Program-owned, so we must use system_program::transfer
            // with invoke_signed (matching draw_winner.rs). Direct lamport manipulation
            // only works for accounts owned by THIS program, not by System Program.
            let vault_bump = ctx.bumps.treasury_vault;
            let seeds: &[&[u8]] = &[TreasuryVault::SEED_PREFIX, &[vault_bump]];
            let signer_seeds = &[seeds][..];

            anchor_lang::system_program::transfer(
                CpiContext::new_with_signer(
                    ctx.accounts.system_program.to_account_info(),
                    anchor_lang::system_program::Transfer {
                        from: ctx.accounts.treasury_vault.to_account_info(),
                        to: ctx.accounts.admin.to_account_info(),
                    },
                    signer_seeds,
                ),
                amount,
            )?;

            msg!("[WITHDRAW] SOL transfer complete: {} lamports → admin", amount);
        }
        WithdrawAsset::FPT => {
            let fpt_balance = ctx.accounts.treasury_fpt_ata.amount;
            msg!("[WITHDRAW] FPT: ata_balance={}, requested={}", fpt_balance, amount);

            require!(fpt_balance >= amount, LotteryError::InsufficientBalance);

            // Sign CPI with sol_vault seeds — matches draw_winner.rs TREASURY_VAULT_SEED
            let vault_bump = ctx.bumps.treasury_vault;
            let seeds: &[&[u8]] = &[TreasuryVault::SEED_PREFIX, &[vault_bump]];
            let signer_seeds = &[seeds][..];

            let cpi_ctx = CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                TransferChecked {
                    from: ctx.accounts.treasury_fpt_ata.to_account_info(),
                    mint: ctx.accounts.fpt_mint.to_account_info(),
                    to: ctx.accounts.admin_fpt_ata.to_account_info(),
                    authority: ctx.accounts.treasury_vault.to_account_info(),
                },
                signer_seeds,
            );
            transfer_checked(cpi_ctx, amount, 6)?;

            msg!("[WITHDRAW] FPT transfer complete: {} tokens → admin ATA", amount);
        }
    }
    Ok(())
}

// ─── Fund Oracle Crank ────────────────────────────────────────────────────────

/// Max SOL that can be sent to the crank wallet per single `fund_oracle_crank` call.
/// 0.01 SOL covers ~2 000 Switchboard commit+reveal cycles at ~5 000 lamports each.
const ORACLE_CRANK_FUND_MAX_LAMPORTS: u64 = 10_000_000; // 0.01 SOL

#[derive(Accounts)]
pub struct FundOracleCrank<'info> {
    /// Any wallet may call this instruction — they only pay the tiny TX fee.
    #[account(mut)]
    pub payer: Signer<'info>,

    /// Treasury Vault PDA — source of oracle fee funding.
    /// CHECK: validated by seeds; CPI transfer uses PDA signer seeds.
    #[account(
        mut,
        seeds = [TreasuryVault::SEED_PREFIX],
        bump
    )]
    pub treasury_vault: UncheckedAccount<'info>,

    /// Crank authority wallet that receives SOL for Switchboard oracle operations.
    /// CHECK: address is hardcoded to CRANK_AUTHORITY — no other recipient permitted.
    #[account(
        mut,
        address = CRANK_AUTHORITY @ LotteryError::UnauthorizedDraw
    )]
    pub crank_wallet: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

/// Transfer up to `lamports` SOL from the treasury vault to the crank wallet.
/// Permissionless — anyone (e.g. a user triggering a manual draw) can call this
/// to ensure the oracle crank has enough SOL to pay Switchboard commit+reveal fees.
/// Capped at ORACLE_CRANK_FUND_MAX_LAMPORTS per call; treasury min-reserve is enforced.
pub fn fund_oracle_crank(ctx: Context<FundOracleCrank>, lamports: u64) -> Result<()> {
    let amount = lamports.min(ORACLE_CRANK_FUND_MAX_LAMPORTS);
    require!(amount > 0, LotteryError::InvalidAmount);

    let vault_balance = ctx.accounts.treasury_vault.lamports();
    require!(
        vault_balance >= amount
            .checked_add(TREASURY_VAULT_MIN_LAMPORTS)
            .ok_or(LotteryError::ArithmeticOverflow)?,
        LotteryError::InsufficientBalance
    );

    let vault_bump = ctx.bumps.treasury_vault;
    let seeds: &[&[u8]] = &[TreasuryVault::SEED_PREFIX, &[vault_bump]];
    let signer_seeds = &[seeds][..];

    anchor_lang::system_program::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.system_program.to_account_info(),
            anchor_lang::system_program::Transfer {
                from: ctx.accounts.treasury_vault.to_account_info(),
                to: ctx.accounts.crank_wallet.to_account_info(),
            },
            signer_seeds,
        ),
        amount,
    )?;

    msg!(
        "[FUND_CRANK] Transferred {} lamports from treasury vault to CRANK_AUTHORITY",
        amount
    );
    Ok(())
}

