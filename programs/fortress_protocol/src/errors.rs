use anchor_lang::prelude::*;

#[error_code]
pub enum LotteryError {
    LotteryNotEnded,
    InvalidWinnerATA,
    InvalidWinner,
    PageFull,
    UnauthorizedDraw,
    InvalidTier,
    InsufficientBalance,
    ParticipantThresholdNotMet,
    InvalidLotteryType,
    LotteryAlreadyDrawn,
    ArithmeticOverflow,
    ParticipantNotFound,
    InvalidParticipantPage,
    InsufficientVaultFunds,
    LpmCapacityExceeded,
    NoParticipants,
    InvalidQuantity,
    LotteryEnded,
    SlippageExceeded,
    InvalidAmount,
    DrawNotYetReady,
    InsufficientFptBalance,
    TierNotStuck,
    InvalidOperation,
    EntropyNotAvailable,
    /// Switchboard oracle quote is stale, missing, or lacks enough samples.
    StalePriceFeed,
    /// Oracle quote data could not be parsed (format mismatch).
    InvalidPriceFeed,
}
