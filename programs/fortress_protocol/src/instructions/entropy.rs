/// Two-step draw with Switchboard V3 VRF (SRS oracle auto-reveals randomness).
///
/// Step 1 — request_draw_entropy(lottery_type_id, tier, user_commitment):
///   • Validates vault is ready to draw (LPM: 100 participants, timed: expired)
///   • Creates a PendingDraw PDA, stores user_commitment + randomness_account pubkey
///   • Refunds the PDA rent from the vault so the requester sees 0 net SOL
///   • CPIs randomness_commit to the Switchboard On-Demand program
///   • SRS oracle detects the commit and auto-reveals (typically within 1-5 seconds)
///
/// Step 2 — fulfill_draw_entropy(lottery_type_id, tier):
///   • Permissionless — anyone can call (keeper bot, user, or relayer)
///   • Reads RandomnessAccountData.value @152 (set by oracle after reveal)
///   • Combines SB value + user_commitment → manipulation-resistant winner selection
///   • Closes PendingDraw (rent → vault, not user)
///
/// Security: requester commits before SB oracle value is known; oracle reveals
/// after the commit slot hash is finalized. Neither party can bias the outcome.
use anchor_lang::prelude::*;
use anchor_lang::system_program;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token_interface::{
    transfer_checked, Mint, TokenInterface, TransferChecked,
};
use crate::draw_helpers::*;
use crate::errors::LotteryError;
use crate::oracle::{create_lottery_entropy_from_slot, SB_ON_DEMAND_PROGRAM};
use crate::state::*;

const TREASURY_VAULT_SEED: &[u8] = b"sol_vault";
const DRAW_OPERATION_RENT: u64 = 50_000_000; // 0.05 SOL buffer for ATA creation
/// Small bounty paid by the vault to whoever manually triggers the draw.
/// Covers the tx fee and shows a visible +SOL change in the wallet popup.

/// Minimum and maximum bounds for the caller-supplied settler reward to prevent abuse.
/// The client computes the live $0.50 equivalent in µFPT and passes it to the instruction.
const MIN_SETTLER_REWARD: u64 =   100_000; // 0.1  FPT floor  (protects against rounding edge-cases)
const MAX_SETTLER_REWARD: u64 = 5_000_000; // 5 FPT ceiling  (capped at ~$0.50 max; prevents treasury drain even if FPT < $0.10)

// ── Step 1: Request Draw ─────────────────────────────────────────────────────

#[derive(Accounts)]
#[instruction(lottery_type_id: u8, tier: u8)]
pub struct RequestDrawEntropy<'info> {
    #[account(mut)]
    pub requester: Signer<'info>,

    /// Vault PDA — validated in body via stored bump
    #[account(mut)]
    pub lottery_state: Box<Account<'info, LotteryVault>>,

    /// PendingDraw PDA — created here, closed in fulfill
    #[account(
        init,
        payer = requester,
        space = PendingDraw::LEN,
        seeds = [PendingDraw::SEED_PREFIX, &[lottery_type_id], &[tier]],
        bump,
    )]
    pub pending_draw: Box<Account<'info, PendingDraw>>,

    /// CHECK: Treasury SOL vault — covers the PendingDraw rent so the
    /// requester's wallet shows no net SOL change (treasury is the ops fund).
    #[account(mut, seeds = [TREASURY_VAULT_SEED], bump)]
    pub treasury_vault: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,

    /// CHECK: Switchboard RandomnessAccount — pre-initialized via randomness_init.
    /// Must be owned by the Switchboard On-Demand program.
    /// randomness_commit CPI is called by the API server (route.ts) in a
    /// separate transaction using the Switchboard SDK, so only the account
    /// ownership check is needed here.
    pub randomness_account: UncheckedAccount<'info>,
}

