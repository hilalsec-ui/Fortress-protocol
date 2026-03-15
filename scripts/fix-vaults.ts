#!/usr/bin/env node
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import fs from "fs";
import path from "path";

const PROGRAM_ID = "2JHDbUz11kLe7q44nneougHcJCQqD6t26XeEFFNQJpHY";
const FPT_MINT = "3YTnzmFTECtyKDxaghWPQcjzX7g1Cj3NxMq41JdWk2rj";
const RPC = "https://api.mainnet-beta.solana.com";
const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJsyFbPVwwQW3bLvyS46Q8YVgJ4";
const ATA_PROGRAM = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL";

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

async function buildInitInstruction(
  lotteryType: string,
  tier: number,
  authority: PublicKey,
  fptMint: PublicKey,
  vaultPDA: PublicKey,
  vaultTokenAccount: PublicKey,
  programId: PublicKey
): Promise<TransactionInstruction> {
  // Discriminator for initialize_*_tier instruction (NOT the account discriminator)
  // This is: sighash("global:initialize_lpm_tier") first 8 bytes
  // But since all initialize_*_tier follow same pattern, we use generic
  const discriminator = Buffer.from([231, 42, 41, 29, 36, 227, 234, 161]); // initialize_*_tier
  const data = Buffer.concat([discriminator, Buffer.from([tier])]);

  const keys = [
    { pubkey: authority, isSigner: true, isWritable: true },
    { pubkey: fptMint, isSigner: false, isWritable: false },
    { pubkey: vaultPDA, isSigner: false, isWritable: true },
    { pubkey: vaultTokenAccount, isSigner: false, isWritable: true },
    { pubkey: new PublicKey(TOKEN_PROGRAM), isSigner: false, isWritable: false },
    {
      pubkey: new PublicKey(ATA_PROGRAM),
      isSigner: false,
      isWritable: false,
    },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
  ];

  return new TransactionInstruction({
    keys,
    programId,
    data,
  });
}

async function main() {
  console.log("🔧 FORTRESS LOTTERY - VAULT INITIALIZATION FIX\n");

  const connection = new Connection(RPC, "confirmed");

  const walletPath =
    process.env.ANCHOR_WALLET ||
    '/home/dev/my-wallet.json';

  if (!fs.existsSync(walletPath)) {
    console.error(`❌ Wallet not found: ${walletPath}`);
    process.exit(1);
  }

  const keypair = Keypair.fromSecretKey(
    Buffer.from(JSON.parse(fs.readFileSync(walletPath, "utf-8")))
  );

  console.log(`👤 Authority: ${keypair.publicKey.toString()}`);
  console.log(`💻 Program: ${PROGRAM_ID}`);
  console.log(`💰 Mint: ${FPT_MINT}\n`);

  const programId = new PublicKey(PROGRAM_ID);
  const fptMint = new PublicKey(FPT_MINT);

  console.log("━".repeat(70));
  console.log("INITIALIZING LOTTERY VAULTS (1-byte seed format)");
  console.log("━".repeat(70));

  let successCount = 0;
  let errorCount = 0;

  for (const [lotteryType, typeNum] of Object.entries(LOTTERY_TYPES)) {
    const tiers = TIERS[lotteryType];
    console.log(`\n📍 ${lotteryType}:`);

    for (const tier of tiers) {
      const seed = `vault_${lotteryType.toLowerCase()}`;

      // Derive PDAs with 1-byte seeds (matching current program)
      const [vaultPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from(seed), Buffer.from([tier])],
        programId
      );

      const vaultTokenAccount = getAssociatedTokenAddressSync(
        fptMint,
        vaultPDA,
        true
      );

      try {
        console.log(`  Tier $${tier}...`);

        const ix = await buildInitInstruction(
          lotteryType,
          tier,
          keypair.publicKey,
          fptMint,
          vaultPDA,
          vaultTokenAccount,
          programId
        );

        const tx = new Transaction().add(ix);
        tx.feePayer = keypair.publicKey;
        tx.recentBlockhash = (
          await connection.getLatestBlockhash()
        ).blockhash;

        const sig = await connection.sendTransaction(tx, [keypair], {
          skipPreflight: true,
        });

        console.log(`    ✅ ${sig.slice(0, 20)}...`);
        successCount++;
      } catch (err: any) {
        const msg = err.message || String(err);
        if (msg.includes("already in use")) {
          console.log(`    ✅ Already initialized`);
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
    console.log(
      "\n✨ All vaults initialized! Try buying a lottery ticket.\n"
    );
  } else {
    console.log(`\n⚠️  ${errorCount} failed. Check errors above.\n`);
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
