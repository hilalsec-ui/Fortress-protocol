"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Shield, Zap, Lock, TrendingUp, Clock, Calendar, Trophy, Users, Wallet, CheckCircle, Award, Sparkles, Timer, Gift, ArrowRight, Database, Bot, UserCheck, RefreshCw, Layers, BarChart3, Cpu, Sun, Globe, ExternalLink, X } from "lucide-react";
import { useTheme } from "@/contexts/ThemeContext";
import { useWallet } from "@solana/wallet-adapter-react";
import RegistryFeed from "@/components/RegistryFeed";
import Link from "next/link";
import { useChainData } from "@/contexts/ChainDataContext";
import { useTimeOffsetStore } from "@/stores/timeOffsetStore";
import { useState, useCallback } from "react";

/* ── Feature detail modals ── */
const FEATURE_DETAILS = [
  {
    icon: Lock,
    text: "Vault-Locked Prize Pool",
    color: "from-emerald-500/20 to-green-500/20 border-emerald-500/30 text-emerald-400",
    modalAccent: "from-emerald-500 to-green-500",
    title: "Vault-Locked Prize Pool — No-Custody Prizes",
    sections: [
      {
        heading: "What is a PDA vault?",
        body: "Every Fortress prize pool lives in a Program Derived Address (PDA) vault — a Solana account whose private key is mathematically derived from the program itself, not from any human wallet. Only the Fortress smart contract can instruct the Solana runtime to move funds out of it. No team member, upgrade authority, or crank operator holds a key that can withdraw prize tokens.",
      },
      {
        heading: "Per-tier isolation",
        body: "Each lottery tier runs its own independent vault. DPL Tier-1, WPL Tier-3, MPL Tier-2 — all separate accounts. A bug or exploit in one tier cannot drain the funds of another. Participants in a given tier compete for exactly the tokens locked in that tier's vault, and nothing else.",
      },
      {
        heading: "Transparent balances",
        body: "Because every vault is a public Solana account, anyone can read its exact FPT balance at any time using the Fortress IDL or a block explorer. The prize amount shown in the UI is fetched directly from the on-chain account — it is never a server-side estimate or approximation. What you see is what the winner receives.",
      },
      {
        heading: "Funds only move on draw settlement",
        body: "The vault token account can only be debited inside fulfill_draw_entropy — the final settlement instruction. That instruction enforces three invariants before releasing funds: a valid SGX oracle proof must be attached, the lottery must be in the 'fulfilled' state, and the recipient must be the on-chain computed winner. All three checks are Rust constraints that cannot be bypassed.",
      },
    ],
  },
  {
    icon: Cpu,
    text: "SGX TEE Oracle",
    color: "from-purple-500/20 to-pink-500/20 border-purple-500/30 text-purple-400",
    modalAccent: "from-purple-500 to-pink-500",
    title: "Switchboard V3 TEE — Intel SGX Enclave Oracle",
    sections: [
      {
        heading: "What is a TEE oracle?",
        body: "TEE stands for Trusted Execution Environment. Switchboard V3 runs inside an Intel SGX enclave — a hardware-isolated process that is cryptographically isolated from the operator's own operating system. The randomness computation happens inside silicon that neither Switchboard nor Fortress can observe or tamper with.",
      },
      {
        heading: "How randomness is generated",
        body: "When a draw is requested, Fortress calls request_draw_entropy. A freshly generated keypair (the randomness account) commits to the current Solana slot hash. The SGX enclave then signs a 32-byte verifiable random value derived from that commitment. The reveal transaction proves the value was generated inside the enclave — any tampering produces a signature that the on-chain verifier rejects.",
      },
      {
        heading: "Winner selection",
        body: "Fortress derives the winner index as: entropy mod participant_count. The entropy is the 32-byte SGX output XOR'd with a domain-separation seed (lottery type + tier + round number). This makes each lottery tier's randomness independent even if they share an oracle epoch.",
      },
      {
        heading: "Why not a simple hash?",
        body: "Block hashes and VDFs are manipulable by validators who can grind or withhold blocks. An SGX enclave cannot be forced to produce a particular output — the hardware attestation proves which code ran and that it ran in isolation. This gives Fortress verifiable, unpredictable randomness without trusting any single party.",
      },
    ],
  },
  {
    icon: Zap,
    text: "Same-Block Payout",
    color: "from-yellow-500/20 to-amber-500/20 border-yellow-500/30 text-yellow-400",
    modalAccent: "from-yellow-500 to-amber-500",
    title: "Same-Block Payout — Instant Settlement",
    sections: [
      {
        heading: "What it means",
        body: "From the moment the oracle reveals its entropy to the moment the winner's wallet receives FPT tokens, everything happens inside a single Solana transaction. There is no multi-step settlement window, no claim period, and no waiting for a second confirmation. The prize lands in the same block.",
      },
      {
        heading: "How it's achieved",
        body: "fulfill_draw_entropy packs three Token-2022 transfer instructions into one atomic transaction: (1) prize to winner ATA, (2) treasury cut to protocol treasury ATA, (3) settler reward to the caller ATA. Solana's runtime processes all three or none — partial failures are impossible.",
      },
      {
        heading: "Token-2022 ATAs",
        body: "Fortress uses the Token-2022 program (the next-generation SPL token standard). Associated token accounts for both the winner and the caller are created on-chain inside the same transaction if they don't already exist — so even a first-time winner receives their prize in one step without any pre-setup.",
      },
      {
        heading: "Compared to traditional lotteries",
        body: "Centralised lotteries can hold winnings for days during manual verification. Even many DeFi protocols have multi-step claim flows. Fortress collapses the entire process — oracle reveal + winner computation + token transfer — into ~400 ms on Solana mainnet.",
      },
    ],
  },
  {
    icon: Globe,
    text: "Permissionless",
    color: "from-cyan-500/20 to-blue-500/20 border-cyan-500/30 text-cyan-400",
    modalAccent: "from-cyan-500 to-blue-500",
    title: "Permissionless — Anyone Can Participate & Settle",
    sections: [
      {
        heading: "No KYC, no whitelist",
        body: "Any Solana wallet can buy a ticket, trigger a draw, or finalize a settlement — no sign-up, no identity check, no approval queue. The program accepts any valid Solana public key as a participant or settler. There is no role-gated function that could be used to censor or block users.",
      },
      {
        heading: "Community-driven cranking",
        body: "The 'house crank' is just a convenience bot. The Fortress protocol does not require it. Every draw step — request_draw_entropy, oracle reveal, and fulfill_draw_entropy — is callable by any wallet. If the house crank is offline, any user can complete the draw themselves and earn the settler FPT bounty for doing so.",
      },
      {
        heading: "Lazy reset",
        body: "When a vault expires with zero participants ('dead pool'), it is reset automatically when the next ticket is purchased. The reset instruction (lazy_reset_vault) is bundled atomically with buy_ticket — so the first buyer of a new round pays no extra fees and sees no extra wallet prompts.",
      },
      {
        heading: "Open source & verifiable",
        body: "The Fortress smart contract is written in Rust with Anchor, open-source, and the program binary can be verified against the on-chain deployment at any time. Every decision about prize splits, randomness, participant ordering, and vault management is readable by anyone.",
      },
    ],
  },
];

