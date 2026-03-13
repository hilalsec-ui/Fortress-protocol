use anchor_lang::prelude::*;

/// Treasury PDA - Automated fund manager for the lottery system
/// 
/// This account holds SOL used to:
/// 1. Pay for vault initialization rent
/// 2. Pay Pyth oracle fees
/// 3. Cover ATA creation costs during winner draws
/// 4. Pay priority tips to validators (0.05 SOL per draw)
/// 
/// Seeds: [b"treasury"]
#[account]
pub struct Treasury {
    /// The admin authority (EzrUKQPTj7iEAvaJj9rnv4HKUhRGjj4bDLRsAEQfyaYg)
    pub authority: Pubkey,
    
    /// Total SOL deposited to this treasury
    pub total_deposited: u64,
    
    /// Total SOL withdrawn from this treasury
    pub total_withdrawn: u64,
    
    /// Total SOL spent on vault initializations
    pub total_init_fees: u64,
    
    /// Total SOL spent on Pyth oracle fees
    pub total_oracle_fees: u64,
    
    /// Total SOL spent on validator priority tips
    pub total_priority_tips: u64,
    
    /// NEW: Total SOL paid to keepers as bounties (0.005 SOL per draw)
    pub total_bounties_paid: u64,
    
    /// NEW: Bounty reserve fund (allocated but not spent yet)
    pub bounty_reserve: u64,
    
    /// NEW: Last time a low treasury warning was emitted
    pub last_warning_timestamp: i64,
    
    /// PDA bump seed
    pub bump: u8,
}

impl Treasury {
    /// Treasury PDA seed prefix
    pub const SEED_PREFIX: &'static [u8] = b"treasury";
    
    /// Account size: 8 (discriminator) + 32 (authority) + 8*7 (u64 fields) + 1 (i64) + 1 (bump)
    pub const LEN: usize = 8 + 32 + 56 + 8 + 1;
    
}

/// Raw PDA holding SOL for operations. Seeds: [b"sol_vault"]
pub struct TreasuryVault;

impl TreasuryVault {
    pub const SEED_PREFIX: &'static [u8] = b"sol_vault";
}
