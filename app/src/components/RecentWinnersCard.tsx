"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { Trophy, Copy, Check, ExternalLink, RefreshCw, Search, X } from "lucide-react";
import { useChainData } from "@/contexts/ChainDataContext";
import { useAnchorProgram } from "@/utils/anchor";
import { extractRecentWinnersFromVaults, RecentWinner } from "@/services/winnerService";
import { getWinnerHistory } from "@/services/participantsService";
import { fetchAllWinnerHistories } from "@/services/winnerHistoryService";

// Patterns match actual on-chain log format:
// "LPM Winner Drawn: tier=5, winner=ABC..., prize=4750000"
// NOTE: We now extract winners directly from vault accounts instead of parsing logs

export interface WinnerEntry extends RecentWinner {
  signature?: string;
}

function truncate(addr: string, start = 6, end = 4) {
  return `${addr.slice(0, start)}…${addr.slice(-end)}`;
}

function timeAgo(ts: number | null): string {
  if (!ts) return "—";
  const diff = Math.floor((Date.now() / 1000) - ts);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

const TYPE_COLORS: Record<string, string> = {
  LPM: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
  DPL: "text-blue-400 bg-blue-500/10 border-blue-500/20",
  WPL: "text-purple-400 bg-purple-500/10 border-purple-500/20",
  MPL: "text-orange-400 bg-orange-500/10 border-orange-500/20",
};

const TYPE_COLORS_LIGHT: Record<string, string> = {
  LPM: "text-emerald-700 bg-emerald-50 border-emerald-200",
  DPL: "text-blue-700 bg-blue-50 border-blue-200",
  WPL: "text-purple-700 bg-purple-50 border-purple-200",
  MPL: "text-orange-700 bg-orange-50 border-orange-200",
};

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const handle = () => {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <button
      onClick={handle}
      className="p-1 rounded transition-colors hover:bg-white/10 text-white/30 hover:text-white/70"
      aria-label="Copy address"
    >
      {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}

const WINNERS_CACHE_KEY = 'fortress_winners_cache';

function loadCachedWinners(): WinnerEntry[] {
  try {
    const raw = typeof window !== 'undefined' ? localStorage.getItem(WINNERS_CACHE_KEY) : null;
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveCachedWinners(w: WinnerEntry[]) {
  try { localStorage.setItem(WINNERS_CACHE_KEY, JSON.stringify(w)); } catch {}
}

export default function RecentWinnersCard({ isDarkMode }: { isDarkMode: boolean }) {
  const { lotteryAccounts, lastRefresh, refresh } = useChainData();
  const program = useAnchorProgram();
  const [winners, setWinners] = useState<WinnerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasHydrated, setHasHydrated] = useState(false);
  const [search, setSearch] = useState("");
  const parseWinnersRef = useRef<() => void>();

  // After hydration: restore cached winners instantly before the first RPC fetch.
  useEffect(() => {
    setHasHydrated(true);
    const cached = loadCachedWinners();
    if (cached.length > 0) {
      setWinners(cached);
      setLoading(false);
    }
  }, []);

  // Extract winners: on-chain WinnerHistory (primary) + vault state + localStorage (fallback)
  const parseWinners = useCallback(async () => {
    if (!lotteryAccounts) {
      console.log(`[RecentWinners] No lottery accounts available`);
      setLoading(false);
      return;
    }

    try {
      // PRIMARY: fetch all 16 on-chain WinnerHistory PDAs
      let onChainWinners: WinnerEntry[] = [];
      if (program) {
        try {
          const histories = await fetchAllWinnerHistories(program as any);
          onChainWinners = histories.map(w => ({ ...w, signature: undefined }));
        } catch (e) {
          console.warn('[RecentWinners] On-chain history fetch failed, falling back:', e);
        }
      }

      // SECONDARY: vault last_winner fields (fast, no extra RPC)
      const vaultWinners = extractRecentWinnersFromVaults(lotteryAccounts)
        .filter((w) => w.winner && typeof w.winner === 'string' && w.winner.length > 0);

      // TERTIARY: localStorage history written by resolveLotteryRound (has txSignature)
      let historyWinners: WinnerEntry[] = [];
      try {
        historyWinners = getWinnerHistory(20).map(w => ({
          winner: w.wallet,
          lotteryType: w.lotteryType,
          tier: w.tier,
          roundNumber: w.roundNumber ?? 0,
          blockTime: w.timestamp ? Math.floor(w.timestamp / 1000) : null,
          signature: w.txSignature,
        }));
      } catch { /* localStorage may be unavailable */ }

      // Merge: on-chain is primary source of truth; vault/localStorage fill gaps
      const merged: WinnerEntry[] = [...onChainWinners];

      // Enrich on-chain winners with txSignature from localStorage when available
      const sigMap = new Map(historyWinners.map(h => [
        `${h.lotteryType}-${h.tier}-${h.roundNumber ?? 0}`, h.signature
      ]));
      merged.forEach(w => {
        if (!w.signature) {
          const sig = sigMap.get(`${w.lotteryType}-${w.tier}-${w.roundNumber ?? 0}`);
          if (sig) w.signature = sig;
        }
      });

      // Add vault / localStorage winners not yet in on-chain history (e.g. just-drawn, pending)
      // Prioritize historyWinners (have blockTime + signature) over vaultWinners (have neither)
      const cached = loadCachedWinners().map(c => ({ ...c, signature: (c as any).signature ?? (c as any).txSignature }));
      for (const c of [...historyWinners, ...cached, ...vaultWinners]) {
        const key = `${c.lotteryType}-${c.tier}-${c.roundNumber ?? 0}`;
        if (!merged.some(w => `${w.lotteryType}-${w.tier}-${w.roundNumber ?? 0}` === key)) {
          merged.push(c);
        }
      }

      // Sort by blockTime DESC (most recent first); roundNumber as tiebreaker
      const uniqueWinners = Array.from(
        new Map(merged.map(w => [
          `${w.lotteryType}-${w.tier}-${w.roundNumber ?? 0}`,
          w
        ])).values()
      ).sort((a, b) => {
        const bt = (b.blockTime || 0) - (a.blockTime || 0);
        if (bt !== 0) return bt;
        return (b.roundNumber || 0) - (a.roundNumber || 0);
      }).slice(0, 10);

      // DEFENSIVE: Final validation before display — ensure all winners have valid addresses
      const finalWinners = uniqueWinners.filter((w) => {
        if (!w.winner || typeof w.winner !== 'string' || w.winner.length === 0) {
          console.error(`[RecentWinners] Removing winner with missing address:`, w);
          return false;
        }
        return true;
      });
      
      if (finalWinners.length < uniqueWinners.length) {
        console.warn(`[RecentWinners] Validation removed ${uniqueWinners.length - finalWinners.length} invalid addresses before display`);
      }

      // Only overwrite cache/state when we actually got winners — prevents a rate-limit
      // spike from wiping the localStorage cache and making the list go blank.
      if (finalWinners.length > 0) {
        saveCachedWinners(finalWinners);
        setWinners(finalWinners);
        console.log(`[RecentWinners] Displaying ${finalWinners.length} verified winners to UI`);
      } else {
        console.log(`[RecentWinners] Fetch returned 0 winners — preserving previous display`);
      }
      setLoading(false);
    } catch (err) {
      console.error("[RecentWinners] Error parsing winners:", err);
      setLoading(false);
    }
  }, [lotteryAccounts, program]);

  // Keep ref so the interval always calls the latest version
  useEffect(() => { parseWinnersRef.current = parseWinners; }, [parseWinners]);

  // Re-parse whenever ChainDataContext refreshes lottery accounts
  useEffect(() => {
    parseWinners();
  }, [parseWinners]);

  // Poll every 10 s independently — catches draws even without a dep change
  useEffect(() => {
    const iv = setInterval(() => parseWinnersRef.current?.(), 10_000);
    return () => clearInterval(iv);
  }, []);

  const trimmedSearch = search.trim().toLowerCase();
  const filteredWinners = trimmedSearch
    ? winners.filter(w => w.winner.toLowerCase().includes(trimmedSearch))
    : winners;

  return (
    <div
      className={`rounded-2xl overflow-hidden border ${
        isDarkMode
          ? "bg-white/5 border-white/10"
          : "bg-white border-gray-200 shadow-sm"
      }`}
    >
      {/* Header */}
      <div
        className={`px-6 py-4 border-b flex items-center justify-between ${
          isDarkMode ? "border-white/10" : "border-gray-100"
        }`}
      >
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-yellow-500/10 border border-yellow-500/20">
            <Trophy className="w-5 h-5 text-yellow-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2
                className={`text-base font-bold ${
                  isDarkMode ? "text-white" : "text-gray-900"
                }`}
              >
                Recent Winners
              </h2>
              {/* Live pulse indicator */}
              <span className="flex items-center gap-1.5">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
                </span>
                <span
                  className={`text-xs font-medium ${
                    isDarkMode ? "text-green-400" : "text-green-600"
                  }`}
                >
                  Live
                </span>
              </span>
            </div>
            <p
              className={`text-xs mt-0.5 ${
                isDarkMode ? "text-white/40" : "text-gray-400"
              }`}
            >
              Last 10 draw winners · verified on-chain
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={refresh}
            disabled={loading}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border transition-colors disabled:opacity-50 ${
              isDarkMode
                ? "bg-white/5 hover:bg-white/10 border-white/10 text-white/60"
                : "bg-gray-50 hover:bg-gray-100 border-gray-200 text-gray-500"
            }`}
          >
            <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} />
            {lastRefresh ? lastRefresh.toLocaleTimeString() : "Loading\u2026"}
          </button>
          <div className="relative">
            <Search className={`absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 pointer-events-none ${isDarkMode ? "text-white/30" : "text-gray-400"}`} />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search address\u2026"
              className={`pl-7 pr-6 py-1.5 rounded-lg text-xs outline-none w-44 border transition-colors ${
                isDarkMode
                  ? "bg-white/5 border-white/10 text-white/80 placeholder-white/30 focus:border-yellow-500/40"
                  : "bg-gray-50 border-gray-200 text-gray-800 placeholder-gray-400 focus:border-yellow-500/50"
              }`}
            />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-white/10" aria-label="Clear search">
                <X className={`w-3 h-3 ${isDarkMode ? "text-white/30" : "text-gray-400"}`} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Winner list */}
      {loading && winners.length === 0 ? (
        <div
          className={`flex items-center justify-center py-12 text-sm gap-2 ${
            isDarkMode ? "text-white/30" : "text-gray-400"
          }`}
        >
          <RefreshCw className="w-4 h-4 animate-spin" />
          Loading vault data…
        </div>
      ) : filteredWinners.length === 0 ? (
        <div className={`flex flex-col items-center justify-center py-12 text-sm gap-2 ${isDarkMode ? "text-white/30" : "text-gray-400"}`}>
          <Trophy className="w-8 h-8 opacity-20" />
          {trimmedSearch
            ? `No winner found matching "${search.trim()}" in the last ${winners.length} draws`
            : "No completed draws found yet"}
        </div>
      ) : (
        <div className="divide-y divide-white/5">
          {filteredWinners.map((w, i) => (
            <div
              key={`${w.lotteryType}-${w.tier}-${w.roundNumber}`}
              className={`flex items-center gap-3 px-6 py-3 transition-colors ${
                isDarkMode ? "hover:bg-white/5" : "hover:bg-gray-50"
              }`}
            >
              {/* Rank */}
              <span
                className={`w-6 text-center text-xs font-bold shrink-0 ${
                  i === 0
                    ? "text-yellow-400"
                    : i === 1
                    ? "text-gray-400"
                    : i === 2
                    ? isDarkMode ? "text-amber-700" : "text-amber-600"
                    : isDarkMode
                    ? "text-white/20"
                    : "text-gray-300"
                }`}
              >
                {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${i + 1}`}
              </span>

              {/* Lottery type + tier badge */}
              <span
                className={`shrink-0 px-2 py-0.5 rounded-md text-xs font-semibold border ${
                  isDarkMode
                    ? TYPE_COLORS[w.lotteryType] ?? "text-white/60 bg-white/5 border-white/10"
                    : TYPE_COLORS_LIGHT[w.lotteryType] ?? "text-gray-600 bg-gray-50 border-gray-200"
                }`}
              >
                {w.lotteryType} ${w.tier}
              </span>

              {/* Round number */}
              <span
                className={`text-xs font-mono shrink-0 hidden sm:block ${
                  isDarkMode ? "text-yellow-400/60" : "text-yellow-600"
                }`}
              >
                Round {w.roundNumber}
              </span>

              {/* Address */}
              <span
                className={`font-mono text-xs flex-1 min-w-0 truncate ${
                  isDarkMode ? "text-white/80" : "text-gray-800"
                }`}
                title={w.winner}
              >
                <span className="hidden sm:inline">{w.winner}</span>
                <span className="inline sm:hidden">{truncate(w.winner)}</span>
              </span>

              {/* Time */}
              <span
                className={`text-xs shrink-0 hidden md:block ${
                  isDarkMode ? "text-white/30" : "text-gray-400"
                }`}
              >
                {hasHydrated ? timeAgo(w.blockTime) : "—"}
              </span>

              {/* Actions */}
              <div className="flex items-center gap-1 shrink-0">
                <CopyButton value={w.winner} />
                <a
                  href={`https://solscan.io/account/${w.winner}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-1 rounded transition-colors hover:bg-white/10"
                  aria-label="View wallet on Solscan"
                  title="View wallet on Solscan"
                >
                  <ExternalLink
                    className={`w-3.5 h-3.5 ${
                      isDarkMode
                        ? "text-white/30 hover:text-green-400"
                        : "text-gray-400 hover:text-green-600"
                    }`}
                  />
                </a>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Footer */}
      <div className={`px-6 py-3 border-t text-xs flex items-center justify-between ${isDarkMode ? "border-white/5 text-white/20" : "border-gray-100 text-gray-400"}`}>
        <span>Sourced from on-chain WinnerHistory PDA \u00b7 Solana mainnet</span>
        {winners.length > 0 && (
          <span>{trimmedSearch ? `${filteredWinners.length} / ${winners.length} matches` : `${winners.length} of last 50`}</span>
        )}
      </div>
    </div>
  );
}
