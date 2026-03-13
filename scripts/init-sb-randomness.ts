#!/usr/bin/env npx ts-node
/**
 * init-sb-randomness.ts
 *
 * Creates (or reuses) one Switchboard V3 RandomnessAccount per (lotteryType, tier).
 * After running, copy the printed constants into app/src/utils/constants.ts.
 *
 * Usage:
 *   npx ts-node scripts/init-sb-randomness.ts
 *
 * Keypairs are persisted in scripts/keys/sb-randomness-{TYPE}-{TIER}.json
 * so re-runs reuse the same accounts.
 */

import * as anchor from "@coral-xyz/anchor";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import * as sb from "@switchboard-xyz/on-demand";
import * as fs from "fs";
import * as path from "path";

// ── Config ────────────────────────────────────────────────────────────────────

const RPC_URL = "https://api.devnet.solana.com";
const WALLET_PATH = process.env.ANCHOR_WALLET || "/home/dev/my-wallet.json";
const KEYS_DIR = path.join(__dirname, "keys");
// Aio4gaXjXzJNVLtzwtNVmSqGKpANtXhybbkhtAC94ji2
const SB_PROGRAM_PK = new PublicKey("Aio4gaXjXzJNVLtzwtNVmSqGKpANtXhybbkhtAC94ji2");

