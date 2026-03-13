'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { Check, Loader2, Crown, RefreshCw } from 'lucide-react';

type StepState = 'pending' | 'processing' | 'signed';

interface DrawStepTrackerProps {
  /** Effective phase from getPhase() */
  phase: string;
  /** Raw on-chain phase from usePendingDraw */
  onChainPhase: string;
  /** Called when user needs to trigger step 1 or step 2 manually */
  onManualTrigger: () => void;
  /** Called when user clicks Finalize (step 3) */
  onFinalize: () => void;
  /** Wallet connected */
  connected: boolean;
  /** Connect wallet callback */
  onConnect: () => void;
  /** Compact mode for tier cards */
  compact?: boolean;
}

function deriveSteps(phase: string, onChainPhase: string): [StepState, StepState, StepState] {
  switch (phase) {
    case 'oracle_ready':
      return ['signed', 'signed', 'pending'];
    case 'settling':
      return ['signed', 'signed', 'processing'];
    case 'requested':
      return ['signed', 'processing', 'pending'];
    case 'step1_complete':
      return ['signed', 'pending', 'pending'];
    case 'step2_processing':
      return ['signed', 'processing', 'pending'];
    case 'house_triggering':
    case 'requesting':
      return ['processing', 'pending', 'pending'];
    case 'fallback_needed':
      if (onChainPhase === 'oracle_ready') return ['signed', 'signed', 'pending'];
      if (onChainPhase === 'requested') return ['signed', 'pending', 'pending'];
      return ['pending', 'pending', 'pending'];
    default:
      return ['pending', 'pending', 'pending'];
  }
}

const STEP_META = [
  { num: 1, label: 'Draw Requested', signed: 'Signed on-chain', processing: 'Processing…' },
  { num: 2, label: 'Oracle Revealed', signed: 'Randomness on-chain', processing: 'Oracle processing…' },
  { num: 3, label: 'Finalize Draw', signed: 'Complete', processing: 'Settling…' },
];

function StepIcon({ state }: { state: StepState; num: number }) {
  if (state === 'signed') return (
    <div className="w-7 h-7 rounded-full bg-green-500 flex items-center justify-center shrink-0">
      <Check className="w-4 h-4 text-white" strokeWidth={3} />
    </div>
  );
  if (state === 'processing') return (
    <div className="w-7 h-7 rounded-full bg-amber-500 flex items-center justify-center shrink-0 animate-pulse">
      <Loader2 className="w-4 h-4 text-white animate-spin" />
    </div>
  );
  return (
    <div className="w-7 h-7 rounded-full border-2 border-gray-500 flex items-center justify-center shrink-0">
      <div className="w-2 h-2 rounded-full bg-gray-500" />
    </div>
  );
}

