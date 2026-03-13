use anchor_lang::prelude::*;
use anchor_spl::associated_token::get_associated_token_address_with_program_id;
use crate::errors::*;
use crate::state::*;

/// Verify and create winner's ATA if needed (idempotent)
///
/// # Arguments
/// * `winner_pubkey` - Winner's wallet address
/// * `winner_ata_account` - Winner's ATA account info
/// * `fpt_mint` - FPT token mint
/// * `token_program` - Token program
/// * `authority` - Fee payer for ATA creation
/// * `system_program` - System program
/// * `associated_token_program` - Associated Token program
///
/// # Returns
/// * `Pubkey` - Expected winner ATA address
/// Create or verify a token ATA, with the treasury vault PDA paying rent.
/// Treasury is the payer — users and draw-callers pay zero SOL for ATA creation.
#[inline(never)]
pub fn verify_and_create_winner_ata<'info>(
    winner_pubkey: &Pubkey,
    winner_ata_account: &AccountInfo<'info>,
    winner_account: &AccountInfo<'info>,
    fpt_mint: &AccountInfo<'info>,
    token_program: &AccountInfo<'info>,
    treasury_vault: AccountInfo<'info>,
    signer_seeds: &[&[&[u8]]],
    system_program: &AccountInfo<'info>,
    associated_token_program: &AccountInfo<'info>,
) -> Result<Pubkey> {
    // Calculate deterministic ATA address
    let expected_winner_ata = get_associated_token_address_with_program_id(
        winner_pubkey,
        &fpt_mint.key(),
        &token_program.key(),
    );

    // Verify the passed account matches expected ATA
    require_keys_eq!(
        winner_ata_account.key(),
        expected_winner_ata,
        LotteryError::InvalidWinnerATA
    );

    // Create ATA if it doesn't exist — treasury pays, not the user
    if winner_ata_account.data_is_empty() {
        msg!("[ATA] Creating ATA: {}", expected_winner_ata);

        anchor_spl::associated_token::create(CpiContext::new_with_signer(
            associated_token_program.clone(),
            anchor_spl::associated_token::Create {
                payer: treasury_vault,
                associated_token: winner_ata_account.clone(),
                authority: winner_account.clone(),
                mint: fpt_mint.clone(),
                system_program: system_program.clone(),
                token_program: token_program.clone(),
            },
            signer_seeds,
        ))?;

        msg!("[ATA] ATA created successfully");
    } else {
        msg!("[ATA] ATA already exists");
    }

    Ok(expected_winner_ata)
}

/// Reset vault state after successful draw
///
/// For time-based lotteries (DPL/WPL/MPL), adds duration to end_time.
/// For participation-based lotteries (LPM), end_time remains 0.
///
/// # Arguments
/// * `vault` - LotteryVault account
/// * `winner_pubkey` - Winner's public key
/// * `winner_prize` - Amount won
/// * `duration_seconds` - Duration to add (0 for LPM)
pub fn reset_vault_after_draw(
    vault: &mut LotteryVault,
    winner_pubkey: Pubkey,
    winner_prize: u64,
    duration_seconds: i64,
) -> Result<()> {
    vault.last_winner = Some(winner_pubkey);
    vault.last_prize = winner_prize;
    vault.balance = 0;
    vault.participant_count = 0;
    vault.is_drawn = false;
    vault.current_page = 0;
    vault.state = VaultState::Active;
    vault.round_number = vault.round_number.checked_add(1).ok_or(LotteryError::ArithmeticOverflow)?;

    // Update end_time for time-based lotteries
    if duration_seconds > 0 {
        let current_time = Clock::get()?.unix_timestamp;
        vault.end_time = current_time.checked_add(duration_seconds).ok_or(LotteryError::ArithmeticOverflow)?;
        msg!(
            "[RESET] Vault reset - Round {}, next draw at {}",
            vault.round_number,
            vault.end_time
        );
    } else {
        msg!("[RESET] Vault reset - Round {}", vault.round_number);
    }

    Ok(())
}

/// Duration constants for time-based lotteries
pub const DPL_DURATION: i64 = 86_400; // 1 day
pub const WPL_DURATION: i64 = 604_800; // 7 days
pub const MPL_DURATION: i64 = 2_592_000; // 30 days

