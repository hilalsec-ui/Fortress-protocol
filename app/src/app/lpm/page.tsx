"use client";

import React, { useState, useEffect, useRef } from 'react';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { useAnchorProgram } from '@/utils/anchor';
import { motion, AnimatePresence } from 'framer-motion';
import { Zap, Timer, Shield, Sparkles, RefreshCw, Crown, ExternalLink } from 'lucide-react';
import BuyTicketModal from '@/components/BuyTicketModal';
import WinnerCelebration from '@/components/WinnerCelebration';
import DrawStepTracker from '@/components/DrawStepTracker';
import toast from 'react-hot-toast';
import { useTheme } from '@/contexts/ThemeContext';
import { useFptPrice } from '@/contexts/FptPriceContext';
import { buyTicketWithProgram, fulfillDrawEntropy } from '@/services/lotteryService';
import { triggerCrank } from '@/utils/triggerCrank';
import { useSettlementTrigger } from '@/hooks/useSettlementTrigger';
import { usePendingDraws, DrawPhase } from '@/hooks/usePendingDraw';
import { useChainData } from '@/contexts/ChainDataContext';
import { LPM_TIERS, SB_RANDOMNESS_ACCOUNTS, PROGRAM_ID, PRIZE_WINNER_PCT, FPT_MINT, CRANK_AUTHORITY } from '@/utils/constants';


