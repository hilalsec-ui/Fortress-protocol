/**
 * ═══════════════════════════════════════════════════════════════════════════
 *                       CHECK LPM VAULT STATE
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * This script checks the current state of LPM vaults.
 * 
 * Usage: npx ts-node scripts/check-lpm-state.ts [tier]
 * Example: npx ts-node scripts/check-lpm-state.ts 5
 */

import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { FortressProtocol } from "../target/types/fortress_protocol";
import { PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";

const LPM_TIERS = [5, 10, 20, 50];
const LOTTERY_TYPE_LPM = 0;

async function main() {
  const specificTier = parseInt(process.argv[2]);
  const tiers = specificTier ? [specificTier] : LPM_TIERS;
  
  console.log("═".repeat(75));
  console.log(" LPM VAULT STATE CHECK");
  console.log("═".repeat(75));

  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.FortressProtocol as Program<FortressProtocol>;
  const connection = provider.connection;

  for (const tier of tiers) {
    console.log(`\n─── TIER ${tier} ($${tier} USD) ───`);

    const [vault] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault_lpm"), Buffer.from([tier])],
      program.programId
    );

    const [page0] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("page"),
        Buffer.from([LOTTERY_TYPE_LPM, 0, 0, 0]),
        Buffer.from([tier, 0, 0, 0]),
        Buffer.from([0, 0, 0, 0]),
      ],
      program.programId
    );

    const [page1] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("page"),
        Buffer.from([LOTTERY_TYPE_LPM, 0, 0, 0]),
        Buffer.from([tier, 0, 0, 0]),
        Buffer.from([1, 0, 0, 0]),
      ],
      program.programId
    );

    try {
      const vaultAccount = await program.account.lotteryVault.fetch(vault);
      const vaultSol = await connection.getBalance(vault);

      console.log(`  Vault PDA: ${vault.toString()}`);
      console.log(`  Participant Count: ${vaultAccount.participantCount}`);
      console.log(`  Balance: ${vaultAccount.balance.toNumber() / 1_000_000} FPT`);
      console.log(`  Is Drawn (ready for draw): ${vaultAccount.isDrawn}`);
      console.log(`  Current Page: ${vaultAccount.currentPage}`);
      console.log(`  Round Number: ${vaultAccount.roundNumber}`);
      console.log(`  Vault SOL: ${vaultSol / LAMPORTS_PER_SOL} SOL`);
      
      if (vaultAccount.lastWinner) {
        console.log(`  Last Winner: ${vaultAccount.lastWinner.toString()}`);
      }

      // Check if ready for draw
      if (vaultAccount.participantCount === 100 && vaultAccount.isDrawn) {
        console.log(`\n  🔔 READY FOR DRAW! Run: npx ts-node scripts/draw-lpm-winner.ts ${tier}`);
      } else if (vaultAccount.participantCount === 100 && !vaultAccount.isDrawn) {
        console.log(`\n  ⚠️ STUCK STATE: 100 participants but is_drawn=false`);
        console.log(`     This is a legacy state. Needs manual fix.`);
      }

      // Check page 0
      try {
        const page0Data = await program.account.participantPage.fetch(page0);
        console.log(`\n  Page 0 Participants: ${page0Data.participants.length}`);
      } catch (e) {
        console.log(`  Page 0: Not initialized`);
      }

      // Check page 1
      try {
        const page1Data = await program.account.participantPage.fetch(page1);
        console.log(`  Page 1 Participants: ${page1Data.participants.length}`);
      } catch (e) {
        console.log(`  Page 1: Not initialized`);
      }

    } catch (e: any) {
      console.log(`  Vault not initialized or error: ${e.message?.substring(0, 50)}`);
    }
  }

  console.log("\n" + "═".repeat(75));
}

main().catch(console.error);
