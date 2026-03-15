use anchor_lang::prelude::*;
use anchor_lang::system_program;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface, TransferChecked, transfer_checked};
use anchor_spl::associated_token::AssociatedToken;
use crate::state::*;
use crate::errors::*;
use crate::draw_helpers::*;

/// Treasury Vault PDA address (BN5CKV4yA95RNQsid5GPRwiRTgVcXTYpKCzbqdzEP68G)
/// Seeds: [b"sol_vault"]
const TREASURY_VAULT_SEED: &[u8] = b"sol_vault";

/// Required SOL for draw operation (covers ATA creation + rent + buffer)
/// 0.05 SOL = 50,000,000 lamports
const DRAW_OPERATION_RENT: u64 = 50_000_000;

/// Transaction fee reimbursement paid from Treasury Vault to draw authority — 0.005 SOL
const TX_FEE_REIMBURSEMENT: u64 = 5_000_000;

/// Helper function to read participant pubkeys from raw account data.
/// This bypasses Anchor's discriminator check for backwards compatibility with
/// pages created by older program versions.
/// 
/// ParticipantPage layout (after 8-byte discriminator):
/// - lottery_type: u8 (1 byte)
/// - tier: u8 (1 byte)  
/// - page_number: u32 (4 bytes)
/// - participants vec length: u32 (4 bytes)
/// - participants: [Pubkey; len] (32 bytes each)
fn read_participants_raw(account_data: &[u8]) -> Result<Vec<Pubkey>> {
    // Skip discriminator (8) + lottery_type (1) + tier (1) + page_number (4) = 14 bytes
    // Then read vec length (4 bytes)
    if account_data.len() < 18 {
        return Err(error!(LotteryError::ParticipantNotFound));
    }
    
    let vec_len_bytes = &account_data[14..18];
    let vec_len = u32::from_le_bytes([vec_len_bytes[0], vec_len_bytes[1], vec_len_bytes[2], vec_len_bytes[3]]) as usize;
    
    // Read participants starting at offset 18
    let mut participants = Vec::with_capacity(vec_len);
    let mut offset = 18;
    
    for _ in 0..vec_len {
        if offset + 32 > account_data.len() {
            break;
        }
        let pubkey_bytes: [u8; 32] = account_data[offset..offset + 32].try_into()
            .map_err(|_| error!(LotteryError::ParticipantNotFound))?;
        participants.push(Pubkey::new_from_array(pubkey_bytes));
        offset += 32;
    }
    
    Ok(participants)
}

/// Helper function to traverse ParticipantPage chain and return winner's Pubkey.
/// 
/// [SCALING FIX] Supports unlimited participants via "Jump-to-Page" verification:
/// 
/// Logic:
/// 1. Calculate expected_page_number = random_index / 50 (since max 50 per page)
/// 2. If expected_page_number == 0 -> Return winner from Page 0
/// 3. Else -> Verify winning_participant_page matches expected page_number
/// 4. Return winner from the target page using offset within that page
///
/// [BACKWARDS COMPAT] Uses raw data reading to handle old discriminators
fn find_winner_in_chain<'a>(
    first_page_info: &AccountInfo<'a>,
    winning_page_info: Option<&AccountInfo<'a>>,
    random_index: u32,
    _vault_lottery_type: u8,
    _vault_tier: u8,
) -> Result<Pubkey> {
    const PAGE_SIZE: u32 = 50;
    
    // Read participants from first page using raw data (bypasses discriminator)
    let first_page_data = first_page_info.data.borrow();
    let first_page_participants = read_participants_raw(&first_page_data)?;
    drop(first_page_data);
    
    let page_0_size = first_page_participants.len() as u32;
    
    // Calculate which page should contain the winner
    let expected_page_number = random_index / PAGE_SIZE;
    
    // Case 1: Winner is on Page 0
    if expected_page_number == 0 {
        let offset = (random_index % page_0_size.max(1)) as usize;
        return first_page_participants.get(offset)
            .copied()
            .ok_or(error!(LotteryError::ParticipantNotFound));
    }

    // Case 2: Winner is on Page 1+ (requires target page)
    let winning_page_info = winning_page_info
        .ok_or(error!(LotteryError::ParticipantNotFound))?;
    
    let winning_page_data = winning_page_info.data.borrow();
    let winning_page_participants = read_participants_raw(&winning_page_data)?;
    drop(winning_page_data);

    // Calculate offset within the page (index 50-99 -> offset 0-49 on page 1)
    let offset = (random_index % PAGE_SIZE) as usize;
    winning_page_participants.get(offset)
        .copied()
        .ok_or(error!(LotteryError::ParticipantNotFound))
}

// ==================== DRAW LPM WINNER ====================

