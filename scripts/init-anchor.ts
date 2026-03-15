#!/usr/bin/env node
const anchor = require("@coral-xyz/anchor");
const { Connection, Keypair, PublicKey, SystemProgram } = require("@solana/web3.js");
const { getAssociatedTokenAddressSync } = require("@solana/spl-token");
const fs = require("fs");
const path = require("path");

const PROGRAM_ID = new PublicKey("EB6kkg2sW5rnukjRH7Ljhz78gbfc36XZAuiFn5jdefF3");
const FPT_MINT = new PublicKey("3YTnzmFTECtyKDxaghWPQcjzX7g1Cj3NxMq41JdWk2rj");
const RPC = "https://api.mainnet-beta.solana.com";

// Define TypeScript types for better type safety
type LotteryType = 'LPM' | 'DPL' | 'WPL' | 'MPL' | 'YPL';

const LOTTERY_TYPES: Record<LotteryType, number> = { LPM: 0, DPL: 1, WPL: 2, MPL: 3, YPL: 4 };
const TIERS: Record<LotteryType, number[]> = {
  LPM: [5, 10, 20, 50],
  DPL: [5, 10, 15, 20],
  WPL: [5, 10, 15, 20],
  MPL: [5, 10, 15, 20],
  YPL: [5, 10, 15, 20],
};

async function main() {
  console.log("🔧 INITIALIZING VAULTS WITH ANCHOR\n");

  const connection = new Connection(RPC, "confirmed");

  const walletPath = process.env.ANCHOR_WALLET || '/home/dev/my-wallet.json';

  if (!fs.existsSync(walletPath)) {
    console.error(`❌ Wallet not found: ${walletPath}`);
    process.exit(1);
  }

  const keypair = Keypair.fromSecretKey(Buffer.from(JSON.parse(fs.readFileSync(walletPath, "utf-8"))));

  const wallet = new anchor.Wallet(keypair);
  const provider = new anchor.AnchorProvider(connection, wallet, { commitment: "confirmed" });

  // Load IDL
  const idlPath = "./target/idl/fortress_protocol.json";
  if (!fs.existsSync(idlPath)) {
    console.error("❌ IDL not found. Run: anchor build");
    process.exit(1);
  }

  const idl = JSON.parse(fs.readFileSync(idlPath, "utf-8"));
  const program = new anchor.Program(idl, PROGRAM_ID, provider);

  console.log(`👤 Authority: ${keypair.publicKey.toString()}`);
  console.log(`💻 Program: ${PROGRAM_ID.toString()}`);
  console.log(`💰 Mint: ${FPT_MINT.toString()}\n`);

  console.log("━".repeat(70));
  console.log("INITIALIZING LOTTERY VAULTS");
  console.log("━".repeat(70));

  let successCount = 0;
  let errorCount = 0;

  for (const [lotteryType, typeNum] of Object.entries(LOTTERY_TYPES) as [LotteryType, number][]) {
    const tiers = TIERS[lotteryType];
    console.log(`\n📍 ${lotteryType}:`);

    for (const tier of tiers) {
      const seed = `vault_${lotteryType.toLowerCase()}`;
      // Use 1-byte seeds (matching deployed program)
      const [vaultPDA] = PublicKey.findProgramAddressSync([
        Buffer.from(seed),
        Buffer.from([tier])
      ], PROGRAM_ID);
      const vaultTokenAccount = getAssociatedTokenAddressSync(FPT_MINT, vaultPDA, true);
      try {
        console.log(`  Tier $${tier}...`);
        const methodName = `initialize${lotteryType}Tier`;
        const tx = await program.methods[methodName](tier)
          .accounts({
            authority: keypair.publicKey,
            fptMint: FPT_MINT,
            vault: vaultPDA,
            tokenAccount: vaultTokenAccount,
            tokenProgram: new PublicKey("TokenkegQfeZyiNwAJsyFbPVwwQW3bLvyS46Q8YVgJ4"),
            associatedTokenProgram: new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"),
            systemProgram: SystemProgram.programId,
          })
          .rpc({ skipPreflight: true });
        console.log(`    ✅ ${tx.slice(0, 20)}...`);
        successCount++;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("already in use")) {
          console.log(`    ⏭️  Already initialized`);
          successCount++;
        } else {
          console.error(`    ❌ ${msg.slice(0, 80)}`);
          errorCount++;
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
  }

  console.log("\n" + "━".repeat(70));
  console.log(`📊 Results: ${successCount} ✅ | ${errorCount} ❌`);
  console.log("━".repeat(70));

  if (errorCount === 0) {
    console.log("\n✨ Vaults initialized! Try buying tickets now.\n");
  }
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
