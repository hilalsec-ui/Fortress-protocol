"use client";

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useConnection } from "@solana/wallet-adapter-react";
import { PublicKey, Connection } from "@solana/web3.js";
import { useChainData } from "@/contexts/ChainDataContext";
import { PROGRAM_ID } from "@/utils/constants";
import { motion } from "framer-motion";
import { Database, RefreshCw, Users, ExternalLink, AlertCircle, ChevronDown, Copy, CheckCheck } from "lucide-react";
import { useTheme } from "@/contexts/ThemeContext";
import RecentWinnersCard from "@/components/RecentWinnersCard";
import toast from "react-hot-toast";

// ─── Config ──────────────────────────────────────────────────────────────────

const PROGRAM_PUBKEY = new PublicKey(PROGRAM_ID);

const LOTTERY_CONFIG = [
  // LPM: participation-based draw — capped at exactly 100 participants per tier
  { type: "LPM", tiers: [5, 10, 20, 50], typeIndex: 0, color: "emerald", seedPrefix: "vault_lpm", maxParticipants: 100 },
  // DPL/WPL/MPL: time-based draws — unlimited participants per tier
  { type: "DPL", tiers: [5, 10, 15, 20], typeIndex: 1, color: "blue",    seedPrefix: "vault_dpl", maxParticipants: null },
  { type: "WPL", tiers: [5, 10, 15, 20], typeIndex: 2, color: "purple",  seedPrefix: "vault_wpl", maxParticipants: null },
  { type: "MPL", tiers: [5, 10, 15, 20], typeIndex: 3, color: "orange",  seedPrefix: "vault_mpl", maxParticipants: null },
] as const;

// ─── PDA helpers ─────────────────────────────────────────────────────────────

function deriveVaultPDA(seedPrefix: string, tier: number): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from(seedPrefix), Buffer.from([tier])],
    PROGRAM_PUBKEY
  );
  return pda;
}

function deriveParticipantPagePDA(typeIndex: number, tier: number, pageNumber: number): PublicKey {
  const typeBytes = Buffer.alloc(4); typeBytes.writeUInt32LE(typeIndex, 0);
  const tierBytes = Buffer.alloc(4); tierBytes.writeUInt32LE(tier, 0);
  const pageBytes = Buffer.alloc(4); pageBytes.writeUInt32LE(pageNumber, 0);
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("page"), typeBytes, tierBytes, pageBytes],
    PROGRAM_PUBKEY
  );
  return pda;
}

// ─── Chain reads ─────────────────────────────────────────────────────────────

