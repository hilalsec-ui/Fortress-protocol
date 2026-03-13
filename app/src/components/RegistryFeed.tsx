import React, { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { RefreshCw, Users, TrendingUp, Zap, Sun, Calendar, CalendarDays, Trophy, Clock } from 'lucide-react';
import { useAnchorProgram } from '../utils/anchor';
import { fetchAllLotteryAccounts } from '../services/lotteryService';
import { useTheme } from '@/contexts/ThemeContext';
import { useTimeOffsetStore } from '@/stores/timeOffsetStore';
import { useFptPrice } from '@/contexts/FptPriceContext';

interface TierData {
  tier: number;
  participants: number;
  prizePool: number;
  endTime?: number;
}

interface LotteryData {
  lotteryType: string;
  tiers: TierData[];
}

interface RegistryFeedProps {
  onRefresh?: () => void;
}

const RegistryFeed: React.FC<RegistryFeedProps> = ({ onRefresh }) => {
  const { isDarkMode } = useTheme();
  const { fptUsd } = useFptPrice();
  const [allLotteries, setAllLotteries] = useState<LotteryData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<string>('');
  const [nowSeconds, setNowSeconds] = useState(0);
  const program = useAnchorProgram();

  // Live clock locked to Solana on-chain time
  useEffect(() => {
    setNowSeconds(Math.floor(useTimeOffsetStore.getState().getAdjustedNow()));
    const iv = setInterval(() => setNowSeconds(Math.floor(useTimeOffsetStore.getState().getAdjustedNow())), 1000);
    return () => clearInterval(iv);
  }, []);

  const fetchData = useCallback(async () => {
    try {
      setIsLoading(true);
      if (!program) {
        setAllLotteries([]);
        setIsLoading(false);
        return;
      }
      const lotteries = await fetchAllLotteryAccounts(program);
      setAllLotteries(lotteries);
      setLastUpdated(new Date().toLocaleTimeString());
      setIsLoading(false);
    } catch (error) {
      console.error('Failed to fetch lottery data:', error);
      setAllLotteries([]);
      setIsLoading(false);
    }
  }, [program]);

  // Fetch real lottery data
  useEffect(() => {
    // Initial fetch (runs immediately)
    fetchData();

    // Set up interval for auto-refresh
    const interval = setInterval(fetchData, 15000); // Every 15 seconds

    return () => clearInterval(interval);
  }, [fetchData]); // Re-fetch when program changes

  // Calculate global totals across all 20 tiers
  const totalParticipants = allLotteries.reduce((sum, lottery) => 
    sum + lottery.tiers.reduce((tierSum, tier) => tierSum + tier.participants, 0), 0
  );
  
  const totalFPT = allLotteries.reduce((sum, lottery) => 
    sum + lottery.tiers.reduce((tierSum, tier) => tierSum + tier.prizePool, 0), 0
  );

  const getLotteryIcon = (type: string) => {
    switch (type) {
      case 'LPM': return Zap;
      case 'DPL': return Sun;
      case 'WPL': return Calendar;
      case 'MPL': return CalendarDays;
      default: return Users;
    }
  };

  const getLotteryColor = (type: string) => {
    switch (type) {
      case 'LPM': return 'from-yellow-500 to-orange-500';
      case 'DPL': return 'from-blue-500 to-cyan-500';
      case 'WPL': return 'from-indigo-500 to-purple-500';
      case 'MPL': return 'from-orange-500 to-red-500';
      default: return 'from-gray-500 to-gray-600';
    }
  };

  // Compact per-tier timer string: "23:59:59" or "EXPIRED"
  const tierTimer = (endTime: number | undefined): string => {
    if (!endTime || endTime <= 0) return '';
    const remaining = endTime - nowSeconds;
    if (remaining <= 0) return 'EXPIRED';
    const d = Math.floor(remaining / 86400);
    const h = Math.floor((remaining % 86400) / 3600);
    const m = Math.floor((remaining % 3600) / 60);
    const s = remaining % 60;
    if (d > 0) return `${d}d ${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: 0.2 }}
      className={`rounded-2xl p-6 border shadow-xl ${
        isDarkMode 
          ? 'bg-black/40 backdrop-blur-xl border-white/10' 
          : 'bg-white/80 backdrop-blur-xl border-gray-200'
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center space-x-3">
          <div className="w-12 h-12 bg-gradient-to-r from-cyan-500 to-blue-500 rounded-2xl flex items-center justify-center shadow-lg">
            <TrendingUp className="w-6 h-6 text-white" />
          </div>
          <div>
            <h3 className={`text-xl font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
              📊 Live Registry Feed
            </h3>
            <p className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
              All 20 Lottery Tiers • Real-Time
            </p>
          </div>
        </div>
        <button
          onClick={fetchData}
          disabled={isLoading}
          className={`p-2 rounded-full transition-all ${
            isDarkMode ? 'hover:bg-white/10' : 'hover:bg-gray-200'
          } disabled:opacity-50`}
        >
          <RefreshCw className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''} ${
            isDarkMode ? 'text-white' : 'text-gray-900'
          }`} />
        </button>
      </div>

      {/* Global Totals */}
      <div className={`grid grid-cols-2 gap-4 mb-6 p-4 rounded-xl ${
        isDarkMode 
          ? 'bg-gradient-to-r from-blue-500/20 to-purple-500/20 border border-blue-400/30'
          : 'bg-gradient-to-r from-blue-50 to-purple-50 border border-blue-200'
      }`}>
        <div className="text-center">
          <div className={`text-3xl font-black mb-1 ${
            isDarkMode ? 'text-white' : 'text-gray-900'
          }`}>
            {totalParticipants}
          </div>
          <div className={`text-xs font-medium ${
            isDarkMode ? 'text-gray-300' : 'text-gray-600'
          }`}>
            👥 Total Participants
          </div>
        </div>
        <div className="text-center">
          <div className={`text-3xl font-black mb-1 ${
            isDarkMode ? 'text-transparent bg-gradient-to-r from-green-400 to-emerald-400 bg-clip-text' : 'text-green-600'
          }`}>
            {fptUsd > 0 ? `$${(totalFPT * fptUsd).toFixed(0)}` : `${totalFPT.toLocaleString()} FPT`}
          </div>
          <div className={`text-xs font-medium ${
            isDarkMode ? 'text-gray-300' : 'text-gray-600'
          }`}>
            💰 Total Pool Value (USD)
          </div>
        </div>
      </div>

      {/* Last Updated */}
      <div className={`text-xs mb-4 flex items-center gap-2 ${
        isDarkMode ? 'text-gray-400' : 'text-gray-600'
      }`}>
        <Clock className="w-3 h-3" />
        <span>Last updated: {lastUpdated} • Auto-refresh every 15s</span>
      </div>

      {/* Lottery List */}
      <div className="space-y-4 max-h-[600px] overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-white/20 scrollbar-track-transparent">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className={`w-8 h-8 border-3 rounded-full animate-spin ${
              isDarkMode ? 'border-white border-t-transparent' : 'border-gray-900 border-t-transparent'
            }`} />
          </div>
        ) : (
          allLotteries.map((lottery, lotteryIndex) => {
            const Icon = getLotteryIcon(lottery.lotteryType);
            const isLPM = lottery.lotteryType === 'LPM';
            
            return (
              <motion.div
                key={lottery.lotteryType}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.3, delay: lotteryIndex * 0.1 }}
                className={`rounded-xl p-4 border ${
                  isDarkMode 
                    ? 'bg-black/30 border-white/10 hover:bg-black/40' 
                    : 'bg-white border-gray-200 hover:bg-gray-50'
                } transition-all`}
              >
                {/* Lottery Header */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className={`w-10 h-10 bg-gradient-to-br ${getLotteryColor(lottery.lotteryType)} rounded-xl flex items-center justify-center shadow-lg`}>
                      <Icon className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <div className={`font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                        {lottery.lotteryType}
                      </div>
                      <div className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                        {lottery.tiers.length} Tiers Active
                      </div>
                    </div>
                  </div>
                  

                </div>

                {/* Tiers */}
                <div className="space-y-2">
                  {lottery.tiers.map((tier, tierIndex) => (
                    <motion.div
                      key={`${lottery.lotteryType}-${tier.tier}`}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: tierIndex * 0.05 }}
                      className={`rounded-lg p-3 ${
                        isDarkMode ? 'bg-white/5' : 'bg-gray-50'
                      }`}
                    >
                      {isLPM ? (
                        /* LPM: Show progress bar */
                        <>
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold ${
                                isDarkMode ? 'bg-yellow-500/20 text-yellow-400' : 'bg-yellow-100 text-yellow-700'
                              }`}>
                                ${tier.tier}
                              </div>
                              <div>
                                <div className={`text-sm font-semibold ${
                                  isDarkMode ? 'text-white' : 'text-gray-900'
                                }`}>
                                  {tier.participants}/100
                                </div>
                                <div className={`text-xs ${
                                  isDarkMode ? 'text-gray-400' : 'text-gray-600'
                                }`}>
                                  {fptUsd > 0 ? `$${(tier.prizePool * fptUsd).toFixed(2)}` : `${tier.prizePool} FPT`}
                                </div>
                              </div>
                            </div>
                            <div className={`px-2 py-1 rounded text-xs font-bold ${
                              tier.participants >= 100
                                ? isDarkMode ? 'bg-green-500/20 text-green-400' : 'bg-green-100 text-green-700'
                                : isDarkMode ? 'bg-blue-500/20 text-blue-400' : 'bg-blue-100 text-blue-700'
                            }`}>
                              {tier.participants >= 100 ? '✅ Full' : '🔵 Active'}
                            </div>
                          </div>
                          <div className={`w-full rounded-full h-2 ${
                            isDarkMode ? 'bg-gray-700' : 'bg-gray-200'
                          }`}>
                            <motion.div
                              initial={{ width: 0 }}
                              animate={{ width: `${Math.min((tier.participants / 100) * 100, 100)}%` }}
                              transition={{ duration: 0.5 }}
                              className="h-2 rounded-full bg-gradient-to-r from-yellow-500 to-orange-500"
                            />
                          </div>
                        </>
                      ) : (
                        /* Time-based: tier badge + entries + pool + per-tier timer */
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <div className="flex items-center gap-2">
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold ${
                              isDarkMode ? `bg-gradient-to-br ${getLotteryColor(lottery.lotteryType)} text-white` : 'bg-gray-200 text-gray-700'
                            }`}>
                              ${tier.tier}
                            </div>
                            {/* Per-tier timer */}
                            {tier.endTime && tier.endTime > 0 ? (
                              tierTimer(tier.endTime) === 'EXPIRED' ? (
                                <span className="text-xs font-bold text-amber-400 animate-pulse">✓ Ready</span>
                              ) : (
                                <span className={`text-xs font-mono tabular-nums ${
                                  isDarkMode ? 'text-gray-300' : 'text-gray-600'
                                }`}>⏰ {tierTimer(tier.endTime)}</span>
                              )
                            ) : null}
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="text-right">
                              <div className={`text-sm font-bold ${
                                isDarkMode ? 'text-white' : 'text-gray-900'
                              }`}>{tier.participants}</div>
                              <div className={`text-xs ${
                                isDarkMode ? 'text-gray-400' : 'text-gray-600'
                              }`}>👥 Entries</div>
                            </div>
                            <div className="text-right">
                              <div className={`text-sm font-bold ${
                                isDarkMode ? 'text-green-400' : 'text-green-600'
                              }`}>{fptUsd > 0 ? `$${(tier.prizePool * fptUsd).toFixed(2)}` : `${tier.prizePool} FPT`}</div>
                              <div className={`text-xs ${
                                isDarkMode ? 'text-gray-400' : 'text-gray-600'
                              }`}>💰 Prize (USD)</div>
                            </div>
                          </div>
                        </div>
                      )}
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            );
          })
        )}
      </div>
    </motion.div>
  );
};

export default RegistryFeed;