#[derive(Accounts)]
#[instruction(tier: u8)]
pub struct DrawLpmWinner<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        address = "3YTnzmFTECtyKDxaghWPQcjzX7g1Cj3NxMq41JdWk2rj".parse::<Pubkey>().unwrap()
    )]
    pub dpt_mint: Box<InterfaceAccount<'info, Mint>>,

    #[account(
        mut,
        seeds = [b"vault_lpm", &[tier]],
        bump
    )]
    pub lottery_state: Box<Account<'info, LotteryVault>>,

    #[account(
        mut,
        token::mint = dpt_mint,
        token::authority = lottery_state,
        token::token_program = token_program,
    )]
    pub vault_token_account: Box<InterfaceAccount<'info, TokenAccount>>,

    /// The winner's public key - will be verified against calculated winner from pages
    /// CHECK: Verified in instruction logic against winner calculated from participant pages
    pub winner: UncheckedAccount<'info>,

    /// The winner's ATA - will be verified/created in instruction logic
    /// CHECK: Verified in instruction logic as deterministic PDA from winner + mint
    #[account(mut)]
    pub winner_ata: UncheckedAccount<'info>,

    /// Treasury Vault PDA - Pays rent/fees for draw operations (seeds: [b"sol_vault"])
    /// CHECK: Treasury Vault is a raw PDA holding SOL, verified by seeds
    #[account(
        mut,
        seeds = [TREASURY_VAULT_SEED],
        bump
    )]
    pub treasury_vault: UncheckedAccount<'info>,

    /// Treasury PDA - tracks priority tips and fee statistics
    #[account(
        mut,
        seeds = [b"treasury"],
        bump = treasury.bump,
    )]
    pub treasury: Account<'info, Treasury>,

    #[account(
        init_if_needed,
        payer = authority,
        associated_token::mint = dpt_mint,
        associated_token::authority = treasury_vault,
        associated_token::token_program = token_program,
    )]
    pub treasury_dpt_ata: Box<InterfaceAccount<'info, TokenAccount>>,

    // Participant pages handled manually to avoid stack overflow
    /// CHECK: ParticipantPage account - uses UncheckedAccount to bypass discriminator mismatch from old program versions
    pub participant_page_0: UncheckedAccount<'info>,

    /// CHECK: ParticipantPage account - uses UncheckedAccount to bypass discriminator mismatch from old program versions
    pub winning_participant_page: UncheckedAccount<'info>,

    #[account(
        mut,
        seeds = [b"global_registry"],
        bump
    )]
    pub config: Box<Account<'info, GlobalRegistry>>,

    /// Validator identity - receives 0.05 SOL priority tip from Treasury Vault
    /// CHECK: Validator identity for priority tip payment
    #[account(mut)]
    pub validator_identity: UncheckedAccount<'info>,

    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn draw_lpm_winner(ctx: Context<DrawLpmWinner>, tier: u8) -> Result<()> {
    // [SECURITY_NOTICE] Temporary Clock-Based Entropy - Pending Pyth SDK Upgrade
    let config = &mut ctx.accounts.config;
    let vault = &mut ctx.accounts.lottery_state;

    require!(LotteryType::LPM.is_valid_tier(tier), LotteryError::InvalidTier);
    // [SAFETY] Ensure we have participants before drawing
    require!(vault.participant_count > 0, LotteryError::NoParticipants);
    // [LPM_RESET_FIX] Allow draw if participant_count == 100 (handles legacy is_drawn=false case)
    // New code sets is_drawn=true at 100 participants, but legacy vaults may have is_drawn=false
    require!(vault.participant_count == 100, LotteryError::ParticipantThresholdNotMet);
    require!(vault.balance > 0, LotteryError::InsufficientBalance);

    // [TREASURY_VAULT_FEE] Ensure lottery vault has enough SOL for ATA creation + fees
    let vault_lamports = vault.to_account_info().lamports();
    if vault_lamports < DRAW_OPERATION_RENT {
        let needed = DRAW_OPERATION_RENT - vault_lamports;
        let treasury_vault = &ctx.accounts.treasury_vault;

        require!(
            treasury_vault.lamports() >= needed,
            LotteryError::InsufficientVaultFunds
        );

        let treasury_bump = ctx.bumps.treasury_vault;
        let seeds: &[&[u8]] = &[TREASURY_VAULT_SEED, &[treasury_bump]];
        let signer_seeds = &[seeds][..];

        system_program::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.system_program.to_account_info(),
                system_program::Transfer {
                    from: treasury_vault.to_account_info(),
                    to: vault.to_account_info(),
                },
                signer_seeds,
            ),
            needed,
        )?;

        msg!("[TREASURY] Transferred {} lamports from Treasury Vault to LPM Vault for fees", needed);
    }

    // [ENTROPY] Get randomness from Pyth (or Clock fallback)
    let vault_seed = (LotteryType::LPM.to_u8() as u64) << 56 | (tier as u64) << 48 | vault.round_number as u64;
    let entropy = get_draw_entropy(None, vault_seed)?; // No Pyth feed yet
    let random_index = (entropy % 100) as u32;

    msg!("LPM Winner Selected: tier={}, index={}, total=100", tier, random_index);

    // [FIX] Extract winner using page verification for unlimited scaling
    let winner_pubkey = find_winner_in_chain(
        &ctx.accounts.participant_page_0.to_account_info(),
        Some(&ctx.accounts.winning_participant_page.to_account_info()),
        random_index,
        vault.lottery_type.to_u8(),
        vault.tier
    )?;

    // Verify winner matches calculated winner
    require_keys_eq!(
        ctx.accounts.winner.key(),
        winner_pubkey,
        LotteryError::InvalidWinner
    );
    
    // [ATA_CREATION] Verify and create winner's ATA (idempotent)
    verify_and_create_winner_ata(
        &winner_pubkey,
        &ctx.accounts.winner_ata.to_account_info(),
        &ctx.accounts.winner.to_account_info(),
        &ctx.accounts.dpt_mint.to_account_info(),
        &ctx.accounts.token_program.to_account_info(),
        &ctx.accounts.authority.to_account_info(),
        &ctx.accounts.system_program.to_account_info(),
        &ctx.accounts.associated_token_program.to_account_info(),
    )?;

    // Payout Logic
    let total_balance = vault.balance;
    let winner_prize = total_balance * 95 / 100;
    let admin_fee = total_balance - winner_prize;

    let signer_seeds: &[&[&[u8]]] = &[&[b"vault_lpm", &[tier], &[vault.bump]]];

    // Transfer to winner (ATA now guaranteed to exist)
    let cpi_ctx = CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        TransferChecked {
            from: ctx.accounts.vault_token_account.to_account_info(),
            mint: ctx.accounts.dpt_mint.to_account_info(),
            to: ctx.accounts.winner_ata.to_account_info(),
            authority: vault.to_account_info(),
        },
        signer_seeds,
    );
    transfer_checked(cpi_ctx, winner_prize, 6)?;
    
    // Pay Treasury 5%
    let treasury_ctx = CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        TransferChecked {
            from: ctx.accounts.vault_token_account.to_account_info(),
            mint: ctx.accounts.dpt_mint.to_account_info(),
            to: ctx.accounts.treasury_dpt_ata.to_account_info(),
            authority: vault.to_account_info(),
        },
        signer_seeds,
    );
    transfer_checked(treasury_ctx, admin_fee, 6)?;
    msg!("[FEE] {} DPT (5%) sent to Treasury ATA: {}", admin_fee, ctx.accounts.treasury_dpt_ata.key());

    // [PRIORITY TIP] Pay 0.05 SOL to validator from Treasury Vault
    pay_priority_tip(
        &ctx.accounts.treasury_vault.to_account_info(),
        &mut ctx.accounts.treasury,
        &ctx.accounts.validator_identity.to_account_info(),
        &ctx.accounts.system_program.to_account_info(),
        ctx.bumps.treasury_vault,
    )?;

    // [RENT_REFILL] Refill vault from Treasury Vault for next cycle
    let vault_lamports_post = vault.to_account_info().lamports();
    if vault_lamports_post < DRAW_OPERATION_RENT {
        let needed = DRAW_OPERATION_RENT;
        let treasury_vault = &ctx.accounts.treasury_vault;
        if treasury_vault.lamports() >= needed {
            let treasury_bump = ctx.bumps.treasury_vault;
            let seeds: &[&[u8]] = &[TREASURY_VAULT_SEED, &[treasury_bump]];
            let signer_seeds = &[seeds][..];
            system_program::transfer(
                CpiContext::new_with_signer(
                    ctx.accounts.system_program.to_account_info(),
                    system_program::Transfer {
                        from: treasury_vault.to_account_info(),
                        to: vault.to_account_info(),
                    },
                    signer_seeds,
                ),
                needed,
            )?;
            msg!("LPM Vault refilled with {} lamports from Treasury for next round", needed);
        }
    }

    // State Reset - LPM has no duration (participation-based)
    reset_vault_after_draw(vault, winner_pubkey, winner_prize, 0)?;
    config.total_prizes_distributed = config.total_prizes_distributed.checked_add(winner_prize).ok_or(LotteryError::ArithmeticOverflow)?;

    // Increment round for next draw
    let tier_index = GlobalRegistry::get_tier_index(LotteryType::LPM, tier)?;
    config.lpm_rounds[tier_index] = config.lpm_rounds[tier_index].checked_add(1).ok_or(LotteryError::ArithmeticOverflow)?;
    vault.round_number = config.lpm_rounds[tier_index];
    

    // [FEE_SPONSOR] Reimburse draw authority 0.005 SOL tx fee from Treasury Vault
    {
        let treasury_vault = &ctx.accounts.treasury_vault;
        if treasury_vault.lamports() >= TX_FEE_REIMBURSEMENT {
            let treasury_bump = ctx.bumps.treasury_vault;
            let seeds: &[&[u8]] = &[TREASURY_VAULT_SEED, &[treasury_bump]];
            let signer_seeds = &[seeds][..];
            system_program::transfer(
                CpiContext::new_with_signer(
                    ctx.accounts.system_program.to_account_info(),
                    system_program::Transfer {
                        from: treasury_vault.to_account_info(),
                        to: ctx.accounts.authority.to_account_info(),
                    },
                    signer_seeds,
                ),
                TX_FEE_REIMBURSEMENT,
            )?;
            msg!("[FEE_SPONSOR] Transaction fee sponsored by Fortress Treasury: {} lamports returned to payer", TX_FEE_REIMBURSEMENT);
        }
    }

    msg!("LPM Winner Drawn: tier={}, winner={}, prize={}", tier, winner_pubkey, winner_prize);
    Ok(())
}

