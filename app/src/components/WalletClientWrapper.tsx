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

  useEffect(() => {
    setMounted(true);
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
