use anchor_lang::prelude::*;

#[account]
#[derive(Default)]
pub struct GlobalRegistry {
    pub authority: Pubkey,
    pub total_lotteries: u8,
    pub total_participants: u64,
    pub total_prizes_distributed: u64,
    pub lpm_rounds: [u32; 4],  // tiers: 5, 10, 20, 50
    pub dpl_rounds: [u32; 4],  // tiers: 5, 10, 15, 20
    pub wpl_rounds: [u32; 4],  // tiers: 5, 10, 15, 20
    pub mpl_rounds: [u32; 4],  // tiers: 5, 10, 15, 20
    pub bump: u8,
}

impl GlobalRegistry {
    pub const LEN: usize = 8 + // discriminator
        32 + // authority
        1 +  // total_lotteries
        8 +  // total_participants
        8 +  // total_prizes_distributed
        16 + // lpm_rounds [u32; 4]
        16 + // dpl_rounds [u32; 4]
        16 + // wpl_rounds [u32; 4]
        16 + // mpl_rounds [u32; 4]
        1;   // bump
    
    /// Get the tier index for round tracking arrays
    /// LPM: [5, 10, 20, 50] -> [0, 1, 2, 3]
    /// Others: [5, 10, 15, 20] -> [0, 1, 2, 3]
    pub fn get_tier_index(lottery_type: super::LotteryType, tier: u8) -> Result<usize> {
        let index = match lottery_type {
            super::LotteryType::LPM => match tier {
                5 => 0,
                10 => 1,
                20 => 2,
                50 => 3,
                _ => return Err(error!(crate::errors::LotteryError::InvalidTier)),
            },
            _ => match tier {
                5 => 0,
                10 => 1,
                15 => 2,
                20 => 3,
                _ => return Err(error!(crate::errors::LotteryError::InvalidTier)),
            },
        };
        Ok(index)
    }
}
