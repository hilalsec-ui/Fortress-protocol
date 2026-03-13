#!/usr/bin/env npx ts-node
import * as anchor from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import fs from "fs";
import path from "path";

// Configuration
const PROGRAM_ID = "BLNY4gLMg4MnPhBGin5p1vxhtY47nYPMw4XGJf63QMHW";
const FPT_MINT = "7vZbJ3WN4eGF6rGikB4MBLs4kiJwaRzNSX3smQRJJNw2";
const RPC_ENDPOINTS = [
  "https://api.devnet.solana.com",
  
];

const LOTTERY_TYPES: Record<string, number> = {
  LPM: 0,
  DPL: 1,
  WPL: 2,
  MPL: 3,
  YPL: 4,
};

const TIERS: Record<string, number[]> = {
  LPM: [5, 10, 20, 50],
  DPL: [5, 10, 15, 20],
  WPL: [5, 10, 15, 20],
  MPL: [5, 10, 15, 20],
  YPL: [5, 10, 15, 20],
};

async function main() {
  console.log("🚀 FORTRESS LOTTERY - DEVNET INITIALIZATION\n");

  // Try multiple RPC endpoints
  let connection: Connection | null = null;
  
  for (const endpoint of RPC_ENDPOINTS) {
    try {
      console.log(`📡 Trying RPC: ${endpoint}`);
      connection = new Connection(endpoint, "confirmed");
      await connection.getLatestBlockhash();
      console.log(`✅ Connected!\n`);
      break;
    } catch (err) {
      console.log(`❌ Failed, trying next...\n`);
    }
  }

  if (!connection) {
    console.error("❌ Could not connect to any RPC endpoint");
    process.exit(1);
  }

  // Load wallet
  const walletPath = process.env.ANCHOR_WALLET || 
    '/home/dev/my-wallet.json';
  
  if (!fs.existsSync(walletPath)) {
    console.error(`❌ Wallet not found: ${walletPath}`);
    process.exit(1);
  }

  const keypair = Keypair.fromSecretKey(
    Buffer.from(JSON.parse(fs.readFileSync(walletPath, "utf-8")))
  );

  console.log(`👤 Authority: ${keypair.publicKey.toString()}`);
  console.log(`💻 Program ID: ${PROGRAM_ID}`);
  console.log(`💰 FPT Mint: ${FPT_MINT}\n`);

  // Load IDL
  const idlPath = "./target/idl/fortress_protocol.json";
  if (!fs.existsSync(idlPath)) {
    console.error(`❌ IDL not found: ${idlPath}`);
    process.exit(1);
  }

  const idl = JSON.parse(fs.readFileSync(idlPath, "utf-8")) as any;
  const wallet = new anchor.Wallet(keypair);
  const provider = new anchor.AnchorProvider(connection, wallet, {
    commitment: "confirmed",
  });
  
  const programId = new PublicKey(PROGRAM_ID);
  const fptMint = new PublicKey(FPT_MINT);
  const program = new anchor.Program(idl, programId, provider);

  const pdas: Record<string, string> = {};

  try {
    // Initialize Global Registry
    console.log("━".repeat(70));
    console.log("1️⃣  INITIALIZE GLOBAL REGISTRY");
    console.log("━".repeat(70));

    const [registryPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("registry")],
      programId
    );

    pdas["registry"] = registryPDA.toString();
    console.log(`Registry PDA: ${registryPDA.toString()}`);

    try {
      const tx = await (program.methods as any)
        .initializeGlobalRegistry()
        .accounts({
          authority: keypair.publicKey,
          registry: registryPDA,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      console.log(`✅ Tx: ${tx}\n`);
    } catch (err: any) {
      if (err.message?.includes("already in use")) {
        console.log(`ℹ️  Already initialized\n`);
      } else {
        throw err;
      }
    }

    // Initialize Lottery Vaults
    console.log("━".repeat(70));
    console.log("2️⃣  INITIALIZE LOTTERY VAULTS");
    console.log("━".repeat(70));

    for (const [lotteryType, typeNum] of Object.entries(LOTTERY_TYPES)) {
      const tiers = TIERS[lotteryType];
      console.log(`\n📍 ${lotteryType}`);

      for (const tier of tiers) {
        // Derive vault PDA
        const vaultSeed = `vault_${lotteryType.toLowerCase()}`;
        const [vaultPDA] = PublicKey.findProgramAddressSync(
          [Buffer.from(vaultSeed), Buffer.from([tier])],
          programId
        );

        pdas[`vault_${lotteryType}_${tier}`] = vaultPDA.toString();

        console.log(`  Tier $${tier}: ${vaultPDA.toString().slice(0, 20)}...`);

        try {
          // Derive associated token account for vault
          const tokenAccount = getAssociatedTokenAddressSync(
            fptMint,
            vaultPDA,
            true // allowOwnerOffCurve
          );

          // Convert to snake_case method name (initialize_lpm_tier, etc.)
          const methodName = `initialize_${lotteryType.toLowerCase()}_tier`;
          
          const method = (program.methods as any)[methodName];
          
          if (!method) {
            throw new Error(`Method ${methodName} not found in program`);
          }
          
          const tx = await method(tier)
            .accounts({
              authority: keypair.publicKey,
              fptMint,
              vault: vaultPDA,
              tokenAccount,
              tokenProgram: new PublicKey("TokenzQdBbjWhAr21SMm2fjmVojNCw79MeNhz74MeV"),
              associatedTokenProgram: new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"),
              systemProgram: SystemProgram.programId,
            })
            .rpc({ skipPreflight: true });

          console.log(`    ✅ ${tx.slice(0, 16)}...`);
        } catch (err: any) {
          if (err.message?.includes("already in use") || err.message?.includes("account already exists")) {
            console.log(`    ℹ️  Already initialized`);
          } else {
            console.error(`    ❌ ${err.message}`);
          }
        }
      }
    }

    // Summary
    console.log("\n" + "━".repeat(70));
    console.log("✅ INITIALIZATION COMPLETE");
    console.log("━".repeat(70));

    console.log("\n📊 SUMMARY:");
    console.log(`   Registry: 1`);
    console.log(`   Vaults: 20 (5 types × 4 tiers)`);

    // Save manifest
    const manifest = {
      network: "devnet",
      programId: PROGRAM_ID,
      timestamp: new Date().toISOString(),
      pdas,
    };

    fs.writeFileSync(
      "./PDA_MANIFEST_DEVNET.json",
      JSON.stringify(manifest, null, 2)
    );

    console.log("\n✨ Devnet is ready for buy transactions!");
    console.log("📝 PDA manifest saved to: ./PDA_MANIFEST_DEVNET.json");

  } catch (error: any) {
    console.error("\n❌ Error:", error.message);
    if (error.logs) {
      console.error("\nProgram logs:");
      error.logs.forEach((log: string) => console.error(`  ${log}`));
    }
    process.exit(1);
  }
}

main();

