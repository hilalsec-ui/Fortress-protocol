use anchor_lang::prelude::*;

#[account]
pub struct ParticipantPage {
    pub lottery_type: u8, // 0=LPM, 1=DPL, 2=WPL, 3=MPL
    pub tier: u8,
    pub page_number: u32,
    pub participants: Vec<Pubkey>,
    pub next_page: Option<Pubkey>,
    pub winner_pubkey: Option<Pubkey>, // Set when page is archived after draw (audit trail)
    pub bump: u8,
}

impl ParticipantPage {
    // 8 (discriminator) + 1 (lottery_type) + 1 (tier) + 4 (page_number) 
    // + 4 (vec length) + (32 * 50) (participants) + 33 (next_page) + 33 (winner_pubkey) + 1 (bump)
    pub const LEN: usize = 8 + 1 + 1 + 4 + 4 + (32 * 50) + 33 + 33 + 1;
    pub const MAX_PARTICIPANTS: usize = 50;
}
