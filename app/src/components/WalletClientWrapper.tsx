"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletName } from '@solana/wallet-adapter-base';

interface WalletClientWrapperProps {
  className?: string;
}

const MWA_NAME = 'Mobile Wallet Adapter' as WalletName;

const WalletClientWrapper: React.FC<WalletClientWrapperProps> = ({ className }) => {
  const { connected, publicKey, select, connect, disconnect, wallet, connecting } = useWallet();
  const [mounted, setMounted] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [mwaFailed, setMwaFailed] = useState(false);

  useEffect(() => {
    setMounted(true);
    const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
    const phantomInjected = !!(
      (window as any).phantom?.solana?.isPhantom ||
      (window as any).solana?.isPhantom
    );
    setIsMobile(mobile && !phantomInjected);
  }, []);

  // Pre-select MWA adapter on mobile so connect() knows which adapter to use
  useEffect(() => {
    if (mounted && isMobile && !connected && !wallet) {
      try { select(MWA_NAME); } catch { /* ignored */ }
    }
  }, [mounted, isMobile, connected, wallet, select]);

  // When MWA is selected and we just connected, clear any failure state
  useEffect(() => {
    if (connected) setMwaFailed(false);
  }, [connected]);

  const handleMobileConnect = useCallback(async () => {
    try {
      setMwaFailed(false);
      // Ensure MWA is selected
      if (!wallet || wallet.adapter.name !== MWA_NAME) {
        select(MWA_NAME);
        // Brief delay to let React update the selected adapter
        await new Promise(r => setTimeout(r, 150));
      }
      await connect();
    } catch (e) {
      console.error('Mobile wallet connect failed:', e);
      setMwaFailed(true);
    }
  }, [wallet, select, connect]);

  const openInPhantom = useCallback(() => {
    const url = encodeURIComponent(window.location.href);
    const ref = encodeURIComponent(window.location.origin);
    window.location.href = `https://phantom.app/ul/browse/${url}?ref=${ref}`;
  }, []);

  const openInSolflare = useCallback(() => {
    const url = encodeURIComponent(window.location.href);
    const ref = encodeURIComponent(window.location.origin);
    window.location.href = `https://solflare.com/ul/v1/browse/${url}?ref=${ref}`;
  }, []);

  if (!mounted) {
    return (
      <div className={className}>
        <div className="w-full py-3 px-4 bg-gray-600 rounded-lg text-white text-center">
          Loading...
        </div>
      </div>
    );
  }

  /* ── Desktop or already inside a wallet's in-app browser ── */
  if (!isMobile) {
    return (
      <div className="wallet-wrapper w-full">
        <WalletMultiButton className={className} />
        {connected && publicKey && (
          <p className="text-xs text-gray-400 mt-2 text-center">
            {publicKey.toBase58().slice(0, 4)}...{publicKey.toBase58().slice(-4)}
          </p>
        )}
      </div>
    );
  }

  /* ── Mobile — connected ── */
  if (connected && publicKey) {
    return (
      <div className="wallet-wrapper w-full">
        <div className="w-full py-3 px-4 rounded-lg bg-gradient-to-r from-green-500 to-emerald-500 text-white text-center font-semibold text-sm">
          ✓ {publicKey.toBase58().slice(0, 4)}…{publicKey.toBase58().slice(-4)}
        </div>
        <button
          onClick={() => disconnect()}
          className="w-full mt-2 py-2 px-4 rounded-lg text-xs text-gray-400 hover:text-white transition-colors text-center"
        >
          Disconnect
        </button>
      </div>
    );
  }

  /* ── Mobile — MWA failed → show fallback browse links ── */
  if (mwaFailed) {
    return (
      <div className="wallet-wrapper w-full flex flex-col gap-2">
        <p className="text-xs text-gray-400 text-center mb-1">
          Direct connect unavailable — open the site inside your wallet app instead:
        </p>
        <button
          onClick={openInPhantom}
          className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-lg font-semibold text-white transition-all duration-300"
          style={{ background: 'linear-gradient(135deg, #ab9ff2, #7c5fe6)' }}
        >
          Open in Phantom
        </button>
        <button
          onClick={openInSolflare}
          className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-lg font-semibold text-white transition-all duration-300"
          style={{ background: 'linear-gradient(135deg, #fc8f04, #f95c04)' }}
        >
          Open in Solflare
        </button>
        <button
          onClick={() => setMwaFailed(false)}
          className="text-xs text-gray-500 hover:text-gray-300 transition-colors mt-1 text-center"
        >
          ← Try again
        </button>
      </div>
    );
  }

  /* ── Mobile — primary connect button (triggers MWA) ── */
  return (
    <div className="wallet-wrapper w-full">
      <button
        onClick={handleMobileConnect}
        disabled={connecting}
        className={`w-full flex items-center justify-center gap-2 py-3 px-4 rounded-lg font-semibold text-white transition-all duration-300 ${
          connecting
            ? 'bg-gray-500 cursor-wait'
            : 'bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600'
        }`}
      >
        {connecting ? 'Connecting…' : 'Connect Wallet'}
      </button>
    </div>
  );
};

export default WalletClientWrapper;
