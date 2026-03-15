'use client';

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import Layout from '@/components/Layout';
import Link from 'next/link';
import { ExternalLink, FileText, Zap, Shield, Copy, Check } from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';
import { FPT_MINT, PROGRAM_ID, ADMIN_WALLET, CRANK_AUTHORITY, SB_ON_DEMAND_PROGRAM } from '@/utils/constants';

// ─── Framer variants ──────────────────────────────────────────────────────────
const fadeUp = { hidden: { opacity: 0, y: 32 }, show: { opacity: 1, y: 0, transition: { duration: 0.6 } } };
const fadeRight = { hidden: { opacity: 0, x: -32 }, show: { opacity: 1, x: 0, transition: { duration: 0.6 } } };
const fadeLeft = { hidden: { opacity: 0, x: 32 }, show: { opacity: 1, x: 0, transition: { duration: 0.6 } } };

// ─── Reusable wrappers ────────────────────────────────────────────────────────
function Section({ id, children, className = '' }: { id?: string; children: React.ReactNode; className?: string }) {
  return (
    <motion.section
      id={id}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: '-80px' }}
      className={`relative ${className}`}
    >
      <div className="rounded-2xl border border-white/[0.07] bg-white/[0.03] backdrop-blur-sm p-6 sm:p-10">
        {children}
      </div>
    </motion.section>
  );
}

function SectionLabel({ n, label }: { n: string; label: string }) {
  return (
    <div className="flex items-center gap-3 mb-3">
      <span className="font-mono text-xs text-cyan-400 border border-cyan-500/40 px-2 py-0.5 rounded">{n}</span>
      <span className="font-mono text-xs text-gray-500 uppercase tracking-widest">{label}</span>
    </div>
  );
}

// Blueprint grid lines — drawn in SVG over the page background
function GridBg({ isDark }: { isDark: boolean }) {
  return (
    <div
      className="fixed inset-0 -z-10 pointer-events-none"
      style={{
        backgroundImage: `
          linear-gradient(rgba(34,211,238,${isDark ? '0.04' : '0.08'}) 1px, transparent 1px),
          linear-gradient(90deg, rgba(34,211,238,${isDark ? '0.04' : '0.08'}) 1px, transparent 1px)
        `,
        backgroundSize: '48px 48px',
        backgroundColor: isDark ? '#050d1a' : '#f0f7ff',
      }}
    />
  );
}

// ─── SVG DIAGRAMS ─────────────────────────────────────────────────────────────

/* 1. Black Box (Traditional Lottery) */
function BlackBoxDiagram() {
  return (
    <svg viewBox="0 0 320 240" className="w-full max-w-sm mx-auto" aria-label="Black box diagram">
      <defs>
        <filter id="sketch">
          <feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves="4" />
          <feDisplacementMap in="SourceGraphic" scale="1.4" />
        </filter>
      </defs>
      {/* Annotation lines */}
      <line x1="20" y1="30" x2="300" y2="30" stroke="#22d3ee" strokeWidth="0.4" strokeDasharray="6 4" />
      <line x1="20" y1="210" x2="300" y2="210" stroke="#22d3ee" strokeWidth="0.4" strokeDasharray="6 4" />
      <line x1="20" y1="30" x2="20" y2="210" stroke="#22d3ee" strokeWidth="0.4" strokeDasharray="6 4" />
      <line x1="300" y1="30" x2="300" y2="210" stroke="#22d3ee" strokeWidth="0.4" strokeDasharray="6 4" />

      {/* Black box body */}
      <rect x="60" y="50" width="200" height="140" rx="4" fill="#0a0a0a" stroke="#6b7280" strokeWidth="2.5" filter="url(#sketch)" />
      {/* Hatch fill to suggest opacity */}
      {[0,1,2,3,4,5,6].map(i => (
        <line key={i} x1={60 + i*30} y1="50" x2={60 + i*30 - 35} y2="190" stroke="#374151" strokeWidth="1" opacity="0.5" />
      ))}

      {/* Lock icon (circles + rect) */}
      <rect x="130" y="105" width="60" height="44" rx="4" fill="#1f2937" stroke="#6b7280" strokeWidth="2" />
      <path d="M148 105 Q148 88 160 88 Q172 88 172 105" fill="none" stroke="#6b7280" strokeWidth="2.5" />
      <circle cx="160" cy="122" r="5" fill="#6b7280" />
      <line x1="160" y1="127" x2="160" y2="136" stroke="#6b7280" strokeWidth="2" />

      {/* Question mark */}
      <text x="160" y="82" textAnchor="middle" fontSize="18" fill="#9ca3af" fontFamily="monospace">?</text>

      {/* Arrows in (funds going in) */}
      <path d="M10 120 L55 120" stroke="#f59e0b" strokeWidth="2" markerEnd="url(#arr-gold)" />
      <text x="4" y="110" fontSize="9" fill="#f59e0b" fontFamily="monospace">FUNDS</text>

      {/* Arrow out (results — dashed, uncertain) */}
      <path d="M265 120 L310 120" stroke="#ef4444" strokeWidth="1.5" strokeDasharray="4 3" markerEnd="url(#arr-red)" />
      <text x="268" y="110" fontSize="9" fill="#ef4444" fontFamily="monospace">RESULT?</text>

      <defs>
        <marker id="arr-gold" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
          <path d="M0,0 L7,3.5 L0,7 Z" fill="#f59e0b" />
        </marker>
        <marker id="arr-red" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
          <path d="M0,0 L7,3.5 L0,7 Z" fill="#ef4444" />
        </marker>
      </defs>

      {/* Label */}
      <rect x="62" y="192" width="196" height="16" rx="2" fill="#111827" />
      <text x="160" y="204" textAnchor="middle" fontSize="9" fill="#9ca3af" fontFamily="monospace">Traditional Lottery — Centralized, Opaque</text>
    </svg>
  );
}

/* 2. Glass Box (Lightning Pool) */
function GlassBoxDiagram() {
  return (
    <svg viewBox="0 0 320 240" className="w-full max-w-sm mx-auto" aria-label="Glass box transparent lottery">
      <defs>
        <marker id="arr-c" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
          <path d="M0,0 L7,3.5 L0,7 Z" fill="#22d3ee" />
        </marker>
        <marker id="arr-e" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
          <path d="M0,0 L7,3.5 L0,7 Z" fill="#34d399" />
        </marker>
      </defs>
      {/* Grid ticks */}
      <line x1="20" y1="30" x2="300" y2="30" stroke="#22d3ee" strokeWidth="0.4" strokeDasharray="6 4" />
      <line x1="20" y1="210" x2="300" y2="210" stroke="#22d3ee" strokeWidth="0.4" strokeDasharray="6 4" />

      {/* Glass box */}
      <rect x="70" y="50" width="180" height="140" rx="6" fill="rgba(34,211,238,0.04)" stroke="#22d3ee" strokeWidth="2" strokeDasharray="8 3" />
      {/* Glass sheen */}
      <rect x="74" y="54" width="60" height="130" rx="4" fill="rgba(255,255,255,0.03)" />

      {/* Solana logo-ish circle */}
      <circle cx="160" cy="120" r="30" fill="none" stroke="#22d3ee" strokeWidth="1.5" strokeDasharray="3 2" />
      <text x="160" y="115" textAnchor="middle" fontSize="11" fill="#22d3ee" fontFamily="monospace">SOL</text>
      <text x="160" y="128" textAnchor="middle" fontSize="9" fill="#34d399" fontFamily="monospace">Contract</text>

      {/* Arrows IN */}
      <path d="M10 90 L65 90" stroke="#22d3ee" strokeWidth="1.8" markerEnd="url(#arr-c)" />
      <text x="4" y="82" fontSize="8" fill="#22d3ee" fontFamily="monospace">BUY</text>
      <path d="M10 150 L65 150" stroke="#22d3ee" strokeWidth="1.8" markerEnd="url(#arr-c)" />
      <text x="4" y="142" fontSize="8" fill="#22d3ee" fontFamily="monospace">FPT</text>

      {/* Arrows OUT */}
      <path d="M255 90 L310 90" stroke="#34d399" strokeWidth="1.8" markerEnd="url(#arr-e)" />
      <text x="258" y="82" fontSize="8" fill="#34d399" fontFamily="monospace">95%</text>
      <path d="M255 150 L310 150" stroke="#f59e0b" strokeWidth="1.8" markerEnd="url(#arr-e)" />
      <text x="257" y="142" fontSize="8" fill="#f59e0b" fontFamily="monospace">5%(DAO)</text>

      {/* Label */}
      <text x="160" y="208" textAnchor="middle" fontSize="9" fill="#22d3ee" fontFamily="monospace">Lightning Pool — Fully On-Chain, Verifiable</text>
    </svg>
  );
}

/* 3. 4-Step User Journey */
function JourneyDiagram() {
  const steps = [
    { icon: null, label: 'Liquidity\nGateway', color: '#f59e0b' },
    { icon: '👛', label: 'Connect\nPhantom', color: '#a78bfa' },
    { icon: '🎟️', label: 'Buy\nTicket', color: '#22d3ee' },
    { icon: '🏆', label: 'Win\nInstantly', color: '#34d399' },
  ];
  return (
    <svg viewBox="0 0 340 180" className="w-full max-w-sm mx-auto">
      <defs>
        <marker id="arr-j" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
          <path d="M0,0 L6,3 L0,6 Z" fill="#4b5563" />
        </marker>
      </defs>
      {/* Connector line */}
      <line x1="40" y1="90" x2="300" y2="90" stroke="#374151" strokeWidth="1.5" strokeDasharray="4 3" />
      {steps.map((s, i) => {
        const cx = 40 + i * 87;
        return (
          <g key={i}>
            <circle cx={cx} cy={90} r={28} fill="rgba(17,24,39,0.8)" stroke={s.color} strokeWidth="2" />
            {i === 0 ? (
              <>
                <text x={cx-11} y={87} textAnchor="middle" fontSize="13" fill="#f59e0b">$</text>
                <text x={cx} y={87} textAnchor="middle" fontSize="13" fill="#a3e635">¤</text>
                <text x={cx+11} y={87} textAnchor="middle" fontSize="13" fill="#22d3ee">₿</text>
                <text x={cx} y={97} textAnchor="middle" fontSize="7" fill="#f59e0b" fontFamily="monospace">→FPT</text>
              </>
            ) : (
              <text x={cx} y={88} textAnchor="middle" fontSize="18">{s.icon}</text>
            )}
            {/* Step label below */}
            {s.label.split('\n').map((ln, li) => (
              <text key={li} x={cx} y={130 + li * 13} textAnchor="middle" fontSize="9" fill={s.color} fontFamily="monospace">{ln}</text>
            ))}
            {/* Step number above */}
            <text x={cx} y={52} textAnchor="middle" fontSize="8" fill="#6b7280" fontFamily="monospace">{`step.0${i+1}`}</text>
            {i < 3 && (
              <path d={`M${cx+30} 90 L${cx+57} 90`} stroke={s.color} strokeWidth="1.2" markerEnd="url(#arr-j)" opacity="0.6" />
            )}
          </g>
        );
      })}
    </svg>
  );
}

