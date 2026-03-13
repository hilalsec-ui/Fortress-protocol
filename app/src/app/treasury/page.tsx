"use client";

import React, { useState, useEffect } from 'react';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { PublicKey, LAMPORTS_PER_SOL, SystemProgram } from '@solana/web3.js';
import { FPT_MINT, TOKEN_2022_PROGRAM_ID, FPT_DECIMALS, ADMIN_WALLET, PROGRAM_ID, CRANK_AUTHORITY } from '@/utils/constants';
import { useAnchorProgram } from '@/utils/anchor';
import { useChainData } from '@/contexts/ChainDataContext';
import { motion, AnimatePresence } from 'framer-motion';
import { useTheme } from '@/contexts/ThemeContext';
import {
  Landmark,
  RefreshCw,
  ArrowDownToLine,
  ArrowUpFromLine,
  Shield,
  X,
  ChevronDown,
  Coins,
  Zap,
  CheckCircle,
  AlertTriangle,
  Copy,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { BN } from '@coral-xyz/anchor';

// ─── PDAs ─────────────────────────────────────────────────────────────────────

const PROGRAM_PUBKEY = new PublicKey(PROGRAM_ID);
const ADMIN_PUBKEY = new PublicKey(ADMIN_WALLET);

// SOL-holding vault: seeds=[b"sol_vault"] — matches draw_winner.rs TREASURY_VAULT_SEED.
// FPT fees (5%) land in the ATA owned by this PDA. SOL deposits live here too.
// On-chain minimum reserve: 0.003 SOL must remain after any SOL withdrawal.
const VAULT_MIN_RESERVE_SOL = 0.003;
function deriveTreasuryVaultPDA(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('sol_vault')],
    PROGRAM_PUBKEY
  );
}

// Treasury data account: seeds=[b"treasury"] — tracks stats, used by TopUp.
function deriveTreasuryDataPDA(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('treasury')],
    PROGRAM_PUBKEY
  );
}

// ─── Types ────────────────────────────────────────────────────────────────────

type WithdrawAsset = 'SOL' | 'FPT';
type TopUpAsset    = 'SOL' | 'FPT';

interface Balances {
  sol: number | null;
  fpt: number | null;
}

// ─── Component ────────────────────────────────────────────────────────────────

