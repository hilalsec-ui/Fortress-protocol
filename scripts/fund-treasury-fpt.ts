/**
 * fund-treasury-fpt.ts
 *
 * Mints FPT tokens directly into the Treasury FPT ATA so the $1 draw-caller
 * reward can be paid immediately, before the treasury has accumulated enough
 * 5% admin fees.
 *
 * Usage:
 *   npx ts-node scripts/fund-treasury-fpt.ts [amount_fpt]
 *   default amount: 1000 FPT  (= 1_000_000_000 base units, 6 decimals)
 */

import * as anchor from "@coral-xyz/anchor";
import {
  PublicKey,
  Connection,
  Keypair,
} from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID,
  mintTo,
  getAssociatedTokenAddressSync,
  getAccount,
} from "@solana/spl-token";
import * as fs from "fs";

const PROGRAM_ID  = new PublicKey("EB6kkg2sW5rnukjRH7Ljhz78gbfc36XZAuiFn5jdefF3");
const FPT_MINT    = new PublicKey("3YTnzmFTECtyKDxaghWPQcjzX7g1Cj3NxMq41JdWk2rj");
const RPC_URL     = "https://api.mainnet-beta.solana.com";

async function main() {
  // --- wallet ---------------------------------------------------------------
  const walletPath = "/home/dev/my-wallet.json";
  const authority  = Keypair.fromSecretKey(
    new Uint8Array(JSON.parse(fs.readFileSync(walletPath, "utf-8")))
  );
  const connection = new Connection(RPC_URL, "confirmed");

  // --- PDAs ----------------------------------------------------------------
  const [treasuryVaultPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("sol_vault")],
    PROGRAM_ID
  );
  const treasuryFptAta = getAssociatedTokenAddressSync(
    FPT_MINT,
    treasuryVaultPDA,
    true, // allowOwnerOffCurve
    TOKEN_2022_PROGRAM_ID
  );

  console.log("=== Fund Treasury FPT ATA ===");
  console.log("Treasury Vault PDA :", treasuryVaultPDA.toString());
  console.log("Treasury FPT ATA   :", treasuryFptAta.toString());
  console.log("Mint authority     :", authority.publicKey.toString());

  // --- current balance ------------------------------------------------------
  try {
    const before = await getAccount(connection, treasuryFptAta, "confirmed", TOKEN_2022_PROGRAM_ID);
    console.log("\nBefore balance:", Number(before.amount) / 1e6, "FPT");
  } catch {
    console.log("Treasury FPT ATA not initialised — run initTreasuryFptAta first");
    process.exit(1);
  }

  // --- amount to mint -------------------------------------------------------
  const amountFpt = parseFloat(process.argv[2] ?? "1000");
  const amountRaw = BigInt(Math.round(amountFpt * 1_000_000)); // 6 decimals
  console.log(`\nMinting ${amountFpt} FPT (${amountRaw} base units) to treasury...`);

  // --- mint -----------------------------------------------------------------
  const sig = await mintTo(
    connection,
    authority,          // payer
    FPT_MINT,
    treasuryFptAta,
    authority,          // mint authority
    amountRaw,
    [],                 // multiSigners
    { commitment: "confirmed" },
    TOKEN_2022_PROGRAM_ID
  );

  console.log("✅ Mint TX:", sig);

  // --- verify ---------------------------------------------------------------
  const after = await getAccount(connection, treasuryFptAta, "confirmed", TOKEN_2022_PROGRAM_ID);
  console.log("After balance :", Number(after.amount) / 1e6, "FPT");
  console.log("\nTreasury is now funded. Draw rewards will be paid on the next draw.");
}

main().catch(err => {
  console.error("❌", err);
  process.exit(1);
});