async function readParticipantsFromPage(
  connection: Connection,
  pagePDA: PublicKey
): Promise<string[]> {
  const info = await connection.getAccountInfo(pagePDA);
  if (!info) return [];
  
  const data = info.data;
  if (data.length < 18) {
    console.warn(`[ParticipantsPage] Data too small: ${data.length} bytes`);
    return [];
  }
  
  try {
    const vecLen = data.readUInt32LE(14);
    
    if (vecLen === 0) {
      return [];
    }
    
    if (vecLen > 50) {
      console.warn(`[ParticipantsPage] Invalid vector length: ${vecLen}`);
      return [];
    }
    
    const participants: string[] = [];
    let offset = 18;
    let invalidCount = 0;
    
    for (let i = 0; i < vecLen && offset + 32 <= data.length; i++) {
      try {
        const pubkeyBytes = data.slice(offset, offset + 32);
        const participant = new PublicKey(pubkeyBytes).toBase58();
        
        // DEFENSIVE: Validate address format before adding
        if (participant && typeof participant === 'string' && participant.length >= 32) {
          participants.push(participant);
        } else {
          invalidCount++;
          console.warn(`[ParticipantsPage] Skipping invalid address: ${participant}`);
        }
        offset += 32;
      } catch (err) {
        console.error(`[ParticipantsPage] Failed to parse participant ${i}:`, err);
        break;
      }
    }
    
    if (invalidCount > 0) {
      console.log(`[ParticipantsPage] Parsed with ${participants.length} valid, ${invalidCount} invalid`);
    }
    
    return participants;
  } catch (err) {
    console.error(`[ParticipantsPage] Failed to parse page:`, err);
    return [];
  }
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface TierData {
  lotteryType: string;
  tier: number;
  roundNumber: number;       // current active round (0 = first round)
  participantCount: number; // from vault account (authoritative)
  participants: string[];   // wallets read from page PDAs
  maxParticipants: number | null; // null = unlimited (DPL/WPL/MPL)
  vaultPDA: string;
  error?: string;
  _fromCache?: boolean;     // true when participants are restored from localStorage after a draw
}

// ─── Participant localStorage cache ──────────────────────────────────────────

const PARTICIPANTS_CACHE_KEY = 'fortress_participants_cache';

function loadParticipantsCache(): Record<string, string[]> {
  try {
    const raw = typeof window !== 'undefined' ? localStorage.getItem(PARTICIPANTS_CACHE_KEY) : null;
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function saveParticipantsCache(cache: Record<string, string[]>) {
  try { localStorage.setItem(PARTICIPANTS_CACHE_KEY, JSON.stringify(cache)); } catch {}
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function ParticipantsDataPage() {
  const { connection } = useConnection();
  const { lotteryAccounts } = useChainData();

  const [data, setData]           = useState<TierData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [filter, setFilter]       = useState<string>("ALL");
  const [search, setSearch]       = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [maxPagesPerTier, setMaxPagesPerTier] = useState(1); // Start with 1 page = 50 participants per tier
  const [hasHydrated, setHasHydrated] = useState(false);
  const [copiedWallet, setCopiedWallet] = useState<string | null>(null);
  const { isDarkMode } = useTheme();

  const copyWallet = (addr: string) => {
    navigator.clipboard.writeText(addr);
    setCopiedWallet(addr);
    setTimeout(() => setCopiedWallet(null), 2000);
  };
  const isFetchingRef = useRef(false); // prevent concurrent overlapping fetches

  // Mark hydration complete
  useEffect(() => {
    setHasHydrated(true);
  }, []);

  // ── Fetch ─────────────────────────────────────────────────────────────────

  const fetchAll = useCallback(async (silent = false) => {
    if (!lotteryAccounts || !hasHydrated) return;
    if (isFetchingRef.current) return; // already in-flight — skip this tick
    isFetchingRef.current = true;
    if (!silent) setIsLoading(true);
    
    let warningShown = false;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
      if (!silent && !warningShown) {
        toast.error('⏱️ Fetch timeout: Dataset too large. Try filtering by lottery type.', 
          { duration: 8000 });
        warningShown = true;
      }
    }, 20_000); // 20 second timeout
    
    try {
      // Build flat list of all (lottery, tier) combos and fetch them ALL in parallel
      const allCombos = LOTTERY_CONFIG.flatMap(lottery =>
        lottery.tiers.map(tier => ({ lottery, tier }))
      );

      const results: TierData[] = await Promise.all(
        allCombos.map(async ({ lottery, tier }) => {
          const vaultPDA = deriveVaultPDA(lottery.seedPrefix, tier);
          let participantCount = 0;
          let roundNumber = 0;
          const participants: string[] = [];
          let error: string | undefined;

          // Vault metadata comes free from ChainDataContext — no extra RPC calls
          const lotteryMeta = lotteryAccounts.find((l: any) => l.lotteryType === lottery.type);
          const tierMeta = lotteryMeta?.tiers?.find((t: any) => t.tier === tier);
          participantCount = Number(tierMeta?.participants ?? 0);
          roundNumber = Number(tierMeta?.roundNumber ?? 0);

          if (participantCount > 0) {
            try {
              const numPages = Math.ceil(participantCount / 50);
              const pagesToFetch = Math.min(numPages, maxPagesPerTier, 100);

              const pagePDAs = Array.from({ length: pagesToFetch }, (_, i) =>
                deriveParticipantPagePDA(lottery.typeIndex, tier, i)
              );

              const pageResults = await Promise.all(
                pagePDAs.map(async (pda) => {
                  try {
                    return await readParticipantsFromPage(connection, pda);
                  } catch (err: any) {
                    console.warn(`Failed to read page: ${err?.message || String(err)}`);
                    return [];
                  }
                })
              );
              participants.push(...pageResults.flat());
            } catch (e: any) {
              error = String(e).slice(0, 80);
            }
          }

          return {
            lotteryType: lottery.type,
            tier,
            roundNumber,
            participantCount,
            participants,
            maxParticipants: lottery.maxParticipants,
            vaultPDA: vaultPDA.toBase58(),
            error,
          };
        })
      );

      // ── Persist non-empty participants & restore cached ones after a draw ──
      const cache = loadParticipantsCache();
      const updatedCache = { ...cache };

      const mergedResults = results.map(r => {
        const cacheKey = `${r.lotteryType}_${r.tier}`;
        
        // DEFENSIVE: Filter to ensure all addresses are valid strings
        const validParticipants = r.participants.filter((p) => {
          if (!p || typeof p !== 'string' || p.length === 0) {
            console.error(`[ParticipantsData] Invalid address in ${r.lotteryType}-${r.tier}: ${p}`);
            return false;
          }
          return true;
        });
        
        if (validParticipants.length < r.participants.length) {
          console.warn(`[ParticipantsData] Filtered ${r.participants.length - validParticipants.length} invalid addresses from ${r.lotteryType}-${r.tier}`);
        }
        
        if (validParticipants.length > 0) {
          // Fresh data: save latest 50 entries to cache
          updatedCache[cacheKey] = validParticipants.slice(-50);
          return { ...r, participants: validParticipants };
        }
        // No participants on-chain: restore from cache
        const cached = cache[cacheKey] ?? [];
        return cached.length > 0
          ? { ...r, participants: cached, _fromCache: true }
          : { ...r, participants: validParticipants };
      });

      saveParticipantsCache(updatedCache);
      setData(mergedResults as TierData[]);
      console.log(`[ParticipantsData] Loaded ${mergedResults.reduce((s, r) => s + r.participants.length, 0)} total participants`);
      setLastRefresh(new Date());
    } catch (error: any) {
      if (error.name === 'AbortError') {
        if (!silent) toast.error('⏱️ Load timeout: Dataset is too large. Try filtering by tier.', 
          { duration: 8000 });
      } else {
        console.error('Fetch error:', error);
        if (!silent) toast.error('Failed to load participant data');
      }
    } finally {
      clearTimeout(timeoutId);
      isFetchingRef.current = false;
      setIsLoading(false);
    }
  }, [lotteryAccounts, connection, maxPagesPerTier, hasHydrated]);

  // fetchAll depends on lotteryAccounts which ChainDataContext refreshes every 10 s,
  // so this effect fires naturally on every poll — no extra setInterval needed.
  useEffect(() => {
    if (hasHydrated) fetchAll(true);
  }, [fetchAll, hasHydrated]);

  // Load additional pages for pagination
  const loadMorePages = useCallback(async () => {
    if (data.length === 0) return; // need existing vault data
    
    const newMaxPages = maxPagesPerTier + 2; // Load 2 more pages at a time (100 participants)
    setIsLoadingMore(true);
    
    try {
      const results: TierData[] = [];

      for (const lottery of LOTTERY_CONFIG) {
        for (const tier of lottery.tiers) {
          const vaultPDA = deriveVaultPDA(lottery.seedPrefix, tier);
          let participantCount = 0;
          let roundNumber = 0;
          const participants: string[] = [];

          // Reuse vault metadata from existing state — no extra RPC vault fetches
          const existingTier = data.find(d => d.lotteryType === lottery.type && d.tier === tier);
          participantCount = existingTier?.participantCount ?? 0;
          roundNumber = existingTier?.roundNumber ?? 0;

          if (participantCount > 0) {
            try {
              const numPages = Math.ceil(participantCount / 50);
              const pagesToFetch = Math.min(numPages, newMaxPages, 100);
              
              // Only load the newly available pages (page indices maxPagesPerTier and above)
              const pagePDAsNew = Array.from(
                { length: Math.max(0, pagesToFetch - maxPagesPerTier) },
                (_, i) => deriveParticipantPagePDA(lottery.typeIndex, tier, maxPagesPerTier + i)
              );
              
              const pageResults = await Promise.all(
                pagePDAsNew.map(async (pda) => {
                  try {
                    return await readParticipantsFromPage(connection, pda);
                  } catch (err: any) {
                    console.warn(`Failed to load more page: ${err?.message || String(err)}`);
                    return [];
                  }
                })
              );
              participants.push(...pageResults.flat());
            } catch (e: any) {
              // Skip tiers with errors
            }
          }

          results.push({
            lotteryType: lottery.type,
            tier,
            roundNumber,
            participantCount,
            participants,
            maxParticipants: lottery.maxParticipants,
            vaultPDA: vaultPDA.toBase58(),
          });
        }
      }

      // Merge newly loaded pages into existing data (don't discard already-loaded page 0 wallets)
      setData(prev => prev.map(existing => {
        const extra = results.find(r => r.lotteryType === existing.lotteryType && r.tier === existing.tier);
        if (!extra || extra.participants.length === 0) return existing;
        return { ...existing, participants: [...existing.participants, ...extra.participants] };
      }));
      setMaxPagesPerTier(newMaxPages);
      toast.success(`✅ Loaded ${newMaxPages * 50} participants per tier`, { duration: 3000 });
    } catch (error: any) {
      console.error("Load more error:", error);
      toast.error("Failed to load more participants");
    } finally {
      setIsLoadingMore(false);
    }
  }, [data, connection, maxPagesPerTier]);

  // Debounce search input to prevent excessive filtering on large datasets
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
    }, 300); // 300ms debounce
    
    return () => clearTimeout(timer);
  }, [search]);

  // ── Derived ───────────────────────────────────────────────────────────────

  const filtered = data.filter(d =>
    (filter === "ALL" || d.lotteryType === filter) &&
    (d.participantCount > 0 || d.participants.length > 0)
  );

  // Memoized filtered rows to prevent re-filtering on every render
  const rows = useMemo(() => {
    return filtered
      .flatMap(d =>
        d.participants.length > 0
          ? d.participants
              .filter(w => !debouncedSearch || w.toLowerCase().includes(debouncedSearch.toLowerCase()))
              .map((wallet, i) => ({
                wallet,
                lotteryType: d.lotteryType,
                tier: d.tier,
                index: i
              }))
          : []
      )
      .slice(0, debouncedSearch.trim() ? 500 : 50); // no cap when actively searching
  }, [filtered, debouncedSearch]);

  const totalParticipants = data.reduce((s, d) => s + d.participantCount, 0);
  const totalWalletsRead  = data.reduce((s, d) => s + d.participants.length, 0);
  const maxPossiblePages = Math.ceil(Math.max(...data.map(d => d.participantCount / 50)) || 1);

  const colorMap: Record<string, string> = {
    LPM: "emerald", DPL: "blue", WPL: "purple", MPL: "orange",
  };

  // ── Render ────────────────────────────────────────────────────────────────

  const c = {
    card: isDarkMode ? 'bg-white/[0.03] backdrop-blur-md border border-white/10' : 'bg-white shadow-md border border-gray-100',
    h: isDarkMode ? 'text-white' : 'text-gray-900',
    body: isDarkMode ? 'text-gray-300' : 'text-gray-700',
    muted: isDarkMode ? 'text-gray-400' : 'text-gray-600',
    subtle: isDarkMode ? 'text-gray-500' : 'text-gray-400',
    rowDiv: isDarkMode ? 'border-white/5' : 'border-gray-100',
  };

  return (
    <div className="min-h-screen">
      {/* Background glows */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden -z-10">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-green-500/10 rounded-full blur-3xl" />
        <div className="absolute bottom-1/3 right-1/4 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl" />
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-8 py-8 space-y-6">

        {/* ── Header ── */}
        <motion.div initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-xl ${isDarkMode ? 'bg-green-500/10' : 'bg-green-50'}`}>
              <Database className={`w-6 h-6 ${isDarkMode ? 'text-green-400' : 'text-green-600'}`} />
            </div>
            <div>
              <h1 className={`text-2xl sm:text-3xl font-black ${isDarkMode ? 'bg-gradient-to-r from-green-400 to-cyan-400 bg-clip-text text-transparent' : 'bg-gradient-to-r from-green-600 to-cyan-600 bg-clip-text text-transparent'}`}>Participants Data</h1>
              <p className={`text-sm ${c.subtle}`}>Live from Solana Mainnet · all 16 vaults</p>
            </div>
          </div>
          <button
            onClick={() => fetchAll(false)}
            disabled={isLoading}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-semibold transition-all disabled:opacity-50 ${
              isDarkMode
                ? 'bg-white/[0.05] hover:bg-white/10 border-white/10 text-white/70'
                : 'bg-white hover:bg-gray-50 border-gray-200 text-gray-600 shadow-sm'
            }`}
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
            {lastRefresh ? `Updated ${lastRefresh.toLocaleTimeString()}` : "Loading…"}
          </button>
        </motion.div>

        {/* ── Summary cards ── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {LOTTERY_CONFIG.map((l, i) => {
            const total = data
              .filter(d => d.lotteryType === l.type)
              .reduce((s, d) => s + d.participantCount, 0);
            const colors: Record<string, string> = { LPM: 'from-yellow-500 to-orange-500', DPL: 'from-blue-500 to-cyan-500', WPL: 'from-indigo-500 to-purple-500', MPL: 'from-orange-500 to-red-500' };
            const textColors: Record<string, string> = { LPM: isDarkMode ? 'text-yellow-400' : 'text-yellow-600', DPL: isDarkMode ? 'text-cyan-400' : 'text-cyan-600', WPL: isDarkMode ? 'text-purple-400' : 'text-purple-600', MPL: isDarkMode ? 'text-orange-400' : 'text-orange-600' };
            return (
              <motion.div
                key={l.type}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className={`rounded-2xl p-4 text-center ${c.card}`}
              >
                <div className={`text-3xl font-black font-mono ${textColors[l.type]}`}>{total}</div>
                <div className={`text-xs font-semibold mt-1 ${c.subtle}`}>{l.type} participants</div>
                <div className={`h-1 rounded-full mt-2 bg-gradient-to-r ${colors[l.type]} opacity-40`} />
              </motion.div>
            );
          })}
        </div>

        {/* ── Tier breakdown ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {LOTTERY_CONFIG.map(l =>
            l.tiers.map(tier => {
              const d = data.find(x => x.lotteryType === l.type && x.tier === tier);
              if (!d) return null;
              const isLimited = d.maxParticipants !== null;
              const pct = isLimited
                ? Math.min(100, (d.participantCount / 100) * 100)
                : 100;
              return (
                <div
                  key={`${l.type}-${tier}`}
                  className={`rounded-xl p-4 space-y-2 ${c.card}`}
                >
                  <div className="flex justify-between items-center">
                    <span className={`text-sm font-bold ${c.h}`}>
                      {l.type} — ${tier}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-mono px-2 py-0.5 rounded-md ${isDarkMode ? 'bg-white/[0.05] text-cyan-300' : 'bg-gray-100 text-cyan-700'}`}>
                        Round {d.roundNumber}
                      </span>
                      <span className={`text-sm font-mono ${c.muted}`}>
                        {isLimited
                          ? `${d.participantCount} / ${d.maxParticipants}`
                          : `${d.participantCount} participants`}
                      </span>
                    </div>
                  </div>
                  {isLimited ? (
                    <div className={`w-full h-1.5 rounded-full ${isDarkMode ? 'bg-white/10' : 'bg-gray-200'}`}>
                      <div
                        className="h-1.5 rounded-full bg-gradient-to-r from-green-500 to-emerald-400 transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <div className={`h-1.5 flex-1 rounded-full ${isDarkMode ? 'bg-white/10' : 'bg-gray-200'}`}>
                        <div className="h-1.5 rounded-full bg-blue-400/60 w-full" />
                      </div>
                      <span className={`text-xs shrink-0 ${c.subtle}`}>unlimited</span>
                    </div>
                  )}
                  {d.error && (
                    <div className="flex items-center gap-1 text-xs text-red-500">
                      <AlertCircle className="w-3 h-3" /> {d.error}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* ── Recent Winners ── */}
        <RecentWinnersCard isDarkMode={isDarkMode} />

        {/* ── Wallet table ── */}
        <div className={`rounded-2xl overflow-hidden ${c.card}`}>
          {/* Table header / filters */}
          <div className={`px-6 py-4 border-b flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between ${c.rowDiv}`}>
            <div className="flex items-center gap-2 flex-wrap">
              {["ALL", ...LOTTERY_CONFIG.map(l => l.type)].map(t => (
                <button
                  key={t}
                  onClick={() => setFilter(t)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${
                    filter === t
                      ? "bg-green-500/20 text-green-500 border-green-500/30 shadow-sm shadow-green-500/10"
                      : isDarkMode
                        ? "bg-white/[0.03] text-white/50 border-white/10 hover:text-white/80 hover:bg-white/[0.06]"
                        : "bg-gray-50 text-gray-500 border-gray-200 hover:text-gray-700 hover:bg-gray-100"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
            <input
              type="text"
              placeholder="Search wallet…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className={`rounded-xl px-4 py-2 text-sm outline-none w-full sm:w-56 border transition-all ${
                isDarkMode
                  ? 'bg-white/[0.03] border-white/10 text-white/80 placeholder-white/30 focus:border-green-500/40'
                  : 'bg-gray-50 border-gray-200 text-gray-800 placeholder-gray-400 focus:border-green-500/50'
              } focus:ring-2 focus:ring-green-500/20`}
            />
          </div>

          {/* Stats row */}
          <div className={`px-6 py-3 border-b flex items-center justify-between gap-4 flex-wrap ${c.rowDiv}`}>
            <span className={`flex items-center gap-1 text-xs font-mono ${c.subtle}`}>
              <Users className="w-3.5 h-3.5" />
              {totalParticipants} on-chain · {totalWalletsRead} wallets loaded from {maxPagesPerTier} page{maxPagesPerTier > 1 ? 's' : ''} per tier
            </span>
            
            {/* Load More Button */}
            {maxPagesPerTier < maxPossiblePages && (
              <button
                onClick={loadMorePages}
                disabled={isLoadingMore}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  isLoadingMore
                    ? 'opacity-50 cursor-not-allowed'
                    : isDarkMode
                      ? 'bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-400 border border-cyan-500/30'
                      : 'bg-blue-50 hover:bg-blue-100 text-blue-600 border border-blue-200'
                }`}
              >
                {isLoadingMore ? (
                  <>
                    <RefreshCw className="w-3 h-3 animate-spin" />
                    Loading…
                  </>
                ) : (
                  <>
                    <ChevronDown className="w-3 h-3" />
                    Load {Math.min(2, maxPossiblePages - maxPagesPerTier)} more pages
                  </>
                )}
              </button>
            )}
          </div>

          {/* Table */}
          {isLoading && rows.length === 0 ? (
            <div className={`flex items-center justify-center py-16 text-sm ${
              isDarkMode ? 'text-white/30' : 'text-gray-400'
            }`}>
              <RefreshCw className="w-4 h-4 animate-spin mr-2" /> Fetching from chain…
            </div>
          ) : rows.length === 0 ? (
            <div className={`flex flex-col items-center justify-center py-16 text-sm gap-2 ${
              isDarkMode ? 'text-white/30' : 'text-gray-400'
            }`}>
              <Users className="w-8 h-8 opacity-30" />
              {filter === "ALL" && !search
                ? "No active participants yet across any lottery"
                : debouncedSearch.trim()
                  ? "Wallet not found in loaded pages. Try 'Load more pages' to search deeper."
                  : "No participants match this filter"}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className={`border-b text-xs ${
                    isDarkMode ? 'border-white/10 text-white/40' : 'border-gray-100 text-gray-500'
                  }`}>
                    <th className="px-6 py-3 text-left font-medium">#</th>
                    <th className="px-4 py-3 text-left font-medium">Lottery</th>
                    <th className="px-4 py-3 text-left font-medium">Tier</th>
                    <th className="px-4 py-3 text-left font-medium">Wallet</th>
                    <th className="px-4 py-3 text-left font-medium">Loaded At</th>
                    <th className="px-4 py-3 text-left font-medium">Explorer</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => (
                    <tr
                      key={`${row.lotteryType}-${row.tier}-${row.wallet}-${row.index}`}
                      className={`border-b transition-colors ${
                        isDarkMode
                          ? 'border-white/5 hover:bg-white/5'
                          : 'border-gray-50 hover:bg-gray-50'
                      }`}
                    >
                      <td className={`px-6 py-3 ${
                        isDarkMode ? 'text-white/30' : 'text-gray-400'
                      }`}>{i + 1}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-md text-xs font-semibold ${
                          isDarkMode ? 'bg-white/10 text-white/80' : 'bg-gray-100 text-gray-700'
                        }`}>
                          {row.lotteryType}
                        </span>
                      </td>
                      <td className={`px-4 py-3 ${
                        isDarkMode ? 'text-white/60' : 'text-gray-600'
                      }`}>${row.tier}</td>
                      <td className={`px-4 py-3 font-mono text-xs ${
                        isDarkMode ? 'text-white/80' : 'text-gray-800'
                      }`}>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => copyWallet(row.wallet)}
                            className={`shrink-0 transition-colors ${
                              copiedWallet === row.wallet
                                ? 'text-green-400'
                                : isDarkMode ? 'text-white/30 hover:text-cyan-400' : 'text-gray-400 hover:text-cyan-600'
                            }`}
                            title="Copy address"
                          >
                            {copiedWallet === row.wallet
                              ? <CheckCheck className="w-3.5 h-3.5" />
                              : <Copy className="w-3.5 h-3.5" />}
                          </button>
                          {row.wallet}
                        </div>
                      </td>
                      <td className={`px-4 py-3 text-xs tabular-nums ${
                        isDarkMode ? 'text-white/30' : 'text-gray-400'
                      }`}>
                        {lastRefresh ? lastRefresh.toLocaleTimeString() : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <a
                          href={`https://explorer.solana.com/address/${row.wallet}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-green-500/70 hover:text-green-600 transition-colors"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