const LPLPage: React.FC = () => {
  const { connected, publicKey, sendTransaction } = useWallet();
  const { connection } = useConnection();
  const program = useAnchorProgram();
  const { isDarkMode } = useTheme();
  const { fptPerUsd6dec, fptUsd, fptMarketUsd, isLoading: priceLoading } = useFptPrice();
  const fmtFptTier = (tierUsd: number) => {
    const n = tierUsd * fptPerUsd6dec / 1_000_000;
    if (n >= 1_000_000) return `~${(n / 1_000_000).toFixed(1)}M FPT`;
    if (n >= 1_000) return `~${Math.round(n).toLocaleString('en-US')} FPT`;
    return `~${n.toFixed(2)} FPT`;
  };
  const { lotteryAccounts, isLoading: chainLoading, refresh } = useChainData();
  const { trigger: settlementTrigger } = useSettlementTrigger(connection);
  const [lotteryData, setLotteryData] = useState<any>(null);
  const isLoading = chainLoading && !lotteryData;
  const [isBuyModalOpen, setIsBuyModalOpen] = useState(false);
  const [selectedTier, setSelectedTier] = useState<number>(5);
  const [viewingTier, setViewingTier] = useState<number>(5); // Track which tier's participants to show
  const [showCelebration, setShowCelebration] = useState(false);
  const [winnerData, setWinnerData] = useState<any>(null);
  // Tracks in-flight TX per tier; null = no local TX
  const [localTxState, setLocalTxState] = useState<Record<number, 'house_triggering' | 'requesting' | 'settling' | 'fallback_needed' | 'step1_complete' | 'step2_processing' | null>>({});
  const [drawError, setDrawError] = useState<string | null>(null);

  // On-chain draw phase per tier (idle → requested → oracle_ready)
  const { phases: onChainPhase, isInitialized: onChainReady, requestedTimes, userInitiated } = usePendingDraws(program, 'LPM', LPM_TIERS);

  // Effective phase: local TX state takes priority over on-chain.
  // If a draw is stuck in 'requested' for > 2 minutes, auto-flip to 'fallback_needed'
  // so the manual retry button appears. For user-initiated draws (non-crank authority),
  // skip the wait and show the button immediately.
  const STALE_THRESHOLD_SECS = 120;
  const getPhase = (tier: number): string => {
    const local = localTxState[tier];
    if (local) return local;
    const onChain = onChainPhase[tier] ?? 'idle';
    if (onChain === 'requested') {
      if (userInitiated[tier]) return 'fallback_needed';
      const rAt = requestedTimes[tier] ?? 0;
      if (rAt > 0 && (Math.floor(Date.now() / 1000) - rAt) > STALE_THRESHOLD_SECS) {
        return 'fallback_needed';
      }
    }
    return onChain;
  };


  // ── Sync from shared chain data (one combined fetch per 10s via ChainDataContext) ─
  useEffect(() => {
    if (!lotteryAccounts) return;
    const lpmData = lotteryAccounts.find((l: any) => l.lotteryType === 'LPM');
    const tiers = (lpmData?.tiers?.length > 0)
      ? lpmData.tiers
      : LPM_TIERS.map((tier: number) => ({ tier, participants: 0, prizePool: 0 }));
    setLotteryData({
      lotteryType: 'LPM',
      title: 'Lightning Pool',
      description: '100-person sprint lottery - Instant draw when full!',
      currentParticipants: lpmData?.currentParticipants || 0,
      maxParticipants: 100,
      lastWinner: lpmData?.lastWinner || null,
      tiers,
    });
  }, [lotteryAccounts]); // eslint-disable-line react-hooks/exhaustive-deps

  // Trigger an immediate re-fetch from ChainDataContext
  const refreshData = async () => {
    refresh();
  };

  const resetTier = async (tier: number) => {
    try {
      // Clear participants for this tier in localStorage
      const storageKey = `LPM-tier-${tier}-participants`;
      localStorage.setItem(storageKey, JSON.stringify([]));
      
    } catch (error) {
      console.error(`Failed to reset tier ${tier}:`, error);
    }
  };

  const handleConnectWalletClick = () => window.dispatchEvent(new CustomEvent('open-sidebar'));

  // Auto-trigger house draw when an LPM tier fills to 100 participants.
  // Retries up to 3× with 2 s pauses. If all fail → 'fallback_needed'.
  // Guard: tier stays in ref until vault resets (participants < 100), so a
  // successful trigger never re-fires for the same round.
  const houseTriggerInFlightRef = useRef<Set<number>>(new Set());
  useEffect(() => {
    if (!lotteryData?.tiers) return;
    for (const tierData of lotteryData.tiers) {
      const t: number = tierData.tier;
      // When the vault resets after a draw, participants drop to 0 — clear the
      // guard so the *next* full batch can trigger a fresh draw.
      if (tierData.participants < 100) {
        houseTriggerInFlightRef.current.delete(t);
      }
      if (tierData.participants >= 100 && onChainReady && getPhase(t) === 'idle') {
        if (houseTriggerInFlightRef.current.has(t)) continue; // already triggered or in-flight
        houseTriggerInFlightRef.current.add(t); // lock for this round
        setLocalTxState(prev => ({ ...prev, [t]: 'house_triggering' }));
        setDrawError(null);
        (async () => {
          let success = false;
          let pendingDrawCreated = false; // true once request_draw_entropy confirmed a PendingDraw on-chain
          // Calls fulfill_draw_entropy server-side so the entire draw completes without any wallet popup.
          const doFulfill = async (): Promise<boolean> => {
            try {
              const fRes = await fetch('/api/draw/fulfill', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lottery_type: 'LPM', tier: t }) });
              const fData = await fRes.json();
              if (fData.success) {
                toast.success(`🏆 Draw complete! Winner: ${String(fData.winner ?? '').slice(0, 6)}…`, { duration: 6000 });
                setWinnerData({ wallet: fData.winner, tier: t, prize: ((fData.prize ?? 0) / 1_000_000) * 0.95, lotteryType: 'LPM' });
                setShowCelebration(true);
                return true;
              }
              if (fData.already_fulfilled) return true;
              console.warn(`[LPM] Fulfill: ${fData.error ?? 'unknown'} — fallback will activate`);
              return false;
            } catch (e) { console.error('[LPM] Fulfill error:', e); return false; }
          };
          for (let attempt = 1; attempt <= 3; attempt++) {
            try {
              const res = await fetch('/api/draw/request', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ lottery_type: 'LPM', tier: t }),
              });
              const data = await res.json();
              if (data.fallback_required) {
                console.warn(`[LPM] Crank balance too low on attempt ${attempt}/3 — will exhaust retries then show user fallback`);
              } else if (data.oracle_failed) {
                // request_draw_entropy succeeded — PendingDraw exists on-chain — but oracle commit/reveal failed.
                pendingDrawCreated = true;
                console.warn(`[LPM] Oracle failed on attempt ${attempt}/3 — kicking oracle directly`);
                try {
                  const orbRes = await fetch('/api/draw/oracle', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ lottery_type: 'LPM', tier: t }),
                  });
                  const orbData = await orbRes.json();
                  if (!orbData.fallback_required && !orbData.oracle_failed && orbRes.ok) {
                    success = await doFulfill();
                    break;
                  }
                  if (orbData.fallback_required) {
                    console.warn(`[LPM] Oracle crank low on attempt ${attempt}/3 — will exhaust retries then show user fallback`);
                  }
                } catch (orbErr) {
                  console.error(`[LPM] Oracle kick failed on attempt ${attempt}/3:`, orbErr);
                }
              } else if (data.success) {
                success = await doFulfill();
                break;
              } else if (data.error && data.error.includes('not full')) {
                // Vault not full yet — exit without showing fallback.
                success = true;
                break;
              } else if (data.error && data.error.includes('already in progress')) {
                if (!pendingDrawCreated) {
                  // Another user's draw in progress — attempt fulfill (polls oracle up to 30s).
                  await doFulfill();
                  success = true; // oracle is running; even if fulfill times out, GitHub crank will complete it
                  break;
                }
                // We created the PendingDraw but oracle failed — kick oracle directly.
                console.warn(`[LPM] Retrying oracle for existing PendingDraw on attempt ${attempt}/3`);
                try {
                  const orbRes = await fetch('/api/draw/oracle', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ lottery_type: 'LPM', tier: t }),
                  });
                  const orbData = await orbRes.json();
                  if (!orbData.fallback_required && !orbData.oracle_failed && orbRes.ok) {
                    success = await doFulfill();
                    break;
                  }
                } catch (orbErr) {
                  console.error(`[LPM] Oracle retry kick failed on attempt ${attempt}/3:`, orbErr);
                }
              } else {
                console.warn(`[LPM] House draw attempt ${attempt}/3 failed:`, data.error);
              }
            } catch (err) {
              console.error(`[LPM] House draw attempt ${attempt}/3 error:`, err);
            }
            if (attempt < 3) await new Promise(r => setTimeout(r, 2000));
          }
          if (!success) {
            // All 3 attempts failed — show manual fallback.
            // Remove from ref so fallback_needed phase acts as the sole guard.
            console.warn('[LPM] All 3 house draw attempts failed — enabling user fallback');
            houseTriggerInFlightRef.current.delete(t);
            setLocalTxState(prev => ({ ...prev, [t]: 'fallback_needed' }));
          } else {
            // Success: leave tier in ref — re-trigger is blocked until vault resets.
            setLocalTxState(prev => ({ ...prev, [t]: null }));
            refresh();
          }
        })();
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lotteryData, onChainReady]);

  // Auto-clear local overrides when on-chain catches up
  useEffect(() => {
    for (const tier of LPM_TIERS) {
      const local = localTxState[tier];
      const onChain = onChainPhase[tier] ?? 'idle';
      // Clear fallback_needed / step1_complete when oracle is ready
      if ((local === 'fallback_needed' || local === 'step1_complete') && onChain === 'oracle_ready') {
        setLocalTxState(prev => ({ ...prev, [tier]: null }));
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onChainPhase]);

  // Manual draw step handler: detects current on-chain state and performs the next
  // incomplete step only. Each step persists on-chain across refreshes/devices.
  //   Step 1: request_draw_entropy (creates PendingDraw PDA)
  //   Step 2: oracle reveal (sets reveal_slot on SB account)
  //   Step 3: finalize (handled by handleSettle — always manual)
  const handleDrawStep = async (tier: number) => {
    if (!connected || !publicKey || !sendTransaction || !program) {
      toast.error('Please connect your wallet first');
      return;
    }
    const id = `draw-step-${tier}`;
    try {
      const { Transaction, PublicKey: Pk } = await import('@solana/web3.js');

      const LOTTERY_TYPE_ID_VAL = 0; // LPM
      const FORTRESS_PROGRAM = new Pk(PROGRAM_ID);

      const [pendingDrawPDA] = Pk.findProgramAddressSync(
        [Buffer.from('pending_draw'), Buffer.from([LOTTERY_TYPE_ID_VAL]), Buffer.from([tier])],
        FORTRESS_PROGRAM,
      );

      const pdInfo = await connection.getAccountInfo(pendingDrawPDA, 'confirmed');

      if (pdInfo && pdInfo.data.length >= 42) {
        // ── Step 2 path: PendingDraw exists on-chain ──
        const rndPk = new Pk(pdInfo.data.slice(10, 42));
        const rndInfo = await connection.getAccountInfo(rndPk, 'confirmed');
        if (!rndInfo) throw new Error('RNG account not found on-chain. Please wait 30s and retry.');

        // Check if oracle already revealed (compare against request_reveal_slot from PendingDraw)
        let alreadyRevealed = false;
        if (rndInfo.data.length >= 152) {
          const buf = Buffer.from(rndInfo.data);
          const revSlotLo = buf.readUInt32LE(144);
          const revSlotHi = buf.readUInt32LE(148);
          if (pdInfo.data.length >= 123) {
            const reqRevSlotLo = pdInfo.data.readUInt32LE(115);
            const reqRevSlotHi = pdInfo.data.readUInt32LE(119);
            alreadyRevealed = revSlotHi > reqRevSlotHi || (revSlotHi === reqRevSlotHi && revSlotLo > reqRevSlotLo);
          } else {
            alreadyRevealed = revSlotLo > 0 || revSlotHi > 0;
          }
        }
        if (alreadyRevealed) {
          toast.success('✅ Oracle already revealed — click "Finalize Draw"', { duration: 5000 });
          setLocalTxState(prev => ({ ...prev, [tier]: null }));
          return;
        }

        // Step 2a: Oracle Commit
        // Crank partial-signs as randomness authority (no SOL needed from crank), user pays fees.
        setLocalTxState(prev => ({ ...prev, [tier]: 'step2_processing' }));
        toast.loading('🔮 Preparing oracle commit…', { id });
        const commitRes = await fetch('/api/draw/oracle', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lottery_type: 'LPM', tier, user_pubkey: publicKey.toBase58(), mode: 'build' }),
        });
        const commitData = await commitRes.json();
        if (!commitRes.ok) throw new Error(commitData.error ?? 'Oracle commit build failed — please retry');
        const commitTx = Transaction.from(Buffer.from(commitData.commit_tx, 'base64'));
        toast.dismiss(id);
        toast.loading('✍️ Approve oracle commit in your wallet…', { id });
        const sigCommit = await sendTransaction(commitTx, connection, { skipPreflight: true });
        toast.dismiss(id);
        toast.loading('⏳ Confirming oracle commit…', { id });
        await connection.confirmTransaction(sigCommit, 'confirmed');
        toast.dismiss(id);
        // Give oracle TEE ~2.5 s to observe the on-chain commit before requesting reveal
        toast.loading('⏳ Oracle processing commit…', { id });
        await new Promise(r => setTimeout(r, 2500));
        toast.dismiss(id);

        // Step 2b: Oracle Reveal
        // Crank partial-signs as authority, user pays oracle reward fee.
        toast.loading('🔮 Preparing oracle reveal…', { id });
        const revealRes = await fetch('/api/draw/oracle', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lottery_type: 'LPM', tier, user_pubkey: publicKey.toBase58(), mode: 'build_reveal' }),
        });
        const revealData = await revealRes.json();
        if (!revealRes.ok) throw new Error(revealData.error ?? 'Oracle reveal build failed — please retry');
        const revealTx = Transaction.from(Buffer.from(revealData.reveal_tx, 'base64'));
        toast.dismiss(id);
        toast.loading('✍️ Approve oracle reveal in your wallet…', { id });
        const sigReveal = await sendTransaction(revealTx, connection, { skipPreflight: true });
        toast.dismiss(id);
        toast.loading('⏳ Confirming oracle reveal…', { id });
        await connection.confirmTransaction(sigReveal, 'confirmed');
        toast.dismiss(id);
        toast.success('✅ Oracle committed & revealed. Click "Finalize Draw" to claim your FPT bounty.', { duration: 7000 });
        setLocalTxState(prev => ({ ...prev, [tier]: null }));
        return;
      }

      // ── Step 1: request_draw_entropy (user is feePayer, no crank involved) ──
      setLocalTxState(prev => ({ ...prev, [tier]: 'requesting' }));
      toast.loading('🔧 Building draw transaction…', { id });
      const initRes = await fetch('/api/draw/init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lottery_type: 'LPM', tier, user_pubkey: publicKey.toBase58() }),
      });
      const initData = await initRes.json();
      if (!initRes.ok) throw new Error(initData.error ?? 'Failed to build draw transaction');
      const tx1 = Transaction.from(Buffer.from(initData.transaction, 'base64'));

      toast.dismiss(id);
      toast.loading('✍️ Approve draw request in your wallet…', { id });
      const sig1 = await sendTransaction(tx1, connection, { skipPreflight: true });
      toast.dismiss(id);
      toast.loading('⏳ Confirming draw on-chain…', { id });
      const conf1 = await connection.confirmTransaction(sig1, 'confirmed');
      if (conf1.value.err) throw new Error(`Draw TX failed on-chain: ${JSON.stringify(conf1.value.err)}`);
      toast.dismiss(id);

      // After Step 1, try oracle execute (crank-paid commit+reveal) silently.
      // This works if crank has oracle-fee balance even when it lacks requestDrawEntropy balance.
      toast.loading('⏳ Requesting oracle to process draw…', { id });
      try {
        const kickRes = await fetch('/api/draw/oracle', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lottery_type: 'LPM', tier }),
        });
        const kickData = await kickRes.json();
        if (kickData.success) {
          toast.dismiss(id);
          toast.success('✅ Draw requested and oracle processed. Click "Finalize Draw".', { duration: 7000 });
          setLocalTxState(prev => ({ ...prev, [tier]: null }));
          return;
        }
      } catch { /* crank balance too low — show manual Step 2 */ }

      toast.dismiss(id);
      toast.success('✅ Step 1 complete. Click "Complete Oracle" to continue.', { duration: 7000 });
      setLocalTxState(prev => ({ ...prev, [tier]: 'step1_complete' }));
    } catch (err: any) {
      toast.dismiss(id);
      const msg: string = err?.message ?? '';
      if (/user rejected|user cancel|cancelled by user|transaction rejected/i.test(msg)) {
        toast('Transaction cancelled', { icon: 'ℹ️', duration: 3000 });
      } else {
        toast.error(msg.slice(0, 200) || 'Draw step failed — please try again', { duration: 8000 });
      }
      setLocalTxState(prev => ({ ...prev, [tier]: 'fallback_needed' }));
    }
  };

  // Click 2: Settle the draw — permissionless, anyone earns the FPT reward.
  const handleSettle = async (tier: number) => {
    if (!program || !connected || !publicKey) {
      toast.error('Please connect your wallet first');
      return;
    }
    setLocalTxState(prev => ({ ...prev, [tier]: 'settling' }));
    try {
      toast.loading('⚡ Settling draw & claiming FPT bounty…', { id: `draw-settle-${tier}` });
      const result = await fulfillDrawEntropy(program, 'LPM', tier, publicKey);
      toast.dismiss(`draw-settle-${tier}`);
      toast.success(`🏆 Draw settled! FPT bounty sent to your wallet! Tx: ${result.signature.slice(0, 8)}…`, { duration: 7000 });
      setWinnerData({ wallet: result.winner, tier, prize: result.prize, lotteryType: 'LPM' });
      setShowCelebration(true);
      await refreshData();
    } catch (error: any) {
      toast.dismiss(`draw-settle-${tier}`);
      const errorMsg: string = error.message || 'Unknown error settling draw';
      if (/user rejected|user cancelled|cancelled by user|transaction rejected/i.test(errorMsg)) {
        toast('Transaction cancelled', { icon: 'ℹ️', duration: 3000 });
      } else if (/oracle has not committed|oracle.*not.*ready|DrawNotYetReady/i.test(errorMsg)) {
        setDrawError(errorMsg);
        toast.error('⏳ Oracle not ready for this draw cycle yet — auto-kicking oracle. Please wait ~10 seconds and try again.', { duration: 8000 });
      } else {
        setDrawError(errorMsg);
        toast.error(errorMsg, { duration: 6000 });
      }
      await refreshData();
    } finally {
      setLocalTxState(prev => ({ ...prev, [tier]: null }));
    }
  };

  const handleBuyTicket = async (tier: number) => {
    if (!connected) {
      toast.error('Please connect your wallet first.');
      return;
    }
    
    if (!program) {
      toast.error('Program not ready. Please wait a moment and try again.');
      console.error('❌ Program not initialized when trying to buy ticket');
      return;
    }
    
    setSelectedTier(tier);
    setIsBuyModalOpen(true);
  };

  const handleBuyTicketSubmit = async (tier: number, participantId: number, quantity: number = 1, onProgress?: (step: number, total: number, qty: number) => void) => {
    
    if (!connected || !publicKey) {
      const error = new Error('Wallet not connected. Please connect your wallet first.');
      console.error('❌ Wallet check failed:', error);
      throw error;
    }
    
    if (!program) {
      console.error('❌ Program not initialized:', { program, connected, publicKey: publicKey?.toString() });
      const error = new Error('Program not initialized. Please wait a moment and try again.');
      console.error('❌ Throwing:', error);
      throw error;
    }
    
    const result = await buyTicketWithProgram(program, 'LPM', tier, participantId, quantity, publicKey, onProgress, sendTransaction ?? undefined);

    await refreshData();

    // Trigger crank if this purchase fills the vault to 100 participants
    const tierState = lotteryData?.tiers?.find((t: any) => t.tier === tier);
    if ((tierState?.participants ?? 0) + quantity >= 100) settlementTrigger('LPM', tier, 0);

    return result;
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-yellow-500/10 to-orange-500/10">
        <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} className="text-center">
          <div className="w-20 h-20 bg-gradient-to-br from-yellow-500 to-orange-500 rounded-full flex items-center justify-center mx-auto mb-4 animate-pulse">
            <Zap className="w-10 h-10 text-white" />
          </div>
          <div className={`text-2xl font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Loading Lightning Pool...</div>
        </motion.div>
      </div>
    );
  }

  const totalParticipants = lotteryData?.tiers?.reduce((sum: number, tier: any) => sum + tier.participants, 0) || 0;
  const selectedTierData = lotteryData?.tiers?.find((t: any) => t.tier === viewingTier);
  const tierParticipants = selectedTierData?.participants || 0;
  const tierPrizePool = selectedTierData?.prizePool || 0;
  const cappedParticipants = Math.min(tierParticipants, 100); // Cap at 100 for display
  const progressPercentage = Math.min((cappedParticipants / 100) * 100, 100); // Cap at 100%
  const totalCapacity = 100 * 4; // 4 tiers × 100 participants each = 400 total capacity
  const isFull = tierParticipants >= 100; // Tier is full when it reaches 100

  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <section className="relative overflow-hidden py-16 px-4 sm:px-8">
        <div className="absolute top-20 right-20 w-72 h-72 bg-yellow-500/15 rounded-full blur-[120px]" />
        <div className="absolute bottom-20 left-20 w-96 h-96 bg-orange-500/15 rounded-full blur-[120px]" />
        
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative max-w-7xl mx-auto"
        >
          <div className="text-center mb-8">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 200, delay: 0.15 }}
              className="inline-block mb-6"
            >
              <div className="w-24 h-24 bg-gradient-to-br from-yellow-500 to-orange-500 rounded-2xl flex items-center justify-center shadow-2xl shadow-yellow-500/25">
                <Zap className="w-12 h-12 text-white" />
              </div>
            </motion.div>
            
            <h1 className={`text-5xl md:text-7xl font-black mb-4 ${isDarkMode ? 'bg-gradient-to-r from-yellow-400 to-orange-400 bg-clip-text text-transparent' : 'bg-gradient-to-r from-yellow-600 to-orange-600 bg-clip-text text-transparent'}`}>
              ⚡ Lightning Pool
            </h1>
            <p className={`text-2xl md:text-3xl mb-4 ${isDarkMode ? 'text-yellow-300' : 'text-yellow-700'}`}>
              No Waiting • Instant Action • 100 Players = Winner!
            </p>
            <p className={`text-lg max-w-3xl mx-auto ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>
              The fastest lottery on Solana powered by <span className="font-bold text-yellow-500">Switchboard V3 VRF Entropy</span>. No time limits, no countdowns. The moment 100 participants join, the protocol automatically initiates the draw on-chain — the Switchboard oracle responds in ~2 seconds — then the protocol settles the winner and pays out the prize pool instantly. If automation ever stalls, any wallet can step in with one click and earn a <span className="font-bold text-yellow-400">FPT bounty</span>.
            </p>
          </div>

          {/* Live Stats Card */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className={`max-w-4xl mx-auto rounded-3xl p-8 shadow-2xl relative ${
              isDarkMode ? 'bg-black/40 backdrop-blur-xl border border-yellow-500/20' : 'bg-white/80 backdrop-blur-xl'
            }`}
          >
            <div className="grid md:grid-cols-3 gap-6 mb-6">
              <div className="text-center">
                <div className={`text-5xl font-bold mb-2 ${isFull ? 'text-green-500' : 'text-yellow-500'}`}>
                  {cappedParticipants}/100
                </div>
                <div className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>Tier ${viewingTier} Participants</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold mb-1 tabular-nums text-green-400">
                  {fptUsd > 0 ? `$${(tierPrizePool * fptUsd).toFixed(2)}` : '...'}
                </div>
                <div className="text-xs text-green-400 font-semibold mb-1">USD</div>
                <div className="text-xs text-yellow-500/70 mb-1 tabular-nums">
                  {Number(tierPrizePool).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} FPT
                </div>
                <div className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>Tier ${viewingTier} Prize Pool</div>
              </div>
              <div className="text-center">
                <div className={`text-3xl font-bold mb-2 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{totalParticipants}/{totalCapacity}</div>
                <div className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>Total All Tiers</div>
              </div>
            </div>

            <div className="mb-6">
              <div className="flex items-center justify-between mb-2">
                <span className={`text-sm font-semibold ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                  {isFull ? '🎉 Pool Full - Ready to Draw!' : '⏳ Filling Up...'}
                </span>
                <span className={`text-sm font-bold ${isDarkMode ? 'text-yellow-400' : 'text-yellow-600'}`}>
                  {progressPercentage.toFixed(0)}%
                </span>
              </div>
              
              {/* Tier Selector */}
              <div className="flex gap-2 mb-4 justify-center">
                {[5, 10, 20, 50].map((tier) => (
                  <button
                    key={tier}
                    onClick={() => setViewingTier(tier)}
                    className={`px-4 py-2 rounded-lg font-bold transition-all ${
                      viewingTier === tier
                        ? 'bg-gradient-to-r from-yellow-500 to-orange-500 text-white shadow-lg scale-105'
                        : isDarkMode
                        ? 'bg-white/10 text-gray-400 hover:bg-white/20'
                        : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
                    }`}
                  >
                    ${tier}
                  </button>
                ))}
              </div>
              
              <div className="w-full bg-gray-700/30 rounded-full h-4 overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${progressPercentage}%` }}
                  transition={{ duration: 1, ease: "easeOut" }}
                  className={`h-full rounded-full ${
                    isFull ? 'bg-gradient-to-r from-green-500 to-emerald-500 animate-pulse' : 'bg-gradient-to-r from-yellow-500 to-orange-500'
                  }`}
                />
              </div>
              
              {/* Draw Error Display */}
              {drawError && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-4 p-3 bg-red-500/20 border border-red-500/50 rounded-lg"
                >
                  <p className="text-red-400 text-sm text-center">
                    ⚠️ {drawError}
                  </p>
                  <button
                    onClick={() => setDrawError(null)}
                    className="text-red-300 text-xs underline mt-1 block mx-auto hover:text-red-200"
                  >
                    Dismiss
                  </button>
                </motion.div>
              )}
              
              {/* Step-by-step draw progress (on-chain persistent) */}
              {isFull && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="mt-4"
                >
                  <DrawStepTracker
                    phase={getPhase(viewingTier)}
                    onChainPhase={onChainPhase[viewingTier] ?? 'idle'}
                    onManualTrigger={() => handleDrawStep(viewingTier)}
                    onFinalize={() => handleSettle(viewingTier)}
                    connected={connected}
                    onConnect={handleConnectWalletClick}
                  />
                </motion.div>
              )}
            </div>
            

          </motion.div>
        </motion.div>
      </section>

      {/* Features */}
      <section className="py-12 px-4 sm:px-8">
        <div className="max-w-7xl mx-auto grid md:grid-cols-3 gap-6 mb-12">
          {[
            { icon: Timer, title: "Instant Draws", description: "Draw triggers the instant 100 players join — no time limits, no countdowns.", color: "from-yellow-500 to-orange-500" },
            { icon: Shield, title: "Smart Contract Security", description: `Provably fair with SB V3 TEE VRF. Community-finalized for FPT bounty. Winner receives ${PRIZE_WINNER_PCT}%.`, color: "from-orange-500 to-red-500" },
            { icon: Sparkles, title: "Immediate Payouts", description: "Winner receives prizes instantly on-chain. Fully automatic — no delays, no manual steps required.", color: "from-yellow-500 to-amber-500" }
          ].map((feature, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
              className={`p-6 rounded-2xl text-center ${isDarkMode ? 'bg-white/[0.03] backdrop-blur-md border border-white/10' : 'bg-white shadow-md border border-gray-100'}`}
            >
              <div className={`w-14 h-14 bg-gradient-to-br ${feature.color} rounded-xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-yellow-500/20`}>
                <feature.icon className="w-7 h-7 text-white" />
              </div>
              <h3 className={`text-lg font-bold mb-2 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{feature.title}</h3>
              <p className={`text-sm leading-relaxed ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>{feature.description}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Ticket Tiers */}
      <section className="py-12 px-4 sm:px-8">
        <div className="max-w-7xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-12"
          >
            <h2 className={`text-4xl font-black mb-4 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
              Choose Your Entry Tier
            </h2>
            <p className={`text-lg ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
              4 tiers: $5 · $10 · $20 · $50 — 100 players each. Higher tiers = bigger prizes.
            </p>
          </motion.div>

          <div className="relative mb-12">
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {(lotteryData?.tiers ?? LPM_TIERS.map((t: number) => ({ tier: t, participants: 0, prizePool: 0, endTime: 0 }))).map((tier: any, index: number) => {
              const tierIsFull = tier.participants >= 100;
              const tierPhase = getPhase(tier.tier);
              const tierIsOracleReady = tierPhase === 'oracle_ready';
              
              return (
              <motion.div
                key={tier.tier}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
                whileHover={{ scale: 1.05, y: -5 }}
                className={`relative overflow-hidden rounded-2xl p-6 shadow-xl ${  tierIsFull 
                    ? 'bg-gradient-to-br from-amber-900/30 to-yellow-900/30 border-2 border-amber-400/80 shadow-[0_0_28px_rgba(251,191,36,0.35)]'
                    : isDarkMode 
                      ? 'bg-white/[0.03] backdrop-blur-md border border-white/10' 
                      : 'bg-white shadow-md border border-gray-100'
                }`}
              >
                {tierIsFull && (
                  <>
                    <div className="absolute top-2 right-2 bg-gradient-to-r from-amber-400 to-yellow-400 text-gray-900 text-xs px-2 py-1 rounded-full font-black animate-bounce">
                      🏆 BOUNTY!
                    </div>
                    <div className="absolute top-0 left-0 bg-gradient-to-r from-amber-500 to-yellow-500 text-gray-900 text-[10px] px-3 py-0.5 font-black shadow-lg rounded-br-xl">
                      REWARD AVAILABLE
                    </div>
                  </>
                )}
                <div className="absolute top-0 right-0 w-32 h-32 bg-yellow-500/10 rounded-full blur-2xl" />
                <div className="relative text-center">
                  <div className="text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-yellow-500 to-orange-500 mb-1">
                    ${tier.tier}
                  </div>
                  <div className="text-xs font-medium text-cyan-400/80 mb-1">
                    {priceLoading ? "..." : fmtFptTier(tier.tier)}
                  </div>
                  <div className={`text-sm mb-4 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>Ticket Price</div>
                  
                  <div className="space-y-3 mb-6">
                    <div>
                      <div className="text-3xl font-bold text-cyan-400">{tier.roundNumber ?? 0}</div>
                      <div className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>Current Round</div>
                    </div>
                    <div>
                      <div className={`text-3xl font-bold ${tierIsFull ? 'text-green-400' : isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                        {Math.min(tier.participants, 100)}/100
                      </div>
                      <div className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>Total Entries</div>
                    </div>
                    <div>
                      <div className="font-bold tabular-nums leading-tight text-green-400" style={{ fontSize: '0.9rem' }}>{fptUsd > 0 ? `$${(tier.prizePool * fptUsd).toFixed(2)}` : '...'}</div>
                      <div className="text-xs text-yellow-500/70 tabular-nums">{Number(tier.prizePool).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} FPT</div>
                      <div className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>Prize Pool</div>
                    </div>
                  </div>
                  {/* Show Draw/Settle Buttons when tier is full, otherwise show Buy Button */}
                  {tierIsFull ? (
                    connected ? (
                      <DrawStepTracker
                        phase={tierPhase}
                        onChainPhase={onChainPhase[tier.tier] ?? 'idle'}
                        onManualTrigger={() => handleDrawStep(tier.tier)}
                        onFinalize={() => handleSettle(tier.tier)}
                        connected={connected}
                        onConnect={handleConnectWalletClick}
                        compact
                      />
                    ) : (
                      <button
                        onClick={handleConnectWalletClick}
                        className="w-4/5 mx-auto block py-3 px-4 rounded-xl font-bold transition-all duration-300 transform bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-600 hover:to-orange-600 text-white shadow-lg hover:shadow-xl hover:scale-105"
                      >
                        🔒 Connect Wallet
                      </button>
                    )
                  ) : (
                    <button
                      onClick={() => connected ? handleBuyTicket(tier.tier) : handleConnectWalletClick()}
                      className={`w-4/5 mx-auto block py-3 px-4 rounded-xl font-bold transition-all duration-300 transform bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-600 hover:to-orange-600 text-white shadow-lg hover:shadow-xl hover:scale-105`}
                    >
                      {!connected ? '🔒 Connect Wallet' : '🎟️ Buy Ticket'}
                    </button>
                  )}
                </div>
              </motion.div>
            );
            })}
            </div>
          </div>
        </div>
      </section>

      {/* ── Mainnet Contract Info ── */}
      <section className="py-6 px-4 sm:px-8">
        <div className="max-w-7xl mx-auto">
          <div className={`rounded-xl p-4 text-xs font-mono flex flex-wrap gap-y-2 items-center justify-between ${ isDarkMode ? 'bg-white/[0.02] border border-white/5 text-gray-500' : 'bg-gray-50 border border-gray-100 text-gray-400' }`}>
            <span className="text-green-500 font-bold uppercase tracking-wider">● Solana Mainnet</span>
            {[
              { label: 'Program', val: PROGRAM_ID },
              { label: 'FPT Mint', val: FPT_MINT },
              { label: 'Crank', val: CRANK_AUTHORITY },
            ].map(({ label, val }) => (
              <a key={label} href={`https://solscan.io/account/${val}`} target="_blank" rel="noopener noreferrer"
                className={`flex items-center gap-1 hover:text-cyan-400 transition-colors ${ isDarkMode ? 'text-gray-600' : 'text-gray-400' }`}>
                <span className={isDarkMode ? 'text-gray-500' : 'text-gray-500'}>{label}:</span>
                <span>{val.slice(0, 6)}…{val.slice(-4)}</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            ))}
          </div>
        </div>
      </section>

      <BuyTicketModal
        isOpen={isBuyModalOpen}
        onClose={() => setIsBuyModalOpen(false)}
        lotteryType="LPM"
        ticketPrice={selectedTier}
        initialTier={selectedTier}
        maxParticipants={100}
        currentParticipants={totalParticipants}
        tierData={lotteryData?.tiers}
        isContractReady={!!program}
        program={program}
        onBuyTicket={handleBuyTicketSubmit}
      />

      <WinnerCelebration
        isVisible={showCelebration}
        winnerData={winnerData}
        onClose={() => {
          setShowCelebration(false);
          setWinnerData(null);
          refreshData();
        }}
      />
    </div>
  );
};

export default LPLPage;
