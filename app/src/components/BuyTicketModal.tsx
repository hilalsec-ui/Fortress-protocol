import React, { useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { PublicKey } from '@solana/web3.js';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Ticket, DollarSign, Users, Coins } from 'lucide-react';
import toast from 'react-hot-toast';
import TransactionSuccess from './TransactionSuccess';
import { useWalletBalance } from '../hooks/useWalletBalance';
import { useFptPrice } from '@/contexts/FptPriceContext';
import { Program } from '@coral-xyz/anchor';
import { FPT_MINT, FPT_TOKEN_ICON } from '../utils/constants';

interface BuyTicketModalProps {
  isOpen: boolean;
  onClose: () => void;
  lotteryType: string;
  ticketPrice: number;
  initialTier?: number; // Initial tier to pre-select
  maxParticipants?: number; // Optional - only for LPM (capacity-based)
  currentParticipants: number;
  tierData?: Array<{ tier: number; participants: number; prizePool: number }>; // Per-tier data
  isContractReady?: boolean; // Whether the contract is ready (program loaded)
  program?: Program | null; // Anchor program instance for pricing
  onBuyTicket: (
    tier: number,
    participantId: number,
    quantity?: number,
    onProgress?: (step: number, total: number, qty: number) => void,
  ) => Promise<{
    transactionSignature: string;
    tier: number;
    participantId: number;
    quantity?: number;
  }>;
}

