#!/usr/bin/env npx ts-node
/**
 * Withdraw all SOL from Treasury Vault (sol_vault)
 */

import * as anchor from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";

async function main() {
  const fs = require('fs');
  const walletPath = '/home/dev/my-wallet.json';
  const walletKeypair = anchor.web3.Keypair.fromSecretKey(
    new Uint8Array(JSON.parse(fs.readFileSync(walletPath, 'utf-8')))
  );
  
  const connection = new anchor.web3.Connection('https://api.mainnet-beta.solana.com', 'confirmed');
  const wallet = new anchor.Wallet(walletKeypair);
  const provider = new anchor.AnchorProvider(connection, wallet, { commitment: 'confirmed' });
  anchor.setProvider(provider);

  const program = anchor.workspace.FortressProtocol;
  
  const [treasuryVaultPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("sol_vault")],
    program.programId
  );
  
  const [treasuryPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("treasury")],
    program.programId
  );
  
  console.log("💰 Withdrawing from Treasury Vault");
  console.log("=".repeat(60));
  console.log("Treasury Vault:", treasuryVaultPDA.toString());
  console.log("Admin:", walletKeypair.publicKey.toString());
  console.log("");
  
  // Check current balance
  const balance = await connection.getBalance(treasuryVaultPDA);
  const balanceSol = balance / 1e9;
  
  console.log("Current Balance:", balanceSol.toFixed(8), "SOL");
  console.log("");
  
  if (balance === 0) {
    console.log("❌ Treasury Vault is empty!");
    return;
  }
  
  // Withdraw ALL (leave just enough for rent exemption)
  const rentExempt = await connection.getMinimumBalanceForRentExemption(0);
  const withdrawAmount = balance - rentExempt;
  
  console.log("Withdrawing:", (withdrawAmount / 1e9).toFixed(8), "SOL");
  console.log("Keeping for rent:", (rentExempt / 1e9).toFixed(8), "SOL");
  console.log("");
  
  try {
    const tx = await program.methods
      .withdrawFromTreasuryVault(new anchor.BN(withdrawAmount))
      .rpc();
    
    console.log("✅ Withdrawal successful!");
    console.log("Transaction:", tx);
    console.log("");
    
    // Check new balance
    const newBalance = await connection.getBalance(treasuryVaultPDA);
    const adminBalance = await connection.getBalance(walletKeypair.publicKey);
    
    console.log("📊 Final Balances:");
    console.log("Treasury Vault:", (newBalance / 1e9).toFixed(8), "SOL");
    console.log("Admin Wallet:", (adminBalance / 1e9).toFixed(8), "SOL");
    
  } catch (err: any) {
    console.error("❌ Withdrawal failed:", err.message);
    if (err.logs) {
      console.error("\nLogs:");
      err.logs.forEach((log: string) => console.error("  ", log));
    }
  }
}

main().then(() => process.exit(0)).catch(console.error);
