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
    
    // ── Auto-detect installed wallets ─────────────────────────────────────
    // Check if any Solana wallet extension is injected into window
    const detectInstalledWallets = () => {
      const installed = [];
      const w = window as any;
      
      if (w.phantom?.solana?.isPhantom) installed.push('Phantom');
      if (w.solflare?.isSolflare) installed.push('Solflare');
      if (w.backpack?.solana) installed.push('Backpack');
      if (w.magicEden?.solana) installed.push('Magic Eden');
      if (w.sollet) installed.push('Sollet');
      
      return installed;
    };
    
    const installedWallets = detectInstalledWallets();
    const hasWallet = installedWallets.length > 0;
    
    // Mobile browser without a wallet extension → need deeplink
    setNeedsDeeplink(mobile && !hasWallet);
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

  // Desktop or already inside a wallet's in-app browser → standard button with auto-detection
  if (!needsDeeplink) {
    return (
      <div className="wallet-wrapper w-full">
        {/* 
          WalletMultiButton automatically:
          1. Detects installed wallets (Phantom, Solflare, Backpack, etc.)
          2. Shows a dropdown of available wallets
          3. Connects to the selected wallet
          4. Remembers the choice via localStorage
        */}
        <WalletMultiButton className={className} />
        {connected && publicKey && (
          <p className="text-xs text-gray-400 mt-2 text-center">
            {publicKey.toBase58().slice(0, 4)}...{publicKey.toBase58().slice(-4)}
          </p>
        )}
      </div>
    );
  }

  // Mobile without wallet injected → button that opens Phantom (most popular deeplink)
  return (
    <div className="wallet-wrapper w-full">
      <button
        onClick={() => {
          const url = encodeURIComponent(window.location.href);
          const ref = encodeURIComponent(window.location.origin);
          
          // ── Auto-detect and suggest the most popular Solana wallet ────────
          // Phantom is most popular (~40% market share) — fallback to Solflare
          const isAndroid = /Android/i.test(navigator.userAgent);
          
          if (isAndroid) {
            // Android: Try Phantom app intent, fallback to browser link
            try {
              window.location.href = `https://phantom.app/ul/browse/${url}?ref=${ref}`;
            } catch {
              // Fallback to Solflare
              window.location.href = `https://solflare.com/ul/browse?target=${url}`;
            }
          } else {
            // iOS: Universal links (Phantom then Solflare)
            window.location.href = `https://phantom.app/ul/browse/${url}?ref=${ref}`;
          }
        }}
        className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-lg font-semibold text-white active:scale-95 transition-all duration-150 bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600"
      >
        🔗 Connect Wallet via Phantom
      </button>
      <p className="text-xs text-gray-400 mt-2 text-center">
        Phantom not installed? <a href="https://phantom.app/" target="_blank" rel="noopener noreferrer" className="text-purple-400 hover:text-purple-300">Download here</a>
      </p>
    </div>
  );
};

export default WalletClientWrapper;
