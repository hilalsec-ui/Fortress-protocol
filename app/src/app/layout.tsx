"use client";

import "./globals.css";
import { useMemo, useEffect } from 'react';
import { Toaster } from 'react-hot-toast';
import Layout from '@/components/Layout';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { ThemeProvider } from '@/contexts/ThemeContext';
import WalletContextProvider from '@/components/WalletContextProvider';
import { SolanaHeartbeatInitializer } from '@/components/SolanaHeartbeatInitializer';
import { ChainDataProvider } from '@/contexts/ChainDataContext';
import { FptPriceProvider } from '@/contexts/FptPriceContext';

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Suppress console warnings and errors that are not critical
  useEffect(() => {
    const originalLog = console.log;
    const originalWarn = console.warn;
    const originalError = console.error;
    const originalInfo = console.info;

    // Helper function to check if message should be suppressed
    const shouldSuppress = (args: any[]): boolean => {
      const msg = args.map(arg => {
        if (typeof arg === 'string') return arg;
        if (typeof arg === 'object' && arg !== null) {
          try {
            return JSON.stringify(arg);
          } catch {
            return String(arg);
          }
        }
        return String(arg);
      }).join(' ');

      return (
        msg.includes('Download the React DevTools') ||
        msg.includes('Phantom was registered as a Standard Wallet') ||
        msg.includes('The Wallet Adapter for Phantom') ||
        msg.includes('can be removed from your app') ||
        msg.includes('📦 IDL loaded') ||
        msg.includes('IDL loaded') ||
        msg.includes('useAnchorProgram') ||
        msg.includes('bigint: Failed to load') ||
        msg.includes('pure JS will be used')
      );
    };

    // Suppress informational messages and warnings
    console.log = (...args: any[]) => {
      if (!shouldSuppress(args)) {
        originalLog(...args);
      }
    };

    console.info = (...args: any[]) => {
      if (!shouldSuppress(args)) {
        originalInfo(...args);
      }
    };

    console.warn = (...args: any[]) => {
      if (!shouldSuppress(args)) {
        originalWarn(...args);
      }
    };

    console.error = (...args: any[]) => {
      const msg = String(args[0] || '');
      // Suppress wallet-related errors
      if (
        msg.includes('WalletConnectionError') ||
        msg.includes('WalletNotConnectedError') ||
        (msg.includes('wallet') && msg.includes('error'))
      ) {
        return; // Don't log wallet errors
      }
      originalError(...args);
    };

    return () => {
      console.log = originalLog;
      console.warn = originalWarn;
      console.error = originalError;
      console.info = originalInfo;
    };
  }, []);

  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=5.0, user-scalable=yes, viewport-fit=cover" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="theme-color" content="#4f46e5" />
      </head>
      <body
        className="antialiased"
      >
        <ThemeProvider>
          <ErrorBoundary>
            <WalletContextProvider>
              <SolanaHeartbeatInitializer />
              <ChainDataProvider>
                <FptPriceProvider>
                  <Layout>
                    {children}
                  </Layout>
                </FptPriceProvider>
              </ChainDataProvider>
              <Toaster
                position="top-right"
                toastOptions={{
                  style: {
                    background: '#1a1a1a',
                    color: '#ffffff',
                    border: '1px solid #333',
                    borderRadius: '8px',
                    padding: '12px 16px',
                  },
                  success: {
                    iconTheme: {
                      primary: '#10b981',
                      secondary: '#ffffff',
                    },
                  },
                  error: {
                    iconTheme: {
                      primary: '#ef4444',
                      secondary: '#ffffff',
                    },
                  },
                  loading: {
                    iconTheme: {
                      primary: '#3b82f6',
                      secondary: '#ffffff',
                    },
                  },
                }}
              />
            </WalletContextProvider>
          </ErrorBoundary>
        </ThemeProvider>
      </body>
    </html>
  );
}
