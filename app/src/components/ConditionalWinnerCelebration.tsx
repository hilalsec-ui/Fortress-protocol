"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Trophy, Sparkles, X, Crown, Medal, Zap } from "lucide-react";
import { useTheme } from "@/contexts/ThemeContext";
import confetti from "canvas-confetti";
import { useFptPrice } from "@/contexts/FptPriceContext";

interface ConditionalWinnerCelebrationProps {
  isVisible: boolean;
  isWinner: boolean;
  winnerData: {
    wallet: string;
    tier: number;
    prize: number;
    lotteryType: string;
    vaultAddress?: string;
  } | null;
  onClose: () => void;
}

const LOTTERY_TYPE_NAMES: { [key: string]: string } = {
  LPM: "Lightning Pool",
  DPL: "Daily Pool",
  WPL: "Weekly Pool",
  MPL: "Monthly Pool",
};

const LOTTERY_COLORS: { [key: string]: string } = {
  LPM: "from-yellow-400 to-orange-500",
  DPL: "from-blue-400 to-cyan-500",
  WPL: "from-indigo-400 to-purple-500",
  MPL: "from-orange-400 to-red-500",
};

export default function ConditionalWinnerCelebration({
  isVisible,
  isWinner,
  winnerData,
  onClose,
}: ConditionalWinnerCelebrationProps) {
  const { isDarkMode } = useTheme();
  const { fptUsd } = useFptPrice();
  const [showConfetti, setShowConfetti] = useState(false);
  const [hasHydrated, setHasHydrated] = useState(false);
  const [hasSeen, setHasSeen] = useState(false);

  // Mark hydration complete and check localStorage
  useEffect(() => {
    if (!winnerData) {
      setHasHydrated(true);
      return;
    }
    
    const key = `hasSeenCelebration_${winnerData.vaultAddress ?? winnerData.lotteryType}_${winnerData.wallet}`;
    const seen = localStorage.getItem(key) === "true";
    setHasSeen(seen);
    setHasHydrated(true);
  }, [winnerData]);

  // Fire confetti on mount
  useEffect(() => {
    if (isVisible && isWinner && !hasSeen && winnerData && hasHydrated) {
      setShowConfetti(true);
      fireConfetti();
      // Mark as seen in localStorage
      const key = `hasSeenCelebration_${winnerData.vaultAddress ?? winnerData.lotteryType}_${winnerData.wallet}`;
      localStorage.setItem(key, "true");
      setHasSeen(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isVisible, isWinner, winnerData, hasSeen, hasHydrated]);

  const fireConfetti = () => {
    const duration = 5000;
    const animationEnd = Date.now() + duration;
    const defaults = {
      startVelocity: 30,
      spread: 360,
      ticks: 60,
      zIndex: 9999,
    };

    function randomInRange(min: number, max: number) {
      return Math.random() * (max - min) + min;
    }

    const interval = setInterval(() => {
      const timeLeft = animationEnd - Date.now();

      if (timeLeft <= 0) {
        return clearInterval(interval);
      }

      const particleCount = 50 * (timeLeft / duration);

      confetti({
        ...defaults,
        particleCount,
        origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 },
      });
      confetti({
        ...defaults,
        particleCount,
        origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 },
      });
    }, 250);
  };

  const formatWallet = (wallet: string) => {
    return `${wallet.slice(0, 6)}...${wallet.slice(-4)}`;
  };

  const handleClose = () => {
    if (winnerData) {
      const key = `hasSeenCelebration_${winnerData.vaultAddress ?? winnerData.lotteryType}_${winnerData.wallet}`;
      localStorage.setItem(key, "true");
      setHasSeen(true);
    }
    onClose();
  };

  // Only show if winner and hasn't seen before and hydration is complete
  if (
    !isVisible ||
    !isWinner ||
    !winnerData ||
    !hasHydrated ||
    hasSeen
  ) {
    return null;
  }

  const lotteryName = LOTTERY_TYPE_NAMES[winnerData.lotteryType] || winnerData.lotteryType;
  const lotteryColor = LOTTERY_COLORS[winnerData.lotteryType] || "from-blue-400 to-cyan-500";

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/80 backdrop-blur-lg flex items-center justify-center z-[9999] p-4"
      >
        {/* Victory Card */}
        <motion.div
          initial={{ scale: 0.8, y: 50 }}
          animate={{ scale: 1, y: 0 }}
          exit={{ scale: 0.8, y: 50 }}
          transition={{ type: "spring", damping: 15, stiffness: 300 }}
          className={`relative w-full max-w-2xl rounded-3xl overflow-hidden shadow-2xl ${
            isDarkMode ? "bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900" : "bg-gradient-to-br from-white to-gray-50"
          }`}
        >
          {/* Background Glow */}
          <div className={`absolute inset-0 bg-gradient-to-br ${lotteryColor} opacity-5 pointer-events-none`} />

          {/* Top Border Accent */}
          <div className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${lotteryColor}`} />

          <div className="relative p-8 md:p-12">
            {/* Close Button */}
            <button
              onClick={handleClose}
              className={`absolute top-4 right-4 p-2 rounded-full transition-all ${
                isDarkMode
                  ? "bg-white/10 hover:bg-white/20 text-gray-300"
                  : "bg-black/5 hover:bg-black/10 text-gray-700"
              }`}
            >
              <X className="w-6 h-6" />
            </button>

            {/* Header */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="text-center mb-8"
            >
              <div className="flex justify-center mb-4">
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
                >
                  <Crown className={`w-16 h-16 bg-gradient-to-r ${lotteryColor} bg-clip-text text-transparent`} />
                </motion.div>
              </div>

              <h1
                className={`text-4xl md:text-5xl font-black mb-2 ${
                  isDarkMode ? "text-white" : "text-gray-900"
                }`}
              >
                🎉 YOU WON! 🎉
              </h1>

              <p
                className={`text-xl md:text-2xl font-bold bg-gradient-to-r ${lotteryColor} bg-clip-text text-transparent`}
              >
                Victory Certificate
              </p>
            </motion.div>

            {/* Prize Display */}
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.3 }}
              className={`text-center mb-8 p-6 rounded-2xl border-2 ${
                isDarkMode
                  ? `border-gray-700 bg-gradient-to-br ${lotteryColor} bg-opacity-10`
                  : `border-gray-200 bg-gradient-to-br ${lotteryColor} bg-opacity-5`
              }`}
            >
              <p className={`text-sm font-semibold mb-2 ${isDarkMode ? "text-gray-400" : "text-gray-600"}`}>
                GRAND PRIZE
              </p>
              <p className="text-5xl md:text-6xl font-black bg-gradient-to-r from-green-400 to-emerald-500 bg-clip-text text-transparent">
                {fptUsd > 0 ? `$${(winnerData.prize * fptUsd).toFixed(2)}` : `${winnerData.prize} FPT`}
              </p>
              {fptUsd > 0 && (
                <p className="text-lg font-semibold text-amber-400 mt-1">
                  {winnerData.prize} FPT
                </p>
              )}
            </motion.div>

            {/* Lottery Info */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="grid grid-cols-3 gap-4 mb-8"
            >
              {/* Lottery Type */}
              <div
                className={`p-4 rounded-xl text-center ${
                  isDarkMode
                    ? "bg-white/5 border border-white/10"
                    : "bg-black/5 border border-gray-200"
                }`}
              >
                <p className={`text-xs font-semibold mb-1 ${isDarkMode ? "text-gray-400" : "text-gray-600"}`}>
                  LOTTERY TYPE
                </p>
                <p className={`text-lg font-bold ${isDarkMode ? "text-white" : "text-gray-900"}`}>
                  {winnerData.lotteryType}
                </p>
                <p className={`text-xs ${isDarkMode ? "text-gray-500" : "text-gray-600"}`}>
                  {lotteryName}
                </p>
              </div>

              {/* Tier */}
              <div
                className={`p-4 rounded-xl text-center ${
                  isDarkMode
                    ? "bg-white/5 border border-white/10"
                    : "bg-black/5 border border-gray-200"
                }`}
              >
                <p className={`text-xs font-semibold mb-1 ${isDarkMode ? "text-gray-400" : "text-gray-600"}`}>
                  TIER
                </p>
                <p className={`text-lg font-bold ${isDarkMode ? "text-white" : "text-gray-900"}`}>
                  #{winnerData.tier}
                </p>
                <p className={`text-xs ${isDarkMode ? "text-gray-500" : "text-gray-600"}`}>
                  ${winnerData.tier}
                </p>
              </div>

              {/* Date */}
              <div
                className={`p-4 rounded-xl text-center ${
                  isDarkMode
                    ? "bg-white/5 border border-white/10"
                    : "bg-black/5 border border-gray-200"
                }`}
              >
                <p className={`text-xs font-semibold mb-1 ${isDarkMode ? "text-gray-400" : "text-gray-600"}`}>
                  DATE
                </p>
                <p className={`text-lg font-bold ${isDarkMode ? "text-white" : "text-gray-900"}`}>
                  {new Date().toLocaleDateString()}
                </p>
              </div>
            </motion.div>

            {/* Winner Address */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
              className={`p-6 rounded-2xl mb-8 ${
                isDarkMode ? "bg-white/5 border border-white/10" : "bg-black/5 border border-gray-200"
              }`}
            >
              <p className={`text-xs font-semibold mb-2 ${isDarkMode ? "text-gray-400" : "text-gray-600"}`}>
                WINNER WALLET
              </p>
              <p className={`text-center font-mono text-lg ${isDarkMode ? "text-white" : "text-gray-900"}`}>
                {formatWallet(winnerData.wallet)}
              </p>
              <p
                className={`text-center text-xs mt-2 font-mono break-all ${isDarkMode ? "text-gray-500" : "text-gray-600"}`}
              >
                {winnerData.wallet}
              </p>
            </motion.div>

            {/* Fortress Verified Badge */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.6 }}
              className="text-center mb-8"
            >
              <div
                className={`inline-flex items-center space-x-2 px-4 py-2 rounded-full border-2 ${
                  isDarkMode
                    ? "border-green-500/50 bg-green-500/10"
                    : "border-green-400 bg-green-50"
                }`}
              >
                <Sparkles className="w-4 h-4 text-green-500" />
                <span className="text-sm font-bold text-green-600">✓ FORTRESS VERIFIED</span>
              </div>
            </motion.div>

            {/* Action Buttons */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.7 }}
              className="flex gap-4"
            >
              <button
                onClick={handleClose}
                className={`flex-1 py-3 px-6 rounded-xl font-bold transition-all ${
                  isDarkMode
                    ? "bg-white/10 hover:bg-white/20 text-white"
                    : "bg-gray-200 hover:bg-gray-300 text-gray-900"
                }`}
              >
                Close
              </button>
            </motion.div>

            {/* Footer Message */}
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.8 }}
              className={`text-center text-xs mt-6 ${isDarkMode ? "text-gray-500" : "text-gray-600"}`}
            >
              This victory certificate will only appear once per winning wallet. Share your success! 🎊
            </motion.p>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
