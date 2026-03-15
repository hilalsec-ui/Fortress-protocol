/**
 * fund-crank-wallet.ts
 *
 * Transfers SOL from the admin wallet to the crank wallet
 * (BzsGQccSzoWPiRSKoTNpf7iKxqJRq3CwvSygmzvwMei5).
 * The admin wallet must have sufficient SOL.
 *
 * Usage:
 *   ANCHOR_WALLET=~/.config/solana/id.json \
 *   ANCHOR_PROVIDER_URL=https://api.mainnet-beta.solana.com \
 *   npx ts-node scripts/fund-crank-wallet.ts [amount_sol]
 *
 * Defaults to 0.1 SOL if no amount is given.
 */

import * as anchor from "@coral-xyz/anchor";
import { PublicKey, SystemProgram, LAMPORTS_PER_SOL, Transaction } from "@solana/web3.js";
import * as fs from "fs";

const PROGRAM_ID = new PublicKey("EB6kkg2sW5rnukjRH7Ljhz78gbfc36XZAuiFn5jdefF3");
const CRANK_AUTHORITY = new PublicKey("BzsGQccSzoWPiRSKoTNpf7iKxqJRq3CwvSygmzvwMei5");

async function main() {
  const amountSol = parseFloat(process.argv[2] ?? "0.1");
  if (isNaN(amountSol) || amountSol <= 0) {
    console.error("Usage: npx ts-node scripts/fund-crank-wallet.ts [amount_sol]");
    process.exit(1);
  }
  const lamports = Math.floor(amountSol * LAMPORTS_PER_SOL);

  console.log("═".repeat(72));
  console.log(" FUND CRANK WALLET");
  console.log("═".repeat(72));

  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const connection = provider.connection;

  // Derive sol_vault PDA
  const [solVaultPDA, solVaultBump] = PublicKey.findProgramAddressSync(
    [Buffer.from("sol_vault")],
    PROGRAM_ID
  );

  const vaultBalance = await connection.getBalance(solVaultPDA);
  const crankBalance = await connection.getBalance(CRANK_AUTHORITY);

  console.log(`\nSol Vault PDA : ${solVaultPDA.toBase58()}`);
  console.log(`  Balance     : ${(vaultBalance / LAMPORTS_PER_SOL).toFixed(4)} SOL`);
  console.log(`\nCrank Wallet  : ${CRANK_AUTHORITY.toBase58()}`);
  console.log(`  Balance     : ${(crankBalance / LAMPORTS_PER_SOL).toFixed(4)} SOL`);
  console.log(`\nTransfer      : ${amountSol} SOL (${lamports} lamports)`);

  if (vaultBalance < lamports + 1_000_000) {
    console.error(`\n❌ sol_vault has insufficient balance (need ${amountSol} SOL + rent)`);
    process.exit(1);
  }

  // The sol_vault is a PDA owned by the program — only the program can CPI-transfer
  // from it. For manual top-ups we use the admin wallet's own SOL via a regular
  // SystemProgram transfer, then optionally replenish the vault separately.
  //
  // If you want to drain from the PDA directly, use the admin_withdraw_sol
  // instruction (if present) or send SOL from your admin wallet manually.
  console.log("\n⚠️  Note: sol_vault is program-owned; this script transfers");
  console.log("   from your ADMIN WALLET (ANCHOR_WALLET) to the crank wallet.");
  console.log("   To replenish the sol_vault itself, deposit SOL into it directly.\n");

  const adminWallet = provider.wallet;
  const adminBalance = await connection.getBalance(adminWallet.publicKey);
  console.log(`Admin wallet  : ${adminWallet.publicKey.toBase58()}`);
  console.log(`  Balance     : ${(adminBalance / LAMPORTS_PER_SOL).toFixed(4)} SOL`);

  if (adminBalance < lamports + 5_000_000) {
    console.error(`\n❌ Admin wallet has insufficient balance`);
    process.exit(1);
  }

  const tx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: adminWallet.publicKey,
      toPubkey: CRANK_AUTHORITY,
      lamports,
    })
  );

  const sig = await provider.sendAndConfirm(tx);
  const newCrankBalance = await connection.getBalance(CRANK_AUTHORITY);

  console.log(`\n✅ Transfer confirmed!`);
  console.log(`   Signature     : ${sig}`);
  console.log(`   Crank balance : ${(newCrankBalance / LAMPORTS_PER_SOL).toFixed(4)} SOL`);
  console.log("═".repeat(72));
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
