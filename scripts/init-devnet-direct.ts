#!/usr/bin/env npx ts-node
import * as anchor from "@coral-xyz/anchor";
import { 
  Connection, 
  Keypair, 
  PublicKey, 
  SystemProgram,
  TransactionInstruction,
  Transaction
} from "@solana/web3.js";
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

// Instruction discriminators (first 8 bytes) - from IDL
const DISCRIMINATORS: Record<string, Buffer> = {
  initialize_dpl_lottery: Buffer.from([156, 172, 101, 4, 194, 243, 133, 50]),
  initialize_dpl_tier: Buffer.from([231, 42, 41, 29, 36, 227, 234, 161]),
  initialize_global_registry: Buffer.from([191, 61, 152, 46, 44, 104, 41, 142]),
  initialize_lpm_lottery: Buffer.from([172, 114, 165, 64, 169, 46, 190, 150]),
  initialize_lpm_tier: Buffer.from([125, 108, 229, 84, 151, 180, 204, 129]),
  initialize_mpl_lottery: Buffer.from([44, 117, 76, 221, 29, 166, 196, 190]),
  initialize_mpl_tier: Buffer.from([33, 55, 125, 68, 32, 191, 8, 44]),
  initialize_wpl_lottery: Buffer.from([179, 118, 1, 118, 205, 174, 178, 137]),
  initialize_wpl_tier: Buffer.from([120, 188, 238, 76, 49, 176, 68, 93]),
  initialize_ypl_lottery: Buffer.from([192, 211, 102, 137, 23, 163, 48, 254]),
  initialize_ypl_tier: Buffer.from([142, 149, 58, 35, 170, 87, 144, 5]),
};

async function buildInitializeRegistryInstruction(
  authority: PublicKey,
  registryPDA: PublicKey,
  programId: PublicKey
): Promise<TransactionInstruction> {
  const keys = [
    { pubkey: authority, isSigner: true, isWritable: true },
    { pubkey: registryPDA, isSigner: false, isWritable: true },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
  ];

  const data = DISCRIMINATORS["initialize_global_registry"];
  
  return new TransactionInstruction({
    keys,
    programId,
    data,
  });
}

async function buildInitializeTierInstruction(
  lotteryType: string,
  tier: number,
  authority: PublicKey,
  fptMint: PublicKey,
  vaultPDA: PublicKey,
  tokenAccount: PublicKey,
  programId: PublicKey
): Promise<TransactionInstruction> {
  const methodName = `initialize_${lotteryType.toLowerCase()}_tier`;
  const discriminator = DISCRIMINATORS[methodName];

  if (!discriminator) {
    throw new Error(`Unknown discriminator for ${methodName}`);
  }

  try {
    const TOKEN_PROGRAM_ID = new PublicKey(
      "TokenkegQfeZyiNwAJsyFbPVwwQW3bLvyS46Q8YVgJ4"  // Standard Token program (works with Token-2022 via interface)
    );
    const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey(
      "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
    );

    const keys = [
      { pubkey: authority, isSigner: true, isWritable: true },
      { pubkey: fptMint, isSigner: false, isWritable: false },
      { pubkey: vaultPDA, isSigner: false, isWritable: true },
      { pubkey: tokenAccount, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ];

    // Validate all pubkeys
    for (let i = 0; i < keys.length; i++) {
      if (!PublicKey.isOnCurve(keys[i].pubkey.toBytes())) {
        console.log(`Invalid key at index ${i}: ${keys[i].pubkey.toString()}`);
      }
    }

    // Data: discriminator (8 bytes) + tier (1 byte)
    const data = Buffer.concat([discriminator, Buffer.from([tier])]);

    return new TransactionInstruction({
      keys,
      programId,
      data,
    });
  } catch (err: any) {
    console.error(`Error in buildInitializeTierInstruction: ${err.message}`);
    throw err;
  }
}

async function main() {
  console.log("🚀 FORTRESS LOTTERY - DEVNET INITIALIZATION (DIRECT)\n");

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

  const programId = new PublicKey(PROGRAM_ID);
  const fptMint = new PublicKey(FPT_MINT);
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
      const ix = await buildInitializeRegistryInstruction(
        keypair.publicKey,
        registryPDA,
        programId
      );

      const tx = new Transaction().add(ix);
      const sig = await connection.sendTransaction(tx, [keypair], {
        skipPreflight: true,
      });

      console.log(`✅ Tx: ${sig}\n`);
    } catch (err: any) {
      if (err.message?.includes("already in use") || err.message?.includes("account already exists")) {
        console.log(`ℹ️  Already initialized\n`);
      } else {
        console.error(`❌ ${err.message}`);
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

          const ix = await buildInitializeTierInstruction(
            lotteryType,
            tier,
            keypair.publicKey,
            fptMint,
            vaultPDA,
            tokenAccount,
            programId
          );

          const tx = new Transaction().add(ix);
          const sig = await connection.sendTransaction(tx, [keypair], {
            skipPreflight: true,
          });

          console.log(`    ✅ ${sig.slice(0, 16)}...`);
        } catch (err: any) {
          if (err.message?.includes("already in use") || err.message?.includes("account already exists")) {
            console.log(`    ℹ️  Already initialized`);
          } else {
            console.error(`    ❌ ${err.message}`);
            if (err.stack && err.message.includes("Invalid")) {
              const stackLines = err.stack.split('\n');
              console.error(`    Stack: ${stackLines.slice(0, 3).join(' ')}`);
            }
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
    process.exit(1);
  }
}

main();