/* 4. Draw Mechanics: Chain vs Time */
function DrawMechanicsDiagram() {
  return (
    <svg viewBox="0 0 320 200" className="w-full max-w-sm mx-auto">
      <defs>
        <marker id="arr-m" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
          <path d="M0,0 L6,3 L0,6 Z" fill="#22d3ee" />
        </marker>
        <marker id="arr-mg" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
          <path d="M0,0 L6,3 L0,6 Z" fill="#34d399" />
        </marker>
      </defs>
      {/* Divider */}
      <line x1="160" y1="20" x2="160" y2="185" stroke="#374151" strokeWidth="1" strokeDasharray="4 3" />

      {/* === LEFT: Chain-Based === */}
      <text x="80" y="18" textAnchor="middle" fontSize="9" fill="#22d3ee" fontFamily="monospace">Chain-Reaction</text>
      {/* Chain links */}
      {[0,1,2].map(i => (
        <g key={i} transform={`translate(${30 + i*36}, 40)`}>
          <rect x="0" y="0" width="26" height="16" rx="8" fill="none" stroke="#22d3ee" strokeWidth="1.5" />
          <text x="13" y="12" textAnchor="middle" fontSize="8" fill="#22d3ee" fontFamily="monospace">{i===2?'…':`${(i+1)*33}`}</text>
        </g>
      ))}
      {/* 100 TRIGGER */}
      <rect x="24" y="68" width="110" height="22" rx="4" fill="rgba(34,211,238,0.12)" stroke="#22d3ee" strokeWidth="1.5" />
      <text x="79" y="83" textAnchor="middle" fontSize="9" fill="#22d3ee" fontFamily="monospace">FULL @ 100 — DRAW!</text>
      {/* Arrow down to winner */}
      <path d="M79 90 L79 120" stroke="#22d3ee" strokeWidth="1.5" markerEnd="url(#arr-m)" />
      <text x="79" y="138" textAnchor="middle" fontSize="11">🏆</text>
      <text x="79" y="152" textAnchor="middle" fontSize="8" fill="#34d399" fontFamily="monospace">Winner Paid</text>

      {/* Participants filling bar */}
      <rect x="25" y="155" width="108" height="8" rx="2" fill="#1f2937" />
      <rect x="25" y="155" width="108" height="8" rx="2" fill="#22d3ee" opacity="0.7" />
      <text x="79" y="175" textAnchor="middle" fontSize="8" fill="#6b7280" fontFamily="monospace">100 / 100 participants</text>

      {/* === RIGHT: Time-Based === */}
      <text x="240" y="18" textAnchor="middle" fontSize="9" fill="#34d399" fontFamily="monospace">Time-Expired</text>
      {/* Hourglass shape */}
      <polygon points="190,38 280,38 260,90 280,143 190,143 210,90" fill="rgba(52,211,153,0.06)" stroke="#34d399" strokeWidth="1.8" />
      {/* Upper sand */}
      <ellipse cx="235" cy="52" rx="32" ry="9" fill="rgba(52,211,153,0.2)" />
      {/* Flow drip */}
      <line x1="235" y1="61" x2="235" y2="90" stroke="#34d399" strokeWidth="2" strokeDasharray="3 2" />
      {/* Lower sand — almost empty */}
      <ellipse cx="235" cy="128" rx="10" ry="5" fill="rgba(52,211,153,0.3)" />
      {/* 00:00 */}
      <text x="235" y="98" textAnchor="middle" fontSize="14" fill="#34d399" fontFamily="monospace">00:00</text>
      {/* Arrow */}
      <path d="M235 148 L235 165" stroke="#34d399" strokeWidth="1.5" markerEnd="url(#arr-mg)" />
      <text x="235" y="178" textAnchor="middle" fontSize="8" fill="#34d399" fontFamily="monospace">Draw Triggered</text>
    </svg>
  );
}

/* 5. Switchboard VRF "Card Shuffle" */
function EntropyDiagram() {
  return (
    <svg viewBox="0 0 320 220" className="w-full max-w-sm mx-auto">
      <defs>
        <marker id="arr-p" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
          <path d="M0,0 L6,3 L0,6 Z" fill="#a78bfa" />
        </marker>
      </defs>
      {/* Data stream — left */}
      <text x="14" y="26" fontSize="8" fill="#22d3ee" fontFamily="monospace">SB ON-DEMAND</text>
      <text x="14" y="38" fontSize="8" fill="#22d3ee" fontFamily="monospace">VRF TEE ORACLE</text>
      {[0,1,2,3,4].map(i => (
        <g key={i}>
          <rect x="10" y={50+i*24} width="85" height="14" rx="2" fill="rgba(34,211,238,0.08)" stroke="#22d3ee" strokeWidth="0.8" />
          <text x="16" y={61+i*24} fontSize="7" fill="#22d3ee" fontFamily="monospace">
            {['slot: 447178409','sb_value[0..7]','sb_value[8..15]','reveal_slot↑: ..','commit: 0xB3F9'][i]}
          </text>
          <path d={`M97 ${57+i*24} L120 ${57+i*24}`} stroke="#22d3ee" strokeWidth="0.8" markerEnd="url(#arr-p)" />
        </g>
      ))}

      {/* Mixing circle (XOR) */}
      <circle cx="155" cy="110" r="35" fill="rgba(167,139,250,0.08)" stroke="#a78bfa" strokeWidth="2" />
      <text x="155" y="105" textAnchor="middle" fontSize="16" fill="#a78bfa" fontFamily="monospace">⊕</text>
      <text x="155" y="118" textAnchor="middle" fontSize="7" fill="#a78bfa" fontFamily="monospace">XOR</text>
      <text x="155" y="130" textAnchor="middle" fontSize="7" fill="#6b7280" fontFamily="monospace">vault_seed</text>

      {/* Cards (right) — the "deck" */}
      {[0,1,2].map(i => (
        <rect key={i} x={210+i*6} y={78+i*6} width="52" height="72" rx="4"
          fill="#111827" stroke="#a78bfa" strokeWidth="1.5" opacity={1 - i*0.2} />
      ))}
      <text x="234" y="115" textAnchor="middle" fontSize="13" fill="#a78bfa">🃏</text>
      <text x="234" y="128" textAnchor="middle" fontSize="8" fill="#a78bfa" fontFamily="monospace">Participants</text>
      <text x="234" y="139" textAnchor="middle" fontSize="7" fill="#6b7280" fontFamily="monospace">shuffled deck</text>

      {/* Arrow from XOR to deck */}
      <path d="M191 110 L208 110" stroke="#a78bfa" strokeWidth="1.5" markerEnd="url(#arr-p)" />

      {/* Output arrow */}
      <path d="M262 114 L290 114" stroke="#34d399" strokeWidth="2" markerEnd="url(#arr-p)" />
      <text x="272" y="107" fontSize="8" fill="#34d399" fontFamily="monospace">index</text>
      <text x="292" y="117" fontSize="11">🏆</text>

      {/* Annotation bottom */}
      <text x="155" y="195" textAnchor="middle" fontSize="8" fill="#6b7280" fontFamily="monospace">entropy = (sb_value ⊕ commitment) XOR vault_seed → winner</text>
      <line x1="10" y1="200" x2="310" y2="200" stroke="#22d3ee" strokeWidth="0.3" strokeDasharray="4 3" />
    </svg>
  );
}

/* 6. Treasury Flow Chart */
function TreasuryDiagram() {
  return (
    <svg viewBox="0 0 320 260" className="w-full max-w-sm mx-auto">
      <defs>
        <marker id="arr-t" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
          <path d="M0,0 L6,3 L0,6 Z" fill="#f59e0b" />
        </marker>
        <marker id="arr-tg" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
          <path d="M0,0 L6,3 L0,6 Z" fill="#34d399" />
        </marker>
      </defs>

      {/* Pool */}
      <rect x="85" y="10" width="150" height="32" rx="6" fill="rgba(245,158,11,0.12)" stroke="#f59e0b" strokeWidth="2" />
      <text x="160" y="26" textAnchor="middle" fontSize="9" fill="#f59e0b" fontFamily="monospace">🏦 Pool: 1,000 FPT</text>
      <text x="160" y="36" textAnchor="middle" fontSize="7" fill="#6b7280" fontFamily="monospace">(example round)</text>

      {/* Split line down */}
      <line x1="160" y1="42" x2="160" y2="68" stroke="#f59e0b" strokeWidth="1.5" />
      <line x1="80" y1="68" x2="240" y2="68" stroke="#f59e0b" strokeWidth="1.5" />
      <line x1="80" y1="68" x2="80" y2="88" stroke="#34d399" strokeWidth="1.5" markerEnd="url(#arr-tg)" />
      <line x1="240" y1="68" x2="240" y2="88" stroke="#f59e0b" strokeWidth="1.5" markerEnd="url(#arr-t)" />

      {/* Winner box */}
      <rect x="20" y="88" width="120" height="32" rx="6" fill="rgba(52,211,153,0.1)" stroke="#34d399" strokeWidth="2" />
      <text x="80" y="104" textAnchor="middle" fontSize="10" fill="#34d399" fontFamily="monospace">🏆 950 FPT</text>
      <text x="80" y="114" textAnchor="middle" fontSize="7" fill="#6b7280" fontFamily="monospace">Winner (95%)</text>

      {/* Treasury box */}
      <rect x="180" y="88" width="120" height="32" rx="6" fill="rgba(245,158,11,0.1)" stroke="#f59e0b" strokeWidth="2" />
      <text x="240" y="104" textAnchor="middle" fontSize="10" fill="#f59e0b" fontFamily="monospace">⚙️ 50 FPT</text>
      <text x="240" y="114" textAnchor="middle" fontSize="7" fill="#6b7280" fontFamily="monospace">Treasury (5%)</text>

      {/* Treasury splits */}
      <line x1="240" y1="120" x2="240" y2="145" stroke="#f59e0b" strokeWidth="1.2" />
      <line x1="190" y1="145" x2="290" y2="145" stroke="#f59e0b" strokeWidth="1.2" />
      <line x1="190" y1="145" x2="190" y2="165" stroke="#f59e0b" strokeWidth="1.2" markerEnd="url(#arr-t)" />
      <line x1="290" y1="145" x2="290" y2="165" stroke="#a78bfa" strokeWidth="1.2" markerEnd="url(#arr-t)" />

      {/* Draw reward */}
      <rect x="135" y="165" width="112" height="32" rx="4" fill="rgba(245,158,11,0.08)" stroke="#f59e0b" strokeWidth="1.5" />
      <text x="191" y="180" textAnchor="middle" fontSize="9" fill="#f59e0b" fontFamily="monospace">🤖 SOL Bounty</text>
      <text x="191" y="191" textAnchor="middle" fontSize="7" fill="#6b7280" fontFamily="monospace">Keeper Settlement</text>

      {/* FPT→SOL conversion */}
      <rect x="252" y="165" width="62" height="32" rx="4" fill="rgba(167,139,250,0.08)" stroke="#a78bfa" strokeWidth="1.5" />
      <text x="283" y="180" textAnchor="middle" fontSize="8" fill="#a78bfa" fontFamily="monospace">🔄 FPT</text>
      <text x="283" y="191" textAnchor="middle" fontSize="7" fill="#6b7280" fontFamily="monospace">→SOL Auto</text>

      {/* SOL fees at bottom */}
      <line x1="283" y1="197" x2="283" y2="218" stroke="#a78bfa" strokeWidth="1.2" markerEnd="url(#arr-t)" />
      <rect x="200" y="218" width="158" height="32" rx="4" fill="rgba(167,139,250,0.06)" stroke="#a78bfa" strokeWidth="1.5" />
      <text x="279" y="233" textAnchor="middle" fontSize="8" fill="#a78bfa" fontFamily="monospace">⛽ SB + Rent + Gas</text>
      <text x="279" y="244" textAnchor="middle" fontSize="7" fill="#6b7280" fontFamily="monospace">Protocol Operating Costs</text>
    </svg>
  );
}

