#!/usr/bin/env npx ts-node
/**
 * reinit-sb-randomness-crank.ts
 *
 * Creates NEW Switchboard RandomnessAccounts signed by the CRANK wallet.
 * This makes crank the authority, allowing our on-chain CPI to commit correctly.
 *
 * Usage:
 *   npx ts-node scripts/reinit-sb-randomness-crank.ts
 */

import * as anchor from "@coral-xyz/anchor";
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
} from "@solana/web3.js";
import * as sb from "@switchboard-xyz/on-demand";
// eslint-disable-next-line @typescript-eslint/no-var-requires
const bs58 = require("bs58") as { decode: (s: string) => Uint8Array };
import * as fs from "fs";
import * as path from "path";

// Load CRANK_PRIVATE_KEY from app/.env.local manually
const envPath = path.join(__dirname, "../app/.env.local");
const envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf-8") : "";
for (const line of envContent.split("\n")) {
  const m = line.match(/^([^=]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}

const RPC_URL = "https://api.devnet.solana.com";

const LOTTERY_TYPES: Record<string, { id: number; tiers: number[] }> = {
  LPM: { id: 0, tiers: [5, 10, 20, 50] },
  DPL: { id: 1, tiers: [5, 10, 15, 20] },
  WPL: { id: 2, tiers: [5, 10, 15, 20] },
  MPL: { id: 3, tiers: [5, 10, 15, 20] },
};

const KEYS_DIR = path.join(__dirname, "keys-crank");

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

function readOracle(data: Buffer): PublicKey | null {
  if (data.length < 136) return null;
  try {
    return new PublicKey(data.slice(104, 136));
  } catch {
    return null;
  }
}

async function main() {
  console.log("🎲 Switchboard RandomnessAccount Reinitializer (CRANK authority)\n");

  // Load crank keypair from CRANK_PRIVATE_KEY env
  const crankKeyRaw = process.env.CRANK_PRIVATE_KEY;
  if (!crankKeyRaw) {
    console.error("❌ CRANK_PRIVATE_KEY not found in app/.env.local");
    process.exit(1);
  }
  const crankKp = Keypair.fromSecretKey(
    Uint8Array.from(bs58.decode(crankKeyRaw)),
  );
  console.log(`🔧 Crank wallet: ${crankKp.publicKey.toBase58()}`);

  fs.mkdirSync(KEYS_DIR, { recursive: true });

  const connection = new Connection(RPC_URL, "confirmed");
  const balance = await connection.getBalance(crankKp.publicKey);
  console.log(`💰 Crank balance: ${(balance / 1e9).toFixed(4)} SOL`);
  if (balance < 0.3e9) {
    console.error("❌ Crank needs at least 0.3 SOL. Run: solana airdrop 2 CH5CLt2e26cho7es4oAs536AgZqSzNR29WWrQ3QR6JUz --url devnet");
    process.exit(1);
  }

  const wallet = new anchor.Wallet(crankKp);
  const provider = new anchor.AnchorProvider(connection, wallet, {
    commitment: "confirmed",
    skipPreflight: true,
  });

  console.log("📡 Loading Switchboard On-Demand program…");
  const sbProgram = await sb.AnchorUtils.loadProgramFromConnection(
    connection,
    wallet,
  );
  console.log(`✅ SB program: ${sbProgram.programId.toBase58()}\n`);

  const queue = sb.ON_DEMAND_DEVNET_QUEUE;
  console.log(`📋 Queue: ${queue.toBase58()}\n`);

  const results: Record<string, Record<number, string>> = {};
  const oraclesSeen = new Set<string>();

  for (const [lotteryType, { tiers }] of Object.entries(LOTTERY_TYPES)) {
    results[lotteryType] = {};

    for (const tier of tiers) {
      const label = `${lotteryType}-${tier}`;
      const keyFile = path.join(KEYS_DIR, `sb-randomness-${label}.json`);
      const rngKp = loadOrGenKeypair(keyFile);

      process.stdout.write(`  [${label}] ${rngKp.publicKey.toBase58().slice(0, 12)}… `);

      // Check if already initialized with crank as authority
      const existing = await connection.getAccountInfo(rngKp.publicKey, "confirmed");
      if (existing && existing.owner.toBase58() === sbProgram.programId.toBase58()) {
        // Check authority
        const authority = new PublicKey(existing.data.slice(8, 40));
        if (authority.toBase58() === crankKp.publicKey.toBase58()) {
          const oracle = readOracle(existing.data as Buffer);
          if (oracle) oraclesSeen.add(oracle.toBase58());
          console.log(`✅ already init with crank authority (oracle: ${oracle?.toBase58().slice(0, 12) ?? "?"}…)`);
          results[lotteryType][tier] = rngKp.publicKey.toBase58();
          continue;
        } else {
          console.log(`⚠️  exists but wrong authority (${authority.toBase58().slice(0, 8)}…) — using new keypair`);
          // Generate a fresh keypair since this one has wrong authority
          const newKp = Keypair.generate();
          const newPath = keyFile + ".new.json";
          fs.writeFileSync(newPath, JSON.stringify(Array.from(newKp.secretKey)));
          console.log(`     New keypair written to ${newPath}`);
          // We'll use the new keypair
          const [randomness, ix] = await sb.Randomness.create(sbProgram, newKp, queue);
          const tx = new Transaction().add(ix);
          try {
            const sig = await provider.sendAndConfirm(tx, [newKp], { commitment: "confirmed" });
            console.log(`  ✅ created (sig: ${sig.slice(0, 12)}…)`);
            await new Promise(r => setTimeout(r, 1500));
            const info = await connection.getAccountInfo(newKp.publicKey, "confirmed");
            const oracle = info ? readOracle(info.data as Buffer) : null;
            if (oracle) oraclesSeen.add(oracle.toBase58());
            console.log(`     oracle: ${oracle?.toBase58().slice(0, 12) ?? "?"}…`);
            // Rename key file
            fs.writeFileSync(keyFile, JSON.stringify(Array.from(newKp.secretKey)));
            fs.unlinkSync(newPath);
            results[lotteryType][tier] = newKp.publicKey.toBase58();
          } catch (err: any) {
            console.error(`  ❌ FAILED: ${err.message?.slice(0, 120)}`);
            results[lotteryType][tier] = "";
          }
          continue;
        }
      }

      // Not yet initialized — create with crank as authority
      try {
        const [_randomness, ix] = await sb.Randomness.create(sbProgram, rngKp, queue);
        const tx = new Transaction().add(ix);
        const sig = await provider.sendAndConfirm(tx, [rngKp], { commitment: "confirmed" });
        console.log(`✅ created (sig: ${sig.slice(0, 12)}…)`);

        await new Promise(r => setTimeout(r, 1500));
        const info = await connection.getAccountInfo(rngKp.publicKey, "confirmed");
        const oracle = info ? readOracle(info.data as Buffer) : null;
        if (oracle) oraclesSeen.add(oracle.toBase58());
        console.log(`     oracle: ${oracle?.toBase58().slice(0, 12) ?? "?"}…`);
        results[lotteryType][tier] = rngKp.publicKey.toBase58();
      } catch (err: any) {
        console.error(`❌ FAILED: ${err.message?.slice(0, 120)}`);
        results[lotteryType][tier] = "";
      }
    }
  }

  const oracleList = Array.from(oraclesSeen);
  const oracleLine =
    oracleList.length === 1
      ? `"${oracleList[0]}"`
      : oracleList.length === 0
        ? '""  // re-run after accounts settle'
        : `"${oracleList[0]}"  // WARNING: multiple oracles`;

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

  // Also write to a file for easy copy-paste
  const outFile = path.join(__dirname, "sb-randomness-crank-output.txt");
  fs.writeFileSync(outFile, block);
  console.log(`📄 Output also saved to: ${outFile}`);
}

main().catch(console.error);
