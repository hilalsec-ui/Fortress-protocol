"use client";

import { useState } from "react";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { PublicKey, Transaction, SystemProgram } from "@solana/web3.js";
import { motion } from "framer-motion";
import { Heart, Loader2, CheckCircle2, XCircle, ExternalLink, Copy, CheckCheck, Shield, Zap, Users } from "lucide-react";
import { useTheme } from "@/contexts/ThemeContext";
import { ADMIN_WALLET as ADMIN_WALLET_STRING } from "@/utils/constants";

const ADMIN_WALLET = new PublicKey(ADMIN_WALLET_STRING);

export default function DonatePage() {
  const { isDarkMode } = useTheme();
  const { publicKey, sendTransaction } = useWallet();
  const { connection } = useConnection();
  const [amount, setAmount] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [txStatus, setTxStatus] = useState<"idle" | "success" | "error">("idle");
  const [txSignature, setTxSignature] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [copied, setCopied] = useState(false);

  const c = {
    card: isDarkMode ? "bg-white/[0.03] backdrop-blur-md border border-white/10" : "bg-white shadow-md border border-gray-100",
    h: isDarkMode ? "text-white" : "text-gray-900",
    body: isDarkMode ? "text-gray-300" : "text-gray-700",
    muted: isDarkMode ? "text-gray-400" : "text-gray-600",
    subtle: isDarkMode ? "text-gray-500" : "text-gray-400",
  };

  const copyAddress = () => {
    navigator.clipboard.writeText(ADMIN_WALLET.toString());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDonate = async () => {
    if (!publicKey || !amount || parseFloat(amount) <= 0) {
      setErrorMessage("Please enter a valid amount");
      setTxStatus("error");
      return;
    }

    try {
      setIsLoading(true);
      setTxStatus("idle");
      setErrorMessage("");

      const balance = await connection.getBalance(publicKey);
      const balanceInSol = balance / 1_000_000_000;
      const lamports = Math.floor(parseFloat(amount) * 1_000_000_000);
      const estimatedFee = 5000;
      const totalRequired = lamports + estimatedFee;

      if (balance < totalRequired) {
        throw new Error(`Insufficient balance. You have ${balanceInSol.toFixed(4)} SOL but need ${(totalRequired / 1_000_000_000).toFixed(4)} SOL (including fees)`);
      }

      const transferInstruction = SystemProgram.transfer({
        fromPubkey: publicKey,
        toPubkey: ADMIN_WALLET,
        lamports,
      });

      const transaction = new Transaction().add(transferInstruction);
      const signature = await sendTransaction(transaction, connection);

      const latestBlockhash = await connection.getLatestBlockhash();
      await connection.confirmTransaction(
        {
          signature,
          blockhash: latestBlockhash.blockhash,
          lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
        },
        "confirmed",
      );

      setTxSignature(signature);
      setTxStatus("success");
      setAmount("");
    } catch (error: any) {
      console.error("Donation error:", error);
      let errorMsg = "Transaction failed. Please try again.";
      if (error.message?.includes("Insufficient balance")) errorMsg = error.message;
      else if (error.message?.includes("User rejected")) errorMsg = "Transaction was cancelled";
      else if (error.message) errorMsg = error.message;
      setErrorMessage(errorMsg);
      setTxStatus("error");
    } finally {
      setIsLoading(false);
    }
  };

  const quickAmounts = [0.1, 0.5, 1, 5, 10];

  return (
    <div className="min-h-screen">
      {/* Background glows */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden -z-10">
        <div className="absolute top-1/4 left-1/3 w-96 h-96 bg-pink-500/10 rounded-full blur-3xl" />
        <div className="absolute bottom-1/3 right-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl" />
      </div>

      <div className="max-w-3xl mx-auto px-4 sm:px-8 py-12 space-y-8">
        {/* ═══ HERO ═══ */}
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="text-center pt-4">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", delay: 0.15 }}
            className="w-20 h-20 mx-auto mb-6 bg-gradient-to-br from-pink-500 to-purple-600 rounded-2xl flex items-center justify-center shadow-lg shadow-pink-500/25"
          >
            <Heart className="w-10 h-10 text-white" fill="white" />
          </motion.div>
          <h1
            className={`text-4xl sm:text-5xl font-black mb-3 leading-tight ${
              isDarkMode
                ? "bg-gradient-to-r from-pink-400 via-purple-400 to-fuchsia-400 bg-clip-text text-transparent"
                : "bg-gradient-to-r from-pink-600 via-purple-600 to-fuchsia-600 bg-clip-text text-transparent"
            }`}
          >
            Support Fortress
          </h1>
          <p className={`text-lg max-w-lg mx-auto ${c.muted}`}>Help us build the most transparent lottery protocol on Solana. Every SOL goes toward development and infrastructure.</p>
        </motion.div>

        {/* ═══ WHY DONATE CARDS ═══ */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="grid grid-cols-3 gap-3">
          {[
            { icon: Shield, label: "Open Source", desc: "100% transparent code", color: "cyan" },
            { icon: Zap, label: "Solana Native", desc: "Fast & low-cost infra", color: "purple" },
            { icon: Users, label: "Community First", desc: "Built for the people", color: "pink" },
          ].map((item, i) => (
            <div key={i} className={`rounded-2xl p-4 text-center ${c.card}`}>
              <div className={`w-10 h-10 mx-auto mb-2 rounded-xl flex items-center justify-center bg-${item.color}-500/10`}>
                <item.icon className={`w-5 h-5 text-${item.color}-${isDarkMode ? "400" : "600"}`} />
              </div>
              <div className={`text-sm font-bold ${c.h}`}>{item.label}</div>
              <div className={`text-xs mt-0.5 ${c.subtle}`}>{item.desc}</div>
            </div>
          ))}
        </motion.div>

        {/* ═══ MAIN CARD ═══ */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className={`rounded-2xl p-6 sm:p-8 ${c.card}`}>
          {!publicKey ? (
            <div className="text-center py-8">
              <div className={`text-lg font-semibold mb-3 ${c.h}`}>Connect your wallet to donate</div>
              <p className={`text-sm mb-6 ${c.muted}`}>You&apos;ll need a Solana wallet with SOL to make a donation.</p>
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => {
                  const menuButton = document.querySelector('button[aria-label="Open menu"]') as HTMLButtonElement;
                  if (menuButton) menuButton.click();
                }}
                className="px-8 py-3.5 rounded-xl font-bold text-lg bg-gradient-to-r from-pink-500 to-purple-500 hover:from-pink-400 hover:to-purple-400 text-white shadow-lg shadow-pink-500/25 transition-all"
              >
                Connect Wallet
              </motion.button>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Quick Amount Buttons */}
              <div>
                <label id="quick-amount-label" className={`block text-sm font-semibold mb-3 ${c.h}`}>
                  Quick Select (SOL)
                </label>
                <div className="grid grid-cols-5 gap-2" role="group" aria-labelledby="quick-amount-label">
                  {quickAmounts.map((qa) => (
                    <button
                      key={qa}
                      onClick={() => setAmount(qa.toString())}
                      disabled={isLoading}
                      className={`py-3 rounded-xl font-bold text-sm transition-all ${
                        amount === qa.toString()
                          ? "bg-gradient-to-r from-pink-500 to-purple-500 text-white shadow-lg shadow-pink-500/25 scale-105"
                          : isDarkMode
                            ? "bg-white/[0.05] border border-white/10 text-gray-300 hover:bg-white/10"
                            : "bg-gray-50 border border-gray-200 text-gray-700 hover:bg-gray-100"
                      }`}
                    >
                      {qa}
                    </button>
                  ))}
                </div>
              </div>

              {/* Custom Amount Input */}
              <div>
                <label htmlFor="custom-amount" className={`block text-sm font-semibold mb-2 ${c.h}`}>
                  Custom Amount (SOL)
                </label>
                <input
                  id="custom-amount"
                  name="amount"
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="Enter SOL amount"
                  disabled={isLoading}
                  className={`w-full px-4 py-3 rounded-xl text-lg font-semibold transition-all ${
                    isDarkMode
                      ? "bg-white/[0.05] border border-white/10 text-white placeholder-gray-600 focus:border-pink-500/50"
                      : "bg-gray-50 border border-gray-200 text-gray-900 placeholder-gray-400 focus:border-pink-500"
                  } focus:outline-none focus:ring-2 focus:ring-pink-500/30`}
                  min="0"
                  step="0.01"
                />
              </div>

              {/* Donate Button */}
              <button
                onClick={handleDonate}
                disabled={isLoading || !amount || parseFloat(amount) <= 0}
                className={`w-full py-4 rounded-xl font-bold text-lg transition-all ${
                  isLoading || !amount || parseFloat(amount) <= 0
                    ? isDarkMode
                      ? "bg-white/[0.05] text-gray-600 cursor-not-allowed"
                      : "bg-gray-100 text-gray-400 cursor-not-allowed"
                    : "bg-gradient-to-r from-pink-500 to-purple-500 hover:from-pink-400 hover:to-purple-400 text-white shadow-lg shadow-pink-500/25 hover:shadow-pink-500/40 hover:scale-[1.02]"
                }`}
              >
                {isLoading ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Processing...
                  </span>
                ) : (
                  `Donate ${amount || "0"} SOL`
                )}
              </button>

              {/* Transaction Status */}
              {txStatus === "success" && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="p-4 rounded-xl bg-green-500/10 border border-green-500/20">
                  <div className="flex items-center gap-3">
                    <CheckCircle2 className="w-6 h-6 text-green-500 shrink-0" />
                    <div>
                      <p className="text-green-500 font-semibold">Donation Successful!</p>
                      <a
                        href={`https://solscan.io/tx/${txSignature}?cluster=devnet`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-sm text-green-400 hover:text-green-300 transition-colors"
                      >
                        View on Solscan <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  </div>
                </motion.div>
              )}

              {txStatus === "error" && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="p-4 rounded-xl bg-red-500/10 border border-red-500/20">
                  <div className="flex items-center gap-3">
                    <XCircle className="w-6 h-6 text-red-500 shrink-0" />
                    <div>
                      <p className="text-red-500 font-semibold">Transaction Failed</p>
                      <p className="text-sm text-red-400">{errorMessage}</p>
                    </div>
                  </div>
                </motion.div>
              )}
            </div>
          )}
        </motion.div>

        {/* ═══ DESTINATION WALLET ═══ */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className={`rounded-2xl p-5 ${c.card}`}>
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <div className={`text-xs uppercase tracking-wider font-semibold mb-1 ${c.subtle}`}>Donation Wallet</div>
              <div className={`font-mono text-sm break-all ${c.body}`}>{ADMIN_WALLET.toString()}</div>
            </div>
            <button
              onClick={copyAddress}
              className={`shrink-0 p-2.5 rounded-xl transition-colors ${isDarkMode ? "bg-white/5 hover:bg-white/10 text-gray-400" : "bg-gray-50 hover:bg-gray-100 text-gray-500"}`}
              aria-label="Copy address"
            >
              {copied ? <CheckCheck className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>
        </motion.div>

        {/* ═══ THANK YOU ═══ */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }} className="text-center pb-12">
          <p className={`text-lg font-bold mb-1 ${c.h}`}>Thank you for your support</p>
          <p className={`text-sm ${c.muted}`}>Every contribution helps us build a better, fairer lottery for everyone.</p>
        </motion.div>
      </div>
    </div>
  );
}
