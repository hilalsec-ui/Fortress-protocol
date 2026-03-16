"use client";

import React, { useMemo, ReactNode } from 'react';
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { PhantomWalletAdapter } from '@solana/wallet-adapter-phantom';
import { SolflareWalletAdapter } from '@solana/wallet-adapter-solflare';
import { LedgerWalletAdapter } from '@solana/wallet-adapter-ledger';
import { BackpackWalletAdapter } from '@solana/wallet-adapter-backpack';
import { MagicEdenWalletAdapter } from '@solana/wallet-adapter-magiceden';
import { SolletWalletAdapter } from '@solana/wallet-adapter-sollet';
import {
  SolanaMobileWalletAdapter,
  createDefaultAddressSelector,
  createDefaultAuthorizationResultCache,
  createDefaultWalletNotFoundHandler,
} from '@solana-mobile/wallet-adapter-mobile';
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
      // Mobile: deep-links to Phantom/Solflare/any MWA-compatible wallet on Android & iOS
      new SolanaMobileWalletAdapter({
        addressSelector: createDefaultAddressSelector(),
        appIdentity: {
          name: 'Fortress Protocol',
          uri: typeof window !== 'undefined' ? window.location.origin : 'https://fortress-protocol.vercel.app',
          icon: '/favicon.ico',
        },
        authorizationResultCache: createDefaultAuthorizationResultCache(),
        cluster: 'mainnet-beta',
        onWalletNotFound: createDefaultWalletNotFoundHandler(),
      }),
      // ── Desktop Browser Extensions (auto-detected by order) ─────────────────
      // Each adapter detects if the wallet extension is installed.
      // If multiple are installed, users can choose from the dropdown.
      new PhantomWalletAdapter(),           // Most popular (~40% market share)
      new SolflareWalletAdapter(),          // Second most popular
      new BackpackWalletAdapter(),          // Growing fast (Xnft support)
      new MagicEdenWalletAdapter(),         // NFT marketplace + wallet
      new LedgerWalletAdapter(),            // Hardware wallet support
      new SolletWalletAdapter(),            // Web-based fallback
    ],
    []
  );

  const onError = (error: WalletError) => {
    console.error('🚨 Wallet connection error:', error.message);
    // Don't throw — let the user try again or use a fallback wallet
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
