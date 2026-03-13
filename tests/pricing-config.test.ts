/**
 * Fortress Lottery - Pricing Configuration Test Script
 * 
 * This script demonstrates:
 * 1. Initializing the pricing config with a rate (0.5 FPT per USD)
 * 2. Updating the rate (to 3.0 FPT per USD)
 * 3. Toggling oracle mode (enable/disable Pyth integration)
 * 
 * ⚠️ ADMIN ONLY - Requires the admin wallet private key
 */

import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { FortressProtocol } from "../target/types/fortress_protocol";
import { PublicKey, Keypair, SystemProgram } from "@solana/web3.js";
import { assert } from "chai";

describe("Fortress Pricing Configuration", () => {
  // Configure the client
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.FortressProtocol as Program<FortressProtocol>;

  // Admin wallet (hardcoded in program)
  const ADMIN_WALLET = new PublicKey("EzrUKQPTj7iEAvaJj9rnv4HKUhRGjj4bDLRsAEQfyaYg");

  // Derive PricingConfig PDA
  const [pricingConfigPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("pricing_config")],
    program.programId
  );

  console.log("🔧 Configuration:");
  console.log(`  Program ID: ${program.programId.toString()}`);
  console.log(`  Admin Wallet: ${ADMIN_WALLET.toString()}`);
  console.log(`  PricingConfig PDA: ${pricingConfigPDA.toString()}`);
  console.log(`  Provider Wallet: ${provider.wallet.publicKey.toString()}`);

  // ============================================================
  // TEST 1: Initialize Pricing Config
  // ============================================================
  it("Initialize pricing config with 0.5 FPT per USD", async () => {
    console.log("\n📝 TEST 1: Initializing pricing config...");

    // Rate: 0.5 FPT per 1 USD = 500_000 (6 decimals)
    const initialRate = new anchor.BN(500_000);

    try {
      const tx = await program.methods
        .initializePricingConfig(initialRate)
        .accounts({
          admin: provider.wallet.publicKey,
        })
        .rpc();

      console.log(`✅ Transaction signature: ${tx}`);

      // Fetch and verify the account
      const pricingConfig = await program.account.pricingConfig.fetch(pricingConfigPDA);

      console.log("📊 Pricing Config State:");
      console.log(`  Authority: ${pricingConfig.authority.toString()}`);
      console.log(`  FPT/USD Rate: ${pricingConfig.fptToUsdRate.toNumber() / 1_000_000} FPT per USD`);
      console.log(`  Use Oracle: ${pricingConfig.useOracle}`);
      console.log(`  Staleness Threshold: ${pricingConfig.oracleStalenessThreshold.toString()} seconds`);
      console.log(`  Last Updated: ${new Date(pricingConfig.lastUpdated.toNumber() * 1000).toISOString()}`);

      // Assertions
      assert.equal(pricingConfig.authority.toString(), provider.wallet.publicKey.toString());
      assert.equal(pricingConfig.fptToUsdRate.toNumber(), 500_000);
      assert.equal(pricingConfig.useOracle, false);
      assert.equal(pricingConfig.oracleStalenessThreshold.toNumber(), 60);
    } catch (error) {
      console.error("❌ Error:", error);
      throw error;
    }
  });

  // ============================================================
  // TEST 2: Update Exchange Rate
  // ============================================================
  it("Update rate to 3.0 FPT per USD", async () => {
    console.log("\n📝 TEST 2: Updating exchange rate...");

    // New rate: 3.0 FPT per 1 USD = 3_000_000 (6 decimals)
    const newRate = new anchor.BN(3_000_000);

    try {
      const tx = await program.methods
        .updateRate(newRate)
        .accounts({
          admin: provider.wallet.publicKey,
        })
        .rpc();

      console.log(`✅ Transaction signature: ${tx}`);

      // Fetch and verify
      const pricingConfig = await program.account.pricingConfig.fetch(pricingConfigPDA);

      console.log("📊 Updated Rate:");
      console.log(`  New Rate: ${pricingConfig.fptToUsdRate.toNumber() / 1_000_000} FPT per USD`);

      assert.equal(pricingConfig.fptToUsdRate.toNumber(), 3_000_000);
    } catch (error) {
      console.error("❌ Error:", error);
      throw error;
    }
  });

  // ============================================================
  // TEST 3: Toggle Oracle Mode
  // ============================================================
  it("Toggle oracle mode (enable then disable)", async () => {
    console.log("\n📝 TEST 3: Toggling oracle mode...");

    // Enable oracle
    try {
      console.log("  Enabling oracle mode...");
      const tx1 = await program.methods
        .toggleOracle(true)
        .accounts({
          admin: provider.wallet.publicKey,
        })
        .rpc();

      console.log(`  ✅ Enabled: ${tx1}`);

      let pricingConfig = await program.account.pricingConfig.fetch(pricingConfigPDA);
      assert.equal(pricingConfig.useOracle, true);

      // Disable oracle
      console.log("  Disabling oracle mode...");
      const tx2 = await program.methods
        .toggleOracle(false)
        .accounts({
          admin: provider.wallet.publicKey,
        })
        .rpc();

      console.log(`  ✅ Disabled: ${tx2}`);

      pricingConfig = await program.account.pricingConfig.fetch(pricingConfigPDA);
      assert.equal(pricingConfig.useOracle, false);

      console.log("📊 Oracle Mode: DISABLED (manual rate active)");
    } catch (error) {
      console.error("❌ Error:", error);
      throw error;
    }
  });

  // ============================================================
  // TEST 4: Update Staleness Threshold
  // ============================================================
  it("Update staleness threshold to 120 seconds", async () => {
    console.log("\n📝 TEST 4: Updating staleness threshold...");

    const newThreshold = new anchor.BN(120);

    try {
      const tx = await program.methods
        .updateStalenessThreshold(newThreshold)
        .accounts({
          admin: provider.wallet.publicKey,
        })
        .rpc();

      console.log(`✅ Transaction signature: ${tx}`);

      const pricingConfig = await program.account.pricingConfig.fetch(pricingConfigPDA);

      console.log("📊 Updated Threshold:");
      console.log(`  New Threshold: ${pricingConfig.oracleStalenessThreshold.toString()} seconds`);

      assert.equal(pricingConfig.oracleStalenessThreshold.toNumber(), 120);
    } catch (error) {
      console.error("❌ Error:", error);
      throw error;
    }
  });

  // ============================================================
  // TEST 5: Price Calculation Examples
  // ============================================================
  it("Display price calculations for all tiers", async () => {
    console.log("\n📝 TEST 5: Price calculation examples");

    const pricingConfig = await program.account.pricingConfig.fetch(pricingConfigPDA);
    const rate = pricingConfig.fptToUsdRate.toNumber();

    console.log(`\n📊 Current Rate: ${rate / 1_000_000} FPT per USD\n`);

    // LPM Tiers: 5, 10, 20, 50 USD
    console.log("💎 LPM (Lightning Pool) Tiers:");
    [5, 10, 20, 50].forEach((tierUSD) => {
      const tierPrice = tierUSD * 1_000_000; // USD in base units
      const requiredDPT = (tierPrice * rate) / 1_000_000;
      console.log(`  Tier ${tierUSD} USD = ${requiredDPT / 1_000_000} FPT`);
    });

    // Time-based tiers: 5, 10, 15, 20 USD
    console.log("\n⏰ Time-based Pools (DPL/WPL/MPL/YPL) Tiers:");
    [5, 10, 15, 20].forEach((tierUSD) => {
      const tierPrice = tierUSD * 1_000_000;
      const requiredDPT = (tierPrice * rate) / 1_000_000;
      console.log(`  Tier ${tierUSD} USD = ${requiredDPT / 1_000_000} FPT`);
    });
  });

  // ============================================================
  // TEST 6: Authorization Test (Should Fail)
  // ============================================================
  it("Non-admin cannot update rate (should fail)", async () => {
    console.log("\n📝 TEST 6: Testing authorization...");

    // Generate a random non-admin keypair
    const nonAdmin = Keypair.generate();

    // Airdrop some SOL to the non-admin for transaction fees
    const airdropSig = await provider.connection.requestAirdrop(
      nonAdmin.publicKey,
      1 * anchor.web3.LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(airdropSig);

    const newRate = new anchor.BN(999_999);

    try {
      await program.methods
        .updateRate(newRate)
        .accounts({
          admin: nonAdmin.publicKey,
        })
        .signers([nonAdmin])
        .rpc();

      // If we reach here, the test should fail
      assert.fail("Non-admin was able to update rate (this should not happen)");
    } catch (error) {
      const err = error as any;
      console.log("✅ Authorization check passed: Non-admin rejected");
      console.log(`  Error: ${err.message || String(error)}`);
      
      // Verify it's an authorization error
      assert.include(String(error).toLowerCase(), "address");
    }
  });
});

// ============================================================
// HELPER: Display Current Config
// ============================================================
async function displayCurrentConfig() {
  const provider = anchor.AnchorProvider.env();
  const program = anchor.workspace.FortressProtocol as Program<FortressProtocol>;

  const [pricingConfigPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("pricing_config")],
    program.programId
  );

  try {
    const config = await program.account.pricingConfig.fetch(pricingConfigPDA);
    
    console.log("\n" + "=".repeat(60));
    console.log("📋 CURRENT PRICING CONFIGURATION");
    console.log("=".repeat(60));
    console.log(`Authority: ${config.authority.toString()}`);
    console.log(`Rate: ${config.fptToUsdRate.toNumber() / 1_000_000} FPT per USD`);
    console.log(`Oracle Mode: ${config.useOracle ? "ENABLED" : "DISABLED"}`);
    console.log(`Staleness Threshold: ${config.oracleStalenessThreshold.toString()} seconds`);
    console.log(`Last Updated: ${new Date(config.lastUpdated.toNumber() * 1000).toISOString()}`);
    console.log("=".repeat(60) + "\n");
  } catch (error) {
    console.log("⚠️  Pricing config not yet initialized");
  }
}

// Export for CLI usage
if (require.main === module) {
  displayCurrentConfig();
}
