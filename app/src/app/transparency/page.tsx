"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { motion } from "framer-motion";
import { useTheme } from "@/contexts/ThemeContext";
import { useChainData } from "@/contexts/ChainDataContext";
import { useAnchorProgram } from "@/utils/anchor";
import { extractRecentWinnersFromVaults, RecentWinner } from "@/services/winnerService";
import { getWinnerHistory } from "@/services/participantsService";
import { fetchAllWinnerHistories } from "@/services/winnerHistoryService";
import { ShieldCheck, ExternalLink, Copy, CheckCheck, Cpu, Hash, Layers, AlertTriangle, Eye, ArrowRight } from "lucide-react";
import { PROGRAM_ID, FPT_MINT, CRANK_AUTHORITY, SB_ON_DEMAND_PROGRAM, SB_MAINNET_QUEUE } from "@/utils/constants";

/* ── Constants ─────────────────────────────────────────────────────────── */
const SB_PROGRAM_ID = SB_ON_DEMAND_PROGRAM;
const SB_EXPLORER_URL = "https://ondemand.switchboard.xyz/solana/mainnet-beta";
const SOLSCAN_TX = (sig: string) => `https://solscan.io/tx/${sig}`;
const SOLSCAN_ACCOUNT = (addr: string) => `https://solscan.io/account/${addr}`;

const CONTRACT_ADDRESSES = [
  { label: "Fortress Program (mainnet)", value: PROGRAM_ID },
  { label: "FPT Token Mint (mainnet)", value: FPT_MINT },
  { label: "Crank Wallet (mainnet)", value: CRANK_AUTHORITY },
  { label: "Switchboard Queue (mainnet)", value: SB_MAINNET_QUEUE },
];

/* ── Small helpers ────────────────────────────────────────────────────── */
function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button onClick={copy} className="ml-2 text-cyan-400 hover:text-cyan-300 transition-colors" aria-label="Copy">
      {copied ? <CheckCheck className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
    </button>
  );
}

