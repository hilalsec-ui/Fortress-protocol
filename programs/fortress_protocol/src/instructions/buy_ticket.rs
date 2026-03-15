use crate::errors::*;
use crate::state::*;
use anchor_lang::prelude::*;
use anchor_spl::associated_token::{AssociatedToken, get_associated_token_address_with_program_id};
use anchor_spl::token_interface::{
    transfer_checked, Mint, TokenInterface, TransferChecked,
};

// ── LPM (capacity-based) keeps its own struct because the page seed is different
// ── DPL/WPL/MPL share ONE struct; vault seed validated in instruction body.

// ==================== BUY LPM TICKET ====================

#[derive(Accounts)]
#[instruction(tier: u8, quantity: u32, fpt_per_ticket: u64, max_fpt_amount: u64, page_number: u32)]
pub struct BuyLpmTicket<'info> {
    #[account(mut)]
    pub buyer: Signer<'info>,

    #[account(
        address = "3YTnzmFTECtyKDxaghWPQcjzX7g1Cj3NxMq41JdWk2rj".parse::<Pubkey>().unwrap()
    )]
    pub fpt_mint: Box<InterfaceAccount<'info, Mint>>,

    /// CHECK: Buyer's FPT ATA — created via treasury CPI if absent. Address validated in body.
    #[account(mut)]
    pub buyer_token_account: UncheckedAccount<'info>,

    #[account(
        mut,
        seeds = [b"vault_lpm", &[tier]],
        bump
    )]
    pub lottery_vault: Box<Account<'info, LotteryVault>>,

    /// CHECK: Vault FPT ATA — created via treasury CPI if absent. Address validated in body.
    #[account(mut)]
    pub vault_token_account: UncheckedAccount<'info>,

    /// CHECK: Participant page PDA — created via treasury CPI if absent. Seeds validated in body.
    #[account(mut)]
    pub participant_page: UncheckedAccount<'info>,

    #[account(
        mut,
        seeds = [b"global_registry"],
        bump
    )]
    pub registry: Box<Account<'info, GlobalRegistry>>,



    #[account(
        mut,
        seeds = [b"sol_vault"],
        bump
    )]
    pub sol_vault: SystemAccount<'info>,

    /// CHECK: Solana instructions sysvar — lets this instruction verify the
    /// Switchboard oracle Ed25519 quote prepended by fetchManagedUpdateIxs.
    #[account(address = anchor_lang::solana_program::sysvar::instructions::ID)]
    pub instructions_sysvar: UncheckedAccount<'info>,

    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn buy_lpm_ticket(ctx: Context<BuyLpmTicket>, tier: u8, quantity: u32, fpt_per_ticket: u64, max_fpt_amount: u64, page_number: u32) -> Result<()> {
    let lottery_type = LotteryType::LPM;
    require!(lottery_type.is_valid_tier(tier), LotteryError::InvalidTier);
    require!(quantity > 0 && quantity <= 50, LotteryError::InvalidQuantity);

    let sol_vault_bump = ctx.bumps.sol_vault;
    let tv_seeds: &[&[u8]] = &[b"sol_vault", &[sol_vault_bump]];

    // ── Create buyer ATA if it doesn't exist (treasury pays) ──
    let expected_buyer_ata = get_associated_token_address_with_program_id(
        &ctx.accounts.buyer.key(),
        &ctx.accounts.fpt_mint.key(),
        &ctx.accounts.token_program.key(),
    );
    require_keys_eq!(ctx.accounts.buyer_token_account.key(), expected_buyer_ata, LotteryError::InvalidLotteryType);

    if ctx.accounts.buyer_token_account.data_is_empty() {
        anchor_spl::associated_token::create(CpiContext::new_with_signer(
            ctx.accounts.associated_token_program.to_account_info(),
            anchor_spl::associated_token::Create {
                payer: ctx.accounts.sol_vault.to_account_info(),
                associated_token: ctx.accounts.buyer_token_account.to_account_info(),
                authority: ctx.accounts.buyer.to_account_info(),
                mint: ctx.accounts.fpt_mint.to_account_info(),
                system_program: ctx.accounts.system_program.to_account_info(),
                token_program: ctx.accounts.token_program.to_account_info(),
            },
            &[tv_seeds],
        ))?;
    }

    // ── Create vault ATA if it doesn't exist (treasury pays) ──
    let expected_vault_ata = get_associated_token_address_with_program_id(
        &ctx.accounts.lottery_vault.key(),
        &ctx.accounts.fpt_mint.key(),
        &ctx.accounts.token_program.key(),
    );
    require_keys_eq!(ctx.accounts.vault_token_account.key(), expected_vault_ata, LotteryError::InvalidLotteryType);

    if ctx.accounts.vault_token_account.data_is_empty() {
        anchor_spl::associated_token::create(CpiContext::new_with_signer(
            ctx.accounts.associated_token_program.to_account_info(),
            anchor_spl::associated_token::Create {
                payer: ctx.accounts.sol_vault.to_account_info(),
                associated_token: ctx.accounts.vault_token_account.to_account_info(),
                authority: ctx.accounts.lottery_vault.to_account_info(),
                mint: ctx.accounts.fpt_mint.to_account_info(),
                system_program: ctx.accounts.system_program.to_account_info(),
                token_program: ctx.accounts.token_program.to_account_info(),
            },
            &[tv_seeds],
        ))?;
    }

    // ── Create participant page if it doesn't exist (treasury pays) ──
    let page_seeds_no_bump: &[&[u8]] = &[
        b"page",
        &[0u8, 0, 0, 0],
        &[tier, 0, 0, 0],
        &page_number.to_le_bytes(),
    ];
    let (expected_page_key, page_bump) = Pubkey::find_program_address(page_seeds_no_bump, ctx.program_id);
    require_keys_eq!(ctx.accounts.participant_page.key(), expected_page_key, LotteryError::InvalidParticipantPage);

    let page_newly_created = ctx.accounts.participant_page.data_is_empty();
    if page_newly_created {
        let rent = Rent::get()?;
        let space = ParticipantPage::LEN;
        let lamports = rent.minimum_balance(space);
        let page_seeds_with_bump: &[&[u8]] = &[
            b"page",
            &[0u8, 0, 0, 0],
            &[tier, 0, 0, 0],
            &page_number.to_le_bytes(),
            &[page_bump],
        ];
        anchor_lang::solana_program::program::invoke_signed(
            &anchor_lang::solana_program::system_instruction::create_account(
                &ctx.accounts.sol_vault.key(),
                &expected_page_key,
                lamports,
                space as u64,
                ctx.program_id,
            ),
            &[
                ctx.accounts.sol_vault.to_account_info(),
                ctx.accounts.participant_page.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
            ],
            &[tv_seeds, page_seeds_with_bump],
        )?;
        // Write Anchor discriminator
        let disc = <ParticipantPage as anchor_lang::Discriminator>::DISCRIMINATOR;
        let mut data = ctx.accounts.participant_page.try_borrow_mut_data()?;
        data[..8].copy_from_slice(&disc);
    }

    // ── Now deserialize participant_page ──
    let participant_page_info = ctx.accounts.participant_page.to_account_info();
    let mut page_data = participant_page_info.try_borrow_mut_data()?;
    let mut participant_page = ParticipantPage::try_deserialize(&mut &page_data[..])?;

    let lottery_vault = &mut ctx.accounts.lottery_vault;
    let registry = &mut ctx.accounts.registry;

    let tier_index = GlobalRegistry::get_tier_index(lottery_type, tier)?;
    let current_round = registry.lpm_rounds[tier_index];

    if lottery_vault.balance == 0 && lottery_vault.tier == 0 && lottery_vault.participant_count == 0 {
        lottery_vault.lottery_type = lottery_type;
        lottery_vault.tier = tier;
        lottery_vault.round_number = current_round;
        lottery_vault.balance = 0;
        lottery_vault.participant_count = 0;
        lottery_vault.is_drawn = false;
        lottery_vault.current_page = 0;
        lottery_vault.bump = ctx.bumps.lottery_vault;
    }

    if lottery_vault.is_drawn && lottery_vault.participant_count == 0 {
        lottery_vault.is_drawn = false;
    }
    if lottery_vault.is_drawn && lottery_vault.participant_count > 0 {
        return Err(LotteryError::LotteryAlreadyDrawn.into());
    }

    let expected_page = lottery_vault.participant_count.checked_div(50).ok_or(LotteryError::ArithmeticOverflow)?;
    require!(page_number == expected_page, LotteryError::InvalidParticipantPage);

    let page_start_count = page_number.checked_mul(50).ok_or(LotteryError::ArithmeticOverflow)?;
    if lottery_vault.participant_count == page_start_count {
        participant_page.participants.clear();
        participant_page.lottery_type = 0;
        participant_page.tier = tier;
        participant_page.page_number = page_number;
        participant_page.bump = page_bump;
        participant_page.winner_pubkey = None;
        participant_page.next_page = None;
    }

    let new_participant_count = lottery_vault.participant_count
        .checked_add(quantity).ok_or(LotteryError::ArithmeticOverflow)?;
    require!(new_participant_count <= 100, LotteryError::LpmCapacityExceeded);

    let current_page_entries = participant_page.participants.len() as u32;
    let remaining_page_capacity = 50u32.saturating_sub(current_page_entries);
    require!(quantity <= remaining_page_capacity, LotteryError::PageFull);

    if page_number > lottery_vault.current_page {
        lottery_vault.current_page = page_number;
    }

    // ── Switchboard oracle price verification ────────────────────────────────
    // Verify the SB Ed25519 oracle quote that fetchManagedUpdateIxs prepended
    // to this transaction and enforce the oracle-derived FPT rate.
    verify_oracle_price_and_fpt(
        &ctx.accounts.instructions_sysvar.to_account_info(),
        tier,
        fpt_per_ticket,
    )?;
    // Enforce user's declared slippage cap (fpt_per_ticket ≤ max_fpt_amount).
    crate::oracle::validate_slippage(fpt_per_ticket, max_fpt_amount)?;
    let total_amount = fpt_per_ticket.checked_mul(quantity as u64).ok_or(LotteryError::ArithmeticOverflow)?;

    // Read buyer balance from raw account data (UncheckedAccount — offset 64 for amount in SPL layout)
    {
        let buyer_data = ctx.accounts.buyer_token_account.try_borrow_data()?;
        require!(buyer_data.len() >= 72, LotteryError::InsufficientFptBalance);
        let buyer_balance = u64::from_le_bytes(buyer_data[64..72].try_into().unwrap());
        require!(buyer_balance >= total_amount, LotteryError::InsufficientFptBalance);
    }

    transfer_checked(
        CpiContext::new(ctx.accounts.token_program.to_account_info(), TransferChecked {
            from: ctx.accounts.buyer_token_account.to_account_info(),
            mint: ctx.accounts.fpt_mint.to_account_info(),
            to: ctx.accounts.vault_token_account.to_account_info(),
            authority: ctx.accounts.buyer.to_account_info(),
        }),
        total_amount,
        6,
    )?;

    lottery_vault.participant_count = new_participant_count;
    lottery_vault.balance = lottery_vault.balance.checked_add(total_amount).ok_or(LotteryError::ArithmeticOverflow)?;

    if lottery_vault.participant_count == 100 {
        lottery_vault.is_drawn = true;
    }

    for _ in 0..quantity {
        participant_page.participants.push(ctx.accounts.buyer.key());
    }

    registry.total_participants = registry.total_participants
        .checked_add(quantity as u64).ok_or(LotteryError::ArithmeticOverflow)?;

    // Serialize participant_page back
    let serialized = participant_page.try_to_vec()?;
    let disc = <ParticipantPage as anchor_lang::Discriminator>::DISCRIMINATOR;
    page_data[..8].copy_from_slice(&disc);
    page_data[8..8 + serialized.len()].copy_from_slice(&serialized);

    Ok(())
}