pub fn request_draw_entropy(
    ctx: Context<RequestDrawEntropy>,
    lottery_type_id: u8,
    tier: u8,
    user_commitment: [u8; 32],
    extra_lamports: u64,
) -> Result<()> {
    // ── Permissionless: any wallet may sign request_draw_entropy. ──
    // The server-side crank signs silently in normal operation.
    // Fallback: the user's own wallet signs when the crank is unavailable.
    // On-chain vault-state checks below enforce that only valid draws proceed.

    let vault = &ctx.accounts.lottery_state;
    let (vault_seed, lottery_type): (&[u8], LotteryType) = match lottery_type_id {
        0 => (b"vault_lpm", LotteryType::LPM),
        1 => (b"vault_dpl", LotteryType::DPL),
        2 => (b"vault_wpl", LotteryType::WPL),
        3 => (b"vault_mpl", LotteryType::MPL),
        _ => return Err(LotteryError::InvalidLotteryType.into()),
    };

    require!(lottery_type.is_valid_tier(tier), LotteryError::InvalidTier);

    // Validate vault PDA via stored bump to prevent fake vault attacks
    let vault_bump_val = vault.bump;
    let tier_bytes = [tier];
    let expected_vault = Pubkey::create_program_address(
        &[vault_seed, &tier_bytes, &[vault_bump_val]],
        &crate::ID,
    ).map_err(|_| LotteryError::InvalidLotteryType)?;
    require_keys_eq!(vault.key(), expected_vault, LotteryError::InvalidLotteryType);

    // Ensure vault is not already in drawn state
    require!(vault.state != VaultState::Ready, LotteryError::LotteryAlreadyDrawn);

    if lottery_type_id == 0 {
        require!(vault.participant_count >= 100, LotteryError::ParticipantThresholdNotMet);
    } else {
        let now = Clock::get()?.unix_timestamp;
        require!(vault.end_time > 0, LotteryError::LotteryNotEnded);
        require!(now >= vault.end_time, LotteryError::LotteryNotEnded);
        // Vaults with 0 participants can't draw (keeper should rollover instead)
        require!(vault.participant_count > 0, LotteryError::NoParticipants);
    }

    // Verify randomness_account is owned by the Switchboard On-Demand program.
    // The actual randomness_commit CPI is performed by the API server (route.ts)
    // in a separate transaction using the Switchboard SDK after this instruction
    // confirms. This avoids the oracle-writability and authority-matching issues
    // that would arise from calling CPI directly in Rust.
    require_keys_eq!(
        *ctx.accounts.randomness_account.owner,
        SB_ON_DEMAND_PROGRAM,
        LotteryError::InvalidLotteryType,
    );

    let clock = Clock::get()?;
    let pd = &mut ctx.accounts.pending_draw;
    pd.lottery_type_id = lottery_type_id;
    pd.tier = tier;
    pd.randomness_account = ctx.accounts.randomness_account.key();
    pd.user_commitment = user_commitment;
    pd.requester = ctx.accounts.requester.key();
    pd.requested_at = clock.unix_timestamp;
    pd.bump = ctx.bumps.pending_draw;

    // Record the oracle's current reveal_slot so that at fulfill time we can verify
    // the oracle revealed AFTER this request (prevents reuse of stale SB values).
    // If the account data is too short or uninitialized, default to 0 (safe: any
    // positive reveal_slot will satisfy reveal_slot > 0 at fulfill).
    let request_reveal_slot = {
        let rnd_data = ctx.accounts.randomness_account.data.borrow();
        if rnd_data.len() >= 152 {
            u64::from_le_bytes(
                rnd_data[144..152].try_into().unwrap_or([0u8; 8]),
            )
        } else {
            0
        }
    };
    pd.request_reveal_slot = request_reveal_slot;

    // Treasury covers: pd_rent (PendingDraw init) + extra_lamports (SB account
    // rent + oracle commit fee), so the requester's wallet shows no net SOL
    // change. extra_lamports is computed by the server via TX simulation and
    // capped at 15_000_000 lamports (0.015 SOL) to prevent treasury drain.
    require!(extra_lamports <= 15_000_000, LotteryError::InsufficientVaultFunds);
    let pd_rent = Rent::get()?.minimum_balance(PendingDraw::LEN);
    let total_payout = pd_rent
        .checked_add(extra_lamports)
        .ok_or(LotteryError::ArithmeticOverflow)?;
    require!(
        ctx.accounts.treasury_vault.lamports() >= total_payout,
        LotteryError::InsufficientVaultFunds,
    );
    let tv_bump = ctx.bumps.treasury_vault;
    let tv_seeds: &[&[u8]] = &[TREASURY_VAULT_SEED, &[tv_bump]];
    system_program::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.system_program.to_account_info(),
            system_program::Transfer {
                from: ctx.accounts.treasury_vault.to_account_info(),
                to: ctx.accounts.requester.to_account_info(),
            },
            &[tv_seeds][..],
        ),
        total_payout,
    )?;
    Ok(())
}

// ── Step 2: Fulfill Draw ─────────────────────────────────────────────────────

