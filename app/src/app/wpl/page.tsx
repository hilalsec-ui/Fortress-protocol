"use client";

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { useAnchorProgram } from '@/utils/anchor';
import { PROGRAM_ID, PRIZE_WINNER_PCT, PRIZE_TREASURY_PCT, FPT_MINT, CRANK_AUTHORITY } from '@/utils/constants';
import { motion, AnimatePresence } from 'framer-motion';
import { Calendar, Clock, Shield, RefreshCw, TrendingUp, ExternalLink } from 'lucide-react';
import DrawStepTracker from '@/components/DrawStepTracker';
import BuyTicketModal from '@/components/BuyTicketModal';
import CountdownTimer from '@/components/CountdownTimer';
import WinnerCelebration from '@/components/WinnerCelebration';
import toast from 'react-hot-toast';
import { useTheme } from '@/contexts/ThemeContext';
import { useFptPrice } from '@/contexts/FptPriceContext';
import { triggerCrank } from '@/utils/triggerCrank';
import { useSettlementTrigger } from '@/hooks/useSettlementTrigger';
import { buyTicketWithProgram, fulfillDrawEntropy } from '@/services/lotteryService';
import { usePendingDraws } from '@/hooks/usePendingDraw';
import { SB_RANDOMNESS_ACCOUNTS } from '@/utils/constants';
import { getSolanaHeartbeat } from '@/services/solanaHeartbeat';
import { useChainData } from '@/contexts/ChainDataContext';
import { useTimeOffsetStore } from '@/stores/timeOffsetStore';
import { useTreasuryWarnings } from '@/hooks/useTreasuryWarnings';