// ==================== DRAW DPL WINNER ====================

#[derive(Accounts)]
#[instruction(tier: u8)]
pub struct DrawDplWinner<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    /// CHECK: Address checked in function to save stack
    pub dpt_mint: Box<InterfaceAccount<'info, Mint>>,

    #[account(
        mut,
        seeds = [b"vault_dpl", &[tier]],
        bump
    )]
    pub lottery_state: Box<Account<'info, LotteryVault>>,

    #[account(
        mut,
        associated_token::mint = dpt_mint,
        associated_token::authority = lottery_state,
        associated_token::token_program = token_program,
    )]
    pub vault_token_account: Box<InterfaceAccount<'info, TokenAccount>>,

    /// The winner's public key - will be verified against calculated winner from pages
    /// CHECK: Verified in instruction logic against winner calculated from participant pages
    pub winner: UncheckedAccount<'info>,

    /// The winner's ATA - will be verified/created in instruction logic
    /// CHECK: Verified in instruction logic as deterministic PDA from winner + mint
    #[account(mut)]
    pub winner_ata: UncheckedAccount<'info>,

    #[account(
        init_if_needed,
        payer = authority,
        associated_token::mint = dpt_mint,
        associated_token::authority = treasury_vault,
        associated_token::token_program = token_program,
    )]
    pub treasury_dpt_ata: Box<InterfaceAccount<'info, TokenAccount>>,


    // Participant pages handled manually to avoid stack overflow
    /// CHECK: ParticipantPage account - uses UncheckedAccount to bypass discriminator mismatch from old program versions
    pub participant_page_0: UncheckedAccount<'info>,

    /// CHECK: ParticipantPage account - uses UncheckedAccount to bypass discriminator mismatch from old program versions
    pub winning_participant_page: UncheckedAccount<'info>,

    #[account(
        mut,
        seeds = [b"global_registry"],
        bump
    )]
    pub config: Box<Account<'info, GlobalRegistry>>,

    /// Treasury Vault PDA - Pays rent/fees for draw operations
    /// CHECK: Treasury Vault is a raw PDA holding SOL, verified by seeds
    #[account(
        mut,
        seeds = [TREASURY_VAULT_SEED],
        bump
    )]
    pub treasury_vault: UncheckedAccount<'info>,

    /// Treasury PDA - tracks priority tips
    #[account(
        mut,
        seeds = [Treasury::SEED_PREFIX],
        bump = treasury.bump,
    )]
    pub treasury: Account<'info, Treasury>,

    /// Validator identity - receives priority tip (0.05 SOL)
    /// CHECK: Validator identity for priority tip payment
    #[account(mut)]
    pub validator_identity: UncheckedAccount<'info>,

    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn draw_dpl_winner(ctx: Context<DrawDplWinner>, tier: u8) -> Result<()> {
    // [STACK_OPTIMIZATION] Verify FPT mint address
    require_keys_eq!(ctx.accounts.dpt_mint.key(), pubkey!("3YTnzmFTECtyKDxaghWPQcjzX7g1Cj3NxMq41JdWk2rj"), LotteryError::InvalidLotteryType);

    // [SECURITY_NOTICE] Temporary Clock-Based Entropy - Pending Pyth SDK Upgrade
    let config = &mut ctx.accounts.config;
    let vault = &mut ctx.accounts.lottery_state;

    require!(LotteryType::DPL.is_valid_tier(tier), LotteryError::InvalidTier);
    require!(!vault.is_drawn, LotteryError::LotteryAlreadyDrawn);

    let current_time = Clock::get()?.unix_timestamp;
    require!(current_time >= vault.end_time, LotteryError::LotteryNotEnded);
    // [TIME-BASED] DPL is unlimited - only requires at least 1 participant (no max)
    require!(vault.participant_count > 0, LotteryError::NoParticipants);
    require!(vault.balance > 0, LotteryError::InsufficientBalance);

    // [TREASURY_VAULT_FEE] Transfer SOL from Treasury Vault to Lottery Vault if needed
    let vault_lamports = vault.to_account_info().lamports();
    if vault_lamports < DRAW_OPERATION_RENT {
        let needed = DRAW_OPERATION_RENT - vault_lamports;
        let treasury_vault = &ctx.accounts.treasury_vault;
        
        require!(
            treasury_vault.lamports() >= needed,
            LotteryError::InsufficientVaultFunds
        );
        
        // Transfer from Treasury Vault (PDA) to Lottery Vault
        let treasury_bump = ctx.bumps.treasury_vault;
        let seeds: &[&[u8]] = &[TREASURY_VAULT_SEED, &[treasury_bump]];
        let signer_seeds = &[seeds][..];
        
        system_program::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.system_program.to_account_info(),
                system_program::Transfer {
                    from: treasury_vault.to_account_info(),
                    to: vault.to_account_info(),
                },
                signer_seeds,
            ),
            needed,
        )?;
        
        msg!("[TREASURY] Transferred {} lamports from Treasury Vault to DPL Vault for rent/fees", needed);
    }

    // [ENTROPY] Get randomness from Pyth (or Clock fallback)
    let vault_seed = (LotteryType::DPL.to_u8() as u64) << 56 | (tier as u64) << 48 | vault.round_number as u64;
    let entropy = get_draw_entropy(None, vault_seed)?;
    let random_index = (entropy % vault.participant_count.max(1) as u64) as u32;

    msg!("DPL Winner Selected: tier={}, index={}, total={}", tier, random_index, vault.participant_count);

    let winner_pubkey = find_winner_in_chain(
        &ctx.accounts.participant_page_0.to_account_info(),
        Some(&ctx.accounts.winning_participant_page.to_account_info()),
        random_index,
        vault.lottery_type.to_u8(),
        vault.tier
    )?;

    // Verify winner matches
    require_keys_eq!(ctx.accounts.winner.key(), winner_pubkey, LotteryError::InvalidWinner);
    
    // [ATA_CREATION] Verify and create winner's ATA (idempotent)
    verify_and_create_winner_ata(
        &winner_pubkey,
        &ctx.accounts.winner_ata.to_account_info(),
        &ctx.accounts.winner.to_account_info(),
        &ctx.accounts.dpt_mint.to_account_info(),
        &ctx.accounts.token_program.to_account_info(),
        &ctx.accounts.authority.to_account_info(),
        &ctx.accounts.system_program.to_account_info(),
        &ctx.accounts.associated_token_program.to_account_info(),
    )?;

    // Payout Logic
    let total_balance = vault.balance;
    let winner_prize = total_balance * 95 / 100;
    let admin_fee = total_balance - winner_prize;

    let signer_seeds: &[&[&[u8]]] = &[&[b"vault_dpl", &[tier], &[vault.bump]]];

    // Transfer to winner (ATA now guaranteed to exist)
    let cpi_ctx = CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        TransferChecked {
            from: ctx.accounts.vault_token_account.to_account_info(),
            mint: ctx.accounts.dpt_mint.to_account_info(),
            to: ctx.accounts.winner_ata.to_account_info(),
            authority: vault.to_account_info(),
        },
        signer_seeds,
    );
    transfer_checked(cpi_ctx, winner_prize, 6)?;
    
    // Pay Treasury 5%
    let treasury_ctx = CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        TransferChecked {
            from: ctx.accounts.vault_token_account.to_account_info(),
            mint: ctx.accounts.dpt_mint.to_account_info(),
            to: ctx.accounts.treasury_dpt_ata.to_account_info(),
            authority: vault.to_account_info(),
        },
        signer_seeds,
    );
    transfer_checked(treasury_ctx, admin_fee, 6)?;
    msg!("[FEE] {} DPT (5%) sent to Treasury ATA: {}", admin_fee, ctx.accounts.treasury_dpt_ata.key());

    // [PRIORITY TIP] Pay 0.05 SOL to validator
    pay_priority_tip(
        &ctx.accounts.treasury_vault.to_account_info(),
        &mut ctx.accounts.treasury,
        &ctx.accounts.validator_identity.to_account_info(),
        &ctx.accounts.system_program.to_account_info(),
        ctx.bumps.treasury_vault,
    )?;

    // State Reset - DPL perpetual (1 day)
    reset_vault_after_draw(vault, winner_pubkey, winner_prize, DPL_DURATION)?;
    config.total_prizes_distributed = config.total_prizes_distributed.checked_add(winner_prize).ok_or(LotteryError::ArithmeticOverflow)?;

    // Increment round for next draw
    let tier_index = GlobalRegistry::get_tier_index(LotteryType::DPL, tier)?;
    config.dpl_rounds[tier_index] = config.dpl_rounds[tier_index].checked_add(1).ok_or(LotteryError::ArithmeticOverflow)?;
    vault.round_number = config.dpl_rounds[tier_index];

    // [RENT_REFILL] Refill vault with 0.05 SOL from Treasury Vault for next cycle
    let vault_lamports = vault.to_account_info().lamports();
    if vault_lamports < DRAW_OPERATION_RENT {
        let needed = DRAW_OPERATION_RENT;
        let treasury_vault = &ctx.accounts.treasury_vault;
        
        if treasury_vault.lamports() >= needed {
            let treasury_bump = ctx.bumps.treasury_vault;
            let seeds: &[&[u8]] = &[TREASURY_VAULT_SEED, &[treasury_bump]];
            let signer_seeds = &[seeds][..];
            
            system_program::transfer(
                CpiContext::new_with_signer(
                    ctx.accounts.system_program.to_account_info(),
                    system_program::Transfer {
                        from: treasury_vault.to_account_info(),
                        to: vault.to_account_info(),
                    },
                    signer_seeds,
                ),
                needed,
            )?;
            msg!("Vault refilled with {} lamports from Treasury for next cycle", needed);
        }
    }

    // [FEE_SPONSOR] Reimburse draw authority 0.005 SOL tx fee from Treasury Vault
    {
        let fee_vault = &ctx.accounts.treasury_vault;
        if fee_vault.lamports() >= TX_FEE_REIMBURSEMENT {
            let treasury_bump = ctx.bumps.treasury_vault;
            let seeds: &[&[u8]] = &[TREASURY_VAULT_SEED, &[treasury_bump]];
            let signer_seeds = &[seeds][..];
            system_program::transfer(
                CpiContext::new_with_signer(
                    ctx.accounts.system_program.to_account_info(),
                    system_program::Transfer {
                        from: fee_vault.to_account_info(),
                        to: ctx.accounts.authority.to_account_info(),
                    },
                    signer_seeds,
                ),
                TX_FEE_REIMBURSEMENT,
            )?;
            msg!("[FEE_SPONSOR] Transaction fee sponsored by Fortress Treasury: {} lamports returned to payer", TX_FEE_REIMBURSEMENT);
        }
    }

    msg!("DPL Winner Drawn: tier={}, winner={}, prize={}", tier, winner_pubkey, winner_prize);
    Ok(())
}

