"use client";

import { motion } from "framer-motion";
import { useTheme } from "@/contexts/ThemeContext";
import Link from "next/link";
import {
  Shield,
  Lock,
  Database,
  Zap,
  DollarSign,
  Users,
  TrendingUp,
  Award,
  Cpu,
  Link2,
  Server,
  CheckCircle2,
  Coins,
  Timer,
  BarChart3,
  Bot,
  UserCheck,
  RefreshCw,
  Layers,
  ArrowRight,
  Globe,
  ShieldCheck,
  Trophy,
} from "lucide-react";

export default function AboutPage() {
  const { isDarkMode } = useTheme();

  const c = {
    card: isDarkMode ? "bg-white/[0.03] border border-white/10" : "bg-white shadow-md border border-gray-100",
    h: isDarkMode ? "text-white" : "text-gray-900",
    body: isDarkMode ? "text-gray-300" : "text-gray-700",
    muted: isDarkMode ? "text-gray-400" : "text-gray-600",
    subtle: isDarkMode ? "text-gray-500" : "text-gray-400",
  };

  return (
    <div className="min-h-screen">
      {/* ═══ HERO ═══ */}
      <section className="relative overflow-hidden py-24 px-4 sm:px-8">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -top-32 -left-32 w-[450px] h-[450px] rounded-full bg-blue-600/10 blur-[120px]" />
          <div className="absolute top-16 right-0 w-[350px] h-[350px] rounded-full bg-purple-600/10 blur-[100px]" />
        </div>
        <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7 }} className="relative max-w-5xl mx-auto text-center">
          <motion.div initial={{ scale: 0, rotate: -180 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: "spring", stiffness: 150, delay: 0.2 }} className="inline-block mb-6">
            <div className="w-24 h-24 bg-gradient-to-br from-blue-500 via-purple-500 to-pink-500 rounded-3xl flex items-center justify-center mx-auto shadow-2xl rotate-12 hover:rotate-0 transition-transform duration-500">
              <Shield className="w-12 h-12 text-white" />
            </div>
          </motion.div>

          <h1 className={`text-5xl md:text-7xl font-black mb-4 ${c.h}`}>
            About <span className="bg-gradient-to-r from-blue-400 via-purple-400 to-cyan-400 bg-clip-text text-transparent">Fortress Protocol</span>
          </h1>
          <p className={`text-xl md:text-2xl max-w-3xl mx-auto leading-relaxed ${c.muted}`}>
            The most secure, transparent, and fair lottery system on Solana — four lottery types, sixteen independent vaults, zero trust required.
          </p>
        </motion.div>
      </section>

      {/* ═══ CORE PILLARS ═══ */}
      <section className={`py-20 px-4 sm:px-8 ${isDarkMode ? "" : "bg-gray-50/50"}`}>
        <div className="max-w-6xl mx-auto">
          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="text-center mb-14">
            <h2 className={`text-4xl md:text-5xl font-black mb-4 ${c.h}`}>Core Principles</h2>
            <p className={`text-lg max-w-2xl mx-auto ${c.muted}`}>Every design decision serves one goal — provable fairness with zero human intervention.</p>
          </motion.div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {[
              {
                icon: ShieldCheck,
                color: "from-blue-500 to-cyan-500",
                border: "border-blue-500/20",
                title: "Provably Fair",
                desc: "Winner selection uses Switchboard V3 TEE VRF — cryptographic randomness generated inside an Intel SGX enclave. No admin can predict, influence, or override the result. Every draw is verifiable on‑chain.",
              },
              {
                icon: Lock,
                color: "from-purple-500 to-pink-500",
                border: "border-purple-500/20",
                title: "Secure by Design",
                desc: "All funds held in Program Derived Addresses (PDAs) — cryptographic vaults owned by immutable code. No private keys, no human access. Admin operations are restricted to treasury top-ups and verified via require_keys_eq!",
              },
              {
                icon: Zap,
                color: "from-yellow-500 to-orange-500",
                border: "border-yellow-500/20",
                title: "Lightning Fast",
                desc: "Built on Solana with sub-second finality. Ticket purchases confirm in under 400ms. Draws complete in 2–3 seconds — auto-request, oracle randomness, instant payout — all in one transaction block.",
              },
              {
                icon: Globe,
                color: "from-emerald-500 to-green-500",
                border: "border-emerald-500/20",
                title: "Permissionless",
                desc: "Community-powered settlement. Any wallet can trigger a draw and earn an FPT reward. No bots required, no gatekeepers. 95% of the pool goes to the winner, 5% funds protocol sustainability.",
              },
            ].map((item, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 15 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.08 }}
                className={`rounded-2xl p-6 ${isDarkMode ? `bg-white/[0.03] border ${item.border}` : "bg-white shadow-md border border-gray-100"}`}
              >
                <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${item.color} flex items-center justify-center mb-4 shadow-lg`}>
                  <item.icon className="w-6 h-6 text-white" />
                </div>
                <h3 className={`text-lg font-bold mb-2 ${c.h}`}>{item.title}</h3>
                <p className={`text-sm leading-relaxed ${c.muted}`}>{item.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ HOW IT WORKS ═══ */}
      <section className="py-20 px-4 sm:px-8">
        <div className="max-w-5xl mx-auto">
          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="text-center mb-14">
            <h2 className={`text-4xl md:text-5xl font-black mb-4 ${c.h}`}>How Fortress Works</h2>
            <p className={`text-lg max-w-2xl mx-auto ${c.muted}`}>From ticket purchase to instant payout — every step is on-chain, verifiable, and permissionless.</p>
          </motion.div>

          <div className="space-y-8">
            {[
              {
                icon: Database,
                color: "from-blue-500 to-cyan-500",
                title: "Program Derived Addresses (PDAs)",
                content: (
                  <>
                    Every lottery tier operates with its own secure PDA — a Solana account controlled entirely by the smart contract with no private keys and no human access. When you purchase a
                    ticket, your payment transfers directly to the tier&apos;s PDA along with your wallet address, creating an immutable on-chain record.
                  </>
                ),
              },
              {
                icon: Layers,
                color: "from-purple-500 to-pink-500",
                title: "Linked-List Sharding (Unlimited Scale)",
                content: (
                  <>
                    Participant lists use paginated PDA &ldquo;pages&rdquo; — each storing up to 50 wallets. When a page fills, the contract automatically links a new one. This creates an
                    unbreakable chain of participant records that scales to unlimited participants per tier with zero bottlenecks.
                  </>
                ),
              },
              {
                icon: Server,
                color: "from-yellow-500 to-orange-500",
                title: "Independent Tier System",
                content: (
                  <div>
                    <p className="mb-4">
                      16 independent vaults across 4 lottery types. Each tier maintains its own PDA, prize pool, timer, and round number.
                    </p>
                    <div className="grid grid-cols-2 gap-4">
                      <div className={`rounded-xl p-4 ${isDarkMode ? "bg-black/20 border border-yellow-500/15" : "bg-yellow-50 border border-yellow-100"}`}>
                        <div className="font-bold text-yellow-500 mb-2 text-sm">LPM Tiers</div>
                        <div className="flex gap-2">
                          {[5, 10, 20, 50].map((t) => (
                            <span key={t} className={`text-sm font-mono font-bold ${isDarkMode ? "text-white" : "text-gray-900"}`}>
                              ${t}
                            </span>
                          ))}
                        </div>
                        <div className={`text-xs mt-1 ${c.subtle}`}>100 players per tier</div>
                      </div>
                      <div className={`rounded-xl p-4 ${isDarkMode ? "bg-black/20 border border-blue-500/15" : "bg-blue-50 border border-blue-100"}`}>
                        <div className="font-bold text-blue-500 mb-2 text-sm">DPL / WPL / MPL Tiers</div>
                        <div className="flex gap-2">
                          {[5, 10, 15, 20].map((t) => (
                            <span key={t} className={`text-sm font-mono font-bold ${isDarkMode ? "text-white" : "text-gray-900"}`}>
                              ${t}
                            </span>
                          ))}
                        </div>
                        <div className={`text-xs mt-1 ${c.subtle}`}>Unlimited participants</div>
                      </div>
                    </div>
                  </div>
                ),
              },
              {
                icon: Cpu,
                color: "from-cyan-500 to-blue-500",
                title: "Provably Random Winner Selection",
                content: (
                  <>
                    When a tier becomes eligible (LPM fills to 100 or timer expires), the protocol uses a 2-phase Switchboard V3 TEE VRF flow: (1) the crank bot automatically submits a draw
                    request on-chain — no wallet popup needed, (2) a Switchboard oracle running inside a hardware-secured Intel SGX enclave generates a 32-byte verifiable random value. Once
                    ready, any community member can finalize with one click, paying out the winner and earning an FPT reward.
                  </>
                ),
              },
              {
                icon: Coins,
                color: "from-emerald-500 to-green-500",
                title: "Instant Prize Distribution",
                content: (
                  <div>
                    <p className="mb-4">
                      The smart contract calculates the winner&apos;s Associated Token Account (ATA) for FPT tokens. <strong className="text-emerald-500">95%</strong> of the pool transfers
                      instantly to the winner. <strong>5%</strong> goes to the treasury for oracle fees, rent, ATA creation, and community draw rewards.
                    </p>
                    <div className={`rounded-xl p-4 ${isDarkMode ? "bg-emerald-500/5 border border-emerald-500/15" : "bg-emerald-50 border border-emerald-100"}`}>
                      <div className="text-sm font-bold text-emerald-500 mb-2">Example: 1,000 FPT Pool</div>
                      <div className={`text-sm space-y-1 ${c.body}`}>
                        <div className="font-bold text-emerald-500">→ Winner Receives: 950 FPT (95%)</div>
                        <div>→ Treasury Fee: 50 FPT (5%)</div>
                      </div>
                      <div className={`mt-3 pt-3 border-t ${isDarkMode ? "border-emerald-500/15" : "border-emerald-200"}`}>
                        <p className={`text-xs font-bold uppercase tracking-wider mb-2 ${isDarkMode ? "text-emerald-400" : "text-emerald-700"}`}>Treasury Powers:</p>
                        <ul className={`text-xs space-y-1.5 ${c.muted}`}>
                          <li className="flex gap-2">
                            <span className="text-emerald-500 flex-shrink-0">→</span>
                            <span>
                              <strong>Oracle Fees:</strong> Switchboard TEE VRF randomness generation
                            </span>
                          </li>
                          <li className="flex gap-2">
                            <span className="text-emerald-500 flex-shrink-0">→</span>
                            <span>
                              <strong>Tier Re-init:</strong> Vault data reset and participant page creation
                            </span>
                          </li>
                          <li className="flex gap-2">
                            <span className="text-emerald-500 flex-shrink-0">→</span>
                            <span>
                              <strong>Rent &amp; Storage:</strong> Solana account rent for new PDAs
                            </span>
                          </li>
                          <li className="flex gap-2">
                            <span className="text-emerald-500 flex-shrink-0">→</span>
                            <span>
                              <strong>Community Rewards:</strong> FPT bounty for draw settlers
                            </span>
                          </li>
                        </ul>
                      </div>
                    </div>
                  </div>
                ),
              },
              {
                icon: RefreshCw,
                color: "from-indigo-500 to-violet-500",
                title: "Dual-Trigger",
                content: (
                  <>
                    <strong className="text-indigo-400">Auto-Trigger:</strong> The keeper bot monitors all 16 tiers 24/7. Eligible draws are initiated automatically with zero user action.{" "}
                    <strong className="text-cyan-400">Fallback Trigger:</strong> If automation ever stalls, any wallet can step in via a 3-click flow — click to request, wait for oracle (~5s), click to finalize — earning an
                    FPT bounty.
                  </>
                ),
              },
            ].map((section, i) => (
              <motion.div key={i} initial={{ opacity: 0, y: 15 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.05 }} className="flex gap-5">
                <div className="flex-shrink-0 mt-1">
                  <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${section.color} flex items-center justify-center shadow-lg`}>
                    <section.icon className="w-6 h-6 text-white" />
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className={`text-xl font-bold mb-3 ${c.h}`}>{section.title}</h3>
                  <div className={`text-sm leading-relaxed ${c.body}`}>{section.content}</div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ LOTTERY TYPES ═══ */}
      <section className={`py-20 px-4 sm:px-8 ${isDarkMode ? "" : "bg-gray-50/50"}`}>
        <div className="max-w-6xl mx-auto">
          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="text-center mb-14">
            <h2 className={`text-4xl md:text-5xl font-black mb-4 ${c.h}`}>Four Lottery Types</h2>
            <p className={`text-lg max-w-2xl mx-auto ${c.muted}`}>1,716 draws per year across four distinct gameplay rhythms.</p>
          </motion.div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {[
              {
                icon: Zap,
                color: "from-yellow-500 to-orange-500",
                border: "border-yellow-500/20",
                name: "Lightning Pool",
                code: "LPM",
                desc: "Capacity-based — draws trigger when 100 participants fill a tier. No timers, instant action.",
                tiers: "$5, $10, $20, $50",
                draw: "Instant when full",
                annual: "Unlimited",
              },
              {
                icon: Timer,
                color: "from-blue-500 to-cyan-500",
                border: "border-blue-500/20",
                name: "Daily Pool",
                code: "DPL",
                desc: "24-hour lottery cycles with unlimited entries. Daily excitement, daily winners.",
                tiers: "$5, $10, $15, $20",
                draw: "Every 24 hours",
                annual: "1,460 draws/yr",
              },
              {
                icon: BarChart3,
                color: "from-indigo-500 to-purple-500",
                border: "border-indigo-500/20",
                name: "Weekly Pool",
                code: "WPL",
                desc: "7-day accumulation cycles. Bigger prize pools, weekly rhythm.",
                tiers: "$5, $10, $15, $20",
                draw: "Every 7 days",
                annual: "208 draws/yr",
              },
              {
                icon: TrendingUp,
                color: "from-orange-500 to-rose-500",
                border: "border-orange-500/20",
                name: "Monthly Pool",
                code: "MPL",
                desc: "30-day mega draws. Maximum accumulation, maximum reward. Patience pays off.",
                tiers: "$5, $10, $15, $20",
                draw: "Every 30 days",
                annual: "48 draws/yr",
              },
            ].map((lottery, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 15 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.08 }}
                className={`rounded-2xl p-6 flex flex-col ${isDarkMode ? `bg-white/[0.03] border ${lottery.border}` : "bg-white shadow-md border border-gray-100"}`}
              >
                <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${lottery.color} flex items-center justify-center mb-4 shadow-lg`}>
                  <lottery.icon className="w-6 h-6 text-white" />
                </div>
                <div className="flex items-center gap-2 mb-2">
                  <h3 className={`text-lg font-bold ${c.h}`}>{lottery.name}</h3>
                  <span className={`text-[10px] px-2 py-0.5 rounded-md font-mono font-bold ${isDarkMode ? "bg-white/5 text-gray-400" : "bg-gray-100 text-gray-500"}`}>{lottery.code}</span>
                </div>
                <p className={`text-sm leading-relaxed flex-1 mb-4 ${c.muted}`}>{lottery.desc}</p>
                <div className={`space-y-2 text-xs pt-3 border-t mt-auto ${isDarkMode ? "border-white/5" : "border-gray-100"}`}>
                  <div className="flex justify-between">
                    <span className={c.subtle}>Tiers</span>
                    <span className={`font-mono font-semibold ${c.body}`}>{lottery.tiers}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className={c.subtle}>Draw</span>
                    <span className={`font-semibold ${c.body}`}>{lottery.draw}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className={c.subtle}>Frequency</span>
                    <span className={`font-semibold ${c.body}`}>{lottery.annual}</span>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ SECURITY ═══ */}
      <section className="py-20 px-4 sm:px-8">
        <div className="max-w-6xl mx-auto">
          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="text-center mb-14">
            <h2 className={`text-4xl md:text-5xl font-black mb-4 ${c.h}`}>Security First</h2>
          </motion.div>

          <div className="grid md:grid-cols-2 gap-6">
            <motion.div initial={{ opacity: 0, x: -15 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} className={`rounded-2xl p-6 ${c.card}`}>
              <h3 className={`text-xl font-bold mb-4 flex items-center gap-2 ${c.h}`}>
                <Shield className="w-5 h-5 text-blue-500" /> Smart Contract Security
              </h3>
              <ul className={`space-y-3 text-sm ${c.body}`}>
                {["All funds locked in PDAs with no human access", "Open-source code auditable by anyone", "Admin restricted to treasury top-ups only (require_keys_eq!)", "Immutable lottery records on Solana blockchain"].map(
                  (text, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
                      <span>{text}</span>
                    </li>
                  ),
                )}
              </ul>
            </motion.div>

            <motion.div initial={{ opacity: 0, x: 15 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} className={`rounded-2xl p-6 ${c.card}`}>
              <h3 className={`text-xl font-bold mb-4 flex items-center gap-2 ${c.h}`}>
                <Cpu className="w-5 h-5 text-purple-500" /> Randomness Integrity
              </h3>
              <ul className={`space-y-3 text-sm ${c.body}`}>
                {[
                  "Switchboard V3 TEE VRF — hardware-secured Intel SGX enclave",
                  "32-byte verifiable random value per draw",
                  "Impossible to predict or manipulate — even by oracle operators",
                  "Every draw cryptographically verifiable on-chain",
                ].map((text, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
                    <span>{text}</span>
                  </li>
                ))}
              </ul>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ═══ TECH STACK ═══ */}
      <section className={`py-16 px-4 sm:px-8 ${isDarkMode ? "" : "bg-gray-50/50"}`}>
        <div className="max-w-5xl mx-auto text-center">
          <h2 className={`text-3xl font-black mb-8 ${c.h}`}>Built With</h2>
          <div className="flex flex-wrap justify-center gap-3">
            {[
              { label: "Solana", url: "https://solana.com" },
              { label: "Anchor Framework", url: "https://www.anchor-lang.com" },
              { label: "Rust", url: "https://www.rust-lang.org" },
              { label: "SPL Token-2022", url: "https://spl.solana.com/token-2022" },
              { label: "Switchboard V3 TEE VRF", url: "https://switchboard.xyz" },
              { label: "Next.js 14", url: "https://nextjs.org" },
              { label: "TypeScript", url: "https://www.typescriptlang.org" },
              { label: "Web3.js", url: "https://github.com/solana-labs/solana-web3.js" },
              { label: "Framer Motion", url: "https://www.framer.com/motion" },
              { label: "Tailwind CSS", url: "https://tailwindcss.com/docs" },
            ].map(({ label, url }) => (
              <a
                key={label}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className={`px-5 py-2.5 rounded-full font-semibold text-sm transition-all duration-200 hover:scale-105 hover:shadow-md ${
                  isDarkMode
                    ? "bg-white/[0.05] text-gray-300 border border-white/10 hover:bg-white/10 hover:text-white hover:border-white/20"
                    : "bg-white text-gray-700 border border-gray-200 shadow-sm hover:bg-gray-50 hover:border-gray-300 hover:text-gray-900"
                }`}
              >
                {label} ↗
              </a>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ ON-CHAIN STATS ═══ */}
      <section className="py-16 px-4 sm:px-8">
        <div className="max-w-5xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className={`rounded-2xl px-6 py-5 grid grid-cols-2 sm:grid-cols-4 gap-4 text-center ${c.card}`}
          >
            {[
              { n: "17", label: "On-Chain Instructions" },
              { n: "16", label: "Independent Vaults" },
              { n: "1,716", label: "Annual Draws" },
              { n: "6", label: "State Account Types" },
            ].map((s) => (
              <div key={s.label}>
                <div className={`text-3xl font-black font-mono ${c.h}`}>{s.n}</div>
                <div className={`text-xs ${c.subtle}`}>{s.label}</div>
              </div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ═══ CTA ═══ */}
      <section className="py-16 px-4 sm:px-8 text-center">
        <p className={`text-xl font-medium mb-6 ${c.body}`}>Ready to try your luck?</p>
        <Link href="/">
          <motion.button
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            className="px-8 py-4 bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 text-white font-bold text-lg rounded-xl shadow-2xl hover:shadow-purple-500/20 transition-all flex items-center gap-2 mx-auto"
          >
            <Trophy className="w-5 h-5" /> Start Playing Now <ArrowRight className="w-5 h-5" />
          </motion.button>
        </Link>
      </section>

      {/* ═══ FOOTER ═══ */}
      <footer className={`py-10 px-4 sm:px-8 border-t ${isDarkMode ? "border-white/5" : "border-gray-100"}`}>
        <div className="max-w-6xl mx-auto text-center">
          <p className={`text-xs ${c.subtle}`}>© {new Date().getFullYear()} Fortress Protocol — Decentralized. Provably Fair. Permissionless.</p>
        </div>
      </footer>
    </div>
  );
}