/* 7. Dashboard Mockup */
function DashboardMockup() {
  const wins = ['7Xk3...mR9a', 'B9nY...pL2c', 'Fp2M...jA7b'];
  return (
    <svg viewBox="0 0 320 230" className="w-full max-w-sm mx-auto">
      {/* Browser frame */}
      <rect x="8" y="8" width="304" height="214" rx="8" fill="#0d1117" stroke="#22d3ee" strokeWidth="1.5" />
      {/* Title bar */}
      <rect x="8" y="8" width="304" height="24" rx="8" fill="#111827" />
      <circle cx="24" cy="20" r="4" fill="#ef4444" />
      <circle cx="38" cy="20" r="4" fill="#f59e0b" />
      <circle cx="52" cy="20" r="4" fill="#34d399" />
      <text x="160" y="24" textAnchor="middle" fontSize="8" fill="#6b7280" fontFamily="monospace">fptpool.com/participants-data</text>

      {/* Stat chips */}
      {[
        { x: 18, label: 'Active Tiers: 12', color: '#22d3ee' },
        { x: 118, label: 'My Tickets: 3', color: '#a78bfa' },
        { x: 218, label: 'Total Won: 47 FPT', color: '#34d399' },
      ].map((c,i) => (
        <g key={i}>
          <rect x={c.x} y="38" width="94" height="20" rx="3" fill="rgba(255,255,255,0.04)" stroke={c.color} strokeWidth="1" />
          <text x={c.x + 47} y="52" textAnchor="middle" fontSize="7.5" fill={c.color} fontFamily="monospace">{c.label}</text>
        </g>
      ))}

      {/* Winners card */}
      <rect x="18" y="66" width="284" height="148" rx="6" fill="rgba(34,211,238,0.04)" stroke="#22d3ee" strokeWidth="1" />
      <text x="30" y="82" fontSize="9" fill="#22d3ee" fontFamily="monospace">📋 Recent Winners</text>
      <line x1="18" y1="88" x2="302" y2="88" stroke="#374151" strokeWidth="0.8" />

      {/* Table headers */}
      {['#','Winner','Type','Prize','TX'].map((h,i) => (
        <text key={i} x={[28,55,155,220,270][i]} y="100" fontSize="7" fill="#6b7280" fontFamily="monospace">{h}</text>
      ))}

      {/* Table rows */}
      {[
        ['🥇', '7Xk3...mR9a', 'DPL $1', '950 FPT', '↗'],
        ['🥈', 'B9nY...pL2c', 'WPL $5', '4,750FPT', '↗'],
        ['🥉', 'Fp2M...jA7b', 'LPM $10', '9.5k FPT', '↗'],
        ['4', 'Qd4Z...wN6m', 'MPL $25', '23.7k', '↗'],
        ['5', 'Hn7J...eK1p', 'DPL $2', '1,900FPT', '↗'],
      ].map((row, i) => (
        <g key={i}>
          <rect x="18" y={106 + i*20} width="284" height="20" rx="2"
            fill={i % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent'} />
          {row.map((cell, j) => (
            <text key={j} x={[28,55,155,220,270][j]} y={119 + i*20}
              fontSize="7.5" fill={j===4?'#22d3ee':'#9ca3af'} fontFamily="monospace">{cell}</text>
          ))}
        </g>
      ))}
    </svg>
  );
}

/* 8. Architecture Block Diagram */
function ArchitectureDiagram() {
  return (
    <svg viewBox="0 0 490 242" className="w-full max-w-lg mx-auto">
      <defs>
        <marker id="a-c" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
          <path d="M0,0 L6,3 L0,6 Z" fill="#22d3ee" />
        </marker>
        <marker id="a-a" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
          <path d="M0,0 L6,3 L0,6 Z" fill="#f59e0b" />
        </marker>
        <marker id="a-p" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
          <path d="M0,0 L6,3 L0,6 Z" fill="#818cf8" />
        </marker>
        <marker id="a-g" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
          <path d="M0,0 L6,3 L0,6 Z" fill="#34d399" />
        </marker>
      </defs>

      {/* Subtle grid */}
      {[0,1,2,3,4].map(i => (
        <line key={i} x1="0" y1={48*i+8} x2="490" y2={48*i+8} stroke="#1f2937" strokeWidth="0.5" />
      ))}

      {/* ── ARROW 1: User → Fortress (buy_ticket) ── */}
      <path d="M83 106 L138 106" stroke="#22d3ee" strokeWidth="1.6" markerEnd="url(#a-c)" />
      <text x="110" y="100" textAnchor="middle" fontSize="7" fill="#22d3ee" fontFamily="monospace">buy_ticket</text>
      <text x="110" y="120" textAnchor="middle" fontSize="6.5" fill="#6b7280" fontFamily="monospace">(FPT → vault)</text>

      {/* ── ARROW 2: Fortress → Oracle (request_entropy) ── */}
      <path d="M183 88 L258 26" stroke="#f59e0b" strokeWidth="1.5" markerEnd="url(#a-a)" />
      <text x="215" y="50" textAnchor="middle" fontSize="7" fill="#f59e0b" fontFamily="monospace">request_entropy</text>

      {/* ── ARROW 3: Oracle → Fortress (VRF reveal, dashed) ── */}
      <path d="M258 35 L225 88" stroke="#f59e0b" strokeWidth="1.4" strokeDasharray="4 2" markerEnd="url(#a-a)" />
      <text x="252" y="68" textAnchor="start" fontSize="7" fill="#d97706" fontFamily="monospace">VRF reveal</text>
      <text x="252" y="78" textAnchor="start" fontSize="6.5" fill="#6b7280" fontFamily="monospace">(~2s SGX TEE)</text>

      {/* ── ARROW 4: Fortress → PDA Vault (controls) ── */}
      <path d="M228 106 L258 106" stroke="#818cf8" strokeWidth="1.4" markerEnd="url(#a-p)" />
      <text x="243" y="100" textAnchor="middle" fontSize="6.5" fill="#818cf8" fontFamily="monospace">controls</text>

      {/* ── ARROW 5: PDA Vault → Winner (95% prize) ── */}
      <path d="M344 96 L396 64" stroke="#34d399" strokeWidth="2" markerEnd="url(#a-g)" />
      <text x="366" y="73" textAnchor="middle" fontSize="7.5" fill="#34d399" fontFamily="monospace" fontWeight="700">95% prize</text>

      {/* ── ARROW 6: PDA Vault → Treasury (5% fee) ── */}
      <path d="M344 116 L396 174" stroke="#f59e0b" strokeWidth="1.5" markerEnd="url(#a-a)" />
      <text x="366" y="152" textAnchor="middle" fontSize="7" fill="#f59e0b" fontFamily="monospace">5% fee</text>

      {/* ── NODE: User Wallet ── */}
      <rect x="5" y="88" width="78" height="36" rx="6" fill="rgba(17,24,39,0.95)" stroke="#22d3ee" strokeWidth="1.8" />
      <text x="44" y="104" textAnchor="middle" fontSize="8" fill="#22d3ee" fontFamily="monospace" fontWeight="bold">👤 User</text>
      <text x="44" y="116" textAnchor="middle" fontSize="6.5" fill="#6b7280" fontFamily="monospace">any SPL wallet</text>

      {/* ── NODE: Fortress Contract ── */}
      <rect x="138" y="88" width="90" height="36" rx="6" fill="rgba(17,24,39,0.95)" stroke="#a78bfa" strokeWidth="1.8" />
      <text x="183" y="104" textAnchor="middle" fontSize="8" fill="#a78bfa" fontFamily="monospace" fontWeight="bold">📜 Fortress</text>
      <text x="183" y="116" textAnchor="middle" fontSize="6.5" fill="#6b7280" fontFamily="monospace">Anchor Program</text>

      {/* ── NODE: SB Oracle ── */}
      <rect x="258" y="8" width="86" height="36" rx="6" fill="rgba(17,24,39,0.95)" stroke="#f59e0b" strokeWidth="1.8" />
      <text x="301" y="24" textAnchor="middle" fontSize="8" fill="#f59e0b" fontFamily="monospace" fontWeight="bold">🔮 SB Oracle</text>
      <text x="301" y="36" textAnchor="middle" fontSize="6.5" fill="#6b7280" fontFamily="monospace">SGX TEE Enclave</text>

      {/* ── NODE: PDA Vault ── */}
      <rect x="258" y="88" width="86" height="36" rx="6" fill="rgba(17,24,39,0.95)" stroke="#818cf8" strokeWidth="1.8" />
      <text x="301" y="104" textAnchor="middle" fontSize="8" fill="#818cf8" fontFamily="monospace" fontWeight="bold">🏦 PDA Vault</text>
      <text x="301" y="116" textAnchor="middle" fontSize="6.5" fill="#6b7280" fontFamily="monospace">FPT locked</text>

      {/* ── NODE: Winner ── */}
      <rect x="396" y="46" width="85" height="36" rx="6" fill="rgba(17,24,39,0.95)" stroke="#34d399" strokeWidth="2" />
      <text x="438" y="62" textAnchor="middle" fontSize="8" fill="#34d399" fontFamily="monospace" fontWeight="bold">🏆 Winner</text>
      <text x="438" y="74" textAnchor="middle" fontSize="6.5" fill="#6b7280" fontFamily="monospace">95% wins wallet</text>

      {/* ── NODE: Treasury ── */}
      <rect x="396" y="156" width="85" height="36" rx="6" fill="rgba(17,24,39,0.95)" stroke="#f59e0b" strokeWidth="1.8" />
      <text x="438" y="172" textAnchor="middle" fontSize="8" fill="#f59e0b" fontFamily="monospace" fontWeight="bold">⚙️ Treasury</text>
      <text x="438" y="184" textAnchor="middle" fontSize="6.5" fill="#6b7280" fontFamily="monospace">ops &amp; bounty</text>

      {/* Caption */}
      <text x="245" y="234" textAnchor="middle" fontSize="7.5" fill="#4b5563" fontFamily="monospace">
        Fortress Protocol — Component Interaction on Solana
      </text>
    </svg>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

/* NEW: Three Clocks — DPL / WPL / MPL time-based tiers */
function TimeClocksDiagram() {
  const clocks = [
    { cx: 55,  label: 'DPL', sub: '24 h', color: '#22d3ee', ticks: 24 },
    { cx: 160, label: 'WPL', sub: '7 d',  color: '#a78bfa', ticks: 7  },
    { cx: 265, label: 'MPL', sub: '30 d', color: '#34d399', ticks: 12 },
  ];
  return (
    <svg viewBox="0 0 320 200" className="w-full max-w-sm mx-auto" aria-label="Time-based lottery clocks">
      <defs>
        <marker id="arr-clk" markerWidth="5" markerHeight="5" refX="4" refY="2.5" orient="auto">
          <path d="M0,0 L5,2.5 L0,5 Z" fill="#4b5563" />
        </marker>
      </defs>
      {/* Blueprint annotation lines */}
      <line x1="10" y1="10" x2="310" y2="10" stroke="#22d3ee" strokeWidth="0.3" strokeDasharray="5 4" />
      <line x1="10" y1="185" x2="310" y2="185" stroke="#22d3ee" strokeWidth="0.3" strokeDasharray="5 4" />

      {clocks.map((ck) => {
        const r = 44;
        return (
          <g key={ck.label}>
            {/* Outer ring */}
            <circle cx={ck.cx} cy={100} r={r} fill="rgba(0,0,0,0.4)" stroke={ck.color} strokeWidth="2" />
            {/* Tick marks */}
            {Array.from({ length: ck.ticks }).map((_, t) => {
              const angle = (t / ck.ticks) * 2 * Math.PI - Math.PI / 2;
              const inner = r - 7;
              const outer = r - 2;
              return (
                <line key={t}
                  x1={ck.cx + Math.cos(angle) * inner}
                  y1={100    + Math.sin(angle) * inner}
                  x2={ck.cx + Math.cos(angle) * outer}
                  y2={100    + Math.sin(angle) * outer}
                  stroke={ck.color} strokeWidth={t === 0 ? 2 : 0.8} opacity={0.6}
                />
              );
            })}
            {/* Hour hand (pointing to ~10 o'clock) */}
            <line
              x1={ck.cx} y1={100}
              x2={ck.cx + Math.cos(-2.2) * (r * 0.55)}
              y2={100    + Math.sin(-2.2) * (r * 0.55)}
              stroke={ck.color} strokeWidth="2.5" strokeLinecap="round"
            />
            {/* Minute hand (pointing to ~2 o'clock) */}
            <line
              x1={ck.cx} y1={100}
              x2={ck.cx + Math.cos(0.6) * (r * 0.72)}
              y2={100    + Math.sin(0.6) * (r * 0.72)}
              stroke={ck.color} strokeWidth="1.5" strokeLinecap="round"
            />
            {/* Centre pin */}
            <circle cx={ck.cx} cy={100} r={3} fill={ck.color} />
            {/* Labels */}
            <text x={ck.cx} y={155} textAnchor="middle" fontSize="11" fontWeight="bold" fill={ck.color} fontFamily="monospace">{ck.label}</text>
            <text x={ck.cx} y={167} textAnchor="middle" fontSize="9" fill="#6b7280" fontFamily="monospace">{ck.sub} cycle</text>
            {/* Countdown badge */}
            <rect x={ck.cx - 22} y={20} width="44" height="13" rx="2" fill={`${ck.color}18`} stroke={ck.color} strokeWidth="0.8" />
            <text x={ck.cx} y={30} textAnchor="middle" fontSize="7" fill={ck.color} fontFamily="monospace">⏳ ACTIVE</text>
          </g>
        );
      })}
      <text x="160" y="193" textAnchor="middle" fontSize="8" fill="#4b5563" fontFamily="monospace">Time-Based Draws — DPL · WPL · MPL</text>
    </svg>
  );
}

/* NEW: Chain Fill — LPM 100-participant count */
function ChainFillDiagram() {
  const total = 10; // rows of 10 = 100
  const filled = 8;  // 80% full for visual
  return (
    <svg viewBox="0 0 320 220" className="w-full max-w-sm mx-auto" aria-label="LPM chain fill diagram">
      <defs>
        <marker id="arr-lpm" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
          <path d="M0,0 L6,3 L0,6 Z" fill="#f59e0b" />
        </marker>
      </defs>
      {/* Blueprint lines */}
      <line x1="10" y1="10" x2="310" y2="10" stroke="#22d3ee" strokeWidth="0.3" strokeDasharray="5 4" />

      {/* Title */}
      <text x="160" y="22" textAnchor="middle" fontSize="9" fill="#f59e0b" fontFamily="monospace">⚡ LPM — CHAIN-REACTION TRIGGER</text>

      {/* Participant grid 10×10 — flattened for parser safety */}
      {Array.from({ length: total * total }).map((_, idx) => {
        const row = Math.floor(idx / total);
        const col = idx % total;
        const isFull = row < filled;
        const cx = 24 + col * 28;
        const cy = 38 + row * 15;
        return (
          <g key={idx}>
            <rect x={cx} y={cy} width="22" height="11" rx="2"
              fill={isFull ? 'rgba(245,158,11,0.25)' : 'rgba(255,255,255,0.03)'}
              stroke={isFull ? '#f59e0b' : '#374151'} strokeWidth={isFull ? 1.2 : 0.6} />
            {isFull && (
              <text x={cx + 11} y={cy + 8.5} textAnchor="middle" fontSize="6" fill="#f59e0b" fontFamily="monospace">✓</text>
            )}
          </g>
        );
      })}

      {/* Progress bar */}
      <rect x="20" y="192" width="280" height="10" rx="3" fill="#1f2937" />
      <rect x="20" y="192" width={280 * 0.8} height="10" rx="3" fill="#f59e0b" opacity="0.8" />
      <text x="160" y="201" textAnchor="middle" fontSize="7" fill="#0d1117" fontFamily="monospace" fontWeight="bold">80 / 100 participants</text>

      {/* Arrow to trigger */}
      <text x="160" y="213" textAnchor="middle" fontSize="8" fill="#6b7280" fontFamily="monospace">@ 100 → execute_draw() fires instantly ⚡</text>
    </svg>
  );
}

export default function WhitepaperPage() {
  const { isDarkMode } = useTheme();
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(FPT_MINT);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Layout>
      <GridBg isDark={isDarkMode} />

      {/* ── Light mode CSS overrides ─────────────────────────────────────── */}
      {!isDarkMode && (
        <style>{`
          .wp-page [class*="bg-black/"] { background-color: rgba(255,255,255,0.85) !important; box-shadow: 0 1px 3px rgba(0,0,0,0.08) !important; }
          .wp-page .text-white { color: #111827 !important; }
          .wp-page .text-gray-400 { color: #4b5563 !important; }
          .wp-page .text-gray-500 { color: #6b7280 !important; }
          .wp-page .text-gray-600 { color: #6b7280 !important; }
          .wp-page .text-gray-700 { color: #374151 !important; }
          .wp-page .text-gray-800 { color: #1f2937 !important; }
          .wp-page .border-gray-800 { border-color: #d1d5db !important; }
          .wp-page .border-gray-700\/50 { border-color: #e5e7eb !important; }
          .wp-page .divide-gray-900 > * + * { border-color: #e5e7eb !important; }
          .wp-page .text-gray-600.mb-1 { color: #9ca3af !important; }
          .wp-page [class*="border-b border-gray-8"] { border-color: #d1d5db !important; }
        `}</style>
      )}

      {/* ── Sticky ToC ── */}
      <nav className="hidden xl:block fixed right-6 top-24 w-44 z-30">
        <div className={`border border-cyan-500/20 backdrop-blur-md rounded-xl p-3 text-xs font-mono space-y-1.5 ${isDarkMode ? 'bg-black/60' : 'bg-white/95 shadow-md'}`}>
          <div className="text-cyan-400 font-semibold mb-2 flex items-center gap-1.5">
            <FileText className="w-3 h-3" /> Whitepaper
          </div>
          {[
            ['#s1', '01 · Vision'],
            ['#s2', '02 · Philosophy'],
            ['#s3', '03 · User Journey'],
            ['#s4', '04 · Four Pillars'],
            ['#s5', '05 · Provably Fair'],
            ['#s6', '06 · Draw Trigger'],
            ['#s7', '07 · Economics'],
            ['#sfpt', '08 · FPT Token'],
            ['#s8', '09 · Dashboard'],
            ['#s9', '10 · Architecture'],
            ['#s10', '11 · Closing'],
          ].map(([href, label]) => (
            <a key={href} href={href} className="block text-gray-500 hover:text-cyan-400 transition-colors leading-tight">{label}</a>
          ))}
        </div>
      </nav>

      <div className={`wp-page max-w-5xl mx-auto px-4 sm:px-8 pb-24 space-y-24`}>

        {/* ── COVER ── */}
        <motion.div
          initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}
          className="text-center pt-4 pb-8 border-b border-cyan-500/10"
        >
          <button
            onClick={handleCopy}
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-yellow-500/40 bg-yellow-500/5 hover:bg-yellow-500/10 text-yellow-400 hover:text-yellow-300 text-xs font-mono mb-6 transition-all group cursor-pointer"
          >
            <span className="text-yellow-500 font-bold">$FPT</span>
            <span className="opacity-70">{FPT_MINT.slice(0, 8)}…{FPT_MINT.slice(-6)}</span>
            {copied
              ? <Check className="w-3 h-3 text-green-400" />
              : <Copy className="w-3 h-3 opacity-50 group-hover:opacity-100 transition-opacity" />}
            <span className="sr-only">Copy FPT mint address</span>
          </button>
          <h1 className="text-5xl sm:text-6xl font-black mb-2 leading-tight"
            style={{ fontFamily: '"Poppins", sans-serif', background: 'linear-gradient(135deg, #22d3ee 0%, #a78bfa 50%, #34d399 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            Fortress Protocol
          </h1>
          <p className="text-2xl font-mono text-gray-400 mb-6">Official Protocol Whitepaper</p>
          <p className="text-gray-500 font-mono text-sm max-w-xl mx-auto leading-relaxed">
            A Multi-Tiered, 100% On-Chain, Provably Fair Gaming Ecosystem<br />
            Powered by Solana · Switchboard VRF V3 · FPT Token · 16 Active Tiers
          </p>
          {/* Decorative horizontal rule */}
          <div className="flex items-center gap-3 mt-8 justify-center">
            <div className="h-px flex-1 max-w-24 bg-gradient-to-r from-transparent to-cyan-500/50" />
            <Shield className="w-4 h-4 text-cyan-500/50" />
            <div className="h-px flex-1 max-w-24 bg-gradient-to-l from-transparent to-cyan-500/50" />
          </div>
        </motion.div>

        {/* ══════════════════════════════════════════════════════════════════════
            SECTION 1 — VISION & PROBLEM
        ══════════════════════════════════════════════════════════════════════ */}
        <Section id="s1">
          <div className="grid md:grid-cols-2 gap-10 items-center">
            {/* LEFT visual */}
            <motion.div variants={fadeRight}>
              <div className="rounded-2xl border border-gray-700/50 bg-black/40 p-4 backdrop-blur-sm">
                <BlackBoxDiagram />
              </div>
            </motion.div>
            {/* RIGHT text */}
            <motion.div variants={fadeLeft}>
              <SectionLabel n="01" label="The Vision & Problem" />
              <h2 className="text-3xl font-black text-white mb-4" style={{ fontFamily: '"Poppins", sans-serif' }}>
                The Problem with<br />Traditional Lotteries
              </h2>
              <p className="text-gray-400 text-sm leading-loose mb-4">
                The global lottery industry moves trillions in ticket sales annually — yet the mechanism by which winners are selected is almost universally a black box. Players deposit funds into an opaque server. A private algorithm draws a result. No participant can verify the process was fair.
              </p>
              <div className="space-y-3">
                {[
                  ['🔒', 'Centralised Control', 'A single party controls prize selection with no external audit trail.'],
                  ['✂️', 'Opaque Raking', 'House edges of 30–50% are standard; fees are buried in fine print.'],
                  ['❌', 'Unverifiable Outcome', 'You must trust the operator. There is no cryptographic proof.'],
                ].map(([icon, title, desc]) => (
                  <div key={title} className="flex gap-3 p-3 rounded-lg border border-gray-800 bg-black/20">
                    <span className="text-lg shrink-0">{icon}</span>
                    <div>
                      <div className="text-sm font-bold text-white">{title}</div>
                      <div className="text-xs text-gray-500 leading-relaxed">{desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          </div>
        </Section>

        {/* ══════════════════════════════════════════════════════════════════════
            SECTION 2 — SOLUTION
        ══════════════════════════════════════════════════════════════════════ */}
        <Section id="s2" className="border-t border-cyan-500/10 pt-16">
          <div className="grid md:grid-cols-2 gap-10 items-center">
            {/* LEFT text */}
            <motion.div variants={fadeRight}>
              <SectionLabel n="02" label="The Philosophy" />
              <h2 className="text-3xl font-black mb-4"
                style={{ fontFamily: '"Poppins", sans-serif', background: 'linear-gradient(90deg,#22d3ee,#a78bfa)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                Fortress Protocol:<br />The Glass Box Ecosystem
              </h2>
              <p className="text-gray-400 text-sm leading-loose mb-4">
                Fortress Protocol is not a single lottery — it is a <strong className="text-white">multi-tiered, on-chain gaming ecosystem</strong> where every draw, every ticket, and every prize transfer is cryptographically verifiable by any person on Earth. Four distinct lottery types, 16 active tiers, one shared philosophy: radical transparency.
              </p>
              <div className="space-y-3">
                {[
                  ['⚡', 'Solana-native Speed', 'Transactions confirm in ~400 ms. Prize payouts are instant.'],
                  ['🔮', 'Switchboard V3 TEE VRF', 'Winner selection uses a hardware-secured Intel SGX enclave oracle — cryptographically proven, zero-knowledge verifiable randomness.'],
                  ['🏆', '95% Prize Payout', 'Only 5% goes to the protocol treasury. The rest is yours.'],
                  ['🌐', 'Permissionless', 'Anyone with a Solana wallet can participate. No KYC. No geo-blocks.'],
                ].map(([icon, title, desc]) => (
                  <div key={title} className="flex gap-3 p-3 rounded-lg border border-cyan-500/15 bg-cyan-500/5">
                    <span className="text-lg shrink-0">{icon}</span>
                    <div>
                      <div className="text-sm font-bold text-white">{title}</div>
                      <div className="text-xs text-gray-500 leading-relaxed">{desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
            {/* RIGHT visual */}
            <motion.div variants={fadeLeft}>
              <div className="rounded-2xl border border-cyan-500/20 bg-black/40 p-4 backdrop-blur-sm">
                <GlassBoxDiagram />
              </div>
            </motion.div>
          </div>
        </Section>

        {/* ══════════════════════════════════════════════════════════════════════
            SECTION 3 — USER JOURNEY
        ══════════════════════════════════════════════════════════════════════ */}
        <Section id="s3" className="border-t border-cyan-500/10 pt-16">
          <motion.div variants={fadeUp} className="text-center mb-10">
            <SectionLabel n="03" label="User Journey" />
            <h2 className="text-3xl font-black text-white" style={{ fontFamily: '"Poppins", sans-serif' }}>
              From Zero to Player in Four Steps
            </h2>
          </motion.div>
          <div className="grid md:grid-cols-2 gap-10 items-start">
            {/* LEFT visual */}
            <motion.div variants={fadeRight}>
              <div className="rounded-2xl border border-purple-500/20 bg-black/40 p-4">
                <JourneyDiagram />
              </div>
            </motion.div>
            {/* RIGHT text */}
            <motion.div variants={fadeLeft} className="space-y-4">
              {[
                {
                  step: '01',
                  icon: '💱',
                  title: 'Liquidity Gateway',
                  color: 'border-yellow-500/30 bg-yellow-500/5',
                  body: 'Convert your SOL into Fortress Protocol Token (FPT) — the universal key to all 16 lottery tiers. Use the built-in Liquidity Gateway to swap SOL for $FPT in a single transaction. FPT is Token-2022 standard, 6 decimal precision. All tiers across LPM, DPL, WPL, and MPL are denominated in FPT.',
                },
                {
                  step: '02',
                  icon: '👛',
                  title: 'Connect Your Wallet',
                  color: 'border-purple-500/30 bg-purple-500/5',
                  body: 'Use any Solana-compatible wallet: Phantom, Solflare, Backpack, or Ledger. The protocol is non-custodial — your keys, your funds.',
                },
                {
                  step: '03',
                  icon: '🎟️',
                  title: 'Buy a Ticket',
                  color: 'border-cyan-500/30 bg-cyan-500/5',
                  body: 'Select a tier that matches your risk appetite. LPM (Lightning Pool) tiers: $5, $10, $20, $50 FPT — capacity-based at 100 players each. DPL, WPL, and MPL tiers: $5, $10, $15, $20 FPT — time-based draws (daily, weekly, monthly). Each purchase reserves your spot in the participant ledger stored entirely on-chain.',
                },
                {
                  step: '04',
                  icon: '🏆',
                  title: 'Win Instantly',
                  color: 'border-green-500/30 bg-green-500/5',
                  body: 'When the draw triggers, the smart contract computes the winning index and sends 95% of the pool directly to the winner\'s wallet in the same transaction block.',
                },
              ].map(s => (
                <div key={s.step} className={`rounded-xl border p-4 ${s.color}`}>
                  <div className="flex items-start gap-3">
                    <span className="text-xl shrink-0">{s.icon}</span>
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-mono text-gray-600">step.{s.step}</span>
                        <span className="text-sm font-bold text-white">{s.title}</span>
                      </div>
                      <p className="text-xs text-gray-400 leading-relaxed">{s.body}</p>
                    </div>
                  </div>
                </div>
              ))}
            </motion.div>
          </div>
        </Section>

        {/* ══════════════════════════════════════════════════════════════════════
            SECTION 4 — THE FOUR PILLARS
        ══════════════════════════════════════════════════════════════════════ */}
        <Section id="s4" className="border-t border-cyan-500/10 pt-16">
          <motion.div variants={fadeUp} className="text-center mb-12">
            <SectionLabel n="04" label="The Four Pillars" />
            <h2 className="text-3xl font-black text-white mb-3" style={{ fontFamily: '"Poppins", sans-serif' }}>
              One Ecosystem. Four Lottery Types.<br />Sixteen Active Tiers.
            </h2>
            <p className="text-gray-400 text-sm max-w-2xl mx-auto leading-relaxed">
              You are not playing a single game — you are entering a <strong className="text-white">multi-tiered decentralised gaming portfolio</strong>.
              Each lottery type runs independently, with its own rhythm, its own prize pools, and its own risk profile.
              All four share one smart contract, one randomness source, and one unbreakable rule: <span className="text-cyan-400">the house cannot cheat.</span>
            </p>
          </motion.div>

          {/* ── Pillar 1: LPM — zigzag LEFT text / RIGHT visual ── */}
          <div className="grid md:grid-cols-2 gap-10 items-center mb-16">
            <motion.div variants={fadeRight}>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-yellow-500/40 bg-yellow-500/10 text-yellow-400 text-xs font-mono mb-4">
                ⚡ PILLAR 1 · CHAIN-BASED
              </div>
              <h3 className="text-2xl font-black text-white mb-3" style={{ fontFamily: '"Poppins", sans-serif' }}>
                LPM — Lightning Pool
              </h3>
              <p className="text-gray-400 text-sm leading-relaxed mb-4">
                The flagship model. The draw triggers the instant exactly <strong className="text-white">100 participants</strong> purchase tickets in a tier — no timer, no delay. Pool size is perfectly predictable, prize payout is atomic. This is the protocol's fastest, most electric game mode.
              </p>
              <div className="space-y-2 mb-4">
                {[
                  ['4 Tiers', '$5 · $10 · $20 · $50 FPT per ticket'],
                  ['100 players', 'Fixed pool size — fills, draws, resets'],
                  ['Instant payout', '95% to winner in the same transaction block'],
                  ['No expiry', 'The pool never expires — it just keeps filling'],
                ].map(([k, v]) => (
                  <div key={k} className="flex gap-3 text-xs">
                    <span className="text-yellow-400 font-mono font-bold shrink-0 w-28">{k}</span>
                    <span className="text-gray-400">{v}</span>
                  </div>
                ))}
              </div>
              <div className="font-mono text-xs text-yellow-300 bg-black/30 rounded-lg p-3 border border-yellow-500/20">
                participants == 100 → execute_draw() → 95% → winner
              </div>
            </motion.div>
            <motion.div variants={fadeLeft}>
              <div className="rounded-2xl border border-yellow-500/25 bg-black/40 p-4">
                <ChainFillDiagram />
              </div>
            </motion.div>
          </div>

          {/* ── Pillars 2-4: Time-based — zigzag RIGHT text / LEFT visual ── */}
          <div className="grid md:grid-cols-2 gap-10 items-center mb-12">
            <motion.div variants={fadeRight} className="order-2 md:order-1">
              <div className="rounded-2xl border border-cyan-500/20 bg-black/40 p-4">
                <TimeClocksDiagram />
              </div>
            </motion.div>
            <motion.div variants={fadeLeft} className="order-1 md:order-2">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-cyan-500/40 bg-cyan-500/10 text-cyan-400 text-xs font-mono mb-4">
                ⏳ PILLARS 2–4 · TIME-BASED
              </div>
              <h3 className="text-2xl font-black text-white mb-3" style={{ fontFamily: '"Poppins", sans-serif' }}>
                DPL · WPL · MPL — The Time Tiers
              </h3>
              <p className="text-gray-400 text-sm leading-relaxed mb-5">
                These three lottery types run on fixed schedules — the clock ticks and when it expires, the draw fires. Each cycle, prize pools accumulate from ticket sales. The longer the cycle, the larger the potential jackpot. Any community member can trigger settlement once a round expires, earning a <strong className="text-white">FPT bounty</strong> directly from the protocol’s treasury.
              </p>
              <div className="space-y-4">
                {[
                  {
                    badge: '📅 DPL · Daily Pool',
                    color: 'border-cyan-500/30 bg-cyan-500/5',
                    hcolor: 'text-cyan-400',
                    cycle: '24-hour cycle',
                    desc: 'Fresh draws every day. Perfect for consistent, daily engagement. 4 tiers ($5 · $10 · $15 · $20 FPT). The smallest cycle with the fastest turnaround.',
                  },
                  {
                    badge: '🗓️ WPL · Weekly Pool',
                    color: 'border-purple-500/30 bg-purple-500/5',
                    hcolor: 'text-purple-400',
                    cycle: '7-day accumulation',
                    desc: 'Seven days of ticket sales compound into a larger prize pool. 4 tiers ($5 · $10 · $15 · $20 FPT). The sweet spot between frequency and reward size.',
                  },
                  {
                    badge: '🏆 MPL · Monthly Pool',
                    color: 'border-green-500/30 bg-green-500/5',
                    hcolor: 'text-green-400',
                    cycle: '30-day Grand Draw',
                    desc: 'The highest-stakes event in the ecosystem. A full month of accumulation creates the largest possible jackpots. 4 tiers ($5 · $10 · $15 · $20 FPT). Maximum risk, maximum reward.',
                  },
                ].map((p) => (
                  <div key={p.badge} className={`rounded-xl border p-4 ${p.color}`}>
                    <div className="flex items-center justify-between mb-2">
                      <span className={`font-bold text-sm ${p.hcolor}`}>{p.badge}</span>
                      <span className={`font-mono text-xs ${p.hcolor} opacity-70`}>{p.cycle}</span>
                    </div>
                    <p className="text-xs text-gray-400 leading-relaxed">{p.desc}</p>
                  </div>
                ))}
              </div>
            </motion.div>
          </div>
        </Section>

        {/* ══════════════════════════════════════════════════════════════════════
            SECTION 5 — PROVABLY FAIR ENGINE
        ══════════════════════════════════════════════════════════════════════ */}
        <Section id="s5" className="border-t border-cyan-500/10 pt-16">
          <div className="grid md:grid-cols-2 gap-10 items-center">
            {/* LEFT visual */}
            <motion.div variants={fadeRight}>
              <div className="rounded-2xl border border-purple-500/20 bg-black/40 p-4">
                <EntropyDiagram />
              </div>
              {/* Feed address pill */}
              <div className="mt-3 rounded-lg border border-cyan-500/20 bg-black/30 p-3 text-xs font-mono">
                <span className="text-gray-600">SB On-Demand Program (mainnet): </span>
                <a
                  href={`https://solscan.io/account/${SB_ON_DEMAND_PROGRAM}`}
                  target="_blank" rel="noopener noreferrer"
                  className="text-cyan-400 hover:text-cyan-300 break-all transition-colors"
                >
                  {`${SB_ON_DEMAND_PROGRAM.slice(0,6)}…${SB_ON_DEMAND_PROGRAM.slice(-3)}`} <ExternalLink className="inline w-3 h-3" />
                </a>
              </div>
            </motion.div>
            {/* RIGHT text */}
            <motion.div variants={fadeLeft}>
              <SectionLabel n="05" label="Provably Fair Engine" />
              <h2 className="text-3xl font-black mb-4"
                style={{ fontFamily: '"Poppins", sans-serif', background: 'linear-gradient(90deg,#a78bfa,#22d3ee)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                Switchboard V3 TEE<br />On-Chain Randomness
              </h2>
              <p className="text-gray-400 text-sm leading-loose mb-4">
                Instead of a private random number generator, <strong className="text-white">every lottery type in the Fortress Protocol ecosystem</strong> uses <strong className="text-white">Switchboard V3 On-Demand VRF</strong> — a Trusted Execution Environment oracle running inside a hardware-secured <strong className="text-white">Intel SGX enclave</strong>. The enclave generates a 32-byte verifiable random value that even the oracle operator cannot bias, inspect, or predict. One entropy source. Four lottery types. Sixteen tiers. Zero manipulation possible.
              </p>
              <p className="text-gray-400 text-sm leading-loose mb-4">
                Each draw is a two-step commit-reveal protocol. The requester submits a random commitment on-chain; the oracle independently produces its 32-byte VRF output. The winner index is derived by mixing both:
              </p>
              <ul className="text-sm space-y-2 mb-4 text-gray-400">
                {[
                  ['sb_value[0..31]', 'The 32-byte VRF output written to the RandomnessAccount by the SGX enclave after commit'],
                  ['reveal_slot', 'The Solana slot when the oracle revealed — must be strictly greater than the request slot (anti-replay)'],
                  ['user_commitment', "A 32-byte user-supplied commitment XOR'd in at fulfillment — neither party can bias the outcome alone"],
                ].map(([field, desc]) => (
                  <li key={field} className="flex gap-2">
                    <code className="text-purple-300 shrink-0">{field}</code>
                    <span className="text-xs leading-relaxed">{desc}</span>
                  </li>
                ))}
              </ul>
              <div className="rounded-xl bg-black/50 border border-purple-500/20 p-4 font-mono text-xs leading-loose">
                <div className="text-gray-600 mb-1">{"// Winner derivation (oracle.rs — create_lottery_entropy_from_slot)"}</div>
                <div className="text-purple-300">s0..s3  = sb_value split into four u64s <span className="text-gray-500">(Xoshiro256++)</span></div>
                <div className="text-purple-300">a0 = s0 XOR s2 &nbsp; a1 = s1 XOR s3</div>
                <div className="text-cyan-300 mt-1">final   = a0 XOR a1 XOR (commitment ⊕ vault_seed)</div>
                <div className="text-green-300">winner  = final % participant_count</div>
              </div>
              <p className="mt-4 text-xs text-gray-500 leading-relaxed">
                The <code className="text-cyan-300">vault_seed</code> encodes the lottery type, tier number, and round number — guaranteeing that two draws at the exact same slot still produce different winners. If the oracle has not yet committed (<code className="text-purple-300">reveal_slot == 0</code>), or the revealed slot is not strictly greater than the request slot (replay protection), the <code className="text-red-400">fulfill_draw_entropy</code> instruction rejects with <code className="text-red-400">DrawNotYetReady</code> — a draw can never complete on stale or pre-committed randomness.
              </p>
            </motion.div>
          </div>
        </Section>

        {/* ══════════════════════════════════════════════════════════════════════
            SECTION 6 — DRAW TRIGGER SYSTEM
        ══════════════════════════════════════════════════════════════════════ */}
        <Section id="s6" className="border-t border-cyan-500/10 pt-16">
          <motion.div variants={fadeUp} className="text-center mb-12">
            <SectionLabel n="06" label="Draw Trigger System" />
            <h2 className="text-3xl font-black mb-4"
              style={{ fontFamily: '"Poppins", sans-serif', background: 'linear-gradient(90deg,#34d399,#22d3ee)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              How Draws Get Triggered
            </h2>
            <p className="text-gray-400 text-sm max-w-2xl mx-auto leading-relaxed">
              When a tier is ready — either filled (LPM) or expired (DPL/WPL/MPL) — the draw must be triggered to select a winner.
              Fortress Protocol supports <strong className="text-white">two trigger methods</strong> that work together as a resilient dual-path system.
            </p>
          </motion.div>

          <div className="grid md:grid-cols-2 gap-8 mb-10">
            {/* Auto-Trigger */}
            <motion.div variants={fadeRight}>
              <div className="rounded-2xl border border-green-500/25 bg-black/40 p-6 h-full">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-green-500/40 bg-green-500/10 text-green-400 text-xs font-mono mb-4">
                  🤖 AUTO-TRIGGER (ON-HOUSE)
                </div>
                <h3 className="text-xl font-black text-white mb-3" style={{ fontFamily: '"Poppins", sans-serif' }}>
                  Crank Bot — Fully Automated
                </h3>
                <p className="text-gray-400 text-sm leading-relaxed mb-4">
                  The protocol runs a <strong className="text-white">keeper bot (crank)</strong> that monitors all 16 tiers continuously. The moment a tier becomes eligible for a draw — either LPM hits 100 participants or a time-based tier (DPL/WPL/MPL) expires — the crank automatically initiates the full draw sequence with zero human intervention.
                </p>
                <div className="space-y-3 mb-4">
                  {[
                    ['Detection', 'Polls on-chain vault state every few seconds'],
                    ['Step 1', 'Creates a Switchboard randomness account and submits request_draw_entropy + commit in one transaction'],
                    ['Oracle Wait', 'Waits ~2.5 seconds for the SGX enclave oracle to produce a verifiable random value'],
                    ['Step 2', 'Submits the reveal transaction — the on-chain program derives the winner index and pays out 95% of the pool instantly'],
                    ['Cost', 'All Switchboard oracle fees, rent, and gas are paid by the protocol treasury — users pay nothing'],
                  ].map(([k, v]) => (
                    <div key={k} className="flex gap-3 text-xs">
                      <span className="text-green-400 font-mono font-bold shrink-0 w-24">{k}</span>
                      <span className="text-gray-400">{v}</span>
                    </div>
                  ))}
                </div>
                <div className="font-mono text-xs text-green-300 bg-black/30 rounded-lg p-3 border border-green-500/20">
                  crank detects → commit → oracle TEE → reveal → winner paid
                </div>
              </div>
            </motion.div>

            {/* Fallback Trigger */}
            <motion.div variants={fadeLeft}>
              <div className="rounded-2xl border border-cyan-500/25 bg-black/40 p-6 h-full">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-cyan-500/40 bg-cyan-500/10 text-cyan-400 text-xs font-mono mb-4">
                  🔧 FALLBACK TRIGGER (COMMUNITY)
                </div>
                <h3 className="text-xl font-black text-white mb-3" style={{ fontFamily: '"Poppins", sans-serif' }}>
                  Automatic-First — Community Fallback
                </h3>
                <p className="text-gray-400 text-sm leading-relaxed mb-4">
                  Every draw fires automatically via the keeper bot. If automation is temporarily unavailable, any connected wallet can step in as a fallback. This <strong className="text-white">3-click fallback flow</strong> ensures the protocol is fully <strong className="text-white">permissionless</strong>: no single point of failure.
                </p>
                <div className="space-y-3 mb-4">
                  {[
                    ['Step 1', 'If automation stalls, click "Request Draw" — wallet signs a transaction that creates an ephemeral Switchboard randomness account, commits randomness, and creates a PendingDraw PDA on-chain'],
                    ['Oracle Wait', 'The SGX enclave oracle processes the commitment (~5-10 seconds)'],
                    ['Step 2', 'Click "Oracle Reveal" — wallet signs the reveal transaction confirming the oracle output on-chain'],
                    ['Step 3', 'Click "Finalize Draw" — the program verifies the oracle output, derives the winner, and pays out the prize pool in the same block'],
                    ['Cost', 'The treasury reimburses all Switchboard oracle fees via extra_lamports — the fallback settler pays only standard Solana gas (~0.000005 SOL)'],
                    ['Bounty', 'The settler earns an FPT bounty from the treasury for finalizing the draw'],
                  ].map(([k, v]) => (
                    <div key={k} className="flex gap-3 text-xs">
                      <span className="text-cyan-400 font-mono font-bold shrink-0 w-24">{k}</span>
                      <span className="text-gray-400">{v}</span>
                    </div>
                  ))}
                </div>
                <div className="font-mono text-xs text-cyan-300 bg-black/30 rounded-lg p-3 border border-cyan-500/20">
                  user fallback step 1 → oracle TEE → step 2 → step 3 → winner paid + FPT bounty
                </div>
              </div>
            </motion.div>
          </div>


        </Section>

        {/* ══════════════════════════════════════════════════════════════════════
            SECTION 7 — ECONOMICS
        ══════════════════════════════════════════════════════════════════════ */}
        <Section id="s7" className="border-t border-cyan-500/10 pt-16">
          <div className="grid md:grid-cols-2 gap-10 items-center">
            {/* LEFT text */}
            <motion.div variants={fadeRight}>
              <SectionLabel n="07" label="Prize Distribution & Protocol Economics" />
              <h2 className="text-3xl font-black text-white mb-4" style={{ fontFamily: '"Poppins", sans-serif' }}>
                Where Every FPT Goes
              </h2>
              <div className="space-y-4 text-sm text-gray-400">
                <p className="text-xs leading-relaxed text-gray-400">
                  The same fee model applies universally across <strong className="text-white">all 16 tiers</strong> and all four lottery types — LPM, DPL, WPL, and MPL. There are no exceptions, no VIP fee structures, and no hidden costs.
                </p>
                <div className="rounded-xl border border-green-500/25 bg-green-500/5 p-4">
                  <div className="text-green-400 font-bold flex items-center gap-2 mb-2">🏆 The Winner — 95%</div>
                  <p className="text-xs leading-relaxed">The entire 95% of the pool is transferred on-chain, atomically, within the draw transaction. There is no withdrawal delay, no pending period, no admin approval required.</p>
                </div>
                <div className="rounded-xl border border-yellow-500/25 bg-yellow-500/5 p-4">
                  <div className="text-yellow-400 font-bold flex items-center gap-2 mb-2">⚙️ Protocol Treasury — 5%</div>
                  <p className="text-xs leading-relaxed mb-3">The sustainability fee funds the engine that keeps the protocol running:</p>
                  <ul className="space-y-1.5 text-xs">
                    {[
                      ['💰', 'Community Draw Bounty', 'Paid as an FPT bounty to any community member who triggers a ready draw — a permissionless incentive for decentralized protocol operation.'],
                      ['🔄', 'FPT → SOL Conversion', 'The protocol auto-converts FPT to SOL when reserves run low to cover mandatory operating costs.'],
                      ['⛽', 'SB Oracle / Rent / Gas', 'On-chain rent (account storage), Switchboard oracle fees, and Solana transaction costs are all covered by the treasury.'],
                    ].map(([icon, title, desc]) => (
                      <li key={title} className="flex gap-2">
                        <span className="shrink-0">{icon}</span>
                        <span><strong className="text-white">{title}:</strong> {desc}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="rounded-xl border border-cyan-500/20 bg-black/30 p-5">
                  <div className="text-xs font-mono text-gray-500 mb-3 uppercase tracking-widest">{'// House Edge Comparison'}</div>
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center justify-between rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3">
                      <div>
                        <div className="text-xs text-red-400 font-mono mb-0.5">Traditional Lottery</div>
                        <div className="text-[11px] text-gray-500">Centralised, opaque rake</div>
                      </div>
                      <div className="text-2xl font-black text-red-400 tabular-nums">30–50%</div>
                    </div>
                    <div className="flex items-center justify-between rounded-lg border border-green-500/40 bg-green-500/10 px-4 py-3 shadow-[0_0_20px_rgba(52,211,153,0.08)]">
                      <div>
                        <div className="text-xs text-green-400 font-mono mb-0.5">Fortress Protocol</div>
                        <div className="text-[11px] text-gray-400">Sustainability fee — on-chain, auditable</div>
                      </div>
                      <div className="text-2xl font-black text-green-400 tabular-nums">5%</div>
                    </div>
                    <div className="text-center text-[10px] text-gray-600 font-mono pt-1">95% of every pool goes directly to the winner ↗</div>
                  </div>
                </div>
              </div>
            </motion.div>
            {/* RIGHT visual */}
            <motion.div variants={fadeLeft}>
              <div className="rounded-2xl border border-yellow-500/15 bg-black/40 p-4">
                <TreasuryDiagram />
              </div>
            </motion.div>
          </div>
        </Section>

        {/* ══════════════════════════════════════════════════════════════════════
            SECTION FPT — TOKEN & OPEN SOURCE
        ══════════════════════════════════════════════════════════════════════ */}
        <Section id="sfpt" className="border-t border-cyan-500/10 pt-16">
          <motion.div variants={fadeUp} className="text-center mb-10">
            <SectionLabel n="08" label="FPT Token — The Protocol Currency" />
            <h2 className="text-3xl font-black mb-4"
              style={{ fontFamily: '"Poppins", sans-serif', background: 'linear-gradient(90deg,#22d3ee,#a78bfa)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              $FPT — Fortress Protocol Token
            </h2>
            <button
              onClick={handleCopy}
              className="inline-flex items-center gap-2 px-5 py-2 rounded-full border border-yellow-500/40 bg-yellow-500/5 hover:bg-yellow-500/10 text-yellow-400 text-sm font-mono mb-2 transition-all group cursor-pointer"
            >
              <span className="text-yellow-500 font-bold">Mint:</span>
              <span className="opacity-80 break-all">{FPT_MINT}</span>
              {copied ? <Check className="w-4 h-4 text-green-400 shrink-0" /> : <Copy className="w-4 h-4 opacity-50 group-hover:opacity-100 transition-opacity shrink-0" />}
            </button>
          </motion.div>

          <div className="grid md:grid-cols-2 gap-10 mb-10">
            <motion.div variants={fadeRight}>
              <p className="text-gray-400 text-sm leading-loose mb-4">
                <strong className="text-white">Fortress Protocol Token (FPT)</strong> is the exclusive utility currency powering every economic interaction within the Fortress Protocol ecosystem. FPT is not a speculative asset or governance token — it is the cryptographic access key to all 16 lottery tiers across all four lottery types.
              </p>
              <p className="text-gray-400 text-sm leading-loose mb-4">
                Every ticket purchase, every prize payout, every community draw bounty, and every treasury operation is denominated exclusively in FPT. This creates a unified, fully auditable economic layer with no hidden currencies or off-chain settlements.
              </p>
              <div className="rounded-xl bg-black/50 border border-purple-500/20 p-4 font-mono text-xs leading-loose">
                <div className="text-gray-600 mb-1">{'// Token Specification'}</div>
                <div><span className="text-cyan-300">Standard</span><span className="text-gray-400 ml-3">Token-2022 (SPL Token Extensions)</span></div>
                <div><span className="text-cyan-300">Mint</span><span className="text-gray-400 ml-3 break-all">{FPT_MINT}</span></div>
                <div><span className="text-cyan-300">Decimals</span><span className="text-gray-400 ml-3">6 &mdash; 1 FPT = 1,000,000 base units</span></div>
                <div><span className="text-cyan-300">Network</span><span className="text-gray-400 ml-3">Solana Mainnet-Beta</span></div>
                <div><span className="text-cyan-300">Program</span><span className="text-gray-400 ml-3 break-all">{PROGRAM_ID}</span></div>
              </div>
            </motion.div>

            <motion.div variants={fadeLeft} className="space-y-3">
              {[
                ['\ud83c\udf9f\ufe0f', 'Ticket Purchase — Universal Entry', 'border-cyan-500/15 bg-cyan-500/5', 'text-cyan-400', 'All 16 lottery tiers across LPM, DPL, WPL, and MPL are exclusively priced in FPT. Entry tiers begin at 5 FPT; premium tiers reach 50 FPT. No SOL is accepted directly as ticket payment.'],
                ['\ud83c\udfc6', 'Prize Settlement — 95% of Every Pool', 'border-green-500/15 bg-green-500/5', 'text-green-400', "When a draw completes, 95% of the pool is transferred atomically to the winner's wallet in FPT — within the same transaction block. Instant, on-chain, verifiable."],
                ['\u26a1', 'Community Draw Bounty', 'border-yellow-500/15 bg-yellow-500/5', 'text-yellow-400', 'Community members who trigger eligible draws via the fallback flow receive a protocol-funded FPT bounty from the treasury — a permissionless economic incentive for decentralised operation.'],
                ['\u2699\ufe0f', 'Treasury & Operations', 'border-purple-500/15 bg-purple-500/5', 'text-purple-400', 'The 5% sustainability fee is collected in FPT. The protocol auto-converts FPT reserves to SOL as needed to cover Switchboard oracle fees, on-chain rent, and transaction gas.'],
              ].map(([icon, title, border, color, desc]) => (
                <div key={title} className={`flex gap-3 p-4 rounded-xl border ${border}`}>
                  <span className="text-xl shrink-0">{icon}</span>
                  <div>
                    <div className={`text-sm font-bold ${color} mb-1`}>{title}</div>
                    <div className="text-xs text-gray-400 leading-relaxed">{desc}</div>
                  </div>
                </div>
              ))}
            </motion.div>
          </div>

          {/* FPT Lifecycle */}
          <motion.div variants={fadeUp}>
            <div className="rounded-xl border border-cyan-500/20 bg-black/30 p-6">
              <div className="text-xs font-mono text-gray-500 uppercase tracking-widest mb-5">{'// FPT Lifecycle — From Acquisition to Prize'}</div>
              <div className="grid sm:grid-cols-3 gap-4 text-center">
                {[
                  { label: '01 · Acquire', color: 'text-cyan-400', border: 'border-cyan-500/30', lines: ['Swap SOL \u2192 FPT', 'via Liquidity Gateway', 'Jupiter-integrated'] },
                  { label: '02 · Participate', color: 'text-purple-400', border: 'border-purple-500/30', lines: ['FPT locked in PDA Vault', 'per tier \u00b7 per round', 'on-chain escrow'] },
                  { label: '03 · Win', color: 'text-green-400', border: 'border-green-500/30', lines: ['95% FPT \u2192 Winner', '5% FPT \u2192 Treasury', 'same block always'] },
                ].map(({ label, color, border, lines }) => (
                  <div key={label} className={`rounded-lg border ${border} bg-black/30 p-4`}>
                    <div className={`font-mono font-bold text-sm ${color} mb-3`}>{label}</div>
                    {lines.map((l, i) => (
                      <div key={i} className={`text-xs ${i === 0 ? color : 'text-gray-500'} leading-relaxed`}>{l}</div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        </Section>

        {/* ══════════════════════════════════════════════════════════════════════
            SECTION 8 — DASHBOARD
        ══════════════════════════════════════════════════════════════════════ */}
        <Section id="s8" className="border-t border-cyan-500/10 pt-16">
          <div className="grid md:grid-cols-2 gap-10 items-center">
            {/* LEFT visual */}
            <motion.div variants={fadeRight}>
              <div className="rounded-2xl border border-cyan-500/20 bg-black/40 p-4">
                <DashboardMockup />
              </div>
            </motion.div>
            {/* RIGHT text */}
            <motion.div variants={fadeLeft}>
              <SectionLabel n="09" label="Participant & Data Dashboard" />
              <h2 className="text-3xl font-black text-white mb-4" style={{ fontFamily: '"Poppins", sans-serif' }}>
                Bird’s Eye View—<br />Your Decentralised Portfolio
              </h2>
              <p className="text-gray-400 text-sm leading-loose mb-4">
                Because Fortress Protocol runs <strong className="text-white">16 tiers simultaneously</strong> across four lottery types, tracking your positions manually would be impossible. The <strong className="text-white">Participants Data dashboard</strong> solves this: a single page that surfaces your full cross-tier history — active tickets, past draws, wins, and live prize pool sizes — all fetched in real-time from on-chain state. You are not just playing one game. You are managing a decentralised gaming portfolio.
              </p>
              <div className="space-y-3">
                {[
                  ['📋', 'Recent Winners', 'The last 10 draw winners across all 4 lottery types are fetched live from Solana program logs with Solscan proof links.'],
                  ['🎟️', 'My Tickets', 'View your active ticket positions across all sixteen tiers — LPM, DPL, WPL, and MPL — in a single view.'],
                  ['📊', 'Live Tier Status', 'Real-time participant counts, prize pools, and countdown timers for every active tier across the entire ecosystem.'],
                  ['👛', 'Wallet History', 'A filterable ledger of your 50 most recent participations and their draw outcomes, filterable by lottery type.'],
                ].map(([icon, title, desc]) => (
                  <div key={title} className="flex gap-3 p-3 rounded-lg border border-gray-800 bg-black/20">
                    <span className="text-lg shrink-0">{icon}</span>
                    <div>
                      <div className="text-sm font-bold text-white">{title}</div>
                      <div className="text-xs text-gray-500 leading-relaxed">{desc}</div>
                    </div>
                  </div>
                ))}
              </div>
              <Link href="/participants-data" className="inline-flex items-center gap-2 mt-4 text-xs text-cyan-400 hover:text-cyan-300 border border-cyan-500/30 rounded-lg px-4 py-2 transition-colors">
                Open Dashboard <ExternalLink className="w-3 h-3" />
              </Link>
            </motion.div>
          </div>
        </Section>

        {/* ══════════════════════════════════════════════════════════════════════
            SECTION 9 — ARCHITECTURE
        ══════════════════════════════════════════════════════════════════════ */}
        <Section id="s9" className="border-t border-cyan-500/10 pt-16">
          <motion.div variants={fadeUp} className="text-center mb-8">
            <SectionLabel n="10" label="Technical Architecture" />
            <h2 className="text-3xl font-black text-white" style={{ fontFamily: '"Poppins", sans-serif' }}>
              How the Protocol Fits Together
            </h2>
            <p className="text-gray-500 text-sm mt-2 max-w-xl mx-auto">
              A simplified system diagram of the Fortress Protocol component interaction on Solana.
            </p>
          </motion.div>
          <motion.div variants={fadeUp}>
            <div className="rounded-2xl border border-cyan-500/15 bg-black/50 p-6 md:p-10">
              <ArchitectureDiagram />
            </div>
          </motion.div>
          <motion.div variants={fadeUp} className="mt-8 grid sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs font-mono">
            {[
              { key: 'Program ID (mainnet)', val: PROGRAM_ID, color: 'text-cyan-400' },
              { key: 'FPT Mint (mainnet)', val: FPT_MINT, color: 'text-purple-400' },
              { key: 'SB On-Demand (mainnet)', val: SB_ON_DEMAND_PROGRAM, color: 'text-yellow-400' },
              { key: 'Admin Authority (mainnet)', val: ADMIN_WALLET, color: 'text-emerald-400' },
              { key: 'Crank Wallet (mainnet)', val: CRANK_AUTHORITY, color: 'text-pink-400' },
            ].map(item => (
              <div key={item.key} className="rounded-lg border border-gray-800 bg-black/30 p-3">
                <div className="text-gray-600 mb-1">{item.key}</div>
                <div className={`${item.color} break-all leading-relaxed mb-2`}>{item.val}</div>
                <a
                  href={`https://solscan.io/account/${item.val}`}
                  target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-gray-600 hover:text-gray-400 transition-colors"
                >
                  Solscan <ExternalLink className="inline w-3 h-3" />
                </a>
              </div>
            ))}
          </motion.div>

          {/* Appendix table */}
          <motion.div variants={fadeUp} className="mt-8">
            <h3 className="text-sm font-mono text-gray-500 uppercase tracking-widest mb-3">Appendix A — Validation Rules</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs font-mono border-collapse">
                <thead>
                  <tr className="border-b border-gray-800">
                    {['Check', 'Condition', 'Failure Behaviour'].map(h => (
                      <th key={h} className="text-left px-3 py-2 text-gray-600 font-semibold">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-900">
                  {[
                    ['SB Program Owner', 'account.owner == SB_ON_DEMAND_PROGRAM', 'InvalidLotteryType → tx rejected'],
                    ['Oracle Reveal', 'reveal_slot > 0 (oracle has committed)', 'DrawNotYetReady → settlement blocked'],
                    ['Anti-Replay', 'reveal_slot > request_reveal_slot', 'DrawNotYetReady → tx rejected'],
                    ['Commitment Binding', 'has_one = randomness_account (Anchor)', 'InvalidLotteryType → substitution blocked'],
                    ['Modulo Fairness', 'entropy % participant_count', 'Uniform distribution guaranteed'],
                  ].map((row, i) => (
                    <tr key={i} className={i % 2 === 0 ? 'bg-white/[0.01]' : ''}>
                      {row.map((cell, j) => (
                        <td key={j} className={`px-3 py-2 ${j === 2 ? 'text-red-400' : 'text-gray-400'}`}>{cell}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </motion.div>
        </Section>

        {/* ══════════════════════════════════════════════════════════════════════
            SECTION 10 — CLOSING
        ══════════════════════════════════════════════════════════════════════ */}
        <Section id="s10" className="border-t border-cyan-500/10 pt-16">
          <motion.div variants={fadeUp} className="text-center max-w-2xl mx-auto">
            <SectionLabel n="11" label="Closing Statement" />
            <h2 className="text-4xl font-black mb-6 leading-tight"
              style={{ fontFamily: '"Poppins", sans-serif', background: 'linear-gradient(135deg,#22d3ee,#a78bfa,#34d399)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              Four Lottery Types.<br />Sixteen Active Tiers.<br />Zero Trust Required.
            </h2>
            <p className="text-gray-400 text-sm leading-loose mb-8">
              Fortress Protocol is not a product — it is a <strong className="text-white">living ecosystem</strong>. A self-sustaining, transparent, cryptographically fair system where four distinct lottery types run in parallel, every draw is verifiable on Solscan, and every winner is paid in the same block as the draw. You are not playing a lottery. You are entering a decentralised gaming portfolio.
            </p>
            <blockquote className="border-l-4 border-cyan-500 pl-4 text-left text-gray-400 text-sm italic mb-8">
              "We are building the first ecosystem where the house cannot cheat — because the house is the blockchain."
            </blockquote>

            {/* Open Source Block */}
            <div className="rounded-2xl border border-cyan-500/25 bg-cyan-500/5 p-6 mb-8 text-left max-w-xl mx-auto">
              <div className="flex flex-wrap items-center gap-3 mb-4">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-cyan-500/40 bg-cyan-500/10 text-cyan-400 text-xs font-mono">&lt;/&gt; Open Source</span>
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-purple-500/40 bg-purple-500/10 text-purple-400 text-xs font-mono">⚖️ MIT Licensed</span>
              </div>
              <p className="text-gray-400 text-sm leading-relaxed mb-4">
                Fortress Protocol is <strong className="text-white">fully open source</strong>. The on-chain Anchor program, keeper bot, and Next.js frontend are all publicly available on GitHub and auditable by anyone. Independent audits, contributions, and forks are actively encouraged.
              </p>
              <div className="space-y-2 text-xs font-mono">
                <div className="flex gap-3">
                  <span className="text-cyan-400 font-bold w-24 shrink-0">Repository</span>
                  <a href="https://github.com/hilalsec-ui/Fortress-protocol" target="_blank" rel="noopener noreferrer"
                    className="text-cyan-300 hover:text-cyan-200 transition-colors break-all">
                    github.com/hilalsec-ui/Fortress-protocol <ExternalLink className="inline w-3 h-3" />
                  </a>
                </div>
                <div className="flex gap-3">
                  <span className="text-cyan-400 font-bold w-24 shrink-0">License</span>
                  <span className="text-gray-400">MIT — free to use, modify, and distribute with attribution</span>
                </div>
                <div className="flex gap-3">
                  <span className="text-cyan-400 font-bold w-24 shrink-0">Scope</span>
                  <span className="text-gray-400">Anchor smart contract · Keeper crank bot · Next.js frontend</span>
                </div>
              </div>
            </div>

            <p className="text-lg font-mono font-bold text-white mb-8">
              Connect. Choose your tier. Win.<br />
              <span className="text-cyan-400">Audited for 2026 · All 16 tiers live.</span>
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center flex-wrap">
              <Link href="/lpm"
                className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl font-bold text-black bg-gradient-to-r from-yellow-400 to-yellow-300 hover:from-yellow-300 hover:to-yellow-200 transition-all shadow-lg shadow-yellow-500/25">
                <Zap className="w-4 h-4" /> ⚡ Lightning Pool
              </Link>
              <Link href="/dpl"
                className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl font-bold text-white bg-cyan-600/80 hover:bg-cyan-500 transition-all">
                📅 Daily Pool
              </Link>
              <Link href="/wpl"
                className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl font-bold text-white bg-purple-600/80 hover:bg-purple-500 transition-all">
                🗓️ Weekly Pool
              </Link>
              <Link href="/mpl"
                className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl font-bold text-white bg-green-700/80 hover:bg-green-600 transition-all">
                🏆 Monthly Pool
              </Link>
              <Link href="/transparency"
                className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl font-semibold border border-purple-500/40 text-purple-300 hover:border-purple-400 hover:text-purple-200 transition-all">
                <Shield className="w-4 h-4" /> Verify Fairness
              </Link>
            </div>

            {/* Decorative bottom */}
            <div className={`mt-12 font-mono text-xs space-y-1 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
              <div>Fortress Protocol · Solana Mainnet · 2026</div>
              <div>Program: {PROGRAM_ID}</div>
              <div>FPT Mint: {FPT_MINT}</div>
              <div>
                <a href="https://github.com/hilalsec-ui/Fortress-protocol" target="_blank" rel="noopener noreferrer"
                  className="text-cyan-500 hover:text-cyan-400 transition-colors">
                  github.com/hilalsec-ui/Fortress-protocol
                </a> &nbsp;·&nbsp; MIT License
              </div>
              <div className={isDarkMode ? 'text-gray-500' : 'text-gray-500'}>This document is provided for informational purposes only.</div>
            </div>
          </motion.div>
        </Section>

      </div>
    </Layout>
  );
}