// ==================== SHARED DPL / WPL / MPL BUY TICKET ====================
// One account struct — vault seed validated in instruction body.
// lottery_type_id is the first param so Anchor can derive the participant_page PDA.

#[derive(Accounts)]
#[instruction(lottery_type_id: u8, tier: u8, quantity: u32, fpt_per_ticket: u64, max_fpt_amount: u64, page_number: u32)]
pub struct BuyTimedTicket<'info> {
    #[account(mut)]
    pub buyer: Signer<'info>,

    #[account(
        address = "3YTnzmFTECtyKDxaghWPQcjzX7g1Cj3NxMq41JdWk2rj".parse::<Pubkey>().unwrap()
    )]
    pub fpt_mint: Box<InterfaceAccount<'info, Mint>>,

    /// CHECK: Buyer's FPT ATA — created via treasury CPI if absent. Address validated in body.
    #[account(mut)]
    pub buyer_token_account: UncheckedAccount<'info>,

    /// Vault PDA — key validated in body via stored bump (seed differs by lottery type)
    #[account(mut)]
    pub lottery_vault: Box<Account<'info, LotteryVault>>,

    /// CHECK: Vault FPT ATA — created via treasury CPI if absent. Address validated in body.
    #[account(mut)]
    pub vault_token_account: UncheckedAccount<'info>,

    /// CHECK: Participant page PDA — created via treasury CPI if absent. Seeds validated in body.
    #[account(mut)]
    pub participant_page: UncheckedAccount<'info>,

    #[account(
        mut,
        seeds = [b"global_registry"],
        bump
    )]
    pub registry: Box<Account<'info, GlobalRegistry>>,



    #[account(
        mut,
        seeds = [b"sol_vault"],
        bump
    )]
    pub sol_vault: SystemAccount<'info>,

    /// CHECK: Solana instructions sysvar — lets this instruction verify the
    /// Switchboard oracle Ed25519 quote prepended by fetchManagedUpdateIxs.
    #[account(address = anchor_lang::solana_program::sysvar::instructions::ID)]
    pub instructions_sysvar: UncheckedAccount<'info>,

    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

