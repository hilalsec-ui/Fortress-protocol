#![allow(unexpected_cfgs)]

use anchor_lang::prelude::*;

pub mod errors;
pub mod instructions;
pub mod state;
pub mod oracle;
pub mod draw_helpers;

use instructions::*;

declare_id!("2JHDbUz11kLe7q44nneougHcJCQqD6t26XeEFFNQJpHY");

#[program]
pub mod fortress_protocol {
    use super::*;

    // ==================== ONE-TIME INITIALIZATION ====================

    pub fn initialize_global_registry(ctx: Context<InitializeGlobalRegistry>) -> Result<()> {
        instructions::initialize::initialize_global_registry(ctx)
    }


    pub fn initialize_treasury(ctx: Context<InitializeTreasury>) -> Result<()> {
        instructions::initialize::initialize_treasury(ctx)
    }

    pub fn initialize_vault(ctx: Context<InitializeVault>, lottery_type_id: u8, tier: u8) -> Result<()> {
        instructions::initialize::initialize_vault(ctx, lottery_type_id, tier)
    }

    // ==================== TREASURY VAULT ====================

    pub fn top_up_treasury_vault(ctx: Context<TopUpTreasuryVault>, amount: u64) -> Result<()> {
        instructions::initialize::top_up_treasury_vault(ctx, amount)
    }

    pub fn unified_withdraw_from_treasury_vault(
        ctx: Context<UnifiedWithdrawFromTreasuryVault>,
        asset: instructions::admin::WithdrawAsset,
        amount: u64,
    ) -> Result<()> {
        instructions::admin::unified_withdraw_from_treasury_vault(ctx, asset, amount)
    }

    /// Permissionless — anyone may call this to refill the oracle crank wallet from
    /// the treasury vault.  Used in the manual-draw fallback: the user's single
    /// wallet TX includes this instruction so the server-side crank can pay
    /// Switchboard oracle fees without requiring additional user signatures.
    pub fn fund_oracle_crank(ctx: Context<FundOracleCrank>, lamports: u64) -> Result<()> {
        instructions::admin::fund_oracle_crank(ctx, lamports)
    }

    // ==================== BUY TICKETS ====================

    pub fn buy_lpm_ticket(ctx: Context<BuyLpmTicket>, tier: u8, quantity: u32, fpt_per_ticket: u64, max_fpt_amount: u64, page_number: u32) -> Result<()> {
        instructions::buy_ticket::buy_lpm_ticket(ctx, tier, quantity, fpt_per_ticket, max_fpt_amount, page_number)
    }

    pub fn buy_dpl_ticket(ctx: Context<BuyTimedTicket>, lottery_type_id: u8, tier: u8, quantity: u32, fpt_per_ticket: u64, max_fpt_amount: u64, page_number: u32) -> Result<()> {
        instructions::buy_ticket::buy_dpl_ticket(ctx, lottery_type_id, tier, quantity, fpt_per_ticket, max_fpt_amount, page_number)
    }

    pub fn buy_wpl_ticket(ctx: Context<BuyTimedTicket>, lottery_type_id: u8, tier: u8, quantity: u32, fpt_per_ticket: u64, max_fpt_amount: u64, page_number: u32) -> Result<()> {
        instructions::buy_ticket::buy_wpl_ticket(ctx, lottery_type_id, tier, quantity, fpt_per_ticket, max_fpt_amount, page_number)
    }

    pub fn buy_mpl_ticket(ctx: Context<BuyTimedTicket>, lottery_type_id: u8, tier: u8, quantity: u32, fpt_per_ticket: u64, max_fpt_amount: u64, page_number: u32) -> Result<()> {
        instructions::buy_ticket::buy_mpl_ticket(ctx, lottery_type_id, tier, quantity, fpt_per_ticket, max_fpt_amount, page_number)
    }

    // ==================== VRF RANDOMNESS DRAW (Switchboard V3) ====================

    pub fn request_draw_entropy(
        ctx: Context<RequestDrawEntropy>,
        lottery_type_id: u8,
        tier: u8,
        user_commitment: [u8; 32],
        extra_lamports: u64,
    ) -> Result<()> {
        instructions::entropy::request_draw_entropy(ctx, lottery_type_id, tier, user_commitment, extra_lamports)
    }

    pub fn fulfill_draw_entropy(
        ctx: Context<FulfillDrawEntropy>,
        lottery_type_id: u8,
        tier: u8,
        settler_reward_fpt: u64,
    ) -> Result<()> {
        instructions::entropy::fulfill_draw_entropy(ctx, lottery_type_id, tier, settler_reward_fpt)
    }

    // ==================== PERMISSIONLESS ROLLOVER ====================

    pub fn rollover_dpl_tier(ctx: Context<RolloverTier>, tier: u8) -> Result<()> {
        instructions::rollover::rollover_dpl_tier(ctx, tier)
    }

    pub fn rollover_wpl_tier(ctx: Context<RolloverTier>, tier: u8) -> Result<()> {
        instructions::rollover::rollover_wpl_tier(ctx, tier)
    }

    pub fn rollover_mpl_tier(ctx: Context<RolloverTier>, tier: u8) -> Result<()> {
        instructions::rollover::rollover_mpl_tier(ctx, tier)
    }

    // ==================== COMMUNITY ====================

    pub fn lazy_reset_vault(
        ctx: Context<LazyResetVault>,
        lottery_type: u8,
        tier: u8,
    ) -> Result<()> {
        instructions::lazy_reset::lazy_reset_vault(ctx, lottery_type, tier)
    }
}

