#!/usr/bin/env npx ts-node
/**
 * Emergency Treasury Fix - Close and Reinitialize
 * The Treasury PDA has wrong size due to program upgrade
 */

import * as anchor from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";

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
  
  const [treasuryPDA, bump] = PublicKey.findProgramAddressSync(
    [Buffer.from("treasury")],
    program.programId
  );
  
  console.log("🔧 Treasury Fix Script");
  console.log("Treasury PDA:", treasuryPDA.toString());
  console.log("Admin:", walletKeypair.publicKey.toString());
  console.log("");
  
  // Check current account
  const accountInfo = await connection.getAccountInfo(treasuryPDA);
  if (!accountInfo) {
    console.log("✅ Treasury doesn't exist, can initialize fresh");
    try {
      const tx = await program.methods.initializeTreasury()
        .rpc();
      console.log("✅ Treasury initialized!", tx.slice(0, 20) + "...");
    } catch (err: any) {
      console.error("❌ Failed:", err.message);
    }
    return;
  }
  
  console.log("📊 Current Treasury Account:");
  console.log("  Size:", accountInfo.data.length, "bytes");
  console.log("  Lamports:", accountInfo.lamports);
  console.log("  Owner:", accountInfo.owner.toString());
  console.log("");
  
  // Close by sending remaining lamports to admin and reallocating to 0
  console.log("🗑️  Closing old Treasury account...");
  
  try {
    // Create a raw transaction to close the account
    // Transfer all lamports to admin, then reallocate to 0 bytes
    const ix = SystemProgram.transfer({
      fromPubkey: treasuryPDA,
      toPubkey: walletKeypair.publicKey,
      lamports: accountInfo.lamports - 890, // Keep min rent
    });
    
    const tx = new anchor.web3.Transaction().add(ix);
    
    // This won't work because Treasury PDA can't sign... we need an admin instruction
    console.log("❌ Can't close via SystemProgram (PDA can't sign)");
    console.log("");
    console.log("💡 SOLUTION: Need to add admin close_treasury instruction to program");
    console.log("   OR: Deploy to a new program ID");
    console.log("");
    console.log("🔄 WORKAROUND: Initialize vaults using Treasury Vault (sol_vault) instead");
    console.log("   The sol_vault PDA has 7.7 SOL and works correctly");
    console.log("");
    
    // Check Treasury Vault  
    const [treasuryVaultPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("sol_vault")],
      program.programId
    );
    const vaultInfo = await connection.getAccountInfo(treasuryVaultPDA);
    console.log("✅ Treasury Vault (sol_vault) Status:");
    console.log("   Address:", treasuryVaultPDA.toString());
    if (vaultInfo) {
      console.log("   Balance:", vaultInfo.lamports / 1e9, "SOL");
      console.log("   This can fund vault initializations!");
    }
    
  } catch (err: any) {
    console.error("Error:", err.message);
  }
}

main().then(() => process.exit(0)).catch(console.error);