const TreasuryPage: React.FC = () => {
  const { connected, publicKey, sendTransaction } = useWallet();
  const { connection } = useConnection();
  const program = useAnchorProgram();

  // Open the sidebar (fires into Layout.tsx event listener)
  const openSidebar = () => window.dispatchEvent(new CustomEvent('open-sidebar'));

  // ── Live data from shared context (one fetch per 10s for all pages) ──────────────
  const { treasurySol, treasuryFpt, isLoading, refresh } = useChainData();
  const balances: Balances = { sol: treasurySol, fpt: treasuryFpt };
  const [isProcessing, setIsProcessing] = useState(false);

  // Top-Up state
  const [topUpAmount, setTopUpAmount]   = useState('');
  const [topUpAsset, setTopUpAsset]     = useState<TopUpAsset>('SOL');

  // Withdraw modal state
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [withdrawAsset, setWithdrawAsset] = useState<WithdrawAsset>('SOL');
  const [withdrawAmount, setWithdrawAmount] = useState('');

  const isAdmin = publicKey?.equals(ADMIN_PUBKEY) ?? false;
  const { isDarkMode } = useTheme();

  // ── Crank wallet SOL balance (admin-only) ───────────────────────────────────
  const [crankSol, setCrankSol] = useState<number | null>(null);
  const [crankLoading, setCrankLoading] = useState(false);
  const [crankCopied, setCrankCopied] = useState(false);
  const [crankTopUpAmount, setCrankTopUpAmount] = useState('');
  const [crankTopUpProcessing, setCrankTopUpProcessing] = useState(false);

  const copyCrankAddress = () => {
    navigator.clipboard.writeText(CRANK_AUTHORITY).then(() => {
      setCrankCopied(true);
      setTimeout(() => setCrankCopied(false), 2000);
    });
  };

  const handleCrankTopUp = async () => {
    if (!publicKey || !sendTransaction || !isAdmin) return;
    const amount = parseFloat(crankTopUpAmount);
    if (isNaN(amount) || amount <= 0) {
      toast.error('Enter a valid SOL amount');
      return;
    }
    setCrankTopUpProcessing(true);
    const toastId = toast.loading(`Sending ${amount} SOL to crank wallet…`);
    try {
      const { TransactionMessage, VersionedTransaction } = await import('@solana/web3.js');
      const crankPubkey = new PublicKey(CRANK_AUTHORITY);
      const lamports = Math.floor(amount * LAMPORTS_PER_SOL);
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
      // Use VersionedTransaction (v0) so Phantom correctly shows the SOL balance change
      const message = new TransactionMessage({
        payerKey: publicKey,
        recentBlockhash: blockhash,
        instructions: [SystemProgram.transfer({ fromPubkey: publicKey, toPubkey: crankPubkey, lamports })],
      }).compileToV0Message();
      const vtx = new VersionedTransaction(message);
      const sig = await sendTransaction(vtx as any, connection);
      await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed');
      toast.success(`Sent ${amount} SOL to crank wallet ✓`, { id: toastId });
      setCrankTopUpAmount('');
      const newBalance = await connection.getBalance(crankPubkey);
      setCrankSol(newBalance / LAMPORTS_PER_SOL);
    } catch (err: any) {
      const msg = err?.message ?? '';
      if (msg.includes('rejected') || msg.includes('cancelled')) {
        toast.error('Transaction cancelled', { id: toastId });
      } else {
        toast.error(msg.slice(0, 80) || 'Top-up failed', { id: toastId });
      }
    } finally {
      setCrankTopUpProcessing(false);
    }
  };

  useEffect(() => {
    if (!isAdmin || !connection) { setCrankSol(null); return; }
    let cancelled = false;
    const fetchCrank = async () => {
      setCrankLoading(true);
      try {
        const lamports = await connection.getBalance(new PublicKey(CRANK_AUTHORITY));
        if (!cancelled) setCrankSol(lamports / LAMPORTS_PER_SOL);
      } catch { /* ignore */ } finally {
        if (!cancelled) setCrankLoading(false);
      }
    };
    fetchCrank();
    const iv = setInterval(fetchCrank, 30_000);
    return () => { cancelled = true; clearInterval(iv); };
  }, [isAdmin, connection]);

  // ── Top Up SOL ──────────────────────────────────────────────────────────────

  const handleSolTopUp = async () => {
    if (!program || !publicKey || !sendTransaction) {
      toast.error('Connect your wallet first');
      return;
    }
    const amount = parseFloat(topUpAmount);
    if (isNaN(amount) || amount <= 0) {
      toast.error('Enter a valid SOL amount');
      return;
    }
    setIsProcessing(true);
    const toastId = toast.loading(`Sending ${amount} SOL to Treasury…`);
    try {
      const { TransactionMessage, VersionedTransaction } = await import('@solana/web3.js');
      const [treasuryVaultPDA] = deriveTreasuryVaultPDA();
      const [treasuryDataPDA] = deriveTreasuryDataPDA();
      const lamports = Math.floor(amount * LAMPORTS_PER_SOL);

      // Build the instruction from Anchor so Phantom sees the correct program invocation
      const ix = await (program.methods as any)
        .topUpTreasuryVault(new BN(lamports))
        .accounts({
          payer: publicKey,
          treasuryVault: treasuryVaultPDA,
          treasury: treasuryDataPDA,
          systemProgram: SystemProgram.programId,
        })
        .instruction();

      // Use VersionedTransaction (v0) so Phantom correctly shows the SOL balance change
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
      const message = new TransactionMessage({
        payerKey: publicKey,
        recentBlockhash: blockhash,
        instructions: [ix],
      }).compileToV0Message();
      const vtx = new VersionedTransaction(message);
      const sig = await sendTransaction(vtx as any, connection, { skipPreflight: true });
      await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed');

      toast.success(`Topped up ${amount} SOL ✓`, { id: toastId });
      setTopUpAmount('');
      refresh();
    } catch (err: any) {
      console.error(err);
      const msg = err?.message ?? '';
      if (msg.includes('rejected') || msg.includes('cancelled')) {
        toast.error('Transaction cancelled', { id: toastId });
      } else {
        toast.error(msg.slice(0, 80) ?? 'Top-up failed', { id: toastId });
      }
    } finally {
      setIsProcessing(false);
    }
  };

  // ── Top Up FPT (direct SPL Token-2022 transfer to treasury FPT ATA) ─────────

  const handleFptTopUp = async () => {
    if (!publicKey || !sendTransaction) {
      toast.error('Connect your wallet first');
      return;
    }
    const amount = parseFloat(topUpAmount);
    if (isNaN(amount) || amount <= 0) {
      toast.error('Enter a valid FPT amount');
      return;
    }
    setIsProcessing(true);
    const toastId = toast.loading(`Sending ${amount} FPT to Treasury…`);
    try {
      const fptMintPubkey   = new PublicKey(FPT_MINT);
      const token2022Id     = new PublicKey(TOKEN_2022_PROGRAM_ID);
      const [treasuryVaultPDA] = deriveTreasuryVaultPDA();

      const {
        getAssociatedTokenAddressSync,
        createTransferCheckedInstruction,
        createAssociatedTokenAccountIdempotentInstruction,
      } = await import('@solana/spl-token');
      const { ASSOCIATED_TOKEN_PROGRAM_ID: ASSOC_ID } = await import('@solana/spl-token');
      const { TransactionMessage, VersionedTransaction } = await import('@solana/web3.js');

      const senderAta = getAssociatedTokenAddressSync(fptMintPubkey, publicKey, false, token2022Id);
      const treasuryFptAta = getAssociatedTokenAddressSync(fptMintPubkey, treasuryVaultPDA, true, token2022Id);
      const rawAmount = BigInt(Math.floor(amount * Math.pow(10, FPT_DECIMALS)));

      const instructions = [];

      // Create treasury FPT ATA idempotently if it doesn't exist yet
      const ataInfo = await connection.getAccountInfo(treasuryFptAta);
      if (!ataInfo) {
        instructions.push(
          createAssociatedTokenAccountIdempotentInstruction(
            publicKey, treasuryFptAta, treasuryVaultPDA, fptMintPubkey, token2022Id, ASSOC_ID,
          )
        );
      }

      instructions.push(
        createTransferCheckedInstruction(
          senderAta, fptMintPubkey, treasuryFptAta, publicKey,
          rawAmount, FPT_DECIMALS, [], token2022Id,
        )
      );

      // Use VersionedTransaction (v0) so Phantom correctly shows the Token-2022 FPT balance change
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
      const message = new TransactionMessage({
        payerKey: publicKey,
        recentBlockhash: blockhash,
        instructions,
      }).compileToV0Message();
      const vtx = new VersionedTransaction(message);
      const sig = await sendTransaction(vtx as any, connection, { skipPreflight: true });
      await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed');

      toast.success(`Topped up ${amount} FPT ✓`, { id: toastId });
      setTopUpAmount('');
      refresh();
    } catch (err: any) {
      console.error(err);
      const msg = err?.message ?? '';
      if (msg.includes('rejected') || msg.includes('cancelled')) {
        toast.error('Transaction cancelled', { id: toastId });
      } else {
        toast.error(msg.slice(0, 80) || 'FPT top-up failed', { id: toastId });
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const handleTopUp = () => (topUpAsset === 'FPT' ? handleFptTopUp() : handleSolTopUp());

  // ── Unified Withdraw — SOL or FPT (admin only) ─────────────────────────────
  // Uses the UPGRADED on-chain instruction: unified_withdraw_from_treasury_vault
  // Accounts: admin, treasury, treasuryVault, fptMint, treasuryFptAta,
  //           adminFptAta, tokenProgram, associatedTokenProgram, systemProgram

  const handleWithdraw = async () => {
    if (!program || !publicKey || !isAdmin) return;
    const amount = parseFloat(withdrawAmount);
    if (isNaN(amount) || amount <= 0) {
      toast.error(`Enter a valid ${withdrawAsset} amount`);
      return;
    }

    // Client-side guard: prevent SOL withdrawal sim-revert caused by on-chain min-reserve check
    if (withdrawAsset === 'SOL' && balances.sol !== null) {
      const maxWithdrawable = Math.max(0, balances.sol - VAULT_MIN_RESERVE_SOL);
      if (amount > maxWithdrawable) {
        toast.error(
          `Maximum withdrawable SOL is ${maxWithdrawable.toFixed(4)} — vault must keep ${VAULT_MIN_RESERVE_SOL} SOL in reserve.`
        );
        return;
      }
    }
    setIsProcessing(true);
    const toastId = toast.loading(`Withdrawing ${amount} ${withdrawAsset}…`);
    try {
      const [treasuryVaultPDA] = deriveTreasuryVaultPDA();
      const [treasuryDataPDA] = deriveTreasuryDataPDA();
      const fptMintPubkey = new PublicKey(FPT_MINT);
      const token2022ProgramId = new PublicKey(TOKEN_2022_PROGRAM_ID);

      const { getAssociatedTokenAddressSync, ASSOCIATED_TOKEN_PROGRAM_ID } = await import('@solana/spl-token');

      // Treasury's FPT ATA — owned by treasury_vault (sol_vault PDA)
      const treasuryFptAta = getAssociatedTokenAddressSync(
        fptMintPubkey,
        treasuryVaultPDA,
        true,             // allowOwnerOffCurve — PDA
        token2022ProgramId
      );

      // Admin's FPT ATA — destination for FPT withdrawals
      const adminFptAta = getAssociatedTokenAddressSync(
        fptMintPubkey,
        publicKey,
        false,
        token2022ProgramId
      );

      const isSOL = withdrawAsset === 'SOL';
      const rawAmount = isSOL
        ? new BN(Math.floor(amount * LAMPORTS_PER_SOL))
        : new BN(Math.floor(amount * Math.pow(10, FPT_DECIMALS)));

      // Anchor enum: { sol: {} } → SOL withdrawal, { fpt: {} } → FPT withdrawal
      const assetArg = isSOL ? { sol: {} } : { fpt: {} };

      await (program.methods as any)
        .unifiedWithdrawFromTreasuryVault(assetArg, rawAmount)
        .accounts({
          admin: publicKey,
          treasuryVault: treasuryVaultPDA,
          fptMint: fptMintPubkey,
          treasuryFptAta: treasuryFptAta,
          adminFptAta: adminFptAta,
          tokenProgram: token2022ProgramId,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      toast.success(`Withdrawn ${amount} ${withdrawAsset} ✓`, { id: toastId });
      setWithdrawAmount('');
      setShowWithdrawModal(false);
      refresh();
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message?.slice(0, 80) ?? 'Withdrawal failed', { id: toastId });
    } finally {
      setIsProcessing(false);
    }
  };

  // ── Helpers ────────────────────────────────────────────────────────────────

  const [treasuryVaultAddress] = deriveTreasuryVaultPDA();
  const shortAddr = (addr: PublicKey) =>
    `${addr.toBase58().slice(0, 6)}…${addr.toBase58().slice(-4)}`;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className={`min-h-screen flex items-center justify-center p-4 sm:p-8 ${isDarkMode ? '' : 'bg-gray-50'}`}>
      {/* ── Ambient glow ── */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden -z-10">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-emerald-500/10 blur-[120px]" />
        <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] rounded-full bg-indigo-500/10 blur-[100px]" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 32 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
        className="w-full max-w-7xl grid grid-cols-1 lg:grid-cols-3 gap-6 items-start"
      >
        {/* ══════════════════════════════════════════════════════════════════
            LEFT CARD — The SOL Engine
        ══════════════════════════════════════════════════════════════════ */}
        <div
          className={`relative rounded-3xl overflow-hidden p-8 flex flex-col gap-5
            ${isDarkMode
              ? 'bg-white/5 backdrop-blur-xl border border-white/10 shadow-[0_0_40px_rgba(234,179,8,0.08),0_8px_32px_rgba(0,0,0,0.4)]'
              : 'bg-white border border-yellow-100 shadow-[0_4px_24px_rgba(0,0,0,0.08)]'}`}
        >
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-yellow-400/40 to-transparent" />
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-yellow-500/10 border border-yellow-500/20">
              <Zap className="w-6 h-6 text-yellow-500" />
            </div>
            <div>
              <h2 className={`text-lg font-bold tracking-tight ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>The SOL Engine</h2>
              <p className={`text-xs mt-0.5 ${isDarkMode ? 'text-white/40' : 'text-gray-500'}`}>Infrastructure &amp; Operations</p>
            </div>
          </div>
          <p className={`text-sm leading-relaxed ${isDarkMode ? 'text-white/60' : 'text-gray-600'}`}>
            This balance powers all Fortress lottery pools — Lightning, Daily, Weekly, and Monthly. These funds are dedicated to covering the &ldquo;gas&rdquo; and operational costs required for the Solana program to function autonomously across every pool type.
          </p>
          <div className="space-y-4 mt-1">
            <div className="flex items-start gap-3">
              <CheckCircle className="w-4 h-4 text-yellow-500 flex-shrink-0 mt-0.5" />
              <p className={`text-xs ${isDarkMode ? 'text-white/50' : 'text-gray-500'}`}>Covers Switchboard V3 VRF oracle fees — funds the on-chain randomness requests that make every draw provably fair.</p>
            </div>
            <div className="flex items-start gap-3">
              <CheckCircle className="w-4 h-4 text-yellow-500 flex-shrink-0 mt-0.5" />
              <p className={`text-xs ${isDarkMode ? 'text-white/50' : 'text-gray-500'}`}>Funds the creation of Associated Token Accounts (ATAs) for winners and reward-seekers.</p>
            </div>
            <div className="flex items-start gap-3">
              <CheckCircle className="w-4 h-4 text-yellow-500 flex-shrink-0 mt-0.5" />
              <p className={`text-xs ${isDarkMode ? 'text-white/50' : 'text-gray-500'}`}>The fuel that keeps our smart contracts running 24/7.</p>
            </div>
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════════════════
            CENTER CARD — GLASSMORPHISM BEAUTY CARD (Protocol Treasury)
        ══════════════════════════════════════════════════════════════════ */}
        <div
          className={`relative rounded-3xl overflow-hidden
            ${isDarkMode
              ? 'bg-white/5 backdrop-blur-xl border border-white/10 shadow-[0_0_60px_rgba(16,185,129,0.15),0_8px_32px_rgba(0,0,0,0.4)]'
              : 'bg-white border border-emerald-100 shadow-[0_4px_24px_rgba(0,0,0,0.10)]'}`}
        >
          {/* Top accent line */}
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-emerald-400/60 to-transparent" />

          {/* ── Header ── */}
          <div className="px-8 pt-8 pb-6 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                <Landmark className="w-6 h-6 text-emerald-500" />
              </div>
              <div>
                <h1 className={`text-xl font-bold tracking-tight ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                  Protocol Treasury
                </h1>
                <p className={`text-xs mt-0.5 ${isDarkMode ? 'text-white/40' : 'text-gray-400'}`}>
                  {shortAddr(treasuryVaultAddress)}
                </p>
              </div>
            </div>

            <motion.button
              onClick={() => refresh()}
              disabled={isLoading}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className={`p-2 rounded-lg border transition-colors ${isDarkMode ? 'bg-white/5 hover:bg-white/10 border-white/10' : 'bg-gray-100 hover:bg-gray-200 border-gray-200'}`}
              aria-label="Refresh"
            >
              <RefreshCw
                className={`w-4 h-4 ${isDarkMode ? 'text-white/60' : 'text-gray-500'} ${isLoading ? 'animate-spin' : ''}`}
              />
            </motion.button>
          </div>

          {/* ── Divider ── */}
          <div className={`mx-8 h-px ${isDarkMode ? 'bg-white/5' : 'bg-gray-100'}`} />

          {/* ── Dual Balance Display ── */}
          <div className="px-8 py-6 grid grid-cols-2 gap-4">
            {/* SOL Balance */}
            <div className={`rounded-2xl p-5 flex flex-col gap-2 border ${isDarkMode ? 'bg-white/5 border-white/8' : 'bg-gray-50 border-gray-200'}`}>
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-yellow-400 to-orange-500 flex items-center justify-center text-xs font-black text-black">
                  ◎
                </div>
                <span className={`text-xs font-medium uppercase tracking-wider ${isDarkMode ? 'text-white/50' : 'text-gray-500'}`}>
                  SOL Balance
                </span>
              </div>
              <div className="mt-1">
                {balances.sol === null ? (
                  <div className={`h-7 w-24 rounded animate-pulse ${isDarkMode ? 'bg-white/10' : 'bg-gray-200'}`} />
                ) : (
                  <span className={`text-2xl font-bold tabular-nums ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                    {balances.sol.toFixed(4)}
                    <span className={`text-sm font-normal ml-1 ${isDarkMode ? 'text-white/40' : 'text-gray-400'}`}>SOL</span>
                  </span>
                )}
              </div>
              <p className={`text-xs leading-tight ${isDarkMode ? 'text-white/30' : 'text-gray-400'}`}>
                Operations Fund
              </p>
            </div>

            {/* FPT Balance */}
            <div className={`rounded-2xl p-5 flex flex-col gap-2 border ${isDarkMode ? 'bg-white/5 border-white/8' : 'bg-gray-50 border-gray-200'}`}>
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-emerald-400 to-cyan-500 flex items-center justify-center">
                  <Coins className="w-3.5 h-3.5 text-black" />
                </div>
                <span className={`text-xs font-medium uppercase tracking-wider ${isDarkMode ? 'text-white/50' : 'text-gray-500'}`}>
                  FPT Balance
                </span>
              </div>
              <div className="mt-1">
                {balances.fpt === null ? (
                  <div className={`h-7 w-24 rounded animate-pulse ${isDarkMode ? 'bg-white/10' : 'bg-gray-200'}`} />
                ) : (
                  <span className={`text-sm font-bold tabular-nums ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                    {balances.fpt.toLocaleString('en-US', { maximumFractionDigits: 2 })}
                    <span className={`text-sm font-normal ml-1 ${isDarkMode ? 'text-white/40' : 'text-gray-400'}`}>FPT</span>
                  </span>
                )}
              </div>
              <p className={`text-xs leading-tight ${isDarkMode ? 'text-white/30' : 'text-gray-400'}`}>
                Community Settlement Reward
              </p>
            </div>

          </div>

          {/* ── Divider ── */}
          <div className={`mx-8 h-px ${isDarkMode ? 'bg-white/5' : 'bg-gray-100'}`} />

          {/* ── Top Up (SOL or FPT) ── */}
          <div className="px-8 py-6">
            <p className={`text-xs font-semibold uppercase tracking-widest mb-3 ${isDarkMode ? 'text-white/40' : 'text-gray-400'}`}>
              Top Up Treasury
            </p>

            {/* SOL / FPT toggle */}
            <div className={`inline-flex rounded-xl p-1 mb-4 border ${
              isDarkMode ? 'bg-white/5 border-white/10' : 'bg-gray-100 border-gray-200'
            }`}>
              {(['SOL', 'FPT'] as TopUpAsset[]).map((asset) => (
                <button
                  key={asset}
                  onClick={() => { setTopUpAsset(asset); setTopUpAmount(''); }}
                  className={`px-5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    topUpAsset === asset
                      ? 'bg-emerald-500 text-black shadow-[0_0_12px_rgba(16,185,129,0.4)]'
                      : isDarkMode
                        ? 'text-white/40 hover:text-white/70'
                        : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {asset === 'SOL' ? '◎ SOL' : '⬡ FPT'}
                </button>
              ))}
            </div>

            <div className="flex gap-3">
              <div className="relative flex-1">
                <input
                  type="number"
                  min={topUpAsset === 'SOL' ? '0.001' : '1'}
                  step={topUpAsset === 'SOL' ? '0.01' : '1'}
                  placeholder={topUpAsset === 'SOL' ? '0.00 SOL' : '0 FPT'}
                  value={topUpAmount}
                  onChange={(e) => setTopUpAmount(e.target.value)}
                  disabled={isProcessing}
                  className={`w-full rounded-xl px-4 py-3 text-sm font-mono border
                    focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/20
                    transition-all disabled:opacity-50
                    ${isDarkMode
                      ? 'bg-white/5 border-white/10 text-white placeholder-white/20'
                      : 'bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-400'}`}
                />
              </div>
              <motion.button
                onClick={handleTopUp}
                disabled={isProcessing || !topUpAmount}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="flex items-center gap-2 px-5 py-3 rounded-xl font-semibold text-sm
                  bg-gradient-to-r from-emerald-500 to-teal-500
                  hover:from-emerald-400 hover:to-teal-400
                  text-black shadow-[0_0_20px_rgba(16,185,129,0.3)]
                  disabled:opacity-40 disabled:cursor-not-allowed
                  transition-all"
              >
                {isProcessing ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <ArrowDownToLine className="w-4 h-4" />
                )}
                Top Up
              </motion.button>
            </div>
            <p className={`text-xs mt-2 ${isDarkMode ? 'text-white/20' : 'text-gray-400'}`}>
              {topUpAsset === 'SOL'
                ? 'Fund the SOL Engine — covers rent, ATAs, and gas for each draw.'
                : 'Fund the FPT Reserve — pays the FPT community draw rewards.'}
            </p>
          </div>

          {/* ── Admin-only: Withdraw ── */}
          {isAdmin && (
            <>
              <div className={`mx-8 h-px ${isDarkMode ? 'bg-white/5' : 'bg-gray-100'}`} />
              <div className="px-8 py-6">
                <div className="flex items-center gap-2 mb-3">
                  <Shield className="w-4 h-4 text-amber-500" />
                  <p className="text-xs font-semibold text-amber-500 uppercase tracking-widest">
                    Admin Controls
                  </p>
                </div>
                <motion.button
                  onClick={() => setShowWithdrawModal(true)}
                  disabled={isProcessing}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="w-full flex items-center justify-center gap-2 px-5 py-3 rounded-xl font-semibold text-sm
                    bg-gradient-to-r from-amber-500/20 to-orange-500/20
                    hover:from-amber-500/30 hover:to-orange-500/30
                    border border-amber-500/30 hover:border-amber-500/50
                    text-amber-300 shadow-[0_0_20px_rgba(245,158,11,0.1)]
                    disabled:opacity-40 disabled:cursor-not-allowed
                    transition-all"
                >
                  <ArrowUpFromLine className="w-4 h-4" />
                  Withdraw Funds
                </motion.button>
              </div>

              {/* ── Crank Wallet Balance (admin-only) ── */}
              <div className={`mx-8 h-px ${isDarkMode ? 'bg-white/5' : 'bg-gray-100'}`} />
              <div className="px-8 pb-6">
                <p className={`text-xs font-semibold uppercase tracking-widest mb-3 ${isDarkMode ? 'text-white/40' : 'text-gray-400'}`}>
                  Crank Wallet
                </p>
                <div className={`rounded-2xl p-4 flex items-center justify-between border ${isDarkMode ? 'bg-amber-500/5 border-amber-500/20' : 'bg-amber-50 border-amber-200'}`}>
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-sm font-black text-black">
                      ⚡
                    </div>
                    <div>
                      <p className={`text-xs font-semibold ${isDarkMode ? 'text-white/70' : 'text-gray-700'}`}>SOL Balance</p>
                      <button
                        onClick={copyCrankAddress}
                        title="Copy crank address"
                        className={`flex items-center gap-1 text-xs font-mono truncate max-w-[140px] transition-colors ${
                          crankCopied
                            ? 'text-emerald-400'
                            : isDarkMode ? 'text-white/30 hover:text-white/60' : 'text-gray-400 hover:text-gray-600'
                        }`}
                      >
                        {crankCopied ? <CheckCircle className="w-3 h-3 flex-shrink-0" /> : <Copy className="w-3 h-3 flex-shrink-0" />}
                        {crankCopied ? 'Copied!' : `${CRANK_AUTHORITY.slice(0, 6)}…${CRANK_AUTHORITY.slice(-4)}`}
                      </button>
                    </div>
                  </div>
                  <div className="text-right">
                    {crankLoading && crankSol === null ? (
                      <div className={`h-6 w-16 rounded animate-pulse ${isDarkMode ? 'bg-white/10' : 'bg-gray-200'}`} />
                    ) : (
                      <>
                        <span className={`text-xl font-bold tabular-nums ${crankSol !== null && crankSol < 0.05 ? 'text-red-400' : isDarkMode ? 'text-amber-300' : 'text-amber-600'}`}>
                          {crankSol !== null ? crankSol.toFixed(4) : '—'}
                        </span>
                        <span className={`text-xs font-normal ml-1 ${isDarkMode ? 'text-white/40' : 'text-gray-400'}`}>SOL</span>
                        {crankSol !== null && crankSol < 0.05 && (
                          <p className="text-xs text-red-400 mt-0.5 flex items-center gap-1 justify-end">
                            <AlertTriangle className="w-3 h-3" /> Low — top up needed
                          </p>
                        )}
                      </>
                    )}
                  </div>
                </div>
                {/* Admin: fund crank wallet */}
                <div className="mt-3 flex gap-2">
                  <input
                    type="number"
                    min="0.001"
                    step="0.1"
                    placeholder="0.0 SOL"
                    value={crankTopUpAmount}
                    onChange={(e) => setCrankTopUpAmount(e.target.value)}
                    disabled={crankTopUpProcessing}
                    className={`flex-1 rounded-xl px-3 py-2 text-sm font-mono border
                      focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20
                      transition-all disabled:opacity-50
                      ${isDarkMode
                        ? 'bg-white/5 border-white/10 text-white placeholder-white/20'
                        : 'bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-400'}`}
                  />
                  <motion.button
                    onClick={handleCrankTopUp}
                    disabled={crankTopUpProcessing || !crankTopUpAmount}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl font-semibold text-sm
                      bg-gradient-to-r from-amber-500/20 to-orange-500/20
                      hover:from-amber-500/30 hover:to-orange-500/30
                      border border-amber-500/30 hover:border-amber-500/50
                      text-amber-300
                      disabled:opacity-40 disabled:cursor-not-allowed
                      transition-all"
                  >
                    {crankTopUpProcessing ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <ArrowDownToLine className="w-3.5 h-3.5" />
                    )}
                    Fund Crank
                  </motion.button>
                </div>
              </div>
            </>
          )}

          {/* ── Info Footer ── */}
          <div className={`mx-8 h-px ${isDarkMode ? 'bg-white/5' : 'bg-gray-100'}`} />
          <div className="px-8 py-4 flex items-center gap-2">
            <Zap className="w-3.5 h-3.5 text-emerald-500/60" />
            <p className={`text-xs ${isDarkMode ? 'text-white/25' : 'text-gray-400'}`}>
              Fortress Protocol · All draw fees routed on-chain to this Treasury
            </p>
          </div>

          {/* Bottom accent line */}
          <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-emerald-400/30 to-transparent" />

          {/* ══ WALLET GATE OVERLAY ══
              Blurs the entire card content when no wallet is connected.
              A bright yellow CTA button is overlaid in the center.
          ═══════════════════════════ */}
          <AnimatePresence>
            {!connected && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25 }}
                className={`absolute inset-0 z-20 rounded-3xl overflow-hidden
                  flex flex-col items-center justify-center gap-4 backdrop-blur-xl
                  ${isDarkMode ? 'bg-black/40' : 'bg-white/70'}`}
              >
                {/* Lock icon */}
                <div className="w-14 h-14 rounded-full bg-yellow-400/10 border border-yellow-400/30 flex items-center justify-center mb-1">
                  <Shield className="w-7 h-7 text-yellow-500" />
                </div>

                <div className="text-center px-8">
                  <p className={`font-semibold text-base mb-1 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                    Treasury is Locked
                  </p>
                  <p className={`text-xs leading-relaxed ${isDarkMode ? 'text-white/40' : 'text-gray-500'}`}>
                    Connect your wallet to view balances<br />and top up SOL or FPT.
                  </p>
                </div>

                {/* Yellow connect button */}
                <motion.button
                  onClick={openSidebar}
                  whileHover={{ scale: 1.04 }}
                  whileTap={{ scale: 0.96 }}
                  className="bg-yellow-400 text-black font-bold hover:bg-yellow-500
                    px-8 py-3.5 rounded-xl text-sm
                    shadow-[0_0_30px_rgba(250,204,21,0.4)]
                    transition-colors"
                >
                  🔓 Connect your wallet
                </motion.button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* ══════════════════════════════════════════════════════════════════
            RIGHT CARD — The FPT Reserve
        ══════════════════════════════════════════════════════════════════ */}
        <div
          className={`relative rounded-3xl overflow-hidden p-8 flex flex-col gap-5
            ${isDarkMode
              ? 'bg-white/5 backdrop-blur-xl border border-white/10 shadow-[0_0_40px_rgba(16,185,129,0.08),0_8px_32px_rgba(0,0,0,0.4)]'
              : 'bg-white border border-emerald-100 shadow-[0_4px_24px_rgba(0,0,0,0.08)]'}`}
        >
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-emerald-400/40 to-transparent" />
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
              <Coins className="w-6 h-6 text-emerald-500" />
            </div>
            <div>
              <h2 className={`text-lg font-bold tracking-tight ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>The FPT Reserve</h2>
              <p className={`text-xs mt-0.5 ${isDarkMode ? 'text-white/40' : 'text-gray-500'}`}>Rewards &amp; Sustainability</p>
            </div>
          </div>
          <p className={`text-sm leading-relaxed ${isDarkMode ? 'text-white/60' : 'text-gray-600'}`}>
            This reserve is the heart of our incentive system. It primarily funds the <span className="text-emerald-500 font-semibold">FPT community draw rewards</span> paid to any community member who finalizes (settles) a ready draw — the permissionless Step 3 of the 3-phase draw process.
          </p>
          <div className="space-y-4 mt-1">
            <div className="flex items-start gap-3">
              <CheckCircle className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
              <p className={`text-xs ${isDarkMode ? 'text-white/50' : 'text-gray-500'}`}>Funds FPT community draw rewards paid on-chain to whoever triggers the settlement transaction.</p>
            </div>
            <div className="flex items-start gap-3">
              <CheckCircle className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
              <p className={`text-xs ${isDarkMode ? 'text-white/50' : 'text-gray-500'}`}>Features an automated <span className={isDarkMode ? 'text-emerald-400/80' : 'text-emerald-600'}>Fail-Safe</span>: if the SOL Engine runs low, a portion of this reserve is converted to SOL.</p>
            </div>
            <div className="flex items-start gap-3">
              <CheckCircle className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
              <p className={`text-xs ${isDarkMode ? 'text-white/50' : 'text-gray-500'}`}>Ensures the treasury is always self-sustaining and the game never freezes.</p>
            </div>
          </div>
        </div>
      </motion.div>

      {/* ══════════════════════════════════════════════════════════════════
          WITHDRAW MODAL (admin only)
      ══════════════════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {showWithdrawModal && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50"
              onClick={() => setShowWithdrawModal(false)}
            />

            {/* Modal */}
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              transition={{ type: 'spring', damping: 20, stiffness: 260 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div
                className="w-full max-w-sm rounded-2xl overflow-hidden
                  bg-gray-900/95 backdrop-blur-xl
                  border border-white/10
                  shadow-[0_0_60px_rgba(0,0,0,0.6)]"
              >
                {/* Modal header */}
                <div className="px-6 pt-6 pb-4 flex items-center justify-between border-b border-white/5">
                  <div className="flex items-center gap-2">
                    <Shield className="w-4 h-4 text-amber-400" />
                    <h2 className="text-base font-bold text-white">Admin Withdrawal</h2>
                  </div>
                  <button
                    onClick={() => setShowWithdrawModal(false)}
                    className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
                  >
                    <X className="w-4 h-4 text-white/50" />
                  </button>
                </div>

                <div className="px-6 py-5 space-y-4">
                  {/* Asset selector */}
                  <div>
                    <label className="text-xs font-semibold text-white/40 uppercase tracking-widest mb-2 block">
                      Asset
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      {(['SOL', 'FPT'] as WithdrawAsset[]).map((asset) => (
                        <button
                          key={asset}
                          onClick={() => { setWithdrawAsset(asset); setWithdrawAmount(''); }}
                          className={`py-3 rounded-xl font-semibold text-sm transition-all border ${
                            withdrawAsset === asset
                              ? 'bg-amber-500/20 border-amber-500/50 text-amber-300'
                              : 'bg-white/5 border-white/10 text-white/50 hover:bg-white/10'
                          }`}
                        >
                          {asset === 'SOL' ? '◎ SOL' : '⬡ FPT'}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Balance hint */}
                  <div className="text-xs text-white/30">
                    Available:{' '}
                    <span className="text-white/50 font-mono">
                      {withdrawAsset === 'SOL'
                        ? `${Math.max(0, (balances.sol ?? 0) - VAULT_MIN_RESERVE_SOL).toFixed(4)} SOL`
                        : `${balances.fpt?.toLocaleString('en-US', { maximumFractionDigits: 2 }) ?? '\u2014'} FPT`}
                    </span>
                    {withdrawAsset === 'SOL' && (
                      <span className="text-amber-500/60 ml-1">(0.003 SOL reserve locked on-chain)</span>
                    )}
                  </div>

                  {/* Amount input */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-xs font-semibold text-white/40 uppercase tracking-widest">
                        Amount ({withdrawAsset})
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          if (withdrawAsset === 'SOL' && balances.sol !== null) {
                            const max = Math.max(0, balances.sol - VAULT_MIN_RESERVE_SOL);
                            setWithdrawAmount(max.toFixed(6));
                          } else if (withdrawAsset === 'FPT' && balances.fpt !== null) {
                            setWithdrawAmount(Math.floor(balances.fpt).toString());
                          }
                        }}
                        className="text-xs font-semibold text-amber-400 hover:text-amber-300 transition-colors"
                      >
                        Max
                      </button>
                    </div>
                    <input
                      type="number"
                      min="0"
                      step={withdrawAsset === 'SOL' ? '0.001' : '1'}
                      placeholder={withdrawAsset === 'SOL' ? '0.000 SOL' : '0 FPT'}
                      value={withdrawAmount}
                      onChange={(e) => setWithdrawAmount(e.target.value)}
                      disabled={isProcessing}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3
                        text-white placeholder-white/20 text-sm font-mono
                        focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20
                        transition-all disabled:opacity-50"
                    />
                  </div>

                  {/* Submit */}
                  <motion.button
                    onClick={handleWithdraw}
                    disabled={isProcessing || !withdrawAmount}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    className="w-full flex items-center justify-center gap-2 px-5 py-3.5 rounded-xl
                      font-bold text-sm text-black
                      bg-gradient-to-r from-amber-400 to-orange-400
                      hover:from-amber-300 hover:to-orange-300
                      shadow-[0_0_20px_rgba(245,158,11,0.3)]
                      disabled:opacity-40 disabled:cursor-not-allowed
                      transition-all"
                  >
                    {isProcessing ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        Processing…
                      </>
                    ) : (
                      <>
                        <ArrowUpFromLine className="w-4 h-4" />
                        Withdraw {withdrawAsset}
                      </>
                    )}
                  </motion.button>

                  <p className="text-xs text-white/20 text-center">
                    Admin-only · Verified on-chain via <code className="text-white/30">require_keys_eq!</code>
                  </p>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};

export default TreasuryPage;
