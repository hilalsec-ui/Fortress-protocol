import { useState, useCallback, useRef } from "react";
import { Connection } from "@solana/web3.js";

export type SettlementStatus = "idle" | "loading" | "success" | "error";

interface UseSettlementTriggerReturn {
  status: SettlementStatus;
  error: string | null;
  trigger: (lotteryType: string, tier: number, endTime: number) => Promise<void>;
  reset: () => void;
}

const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 1500;
const MAX_CLOCK_SLIPPAGE_S = 60;

/**
 * useSettlementTrigger — demand-driven settlement hook.
 *
 * 1. Validates on-chain time (getSlot → getBlockTime) to confirm the tier
 *    has truly expired before dispatching.
 * 2. POSTs to /api/trigger-crank with 3-attempt retry (1.5 s between).
 * 3. Exposes { status, error, trigger, reset } for UI feedback.
 *
 * For LPM (capacity-based), pass endTime = 0 to skip the time check.
 */
export function useSettlementTrigger(
  connection: Connection | null,
): UseSettlementTriggerReturn {
  const [status, setStatus] = useState<SettlementStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const inflightRef = useRef(false);

  const reset = useCallback(() => {
    setStatus("idle");
    setError(null);
    inflightRef.current = false;
  }, []);

  const trigger = useCallback(
    async (lotteryType: string, tier: number, endTime: number) => {
      if (inflightRef.current) return;
      inflightRef.current = true;
      setStatus("loading");
      setError(null);

      try {
        // ── Step 1: On-chain time check (skip for LPM / capacity-based) ──
        if (endTime > 0) {
          if (!connection) {
            throw new Error("No Solana connection available");
          }
          const slot = await connection.getSlot("confirmed");
          const blockTime = await connection.getBlockTime(slot);
          if (blockTime === null) {
            throw new Error("Unable to read on-chain block time");
          }
          if (blockTime < endTime) {
            const remaining = endTime - blockTime;
            throw new Error(
              `Tier has not expired yet — ${remaining}s remaining on-chain`,
            );
          }
          // Warn (but proceed) if drift is unusually large
          const drift = blockTime - endTime;
          if (drift > MAX_CLOCK_SLIPPAGE_S) {
            console.warn(
              `[settlement] Block time is ${drift}s past endTime — proceeding anyway`,
            );
          }
        }

        // ── Step 2: 3-attempt POST to /api/trigger-crank ─────────────────
        let lastErr: string | null = null;
        for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
          try {
            const res = await fetch("/api/trigger-crank", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ lotteryType, tier }),
            });
            const data = await res.json();
            if (res.ok && (data.ok || data.skipped)) {
              setStatus("success");
              return;
            }
            lastErr = data.error ?? `HTTP ${res.status}`;
          } catch (fetchErr) {
            lastErr =
              fetchErr instanceof Error ? fetchErr.message : "Network error";
          }
          if (attempt < MAX_ATTEMPTS) {
            await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
          }
        }

        throw new Error(lastErr ?? "Settlement dispatch failed after 3 attempts");
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
        setStatus("error");
      } finally {
        inflightRef.current = false;
      }
    },
    [connection],
  );

  return { status, error, trigger, reset };
}
