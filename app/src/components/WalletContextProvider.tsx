"use client";

import React, { useMemo, ReactNode } from 'react';
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { PhantomWalletAdapter } from '@solana/wallet-adapter-phantom';
import { SolflareWalletAdapter } from '@solana/wallet-adapter-solflare';
import { LedgerWalletAdapter } from '@solana/wallet-adapter-ledger';
import { SolletWalletAdapter } from '@solana/wallet-adapter-sollet';
import { BackpackWalletAdapter } from '@solana/wallet-adapter-backpack';
import { MagicEdenWalletAdapter } from '@solana/wallet-adapter-magiceden';
import { clusterApiUrl } from '@solana/web3.js';
import { WalletError } from '@solana/wallet-adapter-base';
import '@solana/wallet-adapter-react-ui/styles.css';

interface WalletContextProviderProps {
  children: ReactNode;
}

export default function WalletContextProvider({ children }: WalletContextProviderProps) {
  const endpoint = useMemo(() => process.env.NEXT_PUBLIC_RPC_URL ?? clusterApiUrl('mainnet-beta'), []);
  
  const wallets = useMemo(
    () => [
      // Phantom needs explicit adapter for full compatibility
      new PhantomWalletAdapter(),
      new SolflareWalletAdapter(),
      new LedgerWalletAdapter(),
      new SolletWalletAdapter(),
      new BackpackWalletAdapter(),
      new MagicEdenWalletAdapter(),
    ],
    []
  );

  const onError = (error: WalletError) => {
    // Log wallet errors for debugging
    console.error('🚨 Wallet Error:', error.message);
    // Show error to user via toast if needed
  };

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider 
        wallets={wallets} 
        autoConnect={true}
        onError={onError}
        localStorageKey="walletAdapter"
      >
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