function Badge({ label, color }: { label: string; color: string }) {
  return <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${color}`}>{label}</span>;
}

/* ── Steps data ───────────────────────────────────────────────────────── */
const STEPS = [
  {
    icon: Eye,
    label: "Step 1 — House-Sponsored Auto-Trigger (Silent)",
    color: "text-cyan-400",
    glow: "shadow-cyan-500/30",
    border: "border-cyan-500/30",
    description:
      "When a draw becomes eligible (LPM tier fills to 100 participants, or DPL/WPL/MPL timer expires with participants > 0), the frontend automatically fires a server-side API call. A dedicated crank wallet signs and submits the request_draw_entropy instruction — no wallet popup appears for the user. The crank wallet is automatically topped up from the on-chain SOL vault when its balance falls below 0.05 SOL.",
  },
  {
    icon: Hash,
    label: "Step 2 — TEE Oracle Generates Randomness (~1–5 s)",
    color: "text-purple-400",
    glow: "shadow-purple-500/30",
    border: "border-purple-500/30",
    description:
      "A Switchboard TEE oracle running inside a hardware-secured Intel SGX enclave picks up the request. Inside the enclave, where even the operator cannot inspect memory, it generates a 32-byte verifiable random value and signs it with an SGX attestation. The signed value is written to the on-chain RandomnessAccount (reveal_slot becomes non-zero). This step takes roughly 1–5 seconds.",
  },
  {
    icon: Cpu,
    label: "Step 3 — User-Finalized Settlement (FPT Bounty)",
    color: "text-emerald-400",
    glow: "shadow-emerald-500/30",
    border: "border-emerald-500/30",
    description: null, // rendered as JSX below
  },
];

/* ── Types ────────────────────────────────────────────────────────────── */
interface DisplayWinner extends RecentWinner {
  txSignature?: string;
}

/* ── Page ─────────────────────────────────────────────────────────────── */
export default function TransparencyPage() {
  const { isDarkMode } = useTheme();
  const { lotteryAccounts } = useChainData();
  const program = useAnchorProgram();

  const [recentWinners, setRecentWinners] = useState<DisplayWinner[]>([]);
  const loadWinnersRef = useRef<() => void>();

  const c = {
    card: isDarkMode ? "bg-white/[0.03] backdrop-blur-md border border-white/10" : "bg-white shadow-md border border-gray-100",
    h: isDarkMode ? "text-white" : "text-gray-900",
    body: isDarkMode ? "text-gray-300" : "text-gray-700",
    muted: isDarkMode ? "text-gray-400" : "text-gray-600",
    subtle: isDarkMode ? "text-gray-500" : "text-gray-400",
    rowDiv: isDarkMode ? "border-white/5" : "border-gray-100",
    hover: isDarkMode ? "hover:bg-white/5" : "hover:bg-gray-50",
  };

  /* ── Winner loading (merged from on-chain, vault, localStorage) ── */
  const loadWinners = useCallback(async () => {
    // Immediate: localStorage
    try {
      const wh = getWinnerHistory(10);
      if (wh.length > 0) {
        const quick: DisplayWinner[] = wh.map((w) => ({
          winner: w.wallet,
          lotteryType: w.lotteryType,
          tier: w.tier,
          roundNumber: w.roundNumber ?? 0,
          blockTime: w.timestamp ? Math.floor(w.timestamp / 1000) : null,
          txSignature: w.txSignature,
        }));
        quick.sort((a, b) => (b.blockTime || 0) - (a.blockTime || 0));
        setRecentWinners((prev) => (prev.length === 0 ? quick.slice(0, 10) : prev));
      }
    } catch {}

    // Primary: on-chain WinnerHistory PDAs
    let onChainWinners: DisplayWinner[] = [];
    if (program) {
      try {
        const histories = await fetchAllWinnerHistories(program as any);
        onChainWinners = histories.map((w) => ({ ...w }));
      } catch (e) {
        console.warn("[Transparency] On-chain history fetch failed:", e);
      }
    }

    // Secondary: vault last_winner fields
    const vaultWinners: DisplayWinner[] = extractRecentWinnersFromVaults(lotteryAccounts).filter(
      (w) => w.winner && typeof w.winner === "string" && w.winner.length > 0,
    );

    // Tertiary: localStorage
    let localWinners: DisplayWinner[] = [];
    try {
      const wh = getWinnerHistory(20);
      localWinners = wh.map((w) => ({
        winner: w.wallet,
        lotteryType: w.lotteryType,
        tier: w.tier,
        roundNumber: w.roundNumber ?? 0,
        blockTime: w.timestamp ? Math.floor(w.timestamp / 1000) : null,
        txSignature: w.txSignature,
      }));
    } catch {}

    // Enrich on-chain with txSignature from local
    const sigMap = new Map(localWinners.map((w) => [`${w.lotteryType}-${w.tier}-${w.roundNumber ?? 0}`, w.txSignature]));
    const merged: DisplayWinner[] = [...onChainWinners];
    merged.forEach((w) => {
      if (!w.txSignature) {
        const sig = sigMap.get(`${w.lotteryType}-${w.tier}-${w.roundNumber ?? 0}`);
        if (sig) w.txSignature = sig;
      }
    });

    // Also pull in cache/localStorage
    let cacheWinners: DisplayWinner[] = [];
    try {
      const raw = typeof window !== "undefined" ? localStorage.getItem("fortress_winners_cache") : null;
      if (raw) cacheWinners = JSON.parse(raw).map((c: any) => ({ ...c, txSignature: c.signature ?? c.txSignature }));
    } catch {}

    for (const w of [...localWinners, ...vaultWinners, ...cacheWinners]) {
      const key = `${w.lotteryType}-${w.tier}-${w.roundNumber ?? 0}`;
      if (!merged.some((m) => `${m.lotteryType}-${m.tier}-${m.roundNumber ?? 0}` === key)) {
        merged.push(w);
      }
    }

    merged.sort((a, b) => {
      const bt = (b.blockTime || 0) - (a.blockTime || 0);
      if (bt !== 0) return bt;
      return (b.roundNumber || 0) - (a.roundNumber || 0);
    });

    if (merged.length > 0) setRecentWinners(merged.slice(0, 10));
  }, [lotteryAccounts, program]);

  useEffect(() => {
    loadWinnersRef.current = loadWinners;
  }, [loadWinners]);
  useEffect(() => {
    loadWinners();
  }, [loadWinners]);
  useEffect(() => {
    const iv = setInterval(() => loadWinnersRef.current?.(), 10_000);
    return () => clearInterval(iv);
  }, []);

  /* ── Step 3 JSX description ── */
  const step3Desc = (
    <>
      Once the oracle is ready, any connected user clicks &ldquo;Claim Reward &amp; Finalize Draw&rdquo;. The program reads the 32-byte oracle value and mixes it with the vault seed and entropy
      commitment:
      <pre
        className={`mt-3 text-xs rounded-lg p-3 overflow-x-auto font-mono whitespace-pre-wrap ${
          isDarkMode ? "bg-black/40 text-emerald-300" : "bg-gray-100 text-emerald-700"
        }`}
      >
        {`s0..s3  = sb_value[0..31] split into four u64s (Xoshiro256++ state)
vault_c = entropy_commitment + lottery_type + tier + round
a0 = s0 XOR s2,  a1 = s1 XOR s3
final   = a0 XOR a1 XOR vault_seed
winner  = final % participant_count`}
      </pre>
      The settler earns a <span className="font-mono text-emerald-400">COMMUNITY_REWARD_FPT</span> directly from the treasury. 95% of the vault goes to the winner; 5% to protocol treasury.
    </>
  );

  return (
    <div className="min-h-screen">
      {/* Background glows */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden -z-10">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl" />
        <div className="absolute top-3/4 left-1/2 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl" />
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-8 py-12 space-y-12">
        {/* ═══ HERO ═══ */}
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="text-center pt-4">
          <div
            className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-semibold mb-6 ${
              isDarkMode ? "border border-cyan-500/40 bg-cyan-500/10 text-cyan-400" : "border border-cyan-200 bg-cyan-50 text-cyan-700"
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            Provably Fair Protocol
          </div>
          <h1
            className={`text-4xl sm:text-5xl font-black mb-4 leading-tight ${
              isDarkMode
                ? "bg-gradient-to-r from-cyan-400 via-purple-400 to-emerald-400 bg-clip-text text-transparent"
                : "bg-gradient-to-r from-cyan-600 via-purple-600 to-emerald-600 bg-clip-text text-transparent"
            }`}
          >
            Provably Fair:
            <br />
            100% On-Chain Randomness.
          </h1>
          <p className={`text-lg max-w-2xl mx-auto ${c.muted}`}>
            Every winning index is derived from Switchboard V3 TEE VRF randomness that no single party can predict or manipulate — not us, not validators, not you.
          </p>
        </motion.div>

        {/* ═══ ENTROPY SOURCE ═══ */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className={`rounded-2xl p-6 sm:p-8 ${c.card}`}>
          <div className="flex items-center gap-3 mb-5">
            <div className={`p-2 rounded-lg ${isDarkMode ? "bg-cyan-500/10 text-cyan-400" : "bg-cyan-50 text-cyan-600"}`}>
              <Layers className="w-5 h-5" />
            </div>
            <h2 className={`text-xl font-bold ${c.h}`}>The Entropy Source</h2>
          </div>

          <p className={`leading-relaxed mb-6 ${c.body}`}>
            Traditional online lotteries pick winners on a private server — a black box you cannot inspect. Fortress uses{" "}
            <span className={isDarkMode ? "text-cyan-400" : "text-cyan-600"} style={{ fontWeight: 600 }}>Switchboard V3 TEE VRF</span> as a decentralised randomness source. Each draw is a
            2-step process: a community member submits a request on-chain, then a Switchboard oracle running inside a hardware-secured{" "}
            <span className={isDarkMode ? "text-cyan-300" : "text-cyan-700"}>Intel SGX enclave</span> generates a 32-byte verifiable random value — cryptographically proven and impossible to
            manipulate even by the operator.
          </p>

          {/* SB program address */}
          <div
            className={`rounded-xl p-4 ${
              isDarkMode ? "border border-cyan-500/30 bg-cyan-900/10" : "border border-cyan-200 bg-cyan-50"
            }`}
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className={`text-xs uppercase tracking-wider mb-1 ${c.subtle}`}>Switchboard On-Demand Program (mainnet)</div>
                <div className={`flex items-center gap-1 font-mono text-sm break-all ${isDarkMode ? "text-cyan-300" : "text-cyan-700"}`}>
                  {SB_PROGRAM_ID}
                  <CopyButton value={SB_PROGRAM_ID} />
                </div>
              </div>
              <a
                href={SB_EXPLORER_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-black font-bold text-sm transition-colors"
              >
                Verify on Switchboard <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>
        </motion.div>

        {/* ═══ HOW IT WORKS ═══ */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <h2 className={`text-2xl font-bold mb-6 flex items-center gap-2 ${c.h}`}>
            <ArrowRight className={`w-5 h-5 ${isDarkMode ? "text-purple-400" : "text-purple-600"}`} />
            How It Works — Step by Step
          </h2>

          <div className="space-y-4">
            {STEPS.map((step, i) => {
              const Icon = step.icon;
              return (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.15 + i * 0.1 }}
                  className={`rounded-2xl p-6 shadow-lg ${c.card}`}
                >
                  <div className="flex items-start gap-4">
                    <div className={`p-3 rounded-xl shrink-0 ${isDarkMode ? "bg-white/5" : "bg-gray-100"} ${step.color}`}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className={`font-bold text-base mb-2 ${step.color}`}>{step.label}</h3>
                      <div className={`text-sm leading-relaxed ${c.body}`}>{step.description ?? step3Desc}</div>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </motion.div>

        {/* ═══ RECENT DRAWS TABLE ═══ */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.45 }} className={`rounded-2xl overflow-hidden ${c.card}`}>
          <div className={`px-6 py-4 border-b ${c.rowDiv} flex items-center justify-between`}>
            <h2 className={`text-lg font-bold flex items-center gap-2 ${c.h}`}>
              <ShieldCheck className={`w-5 h-5 ${isDarkMode ? "text-purple-400" : "text-purple-600"}`} />
              Recent Verifiable Draws
            </h2>
            <Badge label="Last 10" color={isDarkMode ? "bg-purple-500/20 text-purple-300" : "bg-purple-100 text-purple-700"} />
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className={`border-b ${c.rowDiv}`}>
                  {["Tier", "Round", "Winner", "Slot", "Proof (TX)"].map((h) => (
                    <th key={h} className={`px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider ${c.subtle}`}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className={`divide-y ${isDarkMode ? "divide-white/5" : "divide-gray-100"}`}>
                {recentWinners.length > 0 ? (
                  recentWinners.map((w, i) => {
                    const truncatedWinner = `${w.winner.slice(0, 6)}...${w.winner.slice(-4)}`;
                    return (
                      <tr key={`${w.lotteryType}-${w.tier}-${w.roundNumber}-${i}`} className={`${c.hover} transition-colors`}>
                        <td className="px-4 py-3">
                          <Badge label={`${w.lotteryType} $${w.tier}`} color={isDarkMode ? "bg-cyan-500/10 text-cyan-300" : "bg-cyan-50 text-cyan-700"} />
                        </td>
                        <td className={`px-4 py-3 font-mono ${c.body}`}>{w.roundNumber}</td>
                        <td className={`px-4 py-3 font-mono ${isDarkMode ? "text-emerald-300" : "text-emerald-700"}`}>{truncatedWinner}</td>
                        <td className={`px-4 py-3 font-mono ${c.muted}`}>{w.blockTime ? new Date(w.blockTime * 1000).toLocaleString() : "—"}</td>
                        <td className="px-4 py-3">
                          <a
                            href={w.txSignature ? SOLSCAN_TX(w.txSignature) : SOLSCAN_ACCOUNT(w.winner)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={`inline-flex items-center gap-1 transition-colors ${isDarkMode ? "text-purple-400 hover:text-purple-300" : "text-purple-600 hover:text-purple-500"}`}
                          >
                            Solscan <ExternalLink className="w-3 h-3" />
                          </a>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={5} className={`px-4 py-8 text-center ${c.muted}`}>
                      No draws yet. Winners will appear here after the first draw.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </motion.div>

        {/* ═══ TECHNICAL SAFETY NOTE ═══ */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.55 }}
          className={`rounded-2xl p-6 sm:p-8 ${isDarkMode ? "border border-yellow-500/30 bg-yellow-500/5" : "border border-yellow-200 bg-yellow-50"}`}
        >
          <div className="flex items-start gap-3">
            <AlertTriangle className={`w-5 h-5 shrink-0 mt-0.5 ${isDarkMode ? "text-yellow-400" : "text-yellow-600"}`} />
            <div>
              <h3 className={`font-bold mb-2 ${isDarkMode ? "text-yellow-300" : "text-yellow-700"}`}>Technical Safety Note</h3>
              <p className={`text-sm leading-relaxed ${c.body}`}>
                The draw uses Switchboard V3 TEE VRF — every random value is generated inside an Intel SGX enclave and verified on-chain. If the oracle has not yet committed a reveal
                (reveal_slot still zero), the <span className={`font-mono ${isDarkMode ? "text-yellow-300" : "text-yellow-700"}`}>fulfill_draw_entropy</span> instruction will wait and retry.
                A draw can never complete on stale or uncommitted randomness.
              </p>

              <div className="mt-4 grid sm:grid-cols-2 gap-3 text-xs">
                {[
                  { label: "Intel SGX attestation", desc: "Randomness generated inside a Trusted Execution Environment" },
                  { label: "reveal_slot must be non-zero", desc: "Oracle must have committed before settlement is allowed" },
                ].map((chk, i) => (
                  <div key={i} className={`rounded-lg p-3 ${isDarkMode ? "bg-black/30 border border-yellow-500/20" : "bg-white border border-yellow-200"}`}>
                    <div className={`flex items-center gap-1.5 font-semibold mb-1 ${isDarkMode ? "text-yellow-300" : "text-yellow-700"}`}>
                      <CheckCheck className="w-3.5 h-3.5 text-green-400" />
                      {chk.label}
                    </div>
                    <div className={c.subtle}>{chk.desc}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </motion.div>

        {/* ═══ CONTRACT ADDRESSES ═══ */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.55 }}>
          <h2 className={`text-2xl font-bold mb-6 flex items-center gap-2 ${c.h}`}>
            <Layers className={`w-5 h-5 ${isDarkMode ? "text-emerald-400" : "text-emerald-600"}`} />
            On-Chain Addresses
          </h2>
          <div className="space-y-3">
            {CONTRACT_ADDRESSES.map(({ label, value }) => (
              <div key={value} className={`rounded-xl p-4 ${isDarkMode ? "border border-white/10 bg-white/[0.03]" : "border border-gray-200 bg-white"}`}>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <div className={`text-xs uppercase tracking-wider mb-1 ${c.subtle}`}>{label}</div>
                    <div className={`flex items-center gap-1 font-mono text-sm break-all ${isDarkMode ? "text-emerald-300" : "text-emerald-700"}`}>
                      {value}
                      <CopyButton value={value} />
                    </div>
                  </div>
                  <a href={SOLSCAN_ACCOUNT(value)} target="_blank" rel="noopener noreferrer"
                    className={`shrink-0 inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg font-semibold transition-colors ${isDarkMode ? "bg-white/5 hover:bg-white/10 text-gray-300" : "bg-gray-100 hover:bg-gray-200 text-gray-700"}`}>
                    Solscan <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>
            ))}
          </div>
        </motion.div>

        {/* ═══ CTAs ═══ */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.65 }} className="flex flex-col sm:flex-row gap-4 justify-center pb-12">
          <a
            href={SB_EXPLORER_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400 text-black font-bold transition-all shadow-lg shadow-cyan-500/25 hover:shadow-cyan-500/40"
          >
            <ExternalLink className="w-4 h-4" />
            Verify on Switchboard Explorer
          </a>
          <a
            href={SOLSCAN_ACCOUNT(SB_PROGRAM_ID)}
            target="_blank"
            rel="noopener noreferrer"
            className={`inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl border font-semibold transition-all ${
              isDarkMode ? "border-purple-500/40 hover:border-purple-400 text-purple-300 hover:text-purple-200" : "border-purple-300 hover:border-purple-400 text-purple-700 hover:text-purple-600"
            }`}
          >
            <ExternalLink className="w-4 h-4" />
            Inspect SB Program on Solscan
          </a>
        </motion.div>
      </div>
    </div>
  );
}