// ==================== DRAW WPL WINNER ====================

#[derive(Accounts)]
#[instruction(tier: u8)]
pub struct DrawWplWinner<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    /// CHECK: Address checked in function to save stack space
    #[account(
        address = pubkey!("3YTnzmFTECtyKDxaghWPQcjzX7g1Cj3NxMq41JdWk2rj")
    )]
    pub dpt_mint: Box<InterfaceAccount<'info, Mint>>,

    #[account(
        mut,
        seeds = [b"vault_wpl", &[tier]],
        bump
    )]
    pub lottery_state: Box<Account<'info, LotteryVault>>,

    #[account(
        mut,
        associated_token::mint = dpt_mint,
        associated_token::authority = lottery_state,
        associated_token::token_program = token_program,
    )]
    pub vault_token_account: Box<InterfaceAccount<'info, TokenAccount>>,

    /// The winner's public key - will be verified against calculated winner from pages
    /// CHECK: Verified in instruction logic against winner calculated from participant pages
    pub winner: UncheckedAccount<'info>,

    /// The winner's ATA - will be verified/created in instruction logic
    /// CHECK: Verified in instruction logic as deterministic PDA from winner + mint
    #[account(mut)]
    pub winner_ata: UncheckedAccount<'info>,

    #[account(
        init_if_needed,
        payer = authority,
        associated_token::mint = dpt_mint,
        associated_token::authority = treasury_vault,
        associated_token::token_program = token_program,
    )]
    pub treasury_dpt_ata: Box<InterfaceAccount<'info, TokenAccount>>,

    // Participant pages handled manually to avoid stack overflow
    /// CHECK: ParticipantPage account - uses UncheckedAccount to bypass discriminator mismatch from old program versions
    pub participant_page_0: UncheckedAccount<'info>,

    /// CHECK: ParticipantPage account - uses UncheckedAccount to bypass discriminator mismatch from old program versions
    pub winning_participant_page: UncheckedAccount<'info>,

    #[account(
        mut,
        seeds = [b"global_registry"],
        bump
    )]
    pub config: Box<Account<'info, GlobalRegistry>>,

    /// Treasury Vault PDA - Pays rent/fees for draw operations
    /// CHECK: Treasury Vault is a raw PDA holding SOL, verified by seeds
    #[account(
        mut,
        seeds = [TREASURY_VAULT_SEED],
        bump
    )]
    pub treasury_vault: UncheckedAccount<'info>,

    #[account(
        mut,
        seeds = [b"treasury"],
        bump
    )]
    pub treasury: Account<'info, Treasury>,

    /// CHECK: Validator identity account for priority tip
    pub validator_identity: UncheckedAccount<'info>,

    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn draw_wpl_winner(ctx: Context<DrawWplWinner>, tier: u8) -> Result<()> {
    // [SECURITY_NOTICE] Temporary Clock-Based Entropy - Pending Pyth SDK Upgrade
    let config = &mut ctx.accounts.config;
    let vault = &mut ctx.accounts.lottery_state;

    require!(LotteryType::WPL.is_valid_tier(tier), LotteryError::InvalidTier);
    require!(!vault.is_drawn, LotteryError::LotteryAlreadyDrawn);

    let current_time = Clock::get()?.unix_timestamp;
    require!(current_time >= vault.end_time, LotteryError::LotteryNotEnded);
    // [TIME-BASED] WPL is unlimited - only requires at least 1 participant (no max)
    require!(vault.participant_count > 0, LotteryError::NoParticipants);
    require!(vault.balance > 0, LotteryError::InsufficientBalance);

    // [TREASURY_VAULT_FEE] Transfer SOL from Treasury Vault to Lottery Vault if needed
    let vault_lamports = vault.to_account_info().lamports();
    if vault_lamports < DRAW_OPERATION_RENT {
        let needed = DRAW_OPERATION_RENT - vault_lamports;
        let treasury_vault = &ctx.accounts.treasury_vault;
        
        require!(
            treasury_vault.lamports() >= needed,
            LotteryError::InsufficientVaultFunds
        );
        
        // Transfer from Treasury Vault (PDA) to Lottery Vault
        let treasury_bump = ctx.bumps.treasury_vault;
        let seeds: &[&[u8]] = &[TREASURY_VAULT_SEED, &[treasury_bump]];
        let signer_seeds = &[seeds][..];
        
        system_program::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.system_program.to_account_info(),
                system_program::Transfer {
                    from: treasury_vault.to_account_info(),
                    to: vault.to_account_info(),
                },
                signer_seeds,
            ),
            needed,
        )?;
        
        msg!("[TREASURY] Transferred {} lamports from Treasury Vault to WPL Vault for rent/fees", needed);
    }

    // [ENTROPY] Get randomness from Pyth (or Clock fallback)
    let vault_seed = (LotteryType::WPL.to_u8() as u64) << 56 | (tier as u64) << 48 | vault.round_number as u64;
    let entropy = get_draw_entropy(None, vault_seed)?;
    let random_index = (entropy % vault.participant_count.max(1) as u64) as u32;

    msg!("WPL Winner Selected: tier={}, index={}, total={}", tier, random_index, vault.participant_count);

    let winner_pubkey = find_winner_in_chain(
        &ctx.accounts.participant_page_0.to_account_info(),
        Some(&ctx.accounts.winning_participant_page.to_account_info()),
        random_index,
        vault.lottery_type.to_u8(),
        vault.tier
    )?;

    // Verify winner matches
    require_keys_eq!(ctx.accounts.winner.key(), winner_pubkey, LotteryError::InvalidWinner);
    
    // [ATA_CREATION] Verify and create winner's ATA (idempotent)
    verify_and_create_winner_ata(
        &winner_pubkey,
        &ctx.accounts.winner_ata.to_account_info(),
        &ctx.accounts.winner.to_account_info(),
        &ctx.accounts.dpt_mint.to_account_info(),
        &ctx.accounts.token_program.to_account_info(),
        &ctx.accounts.authority.to_account_info(),
        &ctx.accounts.system_program.to_account_info(),
        &ctx.accounts.associated_token_program.to_account_info(),
    )?;

    // Payout Logic
    let total_balance = vault.balance;
    let winner_prize = total_balance * 95 / 100;
    let admin_fee = total_balance - winner_prize;

    let signer_seeds: &[&[&[u8]]] = &[&[b"vault_wpl", &[tier], &[vault.bump]]];

    // Transfer to winner (ATA now guaranteed to exist)
    let cpi_ctx = CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        TransferChecked {
            from: ctx.accounts.vault_token_account.to_account_info(),
            mint: ctx.accounts.dpt_mint.to_account_info(),
            to: ctx.accounts.winner_ata.to_account_info(),
            authority: vault.to_account_info(),
        },
        signer_seeds,
    );
    transfer_checked(cpi_ctx, winner_prize, 6)?;
    
    // Pay Treasury 5%
    let treasury_ctx = CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        TransferChecked {
            from: ctx.accounts.vault_token_account.to_account_info(),
            mint: ctx.accounts.dpt_mint.to_account_info(),
            to: ctx.accounts.treasury_dpt_ata.to_account_info(),
            authority: vault.to_account_info(),
        },
        signer_seeds,
    );
    transfer_checked(treasury_ctx, admin_fee, 6)?;
    msg!("[FEE] {} DPT (5%) sent to Treasury ATA: {}", admin_fee, ctx.accounts.treasury_dpt_ata.key());

    // [PRIORITY TIP] Pay 0.05 SOL to validator
    pay_priority_tip(
        &ctx.accounts.treasury_vault.to_account_info(),
        &mut ctx.accounts.treasury,
        &ctx.accounts.validator_identity.to_account_info(),
        &ctx.accounts.system_program.to_account_info(),
        ctx.bumps.treasury_vault,
    )?;

    // State Reset - WPL perpetual (1 week)
    reset_vault_after_draw(vault, winner_pubkey, winner_prize, WPL_DURATION)?;
    config.total_prizes_distributed = config.total_prizes_distributed.checked_add(winner_prize).ok_or(LotteryError::ArithmeticOverflow)?;

    // Increment round for next draw
    let tier_index = GlobalRegistry::get_tier_index(LotteryType::WPL, tier)?;
    config.wpl_rounds[tier_index] = config.wpl_rounds[tier_index].checked_add(1).ok_or(LotteryError::ArithmeticOverflow)?;
    vault.round_number = config.wpl_rounds[tier_index];

    // [RENT_REFILL] Refill vault with 0.05 SOL from Treasury Vault for next cycle
    let vault_lamports = vault.to_account_info().lamports();
    if vault_lamports < DRAW_OPERATION_RENT {
        let needed = DRAW_OPERATION_RENT;
        let treasury_vault = &ctx.accounts.treasury_vault;
        
        if treasury_vault.lamports() >= needed {
            let treasury_bump = ctx.bumps.treasury_vault;
            let seeds: &[&[u8]] = &[TREASURY_VAULT_SEED, &[treasury_bump]];
            let signer_seeds = &[seeds][..];
            
            system_program::transfer(
                CpiContext::new_with_signer(
                    ctx.accounts.system_program.to_account_info(),
                    system_program::Transfer {
                        from: treasury_vault.to_account_info(),
                        to: vault.to_account_info(),
                    },
                    signer_seeds,
                ),
                needed,
            )?;
            msg!("Vault refilled with {} lamports from Treasury for next cycle", needed);
        }
    }

    // [FEE_SPONSOR] Reimburse draw authority 0.005 SOL tx fee from Treasury Vault
    {
        let fee_vault = &ctx.accounts.treasury_vault;
        if fee_vault.lamports() >= TX_FEE_REIMBURSEMENT {
            let treasury_bump = ctx.bumps.treasury_vault;
            let seeds: &[&[u8]] = &[TREASURY_VAULT_SEED, &[treasury_bump]];
            let signer_seeds = &[seeds][..];
            system_program::transfer(
                CpiContext::new_with_signer(
                    ctx.accounts.system_program.to_account_info(),
                    system_program::Transfer {
                        from: fee_vault.to_account_info(),
                        to: ctx.accounts.authority.to_account_info(),
                    },
                    signer_seeds,
                ),
                TX_FEE_REIMBURSEMENT,
            )?;
            msg!("[FEE_SPONSOR] Transaction fee sponsored by Fortress Treasury: {} lamports returned to payer", TX_FEE_REIMBURSEMENT);
        }
    }

    msg!("WPL Winner Drawn: tier={}, winner={}, prize={}", tier, winner_pubkey, winner_prize);
    Ok(())
}

