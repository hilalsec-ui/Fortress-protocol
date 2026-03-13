/**
 * Celebration Cache Utilities
 * Prevents duplicate celebration popups when user switches wallets or refreshes
 */

/**
 * Check if user has already seen celebration for this vault
 */
export const hasSeenThisCelebration = (vaultAddress: string, walletAddress: string): boolean => {
  if (typeof window === 'undefined') return true;
  const key = `hasSeenCelebration_${vaultAddress}_${walletAddress}`;
  return localStorage.getItem(key) === 'true';
};

/**
 * Mark celebration as seen for this vault + wallet combination
 */
export const markCelebrationAsSeen = (vaultAddress: string, walletAddress: string): void => {
  if (typeof window === 'undefined') return;
  const key = `hasSeenCelebration_${vaultAddress}_${walletAddress}`;
  localStorage.setItem(key, 'true');
};
