#!/usr/bin/env npx ts-node
/**
 * Fortress Protocol — Mainnet Init Script
 * Deployed: 2026-03-16  Program: EB6kkg2sW5rnukjRH7Ljhz78gbfc36XZAuiFn5jdefF3
 *
 * Cost breakdown (all Solana rent-exempt minimums — cannot be lowered):
 *   GlobalRegistry   : 0.001740 SOL
 *   Treasury         : 0.001622 SOL
 *   sol_vault topUp  : 0.001000 SOL  (operational fund, user min)
 *   16x LotteryVault : 16 x 0.001462 = 0.023390 SOL
 *   16x WinnerHistory: 16 x 0.019091 = 0.305456 SOL
 *   ~20 tx fees      : ~0.001000 SOL
 *   TOTAL ESTIMATE   : ~0.334 SOL  (< 0.35 SOL)
 */

import * as anchor from "@coral-xyz/anchor";
import { Program }  from "@coral-xyz/anchor";
import { PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { FortressProtocol } from "../target/types/fortress_protocol";

const PROGRAM_ID = new PublicKey("EB6kkg2sW5rnukjRH7Ljhz78gbfc36XZAuiFn5jdefF3");
// Operational fund for sol_vault — 0.001 SOL keeps total well under 0.35 SOL
const SOL_VAULT_TOP_UP = 1_000_000; // lamports

async function main() {
  const fs = require("fs");
  const walletPath = process.env.ANCHOR_WALLET || "/home/dev/mainnet-authority.json";
  const walletKeypair = anchor.web3.Keypair.fromSecretKey(
    new Uint8Array(JSON.parse(fs.readFileSync(walletPath, "utf-8")))
  );

  const connection = new anchor.web3.Connection(
    process.env.RPC_URL || "https://api.mainnet-beta.solana.com",
    "confirmed"
  );
  const provider = new anchor.AnchorProvider(
    connection,
    new anchor.Wallet(walletKeypair),
    { commitment: "confirmed", preflightCommitment: "confirmed" }
  );
  anchor.setProvider(provider);

  const idl     = JSON.parse(fs.readFileSync("./target/idl/fortress_protocol.json", "utf-8"));
  const program = new anchor.Program(idl, provider) as Program<FortressProtocol>;

  const preBal = await connection.getBalance(walletKeypair.publicKey);
  const sep    = "─".repeat(64);
  console.log(sep);
  console.log("  FORTRESS PROTOCOL — MAINNET INIT");
  console.log(sep);
  console.log(`  Program : ${PROGRAM_ID}`);
  console.log(`  Admin   : ${walletKeypair.publicKey}`);
  console.log(`  Balance : ${(preBal / LAMPORTS_PER_SOL).toFixed(6)} SOL`);
  console.log(sep);

  const pda = (seeds: (Buffer | Uint8Array)[]) =>
    PublicKey.findProgramAddressSync(seeds, PROGRAM_ID)[0];

  const registryPDA = pda([Buffer.from("global_registry")]);
  const treasuryPDA = pda([Buffer.from("treasury")]);
  const solVaultPDA = pda([Buffer.from("sol_vault")]);

  async function safe(label: string, fn: () => Promise<string>) {
    try {
      const tx = await fn();
      console.log(`  OK  ${label}`);
      console.log(`      tx: ${tx}`);
      await new Promise(r => setTimeout(r, 500));
    } catch (e: any) {
      const msg: string = e?.message ?? String(e);
      if (msg.includes("already in use") || msg.includes("custom program error: 0x0")) {
        console.log(`  --  ${label}  (already initialized)`);
      } else {
        console.error(`  !! ${label}  FAILED: ${msg.slice(0, 120)}`);
        throw e;
      }
    }
  }

  // 1. GlobalRegistry
  console.log(`\n[1/4] GlobalRegistry  ->  ${registryPDA}`);
  try {
    await (program.account as any).globalRegistry.fetch(registryPDA);
    console.log("  --  Already initialized");
  } catch {
    await safe("initializeGlobalRegistry", () =>
      program.methods.initializeGlobalRegistry().rpc()
    );
  }

  // 2. Treasury
  console.log(`\n[2/4] Treasury  ->  ${treasuryPDA}`);
  try {
    await (program.account as any).treasury.fetch(treasuryPDA);
    console.log("  --  Already initialized");
  } catch {
    await safe("initializeTreasury", () =>
      program.methods.initializeTreasury().rpc()
    );
  }

  // 3. sol_vault top-up
  console.log(`\n[3/4] sol_vault  ->  ${solVaultPDA}`);
  const vaultBal = await connection.getBalance(solVaultPDA);
  if (vaultBal >= SOL_VAULT_TOP_UP) {
    console.log(`  --  Already funded  (${(vaultBal / LAMPORTS_PER_SOL).toFixed(6)} SOL)`);
  } else {
    await safe(`topUpTreasuryVault  ${SOL_VAULT_TOP_UP / LAMPORTS_PER_SOL} SOL`, () =>
      (program.methods as any).topUpTreasuryVault(new anchor.BN(SOL_VAULT_TOP_UP)).rpc()
    );
  }

  // 4. 16 LotteryVaults + WinnerHistory
  console.log("\n[4/4] LotteryVaults + WinnerHistory (16 pairs)");
  const lotteries = [
    { name: "LPM", id: 0, prefix: "vault_lpm", tiers: [5, 10, 20, 50] },
    { name: "DPL", id: 1, prefix: "vault_dpl", tiers: [5, 10, 15, 20] },
    { name: "WPL", id: 2, prefix: "vault_wpl", tiers: [5, 10, 15, 20] },
    { name: "MPL", id: 3, prefix: "vault_mpl", tiers: [5, 10, 15, 20] },
  ];

  let done = 0, skipped = 0, failed = 0;
  for (const lt of lotteries) {
    for (const tier of lt.tiers) {
      const vaultPDA = pda([Buffer.from(lt.prefix), Buffer.from([tier])]);
      const histPDA  = pda([Buffer.from("winner_history"), Buffer.from([lt.id]), Buffer.from([tier])]);
      const label    = `${lt.name} tier-${tier}`;
      try {
        await (program.account as any).lotteryVault.fetch(vaultPDA);
        console.log(`  --  ${label}  (already initialized)`);
        skipped++;
      } catch {
        try {
          await safe(`initializeVault  ${label}  ->  ${vaultPDA}`, () =>
            (program.methods as any)
              .initializeVault(lt.id, tier)
              .accounts({ lotteryVault: vaultPDA, winnerHistory: histPDA })
              .rpc()
          );
          done++;
        } catch { failed++; }
      }
    }
  }

  const postBal = await connection.getBalance(walletKeypair.publicKey);
  const spent   = (preBal - postBal) / LAMPORTS_PER_SOL;
  console.log(`\n${sep}`);
  console.log("  SUMMARY");
  console.log(sep);
  console.log(`  Vaults initialized : ${done}`);
  console.log(`  Vaults skipped     : ${skipped}`);
  console.log(`  Vaults failed      : ${failed}`);
  console.log(`  Total SOL spent    : ${spent.toFixed(6)} SOL`);
  console.log(`  Remaining balance  : ${(postBal / LAMPORTS_PER_SOL).toFixed(6)} SOL`);
  console.log(sep);

  if (failed > 0) { console.error("\n  Some vaults failed — re-run to retry."); process.exit(1); }
  console.log("\n  All accounts live on mainnet. Ready for tickets.\n");
}

main()
  .then(() => process.exit(0))
  .catch((err) => { console.error("Fatal:", err); process.exit(1); });