const BuyTicketModal: React.FC<BuyTicketModalProps> = ({
  isOpen,
  onClose,
  lotteryType,
  ticketPrice,
  initialTier = 5, // Default to 5 if not provided
  maxParticipants,
  currentParticipants,
  tierData,
  isContractReady = true,
  program = null,
  onBuyTicket,
}) => {
  const { connected, publicKey } = useWallet();
  const { refreshBalance } = useWalletBalance();
  const { fptPerUsd6dec, solUsd, fptMarketUsd, isLoading: pricingLoading } = useFptPrice();
  // fptPerUsd6dec = FPT per USD in 6-decimal units (e.g. 500_000 = 0.5 FPT per $)
  const exchangeRateHuman = fptPerUsd6dec > 0 ? fptPerUsd6dec / 1_000_000 : null;
  const calculateFptCost = (tier: number, qty: number): string =>
    fptPerUsd6dec > 0
      ? (Math.round(tier * fptPerUsd6dec * qty) / 1_000_000).toFixed(6)
      : '0.000000';
  const pricingError = null;
  const [selectedTier, setSelectedTier] = useState<number>(initialTier);
  const [quantity, setQuantity] = useState<number>(1); // NEW: Quantity state
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string>('');

  const [transactionResult, setTransactionResult] = useState<{
    transactionSignature: string;
    tier: number;
    participantId: number;
    quantity?: number; // NEW: Include quantity in result
  } | null>(null);

  // Update selectedTier when initialTier changes (when modal opens with new tier)
  React.useEffect(() => {
    if (isOpen) {
      setSelectedTier(initialTier);
      setQuantity(1); // NEW: Reset quantity when modal opens
    }
  }, [isOpen, initialTier]);

  // Per-tier remaining capacity: LPM capped at 100, timed lotteries allow up to 100 per TX
  const tierParticipants = tierData?.find((t) => t.tier === selectedTier)?.participants ?? currentParticipants;
  const maxAllowed = lotteryType === 'LPM'
    ? Math.max(1, (maxParticipants || 100) - tierParticipants)
    : 100;

  // Different tiers for LPM vs other lotteries with dynamic FPT pricing
  const tiers = lotteryType === 'LPM' 
    ? [
        { value: 5,  fpt: parseFloat(calculateFptCost(5,  1) || '0'), color: 'from-red-500 to-red-600' },
        { value: 10, fpt: parseFloat(calculateFptCost(10, 1) || '0'), color: 'from-orange-500 to-orange-600' },
        { value: 20, fpt: parseFloat(calculateFptCost(20, 1) || '0'), color: 'from-yellow-500 to-yellow-600' },
        { value: 50, fpt: parseFloat(calculateFptCost(50, 1) || '0'), color: 'from-green-500 to-green-600' },
      ]
    : [
        { value: 5,  fpt: parseFloat(calculateFptCost(5,  1) || '0'), color: 'from-red-500 to-red-600' },
        { value: 10, fpt: parseFloat(calculateFptCost(10, 1) || '0'), color: 'from-orange-500 to-orange-600' },
        { value: 15, fpt: parseFloat(calculateFptCost(15, 1) || '0'), color: 'from-yellow-500 to-yellow-600' },
        { value: 20, fpt: parseFloat(calculateFptCost(20, 1) || '0'), color: 'from-green-500 to-green-600' },
      ];

  const handleConnectWallet = () => {
    toast.error('Please connect your wallet first using the menu.');
  };

  const handleBuyTicket = async () => {

    if (!connected || !publicKey) {
      console.error('❌ Wallet not connected');
      toast.error('Please connect your wallet first');
      return;
    }

    if (!isContractReady || !program) {
      console.error('❌ Program not ready');
      toast.error('Contract is initializing. Please wait a moment and try again.');
      return;
    }

    if (quantity < 1 || quantity > maxAllowed) {
      toast.error(`Quantity must be between 1 and ${maxAllowed} ticket${maxAllowed !== 1 ? 's' : ''}`);
      return;
    }

    const totalCost = Number(calculateFptCost(selectedTier, quantity) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 });

    setIsLoading(true);
    setError('');

    const PROGRESS_TOAST = 'buy-tx-progress';

    try {
      const participantId = Date.now();

      const onProgress = (step: number, total: number, qty: number) => {
        if (total > 1) {
          toast.loading(
            `Wallet approval ${step} of ${total} — approve ${qty} ticket${qty !== 1 ? 's' : ''} in your wallet`,
            { id: PROGRESS_TOAST },
          );
        }
      };

      const result = await onBuyTicket(selectedTier, participantId, quantity, onProgress);
      toast.dismiss(PROGRESS_TOAST);


      setTransactionResult(result);
      refreshBalance(3000);
      toast.success(`✅ ${quantity} ticket(s) purchased! ${totalCost} FPT paid`);

      setTimeout(() => onClose(), 500);
    } catch (err) {
      toast.dismiss(PROGRESS_TOAST);
      console.error('❌ Purchase failed:', err);
      console.error('Error type:', typeof err);
      console.error('Error constructor:', err?.constructor?.name);
      console.error('Error stack:', err instanceof Error ? err.stack : 'N/A');

      let errorMessage = 'Failed to buy ticket';

      if (err instanceof Error) {
        errorMessage = err.message;
      } else if (typeof err === 'string') {
        errorMessage = err;
      } else if (err && typeof err === 'object') {
        errorMessage = JSON.stringify(err);
      }

      // If simulation failed, show FPT amount and possible causes
      if (errorMessage.toLowerCase().includes('simulation') || errorMessage.toLowerCase().includes('revert')) {
        errorMessage = `Transaction simulation failed.\n\nYou were about to pay ${totalCost} FPT for ${quantity} ticket(s).\n\nPossible causes:\n- Insufficient FPT balance\n- Insufficient SOL for fees or priority tip\n- FPT token account missing\n- Vault not initialized\n- Network congestion`;
      }

      console.error('Final error message:', errorMessage);
      setError(errorMessage);
      toast.error(`❌ ${errorMessage}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCloseSuccess = () => {
    setTransactionResult(null);
  };

  const progress = (currentParticipants / (maxParticipants || 100)) * 100;

  return (
    <>
      {/* Main Buy Ticket Modal */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-2 sm:p-4 overflow-auto"
            onClick={onClose}
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-lg rounded-2xl px-3 py-[11px] sm:px-4 sm:py-[14px] w-full min-w-[280px] max-w-[90vw] sm:max-w-sm mx-auto border border-white/20 max-h-[85vh] overflow-y-auto flex-shrink-0"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full flex items-center justify-center">
                    <Ticket className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-white">Buy Ticket</h2>
                    <p className="text-sm text-gray-300">{lotteryType}</p>
                  </div>
                </div>
                <button
                  onClick={onClose}
                  className="p-2 hover:bg-white/10 rounded-full transition-colors"
                >
                  <X className="w-5 h-5 text-gray-400" />
                </button>
              </div>

              {/* Lottery Status */}
              {lotteryType === 'LPM' && tierData ? (
                <div className="bg-black/30 rounded-lg p-3 mb-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-gray-300">Participants (Tier ${selectedTier})</span>
                    <span className="text-sm font-medium text-white">
                      {tierData?.find(t => t.tier === selectedTier)?.participants || 0} / {maxParticipants || 100}
                    </span>
                  </div>
                  <div className="w-full bg-gray-700 rounded-full h-2 overflow-hidden">
                    <motion.div
                      key={`progress-${selectedTier}`}
                      initial={{ width: 0 }}
                      animate={{ 
                        width: `${(() => {
                          const tierParticipants = tierData?.find(t => t.tier === selectedTier)?.participants || 0;
                          return Math.min((tierParticipants / (maxParticipants || 100)) * 100, 100);
                        })()}%` 
                      }}
                      transition={{ duration: 0.5 }}
                      className="h-full bg-gradient-to-r from-blue-500 to-purple-500"
                    />
                  </div>
                </div>
              ) : tierData ? (
                <div className="bg-black/30 rounded-lg p-3 mb-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-300">Total Participants of Tier ${selectedTier}</span>
                    <span className="text-2xl font-bold text-white">
                      {tierData?.find(t => t.tier === selectedTier)?.participants || 0}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="relative bg-gradient-to-br from-blue-500/10 to-purple-500/10 rounded-2xl p-4 mb-3 border border-blue-400/30 shadow-2xl overflow-hidden">
                  <div className="absolute inset-0 bg-gradient-to-r from-blue-500/5 to-purple-500/5 animate-pulse" />
                  <div className="relative">
                    <div className="text-center mb-3">
                      <span className="text-xs uppercase tracking-widest text-gray-400 font-semibold">Participants</span>
                    </div>
                    <div className="flex items-center justify-center">
                      <div className="relative">
                        <div className="absolute inset-0 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-xl blur-lg opacity-50" />
                        <div className="relative bg-gradient-to-br from-gray-900 to-gray-800 rounded-xl px-5 py-3 border-2 border-blue-400/40 shadow-xl transform hover:scale-105 transition-transform">
                          <span className="text-5xl font-black bg-gradient-to-br from-blue-400 via-cyan-300 to-blue-500 bg-clip-text text-transparent">
                            {currentParticipants}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Tier Selection */}
              <div className="mb-4">
                <label id="tier-selection-label" className="block text-sm font-medium text-gray-300 mb-2">
                  Select Tier
                </label>
                <div className="grid grid-cols-2 gap-2" role="group" aria-labelledby="tier-selection-label">
                  {tiers.map((tier) => (
                    <button
                      key={tier.value}
                      onClick={() => setSelectedTier(tier.value)}
                      className={`p-2 rounded-lg border-2 transition-all ${
                        selectedTier === tier.value
                          ? `border-transparent bg-gradient-to-r ${tier.color} text-white shadow-lg`
                          : 'border-gray-600 text-gray-300 hover:border-gray-400 hover:bg-white/5'
                      }`}
                    >
                      <div className="flex flex-col items-center justify-center">
                        <span className="font-bold text-xl">${tier.value}</span>
                        <span className="text-xs text-gray-400 mt-1" style={{ fontSize: '0.665rem' }}>
                          {tier.fpt > 0
                            ? `${fptMarketUsd == null ? '~' : ''}${tier.fpt.toLocaleString(undefined, { maximumFractionDigits: 0 })} FPT`
                            : '…'}
                        </span>
                        {fptMarketUsd != null && tier.fpt > 0 && (
                          <span className="text-[9px] text-green-400/70 leading-none">
                            ≈ ${(tier.fpt * fptMarketUsd).toFixed(2)}
                          </span>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* NEW: Quantity Selection */}
              <div className="mb-4">
                <label id="quantity-selection-label" className="block text-sm font-medium text-gray-300 mb-2">
                  Quantity ({quantity}/{maxAllowed})
                </label>
                
                {/* Quick Selection Buttons */}
                <div className="grid grid-cols-5 gap-2 mb-3" role="group" aria-labelledby="quantity-selection-label">
                  {[1, 5, 10, 25, 50].filter((qty) => qty <= maxAllowed).map((qty) => (
                    <button
                      key={qty}
                      onClick={() => setQuantity(Math.min(qty, maxAllowed))}
                      className={`py-2 px-1 rounded-lg border-2 transition-all text-sm font-semibold ${
                        quantity === qty
                          ? 'border-cyan-400 bg-cyan-500/20 text-cyan-300 shadow-lg shadow-cyan-500/50'
                          : 'border-gray-600 text-gray-400 hover:border-gray-400 hover:bg-white/5'
                      }`}
                    >
                      {qty}x
                    </button>
                  ))}
                </div>

                {/* Manual Input */}
                <div className="flex items-center space-x-2">
                  <label htmlFor="quantity-input" className="text-sm font-medium text-gray-300 whitespace-nowrap">
                    Quantity:
                  </label>
                  <input
                    id="quantity-input"
                    name="quantity"
                    type="number"
                    min="1"
                    max={maxAllowed}
                    value={quantity}
                    onChange={(e) => {
                      const val = Math.min(Math.max(parseInt(e.target.value) || 1, 1), maxAllowed);
                      setQuantity(val);
                    }}
                    className="flex-1 bg-gray-700/50 border border-gray-600 rounded-lg px-3 py-2 text-white text-center focus:outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-500/30 transition-all"
                    placeholder="Enter quantity"
                    autoComplete="off"
                  />
                  <span className="text-gray-400 text-sm whitespace-nowrap">/ {maxAllowed} max</span>
                </div>

                {/* Page-split info: buyTicketWithProgram handles up to 2 pages per TX automatically */}
                {quantity > 49 && (
                  <div className="mt-2 text-xs text-blue-400 bg-blue-500/10 border border-blue-500/30 rounded-lg p-2">
                    ℹ️ Large order — will be split across page boundaries in a single transaction automatically
                  </div>
                )}
              </div>

              {/* FPT Entry Price (oracle-verified) */}
              <div className="relative rounded-xl mb-3 overflow-hidden border border-purple-500/30 bg-gradient-to-br from-[#1a1030] to-[#0e1a2e]">
                {/* top accent line */}
                <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-purple-500/60 to-transparent" />
                <div className="px-4 py-3 flex items-center justify-between gap-3">
                  {/* left: label */}
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="w-7 h-7 rounded-lg bg-purple-500/20 flex items-center justify-center">
                      <Coins className="w-4 h-4 text-purple-400" />
                    </div>
                    <div className="flex flex-col">
                      <span className="text-xs font-medium text-gray-400 leading-tight">
                        {fptMarketUsd != null ? 'FPT Entry Price' : 'Est. FPT Cost'}
                      </span>
                      {exchangeRateHuman != null ? (
                        <span className="text-[10px] text-gray-500 leading-tight">
                          {fptMarketUsd != null ? (
                            // Real DEX market price is available
                            <>
                              <span className="text-green-400/90">&#x25cf;&nbsp;DEX live</span>
                              <span className="text-purple-400/80">&nbsp;&bull;&nbsp;FPT&nbsp;${fptMarketUsd < 0.001 ? fptMarketUsd.toFixed(6) : fptMarketUsd.toFixed(4)}</span>
                              {solUsd > 0 && (
                                <span className="text-gray-600">&nbsp;&bull;&nbsp;SOL&nbsp;${solUsd.toFixed(2)}</span>
                              )}
                            </>
                          ) : (
                            // No DEX liquidity yet — show honest oracle label
                            <>
                              <span className="text-yellow-400/70">&#x25cf;&nbsp;Oracle rate</span>
                              {solUsd > 0 && (
                                <span className="text-gray-500">&nbsp;&bull;&nbsp;SOL&nbsp;${solUsd.toFixed(2)}</span>
                              )}
                              <span className="text-gray-600">&nbsp;&bull;&nbsp;no DEX market yet</span>
                            </>
                          )}
                        </span>
                      ) : (
                        <span className="text-[10px] text-gray-500 leading-tight animate-pulse">Fetching live rate…</span>
                      )}
                    </div>
                  </div>
                  {/* right: ticket cost */}
                  <div className="text-right">
                    {exchangeRateHuman != null && selectedTier != null ? (
                      <>
                        <span className="text-base font-bold text-white tracking-tight">
                          {fptMarketUsd == null && <span className="text-gray-400 font-normal">~</span>}
                          {calculateFptCost(selectedTier, 1)}
                        </span>
                        <span className="ml-1 text-xs font-medium text-purple-300">FPT</span>
                        <div className="text-[10px] text-gray-500 mt-0.5">
                          {fptMarketUsd != null
                            ? `≈ $${(parseFloat(calculateFptCost(selectedTier, 1)) * fptMarketUsd).toFixed(2)} · per ticket`
                            : 'oracle est. · per ticket'
                          }
                        </div>
                      </>
                    ) : (
                      <span className="text-sm text-gray-500 animate-pulse">—</span>
                    )}
                  </div>
                </div>
                {/* bottom accent line */}
                <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-blue-500/40 to-transparent" />
              </div>

              {/* Cost Summary - ENHANCED with clear breakdown */}
              <div className="bg-gradient-to-br from-blue-900/40 to-purple-900/40 rounded-lg p-4 mb-4 border-2 border-blue-500/30">
                <div className="space-y-3">
                  {/* Ticket Cost in USD */}
                  <div className="flex items-center justify-between pb-2 border-b border-blue-400/20">
                    <div className="flex items-center space-x-2">
                      <DollarSign className="w-4 h-4 text-blue-400" />
                      <span className="text-gray-300 text-sm font-medium">Ticket Price (USD)</span>
                    </div>
                    <span className="text-white font-bold text-lg">${selectedTier}</span>
                  </div>

                  {/* Quantity */}
                  <div className="flex items-center justify-between pb-2 border-b border-blue-400/20">
                    <div className="flex items-center space-x-2">
                      <Ticket className="w-4 h-4 text-purple-400" />
                      <span className="text-gray-300 text-sm font-medium">Quantity</span>
                    </div>
                    <span className="text-white font-bold text-lg">{quantity}x</span>
                  </div>

                  {/* Total USD */}
                  <div className="flex items-center justify-between pb-2 border-b border-blue-400/20">
                    <span className="text-gray-300 text-sm font-medium">Total (USD)</span>
                    <span className="text-white font-bold text-lg">${selectedTier * quantity}</span>
                  </div>

                  {/* FPT Cost - PROMINENT */}
                  <div className="flex items-center justify-between pt-2 bg-gradient-to-r from-green-500/20 to-emerald-500/20 rounded-lg p-3 border border-green-400/30">
                    <div>
                      <div className="text-gray-300 text-sm font-medium mb-1">You Will Pay</div>
                      <div className="text-xs text-gray-400">FPT Token (Token-2022)</div>
                      {fptMarketUsd == null && (
                        <div className="text-[10px] text-yellow-400/60 mt-0.5">oracle est. · exact set on-chain at tx</div>
                      )}
                    </div>
                    <div className="text-right">
                      <div className="text-green-400 font-bold tabular-nums leading-tight" style={{ fontSize: '0.95rem', letterSpacing: '-0.01em' }}>
                        {fptMarketUsd == null && <span className="text-green-400/60 font-normal">~</span>}
                        {Number(calculateFptCost(selectedTier, quantity) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })}
                      </div>
                      <div className="flex items-center justify-end gap-1 text-green-300 font-bold" style={{ fontSize: '0.831rem' }}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={FPT_TOKEN_ICON} alt="FPT" className="w-4 h-4 rounded-full" />
                        FPT
                      </div>
                      {fptMarketUsd != null && (
                        <div className="text-[10px] text-green-400/60 mt-0.5">
                          ≈ ${(parseFloat(calculateFptCost(selectedTier, quantity)) * fptMarketUsd).toFixed(2)}
                        </div>
                      )}
                    </div>
                  </div>

                </div>
              </div>

              {/* Error Message - Enhanced */}
              {error && (
                <div className="bg-red-900/40 border-2 border-red-500/50 text-red-200 text-sm p-4 rounded-lg mb-3 shadow-lg">
                  <div className="font-bold mb-2 text-red-300">⚠️ Transaction Failed</div>
                  <div className="whitespace-pre-line leading-relaxed">{error}</div>
                  {error.includes("FPT") && (
                    <div className="mt-3 pt-3 border-t border-red-500/30 text-xs">
                      <div className="font-semibold mb-1">Need FPT Tokens?</div>
                      <div>Use the <span className="text-yellow-300 font-semibold">Liquidity Gateway</span> to swap any Coin/Token (SOL or any preferred digital asset) for <span className="font-semibold">Fortress Protocol Token ($FPT)</span> — the universal key to all 16 lottery tiers.</div>
                      <div className="text-red-400 mt-1">Mint: {FPT_MINT.slice(0, 16)}...</div>
                    </div>
                  )}
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex space-x-3">
                <button
                  onClick={() => {
                    onClose();
                  }}
                  className="flex-1 py-2 px-4 bg-gray-600 hover:bg-gray-500 text-white rounded-lg font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    if (!connected) {
                      handleConnectWallet();
                    } else {
                      handleBuyTicket();
                    }
                  }}
                  disabled={isLoading || !connected}
                  className={`flex-[0.99] py-[7px] px-4 rounded-lg font-medium transition-all ${
                    isLoading || !connected
                      ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                      : 'bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600 text-white shadow-lg hover:shadow-purple-500/25 transform hover:scale-105'
                  }`}
                >
                  {isLoading ? (
                    <div className="flex items-center justify-center space-x-2">
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Processing...</span>
                    </div>
                  ) : !connected ? (
                    <div className="flex items-center justify-center space-x-2">
                      <span>🔒 Connect Wallet</span>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center">
                      <div className="flex items-center space-x-2">
                        <Coins className="w-5 h-5" />
                        <span className="font-bold">Buy {quantity} Ticket{quantity > 1 ? 's' : ''}</span>
                      </div>
                      <div className="text-xs mt-1 opacity-90">
                        Pay {Number(calculateFptCost(selectedTier, quantity) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })} FPT · ${selectedTier * quantity} USD
                      </div>
                    </div>
                  )}
                </button>
              </div>

              {/* Wallet Status */}
              {!connected && (
                <div className="mt-3 text-center text-sm text-red-400">
                  Please connect your wallet to purchase tickets
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Transaction Success Modal */}
      <AnimatePresence>
        {transactionResult && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={handleCloseSuccess}
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              onClick={(e) => e.stopPropagation()}
            >
              <TransactionSuccess
                transactionSignature={transactionResult.transactionSignature}
                tier={transactionResult.tier}
                participantId={transactionResult.participantId}
                lotteryType={lotteryType}
                onClose={handleCloseSuccess}
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default BuyTicketModal;