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
const bs58 = require("bs58") as { decode: (s: string) => Uint8Array; encode: (b: Uint8Array) => string };
import * as fs from "fs";
import * as path from "path";

// Load from crank/.env first, then app/.env.local (lower priority)
for (const envFile of [
  path.join(__dirname, "../crank/.env"),
  path.join(__dirname, "../app/.env.local"),
]) {
  const content = fs.existsSync(envFile) ? fs.readFileSync(envFile, "utf-8") : "";
  for (const line of content.split("\n")) {
    const m = line.match(/^([^=]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
}

// Switchboard On-Demand mainnet queue (verified active on mainnet)
const SB_MAINNET_QUEUE = new PublicKey("A43DyUGA7s8eXPxqEjJY6EBu1KKbNgfxF8h17VAHn13w");

// Flexible key loader — supports base58 string or JSON byte array [1,2,3,...]
function keypairFromAny(value: string): Keypair {
  try { return Keypair.fromSecretKey(bs58.decode(value)); } catch { /* fall through */ }
  try {
    const parsed = JSON.parse(value);
    return Keypair.fromSecretKey(Uint8Array.from(parsed));
  } catch { /* fall through */ }
  throw new Error("Key is neither valid base58 nor a JSON byte array.");
}

const RPC_URL = "https://mainnet.helius-rpc.com/?api-key=" +
  (process.env.HELIUS_API_KEY ?? "cfb2a320-c0b3-407c-8188-adef19b9da7f");

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

  // Load crank keypair — supports base58 or JSON array format
  const crankKeyRaw = process.env.CRANK_PRIVATE_KEY;
  if (!crankKeyRaw) {
    console.error("❌ CRANK_PRIVATE_KEY not found. Set it in crank/.env");
    process.exit(1);
  }
  let crankKp: Keypair;
  try {
    crankKp = keypairFromAny(crankKeyRaw);
  } catch (e: any) {
    console.error(`❌ CRANK_PRIVATE_KEY is invalid: ${e.message}`);
    process.exit(1);
  }
  console.log(`🔧 Crank wallet: ${crankKp.publicKey.toBase58()}`);

  fs.mkdirSync(KEYS_DIR, { recursive: true });

  const connection = new Connection(RPC_URL, "confirmed");
  const balance = await connection.getBalance(crankKp.publicKey);
  console.log(`💰 Crank balance: ${(balance / 1e9).toFixed(4)} SOL`);
  if (balance < 0.05e9) {
    console.error("❌ Crank needs at least 0.05 SOL to pay for account rent. Please fund: BzsGQccSzoWPiRSKoTNpf7iKxqJRq3CwvSygmzvwMei5");
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

  const queue = SB_MAINNET_QUEUE;
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
