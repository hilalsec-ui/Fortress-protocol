#!/usr/bin/env npx ts-node
/**
 * Quick validation script to test your crank configuration
 * 
 * Usage: npx ts-node validate-config.ts
 * 
 * This script will:
 *   1. Load and validate all environment variables
 *   2. Print a security checklist
 *   3. Suggest next steps if anything is missing
 */

import { CONFIG } from "./config";

console.log("\n" + "=".repeat(60));
console.log("🔐 FORTRESS CRANK — CONFIGURATION VALIDATION");
console.log("=".repeat(60) + "\n");

console.log("📋 Loaded Configuration:\n");

const configItems = [
  { name: "Helius API Key", value: CONFIG.heliusApiKey.substring(0, 8) + "…" },
  { name: "RPC URL", value: CONFIG.rpcUrl.substring(0, 50) + "…" },
  { name: "RPC Fallback", value: CONFIG.rpcFallback },
  { name: "RPC Timeout", value: `${CONFIG.rpcTimeoutMs}ms` },
  { name: "RPC Max Retries", value: String(CONFIG.rpcMaxRetries) },
  { name: "RPC Retry Delay", value: `${CONFIG.rpcRetryDelayMs}ms` },
  { name: "Node Env", value: CONFIG.nodeEnv },
  { name: "Balance Warning", value: `${CONFIG.crankBalanceWarningSol} SOL` },
];

configItems.forEach(({ name, value }) => {
  console.log(`   ✓ ${name.padEnd(25)} ${value}`);
});

console.log("\n");

if (CONFIG.crankPrivateKey) {
  console.log("✓ CRANK_PRIVATE_KEY detected (will use for signing)");
} else if (CONFIG.anchorWallet) {
  console.log(`✓ ANCHOR_WALLET detected (will use: ${CONFIG.anchorWallet})`);
} else {
  console.log("✗ Neither CRANK_PRIVATE_KEY nor ANCHOR_WALLET provided");
}

if (CONFIG.lotteryType && CONFIG.tier) {
  console.log(`✓ Targeted mode: ${CONFIG.lotteryType} tier ${CONFIG.tier}`);
} else {
  console.log("✓ Full scan mode: All 16 vaults");
}

console.log("\n" + "=".repeat(60));
console.log("🚀 NEXT STEPS");
console.log("=".repeat(60) + "\n");

console.log("1. Review the configuration above ✓\n");

if (!CONFIG.crankPrivateKey && !CONFIG.anchorWallet) {
  console.log("2. ⚠️  Add your crank private key to .env:\n");
  console.log("   Option A (Base58 export from Phantom):");
  console.log("   CRANK_PRIVATE_KEY=<base58-string>\n");
  console.log("   Option B (JSON from Solana CLI):");
  console.log("   CRANK_PRIVATE_KEY=[1,2,3,...,64]\n");
  console.log("   Option C (Keypair file path):");
  console.log("   ANCHOR_WALLET=/path/to/keypair.json\n");
}

console.log("3. Monitor RPC usage: https://dashboard.helius.dev\n");

console.log("4. Run the crank:\n");
console.log("   $ source .env && npx ts-node index.ts\n");

console.log("=".repeat(60) + "\n");

process.exit(CONFIG.crankPrivateKey || CONFIG.anchorWallet ? 0 : 1);