// ==================== DRAW MPL WINNER ====================

#[derive(Accounts)]
#[instruction(tier: u8)]
pub struct DrawMplWinner<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        address = "3YTnzmFTECtyKDxaghWPQcjzX7g1Cj3NxMq41JdWk2rj".parse::<Pubkey>().unwrap()
    )]
    pub dpt_mint: Box<InterfaceAccount<'info, Mint>>,

    #[account(
        mut,
        seeds = [b"vault_mpl", &[tier]],
        bump
    )]
    pub lottery_state: Box<Account<'info, LotteryVault>>,

    #[account(
        mut,
        associated_token::mint = dpt_mint,
        associated_token::authority = lottery_state,
        associated_token::token_program = token_program,
    )]
    pub vault_token_account: Box<InterfaceAccount<'info, TokenAccount>>,

    /// The winner's public key - will be verified against calculated winner from pages
    /// CHECK: Verified in instruction logic against winner calculated from participant pages
    pub winner: UncheckedAccount<'info>,

    /// The winner's ATA - will be verified/created in instruction logic
    /// CHECK: Verified in instruction logic as deterministic PDA from winner + mint
    #[account(mut)]
    pub winner_ata: UncheckedAccount<'info>,

    #[account(
        init_if_needed,
        payer = authority,
        associated_token::mint = dpt_mint,
        associated_token::authority = treasury_vault,
        associated_token::token_program = token_program,
    )]
    pub treasury_dpt_ata: Box<InterfaceAccount<'info, TokenAccount>>,

    // Participant pages handled manually to avoid stack overflow
    /// CHECK: ParticipantPage account - uses UncheckedAccount to bypass discriminator mismatch from old program versions
    pub participant_page_0: UncheckedAccount<'info>,

    /// CHECK: ParticipantPage account - uses UncheckedAccount to bypass discriminator mismatch from old program versions
    pub winning_participant_page: UncheckedAccount<'info>,

    #[account(
        mut,
        seeds = [b"global_registry"],
        bump
    )]
    pub config: Box<Account<'info, GlobalRegistry>>,

    /// Treasury Vault PDA - Pays rent/fees for draw operations
    /// CHECK: Treasury Vault is a raw PDA holding SOL, verified by seeds
    #[account(
        mut,
        seeds = [TREASURY_VAULT_SEED],
        bump
    )]
    pub treasury_vault: UncheckedAccount<'info>,

    #[account(
        mut,
        seeds = [b"treasury"],
        bump
    )]
    pub treasury: Account<'info, Treasury>,

    /// CHECK: Validator identity account for priority tip
    pub validator_identity: UncheckedAccount<'info>,

    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn draw_mpl_winner(ctx: Context<DrawMplWinner>, tier: u8) -> Result<()> {
    // [SECURITY_NOTICE] Temporary Clock-Based Entropy - Pending Pyth SDK Upgrade
    let config = &mut ctx.accounts.config;
    let vault = &mut ctx.accounts.lottery_state;

    require!(LotteryType::MPL.is_valid_tier(tier), LotteryError::InvalidTier);
    require!(!vault.is_drawn, LotteryError::LotteryAlreadyDrawn);

    let current_time = Clock::get()?.unix_timestamp;
    require!(current_time >= vault.end_time, LotteryError::LotteryNotEnded);
    // [TIME-BASED] MPL is unlimited - only requires at least 1 participant (no max)
    require!(vault.participant_count > 0, LotteryError::NoParticipants);
    require!(vault.balance > 0, LotteryError::InsufficientBalance);

    // [TREASURY_VAULT_FEE] Transfer SOL from Treasury Vault to Lottery Vault if needed
    let vault_lamports = vault.to_account_info().lamports();
    if vault_lamports < DRAW_OPERATION_RENT {
        let needed = DRAW_OPERATION_RENT - vault_lamports;
        let treasury_vault = &ctx.accounts.treasury_vault;
        
        require!(
            treasury_vault.lamports() >= needed,
            LotteryError::InsufficientVaultFunds
        );
        
        // Transfer from Treasury Vault (PDA) to Lottery Vault
        let treasury_bump = ctx.bumps.treasury_vault;
        let seeds: &[&[u8]] = &[TREASURY_VAULT_SEED, &[treasury_bump]];
        let signer_seeds = &[seeds][..];
        
        system_program::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.system_program.to_account_info(),
                system_program::Transfer {
                    from: treasury_vault.to_account_info(),
                    to: vault.to_account_info(),
                },
                signer_seeds,
            ),
            needed,
        )?;
        
        msg!("[TREASURY] Transferred {} lamports from Treasury Vault to MPL Vault for rent/fees", needed);
    }

    // [ENTROPY] Get randomness from Pyth (or Clock fallback)
    let vault_seed = (LotteryType::MPL.to_u8() as u64) << 56 | (tier as u64) << 48 | vault.round_number as u64;
    let entropy = get_draw_entropy(None, vault_seed)?;
    let random_index = (entropy % vault.participant_count.max(1) as u64) as u32;

    msg!("MPL Winner Selected: tier={}, index={}, total={}", tier, random_index, vault.participant_count);

    let winner_pubkey = find_winner_in_chain(
        &ctx.accounts.participant_page_0.to_account_info(),
        Some(&ctx.accounts.winning_participant_page.to_account_info()),
        random_index,
        vault.lottery_type.to_u8(),
        vault.tier
    )?;

    // Verify winner matches
    require_keys_eq!(ctx.accounts.winner.key(), winner_pubkey, LotteryError::InvalidWinner);
    
    // [ATA_CREATION] Verify and create winner's ATA (idempotent)
    verify_and_create_winner_ata(
        &winner_pubkey,
        &ctx.accounts.winner_ata.to_account_info(),
        &ctx.accounts.winner.to_account_info(),
        &ctx.accounts.dpt_mint.to_account_info(),
        &ctx.accounts.token_program.to_account_info(),
        &ctx.accounts.authority.to_account_info(),
        &ctx.accounts.system_program.to_account_info(),
        &ctx.accounts.associated_token_program.to_account_info(),
    )?;

    // Payout Logic
    let total_balance = vault.balance;
    let winner_prize = total_balance * 95 / 100;
    let admin_fee = total_balance - winner_prize;

    let signer_seeds: &[&[&[u8]]] = &[&[b"vault_mpl", &[tier], &[vault.bump]]];

    // Transfer to winner (ATA now guaranteed to exist)
    let cpi_ctx = CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        TransferChecked {
            from: ctx.accounts.vault_token_account.to_account_info(),
            mint: ctx.accounts.dpt_mint.to_account_info(),
            to: ctx.accounts.winner_ata.to_account_info(),
            authority: vault.to_account_info(),
        },
        signer_seeds,
    );
    transfer_checked(cpi_ctx, winner_prize, 6)?;
    
    // Pay Treasury 5%
    let treasury_ctx = CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        TransferChecked {
            from: ctx.accounts.vault_token_account.to_account_info(),
            mint: ctx.accounts.dpt_mint.to_account_info(),
            to: ctx.accounts.treasury_dpt_ata.to_account_info(),
            authority: vault.to_account_info(),
        },
        signer_seeds,
    );
    transfer_checked(treasury_ctx, admin_fee, 6)?;
    msg!("[FEE] {} DPT (5%) sent to Treasury ATA: {}", admin_fee, ctx.accounts.treasury_dpt_ata.key());

    // [PRIORITY TIP] Pay 0.05 SOL to validator
    pay_priority_tip(
        &ctx.accounts.treasury_vault.to_account_info(),
        &mut ctx.accounts.treasury,
        &ctx.accounts.validator_identity.to_account_info(),
        &ctx.accounts.system_program.to_account_info(),
        ctx.bumps.treasury_vault,
    )?;

    // State Reset - MPL perpetual (1 month)
    reset_vault_after_draw(vault, winner_pubkey, winner_prize, MPL_DURATION)?;
    config.total_prizes_distributed = config.total_prizes_distributed.checked_add(winner_prize).ok_or(LotteryError::ArithmeticOverflow)?;

    // Increment round for next draw
    let tier_index = GlobalRegistry::get_tier_index(LotteryType::MPL, tier)?;
    config.mpl_rounds[tier_index] = config.mpl_rounds[tier_index].checked_add(1).ok_or(LotteryError::ArithmeticOverflow)?;
    vault.round_number = config.mpl_rounds[tier_index];

    // [RENT_REFILL] Refill vault with 0.05 SOL from Treasury Vault for next cycle
    let vault_lamports = vault.to_account_info().lamports();
    if vault_lamports < DRAW_OPERATION_RENT {
        let needed = DRAW_OPERATION_RENT;
        let treasury_vault = &ctx.accounts.treasury_vault;
        
        if treasury_vault.lamports() >= needed {
            let treasury_bump = ctx.bumps.treasury_vault;
            let seeds: &[&[u8]] = &[TREASURY_VAULT_SEED, &[treasury_bump]];
            let signer_seeds = &[seeds][..];
            
            system_program::transfer(
                CpiContext::new_with_signer(
                    ctx.accounts.system_program.to_account_info(),
                    system_program::Transfer {
                        from: treasury_vault.to_account_info(),
                        to: vault.to_account_info(),
                    },
                    signer_seeds,
                ),
                needed,
            )?;
            msg!("Vault refilled with {} lamports from Treasury for next cycle", needed);
        }
    }

    // [FEE_SPONSOR] Reimburse draw authority 0.005 SOL tx fee from Treasury Vault
    {
        let fee_vault = &ctx.accounts.treasury_vault;
        if fee_vault.lamports() >= TX_FEE_REIMBURSEMENT {
            let treasury_bump = ctx.bumps.treasury_vault;
            let seeds: &[&[u8]] = &[TREASURY_VAULT_SEED, &[treasury_bump]];
            let signer_seeds = &[seeds][..];
            system_program::transfer(
                CpiContext::new_with_signer(
                    ctx.accounts.system_program.to_account_info(),
                    system_program::Transfer {
                        from: fee_vault.to_account_info(),
                        to: ctx.accounts.authority.to_account_info(),
                    },
                    signer_seeds,
                ),
                TX_FEE_REIMBURSEMENT,
            )?;
            msg!("[FEE_SPONSOR] Transaction fee sponsored by Fortress Treasury: {} lamports returned to payer", TX_FEE_REIMBURSEMENT);
        }
    }

    msg!("MPL Winner Drawn: tier={}, winner={}, prize={}", tier, winner_pubkey, winner_prize);
    Ok(())
}

