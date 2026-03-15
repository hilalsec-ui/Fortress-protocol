#!/usr/bin/env npx ts-node
/**
 * Complete initialization script for fresh deployment.
 * Initializes: global_registry + all 16 lottery vaults.
 * Skips already-initialized accounts gracefully.
 */
import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { FortressProtocol } from "../target/types/fortress_protocol";
import { PublicKey } from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";

const FPT_MINT_STR = "3YTnzmFTECtyKDxaghWPQcjzX7g1Cj3NxMq41JdWk2rj";

async function main() {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.FortressProtocol as Program<FortressProtocol>;
  const fptMint = new PublicKey(FPT_MINT_STR);

  console.log("\n🚀 Fortress Protocol — Complete Initialization");
  console.log("=".repeat(55));
  console.log("Program:    ", program.programId.toBase58());
  console.log("Authority:  ", provider.wallet.publicKey.toBase58());
  console.log("FPT Mint:   ", fptMint.toBase58());

  // ── Known PDAs ────────────────────────────────────────────────────
  const [solVaultPda]      = PublicKey.findProgramAddressSync([Buffer.from("sol_vault")],       program.programId);
  const [treasuryPda]      = PublicKey.findProgramAddressSync([Buffer.from("treasury")],         program.programId);
  const [globalRegistryPda]= PublicKey.findProgramAddressSync([Buffer.from("global_registry")], program.programId);

  console.log("\nPDAs:");
  console.log("  sol_vault:       ", solVaultPda.toBase58());
  console.log("  treasury:        ", treasuryPda.toBase58());
  console.log("  global_registry: ", globalRegistryPda.toBase58());

  // ── Step 1: Global Registry ────────────────────────────────────────
  console.log("\n── Step 1: Global Registry ──────────────────────");
  try {
    const info = await provider.connection.getAccountInfo(globalRegistryPda);
    if (info && info.data.length > 0) {
      console.log("✅ Global registry already initialized");
    } else {
      throw new Error("not found");
    }
  } catch {
    try {
      const tx = await program.methods
        .initializeGlobalRegistry()
        .rpc({ commitment: "confirmed" });
      console.log("✅ Global registry initialized:", tx.slice(0, 44) + "...");
    } catch (err: any) {
      if (err.message?.includes("already in use") || err.message?.includes("already initialized")) {
        console.log("✅ Global registry already initialized (on-chain)");
      } else {
        console.error("❌ Failed:", err.message);
        if (err.logs) console.error("   Logs:", err.logs.slice(-5).join("\n        "));
        throw err;
      }
    }
  }

  // ── Step 2: All 16 Vault Accounts ─────────────────────────────────
  const LOTTERY_TYPES = [
    { name: "LPM", seed: "vault_lpm", tiers: [5, 10, 20, 50],  method: "initializeLpmTier" as const },
    { name: "DPL", seed: "vault_dpl", tiers: [5, 10, 15, 20],  method: "initializeDplTier" as const },
    { name: "WPL", seed: "vault_wpl", tiers: [5, 10, 15, 20],  method: "initializeWplTier" as const },
    { name: "MPL", seed: "vault_mpl", tiers: [5, 10, 15, 20],  method: "initializeMplTier" as const },
  ] as const;

  const TIER_NAMES = ["Bronze", "Silver", "Gold", "Diamond"];

  let ok = 0, skip = 0, fail = 0;

  console.log("\n── Step 2: Initialize 16 Lottery Vaults ─────────────────────");

  for (const lt of LOTTERY_TYPES) {
    for (let i = 0; i < lt.tiers.length; i++) {
      const tier = lt.tiers[i];
      const label = `${lt.name} ${TIER_NAMES[i]} ($${tier})`;

      const [vaultPda] = PublicKey.findProgramAddressSync(
        [Buffer.from(lt.seed), Buffer.from([tier])],
        program.programId
      );

      // Derive vault token account (Token-2022 ATA)
      const [tokenAccount] = PublicKey.findProgramAddressSync(
        [vaultPda.toBuffer(), TOKEN_2022_PROGRAM_ID.toBuffer(), fptMint.toBuffer()],
        ASSOCIATED_TOKEN_PROGRAM_ID
      );

      // Check if already initialized
      try {
        const va = await provider.connection.getAccountInfo(vaultPda);
        if (va && va.data.length > 0) {
          console.log(`  ✅ ${label} — already initialized`);
          skip++;
          continue;
        }
      } catch {}

      // Initialize vault
      try {
        process.stdout.write(`  ⏳ ${label} — initializing...`);
        const tx = await (program.methods[lt.method] as any)(tier)
          .accounts({
            authority:             provider.wallet.publicKey,
            fptMint:               fptMint,
            tokenAccount:          tokenAccount,
            tokenProgram:          TOKEN_2022_PROGRAM_ID,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          })
          .rpc({ commitment: "confirmed" });
        console.log(` ✅  Tx: ${tx.slice(0, 44)}...`);
        ok++;
        await new Promise(r => setTimeout(r, 600));
      } catch (err: any) {
        if (err.message?.includes("already in use") || err.message?.includes("already initialized")) {
          console.log(` ✅  (already exists)`);
          skip++;
        } else {
          console.log(` ❌`);
          console.error(`     Error: ${err.message}`);
          if (err.logs) console.error(`     Logs: ${err.logs.slice(-3).join(" | ")}`);
          fail++;
        }
      }
    }
  }

  // ── Summary ────────────────────────────────────────────────────────
  console.log("\n" + "=".repeat(55));
  console.log("📊 Initialization Summary");
  console.log(`  ✅ Initialized: ${ok}`);
  console.log(`  ⏭️  Skipped:     ${skip}`);
  console.log(`  ❌ Failed:      ${fail}`);
  console.log(`  📦 Total vaults: ${ok + skip}/${LOTTERY_TYPES.reduce((s, l) => s + l.tiers.length, 0)}`);

  if (fail === 0) {
    console.log("\n🎉 ALL SYSTEMS READY — Program is fully initialized on devnet!");
  } else {
    console.log("\n⚠️  Some steps failed — check errors above.");
    process.exit(1);
  }
}

main().then(
  () => process.exit(0),
  (err) => { console.error(err); process.exit(1); }
);