const WPLPage: React.FC = () => {
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
  const isSyncingFromStore = useTimeOffsetStore((state) => state.isSyncing);
  useTreasuryWarnings(PROGRAM_ID);
  
  const { lotteryAccounts, isLoading: chainLoading, refresh } = useChainData();
  const { trigger: settlementTrigger } = useSettlementTrigger(connection);
  // isLoading only triggers the full-page spinner on the very first load
  const [isBuyModalOpen, setIsBuyModalOpen] = useState(false);
  const [selectedTier, setSelectedTier] = useState<number>(5);
  const [showCelebration, setShowCelebration] = useState(false);
  const [winnerData, setWinnerData] = useState<any>(null);
  // 'house_triggering' | 'settling' | 'fallback_needed' tracks in-flight TX per tier; null = no local TX
  const [localTxState, setLocalTxState] = useState<Record<number, 'house_triggering' | 'settling' | 'fallback_needed' | 'requesting' | 'step1_complete' | 'step2_processing' | null>>({});

  // On-chain draw phase per tier (idle → requested → oracle_ready)
  const { phases: onChainPhase, isInitialized: onChainReady, requestedTimes, userInitiated } = usePendingDraws(program, 'WPL', [5, 10, 15, 20]);

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

  const [isResettingByTier, setIsResettingByTier] = useState<Record<number, boolean>>({
    5: false,
    10: false,
    15: false,
    20: false,
  });
  // Subscribe to the single global ticker driven by ChainDataContext.
  // All tier cards + the hero CountdownTimer on this page read the same value
  // so every timer ticks in perfect unison — no per-page interval needed.
  const nowSeconds = useTimeOffsetStore((state) => state.nowSeconds);

  // Derive lotteryData synchronously from shared chain state — no extra render cycle,
  // no ghost tiers, no state jump on the 10-second background poll.
  const lotteryData = useMemo(() => {
    if (!lotteryAccounts) return null;
    const wplData = lotteryAccounts.find((l: any) => l.lotteryType === 'WPL');
    if (!wplData) return null;
    return {
      lotteryType: 'WPL',
      title: 'Weekly Pool',
      description: 'Perfect weekly rhythm - consistent wins every 7 days',
      currentParticipants: wplData.currentParticipants || 0,
      lastWinner: wplData.lastWinner || null,
      // Only render tiers that actually exist on-chain — no ghost placeholders
      tiers: wplData.tiers?.length > 0 ? wplData.tiers : [],
    };
  }, [lotteryAccounts]);

  // isLoading only triggers the full-page spinner before the first successful fetch
  const isLoading = chainLoading && !lotteryData;

  // Compute tier data for the hero card without a separate effect
  const selectedTierData = lotteryData?.tiers?.find((t: any) => t.tier === selectedTier);
  const tierParticipants = selectedTierData?.participants || 0;
  const tierEndTime = selectedTierData?.endTime || 0;
  const tierIsExpired = tierEndTime > 0 && nowSeconds >= tierEndTime;
  const isReadyToClaim = tierIsExpired && tierParticipants > 0;
  const isDeadPool = tierIsExpired && tierParticipants === 0;

  // Auto-refresh the moment any tier's on-chain countdown hits 00:00.
  // Key = "tier:endTime" so every new round gets its own expiry trigger.
  const expiredTiersRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!lotteryData?.tiers) return;
    let triggered = false;
    for (const tier of lotteryData.tiers) {
      const key = `${tier.tier}:${tier.endTime}`;
      const isExpiredNow = tier.endTime > 0 && nowSeconds >= tier.endTime;
      if (isExpiredNow && !expiredTiersRef.current.has(key)) {
        expiredTiersRef.current.add(key);
        triggered = true;
      }
    }
    if (triggered) refresh();
  }, [nowSeconds, lotteryData, refresh]);

  // Pre-expiry on-chain clock sync: 30 s before any tier expires, force a fresh
  // Solana block-time fetch so the timeOffset is accurate at the exact moment
  // the UI flips from countdown to "DRAW READY".
  const preExpirySyncedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!lotteryData?.tiers) return;
    for (const tier of lotteryData.tiers) {
      if (tier.endTime <= 0) continue;
      const remaining = tier.endTime - nowSeconds;
      const key = `presync:${tier.tier}:${tier.endTime}`;
      if (remaining > 0 && remaining <= 30 && !preExpirySyncedRef.current.has(key)) {
        preExpirySyncedRef.current.add(key);
        getSolanaHeartbeat().forceSync();
      }
    }
  }, [nowSeconds, lotteryData]);

  const handleConnectWalletClick = () => window.dispatchEvent(new CustomEvent('open-sidebar'));

  const handleBuyTicket = async (tier: number) => {
    if (!connected) {
      toast.error('Please connect your wallet first.');
      return;
    }

    // Check if tier is expired with participants (ready for draw)
    const tierData = lotteryData?.tiers?.find((t: any) => t.tier === tier);
    const tierIsExpired = tierData?.endTime > 0 && nowSeconds >= tierData.endTime;
    const hasParticipants = (tierData?.participants ?? 0) > 0;

    if (tierIsExpired && hasParticipants) {
      toast.error('🏆 This tier is ready for draw! Trigger the draw to start a new round.');
      return;
    }

    setSelectedTier(tier);
    setIsBuyModalOpen(true);
  };

  const handleBuyTicketSubmit = async (tier: number, participantId: number, quantity: number = 1, onProgress?: (step: number, total: number, qty: number) => void) => {
    if (!connected || !publicKey) throw new Error('Wallet not connected');
    if (!program) {
      console.error('❌ Program not initialized:', { program, connected, publicKey: publicKey?.toString() });
      throw new Error('Program not initialized. Please wait a moment and try again.');
    }
    const result = await buyTicketWithProgram(program, 'WPL', tier, participantId, quantity, publicKey, onProgress, sendTransaction ?? undefined);

    // Trigger crank only if the tier is already expired at time of purchase
    const tierState = lotteryData?.tiers?.find((t: any) => t.tier === tier);
    if (tierState && tierState.endTime > 0 && nowSeconds >= tierState.endTime && (tierState.participants ?? 0) + quantity > 0) {
      settlementTrigger('WPL', tier, tierState.endTime);
    }

    return result;
  };

  // Auto-trigger house draw when time expires for any WPL tier (no wallet popup).
  // Retries up to 3× with 2 s pauses. If all fail, sets 'fallback_needed'.
  const houseTriggerFiredRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!lotteryData?.tiers) return;
    for (const tierData of lotteryData.tiers) {
      const t = tierData.tier;
      const expired = tierData.endTime > 0 && nowSeconds >= tierData.endTime;
      const hasParticipants = (tierData.participants ?? 0) > 0;
      const key = `${t}:${tierData.endTime}`;
      if (expired && hasParticipants && onChainReady && getPhase(t) === 'idle' && !houseTriggerFiredRef.current.has(key)) {
        houseTriggerFiredRef.current.add(key);
        triggerCrank('WPL', t); // dispatch GitHub crank immediately on expiry
        setLocalTxState(prev => ({ ...prev, [t]: 'house_triggering' }));
        (async () => {
          const MAX_ATTEMPTS = 3;
          let succeeded = false;
          let pendingDrawCreated = false; // true once request_draw_entropy confirmed a PendingDraw on-chain
          // Calls fulfill_draw_entropy server-side so the entire draw completes without any wallet popup.
          const doFulfill = async (): Promise<boolean> => {
            try {
              const fRes = await fetch('/api/draw/fulfill', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lottery_type: 'WPL', tier: t }) });
              const fData = await fRes.json();
              if (fData.success) {
                toast.success(`🏆 Draw complete! Winner: ${String(fData.winner ?? '').slice(0, 6)}…`, { duration: 6000 });
                setWinnerData({ wallet: fData.winner, tier: t, prize: ((fData.prize ?? 0) / 1_000_000) * 0.95, lotteryType: 'WPL' });
                setShowCelebration(true);
                return true;
              }
              if (fData.already_fulfilled) return true;
              console.warn(`[WPL] Fulfill: ${fData.error ?? 'unknown'} — fallback will activate`);
              return false;
            } catch (e) { console.error('[WPL] Fulfill error:', e); return false; }
          };
          for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
            try {
              const res = await fetch('/api/draw/request', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ lottery_type: 'WPL', tier: t }),
              });
              const data = await res.json();
              if (data.fallback_required) {
                console.warn(`[WPL] Crank balance too low on attempt ${attempt}/${MAX_ATTEMPTS} — will exhaust retries then show user fallback`);
              } else if (data.oracle_failed) {
                // request_draw_entropy succeeded — PendingDraw exists on-chain — but oracle commit/reveal failed.
                pendingDrawCreated = true;
                console.warn(`[WPL] Oracle failed on attempt ${attempt}/${MAX_ATTEMPTS} — kicking oracle directly`);
                try {
                  const orbRes = await fetch('/api/draw/oracle', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ lottery_type: 'WPL', tier: t }),
                  });
                  const orbData = await orbRes.json();
                  if (!orbData.fallback_required && !orbData.oracle_failed && orbRes.ok) {
                    succeeded = await doFulfill();
                    break;
                  }
                  if (orbData.fallback_required) {
                    console.warn(`[WPL] Oracle crank low on attempt ${attempt}/${MAX_ATTEMPTS} — will exhaust retries then show user fallback`);
                  }
                } catch (orbErr) {
                  console.error(`[WPL] Oracle kick failed on attempt ${attempt}/${MAX_ATTEMPTS}:`, orbErr);
                }
              } else if (data.success) {
                succeeded = await doFulfill();
                break;
              } else if (data.error?.includes('already in progress')) {
                if (!pendingDrawCreated) {
                  // Another user's draw in progress — attempt fulfill (polls oracle up to 30s).
                  await doFulfill();
                  succeeded = true; // oracle is running; even if fulfill times out, GitHub crank will complete it
                  break;
                }
                // We created the PendingDraw but oracle failed — kick oracle directly.
                console.warn(`[WPL] Retrying oracle for existing PendingDraw on attempt ${attempt}/${MAX_ATTEMPTS}`);
                try {
                  const orbRes = await fetch('/api/draw/oracle', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ lottery_type: 'WPL', tier: t }),
                  });
                  const orbData = await orbRes.json();
                  if (!orbData.fallback_required && !orbData.oracle_failed && orbRes.ok) {
                    succeeded = await doFulfill();
                    break;
                  }
                } catch (orbErr) {
                  console.error(`[WPL] Oracle retry kick failed on attempt ${attempt}/${MAX_ATTEMPTS}:`, orbErr);
                }
              } else {
                console.warn(`[WPL] House draw attempt ${attempt}/${MAX_ATTEMPTS} failed:`, data.error);
              }
            } catch (err) {
              console.error(`[WPL] House draw attempt ${attempt}/${MAX_ATTEMPTS} network error:`, err);
            }
            if (attempt < MAX_ATTEMPTS) await new Promise(r => setTimeout(r, 2000));
          }
          if (succeeded) {
            setLocalTxState(prev => ({ ...prev, [t]: null }));
            refresh();
          } else {
            console.warn('[WPL] All 3 draw attempts failed — user fallback required');
            setLocalTxState(prev => ({ ...prev, [t]: 'fallback_needed' }));
          }
        })();
      }
    }
  }, [lotteryData, nowSeconds, onChainReady]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-clear 'fallback_needed' only when the oracle has actually completed (oracle_ready).
  // Do NOT clear on 'requested' — that can mean a failed oracle left a stale PendingDraw on-chain,
  // and wiping fallback_needed would hide the manual trigger button the user needs.
  useEffect(() => {
    setLocalTxState(prev => {
      const next = { ...prev };
      let changed = false;
      for (const [tierStr, local] of Object.entries(next)) {
        if (local === 'fallback_needed' || local === 'step1_complete') {
          const t = Number(tierStr);
          if ((onChainPhase[t] ?? 'idle') === 'oracle_ready') { next[t] = null; changed = true; }
        }
      }
      return changed ? next : prev;
    });
  }, [onChainPhase]);

  // Manual draw step handler: detects current on-chain state and performs the next
  // incomplete step only. Each step persists on-chain across refreshes/devices.
  const handleDrawStep = async (tier: number) => {
    if (!connected || !publicKey || !sendTransaction || !program) {
      toast.error('Please connect your wallet first');
      return;
    }
    const id = `draw-step-${tier}`;
    try {
      const { Transaction, PublicKey: Pk } = await import('@solana/web3.js');

      const LOTTERY_TYPE_ID_VAL = 2; // WPL
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

        // Step 2a: Oracle Commit (crank partial-signs as authority, user pays fees)
        setLocalTxState(prev => ({ ...prev, [tier]: 'step2_processing' }));
        toast.loading('🔮 Preparing oracle commit…', { id });
        const commitRes = await fetch('/api/draw/oracle', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lottery_type: 'WPL', tier, user_pubkey: publicKey.toBase58(), mode: 'build' }),
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
        toast.loading('⏳ Oracle processing commit…', { id });
        await new Promise(r => setTimeout(r, 2500));
        toast.dismiss(id);

        // Step 2b: Oracle Reveal (crank partial-signs as authority, user pays oracle reward fee)
        toast.loading('🔮 Preparing oracle reveal…', { id });
        const revealRes = await fetch('/api/draw/oracle', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lottery_type: 'WPL', tier, user_pubkey: publicKey.toBase58(), mode: 'build_reveal' }),
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
        body: JSON.stringify({ lottery_type: 'WPL', tier, user_pubkey: publicKey.toBase58() }),
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

      // After Step 1, try oracle execute (crank-paid) silently.
      toast.loading('⏳ Requesting oracle to process draw…', { id });
      try {
        const kickRes = await fetch('/api/draw/oracle', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lottery_type: 'WPL', tier }),
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
    if (!program || !connected || !publicKey) { toast.error('Please connect your wallet first'); return; }
    setLocalTxState(prev => ({ ...prev, [tier]: 'settling' }));
    try {
      toast.loading('⚡ Settling draw & claiming reward…', { id: `draw-settle-${tier}` });
      const result = await fulfillDrawEntropy(program, 'WPL', tier, publicKey);
      toast.dismiss(`draw-settle-${tier}`);
      toast.success(`🏆 Draw settled! FPT bounty sent to your wallet! Tx: ${result.signature.slice(0, 8)}…`, { duration: 7000 });
      setWinnerData({ wallet: result.winner, tier, prize: result.prize, lotteryType: 'WPL' });
      setShowCelebration(true);
      refresh();
    } catch (error: any) {
      toast.dismiss(`draw-settle-${tier}`);
      const errorMsg: string = error.message || 'Unknown error settling draw';
      if (/user rejected|user cancelled|cancelled by user|transaction rejected/i.test(errorMsg)) {
        toast('Transaction cancelled', { icon: 'ℹ️', duration: 3000 });
      } else if (/oracle has not committed|oracle.*not.*ready|DrawNotYetReady/i.test(errorMsg)) {
        toast.error('⏳ Oracle not ready for this draw cycle yet — auto-kicking oracle. Please wait ~10 seconds and try again.', { duration: 8000 });
      } else {
        toast.error(errorMsg, { duration: 6000 });
      }
      refresh();
    } finally {
      setLocalTxState(prev => ({ ...prev, [tier]: null }));
    }
  };

  // Bundles lazyResetVault (Instruction A) + buy_ticket (Instruction B) into ONE transaction.
  // ONE wallet popup — skipPreflight: true prevents time-drift simulation reverts.
  const handleResetAndBuy = async (tier: number) => {
    if (!program || !connected || !publicKey) {
      toast.error('Please connect your wallet first');
      return;
    }

    setIsResettingByTier(prev => ({ ...prev, [tier]: true }));
    const clearResetting = () => setIsResettingByTier(prev => ({ ...prev, [tier]: false }));

    try {
      toast.loading('🔄 Buying Ticket...', { id: 'resetbuy' });
      const result = await buyTicketWithProgram(program, 'WPL', tier, Date.now(), 1, publicKey, undefined, sendTransaction);
      toast.dismiss('resetbuy');
      if (result.wasReset) {
        toast.success('🚀 Round reset & first ticket purchased — welcome to the new round!', { duration: 5000 });
      } else {
        toast.success('🎫 Ticket purchased successfully!', { duration: 4000 });
      }
      refresh();
    } catch (error: any) {
      toast.dismiss('resetbuy');
      const errorMsg = error.message || 'Unknown error';
      if (/user rejected|user cancelled|cancelled by user|transaction rejected/i.test(errorMsg)) {
        toast('Transaction cancelled', { icon: 'ℹ️', duration: 3000 });
      } else {
        toast.error(errorMsg, { duration: 6000 });
      }
    }
    clearResetting();
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-500/10 to-purple-500/10">
        <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} className="text-center">
          <div className="w-20 h-20 bg-gradient-to-br from-indigo-500 to-purple-500 rounded-full flex items-center justify-center mx-auto mb-4 animate-pulse">
            <Calendar className="w-10 h-10 text-white" />
          </div>
          <div className={`text-2xl font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Loading Weekly Pool...</div>
        </motion.div>
      </div>
    );
  }

  const tierPrizePool = selectedTierData?.prizePool || 0;
  const totalParticipants = lotteryData?.tiers?.reduce((sum: number, tier: any) => sum + tier.participants, 0) || 0;
  const totalPrizePool = lotteryData?.tiers?.reduce((sum: number, tier: any) => sum + tier.prizePool, 0) || 0;

  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <section className="relative overflow-hidden py-16 px-4 sm:px-8">
        <div className="absolute top-20 right-20 w-72 h-72 bg-indigo-500/15 rounded-full blur-[120px]" />
        <div className="absolute bottom-20 left-20 w-96 h-96 bg-purple-500/15 rounded-full blur-[120px]" />
        
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
              <div
                className="w-24 h-24 bg-gradient-to-br from-indigo-500 to-purple-500 rounded-2xl flex items-center justify-center shadow-2xl shadow-purple-500/25"
              >
                <Calendar className="w-12 h-12 text-white" />
              </div>
            </motion.div>
            
            <h1 className={`text-5xl md:text-7xl font-black mb-4 ${isDarkMode ? 'bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent' : 'bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent'}`}>
              📆 Weekly Pool
            </h1>
            <p className={`text-2xl md:text-3xl mb-4 ${isDarkMode ? 'text-indigo-300' : 'text-indigo-700'}`}>
              Perfect Weekly Rhythm • Consistent Wins Every 7 Days
            </p>
            <p className={`text-lg max-w-3xl mx-auto ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>
              Strike the perfect balance! Weekly draws give you time to participate while maintaining regular excitement and opportunities.
            </p>
          </div>

          {/* Live Stats Card */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className={`max-w-4xl mx-auto rounded-3xl p-8 shadow-2xl ${
              isDarkMode ? 'bg-black/40 backdrop-blur-xl border border-indigo-500/20' : 'bg-white/80 backdrop-blur-xl'
            }`}
          >
            {/* Tier Selection */}
            <div className="flex justify-center gap-2 mb-6 flex-wrap">
              {[5, 10, 15, 20].map((tier) => (
                <button
                  key={tier}
                  onClick={() => setSelectedTier(tier)}
                  className={`px-6 py-2 rounded-xl font-bold transition-all duration-300 ${
                    selectedTier === tier
                      ? 'bg-gradient-to-r from-indigo-500 to-purple-500 text-white shadow-lg scale-105'
                      : isDarkMode
                      ? 'bg-white/10 text-gray-300 hover:bg-white/20'
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                >
                  ${tier}
                </button>
              ))}
            </div>

            <div className="grid md:grid-cols-4 gap-6 mb-6 relative">
              <div className="text-center">
                <div className="text-5xl font-bold mb-2 text-indigo-500">{tierParticipants}</div>
                <div className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>Tier ${selectedTier} Entries</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold mb-1 tabular-nums text-green-400">
                  {fptUsd > 0 ? `$${(tierPrizePool * fptUsd).toFixed(2)}` : '...'}
                </div>
                <div className="text-xs text-green-400 font-semibold mb-1">USD</div>
                <div className="text-xs text-indigo-400/70 mb-1 tabular-nums">
                  {Number(tierPrizePool).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} FPT
                </div>
                <div className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>Tier ${selectedTier} Prize Pool</div>
              </div>
              <div className="text-center">
                <div className={`text-3xl font-bold mb-2 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{totalParticipants}</div>
                <div className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>Total All Tiers</div>
              </div>
              <div className="text-center">
                <div className={`text-3xl font-bold mb-2 text-cyan-400`}>{selectedTierData?.roundNumber ?? 0}</div>
                <div className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>Current Round</div>
              </div>
              

            </div>
            {(() => {
              return (
                <>
                  <div className={`mt-6 p-4 rounded-xl ${isDarkMode ? 'bg-indigo-500/10 border border-indigo-500/20' : 'bg-indigo-50'}`}>
                    <motion.div
                      animate={isDeadPool || tierEndTime === 0 ? {} : { x: [0, 10, 0] }}
                      transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                      className={`text-center mb-2 ${isDarkMode ? 'text-indigo-300' : 'text-indigo-600'}`}
                    >
                      <span className="text-sm font-semibold">
                        {isDeadPool || tierEndTime === 0
                          ? '⏸️ Awaiting New Round'
                          : tierIsExpired
                          ? '🎯 Draw Ready!'
                          : '⏰ Time Left Until Draw'}
                      </span>
                    </motion.div>
                    <CountdownTimer targetTimestamp={isDeadPool || tierEndTime === 0 ? 0 : selectedTierData?.endTime} className="justify-center" isSyncing={isSyncingFromStore} />
                  </div>

                  {isReadyToClaim && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="mt-4"
                    >
                      <DrawStepTracker
                        phase={getPhase(selectedTier)}
                        onChainPhase={onChainPhase[selectedTier] ?? 'idle'}
                        onManualTrigger={() => handleDrawStep(selectedTier)}
                        onFinalize={() => handleSettle(selectedTier)}
                        connected={connected}
                        onConnect={handleConnectWalletClick}
                      />
                    </motion.div>
                  )}

                  {isDeadPool && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ duration: 0.3 }}
                      className="mt-4"
                    >
                      <div className="mb-3 px-4 py-3 bg-gradient-to-r from-green-500/20 to-emerald-500/20 border border-green-400/60 rounded-xl text-center">
                        <div className="text-base font-bold text-green-300">🎉 Welcome</div>
                        <div className="text-xs text-green-400/70 mt-0.5">Be the first to start a new round!</div>
                      </div>
                      <motion.button
                        animate={{
                          boxShadow: [
                            "0 0 20px rgba(34, 197, 94, 0.5)",
                            "0 0 50px rgba(34, 197, 94, 0.9)",
                            "0 0 20px rgba(34, 197, 94, 0.5)",
                          ],
                          scale: [1, 1.03, 1],
                        }}
                        transition={{ duration: 1.5, repeat: Infinity }}
                        onClick={() => handleResetAndBuy(selectedTier)}
                        disabled={isResettingByTier[selectedTier] || !connected}
                        className={`w-full py-4 rounded-xl font-black text-lg shadow-xl transition-all ${
                          isResettingByTier[selectedTier]
                            ? 'bg-gray-500 text-white cursor-not-allowed'
                            : 'bg-gradient-to-r from-green-400 via-emerald-400 to-green-400 text-gray-900 cursor-pointer hover:from-green-500 hover:to-emerald-500'
                        }`}
                      >
                        {isResettingByTier[selectedTier] ? '🔄 Buying Ticket...' : '🎟️ Buy Ticket'}
                      </motion.button>
                    </motion.div>
                  )}

                  {tierIsExpired && tierParticipants === 0 && !connected && (
                    <div className={`mt-4 text-center text-sm py-3 rounded-xl ${
                      isDarkMode ? 'bg-white/5 text-gray-400' : 'bg-gray-100 text-gray-500'
                    }`}>
                      ℹ️ Connect your wallet to start a new round
                    </div>
                  )}
                </>
              );
            })()}

          </motion.div>
        </motion.div>
      </section>

      {/* Features */}
      <section className="py-12 px-4 sm:px-8">
        <div className="max-w-7xl mx-auto grid md:grid-cols-3 gap-6 mb-12">
          {[
            { icon: Clock, title: "7-Day Cycles", description: "208 draws per year — perfect balance between daily and monthly.", color: "from-indigo-500 to-purple-500" },
            { icon: Shield, title: "Reliable Schedule", description: `Auto-triggered by the house crank. Once SB VRF commits, anyone can finalize and earn FPT. Winner receives ${PRIZE_WINNER_PCT}%.`, color: "from-purple-500 to-indigo-600" },
            { icon: TrendingUp, title: "Growing Pools", description: "Week-long accumulation creates substantial prize pools across all tiers.", color: "from-indigo-400 to-purple-400" }
          ].map((feature, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
              className={`p-6 rounded-2xl text-center ${isDarkMode ? 'bg-white/[0.03] backdrop-blur-md border border-white/10' : 'bg-white shadow-md border border-gray-100'}`}
            >
              <div className={`w-14 h-14 bg-gradient-to-br ${feature.color} rounded-xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-purple-500/20`}>
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
              Join This Week's Draw
            </h2>
            <p className={`text-lg ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
              Enter any time this week — $5 · $10 · $15 · $20
            </p>
            <p className={`text-sm mt-2 ${isDarkMode ? 'text-indigo-400/70' : 'text-indigo-500/80'}`}>
              Each tier's countdown begins the moment its first ticket is purchased.
            </p>
          </motion.div>

          <div className="relative mb-12">
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {(lotteryData?.tiers ?? []).map((tier: any, index: number) => (
              <motion.div
                key={tier.tier}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
                whileHover={{ scale: 1.05, y: -5 }}
                className={`relative overflow-hidden rounded-2xl p-6 shadow-xl transition-all duration-300 ${
                  isDarkMode ? 'bg-white/[0.03] backdrop-blur-md' : 'bg-white shadow-md'
                } ${
                  tier.endTime > 0 && nowSeconds >= tier.endTime
                    ? 'border-2 border-amber-400/80 shadow-[0_0_28px_rgba(251,191,36,0.22)]'
                    : isDarkMode ? 'border border-white/10' : 'border border-gray-100'
                }`}
              >
                <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 rounded-full blur-2xl" />
                {tier.endTime > 0 && nowSeconds >= tier.endTime && tier.participants > 0 && (
                  <>
                    <div className="absolute top-2 right-2 bg-gradient-to-r from-amber-400 to-yellow-400 text-gray-900 text-xs px-2 py-1 rounded-full font-black animate-bounce">
                      🏆 BOUNTY!
                    </div>
                    <div className="absolute top-0 left-0 bg-gradient-to-r from-amber-500 to-yellow-500 text-gray-900 text-[10px] px-3 py-0.5 font-black shadow-lg rounded-br-xl">
                      REWARD AVAILABLE
                    </div>
                  </>
                )}
                <div className="relative text-center">
                  {/* ── Per-tier countdown banner pinned to top of card ── */}
                  <div className={`-mx-6 -mt-6 mb-4 px-4 py-2 flex items-center justify-center rounded-t-2xl text-xs font-mono font-bold tabular-nums ${
                    tier.endTime === 0
                      ? isDarkMode ? 'bg-indigo-500/5 text-gray-500' : 'bg-gray-50 text-gray-400'
                      : nowSeconds >= tier.endTime && tier.participants === 0
                      ? isDarkMode ? 'bg-gray-500/10 text-gray-500' : 'bg-gray-50 text-gray-400'
                      : nowSeconds >= tier.endTime
                      ? 'bg-amber-500/15 text-amber-300 animate-pulse'
                      : isDarkMode ? 'bg-indigo-500/10 text-indigo-300' : 'bg-indigo-50 text-indigo-600'
                  }`}>
                    {tier.endTime === 0
                      ? '⏳ --:--:--'
                      : nowSeconds >= tier.endTime && tier.participants === 0
                      ? '⏸ 00:00:00'
                      : nowSeconds >= tier.endTime
                      ? '\uD83C\uDFC6 Draw Ready!'
                      : (() => {
                          const s = tier.endTime - nowSeconds;
                          const d = Math.floor(s / 86400);
                          const h = Math.floor((s % 86400) / 3600);
                          const m = Math.floor((s % 3600) / 60);
                          const sec = s % 60;
                          return d > 0
                            ? `\u23F0 ${d}d ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
                            : `\u23F0 ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
                        })()
                    }
                  </div>
                  <div className="text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-indigo-500 to-purple-500 mb-1">
                    ${tier.tier}
                  </div>
                  <div className="text-xs font-medium text-cyan-400/80 mb-1">
                    {priceLoading ? "..." : fmtFptTier(tier.tier)}
                  </div>
                  <div className={`text-sm mb-4 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>Ticket Price</div>
                  
                  <div className="space-y-3 mb-6">
                    <div>
                      <div className={`text-3xl font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{tier.participants}</div>
                      <div className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>Total Entries</div>
                    </div>
                    <div>
                      <div className="font-bold tabular-nums leading-tight text-green-400" style={{ fontSize: '0.9rem' }}>{fptUsd > 0 ? `$${(tier.prizePool * fptUsd).toFixed(2)}` : '...'}</div>
                      <div className="text-xs text-indigo-400/70 tabular-nums">{Number(tier.prizePool).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} FPT</div>
                      <div className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>Current Pool</div>
                    </div>
                  </div>

                  {tier.endTime > 0 && nowSeconds >= tier.endTime ? (
                    tier.participants > 0 ? (
                      connected ? (
                        <DrawStepTracker
                          phase={getPhase(tier.tier)}
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
                          className="w-4/5 mx-auto block py-3 px-4 rounded-xl font-bold transition-all duration-300 transform bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 text-white shadow-lg hover:shadow-xl hover:scale-105"
                        >
                          🔒 Connect Wallet
                        </button>
                      )
                      ) : (
                          <button
                            onClick={() => connected ? handleResetAndBuy(tier.tier) : handleConnectWalletClick()}
                            disabled={isResettingByTier[tier.tier]}
                            className={`w-4/5 mx-auto block py-3 px-4 rounded-xl font-bold transition-all duration-300 transform ${
                              !isResettingByTier[tier.tier]
                                ? 'bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 text-white shadow-lg hover:shadow-xl hover:scale-105'
                                : 'bg-gray-600 text-gray-400 cursor-not-allowed'
                            }`}
                          >
                            {isResettingByTier[tier.tier] ? '🔄 Buying Ticket...' : connected ? '🎟️ Buy Ticket' : '🔒 Connect Wallet'}
                          </button>
                      )
                  ) : (
                  <button
                    onClick={() => connected ? handleBuyTicket(tier.tier) : handleConnectWalletClick()}
                    className={`w-4/5 mx-auto block py-3 px-4 rounded-xl font-bold transition-all duration-300 transform bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 text-white shadow-lg hover:shadow-xl hover:scale-105`}
                  >
                    {!connected ? '🔒 Connect Wallet' : '🎟️ Buy Ticket'}
                  </button>
                  )}
                </div>
              </motion.div>
            ))}
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
        onClose={() => {
          setIsBuyModalOpen(false);
          refresh();
        }}
        lotteryType="WPL"
        ticketPrice={selectedTier}
        initialTier={selectedTier}
        tierData={lotteryData?.tiers}
        currentParticipants={totalParticipants}
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
          refresh();
        }}
      />
    </div>
  );
};

export default WPLPage;
