/**
 * ═══════════════════════════════════════════════════════════════════════════
 *                       DRAW LPM WINNER SCRIPT
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Triggers draw_lpm_winner for a specific LPM tier (requires 100 participants).
 * Anyone can call — the on-chain program pays the $2 FPT caller reward from
 * the treasury, so the caller incurs no extra SOL cost.
 *
 * Usage: npx ts-node scripts/draw-lpm-winner.ts [tier]
 * Example: npx ts-node scripts/draw-lpm-winner.ts 5
 */

import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { FortressProtocol } from "../target/types/fortress_protocol";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

const FPT_MINT = new PublicKey("3YTnzmFTECtyKDxaghWPQcjzX7g1Cj3NxMq41JdWk2rj");
const LOTTERY_TYPE_LPM = 0;

// ═══════════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════════

async function main() {
  const tier = parseInt(process.argv[2]) || 5;
  
  console.log("═".repeat(75));
  console.log(" DRAW LPM WINNER");
  console.log("═".repeat(75));
  console.log(`  Tier: $${tier}`);

  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.FortressProtocol as Program<FortressProtocol>;
  const authority = provider.wallet as anchor.Wallet;

  // Derive PDAs
  const [vault] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault_lpm"), Buffer.from([tier])],
    program.programId
  );

  const [globalRegistry] = PublicKey.findProgramAddressSync(
    [Buffer.from("global_registry")],
    program.programId
  );

  const [participantPage0] = PublicKey.findProgramAddressSync(
    [
      Buffer.from("page"),
      Buffer.from([LOTTERY_TYPE_LPM, 0, 0, 0]),
      Buffer.from([tier, 0, 0, 0]),
      Buffer.from([0, 0, 0, 0]), // page 0
    ],
    program.programId
  );

  console.log(`\n  Vault: ${vault.toString()}`);
  console.log(`  Global Registry: ${globalRegistry.toString()}`);
  console.log(`  Page 0: ${participantPage0.toString()}`);

  // Fetch vault state
  try {
    const vaultAccount = await program.account.lotteryVault.fetch(vault);
    console.log(`\n  Current Vault State:`);
    console.log(`    Participant Count: ${vaultAccount.participantCount}`);
    console.log(`    Balance: ${vaultAccount.balance.toNumber() / 1_000_000} FPT`);
    console.log(`    Is Drawn (ready): ${vaultAccount.isDrawn}`);
    console.log(`    Round: ${vaultAccount.roundNumber}`);

    if (vaultAccount.participantCount !== 100) {
      console.log(`\n  ❌ Vault does not have 100 participants. Cannot draw.`);
      return;
    }

    // Note: Updated program allows draw when participant_count == 100 (regardless of is_drawn)
    console.log(`\n  ✅ Vault has 100 participants - ready for draw!`);

    // Get winner from page 0 (first participant as hint for ATA derivation)
    // The program uses Pyth entropy to pick the actual random winner
    console.log(`  Fetching participant page: ${participantPage0.toString()}`);
    let page0Data: any;
    try {
      page0Data = await Promise.race([
        program.account.participantPage.fetch(participantPage0),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Fetch timeout')), 10000))
      ]) as any;
    } catch (error) {
      console.error(`  ❌ Failed to fetch participant page: ${error}`);
      throw error;
    }

    if (!page0Data.participants || page0Data.participants.length === 0) {
      console.error(`  ❌ Participant page is empty — cannot draw winner.`);
      return;
    }

    const winner = page0Data.participants[0];
    console.log(`\n  Winner hint (page 0, slot 0): ${winner.toString()}`);

    // Derive ATAs
    const vaultAta = getAssociatedTokenAddressSync(
      FPT_MINT,
      vault,
      true,
      TOKEN_2022_PROGRAM_ID
    );

    const winnerAta = getAssociatedTokenAddressSync(
      FPT_MINT,
      winner,
      false,
      TOKEN_2022_PROGRAM_ID
    );

    // Caller's ATA — receives the $2 FPT incentive from the treasury
    const authorityAta = getAssociatedTokenAddressSync(
      FPT_MINT,
      authority.publicKey,
      false,
      TOKEN_2022_PROGRAM_ID
    );

    // Treasury PDAs
    const [treasuryVault] = PublicKey.findProgramAddressSync(
      [Buffer.from("sol_vault")],
      program.programId
    );
    const [treasury] = PublicKey.findProgramAddressSync(
      [Buffer.from("treasury")],
      program.programId
    );
    const treasuryFptAta = getAssociatedTokenAddressSync(
      FPT_MINT,
      treasuryVault,
      true,
      TOKEN_2022_PROGRAM_ID
    );
    const [pricingConfig] = PublicKey.findProgramAddressSync(
      [Buffer.from("pricing_config")],
      program.programId
    );

    console.log(`\n  Executing draw_lpm_winner...`);

    // Pyth USD oracle — provides entropy for fair winner selection
    const PYTH_USD_ORACLE = new PublicKey("5SSkXsEKQepHHA9RqcEkS6fHLHdfvX97E9f2H97yQYpX");

    // Try each page as the winning page (program verifies which page contains the VRF winner)
    for (let pageIdx = 0; pageIdx < 2; pageIdx++) {
      const [winningParticipantPage] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("page"),
          Buffer.from([LOTTERY_TYPE_LPM, 0, 0, 0]),
          Buffer.from([tier, 0, 0, 0]),
          Buffer.from(new Uint32Array([pageIdx]).buffer),
        ],
        program.programId
      );

      try {
        console.log(`  📤 Attempt ${pageIdx + 1}: trying page ${pageIdx} as winning page...`);
        const tx = await program.methods
          .drawLpmWinner(tier)
          .accountsStrict({
            authority: authority.publicKey,
            fptMint: FPT_MINT,
            lotteryState: vault,
            vaultTokenAccount: vaultAta,
            winner: winner,
            winnerAta: winnerAta,
            treasuryVault: treasuryVault,
            treasury: treasury,
            treasuryFptAta: treasuryFptAta,
            authorityAta: authorityAta,
            pricingConfig: pricingConfig,
            participantPage0: participantPage0,
            winningParticipantPage: winningParticipantPage,
            config: globalRegistry,
            pythEntropyAccount: PYTH_USD_ORACLE,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
          })
          .rpc();

        console.log(`\n  ✅ Draw successful! Winner on page ${pageIdx}. TX: ${tx}`);

        // Fetch updated vault state
        const vaultAfter = await program.account.lotteryVault.fetch(vault);
        console.log(`\n  Updated Vault State:`);
        console.log(`    Participant Count: ${vaultAfter.participantCount}`);
        console.log(`    Balance: ${vaultAfter.balance.toNumber() / 1_000_000} FPT`);
        console.log(`    Round: ${vaultAfter.roundNumber}`);
        console.log(`    Last Winner: ${vaultAfter.lastWinner?.toString()}`);
        console.log(`\n  ✅ LPM Tier ${tier} draw complete!`);
        return; // success

      } catch (error: any) {
        const msg = error.message || JSON.stringify(error);
        if (msg.includes("ParticipantNotFound") || msg.includes("6013")) {
          console.log(`     ⏩ Winner not on page ${pageIdx}, trying next...`);
          continue;
        }
        console.error(`\n  ❌ Draw failed on page ${pageIdx}: ${msg}`);
        if (error.logs) error.logs.forEach((l: string) => console.log(`    ${l}`));
        throw error;
      }
    }

    console.error(`  ❌ Could not identify winning participant page after trying all pages.`);

  } catch (error: any) {
    console.error(`\n  ❌ Error: ${error.message}`);
    if (error.logs) {
      console.log(`\n  Program Logs:`);
      error.logs.forEach((log: string) => console.log(`    ${log}`));
    }
  }
}

main().catch(console.error);