#[derive(Accounts)]
#[instruction(lottery_type_id: u8, tier: u8)]
pub struct FulfillDrawEntropy<'info> {
    /// Permissionless caller
    #[account(mut)]
    pub authority: Signer<'info>,

    /// CHECK: FPT mint address verified in body
    pub fpt_mint: Box<InterfaceAccount<'info, Mint>>,

    /// Vault PDA — validated in body via stored bump
    #[account(mut)]
    pub lottery_state: Box<Account<'info, LotteryVault>>,

    /// CHECK: Vault's FPT ATA — verified and created from treasury if absent in body
    #[account(mut)]
    pub vault_token_account: UncheckedAccount<'info>,

    /// CHECK: Verified against participant page chain
    pub winner: UncheckedAccount<'info>,

    /// CHECK: Winner's FPT ATA; created from treasury if absent
    #[account(mut)]
    pub winner_ata: UncheckedAccount<'info>,

    /// CHECK: Treasury SOL vault PDA; seeds verified
    #[account(mut, seeds = [TREASURY_VAULT_SEED], bump)]
    pub treasury_vault: UncheckedAccount<'info>,

    #[account(mut, seeds = [Treasury::SEED_PREFIX], bump = treasury.bump)]
    pub treasury: Box<Account<'info, Treasury>>,

    /// CHECK: Treasury's FPT ATA — verified and created from treasury if absent in body
    #[account(mut)]
    pub treasury_fpt_ata: UncheckedAccount<'info>,

    /// CHECK: Caller's FPT ATA — receives ~$1 FPT community trigger reward.
    /// Created by treasury via CPI if absent (idempotent).
    #[account(mut)]
    pub authority_ata: UncheckedAccount<'info>,

    /// CHECK: Participant page 0
    pub participant_page_0: UncheckedAccount<'info>,

    /// CHECK: Page containing the winning slot
    pub winning_participant_page: UncheckedAccount<'info>,

    #[account(mut, seeds = [b"global_registry"], bump)]
    pub config: Box<Account<'info, GlobalRegistry>>,

    /// CHECK: Switchboard RandomnessAccount — validated via `has_one` on pending_draw below.
    /// This prevents a malicious caller from substituting a different randomness account
    /// whose revealed value maps the winning index to their own ticket.
    pub randomness_account: UncheckedAccount<'info>,

    /// WinnerHistory PDA — validated in body
    #[account(mut)]
    pub winner_history: Box<Account<'info, WinnerHistory>>,

    /// PendingDraw PDA — consumed + closed here; rent returned to the vault.
    /// `has_one = randomness_account` enforces that the caller cannot substitute a
    /// different Switchboard account to manipulate the winner index.
    #[account(
        mut,
        seeds = [PendingDraw::SEED_PREFIX, &[lottery_type_id], &[tier]],
        bump = pending_draw.bump,
        close = lottery_state,
        has_one = randomness_account @ LotteryError::InvalidLotteryType,
    )]
    pub pending_draw: Box<Account<'info, PendingDraw>>,

    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn fulfill_draw_entropy(
    ctx: Context<FulfillDrawEntropy>,
    lottery_type_id: u8,
    tier: u8,
    settler_reward_fpt: u64,
) -> Result<()> {
    // Validate settler reward is within the allowed band (set by client from live price)
    require!(
        settler_reward_fpt >= MIN_SETTLER_REWARD && settler_reward_fpt <= MAX_SETTLER_REWARD,
        LotteryError::InvalidLotteryType,
    );
    require_keys_eq!(
        ctx.accounts.fpt_mint.key(),
        pubkey!("3YTnzmFTECtyKDxaghWPQcjzX7g1Cj3NxMq41JdWk2rj"),
        LotteryError::InvalidLotteryType,
    );


    let (vault_seed, lottery_type, duration): (&[u8], LotteryType, i64) = match lottery_type_id {
        0 => (b"vault_lpm", LotteryType::LPM, 0_i64),
        1 => (b"vault_dpl", LotteryType::DPL, 86_400),
        2 => (b"vault_wpl", LotteryType::WPL, 604_800),
        3 => (b"vault_mpl", LotteryType::MPL, 2_592_000),
        _ => return Err(LotteryError::InvalidLotteryType.into()),
    };

    require!(lottery_type.is_valid_tier(tier), LotteryError::InvalidTier);

    let clock = Clock::get()?;
    let now = clock.unix_timestamp;

    let tier_bytes = [tier];
    let vault = &mut ctx.accounts.lottery_state;
    let vault_bump_val = vault.bump;
    let expected_vault = Pubkey::create_program_address(
        &[vault_seed, &tier_bytes, &[vault_bump_val]],
        &crate::ID,
    ).map_err(|_| LotteryError::InvalidLotteryType)?;
    require_keys_eq!(vault.key(), expected_vault, LotteryError::InvalidLotteryType);

    let wh_bump_val = ctx.accounts.winner_history.bump;
    let expected_wh = Pubkey::create_program_address(
        &[WinnerHistory::SEED_PREFIX, &[lottery_type_id], &tier_bytes, &[wh_bump_val]],
        &crate::ID,
    ).map_err(|_| LotteryError::InvalidLotteryType)?;
    require_keys_eq!(ctx.accounts.winner_history.key(), expected_wh, LotteryError::InvalidLotteryType);

    require!(vault.state != VaultState::Ready, LotteryError::LotteryAlreadyDrawn);

    if lottery_type_id == 0 {
        require!(vault.participant_count >= 100, LotteryError::ParticipantThresholdNotMet);
    } else {
        require!(vault.end_time > 0, LotteryError::LotteryNotEnded);
        require!(now >= vault.end_time, LotteryError::LotteryNotEnded);
        if vault.participant_count == 0 {
            vault.end_time = now.checked_add(duration).ok_or(LotteryError::ArithmeticOverflow)?;
            return Ok(());
        }
    }

    vault.state = VaultState::Ready;
    require!(vault.balance > 0, LotteryError::InsufficientBalance);

    // SOL top-up from Treasury Vault if needed for ATA creation
    let vault_lamports = vault.to_account_info().lamports();
    if vault_lamports < DRAW_OPERATION_RENT {
        let needed = DRAW_OPERATION_RENT - vault_lamports;
        require!(
            ctx.accounts.treasury_vault.lamports() >= needed,
            LotteryError::InsufficientVaultFunds,
        );
        let tv_bump = ctx.bumps.treasury_vault;
        let tv_seeds: &[&[u8]] = &[TREASURY_VAULT_SEED, &[tv_bump]];
        system_program::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.system_program.to_account_info(),
                system_program::Transfer {
                    from: ctx.accounts.treasury_vault.to_account_info(),
                    to: vault.to_account_info(),
                },
                &[tv_seeds][..],
            ),
            needed,
        )?;
    }

    // ── Ensure vault & treasury ATAs exist (treasury pays, not the user) ──
    {
        let tv_bump = ctx.bumps.treasury_vault;
        let tv_seeds: &[&[u8]] = &[b"sol_vault", &[tv_bump]];
        verify_and_create_winner_ata(
            &vault.key(),
            &ctx.accounts.vault_token_account.to_account_info(),
            &vault.to_account_info(),
            &ctx.accounts.fpt_mint.to_account_info(),
            &ctx.accounts.token_program.to_account_info(),
            ctx.accounts.treasury_vault.to_account_info(),
            &[tv_seeds],
            &ctx.accounts.system_program.to_account_info(),
            &ctx.accounts.associated_token_program.to_account_info(),
        )?;
        verify_and_create_winner_ata(
            &ctx.accounts.treasury_vault.key(),
            &ctx.accounts.treasury_fpt_ata.to_account_info(),
            &ctx.accounts.treasury_vault.to_account_info(),
            &ctx.accounts.fpt_mint.to_account_info(),
            &ctx.accounts.token_program.to_account_info(),
            ctx.accounts.treasury_vault.to_account_info(),
            &[tv_seeds],
            &ctx.accounts.system_program.to_account_info(),
            &ctx.accounts.associated_token_program.to_account_info(),
        )?;
    }

    // Switchboard V3 VRF: verify oracle has revealed, then read the 32-byte random value.
    // RandomnessAccountData layout: reveal_slot @144 (u64 LE), value[32] @152
    let mixed = {
        let rnd_data = ctx.accounts.randomness_account.data.borrow();
        require!(rnd_data.len() >= 184, LotteryError::EntropyNotAvailable);
        let reveal_slot = u64::from_le_bytes(rnd_data[144..152].try_into().unwrap());
        require!(reveal_slot > 0, LotteryError::DrawNotYetReady); // SRS oracle hasn't revealed yet
        // Verify the oracle revealed AFTER this draw was requested — prevents an attacker
        // from passing an old SB account whose value is already public and crafting a
        // user_commitment that maps to their own ticket index.
        require!(
            reveal_slot > ctx.accounts.pending_draw.request_reveal_slot,
            LotteryError::DrawNotYetReady,
        );
        let sb_value: [u8; 32] = rnd_data[152..184].try_into().unwrap();
        let commitment = ctx.accounts.pending_draw.user_commitment;
        create_lottery_entropy_from_slot(
            &sb_value,
            &commitment,
            lottery_type_id,
            tier,
            vault.round_number,
        )
    };

    let participant_count = vault.participant_count;
    let random_index = (mixed % participant_count as u64) as u32;

    let winner_pubkey = find_winner_in_chain(
        &ctx.accounts.participant_page_0.to_account_info(),
        Some(&ctx.accounts.winning_participant_page.to_account_info()),
        random_index,
        lottery_type_id,
        vault.tier,
    )?;

    require_keys_eq!(ctx.accounts.winner.key(), winner_pubkey, LotteryError::InvalidWinner);

    let tv_bump = ctx.bumps.treasury_vault;
    let tv_seeds: &[&[u8]] = &[b"sol_vault", &[tv_bump]];
    verify_and_create_winner_ata(
        &winner_pubkey,
        &ctx.accounts.winner_ata.to_account_info(),
        &ctx.accounts.winner.to_account_info(),
        &ctx.accounts.fpt_mint.to_account_info(),
        &ctx.accounts.token_program.to_account_info(),
        ctx.accounts.treasury_vault.to_account_info(),
        &[tv_seeds],
        &ctx.accounts.system_program.to_account_info(),
        &ctx.accounts.associated_token_program.to_account_info(),
    )?;

    let total_balance = vault.balance;
    let winner_prize = total_balance
        .checked_mul(95).ok_or(LotteryError::ArithmeticOverflow)?
        .checked_div(100).ok_or(LotteryError::ArithmeticOverflow)?;
    let admin_fee = total_balance.checked_sub(winner_prize).ok_or(LotteryError::ArithmeticOverflow)?;

    let vault_bump = vault.bump;
    let signer_seeds: &[&[u8]] = &[vault_seed, &tier_bytes, &[vault_bump]];
    let vault_signer: &[&[&[u8]]] = &[signer_seeds];

    // Transfer prize to winner
    transfer_checked(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            TransferChecked {
                from: ctx.accounts.vault_token_account.to_account_info(),
                mint: ctx.accounts.fpt_mint.to_account_info(),
                to: ctx.accounts.winner_ata.to_account_info(),
                authority: ctx.accounts.lottery_state.to_account_info(),
            },
            vault_signer,
        ),
        winner_prize,
        6,
    )?;

    // Transfer 5% fee to treasury
    transfer_checked(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            TransferChecked {
                from: ctx.accounts.vault_token_account.to_account_info(),
                mint: ctx.accounts.fpt_mint.to_account_info(),
                to: ctx.accounts.treasury_fpt_ata.to_account_info(),
                authority: ctx.accounts.lottery_state.to_account_info(),
            },
            vault_signer,
        ),
        admin_fee,
        6,
    )?;

    // ── Community trigger reward: ~$1 FPT from treasury ─────────────────────────
    // Read treasury FPT balance manually (treasury_fpt_ata is UncheckedAccount)
    let treasury_fpt_amount = {
        let data = ctx.accounts.treasury_fpt_ata.try_borrow_data()
            .map_err(|_| error!(LotteryError::InvalidLotteryType))?;
        if data.len() >= 72 {
            u64::from_le_bytes(data[64..72].try_into().unwrap())
        } else {
            0
        }
    };
    if treasury_fpt_amount >= settler_reward_fpt {
        let tv_b = ctx.bumps.treasury_vault;
        let tv_s: &[&[u8]] = &[b"sol_vault", &[tv_b]];
        verify_and_create_winner_ata(
            &ctx.accounts.authority.key(),
            &ctx.accounts.authority_ata.to_account_info(),
            &ctx.accounts.authority.to_account_info(),
            &ctx.accounts.fpt_mint.to_account_info(),
            &ctx.accounts.token_program.to_account_info(),
            ctx.accounts.treasury_vault.to_account_info(),
            &[tv_s],
            &ctx.accounts.system_program.to_account_info(),
            &ctx.accounts.associated_token_program.to_account_info(),
        )?;
        transfer_checked(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                TransferChecked {
                    from: ctx.accounts.treasury_fpt_ata.to_account_info(),
                    mint: ctx.accounts.fpt_mint.to_account_info(),
                    to: ctx.accounts.authority_ata.to_account_info(),
                    authority: ctx.accounts.treasury_vault.to_account_info(),
                },
                &[tv_s][..],
            ),
            settler_reward_fpt,
            6,
        )?;
    }

    // State reset, round counter update, winner history — shared helper
    finalize_draw(
        &mut ctx.accounts.lottery_state,
        &mut ctx.accounts.config,
        &mut ctx.accounts.winner_history,
        winner_pubkey,
        winner_prize,
        lottery_type_id,
        lottery_type,
        tier,
        duration,
        now,
    )?;

    Ok(())
}