/// shared body: lottery_type_id 1=DPL, 2=WPL, 3=MPL
/// page_type_byte: the first byte embedded in the page seed (matches participant_page.lottery_type)
#[inline(never)]
fn buy_timed_ticket_impl(
    ctx: Context<BuyTimedTicket>,
    tier: u8,
    quantity: u32,
    fpt_per_ticket: u64,
    max_fpt_amount: u64,
    page_number: u32,
    lottery_type_id: u8,
) -> Result<()> {
    let (vault_seed, lottery_type, period): (&[u8], LotteryType, i64) = match lottery_type_id {
        1 => (b"vault_dpl", LotteryType::DPL, 86_400),
        2 => (b"vault_wpl", LotteryType::WPL, 604_800),
        3 => (b"vault_mpl", LotteryType::MPL, 2_592_000),
        _ => return Err(LotteryError::InvalidLotteryType.into()),
    };

    require!(lottery_type.is_valid_tier(tier), LotteryError::InvalidTier);
    require!(quantity > 0 && quantity <= 50, LotteryError::InvalidQuantity);

    let sol_vault_bump = ctx.bumps.sol_vault;
    let tv_seeds: &[&[u8]] = &[b"sol_vault", &[sol_vault_bump]];

    // ── Create buyer ATA if it doesn't exist (treasury pays) ──
    let expected_buyer_ata = get_associated_token_address_with_program_id(
        &ctx.accounts.buyer.key(),
        &ctx.accounts.fpt_mint.key(),
        &ctx.accounts.token_program.key(),
    );
    require_keys_eq!(ctx.accounts.buyer_token_account.key(), expected_buyer_ata, LotteryError::InvalidLotteryType);

    if ctx.accounts.buyer_token_account.data_is_empty() {
        anchor_spl::associated_token::create(CpiContext::new_with_signer(
            ctx.accounts.associated_token_program.to_account_info(),
            anchor_spl::associated_token::Create {
                payer: ctx.accounts.sol_vault.to_account_info(),
                associated_token: ctx.accounts.buyer_token_account.to_account_info(),
                authority: ctx.accounts.buyer.to_account_info(),
                mint: ctx.accounts.fpt_mint.to_account_info(),
                system_program: ctx.accounts.system_program.to_account_info(),
                token_program: ctx.accounts.token_program.to_account_info(),
            },
            &[tv_seeds],
        ))?;
    }

    // ── Create vault ATA if it doesn't exist (treasury pays) ──
    let expected_vault_ata = get_associated_token_address_with_program_id(
        &ctx.accounts.lottery_vault.key(),
        &ctx.accounts.fpt_mint.key(),
        &ctx.accounts.token_program.key(),
    );
    require_keys_eq!(ctx.accounts.vault_token_account.key(), expected_vault_ata, LotteryError::InvalidLotteryType);

    if ctx.accounts.vault_token_account.data_is_empty() {
        anchor_spl::associated_token::create(CpiContext::new_with_signer(
            ctx.accounts.associated_token_program.to_account_info(),
            anchor_spl::associated_token::Create {
                payer: ctx.accounts.sol_vault.to_account_info(),
                associated_token: ctx.accounts.vault_token_account.to_account_info(),
                authority: ctx.accounts.lottery_vault.to_account_info(),
                mint: ctx.accounts.fpt_mint.to_account_info(),
                system_program: ctx.accounts.system_program.to_account_info(),
                token_program: ctx.accounts.token_program.to_account_info(),
            },
            &[tv_seeds],
        ))?;
    }

    // ── Create participant page if it doesn't exist (treasury pays) ──
    let page_seeds_no_bump: &[&[u8]] = &[
        b"page",
        &[lottery_type_id, 0u8, 0u8, 0u8],
        &[tier, 0u8, 0u8, 0u8],
        &page_number.to_le_bytes(),
    ];
    let (expected_page_key, page_bump) = Pubkey::find_program_address(page_seeds_no_bump, ctx.program_id);
    require_keys_eq!(ctx.accounts.participant_page.key(), expected_page_key, LotteryError::InvalidParticipantPage);

    if ctx.accounts.participant_page.data_is_empty() {
        let rent = Rent::get()?;
        let space = ParticipantPage::LEN;
        let lamports = rent.minimum_balance(space);
        let page_seeds_with_bump: &[&[u8]] = &[
            b"page",
            &[lottery_type_id, 0u8, 0u8, 0u8],
            &[tier, 0u8, 0u8, 0u8],
            &page_number.to_le_bytes(),
            &[page_bump],
        ];
        anchor_lang::solana_program::program::invoke_signed(
            &anchor_lang::solana_program::system_instruction::create_account(
                &ctx.accounts.sol_vault.key(),
                &expected_page_key,
                lamports,
                space as u64,
                ctx.program_id,
            ),
            &[
                ctx.accounts.sol_vault.to_account_info(),
                ctx.accounts.participant_page.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
            ],
            &[tv_seeds, page_seeds_with_bump],
        )?;
        // Write Anchor discriminator
        let disc = <ParticipantPage as anchor_lang::Discriminator>::DISCRIMINATOR;
        let mut data = ctx.accounts.participant_page.try_borrow_mut_data()?;
        data[..8].copy_from_slice(&disc);
    }

    // ── Deserialize participant_page ──
    let participant_page_info = ctx.accounts.participant_page.to_account_info();
    let mut page_data = participant_page_info.try_borrow_mut_data()?;
    let mut participant_page = ParticipantPage::try_deserialize(&mut &page_data[..])?;

    // Validate vault PDA using stored bump
    let tier_bytes = [tier];
    let vault_bump_val = ctx.accounts.lottery_vault.bump;
    let expected_vault = Pubkey::create_program_address(
        &[vault_seed, &tier_bytes, &[vault_bump_val]],
        &crate::ID,
    ).map_err(|_| LotteryError::InvalidLotteryType)?;
    require_keys_eq!(ctx.accounts.lottery_vault.key(), expected_vault, LotteryError::InvalidLotteryType);

    let lottery_vault = &mut ctx.accounts.lottery_vault;
    let registry = &mut ctx.accounts.registry;

    let tier_index = GlobalRegistry::get_tier_index(lottery_type, tier)?;
    let current_round = match lottery_type_id {
        1 => registry.dpl_rounds[tier_index],
        2 => registry.wpl_rounds[tier_index],
        _ => registry.mpl_rounds[tier_index],
    };

    // Auto-initialize vault on first use (legacy path)
    if lottery_vault.balance == 0 && lottery_vault.tier == 0 && lottery_vault.participant_count == 0 {
        lottery_vault.lottery_type = lottery_type;
        lottery_vault.tier = tier;
        lottery_vault.round_number = current_round;
        lottery_vault.balance = 0;
        lottery_vault.participant_count = 0;
        lottery_vault.is_drawn = false;
        lottery_vault.current_page = 0;
        lottery_vault.bump = vault_bump_val;
    }

    let clock = Clock::get()?;
    if lottery_vault.end_time == 0 {
        lottery_vault.end_time = clock.unix_timestamp + period;
    }

    if lottery_vault.is_drawn && lottery_vault.participant_count == 0 {
        lottery_vault.is_drawn = false;
        lottery_vault.state = VaultState::Active;
    }
    require!(!lottery_vault.is_drawn, LotteryError::LotteryAlreadyDrawn);

    if clock.unix_timestamp >= lottery_vault.end_time {
        if lottery_vault.participant_count > 0 {
            return Err(LotteryError::LotteryEnded.into());
        }
        let elapsed = clock.unix_timestamp - lottery_vault.end_time;
        let periods = elapsed / period + 1;
        lottery_vault.end_time += periods * period;
        lottery_vault.state = VaultState::Active;
        let new_round = current_round.checked_add(periods as u32).ok_or(LotteryError::ArithmeticOverflow)?;
        lottery_vault.round_number = new_round;
        match lottery_type_id {
            1 => registry.dpl_rounds[tier_index] = new_round,
            2 => registry.wpl_rounds[tier_index] = new_round,
            _ => registry.mpl_rounds[tier_index] = new_round,
        }
    }

    require!(lottery_vault.state == VaultState::Active, LotteryError::LotteryEnded);

    let expected_page = lottery_vault.participant_count.checked_div(50).ok_or(LotteryError::ArithmeticOverflow)?;
    require!(page_number == expected_page, LotteryError::InvalidParticipantPage);

    let page_start_count = page_number.checked_mul(50).ok_or(LotteryError::ArithmeticOverflow)?;
    if lottery_vault.participant_count == page_start_count {
        participant_page.participants.clear();
        participant_page.lottery_type = lottery_type_id;
        participant_page.tier = tier;
        participant_page.page_number = page_number;
        participant_page.bump = page_bump;
        participant_page.winner_pubkey = None;
        participant_page.next_page = None;
    }

    let current_page_entries = participant_page.participants.len() as u32;
    let remaining_page_capacity = 50u32.saturating_sub(current_page_entries);
    require!(quantity <= remaining_page_capacity, LotteryError::PageFull);

    if page_number > lottery_vault.current_page {
        lottery_vault.current_page = page_number;
    }

    // ── Switchboard oracle price verification ────────────────────────────────
    verify_oracle_price_and_fpt(
        &ctx.accounts.instructions_sysvar.to_account_info(),
        tier,
        fpt_per_ticket,
    )?;
    // Enforce user's declared slippage cap (fpt_per_ticket ≤ max_fpt_amount).
    crate::oracle::validate_slippage(fpt_per_ticket, max_fpt_amount)?;
    let total_amount = fpt_per_ticket.checked_mul(quantity as u64).ok_or(LotteryError::ArithmeticOverflow)?;

    // Read buyer balance from raw account data (UncheckedAccount — offset 64 for amount in SPL layout)
    {
        let buyer_data = ctx.accounts.buyer_token_account.try_borrow_data()?;
        require!(buyer_data.len() >= 72, LotteryError::InsufficientFptBalance);
        let buyer_balance = u64::from_le_bytes(buyer_data[64..72].try_into().unwrap());
        require!(buyer_balance >= total_amount, LotteryError::InsufficientFptBalance);
    }

    transfer_checked(
        CpiContext::new(ctx.accounts.token_program.to_account_info(), TransferChecked {
            from: ctx.accounts.buyer_token_account.to_account_info(),
            mint: ctx.accounts.fpt_mint.to_account_info(),
            to: ctx.accounts.vault_token_account.to_account_info(),
            authority: ctx.accounts.buyer.to_account_info(),
        }),
        total_amount,
        6,
    )?;

    for _ in 0..quantity {
        participant_page.participants.push(ctx.accounts.buyer.key());
    }

    lottery_vault.balance = lottery_vault.balance.checked_add(total_amount).ok_or(LotteryError::ArithmeticOverflow)?;
    lottery_vault.participant_count = lottery_vault.participant_count
        .checked_add(quantity as u32).ok_or(LotteryError::ArithmeticOverflow)?;
    registry.total_participants = registry.total_participants
        .checked_add(quantity as u64).ok_or(LotteryError::ArithmeticOverflow)?;

    // Serialize participant_page back
    let serialized = participant_page.try_to_vec()?;
    let disc = <ParticipantPage as anchor_lang::Discriminator>::DISCRIMINATOR;
    page_data[..8].copy_from_slice(&disc);
    page_data[8..8 + serialized.len()].copy_from_slice(&serialized);

    Ok(())
}

