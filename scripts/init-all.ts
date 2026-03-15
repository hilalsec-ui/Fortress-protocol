#!/usr/bin/env npx ts-node
/**
 * Complete initialization script for Fortress Lottery
 * Initializes: Treasury, Pricing Config, Global Registry, and ALL Vaults (LPM/DPL/WPL/MPL)
 */

import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { 
  getAssociatedTokenAddressSync, 
  TOKEN_2022_PROGRAM_ID, 
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { FortressProtocol } from "../target/types/fortress_protocol";

const FPT_MINT = new PublicKey("3YTnzmFTECtyKDxaghWPQcjzX7g1Cj3NxMq41JdWk2rj");
const ADMIN_PUBKEY = new PublicKey("EANi5dM5CUbtoiJAN72JgKMSNM6bMWsSWMX1w1t2yWcv");

// Conversion rate: 0.5 FPT per 1 USD (with 6 decimals)
const INITIAL_RATE = 500_000;

async function main() {
  const fs = require('fs');
  const walletPath = process.env.ANCHOR_WALLET || '/home/dev/my-wallet.json';
  const walletKeypair = anchor.web3.Keypair.fromSecretKey(
    new Uint8Array(JSON.parse(fs.readFileSync(walletPath, 'utf-8')))
  );
  
  const connection = new anchor.web3.Connection('https://api.mainnet-beta.solana.com', 'confirmed');
  const wallet = new anchor.Wallet(walletKeypair);
  const provider = new anchor.AnchorProvider(connection, wallet, { commitment: 'confirmed' });
  anchor.setProvider(provider);

  const program = anchor.workspace.FortressProtocol as Program<FortressProtocol>;
  
  console.log("=".repeat(60));
  console.log("🏰 FORTRESS LOTTERY - COMPLETE INITIALIZATION");
  console.log("=".repeat(60));
  console.log("Program ID:", program.programId.toString());
  console.log("Admin:", walletKeypair.publicKey.toString());
  console.log("Network: Devnet");
  console.log("");

  // Step 1: Initialize Pricing Config
  console.log("📊 STEP 1: Initialize Pricing Config");
  console.log("-".repeat(60));
  const [pricingConfigPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("pricing_config")],
    program.programId
  );
  
  try {
    const config = await program.account.pricingConfig.fetch(pricingConfigPDA);
    console.log(`✅ Pricing Config already initialized`);
    console.log(`   Rate: ${config.fptToUsdRate.toNumber() / 1_000_000} FPT per USD`);
    console.log(`   Use Oracle: ${config.useOracle}`);
  } catch (e) {
    try {
      const tx = await program.methods.initializePricingConfig(new anchor.BN(INITIAL_RATE))
        .rpc();
      console.log(`✅ Pricing Config initialized!`);
      console.log(`   Rate: ${INITIAL_RATE / 1_000_000} FPT per USD`);
      console.log(`   Tx: ${tx.slice(0, 20)}...`);
    } catch (err: any) {
      console.error(`❌ Failed:`, err.message);
    }
  }
  console.log("");

  // Step 2: Initialize Treasury
  console.log("💰 STEP 2: Initialize Treasury");
  console.log("-".repeat(60));
  const [treasuryPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("treasury")],
    program.programId
  );
  
  try {
    const treasury = await program.account.treasury.fetch(treasuryPDA);
    console.log(`✅ Treasury already initialized`);
    console.log(`   Authority: ${treasury.authority.toString().slice(0, 20)}...`);
  } catch (e) {
    try {
      const tx = await program.methods.initializeTreasury()
        .rpc();
      console.log(`✅ Treasury initialized!`);
      console.log(`   Tx: ${tx.slice(0, 20)}...`);
    } catch (err: any) {
      console.error(`❌ Failed:`, err.message);
    }
  }
  console.log("");

  // Step 3: Initialize Global Registry
  console.log("📋 STEP 3: Initialize Global Registry");
  console.log("-".repeat(60));
  const [registryPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("registry")],
    program.programId
  );
  
  try {
    const registry = await program.account.globalRegistry.fetch(registryPDA);
    console.log(`✅ Global Registry already initialized`);
    console.log(`   Total Lotteries: ${registry.totalLotteries}`);
  } catch (e) {
    try {
      const tx = await program.methods.initializeGlobalRegistry()
        .rpc();
      console.log(`✅ Global Registry initialized!`);
      console.log(`   Tx: ${tx.slice(0, 20)}...`);
    } catch (err: any) {
      console.error(`❌ Failed:`, err.message);
    }
  }
  console.log("");

  // Step 4: Initialize ALL Vaults
  console.log("🏦 STEP 4: Initialize ALL Vaults");
  console.log("-".repeat(60));
  
  const lotteries = [
    { type: "LPM", tiers: [5, 10, 20, 50], method: "initializeLpmTier" },
    { type: "DPL", tiers: [5, 10, 15, 20], method: "initializeDplTier" },
    { type: "WPL", tiers: [5, 10, 15, 20], method: "initializeWplTier" },
    { type: "MPL", tiers: [5, 10, 15, 20], method: "initializeMplTier" },
  ];

  let successCount = 0;
  let failCount = 0;
  let skipCount = 0;

  for (const lottery of lotteries) {
    console.log(`\n${lottery.type} Lottery:`);
    for (const tier of lottery.tiers) {
      const vaultPrefix = `vault_${lottery.type.toLowerCase()}`;
      const [vaultPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from(vaultPrefix), Buffer.from([tier])],
        program.programId
      );
      
      const vaultTokenAccount = getAssociatedTokenAddressSync(
        FPT_MINT,
        vaultPDA,
        true,
        TOKEN_2022_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
      );
      
      try {
        const vault = await program.account.lotteryVault.fetch(vaultPDA);
        console.log(`  ✅ Tier ${tier}: Already initialized (${vault.participantCount} participants)`);
        skipCount++;
      } catch (e) {
        try {
          const tx = await (program.methods as any)[lottery.method](tier)
            .rpc();
          console.log(`  ✅ Tier ${tier}: Initialized! Tx: ${tx.slice(0, 16)}...`);
          successCount++;
        } catch (initErr: any) {
          console.error(`  ❌ Tier ${tier}: Failed - ${initErr.message}`);
          failCount++;
        }
      }
    }
  }

  console.log("");
  console.log("=".repeat(60));
  console.log("📊 INITIALIZATION SUMMARY");
  console.log("=".repeat(60));
  console.log(`✅ Success: ${successCount} vaults`);
  console.log(`⏭️  Skipped: ${skipCount} vaults (already initialized)`);
  console.log(`❌ Failed: ${failCount} vaults`);
  console.log("");
  console.log(`📋 Pricing Config PDA: ${pricingConfigPDA.toString()}`);
  console.log(`💰 Treasury PDA: ${treasuryPDA.toString()}`);
  console.log(`📋 Registry PDA: ${registryPDA.toString()}`);
  console.log("");
  console.log("✅ All initialization complete!");
  console.log("=".repeat(60));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
