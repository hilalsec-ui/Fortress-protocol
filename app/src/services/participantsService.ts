"use client";

import { PublicKey } from '@solana/web3.js';

// Supported lottery types
const lotteryTypes = ['LPM', 'DPL', 'WPL', 'MPL'];

export interface ParticipantData {
  wallet: string;
  lotteryType: string;
  tier: number;
  timestamp: number;
  txSignature: string;
}

export interface WinnerData {
  wallet: string;
  lotteryType: string;
  tier: number;
  prize: number;
  roundNumber: number;
  timestamp: number;
  txSignature: string;
}

/**
 * Save participant data to localStorage
 * @param quantity - Number of tickets purchased (defaults to 1 for backwards compatibility)
 */
export function saveParticipant(
  lotteryType: string,
  tier: number,
  wallet: PublicKey,
  txSignature: string,
  quantity: number = 1
) {
  try {
    const storageKey = `${lotteryType}-tier-${tier}-participants`;
    const participants = JSON.parse(localStorage.getItem(storageKey) || '[]');
    
    // Save each ticket as a separate entry for accurate tracking
    for (let i = 0; i < quantity; i++) {
      participants.push({
        wallet: wallet.toString(),
        lotteryType,
        tier,
        timestamp: Date.now() + i, // Add offset to ensure unique timestamps
        txSignature,
        ticketNumber: i + 1,
        totalInBatch: quantity
      });
    }
    
    localStorage.setItem(storageKey, JSON.stringify(participants));
  } catch (error) {
    console.error('Failed to save participant:', error);
  }
}

/**
 * Get all participants for a specific lottery and tier
 */
export function getParticipants(lotteryType: string, tier: number): ParticipantData[] {
  try {
    const storageKey = `${lotteryType}-tier-${tier}-participants`;
    return JSON.parse(localStorage.getItem(storageKey) || '[]');
  } catch (error) {
    console.error('Failed to get participants:', error);
    return [];
  }
}

/**
 * Get all participants across all lotteries and tiers
 */
export function getAllParticipants(): ParticipantData[] {
  try {
    const allParticipants: ParticipantData[] = [];
    
    lotteryTypes.forEach(lotteryType => {
      const tiers = lotteryType === 'LPM' ? [5, 10, 20, 50] : [5, 10, 15, 20];
      tiers.forEach(tier => {
        const participants = getParticipants(lotteryType, tier);
        allParticipants.push(...participants);
      });
    });
    
    return allParticipants.sort((a, b) => b.timestamp - a.timestamp);
  } catch (error) {
    console.error('Failed to get all participants:', error);
    return [];
  }
}

/**
 * Save winner to history (keeps last 100 winners)
 */
export function saveWinnerToHistory(winnerData: WinnerData) {
  try {
    const storageKey = 'lottery-winner-history';
    const history: WinnerData[] = JSON.parse(localStorage.getItem(storageKey) || '[]');
    
    // Add new winner to the beginning
    history.unshift(winnerData);
    
    // Keep only last 100 winners
    const trimmedHistory = history.slice(0, 100);
    
    localStorage.setItem(storageKey, JSON.stringify(trimmedHistory));
  } catch (error) {
    console.error('Failed to save winner to history:', error);
  }
}

/**
 * Get winner history (last N winners, default 10)
 */
export function getWinnerHistory(limit: number = 10): WinnerData[] {
  try {
    const storageKey = 'lottery-winner-history';
    const history: WinnerData[] = JSON.parse(localStorage.getItem(storageKey) || '[]');
    return history.slice(0, limit);
  } catch (error) {
    console.error('Failed to get winner history:', error);
    return [];
  }
}

/**
 * Get all winners across all lotteries and tiers
 * Returns winners from history (accumulated over time)
 */
export function getAllWinners(): WinnerData[] {
  try {
    // First try to get from unified history
    const history = getWinnerHistory(100);
    if (history.length > 0) {
      return history;
    }
    
    // Fallback to legacy per-tier storage
    const allWinners: WinnerData[] = [];
    
    lotteryTypes.forEach(lotteryType => {
      const tiers = lotteryType === 'LPM' ? [5, 10, 20, 50] : [5, 10, 15, 20];
      tiers.forEach(tier => {
        const storageKey = `${lotteryType}-tier-${tier}-winner`;
        const winnerData = localStorage.getItem(storageKey);
        if (winnerData) {
          try {
            const winner = JSON.parse(winnerData);
            allWinners.push(winner);
          } catch (e) {
            console.error(`Failed to parse winner data for ${lotteryType}-${tier}:`, e);
          }
        }
      });
    });
    
    return allWinners.sort((a, b) => b.timestamp - a.timestamp);
  } catch (error) {
    console.error('Failed to get all winners:', error);
    return [];
  }
}

/**
 * Get participant count for a specific lottery and tier
 */
export function getParticipantCount(lotteryType: string, tier: number): number {
  return getParticipants(lotteryType, tier).length;
}

/**
 * Get total participants across all tiers for a lottery
 */
export function getTotalParticipants(lotteryType: string): number {
  const tiers = lotteryType === 'LPM' ? [5, 10, 20, 50] : [5, 10, 15, 20];
  return tiers.reduce((total, tier) => total + getParticipantCount(lotteryType, tier), 0);
}

/**
 * Get paginated participants for a specific lottery and tier
 */
export function getPaginatedParticipants(
  lotteryType: string,
  tier: number,
  pageNumber: number = 0
): ParticipantData[] {
  try {
    const storageKey = `${lotteryType}-tier-${tier}-participants`;
    const allParticipants = JSON.parse(localStorage.getItem(storageKey) || '[]');
    const pageSize = 50;
    const startIndex = pageNumber * pageSize;
    const endIndex = startIndex + pageSize;
    return allParticipants.slice(startIndex, endIndex);
  } catch (error) {
    console.error('Failed to get paginated participants:', error);
    return [];
  }
}

/**
 * Calculate total pages for a tier
 */
export function calculateTotalPages(participantCount: number, pageSize: number = 50): number {
  return Math.ceil(participantCount / pageSize);
}
