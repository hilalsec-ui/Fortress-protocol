/**
 * usePendingDraws — polls on-chain PendingDraw PDAs + Switchboard randomness
 * accounts to track the 2-click VRF draw state for each (lotteryType, tier).
 *
 * Returns a Record<tier, DrawPhase> where DrawPhase is:
 *   'idle'         – no pending draw on-chain
 *   'requested'    – PendingDraw PDA exists, oracle hasn't revealed yet
 *   'oracle_ready' – oracle has committed reveal_slot (reveal_slot > 0)
 */

import { useEffect, useRef, useState } from "react";
import { Program } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { derivePendingDrawPDA } from "@/services/lotteryService";

export type DrawPhase = "idle" | "house_triggering" | "requested" | "oracle_ready";

const LOTTERY_TYPE_ID: Record<string, number> = {
  LPM: 0,
  DPL: 1,
  WPL: 2,
  MPL: 3,
};

const POLL_INTERVAL_MS = 1500;

/**
 * @param program  Anchor program (or null while wallet is loading)
 * @param lotteryType  "LPM" | "DPL" | "WPL" | "MPL"
 * @param tiers    Array of tier values for that lottery type
 * @returns        Stable Record<tier, DrawPhase>
 */
export function usePendingDraws(
  program: Program | null,
  lotteryType: string,
  tiers: readonly number[],
): { phases: Record<number, DrawPhase>; isInitialized: boolean; requestedTimes: Record<number, number>; userInitiated: Record<number, boolean> } {
  const [phases, setPhases] = useState<Record<number, DrawPhase>>(() =>
    Object.fromEntries(tiers.map((t) => [t, "idle" as DrawPhase])),
  );
  // Unix timestamps (seconds) of when each tier's PendingDraw was created on-chain.
  // 0 means no pending draw. Pages use this for staleness detection.
  const [requestedTimes, setRequestedTimes] = useState<Record<number, number>>(() =>
    Object.fromEntries(tiers.map((t) => [t, 0])),
  );
  // true when the randomness account authority is NOT the crank — the user must
  // manually sign step 2 (oracle commit). Pages use this to skip the 120 s
  // staleness wait and immediately show the step 2 button after a refresh.
  const [userInitiated, setUserInitiated] = useState<Record<number, boolean>>(() =>
    Object.fromEntries(tiers.map((t) => [t, false])),
  );
  // false until the first RPC poll resolves — gates house auto-triggers on all
  // pages so a page refresh never re-fires a trigger that already ran on-chain.
  const [isInitialized, setIsInitialized] = useState(false);

  // Tracks tiers for which we've already triggered a crank refresh to avoid
  // spamming the API while waiting for the new draw to come online.
  const refreshingRef = useRef<Set<number>>(new Set());

  useEffect(() => {
    if (!program) return;

    const connection = program.provider.connection;
    const programId = program.programId;
    const lotteryTypeId = LOTTERY_TYPE_ID[lotteryType];
    if (lotteryTypeId === undefined) return;

    let cancelled = false;
    let firstPollDone = false;

    async function pollAll() {
      if (cancelled) return;
      const updates: Record<number, DrawPhase> = {};
      const timeUpdates: Record<number, number> = {};
      const userInitUpdates: Record<number, boolean> = {};

      await Promise.all(
        tiers.map(async (tier) => {
          try {
            const pda = derivePendingDrawPDA(programId, lotteryTypeId, tier);
            const pdaInfo = await connection.getAccountInfo(pda, "confirmed");

            if (!pdaInfo) {
              updates[tier] = "idle";
              timeUpdates[tier] = 0;
              userInitUpdates[tier] = false;
              return;
            }

            // PDA exists — check if oracle has committed randomness.
            // Read the randomness account pubkey directly from the PendingDraw data
            // (offset 10-41) instead of the static SB_RANDOMNESS_ACCOUNTS map,
            // because the manual fallback creates ephemeral randomness accounts.
            if (pdaInfo.data.length < 42) {
              updates[tier] = "requested";
              timeUpdates[tier] = 0;
              userInitUpdates[tier] = false;
              return;
            }
            const rndPk = new PublicKey(pdaInfo.data.slice(10, 42));

            const rndInfo = await connection.getAccountInfo(
              rndPk,
              "confirmed",
            );
            if (!rndInfo || rndInfo.data.length < 152) {
              updates[tier] = "requested";
              timeUpdates[tier] = 0;
              userInitUpdates[tier] = false;
              return;
            }

            const revealSlot = rndInfo.data.readBigUInt64LE(144);

            // PendingDraw layout: disc(8)+type(1)+tier(1)+rand(32)+commit(32)+requester(32) = 106
            const REQUESTED_AT_OFFSET = 106;
            let requestedAt = 0;
            if (pdaInfo.data.length >= REQUESTED_AT_OFFSET + 8) {
              const lo = pdaInfo.data.readUInt32LE(REQUESTED_AT_OFFSET);
              const hi = pdaInfo.data.readInt32LE(REQUESTED_AT_OFFSET + 4);
              requestedAt = hi * 4294967296 + lo;
            }
            timeUpdates[tier] = requestedAt;

            {
              // Read request_reveal_slot from pending draw (offset 115).
              // Layout: disc(8)+type(1)+tier(1)+rand(32)+commit(32)+requester(32)+requested_at(8)+bump(1)=115
              let requestRevealSlot = BigInt(0);
              if (pdaInfo.data.length >= 115 + 8) {
                requestRevealSlot = pdaInfo.data.readBigUInt64LE(115);
              }
              // Oracle is truly ready only when it revealed AFTER this draw was requested.
              const oracleReady = revealSlot > requestRevealSlot;

              const CRANK_AUTHORITY = "CH5CLt2e26cho7es4oAs536AgZqSzNR29WWrQ3QR6JUz";
              const rndAuthority = rndInfo.data.length >= 40
                ? new PublicKey(rndInfo.data.slice(8, 40)).toBase58()
                : null;

              if (!oracleReady && !refreshingRef.current.has(tier)) {
                // Only auto-kick the crank oracle if the randomness account authority
                // IS the crank. For ephemeral (user-authority) accounts the crank
                // cannot sign — userInitiated flag will immediately surface
                // 'fallback_needed' so the user can manually retry instead.
                if (rndAuthority === CRANK_AUTHORITY) {
                  refreshingRef.current.add(tier);
                  fetch("/api/draw/oracle", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ lottery_type: lotteryType, tier }),
                  })
                    .catch(() => {/* non-fatal */})
                    .finally(() => {
                      setTimeout(() => refreshingRef.current.delete(tier), 30_000);
                    });
                }
              }
              updates[tier] = oracleReady ? "oracle_ready" : "requested";
              // Track whether this draw was user-initiated (non-crank authority)
              userInitUpdates[tier] = !oracleReady && rndAuthority !== CRANK_AUTHORITY;
            }
          } catch {
            // Leave current phase unchanged on transient RPC errors.
          }
        }),
      );

      if (!cancelled) {
        setPhases((prev) => {
          const next = { ...prev };
          for (const [k, v] of Object.entries(updates)) {
            next[Number(k)] = v;
          }
          return next;
        });
        setRequestedTimes((prev) => {
          const next = { ...prev };
          for (const [k, v] of Object.entries(timeUpdates)) {
            next[Number(k)] = v as number;
          }
          return next;
        });
        setUserInitiated((prev) => {
          const next = { ...prev };
          for (const [k, v] of Object.entries(userInitUpdates)) {
            next[Number(k)] = v as boolean;
          }
          return next;
        });
        // Mark initialized after the first successful poll so pages know the
        // on-chain phase is accurate before allowing house auto-triggers.
        if (!firstPollDone) {
          firstPollDone = true;
          setIsInitialized(true);
        }
      }
    }

    pollAll();
    const interval = setInterval(pollAll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
    // tiers is a constant tuple — eslint exhaustive dep disabled intentionally.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [program, lotteryType]);

  return { phases, isInitialized, requestedTimes, userInitiated };
}
