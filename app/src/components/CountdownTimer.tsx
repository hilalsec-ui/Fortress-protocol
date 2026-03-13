"use client";

import React, { useMemo } from 'react';
import { useTheme } from '@/contexts/ThemeContext';
import { useTimeOffsetStore } from '@/stores/timeOffsetStore';
import { RefreshCw } from 'lucide-react';

interface CountdownTimerProps {
  targetType?: 'day' | 'week' | 'month' | 'year';
  /** Unix timestamp in seconds (from on-chain vault.endTime). When provided, overrides targetType. */
  targetTimestamp?: number;
  className?: string;
  /** Show "Syncing with Solana..." spinner. Should be connected to useTimeOffsetStore's isSyncing state. */
  isSyncing?: boolean;
}

const CountdownTimer: React.FC<CountdownTimerProps> = ({
  targetType = 'day',
  targetTimestamp,
  className = '',
  isSyncing: externalIsSyncing,
}) => {
  const { isDarkMode } = useTheme();

  // Subscribe to the single global nowSeconds — driven by ChainDataContext's
  // one-and-only setInterval. All CountdownTimers and tier card banners share
  // this value so they tick in perfect unison.
  const nowSeconds = useTimeOffsetStore((state) => state.nowSeconds);
  const isSyncingFromStore = useTimeOffsetStore((state) => state.isSyncing);
  const isSyncing = externalIsSyncing ?? isSyncingFromStore;

  // Derive timeLeft purely from nowSeconds — recomputes whenever the store ticks.
  // No local useState, no local setInterval needed.
  const timeLeft = useMemo(() => {
    let target: number;

    // Explicitly 0 means "no active round" (lazy reset) — freeze at 00:00:00
    if (targetTimestamp !== undefined && targetTimestamp <= 0) {
      return { days: 0, hours: 0, minutes: 0, seconds: 0 };
    }

    if (targetTimestamp && targetTimestamp > 0) {
      target = targetTimestamp;
    } else {
      const nowDate = new Date();
      switch (targetType) {
        case 'day':
          target = Math.floor(new Date(Date.UTC(
            nowDate.getUTCFullYear(), nowDate.getUTCMonth(), nowDate.getUTCDate() + 1,
            0, 0, 0, 0
          )).getTime() / 1000);
          break;
        case 'week': {
          const daysUntilMonday = (8 - nowDate.getUTCDay()) % 7 || 7;
          const nextMonday = new Date(nowDate);
          nextMonday.setUTCDate(nowDate.getUTCDate() + daysUntilMonday);
          nextMonday.setUTCHours(0, 0, 0, 0);
          target = Math.floor(nextMonday.getTime() / 1000);
          break;
        }
        case 'month':
          target = Math.floor(new Date(Date.UTC(
            nowDate.getUTCFullYear(), nowDate.getUTCMonth() + 1, 1, 0, 0, 0, 0
          )).getTime() / 1000);
          break;
        case 'year':
          target = Math.floor(new Date(Date.UTC(
            nowDate.getUTCFullYear() + 1, 0, 1, 0, 0, 0, 0
          )).getTime() / 1000);
          break;
        default:
          target = nowSeconds;
      }
    }

    const remaining = target - nowSeconds;
    if (remaining <= 0) return { days: 0, hours: 0, minutes: 0, seconds: 0 };
    return {
      days:    Math.floor(remaining / 86400),
      hours:   Math.floor((remaining % 86400) / 3600),
      minutes: Math.floor((remaining % 3600) / 60),
      seconds: Math.floor(remaining % 60),
    };
  }, [nowSeconds, targetTimestamp, targetType]);

  return (
    <div className={`flex gap-3 justify-center items-center ${className}`}>
      {/* Sync status indicator */}
      {isSyncing && (
        <div className="flex items-center gap-1">
          <RefreshCw
            size={14}
            className={`animate-spin ${isDarkMode ? 'text-blue-400' : 'text-blue-600'}`}
          />
          <span
            className={`text-xs font-medium ${
              isDarkMode ? 'text-blue-400' : 'text-blue-600'
            }`}
          >
            Syncing...
          </span>
        </div>
      )}

      {/* Days counter */}
      {timeLeft.days > 0 && (
        <div
          className={`text-center px-3 py-2 rounded-lg ${
            isDarkMode ? 'bg-white/10' : 'bg-black/5'
          }`}
        >
          <div className={`text-2xl font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
            {String(timeLeft.days).padStart(2, '0')}
          </div>
          <div className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
            Days
          </div>
        </div>
      )}

      {/* Hours counter */}
      <div
        className={`text-center px-3 py-2 rounded-lg ${
          isDarkMode ? 'bg-white/10' : 'bg-black/5'
        }`}
      >
        <div className={`text-2xl font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
          {String(timeLeft.hours).padStart(2, '0')}
        </div>
        <div className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
          Hours
        </div>
      </div>

      {/* Minutes counter */}
      <div
        className={`text-center px-3 py-2 rounded-lg ${
          isDarkMode ? 'bg-white/10' : 'bg-black/5'
        }`}
      >
        <div className={`text-2xl font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
          {String(timeLeft.minutes).padStart(2, '0')}
        </div>
        <div className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
          Min
        </div>
      </div>

      {/* Seconds counter */}
      <div
        className={`text-center px-3 py-2 rounded-lg ${
          isDarkMode ? 'bg-white/10' : 'bg-black/5'
        }`}
      >
        <div className={`text-2xl font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
          {String(timeLeft.seconds).padStart(2, '0')}
        </div>
        <div className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
          Sec
        </div>
      </div>
    </div>
  );
};

export default CountdownTimer;
