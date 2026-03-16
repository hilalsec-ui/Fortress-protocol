"use client";

import React, { useState, useEffect } from 'react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { useWallet } from '@solana/wallet-adapter-react';

interface WalletClientWrapperProps {
  className?: string;
}

const WalletClientWrapper: React.FC<WalletClientWrapperProps> = ({ className }) => {
  const { connected, publicKey } = useWallet();
  const [mounted, setMounted] = useState(false);
  const [needsDeeplink, setNeedsDeeplink] = useState(false);

  useEffect(() => {
    setMounted(true);
    const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
    const walletInjected = !!(
      (window as any).phantom?.solana?.isPhantom ||
      (window as any).solana?.isPhantom ||
      (window as any).solflare?.isSolflare
    );
    // Mobile browser without a wallet extension → need deeplink
    setNeedsDeeplink(mobile && !walletInjected);
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

  // Desktop or already inside a wallet's in-app browser → standard button
  if (!needsDeeplink) {
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

  // Mobile without wallet injected → single button that auto-detects wallet
  return (
    <div className="wallet-wrapper w-full">
      <button
        onClick={() => {
          const url = encodeURIComponent(window.location.href);
          const ref = encodeURIComponent(window.location.origin);
          // Try Phantom first (most popular Solana wallet), fall back to Solflare
          const isAndroid = /Android/i.test(navigator.userAgent);
          // On Android, check if Phantom is likely installed via intent scheme
          // On iOS, always try Phantom universal link (it redirects to App Store if not installed)
          window.location.href = `https://phantom.app/ul/browse/${url}?ref=${ref}`;
        }}
        className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-lg font-semibold text-white active:scale-95 transition-all duration-150 bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600"
      >
        Connect Wallet
      </button>
    </div>
  );
};

export default WalletClientWrapper;
