#!/usr/bin/env npx ts-node
/**
 * ═══════════════════════════════════════════════════════════════════════════
 *                       DRAW WPL WINNER SCRIPT
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Triggers draw_wpl_winner for a specific WPL tier (requires time expiry).
 * Anyone can call — no admin wallet required. Treasury pays all draw costs.
 *
 * Usage: ANCHOR_WALLET=/path/to/wallet.json npx ts-node scripts/draw-wpl-winner.ts [tier]
 * Example: ANCHOR_WALLET=/home/dev/my-wallet.json npx ts-node scripts/draw-wpl-winner.ts 5
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

const FPT_MINT = new PublicKey("7vZbJ3WN4eGF6rGikB4MBLs4kiJwaRzNSX3smQRJJNw2");
const LOTTERY_TYPE_WPL = 2;

async function main() {
  const tier = parseInt(process.argv[2]) || 5;

  if (![5, 10, 15, 20].includes(tier)) {
    console.error(`❌ Invalid tier: ${tier}. Valid tiers: 5, 10, 15, 20`);
    process.exit(1);
  }

  console.log("\n═══════════════════════════════════════════════════════════");
  console.log("  DRAW WPL WINNER");
  console.log("═══════════════════════════════════════════════════════════");
  console.log(`  Tier: $${tier}\n`);

  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.FortressProtocol as Program<FortressProtocol>;
  const authority = provider.wallet as anchor.Wallet;

  // Derive vault PDA
  const [vault] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault_wpl"), Buffer.from([tier])],
    program.programId
  );

  // Derive global PDAs
  const [globalRegistry] = PublicKey.findProgramAddressSync(
    [Buffer.from("global_registry")],
    program.programId
  );
  const [treasuryVault] = PublicKey.findProgramAddressSync(
    [Buffer.from("sol_vault")],
    program.programId
  );
  const [treasury] = PublicKey.findProgramAddressSync(
    [Buffer.from("treasury")],
    program.programId
  );

  const vaultAta = getAssociatedTokenAddressSync(FPT_MINT, vault, true, TOKEN_2022_PROGRAM_ID);
  const treasuryFptAta = getAssociatedTokenAddressSync(FPT_MINT, treasuryVault, true, TOKEN_2022_PROGRAM_ID);

  console.log(`  Vault: ${vault.toString()}`);

  // Fetch vault state
  const vaultData = await program.account.lotteryVault.fetch(vault);
  console.log(`\n  Current Vault State:`);
  console.log(`    Participant Count: ${vaultData.participantCount}`);
  console.log(`    Balance: ${vaultData.balance.toString()} FPT`);
  console.log(`    Round: ${vaultData.roundNumber}`);
  console.log(`    End Time: ${vaultData.endTime.toString()}`);

  const currentTime = Math.floor(Date.now() / 1000);
  const timeRemaining = vaultData.endTime.toNumber() - currentTime;
  console.log(`    Time Status: ${timeRemaining <= 0 ? "⏰ EXPIRED" : `✅ ${timeRemaining}s remaining`}\n`);

  if (timeRemaining > 0) {
    console.log(`  ❌ Lottery has not expired yet. Cannot draw.`);
    console.log(`     Wait ${timeRemaining}s (${(timeRemaining / 3600).toFixed(2)}h)\n`);
    process.exit(0);
  }

  if (vaultData.participantCount === 0) {
    console.log(`  ⚠️  No participants — program will auto-extend the period.\n`);
    process.exit(0);
  }

  console.log(`  ✅ Lottery expired with ${vaultData.participantCount} participants — triggering draw...`);

  // Derive page 0 (always required as participant_page_0)
  const [participantPage0] = PublicKey.findProgramAddressSync(
    [
      Buffer.from("page"),
      Buffer.from([LOTTERY_TYPE_WPL, 0, 0, 0]),
      Buffer.from([tier, 0, 0, 0]),
      Buffer.from([0, 0, 0, 0]),
    ],
    program.programId
  );

  // Read page 0 to get a real participant as winner hint for ATA derivation
  let winnerHint: PublicKey;
  try {
    const page0Data: any = await program.account.participantPage.fetch(participantPage0);
    if (!page0Data.participants || page0Data.participants.length === 0) {
      console.error(`  ❌ Participant page 0 is empty — cannot draw.`);
      process.exit(1);
    }
    winnerHint = page0Data.participants[0];
  } catch (e) {
    console.error(`  ❌ Could not fetch participant page 0: ${e}`);
    process.exit(1);
  }

  console.log(`  Winner hint (page 0, slot 0): ${winnerHint!.toString()}`);
  const winnerAta = getAssociatedTokenAddressSync(FPT_MINT, winnerHint!, false, TOKEN_2022_PROGRAM_ID);

  // Pyth USD oracle — provides randomness for fair winner selection
  const PYTH_USD_ORACLE = new PublicKey("5SSkXsEKQepHHA9RqcEkS6fHLHdfvX97E9f2H97yQYpX");

  // Try each page as the winning page — the program verifies which page holds the VRF winner
  const maxPages = Math.max(2, Math.ceil(vaultData.participantCount / 50) + 1);
  for (let pageIdx = 0; pageIdx < maxPages; pageIdx++) {
    const [winningParticipantPage] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("page"),
        Buffer.from([LOTTERY_TYPE_WPL, 0, 0, 0]),
        Buffer.from([tier, 0, 0, 0]),
        Buffer.from(new Uint32Array([pageIdx]).buffer),
      ],
      program.programId
    );

    try {
      console.log(`  📤 Attempt ${pageIdx + 1}: trying page ${pageIdx} as winning page...`);

      const tx = await program.methods
        .drawWplWinner(tier)
        .accountsStrict({
          authority: authority.publicKey,
          fptMint: FPT_MINT,
          lotteryState: vault,
          vaultTokenAccount: vaultAta,
          winner: winnerHint!,
          winnerAta: winnerAta,
          treasuryFptAta: treasuryFptAta,
          participantPage0: participantPage0,
          winningParticipantPage: winningParticipantPage,
          config: globalRegistry,
          treasuryVault: treasuryVault,
          treasury: treasury,
          pythEntropyAccount: PYTH_USD_ORACLE,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .rpc({ commitment: "confirmed" });

      console.log(`\n  ✅ Draw successful! Winner on page ${pageIdx}. TX: ${tx}`);

      await new Promise(resolve => setTimeout(resolve, 2000));
      const updatedVault = await program.account.lotteryVault.fetch(vault);
      console.log(`\n  📊 Updated Vault State:`);
      console.log(`    Participant Count: ${updatedVault.participantCount}`);
      console.log(`    Round: ${updatedVault.roundNumber}`);
      const nextEnd = updatedVault.endTime.toNumber();
      const nextIn = nextEnd - Math.floor(Date.now() / 1000);
      console.log(`    Next draw in: ${nextIn}s (${(nextIn / 3600).toFixed(2)}h)\n`);
      console.log(`  🎉 WPL draw complete!\n`);
      return;

    } catch (error: any) {
      const msg = error.message || JSON.stringify(error);
      if (msg.includes("ParticipantNotFound") || msg.includes("6013")) {
        console.log(`     ⏩ Winner not on page ${pageIdx}, trying next...`);
        continue;
      }
      console.error(`\n  ❌ Draw failed on page ${pageIdx}: ${msg}`);
      if (error.logs) error.logs.forEach((l: string) => console.error(`     ${l}`));
      throw error;
    }
  }

  console.error(`\n  ❌ Could not identify winning participant page after trying all pages.`);
  process.exit(1);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
