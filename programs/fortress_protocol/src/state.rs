use anchor_lang::prelude::*;

pub mod global_registry;
pub mod lottery_vault;
pub mod participant_page;
pub mod treasury;
pub mod winner_history;
pub mod pending_draw;

pub use global_registry::*;
pub use lottery_vault::*;
pub use participant_page::*;
pub use treasury::*;
pub use winner_history::*;
pub use pending_draw::*;

// Lottery Types
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Default)]
pub enum LotteryType {
    #[default]
    LPM, // Lightning Pool Monthly
    DPL, // Daily Pool
    WPL, // Weekly Pool
    MPL, // Monthly Pool
}

impl LotteryType {
    pub fn get_valid_tiers(&self) -> Vec<u8> {
        match self {
            LotteryType::LPM => vec![5, 10, 20, 50],
            _ => vec![5, 10, 15, 20],
        }
    }

    pub fn is_valid_tier(&self, tier: u8) -> bool {
        self.get_valid_tiers().contains(&tier)
    }
}