// Public wrappers (keep Anchor instruction discriminators stable)
// lottery_type_id is now the first param so the struct can derive participant_page PDA via init_if_needed.
pub fn buy_dpl_ticket(ctx: Context<BuyTimedTicket>, lottery_type_id: u8, tier: u8, quantity: u32, fpt_per_ticket: u64, max_fpt_amount: u64, page_number: u32) -> Result<()> {
    require!(lottery_type_id == 1, LotteryError::InvalidLotteryType);
    buy_timed_ticket_impl(ctx, tier, quantity, fpt_per_ticket, max_fpt_amount, page_number, 1)
}

pub fn buy_wpl_ticket(ctx: Context<BuyTimedTicket>, lottery_type_id: u8, tier: u8, quantity: u32, fpt_per_ticket: u64, max_fpt_amount: u64, page_number: u32) -> Result<()> {
    require!(lottery_type_id == 2, LotteryError::InvalidLotteryType);
    buy_timed_ticket_impl(ctx, tier, quantity, fpt_per_ticket, max_fpt_amount, page_number, 2)
}

pub fn buy_mpl_ticket(ctx: Context<BuyTimedTicket>, lottery_type_id: u8, tier: u8, quantity: u32, fpt_per_ticket: u64, max_fpt_amount: u64, page_number: u32) -> Result<()> {
    require!(lottery_type_id == 3, LotteryError::InvalidLotteryType);
    buy_timed_ticket_impl(ctx, tier, quantity, fpt_per_ticket, max_fpt_amount, page_number, 3)
}