const LOTTERY_TYPES: Record<string, { id: number; tiers: number[] }> = {
  LPM: { id: 0, tiers: [5, 10, 20, 50] },
  DPL: { id: 1, tiers: [5, 10, 15, 20] },
  WPL: { id: 2, tiers: [5, 10, 15, 20] },
  MPL: { id: 3, tiers: [5, 10, 15, 20] },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function loadOrGenKeypair(filePath: string): Keypair {
  if (fs.existsSync(filePath)) {
    const raw = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    return Keypair.fromSecretKey(Uint8Array.from(raw));
  }
  const kp = Keypair.generate();
  fs.writeFileSync(filePath, JSON.stringify(Array.from(kp.secretKey)));
  console.log(`  🔑 Generated new keypair → ${filePath}`);
  return kp;
}

/** Read the oracle pubkey embedded at offset 104 of a RandomnessAccountData. */
function readOracle(data: Buffer): PublicKey | null {
  if (data.length < 136) return null;
  try {
    return new PublicKey(data.slice(104, 136));
  } catch {
    return null;
  }
}

/** Check if the account is already a valid SB RandomnessAccount (owned by SB). */
async function isInitialized(
  connection: Connection,
  pubkey: PublicKey,
): Promise<boolean> {
  const info = await connection.getAccountInfo(pubkey, "confirmed");
  if (!info) return false;
  return info.owner.equals(SB_PROGRAM_PK);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log("🎲 Switchboard V3 RandomnessAccount Initializer\n");

  // Ensure keys dir exists
  fs.mkdirSync(KEYS_DIR, { recursive: true });

  // Load wallet
  if (!fs.existsSync(WALLET_PATH)) {
    console.error(`❌ Wallet not found at ${WALLET_PATH}`);
    process.exit(1);
  }
  const adminKp = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(WALLET_PATH, "utf-8"))),
  );
  console.log(`👤 Admin: ${adminKp.publicKey.toBase58()}`);

  // Connect
  const connection = new Connection(RPC_URL, "confirmed");
  const wallet = new anchor.Wallet(adminKp);
  const provider = new anchor.AnchorProvider(connection, wallet, {
    commitment: "confirmed",
    skipPreflight: false,
  });

  const balance = await connection.getBalance(adminKp.publicKey);
  console.log(`💰 Balance: ${(balance / 1e9).toFixed(4)} SOL\n`);
  if (balance < 0.5e9) {
      console.error("❌ Insufficient SOL. Run: solana airdrop 2 --url devnet");
    process.exit(1);
  }

  // Load the Switchboard On-Demand program
  console.log("📡 Loading Switchboard On-Demand program…");
  const sbProgram = await sb.AnchorUtils.loadProgramFromConnection(
    connection,
    wallet,
  );
  console.log(`✅ SB program: ${sbProgram.programId.toBase58()}\n`);

  // Queue
  const queue = sb.ON_DEMAND_DEVNET_QUEUE;
  console.log(`📋 Queue: ${queue.toBase58()}\n`);

  // Process each (type, tier)
  const results: Record<string, Record<number, string>> = {};
  const oraclesSeen = new Set<string>();

  for (const [lotteryType, { tiers }] of Object.entries(LOTTERY_TYPES)) {
    results[lotteryType] = {};

    for (const tier of tiers) {
      const label = `${lotteryType}-${tier}`;
      const keyFile = path.join(KEYS_DIR, `sb-randomness-${label}.json`);
      const rngKp = loadOrGenKeypair(keyFile);

      process.stdout.write(`  [${label}] ${rngKp.publicKey.toBase58().slice(0, 12)}… `);

      const alreadyInit = await isInitialized(connection, rngKp.publicKey);

      if (alreadyInit) {
        // Already exists — read oracle from existing account
        const info = await connection.getAccountInfo(rngKp.publicKey, "confirmed");
        const oracle = info ? readOracle(info.data as Buffer) : null;
        if (oracle) oraclesSeen.add(oracle.toBase58());
        const oracleStr = oracle?.toBase58().slice(0, 12) ?? "unknown";
        console.log(`✅ already initialized (oracle: ${oracleStr}…)`);
      } else {
        // Create the RandomnessAccount on-chain
        try {
          const [randomness, ix] = await sb.Randomness.create(
            sbProgram,
            rngKp,
            queue,
          );

          const tx = new Transaction().add(ix);
          const sig = await provider.sendAndConfirm(tx, [rngKp], {
            commitment: "confirmed",
            skipPreflight: true,
          });
          console.log(`✅ created (sig: ${sig.slice(0, 12)}…)`);

          // Read oracle from newly-created account
          await new Promise((r) => setTimeout(r, 1500)); // brief settle
          const info = await connection.getAccountInfo(rngKp.publicKey, "confirmed");
          const oracle = info ? readOracle(info.data as Buffer) : null;
          if (oracle) oraclesSeen.add(oracle.toBase58());
          const oracleStr = oracle?.toBase58().slice(0, 12) ?? "unknown";
          console.log(`      oracle: ${oracleStr}…`);
        } catch (err: any) {
          console.error(`❌ FAILED: ${err.message?.slice(0, 120)}`);
          // Use system program as placeholder — frontend guards against empty string
          results[lotteryType][tier] = "";
          continue;
        }
      }

      results[lotteryType][tier] = rngKp.publicKey.toBase58();
    }
  }

  // ── Output ──────────────────────────────────────────────────────────────────
  const oracleList = Array.from(oraclesSeen);
  const oracleLine =
    oracleList.length === 1
      ? `"${oracleList[0]}"`
      : oracleList.length === 0
        ? '""  // could not read oracle — re-run after accounts settle'
        : `"${oracleList[0]}"  // WARNING: multiple oracles ${oracleList.join(", ")}`;

  console.log("\n" + "─".repeat(72));
  console.log("✏️  Paste into app/src/utils/constants.ts:\n");

  let block = `export const SB_ORACLE_DEVNET = ${oracleLine};\n`;
  block += `export const SB_RANDOMNESS_ACCOUNTS: Record<string, Record<number, string>> = {\n`;
  for (const [lotteryType, tiers] of Object.entries(results)) {
    const tierEntries = Object.entries(tiers)
      .map(([tier, pk]) => `    ${tier}: "${pk}"`)
      .join(",\n");
    block += `  ${lotteryType}: {\n${tierEntries},\n  },\n`;
  }
  block += `};\n`;

  console.log(block);
  console.log("─".repeat(72));

  // Also write to a file for convenience
  const outFile = path.join(__dirname, "sb-randomness-config.ts.txt");
  fs.writeFileSync(outFile, block);
  console.log(`\n✅ Config also saved to ${outFile}`);

  // Verify: re-read all accounts to confirm they're alive
  console.log("\n🔍 Verification:\n");
  let allGood = true;
  for (const [lotteryType, tiers] of Object.entries(results)) {
    for (const [tier, pk] of Object.entries(tiers)) {
      if (!pk) {
        console.log(`  ❌ ${lotteryType}-${tier}: missing`);
        allGood = false;
        continue;
      }
      const info = await connection.getAccountInfo(new PublicKey(pk), "confirmed");
      const owned = info?.owner?.equals(SB_PROGRAM_PK) ?? false;
      const oracle = info ? readOracle(info.data as Buffer) : null;
      const marker = owned ? "✅" : "❌";
      console.log(
        `  ${marker} ${lotteryType}-$${tier}: ${pk.slice(0, 20)}…  oracle=${oracle?.toBase58().slice(0, 12) ?? "N/A"}…`,
      );
      if (!owned) allGood = false;
    }
  }

  if (allGood) {
    console.log("\n🎉 All accounts ready for devnet VRF draws!\n");
  } else {
    console.log("\n⚠️  Some accounts failed. Re-run the script to retry.\n");
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("\n💥 Fatal error:", err.message ?? err);
  process.exit(1);
});
