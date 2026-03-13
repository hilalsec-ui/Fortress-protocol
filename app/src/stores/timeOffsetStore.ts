"use client";

import { create } from "zustand";

/**
 * Time Offset Store
 * 
 * Manages the synchronization offset between the local system clock and Solana network time.
 * This offset ensures that all countdown timers are locked to the on-chain blockchain time,
 * regardless of local computer state or downtime.
 * 
 * Formula:
 *   timeOffset = solanaNetworkTime - (Date.now() / 1000)
 * 
 * When synced:
 *   const remaining = expiry_timestamp - (Date.now() / 1000 + timeOffset)
 * 
 * This ensures that if a user closes their laptop and opens it 5 hours later,
 * the timer immediately displays the correct remaining time.
 */

interface TimeOffsetStore {
  // State
  timeOffset: number; // seconds, can be positive or negative
  lastSyncTime: number; // Unix timestamp in milliseconds when offset was last updated
  isSyncing: boolean; // True while actively fetching blockchain time
  syncError: string | null; // Error message from last sync attempt, null if successful
  /**
   * Current Solana-locked time in whole seconds. Driven by the single global
   * 1-second ticker in ChainDataContext. Every countdown in the app reads this
   * one value — all timers tick in perfect unison with zero drift between them.
   * SSR-safe initial value is 0; real value is set on the first tickNow() call.
   */
  nowSeconds: number;

  // Actions
  setTimeOffset: (offset: number) => void;
  setSyncing: (syncing: boolean) => void;
  setSyncError: (error: string | null) => void;
  /**
   * Advance nowSeconds by one second. Called only from the single global ticker
   * in ChainDataContext — do NOT create additional setInterval calls anywhere else.
   */
  tickNow: () => void;

  // Getters
  getTimeOffset: () => number;
  getLastSyncAge: () => number; // milliseconds since last sync
  isSyncStale: () => boolean; // True if last sync was >65 seconds ago
  getAdjustedNow: () => number; // Current time in seconds with offset applied
}

export const useTimeOffsetStore = create<TimeOffsetStore>((set, get) => ({
  // Initial state
  timeOffset: 0,
  lastSyncTime: Date.now(),
  isSyncing: false,
  syncError: null,
  nowSeconds: 0, // SSR-safe; real value populated by tickNow() after hydration

  // Setters
  setTimeOffset: (offset: number) => {
    // Snap nowSeconds immediately when on-chain time arrives so every timer
    // reflects the correction without waiting for the next 1-second tick.
    set({
      timeOffset: offset,
      lastSyncTime: Date.now(),
      syncError: null,
      nowSeconds: Math.floor(Date.now() / 1000 + offset),
    });
  },

  setSyncing: (syncing: boolean) => {
    set({ isSyncing: syncing });
  },

  setSyncError: (error: string | null) => {
    set({ syncError: error });
  },

  tickNow: () => {
    set((state) => ({ nowSeconds: Math.floor(Date.now() / 1000 + state.timeOffset) }));
  },

  // Getters
  getTimeOffset: () => get().timeOffset,

  getLastSyncAge: () => {
    return Date.now() - get().lastSyncTime;
  },

  isSyncStale: () => {
    // Stale if older than 65 seconds (we sync every 60 seconds)
    return get().getLastSyncAge() > 65000;
  },

  getAdjustedNow: () => {
    // Returns current time in seconds, adjusted by the time offset
    return Date.now() / 1000 + get().timeOffset;
  },
}));