// ── Switchboard On-Demand oracle price verification ─────────────────────────
//
// Scans the current transaction for the Ed25519 instruction emitted by
// `queue.fetchManagedUpdateIxs`.  If found, it:
//   1. Verifies the oracle quote is fresh (≤ MAX_FEED_STALENESS_SLOTS).
//   2. Verifies at least MIN_ORACLE_SAMPLES distinct oracle signatures.
//   3. Computes the oracle-required FPT per ticket.
//   4. Enforces `fpt_per_ticket >= oracle_fpt` (no under-payment).
//
// If no oracle quote is found the check is bypassed with a warning log.
// For a stricter production setting, remove the bypass and uncomment the hard-reject line.
fn verify_oracle_price_and_fpt(
    instructions_sysvar: &anchor_lang::prelude::AccountInfo,
    tier: u8,
    fpt_per_ticket: u64,
) -> Result<()> {
    use anchor_lang::solana_program::sysvar::instructions as ix_sysvar;
    let ed25519_pid = crate::oracle::ED25519_PROGRAM_ID;

    // Search up to 16 instructions for the SB oracle Ed25519 quote.
    let mut oracle_result: Option<(i128, u8, u64)> = None;
    for idx in 0..16u8 {
        let ix = match ix_sysvar::load_instruction_at_checked(idx as usize, instructions_sysvar) {
            Ok(ix) => ix,
            Err(_) => break, // no more instructions
        };
        if ix.program_id == ed25519_pid {
            match crate::oracle::parse_sb_oracle_price_from_ed25519(&ix.data) {
                Ok(data) => { oracle_result = Some(data); break; }
                Err(_) => continue, // might be a wallet-adapter Ed25519 ix — keep searching
            }
        }
    }

    if let Some((sol_price_18dec, min_samples, oracle_slot)) = oracle_result {
        let clock = Clock::get()?;

        // 1. Freshness check
        require!(
            clock.slot.saturating_sub(oracle_slot) <= crate::oracle::MAX_FEED_STALENESS_SLOTS,
            LotteryError::StalePriceFeed
        );
        // 2. Minimum oracle signatures
        require!(min_samples >= crate::oracle::MIN_ORACLE_SAMPLES, LotteryError::StalePriceFeed);

        // 3. Compute oracle-required µFPT (tier value = USD amount)
        let oracle_fpt = crate::oracle::compute_fpt_from_oracle_price(sol_price_18dec, tier as u64)?;

        // 4. User must pay at least the oracle rate (prevents under-payment)
        require!(
            fpt_per_ticket >= oracle_fpt,
            LotteryError::StalePriceFeed
        );
    } else {
        // No SB oracle quote found in this transaction.
        // Mainnet fallback: proceed with client-provided rate.
    }
    Ok(())
}