/// Read participant pubkeys from raw ParticipantPage account data.
///
/// Validates Anchor discriminator, program ownership (caller responsibility),
/// and the lottery_type + tier fields before reading participants.
/// Offset layout (after 8-byte discriminator):
/// - lottery_type: u8 (1 byte)  @ offset 8
/// - tier: u8 (1 byte)          @ offset 9
/// - page_number: u32 (4 bytes) @ offset 10
/// - participants vec length: u32 (4 bytes) @ offset 14
/// - participants: [Pubkey; len] @ offset 18
pub fn read_participants_raw(
    account_data: &[u8],
    expected_lottery_type: u8,
    expected_tier: u8,
) -> Result<Vec<Pubkey>> {
    if account_data.len() < 18 {
        return Err(error!(LotteryError::ParticipantNotFound));
    }
    // Validate lottery_type and tier bytes match the calling vault
    let page_lottery_type = account_data[8];
    let page_tier = account_data[9];
    require!(
        page_lottery_type == expected_lottery_type && page_tier == expected_tier,
        LotteryError::InvalidParticipantPage,
    );
    let vec_len_bytes = &account_data[14..18];
    let vec_len = u32::from_le_bytes([
        vec_len_bytes[0], vec_len_bytes[1], vec_len_bytes[2], vec_len_bytes[3],
    ]) as usize;
    let mut participants = Vec::with_capacity(vec_len);
    let mut offset = 18;
    for _ in 0..vec_len {
        if offset + 32 > account_data.len() {
            break;
        }
        let pubkey_bytes: [u8; 32] = account_data[offset..offset + 32]
            .try_into()
            .map_err(|_| error!(LotteryError::ParticipantNotFound))?;
        participants.push(Pubkey::new_from_array(pubkey_bytes));
        offset += 32;
    }
    Ok(participants)
}

/// Traverse ParticipantPage chain and return winner's Pubkey.
/// Both pages must already be validated (program-owned, correct discriminator,
/// correct lottery_type and tier) by the caller via Anchor typed accounts.
#[inline(never)]
pub fn find_winner_in_chain<'a>(
    first_page_info: &AccountInfo<'a>,
    winning_page_info: Option<&AccountInfo<'a>>,
    random_index: u32,
    vault_lottery_type: u8,
    vault_tier: u8,
) -> Result<Pubkey> {
    const PAGE_SIZE: u32 = 50;
    let first_page_data = first_page_info.data.borrow();
    // Verify program ownership — only accounts owned by this program can be participant pages
    require!(
        first_page_info.owner == &crate::ID,
        LotteryError::InvalidParticipantPage,
    );
    let first_page_participants = read_participants_raw(&first_page_data, vault_lottery_type, vault_tier)?;
    drop(first_page_data);
    let page_0_size = first_page_participants.len() as u32;
    let expected_page_number = random_index / PAGE_SIZE;
    if expected_page_number == 0 {
        let offset = (random_index % page_0_size.max(1)) as usize;
        return first_page_participants
            .get(offset)
            .copied()
            .ok_or(error!(LotteryError::ParticipantNotFound));
    }
    let winning_page_info = winning_page_info.ok_or(error!(LotteryError::ParticipantNotFound))?;
    // Verify program ownership of the winning page too
    require!(
        winning_page_info.owner == &crate::ID,
        LotteryError::InvalidParticipantPage,
    );
    let winning_page_data = winning_page_info.data.borrow();
    let winning_page_participants = read_participants_raw(&winning_page_data, vault_lottery_type, vault_tier)?;
    drop(winning_page_data);
    let offset = (random_index % PAGE_SIZE) as usize;
    winning_page_participants
        .get(offset)
        .copied()
        .ok_or(error!(LotteryError::ParticipantNotFound))
}

/// Shared post-draw state update: vault reset, registry round increment, winner history.
/// Eliminates duplicate logic between clock-draw (execute_draw) and VRF-draw (entropy).
#[inline(never)]
pub fn finalize_draw(
    vault: &mut LotteryVault,
    config: &mut GlobalRegistry,
    winner_history: &mut WinnerHistory,
    winner_pubkey: Pubkey,
    winner_prize: u64,
    lottery_type_id: u8,
    lottery_type: LotteryType,
    tier: u8,
    duration: i64,
    now: i64,
) -> Result<()> {
    reset_vault_after_draw(vault, winner_pubkey, winner_prize, duration)?;

    config.total_prizes_distributed = config.total_prizes_distributed
        .checked_add(winner_prize)
        .ok_or(LotteryError::ArithmeticOverflow)?;

    let tier_index = GlobalRegistry::get_tier_index(lottery_type, tier)?;
    let new_round = match lottery_type_id {
        0 => { config.lpm_rounds[tier_index] = config.lpm_rounds[tier_index].checked_add(1).ok_or(LotteryError::ArithmeticOverflow)?; config.lpm_rounds[tier_index] }
        1 => { config.dpl_rounds[tier_index] = config.dpl_rounds[tier_index].checked_add(1).ok_or(LotteryError::ArithmeticOverflow)?; config.dpl_rounds[tier_index] }
        2 => { config.wpl_rounds[tier_index] = config.wpl_rounds[tier_index].checked_add(1).ok_or(LotteryError::ArithmeticOverflow)?; config.wpl_rounds[tier_index] }
        _ => { config.mpl_rounds[tier_index] = config.mpl_rounds[tier_index].checked_add(1).ok_or(LotteryError::ArithmeticOverflow)?; config.mpl_rounds[tier_index] }
    };
    vault.round_number = new_round;

    winner_history.lottery_type_index = lottery_type_id;
    winner_history.tier = tier;
    winner_history.push_record(WinnerRecord {
        winner: winner_pubkey,
        round: new_round.saturating_sub(1),
        prize: winner_prize,
        timestamp: now,
    });
    Ok(())
}