function FptMintPill({ mint, isDarkMode }: { mint: string; isDarkMode: boolean }) {
  const [copied, setCopied] = useState(false);
  const copy = useCallback(() => {
    navigator.clipboard.writeText(mint).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [mint]);
  const short = `${mint.slice(0, 6)}…${mint.slice(-6)}`;
  return (
    <div className="mt-3 space-y-1.5">
      <p className={`text-[10px] font-mono uppercase tracking-widest ${isDarkMode ? "text-blue-400/70" : "text-blue-500/80"}`}>
        Use this address to swap SOL → FPT on any DEX
      </p>
      <button
        onClick={copy}
        title="Copy FPT mint address"
        className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg border font-mono text-[10px] transition-all duration-200 ${
          isDarkMode
            ? "bg-blue-500/10 border-blue-500/25 text-blue-300 hover:bg-blue-500/20 hover:border-blue-400/40"
            : "bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100 hover:border-blue-300"
        }`}
      >
        <span className="truncate hidden sm:block">{mint}</span>
        <span className="sm:hidden">{short}</span>
        <span className={`shrink-0 flex items-center gap-1 transition-colors ${copied ? (isDarkMode ? "text-green-400" : "text-green-600") : ""}`}>
          {copied ? (
            <>
              <CheckCircle className="w-3 h-3" />
              <span>Copied!</span>
            </>
          ) : (
            <>
              <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <rect x="9" y="9" width="13" height="13" rx="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
              <span>Copy</span>
            </>
          )}
        </span>
      </button>
    </div>
  );
}

export default function Home() {
  const { isDarkMode } = useTheme();
  const [activeFeature, setActiveFeature] = useState<number | null>(null);
  const { connected } = useWallet();
  const { lotteryAccounts, treasurySol } = useChainData();
  const nowSeconds = useTimeOffsetStore((state) => state.nowSeconds);

  /* ── Per-tier mini timer badges for a given lottery type ── */
  const TierTimers = ({ lotteryType }: { lotteryType: string }) => {
    const data = lotteryAccounts?.find((l: any) => l.lotteryType === lotteryType);
    const defaultTiers = lotteryType === "LPM" ? [5, 10, 20, 50] : [5, 10, 15, 20];
    if (!data?.tiers?.length) {
      return (
        <div className="flex flex-wrap gap-1.5">
          {defaultTiers.map((t) => (
            <span key={t} className={`text-[10px] px-2 py-0.5 rounded-md font-mono ${isDarkMode ? "bg-white/5 text-gray-500" : "bg-gray-100 text-gray-400"}`}>
              ${t} --:--:--
            </span>
          ))}
        </div>
      );
    }
    return (
      <div className="flex flex-wrap gap-1.5">
        {data.tiers.map((tier: any) => {
          const endTime: number = tier.endTime || 0;
          const participants: number = tier.participants || 0;
          const remaining = endTime > 0 ? endTime - nowSeconds : -1;
          const isExpired = remaining <= 0 && endTime > 0;
          const isLpmFull = lotteryType === "LPM" && participants >= 100;
          const fmt = (s: number) => {
            const d = Math.floor(s / 86400);
            const h = Math.floor((s % 86400) / 3600);
            const m = Math.floor((s % 3600) / 60);
            const sec = s % 60;
            return d > 0
              ? `${d}d ${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`
              : `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
          };
          const showReady = isExpired || isLpmFull;
          return (
            <span
              key={tier.tier}
              className={`text-[10px] px-2 py-0.5 rounded-md font-mono font-medium transition-colors ${
                showReady
                  ? "bg-emerald-500/20 text-emerald-400 animate-pulse"
                  : isDarkMode
                    ? "bg-white/5 text-gray-400"
                    : "bg-gray-100 text-gray-500"
              }`}
            >
              ${tier.tier}{" "}
              {showReady
                ? "✓"
                : lotteryType === "LPM"
                  ? `${participants}/100`
                  : endTime > 0
                    ? fmt(remaining)
                    : "--:--:--"}
            </span>
          );
        })}
      </div>
    );
  };

  /* ── Live stats from chain data ── */
  const totalParticipants =
    lotteryAccounts?.reduce(
      (sum: number, l: any) => sum + (l.tiers?.reduce((ts: number, t: any) => ts + (t.participants || 0), 0) || 0),
      0,
    ) || 0;
  const totalPrizePool =
    lotteryAccounts?.reduce(
      (sum: number, l: any) => sum + (l.tiers?.reduce((ts: number, t: any) => ts + (t.prizePool || 0), 0) || 0),
      0,
    ) || 0;

  return (
    <div className="min-h-screen">
      {/* ═══════════════════  HERO  ═══════════════════ */}
      <section className="relative overflow-hidden py-24 px-4 sm:px-8">
        {/* Ambient glow blobs */}
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -top-40 -left-40 w-[500px] h-[500px] rounded-full bg-blue-600/10 blur-[120px]" />
          <div className="absolute top-20 right-0 w-[400px] h-[400px] rounded-full bg-purple-600/10 blur-[100px]" />
          <div className="absolute bottom-0 left-1/3 w-[350px] h-[350px] rounded-full bg-cyan-600/[0.08] blur-[100px]" />
        </div>

        <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8 }} className="relative max-w-6xl mx-auto text-center">
          {/* Logo */}
          <motion.div initial={{ scale: 0, rotate: -180 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: "spring", stiffness: 150, delay: 0.2 }} className="inline-block mb-8">
            <div className="relative w-32 h-32 mx-auto group">
              {/* Coral glow */}
              <div className="absolute inset-0 rounded-full bg-gradient-to-br from-red-500/30 via-rose-600/20 to-red-800/30 blur-xl group-hover:blur-2xl transition-all duration-500" />
              {/* Red Coral (Moonga) stone */}
              <div className="relative w-32 h-32 rounded-full bg-gradient-to-br from-[#e04040] via-[#c62828] to-[#8b1a1a] flex items-center justify-center shadow-2xl shadow-red-900/50 group-hover:scale-105 transition-transform duration-500 ring-2 ring-red-400/25"
                style={{ borderRadius: '50% 50% 50% 50% / 55% 55% 45% 45%' }}
              >
                {/* Lustre highlights */}
                <div className="absolute top-2 left-4 w-10 h-6 rounded-full bg-gradient-to-br from-white/25 to-transparent blur-sm" />
                <div className="absolute top-3 right-5 w-6 h-4 rounded-full bg-gradient-to-br from-white/15 to-transparent blur-sm" />
                {/* Trophy */}
                <Trophy className="w-14 h-14 text-amber-100 drop-shadow-[0_2px_8px_rgba(255,200,50,0.35)] relative z-10" />
              </div>
            </div>
          </motion.div>

          <h1 className="text-6xl md:text-8xl font-black mb-2 tracking-tight">
            <span className="bg-gradient-to-r from-blue-400 via-purple-400 to-cyan-400 bg-clip-text text-transparent">Fortress</span>
            <span className="bg-gradient-to-r from-cyan-400 via-indigo-400 to-purple-500 bg-clip-text text-transparent"> Protocol</span>
          </h1>
          <p className="text-lg md:text-xl font-semibold tracking-[0.25em] uppercase mb-6">
            <span className="bg-gradient-to-r from-blue-400 via-purple-300 to-cyan-400 bg-clip-text text-transparent">Token Pool</span>
          </p>

          <p className={`text-xl md:text-2xl mb-10 max-w-3xl mx-auto leading-relaxed ${isDarkMode ? "text-gray-300" : "text-gray-600"}`}>
            The <span className="font-bold text-blue-400">decentralized</span>, <span className="font-bold text-purple-400">provably fair</span> lottery protocol on{" "}
            <span className="font-bold text-cyan-400">Solana</span> — four lottery types, sixteen tiers, zero trust required.
          </p>

          {/* Benefit pills — click for full detail */}
          <div className="flex flex-wrap justify-center gap-3 mb-10">
            {FEATURE_DETAILS.map((item, i) => (
              <motion.button
                key={i}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 + i * 0.1 }}
                onClick={() => setActiveFeature(i)}
                whileHover={{ scale: 1.04, y: -2 }}
                whileTap={{ scale: 0.96 }}
                className={`group relative flex items-center gap-2.5 px-5 py-2.5 rounded-xl bg-gradient-to-r ${item.color} border backdrop-blur-sm text-sm font-bold cursor-pointer shadow-sm hover:shadow-md transition-shadow duration-200 overflow-hidden`}
              >
                {/* Shine sweep on hover */}
                <span className="pointer-events-none absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-500 bg-gradient-to-r from-transparent via-white/10 to-transparent" />
                <item.icon className="w-4 h-4 flex-shrink-0" />
                <span>{item.text}</span>
                {/* Tiny chevron hint */}
                <span className="opacity-50 text-[10px] ml-0.5">›</span>
              </motion.button>
            ))}
          </div>

          {/* Live stats bar */}
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.9 }}
            className={`inline-flex flex-wrap items-center gap-6 px-6 py-3 rounded-2xl border ${isDarkMode ? "bg-white/[0.03] border-white/10" : "bg-white/80 border-gray-200 shadow-sm"} backdrop-blur-sm`}
          >
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
              <span className={`text-xs font-mono uppercase tracking-wider ${isDarkMode ? "text-gray-500" : "text-gray-400"}`}>Live on Mainnet</span>
            </div>
            <div className={`h-4 w-px ${isDarkMode ? "bg-white/10" : "bg-gray-200"}`} />
            <div className="text-sm">
              <span className={isDarkMode ? "text-gray-400" : "text-gray-500"}>Participants: </span>
              <span className={`font-bold font-mono ${isDarkMode ? "text-white" : "text-gray-900"}`}>{totalParticipants}</span>
            </div>
            <div className={`h-4 w-px ${isDarkMode ? "bg-white/10" : "bg-gray-200"}`} />
            <div className="text-sm">
              <span className={isDarkMode ? "text-gray-400" : "text-gray-500"}>Active Pools: </span>
              <span className={`font-bold font-mono ${isDarkMode ? "text-white" : "text-gray-900"}`}>
                {totalPrizePool > 0 ? totalPrizePool.toLocaleString(undefined, { maximumFractionDigits: 0 }) : "0"} FPT
              </span>
            </div>
          </motion.div>

          {/* How It Works — 3 steps */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.1 }}
            className="mt-12 max-w-4xl mx-auto"
          >
            <div className="text-center mb-10">
              <div
                className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-mono uppercase tracking-widest mb-4 ${
                  isDarkMode ? "bg-purple-500/10 text-purple-400 border border-purple-500/20" : "bg-purple-50 text-purple-600 border border-purple-200"
                }`}
              >
                Three Easy Steps
              </div>
              <h2 className={`text-4xl md:text-5xl font-black mb-4 ${isDarkMode ? "text-white" : "text-gray-900"}`}>How It Works</h2>
              <p className={`text-lg max-w-2xl mx-auto ${isDarkMode ? "text-gray-400" : "text-gray-600"}`}>
                From wallet connect to winning — the entire process is on-chain, instant, and requires no sign-up.
              </p>
            </div>
            <div className="grid sm:grid-cols-3 gap-4">
              {[
                {
                  n: "01",
                  icon: Wallet,
                  accent: "from-blue-500 to-cyan-500",
                  border: isDarkMode ? "border-blue-500/20" : "border-blue-200",
                  title: "Get FPT & Connect",
                  body: "Swap SOL for FPT tokens directly in your Solana wallet — any DEX works. Then connect your wallet to Fortress. Your FPT balance is your entry currency across all tiers.",
                  mintAddress: "3YTnzmFTECtyKDxaghWPQcjzX7g1Cj3NxMq41JdWk2rj",
                },
                {
                  n: "02",
                  icon: Trophy,
                  accent: "from-purple-500 to-pink-500",
                  border: isDarkMode ? "border-purple-500/20" : "border-purple-200",
                  title: "Buy a Ticket",
                  body: "Pick a lottery type and tier ($5 · $10 · $15 · $20). Each ticket costs exactly that tier's value in FPT at the live market rate. Your wallet address is recorded on-chain in a paginated participant ledger — immutable and verifiable by anyone.",
                },
                {
                  n: "03",
                  icon: Zap,
                  accent: "from-emerald-500 to-green-500",
                  border: isDarkMode ? "border-emerald-500/20" : "border-emerald-200",
                  title: "Win Instantly",
                  body: "For Lightning Pool (LPM): when 100 participants join, the draw fires automatically. For time-based pools (Daily · Weekly · Monthly): when the countdown expires. Either way, the SGX oracle picks a winner in ~2 seconds and the winning-prize arrives in their wallet in the same block — no claim, no delay.",
                },
              ].map((step, i) => {
                const Icon = step.icon;
                return (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    whileHover={{ y: -5, scale: 1.025 }}
                    transition={{ delay: 1.2 + i * 0.12, type: "spring", stiffness: 280, damping: 22 }}
                    className={`group relative p-5 rounded-2xl border ${step.border} ${
                      isDarkMode ? "bg-white/[0.03]" : "bg-white/80"
                    } backdrop-blur-sm text-left overflow-hidden hover:shadow-xl transition-shadow duration-300`}
                  >
                    {/* shine sweep */}
                    <div className="pointer-events-none absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-700 bg-gradient-to-r from-transparent via-white/[0.06] to-transparent" />
                    {/* Step number — large background ghost */}
                    <span
                      className={`absolute top-3 right-4 text-6xl font-black select-none pointer-events-none bg-gradient-to-br ${step.accent} bg-clip-text text-transparent opacity-10`}
                    >
                      {step.n}
                    </span>

                    {/* Icon badge */}
                    <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${step.accent} flex items-center justify-center mb-4 shadow-lg`}>
                      <Icon className="w-5 h-5 text-white" />
                    </div>

                    {/* Step label */}
                    <p className={`text-[10px] font-mono font-bold uppercase tracking-widest mb-1 bg-gradient-to-r ${step.accent} bg-clip-text text-transparent`}>
                      Step {step.n}
                    </p>

                    {/* Title */}
                    <h3 className={`text-base font-black mb-2 ${isDarkMode ? "text-white" : "text-gray-900"}`}>
                      {step.title}
                    </h3>

                    {/* Body */}
                    <p className={`text-xs leading-relaxed ${isDarkMode ? "text-gray-400" : "text-gray-600"}`}>
                      {step.body}
                    </p>

                    {/* FPT Mint Address — step 01 only */}
                    {'mintAddress' in step && (
                      <FptMintPill mint={step.mintAddress as string} isDarkMode={isDarkMode} />
                    )}
                  </motion.div>
                );
              })}
            </div>
          </motion.div>
        </motion.div>
      </section>

      {/* ═══════════════════  DRAW TRIGGER SYSTEM  ═══════════════════ */}
      <section className={`py-20 px-4 sm:px-8 ${isDarkMode ? "" : "bg-gray-50/50"}`}>
        <div className="max-w-6xl mx-auto">
          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="text-center mb-14">
            <div
              className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-mono uppercase tracking-widest mb-4 ${
                isDarkMode ? "bg-cyan-500/10 text-cyan-400 border border-cyan-500/20" : "bg-cyan-50 text-cyan-600 border border-cyan-200"
              }`}
            >
              Secured by Switchboard V3 TEE VRF
            </div>
            <h2 className={`text-4xl md:text-5xl font-black mb-4 ${isDarkMode ? "text-white" : "text-gray-900"}`}>How Draws Work</h2>
            <p className={`text-lg max-w-2xl mx-auto ${isDarkMode ? "text-gray-400" : "text-gray-600"}`}>
              Every draw runs fully automatic. If automation ever stalls, any wallet can step in as a manual fallback — earning an FPT bounty with three simple clicks.
            </p>
          </motion.div>

          <div className="grid md:grid-cols-2 gap-6 mb-8">
            {/* Auto-Trigger Card */}
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              whileHover={{ y: -6, scale: 1.008 }}
              viewport={{ once: true }}
              transition={{ type: "spring", stiffness: 280, damping: 22 }}
              className={`group relative rounded-2xl p-8 overflow-hidden transition-[border-color,box-shadow] duration-300 ${isDarkMode ? "bg-white/[0.03] border border-white/10 hover:border-green-500/50 hover:shadow-2xl hover:shadow-green-500/15" : "bg-white shadow-lg border border-gray-100 hover:border-green-300 hover:shadow-2xl hover:shadow-green-400/20"}`}
            >
              <div className="absolute top-0 right-0 w-40 h-40 bg-gradient-to-br from-green-500/10 to-emerald-500/10 rounded-full blur-3xl transition-all duration-500 group-hover:w-72 group-hover:h-72 group-hover:from-green-500/20 group-hover:to-emerald-500/20" />
              <div className="pointer-events-none absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-700 bg-gradient-to-r from-transparent via-white/[0.04] to-transparent" />
              <div className="relative">
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-green-500 to-emerald-500 flex items-center justify-center shadow-lg shadow-green-500/20">
                    <Bot className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h3 className={`text-xl font-bold ${isDarkMode ? "text-white" : "text-gray-900"}`}>Auto-Trigger</h3>
                    <p className={`text-xs ${isDarkMode ? "text-green-400" : "text-green-600"}`}>On-house · Zero user action</p>
                  </div>
                </div>
                <p className={`text-sm leading-relaxed mb-5 ${isDarkMode ? "text-gray-400" : "text-gray-600"}`}>
                  The keeper bot continuously monitors all 16 tiers. The instant a tier is eligible — LPM fills to 100 or a timer expires with participants — the bot automatically requests
                  randomness, waits for the oracle, and finalizes the draw. All costs paid by the protocol treasury.
                </p>
                <div className={`rounded-xl p-4 font-mono text-xs ${isDarkMode ? "bg-black/30 border border-green-500/10" : "bg-green-50 border border-green-100"}`}>
                  <div className={isDarkMode ? "text-green-400" : "text-green-700"}>
                    detect → commit → <span className={isDarkMode ? "text-cyan-400" : "text-cyan-700"}>SGX oracle (~2s)</span> → reveal →{" "}
                    <span className={isDarkMode ? "text-emerald-300" : "text-emerald-700"}>winner paid</span>
                  </div>
                </div>
              </div>
            </motion.div>

            {/* Manual Trigger Card */}
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              whileInView={{ opacity: 1, x: 0 }}
              whileHover={{ y: -6, scale: 1.008 }}
              viewport={{ once: true }}
              transition={{ type: "spring", stiffness: 280, damping: 22 }}
              className={`group relative rounded-2xl p-8 overflow-hidden transition-[border-color,box-shadow] duration-300 ${isDarkMode ? "bg-white/[0.03] border border-white/10 hover:border-cyan-500/50 hover:shadow-2xl hover:shadow-cyan-500/15" : "bg-white shadow-lg border border-gray-100 hover:border-cyan-300 hover:shadow-2xl hover:shadow-cyan-400/20"}`}
            >
              <div className="absolute top-0 right-0 w-40 h-40 bg-gradient-to-br from-cyan-500/10 to-blue-500/10 rounded-full blur-3xl transition-all duration-500 group-hover:w-72 group-hover:h-72 group-hover:from-cyan-500/20 group-hover:to-blue-500/20" />
              <div className="pointer-events-none absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-700 bg-gradient-to-r from-transparent via-white/[0.04] to-transparent" />
              <div className="relative">
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-500 flex items-center justify-center shadow-lg shadow-cyan-500/20">
                    <UserCheck className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h3 className={`text-xl font-bold ${isDarkMode ? "text-white" : "text-gray-900"}`}>Manual Trigger</h3>
                    <p className={`text-xs ${isDarkMode ? "text-cyan-400" : "text-cyan-600"}`}>Community · Earn FPT bounty</p>
                  </div>
                </div>
                <p className={`text-sm leading-relaxed mb-5 ${isDarkMode ? "text-gray-400" : "text-gray-600"}`}>
                  If the automation stalls for any reason, any connected wallet can complete the draw in three clicks. Click once to request entropy, click again after the oracle commits (~5s), then click to finalize — and the FPT settler bounty lands in your wallet on that last click, in the same block the winner is paid.
                </p>
                <div className={`rounded-xl p-4 font-mono text-xs ${isDarkMode ? "bg-black/30 border border-cyan-500/10" : "bg-cyan-50 border border-cyan-100"}`}>
                  <div className={isDarkMode ? "text-cyan-400" : "text-cyan-700"}>
                    click 1: request → <span className={isDarkMode ? "text-purple-400" : "text-purple-700"}>SGX oracle (~5s)</span> → click 2: reveal → click 3: finalize →{" "}
                    <span className={isDarkMode ? "text-emerald-300" : "text-emerald-700"}>winner paid + FPT bounty in your wallet</span>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>

        </div>
      </section>

      {/* ═══════════════════  THE FOUR LOTTERY TYPES  ═══════════════════ */}
      <section className="py-20 px-4 sm:px-8">
        <div className="max-w-6xl mx-auto">
          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="text-center mb-14">
            <h2 className={`text-4xl md:text-5xl font-black mb-4 ${isDarkMode ? "text-white" : "text-gray-900"}`}>Four Games. Sixteen Tiers.</h2>
            <p className={`text-lg max-w-2xl mx-auto ${isDarkMode ? "text-gray-400" : "text-gray-600"}`}>
              One ecosystem running four independent lottery types in parallel — each with its own rhythm, prize pools, and risk profile. All powered by one smart contract and one provably fair
              randomness source.
            </p>
          </motion.div>

          <div className="space-y-6">
            {/* ── LPM ── */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              whileHover={{ y: -6, scale: 1.008 }}
              viewport={{ once: true }}
              transition={{ type: "spring", stiffness: 280, damping: 22 }}
              className={`group relative rounded-2xl overflow-hidden transition-[border-color,box-shadow] duration-300 ${
                isDarkMode
                  ? "bg-gradient-to-r from-yellow-500/[0.06] to-orange-500/[0.06] border border-yellow-500/20 hover:border-yellow-500/60 hover:shadow-2xl hover:shadow-yellow-500/20"
                  : "bg-gradient-to-r from-yellow-50 to-orange-50 border border-yellow-200 hover:border-yellow-400 hover:shadow-2xl hover:shadow-yellow-400/20"
              }`}
            >
              {/* expanding glow orb */}
              <div className="absolute top-0 right-0 w-60 h-60 bg-gradient-to-br from-yellow-500/10 to-orange-500/10 rounded-full blur-3xl transition-all duration-500 group-hover:w-96 group-hover:h-96 group-hover:from-yellow-500/25 group-hover:to-orange-500/25" />
              {/* shine sweep */}
              <div className="pointer-events-none absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-700 bg-gradient-to-r from-transparent via-white/[0.04] to-transparent" />
              <div className="relative p-8 md:p-10">
                <div className="flex flex-col lg:flex-row items-start gap-8">
                  <div className="flex-shrink-0">
                    <div className="w-20 h-20 bg-gradient-to-br from-yellow-500 to-orange-500 rounded-2xl flex items-center justify-center shadow-xl shadow-yellow-500/20 rotate-3 hover:rotate-0 transition-transform">
                      <Zap className="w-10 h-10 text-white" />
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-3 mb-3">
                      <h3 className={`text-2xl md:text-3xl font-black ${isDarkMode ? "text-white" : "text-gray-900"}`}>Lightning Pool</h3>
                      <span className="px-2.5 py-0.5 text-xs font-bold rounded-md bg-yellow-500/20 text-yellow-500 border border-yellow-500/30">LPM</span>
                      <span className="px-2.5 py-0.5 text-xs font-mono rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">Capacity-Based</span>
                    </div>
                    <p className={`text-base leading-relaxed mb-5 max-w-2xl ${isDarkMode ? "text-gray-300" : "text-gray-700"}`}>
                      No timers. No countdowns. The draw fires the instant <strong className={isDarkMode ? "text-yellow-400" : "text-yellow-600"}>100 participants</strong> fill a tier. Pool
                      size is perfectly predictable. Prize payout is atomic — winning-prize to winner in the same transaction block.
                    </p>
                    <div className="flex flex-wrap items-center gap-4 mb-5">
                      <div className="grid grid-cols-4 gap-2">
                        {[5, 10, 20, 50].map((p) => (
                          <div key={p} className={`text-center px-3 py-2 rounded-lg ${isDarkMode ? "bg-black/20 border border-yellow-500/15" : "bg-white shadow-sm border border-yellow-100"}`}>
                            <div className="text-lg font-bold text-yellow-500">${p}</div>
                            <div className={`text-[10px] ${isDarkMode ? "text-gray-500" : "text-gray-400"}`}>FPT</div>
                          </div>
                        ))}
                      </div>
                      <div className="flex flex-wrap gap-3 text-sm">
                        <span className={`flex items-center gap-1.5 ${isDarkMode ? "text-gray-400" : "text-gray-500"}`}>
                          <Users className="w-4 h-4 text-yellow-500" /> 100 per tier
                        </span>
                        <span className={`flex items-center gap-1.5 ${isDarkMode ? "text-gray-400" : "text-gray-500"}`}>
                          <Zap className="w-4 h-4 text-orange-500" /> No time limit
                        </span>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-4">
                      <Link href="/lpm">
                        <motion.button
                          whileHover={{ scale: 1.03 }}
                          whileTap={{ scale: 0.97 }}
                          className="px-6 py-3 bg-gradient-to-r from-yellow-500 to-orange-500 text-white font-bold rounded-xl shadow-lg shadow-yellow-500/20 hover:shadow-xl hover:shadow-yellow-500/30 transition-all flex items-center gap-2"
                        >
                          Play Lightning Pool <ArrowRight className="w-4 h-4" />
                        </motion.button>
                      </Link>
                      <TierTimers lotteryType="LPM" />
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>

            {/* ── DPL ── */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              whileHover={{ y: -6, scale: 1.008 }}
              viewport={{ once: true }}
              transition={{ type: "spring", stiffness: 280, damping: 22 }}
              className={`group relative rounded-2xl overflow-hidden transition-[border-color,box-shadow] duration-300 ${
                isDarkMode
                  ? "bg-gradient-to-r from-blue-500/[0.06] to-cyan-500/[0.06] border border-blue-500/20 hover:border-blue-500/60 hover:shadow-2xl hover:shadow-blue-500/20"
                  : "bg-gradient-to-r from-blue-50 to-cyan-50 border border-blue-200 hover:border-blue-400 hover:shadow-2xl hover:shadow-blue-400/20"
              }`}
            >
              <div className="absolute top-0 right-0 w-60 h-60 bg-gradient-to-br from-blue-500/10 to-cyan-500/10 rounded-full blur-3xl transition-all duration-500 group-hover:w-96 group-hover:h-96 group-hover:from-blue-500/25 group-hover:to-cyan-500/25" />
              <div className="pointer-events-none absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-700 bg-gradient-to-r from-transparent via-white/[0.04] to-transparent" />
              <div className="relative p-8 md:p-10">
                <div className="flex flex-col lg:flex-row items-start gap-8">
                  <div className="flex-shrink-0">
                    <div className="w-20 h-20 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-2xl flex items-center justify-center shadow-xl shadow-blue-500/20 -rotate-3 hover:rotate-0 transition-transform">
                      <Sun className="w-10 h-10 text-white" />
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-3 mb-3">
                      <h3 className={`text-2xl md:text-3xl font-black ${isDarkMode ? "text-white" : "text-gray-900"}`}>Daily Pool</h3>
                      <span className="px-2.5 py-0.5 text-xs font-bold rounded-md bg-blue-500/20 text-blue-400 border border-blue-500/30">DPL</span>
                      <span className="px-2.5 py-0.5 text-xs font-mono rounded-md bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">24-Hour Cycle</span>
                    </div>
                    <p className={`text-base leading-relaxed mb-5 max-w-2xl ${isDarkMode ? "text-gray-300" : "text-gray-700"}`}>
                      Fresh draws every <strong className={isDarkMode ? "text-blue-400" : "text-blue-600"}>24 hours</strong>. Unlimited participants per tier. When the timer expires, the draw
                      triggers automatically or any community member can settle it and earn an{" "}
                      <strong className={isDarkMode ? "text-yellow-400" : "text-yellow-600"}>FPT reward</strong>. The fastest turnaround of all time-based pools — 1,460 draws per year.
                    </p>
                    <div className="flex flex-wrap items-center gap-4 mb-5">
                      <div className="grid grid-cols-4 gap-2">
                        {[5, 10, 15, 20].map((p) => (
                          <div key={p} className={`text-center px-3 py-2 rounded-lg ${isDarkMode ? "bg-black/20 border border-blue-500/15" : "bg-white shadow-sm border border-blue-100"}`}>
                            <div className="text-lg font-bold text-blue-500">${p}</div>
                            <div className={`text-[10px] ${isDarkMode ? "text-gray-500" : "text-gray-400"}`}>FPT</div>
                          </div>
                        ))}
                      </div>
                      <div className="flex flex-wrap gap-3 text-sm">
                        <span className={`flex items-center gap-1.5 ${isDarkMode ? "text-gray-400" : "text-gray-500"}`}>
                          <Clock className="w-4 h-4 text-blue-500" /> 24h rounds
                        </span>
                        <span className={`flex items-center gap-1.5 ${isDarkMode ? "text-gray-400" : "text-gray-500"}`}>
                          <Users className="w-4 h-4 text-cyan-500" /> Unlimited
                        </span>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-4">
                      <Link href="/dpl">
                        <motion.button
                          whileHover={{ scale: 1.03 }}
                          whileTap={{ scale: 0.97 }}
                          className="px-6 py-3 bg-gradient-to-r from-blue-500 to-cyan-500 text-white font-bold rounded-xl shadow-lg shadow-blue-500/20 hover:shadow-xl hover:shadow-blue-500/30 transition-all flex items-center gap-2"
                        >
                          Play Daily Pool <ArrowRight className="w-4 h-4" />
                        </motion.button>
                      </Link>
                      <TierTimers lotteryType="DPL" />
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>

            {/* ── WPL ── */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              whileHover={{ y: -6, scale: 1.008 }}
              viewport={{ once: true }}
              transition={{ type: "spring", stiffness: 280, damping: 22 }}
              className={`group relative rounded-2xl overflow-hidden transition-[border-color,box-shadow] duration-300 ${
                isDarkMode
                  ? "bg-gradient-to-r from-indigo-500/[0.06] to-purple-500/[0.06] border border-indigo-500/20 hover:border-indigo-500/60 hover:shadow-2xl hover:shadow-indigo-500/20"
                  : "bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-200 hover:border-indigo-400 hover:shadow-2xl hover:shadow-indigo-400/20"
              }`}
            >
              <div className="absolute top-0 right-0 w-60 h-60 bg-gradient-to-br from-indigo-500/10 to-purple-500/10 rounded-full blur-3xl transition-all duration-500 group-hover:w-96 group-hover:h-96 group-hover:from-indigo-500/25 group-hover:to-purple-500/25" />
              <div className="pointer-events-none absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-700 bg-gradient-to-r from-transparent via-white/[0.04] to-transparent" />
              <div className="relative p-8 md:p-10">
                <div className="flex flex-col lg:flex-row items-start gap-8">
                  <div className="flex-shrink-0">
                    <div className="w-20 h-20 bg-gradient-to-br from-indigo-500 to-purple-500 rounded-2xl flex items-center justify-center shadow-xl shadow-indigo-500/20 rotate-3 hover:rotate-0 transition-transform">
                      <Calendar className="w-10 h-10 text-white" />
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-3 mb-3">
                      <h3 className={`text-2xl md:text-3xl font-black ${isDarkMode ? "text-white" : "text-gray-900"}`}>Weekly Pool</h3>
                      <span className="px-2.5 py-0.5 text-xs font-bold rounded-md bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">WPL</span>
                      <span className="px-2.5 py-0.5 text-xs font-mono rounded-md bg-purple-500/10 text-purple-400 border border-purple-500/20">7-Day Cycle</span>
                    </div>
                    <p className={`text-base leading-relaxed mb-5 max-w-2xl ${isDarkMode ? "text-gray-300" : "text-gray-700"}`}>
                      Seven days of accumulation compound into <strong className={isDarkMode ? "text-indigo-400" : "text-indigo-600"}>larger prize pools</strong>. The sweet spot between daily
                      frequency and monthly jackpots — 208 draws per year across four tiers. Same provably fair VRF, same instant payout, bigger rewards.
                    </p>
                    <div className="flex flex-wrap items-center gap-4 mb-5">
                      <div className="grid grid-cols-4 gap-2">
                        {[5, 10, 15, 20].map((p) => (
                          <div key={p} className={`text-center px-3 py-2 rounded-lg ${isDarkMode ? "bg-black/20 border border-indigo-500/15" : "bg-white shadow-sm border border-indigo-100"}`}>
                            <div className="text-lg font-bold text-indigo-500">${p}</div>
                            <div className={`text-[10px] ${isDarkMode ? "text-gray-500" : "text-gray-400"}`}>FPT</div>
                          </div>
                        ))}
                      </div>
                      <div className="flex flex-wrap gap-3 text-sm">
                        <span className={`flex items-center gap-1.5 ${isDarkMode ? "text-gray-400" : "text-gray-500"}`}>
                          <Clock className="w-4 h-4 text-indigo-500" /> 7-day cycles
                        </span>
                        <span className={`flex items-center gap-1.5 ${isDarkMode ? "text-gray-400" : "text-gray-500"}`}>
                          <Users className="w-4 h-4 text-purple-500" /> Unlimited
                        </span>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-4">
                      <Link href="/wpl">
                        <motion.button
                          whileHover={{ scale: 1.03 }}
                          whileTap={{ scale: 0.97 }}
                          className="px-6 py-3 bg-gradient-to-r from-indigo-500 to-purple-500 text-white font-bold rounded-xl shadow-lg shadow-indigo-500/20 hover:shadow-xl hover:shadow-indigo-500/30 transition-all flex items-center gap-2"
                        >
                          Play Weekly Pool <ArrowRight className="w-4 h-4" />
                        </motion.button>
                      </Link>
                      <TierTimers lotteryType="WPL" />
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>

            {/* ── MPL ── */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              whileHover={{ y: -6, scale: 1.008 }}
              viewport={{ once: true }}
              transition={{ type: "spring", stiffness: 280, damping: 22 }}
              className={`group relative rounded-2xl overflow-hidden transition-[border-color,box-shadow] duration-300 ${
                isDarkMode
                  ? "bg-gradient-to-r from-orange-500/[0.06] to-rose-500/[0.06] border border-orange-500/20 hover:border-orange-500/60 hover:shadow-2xl hover:shadow-orange-500/20"
                  : "bg-gradient-to-r from-orange-50 to-rose-50 border border-orange-200 hover:border-orange-400 hover:shadow-2xl hover:shadow-orange-400/20"
              }`}
            >
              <div className="absolute top-0 right-0 w-60 h-60 bg-gradient-to-br from-orange-500/10 to-rose-500/10 rounded-full blur-3xl transition-all duration-500 group-hover:w-96 group-hover:h-96 group-hover:from-orange-500/25 group-hover:to-rose-500/25" />
              <div className="pointer-events-none absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-700 bg-gradient-to-r from-transparent via-white/[0.04] to-transparent" />
              <div className="relative p-8 md:p-10">
                <div className="flex flex-col lg:flex-row items-start gap-8">
                  <div className="flex-shrink-0">
                    <div className="w-20 h-20 bg-gradient-to-br from-orange-500 to-rose-500 rounded-2xl flex items-center justify-center shadow-xl shadow-orange-500/20 -rotate-3 hover:rotate-0 transition-transform">
                      <Trophy className="w-10 h-10 text-white" />
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-3 mb-3">
                      <h3 className={`text-2xl md:text-3xl font-black ${isDarkMode ? "text-white" : "text-gray-900"}`}>Monthly Pool</h3>
                      <span className="px-2.5 py-0.5 text-xs font-bold rounded-md bg-orange-500/20 text-orange-400 border border-orange-500/30">MPL</span>
                      <span className="px-2.5 py-0.5 text-xs font-mono rounded-md bg-rose-500/10 text-rose-400 border border-rose-500/20">30-Day Cycle</span>
                    </div>
                    <p className={`text-base leading-relaxed mb-5 max-w-2xl ${isDarkMode ? "text-gray-300" : "text-gray-700"}`}>
                      The highest-stakes event. <strong className={isDarkMode ? "text-orange-400" : "text-orange-600"}>30 days</strong> of ticket sales compound into the largest possible
                      jackpots. 48 grand draws per year. Maximum accumulation, maximum reward. Patience pays off.
                    </p>
                    <div className="flex flex-wrap items-center gap-4 mb-5">
                      <div className="grid grid-cols-4 gap-2">
                        {[5, 10, 15, 20].map((p) => (
                          <div key={p} className={`text-center px-3 py-2 rounded-lg ${isDarkMode ? "bg-black/20 border border-orange-500/15" : "bg-white shadow-sm border border-orange-100"}`}>
                            <div className="text-lg font-bold text-orange-500">${p}</div>
                            <div className={`text-[10px] ${isDarkMode ? "text-gray-500" : "text-gray-400"}`}>FPT</div>
                          </div>
                        ))}
                      </div>
                      <div className="flex flex-wrap gap-3 text-sm">
                        <span className={`flex items-center gap-1.5 ${isDarkMode ? "text-gray-400" : "text-gray-500"}`}>
                          <Clock className="w-4 h-4 text-orange-500" /> 30-day cycles
                        </span>
                        <span className={`flex items-center gap-1.5 ${isDarkMode ? "text-gray-400" : "text-gray-500"}`}>
                          <Users className="w-4 h-4 text-rose-500" /> Unlimited
                        </span>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-4">
                      <Link href="/mpl">
                        <motion.button
                          whileHover={{ scale: 1.03 }}
                          whileTap={{ scale: 0.97 }}
                          className="px-6 py-3 bg-gradient-to-r from-orange-500 to-rose-500 text-white font-bold rounded-xl shadow-lg shadow-orange-500/20 hover:shadow-xl hover:shadow-orange-500/30 transition-all flex items-center gap-2"
                        >
                          Play Monthly Pool <ArrowRight className="w-4 h-4" />
                        </motion.button>
                      </Link>
                      <TierTimers lotteryType="MPL" />
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ═══════════════════  PROTOCOL ARCHITECTURE  ═══════════════════ */}
      <section className={`py-20 px-4 sm:px-8 ${isDarkMode ? "" : "bg-gray-50/50"}`}>
        <div className="max-w-6xl mx-auto">
          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="text-center mb-14">
            <h2 className={`text-4xl md:text-5xl font-black mb-4 ${isDarkMode ? "text-white" : "text-gray-900"}`}>Under the Hood</h2>
            <p className={`text-lg max-w-2xl mx-auto ${isDarkMode ? "text-gray-400" : "text-gray-600"}`}>
              17 on-chain instructions. 16 independent vaults. One immutable smart contract. Every function is verifiable on-chain.
            </p>
          </motion.div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {[
              {
                icon: Database,
                title: "PDA Vaults",
                desc: "All funds held in Program Derived Addresses — code-controlled accounts with no private keys. Zero custodial risk.",
                color: "from-blue-500 to-cyan-500",
                borderColor: "border-blue-500/20",
              },
              {
                icon: Cpu,
                title: "Switchboard V3 TEE",
                desc: "Winner selection via Intel SGX enclave oracle. 32-byte verifiable random value — even the oracle operator cannot predict outcomes.",
                color: "from-purple-500 to-pink-500",
                borderColor: "border-purple-500/20",
              },
              {
                icon: Shield,
                title: "Winning-Prize Split",
                desc: "The 95% winning-prize of each pool goes directly to the winner in the same block. The 5% funds protocol operations — oracle fees, rent, and community rewards.",
                color: "from-emerald-500 to-green-500",
                borderColor: "border-emerald-500/20",
              },
              {
                icon: Layers,
                title: "Linked-List Sharding",
                desc: "Participant lists use paginated PDAs (50 wallets per page) — the protocol scales to unlimited participants per tier with no bottlenecks.",
                color: "from-yellow-500 to-amber-500",
                borderColor: "border-yellow-500/20",
              },
              {
                icon: RefreshCw,
                title: "Perpetual Cycles",
                desc: "After each draw, vaults auto-reset with a fresh timer and new round number. Dead pools (expired, 0 participants) reset via lazy_reset — permissionless.",
                color: "from-indigo-500 to-violet-500",
                borderColor: "border-indigo-500/20",
              },
              {
                icon: BarChart3,
                title: "On-Chain Registry",
                desc: "GlobalRegistry tracks total participants, total prizes distributed, and round numbers across all 16 tiers. WinnerHistory stores the last 50 winners per tier.",
                color: "from-orange-500 to-red-500",
                borderColor: "border-orange-500/20",
              },
            ].map((item, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 15 }}
                whileInView={{ opacity: 1, y: 0 }}
                whileHover={{ y: -5, scale: 1.025 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.06, type: "spring", stiffness: 280, damping: 22 }}
                className={`group relative rounded-2xl p-6 overflow-hidden transition-shadow duration-300 hover:shadow-xl ${isDarkMode ? `bg-white/[0.03] border ${item.borderColor}` : "bg-white shadow-md border border-gray-100"}`}
              >
                <div className="pointer-events-none absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-700 bg-gradient-to-r from-transparent via-white/[0.05] to-transparent" />
                <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${item.color} flex items-center justify-center mb-4 shadow-lg`}>
                  <item.icon className="w-5 h-5 text-white" />
                </div>
                <h3 className={`text-lg font-bold mb-2 ${isDarkMode ? "text-white" : "text-gray-900"}`}>{item.title}</h3>
                <p className={`text-sm leading-relaxed ${isDarkMode ? "text-gray-400" : "text-gray-600"}`}>{item.desc}</p>
              </motion.div>
            ))}
          </div>

          {/* On-chain stats strip */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className={`mt-8 rounded-xl px-6 py-5 grid grid-cols-2 sm:grid-cols-4 gap-4 text-center ${
              isDarkMode ? "bg-white/[0.03] border border-white/10" : "bg-white shadow-sm border border-gray-100"
            }`}
          >
            {[
              { n: "17", label: "On-Chain Instructions" },
              { n: "16", label: "Independent Vaults" },
              { n: "1,716", label: "Annual Draws" },
              { n: "6", label: "State Account Types" },
            ].map((s) => (
              <div key={s.label}>
                <div className={`text-2xl font-black font-mono ${isDarkMode ? "text-white" : "text-gray-900"}`}>{s.n}</div>
                <div className={`text-xs ${isDarkMode ? "text-gray-500" : "text-gray-400"}`}>{s.label}</div>
              </div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ═══════════════════  LIVE ACTIVITY FEED  ═══════════════════ */}
      <section className="py-20 px-4 sm:px-8">
        <div className="max-w-6xl mx-auto">
          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="text-center mb-10">
            <h2 className={`text-4xl md:text-5xl font-black mb-4 ${isDarkMode ? "text-white" : "text-gray-900"}`}>Live Activity</h2>
            <p className={`text-lg max-w-2xl mx-auto ${isDarkMode ? "text-gray-400" : "text-gray-600"}`}>
              Real-time entries, draws, and winners — every transaction verifiable on the Solana blockchain.
            </p>
          </motion.div>
          <RegistryFeed />
        </div>
      </section>

      {/* ═══════════════════  FOOTER  ═══════════════════ */}
      <footer className={`py-10 px-4 sm:px-8 border-t ${isDarkMode ? "border-white/5" : "border-gray-100"}`}>
        <div className="max-w-6xl mx-auto text-center">
          <p className={`text-sm mb-2 ${isDarkMode ? "text-gray-500" : "text-gray-400"}`}>
            Built on Solana · Switchboard V3 TEE VRF · Token-2022 (FPT) · 16 Active Tiers
          </p>
          <p className={`text-xs ${isDarkMode ? "text-gray-600" : "text-gray-400"}`}>
            © {new Date().getFullYear()} Fortress Protocol — Decentralized. Provably Fair. Permissionless.
          </p>
        </div>
      </footer>

      {/* ═══════════════  FEATURE DETAIL MODAL  ═══════════════ */}
      <AnimatePresence>
        {activeFeature !== null && (() => {
          const feat = FEATURE_DETAILS[activeFeature];
          const Icon = feat.icon;
          return (
            <motion.div
              key="feature-modal-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setActiveFeature(null)}
              className="fixed inset-0 z-[9998] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md"
            >
              <motion.div
                key="feature-modal-card"
                initial={{ scale: 0.9, y: 30, opacity: 0 }}
                animate={{ scale: 1, y: 0, opacity: 1 }}
                exit={{ scale: 0.9, y: 30, opacity: 0 }}
                transition={{ type: "spring", damping: 20, stiffness: 300 }}
                onClick={(e) => e.stopPropagation()}
                className={`relative w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-3xl shadow-2xl ${
                  isDarkMode
                    ? "bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 border border-white/10"
                    : "bg-white border border-gray-200"
                }`}
              >
                {/* Top accent bar */}
                <div className={`absolute top-0 left-0 right-0 h-1 rounded-t-3xl bg-gradient-to-r ${feat.modalAccent}`} />

                <div className="p-8">
                  {/* Close */}
                  <button
                    onClick={() => setActiveFeature(null)}
                    className={`absolute top-4 right-4 p-2 rounded-full transition-all ${
                      isDarkMode ? "bg-white/10 hover:bg-white/20 text-gray-300" : "bg-black/5 hover:bg-black/10 text-gray-600"
                    }`}
                  >
                    <X className="w-5 h-5" />
                  </button>

                  {/* Header */}
                  <div className="flex items-center gap-4 mb-8">
                    <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${feat.modalAccent} flex items-center justify-center flex-shrink-0 shadow-lg`}>
                      <Icon className="w-7 h-7 text-white" />
                    </div>
                    <h2 className={`text-2xl font-black leading-tight ${isDarkMode ? "text-white" : "text-gray-900"}`}>
                      {feat.title}
                    </h2>
                  </div>

                  {/* Sections */}
                  <div className="space-y-6">
                    {feat.sections.map((sec, si) => (
                      <div key={si} className={`p-5 rounded-2xl ${isDarkMode ? "bg-white/5 border border-white/10" : "bg-gray-50 border border-gray-200"}`}>
                        <h3 className={`text-sm font-bold uppercase tracking-wider mb-2 bg-gradient-to-r ${feat.modalAccent} bg-clip-text text-transparent`}>
                          {sec.heading}
                        </h3>
                        <p className={`text-sm leading-relaxed ${isDarkMode ? "text-gray-300" : "text-gray-700"}`}>
                          {sec.body}
                        </p>
                      </div>
                    ))}
                  </div>

                  {/* Footer nav */}
                  <div className="flex gap-3 mt-8">
                    <button
                      onClick={() => setActiveFeature(null)}
                      className={`flex-1 py-3 rounded-xl font-bold transition-all ${
                        isDarkMode ? "bg-white/10 hover:bg-white/20 text-white" : "bg-gray-100 hover:bg-gray-200 text-gray-900"
                      }`}
                    >
                      Close
                    </button>
                    {activeFeature < FEATURE_DETAILS.length - 1 && (
                      <button
                        onClick={() => setActiveFeature(activeFeature + 1)}
                        className={`flex-1 py-3 rounded-xl font-bold text-white bg-gradient-to-r ${feat.modalAccent} hover:opacity-90 transition-all flex items-center justify-center gap-2`}
                      >
                        Next <ArrowRight className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              </motion.div>
            </motion.div>
          );
        })()}
      </AnimatePresence>
    </div>
  );
}
