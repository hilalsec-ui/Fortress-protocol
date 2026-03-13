"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Trophy, Sparkles, Star, Zap, X, Copy, Check } from "lucide-react";
import { useTheme } from "@/contexts/ThemeContext";
import { FPT_TOKEN_ICON } from "../utils/constants";
import { useFptPrice } from "@/contexts/FptPriceContext";
import { useEffect, useState } from "react";
import confetti from "canvas-confetti";

interface WinnerCelebrationProps {
  isVisible: boolean;
  winnerData: {
    wallet: string;
    tier: number;
    prize: number;
    lotteryType: string;
  } | null;
  onClose: () => void;
}

export default function WinnerCelebration({ isVisible, winnerData, onClose }: WinnerCelebrationProps) {
  const { isDarkMode } = useTheme();
  const { fptUsd } = useFptPrice();
  const [copied, setCopied] = useState(false);

  const copyAddress = () => {
    if (!winnerData?.wallet) return;
    navigator.clipboard.writeText(winnerData.wallet).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  useEffect(() => {
    if (isVisible && winnerData) {
      // Fire confetti burst
      const duration = 5000;
      const animationEnd = Date.now() + duration;
      const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 9999 };

      function randomInRange(min: number, max: number) {
        return Math.random() * (max - min) + min;
      }

      const interval: any = setInterval(function() {
        const timeLeft = animationEnd - Date.now();
        if (timeLeft <= 0) return clearInterval(interval);
        const particleCount = 50 * (timeLeft / duration);
        confetti({ ...defaults, particleCount, origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 } });
        confetti({ ...defaults, particleCount, origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 } });
      }, 250);

      return () => clearInterval(interval);
    }
  }, [isVisible, winnerData]);

  if (!isVisible || !winnerData) return null;

  const lotteryNames: { [key: string]: string } = {
    LPM: "Lightning Pool",
    DPL: "Daily Pool",
    WPL: "Weekly Pool",
    MPL: "Monthly Pool",
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-md"
      >
        <motion.div
          initial={{ scale: 0, rotate: -180 }}
          animate={{ scale: 1, rotate: 0 }}
          exit={{ scale: 0, rotate: 180 }}
          transition={{ type: "spring", duration: 0.8, bounce: 0.5 }}
          className={`relative max-w-2xl w-full mx-4 p-8 rounded-3xl shadow-2xl ${
            isDarkMode ? 'bg-gradient-to-br from-purple-900 to-pink-900' : 'bg-gradient-to-br from-purple-100 to-pink-100'
          }`}
        >
          {/* X close button */}
          <button
            onClick={onClose}
            className={`absolute top-4 right-4 z-20 p-2 rounded-full transition-all hover:scale-110 ${
              isDarkMode ? 'bg-white/10 hover:bg-white/20 text-white' : 'bg-black/10 hover:bg-black/20 text-gray-800'
            }`}
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
          {/* Animated background stars */}
          <div className="absolute inset-0 overflow-hidden rounded-3xl">
            {[...Array(20)].map((_, i) => (
              <motion.div
                key={i}
                className="absolute"
                initial={{ 
                  x: Math.random() * 100 + "%",
                  y: Math.random() * 100 + "%",
                  scale: 0,
                  opacity: 0
                }}
                animate={{
                  scale: [0, 1, 0],
                  opacity: [0, 1, 0],
                  rotate: [0, 360]
                }}
                transition={{
                  duration: 2,
                  repeat: Infinity,
                  delay: i * 0.1,
                  ease: "easeInOut"
                }}
              >
                <Star className="w-4 h-4 text-yellow-400" fill="currentColor" />
              </motion.div>
            ))}
          </div>

          {/* Main content */}
          <div className="relative z-10 text-center">
            {/* Trophy icon */}
            <motion.div
              animate={{
                y: [0, -20, 0],
                rotate: [0, 10, -10, 0]
              }}
              transition={{
                duration: 2,
                repeat: Infinity,
                ease: "easeInOut"
              }}
              className="inline-block mb-6"
            >
              <div className="w-32 h-32 bg-gradient-to-br from-yellow-400 to-orange-500 rounded-full flex items-center justify-center mx-auto shadow-2xl">
                <Trophy className="w-16 h-16 text-white" />
              </div>
            </motion.div>

            {/* Celebration text */}
            <motion.h2
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className={`text-5xl font-black mb-4 ${
                isDarkMode ? 'text-white' : 'text-gray-900'
              }`}
            >
              🎉 WINNER! 🎉
            </motion.h2>

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className={`text-2xl font-bold mb-6 ${
                isDarkMode ? 'text-yellow-300' : 'text-yellow-600'
              }`}
            >
              {lotteryNames[winnerData.lotteryType]} - Tier ${winnerData.tier}
            </motion.p>

            {/* Winner wallet */}
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.5 }}
              className={`p-6 rounded-xl mb-6 ${
                isDarkMode ? 'bg-black/30 border-2 border-yellow-500/50' : 'bg-white border-2 border-yellow-500'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <p className={`text-sm font-semibold ${
                  isDarkMode ? 'text-gray-400' : 'text-gray-600'
                }`}>
                  Winner Address
                </p>
                <button
                  onClick={copyAddress}
                  title="Copy address"
                  className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold transition-all ${
                    copied
                      ? 'bg-green-500/20 text-green-400'
                      : isDarkMode
                        ? 'bg-white/10 hover:bg-white/20 text-gray-300'
                        : 'bg-black/5 hover:bg-black/10 text-gray-600'
                  }`}
                >
                  {copied ? <><Check className="w-3 h-3" /> Copied!</> : <><Copy className="w-3 h-3" /> Copy</>}
                </button>
              </div>
              <p className={`text-lg font-mono break-all ${
                isDarkMode ? 'text-white' : 'text-gray-900'
              }`}>
                {winnerData.wallet}
              </p>
            </motion.div>

            {/* Prize amount */}
            <motion.div
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.6, type: "spring" }}
              className="mb-8"
            >
              <div className="inline-block px-8 py-4 bg-gradient-to-r from-green-500 to-emerald-500 rounded-full shadow-2xl">
                <motion.p
                  animate={{ scale: [1, 1.1, 1] }}
                  transition={{ duration: 1, repeat: Infinity }}
                  className="text-4xl font-black text-white flex flex-col items-center justify-center gap-1"
                >
                  <span>🏆 {fptUsd > 0 ? `$${(winnerData.prize * fptUsd).toFixed(2)} USD` : `${winnerData.prize.toFixed(2)} FPT`}</span>
                  {fptUsd > 0 && (
                    <span className="text-base font-semibold text-white/80">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={FPT_TOKEN_ICON} alt="FPT" className="w-4 h-4 rounded-full inline mr-1" />
                      {winnerData.prize.toFixed(2)} FPT
                    </span>
                  )}
                </motion.p>
              </div>
            </motion.div>

            {/* Sparkles */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.7 }}
              className="flex items-center justify-center space-x-4 mb-8"
            >
              <Sparkles className="w-8 h-8 text-yellow-400" />
              <Zap className="w-8 h-8 text-orange-400" />
              <Sparkles className="w-8 h-8 text-pink-400" />
            </motion.div>

            {/* Action buttons */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.9 }}
              className="flex items-center justify-center"
            >
              {/* Close */}
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={onClose}
                className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-purple-500 to-pink-500 text-white font-bold rounded-xl shadow-lg hover:shadow-2xl transition-all"
              >
                <X className="w-5 h-5" />
                Close
              </motion.button>
            </motion.div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
