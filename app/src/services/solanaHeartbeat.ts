"use client";

import { Connection, SYSVAR_CLOCK_PUBKEY } from "@solana/web3.js";
import { useTimeOffsetStore } from "@/stores/timeOffsetStore";

/**
 * Solana Network Heartbeat Sync Service
 *
 * Reads the Solana Clock sysvar every 60 seconds to synchronize the local UI
 * clock with on-chain time.  This is the same timestamp Rust's Clock::get()?
 * .unix_timestamp uses — so the 12 time-based tier countdowns (4×DPL, 4×WPL,
 * 4×MPL) expire at precisely the right moment.
 *
 * The Clock sysvar read is a single getAccountInfo call — no getSlot() +
 * getBlockTime() chain, no null-risk, one RPC roundtrip.
 *
 * Note: ChainDataContext also reads the Clock sysvar every 10 s alongside
 * vault data, so in practice the offset is refreshed very frequently.  This
 * heartbeat acts as the initial sync + forceSync for pre-expiry accuracy.
 */

class SolanaHeartbeatSync {
  private connection: Connection | null = null;
  private syncIntervalId: NodeJS.Timeout | null = null;
  private isSyncing = false;
  private readonly SYNC_INTERVAL = 60 * 1000; // 60 seconds (ChainDataContext handles every 10s)
  private readonly CLOCK_TIMEOUT = 8 * 1000; // 8 second timeout

  /**
   * Initialize the heartbeat sync service with a Solana connection.
   * Must be called once with a valid connection before timers start updating.
   * 
   * @param connection - Solana web3 Connection instance
   */
  public initialize(connection: Connection): void {
    if (this.connection === connection) {
      console.log("[Heartbeat] Already initialized with this connection");
      return;
    }

    this.connection = connection;
    console.log("[Heartbeat] Initialized with Solana connection");

    // Perform initial sync immediately
    this.performSync();

    // Schedule recurring sync every 60 seconds
    if (this.syncIntervalId) {
      clearInterval(this.syncIntervalId);
    }

    this.syncIntervalId = setInterval(() => {
      this.performSync();
    }, this.SYNC_INTERVAL);
  }

  private async performSync(): Promise<void> {
    if (!this.connection) {
      console.warn("[Heartbeat] Not initialized - skipping sync");
      return;
    }

    if (this.isSyncing) {
      console.debug("[Heartbeat] Sync already in progress - skipping cycle");
      return;
    }

    try {
      this.isSyncing = true;
      const store = useTimeOffsetStore.getState();
      store.setSyncing(true);

      // Read the Solana Clock sysvar — single RPC call, always available.
      // Layout (little-endian):
      //   offset 0:  slot                    (u64)
      //   offset 8:  epoch_start_timestamp   (i64)
      //   offset 16: epoch                   (u64)
      //   offset 24: leader_schedule_epoch   (u64)
      //   offset 32: unix_timestamp          (i64) ← same as Rust Clock::get()?.unix_timestamp
      const onChainTime = await this.getClockTime();

      if (onChainTime === null) {
        console.warn("[Heartbeat] Failed to read Clock sysvar");
        store.setSyncError("Failed to sync with Solana network");
        return;
      }

      const now = Date.now() / 1000;
      const newOffset = onChainTime - now;

      console.debug(
        "[Heartbeat] Clock sync complete. OnChainTime: %d, LocalTime: %d, Offset: %+.2f s",
        onChainTime,
        Math.floor(now),
        newOffset
      );

      store.setTimeOffset(newOffset);
      store.setSyncError(null);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error("[Heartbeat] Sync failed:", errorMessage);
      
      const store = useTimeOffsetStore.getState();
      store.setSyncError(`Network error: ${errorMessage}`);
    } finally {
      this.isSyncing = false;
      const store = useTimeOffsetStore.getState();
      store.setSyncing(false);
    }
  }

  /**
   * Read unix_timestamp from the Solana Clock sysvar with a timeout guard.
   * This is identical to what Rust's Clock::get()?.unix_timestamp returns.
   */
  private async getClockTime(): Promise<number | null> {
    if (!this.connection) return null;

    const timeoutPromise = new Promise<null>((resolve) =>
      setTimeout(() => resolve(null), this.CLOCK_TIMEOUT)
    );
    const fetchPromise = (async () => {
      try {
        const info = await this.connection!.getAccountInfo(
          SYSVAR_CLOCK_PUBKEY,
          "confirmed"
        );
        if (!info || info.data.length < 40) return null;
        return Number(info.data.readBigInt64LE(32));
      } catch {
        return null;
      }
    })();

    return Promise.race([fetchPromise, timeoutPromise]);
  }

  /**
   * Manually trigger a sync cycle (useful for forcing immediate update).
   */
  public forceSync(): void {
    console.log("[Heartbeat] Force sync requested");
    this.performSync();
  }

  /**
   * Stop the heartbeat sync service and clean up.
   */
  public stop(): void {
    if (this.syncIntervalId) {
      clearInterval(this.syncIntervalId);
      this.syncIntervalId = null;
    }
    console.log("[Heartbeat] Sync service stopped");
  }

  /**
   * Get current sync status for UI feedback.
   */
  public getSyncStatus(): {
    isSyncing: boolean;
    lastSyncAge: number; // milliseconds
    nextSyncIn: number; // milliseconds
  } {
    const store = useTimeOffsetStore.getState();
    const lastSyncAge = store.getLastSyncAge();
    const nextSyncIn = Math.max(0, this.SYNC_INTERVAL - lastSyncAge);

    return {
      isSyncing: store.isSyncing,
      lastSyncAge,
      nextSyncIn,
    };
  }
}

// Singleton instance
let syncInstance: SolanaHeartbeatSync | null = null;

/**
 * Get or create the global heartbeat sync instance.
 * This ensures only one sync service runs across the entire app.
 */
export function getSolanaHeartbeat(): SolanaHeartbeatSync {
  if (!syncInstance) {
    syncInstance = new SolanaHeartbeatSync();
  }
  return syncInstance;
}

/**
 * Initialize the global heartbeat sync with a connection.
 * Should be called once in the app initialization (e.g., in root layout).
 * 
 * @param connection - Solana web3 Connection instance
 */
export function initializeSolanaHeartbeat(connection: Connection): void {
  const heartbeat = getSolanaHeartbeat();
  heartbeat.initialize(connection);
}