export default function DrawStepTracker({
  phase,
  onChainPhase,
  onManualTrigger,
  onFinalize,
  connected,
  onConnect,
  compact = false,
}: DrawStepTrackerProps) {
  const [s1, s2, s3] = deriveSteps(phase, onChainPhase);
  const steps: StepState[] = [s1, s2, s3];

  // Determine the single action button to show
  let actionLabel = '';
  let actionCallback: (() => void) | null = null;
  let actionDisabled = false;
  let actionType: 'trigger' | 'finalize' | 'processing' | 'none' = 'none';

  if (s3 === 'processing') {
    actionType = 'processing';
    actionLabel = 'Settling…';
    actionDisabled = true;
  } else if (s1 === 'processing') {
    actionType = 'processing';
    actionLabel = phase === 'house_triggering' ? 'House Triggering…' : 'Processing draw request…';
    actionDisabled = true;
  } else if (s2 === 'processing') {
    actionType = 'processing';
    actionLabel = 'Oracle processing…';
    actionDisabled = true;
  } else if (s1 === 'pending' && (phase === 'fallback_needed' || phase === 'idle')) {
    if (phase === 'fallback_needed') {
      actionType = 'trigger';
      actionLabel = connected ? '🔧 Fallback Trigger (Step 1)' : '🔒 Connect Wallet';
      actionCallback = connected ? onManualTrigger : onConnect;
    }
    // idle: auto-trigger will fire — no manual button
  } else if (s1 === 'signed' && s2 === 'pending') {
    actionType = 'trigger';
    actionLabel = connected ? '🔮 Complete Oracle Reveal (Step 2)' : '🔒 Connect Wallet';
    actionCallback = connected ? onManualTrigger : onConnect;
  } else if (s1 === 'signed' && s2 === 'signed' && s3 === 'pending') {
    actionType = 'finalize';
    actionLabel = connected ? '🏆 Claim FPT Bounty & Finalize Draw' : '🔒 Connect Wallet to Claim';
    actionCallback = connected ? onFinalize : onConnect;
  }

  // ── Compact version for tier cards ──
  if (compact) {
    return (
      <div className="space-y-1">
        <div className="flex items-center justify-center gap-1">
          {steps.map((state, i) => (
            <React.Fragment key={i}>
              <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${
                state === 'signed' ? 'bg-green-500' :
                state === 'processing' ? 'bg-amber-500 animate-pulse' :
                'border border-gray-500'
              }`}>
                {state === 'signed' ? <Check className="w-3 h-3 text-white" strokeWidth={3} /> :
                 state === 'processing' ? <Loader2 className="w-3 h-3 text-white animate-spin" /> :
                 <div className="w-1.5 h-1.5 rounded-full bg-gray-500" />}
              </div>
              {i < 2 && (
                <div className={`w-3 h-0.5 ${
                  steps[i] === 'signed' && steps[i + 1] !== 'pending' ? 'bg-green-500'
                  : steps[i] === 'signed' ? 'bg-amber-500/50'
                  : 'bg-gray-600'
                }`} />
              )}
            </React.Fragment>
          ))}
        </div>
        {actionType !== 'none' && (
          <motion.button
            animate={actionType === 'finalize' && connected ? {
              boxShadow: ["0 0 10px rgba(74,222,128,0.4)", "0 0 24px rgba(74,222,128,0.7)", "0 0 10px rgba(74,222,128,0.4)"],
              scale: [1, 1.02, 1],
            } : actionType === 'trigger' && connected ? {
              boxShadow: ["0 0 10px rgba(251,146,60,0.4)", "0 0 24px rgba(251,146,60,0.7)", "0 0 10px rgba(251,146,60,0.4)"],
              scale: [1, 1.02, 1],
            } : {}}
            transition={{ duration: 1.5, repeat: Infinity }}
            onClick={actionCallback ?? undefined}
            disabled={actionDisabled}
            className={`w-full py-2 px-3 rounded-xl font-bold text-sm transition-all duration-300 ${
              actionDisabled
                ? 'bg-gray-600 text-gray-400 cursor-not-allowed opacity-60'
                : actionType === 'finalize' && connected
                ? 'bg-gradient-to-r from-green-400 via-emerald-300 to-green-400 text-gray-900 cursor-pointer'
                : actionType === 'trigger' && connected
                ? 'bg-gradient-to-r from-orange-400 via-amber-300 to-orange-400 text-gray-900 cursor-pointer'
                : 'bg-gradient-to-r from-gray-400/60 via-gray-300/60 to-gray-400/60 text-gray-900 cursor-pointer'
            }`}
          >
            {actionDisabled ? (
              <span className="flex items-center justify-center gap-1.5">
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                {actionLabel}
              </span>
            ) : actionType === 'finalize' ? (
              <span className="flex items-center justify-center gap-1.5">
                <Crown className="w-3.5 h-3.5" />
                {actionLabel}
              </span>
            ) : actionLabel}
          </motion.button>
        )}
      </div>
    );
  }

  // ── Full version for hero section ──
  return (
    <div className="space-y-3">
      <div className="px-4 py-3 bg-gradient-to-r from-amber-500/20 to-yellow-500/20 border border-amber-400/60 rounded-xl">
        <div className="space-y-2.5">
          {STEP_META.map((meta, i) => {
            const state = steps[i];
            return (
              <div key={i} className="flex items-center gap-3">
                <StepIcon state={state} num={meta.num} />
                <div className="flex-1 min-w-0">
                  <div className={`text-sm font-bold ${
                    state === 'signed' ? 'text-green-300' :
                    state === 'processing' ? 'text-amber-300' : 'text-gray-400'
                  }`}>
                    {meta.label}
                  </div>
                  {state === 'signed' && (
                    <div className="text-xs text-green-400/70">{meta.signed}</div>
                  )}
                  {state === 'processing' && (
                    <div className="text-xs text-amber-400/70">{meta.processing}</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {actionType !== 'none' && (
        <motion.button
          animate={actionType === 'finalize' && connected ? {
            boxShadow: ["0 0 20px rgba(74,222,128,0.5)", "0 0 50px rgba(74,222,128,0.9)", "0 0 20px rgba(74,222,128,0.5)"],
            scale: [1, 1.03, 1],
          } : actionType === 'trigger' && connected ? {
            boxShadow: ["0 0 20px rgba(251,146,60,0.5)", "0 0 50px rgba(251,146,60,0.9)", "0 0 20px rgba(251,146,60,0.5)"],
            scale: [1, 1.03, 1],
          } : {}}
          transition={{ duration: 1.5, repeat: Infinity }}
          onClick={actionCallback ?? undefined}
          disabled={actionDisabled}
          className={`w-full py-4 px-6 rounded-xl font-black text-lg transition-all duration-300 ${
            actionDisabled
              ? 'bg-gray-600 text-gray-400 cursor-not-allowed opacity-60'
              : actionType === 'finalize' && connected
              ? 'bg-gradient-to-r from-green-400 via-emerald-300 to-green-400 text-gray-900 cursor-pointer'
              : actionType === 'trigger' && connected
              ? 'bg-gradient-to-r from-orange-400 via-amber-300 to-orange-400 text-gray-900 cursor-pointer'
              : !connected
              ? 'bg-gradient-to-r from-green-400/60 via-emerald-300/60 to-green-400/60 text-gray-900 cursor-pointer'
              : 'bg-gray-600 text-gray-400 cursor-not-allowed opacity-60'
          }`}
        >
          {actionDisabled ? (
            <span className="flex items-center justify-center gap-2">
              <RefreshCw className="w-5 h-5 animate-spin" />
              {actionLabel}
            </span>
          ) : actionType === 'finalize' ? (
            <span className="flex items-center justify-center gap-2">
              <Crown className="w-5 h-5" />
              {actionLabel}
            </span>
          ) : actionLabel}
        </motion.button>
      )}

      {!connected && s1 === 'signed' && s2 === 'signed' && (
        <p className="text-xs text-amber-400 text-center">Connect wallet to claim FPT bounty</p>
      )}

      <a
        href="/transparency"
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center justify-center gap-1 text-xs text-cyan-400 hover:text-cyan-300 transition-colors"
      >
        🔍 How does the provably-fair draw work?
      </a>
    </div>
  );
}
