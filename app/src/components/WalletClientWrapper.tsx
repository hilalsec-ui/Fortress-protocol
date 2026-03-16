"use client";

import React, { useState, useEffect } from 'react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { useWallet } from '@solana/wallet-adapter-react';

interface WalletClientWrapperProps {
  className?: string;
}

function isMobileBrowser(): boolean {
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
}

function isPhantomInjected(): boolean {
  return !!(
    (window as any).phantom?.solana?.isPhantom ||
    ((window as any).solana?.isPhantom)
  );
}

function openInPhantom() {
  const url = encodeURIComponent(window.location.href);
  const ref = encodeURIComponent(window.location.origin);
  window.location.href = `https://phantom.app/ul/browse/${url}?ref=${ref}`;
}

function openInSolflare() {
  const url = encodeURIComponent(window.location.href);
  window.location.href = `https://solflare.com/ul/v1/browse/${url}?ref=${encodeURIComponent(window.location.origin)}`;
}

const WalletClientWrapper: React.FC<WalletClientWrapperProps> = ({ className }) => {
  const { connected, publicKey } = useWallet();
  const [mounted, setMounted] = useState(false);
  const [showMobileButtons, setShowMobileButtons] = useState(false);

  useEffect(() => {
    setMounted(true);
    if (isMobileBrowser() && !isPhantomInjected()) {
      setShowMobileButtons(true);
    }
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

  // On mobile without an injected provider: show deep-link buttons so the user
  // can open the dApp inside the wallet's in-app browser (where the provider IS
  // injected and connect works normally).
  if (showMobileButtons && !connected) {
    return (
      <div className="wallet-wrapper w-full flex flex-col gap-2">
        <button
          onClick={openInPhantom}
          className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-lg font-semibold text-white transition-all duration-300"
          style={{ background: 'linear-gradient(135deg, #ab9ff2, #7c5fe6)' }}
        >
          {/* Phantom ghost icon */}
          <svg width="20" height="20" viewBox="0 0 128 128" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect width="128" height="128" rx="32" fill="#AB9FF2"/>
            <path d="M110.5 64.5C110.5 40.5 92 22 68 22C44 22 25.5 40.5 25.5 64.5C25.5 80 34 93.5 46.5 101V106.5C46.5 108.5 48 110 50 110H55C57 110 58.5 108.5 58.5 106.5V104H69.5V106.5C69.5 108.5 71 110 73 110H78C80 110 81.5 108.5 81.5 106.5V101C94 93.5 110.5 80 110.5 64.5Z" fill="white"/>
            <circle cx="53" cy="62" r="7" fill="#AB9FF2"/>
            <circle cx="75" cy="62" r="7" fill="#AB9FF2"/>
          </svg>
          Open in Phantom
        </button>
        <button
          onClick={openInSolflare}
          className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-lg font-semibold text-white transition-all duration-300"
          style={{ background: 'linear-gradient(135deg, #fc8f04, #f95c04)' }}
        >
          {/* Solflare sun icon */}
          <svg width="20" height="20" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="16" cy="16" r="16" fill="#FC8F04"/>
            <circle cx="16" cy="16" r="7" fill="white"/>
          </svg>
          Open in Solflare
        </button>
      </div>
    );
  }

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
};

export default WalletClientWrapper;
