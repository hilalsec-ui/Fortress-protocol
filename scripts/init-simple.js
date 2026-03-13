#!/usr/bin/env node
const { Connection, Keypair, PublicKey, SystemProgram, Transaction, TransactionInstruction } = require("@solana/web3.js");
const { getAssociatedTokenAddressSync } = require("@solana/spl-token");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PROGRAM_ID = "HerDfQLbrXk8CFPcCGW8sDvaegk1qYawSa82Wuzov4Lb";
const DPT_MINT = "7vZbJ3WN4eGF6rGikB4MBLs4kiJwaRzNSX3smQRJJNw2";
const RPC = "https://api.devnet.solana.com";
const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJsyFbPVwwQW3bLvyS46Q8YVgJ4";
const ATA_PROGRAM = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL";

const LOTTERY_TYPES = { LPM: 0, DPL: 1, WPL: 2, MPL: 3, YPL: 4 };
const TIERS = {
  LPM: [5, 10, 20, 50],
  DPL: [5, 10, 15, 20],
  WPL: [5, 10, 15, 20],
  MPL: [5, 10, 15, 20],
  YPL: [5, 10, 15, 20],
};

function getDiscriminator(nameSpace, name) {
  const sha256 = crypto.createHash("sha256");
  sha256.update(`${nameSpace}:${name}`);
  return sha256.digest().slice(0, 8);
}

async function main() {
  console.log("🔧 INITIALIZING VAULTS\n");

  const connection = new Connection(RPC, "confirmed");
  const walletPath = process.env.ANCHOR_WALLET || '/home/dev/my-wallet.json';
  
  if (!fs.existsSync(walletPath)) {
    console.error(`❌ Wallet not found: ${walletPath}`);
    process.exit(1);
  }

  const keypair = Keypair.fromSecretKey(Buffer.from(JSON.parse(fs.readFileSync(walletPath, "utf-8"))));
  const programId = new PublicKey(PROGRAM_ID);
  const dptMint = new PublicKey(DPT_MINT);

  console.log(`👤 Authority: ${keypair.publicKey.toString()}`);
  console.log(`💻 Program: ${PROGRAM_ID}`);
  console.log(`💰 Mint: ${DPT_MINT}\n`);

  console.log("━".repeat(70));
  console.log("INITIALIZING LOTTERY VAULTS (1-byte seeds)");
  console.log("━".repeat(70));

  let count = 0;

  for (const [lotteryType, typeNum] of Object.entries(LOTTERY_TYPES)) {
    const tiers = TIERS[lotteryType];
    console.log(`\n📍 ${lotteryType}:`);

    for (const tier of tiers) {
      const seed = `vault_${lotteryType.toLowerCase()}`;
      
      // Use 1-byte seeds (matching deployed program)
      const [vaultPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from(seed), Buffer.from([tier])],
        programId
      );

      const vaultTokenAccount = getAssociatedTokenAddressSync(dptMint, vaultPDA, true);

      try {
        process.stdout.write(`  Tier $${tier}... `);

        const discriminator = getDiscriminator("global", `initialize_${lotteryType.toLowerCase()}_tier`);
        const data = Buffer.concat([discriminator, Buffer.from([tier])]);

        const keys = [
          { pubkey: keypair.publicKey, isSigner: true, isWritable: true },
          { pubkey: dptMint, isSigner: false, isWritable: false },
          { pubkey: vaultPDA, isSigner: false, isWritable: true },
          { pubkey: vaultTokenAccount, isSigner: false, isWritable: true },
          { pubkey: new PublicKey(TOKEN_PROGRAM), isSigner: false, isWritable: false },
          { pubkey: new PublicKey(ATA_PROGRAM), isSigner: false, isWritable: false },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ];

        const ix = new TransactionInstruction({ keys, programId, data });
        const tx = new Transaction().add(ix);
        tx.feePayer = keypair.publicKey;
        tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;

        const sig = await connection.sendTransaction(tx, [keypair], { skipPreflight: true });
        console.log(`✅ ${sig.slice(0, 16)}...`);
        count++;
      } catch (err) {
        if (err.message?.includes("already in use")) {
          console.log("⏭️  (exists)");
        } else {
          console.log(`❌ ${err.message?.slice(0, 50)}`);
        }
      }

      await new Promise(r => setTimeout(r, 300));
    }
  }

  console.log("\n" + "━".repeat(70));
  console.log(`✨ ${count} vaults initialized!`);
  console.log("━".repeat(70));
  console.log("\n🎯 Next: Buy a ticket at http://localhost:3001\n");
}

main().catch(err => { console.error(err); process.exit(1); });
